const details = () => ({
    id: 'Tdarr_Plugin_awk_sub_worker',
    Stage: 'Pre-processing',
    Name: 'Subtitle sidecar worker - extract embedded text subs to sidecars and reimport them',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Round-trips text subtitles between the container and media-server-style sidecar files so they can be reviewed/edited on disk (by hand or an external script).

                \\nmode=extract writes each embedded TEXT subtitle to a sidecar next to the video (native format: srt/ass/vtt) and, by default, removes those tracks from the file.
                \\nA STYLED subtitle (ASS/SSA) in a file that has embedded fonts is exported as a bundle named .<video>.s<streamIndex>[.<title>].<lang>[.<flags>].styled.mks - one Matroska holding the subtitle plus those fonts, which leave the video with it (they exist nowhere else, and Matroska is the only container that can carry both). The leading dot hides it from Plex/Jellyfin. Import restores the subtitle and its fonts together. An mp4 target cannot hold font attachments at all, so a bundle is left on disk until the file is mkv again.
                \\nmode=import muxes matching sidecars back into the file (restoring language, title, and disposition) and, by default, deletes the sidecar once it is safely embedded. Import never drops a subtitle - anything not already embedded is muxed in (a copy already present just becomes a duplicate, never a loss); method_deduplicate collapses byte-identical copies.
                \\nAn SRT carries no title/language/disposition, so all of that is encoded in the filename: <video>.s<streamIndex>[.<title>].<lang>[.<forced|sdh|commentary|descriptive>].<ext> - the stream index keeps names unique, the title is reversibly encoded, and language+flags sit last so Plex/Jellyfin/Emby auto-detect them.
                \\nImport ALSO recognizes sidecars named the way those servers do, with no s<index> (e.g. <video>.en.forced.srt), anchored on the language token: the flag spellings foreign (= forced), cc and hi (= sdh) and default (ignored) are all understood, as is Emby's parenthesized description (<video>.English(Commentary).srt), which becomes the track title. hi is only read as hearing-impaired when a real language precedes it, so <video>.hi.srt stays Hindi.
                \\nBitmap subtitles (PGS/VobSub/DVB) can't become text and are always left embedded and untouched.
                \\nScope both modes with only_languages (comma-separated, e.g. eng,jpn; blank = all) and skip_commentary (omit commentary tracks). method_deduplicate collapses byte-identical sidecar copies on import (see its tooltip for the disabled/enabled modes).
                \\nRuns standalone, or in the awk stack after clean_and_remux (first) / audio_clean and before stream_ordering (last).`,
    Version: '3.6.0',
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
                \\nStyled ASS/SSA rely on embedded fonts, so they are exported as a .mks bundle holding the subtitle and those fonts together, and the fonts are removed from the video along with it - the styling survives the round-trip whatever else runs in between.`,
        },
        {
            name: 'remove_sidecar_after_import',
            type: 'boolean',
            defaultValue: true,
            inputUI: { type: 'dropdown', options: ['true', 'false'] },
            tooltip: `On import, delete each sidecar whose basename is listed in the file's global awk_sub_worker marker (stamped by the prior mux pass). Tdarr only re-runs after a successful mux, so a listed sidecar is confirmed embedded. Off = leave the sidecars in place.`,
        },
        {
            name: 'method_deduplicate',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: { type: 'dropdown', options: ['disabled', 'enabled'] },
            tooltip: `On import, how to handle sidecar files that are BYTE-IDENTICAL to each other (the same subtitle saved under more than one name/flag). Content is compared, so genuinely different tracks - two commentaries, a real forced vs a full track - are always kept separately; only exact duplicates collapse.
                \\nImport never drops a subtitle: a sidecar whose text isn't already embedded is always muxed in (if its content already exists in the file you simply get a duplicate track, never a loss).
                \\ndisabled - mux every sidecar as its own track, even byte-identical copies (you may get duplicate subtitles).
                \\nenabled  - mux one track per byte-identical group, combining their flags (a byte-identical plain + SDH pair imports once, tagged SDH). Every member of the group is listed in the marker, so remove_sidecar_after_import cleans up the whole group.
                \\nWhether the sidecar files are deleted afterwards is remove_sidecar_after_import's decision alone, in either mode.`,
        },
    ],
});

