const details = () => ({
    id: 'Tdarr_Plugin_awk_sub_worker',
    Stage: 'Pre-processing',
    Name: 'Subtitle sidecar worker - extract embedded text subs to sidecars and reimport them',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Round-trips text subtitles between the container and Plex-style sidecar files so they can be reviewed/edited on disk.

                \\nmode=extract writes each embedded TEXT subtitle to a sidecar next to the video (native format: srt/ass/vtt) and, by default, removes those tracks from the file.
                \\nmode=import muxes matching sidecars back into the file (restoring language, title, and disposition) and, by default, deletes the sidecar once it is safely embedded.
                \\nAn SRT carries no title/language/disposition, so all of that is encoded in the filename: <video>.s<streamIndex>[.<title>].<lang>[.<forced|sdh|cc|commentary|descriptive>].<ext> - the stream index keeps names unique, the title is reversibly encoded, and language+flags sit last so Plex auto-detects them.
                \\nBitmap subtitles (PGS/VobSub/DVB) can't become text and are always left embedded and untouched.
                \\nRuns standalone, or in the awk stack after clean_and_remux (first) / audio_clean and before stream_ordering (last).`,
    Version: '1.5.0',
    Tags: 'pre-processing,ffmpeg,subtitle only,configurable',
    Inputs: [
        {
            name: 'mode',
            type: 'string',
            defaultValue: 'extract',
            inputUI: { type: 'dropdown', options: ['extract', 'import'] },
            tooltip: `Which direction to run.
                \\nextract: pull embedded text subtitles out to sidecar files (and remove them from the video unless remove_after_extract is off).
                \\nimport: mux sidecar files back into the video (and delete the sidecar once embedded unless remove_sidecar_after_import is off).`,
        },
        {
            name: 'only_languages',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Optional comma-separated languages to act on (e.g. eng,jpn). Blank = all languages. One form is enough - en, eng, or English all match the same language (including region variants like en-US), so you don't need to list every variant.
                \\nExample:\\neng,fra`,
        },
        {
            name: 'skip_commentary',
            type: 'boolean',
            defaultValue: false,
            inputUI: { type: 'dropdown', options: ['false', 'true'] },
            tooltip: `Should commentary subtitle tracks be skipped? Applies to both modes (extract won't write them, import won't mux them).
                \\nDefault false so "extract everything, review, reimport everything" round-trips completely.`,
        },
        {
            name: 'remove_after_extract',
            type: 'boolean',
            defaultValue: true,
            inputUI: { type: 'dropdown', options: ['true', 'false'] },
            tooltip: `On extract, remove each text subtitle from the video after it is written to a sidecar. Off = write sidecars but keep the embedded tracks.
                \\nNote: styled ASS/SSA rely on embedded fonts - if clean_and_remux runs between this extract and the reimport it removes those now-orphaned fonts, so reimport before an intervening clean_and_remux pass (or keep the styled track embedded).`,
        },
        {
            name: 'remove_sidecar_after_import',
            type: 'boolean',
            defaultValue: true,
            inputUI: { type: 'dropdown', options: ['true', 'false'] },
            tooltip: `On import, delete each sidecar whose basename is listed in the file's global awk_sub_worker marker (stamped by the prior mux pass). Tdarr only re-runs after a successful mux, so a listed sidecar is confirmed embedded. Off = leave the sidecars in place.`,
        },
    ],
});

