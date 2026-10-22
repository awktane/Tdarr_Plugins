// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_video_clean',
    Stage: 'Pre-processing',
    Name: 'Clean / transcode video - action-gated (codec, resolution, bit-depth, HDR), auto-selecting the best encoder per node.',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Cleans and re-encodes the video stream. Audio and subtitles are copied unchanged (embedded cover-art video is dropped).
                     Pick a top-level ACTION first (see its tooltip for full details) - the plugin does nothing until you choose a goal:
                     hdr_cleanup_only (default, harmless HDR-only pass), normalize (compatibility conversion), shrink (space savings).\n\n
                     -Auto-selects the best available encoder on EACH node at runtime (ffmpeg build + a cheap hardware-presence check), so one
                     plugin works across a mixed Mac/Windows/Linux + dGPU/iGPU/CPU-only fleet. Constant-quality (CRF/CQ) tiered by resolution
                     and normalized across encoders. Adds -tag:v hvc1 for HEVC-in-mp4. An awk_video tag fences re-encode loops.\n\n
                     -Designed to run after clean_and_remux and before/around audio_clean; leave stream ordering to the ordering plugin. If the file carries
                     embedded closed captions, run sub_worker BEFORE this plugin - re-encoding is the one thing that destroys them (see guard_captions).\n\n`,
    Version: '3.999.69',
    Tags: 'pre-processing,ffmpeg,video only,hevc,h265,h264,av1,configurable',
    Inputs: [
        {
            name: 'action',
            type: 'string',
            defaultValue: 'hdr_cleanup_only',
            inputUI: {
                type: 'dropdown',
                options: ['hdr_cleanup_only', 'normalize', 'shrink'],
            },
            tooltip: `What this plugin is FOR on this run. Nothing happens until you pick a goal, so set this first and then tune the inputs below for
                the action you chose.
                \\n=====
                \\nActions
                \\n=====
                \\nhdr_cleanup_only (default, harmless): only hdr_mode is live, and only where it can act losslessly - strip_dynamic drops the Dolby
                Vision / HDR10+ dynamic layer with a plain -c:v copy, keeping the base HDR10, and anything that cannot be done losslessly is skipped.
                codec, downscale, deinterlace, bit depth, quality and encoder are all inert. A safe do-nothing default.
                \\nnormalize: compatibility conversion. Re-encodes whenever the source does not match your codec, downscale or hdr_mode target, in
                EITHER direction - AV1 to HEVC for an old TV, or 4K down to 1080p. method_bitdepth rides along on whatever else fires but never triggers
                a re-encode by itself.
                \\nshrink: save space. Re-encodes toward a more efficient codec (AV1 > HEVC > H.264) and never downgrades efficiency - a request that
                would, such as HEVC on an AV1 source, falls back to a same-codec re-encode gated by guard_shrink_bitrate. Anything it cannot make smaller
                is skipped for that file and logged, not failed.`,
        },
        {
            name: 'codec',
            type: 'string',
            defaultValue: 'source',
            inputUI: {
                type: 'dropdown',
                options: ['source', 'hevc', 'h264', 'av1'],
            },
            tooltip: `Target video codec. Efficiency, meaning smaller at equal quality: AV1 > HEVC > H.264. Live under normalize and shrink; inert under
                hdr_cleanup_only.
                \\n=====
                \\nActions
                \\n=====
                \\nsource (default): keep the source codec, re-encoding in place only when something else forces it - downscale, hdr_mode or deinterlace,
                or a same-codec size pass under shrink. This plugin only encodes HEVC, H.264 and AV1, so any other source codec (VP9, MPEG-2, VC-1,
                VVC/H.266) cannot be kept through a forced transcode; that file is skipped with a warning to pick one.
                \\nhevc (H.265): the recommended target - roughly half the bitrate of H.264 at the same quality.
                \\nh264 (AVC): a COMPATIBILITY target only, and a larger file, for old or weak devices that cannot do HEVC. Forced to 8-bit, since 10-bit
                H.264 breaks device support. HDR10 plays poorly in H.264, so prefer hevc for an HDR source.
                \\nav1: the most efficient, but slow on CPU. Hardware AV1 needs a very new GPU (Intel Arc, RTX 40-series, RDNA3); otherwise the libsvtav1
                software encoder does it.
                \\nDolby Vision needs HEVC: with guard_dv enabled, a DV source that is already HEVC stays HEVC whatever you set here, because only libx265
                carries the DV RPU and only from an HEVC source.`,
        },
        {
            name: 'deinterlace',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'enabled'],
            },
            tooltip: `Repair interlaced (combed) video. Old TV material stores each frame as two half-pictures captured a fraction of a second apart,
                which show as comb teeth on any modern display. Live under normalize and shrink; inert under hdr_cleanup_only, since a pixel change is
                never lossless.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): leave interlaced video alone.
                \\nenabled: detect and repair, keeping everything the file contains.
                \\nRepairing before any downscale is the whole point: shrinking combed video blends the two half-pictures into each other permanently, and
                no later pass can undo it.
                \\nYou are not asked which kind of source it is - that is detected from the actual pixels, because containers routinely mislabel it, and
                the two kinds need opposite repairs. Material SHOT on video (sport, news, soaps, camcorders) has no original full frame to recover, so the
                missing lines are interpolated and every half-picture becomes a frame of its own: 1080i60 comes out as 60fps, keeping all the motion the
                file actually holds. Material shot on FILM and padded out for broadcast (nearly every film DVD, much anime) still contains its original
                frames intact, so those are rebuilt exactly and come back at their own 24fps with nothing invented.
                \\nShot-on-video output therefore costs roughly a third more bitrate and half again the encode time; film-originated and already-progressive
                video are unaffected, so on a mixed library this touches only a small slice of it.`,
        },
        {
            name: 'downscale',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', '2160', '1440', '1080', '720'],
            },
            tooltip: `Fit the output inside the 16:9 frame this names - 1080 means 1920x1080, not a height of 1080. It only ever downscales, never
                upscales, and the quality tier is re-derived for the new height. Live under normalize and shrink; inert under hdr_cleanup_only.
                \\ndisabled (default): keep the source resolution.
                \\n1080 fits anything larger into 1920x1080 - the classic "shrink 4K to 1080p to save space". 720 does the same at 1280x720, while 2160
                and 1440 only shrink sources larger than their own frame. Cinema geometry is fitted by WIDTH too, so a 4096x1716 scope master lands
                1920x804 instead of staying 2578 wide, and a 2048x858 DCI 2K master is fitted too - it overflows the 1920x1080 box by width, though
                858 <= 1080.`,
        },
        {
            name: 'hdr_mode',
            type: 'string',
            defaultValue: 'preserve',
            inputUI: {
                type: 'dropdown',
                options: ['preserve', 'strip_dynamic', 'tonemap_sdr'],
            },
            tooltip: `How to handle HDR. Static HDR10/HLG colour metadata is always carried through any encode automatically; this controls the dynamic
                layer - Dolby Vision, HDR10+ and HDR Vivid - and whether to keep HDR at all.
                \\n=====
                \\nActions
                \\n=====
                \\npreserve (default, recommended): keep HDR as it is. Static HDR10/HLG transcodes normally, and Dolby Vision / HDR10+ / HDR Vivid is
                protected - with guard_dv enabled, DV survives a transcode via libx265, and under hdr_cleanup_only nothing is touched at all.
                \\nstrip_dynamic: drop just the dynamic layer and keep the base HDR10. When that is the ONLY thing to do, with no codec or resolution
                change, it is LOSSLESS - a -c:v copy with a bitstream filter, at no quality cost - and it folds into a real transcode if codec or
                downscale also fire. Overridden per file by guard_dv, which preserves the DV instead.
                \\ntonemap_sdr: tonemap ALL HDR, static and dynamic, down to SDR (bt709). Always a real re-encode, being a pixel operation, so it is NOT
                valid under hdr_cleanup_only. Use it for SDR-only playback: correct colour on non-HDR displays, and no per-play tonemapping by the server.
                It runs GPU-accelerated on the node's encoder hardware, for one consistent look across NVIDIA, Intel, AMD and Apple, falling back to the
                CPU otherwise. Lossy and one-way, since the HDR master is discarded, and it follows method_bitdepth - source gives 10-bit SDR, set 8 for
                maximum compatibility.
                \\nstrip_dynamic needs a base layer to fall back to, so it skips two cases: a single-layer DV carrying no HDR10 base (profile 5), and HDR
                Vivid (CUVA), which no bitstream filter in this ffmpeg can remove at all. For either, tonemap_sdr - or a re-encode under normalize/shrink -
                is the only way to be rid of the dynamic layer.`,
        },
        {
            name: 'quality_sd',
            type: 'string',
            defaultValue: '21',
            inputUI: { type: 'text' },
            tooltip: `Constant-quality target for SD output, meaning a height of 576 or less. HEVC-CRF scale: lower gives higher quality and a bigger
                file, higher gives a smaller one. Typical range 18-28.
                \\nThe number is used as-is for HEVC and H.264 and shifted onto the AV1 scale automatically, then mapped to whatever the chosen encoder
                calls it (libx265 -crf, NVENC -cq, QSV -global_quality, VAAPI -qp, and so on).`,
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
            tooltip: `Output bit depth. A PARAMETER, not a trigger: it shapes a re-encode some OTHER input fired and never causes one by itself, a
                bit-depth change alone being imperceptible and not worth a lossy pass.
                \\nsource (default, recommended): match the source - 10-bit stays 10-bit, 8-bit stays 8-bit.
                \\n8 or 10 force the depth when a re-encode is already happening. H.264 is always 8-bit regardless, and Dolby Vision is always 10-bit, so
                guard_dv keeps 10-bit even if you set 8.`,
        },
        {
            name: 'method_encoder',
            type: 'string',
            defaultValue: 'node',
            inputUI: {
                type: 'dropdown',
                options: ['node', 'node_strict', 'auto', 'cpu'],
            },
            tooltip: `Which encoder each node uses. To pin a specific encoder to a node (nvenc, qsv, vaapi, videotoolbox, amf), set it at the NODE level -
                Tdarr's "GPU worker hardware type" for that node - rather than here, so a mixed fleet keeps its per-node choice instead of being forced
                onto one encoder everywhere.
                \\nBefore each transcode the encoder is test-encoded on a short sample of the file itself, at its real size and bit depth - the CPU encoder
                too, and no setting turns the test off. One that fails or stalls there hands the file to the next encoder instead of failing the job, and the
                test also estimates the encode time (its cost and the limit: see guard_encode_hours).
                \\n=====
                \\nActions
                \\n=====
                \\nnode (default, recommended): follow the node's own "GPU worker hardware type". Set to a specific encoder it uses that, otherwise
                falling back to software; set to "any" it test-encodes every GPU encoder the node has on each file, logs each result, and uses the first
                that passes in this node's order, else software. That order is fixed per platform, not ranked by quality: nvenc, qsv, vaapi (once per Intel
                or AMD render node), amf on Linux; nvenc, qsv, amf on Windows. CPU workers always use software. So each node uses the encoder you assigned
                it - push jobs onto an idle iGPU (qsv), say, and keep a discrete GPU free.
                \\nnode_strict: as node, but ERROR the file rather than use the software encoder - for a node whose CPU is reserved for other work, or when
                a GPU job must never land on the CPU quietly. On an "any" node a GPU encoder that fails its test encode, is busy, or would drop closed
                captions that guard_captions is keeping hands the file to the next GPU encoder, and the file errors only when none is left; on a node set to
                one encoder its failure errors the file (vaapi tries each Intel or AMD render node first). An AV1 target warns about the captions and
                continues instead - see guard_captions. Dolby Vision still uses software to preserve its metadata, CPU workers still use software, and a
                node hardware type this plugin cannot drive (rkmpp, for one) errors.
                \\nauto: ignore the node's hardware type and test every encoder its hardware offers, as node does on an "any" node, else software.
                \\ncpu: force the software encoder (libx265, libx264, libsvtav1) everywhere.`,
        },
        {
            name: 'method_speed',
            type: 'string',
            defaultValue: 'slow',
            inputUI: {
                type: 'dropdown',
                options: ['slow', 'medium', 'fast'],
            },
            tooltip: `Encoder speed against efficiency. A slower setting spends more CPU or GPU time to reach a smaller file at the same quality.
                \\nMaps to each encoder's own preset (libx265 slow/medium/fast, libsvtav1 4/6/8, NVENC p7/p5/p3, QSV veryslow/medium/veryfast, and so on).
                VAAPI and VideoToolbox have no comparable control and ignore this.`,
        },
        {
            name: 'guard_captions',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'enabled'],
            },
            tooltip: `Protect embedded closed captions through a transcode. These are not a subtitle track - they ride inside the video bitstream itself
                    (A53/EIA-608, common on North American broadcast recordings), so re-encoding is the one thing that can destroy them, and only some
                    encoders can carry them across.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): do not look and do not protect. Wherever the chosen encoder cannot carry captions they are lost silently - a QSV or AMF
                node, an Apple VideoToolbox (Mac) encoder, or any AV1 target that is not on an NVIDIA GPU. They ride through untouched on the encoders that
                keep them: libx264 and libx265, the NVENC and VAAPI encoders for H.264 and HEVC, and NVENC for AV1.
                \\nenabled: check whether this file really has captions and, if it does, keep them. Where the chosen encoder would drop them, the encode moves
                to one that keeps them - another GPU encoder on this node where method_encoder tests several (auto, or an "any" node), else the CPU:
                libx264 for an H.264 target, libx265 for HEVC, which is slower than the GPU. Under node_strict, which never uses the CPU, a file that only
                the CPU could keep them for errors instead. AV1 has no caption-carrying CPU encoder, so an AV1 target that lands on a dropping encoder is
                warned about and continues rather than silently changing your codec.
                \\nCaptions are better handled by lifting them into a real subtitle track - run sub_worker BEFORE this plugin. Once it has, this guard
                steps aside and the leftover bitstream copy is removed on the next re-encode, so you do not end up with the same captions twice.
                \\nThe check costs one bounded ffprobe read per candidate file, a few seconds whether the file is a clip or a feature, and is skipped
                entirely when the answer could not change anything - when the chosen encoder already carries captions (named under disabled above).
                \\nA caption channel that is present but carries no text still counts as captions here, since telling the two apart needs a full decode.
                That costs a needless CPU encode, never data. Running sub_worker's embedded_cc over the file settles it permanently: it records what it
                found, and this guard then stops re-checking that file.`,
        },
        {
            name: 'guard_dv',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled', 'disabled'],
            },
            tooltip: `Protect Dolby Vision through a transcode.
                \\n=====
                \\nActions
                \\n=====
                \\nenabled (default): carry the DV RPU through a re-encode so the output stays Dolby Vision. To manage that it forces the libx265 software
                encoder, the HEVC codec (overriding your codec choice) and 10-bit, and it overrides hdr_mode=strip_dynamic or tonemap_sdr on DV files,
                preserving the DV with a warning.
                \\ndisabled: do not protect DV. A transcode that would destroy it is still skipped under hdr_mode=preserve, but strip_dynamic and tonemap_sdr
                are honoured, and the DV layer is dropped or flattened as asked.
                \\nOnly an HEVC source qualifies: libx265 is the sole encoder that carries the RPU, and only from HEVC, so DV in any other codec (AV1,
                say) is not protected here. Since every hardware HEVC encoder drops the RPU, a GPU or auto node falls back to the CPU for these files.
                \\nNeither HDR10+ nor HDR Vivid can be carried, there being no ffmpeg-native path for either. A no-base DV that libx265 cannot re-encode,
                such as an IPT-C2 profile 5, is skipped rather than corrupted.`,
        },
        {
            name: 'guard_encode_hours',
            type: 'string',
            defaultValue: '12',
            inputUI: { type: 'text' },
            tooltip: `Skip an encoder that would take longer than this many hours to transcode the file on this node, and ERROR the file when every encoder
                would. 0 means no limit; a cleared field means the default of 12.
                \\nThe estimate comes from the test encode each candidate encoder gets before the transcode (see method_encoder): samples of 10 s on a GPU
                encoder and of up to a minute on the CPU, one sample when the estimate is far from this limit and up to five when it is close - so up to
                about five minutes on the CPU. At 0 the test still runs, one sample per encoder (30 s on the CPU). The estimate is checked ONCE, before the
                encode starts, and is not a timer on the encode itself. It reflects the node's load at that moment: one sample can be about 40% off on the
                CPU, or run about 55% over on a busy GPU node, and five pooled samples narrow that to about 15% and 30%.
                \\nThe default of 12 h lets a feature-length 4K film run on the CPU of a current machine - libx265 at method_speed=slow encodes a 4K
                output at about 5 fps (measured on an Apple M1), about 9-11 h for a 2 h film - and stops what would take days: 4K or 8K on an old CPU (a
                Celeron J4125 manages about 0.7 fps at 1080p), or a 4K film much over 2 h wherever it has to use the CPU. That CPU case covers every 4K
                Dolby Vision file under guard_dv=enabled, which always uses libx265, and any file on a CPU worker, under method_encoder=cpu, or whose GPU
                encoders all failed their test. Raise the limit for those, or set it to 0.
                \\nThe limit is set per library but judged on whichever node runs the file. A file that errors stays in Tdarr's error queue until you
                requeue it, and finishes then only if the node or worker that takes it can meet the limit - a faster CPU, or a GPU worker for a file that
                may use the GPU - or set this to 0 to let a slow node work through anything.`,
        },
        {
            name: 'guard_lossless',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled', 'disabled'],
            },
            tooltip: `Protect a LOSSLESS or mastering-grade video source from being re-encoded: ProRes, DNxHD, CineForm, JPEG 2000, JPEG-LS, FFV1, HuffYUV,
                    FFVHuff, MagicYUV, UtVideo, Lagarith, SheerVideo, Canopus Lossless, LCL (zlib/mszh), QuickTime/Microsoft RLE, the lossless screen- and
                    game-capture codecs (Flash Screen Video, TechSmith TSCC, ZMBV, Fraps), and uncompressed video (raw, v210/v410/v408/v308, y41p, r210/r10k).
                \\n=====
                \\nActions
                \\n=====
                \\nenabled (default): skip the whole file when the source video is one of those codecs and anything would re-encode it - normalize, shrink,
                downscale and tonemap_sdr alike.
                \\ndisabled: treat a lossless source like any other and convert it. Choose this deliberately, since it replaces an editing or archival master
                with a lossy delivery encode.
                \\nWhy it is worth guarding: every encode here is lossy AND lands 4:2:0 at 8 or 10 bit, so a 4:2:2, 4:4:4 or 12-bit master loses chroma
                resolution and bit depth on top of the compression - exactly the detail an intermediate format exists to keep, and no later pass can bring
                it back.
                \\nWith an mp4 TARGET this rarely comes up: most of these codecs cannot be stored in mp4 at all, so clean_and_remux, which runs first,
                stops the file before video_clean ever sees it.`,
        },
        {
            name: 'guard_shrink_bitrate',
            type: 'string',
            defaultValue: '1000',
            inputUI: { type: 'text' },
            tooltip: `Applies to action=shrink ONLY: skip the size re-encode when the source video bitrate is already below this, in kbps. 0 disables the
                guard. The default of 1000 leaves genuinely lean sources alone and rarely triggers, most content sitting well above 1000 kbps at any
                resolution.
                \\nWhy: shrink works at constant quality, which cannot predict the output size, so re-encoding an already-lean source can GROW it. This
                floor prevents that.
                \\nnormalize ignores this entirely, a compatibility conversion having to run whatever the size. Four things are exempt even under shrink:
                a downscale, tonemap_sdr, the lossless strip_dynamic copy and interlace repair. The first three cannot grow a file; the repair can, since a
                shot-on-video source comes back at double the frame rate.`,
        },
    ],
});
// #endregion

const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    // eslint-disable-next-line no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        container: `.${file.container}`,
        FFmpegMode: true,
        infoLog: '',
    };
    // #region SHARED helpers (1 section: file-failure helpers)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: file-failure helpers =====
    // -=-=-= AwkFailFile / failFile / failUnexpected [all five] =-=-=-
    // Fail the whole file (Tdarr's error queue) carrying the full infoLog: a returned processFile:false is Tdarr's "no work / skip" signal, NOT a failure -
    // only a throw errors the file. A raw throw discards the returned response, so failFile rides the accumulated infoLog along as the Error message,
    // with a leading \n so the log starts on its own line instead of glued onto Tdarr's "...Plugin error! Error:" wrapper. The dedicated AwkFailFile type
    // lets the body's outer catch (failUnexpected) tell a DELIBERATE failure (rethrow unchanged) from an unexpected bug (annotate + wrap, still fail w/ log).
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
    // -=-=-= skip [all five] =-=-=-
    // The OTHER terminal: a benign skip means there is nothing for this plugin to do - the file is left untouched and the flow moves on. Every call site
    // keeps its own `return`, so a skip still reads as a terminal where it stands.
    const skip = (msg) => { response.infoLog += msg; response.processFile = false; return response; };
    // -=-=-= ddValue (+ checkDropdowns) [all five] =-=-=-
    // Every dropdown is read through ddValue - case- and whitespace-folded, only an ABSENT value (undefined/null/'') taking the input's default - so
    // the value checkDropdowns validates is the value each use site compares, and a hand-edited 'Enabled' reads the same in all five plugins (Tdarr
    // trims a saved value but does not fold its case). A non-string falsy value is not absent: Tdarr hands a saved boolean false to an input that has
    // since become a dropdown unchanged, and it must stop the file as invalid rather than quietly read as the default. checkDropdowns stops the file on
    // the first value outside its option set, naming the input and the offending value.
    const ddValue = (v, dflt) => String(v === undefined || v === null || v === '' ? dflt : v).toLowerCase().trim();
    const checkDropdowns = (checks) => {
        for (const [name, value, opts] of checks)
            if (!opts.includes(value)) failFile(`[${name}=${logSafe(value)}] invalid value, check your settings`);
    };
    // ===== END SHARED: file-failure helpers =====
    // #endregion

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // #region SHARED helpers (11 sections: stream codec type … stream / language / preset helpers)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream codec type =====
    // -=-=-= codecTypeOf [all five] =-=-=-
    // The stream's kind - video / audio / subtitle / attachment / data - normalised once; the single most repeated test in the suite. jellyfin-ffprobe emits
    // a fixed lowercase enum, so trim+lowercase are pure defensiveness - but one definition keeps every site defensive the SAME way, where per-site
    // spellings could classify the same stream differently. Optional-chained, so a nullish stream reads as "no type" rather than throwing.
    const codecTypeOf = (s) => (s?.codec_type || '').trim().toLowerCase();
    // -=-=-= codecNameOf [all five] =-=-=-
    // The stream's codec NAME, normalised the one way - jellyfin-ffprobe emits a fixed lowercase token, so trim+lowercase are pure defensiveness, but one
    // definition keeps every site defensive the SAME way (a padded 'prores ' can't classify differently at two sites). Mirrors codecTypeOf; optional-chained.
    const codecNameOf = (s) => (s?.codec_name || '').trim().toLowerCase();
    // ===== END SHARED: stream codec type =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [all five] =-=-=-
    // Look up a tag value case-insensitively on BOTH sides - matroska UPPER-CASES tag keys on write, so a plugin reading its sibling's awk_*
    // marker gets an uppercased key back, and the lookup name is folded too so a mixed-case name still matches. Returns the raw value (or '' if
    // absent); callers trim/decode as needed. One source so the five plugins that read each other's markers can't drift on the lookup convention.
    const getTagCI = (tags, name) => {
        const want = String(name).toLowerCase();
        const hit = Object.keys(tags || {}).find((k) => k.toLowerCase() === want);
        return hit === undefined ? '' : String(tags[hit] ?? '');
    };
    // ===== END SHARED: case-insensitive tag lookup =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes [all five] =-=-=-
    // Keyed by the real ffmpeg disposition flag; each entry declares the valid stream types, the title keywords that also indicate the role (each keyword
    // lives on ONE flag PER STREAM TYPE - hasDisposition scopes by entry.streams - so title->flag promotion stays unambiguous; descriptive/descriptions/dvs
    // deliberately appear on both the audio and subtitle entries), and the canonical title string (tag, null when never written). The single table every
    // classifier, sort key, summary token and title tagger reads, so the lists can never drift. The commentary, audio-description, dub, SDH, forced and
    // original roles also carry the words European releases title such tracks with, unflagged (German, French, Spanish, Portuguese, Italian, Dutch,
    // Polish and the Nordic languages), plurals and the one-word compounds release labels use (Kommentare, Audiokommentar) included - compounds have no
    // end, so these are the standard labels, not every word. Each is a whole-token match, so only a word that means nothing else in a track title belongs
    // here (VO, OV, UT stay out), and every one is pinned by the harness.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary', 'kommentar', 'commentaire', 'comentario', 'comentário', 'commento',
                                'commentaar', 'komentarz', 'kommentaari', 'kommentare', 'kommentarer', 'audiokommentar', 'regiekommentar',
                                'commentaires', 'audiocommentaire', 'comentarios', 'comentários', 'commenti', 'audiocommentaar', 'commentaren',
                                'komentarze'],                                                                                  tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','descriptions','dvs','audio description','described video',
                                'visually impaired','visual impaired', 'audiodeskription', 'hörfilm', 'audiodescription', 'audiodescripción',
                                'audiodescrição', 'audiodescrizione', 'audiodescriptie', 'audiodeskrypcja', 'syntolkning', 'synstolkning', 'synstolking',
                                'kuvailutulkkaus', 'audio described'],                                                          tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','descriptions','dvs'],                      tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','hard of hearing','hoh','deaf', 'malentendants',
                                'hörgeschädigte', 'gehörlose', 'sordos', 'non udenti', 'slechthorenden'],                       tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign', 'forcé', 'forcés', 'forzados',
                                'erzwungen'],                                                                                   tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed', 'dubbing', 'doublage', 'doblaje', 'doblado', 'dublado', 'dublagem',
                                'doppiaggio', 'doppiato', 'dubbad', 'dubbet'],                                                  tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original', 'originalton', 'o-ton', 'originalfassung', 'version originale',
                                'versione originale'],                                                                          tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','music & effects','m&e','m and e'],   tag: 'M&E'         },
        karaoke:          { streams:['audio'],                    keywords: ['karaoke'],                                               tag: 'Karaoke'     },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                                        tag: null          },
    };
    // -=-=-= roleTextLower [all five] =-=-=-
    // Role-signal text unioned from BOTH probes - a title/description/handler can live in ffprobe OR mediaInfo but not both. Memoized
    // by stream object (WeakMap, per-run closure) because hasDisposition calls it repeatedly per stream. The handler and both description reads go
    // through getTagCI, and neither casing is a guess: matroska UPPER-CASES tag keys on write, so the ffprobe side comes back HANDLER_NAME and
    // DESCRIPTION; and MediaInfo defines Comment/Description as GENERAL-only parameters, so a per-TRACK value never appears top-level
    // - it lands in the track's 'extra' bag under whatever spelling the container used. A fixed-case top-level read matches neither. NFC first, so a
    // title stored decomposed (an o followed by a combining diaeresis) matches the precomposed keyword it reads as.
    const roleTextCache = new WeakMap();
    const roleTextLower = (s) => {
        if (roleTextCache.has(s)) return roleTextCache.get(s);
        const mi = mediaInfoFor(s);
        const text = [s.tags?.title, getTagCI(s.tags, 'description'), getTagCI(s.tags, 'handler_name'),
            mi?.Title, getTagCI(mi?.extra, 'description')].filter(Boolean).join(' ').trim().normalize('NFC').toLowerCase();
        roleTextCache.set(s, text);
        return text;
    };
    // -=-=-= matchesKeyword [all five] =-=-=-
    // Whole-token keyword matcher: a keyword matches only when not flanked by a letter/digit - '[sdh]', 'eng-sdh', 'sdh.' match, 'deafening' does not -
    // and an internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). text must already be lowercased. The compiled
    // regex is a pure function of the keyword list, so it is memoized by keyword-array identity rather than recompiled per classifier call. A gap before
    // a token that itself starts with a non-alphanumeric ('music & effects') excludes that character: otherwise the gap and the literal can both take the
    // same '&', and on a title of 'music' plus a long run of '&' the two runs backtrack quadratically (1.7 s at 32k chars, measured) over role text that
    // nothing caps. Every spelling that matched still matches - the gap only stops short of the literal it was about to overlap.
    const keywordRegexCache = new WeakMap();
    const matchesKeyword = (text, keywords) => {
        if (!keywords.length) return false;
        let re = keywordRegexCache.get(keywords);
        if (!re) {
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const gapBefore = (token) => (/^[\p{L}\p{N}]/u.test(token) ? '[^\\p{L}\\p{N}]+' : `[^\\p{L}\\p{N}${token[0].replace(/[\\\]^-]/g, '\\$&')}]+`);
            const pattern = keywords
                .map((k) => k.trim().split(/\s+/).map((token, i) => (i ? gapBefore(token) : '') + esc(token)).join(''))
                .join('|');
            re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u');
            keywordRegexCache.set(keywords, re);
        }
        return re.test(text);
    };
    // -=-=-= hasDisposition [all five] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes(codecTypeOf(s))) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(roleTextLower(s), entry.keywords);
    };
    // -=-=-= role classifiers: isCommentary / isDescriptive / isSdh / isLyrics [all five] =-=-=-
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    // A subtitle can carry the raw visual_impaired flag (mkvtoolnix writes it; the sidecar round trip restores it) but the table scopes that key to audio.
    // Read the subtitle case as a RAW flag, deliberately NOT by widening the table entry - that would let its audio-oriented keywords ('audio description')
    // invent the role from a subtitle's title. 'descriptions' remains the keyword-matched subtitle spelling of the same role.
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions')
        || (codecTypeOf(s) === 'subtitle' && s.disposition?.visual_impaired === 1);
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');
    // ===== END SHARED: role/disposition classifiers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt [all five] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last;
    // summariseStream flags them /cover. Two codecs that LOOK like they belong are deliberately ABSENT, for one reason: they are also real
    // moving-picture codecs. mjpeg/mjpegb is camcorder/AVI-era footage, and jpeg2000 is the DCP / IMF / broadcast-mezzanine codec - listing
    // either drops genuine video as cover art, while neither is ever WRITTEN as cover art (mkv attaches image/jpeg or image/png; the mp4 covr
    // atom encodes only JPEG or PNG). Real cover art in those codecs still matches via the disposition clause below - mp4 marks it attached_pic
    // and mkv carries it as an ATTACHMENT, not a video stream - so a dispositionless mjpeg/jpeg2000 video stream reads as real video, the
    // fail-safe direction. nb_frames cannot substitute for the disposition test: in mkv it is N/A for real MJPEG video AND for cover art.
    const IMAGE_CODECS = ['png', 'apng', 'gif', 'bmp', 'webp', 'tiff', 'qoi'];
    const isCoverArt = (s) => IMAGE_CODECS.includes(codecNameOf(s))
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: codec name resolution =====
    // -=-=-= codecAliases [all five] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_alaw',  'g711'],   // G.711 A-law: LOSSY 8-bit companded telephony (64 kbps/ch), NOT lossless - carve out before the generic pcm_ fold
        ['pcm_mulaw', 'g711'],   // G.711 mu-law: same
        ['pcm_',   'pcm'],
        ['dsd',    'dsd'],       // DSD / SACD (1-bit): fold dsd_lsbf/dsd_msbf(_planar) to one lossless key
        ['mp4als', 'als'],       // MPEG-4 ALS: fold the mp4-wrapped spelling to the 'als' codecInfo key (a bare 'als' resolves directly)
        ['adpcm',  'adpcm'],
        ['gsm',    'gsm'],      // GSM 06.10 full-rate and the Microsoft variant (gsm_ms) are one speech family - fold to one key
        ['qdm',    'qdm'],      // QDesign Music 1 and 2 (qdmc/qdm2), old QuickTime - fold to one key
        ['musepack', 'mpc'],   // ffprobe reports musepack7/musepack8 (mpc7/mpc8 are only the DECODER names); fold both to the mpc key
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= foldCodecAlias [all five] =-=-=-
    // A normalised codec name with its alias prefix folded to the canonical key (first matching row wins) and nothing more: resolveCodecName's first
    // step, and on its own the fold an identity check wants.
    const foldCodecAlias = (codec) => {
        for (const [prefix, replacement] of codecAliases) if (codec.startsWith(prefix)) return replacement;
        return codec;
    };
    // -=-=-= resolveCodecName [all five] =-=-=-
    // Folds aliases (foldCodecAlias), maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the _x variant when DTS:X is
    // detected) and eac3/truehd into eac3atmos/truehdatmos - scoring for the carriers that score, accurate display labels for the rest. Each refinement
    // checks longName, the ffprobe profile AND mediaInfo's Format_Commercial_IfAny, because no single source is complete: DTS longName in MP4/M4V is
    // "DCA (DTS Coherent Acoustics)" with no subtype keyword, and an E-AC-3 longName carries no Atmos marker (an editable title tag never counts - it
    // does not imply a real Atmos substream). DTS:X detection is best-effort: MediaInfo's own maintainers note the "XLL X" signal is incomplete for an
    // undocumented format, so a real DTS:X track may still classify as the plain subtype - never the reverse, since detection only fires on an actual
    // reported value, never on the absence of one.
    const resolveCodecName = (stream) => {
        let codec = foldCodecAlias(codecNameOf(stream));
        const longName = (stream.codec_long_name || '').toLowerCase().trim();

        // Fold dca -> dts before the DTS subtype refinements below, which are gated on the 'dts' name
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
                // MediaInfo marks DTS:X as the token "XLL X" in Format_AdditionalFeatures (plain DTS-HD is "XLL"). Matched as a whole token, NOT a raw
                // substring, so a hypothetical "XLL X96"/"XLL XBR" can't false-positive.
                const additionalFeatures = (mi?.Format_AdditionalFeatures || '').toLowerCase();
                // ffprobe fallback: jellyfin reports DTS:X in `profile` ("DTS-HD MA + DTS:X") - the only object-audio signal when mediaInfo is absent.
                if (/\bxll x\b/.test(additionalFeatures) || /dts:?x/.test(profile))
                    codec = DTS_X_VARIANT[codec];
            }
        } else if ((codec === 'eac3' || codec === 'truehd') && (longName.includes('atmos') || commercial.includes('atmos') || profile.includes('atmos')))
            codec = codec === 'eac3' ? 'eac3atmos' : 'truehdatmos';

        return codec;
    };
    // -=-=-= codecDisplayName [all five] =-=-=-
    // Friendly display token for the codecs resolveCodecName REFINES beyond the bare codec_name; anything else falls back to its own raw codec_name
    // (pcm_s16le keeps its bit depth) - this only ever ADDS subtype detail, never collapses an already-informative name. Null-prototype, so a codec_name
    // spelling an Object.prototype member ('constructor') misses the table instead of displaying an inherited function.
    const CODEC_DISPLAY = Object.assign(Object.create(null), {
        dtsma:   'dts-hd-ma',   dtsmax:      'dts-hd-ma-x',
        dtshr:   'dts-hd-hr',   dtshrx:      'dts-hd-hr-x',
        dtsx:    'dts-x',       dtsexpress:  'dts-express',   dtsexpressx: 'dts-express-x',
        eac3atmos: 'eac3-atmos', truehdatmos: 'truehd-atmos', mpegh3d: 'mpeg-h',
    });
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || codecNameOf(stream) || 'unknown';
    // ===== END SHARED: codec name resolution =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family [all five] =-=-=-
    // The mp4/mov container family: the containers whose -c copy keeps a custom GLOBAL tag (a sibling plugin's awk_* marker) only under `-movflags
    // use_metadata_tags` (see mp4TagPlan), and the container test behind the mp4 `-strict` gates. One source so no consumer drifts on the set (video_clean's
    // video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // -=-=-= MP4_NATIVE_TAGS (+ MP4_REGENERATED_TAGS) [all five] =-=-=-
    // The global tags the mov muxer stores WITHOUT use_metadata_tags - as iTunes atoms in mp4/m4v/m4a, as QuickTime udta strings in mov - measured on
    // jellyfin 7.1.4 by writing each and reading it back (awk-ffmpeg-test's fmtprobe tag:native re-measures it per node). A flagless mux drops every other
    // key; the regenerated ones are rebuilt by the muxer itself (ftyp, mvhd, the video track's own timecode, its own encoder string), so none is lost.
    const MP4_NATIVE_TAGS = {
        mp4: ['title', 'artist', 'album_artist', 'composer', 'album', 'date', 'comment', 'genre', 'copyright', 'grouping', 'lyrics', 'description', 'synopsis',
            'show', 'episode_id', 'network', 'keywords', 'track', 'disc', 'compilation', 'gapless_playback', 'hd_video', 'media_type', 'episode_sort',
            'season_number'],
        mov: ['title', 'artist', 'album', 'date', 'comment', 'genre', 'copyright', 'location', 'make', 'model'],
    };
    const MP4_REGENERATED_TAGS = ['major_brand', 'minor_version', 'compatible_brands', 'creation_time', 'encoder', 'timecode'];
    // -=-=-= mp4TagPlan [all five] =-=-=-
    // Whether an mp4-family output needs `-movflags use_metadata_tags`, and what a mux without it leaves behind. The flag is the ONLY way such a file keeps a
    // custom global key, but it is not free: the muxer then writes EVERY global tag as a QuickTime mdta key instead of its native form, which iTunes-style
    // readers (mutagen, so Picard and beets) and Apple's own players cannot read while ffprobe still shows every tag, and mp4/m4v/m4a lose their covr cover
    // art - ffmpeg cannot write covr beside mdta keys (measured 2026-10-01, jellyfin 7.1.4). So it is set only when the output will carry an awk_* marker, the
    // one tag whose loss makes a sibling redo its work; otherwise the native tags keep their readable form and any other custom key is dropped (`dropped`).
    // A `normalize-` awk_video fence is no such marker: normalize fires only on a mismatch its own encode removes, so video_clean writes none into the mp4
    // family, and one an earlier version wrote lapses on the next flagless mux. `writes` holds the global keys this run sets (an empty value clears one);
    // keys match case-insensitively, as ffmpeg's -metadata does.
    const mp4TagPlan = (container, formatTags, writes = {}) => {
        const c = String(container || '').toLowerCase();
        if (!isMp4Family(c)) return { flag: false, markers: [], dropped: [] };
        const out = new Map();
        for (const [k, v] of [...Object.entries(formatTags || {}), ...Object.entries(writes)]) out.set(k.toLowerCase(), [k, String(v ?? '').trim()]);
        const kept = [...out.values()].filter(([, v]) => v !== '');
        const markers = kept.filter(([k, v]) => /^awk_/i.test(k) && !(k.toLowerCase() === 'awk_video' && /^normalize-/i.test(v))).map(([k]) => k);
        const native = MP4_NATIVE_TAGS[c === 'mov' ? 'mov' : 'mp4'];
        const dropped = markers.length ? [] : kept.map(([k]) => k)
            .filter((k) => !/^awk_/i.test(k) && !native.includes(k.toLowerCase()) && !MP4_REGENERATED_TAGS.includes(k.toLowerCase()));
        return { flag: markers.length > 0, markers, dropped };
    };
    // -=-=-= mp4CoversLost [all five] =-=-=-
    // The attached covers among `kept` (the streams a plugin maps into the output) that the container will not store: every one in mov (the QuickTime flavour
    // writes no covr at all, flag or not), and in mp4/m4v/m4a the ones use_metadata_tags costs. The plugins that drop cover art themselves pass none; the
    // others leave these out of their Expected results line too, so the summary and the warning agree.
    const mp4CoversLost = (plan, container, kept = []) => {
        const c = String(container || '').toLowerCase();
        return isMp4Family(c) && (c === 'mov' || plan.flag) ? kept.filter((s) => hasDisposition(s, 'attached_pic')) : [];
    };
    // -=-=-= mp4TagPlanLog [all five] =-=-=-
    // What the plan costs, as log lines: the native tags the flag rewrites, the custom keys a flagless mux leaves behind, and each cover mp4CoversLost
    // names (same `kept` argument). The rewrite is said on every mux that keeps a marker: nothing else names it, so a library recovered into mp4 lost
    // its readable tags in silence, and the marker is permanent.
    const mp4TagPlanLog = (plan, container, kept = []) => {
        const c = String(container || '').toLowerCase();
        const TAG_KEY_LOG_MAX = 40;   // several keys share one line, and a key is a name rather than free text, so each echo is kept short
        const names = (keys) => keys.map((k) => logSafe(k, TAG_KEY_LOG_MAX)).join(', ');
        let log = '';
        if (plan.flag) {
            log += `☒Keeping the ${names(plan.markers)} marker in .${c} writes every tag as a QuickTime metadata key, which taggers and Apple players`
                + ' cannot read (Matroska keeps both)\n';
        }
        if (plan.dropped.length) {
            log += `☐Not carrying ${names(plan.dropped)} - .${c} has no standard tag for ${plan.dropped.length === 1 ? 'it' : 'them'}`
                + `, and keeping one would rewrite every other tag in a form taggers cannot read${c === 'mov' ? '' : ' and drop any cover art'}\n`;
        }
        for (const s of mp4CoversLost(plan, c, kept)) {
            log += c === 'mov' ? `☒${streamTag(s.index)} Cover art dropped - .mov cannot store it\n`
                : `☒${streamTag(s.index)} Cover art dropped - keeping the ${names(plan.markers)} marker in .${c} takes QuickTime metadata keys, and ffmpeg `
                + 'cannot write cover art beside them\n';
        }
        return log;
    };
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: matroska-family container =====
    // -=-=-= isMatroskaFamily  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The Matroska family: mkv, its audio (mka) and subtitle (mks) spellings, and WebM, the Matroska subset. All of them store arbitrary tags and flags
    // natively, so each "does this survive a remux" test starts here - and each consumer keeps its own measurement of the property it relies on.
    const isMatroskaFamily = (container) => ['mkv', 'mka', 'mks', 'webm'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: matroska-family container =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4 uncopyable streams =====
    // -=-=-= mp4UncopyableStreams (+ mp4RebuiltTimecodes, mp4LostData, mp4UncopyableLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The data streams an mp4/m4v/m4a -c copy cannot carry: one ffprobe names no codec for - in practice a camera's tmcd timecode track. The mp4 muxer refuses
    // it outright ("Could not find tag for codec none", exit 234 on jellyfin 7.1.4) and takes the whole command down, so a -map 0 copy of such a file fails on
    // every requeue; each remux here leaves the stream out instead. A timecode survives that: the muxer rebuilds the tmcd track from the video stream's own
    // timecode tag (measured 2026-10-01: 01:00:00:00 in and out). mov copies the track as-is and is left alone, and clean_and_remux drops every data stream
    // itself, so in the designed stack only a run without it meets one. The log line names each stream left out and says whether its timecode carries over.
    const mp4UncopyableStreams = (container, streams) => (['mp4', 'm4v', 'm4a'].includes(String(container || '').toLowerCase())
        ? (streams || []).filter((s) => codecTypeOf(s) === 'data' && ['', 'unknown', 'none'].includes(codecNameOf(s))) : []);
    // The dropped tmcd tracks the muxer puts back - one rebuilt from the video stream's timecode tag reads exactly as the copy would have, so an Expected
    // results line keeps it; with no such tag the timecode is gone.
    const mp4RebuiltTimecodes = (dropped, streams) => ((streams || []).some((s) => codecTypeOf(s) === 'video' && getTagCI(s.tags, 'timecode').trim() !== '')
        ? dropped.filter((s) => String(s.codec_tag_string || '').toLowerCase() === 'tmcd') : []);
    // The dropped streams whose data really leaves the output - all of them but a tmcd the muxer rebuilds - so an Expected results line never promises one.
    const mp4LostData = (dropped, streams) => {
        const rebuilt = mp4RebuiltTimecodes(dropped, streams);
        return dropped.filter((s) => !rebuilt.includes(s));
    };
    const mp4UncopyableLog = (container, dropped, streams) => {
        const rebuilt = mp4RebuiltTimecodes(dropped, streams);
        return dropped.map((s) => {
            const tmcd = String(s.codec_tag_string || '').toLowerCase() === 'tmcd';
            const timecode = !tmcd ? '' : rebuilt.includes(s) ? ', and its timecode is rebuilt from the video track'
                : ', and with no timecode on the video track it is lost';
            const what = tmcd ? 'tmcd timecode' : 'unidentified data';
            return `☐${streamTag(s.index)} Leaving out the ${what} track - .${String(container).toLowerCase()} cannot copy a stream with no codec${timecode}\n`;
        }).join('');
    };
    // ===== END SHARED: mp4 uncopyable streams =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: output muxer =====
    // -=-=-= OUTPUT_MUXER_BY_EXT (+ outputMuxerArg, noMuxerSkipLine)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // These four plugins write back into the source's own extension, and ffmpeg picks the muxer from the extension alone - which is wrong, or impossible,
    // for some extensions they accept (measured on jellyfin 7.1.4). .m4v and .m4a select the ipod muxer, which refuses HEVC, AV1, E-AC-3 and Opus, even on a
    // stream copy (exit 234); the mp4 muxer takes all of them into the same filename with identical iTunes tags and cover art, only major_brand moving to
    // isom. .tp/.trp/.tod and .divx have no muxer by extension at all but are plain MPEG-TS and AVI. A null entry has no -f that serves it: .m2p/.vro/.mod/
    // .evo (-f vob) and .dat (-f mpeg) take native DVD content but refuse a copied AAC track, so such a file is left for clean_and_remux to remux instead.
    // .m2v is the raw mpeg2video muxer, which takes only MPEG-2 video (an H.264, HEVC or AV1 write-back fails), and no muxer takes .mpv at all.
    // awk-ffmpeg-test's muxmatrix mirrors this table (guarded by selftest_mirrors) and re-measures its rows.
    const OUTPUT_MUXER_BY_EXT = {
        m4v: 'mp4', m4a: 'mp4', tp: 'mpegts', trp: 'mpegts', tod: 'mpegts', divx: 'avi', m2p: null, vro: null, mod: null, evo: null, dat: null,
        m2v: null, mpv: null,
    };
    // The output-side -f a container needs: '' where ffmpeg's own pick by extension is right, null where no muxer can write the extension back at all.
    const outputMuxerArg = (container) => {
        const c = String(container || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(OUTPUT_MUXER_BY_EXT, c)) return '';
        return OUTPUT_MUXER_BY_EXT[c] ? ` -f ${OUTPUT_MUXER_BY_EXT[c]}` : null;
    };
    const noMuxerSkipLine = (container) => `☒A .${container} file has no ffmpeg muxer that can write it back - left untouched; remux it to mkv or mp4 first`
        + ' (clean_and_remux does that)\n';
    // ===== END SHARED: output muxer =====
    // ===== SHARED [sub_worker, video_clean]: marker persistence =====
    // -=-=-= markerPersists  [sub_worker, video_clean] =-=-=-
    // Can a container carry a GLOBAL awk_* marker back out of a mux? Matroska and its siblings store an arbitrary tag natively; the mp4 family keeps one only
    // because every mux that carries one adds -movflags use_metadata_tags (mp4TagPlan). The listed set is what was MEASURED to keep one on the production
    // build; an unlisted container is assumed marker-hostile whether or not its muxer happens to preserve a tag, because that is the fail-safe direction - it
    // costs a declined pass rather than one that can never converge. Some are not fixable at all: .3gp/.3g2 discard a custom global tag WITH the flag as well
    // as without, so no marker can exist in one. Both carriers keep the SOURCE container, so the answer is the source's; clean_and_remux always writes mkv or
    // mp4, which is the way out of a hostile one. The stake is the same wherever a marker records work: a pass that cannot remember what it did does it again,
    // and where the arguments come out identical Tdarr ERRORS the file as an infinite transcode loop rather than merely repeating the cost.
    const markerPersists = (container) => isMatroskaFamily(container) || isMp4Family(container);
    // ===== END SHARED: marker persistence =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor [all five] =-=-=-
    // The single join point between the two probes: the mediaInfo track whose StreamOrder equals the ffprobe index; undefined when absent. Deliberately
    // NOT memoised (unlike roleTextLower's WeakMap): the scan measures ~20 microseconds per file against a transcode measured in minutes. Bound to THIS
    // file: it joins against the closure's file.mediaInfo, so it - and every helper that reaches it (roleTextLower, resolveLang, resolveChannels, ...)
    // - is sound ONLY on streams from the same file.ffProbeData. Never feed it a FOREIGN stream list (e.g. otherArguments.originalLibraryFile's): it
    // would read THIS file's mediaInfo track at the foreign stream's index and silently answer about the wrong stream. Menu is excluded because it is
    // the one track kind whose StreamOrder is NOT a stream index: MediaInfo numbers an MPEG-TS program's Menu by PROGRAM ordinal ("0") while that
    // program's real tracks carry a two-part "0-0"/"0-1" that Number() turns into NaN - so on a single-program .ts the Menu is the only numeric match
    // and ffprobe stream 0 reads the Menu's fields. Its Language is a concatenated program list (" / en / en / en"), which makes an untagged track look
    // tagged and silences language_fill, and tag_language=strict then writes that string into the container where nothing can repair it (toCanonicalTag
    // passes it through unchanged). Measured on 6 of the corpus's MPEG-TS files; stream_ordering's DURATION_SIGNALS already guards the same way. Do NOT
    // "fix" this by joining on the last component of the two-part form - measured wrong on both a teletext capture and a multi-program mux.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => t['@type'] !== 'Menu' && Number(t.StreamOrder) === s.index);
    // -=-=-= resolveLang [all five] =-=-=-
    // ffprobe tags.language, else mediaInfo Language (files often tag one probe but not the other); '' when neither reports it - callers wanting a
    // placeholder use `resolveLang(s) || 'und'`.
    const resolveLang = (s) => { const t = (s.tags?.language || '').trim(); return (t || (mediaInfoFor(s)?.Language ?? '')).trim().toLowerCase(); };
    // -=-=-= resolveStreamBitrate [all five] =-=-=-
    // ffprobe first, then mediaInfo: some formats hide per-stream bitrate from ffprobe (e.g. DTS-HD MA in MP4/M4V). mediaInfo order: measured BitRate,
    // declared BitRate_Nominal, then StreamSize*8/Duration - still a real measurement, far better than the codec-target estimate audioQuality falls back
    // to. Returns 0 only when truly unknown.
    const resolveStreamBitrate = (ffstream) => {
        const ffBitrate = Number(ffstream.bit_rate || 0);
        if (ffBitrate > 0) return ffBitrate;
        const mi = mediaInfoFor(ffstream);
        if (!mi) return 0;
        const measured = Number(mi.BitRate || 0) || Number(mi.BitRate_Nominal || 0);
        if (measured > 0) return measured;
        const size = Number(mi.StreamSize || 0);
        const dur = Number(mi.Duration || 0);
        if (size > 0 && dur > 0) {
            const bps = Math.round((size * 8) / dur);
            // clamp to a plausible audio range so a stray unit (ms Duration, etc.) or corrupt size can't inject garbage
            if (bps > 1000 && bps < 100000000) return bps;
        }
        return 0;
    };

    // -=-=-= resolveChannels (+ channelsFromLayout, resolveChannelLayout helpers) [all five] =-=-=-
    // Audio channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string from either probe
    // - "5.1(side)" -> 6, "FL+FR+LFE" -> 3. Returns 0 only when no source reports it. resolveChannelLayout is that string, '' when neither probe has one.
    const channelsFromLayout = (layout) => {
        const s = String(layout || '').toLowerCase().trim();
        if (!s) return 0;
        if (s === 'mono') return 1;
        if (s === 'stereo' || s === 'downmix') return 2;
        if (s === 'quad') return 4;
        const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);              // "5.1"->6, "7.1(side)"->8, "7.1.4" Atmos -> 12 (front + LFE + height)
        if (m) return Number(m[1]) + Number(m[2]) + Number(m[3] || 0);
        // "FL+FR+FC+LFE" -> 4; drop MediaInfo ChannelPositions labels ("Front:", "Side:")
        const tokens = s.split(/[+\s,]+/).filter((t) => t && !t.endsWith(':'));
        return tokens.length > 1 ? tokens.length : 0;
    };
    const resolveChannelLayout = (s, mi = mediaInfoFor(s)) => String(s.channel_layout || mi?.ChannelLayout || mi?.ChannelPositions || '');
    const resolveChannels = (ffstream) => {
        const ff = Number(ffstream.channels || 0);
        if (ff > 0) return ff;
        const mi = mediaInfoFor(ffstream);
        const miChannels = Number(mi?.Channels || 0);
        if (miChannels > 0) return miChannels;
        return channelsFromLayout(resolveChannelLayout(ffstream, mi));
    };

    // -=-=-= enrichStream [all five] =-=-=-
    // Both-probe bitrate + channels enrichment; every summary and scoring call site uses it so logged tokens and the scoring path enrich identically.
    // The enriched .channels is NOT a drop-in for resolveChannels() in a numeric test: on a stream no probe can measure, resolveChannels returns 0 but the
    // `|| s.channels` fallback lands `undefined` here, and `undefined <= 0` is false - so any guard keying on 0 must call resolveChannels() itself.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= is10Bit [all five] =-=-=-
    // 10-bit or deeper: raw sample depth / mediaInfo BitDepth >= 10, a p10le-p16be pixel format, or a 10-bit profile name. The pixel-format leg spans
    // 10-16 because it is the LAST resort and a 12/16-bit master read as 8-bit is the costliest miss; the profile leg stays 10-only because the deeper
    // profile names carry no depth digit ('Rext'), and matching them would call an 8-bit 4:4:4 file 10-bit. Single source for the 10bit token and
    // video_clean's re-encode depth decision.
    const is10Bit = (s, mi = mediaInfoFor(s)) => Number(s.bits_per_raw_sample || mi?.BitDepth || 0) >= 10
        || /p(1[0-6])(le|be)?$|1[0-6]le|1[0-6]be/.test((s.pix_fmt || '').toLowerCase()) || /10/.test((s.profile || '').toLowerCase());
    // -=-=-= FONT_EXTS + isFontMime [all five] =-=-=-
    // Embedded-font file extensions + a font-mimetype test. Read by summariseStream's [attach:...] token and isFontAttachment (clean_and_remux/sub_worker).
    const FONT_EXTS = ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'];
    const isFontMime = (mime) => /font|truetype|opentype|sfnt/.test(mime);
    // -=-=-= attachmentNameParts [all five] =-=-=-
    // The three name-derived facts an attachment is classified by - its mimetype, its filename, and the extension taken off that filename - resolved once.
    // Three sites ask for them (summariseStream's [attach:...] token, isFontAttachment, and clean_and_remux's attachmentKind), and the extension rule is the
    // fragile part: a filename with NO dot must yield '' rather than the whole name, or every dotless attachment classifies as an extension of itself.
    const attachmentNameParts = (s) => {
        const mime = (s?.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s?.tags?.filename || '').trim().toLowerCase();
        return { mime, fname, ext: fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '' };
    };
    // -=-=-= HDR_TRANSFERS [all five] =-=-=-
    // The HDR transfer curves - ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg). The single
    // source for every HDR-curve test.
    const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
    // -=-=-= videoTransferOf (+ isHdrVideo) [all five] =-=-=-
    // A video stream's transfer curve from either probe (ffprobe's tag is routinely absent, or a loose bt2020-10, on a file mediaInfo reads as HDR10), and
    // whether the stream is HDR: an HDR curve, or ANY HDR format mediaInfo names (static HDR10 announces itself "SMPTE ST 2086"). It is the summary's hdr
    // token, so a gate that must treat a file as HDR whenever the log calls it hdr - video_clean's tonemap, sub_worker's SEI strip - builds on it.
    const videoTransferOf = (s, mi = mediaInfoFor(s)) => (s.color_transfer || mi?.transfer_characteristics || '').toLowerCase().trim();
    const isHdrVideo = (s, mi = mediaInfoFor(s)) => HDR_TRANSFERS.includes(videoTransferOf(s, mi)) || !!String(mi?.HDR_Format || '').trim();
    // -=-=-= HDR10P_RE / VIVID_HDR_RE [all five] =-=-=-
    // Dynamic-HDR recognisers over a lowercased HDR_Format, split BY FORMAT because they differ downstream: HDR10+ has a lossless strip path
    // (hevc_metadata=remove_hdr10plus, HEVC only), HDR Vivid/CUVA has none. A bare '2094' suffices for HDR10+ (plain static HDR10 is ST 2086 only), and
    // production MediaInfo 23.07 spells Vivid 'HDR Vivid'. No union is composed here - every decision but video_clean's local isDynamicHdr wants a SINGLE
    // format. DV is recognised separately (isDolbyVisionVideo). Probe limit: production MediaInfo 23.07 reports no Video track at all for H.266/VVC, so a
    // VVC stream can never be recognised as dynamic HDR by any path here.
    const HDR10P_RE = /2094|hdr10\+|hdr10 plus/;
    const VIVID_HDR_RE = /hdr vivid|cuva/;
    // -=-=-= isDdEx [all five] =-=-=-
    // Dolby Surround EX: a rear-surround (6.1) channel matrix-folded into an ordinary 5.1 AC-3/E-AC-3 - strictly MORE than a plain 5.1 twin, still decodes
    // as plain 5.1. mediaInfo's Format_Settings_Mode is the flag's only home (ffprobe does not expose it). One definition so summariseStream's dd-ex token
    // and audio_clean's dedup tie-break can never disagree about what counts as EX.
    const isDdEx = (s) => /surround ex/i.test(mediaInfoFor(s)?.Format_Settings_Mode || '');
    // -=-=-= logTok  [all five] =-=-=-
    // The one sanitiser for any untrusted string an infoLog line echoes - a container title, handler, language token or free-text input. Control characters
    // become a space because infoLog is NEWLINE-DELIMITED: a raw newline in a container tag splits the line into a continuation carrying no ☐/☑/☒ symbol,
    // which is a status line the plugin never wrote. The length cap exists because nothing bounds a container tag and Tdarr persists the whole infoLog.
    // Quotes and backslashes are deliberately KEPT - this is display-only and never feeds ffmpeg, so unlike escMeta the value should read faithfully.
    // Shared, and used by every echo site, because the rule is log-integrity relevant: a per-site spelling would let a hardening (also stripping
    // U+2028/U+2029, say, which JSON-embedded logs treat as line terminators) land at one echo site while the others keep emitting the character.
    const logTok = (v, max = 64) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);
    // -=-=-= logSafe  [all five] =-=-=-
    // logTok with the truncation made VISIBLE: the same sanitising (see above), but a value that was actually cut ends in an ellipsis, so a reader can tell a
    // clipped echo from a value that genuinely ends there. EVERY echo of an unbounded value goes through this - a free-text input, a container tag, a sidecar
    // path - so the marker means one thing in every plugin rather than appearing in whichever one happened to wrap it. summariseStream's tokens deliberately
    // do NOT: they call logTok directly at its 64 cap, where an ellipsis would render inside an [attach:...] token for any ordinary long mimetype or filename.
    const logSafe = (value, max = 200) => { const s = logTok(value, Infinity); return s.length > max ? `${s.slice(0, max)}…` : s; };
    // -=-=-= summariseStream [all five] =-=-=-
    // The [type:details] summary token. Audio & subtitle append /default then EVERY role marker that applies. /default reads the REAL disposition flag
    // alone - a title keyword must not flip a selection flag; every other marker uses the same flag-OR-title-keyword test the sort keys use, so every
    // plugin's summary lines up. Exception: the subtitle /original is a raw flag, display only - no classifier scopes it to subtitles. subrip shows as
    // srt. Audio uses codecDisplayName so a DTS subtype or object-audio layer the container codec_name hides shows in the token. The optional second
    // argument describes a RE-ENCODED output track as { codec, channels, bps, rate } - so NEVER pass this helper straight to .map(): Array.map would
    // supply the element index as that argument.
    const summariseStream = (s, out) => {
        // Every container-supplied value here (language tags, attachment filenames, mimetypes) is clamped via logTok - see its header for why; 64 covers the
        // longest registered mimetype subtype (59), everything else is far shorter.
        const tok = logTok;   // the shared sanitiser at its default 64-char cap
        // A mimetype's log token: its subtype with any experimental x- prefix stripped (application/x-truetype-font -> truetype-font). The attachment and
        // data label fallbacks below implement the same rule, so it lives once here.
        const mimeSubtype = (m) => (m.includes('/') ? m.slice(m.indexOf('/') + 1).replace(/^x-/, '') : '');
        const type = codecTypeOf(s);
        let codec = codecNameOf(s) || 'unknown';
        if (codec === 'subrip') codec = 'srt';
        const langRaw = tok(resolveLang(s) || 'und');
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video') {
            const vmi = mediaInfoFor(s);
            const vHeight = Number(s.height || vmi?.Height || 0);
            const vTenbit = is10Bit(s, vmi);
            const vHdr = isHdrVideo(s, vmi);
            // HDR sub-type marker, shown in place of 'hdr'. DV via the shared isDolbyVisionVideo - also surfacing Profile-5 DV whose non-standard transfer
            // sets no hdr flag. HDR10+ and HDR Vivid are stream-visible only via mediaInfo (ffprobe carries their metadata per-FRAME, which Tdarr doesn't
            // probe), so both degrade to plain 'hdr' without it. A stream can carry BOTH at once (real DVB multiplexes do), so the token names every
            // format present - 'hdr10+/vivid'.
            const vHdrFmt = String(vmi?.HDR_Format || vmi?.HDR_Format_Compatibility || '').toLowerCase();
            const vDv = isDolbyVisionVideo(s, vmi);
            const vDynTok = [HDR10P_RE.test(vHdrFmt) ? 'hdr10+' : '', VIVID_HDR_RE.test(vHdrFmt) ? 'vivid' : ''].filter(Boolean).join('/');
            const vHdrTok = vDv ? 'dv' : (vDynTok || (vHdr ? 'hdr' : ''));
            const vParts = [codec, vHeight > 0 ? `${vHeight}p` : '', vTenbit ? '10bit' : '', vHdrTok].filter(Boolean).join(' ');
            return `[video:${vParts}${isCoverArt(s) ? '/cover' : ''}]`;
        }
        if (type === 'audio') {
            // What survives a RE-ENCODE is decided here, once: language and disposition markers carry through and still read off the source stream; the
            // source-only mediaInfo markers (EX matrix, commercial subtype) do NOT - a fresh encode has neither, so claiming them would be false.
            const chNum = out ? out.channels : s.channels;
            const ch = chNum ? `${chNum}ch` : '';
            // An explicit pre-formatted rate string wins - a VBR encode's rate is an ESTIMATE ('~192k') that cannot be known until the encode runs.
            const bps = Number((out ? out.bps : s.bit_rate) || 0);
            const rate = (out && out.rate) || (bps > 0 ? `${Math.round(bps / 1000)}k` : '');
            const role = `${isCommentary(s) ? '/commentary' : ''}${isDescriptive(s) ? '/description' : ''}`;
            const prov = `${hasDisposition(s, 'dub') ? '/dub' : ''}${hasDisposition(s, 'original') ? '/original' : ''}`;
            const surEx = !out && isDdEx(s) ? 'dd-ex' : '';
            // A re-encode is named by the codec it is being encoded TO - resolved through a bare object so no source profile/long-name/mediaInfo can leak in.
            const name = out ? codecDisplayName({ codec_name: out.codec }) : codecDisplayName(s);
            return `[audio:${[lang, ch, surEx, name, rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            // A subtitle can also carry 'visual_impaired' and 'original' (mkvtoolnix writes either; the sidecar round trip restores them) but
            // dispositionTypes scopes both to audio - so 'original' is read as a RAW flag here, exactly like /default and /forced: a title keyword must
            // not be able to invent one. visual_impaired needs no special case - isDescriptive reads that raw flag itself.
            const descriptive = isDescriptive(s);
            const role = `${isCommentary(s) ? '/commentary' : ''}${descriptive ? '/description' : ''}${isSdh(s) ? '/sdh' : ''}${isLyrics(s) ? '/lyrics' : ''}`;
            const forced = hasDisposition(s, 'forced') ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}${s.disposition?.original === 1 ? '/original' : ''}]`;
        }
        if (type === 'attachment') {
            // codec_name is often absent/'none' on attachments (fonts especially): fall back to the filename extension, then the mimetype - fonts read
            // 'font', everything else the mimetype SUBTYPE (image/png -> png) - so a removed attachment is legible by what it actually is.
            let label = codec;
            if (label === 'unknown' || label === 'none') {
                const { mime, ext } = attachmentNameParts(s);
                const sub = mimeSubtype(mime);
                if (FONT_EXTS.includes(ext)) label = ext;
                else if (isFontMime(mime)) label = 'font';
                else if (ext) label = ext;
                else if (sub) label = sub;
            }
            return `[attach:${tok(label)}]`;
        }
        if (type === 'data') {
            // As for attachments: when codec_name is absent/generic, surface the mimetype SUBTYPE so a removed data stream is legible.
            const dmime = (s.tags?.mimetype || '').trim().toLowerCase();
            const dsub = mimeSubtype(dmime);
            return `[data:${tok((codec === 'unknown' || codec === 'none') && dsub ? dsub : codec)}]`;
        }
        return `[${type || 'unknown'}:${codec}]`;
    };
    // -=-=-= summariseAll [all five] =-=-=-
    // A whole stream list as its token line - the Input streams line, and every plain "Expected results" line. Those are meant to be the SAME view of the
    // stream set before and after, often from mutually exclusive branches, so hand-typed copies drift in a way only one run type ever shows.
    const summariseAll = (list) => list.map((s) => summariseStream(enrichStream(s))).join('');

    // -=-=-= globalOutputOpt [all five] =-=-=-
    // Output-side options applied to EVERY run (the place for any universal muxer/output flag). -max_muxing_queue_size 9999 pre-empts ffmpeg's "Too many
    // packets buffered" interleave error (mostly vestigial on ffmpeg 7.x, cheap insurance); -flush_packets 0 buffers muxer writes instead of flushing per
    // packet - throughput-optimal for file muxing, so always applied rather than exposed as a toggle.
    const globalOutputOpt = ' -max_muxing_queue_size 9999 -flush_packets 0';

    // -=-=-= streamTag [all five] =-=-=-
    // infoLog stream tag: the SOURCE ffprobe index as a fixed 5-char field so columns line up (widens past [s99]). Omitted where a line concerns no single
    // source stream - whole-file summaries, and brand-new/appended streams that have no source index of their own.
    const streamTag = (index) => `[s${String(index).padStart(2, ' ')}]`;
    // ===== END SHARED: stream / language / preset helpers =====
    // #endregion

    // #region SHARED helpers (5 sections: ffmpeg metadata escaping … mp4 strict compliance arg)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg metadata escaping =====
    // -=-=-= escMeta [all five] =-=-=-
    // Tdarr does NOT pass the preset through a shell - it splits the string into a quote-aware argv array for child_process.spawn, so shell metacharacters
    // ($ ` ; |) are inert. The only injection vector is breaking out of the quoted value to inject a new ffmpeg ARGUMENT, which needs a double quote or a
    // control character; Tdarr's tokenizer strips quotes with no reliable backslash-escape convention, so we substitute rather than strip (each line below
    // says how). <io> must also be neutralised: it is the preset's OWN input/output split marker, and a second one inside a value silently DELETES every
    // argument after it - trailing -metadata writes and muxer flags never reach ffmpeg, with no error from either Tdarr or ffmpeg.
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')  // control characters (newlines, null bytes, etc.) → space
        .replace(/\\/g, '/')               // backslash → forward-slash (inert, readable)
        .replace(/"/g, "'")                // double-quote → single-quote (safe inside the quoted value)
        .replace(/<io>/gi, '(io)');        // preset split marker → inert text (a value may never carry a second marker)
    // ===== END SHARED: ffmpeg metadata escaping =====

    // ===== SHARED [audio_clean, video_clean]: statistics tag clearing =====
    // -=-=-= STATS_TAG_RE / staleStatsArgs / staleStatsNote  [audio_clean, video_clean] =-=-=-
    // mkvmerge's per-track statistics (and mkvpropedit's recount) describe the bytes of THAT track. ffmpeg copies a mapped stream's tags onto its output, so a
    // stream this plugin RE-ENCODES would carry the source's figures - a 0.91 Mbps encode advertised to Plex/Jellyfin/MediaInfo as 48 Mbps (measured) - and
    // MediaInfo's bitrate on mkv IS that tag (or, for the one track left without tags, the file size minus the others'). So the encode itself clears them:
    // the Matroska muxer drops a key set to empty, and ffmpeg rewrites DURATION, which stays. A copied stream keeps them, since they are true of it. Only keys
    // the source carries are emitted, spelled as it spells them (a -<lang> suffix included), so a stream without statistics changes nothing, and the pattern
    // admits only [A-Za-z0-9_-], so no key can break the preset's quoting.
    const STATS_TAG_RE = new RegExp('^(BPS|NUMBER_OF_FRAMES|NUMBER_OF_BYTES|_STATISTICS_TAGS|_STATISTICS_WRITING_APP|_STATISTICS_WRITING_DATE_UTC)'
        + '(-[A-Za-z0-9_]+)?$', 'i');
    const staleStatsArgs = (spec, srcStream) => Object.keys((srcStream && srcStream.tags) || {}).filter((k) => STATS_TAG_RE.test(k))
        .map((k) => ` -metadata:s:${spec} "${k}="`).join('');
    // The one line for a file whose re-encoded streams lost their statistics. None when they were mkvpropedit's own: Tdarr's "Run mkvpropedit on files before
    // running plugins" is then on and recounts them on every scan. Until they are recounted MediaInfo shows nothing for a cleared audio or subtitle track and
    // estimates a cleared video track from the file bytes left over (measured +57% / -12% against the packet sum, with and without 16 font attachments).
    const staleStatsNote = (srcStreams) => {
        const cleared = srcStreams.filter((s) => staleStatsArgs('x', s) !== '');
        const writer = (s) => {
            const k = Object.keys(s.tags || {}).find((x) => /^_STATISTICS_WRITING_APP(-[A-Za-z0-9_]+)?$/i.test(x));
            return k ? s.tags[k] : '';
        };
        if (!cleared.length || cleared.some((s) => /^mkvpropedit/i.test(String(writer(s))))) return '';
        const n = cleared.length;
        return `☒Cleared the copied bitrate/size statistics on ${n} re-encoded stream${n === 1 ? '' : 's'} - until they are recounted`
            + ' MediaInfo shows no bitrate for a cleared audio or subtitle track and estimates a cleared video track\'s from the leftover file bytes; Tdarr\'s'
            + ' "Run mkvpropedit on files before running plugins" (Options, Worker Behavior) recounts them on every scan\n';
    };
    // ===== END SHARED: statistics tag clearing =====

    // ===== SHARED [audio_clean, video_clean]: ffmpeg encoder probe =====
    // -=-=-= parseFfmpegEncoders  [audio_clean, video_clean] =-=-=-
    // Parse `ffmpeg -hide_banner -encoders` stdout into a Set of encoder names. Each encoder row is "<6 flag chars> <name> <description>" (e.g. " V....D
    // hevc_nvenc NVIDIA NVENC hevc encoder"); the leading [A-Z.]{6} flag block + whitespace gate the name capture so the banner/header/blank lines are
    // skipped. Shared by video_clean's per-node capability probe (queryCapabilities) and audio_clean's aac_vbr availability check (hasEncoder) so the
    // row-parse regex cannot drift between them; the spawn itself stays at each call site (their surrounding capability objects differ).
    const parseFfmpegEncoders = (stdout) => {
        const set = new Set();
        for (const line of String(stdout || '').split('\n')) {
            const m = line.match(/^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/);   // "<6 flag chars> <name>  <desc>"
            if (m) set.add(m[1]);
        }
        return set;
    };
    // ===== END SHARED: ffmpeg encoder probe =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: dolby vision detection =====
    // -=-=-= DV_FOURCC_RE [all five] =-=-=-
    // The DV fourccs: HEVC dvhe/dvh1, AVC dvav/dva1, AV1 dav1. Named so the set has ONE definition (video_clean's dvCodecTag tests the same constant).
    // Non-global, so `.test()` on one shared instance is stateless.
    const DV_FOURCC_RE = /^(dvhe|dvh1|dvav|dva1|dav1)$/;

    // -=-=-= isDolbyVisionVideo [all five] =-=-=-
    // Both-probe DV test: the fourcc, a mediaInfo HDR_Format naming Dolby Vision, or an ffprobe DOVI configuration record / dolby-vision side_data. Drives
    // the -c copy plugins' `-strict unofficial` (mp4StrictArg) and the summariseStream dv token. video_clean's guard_dv ENCODE routing deliberately uses
    // the NARROWER dvSignal instead - libx265 -dolbyvision hard-requires a real RPU (see the note there). Pass the stream's paired mediaInfo
    // (mediaInfoFor(stream)); a single-probe false negative would silently lose the boxes.
    const isDolbyVisionVideo = (ffstream, mi) => DV_FOURCC_RE.test((ffstream?.codec_tag_string || '').toLowerCase().trim())
        || String(mi?.HDR_Format || mi?.HDR_Format_Compatibility || '').toLowerCase().includes('dolby vision')
        || (Array.isArray(ffstream?.side_data_list) ? ffstream.side_data_list : [])
            .some((sd) => /dovi configuration record|dolby vision/i.test(String(sd?.side_data_type || '')));
    // ===== END SHARED: dolby vision detection =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4 strict compliance arg =====
    // -=-=-= mp4StrictArg [all five] =-=-=-
    // The ' -strict <level>' an mp4/mov -c copy needs, or '' when it needs none. Two independent reasons share one flag, because `experimental` is a strict
    // SUPERSET of `unofficial` and does both jobs:
    //   experimental - a TrueHD stream copied INTO mp4, which the muxer otherwise refuses outright (rc 88); `unofficial` does NOT satisfy it. Matched on
    //                  the raw codec_name, not resolveCodecName, whose refined truehdatmos would not equal 'truehd'.
    //   unofficial   - a Dolby Vision video stream, so the mov muxer keeps its dvcC/dvvC boxes; a plain copy drops them, demoting DV to plain HEVC/AV1
    //                  (verified on real HEVC + AV1 DV samples). Cover art is excluded so a leading cover-art stream cannot mask a real DV stream.
    // Pass the RAW file.ffProbeData.streams as `streams`: the DV signals (codec_tag_string / side_data_list) live only there. `copied` is the subset this
    // run emits as -c copy (defaults to all) - a caller that drops or re-encodes tracks passes its own survivor list, so a TrueHD track on its way out
    // never pulls in a flag the output does not need. Never decide this by regex over the half-built argument string: it carries container-supplied
    // -metadata title values verbatim, so a track titled " -strict foo" reads as already-emitted and the remux silently drops a DV file's boxes.
    const mp4StrictArg = (container, streams, copied) => {
        if (!isMp4Family(container)) return '';
        const list = Array.isArray(streams) ? streams : [];
        const kept = Array.isArray(copied) ? copied : list;
        if (kept.some((s) => codecTypeOf(s) === 'audio' && codecNameOf(s) === 'truehd')) return ' -strict experimental';
        return list.some((s) => codecTypeOf(s) === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s))) ? ' -strict unofficial' : '';
    };
    // ===== END SHARED: mp4 strict compliance arg =====
    // #endregion

    const os = require('os');
    const fs = require('fs');
    const childProcess = require('child_process');
    // The harness's synthetic-node capabilities (encoder sets, GPU tonemap backends, the idet verdict, caption presence, memory), injected through
    // otherArguments.__awkCap. Wherever it is present NOTHING spawns: a missing key reads as no answer, never as a reason to probe the real node.
    const injectedCap = otherArguments && otherArguments.__awkCap;

    // #region SHARED helpers (1 section: ffmpeg path)
    // ===== SHARED [audio_clean, clean_and_remux, sub_worker, video_clean]: ffmpeg path =====
    // -=-=-= ffmpegPathOf  [audio_clean, clean_and_remux, sub_worker, video_clean] =-=-=-
    // The node's ffmpeg: Tdarr hands a classic plugin otherArguments.ffmpegPath, and the bare name - a PATH lookup - stands in when it supplied none.
    // Every spawn in the four plugins that run ffmpeg resolves the binary here, so a change to how it is found reaches all of them at once.
    const ffmpegPathOf = (otherArgs) => String(otherArgs?.ffmpegPath || 'ffmpeg');
    // ===== END SHARED: ffmpeg path =====
    // #endregion

    // Read a table by a key that came from a PROBE or a user string, never from a validated dropdown. `TABLE[key] || fallback` cannot tell an ABSENT key from
    // one inherited off Object.prototype, and every prototype member is truthy, so the fallback never fires for it - a stream whose codec_name is 'constructor'
    // would read as a real row. Every probe-keyed lookup in this file goes through here, bar selectEncoder's ENCODER_NAME reads, which only ever see an
    // ENCODABLE_CODECS target (the canEncodeTarget skip runs before the only path to them); a dropdown-keyed one does not need it.
    const tableGet = (table, key, dflt) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : dflt);

    // ====== ENCODER CAPABILITY + SELECTION ======
    // Inputs are set once per LIBRARY and shipped identically to every node, so a video encoder can't be a stored setting on a mixed fleet - it is
    // resolved at runtime, per node, with a CAPABILITY QUERY (not a trial-encode ladder): ask ffmpeg what the build supports, intersect with a cheap
    // zero-encode hardware-presence check, and fall back to one confirming probe only for the genuinely-ambiguous cases (VAAPI/QSV/AMF, whose presence
    // signal cannot prove a GPU that encodes this codec - see presenceOf - and any AV1 hardware encode, where presence can't prove the GPU is new enough:
    // Arc / RTX-40xx / RDNA3).

    // Per-node subprocess probe timeouts (ms). The -encoders capability listing is a static parse and nvidia-smi a quick presence poll, so both are short;
    // each confirm probe actually spawns ffmpeg to encode/tonemap one synthetic frame, so it gets the longest budget.
    const ENCODERS_PROBE_TIMEOUT_MS = 20000;
    const NVIDIA_SMI_TIMEOUT_MS = 8000;
    const CONFIRM_PROBE_TIMEOUT_MS = 25000;

    // Priority order of hardware families to try per OS (best/most-common first); CPU is the fallback behind them, except under node_strict on a GPU worker.
    // Mac is videotoolbox-only by design: on macOS ALL hardware encoding (Apple Silicon media engine, Intel Quick Sync, an AMD dGPU/eGPU) is routed through
    // VideoToolbox - there is no working nvenc/qsv/vaapi/amf path on macOS and the darwin ffmpeg build ships none of them. (rkmpp is a valid node
    // hardware type but Rockchip ARM only, so it is unsupported here; see selectEncoder's `families` comment for what such a node lands on.)
    const HW_FAMILIES = {
        darwin: ['videotoolbox'],
        win32: ['nvenc', 'qsv', 'amf'],
        linux: ['nvenc', 'qsv', 'vaapi', 'amf'],
    };
    // The render node an injected capability that says dri but lists no render nodes stands for (encoderPlan): one Intel renderD128. On a real node each
    // vaapi candidate carries its own device, which the confirm probe and the emitted command both name.
    const VAAPI_DEVICE = '/dev/dri/renderD128';
    // ffmpeg encoder name per (target codec, family). null = that family has no encoder for that codec (e.g. no AV1 videotoolbox).
    const ENCODER_NAME = {
        hevc: { nvenc: 'hevc_nvenc', qsv: 'hevc_qsv', vaapi: 'hevc_vaapi', videotoolbox: 'hevc_videotoolbox', amf: 'hevc_amf', cpu: 'libx265' },
        h264: { nvenc: 'h264_nvenc', qsv: 'h264_qsv', vaapi: 'h264_vaapi', videotoolbox: 'h264_videotoolbox', amf: 'h264_amf', cpu: 'libx264' },
        av1: { nvenc: 'av1_nvenc', qsv: 'av1_qsv', vaapi: 'av1_vaapi', videotoolbox: null, amf: 'av1_amf', cpu: 'libsvtav1' },
    };
    // The codecs this plugin has an encoder for, derived from the table above so a new target cannot be added to one and missed in the other
    // (codec=source keeps the source codec only when it is one of these). Membership only, so key order is immaterial.
    const ENCODABLE_CODECS = Object.keys(ENCODER_NAME);
    // Per-(codec, family) A53 closed-caption capability, hardware-confirmed on jellyfin-ffmpeg 7.1.4 across Mac / Linux-Intel / Windows-NVIDIA (2026-09-04;
    // the fmtprobe `subedge:a53emit` row re-measures every cell against a mirror of this table). ONE table so the dropCaptions suppression in
    // buildVideoArgs and the guard_captions force-CPU gate can never disagree about which encoder keeps captions:
    //   'keep'  - re-emits captions BY DEFAULT, so DROPPING them needs an explicit suppress (`-a53cc 0`, or `-sei -a53_cc` on vaapi): libx264, h264/hevc/av1
    //             nvenc, h264/hevc vaapi.
    //   'optin' - drops by default, so KEEPING needs `-a53cc 1`: libx265.
    //   'error' - h264_videotoolbox CRASHES the encode when it inserts A53 ("Invalid data found"), so it ALWAYS gets `-a53cc 0` and can never keep captions.
    //   'drop'  - cannot carry captions and has no option to change that: hevc/av1 qsv, amf, hevc/av1 videotoolbox, libsvtav1, av1 on vaapi.
    //   'unreliable' - h264_qsv, and it needs BOTH halves of the map to treat it differently, which is why the class exists. Measured 2026-09-22 on both
    //             Intel Linux nodes (N150/Xe-LP and J4125/UHD 600, iHD 26.2.2, jellyfin-ffmpeg 7.1.4): encoding the caption sample the way this plugin
    //             does it - a quality setting and a software scale - the captions SURVIVE in about 24 runs out of 25, so treating it as 'drop' and
    //             emitting nothing leaves a re-encode carrying captions that sub_worker has already exported to a sidecar, and the player shows them
    //             twice. But it dropped them in roughly 1 run in 5 on one node, so it cannot be trusted to PRESERVE them either. Hence: suppressed like a
    //             'keep' when captions are being dropped (`-a53cc 0`, measured to work 10 times out of 10 on both nodes), and counted with the droppers
    //             by guard_captions, which still forces the CPU encoder when captions must survive. Note the encoder is not at fault for the spread: the
    //             same command with NO rate-control option emits the SEI only sometimes. fmtprobe's subedge:a53emit row therefore encodes with one, five
    //             times, and reads each encoder against this table: a 'keep' must keep in every run, an 'unreliable' only in at least one.
    const A53_CAP = {
        h264: { cpu: 'keep', videotoolbox: 'error', nvenc: 'keep', qsv: 'unreliable', vaapi: 'keep', amf: 'drop' },
        hevc: { cpu: 'optin', videotoolbox: 'drop', nvenc: 'keep', qsv: 'drop', vaapi: 'keep', amf: 'drop' },
        av1: { cpu: 'drop', videotoolbox: 'drop', nvenc: 'keep', qsv: 'drop', vaapi: 'drop', amf: 'drop' },
    };
    // The one read of A53_CAP, for buildVideoArgs and the caption probe alike: under codec=source the codec key is probe-derived, so through tableGet.
    const a53ClassOf = (targetCodec, family) => tableGet(tableGet(A53_CAP, targetCodec, {}), family, undefined);
    // The DRM render nodes a Linux node exposes, each with its PCI vendor ('0x8086' Intel, '0x1002' AMD, '0x10de' NVIDIA, '' unreadable), in device-number
    // order. The vendor is read through the node's DEVICE NUMBER (/sys/dev/char/<major>:<minor>), never its name: a container mapping
    // `--device /dev/dri/renderD129:/dev/dri/renderD128` keeps the host's 226:129 under the new name while /sys is the host's, so a name lookup reads a
    // different card. fsMod is a parameter so the harness can hand it a fake; any failure lists nothing rather than guessing.
    const listRenderNodes = (fsMod) => {
        try {
            const vendorOf = (name) => {
                const read = (p) => { try { return String(fsMod.readFileSync(p, 'utf8')).trim().toLowerCase(); } catch (e) { return ''; } };
                let byNumber = '';
                try {
                    const { rdev } = fsMod.statSync(`/dev/dri/${name}`);
                    byNumber = read(`/sys/dev/char/${(rdev >> 8) & 0xfff}:${(rdev & 0xff) | ((rdev >> 12) & 0xfff00)}/device/vendor`);
                } catch (e) { /* no device number readable - try the name */ }
                return byNumber || read(`/sys/class/drm/${name}/device/vendor`);
            };
            return fsMod.readdirSync('/dev/dri').filter((n) => /^renderD\d+$/.test(n))
                .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
                .map((n) => ({ path: `/dev/dri/${n}`, vendor: vendorOf(n) }));
        } catch (e) { return []; }
    };
    // Which render nodes each Linux family may drive: vaapi any Intel or AMD node, qsv an Intel one (FFmpeg opens the first Intel node itself, so it is
    // offered once, with no device). An unreadable vendor stays a candidate - the confirm and the test encode decide - and an NVIDIA node never is.
    const VAAPI_VENDORS = ['0x8086', '0x1002', ''];
    const QSV_VENDORS = ['0x8086', ''];
    const nodesFor = (cap, vendors) => (cap.renderNodes || []).filter((n) => vendors.includes(n.vendor));

    // Query the ffmpeg build's encoder list + hardware presence for this node: encoders from `-encoders`, NVIDIA from nvidia-smi, VAAPI/QSV from the
    // render nodes. Tdarr reloads each classic plugin fresh per file, and guard_dv's memory counterfactual makes a second call; the probe runs even on a
    // forced-CPU pick because cap is computed above the forceCpu early return.
    const queryCapabilities = (ffmpegPath) => {
        const cap = { encoders: new Set(), nvidia: false, dri: false, renderNodes: [] };
        try {
            const r = childProcess.spawnSync(ffmpegPath, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: ENCODERS_PROBE_TIMEOUT_MS });
            cap.encoders = parseFfmpegEncoders(r.stdout);
        } catch (e) { /* leave encoders empty -> everything falls back to CPU */ }
        try {
            const r = childProcess.spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8', timeout: NVIDIA_SMI_TIMEOUT_MS });
            cap.nvidia = r.status === 0 && String(r.stdout || '').trim().length > 0;
        } catch (e) { /* nvidia-smi absent -> no NVIDIA GPU */ }
        if (os.platform() === 'linux') cap.renderNodes = listRenderNodes(fs);
        cap.dri = cap.renderNodes.length > 0;
        return cap;
    };

    // Synthetic 256x256 lavfi test source for the confirming HW probes below (each reads a single frame); only the fill colour varies.
    const testColorSource = (color) => `color=c=${color}:s=256x256:d=1:r=5`;

    // Run one probe command and report only whether it exited 0 - the shared spawn+verdict skeleton for the confirm* probes below, so a future hardening
    // (a maxBuffer cap, stderr capture) lands once instead of per probe. Each caller builds its own args; that is pure string work and cannot throw.
    const probeOk = (ffmpegPath, args) => {
        try { return childProcess.spawnSync(ffmpegPath, args, { encoding: 'utf8', timeout: CONFIRM_PROBE_TIMEOUT_MS }).status === 0; }
        catch (e) { return false; }
    };

    // Single confirming probe (one 256x256 frame) of ONE candidate encoder - a cheap filter ahead of the real test encode (TEST ENCODE), used only for
    // ambiguous families/cases, never as a blind per-codec ladder.
    const confirmEncode = (ffmpegPath, encoderName, inputSide, filter) => {
        const args = ['-hide_banner'];
        if (inputSide) args.push(...inputSide.split(' ').filter(Boolean));
        args.push('-f', 'lavfi', '-i', testColorSource('black'));
        if (filter) args.push('-vf', filter);
        args.push('-frames:v', '1', '-c:v', encoderName, '-f', 'null', '-');
        return probeOk(ffmpegPath, args);
    };

    // Cheap zero-encode presence verdict for a family on this platform: 'yes' (usable), 'no' (definitely not), or 'probe' (can't tell cheaply - confirm
    // with one encode). videotoolbox = Mac only; nvenc = nvidia-smi. VAAPI, QSV and AMF can never be confirmed cheaply: Windows offers no signal at all,
    // and on Linux a render node only proves a GPU exists - not one that can encode this codec (no HEVC encoder on an AMD GPU before Polaris or an Intel
    // iGPU before Skylake: an A8-7410's VCE 2.0 exposes renderD128 and fails every hevc_vaapi encode), so both stay 'probe' wherever a node of their vendor
    // is present (nodesFor).
    const presenceOf = (family, cap, platform) => {
        switch (family) {
            case 'cpu': return 'yes';
            case 'videotoolbox': return platform === 'darwin' ? 'yes' : 'no';
            case 'nvenc': return cap.nvidia ? 'yes' : 'no';
            case 'vaapi': return nodesFor(cap, VAAPI_VENDORS).length ? 'probe' : 'no';
            case 'qsv': return platform === 'linux' ? (nodesFor(cap, QSV_VENDORS).length ? 'probe' : 'no') : 'probe';
            case 'amf': return 'probe';
            default: return 'no';
        }
    };

    // The encoders THIS node may use for a file, in the order they are tried. method_encoder picks the list - see the comment on `families` below. Returns
    // the node facts and a LAZY generator, hardware(), yielding { family, encoderName, device, label } for each hardware candidate that passes the cheap
    // filters (in this build, detected, an encoder for this codec, and the one-frame confirm where presence is ambiguous), pushing the node-pinned
    // family's fallback reason as it goes. Lazy, because a caller that needs only the first candidate (guard_dv's counterfactual) must not pay every
    // later family's confirm encode. Tests inject a capability object + platform via otherArguments.__awkCap (workerType and nodeHardwareType sit on
    // otherArguments itself) to avoid any real ffmpeg/nvidia-smi spawn.
    const encoderPlan = ({ targetCodec, encoderOpt, otherArguments, forceCpu, forceCpuWhy }) => {
        const platform = (injectedCap && injectedCap.platform) || os.platform();
        const workerType = String((otherArguments && otherArguments.workerType) || '').toLowerCase();
        const isGpuWorker = workerType.includes('gpu');
        const nodeLabel = `${platform}${isGpuWorker ? ' gpu-worker' : ''}`;   // how the Encoder notes name this node
        const ffmpegPath = ffmpegPathOf(otherArguments);
        // An injected cap with no renderNodes stands for one Intel renderD128 wherever it says dri, so every fixture written before render nodes keeps
        // its meaning.
        const cap = injectedCap
            ? { encoders: new Set(injectedCap.encoders || []), nvidia: !!injectedCap.nvidia, dri: !!injectedCap.dri,
                renderNodes: injectedCap.renderNodes || (injectedCap.dri ? [{ path: VAAPI_DEVICE, vendor: '0x8086' }] : []) }
            : queryCapabilities(ffmpegPath);
        const confirm = (c, inputSide, filter) => (injectedCap
            ? !!(injectedCap.confirm && (injectedCap.confirm[c.label] ?? injectedCap.confirm[c.encoderName]))
            : confirmEncode(ffmpegPath, c.encoderName, inputSide, filter));
        const notes = [];
        const cpuName = ENCODER_NAME[targetCodec].cpu;

        // Candidate families to try in order, ending at 'cpu' unless node_strict forbids it. method_encoder picks the list:
        //   node (default) / node_strict -> honor THIS node's Tdarr "GPU worker hardware type": '-'/"any" = every family this platform has; a supported type
        //     -> that family alone; a type we can't drive (rkmpp, a cross-platform mis-set) -> no usable GPU. 'node' falls every unusable case back to CPU;
        //     'node_strict' ERRORS the file instead, for users who never want a GPU job silently landing on the CPU.
        //   auto -> ignore the node type, platform priority list, then CPU.   cpu -> software, full stop. (Pinning ONE family is a per-node decision, made
        //     at the node - a library setting would force every node in a mixed fleet onto the same encoder.)
        // Only auto/node/node_strict are worker-type-aware; a CPU worker (and Dolby Vision, handled by forceCpu) takes CPU and never strict-errors.
        const strict = encoderOpt === 'node_strict';
        const isNodeMode = encoderOpt === 'node' || strict;
        const hwList = [...(HW_FAMILIES[platform] || [])];
        const nodeHw = isNodeMode ? String((otherArguments && otherArguments.nodeHardwareType) || '').toLowerCase().trim() : '';
        const nodeIsSpecific = !!nodeHw && nodeHw !== '-';
        // Emit the ☒ "falling back to CPU" note for a family, but only when THIS NODE'S hardware type is what pinned it - method_encoder=node/node_strict on
        // a node whose Tdarr hardware type names one family. auto, and node on an "any" node, walk the whole list, so a note for each family they merely tried
        // would be noise. The pin is the node's hardware type, NOT encoderOpt: encoderOpt only ever holds node/node_strict/auto/cpu, never a family name, so a
        // predicate keyed on it can never match a family and would discard every reason. The four the loop distinguishes - not in this build, hardware not
        // detected, the probe would not initialise, no encoder for this codec+family - are four different user fixes, and node_strict quarantines the file
        // with one message for all of them otherwise. node_strict gets the reason WITHOUT the "using <cpu>" tail, because it is about to refuse that very
        // fallback and quarantine the file instead. A render node with another of its family still to try (`more`) names neither: the CPU is not next.
        const pushFallbackNote = (family, reason, more) => {
            if (isNodeMode && nodeIsSpecific && nodeHw === family)
                notes.push(`☒[method_encoder=${encoderOpt}] ${reason}${more ? ' - trying the next encoder' : strict ? '' : `; using ${cpuName}`}\n`);
        };
        let families;
        if (encoderOpt === 'auto' || isNodeMode) {
            if (!isGpuWorker) families = ['cpu'];                                          // CPU worker: software regardless of mode
            else if (!nodeIsSpecific) families = strict ? [...hwList] : [...hwList, 'cpu'];   // auto, or node/node_strict on an "any" node -> test them all
            else if (hwList.includes(nodeHw)) families = strict ? [nodeHw] : [nodeHw, 'cpu'];  // node pinned to a family we can drive on this platform
            else families = strict ? [] : ['cpu'];                                  // node pinned to something we can't drive (rkmpp / cross-platform mis-set)
        } else {
            families = ['cpu'];                                                          // encoderOpt === 'cpu' - the only value left, and it forces software
        }
        // Why there is no GPU candidate, worded for the refusal node_strict issues and for the Encoder line of a CPU fallback. The cpuWhy ladder is
        // exhaustive over the four values encoderOpt can hold, so its trailing '' is a default that no accepted value reaches.
        const strictWhy = !nodeIsSpecific ? 'no usable GPU encoder on this node'
            : hwList.includes(nodeHw) ? `node hardware '${nodeHw}' could not encode ${targetCodec} on this node`
                : `node hardware '${nodeHw}' is not supported by this plugin`;
        const cpuWhy = !isGpuWorker && (encoderOpt === 'auto' || isNodeMode) ? 'CPU worker'
            : encoderOpt === 'auto' ? 'no usable GPU encoder on this node'
                : encoderOpt === 'cpu' ? nodeLabel
                    : isNodeMode ? `${nodeIsSpecific
                        ? `node hardware '${nodeHw}' ${hwList.includes(nodeHw) ? 'unavailable' : 'unsupported'}`
                        : 'no usable GPU encoder'} on this node`
                        : '';
        function* hardware() {
            if (forceCpu) return;
            for (const family of families) {
                if (family === 'cpu') return;   // reached the fallback
                const encoderName = ENCODER_NAME[targetCodec][family];
                if (!encoderName) {   // e.g. AV1 has no videotoolbox encoder
                    pushFallbackNote(family, `no ${targetCodec} encoder for this family`);
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
                // vaapi is one candidate per render node it may drive, named by its node only when there is more than one; every other family is one.
                const devices = family === 'vaapi' ? nodesFor(cap, VAAPI_VENDORS).map((n) => n.path) : [null];
                for (const [i, device] of devices.entries()) {
                    const label = devices.length > 1 ? `${encoderName}@${device.split('/').pop()}` : encoderName;
                    const c = { family, encoderName, device, label };
                    // Confirm with one probe when presence is ambiguous, and always for AV1 hardware (generation can't be inferred).
                    if (presence === 'probe' || targetCodec === 'av1') {
                        const probeIn = family === 'vaapi' ? `-vaapi_device ${device}` : '';
                        const probeFilter = family === 'vaapi' ? 'format=nv12,hwupload' : '';
                        if (!confirm(c, probeIn, probeFilter)) {
                            pushFallbackNote(family, `${label} did not initialise on this node`, i < devices.length - 1);
                            continue;
                        }
                    }
                    yield c;
                }
            }
        }
        return { notes, strict, isGpuWorker, nodeLabel, cpuName, cpuWhy, strictWhy, hardware,
            trueAuto: isGpuWorker && (encoderOpt === 'auto' || (isNodeMode && !nodeIsSpecific)),
            pinned: isNodeMode && nodeIsSpecific,
            cpuReachable: !!forceCpu || families.includes('cpu') };
    };

    // The node's FIRST usable encoder with no test encode - { family, encoderName, notes:[infoLog lines] }, or { strictFail, notes } when node_strict
    // forbids the CPU fallback. Only guard_dv's memory counterfactual asks this question; the transcode itself walks the whole plan (resolveEncodeEncoder).
    const selectEncoder = ({ targetCodec, encoderOpt, otherArguments, forceCpu, forceCpuWhy }) => {
        const plan = encoderPlan({ targetCodec, encoderOpt, otherArguments, forceCpu, forceCpuWhy });
        const { notes } = plan;
        // Data the hardware encoders cannot carry (a Dolby Vision RPU) leaves the software encoder as the only option regardless of node or pin.
        // forceCpuWhy names which, so the log says what the slower encode bought.
        if (forceCpu) {
            notes.push(`☐[method_encoder=${encoderOpt}] Encoder: ${plan.cpuName} (forced ${forceCpuWhy})\n`);
            return { family: 'cpu', encoderName: plan.cpuName, notes };
        }
        const first = plan.hardware().next();
        if (!first.done) {
            notes.push(`☐[method_encoder=${encoderOpt}] Encoder: ${first.value.encoderName} (${plan.nodeLabel})\n`);
            return { family: first.value.family, encoderName: first.value.encoderName, notes };
        }
        // Fell through without a usable hardware encoder. node_strict on a GPU worker forbids the CPU fallback; every other case lands on CPU.
        if (plan.strict && plan.isGpuWorker)
            return { strictFail: `[method_encoder=${encoderOpt}] ${plan.strictWhy}; node_strict forbids the CPU fallback`, notes };
        if (plan.cpuWhy) notes.push(`☐[method_encoder=${encoderOpt}] Encoder: ${plan.cpuName} (${plan.cpuWhy})\n`);
        return { family: 'cpu', encoderName: plan.cpuName, notes };
    };

    // ====== TONEMAP BACKEND ROUTING ======
    // The GPU tonemap curve, shared by the probe below and both emit sites in buildVideoArgs. The probe's verdict is only meaningful because it runs THE SAME
    // island the transcode will use, so these must never drift: tune the curve here and every consumer moves together. (The CPU tonemapx long form is separate
    // - a different filter with a different option spelling.) Callers append the pixel format, which differs per site.
    const GPU_TONEMAP_OPTS = 'tonemap=bt2390:t=bt709:m=bt709:p=bt709:r=tv:format=';

    // Probe whether a GPU tonemap backend actually initialises on this node (hw device present + filter usable). The tonemap_* filters REJECT a non-HDR
    // input ("unsupported transfer function"), so a plain test pattern false-negatives - the probe stamps a synthetic HDR transfer (smpte2084/bt2020) onto
    // one frame and runs the real island. Cheap; the encoder-side re-upload (vaapi) is not probed here (that device is already proven by the encoder probe).
    const confirmTonemap = (ffmpegPath, backend) => {
        const island = 'format=p010le,setparams=color_trc=smpte2084:color_primaries=bt2020:colorspace=bt2020nc,hwupload,'
            + `tonemap_${backend}=${GPU_TONEMAP_OPTS}nv12,hwdownload,format=nv12`;
        const args = ['-hide_banner', '-init_hw_device', `${backend}=tm`, '-filter_hw_device', 'tm',
            '-f', 'lavfi', '-i', testColorSource('gray'), '-vf', island, '-frames:v', '1', '-f', 'null', '-'];
        return probeOk(ffmpegPath, args);
    };

    // Route the HDR->SDR tonemap to the GPU filter that rides the chosen encoder's device stack, keeping every node's output in the ONE consistent tonemap_*
    // family (cuda ~= opencl ~= videotoolbox, SSIM ~0.9997 - validated on real NVIDIA/Intel/Mac hardware). CPU 'tonemapx' scores SSIM 0.976 against that family
    // on real content (the deficit all in the V plane) and sits 0.42% behind a colourist's grade (0.9755 vs 0.9796, measured 2026-08-21 - awk-ffmpeg-test's
    // build-facts.md); it is used only as a fallback when no GPU tonemap initialises or the encoder is software. nvenc->cuda (native, shares nvenc's driver);
    // qsv/vaapi/amf->opencl (Intel/AMD); videotoolbox->itself. The GPU choice is probe-confirmed per node (falls back to tonemapx if e.g. the OpenCL ICD is
    // absent). Tests inject __awkCap.tonemap.<backend>=false to force the fallback without spawning ffmpeg.
    const TONEMAP_BACKEND = { videotoolbox: 'videotoolbox', nvenc: 'cuda', qsv: 'opencl', vaapi: 'opencl', amf: 'opencl', cpu: 'cpu' };
    const resolveTonemapBackend = ({ family, otherArguments }) => {
        const base = TONEMAP_BACKEND[family] || 'cpu';
        if (base === 'cpu') return 'cpu';
        if (injectedCap) return (injectedCap.tonemap && injectedCap.tonemap[base] === false) ? 'cpu' : base;
        const ffmpegPath = ffmpegPathOf(otherArguments);
        return confirmTonemap(ffmpegPath, base) ? base : 'cpu';
    };
    // ====== END TONEMAP BACKEND ROUTING ======
    // ====== END ENCODER CAPABILITY + SELECTION ======

    // ====== TEST ENCODE ======
    // Before the transcode, each candidate encoder runs for a few seconds on the REAL file through the exact production command, so one that cannot encode
    // THIS file at its real size and depth (Skylake QSV on 10-bit HEVC, VCE 2.0 at 3840 wide - a one-frame 256x256 confirm passes both) falls back
    // instead of failing or hanging the job, and the encode time is estimated against guard_encode_hours. Pure helpers and one driver: the spawn, every
    // file fact and every log line come from the caller, so the harness lifts this block whole and drives it with canned spawns.

    const ENCODE_CAP_MAX_HOURS = 168;
    // Wall budgets per window. Hardware: no output frame by 10 s = stalled (first output measured <= 3.01 s at a keyframe seek on the J4125, so a 3.3x
    // margin), and a window that has frames but no steady readings is re-run once for 20 s. CPU: up to 60 s, 30 s when there is no cap (the run then buys
    // only capability and a logged estimate).
    const TEST_HW_BUDGET_S = 10;
    const TEST_HW_RERUN_S = 20;
    const TEST_CPU_MAX_S = 60;
    const TEST_CPU_NOCAP_S = 30;
    // A CPU window also stops after 20 s of CONTENT, so a fast software encode is not held to its wall budget (a 1080p libx264 window otherwise encoded
    // half of a 90 s file); a slow one still ends at the budget, with its readings.
    const TEST_CPU_CONTENT_S = 20;
    // A hardware window also stops after 300 s of content, a backstop where the process-group kill cannot reach (Windows, behind a wrapper script): it
    // bounds how long a stray ffmpeg can go on encoding and holding the GPU session. A window that gets that far ends on EOF with its readings, as a CPU
    // window does at 20 s, so no reading is lost.
    const TEST_HW_CONTENT_S = 300;
    // An encoder's pipeline depth, in frames, bounds how fast it can be while still showing no output: libx265 slow holds a 25-frame lookahead plus its
    // frame threads (measured <= 18 frames on the J4125, <= 22 on the M1), so 40 can only over-state the wait - the safe direction.
    const TEST_D_MAX = 40;
    const TEST_STARTUP_SLACK_S = 5;
    // When one window decides. Hardware: its single-window estimates on the J4125 ran 0.64-1.28x the true time, so one window decides only outside that
    // band; libx265's one-window error is wider (0.64-1.43x at 10 s), so a CPU candidate decides early only under half or over twice the cap. Otherwise
    // windows are added, up to five, and pooled.
    const TEST_EDGES = { hw: [0.64, 1.28], cpu: [0.5, 2] };
    const TEST_POSITIONS = [0.5, 0.3, 0.7, 0.1, 0.9];
    // ffmpeg's input seek on a demuxer without seek-to-pts (Matroska) subtracts 3/23 s from the target whenever a stream has a decode delay, so a seek to
    // exactly a keyframe lands on the PREVIOUS one and decodes a whole GOP first (measured 5.10 s against 0.64 s for one frame of 4K HEVC). Seeking 0.131 s
    // past the keyframe lands on it in every container.
    const TEST_SEEK_PAD_S = 0.131;
    const KEYFRAME_PROBE_TIMEOUT_MS = 5000;
    const DECODE_CHECK_TIMEOUT_MS = 60000;
    // stderr at -v error still reaches ~200 KB per 10 s on a damaged source, and Node applies maxBuffer to stdout and stderr separately.
    const TEST_MAX_BUFFER = 16 * 1024 * 1024;
    // ffmpeg errors that say the GPU or the node was busy rather than incapable. They only change how a failure is worded - ffmpeg prints 'Cannot allocate
    // memory' for a damaged source or a full frame pool too, so a busy-worded failure still gets its decode check, the CPU-tonemap retry and the retry from
    // the start; a busy encoder falls back like any other, and once no candidate is left the failure says a requeue may succeed.
    const TEST_BUSY_RE = /out of memory|OpenEncodeSessionEx|Device or resource busy|Cannot allocate memory|CUDA_ERROR_OUT_OF_MEMORY/i;
    const TEST_DV_RE = /without AV_FRAME_DATA_DOVI_METADATA/;

    const splitWs = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
    // Seconds to six decimals, rounded UP to the microsecond: a seek target just below a keyframe re-seeks a whole GOP back.
    const ceilSec6 = (x) => (Math.ceil(Math.round(x * 1e9) / 1e3) / 1e6).toFixed(6);
    const sec6 = (x) => Number(x).toFixed(6);

    // How a spawnSync ended. Our own timeout and an outside kill -9 (a cgroup OOM kill) both arrive as SIGKILL; only error.code tells them apart.
    const classifySpawn = (r) => {
        const code = r && r.error && r.error.code;
        if (code === 'ETIMEDOUT') return 'timeout';   // our wall budget: judge the progress blocks it left
        if (code === 'ENOBUFS') return 'flood';       // more error output than maxBuffer
        if (r && r.error) return 'noexec';            // ENOENT/EACCES/...: ffmpeg could not be run at all
        if (r && r.signal) return 'killed';           // killed by the system, usually out of memory
        if (r && Number(r.status) > 0) return 'exit';
        return r && r.status === 0 ? 'eof' : 'noexec';
    };
    // The cause of a failed run, from its stderr. ffmpeg 7 prints the encoder's or filter's own error first, then the same teardown cascade on every
    // failure, ending on 'Nothing was written into output file' (x265 and SVT-AV1 add their own summaries), so the last line never names the cause. The
    // encoder's own line wins (a damaged source logs decoder errors ahead of it), else the first line outside that cascade; the '[name @ 0x...] ' prefixes
    // are dropped, so the text is the same from run to run (measured on jellyfin-ffmpeg 7.1.4: VideoToolbox at 8K, main10 on 8-bit input, x264 high at
    // 10-bit, x265 main10 at 12-bit, a bad preset, a bad filter, an invalid -ss).
    const TEST_STDERR_NOISE_RE = new RegExp('^(Error sending frames to consumers|Task finished with error code|Terminating thread with return code'
        + '|Could not open encoder before EOF|Nothing was written into output file|Conversion failed|Error opening (input|output) files?\\b'
        + '|Error reinitializing filters|encoded \\d+ frames|x26[45] \\[(info|warning)\\]|Svt\\[(info|warn)\\])');
    const stderrCause = (s, encoderName) => {
        const lines = String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const bare = (l) => l.replace(/^(\[[^\]]*\]\s*)+/, '');
        const own = lines.find((l) => (encoderName && l.startsWith(`[${encoderName} @`)) || /^(x26[45] \[error\]|Svt\[error\])/.test(l));
        const line = own || lines.find((l) => !TEST_STDERR_NOISE_RE.test(bare(l))) || lines[lines.length - 1] || '';
        return bare(line) || line;
    };

    // Read ffmpeg's -progress blocks. A block's time since ffmpeg started is out_time / speed (speed = media time over wall time), so the reading needs
    // no clock of its own; blocks begin only once the input is open and the encoder is initialised, and libx265 writes frame=0 / N/A blocks before its
    // first output, so neither the block index nor the first block is a time. firstOutput = the time of the first block carrying a frame. The steady span
    // runs from the first block at least 1 s after that to the second-last block (the last can carry an end-of-input flush).
    const parseProgress = (stdout) => {
        const blocks = [];
        let cur = {};
        for (const line of String(stdout || '').split(/\r?\n/)) {
            const eq = line.indexOf('=');
            if (eq < 0) continue;
            const k = line.slice(0, eq).trim();
            const v = line.slice(eq + 1).trim();
            if (k !== 'progress') { cur[k] = v; continue; }
            const frame = Number(cur.frame);
            const outUs = Number(cur.out_time_us);
            const speed = parseFloat(cur.speed);
            const timed = Number.isFinite(outUs) && outUs >= 0 && Number.isFinite(speed) && speed > 0;
            blocks.push({ frame: Number.isFinite(frame) ? frame : 0, outTime: Number.isFinite(outUs) && outUs >= 0 ? outUs / 1e6 : null,
                elapsed: timed ? outUs / 1e6 / speed : null, end: v === 'end' });
            cur = {};
        }
        const first = blocks.find((b) => b.frame > 0 && b.elapsed !== null);
        const last = blocks.length ? blocks[blocks.length - 1] : null;
        let steady = null;
        if (first) {
            const span = blocks.slice(0, -1).filter((b) => b.elapsed !== null && b.elapsed >= first.elapsed + 1);
            const a = span[0];
            const b = span[span.length - 1];
            if (span.length >= 2 && b.elapsed > a.elapsed && b.outTime > a.outTime)
                steady = { speed: (b.outTime - a.outTime) / (b.elapsed - a.elapsed), fps: (b.frame - a.frame) / (b.elapsed - a.elapsed),
                    fpsMedia: (b.frame - a.frame) / (b.outTime - a.outTime) };
        }
        const timedLast = [...blocks].reverse().find((b) => b.elapsed !== null);
        return { blocks: blocks.length, frames: last ? last.frame : 0, outTime: timedLast ? timedLast.outTime : 0,
            lastElapsed: timedLast ? timedLast.elapsed : null, firstOutput: first ? first.elapsed : null, steady, ended: !!(last && last.end) };
    };

    // Packets from ffprobe's `packet=pts_time,dts_time,flags` CSV: the time is pts, or dts where pts is N/A (DivX/Xvid in AVI); a further field is ignored
    // (mpegts prints a trailing comma after the flags). keyframeTimes keeps the keyframes' times only.
    const packetRows = (csv) => String(csv || '').split(/\r?\n/).map((l) => l.split(',')).filter((f) => f.length >= 3)
        .map((f) => { const p = parseFloat(f[0]); return { t: Number.isFinite(p) ? p : parseFloat(f[1]), key: /^K/.test(f[2].trim()) }; })
        .filter((r) => Number.isFinite(r.t));
    const keyframeTimes = (csv) => packetRows(csv).filter((r) => r.key).map((r) => r.t);

    // The harmonic mean of window speeds = the mean time per media second, the quantity an encode time sums (an arithmetic mean of speeds under-states it).
    const poolSpeeds = (speeds) => speeds.length / speeds.reduce((s, v) => s + 1 / v, 0);

    // One candidate's test encode. o = { spawn(cmd, argv, opts) -> spawnSync-shaped result, ffmpeg, ffprobe ('' = none), file, streamIndex (the primary's
    // absolute index), inputArgv, videoArgv, isCpu, durationS, startS, capH (0 = no cap), declaredFps (a corroborated output frame rate, or 0), logOnly
    // (one window, no re-run, no decode check), lastResort() (true for the last candidate standing: one retry from the start of the file; asked only once
    // a mid-file window has failed), memo: { keyframes: Map, decodes: Map, encoded: Set } shared by every candidate of one file }. Returns { outcome: 'pass' |
    // 'fail' | 'stall' | 'slow' | 'source' | 'noexec', estimateH, windows (how many the estimate pooled), fps, needFps, why, tail, busy, dv, inconclusive,
    // noFrameS, stallFrames, sourceAtS, fromStart, firstFail (the failed window a retry from the start replaced) }.
    const runTestEncode = (o) => {
        const dur = Number(o.durationS) > 0 ? Number(o.durationS) : 0;
        const start = Number(o.startS) > 0 ? Number(o.startS) : 0;
        const cap = Number(o.capH) > 0 ? Number(o.capH) : 0;
        const [accept, drop] = o.isCpu ? TEST_EDGES.cpu : TEST_EDGES.hw;
        const est = (speed) => (dur > 0 && speed > 0 ? dur / speed / 3600 : null);
        // A corroborated frame rate bounds how long a CPU candidate may show no output and still keep the pace the cap needs.
        const reqFps = cap > 0 && dur > 0 && o.declaredFps > 0 ? (o.declaredFps * dur) / (cap * 3600) : 0;
        const tDrop = reqFps > 0 ? TEST_D_MAX / reqFps + TEST_STARTUP_SLACK_S : 0;
        const codecAt = o.videoArgv.findIndex((a) => /^-c:v/.test(a));
        const encoderName = codecAt < 0 ? '' : String(o.videoArgv[codecAt + 1] || '');
        const budgetFor = () => (!o.isCpu ? TEST_HW_BUDGET_S : cap === 0 ? TEST_CPU_NOCAP_S
            : tDrop > 0 ? Math.min(TEST_CPU_MAX_S, Math.ceil(tDrop + 10)) : TEST_CPU_MAX_S);

        // The seek for a window at relative time T: one packet at T (indexed containers seek it back to the keyframe), else the last keyframe in the 20 s
        // before T (mpegts and other unindexed inputs), else the first in the 3 s after, else T itself. null S = no -ss (the start of the file). When the
        // look-back and the look-ahead both ran and the stream has NO packet in that span, the stated timeline has no content at T - a timestamp jump in
        // the middle of an mpegts (two recordings joined), or a stated duration past the video's end - so the window is empty without an encode
        // (ffprobe answers such a span with the last packet before the gap, which the span test discards).
        const seekFor = (T) => {
            if (o.memo.keyframes.has(T)) return o.memo.keyframes.get(T);
            let res;
            if (!o.ffprobe) res = { unknown: true };
            else {
                const at = start + T;
                const probe = (interval) => {
                    const r = o.spawn(o.ffprobe, ['-hide_banner', '-v', 'error', '-select_streams', String(o.streamIndex), '-read_intervals', interval,
                        '-show_entries', 'packet=pts_time,dts_time,flags', '-of', 'csv=p=0', o.file],
                    { encoding: 'utf8', timeout: KEYFRAME_PROBE_TIMEOUT_MS, maxBuffer: TEST_MAX_BUFFER });
                    return classifySpawn(r) === 'eof' ? packetRows(r.stdout) : null;
                };
                const keys = (rows) => rows.filter((r) => r.key).map((r) => r.t);
                const one = probe(`${sec6(at)}%+#1`);
                const lo = Math.max(start, at - 20);
                // The first probe's keyframe counts only inside the look-back span. A keyframe further back is what an index snaps back to on a long-GOP file,
                // and also the last packet before a timestamp gap, which ffprobe echoes; it is kept as a fallback and the spans decide.
                const kOne = one ? keys(one).find((t) => t <= at + 1e-6) : undefined;
                let K = kOne !== undefined && kOne >= lo - 1e-6 ? kOne : undefined;
                let failed = one === null;
                let looked = 0;
                // A packet of the stream inside [T - 20 s, T + 3 s], from any of the three probes.
                let near = !!one && one.some((r) => r.t >= lo - 1e-6 && r.t <= at + 3 + 1e-6);
                if (!failed && K === undefined) {
                    const back = probe(`${sec6(lo)}%${sec6(at)}`);
                    failed = back === null;
                    if (back) {
                        looked++;
                        const inSpan = back.filter((r) => r.t >= lo - 1e-6 && r.t <= at + 1e-6);
                        near = near || inSpan.length > 0;
                        K = keys(inSpan).pop();
                    }
                }
                if (!failed && K === undefined) {
                    const fwd = probe(`${sec6(at)}%+3`);
                    failed = fwd === null;
                    if (fwd) {
                        looked++;
                        const inSpan = fwd.filter((r) => r.t >= at - 1e-6 && r.t <= at + 3 + 1e-6);
                        near = near || inSpan.length > 0;
                        K = keys(fwd).find((t) => t >= at - 1e-6);
                    }
                }
                if (!failed && K === undefined && !(looked === 2 && !near)) K = kOne;
                res = failed ? { unknown: true } : K === undefined && looked === 2 && !near ? { empty: true }
                    : { S: K === undefined ? sec6(T) : ceilSec6(Math.max(0, K - start + TEST_SEEK_PAD_S)) };
            }
            o.memo.keyframes.set(T, res);
            return res;
        };
        const encode = (S, budgetS) => {
            const argv = ['-hide_banner', '-nostdin', '-v', 'error', ...o.inputArgv, ...(S === null ? [] : ['-ss', S]), '-i', o.file,
                '-t', String(o.isCpu ? TEST_CPU_CONTENT_S : TEST_HW_CONTENT_S), '-map', `0:${o.streamIndex}`, ...o.videoArgv, '-an', '-sn', '-dn',
                '-progress', 'pipe:1', '-stats_period', '0.5', '-f', 'null', '-'];
            const r = o.spawn(o.ffmpeg, argv, { encoding: 'utf8', timeout: budgetS * 1000, maxBuffer: TEST_MAX_BUFFER, killSignal: 'SIGKILL' });
            const stderr = String((r && r.stderr) || '');
            return { kind: classifySpawn(r), p: parseProgress(r && r.stdout), tail: stderrCause(stderr, encoderName), busy: TEST_BUSY_RE.test(stderr),
                dv: TEST_DV_RE.test(stderr), budgetS, code: r && r.error && r.error.code, status: r ? r.status : null };
        };
        // A start-up-inclusive reading only ever under-states the speed, so it may pass a candidate but never drop one: it is used only where it passes the
        // candidate at once (lbPasses: on its own, or pooled with the windows read so far), and never enters a pool that goes on to the drop edges.
        const lowerBound = (lb, p) => ({ speed: lb, fps: null, fpsMedia: p.outTime > 0 ? p.frames / p.outTime : null });
        // Decide one window from its run(s). Returns { speed } | { noEstimate: why } | { fail: run, stall } | { slow: true, noFrameS }.
        const judge = (T, S, lbPasses = (lb) => est(lb) < accept * cap) => {
            const budgetS = budgetFor();
            const r = encode(S, budgetS);
            if (r.kind === 'noexec') return { noexec: r };
            if (r.kind === 'killed' || r.kind === 'flood' || r.kind === 'exit') return { fail: r };
            const p = r.p;
            if (r.kind === 'eof') {
                if (p.frames === 0) return { empty: true };
                const left = dur - (T === null ? 0 : T);
                if (dur > 0 && p.outTime < 0.5 * Math.min(left, o.isCpu ? TEST_CPU_CONTENT_S : TEST_HW_CONTENT_S)) return { noEstimate: 'eof-early' };
                if (p.steady) return { speed: p.steady.speed, fps: p.steady.fps, fpsMedia: p.steady.fpsMedia };
                const lb = p.lastElapsed > 0 ? p.outTime / p.lastElapsed : 0;   // start-up included, so a lower bound on the speed
                if (cap > 0 && est(lb) !== null && lbPasses(lb)) return lowerBound(lb, p);
                return { noEstimate: 'no-steady' };
            }
            // Our budget ended it.
            if (!o.isCpu) {
                if (p.frames === 0) return { fail: r, stall: true };
                if (p.steady) return { speed: p.steady.speed, fps: p.steady.fps, fpsMedia: p.steady.fpsMedia };
                const lb = p.outTime / budgetS;
                if (cap > 0 && est(lb) !== null && lbPasses(lb)) return lowerBound(lb, p);
                if (o.logOnly || cap === 0) return { noEstimate: 'no-steady' };
                const r2 = encode(S, TEST_HW_RERUN_S);
                if (r2.kind === 'killed' || r2.kind === 'flood' || r2.kind === 'exit') return { fail: r2 };
                if (r2.p.steady) return { speed: r2.p.steady.speed, fps: r2.p.steady.fps, fpsMedia: r2.p.steady.fpsMedia };
                if (r2.p.frames <= p.frames) return { fail: r2, stall: true, firstFrames: p.frames };
                return ubVerdict(r2.p);
            }
            if (p.firstOutput === null) {
                if (tDrop > 0 && budgetS >= tDrop) return { slow: true, noFrameS: budgetS };
                return { noEstimate: 'no-frame', noFrameS: budgetS };
            }
            if (p.steady) return { speed: p.steady.speed, fps: p.steady.fps, fpsMedia: p.steady.fpsMedia };
            return ubVerdict(p);
        };
        // Frames but too few readings: the fastest this encoder can be is its output plus a full pipeline, over the time since its first output. Both times
        // are ffmpeg's own (out_time / speed at the last and the first output block): our wall budget also counts the spawn, the input open and the stats
        // period after the last block, which would under-state that bound and could drop a candidate that keeps the pace.
        const ubVerdict = (p) => {
            const fpsMedia = p.outTime > 0 ? p.frames / p.outTime : 0;
            const denom = (p.lastElapsed !== null ? p.lastElapsed : 0) - (p.firstOutput !== null ? p.firstOutput : TEST_STARTUP_SLACK_S);
            const ub = fpsMedia > 0 && denom > 0 ? (p.outTime + TEST_D_MAX / fpsMedia) / denom : 0;
            if (cap > 0 && ub > 0 && est(ub) > cap) return { slow: true, speed: ub, fpsMedia };
            return { noEstimate: 'no-steady' };
        };
        // The software decode of the window a candidate failed on: does the SOURCE decode there? Once per window per file, shared by every candidate, and
        // never for a window some candidate has already encoded (that proves it decodes). Only a clean non-zero exit convicts the source; our timeout, a
        // flood or a signal is inconclusive and leaves the fault with the encoder.
        const decodeCheck = (T, S, lastOut) => {
            const key = T === null ? 'start' : T;
            if (o.memo.encoded.has(key)) return 'encoder';
            if (o.memo.decodes.has(key)) return o.memo.decodes.get(key);
            const D = Math.max(2, (lastOut || 0) + 2);
            const argv = ['-hide_banner', '-nostdin', '-v', 'error', ...(S === null ? [] : ['-ss', S]), '-i', o.file, '-map', `0:${o.streamIndex}`,
                '-t', D.toFixed(3), '-f', 'null', '-'];
            const r = o.spawn(o.ffmpeg, argv, { encoding: 'utf8', timeout: DECODE_CHECK_TIMEOUT_MS, maxBuffer: TEST_MAX_BUFFER, killSignal: 'SIGKILL' });
            const kind = classifySpawn(r);
            const verdict = kind === 'exit' ? 'source' : kind === 'eof' ? 'encoder' : 'inconclusive';
            o.memo.decodes.set(key, verdict);
            return verdict;
        };
        const failResult = (w, T, S) => {
            const r = w.fail;
            const out = { outcome: w.stall ? 'stall' : 'fail', tail: r.kind === 'killed' ? '' : r.tail, why: r.kind, busy: r.kind === 'killed' || r.busy,
                dv: r.dv, noFrameS: w.stall ? r.budgetS : null, stallFrames: w.firstFrames || 0, status: r.status };
            if (o.logOnly || r.kind === 'killed') return out;
            const v = decodeCheck(T, S, r.p.outTime);
            if (v === 'source') return { outcome: 'source', sourceAtS: T === null ? 0 : T };
            out.inconclusive = v === 'inconclusive';
            return out;
        };

        const speeds = [];
        const fpsList = [];
        let fpsMedia = null;
        const unknownDuration = !(dur > 0);
        // A log-only candidate takes one window: the verdict below decides it on that one window.
        const positions = unknownDuration ? [null] : (cap === 0 ? [TEST_POSITIONS[0]] : TEST_POSITIONS);
        const lbPooled = (lb) => est(poolSpeeds([...speeds, lb])) < accept * cap;
        for (let i = 0; i < positions.length; i++) {
            let T = positions[i] === null ? null : positions[i] * dur;
            let seek = T === null ? { S: null } : seekFor(T);
            if (seek.unknown) { T = null; seek = { S: null, unknown: true }; }
            let w = seek.empty ? { empty: true } : judge(T, seek.S, lbPooled);
            // A window that encodes nothing at a position the stated duration says has content means the video ends before that duration (an mpegts whose
            // audio outlasts its video, a bad end timestamp): 10% in, then the start, still test the encoder, but the stated duration is no basis for a time
            // verdict. A window that already ran from the start has nowhere else to go, and a log-only candidate takes its one window.
            let endsEarly = false;
            if (w.empty && T !== null && !o.logOnly) {
                endsEarly = true;
                for (const frac of [0.1, null]) {
                    const T2 = frac === null ? null : frac * dur;
                    if (T2 === T) continue;
                    const s2 = T2 === null ? { S: null } : seekFor(T2);
                    T = s2.unknown ? null : T2;
                    seek = s2.unknown ? { S: null, unknown: true } : s2;
                    w = seek.empty ? { empty: true } : judge(T, seek.S, lbPooled);
                    if (!w.empty) break;
                }
            }
            // A log-only candidate at a position the probes already showed empty runs no encode at all: nothing to count as tested.
            if (w.empty) return seek.empty && o.logOnly ? { outcome: 'pass', estimateH: null, why: 'eof-early', noRun: true }
                : { outcome: 'pass', estimateH: null, why: 'empty' };
            if (w.noexec) return { outcome: 'noexec', why: w.noexec.code || 'noexec' };
            if (w.fail) {
                const f = failResult(w, T, seek.S);
                if (f.outcome === 'source' || f.why === 'killed' || o.logOnly || T === null || !o.lastResort()) return f;
                // The last candidate standing gets one retry from the start of the file before it fails on one mid-file window: a Dolby Vision RPU that
                // refers back to an earlier one, say, cannot be decoded after a seek, while the full encode starts at frame 0. The failed window rides along
                // (firstFail), so the log still says what a seek into this file does.
                const w0 = judge(null, null);
                // A retry the system killed still counts: the failure is worded as before, plus that kill and the requeue hint (O3).
                if (w0.fail && w0.fail.kind === 'killed') return { ...f, busy: true, retryKilled: true };
                if (w0.fail) return { ...f, retryFailed: true };
                if (w0.noexec || w0.slow) return f;
                if (w0.speed && !endsEarly) {
                    const h = est(w0.speed);
                    return { outcome: cap > 0 && h > cap ? 'slow' : 'pass', estimateH: h, windows: 1, fps: w0.fps, needFps: null, fromStart: true,
                        firstFail: f };
                }
                // A retry that showed no frame proved nothing, so it says that, whatever the earlier windows suggested about the file's length.
                const why0 = w0.empty ? 'empty' : w0.noEstimate === 'no-frame' ? 'no-frame' : endsEarly ? 'eof-early' : w0.noEstimate || 'empty';
                return { outcome: 'pass', estimateH: null, why: why0, noFrameS: w0.noFrameS || null, fromStart: true, firstFail: f };
            }
            // Capability only: no duration to estimate against, or no keyframe could be read, so the window ran from the start. A CPU window with no frame
            // in it showed no capability either, so it says that instead (and proves nothing about how the start decodes).
            const noFrame = w.noEstimate === 'no-frame' || (w.slow && !w.speed);
            if (unknownDuration || seek.unknown) {
                if (noFrame) return { outcome: 'pass', estimateH: null, why: 'no-frame', noFrameS: w.noFrameS || null };
                o.memo.encoded.add('start');
                return { outcome: 'pass', estimateH: null, why: unknownDuration ? 'unknown' : 'no-keyframe' };
            }
            if (endsEarly) {
                return noFrame ? { outcome: 'pass', estimateH: null, why: 'no-frame', noFrameS: w.noFrameS || null }
                    : { outcome: 'pass', estimateH: null, why: 'eof-early' };
            }
            // After timed windows, one that gave no reading (too few progress readings, no frame by its budget) adds nothing and decides nothing: the pool
            // read so far decides at the last position, so a reading already over the cap still counts.
            if (w.noEstimate && speeds.length) {
                if (i < positions.length - 1) continue;
                const hp = est(poolSpeeds(speeds));
                return { outcome: cap > 0 && hp > cap ? 'slow' : 'pass', estimateH: hp, windows: speeds.length,
                    fps: fpsList.length ? poolSpeeds(fpsList) : null, needFps: cap > 0 && fpsMedia > 0 ? (fpsMedia * dur) / (cap * 3600) : null };
            }
            if (w.noEstimate) return { outcome: 'pass', estimateH: null, why: w.noEstimate, noFrameS: w.noFrameS || null };
            if (w.slow) {
                return { outcome: 'slow', estimateH: w.speed ? est(w.speed) : null, windows: 1, fps: null, noFrameS: w.noFrameS || null,
                    needFps: reqFps > 0 ? reqFps : (w.fpsMedia > 0 && cap > 0 ? (w.fpsMedia * dur) / (cap * 3600) : null) };
            }
            o.memo.encoded.add(T === null ? 'start' : T);
            speeds.push(w.speed);
            if (w.fps > 0) fpsList.push(w.fps);
            if (w.fpsMedia > 0) fpsMedia = w.fpsMedia;
            const h = est(poolSpeeds(speeds));
            const done = (outcome) => ({ outcome, estimateH: h, windows: speeds.length, fps: fpsList.length ? poolSpeeds(fpsList) : null,
                needFps: cap > 0 && fpsMedia > 0 ? (fpsMedia * dur) / (cap * 3600) : null });
            if (cap === 0 || h < accept * cap) return done('pass');
            // A candidate tested only for the log has one window, read straight against the cap - its line never calls a run over the limit ok.
            if (o.logOnly) return done(h > cap ? 'slow' : 'pass');
            if (h > drop * cap) return done('slow');
            if (i === positions.length - 1) return done(h > cap ? 'slow' : 'pass');
        }
        return { outcome: 'pass', estimateH: null, why: 'empty' };
    };
    // ====== END TEST ENCODE ======

    // ====== PER-ENCODER QUALITY / SPEED TRANSLATION ======
    // One normalized quality target (HEVC-CRF scale, lower = better) mapped to each encoder's native flag so the same setting yields comparable
    // quality on every node. H.264 uses the same number; AV1 is shifted onto the SVT-AV1 / AV1 CQ scale (AV1_Q_OFFSET, clamped 0-63) since the same
    // visual quality sits at a higher number there. HW flag syntax mirrors the proven community plugins (Migz nvenc -cq:v, Boosh qsv
    // -global_quality, vaapi -qp, amf -qp_i/-qp_p). VideoToolbox's -q:v is an inverted 1-100 scale (higher = better), opposite the
    // low-is-better HEVC-CRF q; this linear fit maps CRF onto it (intercept = -q:v at CRF 0, pre-clamp; slope = -q:v units dropped per +1 CRF).
    // QUALITY_MAX: the widest scale any emit uses (AV1's, on every AV1 encoder; HEVC/H.264 targets clamp to 51 below), and parseQuality bounds input by it.
    const QUALITY_MAX = 63;
    const AV1_Q_OFFSET = 8;
    const VT_Q_INTERCEPT = 118;
    const VT_Q_SLOPE = 2.6;
    const nativeQuality = (targetCodec, family, qNorm) => {
        let q = Math.round(qNorm);
        // Clamp to each scale's real range so an out-of-range quality input can't emit a CRF/QP ffmpeg rejects (e.g. libx265 -crf 52
        // errors). An AV1 target goes 0-63 on every AV1 encoder (libsvtav1 CQ, av1_nvenc -cq, av1_qsv/vaapi/amf qp); every HEVC/H.264
        // emit - libx264/libx265 -crf, nvenc -cq, qsv -global_quality, vaapi/amf -qp - caps at ~0-51. videotoolbox remaps q anyway.
        if (targetCodec === 'av1') q = Math.max(0, Math.min(QUALITY_MAX, q + AV1_Q_OFFSET));
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
    // Normalized speed -> each family's native knob: libsvtav1's -preset is numeric (-2 to 13), the x26x pair and qsv named, nvenc p1-p7, amf -quality;
    // vaapi/videotoolbox have no comparable preset (omitted). Slower = better/smaller.
    const nativeSpeed = (targetCodec, family, speed) => {
        if (family === 'cpu') {
            if (targetCodec === 'av1') return `-preset ${{ slow: '4', medium: '6', fast: '8' }[speed]}`;
            return `-preset ${{ slow: 'slow', medium: 'medium', fast: 'fast' }[speed]}`;
        }
        if (family === 'nvenc') return `-preset ${{ slow: 'p7', medium: 'p5', fast: 'p3' }[speed]}`;
        if (family === 'qsv') return `-preset ${{ slow: 'veryslow', medium: 'medium', fast: 'veryfast' }[speed]}`;
        if (family === 'amf') return `-quality ${{ slow: 'quality', medium: 'balanced', fast: 'speed' }[speed]}`;
        return '';   // vaapi / videotoolbox: no equivalent preset knob
    };
    // ====== END PER-ENCODER QUALITY / SPEED TRANSLATION ======

    // ====== OUTPUT TIER + CONTAINER ======

    // Map an output height to its resolution tier (SD/720p/1080p/4K, boundaries 576/720/1080), so the CRF ladder (qualityForHeight)
    // and the Dolby-Vision VBV ladder (DV_VBV_KBPS_BY_TIER) share one set of breakpoints instead of repeating them.
    const heightTier = (h) => (h <= 576 ? 'sd' : h <= 720 ? 'p720' : h <= 1080 ? 'p1080' : 'p4k');
    // A Dolby Vision encode's -maxrate per output tier, in kb/s - why one is needed at all is at its use in buildVideoArgs.
    const DV_VBV_KBPS_BY_TIER = { sd: 10000, p720: 20000, p1080: 40000, p4k: 100000 };

    // QuickTime VIDEO containers - the gate for every QuickTime fourCC emit (hvc1/dvh1/av01/avc1), on both the encode and the copy path;
    // the avi RIFF retag in emitLosslessStrip is the one non-QuickTime fourCC and keys on its own container test. Deliberately mp4/m4v/mov
    // WITHOUT m4a: isMp4Family includes m4a and is right for the -movflags use_metadata_tags decision, but not for tagging a video stream.
    const isQtVideoContainer = (container) => ['mp4', 'm4v', 'mov'].includes(container);
    // The copy path's QuickTime fourCC per source codec (qtVideoTag reads it). The CODEC COVERAGE difference against the encode path below
    // is intentional and must stay: this path copies an arbitrary source codec (so it maps all three), while the encode path only ever emits
    // a fourCC for hevc and picks dvh1-vs-hvc1 from whether the DV RPU survives - a choice a copy cannot make. Do not merge the two. The key
    // is an ffprobe codec_name, so the read goes through tableGet (see its definition for why a bare TABLE[key] || fallback is unsafe here).
    const QT_VIDEO_TAG = { hevc: ' -tag:v:0 hvc1', av1: ' -tag:v:0 av01', h264: ' -tag:v:0 avc1' };

    // A source container that cannot hold the codec this run would write is a refusal, not an encode. Two failure shapes, both measured on jellyfin-ffmpeg
    // 7.1.4 by encoding into every container in Tdarr's default filter plus the 3gp/ogg/asf family and reading the result back (explicit hvc1/hev1/av01
    // tags change nothing; .divx and .tp/.trp/.tod were written through the -f their muxer needs): the muxer REFUSES at header write (exit 234, so the
    // file reaches the error queue with nothing but ffmpeg's own message), or it exits 0 and writes a file that no longer reads back as that codec - AV1
    // into MPEG-PS reads back 'unknown', into MPEG-TS as nothing, and HEVC into avi as rawvideo, which would make every later pass re-encode it. mkv, mp4
    // and flv take all three. In the designed stack clean_and_remux has already remuxed to mkv or mp4, so only a standalone run - or one ordered before
    // it - meets these. awk-ffmpeg-test's muxmatrix re-measures every cell (its WRITEBACK rows mirror this table, guarded by selftest_mirrors). .m4v is
    // absent because it is written through the mp4 muxer, which takes all three, and an extension no muxer writes back at all (.evo and the rest) never
    // gets this far - both are the output muxer section's business.
    const CONTAINER_REFUSES_VIDEO = {
        webm: ['hevc', 'h264'], mov: ['av1'], '3gp': ['hevc', 'av1'], '3g2': ['hevc', 'av1'],
        wmv: ['hevc'], asf: ['hevc'], ogv: ['hevc', 'h264', 'av1'], ogg: ['hevc', 'h264', 'av1'],
        avi: ['hevc'], divx: ['hevc'], mpg: ['av1'], mpeg: ['av1'], vob: ['av1'], ts: ['av1'], m2ts: ['av1'], mts: ['av1'], tp: ['av1'], trp: ['av1'],
        tod: ['av1'],
    };
    const containerRefusesTarget = (container, targetCodec) => tableGet(CONTAINER_REFUSES_VIDEO, container, []).includes(targetCodec);
    // The cells where even a STREAM COPY back into the same container is refused, for the lossless strip: the muxer has no way to store the codec at all,
    // so it refuses at header write whatever tag the stream carries (measured on jellyfin-ffmpeg 7.1.4, 2026-10-12). The rest of CONTAINER_REFUSES_VIDEO
    // fails only an ENCODE: avi/asf/wmv write whatever fourcc the stream carries, so an encode with none is refused or reads back as rawvideo while a
    // copy that keeps the source's working tag muxes and reads back fine; and the MPEG-PS/TS AV1 cells cannot be reached by a copy, since a source
    // those muxers cannot carry never probes as av1. awk-ffmpeg-test's muxmatrix mirrors this table too (WRITEBACK_COPY_REFUSES).
    const CONTAINER_REFUSES_COPY = {
        webm: ['hevc', 'h264'], mov: ['av1'], '3gp': ['hevc', 'av1'], '3g2': ['hevc', 'av1'],
        ogv: ['hevc', 'h264', 'av1'], ogg: ['hevc', 'h264', 'av1'],
    };
    const containerRefusesCopy = (container, codec) => tableGet(CONTAINER_REFUSES_COPY, container, []).includes(codec);
    // ====== END OUTPUT TIER + CONTAINER ======

    // ====== ENCODE MEMORY MODEL ======
    // A CPU 4K encode needs GIGABYTES of anonymous memory, and a node that cannot supply them does not report an error: the kernel SIGKILLs ffmpeg and Tdarr
    // logs a bare "CLI code: 137" with nothing in it pointing at memory. This block predicts the peak so the plugin can say so FIRST - a warning where the
    // encode will merely swap, a failFile where it provably cannot fit at all. It is guidance rather than a failsafe by design: most encodes finish even while
    // swapping (measured - two concurrent 4K libx265 encodes saturated a 5 GB ceiling and both completed, at a 9% per-worker cost), so refusing is deliberately
    // hard to trigger. Every coefficient below was fitted against jellyfin-ffmpeg 7.1.4 on a 4-core Linux cgroup-v2 node and reproduces measurement to within
    // 0.6% across H.264, HEVC and AV1 sources; awk-ffmpeg-test's gen_memprobe re-proves the model whenever the local ffmpeg build changes.

    // Per-encoder peak coefficients in MB: `base` is fixed overhead, `kEnc` the MB per megapixel of the OUTPUT frame, both measured at method_speed=slow.
    // `floor` is the fraction of that peak the encoder still reaches squeezed to a single frame thread (measured via frame-threads=1 / -x264-params threads=1 /
    // -svtav1-params lp=1). The plugin emits NONE of those knobs - the floor exists only to give the refusal a bound no node's core count or preset choice can
    // undercut. Each depth is measured rather than derived: the 10-bit/8-bit ratio differs per encoder (borrowing libx265's mis-predicts libsvtav1 by 24%).
    // The hardware rows carry one depth's measurement and reuse it at the other: the hevc rows measured at 10 bits, over-stating an 8-bit
    // hardware encode by roughly a fifth, and the h264 rows at 8 bits - harmless in practice, since a hardware encode peaks at 0.4-2.0 GB, well
    // below a realistic node limit, so the over-stated figure normally only hardens a warning. It is NOT structurally exempt from the refusal:
    // with no `floor` row the multiplier is 1, so the floor equals the FULL estimate times the preset and content terms - a stricter bound than
    // any CPU row's, and a small enough cgroup still refuses. `perCore` is what each visible core past MEM_FIT_CORES adds, MB per output
    // megapixel - see the THREADS block below. `preset` is an encoder's own measured method_speed ratios, which replace MEM_PRESET's for it.
    const MEM_ENCODER = {
        libx265:           { base10: 163, kEnc10: 292, base8: 97,  kEnc8: 186, floor: 0.968, perCore: 5.4 },
        // H.264 output is always 8-bit; the 10-bit pair never resolves
        libx264:           { base10: 79,  kEnc10: 245, base8: 79,  kEnc8: 245, floor: 0.808, perCore: 14.6, preset: { slow: 1, medium: 0.886, fast: 0.766 } },
        // SVT-AV1 re-fitted 2026-10-18 on the 4-core Linux node with its container limit raised to 8 GB. At the node's usual 4 GB every 4K reading sat at
        // the ceiling (4.02-4.07 GB at any thread count, depth or preset), which reads as an encoder whose memory ignores all three; unclamped it peaks at
        // 5.0 GB at slow and moves with each.
        libsvtav1:         { base10: 223, kEnc10: 535, base8: 155, kEnc8: 421, floor: 0.682, perCore: 18.3, preset: { slow: 1, medium: 0.921, fast: 0.697 } },
        // nvenc measured 2026-10-18 on the 20-core nvenc node decoding on NVDEC, as the plugin does: kEnc from 2160p/1080p output pairs off a 4K HEVC 10-bit
        // and a 4K H.264 source (99.7 and 102.6 MB/Mpix); base 113 is where the measured sum is split from MEM_DECODER's nvdec. h264_nvenc ran 42% above
        // hevc_nvenc at 4K, so it carries its own row.
        hevc_nvenc:        { base10: 113, kEnc10: 101, base8: 113, kEnc8: 101 },
        h264_nvenc:        { base10: 135, kEnc10: 171, base8: 135, kEnc8: 171 },
        hevc_qsv:          { base10: 76,  kEnc10: 51,  base8: 76,  kEnc8: 51 },
        // h264_qsv measured 2026-10-18 on the 4-core Intel node as 2160p and 1080p output (572 and 461 MB) off a 4K HEVC 10-bit source: 36% under hevc_qsv.
        h264_qsv:          { base10: 41,  kEnc10: 18,  base8: 41,  kEnc8: 18 },
        hevc_vaapi:        { base10: 80,  kEnc10: 23,  base8: 80,  kEnc8: 23 },
        // Fitted on a Mac, the only platform that has VideoToolbox, at the 4-core fit point - the 8-core Mac's extra decoder threads are
        // the THREADS term's - by least squares over 2160p/1080p encodes of a 4K HEVC 10-bit and a 4K H.264 source, every reading within
        // 6% (2026-10-18). Legitimate there despite macOS memory compression because these rows land at 0.4-0.9 GB, below the regime
        // where it distorts a reading, and they reproduced across independent runs (4K 870, 862 and 860 MB; 1080p 693, 690 and 690).
        hevc_videotoolbox: { base10: 58,  kEnc10: 29,  base8: 58,  kEnc8: 29 },
        // Measured 2026-10-17 on amdwin, the fleet's one AMD node: its chip has h264_amf only, which also fails at 2160p, so the pair is 1080p and 720p
        // output (458 and 430 MB) off one 4K HEVC 10-bit source, as Windows peak working set - which on that 4-core box tracked the Linux-fitted CPU rows
        // within 5% (libx265 +2%, libx264 -5%). An 8-bit measurement, reused at 10 bits.
        h264_amf:          { base10: 27,  kEnc10: 24,  base8: 27,  kEnc8: 24 },
    };
    // Which measured row stands in for a family's codecs that have none of their own. Measured 2026-10-18 at 4K against each family's hevc row:
    // h264_videotoolbox came within 3% and shares it, while h264_qsv ran 36% under and h264_nvenc 42% over, so each carries its own. A stand-in
    // therefore serves only the codecs with no measurement of their own - av1_qsv, av1_nvenc, h264_vaapi, av1_vaapi, hevc_amf and av1_amf - and
    // where a family has two measured rows it is the larger, since an unmeasured codec is better over- than under-stated. The three CPU encoders
    // are each measured directly and need no stand-in. memprobe's enc:hwfamily rows test a stand-in on any node that can run its codec.
    const MEM_ENCODER_BY_FAMILY = { nvenc: 'h264_nvenc', qsv: 'hevc_qsv', vaapi: 'hevc_vaapi', videotoolbox: 'hevc_videotoolbox', amf: 'h264_amf' };
    // Decode-side peak, MB per megapixel of the SOURCE frame, per source codec and per whether -thread_type slice is on the command (see MEM_SLICE_CODECS).
    // A 6.0x spread across codecs, so a single constant would be wrong in both directions. ProRes is the priciest decoder and AV1 the priciest one the flag
    // cannot help, which compounds with libsvtav1 being the hungriest encoder: AV1 -> AV1 is the most memory-expensive path this plugin can take.
    // prores measured 2026-08-21 on the Linux node (VmHWM, 5 reps, medians reproducible to 0.2% across independent runs). Three things about that row:
    //   * It is the 4:4:4 12-bit XQ figure, the WORST case. A 4:2:2 10-bit HQ source at the same 4K measured 362 MB against XQ's 552 - a 52% spread - so one
    //     row cannot be right for both, and the expensive end is the one to carry: under-stating is what loses the refusal.
    //   * The pair behind it is prores_ks at BOTH resolutions, so the re-encoder is a shared constant that cancels in the slope. That it may stand in for
    //     camera-original media is measured, not assumed: real XQ 552 MB vs prores_ks XQ 542 MB at 4K, 1.8% apart.
    //   * def == slice is correct rather than a shortcut - prores is not in MEM_SLICE_CODECS, so -thread_type slice is never emitted for it and the second
    //     figure is never read.
    // Every other row was re-derived from a full Linux refit on the same date, so they are one consistent set rather than a patchwork of eras. Two of them
    // moved a long way - mpeg2video -32% and vp9 -21% - which matters less than it looks: both are cheap decoders whose term is small either way.
    // `nvdec` is the same codec decoded on NVDEC, which an nvenc encode runs wherever nvencDecodeArgs allows it (nvdecPreset's list minus
    // NVDEC_UNSAFE_CODECS). Measured 2026-10-18 on the 20-core nvenc node as hevc_nvenc encodes at 2, 5 and 16 decoder threads (linear, R^2 0.996-0.997)
    // and at 2160p and 1080p output. Both sources were 4K, so a row's nvdec figure and hevc_nvenc's base share one measured sum, split at that base. An
    // NVDEC codec with no figure here keeps its software one: for h264, the one codec measured both ways, that is 2% under the NVDEC peak on a 4-core node
    // and above it from 6 cores up.
    const MEM_DECODER = {
        mpeg2video: { def: 7.1,  slice: 7.1,  perThread: 0 },
        vp9:        { def: 14.3, slice: 8.2,  perThread: 1.7 },
        h264:       { def: 24.9, slice: 11.9, perThread: 2.8, nvdec: { def: 27.6, perThread: 1.2 } },
        hevc8:      { def: 31.8, slice: 15.9, perThread: 3.7 },
        hevc10:     { def: 46.0, slice: 25.9, perThread: 5.2, nvdec: { def: 33.2, perThread: 2.3 } },
        av1:        { def: 46.6, slice: 46.6, perThread: 2.0, threadsOverCores: 0 },   // libdav1d takes cores threads, not cores + 1
        prores:     { def: 62.4, slice: 62.4, perThread: 6.4 },
    };
    // method_speed scales the whole peak by a resolution-independent factor (slow is where the coefficients above were fitted). Fitted on
    // libx265, which is the default encoder and tracks it well (measured 0.913 / 0.811 against the values below, 2026-10-18). It does NOT hold
    // for every encoder: libx264 measured 0.886 / 0.766 and SVT-AV1 0.921 / 0.697, so each carries its own in MEM_ENCODER's `preset`. An
    // encoder that has never been measured across presets keeps scaling by this table, since over-stating a warning is the harmless direction.
    const MEM_PRESET = { slow: 1.000, medium: 0.909, fast: 0.805 };
    // Filters are NOT additive - the stacked case gets its own measured figure rather than a sum, and it sits ABOVE the sum of its parts, so whatever the
    // filters share is smaller than what a second filter adds. Measured 2026-08-21 on Linux: tonemap +7 MB, deint +45, stack +71. Only the tonemap figure is
    // updated here; deint and stacked both landed inside the +-25 MB band, and moving a row the tolerance says is unchanged would be fitting noise. A downscale
    // on its own was never measured apart from that stack and contributes nothing here, which under-states it slightly. guard_dv's VBV (-maxrate/-bufsize)
    // measured +0 MB and needs no term.
    const MEM_FILTER_TONEMAP = 7;
    const MEM_FILTER_DEINT = 55;
    const MEM_FILTER_STACKED = 78;
    const memFilterSurcharge = (tonemapOn, deintOn) => (tonemapOn && deintOn ? MEM_FILTER_STACKED
        : (tonemapOn ? MEM_FILTER_TONEMAP : (deintOn ? MEM_FILTER_DEINT : 0)));
    // THREADS. ffmpeg's decoders and the CPU encoders size their threads from the visible core count, and each extra thread holds frames of its own - yet
    // every coefficient above was fitted on a 4-core node. Measured 2026-10-17 with memprobe's threads mode, which sweeps each term at an explicit thread count
    // (a thread needs no physical core, so the sweep runs anywhere), on a 4-core Linux node, a 20-core Windows node and a Mac: linear per thread, R^2
    // 0.99-1.0, within ~8% across the three platforms, and the larger reading is carried because over-stating only hardens a warning. The gap it closes was
    // real: on the 20-core node every peak row read 26-166% over the model, on the 4-core one within 5%.
    //   * Decode - MEM_DECODER's perThread, MB per extra decoder thread per SOURCE megapixel. libavcodec's frame-threaded decoders take cores + 1 threads and
    //     libdav1d takes cores (threadsOverCores), capped at 16. Slice threading adds nothing per thread, so a slice decode carries no term. A hardware encode
    //     decodes frame-threaded on the CPU, and its whole growth with cores was this term (+43 MB a thread at 4K, the same as the decode on its own) - except
    //     nvenc's, which decodes on NVDEC where the codec allows and grows by MEM_DECODER's nvdec perThread instead (10-19 MB a thread at 4K).
    //   * Encode - MEM_ENCODER's perCore, MB per extra visible core per OUTPUT megapixel. libx264 runs 1.5 threads a core at 9.7 each; x265's pool runs one a
    //     core at 5.4, its frame-thread steps included; libsvtav1's memory is not a clean function of its lp setting, so its figure is fitted between the
    //     default-threaded runs of the 4- and 20-core nodes.
    // Past MEM_MAX_CORES, the largest node measured, a node is costed as that one. Only the EXPECTED peak reads these terms: the refusal's floor is the
    // single-thread lower bound, so a bigger node moves the warning but can never cause a refusal.
    const MEM_FIT_CORES = 4;
    const MEM_MAX_CORES = 20;
    const MEM_DECODE_THREADS_MAX = 16;
    const memDecodeThreads = (row, cores) => {
        const c = Math.min(cores, MEM_MAX_CORES);
        return c > 1 ? Math.min(c + (row.threadsOverCores ?? 1), MEM_DECODE_THREADS_MAX) : 1;
    };
    // Source codecs where -thread_type slice pays. Measured saving at 4K: h264 126 MB, hevc 115-163 MB, vp9 55 MB - and exactly ZERO for av1 (libdav1d ignores
    // the flag) and mpeg2, so the flag is emitted only where it buys something. See buildVideoArgs for why it may only ever ride the INPUT side.
    const MEM_SLICE_CODECS = ['h264', 'hevc', 'vp9'];
    const MEM_BYTES_PER_MB = 1048576;
    const MEM_BYTES_PER_GB = 1024 ** 3;
    // Anonymous memory the node itself holds beside an encode, added to the refusal's suggested limit: a one-off measurement (~224 MB), not one of the
    // fitted coefficients above, so gen_memprobe does not re-measure it.
    const MEM_NODE_OVERHEAD_MB = 224;
    // Warn when the expected peak eats this much of what is actually free. Below 1 so the warning lands while there is still room to act on it.
    const MEM_HEADROOM_FRACTION = 0.8;
    // Peak memory depends slightly on CONTENT, and every coefficient here was fitted on one kind of it. Measured 2026-08-21 on the Linux node (VmHWM, 5 reps,
    // 4K 10-bit libx265 at frame-threads=1, i.e. the floor's own threading): 4K cel animation 2958 MB vs 4K live action 2885 MB, a 2.5% difference against a
    // 0.1% noise floor on identical input - small, but larger than the instrument. Carried at 2x the measured delta because ONE anime-vs-live pair bounds the
    // two contents measured, not the population. Applied to the REFUSAL FLOOR ONLY: the floor is a genuine physical lower bound (single frame thread, fastest
    // preset), not a safety allowance, so content variance rides on top of it rather than being absorbed by it - a floor fitted on the cheaper content
    // under-states the true floor and therefore fails to refuse an encode that will OOM. The warning path is deliberately left unmargined; over-warning is
    // cheap, and MEM_HEADROOM_FRACTION above is already generous. Two limits on the evidence, stated rather than implied: the delta was measured on a CPU
    // libx265 encode, so applying it to a HARDWARE encoder extrapolates - harmless, because 5% of a 0.4-2.0 GB hardware peak is at most 100 MB,
    // but untested; and it is one anime-vs-live pair. NOTE this cannot be re-measured on the Mac: five runs of one identical input there spread 26%
    // (1255-1583 MB, drifting upward) because macOS reports a compressed footprint under pressure.
    const MEM_CONTENT_MARGIN = 1.05;

    // cgroup v1 writes LONG_MAX rounded down to a page size for "no limit", which is a DIFFERENT number on a 64 KiB-page arm64 host - so test the magnitude
    // rather than hardcoding either sentinel.
    const MEM_UNLIMITED_BYTES = 2 ** 62;
    const memReadFile = (p) => { try { return String(fs.readFileSync(p, 'utf8')); } catch (e) { return ''; } };
    // A cgroup limit file. 'max' (v2) and a LONG_MAX-ish sentinel (v1) both mean "no limit at THIS level", which is not the same as no limit at all - a
    // container cannot see a constraining parent from the inside - so both return Infinity and the caller falls through to the host reading rather than
    // concluding the encode has infinite room. NaN means the file was absent or unparseable.
    const memCgroupLimit = (raw) => {
        const t = String(raw || '').trim();
        if (!t) return NaN;
        if (t === 'max') return Infinity;
        const n = Number(t);
        return Number.isFinite(n) && n > 0 ? (n >= MEM_UNLIMITED_BYTES ? Infinity : n) : NaN;
    };
    const memStatField = (raw, key) => { const m = new RegExp(`^${key}\\s+(\\d+)`, 'm').exec(String(raw || '')); return m ? Number(m[1]) : NaN; };
    const memInfoField = (raw, key) => { const m = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm').exec(String(raw || '')); return m ? Number(m[1]) * 1024 : NaN; };
    // cgroup v1 keeps the memory controller under its own mount and /proc/self/cgroup names this process's path within it. Inside a container that path is
    // usually already the namespace root, so the bare mount is tried first and the named path only as a fallback.
    const memCgroupV1Dirs = () => {
        const dirs = ['/sys/fs/cgroup/memory'];
        const line = memReadFile('/proc/self/cgroup').split('\n').find((l) => l.split(':')[1] === 'memory');
        const rel = line ? line.split(':').slice(2).join(':') : '';
        if (rel && rel !== '/') dirs.push(`/sys/fs/cgroup/memory${rel}`);
        return dirs;
    };
    // Which filesystem holds a path: the LONGEST mount point in /proc/self/mountinfo that is a prefix of it. Tdarr hands a classic plugin cacheFilePath as a
    // full FILE path inside the transcode cache, never a mount point, so an equality test against the mount-point field would match nothing. The fstype is the
    // field immediately AFTER the ' - ' separator - the LAST field is the super-options string, which is why a naive read of it returns mount options instead
    // of a filesystem type. Mount points escape spaces as \040.
    const memFsTypeOfPath = (p) => {
        if (!p) return '';
        let bestPoint = '';
        let bestType = '';
        for (const line of memReadFile('/proc/self/mountinfo').split('\n')) {
            const f = line.split(' ');
            const sep = f.indexOf('-');
            if (sep < 5 || sep + 1 >= f.length) continue;
            const point = String(f[4] || '').replace(/\\040/g, ' ');
            if (!point || !(p === point || p.startsWith(point === '/' ? '/' : `${point}/`))) continue;
            if (point.length >= bestPoint.length) { bestPoint = point; bestType = f[sep + 1]; }
        }
        return bestType;
    };
    // Resolve this node's memory budget, in bytes. `scope` is 'container' when a real cgroup limit was found - the ONLY scope allowed to refuse a file, since
    // a cgroup is the only place a hard OOM kill lives; bare metal grows swap/pagefile and degrades instead. Returns null when nothing could be established
    // (check goes inert). os.totalmem() is never consulted on Linux: it reports the HOST from inside Docker (measured 11x overshoot vs a 1 GiB cgroup) and
    // always returns something, so a ladder reaching it can never admit ignorance; process.availableMemory()/constrainedMemory() are no better
    // (page-cache-dominated / memory.high, a throttle not the kill point). Occupancy comes from memory.stat anon (v2) / rss (v1): measured idle, anon was 103
    // MB against memory.current's 1317 MB - a 12x difference that would discard a quarter of the container before the encode started. Tests inject the verdict
    // through __awkCap.mem, or macOS's raw reading through __awkCap.macMemory ({ total, level }); an injected cap with neither means "no verdict", inert
    // rather than a real /sys read. macOS occupancy is read from kern.memorystatus_level - the percentage of memory macOS can hand out, counting the inactive,
    // speculative and purgeable pages it reclaims on demand. os.freemem() there counts only the free page LIST, which macOS keeps near empty on purpose
    // (measured 0.08 GB against a memorystatus_level of 40% - 3.2 GB - on an 8 GB Mac), so it raised the "only X GB is free ... by swapping" warning on almost
    // every encode. One bounded sysctl per file (~40 ms under load); an unreadable answer leaves the check inert rather than falling back to the free list.
    const MAC_MEMLEVEL_TIMEOUT_MS = 5000;
    const macMemoryLevel = () => {
        try {
            const r = childProcess.spawnSync('sysctl', ['-n', 'kern.memorystatus_level'], { encoding: 'utf8', timeout: MAC_MEMLEVEL_TIMEOUT_MS });
            return r.status === 0 ? Number(String(r.stdout || '').trim()) : NaN;
        } catch (e) { return NaN; }
    };
    const memNodeBudget = (otherArguments) => {
        if (injectedCap && injectedCap.mem) return { swapBytes: 0, anonBytes: 0, scope: 'container', cacheFsType: '', cores: 0, ...injectedCap.mem };
        if (injectedCap && !injectedCap.macMemory) return null;
        let limitBytes = NaN;
        let swapBytes = 0;
        let anonBytes = 0;
        let scope = 'unknown';
        const platform = injectedCap ? 'darwin' : os.platform();   // the only host reading a test injects is macOS's
        if (platform === 'linux') {
            const v2 = memCgroupLimit(memReadFile('/sys/fs/cgroup/memory.max'));
            if (Number.isFinite(v2)) {
                limitBytes = v2;
                scope = 'container';
                const sw = memCgroupLimit(memReadFile('/sys/fs/cgroup/memory.swap.max'));
                swapBytes = Number.isNaN(sw) ? 0 : sw;   // 'max' -> Infinity -> the cgroup can never OOM-kill this encode, so it can never be refused
                anonBytes = memStatField(memReadFile('/sys/fs/cgroup/memory.stat'), 'anon') || 0;
            } else {
                // cgroup v1 still ships on Synology DSM, unRAID and older LXC. Its swap file reports limit PLUS swap combined, not swap alone.
                for (const dir of memCgroupV1Dirs()) {
                    const lim = memCgroupLimit(memReadFile(`${dir}/memory.limit_in_bytes`));
                    if (!Number.isFinite(lim)) continue;
                    limitBytes = lim;
                    scope = 'container';
                    const memsw = memCgroupLimit(memReadFile(`${dir}/memory.memsw.limit_in_bytes`));
                    swapBytes = Number.isFinite(memsw) ? Math.max(0, memsw - lim) : (Number.isNaN(memsw) ? 0 : Infinity);
                    anonBytes = memStatField(memReadFile(`${dir}/memory.stat`), 'rss') || 0;
                    break;
                }
            }
            if (scope !== 'container') {   // no cgroup limit at this level: fall back to the host's own numbers, which may only ever inform a warning
                const info = memReadFile('/proc/meminfo');
                const total = memInfoField(info, 'MemTotal');
                const avail = memInfoField(info, 'MemAvailable');
                if (Number.isFinite(total)) {
                    limitBytes = total;
                    scope = 'host';
                    swapBytes = memInfoField(info, 'SwapTotal') || 0;
                    anonBytes = Number.isFinite(avail) ? Math.max(0, total - avail) : 0;
                }
            }
        } else if (platform === 'darwin') {
            // macOS swap grows on demand, so it has no ceiling worth reading - and it does not matter, because host scope never refuses and swap only ever
            // feeds the refusal comparison.
            const total = injectedCap ? Number(injectedCap.macMemory.total) : os.totalmem();
            const level = injectedCap ? Number(injectedCap.macMemory.level) : macMemoryLevel();
            if (Number.isFinite(total) && total > 0 && Number.isFinite(level) && level >= 0 && level <= 100) {
                limitBytes = total; scope = 'host'; anonBytes = Math.round(total * (1 - level / 100));
            }
        } else {
            // A system-managed Windows pagefile grows on demand like macOS swap; os.freemem() there includes the standby list, so it is the right figure.
            const total = os.totalmem();
            if (Number.isFinite(total) && total > 0) { limitBytes = total; scope = 'host'; anonBytes = Math.max(0, total - os.freemem()); }
        }
        if (!Number.isFinite(limitBytes) || limitBytes <= 0) return null;
        const cachePath = String((otherArguments && otherArguments.cacheFilePath) || '');
        return { limitBytes, swapBytes, anonBytes, scope, cacheFsType: cachePath ? memFsTypeOfPath(cachePath) : '', cores: 0 };
    };

    const memCpuCount = (pinned) => { if (Number(pinned) > 0) return Number(pinned); try { return (os.cpus() || []).length || 1; } catch (e) { return 1; } };
    const memEncoderRow = (encoderName, family) => {
        const byName = tableGet(MEM_ENCODER, encoderName, null);
        return byName || tableGet(MEM_ENCODER, tableGet(MEM_ENCODER_BY_FAMILY, family, ''), null);
    };
    const memDecoderRow = (codecName, is10) => {
        const key = codecName === 'hevc' ? (is10 ? 'hevc10' : 'hevc8') : codecName;
        return tableGet(MEM_DECODER, key, null);
    };
    // Predicted peak resident MB for one encode. `floor: true` returns the LOWER BOUND instead - a single frame thread, the fastest preset, no filters - and
    // that is the only figure the refusal may read: it says "even under the most favourable threading and preset this cannot fit", so it cannot false-positive
    // from a node's core count or the user's speed setting. Returns null rather than a guess when the source dimensions are unreadable or the encoder has no
    // measured row: a fabricated number could refuse a file that would have encoded perfectly well, and there is no input a user could set to override it.
    // Both row lookups above go through tableGet, which is why a crafted codec or encoder name cannot resolve to an inherited Object.prototype member.
    const memoryEstimate = ({ family, encoderName, srcCodec, srcIs10, srcW, srcH, dispH, outH, want10, speedName, cores,
        sliceOn, nvdecSource, tonemapOn, deintOn, floor }) => {
        const row = memEncoderRow(encoderName, family);
        if (!row) return null;
        const srcMpix = (Number(srcW) * Number(srcH)) / 1e6;
        // Source megapixels come from the CODED dimensions, never from dispHeight: that value is rotation-swapped for the downscale decision, so a rotated 4K
        // phone clip would estimate 7539 MB against 2735 MB real - a 2.76x overshoot - if the pixel count were derived from it.
        if (!Number.isFinite(srcMpix) || srcMpix <= 0 || !(Number(dispH) > 0) || !(Number(outH) > 0)) return null;
        const outMpix = srcMpix * ((Number(outH) / Number(dispH)) ** 2);
        const dec = memDecoderRow(srcCodec, srcIs10);
        // An unmeasured source codec contributes no decode term rather than a guessed one - it under-states the peak, which under-warns and under-refuses. An
        // nvenc encode decodes on NVDEC wherever the source codec allows (nvdecSource), costed by the row's nvdec figure where it has one, and -thread_type
        // slice rides a CPU encode only, so a hardware alternative quoted beside one is costed frame-threaded.
        const nvdec = family === 'nvenc' && nvdecSource && dec && dec.nvdec ? dec.nvdec : null;
        const slice = sliceOn && family === 'cpu';
        const kDec = nvdec ? nvdec.def : dec ? (slice ? dec.slice : dec.def) : 0;
        const mb = (want10 ? row.base10 : row.base8) + kDec * srcMpix + (want10 ? row.kEnc10 : row.kEnc8) * outMpix;
        // A row's own `preset` ratios replace MEM_PRESET's in the floor as well as in the expected peak: a borrowed fastest-preset discount puts the bound
        // above or below what that encoder can really be squeezed to, and above it the refusal fails a file that would have fit.
        const presets = row.preset || MEM_PRESET;
        if (floor) return mb * (row.floor || 1) * presets.fast * MEM_CONTENT_MARGIN;
        const cpu = memCpuCount(cores);
        const perThread = nvdec ? nvdec.perThread : (dec && !slice ? dec.perThread : 0);
        const decodeThreadMb = perThread ? Math.max(0, memDecodeThreads(dec, cpu) - memDecodeThreads(dec, MEM_FIT_CORES)) * perThread * srcMpix : 0;
        const coreMb = row.perCore ? Math.max(0, Math.min(cpu, MEM_MAX_CORES) - MEM_FIT_CORES) * row.perCore * outMpix : 0;
        return (mb + decodeThreadMb + coreMb + memFilterSurcharge(tonemapOn, deintOn)) * (presets[speedName] || 1);
    };
    const memGbFromBytes = (bytes) => `${(bytes / MEM_BYTES_PER_GB).toFixed(1)} GB`;
    const memGbFromMb = (mb) => memGbFromBytes(mb * MEM_BYTES_PER_MB);
    // ====== END ENCODE MEMORY MODEL ======

    // ====== VIDEO ARGUMENT ASSEMBLY ======

    // Source codecs an nvenc encode decodes in SOFTWARE although upstream nvdecPreset lists them for NVDEC. MPEG-4 Part 2: the CUDA decode corrupted 2 of 16
    // DivX/Xvid files (ASP with B-frames) with no decode error, measured 2026-10-13 on an RTX 3080 with jellyfin-ffmpeg 7.1.4 - nvenc encodes of them read
    // 13.7 and 16.6 dB XPSNR against 40.6 and 39.8 from a software decode, and came out SMALLER, so no size check notices. The other 14 decoded normally, so
    // it cannot be told apart per file. The encode stays on the GPU; only the decode moves. awk-ffmpeg-test's memprobe reads this table for its NVDEC mirror.
    const NVDEC_UNSAFE_CODECS = ['mpeg4'];
    // The decode-side flags of an nvenc encode: '-hwaccel cuda' (system-memory frames) where NVDEC may decode the primary video, else '' (software).
    // buildVideoArgs emits it and the memory model costs it, so the two cannot disagree about which decode runs. The unsafe test reads BOTH this plugin's
    // primary (primaryCodec) and nvdecPreset's, because they can differ: nvdecPreset skips only attached_pic, so a timed-thumbnail or still-image track
    // ahead of the real video makes it judge that track, while -hwaccel (no stream specifier) reaches the one video stream actually decoded.
    const nvencDecodeArgs = (file, primaryCodec) => {
        const { getNvdecHwaccelPreset, getPrimaryVideoCodec } = require('../methods/nvdecPreset');
        return [primaryCodec, getPrimaryVideoCodec(file)].some((c) => NVDEC_UNSAFE_CODECS.includes(c)) ? ''
            : getNvdecHwaccelPreset(file, { softwareFrames: true });
    };

    // Build the video-encode arguments for the chosen encoder: decode-side (input) flags + the output -c:v block (encoder, quality, speed, pixel format, the
    // video filter chain, QuickTime fourCC). Returns { inputSide, videoOut } for the preset and the same arguments as argv arrays for the test encode,
    // split from the same parts so the two cannot differ (the filter chain is the one token the preset quotes). Source colour metadata carries through
    // automatically - no explicit colour flags (see the HDR-detection block below). Decode stays on software frames (nvenc via the shared nvdecPreset helper)
    // so one CPU scale filter and -pix_fmt path work uniformly across families; VAAPI is the exception - it needs its frames uploaded, so it carries an
    // explicit device (the candidate's render node) + format,hwupload filter.
    const buildVideoArgs = ({ family, encoderName, device, targetCodec, qNorm, speed, want10Bit, willDownscale, outHeight, dstContainer, file, srcCodec,
        tonemap, tonemapBackend, tonemapSetparams, preserveDv, preserveDvNoBase, deintFilter, dropCaptions, sliceDecode }) => {
        const vaDevice = device || VAAPI_DEVICE;
        const { getNvenc10BitFormatArg } = require('../methods/nvdecPreset');
        const qualityArg = nativeQuality(targetCodec, family, qNorm);
        const speedArg = nativeSpeed(targetCodec, family, speed);
        let inputSide = '';
        const parts = [`-c:v:0 ${encoderName}`, qualityArg, speedArg];   // :v:0 = encode primary video only; any genuine secondary video stream stays copied
        const vf = [];
        // HDR->SDR tonemap: a GPU backend (cuda/opencl/videotoolbox) runs as an upload->tonemap->download island on its own hw device, landing SOFTWARE frames
        // the family's encoder path consumes unchanged; tonemap_* self-tags bt709 (verified). The 'cpu' backend (or a non-tonemap run) uses software tonemapx /
        // no filter. All three GPU backends are one consistent family (resolveTonemapBackend); vaapi is the one two-device case (opencl tonemap + vaapi
        // encode), handled in its own block. The island's :format / download format set output bit depth (p010le vs nv12).
        const outFmt = want10Bit ? 'p010le' : 'nv12';
        const useGpuTm = tonemap && tonemapBackend !== 'cpu';
        const cpuTonemap = 'tonemapx=tonemap=bt2390:transfer=bt709:matrix=bt709:primaries=bt709:range=tv';
        const gpuIsland = `format=p010le,hwupload,tonemap_${tonemapBackend}=${GPU_TONEMAP_OPTS}${outFmt},hwdownload,format=${outFmt}`;
        const tmDevice = `-init_hw_device ${tonemapBackend}=tm -filter_hw_device tm`;   // single-device families: the island replaces any hwaccel decode
        const pushTonemap = (fmt) => {   // the tonemap island (GPU) or tonemapx (CPU), then an optional trailing format filter; the downscale is NOT here
            if (tonemap) vf.push(tonemapSetparams + (useGpuTm ? gpuIsland : cpuTonemap));
            if (fmt) vf.push(fmt);
        };

        // Interlace repair leads the WHOLE chain, ahead of the downscale, and that order is the point of the feature: scaling combed video blends its two
        // half-pictures into each other permanently (measured - idet then reads 'progressive' because the fields were averaged, not because anything was
        // deinterlaced), so a repair after the scaler would have nothing left to repair. It stays on the CPU even when the encoder is hardware: the GPU
        // deinterlacers are faster end-to-end but SILENTLY emit fully combed output on some real broadcast sources, and comb baked into a re-encode that is
        // then labelled progressive is unrecoverable. Only the FILTER is CPU - method_encoder still picks the hardware encoder and it still does the encode.
        if (deintFilter) vf.push(deintFilter);
        // The downscale then leads the rest of the chain, in every family and with or without a tonemap, so it is emitted once here rather than per branch.
        // accurate_rnd because on x86 an 8-bit planar scale without it takes a low-precision path arm64 lacks (up to 2 code values off C), so one file scaled
        // differently on every node; with it x86 gives the Mac's exact pixels (80 of 80 on four x86 machines, 2026-10-12) at no measurable encode cost
        // (0.97-1.03x). bitexact gives the same pixels but is FFmpeg's regression switch, kept for measuring. A 10-bit -> 8-bit conversion with no resize is
        // node-identical under every flag (measured 2026-10-21), so the format conversion needs none.
        if (willDownscale) vf.push(`scale=-2:${outHeight}:flags=bicubic+accurate_rnd`);

        if (family === 'nvenc') {
            inputSide = useGpuTm ? tmDevice : nvencDecodeArgs(file, srcCodec);
            pushTonemap();
            parts.push(useGpuTm ? `-pix_fmt ${want10Bit ? 'p010le' : 'yuv420p'}`
                : (want10Bit ? getNvenc10BitFormatArg(file, { softwareFrames: true }).trim() : '-pix_fmt yuv420p'));
        } else if (family === 'qsv') {
            if (useGpuTm) inputSide = tmDevice;
            pushTonemap();
            if (want10Bit) { parts.push('-pix_fmt p010le'); if (targetCodec === 'hevc') parts.push('-profile:v main10'); } else parts.push('-pix_fmt nv12');
        } else if (family === 'vaapi') {
            if (useGpuTm) {   // two devices: opencl tonemaps, frames download to software, then re-upload to vaapi for the encoder (proven on Intel)
                inputSide = `-init_hw_device opencl=ocl -init_hw_device vaapi=va:${vaDevice}`;
                vf.push(`${tonemapSetparams}format=p010le,hwupload=derive_device=opencl,tonemap_opencl=${GPU_TONEMAP_OPTS}${outFmt}`
                    + `,hwdownload,format=${outFmt},hwupload=derive_device=vaapi`);
            } else {
                inputSide = `-vaapi_device ${vaDevice}`;
                pushTonemap(`format=${want10Bit ? 'p010' : 'nv12'}`);
                vf.push('hwupload');
            }
        } else if (family === 'amf') {
            if (useGpuTm) inputSide = tmDevice;
            pushTonemap();
            parts.push(want10Bit ? '-pix_fmt p010le' : '-pix_fmt yuv420p');
        } else if (family === 'videotoolbox') {
            if (useGpuTm) inputSide = tmDevice;
            pushTonemap();
            parts.push(want10Bit ? '-pix_fmt p010le' : '-pix_fmt yuv420p');
            if (want10Bit && targetCodec === 'hevc') parts.push('-profile:v main10');
        } else {   // cpu
            pushTonemap();
            parts.push(`-pix_fmt ${want10Bit ? 'yuv420p10le' : 'yuv420p'}`);
            // libx265 carries the decoded DV RPU through the encode; x265's DV coding needs VBV/HRD (bare CRF errors -22), so add a generous per-tier ceiling
            if (preserveDv) {
                const dvVbvKbps = DV_VBV_KBPS_BY_TIER[heightTier(outHeight)];
                parts.push('-dolbyvision:v:0 1', '-strict unofficial', `-maxrate:v:0 ${dvVbvKbps}k`, `-bufsize:v:0 ${dvVbvKbps * 2}k`);
            }
        }

        // Embedded closed captions (A53 SEI in the bitstream) survive a re-encode only where the encoder re-emits them, which is a per-(codec, family) fact -
        // A53_CAP holds the hardware-confirmed map and its five classes. dropCaptions means sub_worker already lifted them into a sidecar or proved the channel
        // empty, so the bitstream copy must go or a player shows them twice. So: on a keep-by-default or unreliable encoder, suppress when dropping (vaapi
        // loses a53_cc from its sei set, everyone else takes -a53cc 0); on libx265, enable when keeping; and h264_videotoolbox always gets -a53cc 0 because
        // inserting A53 crashes it - it cannot keep captions at all, which is why guard_captions force-picks libx264 when a caption-bearing file targets H.264
        // on a Mac.
        const a53cap = a53ClassOf(targetCodec, family);
        if (a53cap === 'error') parts.push('-a53cc 0');
        else if ((a53cap === 'keep' || a53cap === 'unreliable') && dropCaptions) parts.push(family === 'vaapi' ? '-sei -a53_cc' : '-a53cc 0');
        else if (a53cap === 'optin' && !dropCaptions) parts.push('-a53cc 1');
        // hvc1 = Apple/QuickTime HEVC-in-mp4 (primary only); a no-base DV (e.g. profile 5) needs dvh1 or the DV box is dropped. The encode path tags hevc
        // ONLY - see QT_VIDEO_TAG for why it and the copy path differ
        if (targetCodec === 'hevc' && isQtVideoContainer(dstContainer)) parts.push(preserveDvNoBase ? '-tag:v:0 dvh1' : '-tag:v:0 hvc1');
        // Slice-threaded DECODING, which costs 55-163 MB less at 4K than the default frame threading (see MEM_SLICE_CODECS for the per-codec figures). It rides
        // the INPUT side and must never move across the <io> marker: before -i the flag configures the DECODER, and decoding is normative, so it cannot alter
        // the output - proven bit-exact on Linux, Windows and macOS across five decoder settings and all three CPU encoders. AFTER the marker the identical
        // flag would configure the ENCODER, where slice threading splits each frame into independently-coded slices and breaks intra prediction and deblocking
        // across their boundaries - a real compression-efficiency loss that no test here could see, since the command would still run and still exit 0.
        if (sliceDecode) inputSide = `${inputSide}${inputSide ? ' ' : ''}-thread_type slice`;
        const vfArg = vf.length ? ` -filter:v:0 "${vf.join(',')}"` : '';   // :v:0 - filtering a copied secondary video stream would error
        const videoParts = parts.filter(Boolean).join(' ');
        return { inputSide, videoOut: `${videoParts}${vfArg}`, inputArgv: splitWs(inputSide),
            videoArgv: [...splitWs(videoParts), ...(vf.length ? ['-filter:v:0', vf.join(',')] : [])] };
    };

    // ====== END VIDEO ARGUMENT ASSEMBLY ======

    // ====== INTERLACE DETECTION ======
    // Decided from the PIXELS, never the container: real files lie routinely (genuinely combed material tagged field_order=unknown in the corpus), so a
    // metadata test would miss exactly the files needing repair. One idet decode answers both questions. WHICH kind of combing matters because the repairs
    // are opposite: shot-on-VIDEO has no original full frame, so bwdif interpolates; shot-on-FILM telecined for broadcast still contains its frames, so
    // fieldmatch+decimate rebuilds them EXACTLY (measured SSIM 1.000000 vs the true 24p, against 0.9606 for deinterlacing the same file). The discriminator
    // is idet's REPEATED-FIELD counter, not its combed ratio: 3:2 pulldown structurally repeats one field in five (measured 27% on the telecine sample vs
    // 0-8% on four true-interlace ones), while the combed ratio reads 97.8% vs 100% - far too narrow to key on.
    const IDET_PROBE_TIMEOUT_MS = 180000;
    const IDET_PROBE_MAX_BYTES = 8 * 1024 * 1024;
    const IDET_SAMPLE_FRAMES = 400;      // enough for a stable ratio; a few seconds of decode even at 4K
    const IDET_COMBED_MIN = 0.20;        // below this the sample is progressive (measured: 0% progressive vs ~100% interlaced - a wide margin either side)
    const IDET_REPEAT_MIN = 0.15;        // at or above this the combing is 3:2 pulldown (measured 27%), below it genuine interlace (measured 0-8%)
    const IDET_SEEK_MIN_DURATION_SEC = 90;   // shorter than this and there is nothing to seek past, so sample from the start
    const IDET_SEEK_FRACTION = 3;            // sample from a third of the way in, clear of opening titles
    const IDET_SEEK_MAX_SEC = 600;           // ceiling, so a feature-length programme is not sampled from an hour in
    // Only the filter's OWN lines are counters. The input and output dumps print container text to the same stderr, and a newline inside it starts a fresh
    // line. A tag VALUE is re-indented after each newline, so requiring idet's log prefix at the START of the line shuts those out; a tag KEY and a filename
    // are printed raw, so a crafted one can spell out a whole counter line at column 0, prefix and all (verified on 7.1.4 with an mp4 mdta key). Those are
    // beaten by POSITION instead (lastIdetCounts). The pointer after '@' is matched loosely - 0x-prefixed on Mac/Linux, bare hex on Windows.
    const IDET_LINE_PREFIX = '^\\[Parsed_idet_\\d+ @ [^\\]\\n]+\\] ';
    // Read the FINAL match, populated or not. ffmpeg emits the counters more than once - an all-zero block from a discarded init leads, and the genuine
    // summary prints at filter uninit, after both dumps, followed only by the muxer's line, which carries no counters - so the last block is always the
    // genuine one. Taking the last POPULATED block instead hands a sample that decoded no frames to a forged block from a dump, and a file can seek its
    // own sample past the end of its video through format.duration; an all-zero final block must stay all-zero and read as no verdict.
    const lastIdetCounts = (text, re) => {
        const rx = new RegExp(IDET_LINE_PREFIX + re, 'gm');
        let best = null; let hit;
        while ((hit = rx.exec(text)) !== null) best = hit;
        // The CAPTURE GROUPS as numbers - index 0, the whole match, is dropped, so the caller's [0] is group 1. Both consumers index on that: the four-name
        // destructure below, and rep[1] + rep[2] meaning Top + Bottom.
        return best ? best.slice(1).map(Number) : null;
    };
    const detectInterlace = (ffmpegPath, inputPath, startSec) => {
        try {
            // Sampled from a way into the file, not the head: logos, black and title cards are commonly progressive even in an interlaced programme, so a
            // head sample under-reports. -ss ahead of -i is safe here because this DECODES; it is only a stream COPY that -ss corrupts.
            const args = ['-nostats', '-hide_banner', ...(startSec > 0 ? ['-ss', String(startSec)] : []), '-i', inputPath,
                '-frames:v', String(IDET_SAMPLE_FRAMES), '-vf', 'idet', '-an', '-sn', '-f', 'null', '-'];
            const r = childProcess.spawnSync(ffmpegPath, args,
                { encoding: 'utf8', timeout: IDET_PROBE_TIMEOUT_MS, maxBuffer: IDET_PROBE_MAX_BYTES });
            // A probe that did not finish gives no verdict. A timeout or the maxBuffer cap still hands back the stderr read SO FAR, and the genuine summary
            // prints last - so a cut-off read holds at best the init block, and at worst whatever the input dump put there.
            if (!r || r.error || r.signal || r.status !== 0) {
                return { kind: 'unknown', why: r && r.error ? (r.error.code || r.error.message) : `ffmpeg exit ${r && r.status !== null ? r.status : 'signalled'}` };
            }
            const text = String(r.stderr || '');
            const multi = lastIdetCounts(text,
                'Multi frame detection:\\s*TFF:\\s*(\\d+)\\s*BFF:\\s*(\\d+)\\s*Progressive:\\s*(\\d+)\\s*Undetermined:\\s*(\\d+)');
            if (!multi) return { kind: 'unknown' };
            const [tff, bff, prog, undet] = multi;
            const total = tff + bff + prog + undet;
            if (total === 0) return { kind: 'unknown' };
            const combed = tff + bff;
            if (combed / total < IDET_COMBED_MIN) return { kind: 'progressive', combed, total };
            const rep = lastIdetCounts(text, 'Repeated Fields:\\s*Neither:\\s*(\\d+)\\s*Top:\\s*(\\d+)\\s*Bottom:\\s*(\\d+)');
            const repeats = rep ? rep[1] + rep[2] : 0;
            // Parity from idet's own TFF/BFF split. Consulted whenever the container states no UNAMBIGUOUS field order - that is, no order at all or one of
            // the producer-dependent crossed values (see the deintParity note) - because bwdif's parity=auto reads the frame flags and guesses top-first when
            // there are none, which on a flagless bottom-field-first source is simply wrong (measured 0.9345 SSIM against 0.9668).
            const parity = tff > bff ? 'tff' : (bff > tff ? 'bff' : 'auto');
            return { kind: repeats / total >= IDET_REPEAT_MIN ? 'telecine' : 'interlaced', combed, total, repeats, parity };
        } catch (e) { return { kind: 'unknown' }; }
    };
    // ====== END INTERLACE DETECTION ======

    // #region SHARED helpers (2 sections: closed-caption probe … closed-caption handoff)
    // ===== SHARED [sub_worker, video_clean]: closed-caption probe =====
    // -=-=-= A53 probe constants / deriveFfprobePath / probeA53Captions  [sub_worker, video_clean] =-=-=-
    // Closed captions are not a stream. They ride INSIDE the video bitstream as A53/EIA-608 SEI, so no stream list mentions them and nothing short of a
    // decode-side probe can see them - which is also why a re-encode is the one operation that can destroy them. ffprobe reports them as per-frame side data,
    // and reading a BOUNDED window of frames answers the question at a cost independent of duration (measured 0.2-17s across the sample corpus, a clip and a
    // feature alike) because -read_intervals stops the read instead of scanning to EOF. Do NOT reach for the movie=...[out0+subcc] filter to detect: it has no
    // working bound - on a caption-FREE file the subtitle output never ends, so ffmpeg decodes the whole file hunting packets that never arrive.
    const A53_PROBE_TIMEOUT_MS = 120000;
    const A53_PROBE_MAX_BYTES = 8 * 1024 * 1024;
    const A53_PROBE_FRAMES = 400;                         // captions are sparse, and a programme's opening is often silent; 400 frames spans enough to decide
    const A53_SIDE_DATA = 'A53 Part 4 Closed Captions';   // ffprobe's spelling of the side-data type, and the only positive signal there is

    // Tdarr hands a plugin otherArguments.ffmpegPath and nothing else, and it is not always a path to a file named ffmpeg: Tdarr's Linux Docker image hands
    // the bare command 'tdarr-ffmpeg', a PATH link into the jellyfin-ffmpeg install, whose ffprobe sits beside the REAL binary - a name test accepting only
    // 'ffmpeg' leaves every Docker node without a caption probe, so guard_captions never protects there. The probe is the ffmpeg name with 'ffmpeg' in the
    // FINAL component swapped for 'ffprobe' (ffmpeg -> ffprobe, tdarr-ffmpeg -> tdarr-ffprobe, ffmpeg.exe -> ffprobe.exe), looked for beside the path as
    // given (a bare command resolved through PATH first) and then beside the target it links to. Only the final component: the production path carries
    // 'ffmpeg' as a DIRECTORY too (.../assets/app/ffmpeg/darwin_arm64/ffmpeg). A name with no 'ffmpeg' in it, or a derived file that is not there, gives ''
    // - never ffmpeg itself, which run with ffprobe's arguments would misreport the failure as an unreadable file. Every caller reads '' as "unknown".
    const deriveFfprobePath = (ffmpegPath) => {
        const given = String(ffmpegPath || '').trim();
        if (!given) return '';
        const pathMod = require('path');
        const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
        const token = 'ffmpeg';   // the part of the final component swapped for 'ffprobe'
        const swap = (p) => {
            const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
            const base = p.slice(cut + 1);
            const at = base.toLowerCase().lastIndexOf(token);
            return at < 0 ? '' : `${p.slice(0, cut + 1)}${base.slice(0, at)}ffprobe${base.slice(at + token.length)}`;
        };
        let resolved = given;
        if (!/[\\/]/.test(given)) {   // a bare command is a PATH lookup, so resolve it the way the OS would
            const exts = process.platform === 'win32' ? ['', ...String(process.env.PATHEXT || '.EXE').split(';').filter(Boolean)] : [''];
            const dirs = String(process.env.PATH || '').split(pathMod.delimiter).filter(Boolean);
            resolved = dirs.flatMap((d) => exts.map((x) => pathMod.join(d, given + x))).find(isFile) || '';
            if (!resolved) return '';
        }
        const candidates = [swap(resolved)];
        try { candidates.push(swap(fs.realpathSync(resolved))); } catch (e) { /* an unresolvable link leaves the first candidate only */ }
        return candidates.find((c) => c && isFile(c)) || '';
    };

    // Does the primary video stream carry A53 caption side data? Returns true / false / 'unknown' - and 'unknown' is NOT 'no': it means the probe could not
    // run, so a caller stays fail-safe rather than concluding the file is caption-free. `cap` is the test-injected verdict (__awkCap.captions): supplying it
    // short-circuits the spawn entirely, which is how the harness stays free of real binaries.
    const probeA53Captions = (filePath, ffprobePath, cap) => {
        if (cap === true || cap === false) return cap;
        if (!filePath || !ffprobePath) return 'unknown';
        try {
            const { spawnSync } = require('child_process');
            const args = ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', `%+#${A53_PROBE_FRAMES}`,
                '-show_frames', '-show_entries', 'frame=side_data_list', '-of', 'default=nw=1', filePath];
            const r = spawnSync(ffprobePath, args, { encoding: 'utf8', timeout: A53_PROBE_TIMEOUT_MS, maxBuffer: A53_PROBE_MAX_BYTES });
            if (!r || r.status !== 0) return 'unknown';
            return String(r.stdout || '').includes(A53_SIDE_DATA);
        } catch (e) { return 'unknown'; }
    };
    // ===== END SHARED: closed-caption probe =====

    // ===== SHARED [clean_and_remux, sub_worker, video_clean]: closed-caption handoff =====
    // -=-=-= CC_TAG / CC_TOKENS / ccTokensOf  [clean_and_remux, sub_worker, video_clean] =-=-=-
    // The cross-plugin channel for embedded closed captions. They live in the video BITSTREAM rather than in a stream list, so sub_worker can read them out
    // to a sidecar or a subtitle track but can only DELETE them where its own -c copy pass may filter the bitstream (H.264, not HDR, not Dolby Vision);
    // video_clean is the only plugin that re-encodes video, so it is the only one that can be rid of them on anything else. The request therefore travels in
    // a global CC_TAG tag on the file, written by sub_worker and read by video_clean - and by clean_and_remux, whose subtitle filters would otherwise drop an
    // imported caption track unnoticed. It is SHARED so a token added or renamed on one side cannot go missing on the other: a writer and a reader whose
    // vocabularies drift fail SILENTLY, leaving the captions in the file twice. Deliberately not the awk_sub_worker marker - that is a list of sidecar PATHS
    // whose reader matches entries against paths, so a flag word pushed in there would be read as a filename.
    //   strip    - the captions are out (a sidecar or a subtitle track holds them) but the bitstream copy is still there; drop it on the next re-encode.
    //   removed  - the captions are out AND the bitstream copy went with them in that same pass, so nothing is left to find, to probe for, or to remove.
    //              The request/fact pair with `strip`: one asks a later plugin to act, the other tells every later pass there is nothing left to act on.
    //   none     - the caption channel was decoded and carried no caption text at all, so no later pass need pay for that decode again. Written only
    //              once BOTH fields have been read empty: a broadcast carrying its captions in field 2 behind a padded field 1 reads empty on the default
    //              decode, and a later re-encode told `none` drops captions nothing ever captured.
    //   decoded  - a full read of the caption channel finished (field auto-selected); decoded2 - a read of field 2 finished. sub_worker's own progress
    //              memos, stamped by the pass that runs the read: an empty sidecar with neither behind it was left by an interrupted read, not by an
    //              empty channel. Every other reader ignores them.
    //   imported - the captions are already embedded as a real subtitle track, so sub_worker must not read them out a second time.
    // The value is a COMMA LIST and every reader splits it, because the states genuinely combine: an imported round trip that could not strip in its own pass
    // records `imported,strip` - and `imported,removed` where it could. An empty channel records `none` ALONE - it never owes a strip. A writer
    // therefore EXTENDS the tag rather than replacing it with one token - a whole-value overwrite would erase a pending request instead of deferring it.
    // A REQUEST is retired by whoever SERVES it, and only then: video_clean rewrites `strip` to `removed` on the encode that carries the removal out. Without
    // that the tag only ever grows, and a satisfied request is indistinguishable from a fresh one - a file that later regains captions (a re-muxed capture, an
    // external tool re-inserting A53 SEI) has them dropped by a request answered encodes ago. `none` and `imported` are never retired: they are memos about
    // the file rather than requests, and they stay true for its life.
    const CC_TAG = 'awk_cc';
    const CC_TOKENS = { strip: 'strip', removed: 'removed', none: 'none', decoded: 'decoded', decoded2: 'decoded2', imported: 'imported' };
    const ccTokensOf = (tags) => getTagCI(tags || {}, CC_TAG).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    // ===== END SHARED: closed-caption handoff =====
    // #endregion

    // ====== SOURCE-CODEC POLICY (guard_lossless, shrink never-downgrade) ======
    // Lossless / mastering-grade video codecs, read only by guard_lossless (NOT shared: no other plugin re-encodes video). Raw ffprobe codec_name
    // spellings; membership is what makes the guard fail-safe - an unrecognised codec is not protected, never wrongly skipped. (Lossless MODES of lossy
    // codecs - x264 -qp 0 - are out of scope: neither probe reports them.) Grouped: compressed lossless intermediates, the RLE/screen-capture family, then
    // uncompressed packed layouts that arrive under their own codec_name. Every name is a decoder on the production build, so none is dead membership.
    // Two membership calls, stated because each reads as an omission otherwise. jpeg2000 IS here: it is the DCP / IMF / broadcast-mezzanine codec the shared
    // IMAGE_CODECS comment names, and though the format has a lossy mode neither probe reports which was used, so mastering-grade is the fail-safe reading.
    // jpegls is here on the same reading: ffmpeg flags it lossless AND lossy (its near-lossless mode), and nothing reports which a file used.
    // The screen-capture rows stop at those that reach a real library (Flash screencasts, Camtasia recordings, DOSBox and Fraps captures): tscc2 is TechSmith's
    // LOSSY second generation, and the remote-desktop family (rscc, mwsc, rasc, srgc, scpr, vmnc, mss1/mss2/msa1) is recorder-internal rather than a library
    // file, several of them lossy hybrids in any case.
    // The uncompressed rows include the Avid Media Composer (avui, avrp), QuickTime (012v, yuv4) and capture-card (m101, frwu, targa_y216) layouts.
    const LOSSLESS_VIDEO_CODECS = ['ffv1', 'huffyuv', 'ffvhuff', 'hymt', 'magicyuv', 'utvideo', 'lagarith', 'sheervideo', 'prores', 'dnxhd', 'cfhd',
        'cllc', 'zlib', 'mszh', 'jpeg2000', 'jpegls', 'loco', 'vble', 'ylc', 'zerocodec',
        'qtrle', 'msrle', 'flashsv', 'flashsv2', 'tscc', 'zmbv', 'fraps',
        'rawvideo', 'v210', 'v210x', 'v410', 'v408', 'v308', 'y41p', 'r210', 'r10k', '012v', 'avrp', 'avui', 'bitpacked', 'yuv4', 'm101', 'frwu',
        'targa_y216'];

    // Efficiency rank for shrink's never-downgrade rule: vp9~hevc and vp8~h264, so an efficient WebM/VP source isn't "upgraded" to a less-efficient
    // codec; a genuinely-legacy codec (mpeg2/vc1/xvid, absent here) ranks below every target via the `|| 0` fallback, so old-codec -> h264 stays a valid
    // shrink upgrade. vvc (H.266) outranks av1 and is DECODE-only in this build: a rank does NOT make a codec encodable (ENCODABLE_CODECS derives from
    // ENCODER_NAME, which has no vvc row), so the entry does exactly one job - stop shrink re-encoding a VVC source down to HEVC/AV1, the very downgrade
    // this rule exists to prevent. codec=source on a VVC file still skips with the no-encoder warning.
    const CODEC_EFFICIENCY = { vvc: 4, av1: 3, hevc: 2, vp9: 2, h264: 1, vp8: 1 };

    // ====== END SOURCE-CODEC POLICY ======

    // ====== PER-FILE FLOW ======
    // validate -> classify source video -> decide -> select encoder per node -> build preset. Video-only by design (audio and subtitles are always
    // copied) so it composes with the other awk plugins.

    // Missing/partial probe data fails the file with the infoLog attached, rather than throwing a TypeError on the first streams access.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Parse inputs. Numeric inputs are free text (parsed + range-checked); every dropdown is validated through dropdownChecks below.
    const action = ddValue(inputs.action, 'hdr_cleanup_only');
    const codec = ddValue(inputs.codec, 'source');
    const downscaleOpt = ddValue(inputs.downscale, 'disabled');
    const speed = ddValue(inputs.method_speed, 'slow');
    const bitDepthOpt = ddValue(inputs.method_bitdepth, 'source');
    const encoderOpt = ddValue(inputs.method_encoder, 'node');
    const hdrMode = ddValue(inputs.hdr_mode, 'preserve');
    const deinterlaceOpt = ddValue(inputs.deinterlace, 'disabled');
    const guardCaptionsOpt = ddValue(inputs.guard_captions, 'disabled');   // opt-in, unlike the two guards below (see its tooltip)
    const guardDvOpt = ddValue(inputs.guard_dv, 'enabled');
    const guardLosslessOpt = ddValue(inputs.guard_lossless, 'enabled');

    // The free-text NUMERIC inputs (the four quality_* tiers, guard_shrink_bitrate and guard_encode_hours) are the only user-typed values this plugin
    // echoes back, so they go through logSafe like every free-text echo (see its header): failFile's message becomes the file's stored error, and
    // loadDefaultValues only trims.
    const parseQuality = (v, name) => {
        const n = Number(String(v).trim());
        if (!Number.isFinite(n) || n < 0 || n > QUALITY_MAX)
            failFile(`[${name}=${logSafe(v)}] must be a number between 0 and ${QUALITY_MAX}, check your settings`);
        return n;
    };
    const qualitySd = parseQuality(inputs.quality_sd, 'quality_sd');
    const quality720 = parseQuality(inputs.quality_720p, 'quality_720p');
    const quality1080 = parseQuality(inputs.quality_1080p, 'quality_1080p');
    const quality4k = parseQuality(inputs.quality_4k, 'quality_4k');
    const guardShrinkKbps = (() => {
        const n = Number(String(inputs.guard_shrink_bitrate).trim());
        if (!Number.isFinite(n) || n < 0)
            failFile(`[guard_shrink_bitrate=${logSafe(inputs.guard_shrink_bitrate)}] must be a non-negative number (kbps), check your settings`);
        return n;
    })();
    // Hours, fractional allowed (0.5); 0 = no limit. Parsed here, with the others, so a bad value fails every file rather than only those that reach a
    // transcode.
    const encodeCapHours = (() => {
        const n = Number(String(inputs.guard_encode_hours).trim());
        if (!Number.isFinite(n) || n < 0 || n > ENCODE_CAP_MAX_HOURS)
            failFile(`[guard_encode_hours=${logSafe(inputs.guard_encode_hours)}] must be a number of hours from 0 to ${ENCODE_CAP_MAX_HOURS}`
                + ' (0 = no limit), check your settings');
        return n;
    })();

    // Every dropdown's accepted set, as ONE table driving the shared checkDropdowns loop. The shape matters beyond the line count: CLAUDE.md's retired-option
    // policy says a value the dropdown no longer offers must STOP the file, and input_surface_diff.js has to locate each dropdown's validator to report an
    // accepted-but-not-offered value. A uniform table is an anchor it can find; a run of differently-shaped `if` statements is not, and one of them going
    // stale is invisible. Non-dropdown checks stay where they are.
    const dropdownChecks = [
        ['action',           action,           ['hdr_cleanup_only', 'normalize', 'shrink']],
        ['codec',            codec,            ['source', 'hevc', 'h264', 'av1']],
        ['deinterlace',      deinterlaceOpt,   ['disabled', 'enabled']],
        ['downscale',        downscaleOpt,     ['disabled', '2160', '1440', '1080', '720']],
        ['hdr_mode',         hdrMode,          ['preserve', 'strip_dynamic', 'tonemap_sdr']],
        ['method_bitdepth',  bitDepthOpt,      ['source', '8', '10']],
        ['method_encoder',   encoderOpt,       ['node', 'node_strict', 'auto', 'cpu']],
        ['method_speed',     speed,            ['slow', 'medium', 'fast']],
        ['guard_captions',   guardCaptionsOpt, ['disabled', 'enabled']],
        ['guard_dv',         guardDvOpt,       ['enabled', 'disabled']],
        ['guard_lossless',   guardLosslessOpt, ['enabled', 'disabled']],
    ];
    checkDropdowns(dropdownChecks);
    const guardCaptions = guardCaptionsOpt === 'enabled';
    const guardDv = guardDvOpt === 'enabled';
    const guardLossless = guardLosslessOpt === 'enabled';
    // The one cross-input config error: tonemap_sdr is a pixel-domain re-encode, so it can never satisfy hdr_cleanup_only's lossless-or-skip promise.
    if (hdrMode === 'tonemap_sdr' && action === 'hdr_cleanup_only')
        failFile('[hdr_mode=tonemap_sdr][action=hdr_cleanup_only] tonemapping is always a re-encode (never lossless)'
            + ' - switch to action=normalize or shrink to tonemap, check your settings');

    // Everything from here is per-FILE work, so it runs inside the failUnexpected wrapper: the summary walk reads both probes for every stream, and an
    // unforeseen throw in there must still reach the error queue carrying this plugin's own infoLog rather than as a bare Error with none of it.
    try {
        // Ahead of the input summary, which walks BOTH probes for every stream: a file this plugin will not touch should cost one log line, not a full
        // enrich pass whose output is then thrown away. Both such skips sit FIRST INSIDE the try rather than above it - each reads one scalar and cannot
        // throw, so nothing the failUnexpected wrapper exists to protect moves out from under them.
        if (file.fileMedium !== 'video') {
            return skip('☑File is not a video\n');
        }
        // Output container = source container: clean_and_remux owns container policy; this plugin only re-encodes video (tagging the QuickTime fourCC below).
        // dstContainer is normalised for the membership tests, while the response.container default keeps the RAW value: that string becomes the output
        // file's extension, and lowercasing it would rename the file.
        const dstContainer = String(file.container || '').toLowerCase().trim();
        if (outputMuxerArg(dstContainer) === null) return skip(noMuxerSkipLine(dstContainer));   // an extension no muxer writes back (outputMuxerArg)

        response.infoLog += `☐Input streams: ${summariseAll(file.ffProbeData.streams)}\n`;

        // Primary (non-cover-art) video stream - the one we actually encode.
        const videoStreams = file.ffProbeData.streams.filter((s) => codecTypeOf(s) === 'video');
        const primary = videoStreams.find((s) => !isCoverArt(s));
        if (!primary) {
            return skip('☑No encodable video stream found (cover-art / still images only)\n');
        }
        const pTag = streamTag(primary.index);   // every per-stream line below concerns the primary video stream

        // ====== SOURCE CLASSIFICATION ======
        // Source properties (both probes).
        const mi = mediaInfoFor(primary);
        const srcWidth = Number(primary.width || mi?.Width || 0);
        const srcHeight = Number(primary.height || mi?.Height || 0);   // CODED height - what the decoder and the encoder see
        const srcCodecName = codecNameOf(primary);
        // primary's ffprobe side-data list, normalised once for the DV/HDR reads below and the rotation-parity read further down
        const sideDataList = Array.isArray(primary.side_data_list) ? primary.side_data_list : [];

        // HDR / Dolby Vision detection (both probes). ffmpeg auto-propagates static colour metadata (primaries/transfer/matrix)
        // through a re-encode (verified libx265/libsvtav1/videotoolbox, incl. the scale filter), so static HDR10/HLG survives with no
        // explicit colour flags. Dynamic metadata (Dolby Vision / HDR10+ / HDR Vivid) cannot survive a normal re-encode
        // - detected from BOTH probes (mediaInfo HDR_Format + ffprobe DOVI/HDR10+ side_data or a DV codec tag); a single-probe false
        // negative is destructive. isHdr (any HDR incl. static) gates tonemapping; dvSignal is DV specifically (excludes HDR10+).
        const hdrFmt = String(mi?.HDR_Format || mi?.HDR_Format_Compatibility || '').toLowerCase();
        const dvCodecTag = DV_FOURCC_RE.test(String(primary.codec_tag_string || '').toLowerCase().trim());
        const ffprobeDynamicHdr = sideDataList
            .some((sd) => /dovi|dolby vision|smpte ?2094|hdr dynamic metadata/.test(String(sd?.side_data_type || '').toLowerCase())) || dvCodecTag;
        // "Carries dynamic HDR of any kind", COMPOSED from the two per-format recognisers above so a spelling added to one list can never be missed by the
        // union. isDynamicHdr is the only question in the suite that genuinely spans both formats - a re-encode flattens either to static HDR10 - so this is
        // a local, not a shared helper: every other consumer wants ONE format (HDR10+ has a lossless strip path, HDR Vivid has none) and must reach for the
        // narrower test.
        const DYNAMIC_HDR_RE = new RegExp(`${HDR10P_RE.source}|${VIVID_HDR_RE.source}`);
        const isDynamicHdr = hdrFmt.includes('dolby vision') || DYNAMIC_HDR_RE.test(hdrFmt) || ffprobeDynamicHdr;
        // DOVI configuration record (ffprobe side_data) -> profile-aware logging: dvLabel names the profile, and 8.x carries a compat id (8.1 HDR10 / 8.4 HLG).
        const doviRec = sideDataList.find((sd) => /dovi configuration record/i.test(String(sd?.side_data_type || '')));
        const dovi = doviRec
            ? { profile: Number(doviRec.dv_profile), compatId: Number(doviRec.dv_bl_signal_compatibility_id), elPresent: doviRec.el_present_flag === 1 }
            : null;
        const dvLabel = dovi && Number.isFinite(dovi.profile)
            ? `Dolby Vision Profile ${dovi.profile}${dovi.profile === 8 && Number.isFinite(dovi.compatId)
                ? `.${dovi.compatId}` : ''}${dovi.elPresent ? ' (dual-layer)' : ''}`
            : 'Dolby Vision';
        // dvSignal is DELIBERATELY narrower than the shared isDolbyVisionVideo (which this file carries for the summary token and mp4StrictArg): on the
        // side_data leg it needs a PARSED DOVI record (!!dovi), where the helper also accepts a bare "dolby vision" side_data_type. dvSignal routes the
        // guard_dv ENCODE (libx265 -dolbyvision), which hard-requires a real RPU, so a record-less DV tag must NOT reach it. Do not collapse dvSignal into
        // isDolbyVisionVideo.
        const dvSignal = !!dovi || dvCodecTag || hdrFmt.includes('dolby vision');   // Dolby Vision specifically (excludes HDR10+)
        // The two non-DV dynamic formats, kept APART because their strip paths differ: HDR10+ has one (hevc_metadata=remove_hdr10plus, HEVC only)
        // and HDR Vivid has none - no bitstream filter in this build removes a CUVA block, verified against a real pure-Vivid file (the HDR10+
        // half went, every CUVA frame stayed). A file can carry both, so these are independent flags rather than a single "which format is it".
        // The ffprobe leg here has to be HDR10+-SPECIFIC rather than the shared ffprobeDynamicHdr, which also matches 'dovi'/'dolby vision' and
        // the DV fourcc: reusing that would make every Dolby Vision file claim an HDR10+ layer it does not carry. And the flag deliberately does
        // NOT exclude dvSignal, because a real release can carry both at once and the two are stripped by different filters - a DV-excluded flag
        // hid the HDR10+ half entirely, so the strip removed only the RPU while the log reported the file done with dynamic HDR.
        const ffprobeHdr10Plus = sideDataList.some((sd) => {
            const t = String(sd?.side_data_type || '').toLowerCase();
            return /smpte ?2094|hdr dynamic metadata/.test(t) && !/dovi|dolby vision/.test(t);
        });
        const isHdr10Plus = HDR10P_RE.test(hdrFmt) || ffprobeHdr10Plus;
        const isHdrVivid = VIVID_HDR_RE.test(hdrFmt);
        // Which layers a lossless strip can actually reach on THIS source, gated by what each bitstream filter accepts on the production build:
        // dovi_rpu takes hevc and av1, hevc_metadata takes hevc only (`ffmpeg -h bsf=<name>` on jellyfin 7.1.4). Fed anything else the filter does not warn
        // or skip - it fails to initialise and takes the whole command down.
        const stripDv = dvSignal && ['hevc', 'av1'].includes(srcCodecName);
        const stripHdr10Plus = isHdr10Plus && srcCodecName === 'hevc';
        // Names the dynamic layer(s) actually present, so a message never has to guess between DV, HDR10+ and Vivid. DV wins the label outright (its profile
        // string is the useful detail); otherwise every non-DV format present is named. Falls back to the generic term if a probe flagged dynamic HDR without
        // naming a format (a bare ffprobe side-data hit).
        const dynLabel = ([dvSignal ? dvLabel : '', isHdr10Plus ? 'HDR10+' : '', isHdrVivid ? 'HDR Vivid' : ''].filter(Boolean).join(' + ') || 'dynamic HDR');
        const srcXfer = videoTransferOf(primary, mi);
        // IPT-C2 is Dolby Vision profile 5's own colour matrix, and libx265 cannot re-encode it. Read from the source alone, independent of guard_dv, so the
        // guard's skip below and the "enable guard_dv" advice on the dynamic-HDR skip key on one fact and can never send a file round the two of them.
        const srcIsIptC2 = (primary.color_space || mi?.matrix_coefficients || '').toLowerCase().trim() === 'ipt-c2';
        // isHdr is the summary's own HDR test (isHdrVideo) or a dynamic layer.
        const isHdr = isHdrVideo(primary, mi) || isDynamicHdr;
        // A single-layer DV whose base carries NO standard HDR transfer (e.g. profile 5's IPT-PQ base): no smpte2084/HLG to fall back
        // to, so neither a lossless strip nor a normal re-encode keeps a valid picture. The transfer - not the DOVI compat id - is
        // the reliable signal (a compat-0 stream that DOES carry a PQ transfer re-encodes fine; profile 7/8/10 carry smpte2084/HLG).
        const dvNoBaseLayer = dvSignal && !HDR_TRANSFERS.includes(srcXfer);
        // The HDR curve hdrFmt implies, for the three sites that stamp one when the stream's resolved transfer is not a known HDR curve: the tonemap island's
        // setparams (the gate below explains why) and the two predicted output streams, lossless strip and transcode. At most one of the three runs per file,
        // so holding the HLG spellings here is what makes an added spelling reach all three instead of only one.
        const inferredHdrCurve = /hlg|log-gamma|b67/.test(hdrFmt) ? 'arib-std-b67' : 'smpte2084';   // PQ unless hdrFmt names an HLG spelling
        // ====== END SOURCE CLASSIFICATION ======

        // ====== EMIT HELPERS (both presets) ======
        const coverArtStreams = videoStreams.filter((s) => isCoverArt(s));                                 // embedded cover-art / still-image "video" streams
        const uncopyable = mp4UncopyableStreams(dstContainer, file.ffProbeData.streams);                     // a data track the container cannot copy
        const outputDrops = [...coverArtStreams, ...uncopyable].map((s) => ` -map -0:${s.index}`).join(''); // dropped from every output this plugin emits
        // A queued change gets its own ☐ line - without this the only trace is the stream's absence from the ☑ summary. Appended by whichever preset path
        // runs (on a skipped file nothing is dropped, so an unconditional line would announce work that never happens). No [input=...] tag: no setting
        // causes this, the stream simply is not video. In the designed run order clean_and_remux has already dropped these, so this only fires when
        // video_clean runs standalone or first - exactly when no other plugin's log explains the removal.
        const coverArtLog = coverArtStreams
            .map((s) => `☐${streamTag(s.index)} Remove cover-art/thumbnail (video-${codecNameOf(s) || 'unknown'})\n`)
            .join('');
        const dropLog = coverArtLog + mp4UncopyableLog(dstContainer, uncopyable, file.ffProbeData.streams);
        // Apple/QuickTime fourCC for a COPIED stream (QT_VIDEO_TAG), gated on isQtVideoContainer rather than isMp4Family (see its definition).
        const qtVideoTag = (cn) => (isQtVideoContainer(dstContainer)
            ? tableGet(QT_VIDEO_TAG, cn, '') : '');
        // input streams minus dropped cover-art video and any uncopyable data track the muxer does not rebuild
        const goneData = mp4LostData(uncopyable, file.ffProbeData.streams);
        const mapped = file.ffProbeData.streams.filter((s) => !(isCoverArt(s) && codecTypeOf(s) === 'video') && !goneData.includes(s));
        // The output summary, built once for both exits (the lossless strip and the transcode). Only the primary video's token differs between them, so it is
        // the one argument; every other stream is summarised from its own enriched form, exactly as the input summary does.
        const expectedResultsLine = (primaryToken) => `☑Expected results: ${mapped
            .map((s) => (s === primary ? primaryToken : summariseStream(enrichStream(s)))).join('')}\n`;
        // Both presets end the same way: the mp4 tag plan (and the -movflags it may need), the muxer, the preset itself, and the drop / tag-plan log
        // lines. writes is the transcode's globalWrites; the strip writes no global tag of its own.
        const sealPreset = (inputSide, out, writes) => {
            const tagPlan = mp4TagPlan(dstContainer, file.ffProbeData.format?.tags, writes);
            response.preset = `${inputSide}<io>${out}${tagPlan.flag ? ' -movflags use_metadata_tags' : ''}${globalOutputOpt}${outputMuxerArg(dstContainer)}`;
            response.processFile = true;
            response.infoLog += dropLog + mp4TagPlanLog(tagPlan, dstContainer);
        };
        // A predicted output stream that has lost its dynamic HDR layer must not still read 'dv' or 'hdr10+', so both predictions (the lossless strip and the
        // transcode) clear every carrier summariseStream's dynamic tests read: the dvhe/dvh1 fourcc, the DOVI side-data record, and the mediaInfo HDR_Format
        // (detached by dropping the joined index). The HDR10/HLG base keeps its own transfer. A carrier the shared DV/HDR10+ detection gains belongs here too.
        const clearDynamicHdrCarriers = (s) => Object.assign(s, { codec_tag_string: '', side_data_list: [], index: -1 });
        // Both presets below copy the audio and subtitles into the SAME container they came from, so an mp4-family output still carrying TrueHD needs the mov
        // muxer's -strict level or the mux is refused outright (see mp4StrictArg). Every stream this plugin does not re-encode is copied, so the default
        // survivor set is right. On the transcode path it must sit AFTER buildVideoArgs' own -strict: the last one on the command wins, so appending keeps the
        // escalation to experimental, while placing it earlier would let a plain unofficial override it and the TrueHD mux would fail.
        const strictArg = mp4StrictArg(dstContainer, file.ffProbeData.streams);
        // ====== END EMIT HELPERS ======

        // ====== LOSSLESS STRIP EMIT ======
        const codecLabel = srcCodecName || 'this codec';   // how a strip message names a source codec the probes left blank
        // Lossless dynamic-HDR strip: -c:v copy + a bitstream filter, no re-encode. dovi_rpu strips DV (HEVC + AV1); hevc_metadata
        // removes HDR10+ (HEVC only). The stream stays the source codec/res/depth with its HDR10 base retained, so it needs no awk_video
        // fence (once stripped it is no longer dynamic-HDR, so a re-run is a natural no-op). On mp4 the fourCC is reset (dvh1 -> hvc1).
        const emitLosslessStrip = () => {
            // One filter per layer present, chained - the bsf option takes a comma list, and dovi_rpu + hevc_metadata coexist (proven on the production
            // build against a real DV file). A file carrying BOTH needs both: picking one and reporting a completed strip left the other layer in place.
            // Neither filter covers every codec, so each is gated (stripDv / stripHdr10Plus) and tryLosslessStrip refuses or annotates whatever is left over.
            const bsfList = [stripDv ? 'dovi_rpu=strip=1' : '', stripHdr10Plus ? 'hevc_metadata=remove_hdr10plus=1' : ''].filter(Boolean);
            const bsf = bsfList.join(',');   // never empty: tryLosslessStrip skips the no-layer-to-strip case before it reaches here
            // An avi stream keeps its fourcc through -c copy, and the avi demuxer reads dvhe/dvh1 back as HEVC Dolby Vision - so a stripped stream still tagged
            // dvhe would be detected as Dolby Vision again on the next pass and re-stripped with the identical preset, which Tdarr's identical-preset guard
            // errors. Retag it to ffmpeg's plain HEVC fourcc (measured with the real profile 8.1 sample: reads back hevc/HEVC and decodes). Nothing else
            // needs it: the avi muxer refuses a dav1 tag outright and asf reads dvhe back as codec 'unknown', so neither reaches a strip.
            const riffTag = dstContainer === 'avi' && srcCodecName === 'hevc' && dvCodecTag ? ' -tag:v:0 HEVC' : '';
            const stripped = [stripDv ? dvLabel : '', stripHdr10Plus ? 'HDR10+' : ''].filter(Boolean).join(' + ') || dynLabel;
            const leftover = isHdr10Plus && !stripHdr10Plus ? `, but the HDR10+ layer stays - no filter here removes it from ${codecLabel}`
                : '';
            response.infoLog += `☐${pTag}[hdr_mode=strip_dynamic] Stripping ${stripped} losslessly (-c:v copy, base HDR10 retained)`
                + `${leftover}\n`;
            // No input-side args; sealPreset keeps sibling plugins' GLOBAL awk_* markers through an mp4/mov copy, as on the transcode path.
            sealPreset('', `-map 0 -c copy -bsf:v:0 ${bsf}${outputDrops}${qtVideoTag(srcCodecName)}${riffTag} -c:a copy -c:s copy${strictArg}`);
            // The strip removes exactly the layer the 'dv'/'hdr10+' token names (see clearDynamicHdrCarriers), leaving the HDR10/HLG base's own transfer,
            // inferred off HDR_Format when neither probe reported one. Everything else about the stream is untouched, since this path is a -c:v copy.
            const strippedVideo = clearDynamicHdrCarriers({ ...primary });
            if (!HDR_TRANSFERS.includes(srcXfer)) strippedVideo.color_transfer = inferredHdrCurve;
            response.infoLog += expectedResultsLine(summariseStream(strippedVideo));
            return response;
        };

        // The tail of a Vivid refusal: whatever ELSE the file carries also stays, since the whole strip is abandoned. Naming it stops the message implying a
        // partial strip ran.
        const vividAlsoNames = [dvSignal ? dvLabel : '', isHdr10Plus ? 'HDR10+ layer' : ''].filter(Boolean).join(' and the ');
        const vividAlso = vividAlsoNames ? `, so the ${vividAlsoNames} alongside it stays too` : '';

        // Lossless dynamic-HDR strip eligibility, shared by hdr_cleanup_only and the no-real-transcode strip path: a no-base DV, any HDR
        // Vivid, a DV signal on a codec dovi_rpu refuses, an HDR10+ layer with nothing else strippable, and a container whose muxer
        // refuses the codec even on a copy all have no lossless path (skip); otherwise strip. The skip messages are built HERE so they
        // cannot drift between the two callers - each passes only its own two advice fragments. Vivid is tested ahead of every strippable
        // layer on purpose: no filter here removes a CUVA block, so stripping any other layer would leave the file still dynamic-HDR while
        // the log reported a completed strip - the one case where a partial strip is worse than none, because nothing about it converges.
        const tryLosslessStrip = (tonemapAdvice, reencodeAdvice) => {
            const head = `☒${pTag}[hdr_mode=strip_dynamic] `;
            if (dvNoBaseLayer) { return skip(`${head}${dvLabel} has no HDR10 base layer - can't strip losslessly; ${tonemapAdvice}\n`); }
            if (isHdrVivid) {
                return skip(`${head}HDR Vivid has no lossless strip path (no bitstream filter here can remove a CUVA block)${vividAlso}`
                    + ` - left untouched; ${tonemapAdvice}\n`);
            }
            // Refuse a DV signal on a codec dovi_rpu cannot run on - without this gate the plugin emits a filter ffmpeg rejects outright ("Codec 'h264' is
            // not supported by the bitstream filter 'dovi_rpu'", exit 234), erroring the file with a bare ffmpeg message instead of a readable skip.
            // Reachable through any of dvSignal's three codec-agnostic signals on any source whose base layer carries a PQ/HLG transfer. The cost is
            // one-sided: a wrong skip leaves the file untouched, a wrong emit quarantines it. The accepted set is hevc AND av1, wider than HDR10+'s hevc.
            if (dvSignal && !stripDv) {
                return skip(`${head}${dvLabel} in ${codecLabel} has no lossless strip path (needs HEVC or AV1)`
                    + ` - left untouched${reencodeAdvice}\n`);
            }
            // Only when NOTHING is left to strip. On a DV+HDR10+ file that dovi_rpu can still handle the strip goes ahead and emitLosslessStrip names the
            // HDR10+ layer that stays, rather than abandoning a removal that is genuinely available.
            if (isHdr10Plus && !stripHdr10Plus && !stripDv) {
                return skip(`${head}HDR10+ in ${codecLabel} has no lossless strip path (needs HEVC)`
                    + ` - left untouched${reencodeAdvice}\n`);
            }
            // Neither strip flag is set (per their definitions: dovi_rpu needs a real DV signal on hevc/av1, hevc_metadata needs HDR10+ on hevc), so there is
            // no bitstream filter to run - reachable only via a record-less dynamic-HDR side-data hit that names no removable layer. A bare hevc_metadata
            // fallback here would strip nothing the signal names: on a non-HEVC source it fails bsf init and quarantines the file with a raw
            // ffmpeg message, and even on HEVC the -c copy re-probes identically so the next pass's byte-identical preset trips Tdarr's infinite-transcode-loop
            // guard. Skip with the same readable message every sibling case gets - there is genuinely nothing to strip losslessly.
            if (!stripDv && !stripHdr10Plus) {
                return skip(`${head}${dynLabel} in ${codecLabel} has no lossless strip path`
                    + ` - left untouched${reencodeAdvice}\n`);
            }
            // The strip copies back into the source's own container, and some muxers refuse the codec even on a copy (CONTAINER_REFUSES_COPY) - emitting it
            // would exit 234 on every requeue with only ffmpeg's message. A benign skip leaves the file untouched instead, as the transcode path does.
            if (containerRefusesCopy(dstContainer, srcCodecName)) {
                return skip(`${head}A .${dstContainer} file cannot hold ${srcCodecName} video, so even a lossless copy is refused - left untouched; remux it to`
                    + ' mkv or mp4 first (clean_and_remux does that)\n');
            }
            return emitLosslessStrip();
        };
        // ====== END LOSSLESS STRIP EMIT ======

        // ====== DECIDE, GATED BY ACTION ======
        if (action === 'hdr_cleanup_only') {
            // Only hdr_mode is live; codec / downscale / bit-depth / deinterlace / encoder inert. Lossless-or-skip.
            if (hdrMode === 'preserve') {
                return skip(`☑${pTag}[action=hdr_cleanup_only] ${isDynamicHdr
                    ? `${dynLabel} left untouched (preserve)` : 'Nothing to clean up (preserve)'}\n`);
            }
            if (!isDynamicHdr) {   // hdrMode === 'strip_dynamic'
                return skip(`☑${pTag}[hdr_mode=strip_dynamic] No dynamic HDR (Dolby Vision / HDR10+ / HDR Vivid) to strip`
                    + ` - left untouched\n`);
            }
            return tryLosslessStrip('switch to action=normalize or shrink with hdr_mode=tonemap_sdr to flatten it to SDR',
                '; use action=normalize/shrink to re-encode it away');
        }

        // The global tag a finished real transcode is fenced with - the setting it ran at (see videoSig) - so the next pass at the same setting
        // skips. Named once in this plugin's own read and write; the shared mp4TagPlan spells it literally for its normalize-fence exemption, in
        // all five carriers, and must be renamed in step: a read and a write that drift apart fail silently, and every pass re-encodes the file.
        const VIDEO_FENCE_TAG = 'awk_video';

        // DISPLAY orientation: a phone clip is routinely CODED 1920x1080 with a 90-degree rotation, so it DISPLAYS 1080x1920 - downscale must judge what a
        // viewer sees, or a portrait 4K reads as "already within 1080". The emitted command needs no help (ffmpeg autorotates before the filter chain, so
        // scale=-2:N sets the DISPLAYED height); only the fire/skip decision and the tier were reading the wrong number. Both probes, since neither is
        // complete (ffprobe: numeric side_data rotation on mp4 AND mkv; MediaInfo: string Rotation, mp4 only), and they disagree on sign and wrap (ffprobe
        // -90 is MediaInfo "270.000") - so only the PARITY is read: an odd quarter-turn swaps displayed width/height, a test no sign convention can flip.
        const displayMatrix = sideDataList.find((sd) => /display matrix/i.test(String(sd?.side_data_type || '')));
        const rotationDeg = Number(displayMatrix?.rotation ?? mi?.Rotation ?? 0);
        const quarterTurned = Number.isFinite(rotationDeg) && Math.abs(Math.round(rotationDeg / 90)) % 2 === 1;
        const dispHeight = quarterTurned && srcWidth > 0 ? srcWidth : srcHeight;   // the height the downscale and the quality tier both judge
        const dispWidth = quarterTurned && srcHeight > 0 ? srcHeight : srcWidth;    // its partner, for the 16:9 box test below

        // Bit depth: source-detected (raw sample depth, or a 10-bit pixel format / profile), overridable. H.264 is always 8-bit. Shares the is10Bit helper with
        // summariseStream's 10bit token so the re-encode depth decision and the logged token can't drift.
        const srcIs10 = is10Bit(primary, mi);
        // let: guard_dv forces 'hevc' for a DV file, and shrink's never-downgrade may fall back to the source codec
        let targetCodecName = codec === 'source' ? srcCodecName : codec;

        // Dolby Vision guard (action-aware). guard_dv protects DV through a transcode: forces HEVC + libx265 (CPU, below) + 10-bit + RPU
        // passthrough, and overrides a strip_dynamic/tonemap_sdr request for a DV file. INERT under hdr_cleanup_only (a lossless-only action - a
        // deliberate strip there is honoured). Only libx265 carries the RPU, and only from an HEVC source; keys on dvSignal (DV, not HDR10+).
        const guardDvLive = guardDv && action !== 'hdr_cleanup_only';
        const preserveDv = dvSignal && guardDvLive && srcCodecName === 'hevc';
        if (preserveDv) targetCodecName = 'hevc';   // force HEVC (overrides codec / codec=source)
        if (preserveDv && codec !== 'source' && codec !== 'hevc')
            response.infoLog += `☒${pTag}[codec=${codec}][guard_dv=enabled] ${dvLabel} - forcing HEVC (only libx265 carries the DV RPU);`
                + ` set guard_dv=disabled to use ${codec}\n`;
        // guard_dv wins: keep the DV, suppress the strip/tonemap request
        const dvOverridesHdr = preserveDv && (hdrMode === 'strip_dynamic' || hdrMode === 'tonemap_sdr');
        const effHdrMode = dvOverridesHdr ? 'preserve' : hdrMode;
        if (dvOverridesHdr)
            response.infoLog += `☒${pTag}[guard_dv=enabled][hdr_mode=${hdrMode}] ${dvLabel} - guard_dv keeps the Dolby Vision instead of `
                + `${hdrMode === 'tonemap_sdr' ? 'tonemapping to SDR' : 'stripping the dynamic layer'}; set guard_dv=disabled to `
                + `${hdrMode === 'tonemap_sdr' ? 'tonemap' : 'strip'} it\n`;

        // Interlace repair - inert under hdr_cleanup_only for the same reason tonemap_sdr is: it changes pixels, so it can never be the lossless-only
        // action's business. The detection decode is the one real cost of turning this on, so it runs ONLY when the setting is live - never on the default.
        // Tests inject otherArguments.__awkCap.idet to pin a verdict without spawning ffmpeg, exactly as they do for the encoder and tonemap probes.
        const deinterlaceLive = deinterlaceOpt !== 'disabled' && action !== 'hdr_cleanup_only';
        // LAZY and memoised for this invocation only: this is a real ffmpeg decode (measured 5.4 s wall / 35 s CPU at 4K on an idle Mac - and idle is ~3x
        // optimistic vs a loaded node), and Tdarr re-cycles the stack until every plugin skips, so an eager probe is paid again on every cycle. realTranscode()
        // tries the three metadata triggers first, so deciding WHETHER to encode never needs this decode; once an encode is happening with the setting live,
        // the verdict is always read, because it picks the repair filter. The verdict is deliberately NOT persisted across passes (no awk_idet tag, no one-time
        // tag-only mux the way sub_worker records awk_cc=none): tags have proven unreliable to carry across muxes and other plugins, and the only cost of
        // re-deciding is that one decode - paid only when a progressive file with deinterlace=enabled re-cycles and nothing cheaper triggers an encode - too
        // low to justify cross-pass persistence machinery or the whole-file remux write it would force on files that never transcode. Nothing may read
        // idetMemo's value except through idet() - and deintVerdictLine, which reads the memo raw by design so emitting the verdict can never itself provoke
        // the decode (see its comment).
        let idetMemo = null;
        const idet = () => {
            if (idetMemo) return idetMemo;
            if (!deinterlaceLive) { idetMemo = { kind: 'disabled' }; return idetMemo; }
            // A synthetic node (injectedCap): a missing idet key reads as "no verdict", never as a real decode.
            if (injectedCap) { idetMemo = injectedCap.idet || { kind: 'unknown' }; return idetMemo; }
            // Sample from a third of the way in, capped, so a long programme is not read from its (often progressive) opening titles and a short clip still
            // starts at 0. Duration comes from the format header; an absent one simply samples from the start.
            const durSec = Number(file.ffProbeData.format?.duration) || 0;
            const startSec = durSec > IDET_SEEK_MIN_DURATION_SEC ? Math.min(Math.floor(durSec / IDET_SEEK_FRACTION), IDET_SEEK_MAX_SEC) : 0;
            idetMemo = detectInterlace(ffmpegPathOf(otherArguments), file.file, startSec);
            return idetMemo;
        };
        // A repaired file re-detects as progressive on any later pass, so this converges by itself and needs no reprocess fence of its own.
        const deinterlaceNeeded = () => idet().kind === 'interlaced' || idet().kind === 'telecine';
        // Film-originated video is REBUILT (its original frames are still in there), video-origin video is INTERPOLATED. deint=all because a genuinely
        // interlaced file often carries no per-frame flag - that is why the decision came from the pixels. Parity is bwdif's DISPLAY order, which only the
        // container's uncrossed values state unambiguously ('tt'/'bb'). The crossed 'tb'/'bt' mean OPPOSITE things depending on who wrote the file - do not
        // "correct" this to libavutil's AVFieldOrder doc reading: measured on this build, an ffmpeg encode of a genuinely top-displayed-first frame reads
        // 'tb' (doc reading wrong) while the same picture from a spec-compliant Matroska muxer reads 'bt' (leading letter wrong). Wrong parity costs SSIM
        // 0.9377 vs 0.9816, so the crossed values are ignored and idet decides from the pixels (exact both ways); parity=auto is the last resort.
        const srcFieldOrder = String(primary.field_order || '').toLowerCase().trim();
        const deintParity = () => (srcFieldOrder === 'tt' ? 'tff' : (srcFieldOrder === 'bb' ? 'bff' : (idet().parity || 'auto')));
        // Both arms state a mode, because bwdif's own default is send_field (unlike yadif's send_frame) and the two arms want opposite things. Shot-on-video
        // wants send_field: such a source genuinely holds one distinct moment per FIELD, so emitting one frame per field (1080i60 -> 60p) keeps what the file
        // contains, while the half-rate alternative would discard every second moment purely to save space. It costs ~31% bitrate and ~58% encode time
        // (measured, libx265 CRF 23 on real 1080i broadcast). Telecine wants send_frame, and must SAY so: send_field doubles the link's declared rate on setup
        // whatever deint= passes through, and decimate derives its CFR output from that doubled rate - measured on the same 240 rebuilt frames, the default
        // emits 48/1 across 5.000 s where send_frame emits 24/1 across 10.000 s, so the picture would finish at half the length of the copied audio.
        const resolveDeintFilter = () => (!deinterlaceNeeded() ? ''
            : (idet().kind === 'telecine'
                ? 'fieldmatch,bwdif=mode=send_frame:deint=interlaced,decimate'   // rebuild the original frames; bwdif only touches what fieldmatch left combed
                : `bwdif=mode=send_field:parity=${deintParity()}:deint=all`));
        // The two verdict REPORTS - "I looked and there was no combing", "I could not read one at all". They claim no work, so unlike the ☐ repair lines they
        // are safe to emit on a file nothing else happens to; the setting costs a decode, so what it found is information the user paid for. Reads the MEMO,
        // never idet(), so asking for the line can never itself provoke the decode: where a guard settled the file without the verdict there is nothing to
        // report, because nothing was paid for. Emitted at the two points where the decision is final - inside emitTranscode, and past the transcode branch.
        // How idet's counts are shown wherever they are reported: a whole percent, or '?' when nothing was sampled, so the two log sites cannot
        // disagree about the rounding or about what an empty sample looks like.
        const idetPct = (n, v) => (v.total ? `${Math.round((n / v.total) * 100)}%` : '?');
        const idetUnreadTail = (v) => (v.why ? ` (the probe did not finish: ${v.why})` : '');   // the reason no verdict was read, for both lines that say so
        const deintVerdictLine = () => {
            if (!idetMemo || ['disabled', 'interlaced', 'telecine'].includes(idetMemo.kind)) return '';
            const combedPct = idetPct(idetMemo.combed, idetMemo);
            return idetMemo.kind === 'progressive'
                ? `☑${pTag}[deinterlace=${deinterlaceOpt}] No combing found (${combedPct} combed frames) - nothing to repair\n`
                : `☒${pTag}[deinterlace=${deinterlaceOpt}] Could not read an interlace verdict from this file${idetUnreadTail(idetMemo)} - left as-is\n`;
        };

        // action = normalize | shrink (real-transcode capable). Resolution / downscale (only ever downscales) + the quality tier for
        // the OUTPUT height. The setting names a 16:9 FRAME, not a height: 1080 means "fit inside 1920x1080". Capping height alone under-shrinks
        // everything wider than 16:9 by exactly (source AR / 16:9) - a 4096x1716 scope master answered a 1080 cap with 2578x1080, 34% MORE
        // pixels than 1080p, and a 2048x858 DCI 2K master sailed through untouched because 858 <= 1080. Both measured on the production binary.
        const maxH = downscaleOpt === 'disabled' ? 0 : Number(downscaleOpt);
        const maxW = Math.round(maxH * 16 / 9);
        // Only a HEIGHT is ever needed to express the box: scale=-2:N derives the width from the coded aspect, so fitting the frame collapses to the
        // smaller of the cap and the height at which the frame is exactly maxW wide. Rounded DOWN to even - 4:2:0 needs an even height, and rounding up
        // would breach the box. dispWidth is the CODED width (rotation-adjusted), deliberately NOT SAR-corrected, because scale=-2:N derives its width
        // from coded dimensions too: a display-corrected test would predict a width the filter does not emit. Verified this changes no answer for the real
        // anamorphic cases (1440x1080 SAR 4:3, 720x576 SAR 64:45 land identically either way). A dispWidth of 0 - no width from either probe - degrades to
        // height-only fitting rather than refusing, since widthBound then contributes nothing. That ternary is not dead code to be tidied away: without it
        // the division yields Infinity, which happens to reach the same capHeight today, and nothing would catch a later edit that stopped it doing so.
        const evenFloor = (n) => Math.max(2, Math.floor(n / 2) * 2);
        const widthBound = dispWidth > 0 ? evenFloor(maxW * dispHeight / dispWidth) : dispHeight;
        const capHeight = Math.min(maxH, widthBound);
        // capHeight < dispHeight, not dispHeight > maxH: a wide-but-short source is already inside the box (854x480 under a 720 cap bounds at 718,
        // above its own 480) and must not read as needing work.
        const willDownscale = maxH > 0 && capHeight < dispHeight;
        const outHeight = willDownscale ? capHeight : dispHeight;
        const qualityForHeight = (h) => ({ sd: qualitySd, p720: quality720, p1080: quality1080, p4k: quality4k }[heightTier(h)]);
        const qNorm = qualityForHeight(outHeight);

        // tonemap_sdr flattens ALL HDR -> SDR (a real re-encode). effHdrMode is never tonemap_sdr for a guard-protected DV file. The tonemap_* filters
        // self-tag bt709 (verified), so no explicit colour flags; where it runs: see resolveTonemapBackend.
        const tonemap = effHdrMode === 'tonemap_sdr' && isHdr;
        // A tonemap_* filter REJECTS a frame whose decoded transfer isn't a known HDR curve, and the island carries no explicit tags. When HDR
        // is known (mediaInfo / dynamic metadata) but the stream's own transfer is NOT a recognised HDR curve - absent (a stripped VUI) OR
        // present-but-non-HDR (a mislabelled bt2020-10) - stamp the inferred HDR curve onto the island so the filter has a valid HDR input.
        const tonemapSetparams = (tonemap && !HDR_TRANSFERS.includes(srcXfer))
            ? `setparams=color_trc=${inferredHdrCurve}:color_primaries=bt2020:colorspace=bt2020nc,`
            : '';

        // Resolve the codec trigger + final target codec. depth is a PARAMETER (never a trigger); downscale, tonemap and interlace repair are triggers in
        // both actions.
        let codecTrigger = false;
        if (action === 'normalize') {
            // fire on a mismatch either direction; codec=source never mismatches
            codecTrigger = ENCODABLE_CODECS.includes(targetCodecName) && srcCodecName !== targetCodecName;
        } else {   // shrink: upgrade to a more efficient codec, else a same-codec size pass; never downgrade efficiency
            // tableGet because srcCodecName is probe-sourced. The two sibling reads below key on `codec`, which is validated against the dropdown's own
            // option set, so only this one needs the gate.
            const srcEff = tableGet(CODEC_EFFICIENCY, srcCodecName, 0);
            if (codec !== 'source' && (CODEC_EFFICIENCY[codec] || 0) > srcEff && !preserveDv) {
                codecTrigger = true;   // upgrade (targetCodecName already = codec)
            } else {
                // Never-downgrade governs codec CHOICE at a FIXED resolution; it has to yield when another transform already forces a real encode and the
                // source codec has no encoder to fall back on. A 2160p->1080p downscale saves far more than an h264-vs-vp9 codec penalty costs, a tonemap
                // is a compatibility transform with no size rationale at all, and interlace repair is asked for in its own right - declining to shrink
                // must never decline the repair too. Refusing any of them to protect the codec choice abandons the transform the user actually asked for.
                // A pure codec-swap with no forced transform still refuses; codec=source is untouched (it skips with the warning below). The interlace
                // verdict is a real decode, so it is tested LAST, behind the metadata tests: it runs only where the !canEncodeTarget skip below would
                // otherwise pay for the same decode.
                const canYield = !preserveDv && codec !== 'source' && ENCODABLE_CODECS.includes(codec) && !ENCODABLE_CODECS.includes(srcCodecName);
                const forcedTransform = willDownscale ? 'downscale' : (tonemap ? 'tonemap' : (canYield && deinterlaceNeeded() ? 'interlace repair' : ''));
                const yieldToTransform = canYield && forcedTransform !== '';
                if (yieldToTransform)
                    response.infoLog += `☒${pTag}[action=shrink][codec=${codec}] ${codec} is no more efficient than the source `
                        + `${srcCodecName}, but ${forcedTransform === 'interlace repair'
                            ? `${srcCodecName} has no encoder here and the interlace repair needs a re-encode`
                            : `the forced ${forcedTransform} saves more than the codec costs`} - encoding as ${codec}\n`;
                else if (codec !== 'source' && (CODEC_EFFICIENCY[codec] || 0) < srcEff && !preserveDv)
                    response.infoLog += `☒${pTag}[action=shrink][codec=${codec}] ${codec} is less efficient than the source `
                        + `${srcCodecName} - never downgrading${ENCODABLE_CODECS.includes(srcCodecName)
                            ? `; re-encoding as ${srcCodecName} to shrink instead`
                            : `, and ${srcCodecName} has no encoder here, so it is left as-is (action=normalize converts it)`}\n`;
                targetCodecName = preserveDv ? 'hevc' : (yieldToTransform ? codec : srcCodecName);   // same-codec size pass (guard_dv still forces hevc for DV)
                // a legacy same-codec pass can't encode - caught by the !canEncodeTarget skip below
                codecTrigger = ENCODABLE_CODECS.includes(targetCodecName);
            }
        }
        // Final output bit depth - computed only AFTER targetCodecName is final (guard_dv's override and shrink's never-downgrade fallback can each still
        // change it), so the 'h264 is always 8-bit' rule (10-bit H.264 breaks device support) keys on the ACTUAL output codec, not the provisional one. Every
        // other target follows method_bitdepth (10 / source-depth); guard_dv then forces 10-bit for a DV file, which an 8-bit output would break.
        let want10Bit = targetCodecName === 'h264' ? false : (bitDepthOpt === '10' || (bitDepthOpt === 'source' && srcIs10));
        if (preserveDv && !want10Bit) {
            response.infoLog += `☒${pTag}[method_bitdepth=${bitDepthOpt}][guard_dv=enabled] Dolby Vision requires 10-bit`
                + ` - keeping 10-bit output (ignoring the 8-bit request)\n`;
            want10Bit = true;
        }
        // guard_shrink_bitrate gates SHRINK's efficiency re-encode only (a CQ re-encode of an already-lean file can grow it). normalize is compatibility-driven
        // - it must convert regardless of size - and downscale / tonemap / interlace repair / the lossless strip are exempt in both actions, as transforms
        // the user asked for in their own right (the repair is the one that CAN still grow the file: a shot-on-video source comes back at double frame rate).
        let belowFloorKbps = 0;
        if (action === 'shrink' && codecTrigger && guardShrinkKbps > 0) {
            const vkbps = Math.round((resolveStreamBitrate(primary) || 0) / 1000);
            if (vkbps > 0 && vkbps < guardShrinkKbps) { codecTrigger = false; belowFloorKbps = vkbps; }
        }
        // A same-codec size pass has ONE stop - the awk_video fence below - and a container that cannot store the tag has nowhere to keep it: the next pass
        // recomputes the identical fingerprint, finds nothing, and re-emits a byte-identical preset, which Tdarr refuses as an infinite transcode loop and
        // ERRORS the file (across separate library scans, where that guard does not apply, it is generational re-encoding instead). Drop the codec trigger
        // rather than the file: a downscale, tonemap or deinterlace pass converges on its own evidence and still runs. normalize needs no fence at all - it
        // fires only on a codec mismatch, which the encode itself removes.
        let fenceUnstorable = false;
        if (action === 'shrink' && codecTrigger && !markerPersists(dstContainer)) {
            codecTrigger = false;
            fenceUnstorable = true;
            response.infoLog += `☒${pTag}[action=shrink][container=${dstContainer}] A size pass records what it did in an `
                + `${VIDEO_FENCE_TAG} tag and ${dstContainer} cannot store one, so every later pass would re-encode this file again - declining the shrink;`
                + ' remux to mkv or mp4 first (clean_and_remux does that) to enable it\n';
        }
        // Three of the four triggers are pure stream metadata; the fourth is the idet DECODE. Split so the cheap ones are tried first: deciding WHETHER to
        // encode needs the decode only when interlace repair would be the sole reason, and once an encode is happening with deinterlace live the verdict is
        // read anyway, because it picks the repair filter. Every consumer below therefore calls realTranscode() with its own cheap metadata test to the LEFT of
        // it, so a file that guard_lossless or the DV and HDR refusals were always going to settle never spawns ffmpeg to be told something it does not use.
        // The awk_video fence is the deliberate exception: it is tested INSIDE the realTranscode() branch, so a fenced file whose only live trigger is
        // deinterlace does pay one idet decode per re-cycle. Hoisting it left would pre-empt the strip_dynamic lossless path below and re-label every fenced
        // no-trigger skip with the fence line instead of its accurate reason.
        const cheapTrigger = codecTrigger || willDownscale || tonemap;
        // Interlace repair forces a real encode exactly as a downscale or a tonemap does.
        const realTranscode = () => cheapTrigger || deinterlaceNeeded();
        const canEncodeTarget = ENCODABLE_CODECS.includes(targetCodecName);

        // Skips that a pending real transcode would otherwise turn destructive. guard_lossless leads the block: it is the one that says
        // "don't touch this file at all", so it should answer for a lossless source whatever else also applies. It keys on realTranscode,
        // so the lossless -c:v copy paths (hdr_cleanup_only, a bare strip_dynamic) still run - they cost the master nothing.
        if (guardLossless && LOSSLESS_VIDEO_CODECS.includes(srcCodecName) && realTranscode()) {
            return skip(`☒${pTag}[guard_lossless=enabled] ${srcCodecName} is a lossless/mastering source - a re-encode would flatten it`
                + ` to lossy 4:2:0 ${want10Bit ? '10' : '8'}-bit; set guard_lossless=disabled to convert it anyway\n`);
        }
        if (!canEncodeTarget && realTranscode()) {   // codec=source resolved to a legacy codec with no encoder, but downscale/tonemap/deinterlace force one
            return skip(`☒${pTag}[codec=${codec}] Source codec ${srcCodecName || 'unknown'} has no encoder - can't keep it through the `
                + `${willDownscale ? 'downscale' : (tonemap ? 'tonemap' : 'interlace repair')}`
                + `; set codec=hevc/h264/av1 to convert it\n`);
        }
        if (preserveDv && srcIsIptC2 && realTranscode()) {
            return skip(`☒${pTag}[guard_dv=enabled] ${dvLabel} uses the IPT-C2 colour matrix that libx265 cannot re-encode`
                + ` - left untouched; set guard_dv=disabled and hdr_mode=tonemap_sdr to flatten it to SDR\n`);
        }
        if (effHdrMode === 'strip_dynamic' && dvNoBaseLayer && realTranscode()) {
            return skip(`☒${pTag}[hdr_mode=strip_dynamic] ${dvLabel} has no HDR10 base layer - a re-encode would leave a mis-coloured`
                + ` picture with no HDR fallback, left untouched; set hdr_mode=tonemap_sdr to flatten it to SDR\n`);
        }
        // a transcode would drop the unprotected dynamic layer - protect it by skipping
        if (isDynamicHdr && !preserveDv && effHdrMode === 'preserve' && realTranscode()) {
            // Only offer guard_dv when turning it on would actually change this file's outcome: it needs an HEVC source (libx265 is the only encoder that
            // carries the RPU), it must not already be on, and it must not use the IPT-C2 matrix libx265 cannot re-encode - that file skips again on the very
            // next pass with the opposite advice. Naming a setting that cannot help reads as the plugin not knowing its own state.
            const guardDvWouldHelp = dvSignal && !guardDvLive && srcCodecName === 'hevc' && !srcIsIptC2;
            return skip(`☒${pTag}[hdr_mode=preserve] ${dynLabel} can't survive a re-encode - left untouched to protect it; `
                + `${guardDvWouldHelp ? 'enable guard_dv to carry the Dolby Vision through, or ' : ''}`
                + `set hdr_mode=strip_dynamic (keep the HDR10 base) or hdr_mode=tonemap_sdr (flatten to SDR)\n`);
        }

        // ====== TRANSCODE EMIT ======
        // Embedded closed captions. They live in the video bitstream, so this is the only plugin that can lose them and the only one that can
        // remove them deliberately. Two jobs: carry out the removal sub_worker asked for, and (guard_captions) notice captions the encoder this node is
        // about to choose would destroy. Neither is in the awk_video fingerprint, deliberately: neither can FIRE a transcode, they only change how one
        // already happening is performed - fingerprinting them would re-encode a finished file a second time, to strip a caption track or to "protect"
        // captions the first encode already destroyed. Read through the shared handoff vocabulary, never bare literals (a token sub_worker renames must
        // not go on quietly meaning nothing here); it is a comma list - `imported,strip` arrives from a round trip that could not strip in its own pass.
        const ccTokens = ccTokensOf(file.ffProbeData.format?.tags);
        const ccExported = ccTokens.includes(CC_TOKENS.strip);    // sub_worker took them out, but could not remove the bitstream copy under its -c copy pass
        const ccChannelEmpty = ccTokens.includes(CC_TOKENS.none); // sub_worker decoded the channel and it carried no caption text at all
        const ccAlreadyGone = ccTokens.includes(CC_TOKENS.removed); // sub_worker read them out AND filtered the bitstream copy away in that same -c copy pass
        const dropCaptions = ccExported || ccChannelEmpty || ccAlreadyGone;
        // Only `true` is information. Tdarr's optional caption scan reads false both for a file that genuinely has none and for one its bundled CCExtractor
        // could not parse (measured: every mp4, and MPEG-2 inside Matroska), so a false still has to be probed. Memoized to at most one probe per file - that
        // cost is the whole reason the check is skipped wherever the answer could not change the outcome.
        let ccVerdict = null;
        const detectCaptions = () => {
            if (ccVerdict) return ccVerdict;
            if (file.hasClosedCaptions === true) { ccVerdict = { present: true, via: 'the library caption scan' }; return ccVerdict; }
            // A synthetic node (injectedCap): a missing key reads as "no captions", never as a real probe - bar 'probe', which runs the real one for the
            // harness to answer, so it can count the probe and give the 'unknown' an unreadable probe gives. A real node carries no injectedCap.
            const r = probeA53Captions(file.file, deriveFfprobePath(ffmpegPathOf(otherArguments)),
                injectedCap && injectedCap.captions !== 'probe' ? injectedCap.captions === true : undefined);
            ccVerdict = { present: r === true, unknown: r === 'unknown', via: 'a bitstream scan' };
            return ccVerdict;
        };

        // What scale=-2 will emit beside outHeight, in the same DISPLAY orientation (ffmpeg autorotates ahead of the filter chain): the operating point
        // a test-encode line names, and the predicted output stream's width.
        const outWidth = willDownscale && dispHeight > 0 ? Math.max(2, Math.round(dispWidth * outHeight / dispHeight / 2) * 2) : dispWidth;
        // No cross-compatible base (compat id 0 / no surviving HDR transfer, e.g. profile 5): the mp4 output needs the dvh1 tag - hvc1 drops the DV box
        // entirely; a stream WITH a base keeps hvc1.
        const preserveDvNoBase = preserveDv && (dvNoBaseLayer || (!!dovi && dovi.compatId === 0));

        // Say what an encode will cost the node BEFORE ffmpeg is ever spawned: a refusal where it provably cannot fit, a warning where it will fit only by
        // swapping. See the ENCODE MEMORY MODEL block for the coefficients, and for why the refusal reads a single-frame-thread FLOOR rather than the expected
        // figure. It decides nothing itself: resolveEncodeEncoder drops a refused candidate and tries the next, and emits the warnings of the one it uses, so
        // a warning stays a warning and a file that is merely tight still encodes. Returns { refuse: the refusal text | null, floor, allows, lines }.
        // `displaced` is the hardware encoder guard_captions moved this encode off, for the trade-off lines.
        const memoryCheckInner = (sel, displaced, sliceOn) => {
            const none = { refuse: null, lines: [] };
            const budget = memNodeBudget(otherArguments);
            if (!budget || budget.scope === 'unknown') return none;
            // Whether an nvenc encode of this file decodes on NVDEC, by the same call buildVideoArgs makes (nvencDecodeArgs). A tonemap run is costed as
            // the software decode its GPU island runs (the backend is resolved after this check); for hevc10, the HDR codec with an NVDEC figure, that is
            // the larger.
            const nvdecSource = !tonemap && nvencDecodeArgs(file, srcCodecName) !== '';
            const common = { family: sel.family, encoderName: sel.encoderName, srcCodec: srcCodecName, srcIs10, srcW: srcWidth, srcH: srcHeight,
                dispH: dispHeight, outH: outHeight, want10: want10Bit, speedName: speed, cores: budget.cores, sliceOn, nvdecSource };
            const expectOf = (over) => memoryEstimate({ ...common, ...over, tonemapOn: tonemap, deintOn: !!resolveDeintFilter() });
            const floorMb = memoryEstimate({ ...common, floor: true });
            const expectMb = expectOf({});
            if (floorMb === null || expectMb === null) return none;   // unreadable source dimensions, or an unmeasured encoder: say nothing rather than guess
            const limit = budget.limitBytes;
            const freeBytes = Math.max(0, limit - budget.anonBytes);
            // The kill line is the limit PLUS swap, not the limit: a cgroup only OOM-kills once BOTH are exhausted, and two concurrent 4K encodes were measured
            // saturating a 5 GB ceiling and completing by swapping 2 GB. Only container scope may refuse at all - bare metal grows swap or a pagefile on demand
            // and degrades instead of killing, so a host-scope node warns and encodes.
            const refuse = budget.scope === 'container' && floorMb * MEM_BYTES_PER_MB > limit + budget.swapBytes;
            const tight = expectMb * MEM_BYTES_PER_MB > MEM_HEADROOM_FRACTION * freeBytes;
            // Which hardware encoder a guard gave up, and which guard did it. guard_captions passes the one it displaced; guard_dv forced the CPU before any
            // hardware candidate was looked at, so its counterfactual re-runs the pick - the -encoders/nvidia-smi query plus any confirm encode a
            // VAAPI/QSV/AMF or AV1 candidate needs - bought only for a file already flagged.
            let hwAlt = null;
            let forcedBy = '';
            if (sel.family === 'cpu' && (refuse || tight)) {
                if (displaced) { hwAlt = displaced; forcedBy = 'guard_captions=enabled'; }
                else if (preserveDv) {
                    const alt = selectEncoder({ targetCodec: targetCodecName, encoderOpt, otherArguments, forceCpu: false });
                    if (alt.family && alt.family !== 'cpu') { hwAlt = alt; forcedBy = 'guard_dv=enabled'; }   // its notes are discarded - it never ran
                }
            }
            const label = `${outHeight}p ${want10Bit ? '10-bit' : '8-bit'} ${sel.encoderName}`;
            const out = { refuse: null, floor: memGbFromMb(floorMb), allows: memGbFromBytes(limit + budget.swapBytes), lines: [] };
            if (refuse) {
                // Every alternative is quoted on the SAME single-thread floor basis as the refusal itself, so a user can check the arithmetic against the limit
                // that was just named instead of comparing two differently-derived figures.
                const altFloor = (over) => memoryEstimate({ ...common, ...over, floor: true });
                const trades = [];   // { text, mb }: mb is the trade's own floor
                if (outHeight > 1080) {
                    const m = altFloor({ outH: 1080 });
                    if (m !== null) trades.push({ text: `downscale=1080 (~${memGbFromMb(m)})`, mb: m });
                }
                if (want10Bit && targetCodecName !== 'h264') {
                    const m = altFloor({ want10: false });
                    if (m !== null) trades.push({ text: `method_bitdepth=8 (~${memGbFromMb(m)})`, mb: m });
                }
                if (hwAlt) {
                    const m = altFloor({ family: hwAlt.family, encoderName: hwAlt.encoderName });
                    if (m !== null) {
                        trades.push({ text: `${forcedBy.split('=')[0]}=disabled to allow ${hwAlt.encoderName}`
                            + ` (~${memGbFromMb(m)}, at a real bitrate-efficiency cost)`, mb: m });
                    }
                }
                const swapNote = budget.swapBytes > 0 && Number.isFinite(budget.swapBytes)
                    ? ` (a ${memGbFromBytes(limit)} limit plus ${memGbFromBytes(budget.swapBytes)} of swap)` : '';
                // Round the suggestion up to a whole GB and leave room for the node itself (MEM_NODE_OVERHEAD_MB). refuseFor rewrites the fix line for a caller
                // that knows a smaller raise lets ANOTHER refused candidate run (see the endings in resolveEncodeEncoder), and keeps only the trades that are
                // still cheaper than that raise.
                const suggestGb = Math.max(1, Math.ceil(((expectMb + MEM_NODE_OVERHEAD_MB) * MEM_BYTES_PER_MB) / MEM_BYTES_PER_GB));
                const tradesUnder = (who, whoFloorMb) => trades.filter((t) => !who || t.mb < whoFloorMb).map((t) => t.text);
                const compose = (gb, who, whoFloorMb) => `${pTag} ${label} needs at least ~${memGbFromMb(floorMb)} and this node allows `
                    + `${memGbFromBytes(limit + budget.swapBytes)}${swapNote} - the encode would be killed with no error at all, so it is being failed`
                    + ` here instead\n☒${pTag} fix: raise this node's memory limit to about ${gb} GB${who ? `, enough for ${who},` : ','} or run fewer`
                    + ' transcode workers on it'
                    + (forcedBy ? `\n☒${pTag}[${forcedBy}] that is what forced this onto the CPU encoder, and the CPU encoders are the expensive ones` : '')
                    + (tradesUnder(who, whoFloorMb).length
                        ? `\n☒${pTag} cheaper if you would rather trade quality: ${tradesUnder(who, whoFloorMb).join(', ')}` : '');
                out.refuse = compose(suggestGb, '');
                out.suggestGb = suggestGb;
                out.floorMb = floorMb;
                out.refuseFor = compose;
                return out;
            }
            if (tight)
                out.lines.push(`☒${pTag} this encode needs about ${memGbFromMb(expectMb)} and only ${memGbFromBytes(freeBytes)} is free`
                    + ` on this node - it should still`
                    + ` finish, but by swapping, which is far slower than giving the node more memory\n`);
            if (hwAlt) {
                const m = expectOf({ family: hwAlt.family, encoderName: hwAlt.encoderName });
                if (m !== null) out.lines.push(`☒${pTag}[${forcedBy}] that forces the CPU encoder - about ${memGbFromMb(expectMb)}`
                    + ` against ${memGbFromMb(m)} for`
                    + ` ${hwAlt.encoderName}, which this node could otherwise have used\n`);
            }
            // A RAM-backed transcode cache is invisible to the model above: those pages are anonymous, count against the same cgroup limit, and cannot be
            // reclaimed under pressure the way a disk-backed cache's page cache can - so the estimate understates the node by however large the output grows.
            if (budget.scope === 'container' && ['tmpfs', 'ramfs'].includes(String(budget.cacheFsType || '').toLowerCase()))
                out.lines.push(`☒the transcode cache is on ${budget.cacheFsType} - those pages count against this node's memory limit and cannot be`
                    + ` reclaimed, so the figure above understates what this node will really use\n`);
            return out;
        };

        // A defect in the estimator must never cost a user their file. What it does is advisory arithmetic over probe data the plugin does not control, so an
        // unexpected throw inside it is swallowed and the candidate is judged exactly as it would have been without the check at all.
        const memoryCheck = (...args) => {
            try { return memoryCheckInner(...args); } catch (e) { return { refuse: null, lines: [] }; }
        };

        // Predict the re-encoded stream through the shared summariseStream (single source of truth for the [video:...] token) so
        // Expected-results matches the input-summary format; depth is exact via bits_per_raw_sample with pix_fmt/profile cleared, and a
        // tonemapped output is SDR (bt709, detached mediaInfo so no 'hdr' token). Nothing reads outWidth there today - summariseStream's video token is
        // height-only - but a source width beside a downscaled height is a wrong number in a struct named for the output.
        const predictTranscodedVideoToken = () => {
            const outStream = { ...primary, codec_name: targetCodecName, height: outHeight, width: outWidth,
                bits_per_raw_sample: want10Bit ? 10 : 8, pix_fmt: '', profile: '' };
            if (tonemap) { outStream.color_transfer = 'bt709'; outStream.index = -1; }
            // Unless guard_dv carried it, the re-encode DISCARDS the dynamic HDR layer (DV RPU and HDR10+ SEI alike - no encoder this plugin drives
            // carries either), so the prediction clears its carriers (see clearDynamicHdrCarriers). The surviving HDR10/HLG base still shows 'hdr' from the
            // stream's own transfer - or, when neither probe reported one, from the curve inferred off HDR_Format and stamped here (same reason
            // tonemapSetparams stamps the island). A tonemap already landed bt709 above and must keep it, so the stamp skips that case.
            if (isDynamicHdr && !preserveDv) {
                clearDynamicHdrCarriers(outStream);
                if (!tonemap && !HDR_TRANSFERS.includes(srcXfer)) outStream.color_transfer = inferredHdrCurve;
            }
            return summariseStream(outStream);
        };

        // The caption-removal line, ahead of the encoder notes. `removed` is a memo, not a request - sub_worker took the captions out AND filtered the
        // bitstream copy away in its own pass - so it gets a ☑ no-op line rather than the ☐ one, which would announce a queued removal against a file that
        // has carried no captions since. The line is still worth emitting: it is what says why the caption probe was skipped, a decode this run did not have
        // to pay for. dropCaptions keeps including ccAlreadyGone either way, because the -a53cc 0 it drives is the right command - a harmless no-op against
        // a bitstream holding no A53.
        const ccDropLine = () => {
            if (ccExported || ccChannelEmpty)
                return `☐${pTag} Dropping the embedded closed captions - sub_worker `
                    + `${ccExported ? 'exported them to a subtitle, and keeping both would show them twice'
                        : 'found the caption channel carries no text'}\n`;
            return ccAlreadyGone ? `☑${pTag} No embedded closed captions to carry - sub_worker already took them out and cleared the bitstream copy\n` : '';
        };

        // The source frame rate where two readings agree, times what the interlace repair does to it; 0 otherwise. It bounds only how long a CPU test
        // encode may show no output before it is too slow for guard_encode_hours - the estimate itself is read from media time, because a declared rate can
        // be far off (a screen capture declaring 100/1 measured 12.2 fps, which would make every slow encoder look hopeless).
        const corroboratedFps = () => {
            const frac = (s) => { const m = /^(\d+)\/(\d+)$/.exec(String(s || '')); return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 0; };
            const avg = frac(primary.avg_frame_rate);
            if (!(avg > 0)) return 0;
            const dur = Number(file.ffProbeData.format?.duration) || 0;
            const nb = Number(primary.nb_frames);
            const agree = (String(primary.avg_frame_rate) === String(primary.r_frame_rate) && avg <= 60)
                || (isMp4Family(dstContainer) && nb > 0 && dur > 0 && Math.abs(nb - dur * avg) <= 0.05 * dur * avg);
            if (!agree) return 0;
            const deint = resolveDeintFilter();
            return avg * (deint.startsWith('bwdif=mode=send_field') ? 2 : deint.startsWith('fieldmatch') ? 4 / 5 : 1);
        };

        // The encoder this run uses. Walks encoderPlan's candidates in order - per candidate a memory check, the guard_captions gate, the tonemap backend,
        // the production arguments and, wherever a test encode can run (always on a real node; under __awkCap only when the harness supplies testEncode
        // answers), the test encode (TEST ENCODE). A pinned node uses its first passing candidate. True auto - auto, or node/node_strict on an "any" node -
        // uses the first passing one in this node's order and still tests every later hardware candidate once, for the log only. The CPU is reached only
        // when it is forced or no hardware candidate passed, and never under node_strict on a GPU worker. Returns { sel, enc, tonemapBackend, tmWhy,
        // captionForced, captionLines, notes, memLines }, or fails the file.
        const resolveEncodeEncoder = () => {
            const plan = encoderPlan({ targetCodec: targetCodecName, encoderOpt, otherArguments, forceCpu: preserveDv,
                forceCpuWhy: 'for Dolby Vision - hardware encoders drop the RPU' });
            const { notes } = plan;
            const canTest = !injectedCap || !!injectedCap.testEncode;
            const encTag = `[method_encoder=${encoderOpt}]`;
            const capTag = `[guard_encode_hours=${encodeCapHours}]`;
            const opText = `${outWidth}x${outHeight} ${want10Bit ? '10' : '8'}-bit`;
            const ffmpegPath = ffmpegPathOf(otherArguments);
            const testFacts = canTest ? {
                // On POSIX the child leads its own process group, and a run our timeout or output cap ends is killed as a GROUP: spawnSync's SIGKILL reaches
                // only the process it spawned, so an ffmpegPath that is a wrapper script would leave ffmpeg encoding on beside the next window (measured: the
                // later windows read a third of the speed and the file failed the cap). Windows has no process groups. pid > 0: never signal our own group.
                // The trade: a kill aimed at the RUNNER's own process group no longer reaches a test encode in flight, which then ends at its -t content bound.
                spawn: (cmd, argv, opts) => {
                    const posix = process.platform !== 'win32';
                    try {
                        const r = childProcess.spawnSync(cmd, argv, posix ? { ...opts, detached: true } : opts);
                        if (posix && r && r.pid > 0 && r.error && ['ETIMEDOUT', 'ENOBUFS'].includes(r.error.code)) {
                            try { process.kill(-r.pid, 'SIGKILL'); } catch (e) { /* the group has already gone */ }
                        }
                        return r;
                    } catch (e) { return { status: null, signal: null, error: e }; }
                },
                ffmpeg: ffmpegPath, ffprobe: deriveFfprobePath(ffmpegPath), file: file.file, streamIndex: primary.index,
                durationS: Number(file.ffProbeData.format?.duration) || Number(primary.duration) || 0,
                startS: Number(file.ffProbeData.format?.start_time) || 0, capH: encodeCapHours, declaredFps: corroboratedFps(),
                memo: { keyframes: new Map(), decodes: new Map(), encoded: new Set() },
            } : null;
            const tmMemo = new Map();   // the GPU tonemap probe, once per backend: qsv, vaapi and amf all probe opencl
            const tonemapBackendFor = (family) => {
                const base = TONEMAP_BACKEND[family] || 'cpu';
                if (!tmMemo.has(base)) tmMemo.set(base, resolveTonemapBackend({ family, otherArguments }));
                return tmMemo.get(base);
            };
            const captionLines = [];
            let captionGate = guardCaptions && !dropCaptions ? 'open' : 'off';   // open -> not probed yet; survive -> skip every dropper
            let ccVia = '';
            let displaced = null;   // the dropper guard_captions skipped first
            let chosen = null;
            let tested = 0;         // hardware candidates whose test encode gave a verdict (ffmpeg ran)
            let reachedHw = 0;      // hardware candidates that reached the checks at all
            let last = null;        // the last candidate judged, and why it was dropped
            let nonMemoryDrops = 0;
            const memDrops = [];    // every candidate refused for memory, judged for real
            let anyBusy = false;
            let ahead = null;       // the next candidate, pulled early only when the one being judged must know whether it is the last (isLast)
            let aheadNotes = [];    // the cheap-filter notes that early pull emitted, held until the candidate being judged has logged its own lines
            const flush = () => { response.infoLog += captionLines.join('') + ccDropLine() + notes.join('') + aheadNotes.join(''); };
            const slowDrops = [];
            const fmtFps = (f) => (f >= 10 ? String(Math.round(f)) : f.toFixed(1));
            const fmtH = (h) => (h < 1 ? `about ${Math.max(1, Math.round(h * 60))} min` : `about ${h.toFixed(1)} h`);
            // What an estimate can be off by, given how many windows it pooled. A libx265 window's error is where in the film it sits (one window read
            // 0.64-1.43x the true time on the M1), which pooling averages away: five read within ~15%. Hardware's is the load, which every window shares: a
            // loaded J4125 under-stated the time by up to 36% on one window (so ~55% over) and 22% pooled (~30% over).
            const caveat = (isCpu, n) => (isCpu ? (n === 1 ? ' (one sample - can be ~40% off at the current load)'
                : n < 5 ? ` (${n} samples - can be 15-40% off at the current load)` : ' (±15% at the current load)')
                : n === 1 ? ' (one sample - can run ~55% over under load)' : ' (can run ~30% over under load)');
            const notEstimated = { unknown: 'no readable duration in this file', 'no-keyframe': 'could not read a keyframe to seek to',
                'eof-early': 'the file ends before its stated duration',
                'no-steady': 'too few progress readings in the sample', empty: 'no frame came out of the sample' };
            const testLine = (c, t, isCpu, tail) => {
                const where = `at ${opText}${t.fromStart ? ' from the start of the file' : ''}`;
                const unchecked = t.inconclusive ? `; the source could not be checked in ${DECODE_CHECK_TIMEOUT_MS / 1000} s` : '';
                if (t.outcome === 'pass') {
                    if (t.estimateH > 0) {
                        return `☐${encTag} ${c.label}: test encode ok ${where} - ${t.fps ? `${fmtFps(t.fps)} fps, ` : ''}${fmtH(t.estimateH)} for this file`
                            + `${caveat(isCpu, t.windows)}\n`;
                    }
                    const why = t.why === 'no-frame' ? `no frame in ${t.noFrameS} s` : (notEstimated[t.why] || t.why);
                    // No frame came out at all, so nothing showed the encoder works: it is still used, but the test proved nothing.
                    const verdict = t.why === 'no-frame' || t.why === 'empty' || t.noRun ? 'inconclusive' : 'ok';
                    return `☐${encTag} ${c.label}: test encode ${verdict} ${where} - time not estimated (${why})\n`;
                }
                if (t.outcome === 'noexec') return `☒${encTag} ${c.label}: could not run a test encode (${logSafe(t.why, 40)})${tail}\n`;
                const retried = t.retryKilled ? '; its retry from the start of the file was killed by the system'
                    : t.retryFailed ? '; its retry from the start of the file failed too' : '';
                if (t.outcome === 'stall') {
                    const why = t.stallFrames ? `${t.stallFrames} frames in ${TEST_HW_BUDGET_S} s and no more in a ${t.noFrameS} s re-run`
                        : `no frame in ${t.noFrameS} s`;
                    return `☒${encTag} ${c.label}: stalled in a test encode ${where} (${why})${retried}${unchecked}${tail}\n`;
                }
                if (t.outcome === 'fail') {
                    const why = t.dv ? 'a frame reached the encoder without its Dolby Vision RPU'
                        : t.why === 'killed' ? 'killed by the system, often out of memory'
                            : t.why === 'flood' ? 'too much error output' : (logSafe(t.tail, 120) || `exit ${t.status}`);
                    return `☒${encTag} ${c.label}: failed a test encode ${where} (${why})${retried}${unchecked}${tail}\n`;
                }
                if (t.estimateH > 0) {
                    const pace = t.fps ? ` (${fmtFps(t.fps)} fps${t.needFps ? `, needs ${fmtFps(t.needFps)}` : ''})` : '';
                    return `☒${capTag} ${c.label}: ${fmtH(t.estimateH)} for this file${pace} - over the ${encodeCapHours} h limit`
                        + `${caveat(isCpu, t.windows)}${tail}\n`;
                }
                return `☒${capTag} ${c.label}: no output in ${t.noFrameS} s, too slow to finish this file within ${encodeCapHours} h`
                    + `${t.needFps ? ` (it needs ${fmtFps(t.needFps)} fps)` : ''}${tail}\n`;
            };

            // One candidate. Returns { ok, enc, tm, tmWhy, mem, untested } or { drop: 'memory'|'captions'|'test'|'slow', ... }; pushes its own lines.
            // isLast() is asked only once the candidate is failing, since it may pull the next candidate (see the loop).
            const judge = (c, { logOnly, isLast }) => {
                const isCpu = c.family === 'cpu';
                if (!isCpu) reachedHw++;
                const sliceDecode = isCpu && MEM_SLICE_CODECS.includes(srcCodecName);
                const tail = () => (logOnly ? ' - not used' : isLast() ? '' : ' - trying the next encoder');
                const mem = memoryCheck(c, isCpu ? displaced : null, sliceDecode);
                if (mem.refuse) {
                    if (!logOnly) memDrops.push({ c, mem });
                    notes.push(`☒${pTag}${encTag} ${c.label}: needs at least ~${mem.floor} and this node allows ${mem.allows}${tail()}\n`);
                    return { drop: 'memory', mem, noteAt: notes.length - 1 };
                }
                if (!logOnly && captionGate === 'open' && dropsCaptions(c) && settleCaptions(c)) return { drop: 'captions' };
                const tm0 = tonemap ? tonemapBackendFor(c.family) : null;
                const build = (tonemapBackend) => buildVideoArgs({ family: c.family, encoderName: c.encoderName, device: c.device, targetCodec: targetCodecName,
                    qNorm, speed, want10Bit, willDownscale, outHeight, dstContainer, file, srcCodec: srcCodecName, tonemap, tonemapBackend, tonemapSetparams,
                    preserveDv, preserveDvNoBase, deintFilter: resolveDeintFilter(), dropCaptions, sliceDecode });
                let enc = build(tm0);
                if (!canTest) return { ok: true, enc, tm: tm0, tmWhy: '', mem };
                const runOne = (e) => runTestEncode({ ...testFacts, inputArgv: e.inputArgv, videoArgv: e.videoArgv, isCpu, logOnly,
                    lastResort: () => !logOnly && isLast() });
                let t = runOne(enc);
                if (!isCpu && t.outcome !== 'noexec' && !t.noRun) tested++;
                let tm = tm0;
                let tmWhy = '';
                // A GPU tonemap island is a second device the one-frame tonemap probe cannot fully prove (vaapi's two-device chain, say), so before an encoder
                // is dropped for it, the same encoder is tried once with the CPU tonemap - about 0.8x the speed, against an order of magnitude for libx265.
                if ((t.outcome === 'fail' || t.outcome === 'stall') && t.why !== 'killed' && tonemap && tm0 !== 'cpu' && !logOnly) {
                    const enc2 = build('cpu');
                    const t2 = runOne(enc2);
                    if (t2.outcome === 'pass' || t2.outcome === 'slow' || t2.outcome === 'source') {
                        notes.push(testLine(c, t, isCpu, ' - retrying it with the CPU tonemap'));
                        enc = enc2; t = t2; tm = 'cpu'; tmWhy = 'the GPU tonemap failed in a test encode on this node';
                    }
                }
                if (t.outcome === 'source') {
                    flush();
                    failFile(`${pTag} the source does not decode at ${Math.round(t.sourceAtS)} s - repair or replace it`);
                }
                if (t.firstFail) notes.push(testLine(c, t.firstFail, isCpu, ' - retrying it from the start of the file'));
                const untested = t.outcome === 'noexec';
                notes.push(testLine(c, t, isCpu, t.outcome === 'pass' ? '' : untested ? (logOnly ? ' - not used' : ' - using it untested') : tail()));
                if (t.outcome === 'pass' || untested) return { ok: true, enc, tm, tmWhy, mem, untested };
                if (t.busy) anyBusy = true;
                if (!logOnly) nonMemoryDrops++;
                if (t.outcome === 'slow') { if (!logOnly) slowDrops.push({ c, t }); return { drop: 'slow' }; }
                return { drop: 'test' };
            };

            const dropsCaptions = (c) => ['drop', 'error', 'unreliable'].includes(a53ClassOf(targetCodecName, c.family));
            // guard_captions, at the first candidate that would drop the captions: probe once, and if they are there skip every dropper from here on (O1:
            // the later candidates that keep them are still tried, ending at the CPU). AV1 has no caption-keeping CPU encoder, so it warns and continues.
            // Returns true when the captions displace c.
            const settleCaptions = (c) => {
                const cc = detectCaptions();
                if (cc.unknown) {
                    captionGate = 'off';
                    captionLines.push(`☒${pTag}[guard_captions=enabled] Could not check for closed captions on this node (no ffprobe`
                        + ` beside ffmpeg) - continuing without the protection\n`);
                } else if (cc.present && targetCodecName === 'av1') {
                    captionGate = 'off';
                    captionLines.push(`☒${pTag}[codec=${codec}][guard_captions=enabled] Closed captions found by ${cc.via}, and no AV1`
                        + ` encoder left on this node can carry them - they will be lost; extract them with sub_worker's embedded_cc first to keep them\n`);
                } else if (cc.present) {
                    captionGate = 'survive';
                    ccVia = cc.via;
                    displaced = c;
                    return true;
                } else captionGate = 'off';
                return false;
            };
            const hw = plan.hardware();
            // The next candidate to judge. Once captions must survive, a dropper is passed over unjudged, so it is no "next encoder" either.
            const pull = () => {
                let n = hw.next();
                const skipped = () => captionGate === 'survive' && dropsCaptions(n.value);
                while (!n.done && skipped()) n = hw.next();
                return n;
            };
            // Whether the candidate being judged is the last one standing (its retry from the start, and its lines' tail). Nothing is, with the CPU behind it.
            // Otherwise the next candidate is pulled to see - which runs its confirm encode, so this is asked only of a failing candidate, and a pinned node
            // never confirms a render node it will not use.
            // A dropper pulled while the captions are still unprobed settles them first - the one probe judging it would run if this candidate fails - so a
            // caption keeper ahead of every dropper is still last standing when the captions turn out to be there (O1, R19).
            const isLast = () => {
                if (plan.cpuReachable) return false;
                if (!ahead) {
                    const at = notes.length;
                    ahead = pull();
                    while (!ahead.done && captionGate === 'open' && dropsCaptions(ahead.value) && settleCaptions(ahead.value)) ahead = pull();
                    aheadNotes = notes.splice(at);
                }
                return ahead.done;
            };
            while (!(chosen && (!plan.trueAuto || !canTest))) {
                const next = ahead || pull();
                ahead = null;
                if (next.done) break;
                const c = next.value;
                const logOnly = !!chosen;
                const r = judge(c, { logOnly, isLast });
                notes.push(...aheadNotes.splice(0));
                if (logOnly) continue;
                if (r.ok) chosen = { c, ...r };
                else last = { c, ...r };
            }
            if (!chosen && plan.cpuReachable) {
                const c = { family: 'cpu', encoderName: plan.cpuName, device: null, label: plan.cpuName };
                const r = judge(c, { logOnly: false, isLast: () => true });
                if (r.ok) chosen = { c, ...r };
                else last = { c, ...r };
            }
            const cpuReason = () => (preserveDv ? 'forced for Dolby Vision - hardware encoders drop the RPU'
                : displaced ? 'forced to keep the embedded closed captions on the CPU encoder'
                    : reachedHw > 0 ? 'no hardware encoder on this node passed its checks for this file' : plan.cpuWhy);
            // The suffix counts only verdicts read, and is left off an encoder that is itself used untested (its test line says so).
            const encoderLine = (c, untested) => {
                if (c.family !== 'cpu') {
                    const suffix = !plan.trueAuto || untested || tested === 0 ? ''
                        : tested === 1 ? ' - the only encoder tested' : ` - the first of ${tested} tested that passed, in this node's order`;
                    return `☐${encTag} Encoder: ${c.label} (${plan.nodeLabel})${suffix}\n`;
                }
                const why = cpuReason();
                return why ? `☐${encTag} Encoder: ${c.label} (${why})\n` : '';
            };
            const cpuCaptionLine = () => `☐${pTag}[guard_captions=enabled] Closed captions found by ${ccVia} - encoding on the CPU so they survive;`
                + ' extract them with sub_worker\'s embedded_cc to keep the hardware encoder\n';
            if (chosen) {
                notes.push(encoderLine(chosen.c, chosen.untested));
                if (displaced)
                    captionLines.push(chosen.c.family === 'cpu' ? cpuCaptionLine()
                        : `☐${pTag}[guard_captions=enabled] Closed captions found by ${ccVia} - skipping ${displaced.label}, which would drop them,`
                            + ` for ${chosen.c.label}, which keeps them\n`);
                return { sel: { family: chosen.c.family, encoderName: chosen.c.encoderName }, enc: chosen.enc, tonemapBackend: chosen.tm, tmWhy: chosen.tmWhy,
                    captionForced: !!displaced && chosen.c.family === 'cpu', captionLines, notes, memLines: chosen.mem.lines };
            }

            // Nothing passed. guard_dv's forced CPU is never a node_strict fallback - Dolby Vision never strict-errors (encoderPlan) - so its failure ends
            // like any other CPU's, on the cap or the test that stopped it.
            const strictGpu = plan.strict && plan.isGpuWorker && !preserveDv;
            const busyHint = anyBusy ? ' - the node looked busy or short of memory rather than unable, so a requeue may succeed' : '';
            // Every ending below, node_strict's caption ending included, closes on the last memory refusal in full, with its cheaper trades. Its fix line
            // names the smallest raise that lets ANY refused candidate run: the last is usually the CPU, the most expensive, so its own figure would
            // over-state the fix (a pinned nvenc needing 2 GB, then libx264 needing 3). Once guard_captions has found captions it skips every dropper, so a
            // raise only a dropper needed is left out.
            const memFix = !displaced ? memDrops
                : memDrops.filter(({ c }) => !['drop', 'error', 'unreliable'].includes(a53ClassOf(targetCodecName, c.family)));
            const lastMem = memFix[memFix.length - 1];
            const easiest = lastMem && memFix.reduce((a, b) => (b.mem.suggestGb < a.mem.suggestGb ? b : a), lastMem);
            const memRefusal = !lastMem ? '' : easiest === lastMem ? lastMem.mem.refuse
                : lastMem.mem.refuseFor(easiest.mem.suggestGb, easiest.c.label, easiest.mem.floorMb);
            const memBlock = memRefusal ? `\n☒${memRefusal}` : '';
            if (strictGpu && displaced) {
                response.infoLog += notes.join('');
                failFile(`${pTag}[method_encoder=${encoderOpt}][guard_captions=enabled] Closed captions found by ${ccVia}; ${displaced.label} would drop`
                    + ' them and node_strict forbids the CPU encoder that keeps them - extract them with sub_worker\'s embedded_cc first, or use'
                    + ` method_encoder=node${busyHint}${memBlock}`);
            }
            if (strictGpu && reachedHw === 0) {
                response.infoLog += notes.join('');
                failFile(`[method_encoder=${encoderOpt}] ${plan.strictWhy}; node_strict forbids the CPU fallback`);
            }
            // Every candidate refused for memory (one, or several): that refusal on its own, after the Encoder line it is about (in place of its short line)
            // - and, where guard_captions put that last one on the CPU, the caption line that says so.
            if (nonMemoryDrops === 0 && last && last.drop === 'memory') {
                notes.splice(last.noteAt, 1);
                notes.push(encoderLine(last.c));
                if (displaced && last.c.family === 'cpu') captionLines.push(cpuCaptionLine());
                flush();
                failFile(memRefusal);
            }
            // An encoder this node has that a guard or the worker type kept out of the run, so a user can tell a node that cannot encode the file from one
            // that was not allowed to. guard_dv's and the CPU worker's are re-picks with no test encode (selectEncoder: the -encoders/nvidia-smi query and
            // any one-frame confirm), bought only for a file that is already failing, and named only where one exists - never a setting that changes nothing.
            const untried = () => {
                if (displaced) return `; guard_captions=disabled would allow ${displaced.label}, which was not tested`;
                const altOn = (oa) => {
                    const alt = selectEncoder({ targetCodec: targetCodecName, encoderOpt, otherArguments: oa, forceCpu: false });
                    return alt.family && alt.family !== 'cpu' ? alt.encoderName : '';
                };
                if (preserveDv) {
                    const alt = altOn(otherArguments);
                    return alt ? `; guard_dv=disabled would allow ${alt}, which drops the Dolby Vision layer` : '';
                }
                if (plan.isGpuWorker || encoderOpt === 'cpu') return '';
                const alt = altOn({ ...otherArguments, workerType: 'transcodegpu' });
                return alt ? `; a GPU worker on this node could use ${alt}` : '';
            };
            flush();
            if (slowDrops.length) {
                const list = slowDrops.map(({ c, t }) => `${c.label} ${t.estimateH > 0 ? fmtH(t.estimateH)
                    : `over ${encodeCapHours} h (no output in ${t.noFrameS} s)`}`);
                failFile(`${capTag} no ${strictGpu ? 'GPU ' : ''}encoder on this node can encode this file within ${encodeCapHours} h: ${list.join(', ')}`
                    + ' - raise guard_encode_hours, set it to 0 for no limit, or let a faster node take this file'
                    + `${untried()}${busyHint}${memBlock}`);
            }
            if (strictGpu) {
                failFile(`${encTag} no GPU encoder on this node passed its checks for this file; node_strict forbids the CPU fallback${busyHint}${memBlock}`);
            }
            failFile(`${encTag} no encoder on this node could encode this file - see the lines above${untried()}${busyHint}${memBlock}`);
            return null;
        };
        // Build the transcode preset (encoder resolved per node), ending on the predicted output summary.
        const emitTranscode = (encodeTag, { videoSig, priorSig }) => {
            if (preserveDv)
                response.infoLog += `☐${pTag}[guard_dv=enabled] ${dvLabel} - keeping the DV RPU through the re-encode (libx265)\n`;
            // libx265 carries only the RPU through a re-encode; any other dynamic layer on the same file is lost, and every other path that loses one says so.
            const lostWithDv = preserveDv ? [isHdr10Plus ? 'HDR10+' : '', isHdrVivid ? 'HDR Vivid' : ''].filter(Boolean).join(' and ') : '';
            if (lostWithDv) response.infoLog += `☒${pTag}[guard_dv=enabled] The ${lostWithDv} layer is dropped - no encoder here carries it`
                + ' through a re-encode\n';
            const pick = resolveEncodeEncoder();
            const { sel, enc, tonemapBackend } = pick;
            response.infoLog += pick.captionLines.join('') + ccDropLine() + pick.notes.join('') + pick.memLines.join('');
            if (tonemap && tonemapBackend === 'cpu') {
                // A CPU encode never asks for the node's GPU tonemap (the backend follows the encoder family), so only a hardware encode whose tonemap probe
                // or test encode failed may blame the node; otherwise name what put the encode on the CPU. guard_dv needs no arm: it suppresses tonemap_sdr
                // outright.
                const [why, tag] = sel.family !== 'cpu' ? [pick.tmWhy || 'no GPU tonemap available on this node', '']
                    : pick.captionForced ? ['the encode was forced onto the CPU to keep the closed captions', '[guard_captions=enabled]']
                        : encoderOpt === 'cpu' ? ['the encode is pinned to the CPU encoder', '[method_encoder=cpu]']
                            : ['the encode landed on the CPU encoder (see the Encoder line)', ''];
                const tail = sel.family === 'cpu' ? ', and a GPU tonemap runs only beside a hardware encoder' : '';
                response.infoLog += `☒${pTag}[hdr_mode=tonemap_sdr]${tag} Tonemapping HDR -> SDR on CPU (tonemapx) - ${why}${tail};`
                    + ` result may differ slightly from GPU-tonemapped nodes\n`;
            } else if (tonemap)
                response.infoLog += `☐${pTag}[hdr_mode=tonemap_sdr] Tonemapping HDR -> SDR via ${tonemapBackend} (GPU-accelerated)\n`;
            // The fence is written wherever it is free, and skipped where it is not: under normalize it is never load-bearing (see the fence comment), while in
            // the mp4 family keeping it takes -movflags use_metadata_tags, which costs every native tag its readable form and the cover art (mp4TagPlan). A
            // fence this file already carries is cleared rather than left to describe an encode that this one replaces.
            const writeFence = !(action === 'normalize' && isMp4Family(dstContainer));
            const globalWrites = writeFence ? { [VIDEO_FENCE_TAG]: videoSig } : priorSig ? { [VIDEO_FENCE_TAG]: '' } : {};
            let out = `-map 0 -c copy ${enc.videoOut} -c:a copy -c:s copy${outputDrops}${strictArg}`;
            // The encoded primary is output v:0 (cover art and uncopyable streams are mapped out, as -filter:v:0 relies on) - see staleStatsArgs.
            const clearStats = isMatroskaFamily(dstContainer);
            if (clearStats) out += staleStatsArgs('v:0', primary);
            // Retire the request this encode just served. ccExported implies dropCaptions, and buildVideoArgs suppresses A53 on every encoder that can emit it
            // under dropCaptions ('keep' and 'unreliable' in A53_CAP) while the rest drop it unaided, so the output provably carries no captions - `removed` is
            // the accurate successor to `strip`, and it is the token that stops any later pass paying a caption probe. Only fires when a request was actually
            // present.
            if (ccExported) {
                const retired = [...new Set(ccTokens.map((t) => (t === CC_TOKENS.strip ? CC_TOKENS.removed : t)))];
                globalWrites[CC_TAG] = escMeta(retired.join(','));
            }
            // Every container-global write is one globalWrites entry (each value escMeta'd as it goes in), emitted here in the order it was set, so the
            // map mp4TagPlan reads and the -metadata the muxer gets cannot disagree.
            for (const [k, v] of Object.entries(globalWrites)) out += ` -metadata "${k}=${v}"`;
            sealPreset(enc.inputSide, out, globalWrites);
            // The interlace repair's own ☐ line lands HERE, with the preset, for the reason coverArtLog states: every guard between the detection and this
            // point can still end the run with nothing emitted, and a ☐ line means a change about to be MADE. It also makes the frame-rate change legible on
            // the files it happens to, and its absence legible on the film-originated ones where it never applies.
            if (deinterlaceNeeded()) {
                const v = idet();
                response.infoLog += v.kind === 'telecine'
                    ? `☐${pTag}[deinterlace=${deinterlaceOpt}] Film-originated video detected (${idetPct(v.repeats, v)} repeated fields)`
                        + ' - rebuilding its original frames exactly, at its own frame rate\n'
                    : `☐${pTag}[deinterlace=${deinterlaceOpt}] Interlaced video detected (${idetPct(v.combed, v)} combed frames,`
                        + ` ${deintParity()} field order) - keeping every field as its own frame, so the output runs at double the frame rate\n`;
            } else response.infoLog += deintVerdictLine();
            if (clearStats) response.infoLog += staleStatsNote([primary]);
            response.infoLog += `☐${pTag}${encodeTag} Transcoding video @ ${sel.encoderName} q${Math.round(qNorm)}\n`;
            response.infoLog += expectedResultsLine(predictTranscodedVideoToken());
            return response;
        };
        // ====== END TRANSCODE EMIT ======

        // Idempotency fence: a settings fingerprint stored as a container-global awk_video tag. Essential for shrink (a constant-quality same-codec re-encode
        // would otherwise re-shrink every pass - a generational death spiral); never load-bearing for normalize (which only fires on a mismatch its own encode
        // removes), so normalize skips it where storing it costs something (the mp4 family). action is in the core so a normalize-tagged file isn't wrongly
        // fenced under shrink. The plugin version is appended for forensics but is NOT part of the match (like audio_clean's awk_loudnorm), so a version bump
        // never invalidates the fence. EVERY input that can fire a transcode has to appear here, or turning that input on leaves the fingerprint unchanged and
        // the file is skipped as "already processed at this exact setting" while the work it now asks for never runs. The fingerprint is a FIXED POINT, not a
        // pure function of the settings: four tokens are SOURCE-derived and are correct only because the transform makes the output re-read as the thing that
        // produced them - targetCodecName under codec=source, want10Bit under method_bitdepth=source, q from the OUTPUT height, and dv from preserveDv. Do NOT
        // "correct" one of these to key on its setting instead: keying dv on guardDvLive would stamp the token on EVERY file run with guard_dv enabled (the
        // default), invalidating every awk_video tag in the field and costing every user one full re-encode pass, to prevent a divergence that cannot occur - a
        // preserved encode carries the RPU through, so pass 2 re-reads dvSignal and recomputes the same token (measured 2026-08-26 on jellyfin 7.1.4 with a
        // real profile-8.1 RPU: dvhe/p8/L6 in, dvh1/p8/L6 out, record intact; see awk-ffmpeg-test's build-facts.md). The fixed point is pinned by the scenario
        // assertion video-clean-a-preserved-dv-output-still-matches-its-own-fence, so a detection drift fails there rather than silently re-encoding a library
        // once per queue pass.
        if (realTranscode()) {
            const videoSigCore = escMeta([action, targetCodecName, `q${Math.round(qNorm)}`, `h${maxH || 0}`, want10Bit ? '10' : '8', `s${speed}`,
                ...(effHdrMode === 'tonemap_sdr' ? ['sdr'] : []), ...(effHdrMode === 'strip_dynamic' ? ['strip'] : []), ...(preserveDv ? ['dv'] : []),
                ...(deinterlaceLive ? ['deint'] : [])].join('-'));
            const videoSig = `${videoSigCore}-v${escMeta(details().Version)}`;
            const priorSig = getTagCI(file.ffProbeData.format?.tags || {}, VIDEO_FENCE_TAG).trim();
            // core only; the stored -v<version> suffix is forensic, not part of the fence
            const alreadyFenced = priorSig !== '' && priorSig.replace(/-v[^-]*$/, '') === videoSigCore;
            if (alreadyFenced) {
                return skip(`☑${pTag}[action=${action}] Already processed by ${VIDEO_FENCE_TAG} at this exact setting (${videoSig})`
                    + ` - left untouched\n`);
            }
            if (containerRefusesTarget(dstContainer, targetCodecName)) {
                return skip(`☒${pTag}[codec=${codec}][container=${dstContainer}] A .${dstContainer} file cannot hold ${targetCodecName} `
                    + 'video (ffmpeg refuses it, or writes a file that no longer reads back as it) - left untouched; remux it to mkv or mp4 first '
                    + '(clean_and_remux does that), or choose a codec it holds\n');
            }
            // deinterlace=enabled asked for an interlace verdict and the probe could not deliver one, while codec, downscale or tonemap still forces this
            // encode. Encoding now would bake any combing in for good - a downscale blends the fields beyond repair - and the fence it writes is keyed on
            // the SETTING (videoSigCore: that is what lets a repaired, now-progressive output converge), so it would skip the file even once a later probe
            // reads it interlaced. So the file fails instead, untouched: a timeout clears on a requeue, and a file the probe can never read is the user's
            // call to encode as-is with deinterlace=disabled. With no other trigger nothing is encoded, and deintVerdictLine reports it left as-is.
            if (deinterlaceLive && idet().kind === 'unknown') {
                failFile(`${pTag}[deinterlace=${deinterlaceOpt}] Could not read an interlace verdict from this file${idetUnreadTail(idet())}`
                    + ' - not encoding, since combing encoded now could never be repaired; requeue, or set deinterlace=disabled to encode it as-is');
            }
            const reasonTags = [
                srcCodecName !== targetCodecName && targetCodecName,   // codec change
                willDownscale && `${outHeight}p`,
                want10Bit !== srcIs10 && (want10Bit ? '10-bit' : '8-bit'),   // depth piggybacks a transcode fired by something else
                tonemap && 'tonemap_sdr',
                deinterlaceNeeded() && (idet().kind === 'telecine' ? 'film-restore' : 'deinterlace'),
            ].filter(Boolean);
            if (reasonTags.length === 0) reasonTags.push('shrink');   // a same-codec shrink with no other visible transform
            return emitTranscode(`[${reasonTags.join('][')}]`, { videoSig, priorSig });
        }

        // No real transcode: a lossless strip, a bitrate skip, or a benign no-op. Reaching here means realTranscode()
        // was evaluated in full, so the interlace verdict (if the setting bought one) is settled and can be reported.
        response.infoLog += deintVerdictLine();
        if (effHdrMode === 'strip_dynamic' && isDynamicHdr) {   // strip_dynamic is the sole reason - do it losslessly (or skip when it can't be lossless)
            return tryLosslessStrip('set hdr_mode=tonemap_sdr to flatten it to SDR', '');
        }
        // The declined size pass already logged WHY above; say only that nothing else was left, rather than falling to the shrink line below, which speaks
        // for a target with no encoder.
        if (fenceUnstorable)
            return skip(`☑${pTag}[action=shrink] Nothing else to do for this file\n`);
        if (belowFloorKbps > 0) {
            return skip(`☑${pTag}[guard_shrink_bitrate=${guardShrinkKbps}] Source video bitrate ${belowFloorKbps}k is below the `
                + `${guardShrinkKbps}k floor - already efficient, left untouched\n`);
        }
        // Only a target with no encoder gets here under shrink: an encodable one always fires a size pass above (an upgrade, or a fenced same-codec pass),
        // and the two things that decline it - the bitrate floor and an unstorable fence - have each returned with their own line already.
        if (action === 'shrink') {
            return skip(`☑${pTag}[action=shrink] Nothing to shrink - source codec ${srcCodecName || 'unknown'} has no encoder `
                + `${codec === 'source' ? '(set codec=hevc/h264/av1 to convert it)' : `and ${codec} is no more efficient (action=normalize converts it)`}\n`);
        }
        return skip(`☑${pTag}[action=normalize] Video is already ${targetCodecName}${dispHeight ? ` ${dispHeight}p` : ''}`
            + `${srcIs10 ? ' 10-bit' : ''} and within limits\n`);
        // ====== END DECIDE, GATED BY ACTION ======
    } catch (err) {
        return failUnexpected(err);
    }
    // ====== END PER-FILE FLOW ======
};

module.exports.details = details;
module.exports.plugin = plugin;
