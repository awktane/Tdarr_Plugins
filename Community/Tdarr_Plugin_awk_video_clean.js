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
    Version: '3.999.93',
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
                \\nav1: the most efficient, but slow on CPU. Hardware AV1 is used on NVIDIA (RTX 40-series) and Intel (Arc, through QSV); AMD's AV1 encoder and
                AV1 through VAAPI are not used yet, their quality setting being unmeasured, so those nodes - and every node without AV1 hardware - use the
                libsvtav1 software encoder.
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
                \\nRepair on the first pass that re-encodes the file: a downscale blends the two half-pictures into each other permanently, and any
                re-encode (a shrink at the same size included) blurs the repeated fields that mark film, so film encoded with this off reads as shot on
                video afterwards and comes back interpolated at double rate instead of rebuilt at its own 24fps. No later pass can undo either.
                \\nYou are not asked which kind of source it is - that is detected from the actual pixels, because containers routinely mislabel it, and
                the two kinds need opposite repairs. Material SHOT on video (sport, news, soaps, camcorders) has no original full frame to recover, so the
                missing lines are interpolated and every half-picture becomes a frame of its own: 1080i60 comes out as 60fps, keeping all the motion the
                file actually holds. Material shot on FILM and padded out for broadcast (nearly every film DVD, much anime) still contains its original
                frames intact, so those are rebuilt exactly and come back at their own 24fps with nothing invented.
                \\nShot-on-video output therefore costs roughly a third more bitrate and half again the encode time; film-originated video keeps its own
                frame rate at no such cost. Already-progressive video is left as it is - turning this on re-encodes a file this plugin already encoded only
                when it turns out to be interlaced - so on a mixed library this touches only a small slice of it. Telling the two apart costs a decode of a
                few hundred frames (about 5 s at 4K on an idle machine) on most files each time they are processed while this is enabled, including files
                then left alone.`,
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
            tooltip: `Output bit depth. Under normalize it is a PARAMETER, not a trigger: it shapes a re-encode some OTHER input fired and never causes one
                by itself, a bit-depth change alone being imperceptible and not worth a lossy pass. Under shrink a file this plugin already shrank IS encoded
                again when this asks for a depth other than the one it was shrunk at - another lossy generation, so pick the depth before shrinking.
                \\nsource (default, recommended): match the source - 10-bit stays 10-bit, 8-bit stays 8-bit.
                \\n8 or 10 force the depth when a re-encode is happening. H.264 is always 8-bit regardless, and Dolby Vision is always 10-bit, so
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
                or AMD render node), amf on Linux; nvenc, qsv, amf on Windows; videotoolbox on an Apple Silicon Mac. An AV1 target skips vaapi and amf (see
                codec), and an Intel Mac uses software, VideoToolbox's quality mode needing Apple Silicon. CPU workers always use software. So each node uses
                the encoder you assigned it - push jobs onto an idle iGPU (qsv), say, and keep a discrete GPU free.
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
                VAAPI and VideoToolbox have no comparable control and ignore this.
                \\nIt shapes only a new encode, so changing it never re-encodes a file this plugin already encoded - except, under shrink, a file whose
                re-encode guard_shrink_savings put back, which still holds its original video and is tried again at the new speed.`,
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
                \\nCaptions are better handled by lifting them into a real subtitle track - run sub_worker BEFORE this plugin. Once it has, the leftover
                bitstream copy is removed on the next re-encode, so you do not end up with the same captions twice - unless the video was replaced since
                they were read, in which case the request is withdrawn first and sub_worker reads the new video's captions. Where sub_worker already
                removed that copy itself, this guard still checks the file, so captions an outside tool put back are kept.
                \\nThe check costs one bounded ffprobe read per candidate file, a few seconds whether the file is a clip or a feature, and is skipped
                entirely when the answer could not change anything - when the chosen encoder already carries captions (named under disabled above).
                \\nA caption channel that is present but carries no text still counts as captions here, since telling the two apart needs a full decode -
                and sub_worker finding no text does not switch this guard off, because ffmpeg reads no CEA-708 text at all and a CEA-708 service would
                then be lost. That costs a needless CPU encode, never data.`,
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
            tooltip: `Applies to action=shrink ONLY: skip the size re-encode when the source video bitrate is already below this, in kbps. On Matroska and
                mp4 files that start at zero and whose video fills the timeline (nearly all), when the video reports no bitrate of its own, or a higher
                one than the whole file, the whole file's bitrate is used, because it bounds the video's. 0 disables the guard. The default of 1000 leaves
                genuinely lean sources alone and rarely triggers, most content sitting well above 1000 kbps at any resolution.
                \\nWhy: shrink works at constant quality, which cannot predict the output size, so re-encoding an already-lean source can GROW it. This
                floor prevents that.
                \\nnormalize ignores this entirely, a compatibility conversion having to run whatever the size. Four things are exempt even under shrink:
                a downscale, tonemap_sdr, the lossless strip_dynamic copy and interlace repair. The first three cannot grow a file; the repair can, since a
                shot-on-video source comes back at double the frame rate.`,
        },
        {
            name: 'guard_shrink_savings',
            type: 'string',
            defaultValue: '1',
            inputUI: { type: 'text' },
            tooltip: `Applies to action=shrink ONLY: put the original video stream back when a size re-encode saved less than this percentage. 0 disables the
                guard, and 100 puts back every re-encode it judges.
                \\nWhat it measures: the video stream alone - its bytes over its own running time, before and after - so audio work in the same job can
                neither hide a re-encode that saved nothing nor take credit for one.
                \\nWhen: on the next pass after a shrink encode in the same job, a codec change included. The verdict needs this plugin to run again on
                that pass, as a classic plugin stack does; a Tdarr Flow runs a classic plugin once, so there the encode is kept unjudged.
                \\nNever judged on size: a downscale, tonemap_sdr, an interlace repair, a strip of the dynamic HDR layer, an encode carrying out or following
                sub_worker's caption removal, a job in which clean_and_remux repaired the file, and every normalize encode. Nor is an encode whose original
                can never be put back - one that is not Matroska or MP4 (TS, M2TS, AVI, MPEG-PS), or that this container cannot hold: it is kept.
                \\nCost: a read of the new file's video packets and usually the original's (about 30 s for 16 GB on a local disk, minutes over a share),
                then one more copy pass of the whole file to record the verdict or put the video back.
                \\nA revert puts the original video stream back, keeps every other stream and every other plugin's changes, and records the verdict in an
                awk_vq tag, so the file is not tried again at the same settings. Changing this value retries a reverted file only where the saving it
                recorded could pass the new value: raising it re-encodes nothing, and 0 retries every reverted encode that saved something and keeps it
                unjudged. Changing this value never retries a kept file.
                \\nAnother setting re-encodes a kept file only where it changes what the video would become - codec, the quality for its height,
                method_bitdepth, guard_dv on Dolby Vision, or a downscale, tonemap_sdr, dynamic-HDR strip or interlace repair the file actually needs. One
                that would change nothing is passed over, since the encode would only add a lossy generation: method_speed, a downscale box the file
                already fits, an hdr_mode with nothing to act on, and deinterlace on progressive video. A reverted file is passed over the same way, except
                that a new method_speed tries it again.
                \\nExample:\\n25`,
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

    // #region SHARED helpers (12 sections: stream codec type … stream / language / preset helpers)
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
    // marker gets an uppercased key back, and the lookup name is folded too so a mixed-case name still matches. Returns the value as a string ('' if
    // absent); callers trim/decode as needed. One source so the five plugins that read each other's markers can't drift on the lookup convention. An exact-case
    // key wins over another case of it: ffprobe never gives one name twice, but a stand-in view sets 'title' beside a source's 'TITLE'.
    const getTagCI = (tags, name) => {
        const want = String(name).toLowerCase();
        const keys = Object.keys(tags || {});
        const hit = keys.includes(String(name)) ? String(name) : keys.find((k) => k.toLowerCase() === want);
        return hit === undefined ? '' : String(tags[hit] ?? '');
    };
    // ===== END SHARED: case-insensitive tag lookup =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes [all five] =-=-=-
    // Keyed by the real ffmpeg disposition flag; each entry declares the valid stream types, the title keywords that also indicate the role (each
    // keyword lives on ONE flag PER STREAM TYPE - hasDisposition scopes by entry.streams - so title->flag promotion stays unambiguous;
    // descriptive/descriptions/dvs deliberately appear on both the audio and subtitle entries), and the canonical title string (tag, null when never
    // written). The single table every classifier, sort key, summary token and title tagger reads, so the lists can never drift; isCoverArt alone reads
    // its three cover-art flags raw (see there). The roles also carry the words European releases title such tracks with, unflagged: commentary, audio
    // description and SDH in German, French, Spanish, Portuguese, Italian, Dutch, Polish and the Nordic languages; forced in all of those but the Nordic
    // ones, which have no standard forced label; dub in all but German, Dutch and Finnish; original in German, French, Italian, Dutch and Polish, and in
    // Spanish and Portuguese through the bare 'original'. Plurals and the one-word compounds release labels use (Kommentare, Audiokommentar) are
    // included - compounds have no end, so these are the standard labels, not every word. Each is a whole-token match, so only a word that means nothing
    // else in a track title belongs here: VO, OV and UT stay out, and French, Italian, Dutch and Polish carry 'original' as the phrase, since their lone
    // word also names an original soundtrack (bande originale, oryginalna ścieżka dźwiękowa). Every one is pinned by the harness.
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
                                'hörgeschädigte', 'gehörlose', 'sordos', 'non udenti', 'slechthorenden', 'surdos', 'niesłyszących',
                                'hörselskadade', 'hørehæmmede', 'hørselshemmede', 'kuulovammaiset'],                            tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign', 'forcé', 'forcés', 'forzados',
                                'erzwungen', 'forçadas', 'forçada', 'forzati', 'geforceerd', 'wymuszone'],                      tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed', 'dubbing', 'doublage', 'doblaje', 'doblado', 'dublado', 'dublagem',
                                'doppiaggio', 'doppiato', 'dubbad', 'dubbet'],                                                  tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original', 'originalton', 'o-ton', 'originalfassung', 'version originale',
                                'versione originale', 'originele versie', 'wersja oryginalna'],                                 tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','music & effects','m&e','m and e'],   tag: 'M&E'         },
        karaoke:          { streams:['audio'],                    keywords: ['karaoke'],                                               tag: 'Karaoke'     },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                                        tag: null          },
    };
    // -=-=-= roleFieldsOf / roleFieldsLower [all five] =-=-=-
    // NFC first, so a title stored decomposed (an o followed by a combining diaeresis) matches the precomposed keyword it reads as.
    const roleFieldsOf = (fields) => fields.map((t) => String(t || '').normalize('NFC').toLowerCase().trim()).filter(Boolean);
    // Memoized by stream object (WeakMap, per-run closure): hasDisposition reads a stream's fields repeatedly.
    const roleFieldCache = new WeakMap();
    // Role-signal text from BOTH probes - a title/description/handler can live in ffprobe OR mediaInfo but not both - as FIELDS, each matched on its own
    // (hasDisposition). Joined, a name in two of them read 'name name', whose last and first words spelled a keyword neither copy holds: 'Description of the
    // scenes with the new Audio' read 'audio description' and audio_clean deleted the track (measured on an mkv title, an mp4/mov name a remux moved into the
    // handler beside its title box, and a .mov cut); two different fields did the same ('English Audio' beside an mkv DESCRIPTION 'Description of the mix').
    const roleFieldsLower = (s) => {
        // A stand-in for a track the next pass reads by another name carries that pass's fields (readBackFieldsOf): its index still joins the source's
        // mediaInfo, whose Title holds words the output drops, and a property survives the copies a summary makes where a seeded cache entry does not.
        if (Array.isArray(s.readBackRoleFields)) return s.readBackRoleFields;
        if (roleFieldCache.has(s)) return roleFieldCache.get(s);
        const mi = mediaInfoFor(s);
        // ffprobe's title, a TITLE SimpleTag beside the Name (titleTagText: a 'TITLE-<lang>', which mediaInfo's Title shows only when it was written last),
        // description and handler, then mediaInfo's Title less the handler's echo (mediaInfoOwnTitleParts) and its description. Every tag read
        // goes through getTagCI, as no casing is a safe guess: matroska UPPER-CASES tag keys on write (ffprobe shows HANDLER_NAME, DESCRIPTION), and MediaInfo
        // defines Comment/Description as GENERAL-only, so a per-TRACK value lands in the track's 'extra' bag under whatever spelling the container used. The
        // handler is read as the name it holds (handlerTextOf), so the length bytes a grown .mov name starts with ('HSDH ...') hide no role word. Its echo is
        // left out of the Title because MediaInfoLib can read it distorted: a .mov name as MacRoman, where 'Dubé' is 'Dub√©' and 'dub' a whole word (the next
        // pass read /dub, and clean_and_remux wrote the flag). What the Title holds then is ONE stored value - the title box on mp4 and mov, the title on
        // matroska - so it is one field, read whole: its own ' / ', and a line break MediaInfoLib renders so (mediaInfoFill), are the name's ('Hard
        // of<CR><LF>Hearing' reads /sdh, as the name does). The Title goes through mediaInfoText inside mediaInfoOwnTitleParts, which decodes the object
        // mediainfo.js gives for a value holding a control character: undecoded, a role word in it was missed, and the next pass, once a remux had moved the
        // name into the handler, read a role Expected results had not predicted.
        const fields = roleFieldsOf([getTagCI(s.tags, 'title'), titleTagText(s), getTagCI(s.tags, 'description'),
            handlerTextOf(getTagCI(s.tags, 'handler_name')), mediaInfoOwnTitleParts(s).join(' / '), mediaInfoText(getTagCI(mi?.extra, 'description'))]);
        roleFieldCache.set(s, fields);
        return fields;
    };
    // -=-=-= ROLE_NEGATORS / keywordRegex / matchesKeyword [all five] =-=-=-
    // A keyword naming a role the track lacks does not match: one with a negator word one to three non-alphanumerics before it ('English (Non-SDH)', 'No
    // Commentary', 'ohne Kommentar' - the languages the keywords serve), or '-free'/'-less' after it ('commentary-free'). Read as the role, the Non-SDH
    // subtitle is what remove_sub_sdh deletes and the main 'No Commentary' track what downmix_secondary=delete removes. Accepted false negations, where
    // 'no' or 'sin' means something else: 'Dr. No Commentary', 'Kantoku no Commentary', 'Original Sin Commentary' and a Norwegian 'NO SDH' lose a role only
    // their title gives. Every narrower rule un-negates a real one - negating only at a field's start or after a bracket reads 'English No Commentary' as
    // commentary, and dropping 'no'/'sin' loses 'No Commentary' and 'sin comentarios' - so it can delete a main track, where the false negation costs at
    // most a role read as absent: a commentary read as a main track (measured: removed as a duplicate under audio_clean's method_deduplicate=channel), an
    // SDH or forced subtitle read as plain.
    const ROLE_NEGATORS = ['non', 'no', 'not', 'without', 'ohne', 'sans', 'sin', 'sem', 'senza', 'zonder', 'bez', 'uten', 'utan', 'uden', 'ilman'];
    // The whole-token regex for a keyword list: a keyword matches only when not flanked by a letter/digit - '[sdh]', 'eng-sdh', 'sdh.' match, 'deafening' does
    // not - and an internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). It is case-sensitive, so the text must
    // already be lowercased. A pure function of the list, so memoized by keyword-array identity rather than recompiled per classifier call; the mov cut
    // (cutName) also reads it, to find where a role phrase lies.
    const keywordRegexCache = new WeakMap();
    const keywordRegex = (keywords) => {
        let re = keywordRegexCache.get(keywords);
        if (!re) {
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // A gap before a token that itself starts with a non-alphanumeric ('music & effects') excludes that character: otherwise the gap and the literal
            // can both take the same '&', and on a title of 'music' plus a long run of '&' the two runs backtrack quadratically (1.7 s at 32k chars, measured)
            // over role text that nothing caps. Every spelling that matched still matches - the gap only stops short of the literal it was about to overlap.
            const gapBefore = (token) => (/^[\p{L}\p{N}]/u.test(token) ? '[^\\p{L}\\p{N}]+' : `[^\\p{L}\\p{N}${token[0].replace(/[\\\]^-]/g, '\\$&')}]+`);
            const pattern = keywords
                .map((k) => k.trim().split(/\s+/).map((token, i) => (i ? gapBefore(token) : '') + esc(token)).join(''))
                .join('|');
            // The negator test (ROLE_NEGATORS) is bounded, so its lookbehind costs the same at every offset of a title nothing caps.
            const negated = `(?<!(?<![\\p{L}\\p{N}])(?:${ROLE_NEGATORS.join('|')})[^\\p{L}\\p{N}]{1,3})`;
            re = new RegExp(`(?<![\\p{L}\\p{N}])${negated}(?:${pattern})(?![\\p{L}\\p{N}])(?!-(?:free|less)(?![\\p{L}\\p{N}]))`, 'u');
            keywordRegexCache.set(keywords, re);
        }
        return re;
    };
    const matchesKeyword = (text, keywords) => keywords.length > 0 && keywordRegex(keywords).test(text);
    // -=-=-= hasDisposition [all five] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes(codecTypeOf(s))) return false;
        return s.disposition?.[key] === 1 || roleFieldsLower(s).some((t) => matchesKeyword(t, entry.keywords));
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
    // -=-=-= IMAGE_CODECS / COVER_FLAGS / isCoverArt [all five] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last; summariseStream
    // flags them /cover. Two codecs that LOOK like they belong are deliberately ABSENT, for one reason: they are also real moving-picture codecs. mjpeg/mjpegb
    // is camcorder/AVI-era footage, and jpeg2000 is the DCP / IMF / broadcast-mezzanine codec - listing either drops genuine video as cover art, while
    // neither is ever WRITTEN as cover art (mkv attaches image/jpeg or image/png; the mp4 covr atom encodes only JPEG or PNG). Real cover art in those
    // codecs still matches via the disposition clause below - mp4 marks it attached_pic, and ffprobe reports an mkv image attachment as an attached_pic
    // video stream - so a dispositionless mjpeg/jpeg2000 video stream reads as real video, the fail-safe direction. nb_frames cannot substitute for the
    // disposition test: in mkv it is N/A for real MJPEG video AND for cover art. A Matroska image attachment that a plain -map 0 -c copy has written out as a
    // one-frame video track carries no flag, and in mjpeg no image codec either, but it keeps the attachment's filename and mimetype tags (image/jpeg,
    // image/png; measured 2026-10-23 on jellyfin 7.1.4). No real video track carries an image mimetype, so the mimetype clause names it cover art.
    const IMAGE_CODECS = ['png', 'apng', 'gif', 'bmp', 'webp', 'tiff', 'qoi'];
    const COVER_FLAGS = ['attached_pic', 'still_image', 'timed_thumbnails'];
    // Reads ffprobe fields only - the raw flags, on a video stream as dispositionTypes scopes them, never hasDisposition, whose
    // keyword half reaches mediaInfoFor - so it is safe on another file's streams (the library original's, in primaryVideo and
    // stream_ordering's truncation check). A keyword added to those three dispositionTypes rows is not read here.
    const isCoverArt = (s) => IMAGE_CODECS.includes(codecNameOf(s))
        || (codecTypeOf(s) === 'video' && (COVER_FLAGS.some((k) => s.disposition?.[k] === 1) || /^image\//i.test(getTagCI(s.tags, 'mimetype'))));
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
    // The global tags the mov muxer stores WITHOUT use_metadata_tags - as iTunes atoms in mp4/m4v/m4a, as QuickTime udta strings in mov - measured on jellyfin
    // 7.1.4 by writing each and reading it back (awk-ffmpeg-test's fmtprobe tag:native re-measures it per node). A flagless mux drops every other key.
    const MP4_NATIVE_TAGS = {
        mp4: ['title', 'artist', 'album_artist', 'composer', 'album', 'date', 'comment', 'genre', 'copyright', 'grouping', 'lyrics', 'description', 'synopsis',
            'show', 'episode_id', 'network', 'keywords', 'track', 'disc', 'compilation', 'gapless_playback', 'hd_video', 'media_type', 'episode_sort',
            'season_number'],
        mov: ['title', 'artist', 'album', 'date', 'comment', 'genre', 'copyright', 'location', 'make', 'model'],
    };
    // Tags the muxer rebuilds itself (ftyp, mvhd, the video track's own timecode, its own encoder string), so a flagless mux loses none of them.
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
    // -=-=-= mp4MovflagsArg [all five] =-=-=-
    // The one -movflags an mp4-family output carries, built in one place because a later -movflags without a leading + replaces the earlier value:
    // use_metadata_tags where mp4TagPlan asks for it, and +faststart, which writes the moov - the file's index - ahead of the media, so a player starts and
    // seeks on progressive download or remote direct play without fetching the tail first. Every mp4-family write the other four plugins make front-loads,
    // so a file one of them remuxed reaches stream_ordering fronted and its method_mp4_faststart has no remux of its own to force; stream_ordering passes
    // `faststart` false for that input's strip, and only it ever remuxes for the flag alone. It moves the moov and nothing else (packets, tags, chapters, tmcd
    // tracks, covers and Dolby Vision boxes read back identical; mediaInfo's IsStreamable turns Yes) by writing the whole file once more at the end of the
    // mux: 0.2-1.2x a plain -c copy remux's wall time (CPU-saturated to idle M1, 291 MB to 2.5 GB, jellyfin 7.1.4, 2026-11-09).
    const mp4MovflagsArg = (container, plan, faststart = true) => {
        const flags = `${plan.flag ? 'use_metadata_tags' : ''}${faststart && isMp4Family(container) ? '+faststart' : ''}`;
        return flags ? ` -movflags ${flags}` : '';
    };
    // -=-=-= isMp4Cover (+ mp4CoversLost) [all five] =-=-=-
    // A cover the mp4/mov muxer stores as an iTunes covr atom rather than as a track: a video stream whose ONLY disposition is attached_pic, the muxer's own
    // test - one with another flag beside it (attached_pic+default) is written as a one-frame video track instead, in mov too, and read back as plain video.
    // The mov demuxer reports a covr cover after every track, the chapter and tmcd tracks the muxer writes included, wherever it was mapped; ffmpeg writes the
    // atom after every track, and only a file whose udta precedes its tracks (another tool's layout) reports its cover first. Measured 2026-10-23 on jellyfin
    // 7.1.4 in mp4, m4v (the ipod muxer and -f mp4) and mov, with one cover and two.
    const isMp4Cover = (s) => codecTypeOf(s) === 'video' && s.disposition?.attached_pic === 1
        && Object.entries(s.disposition).every(([k, v]) => k === 'attached_pic' || v !== 1);
    // The covers among `kept` (the streams a plugin maps into the output) the container will not store: every one in mov (the QuickTime flavour writes no covr
    // at all, flag or not), and in mp4/m4v/m4a the ones use_metadata_tags costs. The plugins that drop cover art themselves pass none; the others leave these
    // out of their Expected results line too, so the summary and the warning agree.
    const mp4CoversLost = (plan, container, kept = []) => {
        const c = String(container || '').toLowerCase();
        return isMp4Family(c) && (c === 'mov' || plan.flag) ? kept.filter(isMp4Cover) : [];
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
    // -=-=-= isMp4ChapterTrack [all five] =-=-=-
    // An mp4-family file's chapter track. ffmpeg's mov demuxer reads the chapters out of the text track a 'chap' reference names and reports it as a DATA
    // stream (bin_data, one sample per chapter) under its fourcc - 'text' where ffmpeg wrote it, 'tx3g' where GPAC/MP4Box did - and the mp4/mov muxer writes
    // the chapters back as a fresh 'text' track of that shape on every -c copy. So no remux into the mp4 family removes it, and mapping it is worse:
    // mp4/m4v/m4a write the copy as a second, junk 'gpmd' data track (one more each pass), and mov refuses it ("Tag text incompatible with output codec id",
    // exit 183) - measured for both fourccs on jellyfin 7.1.4, 2026-10-22. Every plugin writing an mp4-family output leaves it unmapped, and clean_and_remux
    // never counts that as work (a removal the muxer undoes emits the same preset every pass, which Tdarr errors); its remux into Matroska removes it like any
    // data stream, Matroska carrying the chapters natively. The fourcc list stays closed: every other data track is copied (a GoPro 'gpmd' telemetry track in a
    // chaptered file survives), and a 'tx3g' track no chapter reference names is demuxed as a mov_text subtitle, not as data. The demuxer is read from
    // format_name, never the extension. Tdarr probes without -show_chapters, so chapters are known from mediaInfo's Menu tracks or from the track's own
    // nb_frames, the chapter count ffmpeg reads (equal at 1, 3, 4, 7 and 20 chapters), which still answers when mediaInfo did not scan the file; a
    // chapter-fourcc track with neither holds no chapter to rebuild and is removed like any other. awk-ffmpeg-test's fmtprobe rebuild:* rows re-measure it.
    const isMp4ChapterTrack = (s) => String(file?.ffProbeData?.format?.format_name || '').split(',').some(isMp4Family)
        && codecTypeOf(s) === 'data' && ['text', 'tx3g'].includes(String(s.codec_tag_string || '').toLowerCase())
        && ((file?.mediaInfo?.track || []).some((t) => t?.['@type'] === 'Menu') || Number(s.nb_frames) > 0);
    // -=-=-= mp4TimecodeFps (+ MP4_TMCD_MAX_FPS) [all five] =-=-=-
    // Above this the muxer refuses at the trailer a tmcd it has already created (mp4TimecodeArgs).
    const MP4_TMCD_MAX_FPS = 255;
    // The whole fps the mp4/mov muxer times a tmcd by: the rate rounded to nearest as its ROUNDED_DIV does (255.4 is 255, 255.5 is 256), or 0 for a rate
    // without a positive numerator and denominator.
    const mp4TimecodeFps = (rate) => {
        const [num, den] = String(rate || '').split('/').map(Number);
        return num > 0 && den > 0 ? Math.floor((num + Math.floor(den / 2)) / den) : 0;
    };
    // -=-=-= isTmcdTrack (+ mp4GlobalTimecodeKey, MP4_TIMECODE, mp4TimecodeAccepted, mp4VideoTimecode, mp4TimedVideo) [all five] =-=-=-
    // A tmcd timecode track. Every rule below measured 2026-10-23 on jellyfin 7.1.4; awk-ffmpeg-test's fmtprobe create:tmcd* rows re-measure them.
    const isTmcdTrack = (s) => codecTypeOf(s) === 'data' && String(s.codec_tag_string || '').toLowerCase() === 'tmcd';
    const mp4GlobalTimecodeKey = () => Object.keys(file?.ffProbeData?.format?.tags || {}).find((k) => k.toLowerCase() === 'timecode');
    // A timecode as libavutil's av_timecode_init_from_string parses it, sscanf "%d:%d:%d%c%d": blanks may lead each number and a sign may lead it, no field is
    // range-checked (99 frames, -01 or 25 hours all write a track), trailing text is ignored, and any separator before the frames but ':' means drop-frame.
    const MP4_TIMECODE = /^[ \t\n\v\f\r]*[+-]?\d+:[ \t\n\v\f\r]*[+-]?\d+:[ \t\n\v\f\r]*[+-]?\d+(\D)[ \t\n\v\f\r]*[+-]?\d+/;
    // Whether the muxer writes a tmcd for `timecode` at `rate`: it times the track by that frame rate in whole fps (mp4TimecodeFps), and below 1 fps writes
    // none (a cover's 0/0, a 1/3 fps stream - but a PNG-codec video or an attached picture at 25/1 gets one), nor for drop-frame at a rate that does not round
    // to a multiple of 30 (29.97, 30, 59.94 and 60 take it; 23.976, 24, 25 and 50 do not), and above 255 none is written either: mp4TimecodeArgs stops the one
    // that would fail the mux (`cap`, which mp4OverfastVideo lifts).
    const mp4TimecodeAccepted = (timecode, rate, cap = MP4_TMCD_MAX_FPS) => {
        const sep = (MP4_TIMECODE.exec(String(timecode ?? '')) || [])[1];
        const fps = mp4TimecodeFps(rate);
        return sep !== undefined && fps >= 1 && fps <= cap && (sep === ':' || fps % 30 === 0);
    };
    // The string a video's tmcd is written from: the muxer reads the file's global timecode whenever the file has that tag, even an empty one, and the stream's
    // own only otherwise (a global 02:00:00:00 beside a video 01:00:00:00 writes 02:00:00:00; a global 'garbage' beside a valid video tag writes none).
    const mp4VideoTimecode = (v) => {
        const key = mp4GlobalTimecodeKey();
        return key === undefined ? getTagCI(v.tags, 'timecode') : String(file.ffProbeData.format.tags[key] ?? '');
    };
    // A video stream the mp4/mov muxer writes a tmcd for: each one it accepts gets a tmcd of its own (two videos under a global timecode, two).
    const mp4TimedVideo = (v) => codecTypeOf(v) === 'video' && mp4TimecodeAccepted(mp4VideoTimecode(v), v.avg_frame_rate);
    // -=-=-= mp4TimecodeArgs (+ mp4OverfastVideo, mp4OverfastFor, mp4TimecodeLog) [all five] =-=-=-
    // A video the muxer cannot time a tmcd for: above 255 fps it still creates the track, then refuses it at the trailer ("fps 300 is too large", exit 234), so
    // the file errors on every requeue. Judged on a stream as the output writes it (a copy at its avg_frame_rate, an encode at the rate it writes or, marked
    // rateUpTo, the most it can); a rateUpTo encode may run slower than that bound (video_clean's encodeRateUpTo says why), and the remedy applies all the
    // same, because a missing one fails the mux where a needless one only loses a timecode. Measured 2026-10-23 on jellyfin 7.1.4 in mp4, mov and -f mp4: 255/1
    // and 1277/5 write a tmcd, 511/2, 256/1 and 300/1 fail (fmtprobe create:tmcd-fps re-measures it).
    const mp4OverfastVideo = (v) => codecTypeOf(v) === 'video' && mp4TimecodeAccepted(mp4VideoTimecode(v), v.avg_frame_rate, Infinity)
        && mp4TimecodeFps(v.avg_frame_rate) > MP4_TMCD_MAX_FPS;
    // The fast video whose timecode a source tmcd carries.
    const mp4OverfastFor = (s, kept) => kept.find((v) => mp4OverfastVideo(v) && mp4VideoTimecode(v) === getTagCI(s.tags, 'timecode'));
    // The output-side args that keep a fast video from failing the whole mp4-family mux, over `kept`, the streams as the output writes them in output order.
    // A copied tmcd (mov) stops the muxer creating any and is timed by its own sample description, so it needs nothing. Where no other kept video gets a tmcd,
    // -write_tmcd 0 turns the muxer's tmcd creation off: it loses nothing more and keeps a global timecode that use_metadata_tags stores. Where one does, that
    // switch would take its tmcd too, so only the fast video's timecode is cleared, by its place among the output's video streams; a global timecode beats
    // every video's own, so it is cleared as well and restated on each other video, which then writes exactly the tmcd it would have. Each remedy exits 0
    // (measured with mp4OverfastVideo's rates).
    const mp4TimecodeArgs = (container, kept) => {
        if (!isMp4Family(container) || kept.some(isTmcdTrack)) return '';
        const videos = kept.filter((s) => codecTypeOf(s) === 'video');
        const fast = videos.filter(mp4OverfastVideo);
        if (!fast.length) return '';
        if (!videos.some(mp4TimedVideo)) return ' -write_tmcd 0';
        const key = mp4GlobalTimecodeKey();
        const global = key === undefined ? null : escMeta(file.ffProbeData.format.tags[key]);
        return (global === null ? '' : ' -metadata timecode=') + videos.map((v, n) => (fast.includes(v) ? ` -metadata:s:v:${n} timecode=`
            : global === null ? '' : ` -metadata:s:v:${n} "timecode=${global}"`)).join('');
    };
    // A line for each fast video, whose timecode is lost; a rateUpTo one's names the rate as an upper bound.
    const mp4TimecodeLog = (container, kept) => (mp4TimecodeArgs(container, kept) ? kept.filter(mp4OverfastVideo) : []).map((v) => {
        const [c, fps] = [String(container).toLowerCase(), mp4TimecodeFps(v.avg_frame_rate)];
        const why = v.rateUpTo ? `it can run at up to ${fps} fps, and the .${c} muxer cannot time one above ${MP4_TMCD_MAX_FPS}`
            : `the .${c} muxer cannot time one at ${fps} fps (${MP4_TMCD_MAX_FPS} at most)`;
        return `☐${streamTag(v.index)} Writing no tmcd timecode track for this video - ${why}, so its timecode is lost\n`;
    }).join('');
    // -=-=-= isMp4RebuiltTimecode (+ mp4TimecodeCount, mp4RebuiltTimecodes) [all five] =-=-=-
    // How many tmcds the muxer writes for `kept`, the streams as the output writes them: one per mp4TimedVideo stream the output maps, none beside a copied
    // tmcd (mov) - each written from its video's mp4VideoTimecode, never from a source track.
    const mp4TimecodeCount = (kept) => (kept.some(isTmcdTrack) ? 0 : kept.filter(mp4TimedVideo).length);
    // The source tmcds left out of the map that come back: one per kept timed video, a tmcd whose own timecode tag is the one that video is written with, then
    // the first left in file order for each video none matches; the rest are lost. A PNG-codec video stored first at 05:00:00:00 beside an h264 at 01:00:00:00,
    // each with its own tmcd, keeps the h264's when the PNG is dropped, and so does a ProRes proxy in a .mov (measured 2026-10-23; fmtprobe create:tmcd-cap and
    // create:tmcd-pair). Under a global timecode every video asks for that one, so a tmcd it does not match comes back carrying the file's timecode, as its
    // line says.
    const mp4RebuiltTimecodes = (kept) => {
        const left = (file?.ffProbeData?.streams || []).filter((x) => isTmcdTrack(x) && !kept.some((k) => k.index === x.index));
        const paired = [];
        let unpaired = 0;
        for (const v of mp4TimecodeCount(kept) ? kept.filter(mp4TimedVideo) : []) {
            const at = left.findIndex((x) => getTagCI(x.tags, 'timecode') === mp4VideoTimecode(v));
            if (at < 0) unpaired += 1;
            else paired.push(...left.splice(at, 1));
        }
        return [...paired, ...left.slice(0, unpaired)];
    };
    // A tmcd timecode track the mp4/mov muxer puts back when a remux leaves it out, so the output reads exactly as the copy would have (measured 2026-10-01
    // and 2026-10-22: 01:00:00:00 in and out). That holds for a tmcd the video track does not reference (no 'tref') too: the video then shows no timecode
    // tag, but the mov demuxer puts the track's timecode in the global tags, and the muxer writes the track back from those (measured 2026-10-23 on an mp4
    // and a mov with the reference removed).
    const isMp4RebuiltTimecode = (s, kept) => isTmcdTrack(s) && mp4RebuiltTimecodes(kept).some((x) => x.index === s.index);
    // -=-=-= mp4CreatedTracks (+ MP4_CHAPTER_KEY) [all five] =-=-=-
    // mediaInfo's Menu keys each chapter by its start time (_00_01_23_456).
    const MP4_CHAPTER_KEY = /^_(\d{2})_(\d{2})_(\d{2})_(\d{3})$/;
    // The tracks an mp4-family mux writes that no source stream stands behind, as the next pass's ffprobe reports them, so an Expected results line matches the
    // next Input streams line: a chapter track (data, bin_data, 'text') when the file has chapters but no source chapter track (isMp4ChapterTrack), and a tmcd
    // (data, no codec name, 'tmcd') for each one mp4TimecodeCount counts in `kept` beyond the source tmcds it rebuilds. Index -1, so no mediaInfo track joins
    // either. mp4 and mov write both, as do .m4v and .m4a under the -f mp4 outputMuxerArg forces (the ipod muxer an .m4v selects by extension writes no tmcd),
    // and a copied tmcd (mov) stops the muxer writing any. Measured 2026-10-23 on jellyfin 7.1.4 and mediainfo.js 0.2.0; awk-ffmpeg-test's fmtprobe create:*
    // and miprobe mi:menu* rows re-measure it. Summary only: nothing is mapped or counted as work.
    const mp4CreatedTracks = (container, kept) => {
        if (!isMp4Family(container)) return [];
        const streams = file?.ffProbeData?.streams || [];
        // The muxer writes the chapter track from chapter TITLES, empty ones included: a list with none writes a Nero list alone. Tdarr probes without
        // -show_chapters, so they are read off mediaInfo's Menu, which lists an empty title not at all, while the mov demuxer gives every Nero entry a title.
        // So a track is promised for any chapter key, and for a Menu naming no field (every title empty, Nero or Matroska). mediainfo.js spells a
        // Matroska chapter with no title at all as its own start time, exactly as it spells one titled with that time (once ffmpeg has written the file,
        // which stores no chapter language - one tagged with a language reads 'en:...'), and the two cannot be told apart without -show_chapters; the
        // titled shape is the one promised, measured 2026-11-14 on the sample corpus's Matroska files: one chapter titled its own start time (Anime
        // Sample1, read back bare after any ffmpeg remux, whose mp4 copy gains the chapter track) and no untitled one, so a file whose chapters carry
        // no title at all - whose mp4 copy writes only a Nero list - is the residual that promises a track the next pass does not read. A zero-entry Nero
        // list reads as an empty one, though ffmpeg writes a list only for a file with chapters. An MPEG-TS program Menu and a QuickTime chapter track's
        // own Menu name fields and key no chapter, so neither counts.
        const titled = (t) => Object.keys(t).every((k) => ['@type', '@typeorder', ''].includes(k))
            || Object.keys(t.extra || {}).some((k) => MP4_CHAPTER_KEY.test(k));
        const chapters = !streams.some(isMp4ChapterTrack) && (file?.mediaInfo?.track || []).some((t) => t?.['@type'] === 'Menu' && titled(t));
        const rebuilt = mp4RebuiltTimecodes(kept).length;
        return [...(chapters ? [{ index: -1, codec_type: 'data', codec_name: 'bin_data', codec_tag_string: 'text' }] : []),
            ...Array.from({ length: mp4TimecodeCount(kept) - rebuilt }, () => ({ index: -1, codec_type: 'data', codec_tag_string: 'tmcd' }))];
    };
    // -=-=-= mp4RebuiltLine (+ mp4RebuiltLast) [all five] =-=-=-
    // A track left out of the map that the muxer rebuilds (isMp4ChapterTrack, isMp4RebuiltTimecode) is still in the output, so its line is a ☑.
    const mp4RebuiltLine = (s, container) => {
        const timecode = mp4GlobalTimecodeKey() !== undefined ? "the file's timecode" : "the video track's timecode";
        const [what, from] = isMp4ChapterTrack(s) ? ['chapter', 'the chapters'] : ['tmcd timecode', timecode];
        return `☑${streamTag(s.index)} Keeping the ${what} track - the .${String(container).toLowerCase()} muxer rebuilds it from ${from}\n`;
    };
    // The muxer writes the tracks it rebuilds after every mapped stream, the chapter track first and then each tmcd (measured 2026-10-22), so an Expected
    // results line lists them last in that order: this moves the items of `list` (anything carrying a source index) that are among `rebuilt` to the end, and
    // slots the `created` tracks (mp4CreatedTracks) in by the same rule - a chapter track ahead of every tmcd, each tmcd last - each made a list item by
    // `wrap`. Into an mp4-family `container` a kept cover (isMp4Cover, judged on the source stream at the item's index) goes after all of them, where the next
    // pass reads it.
    const mp4RebuiltLast = (container, list, rebuilt, created = [], wrap = (s) => s) => {
        const cover = (x) => isMp4Family(container) && isMp4Cover((file?.ffProbeData?.streams || []).find((s) => s.index === x.index));
        const rank = (x) => { const s = rebuilt.find((r) => r.index === x.index); return !s ? 0 : isMp4ChapterTrack(s) ? 1 : 2; };
        const out = list.filter((x) => !cover(x)).sort((a, b) => rank(a) - rank(b));
        const firstTmcd = out.findIndex((x) => rank(x) === 2);
        out.splice(firstTmcd < 0 ? out.length : firstTmcd, 0, ...created.filter((s) => !isTmcdTrack(s)).map(wrap));
        return [...out, ...created.filter(isTmcdTrack).map(wrap), ...list.filter(cover)];
    };
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: matroska-family container =====
    // -=-=-= isMatroskaFamily [all five] =-=-=-
    // The Matroska family: mkv, its audio (mka) and subtitle (mks) spellings, and WebM, the Matroska subset. All of them store arbitrary tags and flags
    // natively, so each "does this survive a remux" test starts here - and each consumer keeps its own measurement of the property it relies on.
    const isMatroskaFamily = (container) => ['mkv', 'mka', 'mks', 'webm'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: matroska-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: read-back dispositions =====
    // -=-=-= carriesDisposition / MOV_UNSTORED_ROLES (+ readBackDispositions) [all five] =-=-=-
    // Whether an output's command writes any -disposition at all (readBackDispositions' `manual`). Quoted values are blanked first, so a title holding
    // ' -disposition:' is no write - escMeta leaves no double quote inside a value.
    const carriesDisposition = (args) => /(^|\s)-disposition[:\s]/.test(String(args || '').replace(/"[^"]*"/g, '""'));
    // The role flags a .mov stores none of (measured at readBackDispositions' last rule).
    const MOV_UNSTORED_ROLES = ['forced', 'comment', 'hearing_impaired', 'captions', 'visual_impaired', 'descriptions', 'dub', 'original'];
    // The dispositions an output is read back with, as its Expected results line shows them: `list` is the line's items in output order, `streamOf` reads an
    // item's stream, `withStream` makes an item of a changed copy, and `manual` is carriesDisposition's answer. Summary only - no plugin overrides these flags,
    // and only an audio or subtitle token prints a default one. ffmpeg and the mov muxer change flags no plugin asks for, each rule beside the code that
    // applies it (measured 2026-10-23 on jellyfin 7.1.4; the FFmpeg 7.1 source agrees - fftools set_dispositions, movenc enable_tracks).
    const readBackDispositions = (container, list, manual, streamOf = (x) => x, withStream = (x, s) => s) => {
        const mp4 = isMp4Family(container);
        if (!mp4 && !isMatroskaFamily(container)) return list;
        const flagged = (x, flags) => withStream(x, { ...streamOf(x), disposition: { ...(streamOf(x).disposition || {}), ...flags } });
        const out = [...list];
        // A type none of whose streams is default gets one from two writers. ffmpeg itself, on an output whose command carries no -disposition, makes the first
        // stream of each type that has two or more default - an attached_pic stream counted but never chosen - and one -disposition anywhere switches that off
        // for the whole output; Matroska (mkv and webm measured) and the mp4 family store the flag, while MPEG-TS and AVI read every stream back undefaulted,
        // so nothing is shown there. The mov muxer, into the mp4 family, enables the first video, audio and subtitle track - a lone track too, whatever
        // -disposition says - and the mov demuxer reads an enabled track as default; a cover (isMp4Cover) is no track, and a chapter or tmcd track the muxer
        // writes is never enabled. Measured on an mkv's undefaulted subtitles, a lone audio written with -disposition 0, and an mp4 whose default subtitle is
        // dropped, whose next subtitle then reads default.
        for (const type of ['video', 'audio', 'subtitle']) {
            const ofType = out.filter((x) => codecTypeOf(streamOf(x)) === type);
            if (ofType.some((x) => streamOf(x).disposition?.default === 1)) continue;
            const pick = (!manual && ofType.length > 1 ? ofType.find((x) => streamOf(x).disposition?.attached_pic !== 1) : undefined)
                || (mp4 ? ofType.find((x) => !isMp4Cover(streamOf(x))) : undefined);
            if (pick) out[out.indexOf(pick)] = flagged(pick, { default: 1 });
        }
        // A .webm stores default and forced on every track and, on a subtitle, one WebVTT kind as its codec (D_WEBVTT/CAPTIONS, else DESCRIPTIONS, else
        // METADATA): every other flag reads back 0, and of two kinds the first alone (measured 2026-11-14 on jellyfin 7.1.4, each flag written on video,
        // audio and a webvtt subtitle and copied once more).
        if (String(container || '').toLowerCase() === 'webm') {
            return out.map((x) => {
                const d = streamOf(x).disposition || {};
                const kind = codecTypeOf(streamOf(x)) === 'subtitle' ? ['captions', 'descriptions', 'metadata'].find((k) => d[k] === 1) : undefined;
                const gone = Object.keys(d).filter((k) => d[k] === 1 && k !== 'default' && k !== 'forced' && k !== kind);
                return gone.length ? flagged(x, Object.fromEntries(gone.map((k) => [k, 0]))) : x;
            });
        }
        if (!mp4) return out;
        // The mov muxer writes every video stream but a cover as an ordinary track, read back with no attached_pic, still_image or timed_thumbnails flag
        // (attached_pic+default, attached_pic+timed_thumbnails - a QuickTime chapter-image track - still_image and timed_thumbnails alike, in mjpeg and png),
        // so there only an image codec still reads as cover art. It stores no original flag either: a copied one and a +original write both read back 0
        // (audio and subtitle, mp4, m4v and mov; measured 2026-11-09 on jellyfin 7.1.4), so the role survives only as a title keyword. A .mov, which the mov
        // muxer writes (no -f mp4), stores no role flag at all, since only its MP4 mode writes the box that carries them: forced, comment, hearing_impaired,
        // captions, visual_impaired, descriptions and dub written on audio and subtitle read back 0 from .mov, and 1 from .mp4 and from .m4v and .m4a under
        // -f mp4 (measured 2026-11-14 on jellyfin 7.1.4).
        const lost = String(container || '').toLowerCase() === 'mov' ? MOV_UNSTORED_ROLES : ['original'];
        return out.map((x) => {
            const d = streamOf(x).disposition || {};
            const cover = codecTypeOf(streamOf(x)) === 'video' && !isMp4Cover(streamOf(x)) && COVER_FLAGS.some((k) => d[k] === 1);
            const roles = lost.filter((k) => d[k] === 1);
            if (!cover && !roles.length) return x;
            return flagged(x, { ...(cover ? Object.fromEntries(COVER_FLAGS.map((k) => [k, 0])) : {}), ...Object.fromEntries(roles.map((k) => [k, 0])) });
        });
    };
    // ===== END SHARED: read-back dispositions =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4 uncopyable streams =====
    // -=-=-= isUnidentifiedStream / mp4UncopyableStreams (+ mp4LostData, mp4UncopyableLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // A stream ffmpeg cannot identify at all: ffprobe omits its codec_type (an MPEG-TS private-section PID, stream_type 0x05, as DVB recordings carry), and
    // ffmpeg refuses any map of it, -map 0 included ("Cannot map stream ... unsupported type", exit 234 on jellyfin 7.1.4; -map 0 -map -0:N exits 0), so a
    // remux keeping it fails on every requeue, in any container. clean_and_remux removes it; a run without that meets it here.
    const isUnidentifiedStream = (s) => !['video', 'audio', 'subtitle', 'attachment', 'data'].includes(codecTypeOf(s));
    // The streams a -c copy cannot carry as they are, which each remux here leaves out of its map: in every container a stream ffmpeg cannot identify, and
    // two data streams of the mp4 family. One is a stream ffprobe names no codec for - in practice a camera's tmcd timecode track - in mp4/m4v/m4a: the mp4
    // muxer refuses it outright ("Could not find tag for codec none", exit 234 on jellyfin 7.1.4) and takes the whole command down, so a -map 0 copy of such a
    // file fails on every requeue. Its timecode survives where the muxer rebuilds it (isMp4RebuiltTimecode). mov copies the track as-is and is left alone.
    // The other is the chapter track, in mov too, which the muxer always rebuilds from the chapters (see isMp4ChapterTrack). clean_and_remux removes every
    // such stream the muxer would not put back, so in the designed stack only a run without it meets a lost one. The log line names each stream left out and
    // says what carries over.
    const mp4UncopyableStreams = (container, streams) => {
        const c = String(container || '').toLowerCase();
        const noCodec = (s) => ['mp4', 'm4v', 'm4a'].includes(c) && codecTypeOf(s) === 'data' && ['', 'unknown', 'none'].includes(codecNameOf(s));
        return (streams || []).filter((s) => isUnidentifiedStream(s) || noCodec(s) || (isMp4Family(c) && isMp4ChapterTrack(s)));
    };
    // The dropped streams whose data really leaves the output - all of them but a track the muxer rebuilds - so an Expected results line never promises one.
    // `kept` is what the output maps (see isMp4RebuiltTimecode); a tmcd carrying the timecode of a video the muxer cannot time is lost for that reason
    // (mp4OverfastFor), and one lost while the muxer still writes others is one past its one-per-video count.
    const mp4LostData = (dropped, kept) => dropped.filter((s) => !isMp4ChapterTrack(s) && !isMp4RebuiltTimecode(s, kept));
    const mp4UncopyableLog = (container, dropped, kept) => dropped.map((s) => {
        if (isUnidentifiedStream(s)) {
            return `☐${streamTag(s.index)} Leaving out a stream ffmpeg cannot identify - it cannot be copied (${codecTypeOf(s) || 'unknown'}-`
                + `${codecNameOf(s) || 'none'})\n`;
        }
        if (!mp4LostData([s], kept).length) return mp4RebuiltLine(s, container);
        const tmcd = String(s.codec_tag_string || '').toLowerCase() === 'tmcd';
        const what = tmcd ? 'tmcd timecode' : 'unidentified data';
        const fast = mp4OverfastFor(s, kept);
        const why = fast ? `the muxer cannot time one for a video ${fast.rateUpTo ? 'that can run ' : ''}above ${MP4_TMCD_MAX_FPS} fps`
            : mp4TimecodeCount(kept) ? 'the muxer rebuilds only one per video the output keeps' : 'the file has no timecode the muxer can rebuild it from';
        return `☐${streamTag(s.index)} Leaving out the ${what} track - .${String(container).toLowerCase()} cannot copy a stream with no codec`
            + `${tmcd ? `, and ${why}, so it is lost` : ''}\n`;
    }).join('');
    // ===== END SHARED: mp4 uncopyable streams =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: output muxer =====
    // -=-=-= OUTPUT_MUXER_BY_EXT (+ outputMuxerArg, noMuxerSkipLine)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // These four plugins write back into the source's own extension, and ffmpeg picks the muxer from the extension alone - which is wrong, or impossible,
    // for some extensions they accept (measured on jellyfin 7.1.4). .m4v and .m4a select the ipod muxer, which refuses HEVC, AV1, E-AC-3 and Opus, even on a
    // stream copy (exit 234); the mp4 muxer takes all of them into the same filename with identical iTunes tags and cover art, only major_brand moving to
    // isom. .tp/.trp/.tod and .divx have no muxer by extension at all but are plain MPEG-TS and AVI. A null entry has no -f that serves it: .m2p/.vro/.mod/
    // .evo (-f vob) and .dat (-f mpeg) take native DVD content but refuse a copied AAC track, so such a file is left for clean_and_remux to remux instead.
    // .m2v is the raw mpeg2video muxer, which takes only MPEG-2 video (an H.264, HEVC or AV1 write-back fails), and no muxer takes .mpv at all.
    // .rm's muxer exits 0 but writes every video as an RV20 stream (RV10 for rv10) that no longer decodes - a copy of rv10, rv20 or H.264 and an HEVC
    // encode all decoded 0 frames - so a write-back would replace the file with one whose picture is gone (an audio-only .ra writes back whole, so it has
    // no row); .rmvb, .ogm, .mk3d, .qt, .3gpp, .wm, .mpe and .dvr-ms have no muxer by extension (exit 234).
    // awk-ffmpeg-test's muxmatrix mirrors this table (guarded by selftest_mirrors) and re-measures its rows.
    const OUTPUT_MUXER_BY_EXT = {
        m4v: 'mp4', m4a: 'mp4', tp: 'mpegts', trp: 'mpegts', tod: 'mpegts', divx: 'avi', m2p: null, vro: null, mod: null, evo: null, dat: null,
        m2v: null, mpv: null, rm: null, rmvb: null, ogm: null, mk3d: null, qt: null, '3gpp': null, wm: null, mpe: null, 'dvr-ms': null,
    };
    // The output-side -f a container needs: '' where ffmpeg's own pick by extension is right, null where no muxer can write the extension back at all.
    const outputMuxerArg = (container) => {
        const c = String(container || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(OUTPUT_MUXER_BY_EXT, c)) return '';
        return OUTPUT_MUXER_BY_EXT[c] ? ` -f ${OUTPUT_MUXER_BY_EXT[c]}` : null;
    };
    const noMuxerSkipLine = (container) => `☒A .${container} file has no ffmpeg muxer that can write it back - left untouched; remux it to mkv or mp4 first`
        + ' (clean_and_remux does that)\n';
    // -=-=-= CONTAINER_REFUSES_COPY (+ containerRefusesCopy, copyRefusedSkipLine)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The cells where even a STREAM COPY back into the same container is refused: the muxer has no way to store the codec at all, so it refuses at header
    // write whatever tag the stream carries (measured on jellyfin-ffmpeg 7.1.4, 2026-10-12; .wtv and .mxf 2026-11-14). Only another tool writes such a
    // file - an AV1 .mov the mp4 muxer wrote, say - and a copy of its video back fails it on every requeue with nothing but ffmpeg's message (exit 234;
    // 255 from .wtv and .mxf). H.264 is no .wtv cell: a .wtv's own H.264 copies back whole, and only an avcC stream from another container is refused.
    // video_clean's CONTAINER_REFUSES_VIDEO holds these cells and more that fail only an ENCODE: avi/asf/wmv write whatever fourcc the stream carries, so an
    // encode with none is refused or reads back as rawvideo while a copy that keeps the source's working tag muxes and reads back fine; and the MPEG-PS/TS AV1
    // cells cannot be reached by a copy, since a source those muxers cannot carry never probes as av1. awk-ffmpeg-test's muxmatrix mirrors this table too
    // (WRITEBACK_COPY_REFUSES).
    const CONTAINER_REFUSES_COPY = {
        webm: ['hevc', 'h264'], mov: ['av1'], '3gp': ['hevc', 'av1'], '3g2': ['hevc', 'av1'],
        ogv: ['hevc', 'h264', 'av1'], ogg: ['hevc', 'h264', 'av1'], wtv: ['hevc'], mxf: ['hevc', 'av1'],
    };
    const containerRefusesCopy = (container, codec) => (Object.prototype.hasOwnProperty.call(CONTAINER_REFUSES_COPY, container)
        ? CONTAINER_REFUSES_COPY[container] : []).includes(codec);
    // The skip for a copy of `streams` back into `container` when it refuses one of their video codecs ('' when it refuses none), tagged with that stream
    // and `tag`, the input that asked for the copy.
    const copyRefusedSkipLine = (container, streams, tag = '') => {
        const v = (streams || []).find((s) => codecTypeOf(s) === 'video' && containerRefusesCopy(container, codecNameOf(s)));
        return v ? `☒${streamTag(v.index)}${tag} A .${container} file cannot hold ${codecNameOf(v)} video, so even a lossless copy is refused - left untouched;`
            + ' remux it to mkv or mp4 first (clean_and_remux does that)\n' : '';
    };
    // -=-=-= movDvLossLine  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // One warning per video stream a write into `container` takes a Dolby Vision box from (movLosesDvBox), '' when none does, on the pass that writes
    // it; `act` names a write that is not a remux. `streams` is the list the output maps, each written stream as the caller reads it.
    const movDvLossLine = (container, streams, act = 'remux') => streams.filter((s) => movLosesDvBox(container, s))
        .map((s) => `☒${streamTag(s.index)} Dolby Vision is lost in this ${act} - ffmpeg cannot write its box into a .mov; run clean_and_remux first to move`
            + ' the file to mp4 or mkv\n').join('');
    // -=-=-= ROLE_LOSS_WHY / roleLossLine  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // One warning per stream a write takes role flags from (MOV_UNSTORED_ROLES names them all), worded as movDvLossLine: those readBackDispositions
    // reads back 0 on the output. Only two outputs store fewer than a source of their own kind can hold: a .mov the mp4 muxer wrote (-f mp4) holds
    // them all and the mov muxer stores none; a .webm mkvmerge wrote holds Matroska's flags, and ffmpeg's webm muxer keeps only default, forced and a
    // subtitle's one WebVTT kind (measured: a stream_ordering reorder of an mkvmerge --webm file dropped its commentary, original and
    // visual_impaired flags). So a forced subtitle that stops showing by itself, or a commentary read as a main track, is said.
    const ROLE_LOSS_WHY = { mov: ['ffmpeg writes no role flag into a .mov', 'mp4 or mkv'],
        webm: ['a .webm keeps only forced and, on a subtitle, one WebVTT kind', 'mkv'] };
    const roleLossLine = (container, streams, act = 'remux') => {
        const why = ROLE_LOSS_WHY[String(container || '').toLowerCase()];
        return why ? streams.map((s) => {
            const back = readBackDispositions(container, [s], true)[0].disposition || {};
            const lost = MOV_UNSTORED_ROLES.filter((k) => s.disposition?.[k] === 1 && back[k] !== 1);
            return lost.length ? `☒${streamTag(s.index)} Its ${lost.join(' and ')} flag${lost.length > 1 ? 's are' : ' is'} lost in this ${act} - ${why[0]};`
                + ` run clean_and_remux first to move the file to ${why[1]}\n` : '';
        }).join('') : '';
    };
    // -=-=-= dvCopyFourccArgs (+ dvCopyFourccLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The -tag:v args dvCopyFourcc asks for on `kept`, the streams the output writes in output order: each video is addressed by its place among the
    // output's video streams.
    const dvCopyFourccArgs = (container, kept) => kept.filter((s) => codecTypeOf(s) === 'video')
        .map((v, n) => (dvCopyFourcc(container, v) ? ` -tag:v:${n} ${dvCopyFourcc(container, v)}` : '')).join('');
    // One ☐ line per video the args retag.
    const dvCopyFourccLog = (container, kept) => kept.filter((s) => codecTypeOf(s) === 'video' && dvCopyFourcc(container, s))
        .map((s) => `☐${streamTag(s.index)} Tag video as ${dvCopyFourcc(container, s)} - a Profile 5 Dolby Vision record keeps its box in mp4 only under a`
            + ' Dolby Vision fourcc\n').join('');
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
    // NOT memoised (unlike roleFieldsLower's WeakMap): the scan measures ~20 microseconds per file against a transcode measured in minutes. Bound to THIS
    // file: it joins against the closure's file.mediaInfo, so it - and every helper that reaches it (roleFieldsLower, resolveLang, resolveChannels, ...)
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

    // #region SHARED helpers (10 sections: ffmpeg metadata escaping … hevc copy fourcc)
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: track title =====
    // -=-=-= HDLR_TYPE_FOURCCS / GENERIC_HANDLER_RES / nameTextOf / isGenericHandler  [all five] =-=-=-
    // A track HANDLER holds a name or a writing tool's boilerplate, and only a name is a title. On mp4 it is the one place a track name survives an ffmpeg
    // remux, which reads handler_name back and writes it again but never reads back the udta/name box it writes a title into; HandBrake --aname and MP4Box
    // :name= write the name there too. A copy of the handler-type fourcc ('soun') is boilerplate, compared exactly, as MediaInfoLib does.
    const HDLR_TYPE_FOURCCS = new Set(['vide', 'soun', 'sbtl', 'text', 'subt', 'subp', 'clcp', 'tmcd', 'meta', 'hint', 'data', 'mdta', 'mdir', 'pict',
        'auxv', 'twen', 'odsm', 'sdsm', 'ocsm', 'alis', 'url', 'mpeg']);
    // Boilerplate measured on 80 local mp4-family files: ffmpeg's own (VideoHandler, SoundHandler, SubtitleHandler; its source adds DataHandler,
    // TimeCodeHandler, ClosedCaptionHandler, HintHandler, PictureHandler, 'GoPro MET'), Apple's, Bento4's and GPAC's '... Handler', AVFoundation's
    // 'Core Media *' and MP4Box's '<import>@GPAC<ver>'. From writers' source or published dumps, unsampled: Android's SoundHandle, VideoHandle and MetadHandle,
    // Google's 'ISO Media file produced by Google Inc.', QuickTime's localised component names, the GoPro camera ones; any other tool's '... Handler' matches
    // /handler$/. The writers' spaced spellings of that word have a pattern of their own as well, since a title box holding one names no track
    // (boxNamesNothing): 8 of the 17 handler names in 47 corpus files ('Apple Sound Media Handler', 'Video Media Handler', 'Bento4 Video Handler', 'sound
    // handler' and kin), and, from the writers' source, unsampled, older MP4Box's 'GPAC ISO Video Handler', L-SMASH's, Mainconcept's and Apple's text and
    // subtitle components. All but /@gpac/ are ANCHORED: a name may hold the word ('Dog Handler Commentary'), and one read as boilerplate is erased. A
    // real name that ENDS in the word ('Commentary by the Dog Handler') is read as boilerplate all the same - the price of the catch-all, no such name
    // seen - and loses only its text, a role it names still reaching a flag, a sidecar token or the lost-roles line. Exempting a name that gives a role
    // would pass 'Closed Caption Handler' too.
    const GENERIC_HANDLER_RES = [/handler$/i,
        /^(?:apple |bento4 |gpac iso |l-smash |mainconcept )?(?:sound|video|audio|text|subtitle|closed caption)(?: media)? handler$/i,
        /^(sound|video|metad)handle$/i, /^core media /i, /@gpac/i, /^iso ?media file produced by /i, /^(gestionnaire|gestor|procedura|module) d/i,
        /^gopro (avc|aac|tcd|met|sos|h\.?265|hevc)$/i];
    // nameTextOf: a name as written (a handler's or a title's) less control bytes, U+FFFD and whitespace at both ends. A QuickTime-style writer can leave its
    // Pascal length byte in front of an ISO name (ffmpeg strips it only from a QuickTime file, mov.c mov_read_hdlr); from 128 bytes up ffmpeg keeps a mov
    // name's length byte, which ffprobe prints as U+FFFD (movLengthBytes); and escMeta writes a control byte as a space, so a name with one at its edge came
    // back with a space there and was rewritten on the next pass (measured: '\x05Hello World', two passes). An index walk: a /[...]+$/ strip backtracks from
    // every offset in a long interior run of the class, quadratic in a name nothing caps.
    const NAME_EDGE = /[\s\x00-\x1f\x7f\ufffd]/;
    const nameTextOf = (t) => {
        const s = String(t || '');
        let a = 0; let b = s.length;
        while (a < b && NAME_EDGE.test(s[a])) a += 1;
        while (b > a && NAME_EDGE.test(s[b - 1])) b -= 1;
        return s.slice(a, b);
    };
    const isGenericHandler = (h) => {
        const t = nameTextOf(h);
        return !t || HDLR_TYPE_FOURCCS.has(t) || GENERIC_HANDLER_RES.some((re) => re.test(t));
    };
    // -=-=-= rolesNamed  [all five] =-=-=-
    // The roles a name's words give a track of `type` (the classifiers' keywords, dispositionTypes) - or, with no type, a track of any type.
    const rolesNamed = (text, type) => Object.keys(dispositionTypes).filter((k) => k !== 'default'
        && (type === undefined || dispositionTypes[k].streams.includes(type))
        && matchesKeyword(String(text || '').normalize('NFC').toLowerCase(), dispositionTypes[k].keywords));
    // -=-=-= readContainer / MOV_WORD_START / movLengthBytes / handlerTextOf  [all five] =-=-=-
    // The container this pass reads, whatever it writes: mov length bytes (movLengthBytes) and MediaInfoLib's handler reading (handlerReading) depend on it.
    const readContainer = String(file?.container || '').toLowerCase().trim();
    // Where a word starts (dropLast): a letter before a lowercase letter; a capital word (capitals and digits) or a lone lowercase letter that no letter or
    // digit follows; a digit; an opening bracket or quote before a letter or digit.
    const MOV_WORD_START = /^(?:[A-Za-z]\p{Ll}|[A-Z][A-Z0-9]*(?![\p{L}\p{N}])|[a-z](?![\p{L}\p{N}])|[0-9]|[(\[{"'][\p{L}\p{N}])/u;
    // movLengthBytes: how many leading characters of a stored handler are length bytes ffmpeg wrote - 0 unless this pass reads a .mov, since only the mov muxer
    // writes one (an mp4, m4v or m4a handler is a C string, a matroska HANDLER_NAME plain text). From 128 bytes up ffmpeg reads a mov handler back with its
    // Pascal length byte and writes a new one in front on every remux (MOV_HANDLER_MAX_BYTES), so a grown name starts with a run of them, each the count of the
    // bytes after it mod 256: from 0x80 ffprobe prints one as U+FFFD, and from 256 bytes the count wraps, so a byte below 0x80 is that character (measured:
    // ffprobe and mediaInfo both read a 301-byte name as '-Main ...' and its next remux as '.-Main ...'). Memoized: a pass reads each many times.
    const lengthBytesCache = new Map();
    const movLengthBytes = (h) => {
        const s = String(h || '');
        if (readContainer !== 'mov') return 0;
        if (lengthBytesCache.has(s)) return lengthBytesCache.get(s);
        const run = /^[\x00-\x7f\ufffd]*/.exec(s)[0];
        let after = Buffer.byteLength(s, 'utf8') - 2 * (run.split('\ufffd').length - 1);
        // The run: each leading U+FFFD with 128 bytes or more after it (with fewer it is a character of the name - a byte that is no UTF-8, or a U+FFFE, which
        // ffprobe prints so), and each character below 0x80 equal to the count with 256 bytes or more after it (counts): as the run's first character always;
        // later, at once when the next character counts too, since two in a row are a run ffmpeg wrote ('lkjiCommentary' is a 361-byte 'Commentary ...' written
        // once and remuxed three times, measured); else as the run's last only where dropLast drops it.
        const counts = (i, left) => left >= 256 && run.charCodeAt(i) === (left & 0xff);
        // dropLast judges a run's last character. The bytes cannot tell a length byte from a letter equal to the count ('HGerman' is 'H' + 'German' or 'H' +
        // 'G' + 'erman'), and a dropped real letter loses any role it spells ('DCommentary' read as 'ommentary' lost /commentary), where a kept stray character
        // is what the name held before. So it is dropped when the name read without it gives every role (rolesNamed) the name with it gives and more
        // ('3210Commentary' reads 'Commentary'), kept in the opposite case ('EDCommentary', 'Commentary ...' remuxed twice, keeps its 'C'), and otherwise
        // dropped only when it starts no word (MOV_WORD_START).
        const more = (a, b) => a.length > b.length && b.every((k) => a.includes(k));
        const dropLast = (i) => {
            const kept = rolesNamed(s.slice(i)); const dropped = rolesNamed(s.slice(i + 1));
            return more(dropped, kept) || (!more(kept, dropped) && !MOV_WORD_START.test(s.slice(i)));
        };
        // Two residuals: a real length byte that ends a run, starts a word and changes no role stays as a stray character ('IHfeature' reads 'Hfeature'); and a
        // name whose first character is one less than its length byte (by coincidence: about one name in 256, from its first write) is read with the run going
        // on through it and each next character one less than the one before, the last judged by dropLast ('gfeature film' reads 'eature film').
        let n = 0;
        for (const c of run) {
            after -= 1;
            if (c === '\ufffd' ? after < 128 : !(counts(n, after) && (!n || counts(n + 1, after - 1) || dropLast(n)))) break;
            n += 1;
        }
        lengthBytesCache.set(s, n);
        return n;
    };
    const handlerTextOf = (h) => nameTextOf(String(h || '').slice(movLengthBytes(h)));
    // -=-=-= MAC_ROMAN_HIGH / macRoman  [all five] =-=-=-
    // The upper half of MediaInfoLib's MacRoman table (MediaInfo_Config.cpp Ztring_MacRoman), for a QuickTime Pascal string: a mov name "Ü" reads "√ú".
    const MAC_ROMAN_HIGH = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»…\u00a0ÀÃÕŒœ\u2013\u2014“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ'
        + '\uf8ffÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
    const macRoman = (bytes) => Array.from(bytes, (x) => (x >= 0x80 ? MAC_ROMAN_HIGH[x - 0x80] : String.fromCharCode(x))).join('');
    // -=-=-= HANDLER_LEFT_OUT_MP4 / HANDLER_LEFT_OUT_MKV / partsOf / mediaInfoFill / handlerReading / handlerEchoes / mediaInfoShows  [all five] =-=-=-
    // How MediaInfoLib 23.07 builds a track's Title (File_Mpeg4_Elements.cpp moov_trak_mdia_hdlr and moov_udta_xxxx, File_Mpeg4.cpp Streams_Finish,
    // File_Mk.cpp; each rule measured on mediainfo.js 0.2.0). mp4 and mov: the handler's reading (handlerReading), then each udta name, joined ' / ' in that
    // order whatever the box order, a repeat kept ('English / English'). The reading is left out when it holds 'Handler' or ' handler' or starts 'Module ',
    // 'Gestionnaire ', 'Gestor ' or 'Procedura ' (every ffmpeg default named '...Handler', and names: 'Dog Handler Commentary', 'Module Three Lecture'; not
    // 'HANDLER Mix' or 'Handlebar'), and on mp4 when it is its own track's type (handlerReading). Matroska: the track title, then the HANDLER_NAME, left out
    // when it holds 'Handler', 'handler', 'vide' or 'soun' - so with no title tag the Title is the HANDLER_NAME alone or nothing.
    const HANDLER_LEFT_OUT_MP4 = /Handler| handler|^(?:Gestionnaire|Module|Gestor|Procedura) /;
    const HANDLER_LEFT_OUT_MKV = /Handler|handler|vide|soun/;
    // A Title or echo form in parts, each as nameTextOf has it, so a mov or matroska echo that keeps a leading control byte (MediaInfoLib gives those verbatim)
    // is the handler too. It is cut at ' / ' before anything is trimmed: trimmed first, a .mov name whose Pascal reading takes in an older length byte 0x0a or
    // 0x0d (' / English St') was a title '/ English St' that every plugin's carry wrote over the name (measured: a 266-byte name remuxed once).
    const partsOf = (t) => String(t || '').split(' / ').map(nameTextOf);
    // A value as MediaInfoLib stores it. Every value goes through Fill() (File__Analyze_Streams.cpp 838-993, each step measured on mediainfo.js 0.2.0), so
    // every echo form is compared as Fill leaves it. '\r\n', '\r' and '\n' become ' / ' (CarriageReturnReplace, MediaInfo_Config.cpp), and then ONE ' / ' left
    // at the end goes (measured: a .mov handler '\n\n' beside 'XY Mix' reads ' /  / XY Mix'). A plain value's leading U+FEFF go too, which nameTextOf trims
    // from every part. An empty value is not stored, and one made only of U+FEFF or U+FFFE throws: mediainfo.js returns an error for the file.
    const mediaInfoFill = (v) => {
        const breaks = (x) => {
            if (!/[\r\n]/.test(x)) return x;
            const t = x.replace(/\r\n|[\r\n]/g, ' / ');
            return t.endsWith(' / ') ? t.slice(0, -3) : t;
        };
        const t = breaks(String(v || ''));
        // A value that starts U+FFFE has every character's two low bytes swapped (U+FFFE U+6400 U+7500 U+6200 is stored 'dub') and its leading U+FEFF dropped,
        // and the line-break rule runs again on the result: a Title passes it in Fill's char* overload, then in the swap's own Fill call (U+FFFE 'Main' U+0A00
        // 'Mix' is stored as the swapped 'Main' and 'Mix' joined by ' / ').
        if (t.charCodeAt(0) !== 0xfffe) return t;
        const swap = (x) => String.fromCharCode(((x << 8) & 0xffff) | ((x >> 8) & 0xff));
        const swapped = Array.from(t, (c) => swap(c.codePointAt(0))).join('');
        let bom = 0;
        while (swapped.charCodeAt(bom) === 0xfeff) bom += 1;
        return breaks(swapped.slice(bom));
    };
    // The handler as MediaInfoLib reads it, before Fill (mediaInfoFill).
    const handlerReading = (s, stored) => {
        if (isMatroskaFamily(readContainer)) return stored;
        const raw = Buffer.from(stored, 'utf8');
        const n = raw.length;
        // On mov, as MacRoman. A name of 128 bytes or more keeps its length byte through every ffmpeg remux and gains a new one in front (movLengthBytes), and
        // MediaInfoLib reads all but the newest as MacRoman ahead of the name: a 131-byte name remuxed three times is four U+FFFD to ffprobe and "ÖÑÉ" + the
        // name to mediaInfo (bytes 133, 132, 131). From 256 bytes it reads the run verbatim, as ffprobe does - nothing when the newest byte is 0x80 or more,
        // which is no UTF-8, or, when that byte is below 0x20, that many bytes as MacRoman ('Dog ' for 260 bytes of 'Dog Handler ...').
        if (readContainer === 'mov') {
            const lengthBytes = movLengthBytes(stored);
            if (!lengthBytes) return macRoman(raw);
            const kept = Buffer.from(stored.slice(lengthBytes), 'utf8');
            const after = [...Array.from({ length: lengthBytes - 1 }, (_, i) => (kept.length + lengthBytes - 2 - i) & 0xff), ...kept];
            const newest = after.length & 0xff;
            if (after.length < 256) return macRoman(after);
            if (newest < 0x20) return macRoman(after.slice(0, newest));
            return newest >= 0x80 ? '' : stored;
        }
        // On mp4 a handler that is its own track's type ('soun' on audio, 'vide' on video, 'sbtl' on a mov_text) is left out.
        if (stored === { audio: 'soun', video: 'vide', subtitle: s.codec_name === 'mov_text' ? 'sbtl' : '' }[codecTypeOf(s)]) return '';
        // MediaInfoLib GUESSES an mp4 C string is a Pascal one when its first byte, as a length, equals the name's length or that less 1 (or less 2 with
        // padding after the NUL, which ffprobe hides: handlerEchoes), or is below 0x20, and reads that many bytes after it as MacRoman: an 85-byte
        // "The Director..." ('T' is 84) reads "he Director...", '\x03English' "Eng", and an 86-byte one whole unless a padding byte follows its NUL (measured).
        if (n > 1 && (raw[0] < 0x20 || raw[0] === n || raw[0] === n - 1)) {
            const size = raw[0] === n + 1 ? n : raw[0];
            return size <= n ? macRoman(raw.subarray(1, 1 + size)) : '';
        }
        return stored;
    };
    // Every form the handler's echo can take in the Title, each as Fill leaves it, in parts (partsOf); a form missing here reads as a title that outranks the
    // handler. The forms: the name as stored and as nameTextOf has it, each also as MacRoman - the stored one's MacRoman keeps its edges, since as MacRoman a
    // no-break space, BOM or ideographic space at an edge is no space nameTextOf trims ('Commentary' + U+00A0 reads "Commentary¬†", measured); a grown .mov
    // name, its edges included (they count in its length bytes), behind its older length bytes as MacRoman; MediaInfoLib's reading (handlerReading); the Pascal
    // guess from the length less 2 as well; and a name starting U+FFFD also as starting U+FFFE, which ffprobe prints as U+FFFD (the swap in mediaInfoFill).
    const handlerEchoes = (s, handler) => {
        const stored = String(handler || '');
        const raw = Buffer.from(stored, 'utf8');
        const n = raw.length;
        const lengthBytes = movLengthBytes(stored);
        const kept = Buffer.from(stored.slice(lengthBytes), 'utf8');
        const grown = Array.from({ length: Math.max(0, lengthBytes - 1) }, (_, i) => (kept.length + lengthBytes - 2 - i) & 0xff);
        const asStored = stored.charCodeAt(0) === 0xfffd ? [stored, String.fromCharCode(0xfffe) + stored.slice(1)] : [stored];
        const out = [...asStored.flatMap((t) => [t, nameTextOf(t)].flatMap((x) => [x, macRoman(Buffer.from(x, 'utf8'))])),
            macRoman([...grown, ...kept]), handlerReading(s, stored)];
        if (n > 1 && (raw[0] < 0x20 || (raw[0] >= n - 2 && raw[0] <= n))) out.push(macRoman(raw.subarray(1, 1 + Math.min(raw[0], n - 1))));
        return [...new Set(out.map((e) => partsOf(mediaInfoFill(e)).join(' / ')).filter(Boolean))];
    };
    // Whether MediaInfoLib shows the handler in the Title: its reading (handlerReading), judged by the read container's leave-out rule and not empty once Fill
    // has it - so a handler read as a single line break is not shown, and one of two or more is (mediaInfoFill). Measured: an mp4 handler '\x01\nXY Mix', read
    // as the one byte '\n', is not shown, so the title 'XY Mix / Part 2' keeps its first part; a 200-byte .mov 'Module ...' grown once reads '»Module ...', and
    // a 78-byte one on mp4 'odule ...': both shown. An mp4 name holding U+FFFD is taken as read (mediaInfoOwnTitleParts).
    const mediaInfoShows = (s, handler) => {
        const reading = handlerReading(s, String(handler || ''));
        return !!mediaInfoFill(reading) && !(isMatroskaFamily(readContainer) ? HANDLER_LEFT_OUT_MKV : HANDLER_LEFT_OUT_MP4).test(reading);
    };
    // -=-=-= mediaInfoText / edgeless / titleTagKey / titleTagText / titleTagInNamePlace / tagForms / printedAs / mediaInfoOwnTitleParts /
    //        trackNameBesideTitleTag / titleTagFate  [all five] =-=-=-
    // A mediaInfo value as text. mediainfo.js gives a value holding a control character as {"@dt": "binary.base64", "#value": <its UTF-8 in base64>}, not a
    // string (measured: a handler 'Tab<TAB>Name' is the Title {"@dt":"binary.base64","#value":"VGFiCU5hbWU="}); any other non-string reads as none. Taken as a
    // string, such a value threw and failed the file.
    const mediaInfoText = (v) => (typeof v === 'string' ? v
        : (v?.['@dt'] === 'binary.base64' ? Buffer.from(String(v['#value'] || ''), 'base64').toString('utf8') : ''));
    // The parts less the empty ones at either edge: a line break at either edge of a title box leaves an empty part there (mediaInfoFill), and kept,
    // '<LF>Commentary' read '/ Commentary', which every carry then wrote as the name (measured).
    const edgeless = (parts) => {
        let a = 0; let b = parts.length;
        while (a < b && !nameTextOf(parts[a])) a += 1;
        while (b > a && !nameTextOf(parts[b - 1])) b -= 1;
        return parts.slice(a, b);
    };
    // The key of a matroska per-track TITLE SimpleTag, or undefined. ffprobe shows one in the Name's place - the demuxer's dictionary replaces the Name's
    // 'title' with it, as 'TITLE', or under the Name's own key where the tag is spelled 'title' - or, carrying a TagLanguage, as 'TITLE-<lang>' beside the
    // Name, which an mkv copy keeps beside it and an mp4 one drops (measured: 'TITLE-ger'). A key in the Name's place wins; of several beside it, the last,
    // which MediaInfoLib appends (measured: 'TITLE-ger' then 'TITLE-fre' read 'Name / <fre>'). A 'title' key is the Name unless mediaInfo's Title shows
    // another (trackNameBesideTitleTag): read as the Name, 'Director Commentary' beside a 'title' SimpleTag 'Nederlands' lost its role to every remux.
    const titleTagKey = (s) => {
        if (!isMatroskaFamily(readContainer)) return undefined;
        const keys = Object.keys(s?.tags || {}).filter((k) => /^title(?:-[a-z]{2,3}(?:-[a-z0-9]+)*)?$/i.test(k));
        return keys.find((k) => k !== 'title' && !k.includes('-')) || keys.filter((k) => k.includes('-')).pop() || keys.find((k) => k === 'title');
    };
    const titleTagText = (s) => { const k = titleTagKey(s); return k ? String(s.tags[k] ?? '') : ''; };
    // Whether that tag sits in the Name's place: ffmpeg then writes it as the Name on every remux and keeps no TITLE tag beside a Name, so even a matroska
    // output keeps one title. One beside the Name only a write into another container, or a sidecar, drops.
    const titleTagInNamePlace = (s) => { const k = titleTagKey(s); return !!k && !k.includes('-'); };
    // A tag's text in the forms mediaInfo's Title can hold it, each compared as the Name is (mediaInfoOwnTitleParts): in parts as Fill leaves them, the
    // empty ones at either edge dropped (edgeless), and a leading U+FFFD read as U+FFFE too, which ffprobe prints so (the swap in mediaInfoFill). Compared
    // any other way a Name alone read as a second title in 6 of 68 builds (a leading line break or ' / ', a trailing ' / ', a leading U+FFFE); compared
    // so, in none of 76 (measured on mediainfo.js 0.2.0).
    const tagForms = (t) => {
        const x = String(t ?? '');
        const forms = x.charCodeAt(0) === 0xfffd ? [x, String.fromCharCode(0xfffe) + x.slice(1)] : [x];
        return [...new Set(forms.map((y) => edgeless(partsOf(mediaInfoFill(y))).join(' / ')))];
    };
    // Whether `read`, a text as mediaInfo reads it, is the one ffprobe prints as `printed`. The two decode some bytes apart: ffprobe prints U+FFFE and
    // U+FFFF as U+FFFD, which MediaInfoLib keeps, and a U+FFFD for each sequence that is no UTF-8, which MediaInfoLib may decode as one UTF-16 unit
    // (an overlong '/', each half of a CESU-8 pair) - so a U+FFFD there stands for any one unit. Read as a second title, a Name holding U+FFFE made
    // clean_and_remux repeat one mkv preset every pass, and an overlong or CESU-8 one cost a pass (measured on jellyfin 7.1.4 and mediainfo.js 0.2.0).
    const printedAs = (printed, read) => {
        if (printed.length !== read.length) return false;
        for (let i = 0; i < printed.length; i += 1) if (printed[i] !== read[i] && printed.charCodeAt(i) !== 0xfffd) return false;
        return true;
    };
    // The Title's parts without the handler's echo - the title box on mp4 and mov, the title on matroska - which roleFieldsLower reads as the one stored value
    // they are. The echo goes because the raw join welds boilerplate into a title ('Core Media Audio -> 2.0') no later pass can tell from one the user chose.
    // Stated residuals - five layouts are read as the usual one: a file title box ahead of the tracks leaves every handler out (MediaInfoLib reads a handler
    // into the Title only while the file has no title yet), so a title's first part repeating its handler is lost; a QuickTime data handler (minf) named
    // without 'Handler' joins second, its name read as part of the title (ffprobe shows only the media handler); and three lose a title's first part only when
    // it repeats the handler - an mp4 handler holding a byte that is no UTF-8 (MediaInfoLib reads no name, but ffprobe shows it as U+FFFD like a real one, so
    // it is taken as read), an mp4 handler padded after its NUL (guessed a Pascal string from the length less 2), and an mp4 subtitle other than mov_text named
    // its own handler type ('subp' on a dvd_subtitle beside 'subp / Part 2' reads 'Part 2'). Of the five, ffmpeg writes only the handler holding a byte that is
    // no UTF-8, when a copy carries the byte over.
    const mediaInfoOwnTitleParts = (s) => {
        let parts = partsOf(mediaInfoText(mediaInfoFor(s)?.Title));
        const handler = String(getTagCI(s?.tags, 'handler_name') || '');
        const mkv = isMatroskaFamily(readContainer);
        const titleKey = titleTagKey(s);
        let fromEnd = false;
        // The echo is removed ONCE, where MediaInfoLib puts it - from the front, and on matroska beside a title ffprobe shows from the end alone
        // ('Description / Audio' beside its HANDLER_NAME 'Description' is 'Description / Audio / Description', whose front removed left 'Audio / Description',
        // a role neither value gives, and audio_clean deleted the track; measured) - as a RUN of whole parts (a name holding ' / ' is several parts), never by
        // prefix, and only an echo MediaInfoLib shows: beside a handler it leaves out, the Title is all title ('Dog Handler Commentary / Part 2' beside that
        // handler reads whole). Once, so a title's own part equal to the handler stays ('Too Hot to Handle / Remix' beside the handler 'Too Hot to Handle');
        // removing every occurrence emptied a .mov name cut to 127 bytes at a ' / ', which reads 'cut / full name', down to its last part (measured). A string
        // comparison, linear in the title, since a title and a handler are both unbounded: on a 20,000-part title a window-by-window comparison took 0.75 s a
        // removal and 3.7 s a stream_ordering run, against 12 ms and 96 ms for this one (measured on an M-series Mac at load average about 5).
        if (handler && mediaInfoShows(s, handler)) {
            const joined = parts.join(' / ');
            const last = mkv && !!nameTextOf(getTagCI(s?.tags, 'title'));
            const at = (e) => (joined === e ? 1 : (last ? (joined.endsWith(` / ${e}`) ? -1 : 0) : (joined.startsWith(`${e} / `) ? 1 : 0)));
            const echo = handlerEchoes(s, handler).filter(at).reduce((a, e) => (e.length > a.length ? e : a), '');
            fromEnd = !!echo && at(echo) < 0;
            if (echo) parts = partsOf(at(echo) > 0 ? joined.slice(echo.length + 3) : joined.slice(0, -echo.length - 3));
        }
        // A matroska per-track TITLE SimpleTag (titleTagKey) is a second title, which MediaInfoLib puts after the Name as the Title's last part - or the
        // HANDLER_NAME there instead, whichever of the two SimpleTags comes last, since File_Mk.cpp stores both as one 'Title' key. So it is removed from the
        // end as the echo is, leaving the Name (measured: 'New Audio / Description of scenes' read as one name gave /description, and audio_clean deleted the
        // track) - unless the echo came off the end, when MediaInfoLib appended the handler and not the tag (measured: removed as well, the tag's text took
        // the Name 'Director Commentary / English' beside TITLE 'English' down to 'Director Commentary'). roleFieldsLower reads the tag as a field of its own.
        if (titleKey && !fromEnd) {
            const joined = parts.join(' / ');
            const tag = tagForms(s.tags[titleKey]).find((t) => t && joined.endsWith(` / ${t}`));
            if (tag) parts = partsOf(joined.slice(0, -tag.length - 3));
        }
        return edgeless(parts);
    };
    // A matroska track's one name where a per-track TITLE SimpleTag (titleTagKey) sits beside its Name, else '' - the Name being what is left of mediaInfo's
    // Title (mediaInfoOwnTitleParts) when no tag form is it (tagForms), the one place it shows where the tag is in its place. An output that keeps one title -
    // any remux of a tag in the Name's place (titleTagInNamePlace), else a write into another container or a sidecar - writes it as the Name, so that name
    // keeps both values' roles (rolesNamed): the Name alone when the tag gives none the Name lacks, since players and media servers show the Name; else the two
    // joined as mediaInfo joins them, 'Name / TITLE', or else 'TITLE / Name', whichever reads exactly their roles together - a keyword can form across the
    // join ('Main Audio / Description Commentary' reads 'audio description'); else the Name, the roles only the tag gives lost (titleTagFate). Measured:
    // read as the tag, 'Director Commentary' beside 'German' was written over with 'German'; read as the Name alone, 'English' beside 'Director Commentary'
    // made the commentary the default audio.
    const trackNameBesideTitleTag = (s) => {
        const key = titleTagKey(s);
        if (!key) return '';
        let name = mediaInfoOwnTitleParts(s).join(' / ').trim();
        const forms = tagForms(s.tags[key]);
        const tag = forms[0];
        // A 'TITLE-<lang>' on a track mediaInfo shows no Name for: ffprobe's title is the Name where there is one (mediainfo.js lists no tracks once
        // mkvpropedit has moved the Tracks element after the clusters, and read as no Name the tag replaced it - measured), else a named HANDLER_NAME
        // stands in for it, else the tag is the one name (measured: beside a later HANDLER_NAME mediaInfo's Title is that handler alone, and read so an
        // mp4 conversion lost the tag's role while Expected results promised it).
        if (!name && !titleTagInNamePlace(s)) {
            const handler = handlerTextOf(getTagCI(s.tags, 'handler_name'));
            name = nameTextOf(getTagCI(s.tags, 'title')) || (isGenericHandler(handler) ? '' : handler);
            if (!name) return tag;
        }
        // The Name is the tag where the two engines only decode one text apart (printedAs): compared as Fill and nameTextOf leave each, and with the tag
        // whole, since they trim a U+FFFD at an edge that mediaInfo read as a character (a CESU-8 pair opening the Name).
        const read = [name, ...tagForms(name.replace(/[\ufffe\uffff]/g, '\ufffd'))];
        if (!name || [...forms, String(s.tags[key] ?? '').trim()].some((f) => read.some((n) => printedAs(f, n)))) return '';
        const roles = (t) => rolesNamed(t, codecTypeOf(s)).sort().join();
        const both = [...new Set([...rolesNamed(name, codecTypeOf(s)), ...rolesNamed(tag, codecTypeOf(s))])].sort().join();
        return roles(name) === both ? name : [`${name} / ${tag}`, `${tag} / ${name}`].find((t) => roles(t) === both) || name;
    };
    // What that name leaves of the TITLE SimpleTag, for the line that writes it: whether the tag's text is joined into it, and the roles only the tag gives
    // that it lacks (their dispositionTypes tags), lost with the tag's text - none where no Name sits beside such a tag.
    const titleTagFate = (s) => {
        const named = trackNameBesideTitleTag(s);
        if (!named) return { joined: false, lost: [] };
        const tag = tagForms(titleTagText(s))[0];
        const lost = rolesNamed(tag, codecTypeOf(s)).filter((k) => !rolesNamed(named, codecTypeOf(s)).includes(k));
        return { joined: named !== mediaInfoOwnTitleParts(s).join(' / ').trim(), lost: [...new Set(lost.map((k) => dispositionTypes[k].tag || k))] };
    };
    // -=-=-= titleOutsideHandler / titleBesideHandler / boxNamesNothing / mediaTitleFor  [all five] =-=-=-
    // The track's own title: the title tag (on matroska beside a TITLE SimpleTag, the track's one name: trackNameBesideTitleTag), else the Title less the
    // handler's echo, even one repeating the handler (sub_worker's duplicate fold reads it so).
    const titleOutsideHandler = (s) => {
        const ownTagTitle = nameTextOf(getTagCI(s?.tags, 'title'));
        if (ownTagTitle) return trackNameBesideTitleTag(s) || ownTagTitle;
        const raw = mediaInfoText(mediaInfoFor(s)?.Title);
        if (!getTagCI(s?.tags, 'handler_name') || !nameTextOf(raw)) return nameTextOf(edgeless(raw.split(' / ')).join(' / '));
        return mediaInfoOwnTitleParts(s).join(' / ').trim();
    };
    // The title OTHER than the handler, for the callers that need that: the name carry beside a handler it keeps, handlerOnlyDisp's default, the reconcile log,
    // sub_worker's duplicate fold, audio_clean's channel-label base. It is '' when the title IS the named handler: a title tag equal to it as much as the same
    // name in both mp4 boxes, the box holding it as escMeta writes it included - the carry writes that form beside a handler holding 'Director "Cut"
    // Commentary', and read as another title it moved into the handler and cost clean_and_remux a second pass. The handler is read through getTagCI (matroska
    // stores the key uppercase) as the name it holds (handlerTextOf).
    const titleBesideHandler = (s) => {
        const handler = getTagCI(s?.tags, 'handler_name') || '';
        const name = handlerTextOf(handler);
        const title = titleOutsideHandler(s);
        if (nameTextOf(getTagCI(s?.tags, 'title'))) return title === name && !isGenericHandler(name) ? '' : title;
        return title && name && (handlerEchoes(s, handler).includes(title) || (escMeta(name) === title && !isGenericHandler(name))) ? '' : title;
    };
    // A title box that names no track: boilerplate by a tool's own pattern, the writers' spaced '... Handler' spellings among them, or a one-word
    // '...Handler' (ffmpeg's SoundHandler; measured: 'Core Media Audio' and 'Apple Sound Media Handler' beside 'SoundHandler' each became an mkv
    // conversion's title), that gives a track of its type no role. Beside a boilerplate handler the box is the one place its role words live, so
    // 'Apple Closed Caption Media Handler' stays a subtitle's title: read as nothing, an mkv conversion dropped the SDH role Expected results promised,
    // and an extract named the sidecar with neither. A spaced name only the '... Handler' catch-all reads as boilerplate is a name there ('The Dog
    // Handler' beside Apple's 'Core Media Audio' handler).
    const boxNamesNothing = (t, type) => {
        const x = nameTextOf(t);
        return isGenericHandler(x) && !rolesNamed(x, type).length
            && !(/\s/.test(x) && !HDLR_TYPE_FOURCCS.has(x) && GENERIC_HANDLER_RES.slice(1).every((re) => !re.test(x)));
    };
    // A stream's title: ffprobe's title tag, else mediaInfo's Title outside the handler's echo (titleBesideHandler - on mp4 the udta/name box, which ffprobe
    // never surfaces), else a NAMED handler (isGenericHandler). A real title outranks the handler, so a GPAC release name in the handler never displaces
    // "Main Feature"; the handler is the title only when nothing else names the track, or when, with no title tag, the box beside it reads as boilerplate
    // (measured: 'Core Media Audio' beside 'Deutsch Kommentar' became an mkv conversion's title and the handler was wiped, its name gone). Beside a
    // boilerplate handler such a box is no name either where a tool wrote it (boxNamesNothing); a name it merely reads as stays. On matroska
    // ffmpeg keeps an mp4 handler only as a HANDLER_NAME tag (mediaInfo shows it as the Title, mkvmerge as no track name), so this makes an mp4 -> mkv
    // remux carry the name as a real title.
    const mediaTitleFor = (s) => {
        const beside = titleBesideHandler(s);
        const name = handlerTextOf(getTagCI(s?.tags, 'handler_name'));
        const named = isGenericHandler(name) ? '' : name;
        if (!beside || !isGenericHandler(beside) || nameTextOf(getTagCI(s?.tags, 'title'))) return beside || named;
        return named || (boxNamesNothing(beside, codecTypeOf(s)) ? '' : beside);
    };
    // -=-=-= MOV_HANDLER_MAX_BYTES / movHandlerGrows / cutName / movNameCut / handlerNameFor  [all five] =-=-=-
    // mov stores the handler as a Pascal string, and ffmpeg's reader compares its length byte as a plain char (mov.c mov_read_hdlr), signed on x86 and Apple
    // arm64: from 128 bytes up it reads the length byte back as part of the name (measured on jellyfin-ffmpeg 7.1.4, Mac arm64), so such a name grows by a byte
    // on every remux, and from 256 the length wraps. 127 is the bound every node shares, so a mov handler is cut there (movNameCut) and the full title goes
    // into udta/name beside it when that box takes it (titleBoxTakes). mp4, m4v and m4a write a C string, which has no such limit.
    const MOV_HANDLER_MAX_BYTES = 127;
    // A handler past that bound on a .mov output, counted as stored: a length byte (movLengthBytes) is one byte, not the three of the U+FFFD ffprobe prints.
    const movHandlerGrows = (handler, container) => {
        const h = String(handler || '');
        const lengthBytes = movLengthBytes(h);
        return String(container || '').toLowerCase() === 'mov' && lengthBytes + Buffer.byteLength(h.slice(lengthBytes), 'utf8') > MOV_HANDLER_MAX_BYTES;
    };
    // The role-keeping cut of a name `t` to `max` bytes: whole words - as much of the start as fits, then the first phrase of each role the full name gives,
    // units dropped from the middle with nothing put in their place - giving the classifiers exactly the full name's roles, never fewer and never more (short
    // of the limits at its end). A cut is the name's own characters, so an ASCII name's cut is ASCII. A cut that reads as boilerplate ('... Dog Handler') is
    // cut further back, since a name read as boilerplate is no name to move and the old handler would go on growing; a name that reads as boilerplate whole is
    // '' (the muxer's default). `size` measures every length: a name's UTF-8 bytes, or for sub_worker's sidecar title the bytes its percent-encoding spends in
    // the filename (encodeTitleCapped), so the 255-byte name cap keeps the same role words. `generic` is the test a cut must fail: isGenericHandler for a
    // handler. A sidecar title is never a handler ('... the Dog Handler' is still the track's name), so encodeTitleCapped passes its own token test, or none.
    const cutName = (t, max, size = (x) => Buffer.byteLength(x, 'utf8'), generic = isGenericHandler) => {
        const fits = (x) => size(x) <= max;
        if (fits(t) || generic(t)) return generic(t) ? '' : t;
        // An index walk, for the reason nameTextOf is one: keepRoles' candidates keep whole units of any length (measured: 526 s for one 60,000-character
        // .mov name stripped by /[...]+$/).
        const UNTRAIL_CHAR = /[\s\-–—/:,;.]/;
        const untrail = (x) => { let b = x.length; while (b > 0 && UNTRAIL_CHAR.test(x[b - 1])) b -= 1; return x.slice(0, b); };
        // The roles a name gives each classifier, read both as written and as NFC (rolesNamed folds to NFC; handlerOnlyDisp and clean_and_remux's cleared-role
        // test read the case-folded text as written). Every candidate passes reads(): it fits, it reads as a name, and it gives exactly the full name's roles -
        // or, for the plain cut the limits leave (`lose`), a subset of them, never one the name lacks. The roles are the cut's alone: the next pass reads it
        // beside the full name (roleFieldsLower: the handler and the title box are two fields), never joined to it. reads() leaves out the busy-title test and
        // the channel label: holding either would send most long names without a role to the muxer's default (measured: 5,728 busy flips and 44 channel-label
        // flips in 20,000 generated names). A cut that drops periods or a channel label matters only where the cut is the track's only name, a non-ASCII .mov
        // name, and tag_title rewrites that one keeping its roles (clean_and_remux's busyFallback takes a handler that is a title's own cut for that title).
        const rolesOf = (x) => [x, x.normalize('NFC')].map((y) => Object.keys(dispositionTypes)
            .filter((k) => k !== 'default' && matchesKeyword(y.toLowerCase(), dispositionTypes[k].keywords)));
        const full = rolesOf(t);
        const reads = (x, lose) => !!x && fits(x) && !generic(x)
            && rolesOf(x).every((r, i) => (lose ? r.every((k) => full[i].includes(k)) : r.join() === full[i].join()));
        const words = [...t.matchAll(/\S+/g)];
        // The units the cut keeps or drops, each [start, end) in t and the word it lies in: whole words, and the parts between '.', '_' and '-' of a word too
        // long to keep or named in `split`. A word with no space in it (a release name, 'Film.2020.1080p...Commentaire') is kept whole while it can be.
        const unitsOf = (split) => words.flatMap((w, k) => (fits(w[0]) && !split.has(k) ? [[w.index, w.index + w[0].length, k]]
            : [...w[0].matchAll(/[^._-]+/g)].map((p) => [w.index + p.index, w.index + p.index + p[0].length, k])));
        let cut = '';
        for (const ch of t) { if (!fits(cut + ch)) break; cut += ch; }
        const within = (spans) => spans.filter(([, b]) => b <= cut.length).length;
        const base = unitsOf(new Set());
        const plain = untrail(within(base) ? t.slice(0, base[within(base) - 1][1]) : cut);
        if (reads(plain)) return plain;
        const EDGE_PUNCT = /[^\p{L}\p{N}()[\]{}]/u;
        // The role-keeping cut over `spans`, or '' when none reads as the name does within the bytes; `held` gets the words its role phrases lie in.
        const keepRoles = (spans, held) => {
            // The text each unit is kept after: a space after a word, its own separator after a part.
            const seps = spans.map(([a], i) => (i ? t.slice(spans[i - 1][1], a) : '')).map((g) => (/\s/.test(g) ? ' ' : g));
            // Each role's first phrase, as NFC and as written: in `grouped` with the bracket group around it when the whole group fits, in `bare` alone. Both
            // forms, as a keyword stored decomposed reads only as NFC: where a precomposed copy came later, the first phrase alone read one role fewer as
            // written, every candidate failed and the plain cut lost a role ('... forc' + U+0301 + ' then ... Hard of Hearing ... Forced' lost /sdh; measured).
            const grouped = new Set(); const bare = new Set();
            for (const [r, form] of [[1, (x) => x.normalize('NFC')], [0, (x) => x]]) {
                // Each unit in this form, lowercased, and where it starts in their join, which the role keywords and the bracket pairs are found in.
                const lower = spans.map(([a, b]) => form(t.slice(a, b)).toLowerCase());
                const at = []; let joined = '';
                lower.forEach((w, i) => { joined += seps[i]; at.push(joined.length); joined += w; });
                const pairs = []; const open = [];
                for (let i = 0; i < joined.length; i += 1) {
                    const kind = '([{)]}'.indexOf(joined[i]);
                    if (kind >= 0 && kind < 3) open.push(i);
                    else if (kind >= 3 && open.length && joined[open[open.length - 1]] === '([{'[kind - 3]) pairs.push([open.pop(), i]);
                }
                const over = (a, b) => spans.map((_, i) => i).filter((i) => at[i] < b && at[i] + lower[i].length > a);
                for (const k of full[r]) {
                    const m = keywordRegex(dispositionTypes[k].keywords).exec(joined);
                    if (!m) continue;
                    const phrase = over(m.index, m.index + m[0].length);
                    const group = pairs.filter(([o, c]) => o < m.index && c >= m.index + m[0].length).reduce((g, p) => (g && g[0] > p[0] ? g : p), null);
                    const whole = group ? over(group[0], group[1] + 1) : [];
                    phrase.forEach((i) => bare.add(i));
                    (whole.length && fits(t.slice(spans[whole[0]][0], spans[whole[whole.length - 1]][1])) ? whole : phrase).forEach((i) => grouped.add(i));
                }
            }
            bare.forEach((i) => held.add(spans[i][2]));
            // The head (as much of the start as fits) and the kept units after it; a bracket at the edge of a run of kept units, or behind the punctuation that
            // ends or starts one, that nothing in the name pairs with is dropped - a separating unit (sep, below) counts as a run of its own.
            const nameOf = (keep, h, sep = -1) => {
                let name = untrail(t.slice(0, h ? spans[h - 1][1] : 0));
                const edges = new Set(); let last = h - 1;
                const end = (j) => { for (edges.add(j); j > 0 && EDGE_PUNCT.test(name[j]);) edges.add(j -= 1); };
                const start = (j) => { for (edges.add(j); j < name.length - 1 && EDGE_PUNCT.test(name[j]);) edges.add(j += 1); };
                for (const i of [...keep].filter((x) => x >= h).sort((x, y) => x - y)) {
                    const fresh = i !== last + 1 || !name || i === sep || last === sep;
                    if (fresh && last >= h) end(name.length - 1);
                    if (name) name += seps[i];
                    const from = name.length;
                    name += t.slice(spans[i][0], spans[i][1]);
                    if (fresh) start(from);
                    last = i;
                }
                if (last >= h) end(name.length - 1);
                const lone = new Set(); const stack = [];
                for (let i = 0; i < name.length; i += 1) {
                    const kind = '([{)]}'.indexOf(name[i]);
                    if (kind >= 0 && kind < 3) stack.push(i);
                    else if (kind >= 3 && stack.length && name[stack[stack.length - 1]] === '([{'[kind - 3]) stack.pop();
                    else if (kind >= 3) lone.add(i);
                }
                stack.forEach((i) => lone.add(i));
                return untrail(name.split('').filter((_, i) => !(edges.has(i) && lone.has(i))).join(''));
            };
            // As much of the start as fits first, a shorter head next. Joining two kept words across dropped ones can spell another role's keyword ('... new
            // Audio' + '(Described as the Latin American dub)' reads 'audio described', and audio_clean then deleted the dub as audio description), so when
            // every such cut does, each is tried again with one dropped unit between two kept runs (or the head and the first) kept as well, which separates
            // that junction - each distinct unit that fits, left to right.
            const keeps = grouped.size === bare.size ? [grouped] : [grouped, bare];
            for (const keep of keeps) {
                for (let h = within(spans); h >= 0; h -= 1) if (reads(nameOf(keep, h))) return nameOf(keep, h);
            }
            for (const keep of keeps) {
                for (let h = within(spans); h >= 0; h -= 1) {
                    const kept = [...keep].filter((x) => x >= h).sort((x, y) => x - y);
                    const room = max - size(nameOf(keep, h));
                    for (let j = 0; j < kept.length; j += 1) {
                        const tried = new Set();
                        for (let d = (j ? kept[j - 1] : h - 1) + 1; d < kept[j]; d += 1) {
                            const unit = t.slice(spans[d][0], spans[d][1]);
                            if (size(unit) >= room || tried.has(unit)) continue;
                            tried.add(unit);
                            const name = nameOf(new Set([...keep, d]), h, d);
                            if (reads(name)) return name;
                        }
                    }
                }
            }
            return '';
        };
        // A word that holds a role phrase but does not fit whole beside the others is cut at its '.', '_' and '-', the longest such word first, until a cut
        // reads as the name does.
        const held = new Set();
        let name = keepRoles(base, held);
        const split = new Set();
        for (const k of [...held].filter((x) => fits(words[x][0]) && /[._-]/.test(words[x][0]))
            .sort((x, y) => size(words[y][0]) - size(words[x][0]))) {
            if (name) break;
            split.add(k);
            name = keepRoles(unitsOf(split), new Set());
        }
        if (name) return name;
        // The limits, where no candidate reads as the name does: (1) the smallest pieces holding its role words (split at spaces and at '.', '_' and '-')
        // together pass `max`, or (2) every candidate that keeps them and fits reads as boilerplate or joins two kept pieces into another role's keyword. Then
        // it is the plain cut - the whole units that fit, or the first `max` bytes at a UTF-8 boundary when the first unit alone passes them - which may lose a
        // role but never gains one: cut at a UTF-8 boundary it can end on a keyword its word only starts ('...+commentaryxyz' cut after 'commentary'), so it
        // steps back a character at a time until it reads none the name lacks. (3) It is '' (the muxer's default) when that plain cut reads as boilerplate.
        let last = plain;
        while (last && !generic(last) && !reads(last, true)) last = untrail([...last].slice(0, -1).join(''));
        return reads(last, true) ? last : '';
    };
    // Each name is cut once a run: the carry asks for the same cut from its arguments, its log and its view, and the separating-unit search is linear in the
    // dropped units (a crafted 289 KB title of 20,000 of them that all spell a keyword at the junction: 0.37 s, measured on an M-series Mac).
    const movNameCuts = new Map();
    const movNameCut = (t, max) => {
        const key = `${max}\n${t}`;
        if (!movNameCuts.has(key)) movNameCuts.set(key, cutName(t, max));
        return movNameCuts.get(key);
    };
    // The handler_name an mp4-family output carries for a track titled `title`, or '' for the muxer's per-type default. Every title a plugin writes there goes
    // into the handler as well, or the next remux by any plugin drops it (HDLR_TYPE_FOURCCS) - unless the name READS as boilerplate, which the next pass would
    // erase: such a name is kept as the title alone. On .mov it is cut to MOV_HANDLER_MAX_BYTES, and audio_clean's downmix suffix (' -> 2.0') is kept whole
    // after the rest cut to the bytes left, so a downmix never shares its source's cut.
    const handlerNameFor = (title, container) => {
        const t = nameTextOf(title);
        if (String(container || '').toLowerCase() !== 'mov') return isGenericHandler(t) ? '' : t;
        const tail = Buffer.byteLength(t, 'utf8') > MOV_HANDLER_MAX_BYTES && / -> \d+(?:\.\d+)+$/.exec(t);
        const base = tail ? movNameCut(nameTextOf(t.slice(0, tail.index)), MOV_HANDLER_MAX_BYTES - Buffer.byteLength(tail[0], 'utf8')) : '';
        return base ? `${base}${tail[0]}` : movNameCut(t, MOV_HANDLER_MAX_BYTES);
    };
    // -=-=-= titleBoxTakes  [all five] =-=-=-
    // Whether a name may go into an mp4-family track's udta/name box. ffmpeg writes it as raw UTF-8 and AVFoundation (QuickTime, the Apple TV app, iOS) reads a
    // .mov one as MacRoman, so a non-ASCII name there is garbled in Apple players, not in VLC (measured). On .mov only an ASCII name goes in; a non-ASCII one
    // lives in the handler alone (handlerNameFor), which Apple does not show, unless its cut there is ASCII and goes in both. AVFoundation ignores the box on
    // .mp4.
    const titleBoxTakes = (title, container) => String(container || '').toLowerCase() !== 'mov' || /^[\x00-\x7f]*$/.test(String(title || ''));
    // -=-=-= logShown / quotedName  [all five] =-=-=-
    // A name as stored, each control byte spelled out ('\t', '\x1b'): logSafe prints a space, so 'Tab<TAB>Name' (written 'Tab Name') would look unchanged.
    const logShown = (t) => logSafe(String(t ?? '').replace(/[\x00-\x1f\x7f]/g, (c) => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r' }[c]
        || `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)));
    // A track name as a log line quotes it. escMeta rewrites a double quote, a backslash, a control character and '<io>' on the way into the command (Tdarr's
    // tokenizer cannot carry them), so a name it alters is given in the form the file will hold as well, or the line names a title the output never has.
    const quotedName = (t) => (escMeta(t) === t ? `"${logSafe(t)}"` : `"${logShown(t)}" (written as "${logSafe(escMeta(t))}")`);
    // -=-=-= titleTagLine  [all five] =-=-=-
    // The line a write of a track's one name (trackNameBesideTitleTag) as its title logs, by what that leaves of the TITLE SimpleTag (titleTagFate).
    const titleTagLine = (s) => {
        const { joined, lost } = titleTagFate(s);
        const named = quotedName(trackNameBesideTitleTag(s)); const tag = `the TITLE tag "${logShown(titleTagText(s))}"`;
        if (joined) return `☐${streamTag(s.index)} Writing ${named} as the title - the track name joined with ${tag} beside it, since ffmpeg keeps`
            + ' one title\n';
        return `☒${streamTag(s.index)} Writing the track name ${named} as the title, so ${tag} beside it is dropped`
            + `${lost.length ? ` with its ${lost.join(' and ')} role${lost.length > 1 ? 's' : ''} - no join of the two reads both their roles`
                : ' - ffmpeg keeps one title, and players show the name'}\n`;
    };
    // -=-=-= trackNamesUnreadLine  [all five] =-=-=-
    // Tdarr's mediainfo.js lists only the General track for a Matroska file whose Tracks element sits after its clusters (mkvpropedit moves it there when an
    // edit does not fit), so a Name beside a TITLE SimpleTag in its place, which only mediaInfo shows, is unseen: the track reads as the tag (measured: a
    // 'Director Commentary' Name beside TITLE 'English' read as plain English audio) and a remux writes the tag over the Name. Nothing here can recover it.
    const trackNamesUnreadLine = (streams) => {
        const tracks = file?.mediaInfo?.track || [];
        if (!tracks.length || tracks.some((t) => t['@type'] !== 'General') || !streams.some((x) => titleTagInNamePlace(x) && titleTagKey(x) !== 'title')) {
            return '';
        }
        return '☒mediaInfo lists no tracks in this Matroska file (its Tracks element sits after the clusters), so a track name beside a TITLE tag cannot be'
            + ' read and a remux writes the tag over it - a plain mkvmerge remux moves the Tracks element back to the front\n';
    };
    // -=-=-= handlerFor / mp4NameCarry  [all five] =-=-=-
    // The handler a write of `title` leaves on s (null: s's own, untouched), shared with sub_worker's duplicate fold. A handler is left as it is when it
    // carries a role word the title lacks: clean_and_remux promotes such a role to a flag before it replaces the handler, and no other plugin can - except a
    // .mov handler over 127 bytes, which no remux keeps (movHandlerGrows; measured: its growing echo named a new sidecar on every sub_worker pass), so it is
    // cut like any long mov name, its roles kept (handlerNameFor), and written as the muxer's default when no cut of it reads as a name.
    const handlerFor = (s, title, container) => {
        const handler = getTagCI(s?.tags, 'handler_name');
        const want = handlerNameFor(title, container);
        const type = codecTypeOf(s);
        const grows = movHandlerGrows(handler, container);
        if ((want || !grows) && rolesNamed(handlerTextOf(handler), type).every((k) => rolesNamed(want, type).includes(k))) return want;
        return grows ? handlerNameFor(handlerTextOf(handler), container) : null;
    };
    // A remux of an mp4-family file keeps each track's handler and drops its udta/name title - which VLC, QuickTime on mov and mediaInfo read, and which can
    // hold the track's only role word. So a plugin that remuxes one for its own reasons restates each named track's title (mediaTitleFor) on that remux, and
    // moves it into the handler unless the handler already says it (handlerFor; with no title, a growing .mov handler gets the default); it never remuxes for
    // this alone.
    const mp4NameCarry = (s, typeLetter, idx, container) => {
        // On a matroska output, a track named beside a TITLE SimpleTag in its place (trackNameBesideTitleTag, titleTagInNamePlace): ffmpeg reads the tag in
        // the Name's place and writes it as the Name on every remux, and keeps no TITLE tag beside a Name - so the track's one name is restated, and
        // titleTagLine says what it leaves of the tag. A 'TITLE-<lang>' beside the Name rides the remux as it is.
        const named = isMatroskaFamily(container) && titleTagInNamePlace(s) ? trackNameBesideTitleTag(s) : '';
        if (named) {
            return { s, title: named, move: null, said: escMeta(named), fate: 'tag', why: '', cut: false,
                args: ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(named)}"` };
        }
        if (!isMp4Family(container)) return null;
        // A title box that reads as boilerplate names no track (mediaTitleFor), but the remux drops it, so it is restated as it is.
        const title = mediaTitleFor(s) || titleBesideHandler(s);
        const handler = String(getTagCI(s.tags, 'handler_name') || '');
        const grows = movHandlerGrows(handler, container);
        const next = title ? handlerFor(s, title, container) : (grows ? '' : null);
        // A handler already holding the name as escMeta writes it is left alone: rewritten, it changed no byte and claimed a move (measured).
        const move = next === null || next === handler || (next && escMeta(next) === handler) || (!next && !grows) ? null : next;   // '' is the muxer's default
        const beside = move === null && !!titleBesideHandler(s);
        // The name goes into the title box as well, in escMeta's form (a double quote, a backslash, a control character and '<io>' rewritten): whole wherever
        // the box takes it, else the .mov cut where the box takes that (titleBoxTakes). So no pass that moves a name leaves the box without it (measured:
        // 'Descriptive<TAB>Audio' moved into the handler left both Apple boxes empty until the next remux), a name the handler already holds keeps the box it
        // had (measured: 'Director "Cut" Commentary' in both boxes lost it to every carrier's remux), and a long ASCII .mov name stays whole there beside its
        // cut (measured: with a tab in it the box got the cut). A name stays out of the box only where titleBoxTakes refuses every form: a non-ASCII .mov name
        // whose cut is not ASCII. ffmpeg never reads a title box back, so mediaInfo's Title is a title-box name's only reading, and a line break in it comes
        // back as ' / ' (mediaInfoFill): the carry restates 'Audio / Description' for a stored 'Audio<LF>Description', a stated residual. A handler's line
        // break, which ffprobe shows, is written as escMeta writes it, a space.
        const said = [title, move].map((x) => escMeta(x || '')).find((x) => x && titleBoxTakes(x, container)) || '';
        // Beside a handler the carry keeps, the title box is a name's only place (fate): one escMeta alters is restated in escMeta's form, and one the .mov box
        // refuses is lost - each logged with the reason the handler stays (why: a role the name does not give, a name that reads as boilerplate, or a handler
        // that already holds it), and read back as the next pass reads it (mp4NameCarryView, track title carry; measured: 'Descriptive<TAB>Audio' beside a
        // 'Commentary' handler was dropped by every carrier's remux, and Expected results still promised its /description).
        const fate = beside && said !== title ? (said ? 'restated' : 'lost') : '';
        const why = next === null ? 'role' : (next ? 'held' : 'boilerplate');   // why a handler the carry keeps stays
        if (!said && move === null && !fate) return null;
        const args = (said ? ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(said)}"` : '')
            + (move === null ? '' : ` -metadata:s:${typeLetter}:${idx} "handler_name=${escMeta(move)}"`);
        return { s, title, move, said, fate, why, cut: !!move && move !== title, args };
    };
    // ===== END SHARED: track title =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: track title carry =====
    // -=-=-= readBackFieldsOf  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // roleFieldsLower's fields for s as the next pass reads them once a remux leaves `handler` in its handler and `title` ('' for none) as its title: a
    // stand-in's readBackRoleFields, built by the same roleFieldsOf, so its Expected results line and the next pass's Input agree. On an mp4-family output
    // ffprobe shows the handler and mediaInfo the title box after the handler's echo, which roleFieldsLower leaves out, so the box is one field of its own,
    // read whole (a ' / ' or line break in it is the name's); on matroska the title is ffprobe's own field. s's two descriptions are kept.
    const readBackFieldsOf = (s, handler, title, container) => roleFieldsOf([nameTextOf(handler), title, getTagCI(s?.tags, 'description'),
        mediaInfoText(getTagCI(mediaInfoFor(s)?.extra, 'description'))]);
    // -=-=-= mp4NameCarries / mp4NameCarryArgs / keptWhy / mp4NameCarryLog / mp4NameCarryView  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The name carry (mp4NameCarry) over a whole output, for a plugin that remuxes for its own reasons (clean_and_remux runs it per stream). `kept` is the
    // output in order (the list mp4TimecodeArgs reads), and `skip` holds the source indices whose title this run writes itself, so no stream gets two.
    const mp4NameCarries = (container, kept, skip) => {
        const n = { v: 0, a: 0, s: 0 };
        return kept.map((s) => {
            const t = { video: 'v', audio: 'a', subtitle: 's' }[codecTypeOf(s)];
            if (!t) return null;
            const idx = n[t]++;
            return skip.has(s.index) ? null : mp4NameCarry(s, t, idx, container);
        }).filter(Boolean);
    };
    const mp4NameCarryArgs = (container, kept, skip = new Set()) => mp4NameCarries(container, kept, skip).map((c) => c.args).join('');
    // Why the handler beside a name the carry restates or drops stays (mp4NameCarry's why), as the line about that name says it.
    const keptWhy = (c) => {
        const h = handlerTextOf(getTagCI(c.s.tags, 'handler_name'));
        const why = { role: 'for a role the name does not give', boilerplate: '- a name that reads as boilerplate is not moved into it' }[c.why];
        const name = [nameTextOf(c.title), escMeta(nameTextOf(c.title))].includes(h);
        return `keeps ${quotedName(h)} ${why || `- it already holds ${name ? 'the name' : 'its cut'}`}`;
    };
    const mp4NameCarryLog = (container, kept, skip = new Set()) => mp4NameCarries(container, kept, skip).filter((c) => c.move !== null || c.fate)
        .map((c) => (c.fate === 'tag' ? titleTagLine(c.s)
            : c.fate ? `${c.fate === 'lost' ? '☒' : '☐'}${streamTag(c.s.index)} ${c.fate === 'lost' ? 'Dropping' : 'Writing'} the track name `
            + `${c.fate === 'lost' ? `"${logShown(c.title)}" - mov takes a non-ASCII name only in the handler` : `${quotedName(c.title)} into the title box`}`
            + `, and the handler ${keptWhy(c)}\n`
            : c.move ? `☐${streamTag(c.s.index)} Writing the track name ${quotedName(c.move)} into handler_name`
            + `${c.cut ? ' (cut to the 127 bytes mov holds)' : ''} - the only place an mp4 or mov remux keeps it\n`
            : `☐${streamTag(c.s.index)} Writing the muxer's default into handler_name - mov keeps no handler over 127 bytes, and no cut of this one reads`
            + ' as a track name\n')).join('');
    // Each carried stream as the next pass reads it back, for the carrier's Expected results line (fields by readBackFieldsOf): a moved track as the handler it
    // gets and the title restated beside it, if any (a name with no title box beside it as the form the handler holds - escMeta's, or a mov name's 127-byte
    // cut, which keeps its role words); a kept handler beside a title box the carry rewrites (fate) as that handler and the escMeta form restated, or the
    // handler alone where the name is lost; an untouched handler beside a title restated as it is, as it was. Its title is the box's name, else the handler's -
    // none for a kept handler that reads as boilerplate, which names nothing (measured: a lost non-ASCII .mov name beside 'SubtitleHandler' spelled the sidecar
    // 'g.s2.SubtitleHandler.eng.srt'); a matroska track beside a TITLE SimpleTag as its one name (trackNameBesideTitleTag). Keyed by source index, so it
    // still finds a stream readBackDispositions has copied.
    const mp4NameCarryView = (container, kept, skip = new Set()) => {
        const moved = new Map(mp4NameCarries(container, kept, skip).filter((c) => c.move !== null || c.fate).map((c) => [c.s.index, c]));
        return (s) => {
            const c = moved.get(s.index);
            if (!c) return s;
            const handler = c.move === null ? String(getTagCI(s.tags, 'handler_name') || '') : escMeta(c.move);
            const name = c.move === null ? handlerTextOf(handler) : handler;
            return { ...s, tags: { ...(s.tags || {}), title: c.said || (isGenericHandler(name) ? '' : name), handler_name: handler },
                readBackRoleFields: readBackFieldsOf(s, name, c.said, container) };
        };
    };
    // ===== END SHARED: track title carry =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mov language table =====
    // -=-=-= MOV_LANG  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // mov is the exception to writing a language into the output container (mp4 stores only lowercase 3-letter /T, mkv keeps the raw spelling). The QuickTime
    // muxer does not store the letters: mov_write_mdhd_tag looks the code up in ffmpeg's legacy Macintosh language table and writes 0x7fff ("unspecified") on
    // a miss, which the demuxer then excludes - so the track reads back with NO language at all, exit 0 and no warning from either side. That table predates
    // ISO 639-2/T and spells 15 of the 20 dual-spelling languages the /B way, so their /T spelling is precisely the one mov throws away (measured on
    // jellyfin-ffmpeg 7.1.4: nld/deu/zho land 0x7fff, dut/ger/chi land a real code; 106 of the 184 codes to6392T can emit are dropped). It spells four of
    // the others the /T way, so their /B spellings map back (fre -> fra, cze -> ces, rum -> ron, slo -> slk), and Maori has no row, as the table holds
    // it under no code. Each such row maps a spelling the muxer drops to the one it stores for the same language. Anyone extending this must re-measure
    // against the muxer: the table is a MIXTURE of /T and /B, so the ISO 639-2/B list is not a safe source. mp4/m4v/m4a pack the letters directly and keep
    // either spelling, which is why this is mov-only. Null-prototype so a container tag spelling an Object.prototype member ('constructor', '__proto__')
    // misses the table instead of resolving an inherited function.
    const MOV_LANG = Object.assign(Object.create(null), { sqi: 'alb', hye: 'arm', eus: 'baq', bod: 'tib', mya: 'bur', zho: 'chi', nld: 'dut', kat: 'geo',
        deu: 'ger', ell: 'gre', isl: 'ice', mkd: 'mac', msa: 'may', fas: 'per', cym: 'wel', fre: 'fra', cze: 'ces', rum: 'ron', slo: 'slk',
        // Rows of another kind: the table holds Norwegian only as the macrolanguage nor, not its two written forms, so Bokmål and Nynorsk (nob and nno,
        // which land 0x7fff) are written as nor - the language kept, the written form lost, and a .mov holds the two as one language. Every other
        // language the muxer drops still reads back with none: the table holds Swedish and Irish only as Mac codes ffmpeg spells sve and iri, which no
        // plugin reads as a language.
        nob: 'nor', nno: 'nor' });
    // -=-=-= movLangRespellArgs (+ movLangRespelled, movLangRespellLog, movLangReadBack)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The language writes a remux into .mov owes the tracks it copies or re-encodes: a .mov another tool wrote can hold a spelling the table lacks
    // (AVFoundation stores deu and nld), which the copy would lose, so each such language goes back in MOV_LANG's spelling and nothing else is touched (a
    // census of 400 spellings on jellyfin-ffmpeg 7.1.4: the muxer drops every key and stores every value). Matched by the language itself - the output stream
    // specifier m:language:<code> - so no output index is needed; a track whose language a run writes itself gets the same spelling (movLangCode).
    const movLangRespelled = (container, streams) => (container !== 'mov' ? [] : [...new Set(streams.map((s) => getTagCI(s?.tags, 'language')))]
        .filter((l) => MOV_LANG[l]));
    const movLangRespellArgs = (container, streams) => movLangRespelled(container, streams)
        .map((l) => ` -metadata:s:m:language:${l} language=${MOV_LANG[l]}`).join('');
    // One line per language the args respell among `streams`, the ones the output holds, so a language change the next pass reads is said; Bokmål and
    // Nynorsk (nob, nno) say that they merge.
    const movLangRespellLog = (container, streams) => movLangRespelled(container, streams).map((l) => `☐Writing ${l} as ${MOV_LANG[l]} - a .mov stores no`
        + ` ${l}${MOV_LANG[l] === 'nor' ? ', so Bokmål and Nynorsk both become Norwegian and can no longer be told apart' : ''}\n`).join('');
    // Stream s as the next pass reads its language after a .mov write, for an Expected results line.
    const movLangReadBack = (container, s) => {
        const l = getTagCI(s?.tags, 'language');
        return container === 'mov' && MOV_LANG[l] ? { ...s, tags: { ...(s.tags || {}), language: MOV_LANG[l] } } : s;
    };
    // ===== END SHARED: mov language table =====

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
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: dolby vision record =====
    // -=-=-= doviRecord [all five] =-=-=-
    // The stream's Dolby Vision configuration record as ffprobe reports it, or undefined.
    const doviRecord = (s) => (Array.isArray(s?.side_data_list) ? s.side_data_list : [])
        .find((sd) => /dovi configuration record/i.test(String(sd?.side_data_type || '')));
    // -=-=-= dvRecordSurvivesCopy [all five] =-=-=-
    // Whether a -c copy keeps the stream's Dolby Vision record (true with none), the fourcc aside: jellyfin's muxers check the base layer's pixel format and
    // colour against the compat id (its ff_isom_validate_dovi_config) and drop a record that fails under ANY fourcc, mkv to mkv included, so any remux costs
    // such a stream its Dolby Vision. Matched the copy on all 17 measured sources (P5, P7, P8.1, P8.2, P8.4, P20 from Dolby, ffmpeg, mkvmerge, MP4Box and an
    // iPhone-style mov). Compat 0's fourcc condition is dvNeedsDvFourcc's (below). Read by clean_and_remux's convert gate, hevcCopyPlan's Matroska arm and
    // dvCopyDropsRecord (below).
    const dvRecordSurvivesCopy = (s) => {
        const id = String(doviRecord(s)?.dv_bl_signal_compatibility_id ?? '');
        const p10 = s.pix_fmt === 'yuv420p10le';
        const hdr = (trc) => p10 && s.color_transfer === trc && s.color_primaries === 'bt2020' && s.color_space === 'bt2020nc' && s.color_range === 'tv';
        return id === '0' ? p10 : id === '1' || id === '6' ? hdr('smpte2084') : id === '2' ? s.pix_fmt === 'yuv420p' : id === '4' ? hdr('arib-std-b67') : true;
    };
    // -=-=-= dvNeedsDvFourcc [all five] =-=-=-
    // A record naming no compatible base (compatibility id 0: Profile 5). jellyfin's muxers write a compat-0 record's box only under a dvh1/dvhe fourcc or no
    // tag at all (its ff_isom_validate_dovi_config), so under hev1 or hvc1 the stream silently becomes plain HEVC whose IPT colour every player shows wrong.
    // Every other compat id is checked against the stream's colour instead, under any fourcc.
    const dvNeedsDvFourcc = (s) => String(doviRecord(s)?.dv_bl_signal_compatibility_id) === '0';
    // -=-=-= movLosesDvBox (+ dvLostReadBack, movDvReadBack) [all five] =-=-=-
    // Whether a write into `container` takes this video stream's Dolby Vision box away. The mov muxer (MODE_MOV) writes no dvcC/dvvC box under any fourcc
    // (0 of 96 readable .mov outputs, jellyfin 7.1.4), so -strict unofficial does not help: an iPhone Profile 8.4 .mov remuxed into .mov reads back as
    // plain HLG HEVC. `-f mp4` is no escape, as the mp4 muxer refuses that file's mebx tracks. clean_and_remux writes only mkv or mp4, so the box survives
    // when it runs first. A fourcc-only signal (a dvhe .mov) counts too: its record is gone either way. Cover art is never the subject.
    // awk-ffmpeg-test's dvbox:p5-fourcc row measures it (its mov-annexb-hvc1 cell): that cell turning present means .mov can carry the box and this is stale.
    const movLosesDvBox = (container, s) => container === 'mov' && codecTypeOf(s) === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s));
    // Stream s as the next pass reads it once a write has dropped its Dolby Vision record, for an Expected results token: the record gone and mediaInfo
    // detached (index -1, summariseStream joins by index), its transfer kept so the hdr token stands. Where mediaInfo's HDR_Format names a static layer
    // beside the Dolby Vision and the transfer names no HDR curve (none, or a loose bt2020-10), that layer is what the next pass reads ('Dolby Vision /
    // SMPTE ST 2086' reads back 'SMPTE ST 2086', hdr), so smpte2084 stands in for it; an HDR10+ layer there reads back hdr10+ but is predicted hdr.
    const dvLostReadBack = (s) => {
        const others = String(mediaInfoFor(s)?.HDR_Format || '').split('/').filter((p) => p.trim() !== '' && !/dolby vision/i.test(p));
        const trc = videoTransferOf(s);
        return { ...s, side_data_list: [], color_transfer: others.length && !HDR_TRANSFERS.includes(trc) ? 'smpte2084' : trc, index: -1 };
    };
    // The same once a .mov write has taken the box. An untagged copy writes a dvh1 stream as hev1 and keeps dvhe, which still reads dv (both measured on
    // jellyfin 7.1.4).
    const movDvReadBack = (container, s) => (movLosesDvBox(container, s) ? { ...dvLostReadBack(s),
        codec_tag_string: String(s.codec_tag_string || '').toLowerCase().trim() === 'dvh1' ? 'hev1' : s.codec_tag_string } : s);
    // -=-=-= dvCopyFourcc [all five] =-=-=-
    // The fourcc an mp4/m4v -c copy must give a video to keep its Profile 5 record, or '' where its own serves or none can. The muxer carries the source fourcc
    // through a copy, and under hev1/hvc1 the record is lost (dvNeedsDvFourcc), so each takes the Dolby Vision fourcc that reads its hvcC the same way: hev1
    // (parameter sets in-band) dvhe, hvc1 dvh1. Both kept the record and decoded on jellyfin 7.1.4, a real Profile 5 copied each way. AV1 under av01 has none:
    // dav1 keeps the record, but production ffprobe then reads the stream as codec_name=unknown (awk-ffmpeg-test's dvbox:av1-p10-fourcc row re-measures it; its
    // dav1 cell reading av1 means AV1 has a Dolby Vision fourcc too). Nothing in .mov (movLosesDvBox).
    const dvCopyFourcc = (container, s) => {
        if (!['mp4', 'm4v'].includes(container) || !dvNeedsDvFourcc(s)) return '';
        const tag = String(s.codec_tag_string || '').toLowerCase().trim();
        return tag === 'hev1' ? 'dvhe' : tag === 'hvc1' ? 'dvh1' : '';
    };
    // -=-=-= dvCopyDropsRecord (+ dvCopyReadBack, dvCopyLossLine) [all five] =-=-=-
    // Whether a -c copy into `container` loses the stream's Dolby Vision record: one no copy keeps (dvRecordSurvivesCopy), or in the mp4 family a compat-0
    // record under a fourcc that is neither Dolby Vision's nor one dvCopyFourcc gives it - AV1 under av01, or hev1/hvc1 in a .mov.
    const dvCopyDropsRecord = (container, s) => !dvRecordSurvivesCopy(s) || (isMp4Family(container) && dvNeedsDvFourcc(s) && !dvCopyFourcc(container, s)
        && !DV_FOURCC_RE.test(String(s.codec_tag_string || '').toLowerCase().trim()));
    // Stream s as the next pass reads it after a -c copy into `container`, for every Expected results line of a copy: without a record the copy loses, and
    // without the box a .mov write takes.
    const dvCopyReadBack = (container, s) => movDvReadBack(container, dvCopyDropsRecord(container, s) ? dvLostReadBack(s) : s);
    // One warning per video a -c copy into `container` takes the record from, worded as the write-back plugins' movDvLossLine, which says a .mov
    // write's own loss. A stream under a Dolby Vision fourcc keeps it through the copy and still reads as Dolby Vision (only a colour mismatch costs such
    // a stream its record), so its line says the record is dropped rather than the Dolby Vision lost.
    const dvCopyLossLine = (container, streams, act = 'remux') => streams.filter((s) => codecTypeOf(s) === 'video' && !isCoverArt(s)
        && dvCopyDropsRecord(container, s) && !movLosesDvBox(container, s))
        .map((s) => {
            const tag = String(s.codec_tag_string || '').toLowerCase().trim();
            if (DV_FOURCC_RE.test(tag)) {
                return `☒${streamTag(s.index)} The Dolby Vision record is dropped in this ${act} - it does not match the video's colour, so no ffmpeg copy`
                    + ` keeps it; the ${tag} fourcc stays, so the file still reads as Dolby Vision\n`;
            }
            return `☒${streamTag(s.index)} Dolby Vision is lost in this ${act} - ${dvRecordSurvivesCopy(s) ? 'no fourcc this copy can give the video keeps'
                + ' its record' : 'its record does not match the video\'s colour, so no ffmpeg copy keeps it'}\n`;
        }).join('');
    // ===== END SHARED: dolby vision record =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4 strict compliance arg =====
    // -=-=-= mp4StrictArg [all five] =-=-=-
    // The ' -strict <level>' an mp4/mov -c copy needs, or '' when it needs none. Three independent reasons share one flag, because `experimental` is a strict
    // SUPERSET of `unofficial` and does every job:
    //   experimental - a TrueHD stream copied INTO mp4, which the muxer otherwise refuses outright (rc 88); `unofficial` does NOT satisfy it. Matched on
    //                  the raw codec_name, not resolveCodecName, whose refined truehdatmos would not equal 'truehd'.
    //   unofficial   - a Dolby Vision video stream, so the mov muxer keeps its dvcC/dvvC boxes; a plain copy drops them, demoting DV to plain HEVC/AV1
    //                  (verified on real HEVC + AV1 DV samples). Cover art is excluded so a leading cover-art stream cannot mask a real DV stream.
    //                  Or an mp3 below 16 kHz, which the mp4 muxer refuses without it ('not standard', exit 234 at 8, 11.025 and 12 kHz; .mov takes
    //                  one either way; measured on jellyfin 7.1.4).
    // Pass the RAW file.ffProbeData.streams as `streams`: the DV signals (codec_tag_string / side_data_list) live only there. `copied` is the subset this
    // run emits as -c copy (defaults to all) - a caller that drops or re-encodes tracks passes its own survivor list, so a TrueHD track on its way out
    // never pulls in a flag the output does not need. Never decide this by regex over the half-built argument string: it carries container-supplied
    // -metadata title values verbatim, so a track titled " -strict foo" reads as already-emitted and the remux silently drops a DV file's boxes.
    const mp4StrictArg = (container, streams, copied) => {
        if (!isMp4Family(container)) return '';
        const list = Array.isArray(streams) ? streams : [];
        const kept = Array.isArray(copied) ? copied : list;
        if (kept.some((s) => codecTypeOf(s) === 'audio' && codecNameOf(s) === 'truehd')) return ' -strict experimental';
        const lowRateMp3 = kept.some((s) => codecTypeOf(s) === 'audio' && codecNameOf(s) === 'mp3' && (Number(s.sample_rate) || 16000) < 16000);
        return lowRateMp3 || list.some((s) => codecTypeOf(s) === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s)))
            ? ' -strict unofficial' : '';
    };
    // ===== END SHARED: mp4 strict compliance arg =====
    // ===== SHARED [clean_and_remux, video_clean]: hevc copy fourcc =====
    // -=-=-= isQtVideoContainer  [clean_and_remux, video_clean] =-=-=-
    // QuickTime VIDEO containers - the gate for every QuickTime fourCC emit (hvc1/dvh1/av01/avc1), on both the encode and the copy path; the two
    // non-QuickTime fourCCs (video_clean's avi RIFF retag, hevcCopyPlan's Matroska dvhe) key on their own container tests. Deliberately mp4/m4v/mov WITHOUT
    // m4a: isMp4Family includes m4a and is right for the -movflags use_metadata_tags decision, but not for tagging a video stream.
    const isQtVideoContainer = (container) => ['mp4', 'm4v', 'mov'].includes(container);
    // -=-=-= HVCC_HEADER_BYTES  [clean_and_remux, video_clean] =-=-=-
    // An hvcC is 23 fixed bytes plus one array per parameter-set type, so only an extradata_size above 23 holds the VPS/SPS/PPS; at 23 they ride in-band,
    // in the samples (Dolby's own P5 and P8.1 mp4s, every mkv made from them, GPAC's xps_inband). ffprobe prints the size whenever there is extradata, and
    // Tdarr 3.04's scan removes only the `extradata` hex (tdarr_core remove_ffprobe_extradata), so the size reaches a plugin.
    const HVCC_HEADER_BYTES = 23;
    // -=-=-= firstKeyParamSets  [clean_and_remux, video_clean] =-=-=-
    // Whether the first KEYFRAME of an HEVC stream carries VPS, SPS and PPS: true / false / null (not read). It is the packet the mov muxer builds an hvcC
    // from once hevc_mp4toannexb has emptied the extradata - a -c copy drops every packet before the first keyframe, and this read is a -c copy too, so it
    // sees that same packet. One packet as Annex B on stdout: 19-84 ms on the samples, the 4K Dolby Vision ones included.
    const HEVC_PS_NAL_TYPES = [32, 33, 34];
    const FIRST_KEY_TIMEOUT_MS = 60000;
    const FIRST_KEY_MAX_BYTES = 64 * 1024 * 1024;
    const firstKeyParamSets = (ffmpegPath, filePath, absIndex) => {
        try {
            const r = require('child_process').spawnSync(ffmpegPath, ['-hide_banner', '-v', 'error', '-i', filePath, '-map', `0:${absIndex}`, '-c', 'copy',
                '-frames:v', '1', '-f', 'hevc', '-'], { timeout: FIRST_KEY_TIMEOUT_MS, maxBuffer: FIRST_KEY_MAX_BYTES, killSignal: 'SIGKILL' });
            if (!r || r.error || r.status !== 0 || !Buffer.isBuffer(r.stdout) || !r.stdout.length) return null;
            const b = r.stdout;
            const seen = new Set();
            for (let i = 0; i + 3 < b.length; i += 1) {
                if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) { seen.add((b[i + 3] >> 1) & 0x3f); i += 2; }
            }
            return HEVC_PS_NAL_TYPES.every((t) => seen.has(t));
        } catch (e) { return null; }
    };
    // -=-=-= hevcCopyPlan  [clean_and_remux, video_clean] =-=-=-
    // The one fourcc plan for an HEVC stream COPIED into another file: clean_and_remux's remux and video_clean's shrink restore both apply it, so neither
    // re-triggers the other. `tag` is the fourcc the copy carries - the source's own from the mp4 demuxer, '' from any other (ffprobe reports Matroska's as
    // [0][0][0][0]). Returns { state: ok|retag|rebuild|stuck, want, have, keep, ps, args }, args on output video ordinal `ord`.
    const hevcCopyPlan = (s, tag, ord, ffmpegPath, filePath, container) => {
        const have = String(tag || '').toLowerCase().trim();
        // Matroska stores no fourcc but checks the one a copy carries: it refuses dvh1 (exit 183), and keeps a compat-0 record only under a Dolby Vision tag
        // (hev1 and hvc1 drop it). dvhe passes both, measured on P5 and P8.1 mp4s. A record above profile 10 (P20), which Matroska stores under no tag, or one
        // no copy keeps (dvRecordSurvivesCopy) takes no tag: a hev1/hvc1 goes in as it comes, its record lost under any tag, and a dvh1 cannot go in at all, so
        // clean_and_remux stops such a file with the reason before any remux and it keeps its Dolby Vision (video_clean's restore never meets one: only that
        // refused conversion could have made its Matroska working file). Any other container takes the copy as it comes.
        if (!isQtVideoContainer(container)) {
            const dvhe = isMatroskaFamily(container) && !(Number(doviRecord(s)?.dv_profile) > 10) && dvRecordSurvivesCopy(s)
                && (have === 'dvh1' || (['hev1', 'hvc1'].includes(have) && dvNeedsDvFourcc(s)));
            return { state: dvhe ? 'retag' : 'ok', want: 'dvhe', have, args: dvhe ? ` -tag:v:${ord} dvhe` : '' };
        }
        // Apple's AVFoundation decodes HEVC only as hvc1 or dvh1 over an hvcC holding the parameter sets (hev1 and dvhe failed on every sample, a complete
        // hvcC included). The fourcc is dvh1 for dvNeedsDvFourcc, else hvc1, and a dvh1 stream with a complete hvcC keeps it: Apple decodes dvh1 with or
        // without its box, and video_clean's encode writes it. .mov always takes hvc1: its muxer refuses dvh1 (exit 183) and writes no Dolby Vision box under
        // any fourcc, and a dvh1 copied in untagged comes out hev1.
        const want = container !== 'mov' && dvNeedsDvFourcc(s) ? 'dvh1' : 'hvc1';
        const tagOk = have === want || (have === 'dvh1' && container !== 'mov');
        // With no size, a stream already under an accepted tag counts as complete - hvc1 over an hvcC without parameter sets cannot be read at all - and any
        // other is read first: a rebuild of a complete hvcC only adds them to its keyframes, and the next pass finds the tag and stops.
        const size = Number(s?.extradata_size);
        if (size > HVCC_HEADER_BYTES || (!(size > 0) && tagOk)) {
            return { state: tagOk ? 'ok' : 'retag', want, have, args: tagOk ? '' : ` -tag:v:${ord} ${want}` };
        }
        // The filter empties a 23-byte hvcC, so the muxer builds a complete one from the first keyframe and every packet comes out byte-identical. The tag
        // alone exits 0 but writes an EMPTY hvcC - movenc demands every parameter-set array under hvc1 and ignores its own failure - so nothing can open it.
        const ps = firstKeyParamSets(ffmpegPath, filePath, s.index);
        if (ps === true) return { state: 'rebuild', want, have, ps, args: ` -bsf:v:${ord} hevc_mp4toannexb -tag:v:${ord} ${want}` };
        // Stuck: no -c copy gives it an hvcC Apple decodes (or the read failed, and a later pass reads again), so it keeps a fourcc that stays readable - its
        // own, or dvhe for a compat-0 stream arriving without a Dolby Vision fourcc, the one that keeps its box.
        const dvhe = want === 'dvh1' && !DV_FOURCC_RE.test(have);
        return { state: 'stuck', want, have, ps, keep: dvhe ? 'dvhe' : have || 'hev1', args: dvhe ? ` -tag:v:${ord} dvhe` : '' };
    };
    // ===== END SHARED: hevc copy fourcc =====
    // #endregion

    const os = require('os');
    const fs = require('fs');
    const childProcess = require('child_process');
    // The harness's synthetic-node capabilities (encoder sets, GPU tonemap backends, the idet verdict, caption presence, memory), injected through
    // otherArguments.__awkCap. Wherever it is present NOTHING spawns: a missing key reads as no answer, never as a reason to probe the real node.
    const injectedCap = otherArguments && otherArguments.__awkCap;

    // #region SHARED helpers (3 sections: ffmpeg path … preset path safety)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg path =====
    // -=-=-= ffmpegPathOf [all five] =-=-=-
    // The node's ffmpeg: Tdarr hands a classic plugin otherArguments.ffmpegPath, and the bare name - a PATH lookup - stands in when it supplied none. Every
    // ffmpeg spawn in the five plugins resolves the binary here, so a change to how it is found reaches all of them at once.
    const ffmpegPathOf = (otherArgs) => String(otherArgs?.ffmpegPath || 'ffmpeg');
    // ===== END SHARED: ffmpeg path =====

    // ===== SHARED [clean_and_remux, stream_ordering, video_clean]: recovered marker vocabulary =====
    // -=-=-= RECOVERED_TAG  [clean_and_remux, stream_ordering, video_clean] =-=-=-
    // The format-level tag clean_and_remux stamps on every recover_bad_* remux, and a cross-plugin marker whose spelling is executable code in three files
    // (awk_cc has its own shared section; awk_video, awk_vq, awk_loudnorm and awk_sub_worker are each single-plugin). clean_and_remux reads it back to stay
    // idempotent; stream_ordering reads it to soften BOTH truncation verdicts from a failFile quarantine to a warning that accepts the file for review,
    // because a recover_bad_* repair of a truncated source legitimately reports a shorter or absent duration - so a reader that stopped matching would
    // quarantine every salvaged file in a loop the user cannot break (fixed tolerance, no relaxing input); video_clean reads it to keep a job whose recovery
    // repaired the video out of guard_shrink_savings' size verdict, whose restore would bring the unrepaired original back. SHARED because a writer and a
    // reader whose vocabularies drift fail SILENTLY. Only the KEY needs guarding - every read is getTagCI (case-insensitive) and tests only non-emptiness
    // and equality with the library original's value, so no VALUE format can drift. Interpolate it into the log lines that NAME the tag too, or a rename
    // here leaves user-facing text pointing at a key nothing writes any more.
    const RECOVERED_TAG = 'awk_recovered';
    // ===== END SHARED: recovered marker vocabulary =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: preset path safety =====
    // -=-=-= pathIsPresetSafe [all five] =-=-=-
    // True when a real on-disk path can be embedded in a preset's quoted "${path}" token. Tdarr never shells out, but its worker tokenises each preset half
    // with a quote-aware parser before spawning ffmpeg, so a " anywhere in the path closes the wrapper mid-token and everything after it becomes fresh argv
    // entries (a raw control character breaks the token just as badly). The literal <io> is refused for a second reason: it is the preset's own input/output
    // split marker, and Tdarr reads only the first two parts, so a path carrying one silently DELETES every argument after it. The name parts WE generate are
    // sanitised at their source, but a library or work-directory path has to stay literal - it can only be checked, never rewritten - so a caller that fails
    // this test refuses that one output (a sidecar, a cover's staged copy for -attach, or video_clean's restore from the library original) with a ☒ line rather
    // than emit the token.
    const pathIsPresetSafe = (p) => !/["\x00-\x1f\x7f]/.test(String(p)) && !/<io>/i.test(String(p));
    // ===== END SHARED: preset path safety =====
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
    // Arc / RTX-40xx).

    // Per-node subprocess probe timeouts (ms). The -encoders capability listing is a static parse and nvidia-smi a quick presence poll, so both are short;
    // each confirm probe actually spawns ffmpeg to encode/tonemap one synthetic frame, so it gets the longest budget.
    const ENCODERS_PROBE_TIMEOUT_MS = 20000;
    const NVIDIA_SMI_TIMEOUT_MS = 8000;
    const CONFIRM_PROBE_TIMEOUT_MS = 25000;

    // Priority order of hardware families to try per OS (best/most-common first); CPU is the fallback behind them, except under node_strict on a GPU worker.
    // Mac is videotoolbox-only by design: on macOS ALL hardware encoding (Apple Silicon media engine, Intel Quick Sync, an AMD dGPU/eGPU) is routed through
    // VideoToolbox - there is no working nvenc/qsv/vaapi/amf path on macOS and the darwin ffmpeg build ships none of them - and it is used only on Apple
    // Silicon (encoderPlan says why). (rkmpp is a valid node hardware type but Rockchip ARM only, so it is unsupported here; see selectEncoder's `families`
    // comment for what such a node lands on.)
    const HW_FAMILIES = {
        darwin: ['videotoolbox'],
        win32: ['nvenc', 'qsv', 'amf'],
        linux: ['nvenc', 'qsv', 'vaapi', 'amf'],
    };
    // The render node an injected capability that says dri but lists no render nodes stands for (encoderPlan): one Intel renderD128. On a real node each
    // vaapi candidate carries its own device, which the confirm probe and the emitted command both name.
    const VAAPI_DEVICE = '/dev/dri/renderD128';
    // ffmpeg encoder name per (target codec, family). null = this plugin encodes that codec on no encoder of that family (AV1: none on videotoolbox).
    // av1_vaapi and av1_amf (Linux and Windows builds) stay unused until their quality mapping is measured, as the shared AV1 emit (nativeQuality) does
    // not fit them: av1_vaapi defines no qp, so -qp is ignored and the encode runs at the encoder's default, qindex 25 of 255 - a very large file; av1_amf's
    // qp_i/qp_p run 0-255 and it has no qp_b (FFmpeg release/7.1 vaapi_encode_av1.c and amfenc_av1.c, read 2026-11-09; jellyfin 7.1.4-3's amf patch leaves
    // the AV1 qp options alone). An option another encoder in the build defines is a warning, not an error (jellyfin 7.1.4: hevc_videotoolbox -qp 31 exits
    // 0), so the test encode could not catch either.
    const ENCODER_NAME = {
        hevc: { nvenc: 'hevc_nvenc', qsv: 'hevc_qsv', vaapi: 'hevc_vaapi', videotoolbox: 'hevc_videotoolbox', amf: 'hevc_amf', cpu: 'libx265' },
        h264: { nvenc: 'h264_nvenc', qsv: 'h264_qsv', vaapi: 'h264_vaapi', videotoolbox: 'h264_videotoolbox', amf: 'h264_amf', cpu: 'libx264' },
        av1: { nvenc: 'av1_nvenc', qsv: 'av1_qsv', vaapi: null, videotoolbox: null, amf: null, cpu: 'libsvtav1' },
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
    //   'unreliable' - h264_qsv. Measured 2026-09-22 on both Intel Linux nodes (N150/Xe-LP, J4125/UHD 600; iHD 26.2.2, jellyfin 7.1.4) encoding the caption
    //             sample as this plugin does (quality setting, software scale): captions SURVIVE about 24 runs in 25, so when they are being dropped
    //             buildVideoArgs suppresses them like a 'keep' (`-a53cc 0`: 10 of 10 runs on both nodes), or a re-encode carries captions sub_worker already
    //             exported and a player shows them twice; yet one node lost them about 1 run in 5, so guard_captions counts it a 'drop'. The encoder is not at
    //             fault for the spread: with NO rate-control option the same command emits the SEI only sometimes, so the fmtprobe row encodes with one, five
    //             times - a 'keep' must keep in every run, an 'unreliable' in at least one.
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
            const r = childProcess.spawnSync(ffmpegPath, ['-hide_banner', '-encoders'],
                { encoding: 'utf8', timeout: ENCODERS_PROBE_TIMEOUT_MS, killSignal: 'SIGKILL' });
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
        try { return childProcess.spawnSync(ffmpegPath, args, { encoding: 'utf8', timeout: CONFIRM_PROBE_TIMEOUT_MS, killSignal: 'SIGKILL' }).status === 0; }
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
        // VideoToolbox gets a constant-quality -q:v (nativeQuality), which FFmpeg's encoder accepts only when built for Apple Silicon (videotoolboxenc.c
        // vtenc_qscale_enabled = !TARGET_OS_IPHONE && TARGET_CPU_ARM64, release/7.1; jellyfin's videotoolbox patches leave it alone): on an Intel Mac every
        // VideoToolbox test encode would fail, and under node_strict every file would error. Read from the source, not measured - the fleet has no Intel
        // Mac; the arm64 build does not even carry the refusal's message. A synthetic node (injectedCap) is Apple Silicon unless it names an arch.
        const vtUnusable = platform === 'darwin' && (injectedCap ? injectedCap.arch || 'arm64' : os.arch()) !== 'arm64';
        const hwList = (HW_FAMILIES[platform] || []).filter((f) => !(f === 'videotoolbox' && vtUnusable));
        if (vtUnusable && isGpuWorker && encoderOpt !== 'cpu' && !forceCpu)
            notes.push(`☒[method_encoder=${encoderOpt}] VideoToolbox is not used on an Intel Mac - its quality mode needs Apple Silicon\n`);
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
                if (!encoderName) {   // ENCODER_NAME's nulls: AV1 on videotoolbox, vaapi and amf
                    pushFallbackNote(family, `this plugin does not encode ${targetCodec} on ${family}`);
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
    // a mid-file window has failed), endRead (set only by the end-reading retry below: durationS is already the span from startS), memo: { keyframes: Map,
    // decodes: Map, encoded: Set } shared by every candidate of one file }. Returns { outcome: 'pass' | 'fail' | 'stall' | 'slow' | 'source' | 'noexec',
    // estimateH, windows (how many the estimate pooled), fps, needFps, why, tail, busy, dv, inconclusive, noFrameS, stallFrames, sourceAtS, fromStart,
    // firstFail (the failed window a retry from the start replaced) }.
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
                    { encoding: 'utf8', timeout: KEYFRAME_PROBE_TIMEOUT_MS, maxBuffer: TEST_MAX_BUFFER, killSignal: 'SIGKILL' });
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
            // ffmpeg's Matroska writer (and a fragmented mp4) states the duration as the absolute END, not the span from the start (a 10 s mkv written from
            // 1.0 s probes start 1.0, duration 11.0 on 7.1.4), so on a file starting after zero a window lands past the content, or so near its end that it
            // ends early (a segment part at 42.0-60.0 s seeked to 16.1 s of its 18 s). The span reading goes first, since MKVToolNix and a plain mp4 state
            // the span and the end reading would under-state theirs; such a window retries once over [start, dur].
            if ((w.empty || w.noEstimate === 'eof-early') && T !== null && !o.endRead && start > 0 && start < dur) {
                return runTestEncode({ ...o, durationS: dur - start, endRead: true });
            }
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
    // QUALITY_MAX: the widest scale any emit uses (AV1's, on libsvtav1 and av1_nvenc; HEVC/H.264 targets clamp to 51 below), and parseNumber bounds
    // the quality inputs by it.
    const QUALITY_MAX = 63;
    const AV1_Q_OFFSET = 8;
    const VT_Q_INTERCEPT = 118;
    const VT_Q_SLOPE = 2.6;
    const nativeQuality = (targetCodec, family, qNorm) => {
        let q = Math.round(qNorm);
        // Clamp to each scale's real range so an out-of-range quality input can't emit a CRF/QP ffmpeg rejects (e.g. libx265 -crf 52
        // errors). An AV1 target goes 0-63 on libsvtav1 -crf and av1_nvenc -cq; av1_qsv's ICQ clips global_quality to 1-51 inside FFmpeg (release/7.1
        // qsvenc.c), so a quality setting above 43 (51 once AV1_Q_OFFSET is added) lands at 51 there, and the offset is unmeasured on av1_qsv. vaapi and
        // amf encode no AV1 (ENCODER_NAME). Every HEVC/H.264 emit - libx264/libx265 -crf, nvenc -cq, qsv -global_quality, vaapi/amf -qp - caps at ~0-51.
        // videotoolbox remaps q anyway.
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

    // The QuickTime fourCC per source codec for a copy that does not take hevcCopyPlan (qtVideoTag reads it): the lossless strip, whose filters rebuild
    // an in-band hvcC themselves (the P8.1 sample: 23 bytes in, 2770 out, Apple decodes), and the restore of an AV1 or H.264 original. The encode path
    // tags hevc only, choosing for the stream it encodes - do not merge the two. The key is an ffprobe codec_name, so the read goes through tableGet
    // (see its definition for why a bare TABLE[key] || fallback is unsafe here).
    const QT_VIDEO_TAG = { hevc: 'hvc1', av1: 'av01', h264: 'avc1' };

    // A source container that cannot hold the codec this run would write is a refusal, not an encode. Two failure shapes, both measured on jellyfin-ffmpeg
    // 7.1.4 by encoding into every container in Tdarr's default filter plus the 3gp/ogg/asf family and reading the result back (explicit hvc1/hev1/av01
    // tags change nothing; .divx and .tp/.trp/.tod were written through the -f their muxer needs): the muxer REFUSES at header write (exit 234, so the
    // file reaches the error queue with nothing but ffmpeg's own message), or it exits 0 and writes a file that no longer reads back as that codec - AV1
    // into MPEG-PS reads back 'unknown', into MPEG-TS as nothing, and HEVC into avi as rawvideo, which would make every later pass re-encode it. mkv, mp4
    // and flv take all three. In the designed stack clean_and_remux has already remuxed to mkv or mp4, so only a standalone run, or one ordered before it,
    // meets these. .wtv and .mxf were measured the same way, beside the audio each natively holds (ac3, PCM): the wtv muxer refuses hevc ('unsupported
    // codec_id', exit 255), the mxf muxer hevc and av1 (no essence container for either, exit 255). awk-ffmpeg-test's muxmatrix re-measures every cell
    // (its WRITEBACK rows mirror this table, guarded by selftest_mirrors). .m4v is absent because it is written through the mp4 muxer, which takes all
    // three, and an extension no muxer writes back at all (.evo and the rest) never gets this far - both are the output muxer section's business.
    const CONTAINER_REFUSES_VIDEO = {
        webm: ['hevc', 'h264'], mov: ['av1'], '3gp': ['hevc', 'av1'], '3g2': ['hevc', 'av1'],
        wmv: ['hevc'], asf: ['hevc'], ogv: ['hevc', 'h264', 'av1'], ogg: ['hevc', 'h264', 'av1'],
        avi: ['hevc'], divx: ['hevc'], mpg: ['av1'], mpeg: ['av1'], vob: ['av1'], ts: ['av1'], m2ts: ['av1'], mts: ['av1'], tp: ['av1'], trp: ['av1'],
        tod: ['av1'], wtv: ['hevc'], mxf: ['hevc', 'av1'],
    };
    const containerRefusesTarget = (container, targetCodec) => tableGet(CONTAINER_REFUSES_VIDEO, container, []).includes(targetCodec);
    // The cells where even a stream COPY back into the same container is refused, which gate the lossless strip and the restore, are the shared
    // CONTAINER_REFUSES_COPY (output muxer section).
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
    // therefore serves only the codecs with no measurement of their own - av1_qsv, av1_nvenc, h264_vaapi and hevc_amf - and
    // where a family has two measured rows it is the larger, since an unmeasured codec is better over- than under-stated. The three CPU encoders
    // are each measured directly and need no stand-in. memprobe's enc:hwfamily rows test a stand-in on any node that can run its codec.
    const MEM_ENCODER_BY_FAMILY = { nvenc: 'h264_nvenc', qsv: 'hevc_qsv', vaapi: 'hevc_vaapi', videotoolbox: 'hevc_videotoolbox', amf: 'h264_amf' };
    // Decode-side peak, MB per megapixel of the SOURCE frame, per source codec and per whether -thread_type slice is on the command (see MEM_SLICE_CODECS). An
    // 8.8x spread across codecs (mpeg2video to prores), so a single constant would be wrong in both directions. ProRes is the priciest decoder and AV1 the
    // priciest one the flag cannot help, which compounds with libsvtav1 being the hungriest encoder: AV1 -> AV1 is the most memory-expensive path this plugin
    // can take. The def and slice figures of every row but prores come from one full Linux refit on 2026-08-21; perThread is the THREADS term below.
    // `nvdec` is the same codec decoded on NVDEC, which an nvenc encode runs wherever nvencDecodeArgs allows it (nvdecPreset's list minus NVDEC_UNSAFE_CODECS).
    // Measured 2026-10-18 on the 20-core nvenc node as hevc_nvenc encodes at 2, 5 and 16 decoder threads (linear, R^2 0.996-0.997) and at 2160p and 1080p
    // output; both sources were 4K, so a row's nvdec figure and hevc_nvenc's base share one measured sum, split at that base. An NVDEC codec with no figure
    // here keeps its software one, which for h264 (measured both ways) is 2% under the NVDEC peak on a 4-core node and above it from 6 cores up.
    const MEM_DECODER = {
        mpeg2video: { def: 7.1,  slice: 7.1,  perThread: 0 },
        vp9:        { def: 14.3, slice: 8.2,  perThread: 1.7 },
        h264:       { def: 24.9, slice: 11.9, perThread: 2.8, nvdec: { def: 27.6, perThread: 1.2 } },
        hevc8:      { def: 31.8, slice: 15.9, perThread: 3.7 },
        hevc10:     { def: 46.0, slice: 25.9, perThread: 5.2, nvdec: { def: 33.2, perThread: 2.3 } },
        av1:        { def: 46.6, slice: 46.6, perThread: 2.0, threadsOverCores: 0 },   // libdav1d takes cores threads, not cores + 1
        // prores measured 2026-08-21 on the Linux node (VmHWM, 5 reps, medians reproducible to 0.2% across independent runs). It is the 4:4:4 12-bit XQ figure,
        // the WORST case: a 4:2:2 10-bit HQ source at the same 4K measured 362 MB against XQ's 552 (a 52% spread), and under-stating is what loses the refusal.
        // Fitted on prores_ks at BOTH resolutions, so the re-encoder is a constant that cancels in the slope; that it stands in for camera-original media is
        // measured: real XQ 552 MB vs prores_ks XQ 542 MB at 4K, 1.8% apart. def == slice is no shortcut: prores is not in MEM_SLICE_CODECS, so -thread_type
        // slice is never emitted for it and the second figure is never read.
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
    // THREADS. ffmpeg's decoders and the CPU encoders size their threads from the visible core count and each extra thread holds frames of its own, while every
    // coefficient above is stated at a 4-core fit point. Measured 2026-10-17 with memprobe's threads mode (each term swept at an explicit thread count, which
    // needs no physical core) on a 4-core Linux node, a 20-core Windows node and a Mac: linear per thread, R^2 0.99-1.0, within ~8% across the three, and the
    // larger reading carried since over-stating only hardens a warning. Without these terms every peak row on the 20-core node read 26-166% over the model (the
    // 4-core one within 5%). The refusal's floor, the single-thread lower bound, never reads them: a bigger node moves the warning but never causes a refusal.
    //   * Decode - MEM_DECODER's perThread, MB per extra decoder thread per SOURCE megapixel; a slice decode adds nothing per thread, so it carries none. A
    //     hardware encode decodes frame-threaded on the CPU and this term was its whole growth with cores (+43 MB a thread at 4K, as much as the decode alone),
    //     except nvenc's, which decodes on NVDEC where the codec allows and grows by MEM_DECODER's nvdec perThread instead (10-19 MB a thread at 4K).
    //   * Encode - MEM_ENCODER's perCore, MB per extra visible core per OUTPUT megapixel. libx264 runs 1.5 threads a core at 9.7 each; x265's pool runs one a
    //     core at 5.4, its frame-thread steps included; libsvtav1's memory is not a clean function of its lp setting, so its figure is fitted between the
    //     default-threaded runs of the 4- and 20-core nodes.
    const MEM_FIT_CORES = 4;
    // The largest node measured: past it a node is costed as this one.
    const MEM_MAX_CORES = 20;
    // Decoder threads: cores + 1 for libavcodec's frame-threaded decoders, cores for libdav1d (MEM_DECODER's threadsOverCores), capped at 16.
    const MEM_DECODE_THREADS_MAX = 16;
    const memDecodeThreads = (row, cores) => {
        const c = Math.min(cores, MEM_MAX_CORES);
        return c > 1 ? Math.min(c + (row.threadsOverCores ?? 1), MEM_DECODE_THREADS_MAX) : 1;
    };
    // Source codecs where -thread_type slice pays. Measured saving at 4K: h264 126 MB, hevc 115-163 MB, vp9 55 MB - and exactly ZERO for av1 (libdav1d ignores
    // the flag) and mpeg2, so the flag is emitted only where it buys something. See buildVideoArgs for why it may only ever ride the INPUT side.
    // The memory is bought with decode speed where a frame has one slice (x264's default), which slice threads cannot split: 3 s of single-slice 4K H.264
    // decoded in 1.31 s against 0.37 s frame-threaded, and a libx264 -preset fast transcode of it ran 13% longer (3.75 s against 3.32 s; M1, jellyfin 7.1.4,
    // 2026-10-28) - at the default method_speed=slow the encoder dominates and no cost showed. Kept on every CPU encode all the same: the 4 GB node budget
    // is the constraint that fails a file, and the time only stretches a fast encode of a 4K source.
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
        tonemap, tonemapBackend, tonemapSetparams, preserveDv, preserveDvNoBase, deintFilter, dropCaptions, sliceDecode, oddSize }) => {
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
        // An odd coded width or height (an Xvid/DivX 640x267) is cropped to even by one row or column, with no resample: libx264 and libx265 refuse an odd
        // 4:2:0 frame (measured on 7.1.4), which would fail the test encode, its retry and the file on every requeue. It leads the downscale and tonemap.
        if (oddSize) vf.push('crop=trunc(iw/2)*2:trunc(ih/2)*2');
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
        // A53_CAP holds the hardware-confirmed map and its five classes. dropCaptions means sub_worker already lifted them into a sidecar, so the bitstream
        // copy must go or a player shows them twice. So: on a keep-by-default or unreliable encoder, suppress when dropping (vaapi loses a53_cc from its sei
        // set, everyone else takes -a53cc 0); on libx265, say which either way (its default is off on this build, stated rather than relied on); and
        // h264_videotoolbox always gets -a53cc 0 because inserting A53 crashes it - it cannot keep captions at all, which is why guard_captions force-picks
        // libx264 when a caption-bearing file targets H.264 on a Mac.
        const a53cap = a53ClassOf(targetCodec, family);
        if (a53cap === 'error') parts.push('-a53cc 0');
        else if ((a53cap === 'keep' || a53cap === 'unreliable') && dropCaptions) parts.push(family === 'vaapi' ? '-sei -a53_cc' : '-a53cc 0');
        else if (a53cap === 'optin') parts.push(dropCaptions ? '-a53cc 0' : '-a53cc 1');
        // hvc1 = Apple/QuickTime HEVC-in-mp4 (primary only); a no-base DV (e.g. profile 5) needs dvh1 or the DV box is dropped, so such an encode never
        // reaches a .mov (skipped where preserveDvNoBase is set). The encode path tags hevc ONLY - see QT_VIDEO_TAG for why it and the copy path differ
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
    const detectInterlace = (ffmpegPath, inputPath, startSec, streamIndex) => {
        try {
            // Sampled from a way into the file, not the head: logos, black and title cards are commonly progressive even in an interlaced programme, so a
            // head sample under-reports. -ss ahead of -i is safe here because this DECODES; it is only a stream COPY that -ss corrupts.
            // -map names the primary video by its absolute index. Left to ffmpeg, the pick favours the larger frame, so a big cover held as a plain track (a
            // -map 0 remux writes an attached cover so) is decoded instead and reads as progressive (measured on 7.1.4): combed video is encoded unrepaired.
            const args = ['-nostats', '-hide_banner', ...(startSec > 0 ? ['-ss', String(startSec)] : []), '-i', inputPath, '-map', `0:${streamIndex}`,
                '-frames:v', String(IDET_SAMPLE_FRAMES), '-vf', 'idet', '-f', 'null', '-'];
            const r = childProcess.spawnSync(ffmpegPath, args,
                { encoding: 'utf8', timeout: IDET_PROBE_TIMEOUT_MS, maxBuffer: IDET_PROBE_MAX_BYTES, killSignal: 'SIGKILL' });
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

    // #region SHARED helpers (3 sections: closed-caption probe … video fingerprint)
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
    // run, so a caller stays fail-safe rather than concluding the file is caption-free. absIndex is the primary's ABSOLUTE index, never v:0: Matroska keeps
    // a cover as a plain video track, which can sit ahead of the video (measured on a cover-first mkv: 0 A53 frames on v:0, 4 on the video's own index); an
    // absent index is 'unknown'. `cap` is the test-injected verdict (__awkCap.captions): supplying it short-circuits the spawn entirely, which is how the
    // harness stays free of real binaries.
    const probeA53Captions = (filePath, ffprobePath, absIndex, cap) => {
        if (cap === true || cap === false) return cap;
        if (!filePath || !ffprobePath || !Number.isInteger(absIndex)) return 'unknown';
        try {
            const { spawnSync } = require('child_process');
            const args = ['-v', 'error', '-select_streams', String(absIndex), '-read_intervals', `%+#${A53_PROBE_FRAMES}`,
                '-show_frames', '-show_entries', 'frame=side_data_list', '-of', 'default=nw=1', filePath];
            const r = spawnSync(ffprobePath, args, { encoding: 'utf8', timeout: A53_PROBE_TIMEOUT_MS, maxBuffer: A53_PROBE_MAX_BYTES, killSignal: 'SIGKILL' });
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
    const CC_TAG = 'awk_cc';
    //   strip    - the captions are out (a sidecar or a subtitle track holds them) but the bitstream copy is still there; drop it on the next re-encode.
    //   removed  - the captions are out AND the bitstream copy went with them in that same pass: the fact paired with the `strip` request, telling every
    //              later pass there is nothing left to act on. It changes no encode command - video_clean probes and carries captions as on an untagged
    //              file - so the tag carried onto a video that still holds captions (an outside tool's re-encode keeps global tags) cannot drop them.
    //   none     - both caption fields were read and neither decoded to CEA-608 text, so no later pass need pay for that decode again. sub_worker's own
    //              memo: video_clean ignores it, because ffmpeg reads only CEA-608 and a CEA-708-only service reads empty on both fields (cea708_dtv.mpg,
    //              89+12 valid 708 triplets), so dropping the caption data on `none` would destroy a service nothing can extract.
    //   decoded  - a read of field 1 finished; decoded2 - a read of field 2 finished. sub_worker reads both, and counts field 1 as read under decoded2 alone
    //              too (an earlier build read field 2 into the field-1 name after an empty first read). Its own progress memos, stamped by the pass that
    //              runs the read: an empty sidecar with neither behind it was left by an interrupted read, not by an empty channel. Every other reader
    //              ignores them.
    //   fp:<id8>.<dig> - the video field 1 was read from (the video fingerprint section). An fp with no read token beside it is a read video_clean
    //              withdrew because the video changed under its request, so sub_worker reads the captions of the video that is there.
    //   imported - the captions are already embedded as a real subtitle track, so sub_worker must not read them out a second time. On Matroska each
    //              track sub_worker imports also carries awk_cc=imported in its own tags (the imported caption track section).
    const CC_TOKENS = { strip: 'strip', removed: 'removed', none: 'none', decoded: 'decoded', decoded2: 'decoded2', imported: 'imported' };
    // The value is a COMMA LIST and every reader splits it, because the states genuinely combine: an imported round trip that could not strip in its own pass
    // records `imported,strip` - and `imported,removed` where it could. An empty channel records `none` - it never owes a strip. A writer therefore EXTENDS
    // the tag rather than replacing it with one token - a whole-value overwrite would erase a pending request instead of deferring it. A REQUEST is retired
    // by whoever SERVES it, and only then: sub_worker's in-pass strip or video_clean's encode rewrites `strip` to `removed`, taking the fp with it. Without
    // that the tag only ever grows, and a satisfied request is indistinguishable from a fresh one - a file that later regains captions (a re-muxed capture,
    // an external tool re-inserting A53 SEI) has them dropped by a request answered encodes ago. `none` and `imported` are never retired: memos about the
    // file, not requests, they stay true for its life - bar video_clean's clear of a request whose caption track is gone, which keeps only the fp.
    const ccTokensOf = (tags) => getTagCI(tags || {}, CC_TAG).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    // ===== END SHARED: closed-caption handoff =====

    // ===== SHARED [sub_worker, video_clean]: video fingerprint =====
    // -=-=-= STILL_CAPABLE_CODECS / primaryVideo  [sub_worker, video_clean] =-=-=-
    // The video a file is about - the one video_clean encodes and fingerprints, and sub_worker reads captions from - picked the same way in both, so a caption
    // read is checked against the stream it was read from. Among the video streams that are not cover art: a default-flagged one, then one whose codec is
    // not also a stills codec (mjpeg, mjpegb and jpeg2000 are real video too - see IMAGE_CODECS), then the first. A dispositionless mjpeg track ahead of a
    // default-flagged HEVC is passed over; a camcorder file whose one video is MJPEG keeps it.
    const STILL_CAPABLE_CODECS = ['mjpeg', 'mjpegb', 'jpeg2000'];
    const primaryVideo = (streams) => {
        const rank = (s) => (s.disposition?.default === 1 ? 0 : 2) + (STILL_CAPABLE_CODECS.includes(codecNameOf(s)) ? 1 : 0);
        return (streams || []).filter((s) => codecTypeOf(s) === 'video' && !isCoverArt(s))
            .reduce((best, s) => (best === undefined || rank(s) < rank(best) ? s : best), undefined);
    };
    // -=-=-= FINGERPRINT_* / FINGERPRINT_RE / videoId8 / isOriginalPath / videoDigest / fpText  [sub_worker, video_clean] =-=-=-
    // A fingerprint names one video stream as <id8>.<dig>: videoId8, then videoDigest's 8 hex, or n where its window held no non-keyframe packet, or x where
    // the read failed. video_clean stamps one on a size verdict (awk_vq) and checks a caption request against one; sub_worker binds a caption read to one.
    // The read takes the first 120 packets (~10 KB of output): 0.02-0.11 s locally, 0.30-0.47 s cold over SMB, measured 2026-10-22.
    const FINGERPRINT_PACKETS = 120;
    const FINGERPRINT_TIMEOUT_MS = 20000;
    const FINGERPRINT_MAX_BYTES = 1024 * 1024;
    // A stored fingerprint split into its id8 and dig; a value that does not match is no fingerprint at all.
    const FINGERPRINT_RE = /^([0-9a-f]{8})\.([0-9a-f]{8}|n|x)$/;
    // The fingerprint's free half, from ffProbeData alone: what the stream IS (codec, profile, size, pixel format).
    const videoId8 = (s) => require('crypto').createHash('sha1').update(`${s.codec_name}|${s.profile ?? ''}|${s.width}x${s.height}|${s.pix_fmt}`)
        .digest('hex').slice(0, 8);
    // Which file a read is about, for the harness's injected answers: the library original, or this pass's working file.
    const isOriginalPath = (p) => !!p && p === otherArguments?.originalLibraryFile?.file;
    // The fingerprint's content half: the first 8 hex of sha1 over the MD5 data hashes of the NON-keyframe packets among the stream's first 120 -> 8 hex,
    // '' when that window holds none (an all-intra source: the 16 GB ProRes sample gave 0), null when the read failed or read nothing. Keyframes are left out
    // because mkvmerge rewrites them (+2463 B on the first, measured) while every other packet stays byte-identical: the digest was identical through
    // ffmpeg -c copy, mkv<->mp4, mkvmerge, mkvpropedit and MP4Box, and different on every re-encode, a same-settings second generation included. The ABSOLUTE
    // index of the primary (primaryVideo), never v:0, which would hash a poster ahead of the video. The harness answers from
    // __awkCap.videoDigest.{working,original} and never spawns; a missing key reads as a failed read.
    const videoDigest = (filePath, ffprobePath, absIndex, timeoutMs) => {
        const cap = otherArguments && otherArguments.__awkCap;
        if (cap) {
            const v = (cap.videoDigest || {})[isOriginalPath(filePath) ? 'original' : 'working'];
            return typeof v === 'string' && (v === '' || /^[0-9a-f]{8}$/.test(v)) ? v : null;
        }
        if (!ffprobePath) return null;
        try {
            const r = require('child_process').spawnSync(ffprobePath, ['-v', 'error', '-select_streams', String(absIndex), '-read_intervals',
                `%+#${FINGERPRINT_PACKETS}`, '-show_entries', 'packet=flags,data_hash', '-show_data_hash', 'MD5', '-of', 'default=nw=1:nk=1', filePath],
            { encoding: 'utf8', maxBuffer: FINGERPRINT_MAX_BYTES, timeout: timeoutMs, killSignal: 'SIGKILL' });
            const body = r && !r.error && r.status === 0 ? String(r.stdout || '').trim() : '';
            const lines = body ? body.split(/\r?\n/) : [];
            if (!lines.length || lines.length % 2) return null;
            const hashes = [];
            for (let i = 0; i < lines.length; i += 2) {
                const hash = lines[i + 1].trim();
                if (!/^MD5:[0-9a-f]{32}$/.test(hash)) return null;
                if (!lines[i].trim().startsWith('K')) hashes.push(hash);
            }
            return hashes.length ? require('crypto').createHash('sha1').update(hashes.join('\n')).digest('hex').slice(0, 8) : '';
        } catch (e) { return null; }
    };
    // A fingerprint's text: the stream's id8, then its digest, n or x.
    const fpText = (s, dig) => `${videoId8(s)}.${dig === null ? 'x' : dig || 'n'}`;
    // -=-=-= CC_FP_PREFIX / ccFpOf / ccFpStaleWhy  [sub_worker, video_clean] =-=-=-
    // The awk_cc token that binds a caption read to the video it was read from: fp:<fingerprint>. ccFpOf gives the fingerprint of the first one, or ''.
    const CC_FP_PREFIX = 'fp:';
    const ccFpOf = (tokens) => (tokens.find((t) => t.startsWith(CC_FP_PREFIX)) || '').slice(CC_FP_PREFIX.length);
    // Why a caption read's fingerprint no longer describes `stream` ('' while it does), asked before a step that deletes captions on that read's word. Only
    // an INHERITED fp is checked: one the library original does not carry was written in this job, on the video this job holds, and is trusted with no
    // read. No fp (a read from before the binding) is trusted, and an n or x fingerprint is checked on its identity only. `digest` is a thunk, so a
    // changed id8 spends nothing. A digest that cannot be read counts as stale, the opposite of the awk_vq fence on purpose: a wrongly trusted read
    // deletes captions, a wrongly doubted one costs one re-read.
    const ccFpStaleWhy = (tokens, origTokens, stream, digest) => {
        const fp = ccFpOf(tokens);
        if (!fp || fp !== ccFpOf(origTokens)) return '';
        const m = FINGERPRINT_RE.exec(fp);
        if (!m) return 'its fingerprint token is unreadable';
        if (m[1] !== videoId8(stream)) return 'its format changed';
        if (!/^[0-9a-f]{8}$/.test(m[2])) return '';
        const dig = digest();
        return dig === null ? 'the fingerprint read failed' : dig !== m[2] ? 'its content changed' : '';
    };
    // ===== END SHARED: video fingerprint =====
    // #endregion

    // #region SHARED helpers (1 section: imported caption track)
    // ===== SHARED [clean_and_remux, video_clean]: imported caption track =====
    // -=-=-= importedCaptionTracks  [clean_and_remux, video_clean] =-=-=-
    // The subtitle tracks holding the closed captions sub_worker imported - the only copy left IN the video once the bitstream copy is stripped or owed a
    // strip. A track sub_worker imported into Matroska carries awk_cc=imported in its own tags, which stays true after language_fill gives it a language.
    // Beside the marked ones, under the file's global `imported` memo, every non-image subtitle that is hearing impaired and und or untagged counts too:
    // the shape sub_worker writes them in (CEA-608 carries no language), and the only sign an mp4 (which keeps no track tag) or an import from before the
    // mark carries. isImage(codec) names the image subtitle codecs the caller leaves out.
    const importedCaptionTracks = (streams, tokens, isImage) => (streams || []).filter((s) => codecTypeOf(s) === 'subtitle' && !isImage(codecNameOf(s))
        && (ccTokensOf(s.tags).includes(CC_TOKENS.imported)
            || (tokens.includes(CC_TOKENS.imported) && s.disposition?.hearing_impaired === 1 && ['', 'und'].includes(resolveLang(s)))));
    // ===== END SHARED: imported caption track =====
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

    // ====== SHRINK SAVINGS MEASUREMENT ======
    // guard_shrink_savings' verdict state lives in the container-global VQ_TAG, written and read only by this plugin's own passes. Grammar (one value,
    // ':'-separated - videoSigCore and the threshold text carry no ':'):
    //   encoded:<core>:<T>              - a pure size-pass encode was emitted at these settings and waits for its verdict on the next pass.
    //   keep:<pct>:<core>:<T>:<fp>      - judged and kept; <pct> a signed whole percent, or na where no verdict could be read (that pass's log says why).
    //   reject:<pct>:<core>:<T>:<fp>    - judged and reverted by the restore mux.
    // <fp> = the fingerprint of the video stream the pass leaves behind (the video fingerprint section). Any other value, or a keep/reject with other than
    // five fields, parses as absent.
    const VQ_TAG = 'awk_vq';
    // The packet-sum reads share ONE budget per verdict, sized for the largest original on a share (about 530 MB/s locally, so 30 min covers about 950
    // GB, about 200 GB at 110 MB/s): a cycle can never block the worker for twice that. Its output is ~29 B per packet, so 64 MiB covers ~10 h at 60 fps.
    const PACKET_SUM_TIMEOUT_MS = 30 * 60 * 1000;
    const PACKET_SUM_MAX_BYTES = 64 * 1024 * 1024;
    const MATROSKA_DEMUXER = 'matroska,webm';
    const MP4_DEMUXER = 'mov,mp4,m4a,3gp,3g2,mj2';
    // The A/V offset a restore may add, in seconds: inside the ~40 ms at which an audio lead becomes detectable (EBU R37 / ITU-R BT.1359).
    const ANCHOR_TOLERANCE_S = 0.010;

    const parseVq = (raw) => {
        const f = String(raw || '').trim().split(':');
        if (f[0] === 'encoded' && f.length === 3 && f[1] && f[2]) return { state: 'encoded', core: f[1], t: f[2] };
        if ((f[0] !== 'keep' && f[0] !== 'reject') || f.length !== 5 || !f[2] || !f[3] || !f[4]) return null;
        const pct = /^-?\d+$/.test(f[1]) ? Number(f[1]) : (f[0] === 'keep' && f[1] === 'na' ? null : undefined);
        return pct === undefined ? null : { state: f[0], pct, core: f[2], t: f[3], fp: f[4] };
    };
    const fracOf = (v) => { const m = /^(\d+)\/(\d+)$/.exec(String(v || '').trim()); return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 0; };
    // A Matroska DURATION tag ('00:45:00.000000000') in seconds; NaN when it does not read as one.
    const hmsSeconds = (v) => {
        const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
    };
    // Each spelling of a Matroska statistics key on a stream ('NUMBER_OF_BYTES', 'NUMBER_OF_BYTES-eng'), with its suffix, so the tags read beside it
    // are the same writer's: a stale DURATION-eng can sit next to a fresh DURATION (interlaced_1080i_h264_2997.mkv: 60.06 s against 6.006 s).
    const statsKeysOf = (tags, base) => Object.keys(tags || {}).map((k) => new RegExp(`^${base}(-[A-Za-z0-9_]+)?$`, 'i').exec(k))
        .filter(Boolean).map((m) => ({ value: String(tags[m[0]] ?? '').trim(), suffix: m[1] || '' }));

    // Video payload bytes of one stream and its span (max(pts + duration) - min(pts), in that stream's time_base) from one packet read -> { bytes, packets,
    // spanS }, or { why } naming the failure. The default writer, never csv or compact: both append an empty field to a packet carrying side data, so every
    // MPEG-TS/PS packet reads '182602,' (22 of 125 corpus files broke, against 0 of 125 this way, with identical sums). A packet flagged D (discard) is
    // left out of both sums: an mp4/mov trimmed by an edit list (an -ss stream copy, a LosslessCut or phone trim) still hands ffprobe the samples ahead of
    // the edit, which no decode shows - a 9.40 s cut read 12.00 s and an encode that grew the video read as unmeasurable, and was kept. The harness answers
    // from __awkCap.packetSum.{cache,original} and never spawns: { bytes, spanS }, or { stdout } - a packet read's own output, put through the same parse; a
    // missing key reads as a failed read.
    const packetSum = (filePath, ffprobePath, streamIndex, timeBase, timeoutMs) => {
        const tb = fracOf(timeBase);
        // ffprobe prints each packet's pts, duration, size and flags (K, D, C or _ each) on four lines, in that order whatever order -show_entries names.
        const parse = (stdout) => {
            const body = String(stdout || '').trim();
            const lines = body ? body.split(/\r?\n/) : [];
            if (!lines.length || lines.length % 4) return { why: 'ffprobe failed' };
            let bytes = 0;
            let packets = 0;
            let lo = Infinity;
            let hi = -Infinity;
            for (let i = 0; i < lines.length; i += 4) {
                const [pts, dur, size] = lines.slice(i, i + 3).map((l) => (/^-?\d+$/.test(l.trim()) ? Number(l) : NaN));
                if (!Number.isFinite(pts) || !Number.isFinite(dur) || !Number.isFinite(size)) return { why: 'ffprobe failed' };
                if (!lines[i + 3].includes('D')) {
                    bytes += size;
                    packets += 1;
                    lo = Math.min(lo, pts);
                    hi = Math.max(hi, pts + dur);
                }
            }
            return bytes > 0 ? { bytes, packets, spanS: (hi - lo) * tb } : { why: 'ffprobe failed' };
        };
        if (injectedCap) {
            const v = (injectedCap.packetSum || {})[isOriginalPath(filePath) ? 'original' : 'cache'];
            if (v && typeof v.stdout === 'string') return tb > 0 ? parse(v.stdout) : { why: 'the stream states no time base' };
            return v && !v.why && Number(v.bytes) > 0 && Number(v.spanS) > 0
                ? { bytes: Number(v.bytes), packets: Number(v.packets) || 0, spanS: Number(v.spanS) } : { why: (v && v.why) || 'ffprobe failed' };
        }
        if (timeoutMs <= 0) return { why: 'timed out' };
        if (!ffprobePath) return { why: 'no ffprobe beside ffmpeg on this node' };
        if (!(tb > 0)) return { why: 'the stream states no time base' };
        try {
            const r = childProcess.spawnSync(ffprobePath, ['-v', 'error', '-select_streams', String(streamIndex), '-show_entries',
                'packet=pts,duration,size,flags', '-of', 'default=nw=1:nk=1', filePath],
            { encoding: 'utf8', maxBuffer: PACKET_SUM_MAX_BYTES, timeout: timeoutMs, killSignal: 'SIGKILL' });
            if (r && r.error && r.error.code === 'ETIMEDOUT') return { why: 'timed out' };
            return parse(r && !r.error && r.status === 0 ? r.stdout : '');
        } catch (e) { return { why: 'ffprobe failed' }; }
    };
    // ====== END SHRINK SAVINGS MEASUREMENT ======

    // Does a video fill its file's timeline? It looks for the stream's packets in four 10 s windows: centred at start + 25, 50 and 75% of the duration, and
    // the one ending 5 s before the stated end, which a truncated file or an overstated duration leaves empty -> { gaps } (true when a window holds none), or
    // { why } it could not be checked. One ffprobe read of the stream by its ABSOLUTE index (never v:0, which a poster can lead), its windows in one
    // -read_intervals list (the same verdict as one read per window on 71 files), the default writer as packetSum's. It reads the bytes in the windows
    // (0.03-0.7 s locally on files up to 60 Mb/s, 3.3 s at 460 Mb/s; 0.4-2.0 s cold over SMB at 10-59 Mb/s), except on a Matroska with no Cues index, where
    // ffprobe scans from the start to the last window (about 1.4 s per GB locally, cold); the timeout bounds both (production ffprobe 7.1.4, 2026-11-07). A
    // window is judged by pts alone: each interval seeks back to the keyframe before its start, so a window inside a gap still returns packets, all of them
    // outside it. The harness answers from __awkCap.timelineRead and never spawns: { stdout }, a read's own output put through the same parse, { why }, or a
    // function given the argv and spawn options that returns one of those; a missing key reads as a failed read.
    const TIMELINE_READ_TIMEOUT_MS = 20000;
    const TIMELINE_READ_MAX_BYTES = 1024 * 1024;
    const timelineGaps = (filePath, absIndex, start, duration) => {
        if (!(duration > 0)) return { why: 'it states no duration' };
        const wins = [0.25, 0.5, 0.75].map((f) => start + f * duration).map((t) => [t - 5, t + 5]).concat([[start + duration - 15, start + duration - 5]]);
        const args = ['-v', 'error', '-select_streams', String(absIndex), '-read_intervals', wins.map(([a, b]) => `${a.toFixed(3)}%${b.toFixed(3)}`).join(','),
            '-show_entries', 'packet=pts_time', '-of', 'default=nw=1:nk=1', filePath];
        const opts = { encoding: 'utf8', maxBuffer: TIMELINE_READ_MAX_BYTES, timeout: TIMELINE_READ_TIMEOUT_MS, killSignal: 'SIGKILL' };
        let read = null;
        if (injectedCap) {
            const v = injectedCap.timelineRead;
            read = typeof v === 'function' ? v(args.slice(), { ...opts }) : v;
        } else {
            const ffprobePath = deriveFfprobePath(ffmpegPathOf(otherArguments));
            if (!ffprobePath) return { why: 'no ffprobe beside ffmpeg on this node' };
            try {
                const r = childProcess.spawnSync(ffprobePath, args, opts);
                if (r && r.error && r.error.code === 'ETIMEDOUT') read = { why: 'timed out' };
                else if (r && !r.error && r.status === 0) read = { stdout: r.stdout };
            } catch (e) { read = null; }
        }
        if (!read || typeof read.stdout !== 'string') return { why: (read && read.why) || 'ffprobe failed' };
        const pts = read.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^-?\d+(\.\d+)?$/.test(l)).map(Number);
        return { gaps: !wins.every(([a, b]) => pts.some((p) => p >= a && p <= b)) };
    };

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
    const guardCaptions = ddValue(inputs.guard_captions, 'disabled');   // opt-in, unlike the two guards below (see its tooltip)
    const guardDv = ddValue(inputs.guard_dv, 'enabled');
    const guardLossless = ddValue(inputs.guard_lossless, 'enabled');

    // The free-text NUMERIC inputs (the four quality_* tiers, guard_shrink_bitrate, guard_shrink_savings and guard_encode_hours) are the only user-typed
    // values this plugin echoes back, so they go through logSafe like every free-text echo (see its header): failFile's message becomes the file's stored
    // error, and loadDefaultValues only trims.
    const parseNumber = (name, max, phrase) => {
        const v = inputs[name];
        const n = Number(String(v).trim());
        if (!Number.isFinite(n) || n < 0 || n > max) failFile(`[${name}=${logSafe(v)}] must be ${phrase}, check your settings`);
        return n;
    };
    const qualityRange = `a number between 0 and ${QUALITY_MAX}`;
    const qualitySd = parseNumber('quality_sd', QUALITY_MAX, qualityRange);
    const quality720 = parseNumber('quality_720p', QUALITY_MAX, qualityRange);
    const quality1080 = parseNumber('quality_1080p', QUALITY_MAX, qualityRange);
    const quality4k = parseNumber('quality_4k', QUALITY_MAX, qualityRange);
    const guardShrinkKbps = parseNumber('guard_shrink_bitrate', Infinity, 'a non-negative number (kbps)');
    // Hours, fractional allowed (0.5); 0 = no limit. Parsed here, with the others, so a bad value fails every file rather than only those that reach a
    // transcode.
    const encodeCapHours = parseNumber('guard_encode_hours', ENCODE_CAP_MAX_HOURS, `a number of hours from 0 to ${ENCODE_CAP_MAX_HOURS} (0 = no limit)`);
    // A percentage, fractional allowed; 0 = off. savingsText, the parsed number's own text, is the threshold awk_vq records and every line names, so only a
    // changed NUMBER reads as a new setting: '25.0', '025' and '+25' are all 25.
    const guardShrinkSavings = parseNumber('guard_shrink_savings', 100, 'a percentage from 0 to 100 (0 = off)');
    const savingsText = String(guardShrinkSavings);

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
        ['guard_captions',   guardCaptions,    ['disabled', 'enabled']],
        ['guard_dv',         guardDv,          ['enabled', 'disabled']],
        ['guard_lossless',   guardLossless,    ['enabled', 'disabled']],
    ];
    checkDropdowns(dropdownChecks);
    const guardCaptionsOn = guardCaptions === 'enabled';
    const guardDvOn = guardDv === 'enabled';
    const guardLosslessOn = guardLossless === 'enabled';
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
        response.infoLog += trackNamesUnreadLine(file.ffProbeData.streams);

        // Primary video stream - the one we actually encode (primaryVideo).
        const videoStreams = file.ffProbeData.streams.filter((s) => codecTypeOf(s) === 'video');
        const primary = primaryVideo(videoStreams);
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
        // Every :v:0 option this plugin writes addresses the primary, so the primary is the output's first video. Where another real video leads it in the
        // source (a dispositionless mjpeg track ahead of the film, which primaryVideo passes over), every stream is mapped by index, the primary first and the
        // rest in source order; otherwise -map 0. outStreams is the source in that output order, for everything that reads the output's order.
        const primaryLed = videoStreams.some((s) => !isCoverArt(s) && s.index < primary.index);
        const outStreams = primaryLed ? [primary, ...file.ffProbeData.streams.filter((s) => s !== primary)] : file.ffProbeData.streams;
        const mapAll = primaryLed ? outStreams.map((s) => `-map 0:${s.index}`).join(' ') : '-map 0';
        const uncopyable = mp4UncopyableStreams(dstContainer, file.ffProbeData.streams);                     // a data track the container cannot copy
        const outputDrops = [...coverArtStreams, ...uncopyable].map((s) => ` -map -0:${s.index}`).join(''); // dropped from every output this plugin emits
        // A queued change gets its own ☐ line - without this the only trace is the stream's absence from the ☑ summary. Appended by whichever preset path
        // runs (on a skipped file nothing is dropped, so an unconditional line would announce work that never happens). No [input=...] tag: no setting
        // causes this, the stream simply is not video. In the designed run order clean_and_remux has already dropped these, so this only fires when
        // video_clean runs standalone or first - exactly when no other plugin's log explains the removal.
        const coverArtLog = coverArtStreams
            .map((s) => `☐${streamTag(s.index)} Remove cover-art/thumbnail (video-${codecNameOf(s) || 'unknown'})\n`)
            .join('');
        // Apple/QuickTime fourCC for a COPIED stream (QT_VIDEO_TAG) and the -tag:v:0 that writes it, gated on isQtVideoContainer rather than isMp4Family
        // (see its definition).
        const qtFourcc = (cn) => (isQtVideoContainer(dstContainer) ? tableGet(QT_VIDEO_TAG, cn, '') : '');
        const qtVideoTag = (cn) => (qtFourcc(cn) ? ` -tag:v:0 ${qtFourcc(cn)}` : '');
        // The streams an exit's output maps, the primary as that exit writes it (`written`): the source stream on a copy, the encode at its own frame rate on
        // a transcode (encodeRate), the original's stream on a restore. The mp4 muxer times a tmcd by the video it receives (mp4TimedVideo) and writes one
        // per video it maps, so the drop lines, the summary and mp4TimecodeArgs are built from these. Their videos are in output order on every exit: the
        // primary maps first (mapAll), and a restore maps the original's first.
        const keptFor = (written) => outStreams.filter((s) => !coverArtStreams.includes(s) && !uncopyable.includes(s))
            .map((s) => (s === primary ? written : s));
        const dropLog = (written) => coverArtLog + mp4UncopyableLog(dstContainer, uncopyable, keptFor(written));
        // input streams minus dropped cover-art video and any uncopyable data track the muxer does not rebuild, with the ones it does rebuild last and the
        // ones it creates (mp4CreatedTracks) where it writes them, and the flags the output is read back with (readBackDispositions, judged on the preset
        // sealPreset has just set) - which may hand back a copy of the primary, so it is recognised by its source index
        const mappedFor = (written) => {
            const kept = keptFor(written);
            const goneData = mp4LostData(uncopyable, kept);
            const shown = mp4RebuiltLast(dstContainer, outStreams.filter((s) => !coverArtStreams.includes(s) && !goneData.includes(s)),
                uncopyable, mp4CreatedTracks(dstContainer, kept));
            return readBackDispositions(dstContainer, shown, carriesDisposition(response.preset));
        };
        const isPrimary = (s) => s.index === primary.index;
        // Maps each stream to how this exit's output reads it back, once the track-name carry has run (mp4NameCarryView).
        const carriedFor = (written) => mp4NameCarryView(dstContainer, keptFor(written));
        // The output summary of every exit but the restore (which summarises its restored stream detached). Only the primary video's token differs between
        // them, so it is the first argument; every other stream is summarised as it reads back (carriedFor), through enrichStream as the input summary is.
        const expectedResultsLine = (primaryToken, written = primary) => {
            const carried = carriedFor(written);
            return `☑Expected results: ${mappedFor(written).map((s) => (isPrimary(s) ? primaryToken
                : summariseStream(movLangReadBack(dstContainer, dvCopyReadBack(dstContainer, enrichStream(carried(s))))))).join('')}\n`;
        };
        // The ending every exit's preset shares: the mp4 tag plan, timecode and name-carry args, muxer, and the log lines for these and the drops. writes holds
        // the global tags the exit sets (the transcode's globalWrites, a verdict's VQ_TAG; none on the strip); written is the primary as keptFor takes it.
        // dropsDv says the exit itself takes the primary's Dolby Vision away (a strip, an encode that carries no RPU), so no .mov box of its is lost; act is
        // what movDvLossLine calls this write. Every video the exit copies takes the Profile 5 retag (dvCopyFourccArgs) and its lines: the secondaries
        // always, the primary only where copied says the exit copies it (the caption-withdraw and keep passes) - an encode, strip or restore writes it
        // under its own fourcc, so a stand-in keeps its output ordinal, and the restore says its copied original's own loss beside its Expected results.
        // On an encode the copied streams' loss line names the encode's copy.
        const sealPreset = (inputSide, out, writes, written = primary, { dropsDv = false, act = 'remux', copied = false } = {}) => {
            const tagPlan = mp4TagPlan(dstContainer, file.ffProbeData.format?.tags, writes);
            const kept = keptFor(written);
            const copies = copied ? kept : kept.map((s) => (s === written ? { codec_type: 'video' } : s));
            response.infoLog += mp4NameCarryLog(dstContainer, kept) + dvCopyFourccLog(dstContainer, copies) + movLangRespellLog(dstContainer, kept);
            response.preset = `${inputSide}<io>${out}${dvCopyFourccArgs(dstContainer, copies)}${movLangRespellArgs(dstContainer, kept)}`
                + `${mp4TimecodeArgs(dstContainer, kept)}${mp4NameCarryArgs(dstContainer, kept)}${mp4MovflagsArg(dstContainer, tagPlan)}${globalOutputOpt}`
                + `${outputMuxerArg(dstContainer)}`;
            response.processFile = true;
            response.infoLog += dropLog(written) + mp4TimecodeLog(dstContainer, kept) + mp4TagPlanLog(tagPlan, dstContainer)
                + dvCopyLossLine(dstContainer, copies, act === 'encode' ? 'encode\'s copy' : act)
                + movDvLossLine(dstContainer, kept.filter((s) => !dropsDv || s !== written), act) + roleLossLine(dstContainer, kept, act);
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
            sealPreset('', `${mapAll} -c copy -bsf:v:0 ${bsf}${outputDrops}${qtVideoTag(srcCodecName)}${riffTag} -c:a copy -c:s copy${strictArg}`, undefined,
                primary, { dropsDv: stripDv });
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
            const copyRefused = copyRefusedSkipLine(dstContainer, [primary], '[hdr_mode=strip_dynamic]');
            if (copyRefused) return skip(copyRefused);
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
        const guardDvLive = guardDvOn && action !== 'hdr_cleanup_only';
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
        // re-deciding is that one decode - paid only when a progressive file with deinterlace=enabled re-cycles and nothing cheaper triggers an encode, or its
        // awk_video fence was written without deint (coreHolds) - too low to justify cross-pass persistence machinery or the whole-file remux write it would
        // force on files that never transcode. Nothing may read idetMemo's value except through idet() - and deintVerdictLine, which reads the memo raw by
        // design so emitting the verdict can never itself provoke the decode (see its comment).
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
            idetMemo = detectInterlace(ffmpegPathOf(otherArguments), file.file, startSec, primary.index);
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
        // What the repair does to the frame rate, as [times, over]: send_field emits a frame per field, fieldmatch+decimate keeps 4 frames of every 5.
        const deintRateScale = () => {
            const deint = resolveDeintFilter();
            return deint.startsWith('bwdif=mode=send_field') ? [2, 1] : deint.startsWith('fieldmatch') ? [4, 5] : [1, 1];
        };
        // The encode's frame rate, in ffprobe's spelling. The muxer times a tmcd by it (mp4TimedVideo), so the repair can decide whether the output keeps one:
        // a 29.97 drop-frame timecode keeps its tmcd at send_field's 59.94 and loses it at fieldmatch's 23.976 (measured 2026-10-23, jellyfin 7.1.4). What the
        // repair scales is the rate ffmpeg feeds the encode, not the avg_frame_rate a copy keeps: av_guess_frame_rate takes r_frame_rate, or avg_frame_rate
        // where avg is under 70 fps and r over 210 (FFmpeg 7.1 libavformat/avformat.c). Measured 2026-10-23 on VFR mp4s with a drop-frame tmcd: r 29.97 beside
        // avg 18.1 keeps it, r 240 beside avg 24.3 loses it. For H.264, MPEG-1/2 and VC-1 it may then take the codec's own declared rate instead
        // (encodeRateUpTo). awk-ffmpeg-test's fmtprobe create:tmcd-encrate re-measures it.
        const encodeRate = () => {
            const avg = fracOf(primary.avg_frame_rate);
            const rate = String((avg > 0 && avg < 70 && fracOf(primary.r_frame_rate) > 210 ? primary.avg_frame_rate : primary.r_frame_rate) || '').trim();
            const m = /^(\d+)\/(\d+)$/.exec(rate);
            const [times, over] = deintRateScale();
            return m && times !== over ? `${Number(m[1]) * times}/${Number(m[2]) * over}` : rate;
        };
        // Whether encodeRate is only the most the encode can run at (marked rateUpTo; mp4TimecodeArgs says what follows). av_guess_frame_rate takes the codec's
        // own declared rate instead where that is valid and under 0.7 of r, for an H.264, MPEG-1/2 or VC-1 source (AV_CODEC_PROP_FIELDS) whose avg strays over
        // 10% from r - tested as avformat.c does, avg/r in one division, so an avg of 0/0 is NaN and never qualifies. Measured 2026-10-23 on jellyfin 7.1.4: an
        // h264 at r 300 whose SPS declares 200 encodes at 200 beside avg 265 and at 300 beside avg 270 (exactly 10%). Nothing the plugin is given settles the
        // declared rate, so none is read: ffprobe never prints it; mediainfo.js 0.2.0 shows an H.264 SPS rate only where fixed_frame_rate_flag is set, a VC-1
        // declaring 120 not at all, and for MPEG-1/2 the LAST sequence header it parsed (MediaInfoLib File_Mpegv), while ffmpeg takes MPEG-2's from the first
        // decoded picture (mpeg12dec.c mpeg_decode_postinit) and MPEG-1's from the last header its parser met in find_stream_info's packets (about 40 on these
        // mp4s; unset where that one carries a forbidden code). So an MPEG-2 whose first 12 frames declare 240 then 25, and an MPEG-1 whose first 4 headers
        // carry code 0 then 25, read 25.000 in mediainfo.js and encode at r 300. Nor does MPEG-2's highest declaration (60 x 4 = 240) bound it: an mp4 with no
        // sequence header in its first 1500 frames or its esds decodes no picture inside find_stream_info's 5 s, so ffmpeg's rate stays unset and an MPEG-2 at
        // r 400 encodes at 400 (2026-10-23, mediainfo.js 0.2.0 and jellyfin 7.1.4). Where encodeRate takes avg it is under 70 fps: the mark goes unread.
        const encodeRateUpTo = () => {
            const [an, ad] = String(primary.avg_frame_rate || '').split('/').map(Number);
            const [rn, rd] = String(primary.r_frame_rate || '').split('/').map(Number);
            return ['h264', 'mpeg1video', 'mpeg2video', 'vc1'].includes(srcCodecName) && Math.abs(1 - (an * rd) / (ad * rn)) > 0.1;
        };
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
        // Only a HEIGHT is ever needed to express the box: scale=-2:N derives the width from the coded aspect, so fitting the frame collapses to the
        // smaller of the cap and the height at which the frame is exactly the box's width (16/9 of its height) wide. Rounded DOWN to even - 4:2:0 needs an
        // even height, and rounding up would breach the box. dispWidth is the CODED width (rotation-adjusted), deliberately NOT SAR-corrected, because
        // scale=-2:N derives its width from coded dimensions too: a display-corrected test would predict a width the filter does not emit. Verified this
        // changes no answer for the real anamorphic cases (1440x1080 SAR 4:3, 720x576 SAR 64:45 land identically either way). A dispWidth of 0 - no width
        // from either probe - degrades to height-only fitting rather than refusing, since the width bound then contributes nothing. That ternary is not
        // dead code to be tidied away: without it the division yields Infinity, which happens to reach the same height today, and nothing would catch a
        // later edit that stopped it doing so.
        const evenFloor = (n) => Math.max(2, Math.floor(n / 2) * 2);
        // The height this file lands at inside a 16:9 box h tall - its own height where it already fits. The awk_video fence asks it of a fence's box too.
        const boxHeight = (h) => Math.min(h, dispWidth > 0 ? evenFloor(Math.round(h * 16 / 9) * dispHeight / dispWidth) : dispHeight);
        // < dispHeight, not dispHeight > h: a wide-but-short source is already inside the box (854x480 under a 720 cap bounds at 718, above its own 480)
        // and must not read as needing work.
        const scalesInto = (h) => h > 0 && boxHeight(h) < dispHeight;
        const capHeight = boxHeight(maxH);
        const willDownscale = scalesInto(maxH);
        // With no downscale the frame is the source's, less the row an odd height loses to buildVideoArgs' crop: the tier, the fence's q token and every
        // prediction must describe what the encode writes, or a 577-, 721- or 1081-line source is encoded at the tier above and re-read at its own.
        const outHeight = willDownscale ? capHeight : dispHeight - (dispHeight % 2);
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
        // floorRate is the rate the floor would decline the re-encode at, read from the probes alone; whether it does is decided late, where the floor is the
        // last word (shrinkDeclined, in the transcode branch): guard_lossless, the Dolby Vision and HDR refusals, the awk_video fence and a lossless strip all
        // answer for the file ahead of it, so theirs is the line shown, and the timeline read is spent only where the floor's verdict decides the file.
        let floorRate = null;
        if (action === 'shrink' && codecTrigger && guardShrinkKbps > 0) {
            // ffprobe's file rate is size over the stated duration. A file that starts well after zero may have kept another recording's clock (a -copyts
            // remux, a segment-muxer part), so its stated end or its gaps can make the rate read low, and a ts/ps duration is estimated from first and last
            // timestamps. So the rate is read only on Matroska and mp4 files (markerPersists) starting within 1 s of zero, a missing start counting as zero
            // (ffmpeg's ts clock starts at 1.4 s; rebased files start within 0.12 s); elsewhere the video's own rate decides. ffmpeg's Matroska writer states
            // the duration as the absolute end, so a start s reads the rate low by s/duration (a 10 s clip from 1.0 s read 9.1% low on 7.1.4): the start must
            // also be within 1% of the duration.
            const fmt = file.ffProbeData.format || {};
            const start = Number(fmt.start_time);
            const duration = Number(fmt.duration);
            const zeroStart = markerPersists(dstContainer) && !(start > 1) && !(start > 0.01 * duration);
            // Both rates in whole kbps, the unit the floor is set in: a sub-kbps figure reads as none, and two that round alike leave the video's own deciding.
            const ownKbps = Math.round((resolveStreamBitrate(primary) || 0) / 1000);
            const fileKbps = zeroStart ? Math.round((Number(fmt.bit_rate) || 0) / 1000) : 0;
            // The video's bytes are a share of the file's over the same span, so the whole file's rate bounds the video's: it decides when the video
            // reports no rate of its own, or a higher one.
            const fileDecides = fileKbps > 0 && (ownKbps === 0 || fileKbps < ownKbps);
            const kbps = fileDecides ? fileKbps : ownKbps;
            if (kbps > 0 && kbps < guardShrinkKbps) floorRate = { kbps, ownKbps, fileDecides, zeroStart, start: start || 0, duration };
        }
        // Whether the floor declines the re-encode, decided once (shrinkDeclined asks). A timeline that starts at zero can still hold gaps (a concat-demuxer
        // join, a -copyts -start_at_zero remux, a plain remux of a file that kept one), and a gap dilutes both rates - an mp4's stream rate is its bytes over
        // the gapped duration (24.5 s of 10 Mb/s video across a one-hour jump read 68k) - so on a zero-start Matroska/mp4 the video's packets are looked for
        // first (timelineGaps): any gap waives the floor and guard_shrink_savings judges the encode instead, and a read that fails leaves the video's own rate
        // deciding. A gap shorter than a window, or several, can all fall between the windows (a concat join's ~10.6 s gaps read 3631k against a true
        // 10063k), which only a whole-stream packet read would close, at a full demux of every lean file per pass; a still longer than 10 s reads as a gap.
        let belowFloorLine = '';
        let floorMemo = null;
        const floorDeclines = () => {
            if (floorMemo !== null) return floorMemo;
            const { ownKbps, fileDecides, zeroStart } = floorRate;
            const tag = `${pTag}[guard_shrink_bitrate=${guardShrinkKbps}]`;
            const read = zeroStart ? timelineGaps(file.file, primary.index, floorRate.start, floorRate.duration) : {};
            const reading = fileDecides ? `The whole file runs at ${floorRate.kbps}k` : `Source video bitrate ${floorRate.kbps}k is`;
            if (read.gaps) {
                response.infoLog += `☒${tag} ${reading}${fileDecides ? ',' : ''} below the ${guardShrinkKbps}k floor, but its video leaves gaps in the`
                    + ' timeline, which dilute that rate - the floor does not apply\n';
                floorMemo = false;
                return floorMemo;
            }
            // A failed read where the whole file's rate decided hands the decision to the video's own rate, which stands only where it is under the floor too.
            const ownTakesOver = fileDecides && !!read.why;
            if (ownTakesOver) {
                response.infoLog += `☒${tag} ${reading}, but its timeline could not be checked (${read.why}), ${ownKbps
                    ? 'so the video\'s own rate decides' : 'and the video reports no rate of its own - the floor does not apply'}\n`;
            }
            floorMemo = !ownTakesOver || (ownKbps > 0 && ownKbps < guardShrinkKbps);
            if (floorMemo) {
                belowFloorLine = fileDecides && !ownTakesOver
                    ? `☑${tag} The whole file runs at ${floorRate.kbps}k, below the ${guardShrinkKbps}k floor, so its video does too (${ownKbps
                        ? `it reports ${ownKbps}k of its own` : 'it reports no bitrate of its own'}) - already efficient, left untouched\n`
                    : `☑${tag} Source video bitrate ${ownKbps}k is below the ${guardShrinkKbps}k floor - already efficient, left untouched\n`;
            }
            return floorMemo;
        };
        // The shrink re-encode is the only reason left to encode, and the floor declines it.
        const shrinkDeclined = () => !!floorRate && !willDownscale && !tonemap && !deinterlaceNeeded() && floorDeclines();
        // A same-codec size pass has ONE stop - the awk_video fence below - and a container that cannot store the tag has nowhere to keep it: the next pass
        // recomputes the identical fingerprint, finds nothing, and re-emits a byte-identical preset, which Tdarr refuses as an infinite transcode loop and
        // ERRORS the file (across separate library scans, where that guard does not apply, it is generational re-encoding instead). Drop the codec trigger
        // rather than the file: a downscale, tonemap or deinterlace pass converges on its own evidence and still runs. normalize needs no fence at all - it
        // fires only on a codec mismatch, which the encode itself removes. A file under the floor is the floor's to decline: no timeline read runs on such a
        // container, so its verdict there is already final, and its line the accurate one.
        let fenceUnstorable = false;
        if (action === 'shrink' && codecTrigger && !floorRate && !markerPersists(dstContainer)) {
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
        // no-trigger skip with the fence line instead of its accurate reason. codecTrigger still holds a re-encode under the floor (floorRate): the refusals
        // below and the fence answer for such a file first, and the floor decides it inside that branch (shrinkDeclined).
        const cheapTrigger = codecTrigger || willDownscale || tonemap;
        // Interlace repair forces a real encode exactly as a downscale or a tonemap does.
        const realTranscode = () => cheapTrigger || deinterlaceNeeded();
        const canEncodeTarget = ENCODABLE_CODECS.includes(targetCodecName);
        // No cross-compatible base (compat id 0 / no surviving HDR transfer, e.g. profile 5): the mp4 output needs the dvh1 tag - hvc1 drops the DV box
        // entirely; a stream WITH a base keeps hvc1.
        const preserveDvNoBase = preserveDv && (dvNoBaseLayer || (!!dovi && dovi.compatId === 0));

        // Skips that a pending real transcode would otherwise turn destructive. guard_lossless leads the block: it is the one that says
        // "don't touch this file at all", so it should answer for a lossless source whatever else also applies. It keys on realTranscode,
        // so the lossless -c:v copy paths (hdr_cleanup_only, a bare strip_dynamic) still run - they cost the master nothing.
        if (guardLosslessOn && LOSSLESS_VIDEO_CODECS.includes(srcCodecName) && realTranscode()) {
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
        // A .mov cannot hold such an encode: its muxer refuses dvh1 (exit 183 at header write, after the test encodes, on every requeue), and under hvc1
        // the picture is written with no Dolby Vision box and reads mis-coloured (both measured on jellyfin-ffmpeg 7.1.4 with a real Profile 5 sample).
        if (preserveDvNoBase && dstContainer === 'mov' && realTranscode()) {
            return skip(`☒${pTag}[guard_dv=enabled] ${dvLabel} has no compatible base layer, so its re-encode needs a Dolby Vision box a .mov cannot hold`
                + ` - left untouched; run clean_and_remux first to move the file to mp4 or mkv\n`);
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
        // `removed` (sub_worker filtered the bitstream copy away in its own -c copy pass) is a memo, so it changes no encode command: on a true tag -a53cc 0
        // removes nothing and neither does a missing -a53cc 1, while a FALSE one - an outside tool's re-encode carries the global tag onto a video that still
        // has its captions - would drop them on every encoder. guard_captions treats such a file as untagged, and says so where its probe finds captions.
        const ccAlreadyGone = ccTokens.includes(CC_TOKENS.removed);
        // `none` is not read here: it is sub_worker's memo that no CEA-608 text was found, and a CEA-708 service reads exactly so (the handoff section).
        const dropCaptions = ccExported;
        // Only `true` is information. Tdarr's optional caption scan reads false both for a file that genuinely has none and for one its bundled CCExtractor
        // could not parse (measured: every mp4, and MPEG-2 inside Matroska), so a false still has to be probed. Memoized to at most one probe per file - that
        // cost is the whole reason the check is skipped wherever the answer could not change the outcome.
        let ccVerdict = null;
        const detectCaptions = () => {
            if (ccVerdict) return ccVerdict;
            if (file.hasClosedCaptions === true) { ccVerdict = { present: true, via: 'the library caption scan' }; return ccVerdict; }
            // A synthetic node (injectedCap): a missing key reads as "no captions", never as a real probe - bar 'probe', which runs the real one for the
            // harness to answer, so it can count the probe and give the 'unknown' an unreadable probe gives. A real node carries no injectedCap.
            const r = probeA53Captions(file.file, deriveFfprobePath(ffmpegPathOf(otherArguments)), primary.index,
                injectedCap && injectedCap.captions !== 'probe' ? injectedCap.captions === true : undefined);
            ccVerdict = { present: r === true, unknown: r === 'unknown', via: 'a bitstream scan' };
            return ccVerdict;
        };

        // guard_shrink_savings judges against the library original Tdarr hands every classic plugin. With none to compare the guard is inert, so no pass
        // writes a pending marker that no verdict could ever read.
        const fmtTags = file.ffProbeData.format?.tags || {};
        const origLib = otherArguments?.originalLibraryFile;
        const origProbe = Array.isArray(origLib?.ffProbeData?.streams) ? origLib.ffProbeData : null;
        const savingsLive = guardShrinkSavings > 0 && !!origProbe;
        const savingsTag = `[guard_shrink_savings=${savingsText}]`;
        const origPath = String(origLib?.file || '');
        const origPrimary = origProbe ? primaryVideo(origProbe.streams) : undefined;
        const origFormat = String(origProbe?.format?.format_name || '');
        // A recover_bad_* repair in this job rewrote the video stream: the working file's stamp differs from the original's.
        const recoveredHere = !!origProbe && getTagCI(fmtTags, RECOVERED_TAG).trim() !== getTagCI(origProbe.format?.tags, RECOVERED_TAG).trim();
        // Why an encode is not a pure size pass, worded for its line ('' when it is one). The encode decides this itself, from its own triggers: on the next
        // pass every transform re-reads as done (already capped, SDR, progressive, static), and a restore would put back the original bitstream - the
        // captions sub_worker asked to have removed, or removed itself earlier in this job (`removed` here and not on the original), or what a recovery
        // repaired, included.
        const sizeExemptWhy = () => (willDownscale ? `downscales to ${outHeight}p` : tonemap ? 'tonemaps to SDR' : deinterlaceNeeded() ? 'deinterlaces'
            : effHdrMode === 'strip_dynamic' && isDynamicHdr ? 'strips the dynamic HDR' : ccExported ? 'removes the closed captions sub_worker asked for'
                : ccAlreadyGone && !ccTokensOf(origProbe?.format?.tags).includes(CC_TOKENS.removed) ? 'follows sub_worker\'s caption removal'
                    : recoveredHere ? 'follows clean_and_remux\'s recovery' : '');
        // The restore refusals the two probes and the original's path decide alone ('' when none applies). The encode's own pass reads them too: an encode
        // whose original can never be put back is not judged at all, and the verdict re-checks them as a backstop.
        const staticRefusal = () => {
            if (!origPrimary) return 'the original has no video stream';
            // The restore reads the original with no input flags - outside the Matroska and MP4 demuxers, the case clean_and_remux's container-forced
            // -fflags +genpts / -avoid_negative_ts exists for. Measured 2026-10-22: an AVI, or an MPEG-PS whose packets lack pts, exits 234 ("Can't write
            // packet with unknown timestamp") on every requeue; a TS or PS that does read back is rebased on its own start, so a video offset from the audio
            // collapses to 0 (522 ms on a TS, 539 ms on a PS) and is fenced that way. +genpts fixes the AVI exit but not the TS/PS sync (ffmpeg anchors a
            // TS/PS input on the streams it maps). The probed demuxer decides, never the extension.
            if (origFormat !== MATROSKA_DEMUXER && origFormat !== MP4_DEMUXER)
                return `the original is ${logSafe(origFormat || 'of an unknown format', 40)}, which cannot be read back in step with this file's other streams`;
            if (!pathIsPresetSafe(origPath)) return 'the original\'s path holds a character a preset cannot carry';
            if (containerRefusesCopy(dstContainer, codecNameOf(origPrimary)))
                return `a .${dstContainer} file cannot hold the original's ${codecNameOf(origPrimary)} video`;
            return '';
        };

        // What scale=-2 will emit beside outHeight, in the same DISPLAY orientation (ffmpeg autorotates ahead of the filter chain): the operating point
        // a test-encode line names, and the predicted output stream's width (an odd one less the column the crop takes, as outHeight).
        const outWidth = willDownscale && dispHeight > 0 ? Math.max(2, Math.round(dispWidth * outHeight / dispHeight / 2) * 2) : dispWidth - (dispWidth % 2);

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
            // tonemapSetparams stamps the island). A tonemap already landed bt709 above and must keep it, so the stamp skips that case. A guard_dv encode into
            // .mov carries the RPU but no box (movLosesDvBox), so the next pass reads it like a discarded layer.
            if (isDynamicHdr && (!preserveDv || dstContainer === 'mov')) {
                clearDynamicHdrCarriers(outStream);
                if (!tonemap && !HDR_TRANSFERS.includes(srcXfer)) outStream.color_transfer = inferredHdrCurve;
            }
            return summariseStream(outStream);
        };

        // The caption-removal line, ahead of the encoder notes.
        const ccDropLine = () => (dropCaptions ? `☐${pTag} Dropping the embedded closed captions - sub_worker exported them to a subtitle, and keeping both`
            + ' would show them twice\n' : '');

        // The source frame rate where two readings agree, times what the interlace repair does to it; 0 otherwise. It bounds only how long a CPU test
        // encode may show no output before it is too slow for guard_encode_hours - the estimate itself is read from media time, because a declared rate can
        // be far off (a screen capture declaring 100/1 measured 12.2 fps, which would make every slow encoder look hopeless). It counts frames, so it reads
        // avg_frame_rate, never encodeRate's declared rate: an encode into a container that allows variable frame rates passes every frame through.
        const corroboratedFps = () => {
            const avg = fracOf(primary.avg_frame_rate);
            if (!(avg > 0)) return 0;
            const dur = Number(file.ffProbeData.format?.duration) || 0;
            const nb = Number(primary.nb_frames);
            const agree = (String(primary.avg_frame_rate) === String(primary.r_frame_rate) && avg <= 60)
                || (isMp4Family(dstContainer) && nb > 0 && dur > 0 && Math.abs(nb - dur * avg) <= 0.05 * dur * avg);
            if (!agree) return 0;
            const [times, over] = deintRateScale();
            return avg * (times / over);
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
            let captionGate = guardCaptionsOn && !dropCaptions ? 'open' : 'off';   // open -> not probed yet; survive -> skip every dropper
            let ccContradicted = false;   // awk_cc says `removed`, and the probe found the captions this encode now keeps
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
                    preserveDv, preserveDvNoBase, deintFilter: resolveDeintFilter(), dropCaptions, sliceDecode,
                    oddSize: srcWidth % 2 === 1 || srcHeight % 2 === 1 });
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
                    if (ccAlreadyGone) {
                        ccContradicted = true;
                        captionLines.push(`☒${pTag}[guard_captions=enabled] ${CC_TAG} says sub_worker removed the closed captions, but the video still carries`
                            + ' them - keeping them\n');
                    }
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
                    captionForced: !!displaced && chosen.c.family === 'cpu', ccContradicted, captionLines, notes, memLines: chosen.mem.lines };
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
        const emitTranscode = (encodeTag, { videoSig, videoSigCore, priorSig }) => {
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
            let out = `${mapAll} -c copy ${enc.videoOut} -c:a copy -c:s copy${outputDrops}${strictArg}`;
            // The encoded primary is output v:0 (cover art and uncopyable streams are mapped out, as -filter:v:0 relies on) - see staleStatsArgs.
            const clearStats = isMatroskaFamily(dstContainer);
            if (clearStats) out += staleStatsArgs('v:0', primary);
            // Retire the request this encode just served. ccExported implies dropCaptions, and buildVideoArgs suppresses A53 on every encoder that can emit it
            // under dropCaptions ('keep', 'unreliable' and 'optin' in A53_CAP) while the rest drop it unaided, so the output provably carries no captions -
            // `removed` is the accurate successor to `strip`, and it is the token that stops any later pass paying a caption probe. The read's fingerprint goes
            // with the request: it describes a video this encode replaces. Only fires when a request was actually present.
            if (ccExported) {
                const retired = [...new Set(ccTokens.filter((t) => !t.startsWith(CC_FP_PREFIX)).map((t) => (t === CC_TOKENS.strip ? CC_TOKENS.removed : t)))];
                globalWrites[CC_TAG] = escMeta(retired.join(','));
            } else if (pick.ccContradicted) {
                // A false `removed` memo goes: the captions it says are gone are in this encode's output. Every other token stays.
                globalWrites[CC_TAG] = escMeta(ccTokens.filter((t) => t !== CC_TOKENS.removed).join(','));
            }
            // A pure size pass asks to be judged on the next pass (SHRINK SAVINGS VERDICT); every other encode clears a verdict the source carries, which
            // described the video this encode replaces.
            const exemptWhy = sizeExemptWhy();
            // An original that can never be put back leaves nothing to judge, so the encode writes no marker and says why here, not one pass later.
            const unrestorable = savingsLive && action === 'shrink' && !exemptWhy ? staticRefusal() : '';
            const judged = savingsLive && action === 'shrink' && writeFence && !exemptWhy && !unrestorable;
            if (judged) globalWrites[VQ_TAG] = escMeta(`encoded:${videoSigCore}:${savingsText}`);
            else if (getTagCI(fmtTags, VQ_TAG).trim() !== '') globalWrites[VQ_TAG] = '';
            // Every container-global write is one globalWrites entry (each value escMeta'd as it goes in), emitted here in the order it was set, so the
            // map mp4TagPlan reads and the -metadata the muxer gets cannot disagree.
            for (const [k, v] of Object.entries(globalWrites)) out += ` -metadata "${k}=${v}"`;
            const encoded = { ...primary, avg_frame_rate: encodeRate(), rateUpTo: encodeRateUpTo() };
            sealPreset(enc.inputSide, out, globalWrites, encoded, { dropsDv: !preserveDv, act: 'encode' });
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
            if (savingsLive && action === 'shrink' && exemptWhy)
                response.infoLog += `☐${pTag}${savingsTag} This encode also ${exemptWhy} - it is not judged on size\n`;
            else if (unrestorable) {
                response.infoLog += `☐${pTag}${savingsTag} This encode is not judged on size - the original video stream cannot be put back`
                    + ` (${unrestorable})\n`;
            }
            response.infoLog += `☐${pTag}${encodeTag} Transcoding video @ ${sel.encoderName} q${Math.round(qNorm)}\n`;
            response.infoLog += expectedResultsLine(predictTranscodedVideoToken(), encoded);
            return response;
        };
        // The pass that withdraws a caption request whose read may belong to another video (ccStripStaleWhy): a tag-only remux keeping only the stale
        // fingerprint - the `strip`, both read tokens and `imported` all go - which is the "withdrawn" shape sub_worker reads to move the old sidecar aside
        // and read the captions of the video that is there. Nothing is encoded and no awk_vq or awk_video is written; its arguments differ from every
        // encode, restore and keep pass.
        const emitCcClear = (why) => {
            response.infoLog += `☒${pTag} awk_cc asks to drop the closed captions sub_worker exported, but the caption read behind it may belong to another`
                + ` video (${why}) - withdrawing the request so the captions are read again before any encode\n`;
            const v = escMeta(`${CC_FP_PREFIX}${ccFpOf(ccTokens)}`);
            sealPreset('', `${mapAll} -c copy${outputDrops}${strictArg} -metadata "${CC_TAG}=${v}"`, { [CC_TAG]: v }, primary, { copied: true });
            response.infoLog += expectedResultsLine(summariseStream(dvCopyReadBack(dstContainer, enrichStream(primary))));
            return response;
        };
        // ====== END TRANSCODE EMIT ======

        // Idempotency fence: a settings fingerprint in the container-global awk_video tag. Essential for shrink, whose constant-quality same-codec re-encode
        // would otherwise re-shrink every pass (a generational death spiral); never load-bearing for normalize, which only fires on a mismatch its own encode
        // removes, so normalize skips it where storing it costs something (mp4 family; writeFence). action is in the core so a normalize-tagged file isn't
        // fenced under shrink. The -v<version> suffix is forensic, outside the match (as audio_clean's awk_loudnorm), so a version bump never unfences a file.
        // EVERY input that can fire a transcode must appear here, or turning it on leaves the fingerprint unchanged and the file is skipped as "already
        // processed at this exact setting" with the work it asks for never run. The fingerprint is a FIXED POINT, not a pure function of the settings: four
        // SOURCE-derived tokens are right only because the output re-reads as what produced them - targetCodecName under codec=source, want10Bit under
        // method_bitdepth=source, q from the OUTPUT height, dv from preserveDv. Do NOT "correct" one to key on its setting: keying dv on guardDvLive would
        // stamp it on EVERY file run with guard_dv enabled (the default), invalidating every awk_video tag in the field (a full re-encode for every user) to
        // prevent a divergence that cannot occur - a preserved encode carries the RPU through, so pass 2 re-reads dvSignal and recomputes the same token
        // (measured on jellyfin 7.1.4 with a real profile-8.1 RPU: dvhe/p8 in, hvc1/p8 out, record intact - re-measured 2026-11-14; build-facts.md). Pinned
        // by scenario assertion video-clean-a-preserved-dv-output-still-matches-its-own-fence: a detection drift fails there instead of silently re-encoding a
        // library every pass. A .mov output re-reads with no Dolby Vision, as ffmpeg cannot write the box there; tokenIsNoop passes dv on such a file.
        const videoSigCore = escMeta([action, targetCodecName, `q${Math.round(qNorm)}`, `h${maxH || 0}`, want10Bit ? '10' : '8', `s${speed}`,
            ...(effHdrMode === 'tonemap_sdr' ? ['sdr'] : []), ...(effHdrMode === 'strip_dynamic' ? ['strip'] : []), ...(preserveDv ? ['dv'] : []),
            ...(deinterlaceLive ? ['deint'] : [])].join('-'));
        // The guard_shrink_savings verdict this file carries (SHRINK SAVINGS MEASUREMENT has the grammar). A reject at another threshold no longer fences
        // it where the saving it recorded could pass the new one: the setting that did not work is no longer the user's setting. The stamp's whole percent
        // is the saving rounded DOWN (a growth too), so the saving lies in [pct, pct + 1) and below the old threshold, and it could pass a new threshold T
        // exactly when T is under both: a raised threshold changes nothing and re-encodes nothing, and 0 retries only an encode that saved something. A keep
        // never unfences - the library file IS the kept encode, and re-encoding it would be generational.
        const vqNow = parseVq(getTagCI(fmtTags, VQ_TAG));
        // The box and speed tokens, spelled from downscale's and method_speed's options (h0 is downscale=disabled), so the codec token h264 never reads as a
        // box. One missing here fails safe, as a re-encode.
        const FENCE_BOX_RE = /^h(?:0|2160|1440|1080|720)$/;
        const FENCE_SPEED_RE = /^s(?:slow|medium|fast)$/;
        // A fence or verdict written at OTHER settings still holds when every token that differs is a no-op on this file: an encode for it would only add a
        // lossy generation to a kept file, or repeat the encode a reverted one rejected. h<N> passes where neither box scales the file, a stored one judged by
        // the meaning it was written with (heightOnly: a fence older than 3.28.0 capped the height alone - fenceBoxed below). sdr, strip and deint
        // pass when their setting is now off, or when it is on and the file gives it nothing to do: no HDR to tonemap, no dynamic layer to strip, idet reading
        // the file progressive (a decode, spent only when deint differs). Dropping one is a no-op over a reverted original too, because sizeExemptWhy never
        // judges - so never reverts - an encode that tonemapped, stripped or deinterlaced: a reject's core can carry sdr, strip or deint only where it did
        // nothing. The speed shapes only a new encode, so it passes except over a reverted original, where a new speed is a new try. dv passes on a file that
        // reads no Dolby Vision, which has no RPU to keep: a preserved encode written into .mov reads so (the fence comment above), and holding dv there would
        // encode it a second time before the shrink verdict. action, codec, q and bit depth never pass: a new action asks for different work, and the other
        // three re-read as what produced them (the fence comment above). Nothing is rewritten, so the stored fence keeps its own tokens and every later pass
        // decides the same way. A per-file fence (tokens only for what applied) would not converge: a repaired, tonemapped or downscaled output re-reads as
        // progressive, SDR or inside the box.
        const tokenIsNoop = (t, heightOnly = false) => (FENCE_BOX_RE.test(t)
            ? !(heightOnly ? Number(t.slice(1)) > 0 && Number(t.slice(1)) < dispHeight : scalesInto(Number(t.slice(1))))
            : FENCE_SPEED_RE.test(t) ? vqNow?.state !== 'reject'
                : t === 'sdr' ? !tonemap
                    : t === 'strip' ? !(effHdrMode === 'strip_dynamic' && isDynamicHdr)
                        : t === 'dv' ? !dvSignal
                            : t === 'deint' && (!deinterlaceLive || idet().kind === 'progressive'));
        // The tokens a stored core and this run's do not share: this run's, and the stored core's.
        const coreDiff = (core) => {
            const mine = videoSigCore.split('-');
            const theirs = String(core || '').split('-');
            return { mine: mine.filter((t) => !theirs.includes(t)), theirs: theirs.filter((t) => !mine.includes(t)) };
        };
        // boxed = false for a stored core written before the 16:9 box, whose own h<N> is judged by its height alone (tokenIsNoop).
        const coreHolds = (core, boxed = true) => {
            if (core === videoSigCore) return true;
            const d = coreDiff(core);
            return d.mine.every((t) => tokenIsNoop(t)) && d.theirs.every((t) => tokenIsNoop(t, !boxed));
        };
        const vqRetry = !!vqNow && vqNow.state === 'reject' && coreHolds(vqNow.core) && vqNow.t !== savingsText && vqNow.pct !== null
            && guardShrinkSavings < vqNow.pct + 1 && !(Number(vqNow.t) <= guardShrinkSavings);
        // The ffprobe the verdict's reads and the fence's fingerprint check use, located once and only when one of them runs ('' under the harness, whose
        // reads are injected).
        let ffprobeMemo = null;
        const savingsFfprobe = () => {
            if (ffprobeMemo === null) ffprobeMemo = injectedCap ? '' : deriveFfprobePath(ffmpegPathOf(otherArguments));
            return ffprobeMemo;
        };
        // videoDigest, read at most once per file and stream, so a pass that checks a fence and a caption request pays one spawn.
        const digestMemo = new Map();
        const digestOf = (filePath, absIndex) => {
            const key = `${absIndex}|${filePath}`;
            if (!digestMemo.has(key)) digestMemo.set(key, videoDigest(filePath, savingsFfprobe(), absIndex, FINGERPRINT_TIMEOUT_MS));
            return digestMemo.get(key);
        };
        // Why sub_worker's pending `strip` may belong to another video ('' when it is honoured), memoised: asked once, right before the encode that would
        // serve it (after every skip and refusal, before the test encodes). A request beside the caption track sub_worker imported is honoured with no read
        // - the captions are in this file as that track. Otherwise the read's inherited fingerprint is checked against the primary (ccFpStaleWhy, where a
        // failed read counts as stale). An mp4-family file keeps no track tag, so there any hearing-impaired mov_text track is that track whatever its
        // language - language_fill gives the imported one a language, as clean_and_remux's language_sub stop advises. The cost: an unrelated SDH track left
        // after the real one was removed by hand has a stale request honoured with no read.
        let ccStaleMemo = null;
        const ccStripStaleWhy = () => {
            if (ccStaleMemo !== null) return ccStaleMemo;
            const mp4Track = isMp4Family(dstContainer)
                && file.ffProbeData.streams.some((s) => codecNameOf(s) === 'mov_text' && s.disposition?.hearing_impaired === 1);
            ccStaleMemo = !ccExported ? ''
                : ccTokens.includes(CC_TOKENS.imported) && (mp4Track || importedCaptionTracks(file.ffProbeData.streams, ccTokens, () => false).length) ? ''
                    : ccFpStaleWhy(ccTokens, ccTokensOf(origProbe?.format?.tags), primary, () => digestOf(file.file, primary.index));
            return ccStaleMemo;
        };

        // Validating a fence that matches this run's settings. The awk tags survive an outside tool's re-encode (plain ffmpeg keeps every global tag, and
        // mkvmerge keeps them through a track swap), so a fence can describe a video stream that is no longer there. Only an INHERITED fence is checked - the
        // library original's own, or any fence when there is no original: one this job wrote on an earlier cycle is this plugin's fresh output, and a check
        // that ever misread it would re-encode with the same arguments, which Tdarr's identical-arguments guard errors. On an inherited fence a misread costs
        // at most one re-encode in a later job, and a judged shrink stamps that re-encode with a fingerprint the free checks never overrule.
        // Which job wrote a fence: the encode appends +j<8 hex of Tdarr's job id> to the forensic -v<version> suffix (outside the match). A token equal to this
        // job's marks this job's own fence even when its text equals the original's (a re-encode at an unchanged version); with no token on either side
        // (a fence from before the token, or a runner that passes no job) the full-string comparison with the original decides.
        const jobToken = otherArguments?.job?.jobId
            ? require('crypto').createHash('sha1').update(String(otherArguments.job.jobId)).digest('hex').slice(0, 8) : '';
        const priorSig = getTagCI(fmtTags, VIDEO_FENCE_TAG).trim();
        const fenceJob = (/\+j([0-9a-f]{8})$/.exec(priorSig) || [])[1] || '';
        const fenceInherited = fenceJob && jobToken ? fenceJob !== jobToken
            : !origProbe || priorSig === getTagCI(origProbe.format?.tags, VIDEO_FENCE_TAG).trim();
        // The crf the CPU encoder takes at this setting - nativeQuality, the function the encode itself uses, clamp included.
        const cpuCrf = Number(/-crf (\d+)/.exec(nativeQuality(targetCodecName, 'cpu', qNorm))[1]);
        // The crf an x264/x265 encode recorded in its settings line (mediaInfo Encoded_Library_Settings), when its library is the target codec's CPU encoder,
        // else null: libsvtav1 and every hardware encoder write no line (VideoToolbox measured), so their output is unknown, never contradicting. Measured: our
        // libx265 encode at q24 reads crf=24.0, an outside crf-30 x265 re-encode crf=30.0, an x264 one crf=20.0.
        const X26X_LIBRARY = { hevc: 'x265', h264: 'x264' };
        const x26xSettings = () => {
            const lib = tableGet(X26X_LIBRARY, targetCodecName, '');
            const m = /(?:^|[ /])crf=([\d.]+)/.exec(String(mi?.Encoded_Library_Settings || ''));
            const name = String(mi?.Encoded_Library_Name || String(mi?.Encoded_Library || '').trim().split(/\s+/)[0]).trim().toLowerCase();
            return lib && m && name === lib && Number.isFinite(Number(m[1])) ? { lib, crf: Number(m[1]) } : null;
        };
        // A keep or reject stamped at this setting vouches for the stream its pass left behind (SHRINK SAVINGS MEASUREMENT has the fingerprint), and
        // outranks the free checks: a restore puts the original under the fence on purpose, and its codec or height can contradict the fence's tokens.
        // Returns null when no stamp vouches, '' when it holds, or why it does not. The id8 is free; an 8-hex digest costs one bounded read, and a read
        // that fails proves nothing - it never undoes a fence. A stored n or x (an all-intra window, or a stamping read that failed) leaves identity only, and
        // so does sub_worker's later caption removal, which rewrites the H.264 packets (measured) without making the verdict false.
        const vqFingerprintStale = () => {
            const fp = vqNow && vqNow.state !== 'encoded' && coreHolds(vqNow.core) ? FINGERPRINT_RE.exec(vqNow.fp) : null;
            if (!fp) return null;
            if (fp[1] !== videoId8(primary)) return 'its format';
            if (!/^[0-9a-f]{8}$/.test(fp[2]) || ccAlreadyGone) return '';
            const dig = digestOf(file.file, primary.index);
            return dig !== null && dig !== fp[2] ? 'its content' : '';
        };
        // The free checks, for a fence no stamp vouches for (normalize and exempt encodes, guard_shrink_savings=0, every fence older than awk_vq): each reads
        // a fact the fence claims and the stream contradicts, with zero spawns, and an absent fact is unknown, never stale. Not checked: interlace (a decode
        // verdict, not metadata) and sdr (no real tonemap encode has yet been read as SDR on both probes). Returns [claimed, found] or null.
        // The height check reads only a fence 3.28.0 or later wrote: h<N> has meant "fits a 16:9 box N tall, in display orientation" only since then (before,
        // the cap was on the height alone, and before 3.12.0 on the coded height), and older fences were left to stand on purpose - a 2592x1080 scope film
        // fenced h1080 by 3.27.0 fails today's box without anything having touched it. A fence with no version that parses is not height-checked.
        const fenceVersion = (/-v(\d+)\.(\d+)\.(\d+)(?:\+j[0-9a-f]{8})?$/.exec(priorSig) || []).slice(1).map(Number);
        const fenceBoxed = fenceVersion.length === 3 && (fenceVersion[0] !== 3 ? fenceVersion[0] > 3 : fenceVersion[1] >= 28);
        const fenceContradiction = () => {
            const found = `${srcCodecName || 'unknown'}${dispWidth > 0 && dispHeight > 0 ? ` ${dispWidth}x${dispHeight}` : ''}`;
            if (srcCodecName && srcCodecName !== targetCodecName) return [targetCodecName, found];
            if (willDownscale && fenceBoxed) return [`${targetCodecName} within ${maxH}p`, found];   // no longer inside the fence's own h<N> box
            const x = x26xSettings();
            return x && Math.abs(x.crf - cpuCrf) > 0.5 ? [`${targetCodecName} at crf ${cpuCrf}`, `an ${x.lib} encode at crf ${x.crf}`] : null;
        };
        // '' when the fence holds, else what contradicts it, worded for the stale line (and for the implicit fence's line, where that still skips).
        const fenceStaleWhy = () => {
            const why = vqFingerprintStale();
            if (why !== null) {
                return why ? `${VQ_TAG} recorded this video stream when it was ${vqNow.state === 'keep' ? 'kept' : 'restored'}, and the video now differs`
                    + ` (${why})` : '';
            }
            const c = fenceContradiction();
            return c ? `${VIDEO_FENCE_TAG} says this file was encoded to ${c[0]}, but the video is ${c[1]}` : '';
        };

        // ====== SHRINK SAVINGS VERDICT ======
        // guard_shrink_savings, on the pass after this job's size-pass encode (its awk_vq=encoded:<core>:<T>). It sits ahead of realTranscode(), which can
        // spawn idet, so an encode left under guard_shrink_bitrate's floor is still judged. Only a marker this job wrote is judged (ownMarker below). First
        // match: a sibling that changed the video BITSTREAM in this job, a restore that cannot be done safely, or a bitrate that cannot be read keeps the
        // encode unjudged (keep:na); otherwise the measured saving keeps it or restores the original video stream. Every verdict pass replaces encoded:, so
        // the next pass reaches the fence and skips.
        // Only a marker THIS job wrote is pending: its fence carries this job's token, or - with no token on either side - the library original does not
        // carry the same marker. A Tdarr Flow runs a classic plugin once per job (pluginCycle 0, then the next flow node), so its encode reaches the library
        // still marked, and a later job would compare that file with itself and restore it onto itself as a reject:0. Such an encode stays as it is: one
        // line, no measurement, no stamp (a tag-only remux would only record "unjudged", and its fingerprint would vouch for whatever video the file then
        // held), and the fence below treats the marker as no verdict.
        const vqPending = savingsLive && !!vqNow && vqNow.state === 'encoded' && coreHolds(vqNow.core);
        const ownMarker = vqPending && (fenceJob && jobToken ? fenceJob === jobToken
            : getTagCI(fmtTags, VQ_TAG).trim() !== getTagCI(origProbe?.format?.tags, VQ_TAG).trim());
        if (vqPending && !ownMarker) {
            response.infoLog += `☒${pTag}${savingsTag} The re-encode in this file was never judged on size - the pass after it did not run in the job that`
                + ' made it (a Tdarr Flow runs a classic plugin once); left as it is\n';
        }
        if (vqPending && ownMarker) {
            // The original's own mediaInfo, joined by mediaInfoFor's rule (StreamOrder = the stream's index, never Menu): mediaInfoFor reads THIS file's.
            const origTracks = Array.isArray(origLib.mediaInfo?.track) ? origLib.mediaInfo.track : [];
            const origMi = origPrimary && origTracks.find((t) => t['@type'] !== 'Menu' && Number(t.StreamOrder) === origPrimary.index);
            const origFps = origPrimary ? fracOf(origPrimary.avg_frame_rate) : 0;
            // The first audio stream of this file with a counterpart in the original - the same codec, language and channel count - as { cache, origs },
            // origs being EVERY original stream with that key, or null. The job may have dropped one of several same-key tracks, and which one survived
            // cannot be told from the probes, so the anchor below must hold against all of them. Audio only - a subtitle sub_worker round-tripped through a
            // sidecar comes back on another timeline - and an audio_clean re-encode that changed the channel count never pairs.
            const sharedAudio = () => {
                const keyOf = (s) => `${codecNameOf(s)}|${getTagCI(s.tags, 'language').trim().toLowerCase()}|${s.channels ?? ''}`;
                const audioOf = (streams) => streams.filter((s) => codecTypeOf(s) === 'audio');
                const origAudio = audioOf(origProbe.streams);
                for (const s of audioOf(file.ffProbeData.streams)) {
                    const origs = origAudio.filter((x) => keyOf(x) === keyOf(s));
                    if (origs.length) return { cache: s, origs };
                }
                return null;
            };
            const ffprobePath = savingsFfprobe();
            const fingerprintOf = (s, filePath) => fpText(s, digestOf(filePath, s.index));
            // The core the encode was made at, which the pending marker carries: a speed changed since then passes vqPending, and this run's core would record
            // a setting nothing was encoded at, beside the fence the encode wrote.
            const stamp = (state, pct, fp) => escMeta(`${state}:${pct}:${vqNow.core}:${savingsText}:${fp}`);
            const line = (sym, text) => `${sym}${pTag}${savingsTag} ${text}\n`;
            // The KEEP pass: a tag-only remux of this file, whose arguments differ from every encode's and every restore's, so Tdarr's identical-arguments
            // guard cannot trip. reason is the verdict's own line.
            const keepPass = (pct, reason) => {
                const value = stamp('keep', pct, fingerprintOf(primary, file.file));
                response.infoLog += reason
                    + line('☐', `Recording the verdict in ${VQ_TAG} with a tag-only remux, so later passes read it instead of measuring`);
                sealPreset('', `${mapAll} -c copy${outputDrops}${strictArg} -metadata "${VQ_TAG}=${value}"`, { [VQ_TAG]: value }, primary, { copied: true });
                response.infoLog += expectedResultsLine(summariseStream(dvCopyReadBack(dstContainer, enrichStream(primary))));
                return response;
            };

            // A sibling that rewrote the video bitstream in this job: sub_worker's caption removal (filter_units, stamped `removed`) or a recovery. A restore
            // copies the LIBRARY original's video while -map_metadata 0 keeps the tags saying that work is done - measured on cea608_embedded_sei.mp4, frames
            // carrying captions were original 4, this file 0, restored 4, under AWK_CC=removed - and nothing re-checks, so the captions would show twice for
            // good. A size verdict never undoes a transform the user asked for. The encode's own pass already exempts one that came before it (sizeExemptWhy),
            // so this is the backstop for one between the encode and its verdict, worded without claiming which came first.
            const ccRemovedHere = ccTokens.includes(CC_TOKENS.removed) && !ccTokensOf(origProbe.format?.tags).includes(CC_TOKENS.removed);
            if (ccRemovedHere || recoveredHere) {
                return keepPass('na', line('☑', `${ccRemovedHere ? 'sub_worker\'s caption removal' : 'clean_and_remux\'s recovery'} changed the video in this`
                    + ' job - not judged on size'));
            }
            // Every restore-safety refusal is decided from the two probes, the path and the file on disk, so it runs before the measurement: a restore that
            // cannot be done never pays for the original's packet-sum. staticRefusal's share was already read on the encode's own pass, so it is a backstop.
            const refusal = (() => {
                const fixed = staticRefusal();
                if (fixed) return fixed;
                // ffmpeg rebases each input on its OWN format start, so once the job has dropped the original's earliest-starting stream (audio_clean first,
                // a timed poster track) this file was re-zeroed and the original was not, and the restored video lands off this file's other streams by
                // exactly that rebasing. Read on a stream both files share (sharedAudio), it leaves the encode's own start delay out, and anything past
                // ANCHOR_TOLERANCE_S is refused: an mkv whose dropped audio led the kept streams by 70 ms restored 70 ms out of step at 24 fps, inside the
                // two frames the video's own delta used to allow. With no stream to share, the video's delta stands in, within one frame (an encode's
                // own reorder delay measured ~21 ms at 24 fps).
                const startOf = (v) => (v === undefined || v === null || String(v).trim() === '' ? NaN : Number(v));
                const sinceStart = (s, format) => startOf(s.start_time) - startOf(format?.start_time);
                const offMs = (d) => `the video would land ${Math.round(Math.abs(d) * 1000)} ms off the other streams' timing`;
                const shared = sharedAudio();
                if (shared) {
                    for (const orig of shared.origs) {
                        const rebase = sinceStart(shared.cache, file.ffProbeData.format) - sinceStart(orig, origProbe.format);
                        if (!Number.isFinite(rebase)) return 'a start time is missing, so the streams cannot be shown to stay in step';
                        if (Math.abs(rebase) > ANCHOR_TOLERANCE_S) return offMs(rebase);
                    }
                } else {
                    const shift = sinceStart(primary, file.ffProbeData.format) - sinceStart(origPrimary, origProbe.format);
                    if (!Number.isFinite(shift) || !(origFps > 0))
                        return 'a start time or the frame rate is missing, so the streams cannot be shown to stay in step';
                    if (Math.abs(shift) > Math.max(ANCHOR_TOLERANCE_S, 1 / origFps)) return offMs(shift);
                }
                try { fs.accessSync(origPath, fs.constants.R_OK); } catch (e) { return 'the original file cannot be read on this node'; }
                // A different size on disk: the library file was replaced during the job (a Sonarr/Radarr upgrade), and the restore would put another
                // release's video beside this one's audio.
                let onDisk = NaN;
                try { onDisk = fs.statSync(origPath).size; } catch (e) { /* unreadable size reads as changed */ }
                if (onDisk !== Number(origProbe.format?.size)) return 'the library file has changed since this job began - it was probably replaced';
                return '';
            })();
            if (refusal) {
                return keepPass('na', line('☒', `Not judged on size - the original video stream cannot be put back safely (${refusal}) - keeping the new`
                    + ' encode'));
            }
            // The same quantity on both sides: the primary's payload bytes over that stream's OWN span, never format.duration - the end of the longest
            // track, which moves whenever the job changes a track that set it (a 30.03 s video beside a dropped 40 s commentary read -1.66% where the video
            // saved 23.62%, and reverted). This file is always packet-summed: local, fresh, exactly what the encode wrote. The original is read EXACT, else
            // cheaply where a cheap reading may only keep, else packet-summed; a read that fails keeps the encode, never reverts it.
            const measured = (() => {
                const deadline = Date.now() + PACKET_SUM_TIMEOUT_MS;
                const cache = packetSum(file.file, ffprobePath, primary.index, primary.time_base, deadline - Date.now());
                if (cache.why) return { side: 'new', why: cache.why };
                const cacheBps = (cache.bytes * 8) / cache.spanS;
                const bySpan = (bytes, spanS) => ({ bps: (bytes * 8) / spanS, spanS });
                // Snapped to a millionth of a percent, so float noise a hair under an exact figure (39.999999999999 for 40) can neither miss a threshold it
                // meets nor round down to the wrong whole percent.
                const savingsAgainst = (orig) => ({ cacheBps, origBps: orig.bps, savings: Math.round((1 - cacheBps / orig.bps) * 1e8) / 1e6 });
                // Spans further apart than this are not a like-for-like full-length re-encode (a truncated output, a timestamp anomaly).
                const spansAgree = (spanS) => Math.abs(spanS - cache.spanS) <= Math.max(0.01 * spanS, origFps > 0 ? 2 / origFps : 0);
                const tagOf = (k) => getTagCI(origPrimary.tags, k).trim();
                const fileBytes = Number(origProbe.format?.size);
                // A writer's NUMBER_OF_BYTES with the same writer's DURATION, from the keys of one suffix.
                const statsReading = (appTest) => statsKeysOf(origPrimary.tags, 'NUMBER_OF_BYTES')
                    .filter(({ suffix }) => appTest(tagOf(`_STATISTICS_WRITING_APP${suffix}`)))
                    .map(({ value, suffix }) => ({ bytes: /^\d+$/.test(value) ? Number(value) : 0, spanS: hmsSeconds(tagOf(`DURATION${suffix}`)) }))
                    .find((x) => x.bytes > 0 && x.spanS > 0);
                // EXACT, Matroska only: the statistics trusted where their _STATISTICS_WRITING_APP equals the file's writing app - mediaInfo's General
                // Encoded_Application, since ffprobe exposes only the muxing library. An mkvpropedit recount or an ffmpeg re-encode's copied tag fails it;
                // NUMBER_OF_BYTES equalled the packet-sum on all 12 corpus mkvs that pass (mkvmerge v7.8-v92, MakeMKV 1.15.1). It decides both ways.
                const writingApp = String((origTracks.find((t) => t['@type'] === 'General') || {}).Encoded_Application || '').trim();
                const exact = origFormat === MATROSKA_DEMUXER && writingApp ? statsReading((app) => app === writingApp) : undefined;
                // CHEAP, keep-only. mp4: ffprobe's bit_rate, already bytes over the stream's own duration (the packet-sum on 43 of 45 corpus mp4s), unless it
                // implies more bytes than the file holds - a fragmented mp4's sidx-derived figure (164.6 MB in a 149.9 MB file) read a 0% copy as a keep.
                // Matroska: only an mkvpropedit recount (exact on all 6 corpus files) within the file size. Never mediaInfo's BitRate on Matroska: there it IS
                // the statistics tag, or the file size minus the other streams', and an ffmpeg re-encode keeps the source's BPS (48 Mbps on a 2.1 Mbps
                // stream, measured), so an encode that GREW the video read as an 85% saving.
                let cheap = null;
                if (origFormat === MP4_DEMUXER) {
                    const bps = Number(origPrimary.bit_rate);
                    const spanS = Number(origPrimary.duration);
                    if (bps > 0 && spanS > 0 && (bps * spanS) / 8 <= fileBytes) cheap = { bps, spanS };
                } else if (origFormat === MATROSKA_DEMUXER) {
                    const recount = statsReading((app) => /^mkvpropedit/i.test(app));
                    if (recount && recount.bytes <= fileBytes) cheap = bySpan(recount.bytes, recount.spanS);
                }
                let orig = exact ? bySpan(exact.bytes, exact.spanS) : null;
                if (!orig && cheap && spansAgree(cheap.spanS) && savingsAgainst(cheap).savings >= guardShrinkSavings) return savingsAgainst(cheap);
                if (!orig) {
                    const read = packetSum(origPath, ffprobePath, origPrimary.index, origPrimary.time_base, deadline - Date.now());
                    if (read.why) return { side: 'original', why: read.why };
                    orig = bySpan(read.bytes, read.spanS);
                }
                if (!spansAgree(orig.spanS))
                    return { side: 'new', why: `the video spans differ, ${cache.spanS.toFixed(2)} s against ${orig.spanS.toFixed(2)} s` };
                return savingsAgainst(orig);
            })();
            if (measured.why) {
                return keepPass('na', line('☒', `Could not measure the ${measured.side} video stream's bitrate (${measured.why}) - keeping the new encode`));
            }
            // The whole percent the stamp records is the saving rounded DOWN, a growth included (0.6% saved is 0, 0.4% grown is -1), so it never reads as
            // meeting a threshold it missed and the retry rule can bound the saving exactly. The lines show a saving rounded down and a growth rounded up to
            // the threshold's own decimal places, one at least (0.6% at 1 is 0.6, 1.45% at 1.4 is 1.4, 0.04% grown is 0.1).
            const micro = Math.round(measured.savings * 1e6);
            const places = 10 ** Math.min(6, Math.max(1, (savingsText.split('.')[1] || '').length));
            const pct = Math.floor(micro / 1e6) || 0;
            const shown = (micro < 0 ? -Math.ceil(-micro * places / 1e6) : Math.floor(micro * places / 1e6)) / places || 0;
            const rates = `${Math.round(measured.cacheBps / 1000)} kb/s against ${Math.round(measured.origBps / 1000)} kb/s`;
            if (measured.savings >= guardShrinkSavings)
                return keepPass(pct, line('☑', `The new video stream is ${shown}% smaller than the original's (${rates}) - keeping it`));

            // The restore: the original's primary back in, by ABSOLUTE index on both sides (on a cover-art-first source v:0 is the poster, and a relative map
            // restores the JPEG with exit 0); every other stream and every global tag of this file kept - it is the first input, so -map_metadata 0 keeps
            // awk_video - and its chapters stated, since ffmpeg's default takes them from the first input that HAS any (a file whose chapters were removed
            // got the original's back). Cover art is never copied back. The restored stream keeps the original's own stream tags (ffmpeg takes them from the
            // input stream), so clean_and_remux redoes its video-stream edits on the next pass.
            const origCodec = codecNameOf(origPrimary);
            let restoreStrict = mp4StrictArg(dstContainer, file.ffProbeData.streams.filter((s) => s !== primary));
            // Dolby Vision read off the original's own mediaInfo track: the shared helpers default to mediaInfoFor, which joins THIS file's track at the
            // original's index, so a DV signal only the original's mediaInfo carries would lose -strict unofficial, and with it the dvcC box.
            if (!restoreStrict && isMp4Family(dstContainer) && isDolbyVisionVideo(origPrimary, origMi)) restoreStrict = ' -strict unofficial';
            // The restored stream's fourcc: for HEVC the plan clean_and_remux applies to the same stream (hevcCopyPlan), so the restore never re-triggers that
            // remux, and a dvh1 original whose Dolby Vision record a copy keeps restores into Matroska; qtVideoTag for the rest. Its -bsf:v:0 and -tag:v:0
            // land on the restored stream, which maps first.
            const plan = origCodec === 'hevc'
                ? hevcCopyPlan(origPrimary, origFormat === MP4_DEMUXER ? origPrimary.codec_tag_string : '', 0, ffmpegPathOf(otherArguments), origPath,
                    dstContainer)
                : null;
            const restoreTag = plan ? plan.args : qtVideoTag(origCodec);
            const value = stamp('reject', pct, fingerprintOf(origPrimary, origPath));
            const verdict = shown < 0 ? `The re-encode grew the video by ${-shown}%` : `The re-encode saved only ${shown}%`;
            response.infoLog += line('☐', `${verdict} (${rates}) - restoring the original video stream and keeping every other stream; this file is not`
                + ' re-encoded again at these settings');
            const restored = { ...origPrimary, index: primary.index };   // in the primary's place, as keptFor expects
            sealPreset('', `-i "${origPath}" -map 1:${origPrimary.index} -map 0 -map -0:${primary.index}${outputDrops} -map_chapters 0 -c copy`
                + `${restoreTag}${restoreStrict} -metadata "${VQ_TAG}=${value}"`, { [VQ_TAG]: value }, restored);
            // sealPreset's .mov loss line reads the restored stream through THIS file's mediaInfo (see restoreStrict above), so a Dolby Vision signal only
            // the original's own track carries is warned of here, by a stand-in that carries it as a fourcc.
            if (isDolbyVisionVideo(origPrimary, origMi) && !movLosesDvBox(dstContainer, restored))
                response.infoLog += movDvLossLine(dstContainer, [{ ...restored, codec_tag_string: 'dvhe' }]);
            // The restored stream maps first, and its token is summarised detached (index -1): summariseStream joins mediaInfo by index, and THIS file's
            // track at the original's index can be another stream entirely (the audio, on a cover-art-first original). It reads back under the fourcc the
            // restore writes - the plan's (a stuck stream's keep, else its want), or the QuickTime table's - else its own.
            const carried = carriedFor(restored);
            const writtenTag = plan ? plan.args && (plan.keep || plan.want) : qtFourcc(origCodec);
            const restoredRead = { ...origPrimary, codec_tag_string: writtenTag || origPrimary.codec_tag_string, index: -1 };
            response.infoLog += dvCopyLossLine(dstContainer, [{ ...restoredRead, index: primary.index }]);
            response.infoLog += `☑Expected results: ${summariseStream(dvCopyReadBack(dstContainer, restoredRead))}${mappedFor(restored)
                .filter((s) => !isPrimary(s)).map((s) => summariseStream(movLangReadBack(dstContainer, dvCopyReadBack(dstContainer, enrichStream(carried(s))))))
                .join('')}\n`;
            return response;
        }
        // A verdict this file already carries at this setting, said only where the fence below then skips the file - never ahead of a stale line. The
        // threshold is named only where it differs from today's (a keep, or a reject the new value could not pass). The fence's retry says its own line.
        const vqReadLine = (() => {
            if (!(savingsLive && vqNow && vqNow.state !== 'encoded' && coreHolds(vqNow.core) && !vqRetry)) return '';
            if (vqNow.pct === null) {
                return `☑${pTag}${savingsTag} The re-encode was kept on an earlier pass without a size verdict (that pass's log says why)\n`;
            }
            const saved = vqNow.pct < 0 ? 'grew the video' : `saved ${vqNow.pct}%`;
            const at = vqNow.t === savingsText ? '' : `, at guard_shrink_savings=${logSafe(vqNow.t, 16)}`;
            return `☑${pTag}${savingsTag} The re-encode was ${vqNow.state === 'keep' ? 'kept' : 'reverted'} on an earlier pass (it ${saved}${at})\n`;
        })();
        // ====== END SHRINK SAVINGS VERDICT ======
        // No real transcode: a lossless strip, a bitrate skip, or a benign no-op. Reached once realTranscode() was evaluated in full, or the floor declined the
        // re-encode after every metadata trigger and the interlace verdict were read (shrinkDeclined), so the verdict (if the setting bought one) is settled.
        const noTranscode = () => {
            response.infoLog += deintVerdictLine();
            if (effHdrMode === 'strip_dynamic' && isDynamicHdr) {   // strip_dynamic is the sole reason - do it losslessly (or skip when it can't be lossless)
                return tryLosslessStrip('set hdr_mode=tonemap_sdr to flatten it to SDR', belowFloorLine
                    ? `; guard_shrink_bitrate=${guardShrinkKbps} declined the re-encode that would remove it - lower it to re-encode` : '');
            }
            // The declined size pass already logged WHY above; say only that nothing else was left, rather than falling to the shrink line below, which speaks
            // for a target with no encoder.
            if (fenceUnstorable)
                return skip(`☑${pTag}[action=shrink] Nothing else to do for this file\n`);
            if (belowFloorLine)
                return skip(belowFloorLine);
            // Only a target with no encoder gets here under shrink: an encodable one always fires a size pass above (an upgrade, or a fenced same-codec pass),
            // and the two things that decline it - the bitrate floor and an unstorable fence - have each returned with their own line already.
            if (action === 'shrink') {
                return skip(`☑${pTag}[action=shrink] Nothing to shrink - source codec ${srcCodecName || 'unknown'} has no encoder ${codec === 'source'
                    ? '(set codec=hevc/h264/av1 to convert it)' : `and ${codec} is no more efficient (action=normalize converts it)`}\n`);
            }
            return skip(`☑${pTag}[action=normalize] Video is already ${targetCodecName}${dispHeight ? ` ${dispHeight}p` : ''}`
                + `${srcIs10 ? ' 10-bit' : ''} and within limits\n`);
        };
        if (realTranscode()) {
            const videoSigShown = `${videoSigCore}-v${escMeta(details().Version)}`;
            const videoSig = `${videoSigShown}${jobToken ? `+j${jobToken}` : ''}`;
            // core only; the stored -v<version>[+j<job>] suffix is forensic, not part of the fence
            const priorCore = priorSig.replace(/-v[^-]*$/, '');
            const fenceMatches = priorSig !== '' && coreHolds(priorCore, fenceBoxed);
            // The floor decides a re-encode nothing else forces once the fence has not settled the file, so a fenced file never pays its timeline read - but
            // ahead of the fence where a dynamic-HDR strip is asked for: noTranscode strips losslessly, which the fence never pre-empts (see cheapTrigger).
            if (effHdrMode === 'strip_dynamic' && isDynamicHdr && shrinkDeclined()) return noTranscode();
            // An inherited fence that no longer describes the video counts as absent - here, and for the implicit fence below - and the encode below writes a
            // fresh one. Its line is held until the run knows it encodes, so the implicit fence can say the same fact without "processing it again".
            let staleWhy = '';
            if (fenceMatches && !vqRetry) {
                staleWhy = fenceInherited ? fenceStaleWhy() : '';
                if (!staleWhy) {
                    // The inputs behind the tokens coreHolds let pass, named as the user set them, so the line says what changed and was not acted on.
                    const diff = coreDiff(priorCore);
                    const passed = [...new Set([...diff.mine, ...diff.theirs].map((t) => (FENCE_BOX_RE.test(t) ? `downscale=${downscaleOpt}`
                        : FENCE_SPEED_RE.test(t) ? `method_speed=${speed}` : t === 'deint' ? `deinterlace=${deinterlaceOpt}`
                            : t === 'dv' ? `guard_dv=${guardDv}` : `hdr_mode=${hdrMode}`)))];
                    const shown = logSafe(priorSig.replace(/\+j[0-9a-f]{8}$/, ''), 120);
                    const only = vqNow?.state === 'reject' ? 'repeat the encode that was put back' : 'add a lossy generation';
                    // A box token both cores share, which today's box would scale into, on a fence older than that box: an encode would downscale too.
                    const boxKept = !fenceBoxed && willDownscale && priorCore.split('-').includes(`h${maxH}`);
                    const would = boxKept ? `${only}, and its h${maxH} predates the 16:9 box (3.28.0), so it stands as written` : `only ${only}`;
                    return skip(`${vqReadLine}${deintVerdictLine()}☑${pTag}[action=${action}] Already processed by ${VIDEO_FENCE_TAG} ${passed.length
                        ? `(${shown}); re-encoding it for ${passed.join(', ')} would ${would}` : `at this exact setting (${videoSigShown})`}`
                        + ' - left untouched\n');
                }
            }
            if (shrinkDeclined()) return noTranscode();
            if (fenceMatches && vqRetry) {
                response.infoLog += `☑${pTag}${savingsTag} The re-encode was reverted at guard_shrink_savings=${logSafe(vqNow.t, 16)} on an earlier pass`
                    + ` (it ${vqNow.pct < 0 ? 'grew the video' : `saved ${vqNow.pct}%`}), which the new setting allows - processing the file`
                    + ' again\n';
            }
            const staleLine = staleWhy ? `☒${pTag} ${staleWhy} - an outside tool changed it; processing it again\n` : '';
            if (containerRefusesTarget(dstContainer, targetCodecName)) {
                return skip(`${staleLine}☒${pTag}[codec=${codec}][container=${dstContainer}] A .${dstContainer} file cannot hold ${targetCodecName} `
                    + 'video (ffmpeg refuses it, or writes a file that no longer reads back as it) - left untouched; remux it to mkv or mp4 first '
                    + '(clean_and_remux does that), or choose a codec it holds\n');
            }
            // deinterlace=enabled asked for an interlace verdict and the probe could not deliver one, while codec, downscale or tonemap still forces this
            // encode. Encoding now would bake any combing in for good - a downscale blends the fields beyond repair - and the fence it writes is keyed on
            // the SETTING (videoSigCore: that is what lets a repaired, now-progressive output converge), so it would skip the file even once a later probe
            // reads it interlaced. So the file fails instead, untouched: a timeout clears on a requeue, and a file the probe can never read is the user's
            // call to encode as-is with deinterlace=disabled. With no other trigger nothing is encoded, and deintVerdictLine reports it left as-is.
            if (deinterlaceLive && idet().kind === 'unknown') {
                response.infoLog += staleLine;
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
            // The implicit fence. A plain mp4 remux, MP4Box or HandBrake drops awk_video, and a second encode at the same settings measured 15.9% smaller in
            // video bytes, which guard_shrink_savings at its default would keep - a generational loss. So a same-codec size pass with nothing else to do (a
            // wanted dynamic-HDR strip, or sub_worker's pending caption strip, still runs) is skipped where the x264/x265 settings line already records this
            // run's crf - with no fence, or a stale one (an outside re-encode at this crf, a lossless cut of our own encode). Zero spawns, nothing written;
            // hardware and AV1 output carry no settings line, so they are not caught.
            if (reasonTags.length === 0 && (priorSig === '' || staleWhy) && action === 'shrink' && !ccExported
                && !(effHdrMode === 'strip_dynamic' && isDynamicHdr)) {
                const x = x26xSettings();
                if (x && Math.abs(x.crf - cpuCrf) <= 0.5) {
                    return skip(staleWhy ? `☑${pTag}[action=shrink] ${staleWhy}, but it is already an ${x.lib} encode at crf ${x.crf} - the quality this run`
                        + ' would use; left untouched\n'
                        : `☑${pTag}[action=shrink] Already an ${x.lib} encode at crf ${x.crf} - the quality this run would use - with no ${VIDEO_FENCE_TAG}`
                            + ' tag (a remux or another tool dropped it); left untouched\n');
                }
            }
            if (reasonTags.length === 0) reasonTags.push('shrink');   // a same-codec shrink with no other visible transform
            const ccStale = ccStripStaleWhy();
            if (ccStale) return emitCcClear(ccStale);
            response.infoLog += staleLine;
            return emitTranscode(`[${reasonTags.join('][')}]`, { videoSig, videoSigCore, priorSig });
        }

        return noTranscode();
        // ====== END DECIDE, GATED BY ACTION ======
    } catch (err) {
        return failUnexpected(err);
    }
    // ====== END PER-FILE FLOW ======
};

module.exports.details = details;
module.exports.plugin = plugin;