// eslint-disable-next-line no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')(); const fs = require('fs'); const path = require('path');
    // eslint-disable-next-line no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        container: `.${file.container}`,
        FFmpegMode: true,
        reQueueAfter: false,
        infoLog: '',
    };

    // =====================================================================
    // SHARED CODE - duplicated verbatim because Tdarr loads each plugin as one self-contained file.
    // Split into labeled sections; each is byte-identical across the plugins named in its header, and a
    // plugin carries only the sections it uses. The section LABEL is the anchor (order is free). Verify any
    // edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: file-failure helpers =====
    // -=-=-= AwkFailFile / failFile / failUnexpected  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Fail the whole file (send it to Tdarr's error queue) carrying the full infoLog as context. A returned processFile:false is Tdarr's "no work needed /
    // skip" signal, NOT a failure — the flow's runClassicTranscodePlugin checks `if (result.error) throw` before `if (result.processFile !== true) continue`,
    // so a skip return quietly moves on. To actually error the file a classic plugin must throw (works in classic AND flow mode). A raw throw discards the
    // returned response, so failFile rides the accumulated infoLog (input summary + the ☒ reason) along as the Error message, thrown with a leading \n so the
    // log starts on its own line instead of glued onto Tdarr's "...Plugin error! Error:" wrapper. The dedicated AwkFailFile type lets the body's outer catch
    // (failUnexpected) tell a DELIBERATE failure (rethrow unchanged) from an unexpected bug (annotate + wrap, still fail w/ log).
    class AwkFailFile extends Error {}
    const failFile = (msg) => {
        response.infoLog += `☒${msg}\n`;
        throw new AwkFailFile(`\n${response.infoLog}`);
    };
    const failUnexpected = (err) => {
        if (err instanceof AwkFailFile) throw err;
        response.infoLog += `☒Unexpected error: ${err && err.message ? err.message : err}\n`;
        throw new AwkFailFile(`\n${response.infoLog}`);
    };
    // ===== END SHARED: file-failure helpers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all five awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description'], tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','deaf'],         tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced'],                                tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                              tag: 'Original'    },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                        tag: null          },
    };
    // -=-=-= roleTextLower  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // roleTextLower scrapes role-signal text from BOTH probes: dispositions are often incomplete and a title/description/handler can live in ffprobe OR
    // mediaInfo but not both, so we union every text field before classifying. mediaInfo is matched by StreamOrder (like resolveStreamBitrate); whole-token
    // matchesKeyword keeps generic values like "SoundHandler" inert. hasDisposition calls it repeatedly per stream, so memoize by stream object (WeakMap,
    // per-run closure - GC'd with the file, never shared across runs).
    const roleTextCache = new WeakMap();
    const roleTextLower = (s) => {
        if (roleTextCache.has(s)) return roleTextCache.get(s);
        const mi = mediaInfoFor(s);
        const text = [s.tags?.title, s.tags?.description, s.tags?.handler_name, mi?.Title, mi?.Description].filter(Boolean).join(' ').trim().toLowerCase();
        roleTextCache.set(s, text);
        return text;
    };
    // -=-=-= matchesKeyword  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Whole-token keyword matcher: a keyword matches only when not flanked by a letter/digit, so '[sdh]', 'eng-sdh', and 'sdh.' match while
    // 'deafening'/'aboriginal' do not. An internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). Keywords are
    // regex-escaped; the 'u' flag enables \p{L}/\p{N}. text must already be lowercased. The compiled regex is a pure function of the keyword list, so it is
    // memoized by keyword-array identity (WeakMap, per-run closure, GC'd with the run) instead of recompiled on every classifier call.
    const keywordRegexCache = new WeakMap();
    const matchesKeyword = (text, keywords) => {
        if (!keywords.length) return false;
        let re = keywordRegexCache.get(keywords);
        if (!re) {
            const pattern = keywords
                .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^\\p{L}\\p{N}]+'))
                .join('|');
            re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u');
            keywordRegexCache.set(keywords, re);
        }
        return re.test(text);
    };
    // -=-=-= hasDisposition  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes((s.codec_type || '').trim().toLowerCase())) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(roleTextLower(s), entry.keywords);
    };
    // -=-=-= role classifiers: isCommentary / isDescriptive / isSdh / isLyrics  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions');
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');
    // ===== END SHARED: role/disposition classifiers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last;
    // summariseStream flags them /cover.
    const IMAGE_CODECS = ['mjpeg', 'mjpegb', 'png', 'apng', 'gif', 'bmp', 'webp', 'tiff'];
    // A stream is cover art / a still image when its codec is an image codec OR it carries a cover-art disposition (attached_pic/still_image/timed_thumbnails).
    const isCoverArt = (s) => IMAGE_CODECS.includes((s.codec_name || '').trim().toLowerCase())
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: codec name resolution =====
    // -=-=-= codecAliases  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_',   'pcm'],
        ['adpcm',  'adpcm'],
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
    ];
    // -=-=-= resolveCodecName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the
    // _x variant when DTS:X is detected) and eac3 into eac3atmos. Used by audioQuality/losslessSource (audio_clean,
    // stream_ordering) for scoring, and by summariseStream (all five) purely for accurate display labeling - a plugin
    // that doesn't score audio still benefits from showing "eac3atmos"/"dtsx" instead of a bare "eac3"/"dts" in its logs.
    // codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" (no subtype keyword), so longName alone can't
    // tell the subtypes apart there; we also check the stream profile ("DTS-HD MA"/"HRA"/"Express") and fall back to
    // mediaInfo's Format_Commercial_IfAny ("DTS-HD Master Audio"), which decodes the substream header. Atmos comes from
    // longName or the commercial name only - an editable title tag does not imply a real Atmos substream.
    // DTS:X detection is best-effort: MediaInfo exposes it via Format_AdditionalFeatures containing "XLL X" (vs plain
    // "XLL" for MA without X), but MediaInfo's own maintainers note this is incomplete for an undocumented format -
    // expect a real DTS:X track to sometimes still classify as the plain (non-X) subtype, never the reverse (this only
    // fires on an actual reported value, never on absence of one, so it can't produce a false positive).
    const resolveCodecName = (stream) => {
        let codec = (stream?.codec_name || '').toLowerCase().trim();
        const longName = (stream.codec_long_name || '').toLowerCase().trim();

        for (const [prefix, replacement] of codecAliases) {
            if (codec.startsWith(prefix)) {
                codec = replacement;
                break;
            }
        }

        //Do this first as there's no harm checking for additional info in the longName
        if (codec === 'dca')
            codec = 'dts';

        const profile    = (stream.profile || '').toLowerCase().trim();
        const mi         = mediaInfoFor(stream);
        const commercial = (mi?.Format_Commercial_IfAny || '').toLowerCase();
        if (codec === 'dts') {
            if      (longName.includes('master')          || profile.includes('hd ma')  || commercial.includes('master'))
                codec = 'dtsma';
            else if (longName.includes('high resolution') || profile.includes('hra')    || commercial.includes('high resolution'))
                codec = 'dtshr';
            else if (longName.includes('express')         || profile.includes('express')|| commercial.includes('express'))
                codec = 'dtsexpress';

            const DTS_X_VARIANT = { dtsma: 'dtsmax', dtshr: 'dtshrx', dts: 'dtsx', dtsexpress: 'dtsexpressx' };
            if (DTS_X_VARIANT[codec]) {
                // MediaInfo marks DTS:X with the token "XLL X" in Format_AdditionalFeatures (plain DTS-HD is "XLL"). Match it as a
                // whole trailing token (\bxll x\b) NOT a raw substring, so a hypothetical "XLL X96"/"XLL XBR" can't false-positive
                // (those core-extension tokens attach to plain DTS core, which has no XLL, but the boundary check makes the guarantee literal).
                const additionalFeatures = (mi?.Format_AdditionalFeatures || '').toLowerCase();
                if (/\bxll x\b/.test(additionalFeatures))
                    codec = DTS_X_VARIANT[codec];
            }
        } else if (codec === 'eac3' && (longName.includes('atmos') || commercial.includes('atmos')))
            codec = 'eac3atmos';

        return codec;
    };
    // -=-=-= codecDisplayName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Friendly single-token display string for a summary line, used only for the codecs resolveCodecName REFINES beyond the
    // bare container codec_name - the DTS subtypes and object-audio layers a raw "dts"/"eac3" hides. Any other codec falls
    // back to its own raw codec_name unchanged (so pcm_s16le keeps its bit depth, wmav2 stays wmav2, etc. - this only ever
    // ADDS subtype detail, never collapses an already-informative name). Single hyphenated tokens keep the terse token style.
    const CODEC_DISPLAY = {
        dtsma:   'dts-hd-ma',   dtsmax:      'dts-hd-ma-x',
        dtshr:   'dts-hd-hr',   dtshrx:      'dts-hd-hr-x',
        dtsx:    'dts-x',       dtsexpress:  'dts-express',   dtsexpressx: 'dts-express-x',
        eac3atmos: 'eac3-atmos', mpegh3d: 'mpeg-h',
    };
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || (stream.codec_name || 'unknown').trim().toLowerCase();
    // ===== END SHARED: codec name resolution =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Find the mediaInfo track corresponding to an ffprobe stream (matched by StreamOrder === ffprobe index); undefined when absent. The single join point
    // between the two probes - resolveStreamBitrate/resolveChannels/resolveLang and the per-plugin language/loop sites all go through it.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === s.index);
    // -=-=-= resolveLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Resolve a stream's language: ffprobe tags.language, then mediaInfo Language (files often tag one probe but not the other), trimmed + lowercased. Empty
    // when neither reports it; callers wanting a placeholder use `resolveLang(s) || 'und'`.
    const resolveLang = (s) => { const t = (s.tags?.language || '').trim(); return (t || (mediaInfoFor(s)?.Language ?? '')).trim().toLowerCase(); };
    // -=-=-= resolveStreamBitrate  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // ffprobe first, then mediaInfo fallbacks: ffprobe can't read per-stream bitrates from the container atom for some formats (e.g. DTS-HD MA in MP4/M4V).
    // mediaInfo order: measured BitRate, declared BitRate_Nominal, then a bytes-based measurement (StreamSize bytes * 8 / Duration seconds) - the last is a
    // real measurement (MediaInfo usually derives BitRate from it, but some containers report size+duration without a bitrate field), far better than the
    // codec-target estimate audioQuality falls back to. Returns 0 only when truly unknown. Used to enrich streams before summariseStream/audioQuality.
    const resolveStreamBitrate = (ffstream) => {
        const ffBitrate = Number(ffstream.bit_rate || 0);
        if (ffBitrate > 0) return ffBitrate;
        const ffmedia = mediaInfoFor(ffstream);
        if (!ffmedia) return 0;
        const measured = Number(ffmedia.BitRate || 0) || Number(ffmedia.BitRate_Nominal || 0);
        if (measured > 0) return measured;
        const size = Number(ffmedia.StreamSize || 0);
        const dur = Number(ffmedia.Duration || 0);
        if (size > 0 && dur > 0) {
            const bps = Math.round((size * 8) / dur);
            if (bps > 1000 && bps < 100000000) return bps;   // clamp to a plausible audio range so a stray unit (ms Duration, etc.) or corrupt size can't inject garbage
        }
        return 0;
    };

    // -=-=-= resolveChannels (+ channelsFromLayout helper)  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Resolve an audio stream's channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string
    // from ffprobe channel_layout or mediaInfo ChannelLayout/ChannelPositions - "5.1(side)" -> 6, "stereo" -> 2, "FL+FR+LFE" -> 3. Returns 0 only when no
    // source reports it, so channel-dependent logic (scoring, dedup, downmix, labelling, codec forcing) stays correct for tracks whose ffprobe entry omits it.
    const channelsFromLayout = (layout) => {
        const s = String(layout || '').toLowerCase().trim();
        if (!s) return 0;
        if (s === 'mono') return 1;
        if (s === 'stereo' || s === 'downmix') return 2;
        if (s === 'quad') return 4;
        const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);              // "5.1"->6, "7.1(side)"->8, "7.1.4" Atmos -> 12 (front + LFE + height)
        if (m) return Number(m[1]) + Number(m[2]) + Number(m[3] || 0);
        const tokens = s.split(/[+\s,]+/).filter((t) => t && !t.endsWith(':'));   // "FL+FR+FC+LFE" -> 4; drop MediaInfo ChannelPositions labels ("Front:", "Side:")
        return tokens.length > 1 ? tokens.length : 0;
    };
    const resolveChannels = (ffstream) => {
        const ff = Number(ffstream.channels || 0);
        if (ff > 0) return ff;
        const ffmedia = mediaInfoFor(ffstream);
        const mi = Number(ffmedia?.Channels || 0);
        if (mi > 0) return mi;
        return channelsFromLayout(ffstream.channel_layout || ffmedia?.ChannelLayout || ffmedia?.ChannelPositions);
    };

    // -=-=-= enrichStream  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Enrich a stream with both-probe bitrate + channels before summariseStream/audioQuality/scoring, so ffprobe-unreadable values (e.g. DTS-HD MA
    // bitrate in MP4) fall back to mediaInfo. Every summary and scoring call site uses this so logged tokens and the scoring path enrich identically.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= summariseStream  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Per type: video codec + resolution/10bit/hdr (+/cover for cover-art/still images); data & attachment codec only. Audio & subtitle append /default, then their role markers.
    // Audio role markers: /commentary|/description then /dub|/original. Subtitle: /forced then /commentary|/description|/sdh|/lyrics.
    // /default and /forced read the REAL disposition flag only — a title keyword must not flip a selection flag (as forced already did).
    // The role markers mirror the sorting logic (flag OR title keyword, via the shared classifiers) so every plugin's summary lines up.
    // subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Audio uses codecDisplayName so a DTS subtype
    // or object-audio layer the container codec_name hides (dts-hd-ma, eac3-atmos, dts-express-x) shows in the token. Shared verbatim across all five.
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = resolveLang(s) || 'und';
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video') {
            const vHeight = Number(s.height || mediaInfoFor(s)?.Height || 0);
            const vTenbit = Number(s.bits_per_raw_sample || mediaInfoFor(s)?.BitDepth || 0) >= 10 || /p10(le|be)?$|10le|10be/.test(s.pix_fmt || '') || /10/.test(s.profile || '');
            const vHdr = ['smpte2084', 'arib-std-b67'].includes((s.color_transfer || '').toLowerCase().trim());
            return `[video:${[codec, vHeight > 0 ? `${vHeight}p` : '', vTenbit ? '10bit' : '', vHdr ? 'hdr' : ''].filter(Boolean).join(' ')}${isCoverArt(s) ? '/cover' : ''}]`;
        }
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            const prov = hasDisposition(s, 'dub') ? '/dub' : (hasDisposition(s, 'original') ? '/original' : '');
            return `[audio:${[lang, ch, codecDisplayName(s), rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = s.disposition?.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}]`;
        }
        if (type === 'attachment') {
            // codec_name is frequently absent or 'none' on attachment streams (fonts especially), which would degrade an obviously-identifiable embedded font to
            // [attach:unknown]. Fall back to the filename extension, then a font/image category from the mimetype - the same signals used to classify attachments.
            let label = codec;
            if (label === 'unknown' || label === 'none') {
                const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
                const fname = (s.tags?.filename || '').trim().toLowerCase();
                const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
                if (['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'].includes(ext)) label = ext;
                else if (/font|truetype|opentype|sfnt/.test(mime)) label = 'font';
                else if (mime.startsWith('image/')) label = 'image';
                else if (ext) label = ext;
            }
            return `[attach:${label}]`;
        }
        if (type === 'data')
            return `[data:${codec}]`;
        return `[${type || 'unknown'}:${codec}]`;
    };

    // -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'.
    const shortLang = (l) => l.replace(/[-_.].*$/, '');

    // -=-=-= globalOutputOpt  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Output-side ffmpeg options applied to EVERY run (the place for any universal muxer/output flag). Two flags: -max_muxing_queue_size 9999 raises the
    // muxer packet-buffer ceiling for ffmpeg's "Too many packets buffered" interleave error (chiefly a transcode/recovery concern; mostly vestigial on
    // ffmpeg 7.x which auto-sizes the queue, but cheap insurance); -flush_packets 0 buffers muxer writes instead of flushing per packet - the throughput-
    // optimal choice for FILE muxing (helps high-latency/network temp storage, negligible cost when local), so it is always applied, not exposed as a toggle.
    const globalOutputOpt = ' -max_muxing_queue_size 9999 -flush_packets 0';
    // ===== END SHARED: stream / language / preset helpers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language matching =====
    // Normalize any language identifier to a stable comparison key so en / eng / EN / English / en-US - and ISO 639-2/B vs /T (fre vs fra) - all
    // compare equal, letting each plugin's language-list input accept one form and match every equivalent tag. Node ships full ICU, so no table or
    // module is needed. video_clean does no language matching, so it is the one plugin that does NOT carry this section.
    // -=-=-= langNameIndex  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Reverse map English language NAME -> 2-letter code (english->en), built once per run by probing every aa..zz pair (fallback:'none' returns
    // undefined for the invalid pairs, leaving the 190 real ISO 639-1 languages). Lazily built on first spelled-out name, then memoised for the run.
    const langNameIndex = (() => {
        let idx = null;
        return () => {
            if (idx) return idx;
            idx = {};
            const dn = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
            for (let a = 97; a <= 122; a++) for (let b = 97; b <= 122; b++) {
                const code = String.fromCharCode(a, b);
                const name = dn.of(code);
                if (name) idx[name.toLowerCase()] = code;
            }
            return idx;
        };
    })();
    // -=-=-= langKey  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Comparison key for a language token: lowercase/trim, strip any region/variant via shortLang, map a spelled-out English name to its code, then fold
    // code variants with Intl.getCanonicalLocales (eng->en, fre/fra->fr). Undetermined / non-language tokens (und, mul, zxx, mis, reserved qaa-qtz) and
    // anything unrecognised pass through unchanged, so they only ever match themselves.
    const langKey = (x) => {
        let s = shortLang(String(x || '').trim().toLowerCase());
        if (!s) return '';
        if (s.length >= 4 && langNameIndex()[s]) s = langNameIndex()[s];   // spelled-out English name -> its 2-letter code
        try { return String(Intl.getCanonicalLocales(s)[0] || s).toLowerCase(); } catch (e) { return s; }
    };
    // -=-=-= langListMatch  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // True when a stream's language matches any entry in a pre-normalised key list (keys = userList.map(langKey), computed once per plugin run).
    const langListMatch = (streamLang, keys) => keys.includes(langKey(streamLang));
    // ===== END SHARED: language matching =====

    // ===== SHARED [audio_clean, clean_and_remux, sub_worker, video_clean]: ffmpeg metadata escaping =====
    // -=-=-= escMeta  [audio_clean, clean_and_remux, sub_worker, video_clean] =-=-=-
    // Tdarr does NOT pass the preset through a shell - it splits the string into a quote-aware argv array and hands it to child_process.spawn, so shell
    // metacharacters ($ ` ; |) are inert and reach ffmpeg as literal metadata bytes. The only injection vector is breaking out of the quoted value to
    // inject a new ffmpeg ARGUMENT, which needs a double quote (to close the wrapper) or a control character. Tdarr's tokenizer strips quotes with no
    // reliable backslash-escape convention, so we substitute rather than strip:
    //    backslash          -> forward-slash (readable, inert)
    //    double-quote       -> single-quote (safe inside the quoted value; preserves titles like "Director's Cut" and "AC3/Stereo")
    //    control characters -> space (avoids fusing words that a bare delete would join).
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')  // control characters (newlines, null bytes, etc.) → space
        .replace(/\\/g, '/')               // backslash → forward-slash (inert, readable)
        .replace(/"/g, "'");               // double-quote → single-quote (safe inside the quoted value)
    // ===== END SHARED: ffmpeg metadata escaping =====

    // ============= SUBTITLE SIDECAR HELPERS (non-shared) =============
    // Text subtitle codecs we can round-trip, mapped to the sidecar's native extension + ffmpeg encoder.
    // Bitmap codecs (hdmv_pgs_subtitle/dvd_subtitle/dvb_subtitle/xsub) have no text form: never extracted, never removed.
    const TEXT_SUB = {
        subrip:   { ext: 'srt', enc: 'srt' },
        srt:      { ext: 'srt', enc: 'srt' },
        mov_text: { ext: 'srt', enc: 'srt' },
        text:     { ext: 'srt', enc: 'srt' },
        ass:      { ext: 'ass', enc: 'ass' },
        ssa:      { ext: 'ass', enc: 'ass' },
        webvtt:   { ext: 'vtt', enc: 'webvtt' },
    };
    const isTextSub = (codec) => Object.prototype.hasOwnProperty.call(TEXT_SUB, String(codec).toLowerCase());
    const TEXT_EXTS = ['srt', 'ass', 'vtt'];

    // Dispositions encoded as filename tokens, in fixed order. `ff` is the ffmpeg -disposition name restored on import;
    // `flags` are the ffprobe disposition keys that, when set on the source, emit this token on extract. They differ only
    // for SDH: hearing_impaired and captions are the same closed-captions role, but captions has no Matroska flag and does
    // not survive an mp4->mkv round-trip (the muxer silently drops +captions), so BOTH normalise to the container-portable
    // hearing_impaired - extract emits a single 'sdh' token for either flag and import restores hearing_impaired. The
    // human-readable role also survives in the encoded title. `default` is deliberately NOT tracked: muxers auto-manage it
    // (mp4 forces default on the first subtitle), so it is neither identity-stable nor ours - stream_ordering picks it last.
    const DISPOSITIONS = [
        { token: 'forced',      ff: 'forced',           flags: ['forced'] },
        { token: 'sdh',         ff: 'hearing_impaired', flags: ['hearing_impaired', 'captions'] },
        { token: 'commentary',  ff: 'comment',          flags: ['comment'] },
        { token: 'descriptive', ff: 'descriptions',     flags: ['descriptions'] },
    ];
    // Legacy/Plex filename tokens that normalise onto a canonical token above (parse-only; extract never writes them):
    // 'cc' is the closed-captions spelling of SDH, so an existing <name>.cc.srt still imports (restored as portable hearing_impaired).
    const DISP_ALIAS = { cc: 'sdh' };
    // Parse-only tokens recognised so they aren't mis-read as the language, but carrying NO disposition: 'default' is muxer-managed, not a role we track or restore.
    const DISP_IGNORE = new Set(['default']);
    const DISP_TOKENS = new Set([...DISPOSITIONS.map((d) => d.token), ...Object.keys(DISP_ALIAS), ...DISP_IGNORE]);
    const dispFfOf = (token) => (DISPOSITIONS.find((d) => d.token === token) || {}).ff;
    // extract: one canonical token per role the stream's real flags carry (sdh covers hearing_impaired OR captions), deduped.
    const dispTokensOf = (s) => DISPOSITIONS.filter((d) => d.flags.some((f) => s.disposition?.[f] === 1)).map((d) => d.token);

    // Reversibly encode a title into one filesystem-safe, dot-free filename token (Windows u Linux u Mac): keep a
    // conservative readable set as-is, percent-encode every other char's UTF-8 bytes (covers . / \ : * ? " < > | %
    // and non-ASCII). decodeTitle is the exact inverse.
    const TITLE_SAFE = /[A-Za-z0-9 _()',!&+=@#-]/;
    const encodeTitle = (t) => {
        let out = '';
        for (const ch of String(t)) {
            if (TITLE_SAFE.test(ch)) { out += ch; continue; }
            for (const b of Buffer.from(ch, 'utf8')) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
        }
        return out;
    };
    const decodeTitle = (t) => {
        const bytes = [];
        for (let i = 0; i < t.length; i += 1) {
            if (t[i] === '%' && i + 2 < t.length && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
            else for (const b of Buffer.from(t[i], 'utf8')) bytes.push(b);
        }
        return Buffer.from(bytes).toString('utf8');
    };
    // The import marker's VALUE carries the sidecar basenames muxed in the most-recent pass, encoded to [A-Za-z0-9%]
    // (nothing escMeta touches, no comma) and comma-joined - a GLOBAL tag value survives every container (incl. mp4,
    // which drops per-stream title/default), so pass 2 deletes exactly what pass 1 embedded without re-reading metadata.
    const encMarker = (s) => Array.from(Buffer.from(String(s), 'utf8')).map((b) => (/[A-Za-z0-9]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');
    const decMarker = (s) => { const b = []; for (let i = 0; i < s.length; i += 1) { if (s[i] === '%') { b.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else b.push(s.charCodeAt(i)); } return Buffer.from(b).toString('utf8'); };
    const encodeMarkerList = (names) => names.map(encMarker).join(',');
    const decodeMarkerList = (v) => String(v || '').split(',').filter(Boolean).map(decMarker);
    // Keep the sidecar basename under the filesystem's 255-byte cap; if the encoded title pushes it over, trim the
    // RAW title (whole chars, so UTF-8 stays valid) until it fits and flag the lossy truncation.
    let titleTruncated = false;
    const encodeTitleCapped = (rawTitle, fixedLen) => {
        let raw = String(rawTitle);
        let enc = encodeTitle(raw);
        while (raw.length > 0 && Buffer.byteLength(`${enc}${'.'.repeat(fixedLen ? 1 : 0)}`, 'utf8') + fixedLen > 255) { raw = raw.slice(0, -1); enc = encodeTitle(raw); titleTruncated = true; }
        return enc;
    };

    // The real library path (for naming sidecars) and its directory - originalLibraryFile is the true on-disk file;
    // fall back to file.file so the plugin still works when a caller (or the test harness) omits originalLibraryFile.
    const libFilePath = otherArguments?.originalLibraryFile?.file || file.file || '';
    const libDir = path.dirname(libFilePath);
    const videoBase = path.basename(libFilePath).replace(/\.[^.]+$/, '');

    // sidecarBasename <-> parseSidecar are exact inverses. Name = <videoBase>.s<index>[.<encTitle>].<lang>[.<disp...>].<ext>.
    const sidecarBasename = (s) => {
        const lang = resolveLang(s) || 'und';
        const disp = dispTokensOf(s);
        const { ext } = TEXT_SUB[String(s.codec_name).toLowerCase()];
        const rawTitle = s.tags?.title || '';
        const fixed = `${videoBase}.s${s.index}.${lang}${disp.length ? `.${disp.join('.')}` : ''}.${ext}`;
        const encTitle = rawTitle ? encodeTitleCapped(rawTitle, Buffer.byteLength(fixed, 'utf8')) : '';
        return `${videoBase}.s${s.index}${encTitle ? `.${encTitle}` : ''}.${lang}${disp.length ? `.${disp.join('.')}` : ''}.${ext}`;
    };
    const parseSidecar = (name) => {
        const extMatch = name.match(/\.([A-Za-z0-9]+)$/);
        if (!extMatch || !TEXT_EXTS.includes(extMatch[1].toLowerCase())) return null;
        if (!name.startsWith(`${videoBase}.`)) return null;
        const mid = name.slice(videoBase.length + 1, name.length - extMatch[0].length);
        const toks = mid.split('.');
        if (!toks.length || !/^s\d+$/.test(toks[0])) return null;         // order marker
        const index = parseInt(toks[0].slice(1), 10);
        toks.shift();
        const rawDisp = [];
        while (toks.length && DISP_TOKENS.has(toks[toks.length - 1])) rawDisp.unshift(toks.pop());  // trailing dispositions, right-to-left
        const dispTokens = [...new Set(rawDisp.filter((t) => !DISP_IGNORE.has(t)).map((t) => DISP_ALIAS[t] || t))];   // drop ignored (default), normalise legacy (cc->sdh), dedupe
        if (!toks.length) return null;
        const lang = toks.pop();                                          // language is the next-from-right token
        if (!lang) return null;
        if (toks.length > 1) return null;                                // 0 or 1 residual token = the encoded title
        const title = toks.length ? decodeTitle(toks[0]) : '';
        return { name, index, lang, title, ext: extMatch[1].toLowerCase(), dispTokens, disp: [...new Set(dispTokens.map(dispFfOf).filter(Boolean))] };
    };

    const parseLangFilter = (v) => { const l = String(v || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean); return l.length ? new Set(l.map(langKey)) : null; };   // keys, so en/eng/English match
    // Composite identity key that survives the round-trip (language | title | sorted-dispositions), used to match a
    // sidecar to an embedded track (skip duplicate imports; confirm a sidecar is safely embedded before deleting it).
    const keyOfStream = (s) => `${resolveLang(s) || 'und'}|${s.tags?.title || ''}|${dispTokensOf(s).slice().sort().join('+')}`;
    const keyOfSidecar = (f) => `${f.lang}|${f.title}|${f.dispTokens.slice().sort().join('+')}`;
    // Synthetic stream so a not-yet-muxed sidecar renders through summariseStream in the expected-results line.
    const sidecarToStream = (f) => {
        const codec = f.ext === 'srt' ? 'subrip' : (f.ext === 'ass' ? 'ass' : 'webvtt');
        const disposition = {}; for (const d of DISPOSITIONS) if (f.dispTokens.includes(d.token)) disposition[d.ff] = 1;
        return { codec_type: 'subtitle', codec_name: codec, index: -1, tags: { language: f.lang, title: f.title }, disposition };
    };

    // ---- guards + input validation (before the try, per the suite's failFile convention) ----
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams)) failFile('No ffProbe stream data available. Check your settings!');
    const mode = String(inputs.mode);
    if (mode !== 'extract' && mode !== 'import') failFile(`mode "${mode}" is invalid (expected extract or import). Check your settings!`);
    if (file.fileMedium && file.fileMedium !== 'video') { response.infoLog += '☑Not a video file - skipping.\n'; return response; }

    const streams = file.ffProbeData.streams;
    const langFilter = parseLangFilter(inputs.only_languages);
    const skipCommentary = String(inputs.skip_commentary) === 'true';
    const removeAfterExtract = String(inputs.remove_after_extract) === 'true';
    const removeSidecarAfterImport = String(inputs.remove_sidecar_after_import) === 'true';
    const dstContainer = String(file.container || '').toLowerCase().trim();
    const isMp4Family = ['mp4', 'm4v', 'mov', 'm4a'].includes(dstContainer);

    try {
        response.infoLog += `☐Input streams: ${streams.map((s) => summariseStream(enrichStream(s))).join('')}\n`;

        if (mode === 'extract') {
            // ============= EXTRACT: embedded text subs -> sidecars (+ optional removal) =============
            const eligible = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle' && isTextSub(s.codec_name)
                && !(skipCommentary && isCommentary(s)) && !(langFilter && !langFilter.has(langKey(resolveLang(s) || 'und'))));
            if (!eligible.length) { response.infoLog += '☑No text subtitles to extract.\n'; return response; }

            let sidecarOut = ''; const removeIdx = []; let wrote = 0; let skipped = 0;
            for (const s of eligible) {
                const { enc } = TEXT_SUB[String(s.codec_name).toLowerCase()];
                const name = sidecarBasename(s);
                const full = path.join(libDir, name);
                // An existing sidecar is preserved (never overwrite a user's on-disk edits) - but only if it has content. A 0-byte sidecar is the fingerprint of a
                // prior extract ffmpeg aborted mid-write; trusting it and then stripping the embedded source would lose the subtitle, so re-extract it instead.
                const existsNonEmpty = fs.existsSync(full) && (() => { try { return fs.statSync(full).size > 0; } catch { return false; } })();
                if (existsNonEmpty) { skipped += 1; response.infoLog += `☑Sidecar already exists, not overwriting: ${name}\n`; }
                else { sidecarOut += ` -map 0:${s.index} -c:s ${enc} "${full}"`; wrote += 1; response.infoLog += `☐Extract stream ${s.index} -> ${name}\n`; }
                if (removeAfterExtract) removeIdx.push(s.index);
            }
            if (titleTruncated) response.infoLog += '☒A subtitle title was too long for the filename and was truncated.\n';
            if (!wrote && !removeIdx.length) { response.infoLog += '☑All eligible subtitles already extracted.\n'; return response; }

            let out = `${sidecarOut} -map 0`;
            for (const idx of removeIdx) out += ` -map -0:${idx}`;
            out += ' -c copy';
            if (isMp4Family) out += ' -movflags use_metadata_tags';   // mp4 -c copy drops sibling plugins' global tags (awk_video/awk_recovered) without this - mirror the import branch
            out += globalOutputOpt;
            response.preset = `,${out}`;
            response.processFile = true;
            const survivors = streams.filter((s) => !removeIdx.includes(s.index));
            response.infoLog += `☑Expected results: ${survivors.map((s) => summariseStream(enrichStream(s))).join('')}\n`;
            return response;
        }

        // ============= IMPORT: sidecars -> embedded (+ safe deletion) =============
        // The global marker VALUE lists the basenames muxed in the prior pass, so pass 2 deletes exactly what pass 1
        // embedded (never a pre-existing collision) and never re-adds them - robust even where a container drops
        // per-stream title/default (mp4). Tdarr only re-runs after a SUCCESSFUL mux, so a listed sidecar is safely in.
        const globalTags = file.ffProbeData.format?.tags || {};
        const markerKey = Object.keys(globalTags).find((k) => k.toLowerCase() === 'awk_sub_worker');
        const importedSet = new Set(markerKey ? decodeMarkerList(globalTags[markerKey]) : []);

        let entries;
        try { entries = fs.readdirSync(libDir); } catch (e) { failFile(`Cannot read the library directory to find sidecars: ${e && e.message ? e.message : e}`); }
        const found = entries.map(parseSidecar).filter(Boolean)
            .filter((f) => !(langFilter && !langFilter.has(langKey(f.lang))))
            .filter((f) => !(skipCommentary && f.dispTokens.includes('commentary')));
        if (!found.length) { response.infoLog += '☑No subtitle sidecars found to import.\n'; return response; }

        let deleted = 0;
        if (removeSidecarAfterImport) {
            for (const f of found.filter((x) => importedSet.has(x.name))) {
                try { fs.unlinkSync(path.join(libDir, f.name)); deleted += 1; response.infoLog += `☑Deleted sidecar (embedded): ${f.name}\n`; }
                catch (e) { response.infoLog += `☒Could not delete sidecar ${f.name}: ${e && e.message ? e.message : e}\n`; }
            }
        }

        // toAdd = sidecars neither already embedded (fresh) nor muxed by the prior pass (excluded via the marker list).
        const embeddedKeys = new Set(streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle' && isTextSub(s.codec_name)).map(keyOfStream));
        const existingSubCount = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle').length;
        const toAdd = found.filter((f) => !importedSet.has(f.name) && !embeddedKeys.has(keyOfSidecar(f)));

        if (toAdd.length) {
            // Mux the new sidecars. Extra -i inputs go on the OUTPUT side (main stays input 0). Stamp the GLOBAL marker
            // with this pass's basenames (survives mp4 with use_metadata_tags); reQueue so the next pass confirms-and-deletes.
            let inputSide = ''; let extraMaps = ''; let meta = '';
            toAdd.forEach((f, k) => {
                const outIdx = existingSubCount + k;
                inputSide += ` -sub_charenc UTF-8 -i "${path.join(libDir, f.name)}"`;
                extraMaps += ` -map ${k + 1}:0`;
                meta += ` -metadata:s:s:${outIdx} "language=${escMeta(f.lang)}"`;
                if (f.title) meta += ` -metadata:s:s:${outIdx} "title=${escMeta(f.title)}"`;
                if (f.disp.length) meta += ` -disposition:s:${outIdx} ${f.disp.join('+')}`;
                if (isMp4Family) meta += ` -c:s:${outIdx} mov_text`;
                response.infoLog += `☐Import ${f.name} -> subtitle ${outIdx} (${f.lang}${f.dispTokens.length ? ` ${f.dispTokens.join('+')}` : ''})\n`;
            });
            let out = `${inputSide} -map 0${extraMaps} -c copy${meta} -metadata "awk_sub_worker=${encodeMarkerList(toAdd.map((f) => f.name))}"`;
            if (isMp4Family) out += ' -movflags use_metadata_tags';
            out += globalOutputOpt;
            response.preset = `,${out}`;
            response.processFile = true;
            response.reQueueAfter = removeSidecarAfterImport;   // only re-run if a confirm-and-delete pass is needed
            const expected = streams.concat(toAdd.map(sidecarToStream));
            response.infoLog += `☑Expected results: ${expected.map((s) => summariseStream(enrichStream(s))).join('')}\n`;
            return response;
        }

        if (!deleted) response.infoLog += importedSet.size ? '☑Sidecars already imported; nothing to do.\n' : '☑All matching subtitles already present; nothing to import.\n';
        return response;
    } catch (err) {
        failUnexpected(err);
    }
    return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