// eslint-disable-next-line no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')(); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
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
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description','visually impaired','visual impaired'], tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','hard of hearing','hoh','deaf'], tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign'],                                      tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                                              tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','music & effects','m&e','m and e'],   tag: null          },
        karaoke:          { streams:['audio'],                    keywords: ['karaoke'],                                               tag: 'Karaoke'     },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                                        tag: null          },
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
    const isCoverArt = (s) => IMAGE_CODECS.includes((s.codec_name || '').trim().toLowerCase())
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: codec name resolution =====
    // -=-=-= codecAliases  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_alaw',  'g711'],   // G.711 A-law: LOSSY 8-bit companded telephony (64 kbps/ch), NOT lossless - carve out before the generic pcm_ fold
        ['pcm_mulaw', 'g711'],   // G.711 mu-law: same
        ['pcm_',   'pcm'],
        ['dsd',    'dsd'],       // DSD / SACD (1-bit): fold dsd_lsbf/dsd_msbf(_planar) to one lossless key
        ['mp4als', 'als'],       // MPEG-4 ALS: fold the mp4-wrapped spelling to the 'als' codecInfo key (a bare 'als' resolves directly)
        ['adpcm',  'adpcm'],
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= resolveCodecName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the
    // _x variant when DTS:X is detected) and eac3 into eac3atmos. Used for scoring by audioQuality (audio_clean, stream_ordering)
    // and isLosslessSource (audio_clean), and by summariseStream (all five) purely for accurate display labeling - a plugin
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
                // MediaInfo signal, plus an ffprobe fallback: jellyfin reports DTS:X in `profile` (e.g. "DTS-HD MA + DTS:X"), the only
                // object-audio signal when Tdarr supplies no mediaInfo track. /dts:?x/ matches "dts:x"/"dtsx"; no plain-DTS profile carries it.
                if (/\bxll x\b/.test(additionalFeatures) || /dts:?x/.test(profile))
                    codec = DTS_X_VARIANT[codec];
            }
        } else if (codec === 'eac3' && (longName.includes('atmos') || commercial.includes('atmos') || profile.includes('atmos')))
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
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The mp4/mov container family whose -c copy needs `-movflags use_metadata_tags` to keep sibling plugins' GLOBAL awk_* markers through the remux (dropping one re-triggers
    // work upstream). One source so the four writers can't drift on the set (video_clean's video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [audio_clean, clean_and_remux, sub_worker, video_clean] =-=-=-
    // Look up a tag value case-insensitively - matroska UPPER-CASES tag keys on write, so a plugin reading its sibling's awk_* marker gets an uppercased key back. Returns the
    // raw value (or '' if absent); callers trim/decode as needed. One source so the four plugins that read each other's markers can't drift on the lookup convention.
    const getTagCI = (tags, name) => { const hit = Object.keys(tags || {}).find((k) => k.toLowerCase() === name); return hit === undefined ? '' : String(tags[hit] ?? ''); };
    // ===== END SHARED: case-insensitive tag lookup =====

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
        const miChannels = Number(ffmedia?.Channels || 0);
        if (miChannels > 0) return miChannels;
        return channelsFromLayout(ffstream.channel_layout || ffmedia?.ChannelLayout || ffmedia?.ChannelPositions);
    };

    // -=-=-= enrichStream  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Enrich a stream with both-probe bitrate + channels before summariseStream/audioQuality/scoring, so ffprobe-unreadable values (e.g. DTS-HD MA
    // bitrate in MP4) fall back to mediaInfo. Every summary and scoring call site uses this so logged tokens and the scoring path enrich identically.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= is10Bit  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // True when a video stream is 10-bit (or deeper): raw sample depth or mediaInfo BitDepth >= 10, a 10-bit pixel format (p10le/p10be), or a 10-bit
    // profile (Main 10 / High 10). Single source for summariseStream's 10bit token and video_clean's re-encode depth decision so the two can't drift.
    const is10Bit = (s, mi = mediaInfoFor(s)) => Number(s.bits_per_raw_sample || mi?.BitDepth || 0) >= 10
        || /p10(le|be)?$|10le|10be/.test((s.pix_fmt || '').toLowerCase()) || /10/.test((s.profile || '').toLowerCase());
    // -=-=-= FONT_EXTS + isFontMime  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Embedded-font filename extensions + a font-mimetype test, shared by summariseStream's [attach:...] token and clean_and_remux's attachmentKind font classification.
    const FONT_EXTS = ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'];
    const isFontMime = (mime) => /font|truetype|opentype|sfnt/.test(mime);
    // -=-=-= HDR_TRANSFERS  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // The HDR transfer curves: ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg).
    // The single source for every HDR-curve test: summariseStream's vHdr token below, and video_clean's isHdr / dvNoBaseLayer / tonemap-setparams gate.
    const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
    // -=-=-= DYNAMIC_HDR_RE  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Recognises dynamic HDR (HDR10+) from a lowercased HDR_Format string. Matches the spellings real files use: 'hdr10+', 'hdr10 plus', and 'smpte st 2094'.
    // Bare '2094' suffices - only HDR10+ carries a 2094 block (plain HDR10 is SMPTE ST 2086). summariseStream's HDR10+ token and video_clean's isDynamicHdr
    // both read it, so the display token and the protective re-encode skip cannot disagree. DV is recognised separately (isDolbyVisionVideo / dvSignal).
    const DYNAMIC_HDR_RE = /2094|hdr10\+|hdr10 plus/;
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
            const vmi = mediaInfoFor(s);
            const vHeight = Number(s.height || vmi?.Height || 0);
            const vTenbit = is10Bit(s, vmi);
            const vXfer = (s.color_transfer || vmi?.transfer_characteristics || '').toLowerCase().trim();
            const vHdr = HDR_TRANSFERS.includes(vXfer) || !!String(vmi?.HDR_Format || '').trim();
            // HDR sub-type marker, shown in place of 'hdr'. Dolby Vision via the shared isDolbyVisionVideo (fourcc / mediaInfo HDR_Format / DOVI record) - also
            // surfacing Profile-5 DV whose non-standard transfer sets no hdr flag. HDR10+ (DYNAMIC_HDR_RE) is stream-visible only via mediaInfo (ffprobe
            // carries 2094-40 per-frame, which Tdarr doesn't probe), so it degrades to plain 'hdr' when mediaInfo is absent.
            const vHdrFmt = String(vmi?.HDR_Format || vmi?.HDR_Format_Compatibility || '').toLowerCase();
            const vDv = isDolbyVisionVideo(s, vmi);
            const vHdrTok = vDv ? 'dv' : (DYNAMIC_HDR_RE.test(vHdrFmt) ? 'hdr10+' : (vHdr ? 'hdr' : ''));
            const vParts = [codec, vHeight > 0 ? `${vHeight}p` : '', vTenbit ? '10bit' : '', vHdrTok].filter(Boolean).join(' ');
            return `[video:${vParts}${isCoverArt(s) ? '/cover' : ''}]`;
        }
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            const prov = hasDisposition(s, 'dub') ? '/dub' : (hasDisposition(s, 'original') ? '/original' : '');
            // Dolby Surround EX marker (a rear channel matrix-folded into a 5.1 AC-3), read inline from mediaInfo Format_Settings_Mode - the flag's only home
            // (this shared helper can't call audio_clean's local isMatrixSurroundSource). Marks the EX copy so its token differs from a plain 5.1 twin.
            const surEx = /surround ex/i.test(mediaInfoFor(s)?.Format_Settings_Mode || '') ? 'dd-ex' : '';
            return `[audio:${[lang, ch, surEx, codecDisplayName(s), rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = hasDisposition(s, 'forced') ? '/forced' : '';   // flag OR title keyword, same test the classifiers use - so the summary token and the sort key can never disagree
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}]`;
        }
        if (type === 'attachment') {
            // codec_name is often absent/'none' on attachments (fonts especially). Fall back to the filename extension, then the mimetype: fonts read 'font',
            // everything else uses the mimetype SUBTYPE (image/png -> png, text/html -> html) so a removed attachment is legible by what it actually is.
            let label = codec;
            if (label === 'unknown' || label === 'none') {
                const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
                const fname = (s.tags?.filename || '').trim().toLowerCase();
                const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
                const sub   = mime.includes('/') ? mime.slice(mime.indexOf('/') + 1).replace(/^x-/, '') : '';
                if (FONT_EXTS.includes(ext)) label = ext;
                else if (isFontMime(mime)) label = 'font';
                else if (ext) label = ext;
                else if (sub) label = sub;
            }
            return `[attach:${label}]`;
        }
        if (type === 'data') {
            // Prefer a meaningful codec_name; when it's absent/generic, surface the mimetype SUBTYPE (text/html -> html) so a removed data stream is legible.
            const dmime = (s.tags?.mimetype || '').trim().toLowerCase();
            const dsub = dmime.includes('/') ? dmime.slice(dmime.indexOf('/') + 1).replace(/^x-/, '') : '';
            return `[data:${(codec === 'unknown' || codec === 'none') && dsub ? dsub : codec}]`;
        }
        return `[${type || 'unknown'}:${codec}]`;
    };

    // -=-=-= globalOutputOpt  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Output-side ffmpeg options applied to EVERY run (the place for any universal muxer/output flag). Two flags: -max_muxing_queue_size 9999 raises the
    // muxer packet-buffer ceiling for ffmpeg's "Too many packets buffered" interleave error (chiefly a transcode/recovery concern; mostly vestigial on
    // ffmpeg 7.x which auto-sizes the queue, but cheap insurance); -flush_packets 0 buffers muxer writes instead of flushing per packet - the throughput-
    // optimal choice for FILE muxing (helps high-latency/network temp storage, negligible cost when local), so it is always applied, not exposed as a toggle.
    const globalOutputOpt = ' -max_muxing_queue_size 9999 -flush_packets 0';

    // -=-=-= streamTag  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // infoLog stream tag: the SOURCE ffprobe index of the stream a line concerns, as a fixed 5-char field so columns line up ([s 0],[s 9],[s10],[s99];
    // an index >=100 widens to [s100]). Sits right after the status symbol, before any [input=value] tag. Used only where a line is about ONE source
    // stream - omitted on whole-file summaries and on brand-new/appended streams (imports, downmix appends) that have no source index of their own.
    const streamTag = (index) => `[s${String(index).padStart(2, ' ')}]`;
    // ===== END SHARED: stream / language / preset helpers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language matching =====
    // Normalize any language identifier to a stable comparison key so en / eng / EN / English / en-US - and ISO 639-2/B vs /T (fre vs fra) - all
    // compare equal, letting each plugin's language-list input accept one form and match every equivalent tag. Node ships full ICU, so no table or
    // module is needed. video_clean does no language matching, so it is the one plugin that does NOT carry this section.
    // -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'.
    const shortLang = (l) => l.replace(/[-_.].*$/, '');
    // -=-=-= langNameIndex  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Reverse map English language NAME -> 2-letter code (english->en), built once per run by probing every aa..zz pair (fallback:'none' returns
    // undefined for the invalid pairs, leaving the 190 real ISO 639-1 languages). Lazily built on first spelled-out name, then memoised for the run.
    const langNameIndex = (() => {
        let idx = null;
        return () => {
            if (idx) return idx;
            idx = {};
            const dn = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
            for (let a = 97; a <= 122; a++) for (let b = 97; b <= 122; b++) {   // 97-122 = ASCII a-z: every 2-letter combo
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
    // ===== END SHARED: language matching =====

    // ===== SHARED [clean_and_remux, audio_clean, sub_worker, stream_ordering, video_clean]: dolby vision detection =====
    // -=-=-= isDolbyVisionVideo  [clean_and_remux, audio_clean, sub_worker, stream_ordering, video_clean] =-=-=-
    // True when a video stream carries Dolby Vision, both-probe: a dvhe/dvh1/dvav/dva1/dav1 fourcc, a mediaInfo HDR_Format naming Dolby Vision, or an ffprobe
    // DOVI configuration record / dolby-vision side_data. The four -c copy plugins add `-strict unofficial` to an mp4/mov remux with it, so ffmpeg's mov
    // muxer keeps the dvcC/dvvC config boxes (a plain copy drops them, demoting DV to plain HEVC - verified on a real sample). video_clean uses it only for
    // the summariseStream [video:...dv] display token; its guard_dv ENCODE routing uses the NARROWER dvSignal (needs a parsed DOVI record) instead, since
    // libx265 -dolbyvision hard-requires a real RPU (see the note there). Pass the stream's paired mediaInfo (mediaInfoFor(stream)); a single-probe false
    // negative would silently lose the boxes.
    const isDolbyVisionVideo = (ffstream, ffmedia) => /^(dvhe|dvh1|dvav|dva1|dav1)$/.test((ffstream?.codec_tag_string || '').toLowerCase().trim())
        || String(ffmedia?.HDR_Format || ffmedia?.HDR_Format_Compatibility || '').toLowerCase().includes('dolby vision')
        || (Array.isArray(ffstream?.side_data_list) ? ffstream.side_data_list : []).some((sd) => /dovi configuration record|dolby vision/i.test(String(sd?.side_data_type || '')));
    // ===== END SHARED: dolby vision detection =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: dolby vision strict mp4 arg =====
    // -=-=-= dvStrictMp4Arg  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // The ' -strict unofficial' an mp4/mov -c copy needs so ffmpeg's mov muxer keeps a Dolby Vision stream's dvcC/dvvC boxes; a plain copy drops them,
    // demoting DV to plain HEVC/AV1 (verified on real HEVC + AV1 DV samples). Finds the DV video stream DIRECTLY - isDolbyVisionVideo, cover art excluded -
    // so a leading cover-art stream can't mask it (not just the first video stream); HEVC-DV and AV1-DV both qualify. Pass the RAW file.ffProbeData.streams:
    // codec_tag_string / side_data_list (the DV signals) live only there. clean_and_remux does the equivalent per-stream in its own loop.
    const dvStrictMp4Arg = (container, streams) => {
        if (!isMp4Family(container)) return '';
        const list = Array.isArray(streams) ? streams : [];
        const hasDv = list.some((s) => (s.codec_type || '').toLowerCase() === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s)));
        return hasDv ? ' -strict unofficial' : '';
    };
    // ===== END SHARED: dolby vision strict mp4 arg =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg metadata escaping =====
    // -=-=-= escMeta  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
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
    // STYLED subtitles render through fonts that exist only as attachments inside the container, so extracting one to a loose text file and letting the
    // fonts be removed as orphaned destroys the styling irrecoverably. Such a subtitle is exported as a Matroska BUNDLE instead - the subtitle plus every
    // font attachment in one file - so the fonts travel with it. Matroska is the only container that can do this: mp4/mov reject ass and carry no
    // attachments at all, WebM allows only WebVTT, and a fonts-ONLY Matroska is not an option either (ffmpeg exits 0 but writes an unreadable file).
    // .mks is Matroska's subtitle-only extension - .mkv/.mka would mux byte-identically, but a server that ignores dotfiles would scan those as a video
    // or a music track. Verified on jellyfin-ffmpeg 7.1.4: language, title, disposition and the font bytes all survive the full round-trip.
    // The fixed marker token before the extension is what makes a bundle name unambiguous: clean_and_remux's remove_imagesubs=export writes its own
    // dot-prefixed .mks image-subtitle sidecars in the same "<base>.s<index>.<lang>[.forced]" shape, and importing one of those as a bundle would
    // silently re-add the image subtitle that pass had just exported and removed. It is stripped before the disposition tokens, so it never occupies
    // the language slot, and no disposition token spells 'styled'.
    const STYLED_SUBS = ['ass', 'ssa'];
    const BUNDLE_EXT = 'mks';
    const BUNDLE_TOKEN = 'styled';
    const isStyledSub = (codec) => STYLED_SUBS.includes(String(codec).toLowerCase());

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
    // Media-server filename tokens that normalise onto a canonical token above (parse-only; extract never writes them), so a sidecar named by
    // Plex/Jellyfin/Emby - or by hand from their docs - still imports with its role intact instead of being read as the language and skipped:
    // 'cc' and 'hi' are the closed-captions/hearing-impaired spellings of SDH, 'foreign' is Jellyfin's and Emby's spelling of forced.
    const DISP_ALIAS = { cc: 'sdh', hi: 'sdh', foreign: 'forced' };
    // Parse-only tokens recognised so they aren't mis-read as the language, but carrying NO disposition: 'default' is muxer-managed, not a role we track or restore.
    const DISP_IGNORE = new Set(['default']);
    const DISP_TOKENS = new Set([...DISPOSITIONS.map((d) => d.token), ...Object.keys(DISP_ALIAS), ...DISP_IGNORE]);
    // Alias tokens that are ALSO a real ISO 639-1 code, so the right-to-left disposition strip must not swallow the language slot: 'hi' is both the
    // hearing-impaired flag and Hindi. Such a token counts as a disposition only when a real language sits immediately before it (Jellyfin's own rule),
    // so <name>.en.hi.srt is English+SDH while <name>.hi.srt stays a Hindi track. See the guard in parseSidecar's disposition loop.
    const DISP_AMBIGUOUS_LANG = new Set(['hi']);
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
    const encodeMarker = (s) => Array.from(Buffer.from(String(s), 'utf8')).map((b) => (/[A-Za-z0-9]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');
    const decodeMarker = (s) => { const b = []; for (let i = 0; i < s.length; i += 1) { if (s[i] === '%') { b.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else b.push(s.charCodeAt(i)); } return Buffer.from(b).toString('utf8'); };
    const encodeMarkerList = (names) => names.map(encodeMarker).join(',');
    const decodeMarkerList = (v) => String(v || '').split(',').filter(Boolean).map(decodeMarker);
    // Keep the sidecar basename under the filesystem's 255-byte cap; if the encoded title pushes it over, trim the
    // RAW title (whole chars, so UTF-8 stays valid) until it fits and flag the lossy truncation.
    let titleTruncated = false;
    const NAME_BYTE_CAP = 255;   // filesystem basename byte limit (ext4/APFS/NTFS) the encoded sidecar name must fit under
    const encodeTitleCapped = (rawTitle, fixedLen) => {
        let raw = String(rawTitle);
        // Bound the work: the name budget is 255 bytes and encodeTitle emits >= 1 byte per raw char, so any raw title longer
        // than 255 chars can never fit - trimming it up front makes the fit loop O(cap) instead of O(N^2) on a crafted multi-KB
        // title (untrusted container metadata), losing only chars the loop would trim anyway (output identical, still flagged).
        if (raw.length > NAME_BYTE_CAP) { raw = raw.slice(0, NAME_BYTE_CAP); titleTruncated = true; }
        let enc = encodeTitle(raw);
        while (raw.length > 0 && Buffer.byteLength(`${enc}${'.'.repeat(fixedLen ? 1 : 0)}`, 'utf8') + fixedLen > NAME_BYTE_CAP) { raw = raw.slice(0, -1); enc = encodeTitle(raw); titleTruncated = true; }
        return enc;
    };

    // ===== SHARED [clean_and_remux, sub_worker]: preset path safety =====
    // -=-=-= pathIsPresetSafe  [clean_and_remux, sub_worker] =-=-=-
    // True when a real on-disk path can be embedded in a preset's quoted "${path}" token. Tdarr never shells out, but its worker tokenises each preset
    // half with a quote-aware parser before spawning ffmpeg, so a " anywhere in the path closes the wrapper mid-token and everything after it becomes
    // fresh argv entries (a raw control character breaks the token just as badly). The name parts WE generate are sanitised at their source, but the
    // library DIRECTORY is a real path that has to stay literal - it can only be checked, never rewritten - so a caller that fails this test refuses
    // that one sidecar with a ☒ line rather than emit the token.
    const pathIsPresetSafe = (p) => !/["\x00-\x1f\x7f]/.test(String(p));
    // ===== END SHARED: preset path safety =====

    // ===== SHARED [clean_and_remux, sub_worker]: font attachment test =====
    // -=-=-= isFontAttachment  [clean_and_remux, sub_worker] =-=-=-
    // True when an attachment stream is an embedded font. Identified three ways because older builds report codec_name 'none'/'unknown' for a font:
    // the ttf/otf codec name, a font mimetype, or a font filename extension. Read by clean_and_remux's attachmentKind (orphaned-font removal) and
    // sub_worker's styled-subtitle .mks bundle (the fonts that must travel with an extracted ASS/SSA so its styling survives the round-trip).
    const isFontAttachment = (s) => {
        const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s.tags?.filename || '').trim().toLowerCase();
        const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
        return ['ttf', 'otf'].includes((s.codec_name || '').trim().toLowerCase()) || isFontMime(mime) || FONT_EXTS.includes(ext);
    };
    // ===== END SHARED: font attachment test =====

    // The real library path (for naming sidecars) and its directory - originalLibraryFile is the true on-disk file;
    // fall back to file.file so the plugin still works when a caller (or the test harness) omits originalLibraryFile.
    const libFilePath = otherArguments?.originalLibraryFile?.file || file.file || '';
    const libDir = path.dirname(libFilePath);
    // Strip any " / control char from the source basename: it is interpolated into the quoted "${full}" sidecar path in the extract preset, where a " would
    // close the quote and inject ffmpeg args (lang/disp/ext are separately safe). We create these files, so sanitising is safe; parseSidecar reads the
    // sanitised name back unchanged. The library DIRECTORY it is joined to is NOT sanitised - it has to stay literal - so both write paths CHECK the full
    // joined path with pathIsPresetSafe and skip that sidecar when it fails.
    const videoBase = path.basename(libFilePath).replace(/\.[^.]+$/, '').replace(/["\x00-\x1f\x7f]/g, '');

    // ===== SHARED [audio_clean, clean_and_remux, sub_worker]: language display name =====
    // -=-=-= langDisplayName  [audio_clean, clean_and_remux, sub_worker] =-=-=-
    // Memoised ICU DisplayNames (built once, reused): the recognised English name for an ALREADY-normalised language code, or '' for a non-language/unknown
    // code. A fresh ICU instance per call is wasteful. Each caller normalises the token first - clean_and_remux via shortLang (tag recognition), audio_clean
    // and sub_worker via langKey (free-text language-list validation / sidecar name recognition).
    const langDisplayName = (() => {
        let dn = null;
        return (code) => { try { dn = dn || new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }); return dn.of(code) || ''; } catch (e) { return ''; } };
    })();
    // ===== END SHARED: language display name =====
    // Recognise a filename token as a real language (2/3-letter ISO code or English name) so a server-native sidecar can be anchored on it without mis-reading an arbitrary token
    // as a language. Normalises via the shared langKey, then confirms it names a real language through langDisplayName (which returns '' for a non-language/unrecognised code).
    const isKnownLang = (token) => { const k = langKey(token); if (!k) return false; return !!langDisplayName(k); };

    // ===== SHARED [clean_and_remux, sub_worker]: iso639-1 to iso639-2 map =====
    // -=-=-= ISO639_1_TO_2  [clean_and_remux, sub_worker] =-=-=-
    // ISO 639-1 (2-letter) -> ISO 639-2/T (terminologic 3-letter), complete for every current 639-1 code; each row verified to name the same language via ICU. Both writers map
    // to /T for an mp4 target (its mdhd stores only a 3-letter code): clean_and_remux via toCanonicalTag/method_tag_language, sub_worker via to6392T on subtitle import.
    const ISO639_1_TO_2 = {
        aa:'aar',ab:'abk',ae:'ave',af:'afr',ak:'aka',am:'amh',an:'arg',ar:'ara',as:'asm',av:'ava',ay:'aym',az:'aze',ba:'bak',be:'bel',bg:'bul',
        bh:'bih',bi:'bis',bm:'bam',bn:'ben',bo:'bod',br:'bre',bs:'bos',ca:'cat',ce:'che',ch:'cha',co:'cos',cr:'cre',cs:'ces',cu:'chu',cv:'chv',
        cy:'cym',da:'dan',de:'deu',dv:'div',dz:'dzo',ee:'ewe',el:'ell',en:'eng',eo:'epo',es:'spa',et:'est',eu:'eus',fa:'fas',ff:'ful',fi:'fin',
        fj:'fij',fo:'fao',fr:'fra',fy:'fry',ga:'gle',gd:'gla',gl:'glg',gn:'grn',gu:'guj',gv:'glv',ha:'hau',he:'heb',hi:'hin',ho:'hmo',hr:'hrv',
        ht:'hat',hu:'hun',hy:'hye',hz:'her',ia:'ina',id:'ind',ie:'ile',ig:'ibo',ii:'iii',ik:'ipk',io:'ido',is:'isl',it:'ita',iu:'iku',ja:'jpn',
        jv:'jav',ka:'kat',kg:'kon',ki:'kik',kj:'kua',kk:'kaz',kl:'kal',km:'khm',kn:'kan',ko:'kor',kr:'kau',ks:'kas',ku:'kur',kv:'kom',kw:'cor',
        ky:'kir',la:'lat',lb:'ltz',lg:'lug',li:'lim',ln:'lin',lo:'lao',lt:'lit',lu:'lub',lv:'lav',mg:'mlg',mh:'mah',mi:'mri',mk:'mkd',ml:'mal',
        mn:'mon',mr:'mar',ms:'msa',mt:'mlt',my:'mya',na:'nau',nb:'nob',nd:'nde',ne:'nep',ng:'ndo',nl:'nld',nn:'nno',no:'nor',nr:'nbl',nv:'nav',
        ny:'nya',oc:'oci',oj:'oji',om:'orm',or:'ori',os:'oss',pa:'pan',pi:'pli',pl:'pol',ps:'pus',pt:'por',qu:'que',rm:'roh',rn:'run',ro:'ron',
        ru:'rus',rw:'kin',sa:'san',sc:'srd',sd:'snd',se:'sme',sg:'sag',si:'sin',sk:'slk',sl:'slv',sm:'smo',sn:'sna',so:'som',sq:'sqi',sr:'srp',
        ss:'ssw',st:'sot',su:'sun',sv:'swe',sw:'swa',ta:'tam',te:'tel',tg:'tgk',th:'tha',ti:'tir',tk:'tuk',tl:'tgl',tn:'tsn',to:'ton',tr:'tur',
        ts:'tso',tt:'tat',tw:'twi',ty:'tah',ug:'uig',uk:'ukr',ur:'urd',uz:'uzb',ve:'ven',vi:'vie',vo:'vol',wa:'wln',wo:'wol',xh:'xho',yi:'yid',
        yo:'yor',za:'zha',zh:'zho',zu:'zul',
    };
    // ===== END SHARED: iso639-1 to iso639-2 map =====
    // Normalise a sidecar language token to a lowercase 3-letter ISO 639-2/T code for an mp4-family import target (mdhd silently drops 2-letter/spelled codes). langKey folds
    // spelled names and 639-2/B onto the 2-letter key, which ISO639_1_TO_2 maps to /T; an already-3-letter code (eng, fil, und) or an unmappable token is left as-is. Mirrors
    // clean_and_remux's toCanonicalTag three(false); mkv keeps the raw token where it is already a code (see normSidecarLang).
    const to6392T = (lang) => { const key = langKey(lang); if (!key || key.length !== 2) return lang; return ISO639_1_TO_2[key] || lang; };
    // Plex/Jellyfin/Emby all accept a spelled-out language NAME in a sidecar name (Movie.English.srt), which isKnownLang recognises - but the name itself is not a valid
    // container language tag, so writing it through would stamp "language=English" into the mkv. Fold any non-code token to its 3-letter code; a token already shaped like
    // a code is passed through untouched so a region tag (pt-BR) survives, which is the whole point of keeping the raw token on the mkv path.
    const LANG_CODE_SHAPE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
    const normSidecarLang = (lang) => (LANG_CODE_SHAPE.test(String(lang)) ? lang : to6392T(lang));

    // sidecarBasename <-> parseSidecar are exact inverses. Name = <videoBase>.s<index>[.<encTitle>].<lang>[.<disp...>].<ext>. parseSidecar ALSO
    // accepts a server-native name with no s<index> (e.g. <videoBase>.en.forced.srt), anchored on a recognized <lang> token. A styled-subtitle BUNDLE
    // uses the same name with the .mks extension and a leading dot, so media servers skip it (it is an archive, not a subtitle to offer the viewer).
    // The name stays the authority on language/title/disposition for a bundle too - the .mks also carries them internally, but import re-applies the
    // filename's values, so renaming a bundle retunes it exactly like renaming a loose sidecar.
    const sidecarBasename = (s, bundle) => {
        // lang is the only metadata-derived filename component read raw (title is percent-encoded via encodeTitle, disp/ext are fixed enums), so restrict
        // it to the language-code charset: a crafted container tag must not inject path separators/.. (traversal outside libDir) or a " that breaks out of
        // the quoted "${full}" in the extract preset. parseSidecar round-trips unchanged - valid codes (en/eng/pt-br) are already within [a-z0-9-].
        const langRaw = (resolveLang(s) || 'und').replace(/[^a-z0-9-]/g, '') || 'und';
        // A tag that sanitises to a disposition-token word (a crafted tags.language of "forced"/"sdh"/etc.) would be consumed as a trailing disposition by
        // parseSidecar's right-to-left disp strip, nulling or corrupting the reimport - collapse any such collision to 'und' so the fixed language slot can
        // never be shaped like a disposition token.
        const lang = DISP_TOKENS.has(langRaw) ? 'und' : langRaw;
        const disp = dispTokensOf(s);
        const ext = bundle ? BUNDLE_EXT : TEXT_SUB[String(s.codec_name).toLowerCase()].ext;
        const dot = bundle ? '.' : '';
        const mark = bundle ? `.${BUNDLE_TOKEN}` : '';
        const rawTitle = s.tags?.title || '';
        const fixed = `${dot}${videoBase}.s${s.index}.${lang}${disp.length ? `.${disp.join('.')}` : ''}${mark}.${ext}`;
        const encTitle = rawTitle ? encodeTitleCapped(rawTitle, Buffer.byteLength(fixed, 'utf8')) : '';
        return `${dot}${videoBase}.s${s.index}${encTitle ? `.${encTitle}` : ''}.${lang}${disp.length ? `.${disp.join('.')}` : ''}${mark}.${ext}`;
    };
    const parseSidecar = (name) => {
        const extMatch = name.match(/\.([A-Za-z0-9]+)$/);
        if (!extMatch) return null;
        const ext = extMatch[1].toLowerCase();
        const bundle = ext === BUNDLE_EXT;
        if (!bundle && !TEXT_EXTS.includes(ext)) return null;
        // A bundle is written only by us, always dot-prefixed and always with the s<index> anchor (required below), so an unrelated .mks dropped
        // beside the video is left alone rather than muxed in blind. The dot is stripped before the videoBase match so the rest parses identically.
        if (bundle && !name.startsWith('.')) return null;
        const bare = bundle ? name.slice(1) : name;
        if (!bare.startsWith(`${videoBase}.`)) return null;
        const mid = bare.slice(videoBase.length + 1, bare.length - extMatch[0].length);
        const toks = mid.split('.');
        if (!toks.length) return null;
        // Require (and consume) the bundle marker before anything else reads the trailing tokens, so a clean_and_remux image-subtitle export sharing the
        // .mks extension and the same name shape is rejected here rather than re-imported as a styled bundle. See BUNDLE_TOKEN.
        if (bundle) { if (toks[toks.length - 1] !== BUNDLE_TOKEN) return null; toks.pop(); }
        // Our own sidecars lead with an s<index> order marker; a fresh server-native sidecar (Movie.en.forced.srt) has none. Consume the marker if
        // present (index only keeps our names unique); otherwise index is null and the language token below MUST be a recognized language, so an
        // unrelated .srt (Movie.backup.srt) is not mis-read as lang="backup" and imported as junk.
        const ours = /^s\d+$/.test(toks[0]);
        if (bundle && !ours) return null;
        const index = ours ? parseInt(toks.shift().slice(1), 10) : null;
        // Trailing dispositions, right-to-left. A DISP_AMBIGUOUS_LANG token only counts as a disposition when the token it would expose is itself a real
        // language, so Movie.en.hi.srt reads as English+SDH while Movie.hi.srt - and our own Movie.s3.Title.hi.srt - keeps Hindi as its language.
        const rawDisp = [];
        while (toks.length && DISP_TOKENS.has(toks[toks.length - 1])) {
            if (DISP_AMBIGUOUS_LANG.has(toks[toks.length - 1]) && !isKnownLang(toks[toks.length - 2] || '')) break;
            rawDisp.unshift(toks.pop());
        }
        const dispTokens = [...new Set(rawDisp.filter((t) => !DISP_IGNORE.has(t)).map((t) => DISP_ALIAS[t] || t))];   // drop ignored (default), normalise aliases (cc/hi->sdh, foreign->forced), dedupe
        if (!toks.length) return null;
        let lang = toks.pop();                                            // language is the next-from-right token
        if (!lang) return null;
        // Emby distinguishes same-language extras by appending a parenthesised description to the language token (Home Alone.English(Commentary).srt) rather
        // than by a flag. Split it so the language is still recognised and the description becomes the track title - only when the bare prefix really is a
        // language, so an ordinary bracketed token is still rejected below. Our own names can't reach here: sidecarBasename restricts lang to [a-z0-9-].
        let parenTitle = '';
        const parenMatch = !isKnownLang(lang) && lang.match(/^([^()]+)\(([^()]+)\)$/);
        if (parenMatch && isKnownLang(parenMatch[1])) { [, lang, parenTitle] = parenMatch; }
        if (!ours && !isKnownLang(lang)) return null;                     // server-native has no s<index> anchor, so its language token must be real
        // A real server-native sidecar names the FULL video basename then lang[.disp] - it never carries a title token. So for a non-ours name any residual token is actually the tail
        // of a LONGER sibling video's basename (Avatar.Extended.en.srt vs Avatar.mkv): reject it, or the shorter video would mux the sibling's subtitle. Our s<index> names keep their title.
        if (!ours && toks.length) return null;
        if (toks.length > 1) return null;                                // 0 or 1 residual token = the encoded title (our own s<index> sidecars only)
        const title = toks.length ? decodeTitle(toks[0]) : parenTitle;
        return { name, bundle, index, lang, title, ext, dispTokens, disp: [...new Set(dispTokens.map(dispFfOf).filter(Boolean))] };
    };

    const parseLangFilter = (v) => { const l = String(v || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean); return l.length ? new Set(l.map(langKey)) : null; };   // keys, so en/eng/English match
    // Synthetic stream so a not-yet-muxed sidecar renders through summariseStream in the expected-results line.
    const sidecarToStream = (f) => {
        const codec = (f.bundle || f.ext === 'ass') ? 'ass' : (f.ext === 'srt' ? 'subrip' : 'webvtt');   // a bundle always carries a styled subtitle
        const disposition = {}; for (const d of DISPOSITIONS) if (f.dispTokens.includes(d.token)) disposition[d.ff] = 1;
        return { codec_type: 'subtitle', codec_name: codec, index: -1, tags: { language: f.lang, title: f.title }, disposition };
    };

    // ============= guards + input validation (before the try, per the suite's failFile convention) =============
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams)) failFile('No ffProbe stream data available, cannot process this file');
    const mode = String(inputs.mode);
    if (mode !== 'extract' && mode !== 'import') failFile(`[mode=${mode}] invalid value, check your settings`);
    // method_deduplicate normalizer: lower-cases, and silently folds the accepted legacy value 'enabled_delete' -> 'enabled'. Deletion is
    // remove_sidecar_after_import's decision alone, and the marker already lists every member of a dedup group, so the legacy value never added a
    // capability of its own; it is accepted but NOT offered - it stays out of the dropdown's options list. The fold is required, not cosmetic: the
    // check below FAILS the file on an unknown value, so a value already persisted in a Tdarr library config must keep validating. The failFile
    // message shows the RAW inputs value.
    const normDedupe = (v) => { const s = String(v || 'enabled').toLowerCase().trim(); return s === 'enabled_delete' ? 'enabled' : s; };
    const dedupeMode = normDedupe(inputs.method_deduplicate);
    if (!['disabled', 'enabled'].includes(dedupeMode)) failFile(`[method_deduplicate=${inputs.method_deduplicate}] invalid value, check your settings`);
    if (file.fileMedium && file.fileMedium !== 'video') { response.infoLog += '☑Not a video file - skipping\n'; return response; }

    const streams = file.ffProbeData.streams;
    const langFilter = parseLangFilter(inputs.only_languages);
    const skipCommentary = String(inputs.skip_commentary) === 'true';
    const removeAfterExtract = String(inputs.remove_after_extract) === 'true';
    const removeSidecarAfterImport = String(inputs.remove_sidecar_after_import) === 'true';
    const dstContainer = String(file.container || '').toLowerCase().trim();
    const isMp4 = isMp4Family(dstContainer);   // shared checker; cached once for this container
    // Preserve Dolby Vision's dvcC/dvvC boxes on either -c copy remux below (see dvStrictMp4Arg) - a plain copy of a DV HEVC/AV1 stream drops them,
    // demoting DV to plain HEVC/AV1.
    const dvStrictArg = dvStrictMp4Arg(dstContainer, streams);
    // Finalize a built output-side arg string into response.preset: append the DV strict flag, then (mp4 only) -movflags use_metadata_tags so a -c copy keeps
    // sibling plugins' global awk_* tags (awk_video/awk_recovered), then the universal output options. Shared by the extract and import branches so their tails can't drift.
    const finishPreset = (out) => {
        let full = out + dvStrictArg;
        if (isMp4) full += ' -movflags use_metadata_tags';
        full += globalOutputOpt;
        response.preset = `,${full}`;
        response.processFile = true;
    };

    try {
        response.infoLog += `☐Input streams: ${streams.map((s) => summariseStream(enrichStream(s))).join('')}\n`;

        if (mode === 'extract') {
            // ============= EXTRACT: embedded text subs -> sidecars (+ optional removal) =============
            const eligible = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle' && isTextSub(s.codec_name)
                && !(skipCommentary && isCommentary(s)) && !(langFilter && !langFilter.has(langKey(resolveLang(s) || 'und'))));
            if (!eligible.length) { response.infoLog += '☑No text subtitles to extract\n'; return response; }

            // A styled subtitle is exported as a .mks BUNDLE carrying the subtitle plus every font attachment, because those fonts exist nowhere else
            // (see BUNDLE_EXT). Loose text sidecars stay the default for everything else: a plain srt, and an ass/ssa in a file with no fonts, have
            // nothing to carry and are far more useful as editable text on disk.
            const fontIndices = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'attachment' && isFontAttachment(s)).map((s) => s.index);
            const fontMaps = fontIndices.map((i) => ` -map 0:${i}`).join('');

            let sidecarOut = ''; const removeIdx = []; let wrote = 0; let skipped = 0; let unsafe = 0; let bundled = 0;
            for (const s of eligible) {
                const { enc } = TEXT_SUB[String(s.codec_name).toLowerCase()];
                const bundle = fontIndices.length > 0 && isStyledSub(s.codec_name);
                const name = sidecarBasename(s, bundle);
                const full = path.join(libDir, name);
                // The path goes into the quoted "${full}" token of the extract preset, so it has to survive Tdarr's quote-aware tokenizer
                // (pathIsPresetSafe). Only the library directory can fail that - the name we build is already sanitised - and a directory has to stay
                // literal, so the extract is skipped instead. The stream is NOT pushed to removeIdx either: a refused extract must never strip the
                // embedded track, which would then be the only remaining copy.
                if (!pathIsPresetSafe(full)) {
                    unsafe += 1;
                    response.infoLog += `☒${streamTag(s.index)} Library directory contains a quote or control character - cannot write ${name} safely, keeping the embedded subtitle\n`;
                    continue;
                }
                // An existing sidecar is preserved (never overwrite a user's on-disk edits) - but only if it has content. A 0-byte sidecar is the fingerprint of a
                // prior extract ffmpeg aborted mid-write; trusting it and then stripping the embedded source would lose the subtitle, so re-extract it instead.
                const existsNonEmpty = fs.existsSync(full) && (() => { try { return fs.statSync(full).size > 0; } catch { return false; } })();
                if (existsNonEmpty) { skipped += 1; response.infoLog += `☑${streamTag(s.index)} Sidecar already exists, not overwriting: ${name}\n`; }
                // A bundle is muxed with -c copy so the subtitle and every font stay byte-exact; matroska auto-detects .mkv but NOT .mks, so -f is required.
                else if (bundle) {
                    sidecarOut += ` -map 0:${s.index}${fontMaps} -c copy -f matroska "${full}"`; wrote += 1;
                    response.infoLog += `☐${streamTag(s.index)} Extract -> ${name} (styled subtitle bundled with ${fontIndices.length} font${fontIndices.length === 1 ? '' : 's'})\n`;
                }
                else { sidecarOut += ` -map 0:${s.index} -c:s ${enc} "${full}"`; wrote += 1; response.infoLog += `☐${streamTag(s.index)} Extract -> ${name}\n`; }
                if (bundle) bundled += 1;
                if (removeAfterExtract) removeIdx.push(s.index);
            }
            // The fonts leave with the styled subtitles that need them, but only once a bundle actually holds them (bundled) and no styled subtitle is
            // left behind to use them - one kept by only_languages, or every track kept by remove_after_extract=false. Removing them here just makes the
            // container consistent a pass earlier: with no ASS/SSA left they are orphaned, and clean_and_remux would remove them anyway.
            if (removeAfterExtract && bundled
                && !streams.some((s) => (s.codec_type || '').toLowerCase() === 'subtitle' && isStyledSub(s.codec_name) && !removeIdx.includes(s.index))) {
                for (const idx of fontIndices) removeIdx.push(idx);
                response.infoLog += `☐[remove_after_extract=true] Removing ${fontIndices.length} font attachment${fontIndices.length === 1 ? '' : 's'} - now archived in the styled-subtitle bundle\n`;
            }
            if (titleTruncated) response.infoLog += '☒A subtitle title was too long for the filename and was truncated\n';
            if (!wrote && !removeIdx.length) { response.infoLog += unsafe ? '☒No subtitle could be extracted safely\n' : '☑All eligible subtitles already extracted\n'; return response; }

            let out = `${sidecarOut} -map 0`;
            for (const idx of removeIdx) out += ` -map -0:${idx}`;
            out += ' -c copy';
            finishPreset(out);
            const survivors = streams.filter((s) => !removeIdx.includes(s.index));
            response.infoLog += `☑Expected results: ${survivors.map((s) => summariseStream(enrichStream(s))).join('')}\n`;
            return response;
        }

        // ============= IMPORT: sidecars -> embedded (+ safe deletion) =============
        // The global marker VALUE lists the basenames muxed in the prior pass, so pass 2 deletes exactly what pass 1
        // embedded (never a pre-existing collision) and never re-adds them - robust even where a container drops
        // per-stream title/default (mp4). Tdarr only re-runs after a SUCCESSFUL mux, so a listed sidecar is safely in.
        const importedSet = new Set(decodeMarkerList(getTagCI(file.ffProbeData.format?.tags || {}, 'awk_sub_worker')));

        let entries;
        try { entries = fs.readdirSync(libDir); } catch (e) { failFile(`Cannot read the library directory to find sidecars: ${e && e.message ? e.message : e}`); }
        // readdir order is filesystem-dependent (ext4 hash order vs APFS), and it propagates into the dedup groups, the extra -i inputs, the outIdx
        // assignment and so the appended subtitle order - the same file would embed its sidecars in a different order per node. Sort by name to fix that.
        entries.sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
        const found = entries.map(parseSidecar).filter(Boolean)
            .filter((f) => !(langFilter && !langFilter.has(langKey(f.lang))))
            // Match extract's isCommentary (flag OR title keyword): a sidecar whose commentary role sits only in its decoded title (no disposition token) must
            // also be skipped, else skip_commentary would exclude it on extract but re-mux it on import (a server-native/manual sidecar or a title-only source).
            .filter((f) => !(skipCommentary && (f.dispTokens.includes('commentary') || matchesKeyword(String(f.title || '').toLowerCase(), dispositionTypes.comment.keywords))))
            // An mp4-family target carries no font attachments at all, so importing a styled-subtitle bundle there would embed the subtitle and strand
            // its fonts - and remove_sidecar_after_import would then delete the only copy that has them. Leave the bundle untouched on disk instead
            // (dropping it from `found` also keeps it out of the deletion pass below); remux the file to mkv and run import again to restore it.
            .filter((f) => {
                if (!f.bundle || !isMp4) return true;
                response.infoLog += `☒Cannot import ${f.name} - an ${dstContainer} target carries no font attachments, keeping the styled-subtitle bundle on disk\n`;
                return false;
            });
        if (!found.length) { response.infoLog += '☑No subtitle sidecars found to import\n'; return response; }

        // Sidecars are removed only after their content is confirmed embedded, and remove_sidecar_after_import is the ONLY control over that: it deletes every
        // file we muxed this pass, dedup group members included (the marker lists all of them), so no dedup setting has a say in deletion.
        const deleteConfirmed = removeSidecarAfterImport;
        const delReason = 'remove_sidecar_after_import=true';   // the single toggle behind every delete line below
        // Confirm each marker-listed sidecar against the CURRENT file's streams before unlinking it: only delete when an embedded subtitle stream matches its language +
        // title (the identity our own import writes). On an mp4/mov target the container DROPS per-stream subtitle titles on the -c copy mux, so a re-probe can't see the
        // title - there we confirm on LANGUAGE alone (else a titled sidecar we DID embed never matches its now-title-less stream, so its cleanup silently never runs). A
        // forged awk_sub_worker marker - a file that arrived already tagged but was never muxed by us - can otherwise make remove_sidecar_after_import
        // unlink on-disk sidecars never embedded; the marker VALUE (basenames we listed this/last pass) still scopes deletion, so the forged-marker
        // guard holds on mp4 too.
        // A false negative merely keeps the sidecar (a later pass, or the user, removes it) - it never re-adds or loses subtitle content - so this fails safe.
        // A bundle additionally has to see a font attachment in the file before it can be deleted: its whole reason to exist is carrying fonts, so
        // confirming only the subtitle would let the archive go while the styling stayed broken.
        const embeddedSubs = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle');
        const hasFontAttachment = streams.some((s) => (s.codec_type || '').toLowerCase() === 'attachment' && isFontAttachment(s));
        const markerConfirmsEmbedded = (f) => (!f.bundle || hasFontAttachment) && embeddedSubs.some((s) =>
            langKey(resolveLang(s) || 'und') === langKey(f.lang || 'und') && (isMp4 || (s.tags?.title || '') === (f.title || '')));
        let deleted = 0;
        const deletedNames = new Set();   // sidecars actually unlinked this pass - the marker below must keep listing every one that SURVIVED
        if (deleteConfirmed) {
            for (const f of found.filter((x) => importedSet.has(x.name))) {
                if (!markerConfirmsEmbedded(f)) {
                    response.infoLog += `☒[${delReason}] Marker lists ${f.name} but no embedded subtitle matches its language/title - not deleting (unverified)\n`;
                    continue;
                }
                try { fs.unlinkSync(path.join(libDir, f.name)); deleted += 1; deletedNames.add(f.name); response.infoLog += `☑[${delReason}] Deleted sidecar (embedded): ${f.name}\n`; }
                catch (e) { response.infoLog += `☒[${delReason}] Could not delete sidecar ${f.name}: ${e && e.message ? e.message : e}\n`; }
            }
        }

        // Import is NON-DESTRUCTIVE: every recognized sidecar not already handled by our own prior pass (marker) is muxed in. We do NOT suppress a
        // sidecar just because an embedded sub shares its lang|title|disposition - metadata can't prove same content, and dropping a distinct track is
        // data loss, whereas a redundant duplicate is not. Genuine duplication is collapsed by CONTENT instead (method_deduplicate, below).
        const existingSubCount = embeddedSubs.length;   // same subtitle-stream filter already computed above (streams is unchanged since)
        // The import muxes each sidecar as -i "${libDir}/${name}"; a " or control char in that real on-disk path would close the quote and inject
        // ffmpeg args (see pathIsPresetSafe), and unlike a name we generate it must match the file byte-for-byte, so it can't be sanitised - skip it
        // instead (a server-native/user file we can't safely reference), never break out.
        const candidates = found.filter((f) => !importedSet.has(f.name)).filter((f) => {
            if (pathIsPresetSafe(path.join(libDir, f.name))) return true;
            response.infoLog += `☒Skipping sidecar with an unsafe filename (contains a quote or control character), cannot import safely: ${f.name}\n`;
            return false;
        });

        // Group candidates by byte-identical file content (disabled => every file is its own group). readFileSync can't fail for a file readdir just
        // listed, but guard anyway: an unreadable file gets a unique key so it is imported on its own, never silently dropped or merged.
        const contentKey = (f) => { try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(libDir, f.name))).digest('hex'); } catch (e) { return `unreadable:${f.name}`; } };
        const groups = [];
        if (dedupeMode === 'disabled') { for (const f of candidates) groups.push([f]); }
        else { const byHash = new Map(); for (const f of candidates) { const h = contentKey(f); let g = byHash.get(h); if (!g) { g = []; byHash.set(h, g); groups.push(g); } g.push(f); } }

        // One import per group: union the members' disposition tokens (byte-identical plain + SDH -> SDH), and take the first non-"und" language and
        // first non-empty title. The physical file muxed is the member with the most-specific dispositions (deterministic tie-break by name); its
        // metadata is overridden by the merged values, so which identical copy we pick doesn't matter.
        const merged = groups.map((g) => {
            const dispTokens = [...new Set(g.flatMap((m) => m.dispTokens))];
            const lang = (g.find((m) => m.lang && m.lang !== 'und') || g[0]).lang;
            const title = g.map((m) => m.title).find(Boolean) || '';
            const src = g.slice().sort((a, b) => b.dispTokens.length - a.dispTokens.length || (a.name < b.name ? -1 : 1))[0];
            return { members: g, name: src.name, ext: src.ext, bundle: src.bundle, lang, title, dispTokens, disp: [...new Set(dispTokens.map(dispFfOf).filter(Boolean))] };
        });

        if (merged.length) {
            // Mux one track per group. Extra -i inputs go on the OUTPUT side (main stays input 0). The marker lists EVERY consumed file (all group
            // members) so a re-run never re-imports them and the confirm pass can delete the whole deduplicated set; reQueue only when a delete is due.
            let inputSide = ''; let extraMaps = ''; let meta = ''; let fontsRestored = false;
            merged.forEach((f, k) => {
                const outIdx = existingSubCount + k;
                // A bundle is a container, not raw text, so it takes no -sub_charenc and its subtitle is selected by type (:s:0) rather than by index.
                // Its fonts come back only when the file has none of its own - every bundle carries the full font set, so one restore is always complete
                // and a second bundle (or a re-import into a file that kept its fonts) can never duplicate them.
                const restoreFonts = f.bundle && !hasFontAttachment && !fontsRestored;
                if (f.bundle) {
                    inputSide += ` -i "${path.join(libDir, f.name)}"`;
                    extraMaps += ` -map ${k + 1}:s:0`;
                    if (restoreFonts) { extraMaps += ` -map ${k + 1}:t?`; fontsRestored = true; }
                } else {
                    inputSide += ` -sub_charenc UTF-8 -i "${path.join(libDir, f.name)}"`;
                    extraMaps += ` -map ${k + 1}:0`;
                }
                meta += ` -metadata:s:s:${outIdx} "language=${escMeta(isMp4 ? to6392T(f.lang) : normSidecarLang(f.lang))}"`;
                if (f.title) meta += ` -metadata:s:s:${outIdx} "title=${escMeta(f.title)}"`;
                // The filename stays the authority on disposition. A loose text sidecar arrives carrying none, so "no tokens" needs no argument at all;
                // a bundle's subtitle brings its own flags through the copy, so "no tokens" has to be written as an explicit 0 or a token the user
                // removed by renaming would silently come back.
                if (f.disp.length) meta += ` -disposition:s:${outIdx} ${f.disp.join('+')}`;
                else if (f.bundle) meta += ` -disposition:s:${outIdx} 0`;
                if (isMp4) meta += ` -c:s:${outIdx} mov_text`;
                if (f.members.length > 1) response.infoLog += `☑[method_deduplicate=${dedupeMode}] Deduplicated ${f.members.length} byte-identical sidecars -> ${f.name} (${f.lang}${f.dispTokens.length ? ` ${f.dispTokens.join('+')}` : ''})\n`;
                response.infoLog += `☐Import ${f.name} -> subtitle ${outIdx} (${f.lang}${f.dispTokens.length ? ` ${f.dispTokens.join('+')}` : ''})${restoreFonts ? ' and its bundled font attachments' : ''}\n`;
            });
            const consumed = merged.flatMap((f) => f.members.map((m) => m.name));
            // Carry prior-pass marks forward for every already-embedded sidecar STILL ON DISK, so it stays in the skip set across incremental passes
            // (otherwise the next pass re-imports it as a duplicate track). ONE rule for both modes: delete mode is not "everything was unlinked" - the loop
            // above skips (and ☒-logs) any sidecar markerConfirmsEmbedded rejects, and an unlink can fail, so only names actually unlinked leave the marker.
            const priorStillPresent = found.filter((f) => importedSet.has(f.name) && !deletedNames.has(f.name)).map((f) => f.name);
            const markList = [...new Set([...consumed, ...priorStillPresent])];
            let out = `${inputSide} -map 0${extraMaps} -c copy${meta} -metadata "awk_sub_worker=${encodeMarkerList(markList)}"`;
            finishPreset(out);
            response.reQueueAfter = deleteConfirmed;   // re-run only to delete the now-embedded sidecars
            const expected = streams.concat(merged.map(sidecarToStream));
            response.infoLog += `☑Expected results: ${expected.map((s) => summariseStream(enrichStream(s))).join('')}\n`;
            return response;
        }

        if (!deleted) response.infoLog += importedSet.size ? '☑Sidecars already imported; nothing to do\n' : '☑All matching subtitles already present; nothing to import\n';
        return response;
    } catch (err) {
        failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
