/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_video_clean',
    Stage: 'Pre-processing',
    Name: 'Transcode video to an efficient codec at a target quality, auto-selecting the best encoder per node.',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Re-encodes the video stream to a modern codec (HEVC/H.264/AV1) at a resolution-tiered constant quality, optionally downscaling, and touches nothing else (audio and subtitles are copied).\n\n
                     -Auto-selects the best available encoder on EACH node at runtime: queries the ffmpeg build + a cheap hardware-presence check (no trial-encode ladder), so one plugin works across a mixed Mac/Windows/Linux + dGPU/iGPU/CPU-only fleet. Force a specific encoder or leave it on auto.\n\n
                     -Constant-quality (CRF/CQ) tiered by resolution, normalized so the same setting yields comparable quality on every encoder.\n\n
                     -Optionally caps resolution (e.g. 4K -> 1080p), re-deriving the quality tier for the output height.\n\n
                     -Preserves static HDR10/HLG colour metadata; leaves Dolby Vision / HDR10+ files untouched by default (dynamic metadata can't survive a re-encode).\n\n
                     -Skips files that are already the target codec (unless guard_reprocess is on), already below the bitrate floor, or already processed at this exact setting (an awk_video tag fences re-encode loops).\n\n
                     -Adds -tag:v hvc1 for HEVC in mp4 so Apple/QuickTime plays it. Designed to run after clean_and_remux and before/around audio_clean; leave stream ordering to the ordering plugin.\n\n`,
    Version: '1.5.0',
    Tags: 'pre-processing,ffmpeg,video only,hevc,h265,h264,av1,configurable',
    Inputs: [
        {
            name: 'codec',
            type: 'string',
            defaultValue: 'hevc',
            inputUI: {
                type: 'dropdown',
                options: ['hevc', 'h264', 'av1'],
            },
            tooltip: `Target video codec.
                \\nhevc (H.265): the efficient default - roughly half the bitrate of H.264 at the same quality. Best for shrinking old, high-bitrate media.
                \\nh264 (AVC): for old / weak playback devices that can't handle HEVC. Forced to 8-bit (10-bit H.264 hurts device compatibility).
                \\nav1: most efficient, but slow on CPU and hardware AV1 encode needs a very new GPU (Intel Arc, RTX 40-series, RDNA3); falls back to the libsvtav1 software encoder where no AV1 hardware encoder is available.`,
        },
        {
            name: 'max_height',
            type: 'string',
            defaultValue: 'original',
            inputUI: {
                type: 'dropdown',
                options: ['original', '2160', '1440', '1080', '720', '480'],
            },
            tooltip: `Cap the output resolution by height (only ever downscales, never upscales). The quality tier is re-derived for the new height.
                \\noriginal: keep the source resolution.
                \\n1080: downscale anything taller than 1080p to 1080p (the classic "shrink 4K to 1080p to save space"). 720 / 480 likewise. 2160 / 1440 cap only larger sources.`,
        },
        {
            name: 'quality_sd',
            type: 'string',
            defaultValue: '21',
            inputUI: { type: 'text' },
            tooltip: `Constant-quality target for SD output (height <= 576). HEVC-CRF scale: lower = higher quality / bigger file, higher = smaller. Typical range 18-28.
                \\nThis number is used as-is for HEVC and H.264, and shifted onto the AV1 scale automatically. It maps to each encoder's native quality flag (libx265 -crf, NVENC -cq, QSV -global_quality, VAAPI -qp, ...).`,
        },
        {
            name: 'quality_720p',
            type: 'string',
            defaultValue: '22',
            inputUI: { type: 'text' },
            tooltip: `Constant-quality target for 720p output (height 577-720). HEVC-CRF scale, lower = better. See quality_sd.`,
        },
        {
            name: 'quality_1080p',
            type: 'string',
            defaultValue: '23',
            inputUI: { type: 'text' },
            tooltip: `Constant-quality target for 1080p output (height 721-1080). HEVC-CRF scale, lower = better. See quality_sd.`,
        },
        {
            name: 'quality_4k',
            type: 'string',
            defaultValue: '25',
            inputUI: { type: 'text' },
            tooltip: `Constant-quality target for UHD output (height > 1080, i.e. 1440p/4K). HEVC-CRF scale, lower = better. See quality_sd.`,
        },
        {
            name: 'speed',
            type: 'string',
            defaultValue: 'slow',
            inputUI: {
                type: 'dropdown',
                options: ['slow', 'medium', 'fast'],
            },
            tooltip: `Encoder speed vs. efficiency. Slower spends more CPU/GPU time for a smaller file at the same quality.
                \\nMaps to each encoder's native preset (libx265 slow/medium/fast, libsvtav1 4/6/8, NVENC p7/p5/p3, QSV veryslow/medium/veryfast, ...). VAAPI/VideoToolbox have no comparable knob and ignore this.`,
        },
        {
            name: 'bit_depth',
            type: 'string',
            defaultValue: 'source',
            inputUI: {
                type: 'dropdown',
                options: ['source', '8', '10'],
            },
            tooltip: `Output bit depth.
                \\nsource: match the source (keeps 10-bit 10-bit, 8-bit 8-bit). Recommended.
                \\n8 / 10: force it. H.264 is always 8-bit regardless (10-bit H.264 breaks device compatibility, which is the reason to pick H.264).`,
        },
        {
            name: 'encoder',
            type: 'string',
            defaultValue: 'auto',
            inputUI: {
                type: 'dropdown',
                options: ['auto', 'nvenc', 'qsv', 'vaapi', 'videotoolbox', 'amf', 'cpu'],
            },
            tooltip: `Which encoder to use on each node.
                \\nauto (recommended): each node picks the best available encoder for its hardware - GPU workers use the node's GPU (NVENC/QSV/VAAPI/VideoToolbox/AMF) if present, CPU workers and GPU-less nodes use the software encoder. This is what makes one plugin work across a mixed fleet.
                \\nA specific value forces that encoder on every node; a node that can't run it (wrong GPU, wrong OS) falls back to the software encoder and logs it. Only pin this on a uniform fleet.
                \\ncpu forces the software encoder (libx265/libx264/libsvtav1) everywhere.`,
        },
        {
            name: 'guard_min_bitrate',
            type: 'string',
            defaultValue: '0',
            inputUI: { type: 'text' },
            tooltip: `Skip files whose current video bitrate is already below this (kbps). 0 disables the guard.
                \\nConstant-quality encoding can't predict the output size, so re-encoding an already-lean source can GROW it. This floor leaves already-efficient files untouched. Example: 2500 skips anything already under 2500 kbps.`,
        },
        {
            name: 'guard_hdr',
            type: 'string',
            defaultValue: 'abort_dynamic',
            inputUI: {
                type: 'dropdown',
                options: ['abort_dynamic', 'allow_dynamic'],
            },
            tooltip: `How to handle Dolby Vision / HDR10+ (dynamic HDR) files. Static HDR10/HLG colour metadata is always carried through the encode automatically (nothing to configure).
                \\nabort_dynamic (recommended): leave Dolby Vision / HDR10+ files untouched - their dynamic metadata can't survive a re-encode, so transcoding would degrade them.
                \\nallow_dynamic: transcode them anyway, keeping only the base HDR10 layer (accepts the loss of the dynamic Dolby Vision / HDR10+ layer).`,
        },
        {
            name: 'guard_reprocess',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Re-encode files that are ALREADY the target codec?
                \\nfalse (default): leave existing target-codec files alone (only convert other codecs). No wasted encodes.
                \\ntrue: also re-encode existing target-codec files to enforce the quality/resolution target (e.g. shrink a library of already-HEVC files). An awk_video tag records the exact setting applied and stops it re-encoding the same file every pass.`,
        },
    ],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        container: `.${file.container}`,
        FFmpegMode: true,
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
    // regex-escaped; the 'u' flag enables \p{L}/\p{N}. text must already be lowercased.
    const matchesKeyword = (text, keywords) => {
        if (!keywords.length) return false;
        const pattern = keywords
            .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^\\p{L}\\p{N}]+'))
            .join('|');
        return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u').test(text);
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

    const os = require('os');
    const fs = require('fs');
    const childProcess = require('child_process');

    // ====== ENCODER CAPABILITY + SELECTION ======
    // A Tdarr plugin's inputs are set once per LIBRARY and shipped identically to every node/worker, so a video
    // encoder can't be a stored setting on a mixed Mac/PC/Linux + dGPU/iGPU/none fleet - it must be resolved at
    // runtime, per node. We do that with a CAPABILITY QUERY (not a trial-encode ladder): ask ffmpeg what the build
    // supports, intersect with a cheap zero-encode hardware-presence check, and only fall back to a single confirming
    // probe for the genuinely-ambiguous cases (Windows QSV/AMF where nothing cheap proves the GPU exists, and any AV1
    // hardware encode where -encoders + presence can't prove the GPU is new enough - Arc / RTX-40xx / RDNA3).

    // Priority order of hardware families to try per OS (best/most-common first). CPU is always the final fallback.
    const HW_FAMILIES = {
        darwin: ['videotoolbox'],
        win32: ['nvenc', 'qsv', 'amf'],
        linux: ['nvenc', 'qsv', 'vaapi', 'amf'],
    };
    // ffmpeg encoder name per (target codec, family). null = that family has no encoder for that codec (e.g. no AV1 videotoolbox).
    const ENCODER_NAME = {
        hevc: { nvenc: 'hevc_nvenc', qsv: 'hevc_qsv', vaapi: 'hevc_vaapi', videotoolbox: 'hevc_videotoolbox', amf: 'hevc_amf', cpu: 'libx265' },
        h264: { nvenc: 'h264_nvenc', qsv: 'h264_qsv', vaapi: 'h264_vaapi', videotoolbox: 'h264_videotoolbox', amf: 'h264_amf', cpu: 'libx264' },
        av1: { nvenc: 'av1_nvenc', qsv: 'av1_qsv', vaapi: 'av1_vaapi', videotoolbox: null, amf: 'av1_amf', cpu: 'libsvtav1' },
    };

    // Query the ffmpeg build's encoder list + hardware presence for this node: encoders from `-encoders`, NVIDIA from nvidia-smi,
    // VAAPI/QSV from a /dev/dri check. Tdarr reloads each classic plugin fresh per file and selectEncoder calls this once, so it runs once per file.
    const queryCapabilities = (ffmpegPath) => {
        const ff = ffmpegPath || 'ffmpeg';
        const cap = { encoders: new Set(), nvidia: false, dri: false };
        try {
            const r = childProcess.spawnSync(ff, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 20000 });
            for (const line of String(r.stdout || '').split('\n')) {
                const m = line.match(/^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/);   // " V....D hevc_nvenc  NVIDIA NVENC hevc encoder"
                if (m) cap.encoders.add(m[1]);
            }
        } catch (e) { /* leave encoders empty -> everything falls back to CPU */ }
        try {
            const r = childProcess.spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8', timeout: 8000 });
            cap.nvidia = r.status === 0 && String(r.stdout || '').trim().length > 0;
        } catch (e) { /* nvidia-smi absent -> no NVIDIA GPU */ }
        try { cap.dri = fs.existsSync('/dev/dri/renderD128'); } catch (e) { cap.dri = false; }
        return cap;
    };

    // Single lightweight confirming probe (one 256x256 frame) of ONE candidate encoder - used only for the ambiguous
    // families/cases, never as a blind per-codec ladder.
    const confirmEncode = (ffmpegPath, encoderName, inputSide, filter) => {
        let ok = false;
        try {
            const args = ['-hide_banner'];
            if (inputSide) args.push(...inputSide.split(' ').filter(Boolean));
            args.push('-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=1:r=5');
            if (filter) args.push('-vf', filter);
            args.push('-frames:v', '1', '-c:v', encoderName, '-f', 'null', '-');
            const r = childProcess.spawnSync(ffmpegPath || 'ffmpeg', args, { encoding: 'utf8', timeout: 25000 });
            ok = r.status === 0;
        } catch (e) { ok = false; }
        return ok;
    };

    // Cheap zero-encode presence verdict for a family on this platform: 'yes' (usable), 'no' (definitely not), or
    // 'probe' (can't tell cheaply - confirm with one encode). videotoolbox = Mac only; nvenc = nvidia-smi; vaapi on
    // Linux = /dev/dri (vendor-agnostic). QSV always needs the confirm probe: Windows/AMF have no cheap signal, and on
    // Linux /dev/dri only proves a GPU exists, not that it's an Intel one QSV can drive (AMD shares renderD128).
    const presenceOf = (family, cap, platform) => {
        switch (family) {
            case 'cpu': return 'yes';
            case 'videotoolbox': return platform === 'darwin' ? 'yes' : 'no';
            case 'nvenc': return cap.nvidia ? 'yes' : 'no';
            case 'vaapi': return cap.dri ? 'yes' : 'no';
            case 'qsv': return platform === 'linux' ? (cap.dri ? 'probe' : 'no') : 'probe';
            case 'amf': return 'probe';
            default: return 'no';
        }
    };

    // Resolve the encoder for THIS node. Returns { family, encoderName, notes:[infoLog lines] }. Honors an explicit
    // encoder input (force on this node, CPU fallback if unavailable) or 'auto' (best available). Tests may inject a
    // capability object + platform/workerType via otherArguments.__awkCap to avoid any real ffmpeg/nvidia-smi spawn.
    const selectEncoder = ({ codec, encoderOpt, otherArguments }) => {
        const inj = otherArguments && otherArguments.__awkCap;
        const platform = (inj && inj.platform) || os.platform();
        const workerType = String((otherArguments && otherArguments.workerType) || '').toLowerCase();
        const isGpuWorker = workerType.includes('gpu');
        const ffmpegPath = (otherArguments && otherArguments.ffmpegPath) || 'ffmpeg';
        const cap = inj
            ? { encoders: new Set(inj.encoders || []), nvidia: !!inj.nvidia, dri: !!inj.dri }
            : queryCapabilities(ffmpegPath);
        const confirm = (encoderName, inputSide, filter) => (inj
            ? !!(inj.confirm && inj.confirm[encoderName])
            : confirmEncode(ffmpegPath, encoderName, inputSide, filter));
        const notes = [];
        const cpuChoice = () => ({ family: 'cpu', encoderName: ENCODER_NAME[codec].cpu, notes });

        // Candidate families: an explicit pick is tried first (then CPU); 'auto' tries the platform's HW list only on a
        // GPU worker (CPU workers stay on software so slow encodes don't land on the GPU), then CPU.
        let families;
        if (encoderOpt !== 'auto') {
            families = [encoderOpt, 'cpu'];
        } else if (isGpuWorker) {
            families = [...(HW_FAMILIES[platform] || []), 'cpu'];
        } else {
            families = ['cpu'];
        }

        for (const family of families) {
            if (family === 'cpu') break;   // reached the fallback
            const encoderName = ENCODER_NAME[codec][family];
            if (!encoderName) {   // e.g. AV1 has no videotoolbox encoder
                if (encoderOpt === family) notes.push(`☒${family} has no ${codec} encoder; using ${ENCODER_NAME[codec].cpu}.\n`);
                continue;
            }
            if (!cap.encoders.has(encoderName)) {   // ffmpeg build doesn't ship it (e.g. no nvenc in the Mac build)
                if (encoderOpt === family) notes.push(`☒${encoderName} is not in this ffmpeg build on this node; using ${ENCODER_NAME[codec].cpu}.\n`);
                continue;
            }
            const presence = presenceOf(family, cap, platform);
            if (presence === 'no') {
                if (encoderOpt === family) notes.push(`☒${family} hardware not detected on this node; using ${ENCODER_NAME[codec].cpu}.\n`);
                continue;
            }
            // Confirm with one probe when presence is ambiguous, and always for AV1 hardware (generation can't be inferred).
            const needProbe = presence === 'probe' || codec === 'av1';
            if (needProbe) {
                const probeIn = family === 'vaapi' ? '-vaapi_device /dev/dri/renderD128' : '';
                const probeFilter = family === 'vaapi' ? 'format=nv12,hwupload' : '';
                if (!confirm(encoderName, probeIn, probeFilter)) {
                    if (encoderOpt === family) notes.push(`☒${encoderName} did not initialise on this node; using ${ENCODER_NAME[codec].cpu}.\n`);
                    continue;
                }
            }
            notes.push(`☐Encoder: ${encoderName} (${encoderOpt === 'auto' ? 'auto' : 'forced'}, ${platform}${isGpuWorker ? ' gpu-worker' : ''}).\n`);
            return { family, encoderName, notes };
        }

        if (encoderOpt === 'auto' && !isGpuWorker) notes.push(`☐Encoder: ${ENCODER_NAME[codec].cpu} (auto, CPU worker).\n`);
        else if (encoderOpt === 'auto') notes.push(`☐Encoder: ${ENCODER_NAME[codec].cpu} (auto, no usable GPU encoder on this node).\n`);
        else if (encoderOpt === 'cpu') notes.push(`☐Encoder: ${ENCODER_NAME[codec].cpu} (forced cpu, ${platform}${isGpuWorker ? ' gpu-worker' : ''}).\n`);
        return cpuChoice();
    };

    // ====== PER-ENCODER QUALITY / SPEED / PIXEL-FORMAT TRANSLATION ======
    // One normalized quality target (HEVC-CRF scale, lower = better) mapped to each encoder's native flag so the same
    // setting yields comparable quality on every node. H.264 uses the same number; AV1 is shifted onto the SVT-AV1 /
    // AV1 CQ scale (+8, clamped 0-63) since the same visual quality sits at a higher number there. HW flag syntax
    // mirrors the proven community plugins (Migz nvenc -cq:v, Boosh qsv -global_quality, vaapi -qp, amf -qp_i/-qp_p).
    const nativeQuality = (codec, family, qNorm) => {
        let q = Math.round(qNorm);
        if (codec === 'av1') q = Math.max(0, Math.min(63, q + 8));
        switch (family) {
            case 'cpu': return `-crf ${q}`;                                   // libx264 / libx265 / libsvtav1 all take -crf
            case 'nvenc': return `-rc:v vbr -cq:v ${q} -b:v 0`;               // constant-quality NVENC (VBR envelope off)
            case 'qsv': return `-global_quality ${q}`;                        // QSV ICQ
            case 'vaapi': return `-rc_mode CQP -qp ${q}`;                     // VAAPI constant-QP
            case 'amf': return `-rc cqp -qp_i ${q} -qp_p ${q} -qp_b ${q}`;    // AMF constant-QP
            case 'videotoolbox': return `-q:v ${Math.max(1, Math.min(100, Math.round(118 - q * 2.6)))}`; // VT quality 1-100, higher = better
            default: return `-crf ${q}`;
        }
    };
    // Normalized speed -> each family's native knob. libsvtav1's -preset is numeric (0-13); the x26x pair is named;
    // nvenc uses p1-p7; qsv named; vaapi/videotoolbox have no comparable preset (omitted). Slower = better/smaller.
    const nativeSpeed = (codec, family, speed) => {
        if (family === 'cpu') {
            if (codec === 'av1') return `-preset ${{ slow: '4', medium: '6', fast: '8' }[speed]}`;
            return `-preset ${{ slow: 'slow', medium: 'medium', fast: 'fast' }[speed]}`;
        }
        if (family === 'nvenc') return `-preset ${{ slow: 'p7', medium: 'p5', fast: 'p3' }[speed]}`;
        if (family === 'qsv') return `-preset ${{ slow: 'veryslow', medium: 'medium', fast: 'veryfast' }[speed]}`;
        if (family === 'amf') return `-quality ${{ slow: 'quality', medium: 'balanced', fast: 'speed' }[speed]}`;
        return '';   // vaapi / videotoolbox: no equivalent preset knob
    };

    // Build the video-encode arguments for the chosen encoder: decode-side (input) flags + the output -c:v block
    // (encoder, quality, speed, pixel format, optional scale filter, hvc1 tag). Source colour metadata (incl. static
    // HDR10/HLG) is carried through automatically by ffmpeg - no explicit colour flags needed (verified empirically).
    // Decode is kept on software frames (nvenc via the shared nvdecPreset helper) so a single CPU scale filter and
    // -pix_fmt path work uniformly across families; VAAPI is the exception - it needs its frames uploaded, so it
    // carries an explicit device + format,hwupload filter. Returns { inputSide, videoOut }.
    const buildVideoArgs = ({ family, encoderName, codec, qNorm, speed, wantTenbit, willDownscale, outHeight, dstContainer, file }) => {
        const { getNvdecHwaccelPreset, getNvenc10BitFormatArg } = require('../methods/nvdecPreset');
        const q = nativeQuality(codec, family, qNorm);
        const spd = nativeSpeed(codec, family, speed);
        let inputSide = '';
        const parts = [`-c:v:0 ${encoderName}`, q, spd];   // :v:0 = encode primary video only; any genuine secondary video stream stays copied
        const vf = [];
        const scale = (fmt) => { if (willDownscale) vf.push(`scale=-2:${outHeight}`); if (fmt) vf.push(fmt); };

        if (family === 'nvenc') {
            inputSide = getNvdecHwaccelPreset(file, { softwareFrames: true });   // '-hwaccel cuda' (system-memory frames) or '' for software decode
            scale();
            parts.push(wantTenbit ? getNvenc10BitFormatArg(file, { softwareFrames: true }).trim() : '-pix_fmt yuv420p');
        } else if (family === 'qsv') {
            scale();
            if (wantTenbit) { parts.push('-pix_fmt p010le'); if (codec === 'hevc') parts.push('-profile:v main10'); } else parts.push('-pix_fmt nv12');
        } else if (family === 'vaapi') {
            inputSide = '-vaapi_device /dev/dri/renderD128';
            scale(`format=${wantTenbit ? 'p010' : 'nv12'}`);
            vf.push('hwupload');
        } else if (family === 'amf') {
            scale();
            parts.push(wantTenbit ? '-pix_fmt p010le' : '-pix_fmt yuv420p');
        } else if (family === 'videotoolbox') {
            scale();
            parts.push(wantTenbit ? '-pix_fmt p010le' : '-pix_fmt yuv420p');
            if (wantTenbit && codec === 'hevc') parts.push('-profile:v main10');
        } else {   // cpu
            scale();
            parts.push(`-pix_fmt ${wantTenbit ? 'yuv420p10le' : 'yuv420p'}`);
        }

        if (codec === 'hevc' && ['mp4', 'm4v', 'mov'].includes(dstContainer)) parts.push('-tag:v:0 hvc1');   // Apple/QuickTime HEVC-in-mp4 playback (primary only)
        const vfArg = vf.length ? ` -filter:v:0 "${vf.join(',')}"` : '';   // :v:0 - filtering a copied secondary video stream would error
        return { inputSide, videoOut: `${parts.filter(Boolean).join(' ')}${vfArg}` };
    };

    // ---------------------------------------------------------------------
    // awk_video_clean: validate -> classify source video -> decide -> select encoder per node -> build preset.
    // Video-only by design (audio and subtitles are always copied) so it composes with the other awk plugins.
    // ---------------------------------------------------------------------

    // Bail out gracefully on missing/partial probe data rather than a TypeError on the first streams access.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it.');

    // Parse inputs (scope -> tuning -> encoder -> guards). Numeric inputs are free text (parsed + range-checked);
    // only type:'string' dropdowns get an option guard (booleans are coerced by loadDefaultValues, so a guard is dead code).
    const codec = String(inputs.codec || 'hevc').toLowerCase().trim();
    const maxHeightOpt = String(inputs.max_height || 'original').toLowerCase().trim();
    const speed = String(inputs.speed || 'slow').toLowerCase().trim();
    const bitDepthOpt = String(inputs.bit_depth || 'source').toLowerCase().trim();
    const encoderOpt = String(inputs.encoder || 'auto').toLowerCase().trim();
    const guardHdr = String(inputs.guard_hdr || 'abort_dynamic').toLowerCase().trim();
    const guardReprocess = String(inputs.guard_reprocess) === 'true';

    const parseQuality = (v, name) => {
        const n = Number(String(v).trim());
        if (!Number.isFinite(n) || n < 0 || n > 63) failFile(`${name} must be a number between 0 and 63. Check your settings!`);
        return n;
    };
    const qualitySd = parseQuality(inputs.quality_sd, 'quality_sd');
    const quality720 = parseQuality(inputs.quality_720p, 'quality_720p');
    const quality1080 = parseQuality(inputs.quality_1080p, 'quality_1080p');
    const quality4k = parseQuality(inputs.quality_4k, 'quality_4k');
    const guardMinKbps = (() => {
        const n = Number(String(inputs.guard_min_bitrate).trim());
        if (!Number.isFinite(n) || n < 0) failFile('guard_min_bitrate must be a non-negative number (kbps). Check your settings!');
        return n;
    })();

    if (!['hevc', 'h264', 'av1'].includes(codec)) failFile('Somehow invalid codec option provided. Check your settings!');
    if (!['original', '2160', '1440', '1080', '720', '480'].includes(maxHeightOpt)) failFile('Somehow invalid max_height option provided. Check your settings!');
    if (!['slow', 'medium', 'fast'].includes(speed)) failFile('Somehow invalid speed option provided. Check your settings!');
    if (!['source', '8', '10'].includes(bitDepthOpt)) failFile('Somehow invalid bit_depth option provided. Check your settings!');
    if (!['auto', 'nvenc', 'qsv', 'vaapi', 'videotoolbox', 'amf', 'cpu'].includes(encoderOpt)) failFile('Somehow invalid encoder option provided. Check your settings!');
    if (!['abort_dynamic', 'allow_dynamic'].includes(guardHdr)) failFile('Somehow invalid guard_hdr option provided. Check your settings!');

    // Input summary is always logged.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map((s) => summariseStream(enrichStream(s))).join('')}\n`;

    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video.\n';
        response.processFile = false;
        return response;
    }

    try {
        // Primary (non-cover-art) video stream - the one we actually encode.
        const videoStreams = file.ffProbeData.streams.filter((s) => (s.codec_type || '').trim().toLowerCase() === 'video');
        const primary = videoStreams.find((s) => !isCoverArt(s));
        if (!primary) {
            response.infoLog += '☑No encodable video stream found (cover-art / still images only). Nothing to do.\n';
            response.processFile = false;
            return response;
        }

        // Source properties (both probes).
        const mi = mediaInfoFor(primary);
        const srcHeight = Number(primary.height || mi?.Height || 0);
        const srcCodecName = (primary.codec_name || '').toLowerCase().trim();
        const targetCodecName = codec;   // 'hevc' | 'h264' | 'av1' match the ffprobe codec_name
        // Output container is always the source container - clean_and_remux owns container policy; this plugin only re-encodes video (and tags hvc1 for HEVC-in-mp4 below).
        const dstContainer = String(file.container || '').toLowerCase().trim();
        response.container = `.${dstContainer}`;

        // Bit depth: source-detected (raw sample depth, or a 10-bit pixel format / profile), overridable. H.264 is always 8-bit.
        const pixFmt = (primary.pix_fmt || '').toLowerCase();
        const profile = (primary.profile || '').toLowerCase();
        const srcIs10 = Number(primary.bits_per_raw_sample || mi?.BitDepth || 0) >= 10 || pixFmt.includes('10') || profile.includes('10');
        const wantTenbit = codec === 'h264' ? false : (bitDepthOpt === '10' || (bitDepthOpt === 'source' && srcIs10));

        // HDR: ffmpeg auto-propagates the source's colour metadata (primaries/transfer/matrix) to the re-encoded
        // output - verified against the real ffmpeg for libx265/libsvtav1/videotoolbox, including through the
        // scale filter - so static HDR10/HLG survives without any explicit colour flags. Dynamic metadata (Dolby
        // Vision / HDR10+) CANNOT survive a re-encode, so by default such files are left untouched.
        const trc = (primary.color_transfer || '').toLowerCase().trim();
        const isHdr = trc === 'smpte2084' || trc === 'arib-std-b67';
        const hdrFmt = String(mi?.HDR_Format || mi?.HDR_Format_Compatibility || '').toLowerCase();
        const isDynamicHdr = hdrFmt.includes('dolby vision') || hdrFmt.includes('hdr10+') || hdrFmt.includes('smpte st 2094');
        if (isDynamicHdr && guardHdr === 'abort_dynamic') {
            response.infoLog += '☒Dynamic HDR (Dolby Vision / HDR10+) detected - it cannot survive a re-encode, so the file is left untouched. Set guard_hdr to "allow_dynamic" to transcode anyway (keeps only the base HDR10 layer).\n';
            response.processFile = false;
            return response;
        }

        // Resolution / downscale (only ever downscales) and the quality tier for the OUTPUT height.
        const maxH = maxHeightOpt === 'original' ? 0 : Number(maxHeightOpt);
        const willDownscale = maxH > 0 && srcHeight > maxH;
        const outHeight = willDownscale ? maxH : srcHeight;
        const qualityForHeight = (h) => (h <= 576 ? qualitySd : h <= 720 ? quality720 : h <= 1080 ? quality1080 : quality4k);
        const qNorm = qualityForHeight(outHeight || srcHeight);

        // Idempotency signature (codec-quality-maxheight-depth-speed-version), stored as a container-global awk_video tag.
        const videoSig = escMeta([targetCodecName, `q${Math.round(qNorm)}`, `h${maxH || 0}`, wantTenbit ? '10' : '8', `s${speed}`, `v${details().Version}`].join('-'));
        const priorSig = (() => {
            const tags = file.ffProbeData.format?.tags || {};
            const k = Object.keys(tags).find((kk) => kk.toLowerCase() === 'awk_video');   // matroska upper-cases tag keys on write
            return k ? String(tags[k] ?? '').trim() : '';
        })();

        // Guard: constant quality can't predict output size, so skip sources already below the bitrate floor (would risk growth).
        // A pending downscale is exempt - fewer pixels can't grow the file, and skipping here would silently defeat max_height.
        if (guardMinKbps > 0 && !willDownscale) {
            const vbps = resolveStreamBitrate(primary) || 0;
            const vkbps = vbps > 0 ? Math.round(vbps / 1000) : 0;
            if (vkbps > 0 && vkbps < guardMinKbps) {
                response.infoLog += `☑Source video bitrate ${vkbps}k is below guard_min_bitrate ${guardMinKbps}k - already efficient, leaving untouched.\n`;
                response.processFile = false;
                return response;
            }
        }

        // Decide whether a video re-encode is warranted (video-only: container-only or ordering changes are other plugins' jobs).
        const alreadyTargetCodec = srcCodecName === targetCodecName;
        const depthOk = wantTenbit === srcIs10;
        let reason = '';
        if (!alreadyTargetCodec) {
            reason = `codec ${srcCodecName || 'unknown'} -> ${targetCodecName}`;
        } else if (willDownscale) {
            reason = `downscale ${srcHeight}p -> ${outHeight}p`;
        } else if (!depthOk) {
            reason = `bit depth ${srcIs10 ? '10' : '8'} -> ${wantTenbit ? '10' : '8'}`;
        } else if (guardReprocess) {
            if (priorSig !== '' && priorSig === videoSig) {
                response.infoLog += `☑Already processed by awk_video at this setting (${videoSig}). Nothing to do.\n`;
                response.processFile = false;
                return response;
            }
            reason = `reprocess existing ${targetCodecName} to quality target`;
        } else {
            response.infoLog += `☑Video is already ${targetCodecName}${srcHeight ? ` ${srcHeight}p` : ''}${srcIs10 ? ' 10-bit' : ''} and within limits. Nothing to do.\n`;
            response.processFile = false;
            return response;
        }

        // Resolve the encoder for THIS node (auto = best available, else forced with CPU fallback).
        const sel = selectEncoder({ codec, encoderOpt, otherArguments });
        sel.notes.forEach((n) => { response.infoLog += n; });

        // Build the video-encode args + assemble the full preset (<input-side>,<output-side>).
        const enc = buildVideoArgs({ family: sel.family, encoderName: sel.encoderName, codec, qNorm, speed, wantTenbit, willDownscale, outHeight, dstContainer, file });

        let out = `-map 0 -c copy ${enc.videoOut} -c:a copy -c:s copy`;
        for (const s of videoStreams) if (isCoverArt(s)) out += ` -map -0:${s.index}`;   // drop embedded cover-art/still-image "video" streams
        out += ` -metadata "awk_video=${videoSig}"`;
        if (['mp4', 'm4v', 'mov', 'm4a'].includes(dstContainer)) out += ' -movflags use_metadata_tags';   // keep the global tag through an mp4/mov copy
        out += globalOutputOpt;

        response.preset = `${enc.inputSide},${out}`;
        response.processFile = true;
        response.infoLog += `☐Transcoding video: ${reason} @ ${sel.encoderName} q${Math.round(qNorm)}${wantTenbit ? ' 10-bit' : ''}.\n`;
        // Predicted output summary: the re-encoded primary video token, cover-art video dropped, everything else copied unchanged.
        const outVideoToken = `[video:${targetCodecName} ${outHeight || srcHeight}p${wantTenbit ? ' 10bit' : ''}${isHdr ? ' hdr' : ''}]`;
        const outSummary = file.ffProbeData.streams
            .filter((s) => !(isCoverArt(s) && (s.codec_type || '').trim().toLowerCase() === 'video'))
            .map((s) => (s === primary ? outVideoToken : summariseStream(enrichStream(s))))
            .join('');
        response.infoLog += `☑Expected results: ${outSummary}\n`;
        return response;
    } catch (err) {
        return failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
