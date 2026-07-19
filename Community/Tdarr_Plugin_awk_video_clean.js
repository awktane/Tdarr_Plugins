/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_video_clean',
    Stage: 'Pre-processing',
    Name: 'Clean / transcode video - action-gated (codec, resolution, bit-depth, HDR), auto-selecting the best encoder per node.',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Cleans and re-encodes the video stream. Audio and subtitles are copied unchanged (embedded cover-art video is dropped). Pick a top-level ACTION first (see its tooltip for full details) - the plugin does nothing until you choose a goal: hdr_cleanup_only (default, harmless HDR-only pass), normalize (compatibility conversion), shrink (space savings).\n\n
                     -Auto-selects the best available encoder on EACH node at runtime (ffmpeg build + a cheap hardware-presence check), so one plugin works across a mixed Mac/Windows/Linux + dGPU/iGPU/CPU-only fleet. Constant-quality (CRF/CQ) tiered by resolution and normalized across encoders. Adds -tag:v hvc1 for HEVC-in-mp4. An awk_video tag fences re-encode loops.\n\n
                     -Designed to run after clean_and_remux and before/around audio_clean; leave stream ordering to the ordering plugin.\n\n
                     MAJOR UPGRADE - inputs were renamed/reworked, and Tdarr stores settings by input name, so on upgrade these RESET to defaults - re-check your video_clean settings: encoder->method_encoder, speed->method_speed, force_bit_depth->method_bitdepth, max_height->height_cap (value 'original'->'source'), method_hdr->hdr_mode, guard_min_bitrate->guard_shrink_bitrate (now shrink-only); the old preserve_dv is now the guard_dv toggle (default on); guard_reprocess is gone (use action=shrink); codec gained a 'source' value (keep the source codec).\n\n`,
    Version: '2.999.6',
    Tags: 'pre-processing,ffmpeg,video only,hevc,h265,h264,av1,configurable',
    Inputs: [
        {
            name: 'action',
            type: 'string',
            defaultValue: 'hdr_cleanup_only',
            inputUI: {
                type: 'dropdown',
                options: ['normalize', 'shrink', 'hdr_cleanup_only'],
            },
            tooltip: `What this plugin is FOR on this run. Nothing happens until you pick a goal - the default is a harmless HDR-only pass, so set this first, then tune the inputs below for the action you chose.
                \\nhdr_cleanup_only (default, harmless): only hdr_mode is live, and only losslessly - strip_dynamic drops the Dolby Vision / HDR10+ dynamic layer with a plain -c:v copy (no re-encode, base HDR10 kept); anything that can't be done losslessly is skipped. codec / height_cap / bit-depth / quality / encoder are all inert here. A safe do-nothing default.
                \\nnormalize: compatibility conversion. Re-encodes when the source doesn't match your codec / height_cap / hdr_mode target, in EITHER direction (e.g. AV1->HEVC for an old TV, or downscale 4K->1080p). method_bitdepth rides along on whatever else fires but never triggers a re-encode by itself.
                \\nshrink: save space. Re-encodes toward a more efficient codec (efficiency AV1 > HEVC > H.264) and never downgrades efficiency - a request that would (e.g. HEVC on an AV1 source) falls back to a same-codec re-encode gated by guard_shrink_bitrate. Per file, skips anything it can't make smaller (logged, not failed).`,
        },
        {
            name: 'codec',
            type: 'string',
            defaultValue: 'source',
            inputUI: {
                type: 'dropdown',
                options: ['source', 'hevc', 'h264', 'av1'],
            },
            tooltip: `Target video codec. Efficiency (smaller at equal quality): AV1 > HEVC > H.264. Live under normalize / shrink; inert under hdr_cleanup_only.
                \\nsource: keep the source codec (re-encode in place when something else forces it - height_cap / hdr_mode - or, under shrink, a same-codec size pass). A legacy source codec with no encoder (VP9/MPEG-2/VC-1/...) can't be kept through a forced transcode - that file is skipped with a warning to pick hevc/h264/av1.
                \\nhevc (H.265): the efficient default choice - roughly half the bitrate of H.264 at the same quality.
                \\nh264 (AVC): a COMPATIBILITY target only (larger files) for old / weak devices that can't do HEVC. Forced to 8-bit (10-bit H.264 breaks device support). HDR10 in H.264 plays poorly - you'll be warned.
                \\nav1: most efficient, but slow on CPU; hardware AV1 needs a very new GPU (Intel Arc, RTX 40-series, RDNA3), else the libsvtav1 software encoder.
                \\nDolby Vision needs HEVC: with guard_dv on, a DV source is forced to HEVC regardless of this setting (only libx265 carries the DV RPU).`,
        },
        {
            name: 'hdr_mode',
            type: 'string',
            defaultValue: 'preserve',
            inputUI: {
                type: 'dropdown',
                options: ['preserve', 'strip_dynamic', 'tonemap_sdr'],
            },
            tooltip: `How to handle HDR. Static HDR10/HLG colour metadata is always carried through any encode automatically; this controls the dynamic layer (Dolby Vision / HDR10+) and whether to keep HDR at all.
                \\npreserve (recommended): keep HDR as-is. Static HDR10/HLG transcodes normally; Dolby Vision / HDR10+ is protected - with guard_dv on, DV is preserved through a transcode (libx265), and under hdr_cleanup_only nothing is touched.
                \\nstrip_dynamic: drop just the dynamic layer, keep the base HDR10. When it's the ONLY thing to do (no codec/resolution change) this is LOSSLESS - a -c:v copy with a bitstream filter (dovi_rpu / hevc_metadata), no quality cost. Needs a base layer: single-layer DV with no HDR10 base (e.g. profile 5) has nothing to fall back to and is skipped (use tonemap_sdr). Folds into a real transcode if codec/height_cap also fire. Overridden per file by guard_dv (which preserves the DV instead).
                \\ntonemap_sdr: tonemap ALL HDR (static + dynamic) down to SDR (bt709) - always a real re-encode (a pixel operation, never lossless), so NOT valid under action=hdr_cleanup_only. For SDR-only playback: correct colour on non-HDR displays, no per-play server tonemapping. Runs GPU-accelerated on the node's encoder hardware (one consistent look across NVIDIA/Intel/AMD/Apple), CPU fallback otherwise. Lossy and one-way (HDR master discarded); the only safe flatten for a no-base DV. Follows method_bitdepth (source -> 10-bit SDR; set 8 for max compatibility).`,
        },
        {
            name: 'height_cap',
            type: 'string',
            defaultValue: 'source',
            inputUI: {
                type: 'dropdown',
                options: ['source', '2160', '1440', '1080', '720', '480'],
            },
            tooltip: `Cap the output resolution by height (only ever downscales, never upscales). The quality tier is re-derived for the new height. Live under normalize / shrink; inert under hdr_cleanup_only.
                \\nsource: keep the source resolution.
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
            name: 'method_bitdepth',
            type: 'string',
            defaultValue: 'source',
            inputUI: {
                type: 'dropdown',
                options: ['source', '8', '10'],
            },
            tooltip: `Output bit depth. A PARAMETER, not a trigger: it shapes a re-encode that some OTHER input fired, and never causes one on its own (a bit-depth change alone is imperceptible and not worth a lossy pass).
                \\nsource: match the source (10-bit stays 10-bit, 8-bit stays 8-bit). Recommended.
                \\n8 / 10: force it when a re-encode is already happening. H.264 is always 8-bit regardless; Dolby Vision is always 10-bit (guard_dv keeps 10-bit even if you set 8).`,
        },
        {
            name: 'method_encoder',
            type: 'string',
            defaultValue: 'auto',
            inputUI: {
                type: 'dropdown',
                options: ['auto', 'nvenc', 'qsv', 'vaapi', 'videotoolbox', 'amf', 'cpu'],
            },
            tooltip: `Which encoder to use on each node.
                \\nauto (recommended): each node picks the best available encoder for its hardware - GPU workers use the node's GPU (NVENC/QSV/VAAPI/VideoToolbox/AMF) if present, CPU workers and GPU-less nodes use the software encoder.
                \\nA specific value forces that encoder on every node; a node that can't run it (wrong GPU, wrong OS) falls back to the software encoder and logs it. Only pin this on a uniform fleet.
                \\ncpu forces the software encoder (libx265/libx264/libsvtav1) everywhere.`,
        },
        {
            name: 'method_speed',
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
            name: 'guard_dv',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Protect Dolby Vision through a transcode.
                \\ntrue (default): when a DV source is re-encoded, carry the DV RPU through so the output stays Dolby Vision. Forces the libx265 software encoder (only it keeps the RPU; every hardware HEVC encoder drops it, so a GPU/auto node drops to CPU for these files); forces the HEVC codec (overriding your codec choice) and 10-bit; overrides hdr_mode=strip_dynamic/tonemap_sdr for DV files (the DV is preserved, with a warning). HDR10+ can't be carried (no ffmpeg-native path). A no-base DV that libx265 can't re-encode (e.g. an IPT-C2 profile 5) is skipped rather than corrupted.
                \\nfalse: don't protect DV - a transcode that would destroy it still gets skipped under preserve, but strip_dynamic/tonemap_sdr are honoured (the DV layer is dropped/flattened as asked).`,
        },
        {
            name: 'guard_shrink_bitrate',
            type: 'string',
            defaultValue: '1000',
            inputUI: { type: 'text' },
            tooltip: `Applies to action=shrink ONLY: skip the size re-encode when the source video bitrate is already below this (kbps). 0 disables the guard; the default 1000 leaves genuinely lean sources alone (rarely triggers - most content sits well above 1000 kbps at any resolution).
                \\nShrink uses constant quality, which can't predict the output size, so re-encoding an already-lean source can GROW it - this floor prevents that. Example: 2500 skips shrinking anything already under 2500 kbps.
                \\nDoes NOT apply to normalize (a compatibility conversion must run regardless of size). Also exempt even under shrink (these can't grow a file): a height_cap downscale, tonemap_sdr, and the lossless strip_dynamic copy.`,
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

    // ===== SHARED [audio_clean, video_clean]: ffmpeg encoder probe =====
    // -=-=-= parseFfmpegEncoders  [audio_clean, video_clean] =-=-=-
    // Parse `ffmpeg -hide_banner -encoders` stdout into a Set of encoder names. Each encoder row is "<6 flag chars> <name>  <description>" (e.g.
    // " V....D hevc_nvenc  NVIDIA NVENC hevc encoder"); the leading [A-Z.]{6} flag block + whitespace gate the name capture so the banner/header/blank lines are
    // skipped. Shared by video_clean's per-node capability probe (queryCapabilities) and audio_clean's aac_vbr availability check (hasEncoder) so the row-parse
    // regex cannot drift between them; the spawn itself stays at each call site (their surrounding capability objects differ).
    const parseFfmpegEncoders = (stdout) => {
        const set = new Set();
        for (const line of String(stdout || '').split('\n')) {
            const m = line.match(/^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/);   // "<6 flag chars> <name>  <desc>"
            if (m) set.add(m[1]);
        }
        return set;
    };
    // ===== END SHARED: ffmpeg encoder probe =====

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

    // Per-node subprocess probe timeouts (ms). The -encoders capability listing is a static parse and nvidia-smi a quick presence poll, so both are short;
    // each confirm probe actually spawns ffmpeg to encode/tonemap one synthetic frame, so it gets the longest budget.
    const ENCODERS_PROBE_TIMEOUT_MS = 20000;
    const NVIDIA_SMI_TIMEOUT_MS = 8000;
    const CONFIRM_PROBE_TIMEOUT_MS = 25000;

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
            const r = childProcess.spawnSync(ff, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: ENCODERS_PROBE_TIMEOUT_MS });
            cap.encoders = parseFfmpegEncoders(r.stdout);
        } catch (e) { /* leave encoders empty -> everything falls back to CPU */ }
        try {
            const r = childProcess.spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8', timeout: NVIDIA_SMI_TIMEOUT_MS });
            cap.nvidia = r.status === 0 && String(r.stdout || '').trim().length > 0;
        } catch (e) { /* nvidia-smi absent -> no NVIDIA GPU */ }
        try { cap.dri = fs.existsSync('/dev/dri/renderD128'); } catch (e) { cap.dri = false; }
        return cap;
    };

    // One-frame synthetic lavfi test source (256x256) for the confirming HW probes below; only the fill colour varies.
    const testColorSource = (color) => `color=c=${color}:s=256x256:d=1:r=5`;

    // Single lightweight confirming probe (one 256x256 frame) of ONE candidate encoder - used only for the ambiguous
    // families/cases, never as a blind per-codec ladder.
    const confirmEncode = (ffmpegPath, encoderName, inputSide, filter) => {
        let ok = false;
        try {
            const args = ['-hide_banner'];
            if (inputSide) args.push(...inputSide.split(' ').filter(Boolean));
            args.push('-f', 'lavfi', '-i', testColorSource('black'));
            if (filter) args.push('-vf', filter);
            args.push('-frames:v', '1', '-c:v', encoderName, '-f', 'null', '-');
            const r = childProcess.spawnSync(ffmpegPath || 'ffmpeg', args, { encoding: 'utf8', timeout: CONFIRM_PROBE_TIMEOUT_MS });
            ok = r.status === 0;
        } catch (e) { ok = false; }
        return ok;
    };

    // Probe whether a GPU tonemap backend actually initialises on this node (hw device present + filter usable). The
    // tonemap_* filters REJECT a non-HDR input ("unsupported transfer function"), so a plain test pattern false-negatives
    // - the probe stamps a synthetic HDR transfer (smpte2084/bt2020) onto one frame and runs the real island. One frame,
    // cheap; the encoder-side re-upload (vaapi) is not probed here (that device is already proven by the encoder probe).
    const confirmTonemap = (ffmpegPath, backend) => {
        let ok = false;
        try {
            const island = 'format=p010le,setparams=color_trc=smpte2084:color_primaries=bt2020:colorspace=bt2020nc,hwupload,'
                + `tonemap_${backend}=tonemap=bt2390:t=bt709:m=bt709:p=bt709:r=tv:format=nv12,hwdownload,format=nv12`;
            const args = ['-hide_banner', '-init_hw_device', `${backend}=tm`, '-filter_hw_device', 'tm',
                '-f', 'lavfi', '-i', testColorSource('gray'), '-vf', island, '-frames:v', '1', '-f', 'null', '-'];
            const r = childProcess.spawnSync(ffmpegPath || 'ffmpeg', args, { encoding: 'utf8', timeout: CONFIRM_PROBE_TIMEOUT_MS });
            ok = r.status === 0;
        } catch (e) { ok = false; }
        return ok;
    };

    // Route the HDR->SDR tonemap to the GPU filter that rides the chosen encoder's device stack, keeping every node's
    // output in the ONE consistent tonemap_* family (cuda ~= opencl ~= videotoolbox, SSIM ~0.9997 - validated on real
    // NVIDIA/Intel/Mac hardware). CPU 'tonemapx' is the ~0.79-different outlier, used only as a fallback when no GPU
    // tonemap initialises or the encoder is software. nvenc->cuda (native, shares nvenc's driver); qsv/vaapi/amf->opencl
    // (Intel/AMD); videotoolbox->itself. The GPU choice is probe-confirmed per node (falls back to tonemapx if e.g. the
    // OpenCL ICD is absent). Tests inject __awkCap.tonemap.<backend>=false to force the fallback without spawning ffmpeg.
    const TONEMAP_BACKEND = { videotoolbox: 'videotoolbox', nvenc: 'cuda', qsv: 'opencl', vaapi: 'opencl', amf: 'opencl', cpu: 'cpu' };
    const resolveTonemapBackend = ({ family, otherArguments }) => {
        const base = TONEMAP_BACKEND[family] || 'cpu';
        if (base === 'cpu') return 'cpu';
        const inj = otherArguments && otherArguments.__awkCap;
        if (inj) return (inj.tonemap && inj.tonemap[base] === false) ? 'cpu' : base;
        const ffmpegPath = (otherArguments && otherArguments.ffmpegPath) || 'ffmpeg';
        return confirmTonemap(ffmpegPath, base) ? base : 'cpu';
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
    const selectEncoder = ({ codec, encoderOpt, otherArguments, forceCpu }) => {
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
        // Emit the ☒ "falling back to CPU" note for a family, but only when the user explicitly pinned that family (auto tries the rest silently).
        const pushFallbackNote = (family, reason) => {
            if (encoderOpt === family) notes.push(`☒[encoder=${encoderOpt}] ${reason}; using ${ENCODER_NAME[codec].cpu}\n`);
        };
        if (forceCpu) {   // Dolby Vision preservation: HW HEVC encoders drop the RPU, so libx265 is the only option regardless of node/pin
            notes.push(`☐[encoder=${encoderOpt}] Encoder: ${ENCODER_NAME[codec].cpu} (forced for Dolby Vision - hardware encoders drop the RPU)\n`);
            return cpuChoice();
        }

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
                pushFallbackNote(family, `no ${codec} encoder for this family`);
                continue;
            }
            if (!cap.encoders.has(encoderName)) {   // ffmpeg build doesn't ship it (e.g. no nvenc in the Mac build)
                pushFallbackNote(family, `${encoderName} is not in this ffmpeg build on this node`);
                continue;
            }
            const presence = presenceOf(family, cap, platform);
            if (presence === 'no') {
                pushFallbackNote(family, 'hardware not detected on this node');
                continue;
            }
            // Confirm with one probe when presence is ambiguous, and always for AV1 hardware (generation can't be inferred).
            const needProbe = presence === 'probe' || codec === 'av1';
            if (needProbe) {
                const probeIn = family === 'vaapi' ? '-vaapi_device /dev/dri/renderD128' : '';
                const probeFilter = family === 'vaapi' ? 'format=nv12,hwupload' : '';
                if (!confirm(encoderName, probeIn, probeFilter)) {
                    pushFallbackNote(family, `${encoderName} did not initialise on this node`);
                    continue;
                }
            }
            notes.push(`☐[encoder=${encoderOpt}] Encoder: ${encoderName} (${platform}${isGpuWorker ? ' gpu-worker' : ''})\n`);
            return { family, encoderName, notes };
        }

        if (encoderOpt === 'auto' && !isGpuWorker) notes.push(`☐[encoder=${encoderOpt}] Encoder: ${ENCODER_NAME[codec].cpu} (CPU worker)\n`);
        else if (encoderOpt === 'auto') notes.push(`☐[encoder=${encoderOpt}] Encoder: ${ENCODER_NAME[codec].cpu} (no usable GPU encoder on this node)\n`);
        else if (encoderOpt === 'cpu') notes.push(`☐[encoder=${encoderOpt}] Encoder: ${ENCODER_NAME[codec].cpu} (${platform}${isGpuWorker ? ' gpu-worker' : ''})\n`);
        return cpuChoice();
    };

    // ====== PER-ENCODER QUALITY / SPEED / PIXEL-FORMAT TRANSLATION ======
    // One normalized quality target (HEVC-CRF scale, lower = better) mapped to each encoder's native flag so the same
    // setting yields comparable quality on every node. H.264 uses the same number; AV1 is shifted onto the SVT-AV1 /
    // AV1 CQ scale (+8, clamped 0-63) since the same visual quality sits at a higher number there. HW flag syntax
    // mirrors the proven community plugins (Migz nvenc -cq:v, Boosh qsv -global_quality, vaapi -qp, amf -qp_i/-qp_p).
    // VideoToolbox's -q:v is an inverted 1-100 scale (higher = better), opposite the low-is-better HEVC-CRF q; this linear
    // fit maps CRF onto it (intercept = -q:v at CRF 0, pre-clamp; slope = -q:v units dropped per +1 CRF).
    const VT_Q_INTERCEPT = 118;
    const VT_Q_SLOPE = 2.6;
    const nativeQuality = (codec, family, qNorm) => {
        let q = Math.round(qNorm);
        // Clamp to each scale's real range so an out-of-range quality input can't emit a CRF/QP ffmpeg rejects (e.g. libx265 -crf 52 errors). AV1 (libsvtav1
        // CQ) goes 0-63; every other emit - libx264/libx265 -crf, nvenc -cq, qsv -global_quality, vaapi/amf -qp - caps at ~0-51. videotoolbox remaps q anyway.
        if (codec === 'av1') q = Math.max(0, Math.min(63, q + 8));
        else q = Math.max(0, Math.min(51, q));
        switch (family) {
            case 'cpu': return `-crf ${q}`;                                   // libx264 / libx265 / libsvtav1 all take -crf
            case 'nvenc': return `-rc:v vbr -cq:v ${q} -b:v 0`;               // constant-quality NVENC (VBR envelope off)
            case 'qsv': return `-global_quality ${q}`;                        // QSV ICQ
            case 'vaapi': return `-rc_mode CQP -qp ${q}`;                     // VAAPI constant-QP
            case 'amf': return `-rc cqp -qp_i ${q} -qp_p ${q} -qp_b ${q}`;    // AMF constant-QP
            case 'videotoolbox': return `-q:v ${Math.max(1, Math.min(100, Math.round(VT_Q_INTERCEPT - q * VT_Q_SLOPE)))}`; // VT quality 1-100, higher = better
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

    // Map an output height to its resolution tier (SD/720p/1080p/4K, boundaries 576/720/1080), so the CRF ladder
    // (qualityForHeight) and the Dolby-Vision VBV ladder share one set of breakpoints instead of repeating them.
    const heightTier = (h) => (h <= 576 ? 'sd' : h <= 720 ? 'p720' : h <= 1080 ? 'p1080' : 'p4k');

    // Build the video-encode arguments for the chosen encoder: decode-side (input) flags + the output -c:v block
    // (encoder, quality, speed, pixel format, optional scale filter, hvc1 tag). Source colour metadata (incl. static
    // HDR10/HLG) is carried through automatically by ffmpeg - no explicit colour flags needed (verified empirically).
    // Decode is kept on software frames (nvenc via the shared nvdecPreset helper) so a single CPU scale filter and
    // -pix_fmt path work uniformly across families; VAAPI is the exception - it needs its frames uploaded, so it
    // carries an explicit device + format,hwupload filter. Returns { inputSide, videoOut }.
    const buildVideoArgs = ({ family, encoderName, codec, qNorm, speed, want10Bit, willDownscale, outHeight, dstContainer, file, tonemap, tonemapBackend, tonemapSetparams, preserveDv, preserveDvNoBase }) => {
        const { getNvdecHwaccelPreset, getNvenc10BitFormatArg } = require('../methods/nvdecPreset');
        const q = nativeQuality(codec, family, qNorm);
        const spd = nativeSpeed(codec, family, speed);
        let inputSide = '';
        const parts = [`-c:v:0 ${encoderName}`, q, spd];   // :v:0 = encode primary video only; any genuine secondary video stream stays copied
        const vf = [];
        // HDR->SDR tonemap: a GPU backend (cuda/opencl/videotoolbox) runs as an upload->tonemap->download island on its own hw device, landing SOFTWARE frames the
        // family's encoder path consumes unchanged (so it just replaces any family hwaccel-decode); tonemap_* self-tags bt709 (verified). The 'cpu' backend (or a
        // non-tonemap run) uses software tonemapx / no filter. All three GPU backends are one consistent family (resolveTonemapBackend); vaapi is the one two-device
        // case (opencl tonemap + vaapi encode), handled in its own block. The island's :format / download format set output bit depth (p010le vs nv12).
        const outFmt = want10Bit ? 'p010le' : 'nv12';
        const useGpuTm = tonemap && tonemapBackend !== 'cpu';
        const cpuTonemap = 'tonemapx=tonemap=bt2390:transfer=bt709:matrix=bt709:primaries=bt709:range=tv';
        const gpuIsland = `format=p010le,hwupload,tonemap_${tonemapBackend}=tonemap=bt2390:t=bt709:m=bt709:p=bt709:r=tv:format=${outFmt},hwdownload,format=${outFmt}`;
        const tmDevice = `-init_hw_device ${tonemapBackend}=tm -filter_hw_device tm`;   // single-device families: replaces any hwaccel decode (island does the GPU work)
        const scale = (fmt) => {   // optional downscale, then the tonemap island (GPU) or tonemapx (CPU), then an optional trailing format filter
            if (willDownscale) vf.push(`scale=-2:${outHeight}`);
            if (tonemap) vf.push(tonemapSetparams + (useGpuTm ? gpuIsland : cpuTonemap));
            if (fmt) vf.push(fmt);
        };

        if (family === 'nvenc') {
            inputSide = useGpuTm ? tmDevice : getNvdecHwaccelPreset(file, { softwareFrames: true });   // '-hwaccel cuda' (system-memory frames) or '' for software decode
            scale();
            parts.push(useGpuTm ? `-pix_fmt ${want10Bit ? 'p010le' : 'yuv420p'}`
                : (want10Bit ? getNvenc10BitFormatArg(file, { softwareFrames: true }).trim() : '-pix_fmt yuv420p'));
        } else if (family === 'qsv') {
            if (useGpuTm) inputSide = tmDevice;
            scale();
            if (want10Bit) { parts.push('-pix_fmt p010le'); if (codec === 'hevc') parts.push('-profile:v main10'); } else parts.push('-pix_fmt nv12');
        } else if (family === 'vaapi') {
            if (useGpuTm) {   // two devices: opencl tonemaps, frames download to software, then re-upload to vaapi for the encoder (proven on Intel)
                inputSide = '-init_hw_device opencl=ocl -init_hw_device vaapi=va:/dev/dri/renderD128';
                if (willDownscale) vf.push(`scale=-2:${outHeight}`);
                vf.push(`${tonemapSetparams}format=p010le,hwupload=derive_device=opencl,tonemap_opencl=tonemap=bt2390:t=bt709:m=bt709:p=bt709:r=tv:format=${outFmt},hwdownload,format=${outFmt},hwupload=derive_device=vaapi`);
            } else {
                inputSide = '-vaapi_device /dev/dri/renderD128';
                scale(`format=${want10Bit ? 'p010' : 'nv12'}`);
                vf.push('hwupload');
            }
        } else if (family === 'amf') {
            if (useGpuTm) inputSide = tmDevice;
            scale();
            parts.push(want10Bit ? '-pix_fmt p010le' : '-pix_fmt yuv420p');
        } else if (family === 'videotoolbox') {
            if (useGpuTm) inputSide = tmDevice;
            scale();
            parts.push(want10Bit ? '-pix_fmt p010le' : '-pix_fmt yuv420p');
            if (want10Bit && codec === 'hevc') parts.push('-profile:v main10');
        } else {   // cpu
            scale();
            parts.push(`-pix_fmt ${want10Bit ? 'yuv420p10le' : 'yuv420p'}`);
            if (preserveDv) {   // libx265 carries the decoded DV RPU through the encode; x265's DV coding needs VBV/HRD (bare CRF errors -22), so add a generous per-tier VBV ceiling
                const dvVbvKbps = { sd: 10000, p720: 20000, p1080: 40000, p4k: 100000 }[heightTier(outHeight)];
                parts.push('-dolbyvision:v:0 1', '-strict unofficial', `-maxrate:v:0 ${dvVbvKbps}k`, `-bufsize:v:0 ${dvVbvKbps * 2}k`);
            }
        }

        if (codec === 'hevc' && ['mp4', 'm4v', 'mov'].includes(dstContainer)) parts.push(preserveDvNoBase ? '-tag:v:0 dvh1' : '-tag:v:0 hvc1');   // hvc1 = Apple/QuickTime HEVC-in-mp4 (primary only); a no-base DV (e.g. profile 5) needs dvh1 or the DV box is dropped
        const vfArg = vf.length ? ` -filter:v:0 "${vf.join(',')}"` : '';   // :v:0 - filtering a copied secondary video stream would error
        return { inputSide, videoOut: `${parts.filter(Boolean).join(' ')}${vfArg}` };
    };

    // ---------------------------------------------------------------------
    // awk_video_clean: validate -> classify source video -> decide -> select encoder per node -> build preset.
    // Video-only by design (audio and subtitles are always copied) so it composes with the other awk plugins.
    // ---------------------------------------------------------------------

    // Bail out gracefully on missing/partial probe data rather than a TypeError on the first streams access.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Parse inputs (scope -> operations -> tuning -> guards). Numeric inputs are free text (parsed + range-checked);
    // only type:'string' dropdowns get an option guard (booleans are coerced by loadDefaultValues, so a guard is dead code).
    const action = String(inputs.action || 'hdr_cleanup_only').toLowerCase().trim();
    const codec = String(inputs.codec || 'source').toLowerCase().trim();
    const heightCapOpt = String(inputs.height_cap || 'source').toLowerCase().trim();
    const speed = String(inputs.method_speed || 'slow').toLowerCase().trim();
    const bitDepthOpt = String(inputs.method_bitdepth || 'source').toLowerCase().trim();
    const encoderOpt = String(inputs.method_encoder || 'auto').toLowerCase().trim();
    const hdrMode = String(inputs.hdr_mode || 'preserve').toLowerCase().trim();
    const guardDv = String(inputs.guard_dv) !== 'false';   // boolean (loadDefaultValues coerces it), default true

    const parseQuality = (v, name) => {
        const n = Number(String(v).trim());
        if (!Number.isFinite(n) || n < 0 || n > 63) failFile(`[${name}=${v}] must be a number between 0 and 63, check your settings`);
        return n;
    };
    const qualitySd = parseQuality(inputs.quality_sd, 'quality_sd');
    const quality720 = parseQuality(inputs.quality_720p, 'quality_720p');
    const quality1080 = parseQuality(inputs.quality_1080p, 'quality_1080p');
    const quality4k = parseQuality(inputs.quality_4k, 'quality_4k');
    const guardShrinkKbps = (() => {
        const n = Number(String(inputs.guard_shrink_bitrate).trim());
        if (!Number.isFinite(n) || n < 0) failFile(`[guard_shrink_bitrate=${inputs.guard_shrink_bitrate}] must be a non-negative number (kbps), check your settings`);
        return n;
    })();

    if (!['normalize', 'shrink', 'hdr_cleanup_only'].includes(action)) failFile(`[action=${action}] invalid value, check your settings`);
    if (!['source', 'hevc', 'h264', 'av1'].includes(codec)) failFile(`[codec=${codec}] invalid value, check your settings`);
    if (!['source', '2160', '1440', '1080', '720', '480'].includes(heightCapOpt)) failFile(`[height_cap=${heightCapOpt}] invalid value, check your settings`);
    if (!['slow', 'medium', 'fast'].includes(speed)) failFile(`[method_speed=${speed}] invalid value, check your settings`);
    if (!['source', '8', '10'].includes(bitDepthOpt)) failFile(`[method_bitdepth=${bitDepthOpt}] invalid value, check your settings`);
    if (!['auto', 'nvenc', 'qsv', 'vaapi', 'videotoolbox', 'amf', 'cpu'].includes(encoderOpt)) failFile(`[method_encoder=${encoderOpt}] invalid value, check your settings`);
    if (!['preserve', 'strip_dynamic', 'tonemap_sdr'].includes(hdrMode)) failFile(`[hdr_mode=${hdrMode}] invalid value, check your settings`);
    // The one cross-input config error: tonemap_sdr is a pixel-domain re-encode, so it can never satisfy hdr_cleanup_only's lossless-or-skip promise.
    if (hdrMode === 'tonemap_sdr' && action === 'hdr_cleanup_only')
        failFile('[hdr_mode=tonemap_sdr][action=hdr_cleanup_only] tonemapping is always a re-encode (never lossless) - switch to action=normalize or shrink to tonemap, check your settings');

    // Input summary is always logged.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map((s) => summariseStream(enrichStream(s))).join('')}\n`;

    if (file.fileMedium !== 'video') {
        response.infoLog += '☑File is not a video\n';
        response.processFile = false;
        return response;
    }

    try {
        // Primary (non-cover-art) video stream - the one we actually encode.
        const videoStreams = file.ffProbeData.streams.filter((s) => (s.codec_type || '').trim().toLowerCase() === 'video');
        const primary = videoStreams.find((s) => !isCoverArt(s));
        if (!primary) {
            response.infoLog += '☑No encodable video stream found (cover-art / still images only)\n';
            response.processFile = false;
            return response;
        }

        // Source properties (both probes).
        const mi = mediaInfoFor(primary);
        const srcHeight = Number(primary.height || mi?.Height || 0);
        const srcCodecName = (primary.codec_name || '').toLowerCase().trim();
        // Output container is always the source container - clean_and_remux owns container policy; this plugin only re-encodes video (and tags hvc1 for HEVC-in-mp4 below).
        const dstContainer = String(file.container || '').toLowerCase().trim();
        response.container = `.${dstContainer}`;

        // Bit depth: source-detected (raw sample depth, or a 10-bit pixel format / profile), overridable. H.264 is always 8-bit. Shares the is10Bit helper with
        // summariseStream's 10bit token so the re-encode depth decision and the logged token can't drift.
        const srcIs10 = is10Bit(primary, mi);
        const ENCODABLE = ['hevc', 'h264', 'av1'];                       // codecs this plugin has an encoder for (codec=source keeps the source only when it is one of these)
        const EFF = { av1: 3, hevc: 2, h264: 1 };                        // efficiency rank for shrink's never-downgrade rule; a legacy codec (absent here) ranks below every target
        let targetCodecName = codec === 'source' ? srcCodecName : codec; // let: guard_dv forces 'hevc' for a DV file, and shrink's never-downgrade may fall back to the source codec

        // ---- HDR / Dolby Vision detection (both probes) ----
        // ffmpeg auto-propagates static colour metadata (primaries/transfer/matrix) through a re-encode (verified libx265/libsvtav1/videotoolbox, incl. the scale filter), so static HDR10/HLG
        // survives with no explicit colour flags. Dynamic metadata (Dolby Vision / HDR10+) cannot survive a normal re-encode - detected from BOTH probes (mediaInfo HDR_Format + ffprobe
        // DOVI/HDR10+ side_data or a DV codec tag); a single-probe false negative is destructive. isHdr (any HDR incl. static) gates tonemapping; dvSignal is DV specifically (excludes HDR10+).
        const hdrFmt = String(mi?.HDR_Format || mi?.HDR_Format_Compatibility || '').toLowerCase();
        const dvSideData = Array.isArray(primary.side_data_list) ? primary.side_data_list : [];
        const dvCodecTag = /^(dvhe|dvh1|dvav|dva1|dav1)$/.test(String(primary.codec_tag_string || '').toLowerCase().trim());
        const ffprobeDynamicHdr = dvSideData.some((sd) => /dovi|dolby vision|smpte ?2094|hdr dynamic metadata/.test(String(sd?.side_data_type || '').toLowerCase())) || dvCodecTag;
        const isDynamicHdr = hdrFmt.includes('dolby vision') || hdrFmt.includes('hdr10+') || hdrFmt.includes('smpte st 2094') || ffprobeDynamicHdr;
        // DOVI configuration record (ffprobe side_data) -> profile-aware logging. dvLabel names the profile for logs: 8.x carries a compat id (8.1 HDR10 / 8.4 HLG).
        const doviRec = dvSideData.find((sd) => /dovi configuration record/i.test(String(sd?.side_data_type || '')));
        const dovi = doviRec ? { profile: Number(doviRec.dv_profile), compatId: Number(doviRec.dv_bl_signal_compatibility_id), elPresent: doviRec.el_present_flag === 1 } : null;
        const dvLabel = dovi && Number.isFinite(dovi.profile)
            ? `Dolby Vision Profile ${dovi.profile}${dovi.profile === 8 && Number.isFinite(dovi.compatId) ? `.${dovi.compatId}` : ''}${dovi.elPresent ? ' (dual-layer)' : ''}`
            : 'Dolby Vision';
        const dvSignal = !!dovi || dvCodecTag || hdrFmt.includes('dolby vision');   // Dolby Vision specifically (excludes HDR10+)
        const isHdr10Plus = isDynamicHdr && !dvSignal;                              // dynamic HDR that is not DV = HDR10+ (no RPU path; a lossless strip needs HEVC via hevc_metadata)
        const srcXfer = (primary.color_transfer || mi?.transfer_characteristics || '').toLowerCase().trim();
        // The complete set of HDR transfer curves: ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg). Single source for the HDR-curve
        // tests below (isHdr, dvNoBaseLayer, the tonemap setparams gate). summariseStream's shared 'vHdr' token carries a byte-identical copy - keep the two in lockstep.
        const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
        const isHdr = HDR_TRANSFERS.includes(srcXfer) || !!String(mi?.HDR_Format || '').trim() || isDynamicHdr;
        // A single-layer DV whose base carries NO standard HDR transfer (e.g. profile 5's IPT-PQ base): no smpte2084/HLG to fall back to, so neither a lossless strip nor a normal re-encode
        // keeps a valid picture. The transfer - not the DOVI compat id - is the reliable signal (a compat-0 stream that DOES carry a PQ transfer re-encodes fine; profile 7/8/10 carry smpte2084/HLG).
        const dvNoBaseLayer = isDynamicHdr && !HDR_TRANSFERS.includes(srcXfer);

        // ---- Dolby Vision guard (action-aware) ----
        // guard_dv protects DV through a transcode: forces HEVC + libx265 (CPU, below) + 10-bit + RPU passthrough, and overrides a strip_dynamic/tonemap_sdr request for a DV file. INERT under
        // hdr_cleanup_only (a lossless-only action - a deliberate strip there is honoured). Only libx265 carries the RPU, and only from an HEVC source; keys on dvSignal (DV, not HDR10+).
        const guardDvLive = guardDv && action !== 'hdr_cleanup_only';
        const preserveDv = dvSignal && guardDvLive && srcCodecName === 'hevc';
        if (preserveDv) targetCodecName = 'hevc';   // force HEVC (overrides codec / codec=source)
        if (preserveDv && codec !== 'source' && codec !== 'hevc')
            response.infoLog += `☒${streamTag(primary.index)}[codec=${codec}][guard_dv=true] ${dvLabel} - forcing HEVC (only libx265 carries the DV RPU); set guard_dv=false to use ${codec}\n`;
        const dvOverridesHdr = preserveDv && (hdrMode === 'strip_dynamic' || hdrMode === 'tonemap_sdr');   // guard_dv wins: keep the DV, suppress the strip/tonemap request
        const effHdrMode = dvOverridesHdr ? 'preserve' : hdrMode;
        if (dvOverridesHdr)
            response.infoLog += `☒${streamTag(primary.index)}[guard_dv=true][hdr_mode=${hdrMode}] ${dvLabel} - guard_dv keeps the Dolby Vision instead of ${hdrMode === 'tonemap_sdr' ? 'tonemapping to SDR' : 'stripping the dynamic layer'}; set guard_dv=false to ${hdrMode === 'tonemap_sdr' ? 'tonemap' : 'strip'} it\n`;
        const dvIptC2 = preserveDv && (primary.color_space || mi?.matrix_coefficients || '').toLowerCase().trim() === 'ipt-c2';   // libx265 can't re-encode the IPT-C2 matrix - skip below rather than emit an erroring command

        // Resolution / downscale (only ever downscales) + the quality tier for the OUTPUT height. Inert under hdr_cleanup_only.
        const maxH = heightCapOpt === 'source' ? 0 : Number(heightCapOpt);
        const willDownscale = action !== 'hdr_cleanup_only' && maxH > 0 && srcHeight > maxH;
        const outHeight = willDownscale ? maxH : srcHeight;
        const qualityForHeight = (h) => ({ sd: qualitySd, p720: quality720, p1080: quality1080, p4k: quality4k }[heightTier(h)]);
        const qNorm = qualityForHeight(outHeight || srcHeight);

        // tonemap_sdr flattens ALL HDR -> SDR (a real re-encode). effHdrMode is never tonemap_sdr under hdr_cleanup_only (hard-errored) or for a guard-protected DV file. The tonemap runs as a GPU
        // island riding the node's encoder (cuda/opencl/videotoolbox - one consistent family) or CPU tonemapx; the tonemap_* filters emit correct bt709 tags themselves (verified), so no explicit colour flags.
        const tonemap = effHdrMode === 'tonemap_sdr' && isHdr;
        // A tonemap_* filter REJECTS a frame whose decoded transfer isn't a known HDR curve, and the island carries no explicit tags. When HDR is known (mediaInfo / dynamic metadata) but the stream's own
        // transfer is NOT a recognised HDR curve - absent (a stripped VUI) OR present-but-non-HDR (a mislabelled bt2020-10) - stamp the inferred HDR curve onto the island so the filter has a valid HDR input.
        const tonemapSetparams = (tonemap && !HDR_TRANSFERS.includes(srcXfer))
            ? `setparams=color_trc=${/hlg|log-gamma|b67/.test(hdrFmt) ? 'arib-std-b67' : 'smpte2084'}:color_primaries=bt2020:colorspace=bt2020nc,`
            : '';

        // ---- shared emit helpers ----
        const coverArtDrops = videoStreams.filter((s) => isCoverArt(s)).map((s) => ` -map -0:${s.index}`).join('');   // drop embedded cover-art/still-image "video" streams from any output
        const mp4Tag = (cn) => (isMp4Family(dstContainer) ? ({ hevc: ' -tag:v:0 hvc1', av1: ' -tag:v:0 av01', h264: ' -tag:v:0 avc1' }[cn] || '') : '');   // Apple/QuickTime fourCC for a copied/encoded stream
        const keptStreams = () => file.ffProbeData.streams.filter((s) => !(isCoverArt(s) && (s.codec_type || '').trim().toLowerCase() === 'video'));   // input streams minus dropped cover-art video
        // Lossless dynamic-HDR strip: -c:v copy + a bitstream filter, no re-encode. dovi_rpu strips DV (HEVC + AV1); hevc_metadata removes HDR10+ (HEVC only). The stream stays the source
        // codec/res/depth with its HDR10 base retained, so it needs no awk_video fence (once stripped it is no longer dynamic-HDR, so a re-run is a natural no-op). On mp4 the fourCC is reset (dvh1 -> hvc1).
        const emitLosslessStrip = () => {
            const bsf = dvSignal ? 'dovi_rpu=strip=1' : 'hevc_metadata=remove_hdr10plus=1';
            response.infoLog += `☐${streamTag(primary.index)}[hdr_mode=strip_dynamic] Stripping ${dvSignal ? dvLabel : 'HDR10+'} losslessly (-c:v copy, base HDR10 retained)\n`;
            const out = `-map 0 -c copy -bsf:v:0 ${bsf}${coverArtDrops}${mp4Tag(srcCodecName)} -c:a copy -c:s copy${globalOutputOpt}`;
            response.preset = `,${out}`;   // no input-side args
            response.processFile = true;
            response.infoLog += `☑Expected results: ${keptStreams().map((s) => summariseStream(enrichStream(s))).join('')}\n`;
            return response;
        };

        // ================= decide, gated by action =================
        if (action === 'hdr_cleanup_only') {
            // Only hdr_mode is live; codec / height_cap / bit-depth / encoder inert. Lossless-or-skip.
            if (hdrMode === 'preserve') {
                response.infoLog += `☑${streamTag(primary.index)}[action=hdr_cleanup_only] ${isDynamicHdr ? `${dvSignal ? dvLabel : 'HDR10+'} left untouched (preserve)` : 'Nothing to clean up (preserve)'}\n`;
                response.processFile = false;
                return response;
            }
            if (!isDynamicHdr) {   // hdrMode === 'strip_dynamic'
                response.infoLog += `☑${streamTag(primary.index)}[hdr_mode=strip_dynamic] No dynamic HDR (Dolby Vision / HDR10+) to strip - left untouched\n`;
                response.processFile = false;
                return response;
            }
            if (dvNoBaseLayer) {
                response.infoLog += `☒${streamTag(primary.index)}[hdr_mode=strip_dynamic] ${dvLabel} has no HDR10 base layer - can't strip losslessly; switch to action=normalize or shrink with hdr_mode=tonemap_sdr to flatten it to SDR\n`;
                response.processFile = false;
                return response;
            }
            if (isHdr10Plus && srcCodecName !== 'hevc') {
                response.infoLog += `☒${streamTag(primary.index)}[hdr_mode=strip_dynamic] HDR10+ in ${srcCodecName || 'this codec'} has no lossless strip path (needs HEVC) - left untouched; use action=normalize/shrink to re-encode it away\n`;
                response.processFile = false;
                return response;
            }
            return emitLosslessStrip();
        }

        // ---- action = normalize | shrink (real-transcode capable) ----
        // Resolve the codec trigger + final target codec. depth is a PARAMETER (never a trigger). height_cap + tonemap are triggers/levers in both actions.
        const heightTrigger = willDownscale;
        const tonemapTrigger = tonemap;
        let codecTrigger = false;
        if (action === 'normalize') {
            codecTrigger = ENCODABLE.includes(targetCodecName) && srcCodecName !== targetCodecName;   // fire on a mismatch either direction; codec=source never mismatches
        } else {   // shrink: upgrade to a more efficient codec, else a same-codec size pass; never downgrade efficiency
            const srcEff = EFF[srcCodecName] || 0;
            if (codec !== 'source' && (EFF[codec] || 0) > srcEff && !preserveDv) {
                codecTrigger = true;   // upgrade (targetCodecName already = codec)
            } else {
                if (codec !== 'source' && (EFF[codec] || 0) < srcEff && !preserveDv)
                    response.infoLog += `☒${streamTag(primary.index)}[action=shrink][codec=${codec}] ${codec} is less efficient than the source ${srcCodecName} - never downgrading; re-encoding as ${srcCodecName} to shrink instead\n`;
                targetCodecName = preserveDv ? 'hevc' : srcCodecName;                 // same-codec size pass (guard_dv still forces hevc for DV)
                codecTrigger = ENCODABLE.includes(targetCodecName);                    // a legacy same-codec pass can't encode - caught by the !canEncodeTarget skip below
            }
        }
        // Final output bit depth - computed only AFTER targetCodecName is fully resolved (the guard_dv override above and shrink's never-downgrade fallback can each
        // still change it), so the 'h264 has no 10-bit encoder here' rule keys on the ACTUAL output codec, not the provisional one. Every other target follows
        // method_bitdepth (10 / source-depth); guard_dv then forces 10-bit for a DV file since an 8-bit output would break the Dolby Vision.
        let want10Bit = targetCodecName === 'h264' ? false : (bitDepthOpt === '10' || (bitDepthOpt === 'source' && srcIs10));
        if (preserveDv && !want10Bit) {
            response.infoLog += `☒${streamTag(primary.index)}[method_bitdepth=${bitDepthOpt}][guard_dv=true] Dolby Vision requires 10-bit - keeping 10-bit output (ignoring the 8-bit request)\n`;
            want10Bit = true;
        }
        // guard_shrink_bitrate gates SHRINK's efficiency re-encode only (a CQ re-encode of an already-lean file can grow it). normalize is compatibility-driven - it must convert regardless of size - and
        // height_cap / tonemap / the lossless strip are always exempt (requested transforms that can't grow a file).
        let belowFloorKbps = 0;
        if (action === 'shrink' && codecTrigger && guardShrinkKbps > 0) {
            const vkbps = Math.round((resolveStreamBitrate(primary) || 0) / 1000);
            if (vkbps > 0 && vkbps < guardShrinkKbps) { codecTrigger = false; belowFloorKbps = vkbps; }
        }
        const realTranscode = codecTrigger || heightTrigger || tonemapTrigger;
        const canEncodeTarget = ENCODABLE.includes(targetCodecName);

        // Idempotency fence: a settings fingerprint stored as a container-global awk_video tag. Essential for shrink (a constant-quality same-codec re-encode would otherwise re-shrink every pass -
        // a generational death spiral); harmless for normalize (which only fires on a mismatch and is self-limiting). action is in the core so a normalize-tagged file isn't wrongly fenced under shrink.
        // The plugin version is appended for forensics but is NOT part of the match (like audio_clean's awk_loudnorm), so a version bump never invalidates the fence.
        const videoSigCore = escMeta([action, targetCodecName, `q${Math.round(qNorm)}`, `h${maxH || 0}`, want10Bit ? '10' : '8', `s${speed}`,
            ...(effHdrMode === 'tonemap_sdr' ? ['sdr'] : []), ...(effHdrMode === 'strip_dynamic' ? ['strip'] : []), ...(preserveDv ? ['dv'] : [])].join('-'));
        const videoSig = `${videoSigCore}-v${escMeta(details().Version)}`;
        const priorSig = getTagCI(file.ffProbeData.format?.tags || {}, 'awk_video').trim();
        const alreadyFenced = priorSig !== '' && priorSig.replace(/-v[^-]*$/, '') === videoSigCore;   // core only; the stored -v<version> suffix is forensic, not part of the fence

        // Build the transcode preset (encoder resolved per node) + the predicted output summary.
        const emitTranscode = (encodeTag) => {
            if (preserveDv) response.infoLog += `☐${streamTag(primary.index)}[guard_dv=true] ${dvLabel} - keeping the DV RPU through the re-encode (libx265)\n`;
            if (preserveDv && encoderOpt !== 'auto' && encoderOpt !== 'cpu')
                response.infoLog += `☒${streamTag(primary.index)}[method_encoder=${encoderOpt}][guard_dv=true] Forced encoder overridden to ${ENCODER_NAME[targetCodecName].cpu} - ${encoderOpt} would drop the Dolby Vision RPU\n`;
            const sel = selectEncoder({ codec: targetCodecName, encoderOpt, otherArguments, forceCpu: preserveDv });
            sel.notes.forEach((n) => { response.infoLog += n; });
            const tonemapBackend = tonemap ? resolveTonemapBackend({ family: sel.family, otherArguments }) : null;
            if (tonemap) response.infoLog += tonemapBackend === 'cpu'
                ? `☒${streamTag(primary.index)}[hdr_mode=tonemap_sdr] Tonemapping HDR -> SDR on CPU (tonemapx) - no GPU tonemap available on this node; result may differ slightly from GPU-tonemapped nodes\n`
                : `☐${streamTag(primary.index)}[hdr_mode=tonemap_sdr] Tonemapping HDR -> SDR via ${tonemapBackend} (GPU-accelerated)\n`;
            // No cross-compatible base (compat id 0 / no surviving HDR transfer, e.g. profile 5): the mp4 output needs the dvh1 tag - hvc1 drops the DV box entirely; a stream WITH a base keeps hvc1.
            const preserveDvNoBase = preserveDv && (dvNoBaseLayer || (!!dovi && dovi.compatId === 0));
            const enc = buildVideoArgs({ family: sel.family, encoderName: sel.encoderName, codec: targetCodecName, qNorm, speed, want10Bit, willDownscale, outHeight, dstContainer, file, tonemap, tonemapBackend, tonemapSetparams, preserveDv, preserveDvNoBase });
            let out = `-map 0 -c copy ${enc.videoOut} -c:a copy -c:s copy${coverArtDrops} -metadata "awk_video=${videoSig}"`;
            if (isMp4Family(dstContainer)) out += ' -movflags use_metadata_tags';   // keep the global tag through an mp4/mov copy
            out += globalOutputOpt;
            response.preset = `${enc.inputSide},${out}`;
            response.processFile = true;
            response.infoLog += `☐${streamTag(primary.index)}${encodeTag} Transcoding video @ ${sel.encoderName} q${Math.round(qNorm)}\n`;
            // Predict the re-encoded stream through the shared summariseStream (single source of truth for the [video:...] token) so Expected-results matches the input-summary format; depth is exact
            // via bits_per_raw_sample with pix_fmt/profile cleared, and a tonemapped output is SDR (bt709, detached mediaInfo so no 'hdr' token).
            const outStream = { ...primary, codec_name: targetCodecName, height: outHeight || srcHeight, bits_per_raw_sample: want10Bit ? 10 : 8, pix_fmt: '', profile: '' };
            if (tonemap) { outStream.color_transfer = 'bt709'; outStream.index = -1; }
            const outVideoToken = summariseStream(outStream);
            response.infoLog += `☑Expected results: ${keptStreams().map((s) => (s === primary ? outVideoToken : summariseStream(enrichStream(s)))).join('')}\n`;
            return response;
        };

        // Skips that a pending real transcode would otherwise turn destructive.
        if (realTranscode && !canEncodeTarget) {   // codec=source resolved to a legacy codec with no encoder, but height_cap/tonemap force a transcode
            response.infoLog += `☒${streamTag(primary.index)}[codec=source] Source codec ${srcCodecName || 'unknown'} has no encoder - can't keep it through the ${heightTrigger ? 'downscale' : 'tonemap'}; set codec=hevc/h264/av1 to convert it\n`;
            response.processFile = false;
            return response;
        }
        if (realTranscode && dvIptC2) {
            response.infoLog += `☒${streamTag(primary.index)}[guard_dv=true] ${dvLabel} uses the IPT-C2 colour matrix that libx265 cannot re-encode - left untouched; set guard_dv=false and hdr_mode=tonemap_sdr to flatten it to SDR\n`;
            response.processFile = false;
            return response;
        }
        if (realTranscode && effHdrMode === 'strip_dynamic' && dvNoBaseLayer) {
            response.infoLog += `☒${streamTag(primary.index)}[hdr_mode=strip_dynamic] ${dvLabel} has no HDR10 base layer - a re-encode would leave a mis-coloured picture with no HDR fallback, left untouched; set hdr_mode=tonemap_sdr to flatten it to SDR\n`;
            response.processFile = false;
            return response;
        }
        if (realTranscode && isDynamicHdr && !preserveDv && effHdrMode === 'preserve') {   // a transcode would drop the unprotected dynamic layer - protect it by skipping
            response.infoLog += `☒${streamTag(primary.index)}[hdr_mode=preserve] ${dvSignal ? dvLabel : 'HDR10+'} can't survive a re-encode - left untouched to protect it; ${dvSignal ? 'enable guard_dv to carry the Dolby Vision through, or ' : ''}set hdr_mode=strip_dynamic (keep the HDR10 base) or hdr_mode=tonemap_sdr (flatten to SDR)\n`;
            response.processFile = false;
            return response;
        }

        if (realTranscode) {
            if (alreadyFenced) {
                response.infoLog += `☑${streamTag(primary.index)}[action=${action}] Already processed by awk_video at this exact setting (${videoSig}) - left untouched\n`;
                response.processFile = false;
                return response;
            }
            const reasonTags = [
                srcCodecName !== targetCodecName && targetCodecName,   // codec change
                willDownscale && `${outHeight}p`,
                want10Bit !== srcIs10 && (want10Bit ? '10-bit' : '8-bit'),   // depth piggybacks a transcode fired by something else
                tonemap && 'tonemap_sdr',
            ].filter(Boolean);
            if (reasonTags.length === 0) reasonTags.push('shrink');   // a same-codec shrink with no other visible transform
            return emitTranscode(`[${reasonTags.join('][')}]`);
        }

        // ---- no real transcode: a lossless strip, a bitrate skip, or a benign no-op ----
        if (effHdrMode === 'strip_dynamic' && isDynamicHdr) {   // strip_dynamic is the sole reason - do it losslessly (or skip when it can't be lossless)
            if (dvNoBaseLayer) {
                response.infoLog += `☒${streamTag(primary.index)}[hdr_mode=strip_dynamic] ${dvLabel} has no HDR10 base layer - can't strip losslessly; set hdr_mode=tonemap_sdr to flatten it to SDR\n`;
                response.processFile = false;
                return response;
            }
            if (isHdr10Plus && srcCodecName !== 'hevc') {
                response.infoLog += `☒${streamTag(primary.index)}[hdr_mode=strip_dynamic] HDR10+ in ${srcCodecName || 'this codec'} has no lossless strip path (needs HEVC) - left untouched\n`;
                response.processFile = false;
                return response;
            }
            return emitLosslessStrip();
        }
        if (belowFloorKbps > 0) {
            response.infoLog += `☑${streamTag(primary.index)}[guard_shrink_bitrate=${guardShrinkKbps}] Source video bitrate ${belowFloorKbps}k is below the ${guardShrinkKbps}k floor - already efficient, left untouched\n`;
            response.processFile = false;
            return response;
        }
        if (action === 'shrink') {
            response.infoLog += `☑${streamTag(primary.index)}[action=shrink] Nothing to shrink - ${canEncodeTarget ? `already ${srcCodecName}${srcHeight ? ` ${srcHeight}p` : ''} at the target and no more-efficient codec selected` : `source codec ${srcCodecName || 'unknown'} has no encoder (set codec=hevc/h264/av1 to convert it)`}\n`;
            response.processFile = false;
            return response;
        }
        response.infoLog += `☑${streamTag(primary.index)}[action=normalize] Video is already ${targetCodecName}${srcHeight ? ` ${srcHeight}p` : ''}${srcIs10 ? ' 10-bit' : ''} and within limits\n`;
        response.processFile = false;
        return response;
    } catch (err) {
        return failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
