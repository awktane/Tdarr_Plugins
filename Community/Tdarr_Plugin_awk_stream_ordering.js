/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio -> Subtitles -> Attachments -> Data. Audio sorts by language, then main/descriptive/commentary role, then preferred codec, channels and quality - first_audio can promote the original-language, default or descriptive track above language for foreign films. Subtitles sort forced-first, then by language and role - first_subtitle can promote the default, SDH or descriptive track. The first audio track is marked the sole default. Can also strip junk metadata tags (remove_junk_tags: encoder/provenance, or the fuller descriptive set) and front-load the mp4 moov atom for instant remote playback (method_mp4_faststart) - both ride the reorder remux, so no extra pass.\n`,
    Version: '3.2.5',
    Tags: 'pre-processing,ffmpeg,stream-order',
    Inputs: [
        {
            name: 'first_audio',
            type: 'string',
            defaultValue: 'language',
            inputUI: {
                type: 'dropdown',
                options: ['language', 'original', 'default', 'descriptive'],
            },
            tooltip: `Which audio track sorts first (this key sits above every other audio key).
                \\nlanguage (default): normal ordering - order_language decides, and the first sorted track becomes the sole default.
                \\noriginal: promote the original-language track (ffmpeg 'original' disposition, or an 'original' title) above language, so a foreign film keeps its original audio first (and default) instead of a dub. Falls back to language ordering when no track is flagged original.
                \\ndefault: promote the track already flagged default (ffmpeg 'default' disposition) above language, so the source's chosen default audio stays first. If several tracks are flagged default (e.g. a source track and a downmix that inherited the flag), the highest-priority one by the normal ordering leads and becomes the sole default. Falls back to language ordering when no track is flagged default.
                \\ndescriptive: promote the descriptive (audio-description) track above language. Falls back to language ordering when no descriptive track is present. Note: the first sorted track becomes the sole default, so this makes the description the default audio.`,
        },
        {
            name: 'first_subtitle',
            type: 'string',
            defaultValue: 'normal',
            inputUI: {
                type: 'dropdown',
                options: ['normal', 'default', 'sdh', 'descriptive'],
            },
            tooltip: `Which subtitle role is promoted to the top of its language (forced subtitles and order_language priority still lead).
                \\nnormal (default): standard role order within each language - normal, then songs/lyrics, sdh, descriptive, commentary.
                \\ndefault: lift the track flagged default (ffmpeg 'default' disposition) to the top of its language.
                \\nsdh: lift SDH tracks (Subtitles for the Deaf and Hard-of-Hearing) to the top of their language.
                \\ndescriptive: lift descriptive tracks to the top of their language.`,
        },
        {
            name: 'order_language',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Comma separated language priority list (e.g. eng,jpn,und). Listed languages sort first; blank (the default) skips language ordering.
                 \\nLanguages not in the list are not reordered by language - they sort by the other keys (role/codec/channel/quality) and keep their original order.
                 \\nOne form is enough - en, eng, or English all match the same language (including region variants like en-US), so you don't need to list every variant.
                 \\nExample: (order_channel descending and order_language eng,jpn)\\n
                 A file containing ger 2.0,fre 2.0,eng 2.0,jpn 2.0,eng 5.1,jpn 5.1 would be reordered eng 5.1,eng 2.0,jpn 5.1,jpn 2.0,ger 2.0,fre 2.0`,
        },
        {
            name: 'order_codec',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Comma separated list of preferred audio codecs (e.g. eac3,aac). Blank to disable.
                \\nMatching streams are grouped above non-matching ones within their language; each group is still ordered by order_channel then order_quality. List order is a membership set, not a ranking. Sits below role, above channels/quality.
                \\nFamily-prefix match on the canonical codec: dts matches DTS-HD MA/HR/Express, eac3 includes Atmos. Use dtsma/dtshr/dtsexpress/eac3atmos for a specific variant.`,
        },
        {
            name: 'order_channel',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'descending <=6', 'descending <=8', 'ascending', 'disabled'],
            },
            tooltip: `Audio channel ordering preference - streams are ordered by channel then rating of codec/bitrate. Generally descending is recommended.
                \\nExample:\\n
                    descending: 5.1,2.0
                \\nExample:\\n
                    ascending: 2.0,5.1
                \\ndescending <=6 / <=8 cap the surround: any track above the cap (<=6 = up to 5.1, <=8 = up to 7.1) is demoted to the END, so a client whose
                ceiling is that layout auto-picks the best track it can play (e.g. the 5.1) rather than a 22.2/7.1 it must down-convert. The demoted tail stays in
                the requested descending order (largest first) - the cap only shifts which serveable track leads, it never re-sorts the tail. If order_quality also
                caps, a track over EITHER cap is demoted. The cap only applies to descending - ascending already puts the smallest first.
                \\nSet to disabled to skip channel ordering entirely. If both order_channel and order_quality are disabled, audio is not reordered by channels or quality (language/role/order_codec still apply).`
        },
        {
            name: 'order_quality',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'descending <=1024k', 'ascending', 'disabled'],
            },
            tooltip: `Audio quality ordering preference - orders streams by their computed quality score (codec + bitrate vs transparent). Generally descending is recommended.
                \\nExample:\\n
                    descending: 640k,128k
                \\nExample:\\n
                    ascending: 128k,640k
                \\ndescending <=1024k caps by bitrate: tracks above 1024k (lossless-scale TrueHD/DTS-HD MA, including a lossless track whose bitrate is unknown) are
                demoted to the END so the client's auto-pick leads with a manageable track it can serve without a heavy transcode, not the huge one. The demoted tail
                stays in the requested descending order; ordering within each group is by the quality score. If order_channel also caps, a track over EITHER cap is
                demoted. The cap only applies to descending (ascending already puts the smallest first).
                \\nSet to disabled to skip quality ordering entirely. If both order_channel and order_quality are disabled, audio is not reordered by channels or quality (language/role/order_codec still apply).`
        },
        {
            name: 'remove_junk_tags',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'encoder', 'descriptive'],
            },
            tooltip: `Strip junk metadata tags the file carries (both container-global and per-stream), riding this plugin's reorder remux so no extra pass is needed. Only tags actually present are cleared, so files without them are untouched. Runs last, so it also clears the per-stream encoder tag a video/audio re-encode leaves behind - which a first-in-stack plugin could only catch on a later pass.
                \\ndisabled (default): leave all tags.
                \\nencoder: remove only encoder/muxer provenance tags nobody reads - encoded_by, and per-stream encoder (a leftover "Lavc.../HandBrake" tag). Safe on any library.
                \\ndescriptive: also remove descriptive movie/TV metadata and iTunes/app flags - genre, date, description, synopsis, show, network, season/episode, media_type, artist, album, composer, copyright, keywords, compilation, sort-order keys, etc.
                \\nAlways kept: title and comment, stream language tags, per-track bitrate statistics (BPS), the container-level encoder tag (muxer-managed), and creation date.
                \\nNote: a Plex library set to read local media assets DOES read some mp4 descriptive tags (genre/date/description/show/etc.) - use descriptive only if you don't rely on in-file metadata.`,
        },
        {
            name: 'method_mp4_faststart',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled', 'disabled'],
            },
            tooltip: `mp4/mov only: write the moov atom (the index) at the FRONT of the file so players start and seek instantly on progressive download / remote direct-play. mkv is unaffected.
                \\nRuns as this plugin's normal reorder remux when there is reordering to do, and otherwise forces a single lossless -c copy remux to relocate the index when the file isn't already front-loaded (detected without decoding). Already-fronted files are left untouched, so it settles after one pass and never loops.
                \\nenabled (default): front-load the mp4 moov atom. Cost is one extra read/write of the file the first time it's needed.
                \\ndisabled: leave the moov atom wherever the source muxer put it.`,
        },
    ],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    const fs = require('fs');
    // True if the mp4 already has moov before mdat (front-loaded), so method_mp4_faststart needn't remux it. Reads only top-level box headers (a few 16-byte reads,
    // seeking by box size) - no ffmpeg spawn, no full-file read. otherArguments.__awkMoovFront overrides for the harness (which has no real file on disk). Fail-safe: any
    // read/parse anomaly returns true (treat as fronted -> skip) so we never loop on a file we can't inspect.
    const moovBeforeMdat = (filePath, oa) => {
        const inj = oa?.__awkMoovFront;
        if (inj !== undefined) return inj === true;
        let fd;
        try {
            fd = fs.openSync(filePath, 'r');
            const head = Buffer.alloc(16);
            let pos = 0;
            for (let i = 0; i < 100; i++) {
                const n = fs.readSync(fd, head, 0, 16, pos);
                if (n < 8) return true;
                let size = head.readUInt32BE(0);
                const type = head.toString('latin1', 4, 8);
                if (size === 1) size = Number(head.readBigUInt64BE(8));   // 64-bit largesize
                if (type === 'moov') return true;
                if (type === 'mdat') return false;
                if (size < 8) return true;                                // malformed / size-0 (extends to EOF)
                pos += size;
            }
            return true;
        } catch { return true; } finally { if (fd !== undefined) fs.closeSync(fd); }
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        FFmpegMode: true,
        container: `.${file.container}`,
        infoLog: '',
    };

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

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file.
    // Split into labeled sections; each is byte-identical across the plugins named in its header, and a
    // plugin carries only the sections it uses. The section LABEL is the anchor (order is free). Verify any
    // edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all five awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description'],                 tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','hard of hearing','hoh','deaf'], tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced'],                                                tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                                              tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','m&e'],                               tag: null          },
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
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= resolveCodecName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the
    // _x variant when DTS:X is detected) and eac3 into eac3atmos. Used for scoring by audioQuality (audio_clean, stream_ordering)
    // and losslessSource (audio_clean), and by summariseStream (all five) purely for accurate display labeling - a plugin
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
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The mp4/mov container family whose -c copy needs `-movflags use_metadata_tags` to keep sibling plugins' GLOBAL awk_* markers through the remux (dropping one re-triggers
    // work upstream). One source so the four writers can't drift on the set (video_clean's video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: mp4-family container =====

    // ===== SHARED [audio_clean, stream_ordering]: audio codec scoring =====
    // -=-=-= codecInfo  [audio_clean, stream_ordering] =-=-=-
    // Codec quality weights + bitrate thresholds for picking the best track (audioQuality). Three row shapes, each field one job:
    //   lossless: { score }                                    - already perfect; audioQuality returns score directly.
    //   encodable (aac/opus/ac3/eac3): { score, minimum }      - SCORING thresholds come from the CODEC_TARGET_BPS ladder (see scoreThresholds); no
    //       `transparent` here, and `minimum` is kept ONLY as the transcode floor read by resolveBitrate (audio_clean).
    //   source-lossy (everything else): { score, transparent } - `transparent` is the 2-CHANNEL baseline; scoreThresholds scales it by (ch/2)^0.65 and
    //       derives minimum as MIN_RATIO of transparent. Some formats here aren't ffmpeg-encodable (e.g. ac4).
    // objectAudio: true marks a codec whose stream carries object-audio metadata (Atmos/DTS:X/MPEG-H) that ffmpeg cannot
    // re-encode - read only by audio_clean's guard_object_audio, never by the score/threshold math below.
    const codecInfo = {
        // Lossless
        pcm:         { score: 100, lossless: true },
        s302m:       { score: 100, lossless: true },   // SMPTE 302M PCM (broadcast MPEG-TS) — effectively uncompressed, so guard_lossless must protect it
        flac:        { score: 100, lossless: true },
        alac:        { score: 100, lossless: true },
        wavpack:     { score: 100, lossless: true },
        ape:         { score: 100, lossless: true },
        tak:         { score: 100, lossless: true },
        tta:         { score: 100, lossless: true },
        wmalossless: { score: 100, lossless: true },
        mlp:         { score: 99,  lossless: true },

        // Dolby family
        truehd:      { score: 99,  lossless: true },
        dtsma:       { score: 98,  lossless: true },
        dtsmax:      { score: 98,  lossless: true,       objectAudio: true },
        dtshr:       { score: 94,  transparent: 1470000 },
        dtshrx:      { score: 96,  transparent: 1470000, objectAudio: true },
        dts:         { score: 91,  transparent: 740000 },
        dtsx:        { score: 93,  transparent: 740000,  objectAudio: true },
        eac3atmos:   { score: 92,  transparent: 375000,  objectAudio: true },
        dtsexpress:  { score: 80,  transparent: 188000 },
        dtsexpressx: { score: 82,  transparent: 188000,  objectAudio: true },

        // Modern multichannel codecs
        ac4:         { score: 90,  transparent: 188000 },
        eac3:        { score: 89,  minimum:     192000 },  // encodable -> scores off CODEC_TARGET_BPS; minimum = transcode floor only
        mpegh3d:     { score: 89,  transparent: 250000,  objectAudio: true },

        // Modern general-purpose codecs
        opus:        { score: 89,  minimum:      64000 },  // encodable
        aac:         { score: 87,  minimum:      96000 },  // encodable
        vorbis:      { score: 86,  transparent: 256000 },

        // Legacy but still excellent
        ac3:         { score: 84,  minimum:     192000 },  // encodable
        atrac:       { score: 83,  transparent: 192000 },
        wma:         { score: 82,  transparent: 192000 },
        wmavoice:    { score: 45,  transparent:  24000 },  // low-bitrate SPEECH codec (~4-20 kbps) - scored well below music codecs so a wmavoice track never outranks a real one
        wmapro:      { score: 82,  transparent: 256000 },
        mpc:         { score: 82,  transparent: 220000 },

        // Older codecs
        mp3:         { score: 78,  transparent: 320000 },
        mp2:         { score: 73,  transparent: 256000 },
        adpcm:       { score: 60,  transparent: 256000 },
        cook:        { score: 58,  transparent: 128000 }
    };
    // -=-=-= unknownCodecs  [audio_clean, stream_ordering] =-=-=-
    const unknownCodecs = new Set();

    // -=-=-= CODEC_TARGET_BPS  [audio_clean, stream_ordering] =-=-=-
    // Per-channel target bitrate (bps) for our encodable output codecs (ac3/eac3 cap at 6ch in ffmpeg). Single source for scoreThresholds' transparent
    // point, audioQuality's bitrate-less membership check, and audio_clean's transcode targetTable - so scored transparent and transcode target can't drift.
    const CODEC_TARGET_BPS = {
        aac:  { 1: 128000, 2: 256000, 3: 320000, 4: 384000, 5: 448000, 6: 512000, 7: 576000, 8: 640000 },
        opus: { 1: 128000, 2: 192000, 3: 256000, 4: 320000, 5: 320000, 6: 384000, 7: 448000, 8: 448000 },
        ac3:  { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
        eac3: { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
    };
    // -=-=-= MIN_RATIO / scoreThresholds  [audio_clean, stream_ordering] =-=-=-
    // Channel-count-aware scoring thresholds (bps) for a codec: transparent (0 penalty) and minimum (max penalty). Encodable codecs (aac/opus/ac3/eac3)
    // read the real per-channel CODEC_TARGET_BPS ladder - so scoring-transparent IS the encode target and the two can't drift. Every other codec scales
    // its 2-channel codecInfo.transparent baseline by (ch/2)^0.65. minimum is a uniform MIN_RATIO fraction of transparent for every codec, so no
    // hand-tuned floor can land on top of a standard reduced-rate mode (e.g. half-rate DTS @768k).
    const MIN_RATIO = 0.4;
    const scoreThresholds = (codec, channels) => {
        const family = codec === 'aac_vbr' ? 'aac' : codec;
        const tbl = CODEC_TARGET_BPS[family];
        let transparent;
        if (tbl) {
            const cap = (family === 'ac3' || family === 'eac3') ? 6 : 8;
            transparent = tbl[Math.min(Math.max(1, Number(channels) || 1), cap)] ?? tbl[cap];
        } else {
            transparent = (codecInfo[codec]?.transparent ?? 320000) * Math.pow(Math.max(2, Number(channels) || 2) / 2, 0.65);
        }
        return { minimum: transparent * MIN_RATIO, transparent };
    };
    // -=-=-= audioQuality  [audio_clean, stream_ordering] =-=-=-
    // Scores a stream's quality (codec + bitrate vs transparent bitrate) to identify the "best" track. Declared after response so infoLog is available.
    const audioQuality = (stream) => {
        const codec = resolveCodecName(stream);

        //Check if we can't identify the codec. If we can't then notify once per codec
        if(!(codec in codecInfo) && !unknownCodecs.has(codec)) {
            unknownCodecs.add(codec);
            response.infoLog += `☒${streamTag(stream.index)} Unknown audio codec "${codec}", using generic quality weighting\n`;
        }

        //This is a pretty weak way to score an unknown codec
        const info = codecInfo[codec] ?? { score: 70 };
        const maxPenalty = 18;

        // Lossless codecs are already "perfect"
        if (info.lossless)
            return info.score;

        // No stream-level bitrate reported (freshly-transcoded tracks routinely omit it). A codec we encode is assumed to sit at our per-channel target,
        // which IS its transparent point (see scoreThresholds), so it scores full marks; a source codec that normally carries a bitrate (dts, ac3 from
        // disc, etc.) is logged once and scored nominally.
        const bitrate = Number(stream.bit_rate || 0);
        if (bitrate <= 0) {
            if (CODEC_TARGET_BPS[codec === 'aac_vbr' ? 'aac' : codec])
                return info.score;
            response.infoLog += `☒${streamTag(stream.index)} No bitrate reported for ${codec}, assuming nominal quality\n`;
            return info.score - (maxPenalty / 2);
        }

        //Score the track against its channel-count-aware thresholds
        const { minimum, transparent } = scoreThresholds(codec, Number(stream?.channels ?? 2));
        let penalty = maxPenalty;
        if (bitrate > minimum) {
            if (bitrate >= transparent)
                penalty = 0;
            else
                penalty = maxPenalty * (1 - ((bitrate - minimum) / (transparent - minimum)));
        }

        return info.score - penalty;
    }
    // ===== END SHARED: audio codec scoring =====

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
    // -=-=-= is10Bit  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // True when a video stream is 10-bit (or deeper): raw sample depth or mediaInfo BitDepth >= 10, a 10-bit pixel format (p10le/p10be), or a 10-bit
    // profile (Main 10 / High 10). Single source for summariseStream's 10bit token and video_clean's re-encode depth decision so the two can't drift.
    const is10Bit = (s, mi = mediaInfoFor(s)) => Number(s.bits_per_raw_sample || mi?.BitDepth || 0) >= 10
        || /p10(le|be)?$|10le|10be/.test((s.pix_fmt || '').toLowerCase()) || /10/.test((s.profile || '').toLowerCase());
    // The role markers mirror the sorting logic (flag OR title keyword, via the shared classifiers) so every plugin's summary lines up.
    // subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Audio uses codecDisplayName so a DTS subtype
    // or object-audio layer the container codec_name hides (dts-hd-ma, eac3-atmos, dts-express-x) shows in the token. Shared verbatim across all five.
    // -=-=-= FONT_EXTS + isFontMime  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Embedded-font filename extensions + a font-mimetype test, shared by summariseStream's [attach:...] token and clean_and_remux's attachmentKind font classification.
    const FONT_EXTS = ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'];
    const isFontMime = (mime) => /font|truetype|opentype|sfnt/.test(mime);
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
            const vHdr = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'].includes(vXfer) || !!String(vmi?.HDR_Format || '').trim();
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
                if (FONT_EXTS.includes(ext)) label = ext;
                else if (isFontMime(mime)) label = 'font';
                else if (mime.startsWith('image/')) label = 'image';
                else if (ext) label = ext;
            }
            return `[attach:${label}]`;
        }
        if (type === 'data')
            return `[data:${codec}]`;
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
    // ===== END SHARED: language matching =====

    // Bail out gracefully on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Value checks. The two free-text inputs (order_language/order_codec) have no fixed option set; the six dropdowns (first_audio, first_subtitle,
    // order_channel, order_quality, remove_junk_tags, method_mp4_faststart) each have one, validated below.
    if(!['language', 'original', 'default', 'descriptive'].includes(inputs.first_audio))
        failFile(`[first_audio=${inputs.first_audio}] invalid value, check your settings`);
    if(!['descending', 'descending <=6', 'descending <=8', 'ascending', 'disabled'].includes(inputs.order_channel))
        failFile(`[order_channel=${inputs.order_channel}] invalid value, check your settings`);
    if(!['descending', 'descending <=1024k', 'ascending', 'disabled'].includes(inputs.order_quality))
        failFile(`[order_quality=${inputs.order_quality}] invalid value, check your settings`);
    if(!['normal', 'default', 'sdh', 'descriptive'].includes(inputs.first_subtitle))
        failFile(`[first_subtitle=${inputs.first_subtitle}] invalid value, check your settings`);
    if(!['disabled', 'encoder', 'descriptive'].includes(String(inputs.remove_junk_tags || 'disabled').toLowerCase()))
        failFile(`[remove_junk_tags=${inputs.remove_junk_tags}] invalid value, check your settings`);
    if(!['enabled', 'disabled'].includes(String(inputs.method_mp4_faststart || 'enabled').toLowerCase()))
        failFile(`[method_mp4_faststart=${inputs.method_mp4_faststart}] invalid value, check your settings`);

    // One guard around all the reordering work below: a deliberate failFile abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the
    // file too — annotated and carrying the full infoLog — instead of silently skipping. (Earlier input validation runs before this and fails via failFile.)
    try {
        // Input summary — the streams exactly as they arrived, before re-ordering.
        response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

        // VIDEO -> AUDIO -> SUBTITLE -> ATTACHMENT -> DATA -> OTHER?
        const streamOrder = { video: 0, audio: 1, subtitle: 2 , attachment: 3, data: 4};
        const audioFirst = inputs.first_audio;       // 'language' (baseline) | 'original' | 'default' | 'descriptive'
        const subtitleFirst = inputs.first_subtitle; // 'normal' (baseline) | 'default' | 'sdh' | 'descriptive'
        const preferredLanguages = (inputs.order_language || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
        const preferredLangKeys = preferredLanguages.map(langKey);   // normalised keys: en/eng/english/en-US and 639-2/B vs /T all rank together
        const codecFirstList = (inputs.order_codec || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);

        // Parse an order mode ('descending' | 'descending <=N' | 'ascending' | 'disabled') into {enabled, dir, cap}. The '<=N' suffix caps descending: a stream
        // whose cap-metric exceeds N is demoted below every at/under-cap stream. A trailing 'k' (order_quality's bitrate cap) means N is in kbps -> bps. Parsed
        // ONCE here, not per-comparison, because the comparator below runs O(n log n) times.
        const parseOrderMode = (mode) => {
            if (mode === 'disabled') return { enabled: false };
            const m = /^descending\s*<=\s*(\d+)(k?)$/.exec(mode);
            if (m) return { enabled: true, dir: 'descending', cap: Number(m[1]) * (m[2] === 'k' ? 1000 : 1) };
            return { enabled: true, dir: mode === 'ascending' ? 'ascending' : 'descending', cap: Infinity };
        };
        const channelOrder = parseOrderMode(inputs.order_channel);
        const qualityOrder = parseOrderMode(inputs.order_quality);
        const methodFaststart = String(inputs.method_mp4_faststart || 'enabled').toLowerCase();
        // Union-of-caps demotion: a track over EITHER the channel cap OR the quality cap is demoted below every under-all-caps track, so the fully-serveable
        // track leads - e.g. a 5.1 that's under the <=6 channel cap but over the <=1024k quality cap is still demoted, not kept above a stereo. A finite cap
        // exists only in a 'descending <=N' mode (plain descending/ascending/disabled don't cap -> Infinity). Channel caps by channel count; quality by capBitrate.
        const chanCap = (channelOrder.enabled && channelOrder.dir === 'descending') ? channelOrder.cap : Infinity;
        const qualCap = (qualityOrder.enabled && qualityOrder.dir === 'descending') ? qualityOrder.cap : Infinity;
        const overCap = (s) => s.channels > chanCap || s.capBitrate > qualCap;

        const getLangRank = (lang) => {
            const idx = preferredLangKeys.indexOf(langKey(lang));
            return idx === -1 ? 999 : idx;
        };

        // Audio ordering below first_audio, shared by the sort AND the winning-default pre-pass: language -> role -> order_codec -> the union cap partition
        // (over EITHER cap -> tail) -> channel (direction) -> quality (direction). Returns 0 when every key ties. The cap ONLY partitions; within each partition
        // channel/quality keep their requested direction, so a 'descending <=N' list stays fully descending - the cap just shifts which serveable track leads.
        const audioKeyCompare = (a, b) => {
            const aRank = a.langRank;
            const bRank = b.langRank;
            if (aRank !== bRank) return aRank - bRank;
            //A commentary stream could be descriptive but it would still be a commentary
            const aRole = a.commentary ? 2 : (a.descriptive ? 1 : 0);
            const bRole = b.commentary ? 2 : (b.descriptive ? 1 : 0);
            if (aRole !== bRole) return aRole - bRole;
            //order_codec tier — preferred codecs form one group above the rest; this only promotes the group, each still ordered by channel/quality below.
            if (codecFirstList.length > 0 && a.codecmatch !== b.codecmatch) return a.codecmatch ? -1 : 1;
            //Union cap partition: an over-EITHER-cap track is demoted to the tail. The tail and the lead group each keep the channel/quality direction below.
            if (chanCap < Infinity || qualCap < Infinity) {
                const aOver = overCap(a), bOver = overCap(b);
                if (aOver !== bOver) return aOver ? 1 : -1;
            }
            //Channel (skipped when disabled): the cap already partitioned above, so this is a plain direction sort by channel count.
            if (channelOrder.enabled && a.channels !== b.channels)
                return channelOrder.dir === 'ascending' ? a.channels - b.channels : b.channels - a.channels;
            //Quality (skipped when disabled): orders by the audioquality score in the requested direction.
            if (qualityOrder.enabled && a.audioquality !== b.audioquality)
                return qualityOrder.dir === 'ascending' ? a.audioquality - b.audioquality : b.audioquality - a.audioquality;
            return 0;
        };

        // remove_junk_tags: strip encoder/muxer-provenance (+ optional descriptive) tags on the reorder remux. Two tiers: 'encoder' = pure provenance (global encoded_by;
        // per-stream encoder/encoded_by); 'descriptive' (superset) also drops iTunes/movie-TV container tags. Always kept: title/comment, awk_* markers (idempotency),
        // creation_time, the mkv BPS/statistics family (mediaInfo derives per-track bitrate from it), the functional per-stream tags, and the GLOBAL 'encoder' tag
        // (muxer-managed: every mux re-stamps it, so stripping would loop). Per-stream 'encoder' - including the fresh Lavc tag a video/audio re-encode stamps upstream -
        // is NOT re-added on a -c copy, so running last clears it in the SAME remux (a first-in-stack plugin could only catch it a pass later). Case-insensitive, present-only.
        const junkTags = String(inputs.remove_junk_tags || 'disabled').toLowerCase();
        const JUNK_ENCODER_GLOBAL = new Set(['encoded_by']);
        const JUNK_DESCRIPTIVE = new Set(['compilation', 'gapless_playback', 'hd_video', 'purchase_date', 'sort_name', 'sort_album', 'sort_album_artist', 'sort_artist',
            'sort_composer', 'sort_show', 'genre', 'date', 'description', 'synopsis', 'show', 'episode_id', 'network', 'episode_sort', 'season_number', 'media_type', 'artist',
            'album', 'album_artist', 'composer', 'grouping', 'lyrics', 'copyright', 'keywords']);
        const JUNK_PERSTREAM = new Set(['encoded_by', 'encoder']);   // only encoder-tier keys are safe per-stream (descriptive per-stream tags are functional, kept)
        const junkGlobalStrip = (lowerKey) => junkTags !== 'disabled' && (JUNK_ENCODER_GLOBAL.has(lowerKey) || (junkTags === 'descriptive' && JUNK_DESCRIPTIVE.has(lowerKey)));
        // Per-stream encoder/encoded_by clears for the stream at OUTPUT index outIdx (post-reorder position, which -metadata:s:<index> targets). escMeta guards the probe-derived key.
        const streamJunkClears = (ffstream, outIdx) => {
            if (junkTags === 'disabled') return '';
            let meta = '';
            for (const k of Object.keys(ffstream.tags || {}))
                if (JUNK_PERSTREAM.has(k.toLowerCase())) meta += ` -metadata:s:${outIdx} "${escMeta(k)}="`;
            return meta;
        };

        const streams = [];
        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
            const ffstream = file.ffProbeData.streams[i];
            // Enrich with mediaInfo bitrate before audioQuality/summariseStream: ffprobe can't read e.g. DTS-HD MA's bitrate in MP4/M4V, so those
            // formats are scored/displayed from the more accurate mediaInfo value.
            const enrichedStream = enrichStream(ffstream);
            const streamLang = resolveLang(ffstream) || 'und';

            const streamType = (ffstream.codec_type || '').trim().toLowerCase();
            // Resolve the canonical codec once (resolveCodecName does a probe-join + string work); order_codec membership can't change between list entries.
            const canon = streamType === 'audio' ? resolveCodecName(enrichedStream) : '';

            streams.push({
                index: ffstream.index,
                origPos: i,
                stream: enrichedStream,
                type: streamType,
                lang: streamLang,
                // Language sort rank precomputed once here (getLangRank -> langKey -> Intl.getCanonicalLocales is expensive), not per O(n log n) comparison -
                // mirrors audio_clean's isTdarrCleanLang precompute and the parseOrderMode-once discipline. Read as a.langRank/b.langRank in the comparators.
                langRank: getLangRank(streamLang),
                channels: enrichedStream.channels || 0,
                // Resolved bitrate in bps (shared resolveStreamBitrate fallback, via enrichStream). order_quality sorts by the audioquality score but CAPS by
                // raw bitrate ('descending <=1024k'), so the cap threshold needs the actual bitrate, not the score.
                bitrate: enrichedStream.bit_rate || 0,
                // Bitrate the order_quality cap compares against: a LOSSLESS track whose bitrate neither probe reports (0) is still a heavy, hard-to-serve
                // track, so it must count as OVER any bitrate cap (Infinity), never under it. A non-lossless bitrate-0 track (e.g. a freshly-transcoded aac) is
                // genuinely small and stays 0 = under-cap. Only the '<=Nk' cap reads this; plain descending/ascending ignore it.
                capBitrate: (streamType === 'audio' && !(enrichedStream.bit_rate > 0) && codecInfo[canon]?.lossless === true) ? Infinity : (enrichedStream.bit_rate || 0),
                forced: ffstream?.disposition?.forced === 1,
                // Only score audio: scoring video/subtitle/data would spam bogus "unknown codec"/"invalid bitrate" notices, and quality is only used to sort audio.
                audioquality: streamType === 'audio' ? audioQuality(enrichedStream) : 0,
                // Does this audio stream's canonical codec match order_codec? Family-prefix: "dts" catches dtsma/dtshr/dtsexpress, "eac3" catches eac3atmos.
                codecmatch: canon !== '' && codecFirstList.some(c => canon.startsWith(c)),
                default: ffstream?.disposition?.default === 1,
                original: hasDisposition(ffstream, 'original'),   // for first_audio='original': promote the original-language track above language

                // Role classification via the shared classifiers (single source of truth — keeps the sort and the summary line in agreement).
                commentary: isCommentary(ffstream),
                descriptive: isDescriptive(ffstream),
                sdh: isSdh(ffstream),
                lyrics: isLyrics(ffstream),

                // Cover art/poster/thumbnail sort last: ffmpeg cover-art dispositions (any codec) or a still-image codec - mirrors clean_and_remux image removal.
                coverArt: isCoverArt(ffstream),
            });
        }

        // first_audio='default': only ONE audio track can remain default (the normalisation below marks the first sorted audio the sole default). So promote
        // the SINGLE default track that WINS the normal ordering, not every default flag - then the emitted order already matches the post-normalisation state and
        // is a fixpoint. Promoting every default would lead with a lower-priority default on pass 1, then re-sort it once its default is stripped (a wasteful extra
        // reorder remux before it settles). undefined when no track is flagged default, so first_audio='default' then falls through to normal ordering. Identity-compared below.
        const winningDefault = audioFirst === 'default'
            ? streams.filter(s => s.type === 'audio' && s.default).sort((a, b) => audioKeyCompare(a, b) || a.index - b.index)[0]
            : undefined;

        //Sort the streams
        streams.sort((a, b) => {
            //Stream Type
            const aOrder = streamOrder[a.type] ?? 99;
            const bOrder = streamOrder[b.type] ?? 99;

            if (aOrder !== bOrder)
                return aOrder - bOrder;

            //Video (but cover art / posters / thumbnails go last)
            if (a.type === 'video') {
                if (a.coverArt !== b.coverArt)
                    return a.coverArt ? 1 : -1;
            //Audio
            } else if(a.type === 'audio') {
                //first_audio promotes ONE track above every audio key (including language). Only one value is active, so at most one clause fires; each is a no-op
                //when no track qualifies, falling through to the normal ordering. original: keeps a foreign film's original audio first (and default), not a dub.
                //default: keeps the source's flagged-default audio first - promoting only the WINNING default (winningDefault) so the result is idempotent.
                //descriptive: lifts the audio-description track first (and, via normalisation, makes it the default).
                if (audioFirst === 'original' && a.original !== b.original)
                    return a.original ? -1 : 1;
                if (audioFirst === 'default') {
                    const aWin = a === winningDefault, bWin = b === winningDefault;
                    if (aWin !== bWin) return aWin ? -1 : 1;
                }
                if (audioFirst === 'descriptive' && a.descriptive !== b.descriptive)
                    return a.descriptive ? -1 : 1;

                //Language, role, order_codec, the union cap partition, then channel + quality — all in audioKeyCompare (shared with the winning-default pre-pass).
                const c = audioKeyCompare(a, b);
                if (c !== 0) return c;
            //Subtitles
            } else if (a.type === 'subtitle') {
                //Forced always first
                if (a.forced !== b.forced)
                    return a.forced ? -1 : 1;

                //Language priority next (forced already handled above).
                const aRank = a.langRank;
                const bRank = b.langRank;

                if (aRank !== bRank)
                    return aRank - bRank;

                //first_subtitle promotes the default/SDH/descriptive subtitle to the top of THEIR language (below forced + language, above the normal role order).
                if (subtitleFirst === 'default' && a.default !== b.default)
                    return a.default ? -1 : 1;
                else if (subtitleFirst === 'sdh' && a.sdh !== b.sdh)
                    return a.sdh ? -1 : 1;
                else if (subtitleFirst === 'descriptive' && a.descriptive !== b.descriptive)
                    return a.descriptive ? -1 : 1;

                //Normal, lyrics/songs, SDH, descriptive, commentary - first_subtitle overrides the default/SDH/descriptive position within the language
                const aRole = a.commentary ? 4 : (a.descriptive ? 3 : (a.sdh ? 2 : (a.lyrics ? 1 : 0)));
                const bRole = b.commentary ? 4 : (b.descriptive ? 3 : (b.sdh ? 2 : (b.lyrics ? 1 : 0)));
                if (aRole !== bRole)
                    return aRole - bRole;
            }

            //Next would be attachments and data but the order of these aren't important
            return a.index - b.index;
        });

        //Check if order changed and build the map; also normalise the audio default flag so exactly one audio track — the first in sorted order — is default,
        //matching what our ordering rules chose. Additive +default/-default preserves forced/commentary/etc; subtitle/video untouched.
        let ffmpegMap = '';
        let dispositionArgs = '';
        let junkArgs = '';
        let junkLog = '';
        let changed = false;
        let audioIndex = -1;

        for (let i = 0; i < streams.length; i++) {
            ffmpegMap += ` -map 0:${streams[i].index}`;
            // Compare against each stream's ORIGINAL array position, not its absolute ffprobe index, so a file already in the desired order but with
            // non-contiguous indices (e.g. 0,1,3 after an upstream drop) isn't remuxed pointlessly. -map still uses the absolute index above.
            if (streams[i].origPos !== i) changed = true;

            // remove_junk_tags (per-stream): clear encoder/encoded_by on this stream, keyed on its OUTPUT index i (a within-type reorder moves a track's per-type
            // position, so -metadata:s must use the post-sort index, not the source one). Present-only, so a clean stream adds nothing and never forces a mux alone.
            const streamJunk = streamJunkClears(streams[i].stream, i);
            if (streamJunk) { junkArgs += streamJunk; junkLog += `☐${streamTag(streams[i].index)}[remove_junk_tags=${junkTags}] Remove encoder tag(s) from ${streams[i].type} stream\n`; }

            if (streams[i].type === 'audio') {
                audioIndex++;
                const wantDefault = audioIndex === 0;   // exactly the first audio track carries default
                if (wantDefault && !streams[i].default)
                    dispositionArgs += ` -disposition:a:${audioIndex} +default`;
                else if (!wantDefault && streams[i].default)
                    dispositionArgs += ` -disposition:a:${audioIndex} -default`;
                // Reflect the normalized flag in the Expected results summary (summariseStream reads disposition.default);
                // shallow-clone so the source probe object is untouched.
                if (streams[i].default !== wantDefault)
                    streams[i].stream = { ...streams[i].stream, disposition: { ...streams[i].stream.disposition, default: wantDefault ? 1 : 0 } };
            }
        }

        // remove_junk_tags (global): clear encoder-provenance / descriptive container tags present (case-insensitive; title/comment/creation_time/awk_* kept). escMeta guards the key.
        if (junkTags !== 'disabled')
            for (const k of Object.keys(file.ffProbeData.format?.tags || {})) {
                const lk = k.toLowerCase();
                if (lk === 'title' || lk === 'comment' || lk === 'creation_time' || lk.startsWith('awk_')) continue;
                if (junkGlobalStrip(lk)) { junkArgs += ` -metadata "${escMeta(k)}="`; junkLog += `☐[remove_junk_tags=${junkTags}] Remove ${k} tag from file\n`; }
            }

        // method_mp4_faststart: front-load the mp4 moov atom. A plain ride-along isn't enough (we skip when order is already correct), so detect the moov position
        // (spawn-free; __awkMoovFront overrides for the harness) and force a one-time remux when faststart is on, the output is an mp4-family container, and the file
        // isn't already fronted. moovBeforeMdat is fail-safe (unreadable/odd -> treated as fronted), so this settles after one pass and never loops.
        const isMp4 = isMp4Family(file.container);   // shared checker; cached once for this container
        const faststartOn = methodFaststart === 'enabled';
        const needsFront = faststartOn && isMp4 && !moovBeforeMdat(file.file, otherArguments);

        if (!changed && dispositionArgs === '' && !needsFront && junkArgs === '') {
            response.infoLog += '☑Streams already in desired order\n';
            return response;
        }

        response.processFile = true;
        response.reQueueAfter = true;
        if (needsFront && !changed && dispositionArgs === '')
            response.infoLog += `☐[method_mp4_faststart=${methodFaststart}] Remux to front-load the mp4 moov atom\n`;
        // mp4/mov muxers drop a custom GLOBAL metadata tag (e.g. clean_and_remux's awk_recovered, set upstream) on a -c copy remux unless told to keep it, which would
        // re-trigger recovery on the next pass. Preserve it on the mov family, and append +faststart when method_mp4_faststart is on so the moov atom leads the file.
        const mp4KeepTags = isMp4 ? ` -movflags use_metadata_tags${faststartOn ? '+faststart' : ''}` : '';
        response.preset = `,${ffmpegMap} -c copy${dispositionArgs}${junkArgs}${globalOutputOpt}${mp4KeepTags}`;
        if (dispositionArgs !== '')
            response.infoLog += '☐Set the first audio track as the sole default\n';
        response.infoLog += junkLog;
        response.infoLog += `☑Expected results: ${streams.map(s => summariseStream(s.stream)).join('')}\n`;

        return response;
    } catch (err) {
        failUnexpected(err);   // AwkFailFile → rethrow unchanged; anything else → annotate + fail the file with the full infoLog
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
