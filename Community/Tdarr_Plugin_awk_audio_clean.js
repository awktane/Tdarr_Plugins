/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin cleans up the audio tracks. There are options to downmix and convert tracks based on channel count and language.\n\n
                  Ensure options are set directly as this can be destructive especially with incorrectly tagged audio tracks`,
    Version: '2.5.1',
    Tags: 'pre-processing,ffmpeg,audio_only,configurable',
    Inputs: [
        {
            name: 'downmix_language',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Specify language tags here for the audio tracks you'd like to transcode. If blank then all tracks will be considered. Tracks in languages not listed will not be considered for the downmix_to_six, downmix_to_stereo options, nor keep_best_surround_safe.
                \\nStreams with no language tag are treated as though their language is "und". A track whose language is not in this list is treated as secondary - excluded from the primary downmix paths (downmix_to_six/downmix_to_stereo, keep_best_surround_safe) and instead handled by downmix_secondary_stereo.
                \\nException: if the file has NO genuine (non-commentary, non-descriptive) track in a listed language, the language filter goes dormant and every genuine track is treated as primary - so a foreign-language-only file (e.g. Japanese-only when the list is English) keeps its surround instead of being downmixed. Commentary and descriptive tracks are always secondary regardless of language.
                \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US.
                \\nTracks with these languages will follow downmix_to_six, downmix_to_stereo, and codec_force
                \\nExample:\\n
                    en,eng,fr,fre,fra,und,mul,jpn,ja,zxx,mis\\n
                    English, French, and Japanese (ISO-639-2 and ISO-639-1) (und = undefined, mul = multiple languages, zxx = no linguistic content, mis = missing language / no language code)
                \\nExample:\\n
                    en,eng,und\\n
                    English and undefined`,
        },                
        {
            name: 'downmix_to_six',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'replace', 'true'],
            },
            tooltip: `Specify if we should downmix a 5.1 track if one doesn't already exist from the best quality higher channel track for that language (from downmix_language if specified) that is not a secondary track (commentary, descriptive, etc).
                \\nIf a 5.1 track for the same language already exists or if no higher channel track exists then no new 6 channel track is created.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - no new 6 channel track is created from higher channel surround channel
                \\nIf replace - a new codec_surround 6 channel track replaces the higher channel track used to create it unless protected by keep_best_surround_safe.
                \\nIf true    - a new codec_surround 6 channel track will be created from the higher channel track and both will be kept`,
        },
        {
            name: 'downmix_to_stereo',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'replace', 'true'],
            },
            tooltip: `Specify if we should downmix a 2 channel track if one doesn't already exist from the best quality higher channel track for that language that is not a secondary track (commentary, descriptive, etc). If no higher channel track exists no work is done.
                \\nIf a stereo track for the same language already exists or if no higher channel track exists then no new stereo channel track is created.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - no new 2 channel track is created from surround channel
                \\nIf replace - a new 2 channel track with codec codec_stereo replaces the higher channel track used to create it unless it was created by downmix_to_six.
                \\nIf true    - a new 2 channel track with codec_stereo will be created from a higher channel track and both will be kept`,
        },        
        {
            name: 'downmix_secondary_stereo',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Should commentary, visual impaired tracks, and other secondary tracks be downmixed to stereo? Unlike the primary downmix options, each surround secondary track is transcoded in place to stereo independently — one stereo per secondary track, preserving all of them. This would normally be false.
                \nThese tracks are never protected by keep_best_surround_safe, so an enabled secondary downmix always transcodes them in place.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false - secondary tracks are left untouched
                \\nIf true  - each secondary track with more than 2 channels is transcoded in place to a stereo codec_stereo track (using the stereo_downmix matrix).`,
        },
        {
            name: 'codec_surround',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created surround tracks. Note that both AC3 and EAC3 are limited to 6 channels (5.1) by ffmpeg's native encoders. Opus supports up to 8 channels.`,
        },
        {
            name: 'codec_stereo',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','aac_vbr','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created stereo tracks. AAC and Opus are the most compatible choices for modern media servers and clients. EAC3 is useful for Dolby branding on compatible devices. AC3 is the most broadly compatible legacy choice.
                \\naac_vbr uses libfdk_aac in VBR mode (-vbr 5, ~192-224 kb/s) for higher quality than native AAC CBR. Falls back to -vbr 4 (~128-144 kb/s) when codec_force is converting an existing stereo track whose bitrate is at or below 144 kb/s, matching the lower-information source.
                \\nExisting AAC tracks are never re-encoded when aac_vbr is selected — the AAC family check prevents a generational loss for no gain.`,
        },        
        {
            name: 'codec_force',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','6below','2below','all'],
            },
            tooltip: `Transcode all tracks to the codecs specified in codec_surround and codec_stereo depending on their channel count. Note streams with more channels than supported by the codec will not be transcoded.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false  - Codecs will be left as is and those two settings will only apply to new tracks
                \\nIf 2below - Streams with two or fewer channels will be transcoded to codec_stereo (unless protected by keep_best_surround_safe). Anything above that will be left in its original codec.
                \\nIf 6below - Streams with six or fewer channels will be transcoded to codec_surround (unless protected by keep_best_surround_safe). Tracks with two or fewer channel will be converted to codec_stereo.
                \\nIf all   - All streams will be transcoded to the codecs specified by codec_surround and codec_stereo depending on their channel count INCLUDING the track protected by keep_best_surround_safe`,
        },                
        {
            name: 'keep_best_surround_safe',
            type: 'string',
            defaultValue: 'quality',
            inputUI: {
                type: 'dropdown',
                options: ['false','quality','channel'],
            },
            tooltip: `If enabled then we should keep the best quality and highest channel option for each language (downmix_language list or if blank all). This track will be treated as a source and will not be transcoded or removed.
                \\nThis track can only be affected by codec_force being set to all. Commentary and descriptive tracks never get this protection. A track in a language not in downmix_language normally doesn't either - unless the language filter is dormant (no listed-language non-commentary/descriptive track present), in which case it is treated as primary and can be protected. See downmix_language.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - All tracks are treated normally
                \\nIf quality - The focus is on track quality. A lossless 5.1 track would be kept over a lossy 7.1 as an example. If there is a 5.1 and 7.1 of similar quality then the 7.1 would be chosen.
                \\nIf channel - The focus is on channel count. A lossy 7.1 track will always be kept over the lossless 5.1 track in the previous example.`,

        },
        {
            name: 'remove_duplicates_by',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'multi-stereo', 'multi-stereo-error', 'channel', 'channel-error'],
            },
            tooltip: `If enabled then duplicate audio tracks (same language, same broad role) are reduced down to the highest quality option(s). Any stream newly created by downmix_to_six or downmix_to_stereo is always kept and is never collapsed against a different channel count it was created alongside (see below).
                \\nThe "-error" variants use identical grouping/duplicate-detection logic to their non-error counterpart, but instead of deleting the lower quality duplicate(s) they abort the plugin run entirely (no streams are removed, no other changes in this run are applied) so the file can be inspected and tagged manually before being requeued.
                \\n=====
                \\nActions
                \\n=====
                \\nIf disabled            - no streams are removed for being duplicates. Every track is left exactly as found.
                \\nIf multi-stereo        - one track per language is kept for each of two broad roles: "surround" (more than 2 channels) and "stereo" (2 or fewer channels). The highest quality track in each role wins; the rest in that role are removed.
                       \\nException: if downmix_to_six is enabled, the 5.1/5.0 band (5-6 channels) is kept as its own separate role rather than folded into "surround" - so a downmix-created 6 channel track is never compared against, and removed in favour of, a higher channel track like a 7.1.
                       \\nException: if downmix_to_stereo is enabled, exactly 2 channel tracks are kept as their own separate role rather than folded into "stereo" - so a downmix-created 2.0 track is never compared against, and removed in favour of, a mono track.
                       \\nThese exceptions only apply while the matching downmix option is enabled, matching what that option would have created or kept anyway.
                \\nIf multi-stereo-error  - same grouping as multi-stereo, but on finding a duplicate the plugin aborts (processing fails, file sent to error queue) instead of deleting anything.
                \\nIf channel             - one track per language is kept for each distinct channel count (2.0, 5.1, 7.1, etc are each their own group). The highest quality track in each channel count wins; the rest sharing that exact channel count are removed.
                \\nIf channel-error       - same grouping as channel, but on finding a duplicate the plugin aborts (processing fails, file sent to error queue) instead of deleting anything.
                \\nExample: 
                    A file has these tracks with the same language: 7.1 aac, 5.1 truehd, 2.0 ac3, 2.0 mp3
                \\nIf channel      - keeps 7.1 aac, 5.1 truehd, and the better of the two 2.0 tracks (2.0 ac3). The 7.1 and 5.1 are different channel counts so both survive.
                \\nIf multi-stereo - keeps 5.1 truehd (better quality than 7.1 aac, both are "surround") and 2.0 ac3 (better than 2.0 mp3, both are "stereo"). The 7.1 aac is removed.
                \\nIf channel-error or multi-stereo-error - aborts the run if it finds duplicates as per the categories above; no streams are removed and no other changes from this run are applied.`,
        },
        {
            name: 'method_stereo_downmix',
            type: 'string',
            defaultValue: 'dialogue',
            inputUI: {
                type: 'dropdown',
                options: ['default','dialogue'],
            },
            tooltip: `Method used when creating stereo (2.0) tracks from surround sources.
                \\n=====
                \\nActions
                \\n=====
                \\nIf default  - ffmpeg's built in downmix (-ac 2). Simple, but the auto leveling can sound quiet with buried dialogue.
                \\nIf dialogue - applies a Lo/Ro downmix matrix (center kept at -3 dB, LFE dropped) so dialogue stays clear and the overall level stays up.
                \\nFalls back to default automatically for unusual layouts such as 2.1 and 3.0.`,
        },
        {
            name: 'method_opus_layout_err',
            type: 'string',
            defaultValue: 'keep',
            inputUI: {
                type: 'dropdown',
                options: ['keep','drop','remix'],
            },
            tooltip: `What to do when codec_surround is opus and a source track has a channel layout libopus cannot encode (e.g. 2.1, 4.0, 4.1, 6.0, 7.0, 7.1(wide)). Left unhandled, ffmpeg aborts the whole job on that track. Only the force-to-opus path is affected - the downmix options already emit opus-safe layouts, and a layout that just needs relabeling (5.0(side) -> 5.0, 6.1(back) -> 6.1) is ALWAYS relabeled losslessly regardless of this setting. AC3/EAC3/AAC accept every layout, so this only matters for opus.
                \\n=====
                \\nActions (only for a layout with no lossless relabel)
                \\n=====
                \\nIf keep  - the track is left in its source codec (not forced to opus). Safe default: nothing fails and no audio is lost.
                \\nIf drop  - the track is removed entirely. The last remaining audio track is never dropped (falls back to keep).
                \\nIf remix - the track is downmixed to a codec_stereo stereo. Defers to downmix_to_stereo / downmix_secondary_stereo when they already convert the track, and falls back to keep rather than create a duplicate stereo.`,
        },
        {
            name: 'temp_on_network',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false'],
            },
            tooltip: `Is the temp folder on the network? Enabling this adds a ffmpeg options to reduce the number of reads/writes.
                 \\nGenerally speaking this has very little effect if the files are local instead and therefore it's enabled by default.`,
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: file-failure helpers =====
    // -=-=-= AwkFailFile / failFile / failUnexpected  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all three awk plugins.
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
    // -=-=-= roleTextLower  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
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
    // -=-=-= matchesKeyword  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
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
    // -=-=-= hasDisposition  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes((s.codec_type || '').trim().toLowerCase())) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(roleTextLower(s), entry.keywords);
    };
    // -=-=-= role classifiers: isCommentary / isDescriptive / isSdh / isLyrics  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions');
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');
    // ===== END SHARED: role/disposition classifiers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last;
    // summariseStream flags them /cover.
    const IMAGE_CODECS = ['mjpeg', 'mjpegb', 'png', 'apng', 'gif', 'bmp', 'webp', 'tiff'];
    // A stream is cover art / a still image when its codec is an image codec OR it carries a cover-art disposition (attached_pic/still_image/timed_thumbnails).
    const isCoverArt = (s) => IMAGE_CODECS.includes((s.codec_name || '').trim().toLowerCase())
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // ===== SHARED [audio_clean, stream_ordering]: audio codec scoring =====
    // -=-=-= codecInfo  [audio_clean, stream_ordering] =-=-=-
    //Codec quality weights so we can pick the best track. Some of these formats aren't supported by ffmpeg yet (e.g. ac4).
    const codecInfo = {
        // Lossless
        pcm:        { score: 100, lossless: true },
        flac:       { score: 100, lossless: true },
        alac:       { score: 100, lossless: true },
        wavpack:    { score: 100, lossless: true },
        ape:        { score: 100, lossless: true },
        tak:        { score: 100, lossless: true },
        tta:        { score: 100, lossless: true },
        mlp:        { score: 99,  lossless: true },

        // Dolby family
        truehd:     { score: 99,  lossless: true },
        dtsma:      { score: 98,  lossless: true },
        dtshr:      { score: 94,  minimum: 1000000, transparent: 3000000 },
        dts:        { score: 91,  minimum: 768000,  transparent: 1509000 },
        eac3atmos:  { score: 92,  minimum: 256000,  transparent: 768000 },
        dtsexpress: { score: 80,  minimum: 128000,  transparent: 384000 },
        
        // Modern multichannel codecs
        ac4:        { score: 90,  minimum: 128000,  transparent: 384000 },
        eac3:       { score: 89,  minimum: 192000,  transparent: 640000 },
        mpegh3d:    { score: 89,  minimum: 192000,  transparent: 512000 },

        // Modern general-purpose codecs
        opus:       { score: 89,  minimum: 64000,   transparent: 192000 },
        aac:        { score: 87,  minimum: 96000,   transparent: 256000 },
        vorbis:     { score: 86,  minimum: 128000,  transparent: 256000 },

        // Legacy but still excellent
        ac3:        { score: 84,  minimum: 192000,  transparent: 640000 },
        atrac:      { score: 83,  minimum: 96000,   transparent: 192000 },
        wma:        { score: 82,  minimum: 96000,   transparent: 192000 },
        mpc:        { score: 82,  minimum: 128000,  transparent: 220000 },

        // Older codecs
        mp3:        { score: 78,  minimum: 128000,  transparent: 320000 },
        mp2:        { score: 73,  minimum: 128000,  transparent: 256000 },
        adpcm:      { score: 60,  minimum: 128000,  transparent: 256000 },
        cook:       { score: 58,  minimum: 64000,   transparent: 128000 }
    };
    // -=-=-= codecAliases / unknownCodecs  [audio_clean, stream_ordering] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_',   'pcm'],
        ['adpcm',  'adpcm'],
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
    ];
    const unknownCodecs = new Set();

    // -=-=-= resolveCodecName  [audio_clean, stream_ordering] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype and eac3 into eac3atmos. Shared by audioQuality
    // and losslessSource. codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" (no subtype keyword), so longName alone can't tell the
    // subtypes apart there; we also check the stream profile ("DTS-HD MA"/"HRA"/"Express") and fall back to mediaInfo's Format_Commercial_IfAny
    // ("DTS-HD Master Audio"), which decodes the substream header. Atmos comes from longName or the commercial name only - an editable title tag does
    // not imply a real Atmos substream.
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
        const commercial = (mediaInfoFor(stream)?.Format_Commercial_IfAny || '').toLowerCase();
        if (codec === 'dts') {
            if      (longName.includes('master')          || profile.includes('hd ma')  || commercial.includes('master'))
                codec = 'dtsma';
            else if (longName.includes('high resolution') || profile.includes('hra')    || commercial.includes('high resolution'))
                codec = 'dtshr';
            else if (longName.includes('express')         || profile.includes('express')|| commercial.includes('express'))
                codec = 'dtsexpress';
        } else if (codec === 'eac3' && (longName.includes('atmos') || commercial.includes('atmos')))
            codec = 'eac3atmos';

        return codec;
    };

    // -=-=-= CODEC_TARGET_BPS  [audio_clean, stream_ordering] =-=-=-
    // Per-channel target bitrate (bps) for our encodable output codecs (ac3/eac3 cap at 6ch in ffmpeg). Single source for BOTH the bitrate-less quality
    // estimate in audioQuality and audio_clean's transcode targetTable, so a target change can't make the predicted score disagree with the bitrate used.
    const CODEC_TARGET_BPS = {
        aac:  { 1: 128000, 2: 256000, 3: 320000, 4: 384000, 5: 448000, 6: 512000, 7: 576000, 8: 640000 },
        opus: { 1: 128000, 2: 192000, 3: 256000, 4: 320000, 5: 320000, 6: 384000, 7: 448000, 8: 448000 },
        ac3:  { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
        eac3: { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
    };
    // -=-=-= audioQuality  [audio_clean, stream_ordering] =-=-=-
    // Scores a stream's quality (codec + bitrate vs transparent bitrate) to identify the "best" track. Declared after response so infoLog is available.
    const audioQuality = (stream) => {
        const codec = resolveCodecName(stream);

        //Check if we can't identify the codec. If we can't then notify once per codec
        if(!(codec in codecInfo) && !unknownCodecs.has(codec)) {
            unknownCodecs.add(codec);
            response.infoLog += `☒Stream ${stream.index}: Unknown audio codec "${codec}", using generic quality weighting.\n`;
        }

        //This is a pretty weak way to score an unknown codec
        const info = codecInfo[codec] ?? { score: 70, minimum: 128000, transparent: 320000 };

        //Get the variables ready for scoring
        const bitrate = Number(stream.bit_rate || 0);
        const channelScale = Math.pow((Math.max(2, Number(stream?.channels ?? 2))) / 2, 0.65);
        const minimum = info.minimum * channelScale;
        const transparent = info.transparent * channelScale;
        const maxPenalty = 18;
        let penalty = maxPenalty;

        // Lossless codecs are already "perfect"
        if (info.lossless)
            return info.score;

        // No stream-level bitrate reported (freshly-transcoded tracks routinely omit it). For codecs we know how to encode (aac, opus, ac3, eac3) we
        // estimate quality from the bitrate we'd target for this channel count instead of a blind midpoint. For source codecs that normally carry a
        // bitrate (dts, ac3 from disc, etc.) we log once and use the midpoint.
        if (bitrate <= 0) {
            const ch = Math.max(1, Number(stream?.channels ?? 2));
            const tbl = CODEC_TARGET_BPS[codec];
            if (tbl) {
                // ac3/eac3 top out at 6ch in ffmpeg, so cap the channel count so the estimate and its min/transparent thresholds scale together -
                // otherwise a 7.1 source scores below a 5.1 of the same codec (estBps pins at the 6ch target while the thresholds keep climbing).
                const capCh = Math.min(ch, codec === 'ac3' || codec === 'eac3' ? 6 : 8);
                const scale = Math.pow(Math.max(2, capCh) / 2, 0.65);
                const estBps = tbl[capCh] ?? 0;
                const estPenalty = estBps > info.minimum * scale
                    ? (estBps >= info.transparent * scale ? 0 : maxPenalty * (1 - ((estBps - info.minimum * scale) / ((info.transparent - info.minimum) * scale))))
                    : maxPenalty;
                return info.score - estPenalty;
            }
            response.infoLog += `☒Stream ${stream.index}: No bitrate reported for ${codec}, assuming nominal quality.\n`;
            return info.score - (maxPenalty / 2);
        }

        //Score the track
        if (bitrate > minimum) {
            if (bitrate >= transparent)
                penalty = 0;
            else
                penalty = maxPenalty * (1 - ((bitrate - minimum) / (transparent - minimum)));
        }

        return info.score - penalty;
    }
    // ===== END SHARED: audio codec scoring =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Find the mediaInfo track corresponding to an ffprobe stream (matched by StreamOrder === ffprobe index); undefined when absent. The single join point
    // between the two probes - resolveStreamBitrate/resolveChannels/resolveLang and the per-plugin language/loop sites all go through it.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === s.index);
    // -=-=-= resolveLang  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Resolve a stream's language: ffprobe tags.language, then mediaInfo Language (files often tag one probe but not the other), trimmed + lowercased. Empty
    // when neither reports it; callers wanting a placeholder use `resolveLang(s) || 'und'`.
    const resolveLang = (s) => (s.tags?.language ?? (mediaInfoFor(s)?.Language ?? '')).trim().toLowerCase();
    // -=-=-= resolveStreamBitrate  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
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

    // -=-=-= resolveChannels (+ channelsFromLayout helper)  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Resolve an audio stream's channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string
    // from ffprobe channel_layout or mediaInfo ChannelLayout/ChannelPositions - "5.1(side)" -> 6, "stereo" -> 2, "FL+FR+LFE" -> 3. Returns 0 only when no
    // source reports it, so channel-dependent logic (scoring, dedup, downmix, labelling, codec forcing) stays correct for tracks whose ffprobe entry omits it.
    const channelsFromLayout = (layout) => {
        const s = String(layout || '').toLowerCase().trim();
        if (!s) return 0;
        if (s === 'mono') return 1;
        if (s === 'stereo' || s === 'downmix') return 2;
        if (s === 'quad') return 4;
        const m = s.match(/(\d+)\.(\d+)/);                          // "5.1", "7.1(side)", "2.1" -> full channels + LFE
        if (m) return Number(m[1]) + Number(m[2]);
        const tokens = s.split(/[+\s,]+/).filter(Boolean);          // "FL+FR+FC+LFE+BL+BR" / "L R C LFE Ls Rs" -> count positions
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

    // -=-=-= enrichStream  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Enrich a stream with both-probe bitrate + channels before summariseStream/audioQuality/scoring, so ffprobe-unreadable values (e.g. DTS-HD MA
    // bitrate in MP4) fall back to mediaInfo. Every summary and scoring call site uses this so logged tokens and the scoring path enrich identically.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= summariseStream  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Per type: video codec (+/cover for cover-art/still images); data & attachment codec only. Audio & subtitle append /default, then their role markers.
    // Audio role markers: /commentary|/description then /dub|/original. Subtitle: /forced then /commentary|/description|/sdh|/lyrics.
    // /default and /forced read the REAL disposition flag only — a title keyword must not flip a selection flag (as forced already did).
    // The role markers mirror the sorting logic (flag OR title keyword, via the shared classifiers) so every plugin's summary lines up.
    // subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Shared verbatim across all three.
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = resolveLang(s) || 'und';
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video')
            return `[video:${codec}${isCoverArt(s) ? '/cover' : ''}]`;
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            const prov = hasDisposition(s, 'dub') ? '/dub' : (hasDisposition(s, 'original') ? '/original' : '');
            return `[audio:${[lang, ch, codec, rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = s.disposition?.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}]`;
        }
        if (type === 'attachment')
            return `[attach:${codec}]`;
        if (type === 'data')
            return `[data:${codec}]`;
        return `[${type || 'unknown'}:${codec}]`;
    };

    // -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'.
    const shortLang = (l) => l.replace(/[-_.].*$/, '');

    // -=-=-= networkDataOpt  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');
    // -=-=-= globalOutputOpt  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Output-side ffmpeg options applied to every run (the place to add any universal muxer/output flag). Currently just the muxer packet-buffer ceiling for
    // ffmpeg's "Too many packets buffered" interleave error - chiefly a transcode concern (audio_clean) plus clean_and_remux's recovery of mis-interleaved
    // files; mostly vestigial on modern ffmpeg (7.x auto-sizes the queue) but cheap insurance.
    const globalOutputOpt = ' -max_muxing_queue_size 9999';
    // ===== END SHARED: stream / language / preset helpers =====

    // ===== SHARED [audio_clean, clean_and_remux]: ffmpeg metadata escaping =====
    // -=-=-= escMeta  [audio_clean, clean_and_remux] =-=-=-
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

    // Bail out gracefully on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it.');

    // AC3 valid CBR presets in bps. ffmpeg rounds an AC3 request to the NEAREST of these (can round DOWN); resolveBitrate snaps UP to a preset itself so the
    // emitted rate is never below target and the log matches what ffmpeg produces. EAC3/AAC/Opus honour arbitrary rates (verified) and are NOT snapped.
    const ac3Presets = [32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000,
                        160000, 192000, 224000, 256000, 320000, 384000, 448000, 512000, 576000, 640000];

    // Per-channel-count target bitrate (bps) for our four encodable output codecs. These sit at or comfortably above the transparent threshold from the
    // codecInfo scoring table (scaled by channel count), and serve as the FLOOR for a transcode - the actual target is max(thisTable, source).
    // AC3 / EAC3 - CBR fixed-preset: mono 192k, stereo 224k, 3ch 320k, 4ch 384k, 5ch 448k, 6ch 640k (640k is the Blu-ray 5.1 standard and the AC3/EAC3
    // codec ceiling).
    // Transcode target bitrate (bps) for a codec + channel count, from the shared CODEC_TARGET_BPS table. aac_vbr shares aac's targets; ac3/eac3 cap at 6ch.
    const targetTable = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        const family = codec === 'aac_vbr' ? 'aac' : codec;
        const tbl = CODEC_TARGET_BPS[family];
        if (!tbl) return 0;
        const cap = (family === 'ac3' || family === 'eac3') ? 6 : 8;
        return tbl[Math.min(ch, cap)] ?? tbl[cap];
    };

    // Per-codec ceiling (bps) so a lossless or very-high-bitrate source (e.g. TrueHD ~4 Mbps) can't drag the transcode target absurdly high. AC3/EAC3 cap
    // at their hard 640k limit; AAC/Opus cap generously per channel - well above transparent for any real content, but bounded.
    const codecCeiling = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        // AC3/EAC3 cap at their hard 640k codec limit; AAC and Opus scale per channel. These only ever apply to tracks at or below each codec's channel
        // maximum (the force/downmix paths block higher counts before encoding), but the per-channel form stays correct regardless of channel count.
        // Opus's ceiling (128k/ch) is deliberately half of ffmpeg's hard libopus limit (256k/ch) so a resolved Opus target can never be rejected by the
        // encoder. AAC 160k/ch is generous but bounded. Limits verified on Linux/Windows/Mac jellyfin-ffmpeg 7.1.4: ac3 clamps at exactly 640k; eac3 clamps
        // at 6144k (640k is our efficient near-transparent 5.1 target); native aac clamps ~185-208k/ch; libopus hard-ERRORS above 256k/ch (so 128k/ch is safe).
        if (codec === 'ac3' || codec === 'eac3') return 640000;
        if (codec === 'aac' || codec === 'aac_vbr') return ch * 160000;   // 160k/ch (stereo 320k, 5.1 960k, 7.1 1.28M)
        if (codec === 'opus') return ch * 128000;   // 128k/ch — half of libopus's 256k/ch hard maximum
        return 0;
    };

    // Resolve the final target bitrate (bps) for a transcode. Baseline is the per-channel table target (the FLOOR). A known lossy source pulls the target
    // DOWN toward its own bitrate when the target codec is at least as good as the source AT the source's bitrate (guard: audioQuality(target) >= srcQuality):
    // we cap at the source rate rather than inflate to the floor, because the codec-efficiency gain preserves quality at equal bitrate and extra bits above
    // source only re-encode detail a lossy source already discarded. The guard defaults OFF (srcQuality = Infinity) so only the codec_force same-channel path
    // opts in; downmix callers pass no srcBps and stay on the floor, and lossless sources skip the branch (their bitrate isn't a comparable perceptual quantity
    // - a 4 Mbps TrueHD into eac3 should target the floor, not its own rate). A pathological sub-minimum source is floored at the codec's channel-scaled
    // minimum. When the guard fails (target less efficient), a higher-than-floor lossy source still raises the target (unchanged old behavior). Result is
    // clamped to the codec ceiling, then for AC3 ONLY snapped UP to the nearest valid preset: ffmpeg rounds an AC3 request to the NEAREST preset (can round
    // down), so we round up ourselves to guarantee the emitted rate is never below target and the log matches what ffmpeg produces; eac3/aac/opus honour
    // arbitrary rates (verified) and are emitted as-is.
    const resolveBitrate = (codec, channels, srcBps = 0, srcLossless = false, srcQuality = Infinity) => {
        const floor = targetTable(codec, channels);
        if (floor <= 0) return 0;
        const src = Number(srcBps) || 0;
        let bps = floor;
        if (src > 0 && !srcLossless) {
            const family = codec === 'aac_vbr' ? 'aac' : codec;
            const targetQuality = audioQuality({ codec_name: family, channels, bit_rate: src });
            if (targetQuality >= srcQuality) {
                // Guard passed: target codec scores >= the source at the source bitrate. Track the source exactly (no pad), floored at the perceptual minimum.
                const chScale = Math.pow(Math.max(2, Number(channels) || 1) / 2, 0.65);
                const targetMin = (codecInfo[family]?.minimum || 0) * chScale;
                bps = Math.max(src, targetMin);
                // This can emit BELOW the table floor. Safe re: audioQuality's bitrate-less estBps estimate (which still assumes the floor): a re-scan reads the
                // real rate back - eac3/ac3 are CBR and always report bit_rate; aac/opus recover via resolveStreamBitrate (mediaInfo StreamSize/Duration). The
                // estBps path only fires on a stream with NO recoverable bitrate (synthetic), never a real re-scanned transcode.
            } else if (src > floor) {
                bps = src;   // guard failed (target less efficient than source): keep the source floor so a high-bitrate lossy source isn't needlessly degraded
            }
        }
        bps = Math.min(bps, codecCeiling(codec, channels));
        if (codec === 'ac3')
            bps = ac3Presets.find(p => p >= bps) ?? ac3Presets[ac3Presets.length - 1];   // AC3 only: coarse fixed table, round UP so we never land below target
        else
            bps = Math.round(bps / 1000) * 1000;   // eac3/aac/opus honour arbitrary rates - emit the exact value, rounded to whole kbps
        return bps;
    };

    // Per-codec audio argument string scoped to a specific output stream index (e.g. -b:a:2 instead of -b:a). ffmpeg accepts the stream-qualified forms; we use
    // them so each track gets its own settings when a single command touches several. Mirrors encoderArgs but with :idx suffixes. srcLossless and srcQuality
    // are forwarded to resolveBitrate (srcLossless skips the source cap for lossless sources; srcQuality gates the guarded source-cap on the force path).
    const encoderArgsIdx = (codec, channels, idx, srcBps = 0, srcLossless = false, srcQuality = Infinity) => {
        const bps = resolveBitrate(codec, channels, srcBps, srcLossless, srcQuality);
        if (bps <= 0) return '';
        if (codec === 'opus')
            return ` -vbr:a:${idx} on -compression_level:a:${idx} 10 -b:a:${idx} ${bps / 1000}k`;
        return ` -b:a:${idx} ${bps / 1000}k`;
    };

    // Emit the encoder name and VBR arguments for an aac_vbr stereo track scoped to output index idx. Uses -vbr 4 (~128-144 kb/s) when the source stereo
    // bitrate is at or below 144k — matching a lower-information source avoids wasting bits encoding silence-grade content at VBR 5 quality. Uses -vbr 5
    // (~192-224 kb/s) for all other cases, including all downmix-created stereo tracks where the source is surround (its bitrate describes N channels, not 2,
    // so 144k doesn't apply). isStereoSrc should be true only for codec_force codec-swap paths where the source is already 2ch.
    const aacVbrArgsIdx = (idx, srcBps = 0, isStereoSrc = false) => {
        const vbrLevel = (isStereoSrc && Number(srcBps) > 0 && Number(srcBps) <= 144000) ? 4 : 5;
        const approxRate = vbrLevel === 4 ? '~128k' : '~192k';
        return { encoder: 'libfdk_aac', args: ` -vbr:a:${idx} ${vbrLevel}`, approxRate };
    };

    // Resolve whether a source stream is lossless using the shared resolveCodecName resolution (same one audioQuality uses). Stored per-stream as
    // isTdarrLossless to avoid repeating the resolution at emission. Used only by codec_force to gate the source-bitrate floor in resolveBitrate — downmix
    // paths don't pass a source bitrate so they are unaffected regardless of this flag.
    const losslessSource = (stream) => codecInfo[resolveCodecName(stream)]?.lossless === true;
    
    // Parse + validate inputs. Order here mirrors the Inputs array in details() so the two never drift. Only type:'string' dropdowns are validated here -
    // free-text inputs (downmix_language) have no fixed option set, and type:'boolean' inputs (temp_on_network) are already coerced to a real true/false by
    // loadDefaultValues (any out-of-set value becomes false), so a guard on them would be dead code. Every checked value fails the file on an out-of-set value.
    const downmixLanguage = String(inputs.downmix_language).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const downmixToSix = String(inputs.downmix_to_six).trim();
    const downmixToTwo = String(inputs.downmix_to_stereo).trim();
    const downmixSecondaryStereo = String(inputs.downmix_secondary_stereo).trim();
    const surroundCodec = String(inputs.codec_surround).trim();
    const stereoCodec = String(inputs.codec_stereo).trim();
    const forceCodec = String(inputs.codec_force).trim();
    const keepBestSurroundSafe = String(inputs.keep_best_surround_safe).trim();
    const removeDuplicatesBy = String(inputs.remove_duplicates_by).trim();
    const stereoDownmix = String(inputs.method_stereo_downmix).trim();
    const methodOpusLayoutErr = String(inputs.method_opus_layout_err).trim();

    if(!['false','replace','true'].includes(downmixToSix))
        failFile(`Somehow invalid downmixToSix option provided. Check your settings!`);
    if(!['false','replace','true'].includes(downmixToTwo))
        failFile(`Somehow invalid downmixToStereo option provided. Check your settings!`);
    if(!['false','true'].includes(downmixSecondaryStereo))
        failFile(`Somehow invalid downmixSecondaryStereo option provided. Check your settings!`);
    if(!['ac3','eac3','aac','opus'].includes(surroundCodec))
        failFile(`Somehow invalid surroundCodec option provided. Check your settings!`);
    if(!['ac3','eac3','aac','aac_vbr','opus'].includes(stereoCodec))
        failFile(`Somehow invalid stereoCodec option provided. Check your settings!`);
    if(!['false','6below','2below','all'].includes(forceCodec))
        failFile(`Somehow invalid forceCodec option provided. Check your settings!`);
    if(!['false','quality','channel'].includes(keepBestSurroundSafe))
        failFile(`Somehow invalid keepBestSurroundSafe option provided. Check your settings!`);
    if(!['disabled','multi-stereo','multi-stereo-error','channel','channel-error'].includes(removeDuplicatesBy))
        failFile(`Somehow invalid removeDuplicatesBy option provided. Check your settings!`);
    if(!['default','dialogue'].includes(stereoDownmix))
        failFile(`Somehow invalid stereoDownmix option provided. Check your settings!`);
    if(!['keep','drop','remix'].includes(methodOpusLayoutErr))
        failFile(`Somehow invalid methodOpusLayoutErr option provided. Check your settings!`);

    let extraArguments = '';
    let workDone = '';
    let convert = false;

    // Check if file is a video. If it isn't then exit plugin (before the no-audio check, so a non-video reports "not a video", not "no audio streams").
    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video. \n';
        response.processFile = false;
        return response;
    }

    //We really only care about the audio streams
    let audioStreams = file.ffProbeData.streams.filter(stream => (stream?.codec_type ?? '').trim().toLowerCase() === 'audio');
    if (audioStreams.length === 0) {
        response.infoLog += '☒Video file has no audio streams to manage.\n';
        return response;
    }

    // Input summary — the streams exactly as they arrived, before any audio work.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

    // One guard around all the per-file work (dedup, index mapping, the transcode loop, and the output-summary / preset build): a deliberate failFile
    // abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the file too — annotated and carrying the full infoLog — not a silent skip.
    // (Earlier input validation and the not-a-video / no-audio pre-flight checks run before this and fail-or-skip on their own.)
    try {

        // A secondary track is any commentary or visually-impaired/descriptive track — the shared classifiers cover both the disposition flags and the title
        // keywords. Lyrics/songs are subtitle-only, so they never apply to an audio stream.
        const isSecondaryTrack = (stream) => isCommentary(stream) || isDescriptive(stream);

        // hasPreferredPrimary: does any genuine (non-commentary/descriptive) track sit in a listed language? Only then does the language filter demote unlisted
        // languages to secondary. If nothing listed is present, the filter goes dormant - every non-commentary track is treated as primary, so a foreign-only
        // file keeps its surround instead of being downmixed. Commentary/descriptive tracks are secondary regardless and never count toward preferred-primary presence.
        const hasPreferredPrimary = downmixLanguage.length > 0
            && audioStreams.some(s => !isSecondaryTrack(s) && downmixLanguage.includes(String(shortLang(resolveLang(s) || 'und'))));

        //Add secondary track flag and the cleaned language to each track
        audioStreams = audioStreams.map(item => {
            const fullLang = resolveLang(item) || 'und';
            const cleanLang = String(shortLang(fullLang));
            // Enrich with mediaInfo bitrate before audioQuality scoring so that formats like DTS-HD MA (which ffprobe can't read a bitrate for in MP4/M4V
            // containers) score and display correctly.
            const enrichedItem = enrichStream(item);
            return { ...enrichedItem,
                isTdarrSecondaryTrack: isSecondaryTrack(item),
                // Language-secondary: track language is not in downmixLanguage AND a listed-language primary exists (hasPreferredPrimary). These follow the
                // secondary path (downmix_secondary_stereo, codec_force) but are excluded from the primary downmix paths (downmix_to_six, downmix_to_stereo).
                // When no listed-language primary is present the filter is dormant, so this stays false and the track is treated as primary.
                isTdarrLangSecondary: hasPreferredPrimary && !downmixLanguage.includes(cleanLang),
                isTdarrCleanLang: cleanLang,
                isTdarrFullLang: fullLang,
                isTdarrQuality: audioQuality(enrichedItem),
                // Used by codec_force to suppress the source-bitrate floor in resolveBitrate for lossless sources. A lossless bitrate (e.g. 4 Mbps TrueHD) is not a
                // comparable quantity for a perceptual encode and would otherwise pin the output at the codec ceiling for no audible gain.
                isTdarrLossless: losslessSource(item)
            };
        });

        // candidateStreams: the pool for workStreams and keep_best_surround_safe. Lang-secondary tracks (unlisted language) are included here so codec_force
        // and downmix_secondary_stereo can act on them. They are excluded from the primary downmix paths (downmix_to_six, downmix_to_stereo) in the processing
        // loop below. Secondary and lang-secondary tracks are only dropped from the pool when there is genuinely nothing to do with them:
        // downmix_secondary_stereo is false AND codec_force is false. When codec_force is set they stay so the force-codec path can standardize their codec
        // too (e.g. codec_force='all' must touch every track, including commentary and unlisted-language tracks).
        let candidateStreams = audioStreams;
        if (downmixSecondaryStereo === 'false' && forceCodec === 'false')
            candidateStreams = candidateStreams.filter(stream => !stream.isTdarrSecondaryTrack && !stream.isTdarrLangSecondary);

        // keep_best_surround_safe: protect the best track per language among preferred-language primary tracks. Lang-secondary and disposition-secondary tracks are
        // excluded — protecting a non-preferred-language track or a commentary track serves no purpose and would prevent codec_force from touching it.
        const protectedIndices = new Set();
        if (keepBestSurroundSafe !== 'false') {
            const bestByLang = new Map();
            const qualityFirst = keepBestSurroundSafe === 'quality';
            for (const s of candidateStreams) {
                if (s.isTdarrSecondaryTrack || s.isTdarrLangSecondary) continue;
                const cur = bestByLang.get(s.isTdarrCleanLang);
                if (!cur) {
                    bestByLang.set(s.isTdarrCleanLang, s);
                    continue;
                }
                const better = qualityFirst
                    ? s.isTdarrQuality > cur.isTdarrQuality
                      || (s.isTdarrQuality === cur.isTdarrQuality && s.channels > cur.channels)
                      || (s.isTdarrQuality === cur.isTdarrQuality && s.channels === cur.channels && s.index < cur.index)
                    : s.channels > cur.channels
                      || (s.channels === cur.channels && s.isTdarrQuality > cur.isTdarrQuality)
                      || (s.channels === cur.channels && s.isTdarrQuality === cur.isTdarrQuality && s.index < cur.index);
                if (better) bestByLang.set(s.isTdarrCleanLang, s);
            }
            for (const s of bestByLang.values()) protectedIndices.add(s.index);
        }

        // Languages that already have a primary stereo track, so downmix_to_stereo can honour "create a 2 channel track only if one doesn't exist". Uses
        // isTdarrCleanLang (normalised short code, e.g. 'en' for 'en-US') to match the same key used by created2chLangs and ffstreamLangKey — preventing
        // redundant stereo creation when the existing track is tagged with a regional variant like en-US.
        const existingStereoLangs = new Set(audioStreams.filter(s => s.channels === 2 && !s.isTdarrSecondaryTrack && !s.isTdarrLangSecondary).map(s => s.isTdarrCleanLang));

        // Languages that already have a primary 5.1/6ch track, so downmix_to_six can honour "create a 5.1 track only if one doesn't exist". Mirrors
        // existingStereoLangs. Channels > 4 && <= 6 covers 5.0 and 5.1 without catching 4.0/4.1 or 7.1 sources.
        const existingSixLangs = new Set(audioStreams.filter(s => s.channels > 4 && s.channels <= 6 && !s.isTdarrSecondaryTrack && !s.isTdarrLangSecondary).map(s => s.isTdarrCleanLang));

        // Identify lower-quality duplicates. Within each group keep only the highest quality stream; the rest are marked for removal ('multi-stereo'/'channel')
        // or, for the "-error" variants, abort the plugin immediately (no streams removed, no other changes applied). The "-error" suffix only changes what
        // happens on a hit, never the grouping. Grouping key by mode:
        //   'channel'/'channel-error' - (lang, exact channel count, primary/secondary): one track per distinct channel count survives (a 7.1, a 5.1 and
        //     a 2.0 of the same language are all kept).
        //   'multi-stereo'/'multi-stereo-error' - (lang, broad surround-vs-stereo role, primary/secondary): collapses every surround variant of a
        //     language to a single best surround plus a single best stereo.
        //       Exception: when downmix_to_six is enabled the 5-6ch band is carved into its own role (not folded into "surround") so a
        //       downmix-created/pre-existing 5.1/5.0 is never removed in favour of a 7.1.
        //       Exception: when downmix_to_stereo is enabled exactly-2ch tracks are carved into their own role (not folded into "stereo") so a
        //       downmix-created/pre-existing 2.0 is never removed in favour of a mono.
        //       Both exceptions only apply while the matching downmix option is enabled and use the same channel bands as existingSixLangs/
        //       existingStereoLangs, so dedup can't disagree with and re-trigger the downmix creation guards (this previously caused an infinite
        //       create/remove loop between the two plugin runs).
        // Note: dedup runs across ALL audio streams regardless of downmix_language/downmix_secondary_stereo (those govern transcoding candidates, not what's a
        // genuine duplicate - a duplicate in a non-preferred language is still a duplicate). Protected (keep_best_surround_safe) tracks are never removed and
        // never trigger the "-error" abort - a protected track was never a removal candidate.
        const removeDuplicatesErrorMode = removeDuplicatesBy === 'multi-stereo-error' || removeDuplicatesBy === 'channel-error';
        const removeDuplicatesGroupBy = removeDuplicatesErrorMode ? removeDuplicatesBy.replace(/-error$/, '') : removeDuplicatesBy;
        const streamsToRemove = new Set();
        if (removeDuplicatesGroupBy === 'channel' || removeDuplicatesGroupBy === 'multi-stereo') {
            const seen = new Map();
            // A measured bitrate beats a bitrate-less duplicate of the same tier: audioQuality can only ESTIMATE a track with no reported bitrate (optimistically,
            // from the codec's per-channel target), so it must not win the "which duplicate to keep" decision over a track whose bitrate we actually measured. Both
            // probes are already consulted (resolveStreamBitrate above), so bit_rate === 0 here means genuinely unknown, not just "ffprobe couldn't read it".
            const hasKnownRate = (s) => Number(s.bit_rate || 0) > 0;
            // On a quality tie, keep the higher channel count before falling back to index - matches keep_best_surround_safe, so multi-stereo dedup collapsing a
            // language's surround variants keeps the 7.1 over a same-quality 5.1 (channel mode already tiers by exact count, so this only bites the broad modes).
            const byQuality = [...audioStreams].sort((a, b) =>
                (hasKnownRate(b) ? 1 : 0) - (hasKnownRate(a) ? 1 : 0) || b.isTdarrQuality - a.isTdarrQuality || b.channels - a.channels || a.index - b.index);
            for (const s of byQuality) {
                let tier;
                if (removeDuplicatesGroupBy === 'channel') {
                    tier = s.channels;
                } else if (downmixToSix !== 'false' && s.channels > 4 && s.channels <= 6) {
                    tier = 'six';
                } else if (downmixToTwo !== 'false' && s.channels === 2) {
                    tier = 'stereo2';
                } else {
                    tier = s.channels > 2 ? 'surround' : 'stereo';
                }
                // Group only by the genuine commentary/VI marker (isTdarrSecondaryTrack), NOT by lang-secondary. A foreign-language MAIN track and a
                // foreign-language COMMENTARY track share the same language and channel count but are different content — keying on lang-secondary would
                // collapse them together and wrongly delete the commentary.
                const key = `${s.isTdarrCleanLang}|${tier}|${s.isTdarrSecondaryTrack}`;
                if (seen.has(key)) {
                    if (protectedIndices.has(s.index)) continue;
                    const kept = seen.get(key);
                    if (removeDuplicatesErrorMode) {
                        const rmRate = hasKnownRate(s) ? ` @ ${Math.round(Number(s.bit_rate) / 1000)} kb/s` : '';
                        const keptRate = hasKnownRate(kept) ? ` @ ${Math.round(Number(kept.bit_rate) / 1000)} kb/s` : '';
                        failFile(`Stream ${s.index}: Duplicate audio track detected (${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrCleanLang}${rmRate}) alongside stream ${kept.index} (${kept.codec_name || 'unknown'}${keptRate}) under remove_duplicates_by="${removeDuplicatesBy}". Aborting - tag/remove tracks manually and requeue, or switch remove_duplicates_by to a non-error mode.`);
                    }
                    streamsToRemove.add(s.index);
                    // Show the removed track's bitrate and the kept track's for contrast — duplicates are
                    // decided by quality score (largely bitrate-driven), so this makes the choice transparent.
                    const rmRate = hasKnownRate(s) ? ` @ ${Math.round(Number(s.bit_rate) / 1000)} kb/s` : '';
                    const keptRate = hasKnownRate(kept) ? ` @ ${Math.round(Number(kept.bit_rate) / 1000)} kb/s` : '';
                    workDone += `☐Stream ${s.index}: Removing duplicate (lower quality ${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrCleanLang}${rmRate}) - keeping stream ${kept.index} (${kept.codec_name || 'unknown'}${keptRate})\n`;
                } else
                    seen.set(key, s);
            }
        }

        // libopus only accepts its RFC-mapping layouts and HARD-ERRORS on the rest, failing the whole job; ffmpeg's DEFAULT layout for 3ch
        // (2.1) and 4ch (4.0) is also rejected. AC3/EAC3/AAC accept every layout, so this only guards the force-to-opus path. OK set + relabels
        // verified via `anullsrc=channel_layout=X -c:a libopus` on jellyfin-ffmpeg (see the ffmpeg-codec-ranges memory).
        const OPUS_OK_LAYOUTS = new Set(['mono', 'stereo', '3.0', 'quad', '5.0', '5.1', '5.1(side)', '6.1', '7.1']);
        const opusAcceptsLayout = (channels, layoutStr) => {
            const lay = (layoutStr || '').toLowerCase().trim();
            if (lay) return OPUS_OK_LAYOUTS.has(lay);
            // No explicit layout → ffmpeg assigns the default for the count; those are OK for every count EXCEPT 3 (2.1) and 4 (4.0).
            return channels >= 1 && channels <= 8 && channels !== 3 && channels !== 4;
        };
        // Layouts that map LOSSLESSLY to an opus-accepted layout at the SAME channel count by pure relabel (side↔back position equivalence)
        // - emitted via channelmap (a permutation matrix, never a mix). Anything not here remixes down to stereo.
        const OPUS_RELABEL = {
            '5.0(side)': { layout: '5.0', map: 'FL-FL|FR-FR|FC-FC|SL-BL|SR-BR' },
            '6.1(back)': { layout: '6.1', map: 'FL-FL|FR-FR|FC-FC|LFE-LFE|BL-SL|BR-SR|BC-BC' },
        };
        // Audio streams still present (not in streamsToRemove), read at call time so it reflects dedup + pre-pass removals - backs the never-drop-last-track guard.
        const countSurvivingAudio = () => file.ffProbeData.streams.filter(a => (a?.codec_type || '').toLowerCase() === 'audio' && !streamsToRemove.has(a.index)).length;

        // method_opus_layout_err=drop must remove streams BEFORE outputAudioIdxMap / the -map removal are built below - a mid-loop removal
        // would break the OTHER forced tracks' -c:a:N numbering. Pre-scan for a surround track codec_force would send to opus with a
        // libopus-incompatible layout that NO downmix will convert to stereo, and remove it (never the last audio track). keep/remix stay in
        // the loop; this mirrors the loop's surround shouldForce for exactly the drop subset.
        if (methodOpusLayoutErr === 'drop' && forceCodec !== 'false' && surroundCodec === 'opus') {
            for (const s of audioStreams) {
                if (streamsToRemove.has(s.index)) continue;
                const ch = resolveChannels(s);
                const lay = (s.channel_layout || '').toLowerCase().trim();
                if (ch <= 2 || ch > 8) continue;                                             // stereo→codec_stereo; >8 blocked (targetMaxCh)
                if ((s.codec_name || '').toLowerCase() === 'opus') continue;                 // already opus
                if (protectedIndices.has(s.index) && forceCodec !== 'all') continue;         // keep_best_surround_safe
                if (!(forceCodec === 'all' || (forceCodec === '6below' && ch <= 6))) continue;   // surround shouldForce (mirrors the loop)
                if (opusAcceptsLayout(ch, lay)) continue;
                if (OPUS_RELABEL[lay]) continue;                                             // losslessly relabelable → the loop transcodes it, never drop
                // A downmix that converts this track to stereo makes it opus-safe → don't drop: secondary→downmix_secondary_stereo=true; primary→
                // downmix_to_stereo=replace (any >2ch), or downmix_to_six=replace (>6ch → opus-safe 5.1). Only a NON-protected primary converts in place: a
                // protected best track flips 'replace'→'add' (leaves the surround, so force still hits it), so those stay droppable. The per-language one-shot
                // (created2chLangs/six) is dynamic and can't be predicted here; if it pre-empts the downmix the track lands in the loop fallback, logged there.
                const secondary = s.isTdarrSecondaryTrack || s.isTdarrLangSecondary;
                if (secondary ? downmixSecondaryStereo === 'true'
                              : (!protectedIndices.has(s.index) && (downmixToTwo === 'replace' || (ch > 6 && downmixToSix === 'replace')))) continue;
                if (countSurvivingAudio() <= 1) continue;                                    // never drop the last audio track
                streamsToRemove.add(s.index);
                workDone += `☒Stream ${s.index}: Dropping - libopus can't encode a ${s.channel_layout || `${ch}ch`} layout (method_opus_layout_err=drop).\n`;
            }
        }

        // inputAudioIdxMap: 0-based audio-type index within the INPUT file (for -map 0:a:N).
        // outputAudioIdxMap: 0-based audio-type index within the OUTPUT (for -c:a:N and -metadata:s:a:N).
        // These differ when removeDuplicatesBy removes streams, since -map 0:a:N always references input.
        const inputAudioIdxMap = new Map();
        const outputAudioIdxMap = new Map();
        let inputAudioCounter = 0;
        let totalOutputAudioBeforeNew = 0;
        for (const stream of file.ffProbeData.streams) {
            if ((stream?.codec_type || '').trim().toLowerCase() === 'audio') {
                inputAudioIdxMap.set(stream.index, inputAudioCounter++);
                if (!streamsToRemove.has(stream.index))
                    outputAudioIdxMap.set(stream.index, totalOutputAudioBeforeNew++);
            }
        }

        //Remove any tracks that we won't use based on channel count, etc.
        // aac_vbr is treated as the aac family for codec-identity checks — ffprobe always reports codec_name 'aac' regardless of which encoder produced the
        // track, so comparing against 'aac_vbr' directly would never match and would needlessly re-encode existing AAC tracks.
        const stereoCodecFamily = stereoCodec === 'aac_vbr' ? 'aac' : stereoCodec;
        const channelMatch = (stream) => {
            //8 channel
            if(stream.channels > 6 && (downmixToSix === 'false') && (downmixToTwo === 'false') && (forceCodec === 'all' && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
                return false;
            //3-6 channel
            else if(stream.channels > 2 && stream.channels <= 6 && (downmixToTwo === 'false') && (['all','6below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
                return false;
            if((stream.channels <= 2) && ['all','6below','2below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === stereoCodecFamily))
                return false;
            return true;
        };

        // workStreams: surviving candidates that still need codec work (downmix or force codec).
        let workStreams = candidateStreams
            .filter(s => !streamsToRemove.has(s.index))
            .filter(s => channelMatch(s));

        workStreams.sort((a, b) => {
            // language priority
            let aLang = downmixLanguage.indexOf(a.isTdarrFullLang);
            let bLang = downmixLanguage.indexOf(b.isTdarrFullLang);

            if(aLang === -1) aLang = downmixLanguage.indexOf(a.isTdarrCleanLang);
            if(bLang === -1) bLang = downmixLanguage.indexOf(b.isTdarrCleanLang);

            const aRank = aLang === -1 ? 999 : aLang;
            const bRank = bLang === -1 ? 999 : bLang;
            if (aRank !== bRank) return aRank - bRank;

            const aRole = (a.isTdarrSecondaryTrack || a.isTdarrLangSecondary) ? 1 : 0;
            const bRole = (b.isTdarrSecondaryTrack || b.isTdarrLangSecondary) ? 1 : 0;
            if (aRole !== bRole) return aRole - bRole;

            // channel ordering
            if (a.channels !== b.channels)
                return b.channels - a.channels;

            const aQuality = a.isTdarrQuality;
            const bQuality = b.isTdarrQuality;
            if(aQuality !== bQuality) return bQuality - aQuality;

            return a.index - b.index;
        });

        if (workStreams.length === 0 && streamsToRemove.size === 0) {
            response.infoLog += '☑ No audio tracks require changes.\n';
            return response;
        }

        // Seed extraArguments with removal exclusions before any codec args.
        if (streamsToRemove.size > 0) {
            for (const idx of streamsToRemove)
                extraArguments += ` -map -0:${idx}`;
            convert = true;
        }

        // New streams added via -map are numbered after all surviving original audio streams.
        let newStreamOutputIdx = totalOutputAudioBeforeNew;

        // Create at most one 6ch and one 2ch downmix per language, sourced from that language's best (first, highest-channel/quality) track.
        const created6chLangs = new Set();
        const created2chLangs = new Set();

        // Tracks which input audio indices have already received a -c:a:N assignment so we don't emit conflicting codec directives for the same stream.
        const modifiedAudioIdx = new Set();

        // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset).
        // outputAudioOverride: outputAudioIdx -> {codec, channels, bps} for in-place transcodes/downmixes.
        // appendedAudio: streams added via -map 0:a:N (downmix 'true'/add), appended after all originals.
        const outputAudioOverride = new Map();
        const appendedAudio = [];

        // Build the title for a new or replaced track. The original track title is always preserved and the new channel count is appended with -> (e.g. a
        // source titled "E-AC-3 Atmos 5.1" downmixed to stereo becomes "E-AC-3 Atmos 5.1 -> 2.0"). This keeps role words like "Commentary"/"Director's
        // Commentary" visible after a downmix. When the source has no title the new channel count alone is used (e.g. "2.0"). If the title already ends in
        // the target label (not preceded by a digit/dot, so "5.1" won't match "15.1") it is returned unchanged to avoid "... 2.0 -> 2.0".
        const buildTitle = (srcStream, targetLabel) => {
            const origTitle = (srcStream.tags?.title || mediaInfoFor(srcStream)?.Title || '').trim();
            if (!origTitle) return targetLabel;
            const escapedLabel = targetLabel.replace(/\./g, '\\.');
            if (new RegExp(`(?:^|[^0-9.])${escapedLabel}$`).test(origTitle)) return origTitle;
            return `${origTitle} -> ${targetLabel}`;
        };

        // Lo/Ro stereo downmix matrices, generated from each source layout's exact channel order.
        // WHY layout-keyed and not channel-count-keyed: several standard layouts share a channel count but order their channels differently (e.g. 6 channels
        // can be 5.1, 5.1(side), 6.0, 6.0(front), or hexagonal). A count-based matrix would silently mis-route - dropping the wrong channel as "LFE" or
        // panning a back-center where a surround belongs - producing audio that sounds wrong without any error. So we resolve the EXACT layout to its
        // canonical channel list and build the matrix from speaker roles. Any layout without a verified channel list returns null and the caller falls back
        // to ffmpeg's safe -ac 2 downmix.
        // Downmix rules (standard Lo/Ro): FL/FR kept at full scale (peak 1.0); FC at -3 dB (0.707) into both so dialogue stays clear; LFE dropped (avoids
        // mud); back/side/wide at -3 dB to their own side; any centered channel (FC, BC) split equally to both sides. The -3 dB attenuation on
        // center/surround provides the clipping headroom, matching the industry-standard Lo/Ro downmix used by Blu-ray players, AV receivers, and streaming
        // services.
        // Canonical ffmpeg channel lists per layout (verified against ffmpeg-utils "Channel Layout" docs). Position in the array is the cN index used by
        // the pan filter.
        const CANON_LAYOUTS = {
            '3.1':            ['FL', 'FR', 'FC', 'LFE'],
            '4.0':            ['FL', 'FR', 'FC', 'BC'],
            '5.0':            ['FL', 'FR', 'FC', 'BL', 'BR'],
            '5.0(side)':      ['FL', 'FR', 'FC', 'SL', 'SR'],
            '5.1':            ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
            '5.1(side)':      ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
            '6.1':            ['FL', 'FR', 'FC', 'LFE', 'BC', 'SL', 'SR'],
            '6.1(back)':      ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'BC'],
            '6.1(front)':     ['FL', 'FR', 'LFE', 'FLC', 'FRC', 'SL', 'SR'],
            '7.1':            ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'],
            '7.1(wide)':      ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'FLC', 'FRC'],
            '7.1(wide-side)': ['FL', 'FR', 'FC', 'LFE', 'FLC', 'FRC', 'SL', 'SR'],
        };

        // Per-speaker contribution to the L and R downmix outputs. Centered channels (FC, BC) contribute equally to both; left-side channels contribute only to L,
        // right-side only to R; LFE contributes nothing. Values are the standard Lo/Ro gains.
        const SPEAKER_GAINS = {
            FL:  { L: 1.0,   R: 0     },
            FR:  { L: 0,     R: 1.0   },
            FC:  { L: 0.707, R: 0.707 },
            LFE: { L: 0,     R: 0     },
            BL:  { L: 0.707, R: 0     },
            BR:  { L: 0,     R: 0.707 },
            SL:  { L: 0.707, R: 0     },
            SR:  { L: 0,     R: 0.707 },
            FLC: { L: 0.707, R: 0     },
            FRC: { L: 0,     R: 0.707 },
            BC:  { L: 0.5,   R: 0.5   },
        };

        // Build a Lo/Ro pan=stereo matrix string for a known canonical layout, or null if the layout contributes no surround/center content (pure FL/FR or
        // FL/FR/LFE) where -ac 2 is already correct. FL/FR kept at full scale (peak 1.0); center/surround fold in at standard Lo/Ro gains (-3 dB for
        // FC/BC/surrounds, LFE dropped). The -3 dB attenuation provides the clipping headroom - a global sum-normalization is not used because it produces
        // output 6-8 dB quieter than the source on typical content.
        const buildPanMatrix = (channelList) => {
            const termsL = [];
            const termsR = [];
            let peakL = 0;
            let peakR = 0;
            let hasNonFront = false; // any channel beyond FL/FR/LFE that needs explicit panning

            channelList.forEach((spk, i) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return; // unknown speaker name — skip (shouldn't happen for canonical layouts)
                if (spk !== 'FL' && spk !== 'FR' && spk !== 'LFE') hasNonFront = true;
                if (spk === 'FL') peakL = 1.0;
                if (spk === 'FR') peakR = 1.0;
            });

            // No surround/center to fold in (e.g. 2.1 = FL FR LFE, or stereo) — let -ac 2 handle it.
            if (!hasNonFront) return null;
            // Defensive: a layout missing a front channel leaves peakL/peakR at 0 and would make the gain normalisation below divide by zero. Every canonical
            // layout leads with FL,FR so this never triggers today - it just keeps the matrix safe if a non-FL/FR-leading layout is ever added to CANON_LAYOUTS.
            if (peakL <= 0 || peakR <= 0) return null;

            channelList.forEach((spk, i) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return;
                // Divide by peakL/peakR (always 1.0 — set from FL/FR) so coefficients are emitted as-authored.
                // Floor to 3 decimals (truncate, not round) for deterministic output.
                if (g.L > 0) termsL.push(`${(Math.floor((g.L / peakL) * 1000) / 1000).toFixed(3)}*c${i}`);
                if (g.R > 0) termsR.push(`${(Math.floor((g.R / peakR) * 1000) / 1000).toFixed(3)}*c${i}`);
            });

            return `pan=stereo|FL=${termsL.join('+')}|FR=${termsR.join('+')}`;
        };

        // Resolve a source stream to its canonical layout key, then to a verified pan matrix (or null). We normalize the ffmpeg channel_layout string (lowercased,
        // trimmed). If the file reports no layout or an unrecognized one, we return null so the caller uses ffmpeg's safe -ac 2 downmix.
        const downmixMatrix = (srcStream) => {
            const layoutFull = (srcStream?.channel_layout || '').toLowerCase().trim();
            if (!layoutFull) return null;
            // ffmpeg layout names are already lowercase-stable (e.g. "5.1(side)"); match directly.
            const channelList = CANON_LAYOUTS[layoutFull];
            if (!channelList) return null;
            // Sanity: the reported channel count should match the canonical list length; if a file lies about
            // its layout vs channel count, fall back to the safe path rather than emit a mismatched matrix.
            if (Number(srcStream?.channels) !== channelList.length) return null;
            return buildPanMatrix(channelList);
        };

        // Channel/filter snippet for a new or replaced stereo track.
        const stereoArg = (idx, srcStream) => {
            const matrix = (stereoDownmix === 'dialogue') ? downmixMatrix(srcStream) : null;
            return matrix ? ` -filter:a:${idx} "${matrix}"` : ` -ac:a:${idx} 2`;
        };

        for (let i = 0; i < workStreams.length; i++) {
            const ffstream = workStreams[i];
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const streamLang = resolveLang(ffstream);
            const outputAudioIdx = outputAudioIdxMap.get(ffstream.index);
            const srcAudioIdx = inputAudioIdxMap.get(ffstream.index);

            // Guard: if either index is missing the stream wasn't tracked correctly — skip rather than emitting a broken argument like -c:a:undefined
            // which ffmpeg will reject with a cryptic error.
            if (outputAudioIdx === undefined || srcAudioIdx === undefined) {
                response.infoLog += `☒Stream ${ffstream.index}: Could not resolve audio index mapping, skipping.\n`;
                continue;
            }

            const ffstreamLangKey = ffstream.isTdarrCleanLang;
            const isProtected = protectedIndices.has(ffstream.index);

            // Human-readable source bitrate for the operation log. Falls back to the known target bitrate for our own output codecs (common for
            // freshly-transcoded tracks where the muxer omits per-stream bitrate), or 'unknown bitrate' otherwise.
            const srcBitrate = Number(ffstream.bit_rate || 0);
            const srcRateStr = srcBitrate > 0
                ? `${Math.round(srcBitrate / 1000)} kb/s`
                : (() => {
                    const tb = targetTable(ffstreamCodec, ffstream.channels);
                    return tb > 0 ? `~${tb / 1000} kb/s` : 'unknown bitrate';
                })();

            // Secondary tracks (commentary, VI, etc.) and lang-secondary tracks (unlisted language) get the stereo-only path and never trigger the
            // primary downmix (downmix_to_six/two).
            if (ffstream.isTdarrSecondaryTrack || ffstream.isTdarrLangSecondary) {
            // ---- SECONDARY: DOWNMIX TO STEREO ----
            // Each secondary surround track is transcoded in place independently — one stereo per secondary track, preserving all of them.
            // keep_best_surround_safe never protects secondary or lang-secondary tracks (they are excluded from protectedIndices), so there is no
            // protected-source case here: an enabled secondary downmix always transcodes in place.
            if (downmixSecondaryStereo !== 'false' && ffstream.channels > 2 && !modifiedAudioIdx.has(outputAudioIdx)) {
                const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                // Downmix changes channel count, so the source bitrate isn't a comparable floor — use the table target for 2ch only.
                // aac_vbr downmixes always use VBR 5 since there is no comparable stereo source bitrate.
                if (stereoCodec === 'aac_vbr') {
                    const { encoder, args, approxRate } = aacVbrArgsIdx(outputAudioIdx);
                    workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → aac stereo @ ${approxRate} (libfdk VBR q5, secondary)\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escMeta(streamLang)}"`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: 2, bps: 0, approxRate });
                } else {
                    const dstBitArg = encoderArgsIdx(stereoCodec, 2, outputAudioIdx);
                    const dstBitStr = resolveBitrate(stereoCodec, 2);
                    workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${stereoCodec} stereo @ ${dstBitStr / 1000} kb/s (secondary)\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${stereoCodec}${dstBitArg}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escMeta(streamLang)}"`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: stereoCodec, channels: 2, bps: dstBitStr });
                }
                convert = true;
            }
            } else {
            // ====== DOWNMIX TO 6 CHANNELS ======
            // One 6ch per language, from its best >6ch source. A protected best source is never replaced in place, so 'replace' becomes 'add' for it.
            if (downmixToSix !== 'false' && ffstream.channels > 6 && !created6chLangs.has(ffstreamLangKey)
                && !existingSixLangs.has(ffstreamLangKey)) {
                const newTitle = escMeta(buildTitle(ffstream, '5.1'));
                const sixMode = (downmixToSix === 'replace' && isProtected) ? 'true' : downmixToSix;

                if (sixMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    const dstBitArg = encoderArgsIdx(surroundCodec, 6, outputAudioIdx);
                    const dstBitStr = resolveBitrate(surroundCodec, 6);
                    workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${surroundCodec} 6ch @ ${dstBitStr / 1000} kb/s\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${surroundCodec}${dstBitArg} -ac:a:${outputAudioIdx} 6 -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escMeta(streamLang)}"`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: surroundCodec, channels: 6, bps: dstBitStr });
                    created6chLangs.add(ffstreamLangKey);
                    convert = true;
                } else if (sixMode === 'true') {
                    const dstBitArg = encoderArgsIdx(surroundCodec, 6, newStreamOutputIdx);
                    const dstBitStr = resolveBitrate(surroundCodec, 6);
                    workDone += `☐Stream ${ffstream.index}: Adding ${surroundCodec} 6ch @ ${dstBitStr / 1000} kb/s from ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr}\n`;
                    extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${surroundCodec}${dstBitArg} -ac:a:${newStreamOutputIdx} 6 -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escMeta(streamLang)}"`;
                    newStreamOutputIdx++;
                    appendedAudio.push({ srcStream: ffstream, codec: surroundCodec, channels: 6, bps: dstBitStr });
                    created6chLangs.add(ffstreamLangKey);
                    convert = true;
                }
            }

            // ====== DOWNMIX TO 2 CHANNELS ======
            // One stereo track per language, from its best >2ch source, only when the language has no primary stereo already. Protected best source:
            // 'replace' becomes 'add'. When 'replace' is requested but downmix_to_six already consumed this same source in place (single >6ch source,
            // both downmixes enabled), the in-place slot is taken, so we fall back to ADDING a stereo from the original input. The user enabled
            // downmix_to_stereo expecting a 2.0 in the output, so a lone 7.1 with both downmixes on yields a 5.1 and a 2.0 rather than silently dropping
            // the stereo.
            if (downmixToTwo !== 'false' && ffstream.channels > 2 && !created2chLangs.has(ffstreamLangKey) && !existingStereoLangs.has(ffstreamLangKey)) {
                const twoMode = (downmixToTwo === 'replace' && isProtected) ? 'true' : downmixToTwo;

                if (twoMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                    // aac_vbr downmixes always use VBR 5 — source is surround, its bitrate describes N channels not 2.
                    if (stereoCodec === 'aac_vbr') {
                        const { encoder, args, approxRate } = aacVbrArgsIdx(outputAudioIdx);
                        workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → aac stereo @ ${approxRate} (libfdk VBR q5)\n`;
                        extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                        if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escMeta(streamLang)}"`;
                        modifiedAudioIdx.add(outputAudioIdx);
                        outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: 2, bps: 0, approxRate });
                    } else {
                        const dstBitArg = encoderArgsIdx(stereoCodec, 2, outputAudioIdx);
                        const dstBitStr = resolveBitrate(stereoCodec, 2);
                        workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${stereoCodec} stereo @ ${dstBitStr / 1000} kb/s\n`;
                        extraArguments += ` -c:a:${outputAudioIdx} ${stereoCodec}${dstBitArg}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                        if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escMeta(streamLang)}"`;
                        modifiedAudioIdx.add(outputAudioIdx);
                        outputAudioOverride.set(outputAudioIdx, { codec: stereoCodec, channels: 2, bps: dstBitStr });
                    }
                    created2chLangs.add(ffstreamLangKey);
                    convert = true;
                } else if (twoMode === 'true' || (twoMode === 'replace' && modifiedAudioIdx.has(outputAudioIdx))) {
                    const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                    // aac_vbr downmixes always use VBR 5 — source is surround, its bitrate describes N channels not 2.
                    if (stereoCodec === 'aac_vbr') {
                        const { encoder, args, approxRate } = aacVbrArgsIdx(newStreamOutputIdx);
                        workDone += `☐Stream ${ffstream.index}: Adding aac stereo @ ${approxRate} (libfdk VBR q5) from ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr}\n`;
                        extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${encoder}${args}${stereoArg(newStreamOutputIdx, ffstream)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                        if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escMeta(streamLang)}"`;
                        newStreamOutputIdx++;
                        appendedAudio.push({ srcStream: ffstream, codec: 'aac', channels: 2, bps: 0, approxRate });
                    } else {
                        const dstBitArg = encoderArgsIdx(stereoCodec, 2, newStreamOutputIdx);
                        const dstBitStr = resolveBitrate(stereoCodec, 2);
                        workDone += `☐Stream ${ffstream.index}: Adding ${stereoCodec} stereo @ ${dstBitStr / 1000} kb/s from ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr}\n`;
                        extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${stereoCodec}${dstBitArg}${stereoArg(newStreamOutputIdx, ffstream)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                        if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escMeta(streamLang)}"`;
                        newStreamOutputIdx++;
                        appendedAudio.push({ srcStream: ffstream, codec: stereoCodec, channels: 2, bps: dstBitStr });
                    }
                    created2chLangs.add(ffstreamLangKey);
                    convert = true;
                }
                }
            }

            // ====== FORCE CODEC ======
            // Skip protected best tracks UNLESS codec_force is 'all' — per keep_best_surround_safe, the protected track can only be touched when codec_force
            // is 'all'. Also skip when the source has more channels than the target codec supports (ac3/eac3 max 6ch, opus/aac max 8ch) to avoid an ffmpeg
            // encode failure. Channel count is resolved from ffprobe, then mediaInfo, then a channel-layout string (resolveChannels): a track no source can
            // measure is left untouched rather than guessed, since a wrong count could route it to a codec that can't hold its real channels and fail.
            const forceChannels = (forceCodec !== 'false' && !modifiedAudioIdx.has(outputAudioIdx) && (!isProtected || forceCodec === 'all')) ? resolveChannels(ffstream) : -1;
            if (forceChannels === 0)
                workDone += `☒Stream ${ffstream.index}: Skipping codec_force - no channel count in ffprobe, mediaInfo, or channel layout; can't safely choose a target codec or verify its channel limit.\n`;
            if (forceChannels > 0) {
                const isStereo = forceChannels <= 2;
                const targetCodec = isStereo ? stereoCodec : surroundCodec;
                // aac_vbr is only valid for stereo; for family-identity checks compare against 'aac'.
                const targetCodecFamily = targetCodec === 'aac_vbr' ? 'aac' : targetCodec;

                if (ffstreamCodec !== targetCodecFamily) {
                    const shouldForce =
                        forceCodec === 'all' ||
                        (forceCodec === '6below' && !isStereo && forceChannels <= 6) ||
                        (forceCodec === '6below' && isStereo) ||
                        (forceCodec === '2below' && isStereo);

                    const targetMaxCh = ({ ac3: 6, eac3: 6, aac: 8, aac_vbr: 8, opus: 8 })[targetCodec] ?? 8;

                    if (shouldForce && forceChannels > targetMaxCh) {
                        workDone += `☒Stream ${ffstream.index}: Not forcing ${targetCodecFamily} - ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} exceeds the ${targetMaxCh}ch limit for ${targetCodecFamily}. Enable downmix_to_six to reduce channels first.\n`;
                    } else if (shouldForce) {
                        // Guard the force-to-opus path against libopus-incompatible layouts (method_opus_layout_err). Only opus is affected - AC3/EAC3/AAC
                        // take any layout. `forced` gates the run's convert flag so a keep/defer makes no change (and doesn't cause a needless re-run).
                        const srcLayout = (ffstream.channel_layout || '').toLowerCase().trim();
                        const opusBad = targetCodec === 'opus' && forceChannels > 2 && !opusAcceptsLayout(forceChannels, srcLayout);
                        const relabel = opusBad ? OPUS_RELABEL[srcLayout] : null;
                        const layoutName = srcLayout || `${forceChannels}ch`;
                        // remix→stereo defers when a stereo already exists for this language - pre-existing (existingStereoLangs) OR created earlier this run
                        // by a downmix or a prior remix (created2chLangs). A second one would be a same-language duplicate stereo that dedup only collapses on
                        // the NEXT run (non-idempotent), or persists if dedup is disabled. Fall back to keep.
                        const remixDefer = opusBad && !relabel && methodOpusLayoutErr === 'remix'
                            && (existingStereoLangs.has(ffstreamLangKey) || created2chLangs.has(ffstreamLangKey));
                        let forced = false;

                        if (opusBad && !relabel && (methodOpusLayoutErr === 'keep' || methodOpusLayoutErr === 'drop' || remixDefer)) {
                            // No lossless relabel exists (relabelable layouts fall through to the transcode branch below in every mode). keep; a remix that
                            // deferred to an existing stereo; or a drop the pre-pass couldn't apply - leave the source codec. Real drops already happened in the
                            // pre-pass (before the index map); a drop reaches here only when the pre-pass couldn't remove it: the last audio track, or a downmix
                            // it expected to convert this track was pre-empted (per-language slot already filled). Report the actual reason, not a fixed one.
                            let why;
                            if (remixDefer) why = ' (a stereo already exists for this language)';
                            else if (methodOpusLayoutErr === 'drop') why = countSurvivingAudio() <= 1 ? ' (kept - it is the last audio track)' : ' (kept - no downmix converted it to an opus-safe layout)';
                            else why = ', enable a downmix option or set method_opus_layout_err to drop/remix';
                            workDone += `☒Stream ${ffstream.index}: Not forcing opus - libopus can't encode a ${layoutName} layout; left as ${ffstreamCodec}${why}.\n`;
                        } else if (opusBad && methodOpusLayoutErr === 'remix' && !relabel) {
                            // remix→stereo: downmix in place to a codec_stereo track (NOT opus) so it stays stereo-codec-consistent and idempotent (a stereo
                            // opus would be re-forced to codec_stereo next run). Mirrors downmix_secondary_stereo; the 2ch table target (surround source
                            // bitrate isn't a comparable floor).
                            const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                            if (stereoCodec === 'aac_vbr') {
                                const { encoder, args, approxRate } = aacVbrArgsIdx(outputAudioIdx);
                                workDone += `☐Stream ${ffstream.index}: Remixing ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} (${layoutName}, opus-incompatible) → aac stereo @ ${approxRate} (libfdk VBR q5)\n`;
                                extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                                modifiedAudioIdx.add(outputAudioIdx);
                                outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: 2, bps: 0, approxRate });
                            } else {
                                const dstBitArg = encoderArgsIdx(stereoCodec, 2, outputAudioIdx);
                                const dstBitStr = resolveBitrate(stereoCodec, 2);
                                workDone += `☐Stream ${ffstream.index}: Remixing ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} (${layoutName}, opus-incompatible) → ${stereoCodec} stereo @ ${dstBitStr / 1000} kb/s\n`;
                                extraArguments += ` -c:a:${outputAudioIdx} ${stereoCodec}${dstBitArg}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                                modifiedAudioIdx.add(outputAudioIdx);
                                outputAudioOverride.set(outputAudioIdx, { codec: stereoCodec, channels: 2, bps: dstBitStr });
                            }
                            created2chLangs.add(ffstreamLangKey);   // register the remix-created stereo so a later same-language downmix / remix defers to it
                            forced = true;
                        } else if (targetCodec === 'aac_vbr') {
                            // aac_vbr stereo force: use VBR 4 for low-bitrate sources, VBR 5 otherwise.
                            // srcBitrate is meaningful here — this is a codec-swap, same channel count.
                            const { encoder, args, approxRate } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true);
                            workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → aac stereo @ ${approxRate} (libfdk VBR q${srcBitrate > 0 && srcBitrate <= 144000 ? 4 : 5})\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: forceChannels, bps: 0, approxRate });
                            forced = true;
                        } else {
                            // Same channel count, codec swap - optionally a LOSSLESS opus relabel (5.0(side)→5.0 via channelmap, keeps all channels).
                            // resolveBitrate caps the target at the source bitrate when the target codec scores >= the source (guard via isTdarrQuality);
                            // lossless skips the cap; a high-bitrate lossy source is bounded by the codec ceiling.
                            const layoutFilter = relabel ? ` -filter:a:${outputAudioIdx} "channelmap=map=${relabel.map}:channel_layout=${relabel.layout}"` : '';
                            const note = relabel ? ` (relabel ${layoutName}→${relabel.layout})` : '';
                            const dstBitArg = encoderArgsIdx(targetCodec, forceChannels, outputAudioIdx, srcBitrate, ffstream.isTdarrLossless, ffstream.isTdarrQuality);
                            const dstBitStr = resolveBitrate(targetCodec, forceChannels, srcBitrate, ffstream.isTdarrLossless, ffstream.isTdarrQuality);
                            workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → ${targetCodec} ${forceChannels}ch @ ${dstBitStr / 1000} kb/s${note}\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${targetCodec}${dstBitArg}${layoutFilter}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: targetCodec, channels: forceChannels, bps: dstBitStr });
                            forced = true;
                        }
                        if (forced) convert = true;
                    }
                }
            }
        }


        // Build the predicted output stream summary for the closing log line. Audio streams keep their original codec unless an in-place override was
        // recorded; removed duplicates are dropped; newly created downmix tracks are appended (matching ffmpeg's -map 0 then -map 0:a:N ordering). All
        // streams are enriched with resolveStreamBitrate before summariseStream, matching the input summary line - so untouched tracks (e.g. a copied stereo
        // track) show their bitrate correctly. aac_vbr overrides carry approxRate instead of a fixed bps; summariseStream receives the approxRate string
        // pre-formatted as the bit_rate field so the bracket token shows e.g. ~192k.
        const buildOutputSummary = () => {
            const tokens = [];
            // Build an audio token for a VBR override/append, where the rate is an approximate string (e.g. '~192k') rather than a number summariseStream can
            // format. Role comes from the shared classifiers on the original source stream.
            const vbrAudioToken = (srcStream, channels, codec, approxRate) => {
                const lang = resolveLang(srcStream);
                const langStr = (lang && lang !== 'und') ? lang : '';
                const role = isCommentary(srcStream) ? '/commentary' : (isDescriptive(srcStream) ? '/description' : '');
                return `[audio:${[langStr, `${channels}ch`, codec, approxRate].filter(Boolean).join(' ')}${role}]`;
            };
            for (const s of file.ffProbeData.streams) {
                const enriched = enrichStream(s);
                if ((s?.codec_type || '').trim().toLowerCase() === 'audio') {
                    if (streamsToRemove.has(s.index)) continue;
                    const ov = outputAudioOverride.get(outputAudioIdxMap.get(s.index));
                    if (ov) {
                        // approxRate carries the VBR display string (e.g. '~192k'); bps===0 flags this. summariseStream reads bit_rate numerically, so VBR
                        // overrides build the token via vbrAudioToken to show the tilde-prefixed approximate rate instead.
                        if (ov.approxRate) {
                            tokens.push(vbrAudioToken(s, ov.channels, ov.codec, ov.approxRate));
                        } else {
                            tokens.push(summariseStream({ ...enriched, codec_name: ov.codec, channels: ov.channels, bit_rate: ov.bps }));
                        }
                    } else {
                        tokens.push(summariseStream(enriched));
                    }
                } else
                    tokens.push(summariseStream(enriched));
            }
            for (const a of appendedAudio) {
                if (a.approxRate) {
                    tokens.push(vbrAudioToken(a.srcStream, a.channels, a.codec, a.approxRate));
                } else {
                    tokens.push(summariseStream({ ...a.srcStream, codec_name: a.codec, channels: a.channels, bit_rate: a.bps }));
                }
            }
            return tokens.join('');
        };

        // Convert file if convert variable is set to true.
        if (convert === true) {
            // Dispositions (default flag) are intentionally left untouched. ffmpeg copies the source stream's disposition onto mapped/transcoded outputs, so
            // a downmix_to_stereo track created from a default-flagged surround source also carries the default flag - two tracks marked default. This is
            // acceptable: the tracks are near-identical content at different channel counts and most players handle multiple default flags without issue.
            // Removing or reassigning the default flag is a separate concern outside this plugin's scope.
            response.preset += `,-map 0 -c copy${extraArguments}${globalOutputOpt}${networkDataOpt}`;
            response.infoLog += workDone;
            response.infoLog += `☑Expected results: ${buildOutputSummary()}\n`;
            response.processFile = true;
        } else {
            if (workDone) response.infoLog += workDone;
            response.infoLog += `☑Audio already has the correct formats available.\n`;
            response.processFile = false;
        }
        return response;
    } catch (err) {
        failUnexpected(err);   // AwkFailFile → rethrow unchanged; anything else → annotate + fail the file with the full infoLog
    }
};
module.exports.details = details;
module.exports.plugin = plugin;
