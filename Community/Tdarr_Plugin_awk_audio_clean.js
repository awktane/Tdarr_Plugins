/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin cleans up the audio tracks. There are options to downmix and convert tracks based on channel count and language.\n\n
                  Ensure options are set directly as this can be destructive especially with incorrectly tagged audio tracks`,
    Version: '1.22.0',
    Tags: 'pre-processing,ffmpeg,audio_only,configurable',
    Inputs: [
        {
            name: 'downmix_language',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Specify language tags here for the audio tracks you'd like to transcode. If blank then all tracks will be considered. Tracks in languages not listed will not be considered for the downmix_to_six, downmix_to_stereo options, nor keep_best_surround_safe.
                \\nStreams with no language tag are treated as though they their language is "und". Any tracks with a language not in this list will be treated as a secondary track and therefore affected by downmix_secondary_stereo.
                \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US.
                \\nTracks with these languages will follow downmix_to_six, downmix_to_stereo, and force_codec
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
            tooltip: `Specify if we should downmix a 5.1 track if one doesn't already exist from the best quality higher channel track for that language (from downmix_language if specified) that is not a secondary track (unlisted language, commentary, descriptive, etc).
                \\nIf a 5.1 track for the same language already exists or if no higher channel track exists then no new 6 channel track is created.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - no new 6 channel track is created from higher channel surround channel
                \\nIf replace - a new surround_codec 6 channel track replaces the higher channel track used to create it unless protected by keep_best_surround_safe.
                \\nIf true    - a new surround_codec 6 channel track will be created from the higher channel track and both will be kept`,
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
                \\nIf replace - a new 2 channel track with codec stereo_codec replaces the higher channel track used to create it unless it was created by downmix_to_six.
                \\nIf true    - a new 2 channel track with stereo_codec will be created from a higher channel track and both will be kept`,
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
                \\nIf true  - each secondary track with more than 2 channels is transcoded in place to a stereo stereo_codec track (using the stereo_downmix matrix).`,
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
            name: 'keep_best_surround_safe',
            type: 'string',
            defaultValue: 'quality',
            inputUI: {
                type: 'dropdown',
                options: ['false','quality','channel'],
            },
            tooltip: `If enabled then we should keep the best quality and highest channel option for each language (downmix_language list or if blank all). This track will be treated as a source and will not be transcoded or removed.
                \\nThis track can only be affected by force_codec being set to all. No secondary tracks, including when language of the track is not in downmix_language, get this type of protection.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - All tracks are treated normally
                \\nIf quality - The focus is on track quality. A lossless 5.1 track would be kept over a lossy 7.1 as an example. If there is a 5.1 and 7.1 of similar quality then the 7.1 would be chosen.
                \\nIf channel - The focus is on channel count. A lossy 7.1 track will always be kept over the lossless 5.1 track in the previous example.`,

        },        {
            name: 'surround_codec',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created surround tracks. Note that both AC3 and EAC3 are limited to 6 channels by ffmpeg's encoder, so tracks with more than 6 channels will not be transcoded to either even if force_codec is applied. Opus supports up to 8 channels.`,
        },
        {
            name: 'stereo_codec',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','aac_vbr','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created stereo tracks. AAC and Opus are the most compatible choices for modern media servers and clients. EAC3 is useful for Dolby branding on compatible devices. AC3 is the most broadly compatible legacy choice.
                \\naac_vbr uses libfdk_aac in VBR mode (-vbr 5, ~192-224 kb/s) for higher quality than native AAC CBR. Falls back to -vbr 4 (~128-144 kb/s) when force_codec is converting an existing stereo track whose bitrate is at or below 144 kb/s, matching the lower-information source.
                \\nExisting AAC tracks are never re-encoded when aac_vbr is selected — the AAC family check prevents a generational loss for no gain.`,
        },        
        {
            name: 'force_codec',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','6below','2below','all'],
            },
            tooltip: `Transcode all tracks to the codecs specified in surround_codec and stereo_codec depending on their channel count. Note streams with more channels than supported by the codec will not be transcoded.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false  - Codecs will be left as is and those two settings will only apply to new tracks
                \\nIf 2below - Streams with two or fewer channels will be transcoded to stereo_codec (unless protected by keep_best_surround_safe). Anything above that will be left in its original codec.
                \\nIf 6below - Streams with six or fewer channels will be transcoded to surround_codec (unless protected by keep_best_surround_safe). Tracks with two or fewer channel will be converted to stereo_codec.
                \\nIf all   - All streams will be transcoded to the codecs specified by surround_codec and stereo_codec depending on their channel count INCLUDING the track protected by keep_best_surround_safe`,
        },                
        {
            name: 'stereo_downmix_method',
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

    // =====================================================================
    // SHARED BLOCK — keep byte-for-byte identical across all awk plugins.
    // Audio plugins (audio_clean, stream_ordering) carry the whole block:
    //   codecInfo, codecAliases, unknownCodecs, resolveCodecName, audioQuality,
    //   the role/forced classifiers, resolveStreamBitrate, summariseStream, escMeta.
    // clean_and_remux carries only the audio-independent tail: the classifiers,
    // resolveStreamBitrate, summariseStream, and escMeta (the codec-scoring half is audio-only).
    // =====================================================================

    //Codecs and some values to help us score the quality so that we can pick the best track - some of these formats are not supported by ffmpeg yet (ex: ac4)
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
    const codecAliases = [
        ['pcm_',   'pcm'],
        ['adpcm',  'adpcm'],
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
    ];
    const unknownCodecs = new Set();

    /* -=-=-= Resolve an ffprobe stream to its canonical codec key used by codecInfo =-=-=- */
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype and eac3 into eac3atmos.
    // codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" — none of the subtype keywords — so longName alone can't distinguish the subtypes there; we also check the stream profile
    //      (e.g. "DTS-HD MA", "DTS-HD HRA", "DTS Express") and fall back to mediaInfo's Format_Commercial_IfAny
    //      (e.g. "DTS-HD Master Audio"), which decodes the substream header. Atmos rarely shows in long_name, so eac3 also checks the title tag and the commercial name. Shared by audioQuality and losslessSource.
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
        const commercial = ((file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === stream.index)?.Format_Commercial_IfAny || '').toLowerCase();
        if (codec === 'dts') {
            if      (longName.includes('master')          || profile.includes('hd ma')  || commercial.includes('master'))
                codec = 'dtsma';
            else if (longName.includes('high resolution') || profile.includes('hra')    || commercial.includes('high resolution'))
                codec = 'dtshr';
            else if (longName.includes('express')         || profile.includes('express')|| commercial.includes('express'))
                codec = 'dtsexpress';
        } else if (codec === 'eac3' && (longName.includes('atmos') || (stream.tags?.title || '').toLowerCase().includes('atmos') || commercial.includes('atmos')))
            codec = 'eac3atmos';

        return codec;
    };

    /* -=-=-= Audio Quality Scoring =-=-=- */
    // With a given stream attempts to return a scoring of the quality to aid in the identification of the "best" stream. This scoring is based off of
    // codec and bitrate compared to transparent bitrate. Must be declared after response so infoLog is available.
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

        // No stream-level bitrate reported. For codecs we know how to encode (aac, opus, ac3, eac3)
        // we can estimate quality from the bitrate we would target for this channel count instead of a
        // blind midpoint — freshly-transcoded tracks routinely omit per-stream bitrate. For source
        // codecs that normally carry a bitrate (dts, ac3 from disc, etc.) we log once and use the midpoint.
        if (bitrate <= 0) {
            // Per-channel target bitrate (bps) for our encodable output codecs. Kept inline so this
            // scoring function stays self-contained and byte-for-byte identical across plugins.
            const ch = Math.max(1, Number(stream?.channels ?? 2));
            const targets = {
                aac:  { 1: 128000, 2: 256000, 3: 320000, 4: 384000, 5: 448000, 6: 512000, 7: 576000, 8: 640000 },
                opus: { 1: 128000, 2: 192000, 3: 256000, 4: 320000, 5: 320000, 6: 384000, 7: 448000, 8: 448000 },
                ac3:  { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
                eac3: { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
            };
            const tbl = targets[codec];
            if (tbl) {
                const estBps = tbl[Math.min(ch, codec === 'ac3' || codec === 'eac3' ? 6 : 8)] ?? 0;
                const estPenalty = estBps > minimum
                    ? (estBps >= transparent ? 0 : maxPenalty * (1 - ((estBps - minimum) / (transparent - minimum))))
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

    /* -=-=-= Stream role/forced classifiers =-=-=- */
    // Each takes a raw ffprobe stream and returns a boolean from the  disposition flag first, then title keywords, exactly as the sorting and summary logic expects.
    // Consolidated here so summariseStream, the stream-ordering sort keys, and audio_clean's secondary-track detection all read from one definition.
    // Shared verbatim across all three awk plugins.
    const streamTitleLower = (s) => (s.tags?.title || '').trim().toLowerCase();
    const isCommentary  = (s) => s.disposition?.comment === 1
        || ['commentary', 'producer'].some(k => streamTitleLower(s).includes(k));
    const isDescriptive = (s) => s.disposition?.visual_impaired === 1
        || ['descriptive', 'dvs', 'narration'].some(k => streamTitleLower(s).includes(k));
    const isSdh         = (s) => s.disposition?.hearing_impaired === 1
        || ['sdh', 'hearing impaired', 'deaf'].some(k => streamTitleLower(s).includes(k));
    const isSigns       = (s) => s.disposition?.karaoke === 1
        || ['signs', 'songs'].some(k => streamTitleLower(s).includes(k));

    /* -=-=-= Resolve the best available bitrate (bps) for a stream =-=-=- */
    // ffprobe first, mediaInfo fallback. ffprobe cannot read per-stream bitrates from the container atom for some formats (e.g. DTS-HD MA in MP4/M4V), 
    // but mediaInfo decodes the substream headers and usually has it. Returns 0 if neither source has a value. Used to enrich stream objects before summariseStream or audioQuality sees them.
    const resolveStreamBitrate = (ffstream) => {
        const ffBitrate = Number(ffstream.bit_rate || 0);
        if (ffBitrate > 0) return ffBitrate;
        const ffmedia = (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === ffstream.index);
        return Number(ffmedia?.BitRate || 0);
    };

    /* -=-=-= Build single token summarising one ffprobe stream for the input/output summary lines. =-=-=- */
    // Shows: video codec; audio lang/channels/codec/bitrate(+role); subtitle lang/codec(+forced/role); data and attachment codec.
    // Role/forced detection mirrors the sorting logic (disposition flags first, then title keywords, via the shared classifiers) so every plugin's summary lines up. subrip
    // is shown as srt to match the friendlier name used when this pipeline converts subtitles.
    // Shared verbatim across all three awk plugins
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = (s.tags?.language || 'und').trim().toLowerCase();
        const lang = langRaw !== 'und' ? langRaw : '';
        if (type === 'video')
            return `[video:${codec}]`;
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            return `[audio:${[lang, ch, codec, rate].filter(Boolean).join(' ')}${role}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isSdh(s) ? '/sdh' : (isSigns(s) ? '/signs' : ''));
            const forced = s.disposition?.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${forced}${role}]`;
        }
        if (type === 'attachment')
            return `[attach:${codec}]`;
        if (type === 'data')
            return `[data:${codec}]`;
        return `[${type || 'unknown'}:${codec}]`;
    };

    /* -=-=-= Sanitize value for embedding inside a double quotes ffmpeg -metadata argument (e.g. -metadata:s:a:0 "title=...") =-=-=- */
    // Tdarr does NOT pass the preset through a shell — it splits the string into a quote-aware argv array and hands it to child_process.spawn, so shell metacharacters ($ ` ; |)
    // are inert and reach ffmpeg as literal metadata bytes. The only injection vector is breaking out of the quoted value to inject a new ffmpeg ARGUMENT, which needs a double quote (to close the wrapper)
    // or a control character.
    // Tdarr's tokenizer strips quotes with no reliable backslash-escape convention,  so we substitute rather than strip:
    //    backslash          -> forward-slash (readable, inert)
    //    double-quote       -> single-quote (safe inside the quoted value; preserves titles like "Director's Cut" and "AC3/Stereo")
    //    control characters -> space (avoids fusing words that a bare delete would join).
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')  // control characters (newlines, null bytes, etc.) → space
        .replace(/\\/g, '/')               // backslash → forward-slash (inert, readable)
        .replace(/"/g, "'");               // double-quote → single-quote (safe inside the quoted value)

    // =====================================================================
    // END SHARED BLOCK
    // =====================================================================

    // AC3/EAC3 valid CBR presets in bps (ffmpeg rounds to these internally; we snap explicitly
    // so the logged/targeted rate matches what ffmpeg actually produces).
    const ac3Presets = [32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000,
                        160000, 192000, 224000, 256000, 320000, 384000, 448000, 512000, 576000, 640000];

    // Per-channel-count target bitrate (bps) for our four encodable output codecs. These sit at or
    // comfortably above the transparent threshold from the codecInfo scoring table (scaled by channel
    // count), and serve as the FLOOR for a transcode — the actual target is max(thisTable, source).
    //
    // AC3 / EAC3 — CBR fixed-preset. Targets: mono 192k, stereo 224k, 3ch 320k, 4ch 384k, 5ch 448k, 6ch 640k.
    //              (640k is the Blu-ray 5.1 standard and the AC3/EAC3 codec ceiling.)
    // AAC — CBR (native AAC VBR is experimental in ffmpeg). mono 128k, stereo 256k, 3ch 320k, 4ch 384k,
    //              5ch 448k, 6ch 512k, 7ch 576k, 8ch 640k.
    // Opus — true VBR (-vbr on), -b:a is the target average. More efficient than AAC so targets are lower:
    //              mono 128k, stereo 192k, 3ch 256k, 4ch 320k, 5ch 320k, 6ch 384k, 7ch 448k, 8ch 448k.
    const targetTable = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        if (codec === 'aac' || codec === 'aac_vbr') {
            const t = { 1: 128000, 2: 256000, 3: 320000, 4: 384000, 5: 448000, 6: 512000, 7: 576000, 8: 640000 };
            return t[Math.min(ch, 8)] ?? 640000;
        }
        if (codec === 'opus') {
            const t = { 1: 128000, 2: 192000, 3: 256000, 4: 320000, 5: 320000, 6: 384000, 7: 448000, 8: 448000 };
            return t[Math.min(ch, 8)] ?? 448000;
        }
        if (codec === 'ac3' || codec === 'eac3') {
            const t = { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 };
            return t[Math.min(ch, 6)] ?? 640000;
        }
        return 0;
    };

    // Per-codec ceiling (bps) so a lossless or very-high-bitrate source (e.g. TrueHD ~4 Mbps) can't drag
    // the transcode target absurdly high. AC3/EAC3 cap at their hard 640k limit. AAC/Opus cap generously
    // per channel — well above transparent for any real content, but bounded.
    const codecCeiling = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        // AC3/EAC3 cap at their hard 640k codec limit. AAC and Opus scale per channel. These only ever
        // apply to tracks at or below each codec's channel maximum (the force/downmix paths block higher
        // counts before encoding), but the per-channel form stays correct regardless of channel count.
        // Opus's ceiling (128k/ch) is deliberately half of ffmpeg's hard libopus limit (256k/ch), so a
        // resolved Opus target can never be rejected by the encoder. AAC 160k/ch is generous but bounded.
        if (codec === 'ac3' || codec === 'eac3') return 640000;
        if (codec === 'aac' || codec === 'aac_vbr') return ch * 160000;   // 160k/ch (stereo 320k, 5.1 960k, 7.1 1.28M)
        if (codec === 'opus') return ch * 128000;   // 128k/ch — half of libopus's 256k/ch hard maximum
        return 0;
    };

    // Resolve the final target bitrate (bps) for a transcode: floor at the per-channel table target, raise
    // to the source bitrate when the source is known, higher, and lossy (never throw away quality we can
    // cheaply keep from a lossy source), then clamp to the codec ceiling. The floor is skipped for lossless
    // sources because their bitrate is not a comparable quantity for a perceptual encode — a 4 Mbps TrueHD
    // into AAC should target the table value (~512k for 5.1), not pin at the 960k ceiling every time.
    // For AC3/EAC3 the result is snapped UP to the nearest valid preset so the requested rate is one ffmpeg
    // actually honours.
    const resolveBitrate = (codec, channels, srcBps = 0, srcLossless = false) => {
        let bps = targetTable(codec, channels);
        if (bps <= 0) return 0;
        const src = Number(srcBps) || 0;
        if (!srcLossless && src > bps) bps = src;
        bps = Math.min(bps, codecCeiling(codec, channels));
        if (codec === 'ac3' || codec === 'eac3') {
            // snap up to nearest valid preset >= bps (fall back to highest preset if above all)
            bps = ac3Presets.find(p => p >= bps) ?? ac3Presets[ac3Presets.length - 1];
        }
        return bps;
    };

    // Per-codec audio argument string scoped to a specific output stream index (e.g. -b:a:2 instead of -b:a).
    // ffmpeg accepts the stream-qualified forms; we use them so each track gets its own settings when a
    // single command touches several. Mirrors encoderArgs but with :idx suffixes.
    // srcLossless is forwarded to resolveBitrate to suppress the source-bitrate floor for lossless sources.
    const encoderArgsIdx = (codec, channels, idx, srcBps = 0, srcLossless = false) => {
        const bps = resolveBitrate(codec, channels, srcBps, srcLossless);
        if (bps <= 0) return '';
        if (codec === 'opus')
            return ` -vbr:a:${idx} on -compression_level:a:${idx} 10 -b:a:${idx} ${bps / 1000}k`;
        return ` -b:a:${idx} ${bps / 1000}k`;
    };

    // Emit the encoder name and VBR arguments for an aac_vbr stereo track scoped to output index idx.
    // Uses -vbr 4 (~128-144 kb/s) when the source stereo bitrate is at or below 144k — matching a
    // lower-information source avoids wasting bits encoding silence-grade content at VBR 5 quality.
    // Uses -vbr 5 (~192-224 kb/s) for all other cases, including all downmix-created stereo tracks
    // where the source is surround (its bitrate describes N channels, not 2, so 144k doesn't apply).
    // isStereoSrc should be true only for force_codec codec-swap paths where the source is already 2ch.
    const aacVbrArgsIdx = (idx, srcBps = 0, isStereoSrc = false) => {
        const vbrLevel = (isStereoSrc && Number(srcBps) > 0 && Number(srcBps) <= 144000) ? 4 : 5;
        const approxRate = vbrLevel === 4 ? '~128k' : '~192k';
        return { encoder: 'libfdk_aac', args: ` -vbr:a:${idx} ${vbrLevel}`, approxRate };
    };

    // Resolve whether a source stream is lossless using the shared resolveCodecName resolution (same one
    // audioQuality uses). Stored per-stream as isTdarrLossless to avoid repeating the resolution at emission.
    // Used only by force_codec to gate the source-bitrate floor in resolveBitrate — downmix paths don't
    // pass a source bitrate so they are unaffected regardless of this flag.
    const losslessSource = (stream) => codecInfo[resolveCodecName(stream)]?.lossless === true;

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');
    
    //Check our inputs
    const downmixLanguage = String(inputs.downmix_language).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const downmixToSix = String(inputs.downmix_to_six).trim();
    const downmixToTwo = String(inputs.downmix_to_stereo).trim();
    const downmixSecondaryStereo = String(inputs.downmix_secondary_stereo).trim();
    const removeDuplicatesBy = String(inputs.remove_duplicates_by).trim();
    const forceCodec = String(inputs.force_codec).trim();
    const surroundCodec = String(inputs.surround_codec).trim();
    const stereoCodec = String(inputs.stereo_codec).trim();
    const stereoDownmix = String(inputs.stereo_downmix_method).trim();
    const keepBestSurroundSafe = String(inputs.keep_best_surround_safe).trim();

    if(!['false','replace','true'].includes(downmixToSix)) {
        response.infoLog += `☒Somehow invalid downmixToSix option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['false','replace','true'].includes(downmixToTwo)) {
        response.infoLog += `☒Somehow invalid downmixToStereo option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['false','true'].includes(downmixSecondaryStereo)) {
        response.infoLog += `☒Somehow invalid downmixSecondaryStereo option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['disabled','multi-stereo','multi-stereo-error','channel','channel-error'].includes(removeDuplicatesBy)) {
        response.infoLog += `☒Somehow invalid removeDuplicatesBy option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['false','6below','2below','all'].includes(forceCodec)) {
        response.infoLog += `☒Somehow invalid forceCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['ac3','eac3','aac','opus'].includes(surroundCodec)) {
        response.infoLog += `☒Somehow invalid surroundCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['ac3','eac3','aac','aac_vbr','opus'].includes(stereoCodec)) {
        response.infoLog += `☒Somehow invalid stereoCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['default','dialogue'].includes(stereoDownmix)) {
        response.infoLog += `☒Somehow invalid stereoDownmix option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['false','quality','channel'].includes(keepBestSurroundSafe)) {
        response.infoLog += `☒Somehow invalid keepBestSurroundSafe option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }

    let extraArguments = '';
    let workDone = '';
    let convert = false;

    // Input summary — the streams exactly as they arrived, before any audio work.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate })).join('')}\n`;

    //We really only care about the audio streams
    let audioStreams = file.ffProbeData.streams.filter(stream => (stream?.codec_type ?? '').trim().toLowerCase() === 'audio');
    if (audioStreams.length === 0) {
        response.infoLog += '☒Video file has no audio streams to manage.\n';
        return response;
    }

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video. \n';
        response.processFile = false;
        return response;
    }

    // A secondary track is any commentary, visually-impaired/descriptive, or signs/songs track — the
    // shared classifiers cover both the disposition flags and the title keywords.
    const isSecondaryTrack = (stream) => isCommentary(stream) || isDescriptive(stream) || isSigns(stream);

    //Add secondary track flag and the cleaned language to each track
    audioStreams = audioStreams.map(item => {
        const cleanLang = String((item.tags?.language || 'und').trim().toLowerCase().replace(/[-_.].*$/, ''));
        // Enrich with mediaInfo bitrate before audioQuality scoring so that formats like DTS-HD MA
        // (which ffprobe can't read a bitrate for in MP4/M4V containers) score and display correctly.
        const enrichedItem = { ...item, bit_rate: resolveStreamBitrate(item) || item.bit_rate };
        return { ...enrichedItem,
            isTdarrSecondaryTrack: isSecondaryTrack(item),
            // Language-secondary: track language is not in downmixLanguage (when the list is non-empty).
            // These tracks follow the secondary path (downmix_secondary_stereo, force_codec) but are excluded from the primary downmix paths (downmix_to_six, downmix_to_stereo).
            isTdarrLangSecondary: downmixLanguage.length > 0 && !downmixLanguage.includes(cleanLang),
            isTdarrCleanLang: cleanLang,
            isTdarrQuality: audioQuality(enrichedItem),
            // Used by force_codec to suppress the source-bitrate floor in resolveBitrate for lossless sources.
            // A lossless bitrate (e.g. 4 Mbps TrueHD) is not a comparable quantity for a perceptual encode
            // and would otherwise pin the output at the codec ceiling for no audible gain.
            isTdarrLossless: losslessSource(item)
        };
    });

    // candidateStreams: the pool for workStreams and keep_best_surround_safe.
    // Lang-secondary tracks (unlisted language) are included here so force_codec and downmix_secondary_stereo can act on them.
    // They are excluded from the primary downmix paths (downmix_to_six, downmix_to_stereo) in the processing loop below.
    // Secondary and lang-secondary tracks are only dropped from the pool when there is genuinely nothing to do with them: downmix_secondary_stereo is false AND force_codec is false.
    // When force_codec is set they stay so the force-codec path can standardize their codec too (e.g. force_codec='all' must touch every track, including commentary and unlisted-language tracks).
    let candidateStreams = audioStreams;
    if (downmixSecondaryStereo === 'false' && forceCodec === 'false')
        candidateStreams = candidateStreams.filter(stream => !stream.isTdarrSecondaryTrack && !stream.isTdarrLangSecondary);

    // keep_best_surround_safe: protect the best track per language among preferred-language primary tracks.
    // Lang-secondary and disposition-secondary tracks are excluded — protecting a non-preferred-language track or a commentary track serves no purpose and would prevent force_codec from touching it.
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

    // Languages that already have a primary stereo track, so downmix_to_stereo can honour "create a 2 channel track only if one doesn't exist".
    // Uses isTdarrCleanLang (normalised short code, e.g. 'en' for 'en-US') to match the same key used by created2chLangs and ffstreamLangKey — preventing redundant stereo creation when the existing track is tagged with a regional variant like en-US.
    const existingStereoLangs = new Set(audioStreams.filter(s => s.channels === 2 && !s.isTdarrSecondaryTrack && !s.isTdarrLangSecondary).map(s => s.isTdarrCleanLang));

    // Languages that already have a primary 5.1/6ch track, so downmix_to_six can honour "create a 5.1 track only if one doesn't exist". Mirrors existingStereoLangs.
    // Channels > 4 && <= 6 covers 5.0 and 5.1 without catching 4.0/4.1 or 7.1 sources.
    const existingSixLangs = new Set(audioStreams.filter(s => s.channels > 4 && s.channels <= 6 && !s.isTdarrSecondaryTrack && !s.isTdarrLangSecondary).map(s => s.isTdarrCleanLang));

    // Identify lower-quality duplicates. Within each group keep only the highest quality stream; the rest are either
    // marked for removal (removeDuplicatesBy === 'multi-stereo'/'channel') or, for the "-error" variants, cause the
    // plugin to abort immediately (no streams are removed, no other changes from this run are applied). The grouping
    // key depends on the mode (the "-error" suffix only changes what happens on a hit, never the grouping itself):
    //   'channel'/'channel-error'           - group by (lang, exact channel count, primary/secondary): one track per
    //                                          distinct channel count survives (e.g. a 7.1, a 5.1 and a 2.0 of the
    //                                          same language are all kept).
    //   'multi-stereo'/'multi-stereo-error' - group by (lang, broad surround-vs-stereo role, primary/secondary):
    //                                          collapses every surround variant of a language down to a single best
    //                                          surround plus a single best stereo, for a more predictable layout.
    //               Exception: when downmix_to_six is enabled, the 5-6ch band is carved out into its own role rather than folded into "surround", so a downmix-created (or pre-existing)
    //               5.1/5.0 track is never compared against, and removed in favour of, a different channel count like 7.1 — matching what downmix_to_six itself would create or preserve.
    //               Exception: when downmix_to_stereo is enabled, exactly-2ch tracks are carved out into their own role rather than folded into "stereo", so a downmix-created (or
    //               pre-existing) 2.0 track is never compared against, and removed in favour of, a mono track — matching what downmix_to_stereo itself would create or preserve.
    //               Both exceptions only apply while the matching downmix option is enabled, and use the exact same channel-count bands as existingSixLangs/existingStereoLangs so
    //               dedup can never disagree with, and re-trigger, the downmix creation guards (this is what previously caused an infinite create/remove loop between the two plugin runs).
    // Note: deduplication runs across ALL audio streams regardless of downmix_language or downmix_secondary_stereo, since those settings govern transcoding candidates, not what's a
    // genuine duplicate. A duplicate in a non-preferred language is still a duplicate. Protected (keep_best_surround_safe) tracks are never outright removed, and never trigger the
    // "-error" abort either — a protected track was never a removal candidate in the first place.
    const removeDuplicatesErrorMode = removeDuplicatesBy === 'multi-stereo-error' || removeDuplicatesBy === 'channel-error';
    const removeDuplicatesGroupBy = removeDuplicatesErrorMode ? removeDuplicatesBy.replace(/-error$/, '') : removeDuplicatesBy;
    const streamsToRemove = new Set();
    if (removeDuplicatesGroupBy === 'channel' || removeDuplicatesGroupBy === 'multi-stereo') {
        const seen = new Map();
        const byQuality = [...audioStreams].sort((a, b) => b.isTdarrQuality - a.isTdarrQuality || a.index - b.index);
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
            // Group only by the genuine commentary/VI marker (isTdarrSecondaryTrack), NOT by lang-secondary. A foreign-language MAIN track and a foreign-language COMMENTARY
            // track share the same language and channel count but are different content — keying on lang-secondary would collapse them together and wrongly delete the commentary.
            const key = `${s.isTdarrCleanLang}|${tier}|${s.isTdarrSecondaryTrack}`;
            if (seen.has(key)) {
                if (protectedIndices.has(s.index)) continue;
                const kept = seen.get(key);
                if (removeDuplicatesErrorMode) {
                    const rmRate = Number(s.bit_rate || 0) > 0 ? ` @ ${Math.round(Number(s.bit_rate) / 1000)} kb/s` : '';
                    const keptRate = Number(kept.bit_rate || 0) > 0 ? ` @ ${Math.round(Number(kept.bit_rate) / 1000)} kb/s` : '';
                    response.infoLog += `☒Stream ${s.index}: Duplicate audio track detected (${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrCleanLang}${rmRate}) alongside stream ${kept.index} (${kept.codec_name || 'unknown'}${keptRate}) under remove_duplicates_by="${removeDuplicatesBy}". Aborting - tag/remove tracks manually and requeue, or switch remove_duplicates_by to a non-error mode.\n`;
                    response.processFile = false;
                    return response;
                }
                streamsToRemove.add(s.index);
                // Show the removed track's bitrate and the kept track's for contrast — duplicates are
                // decided by quality score (largely bitrate-driven), so this makes the choice transparent.
                const rmRate = Number(s.bit_rate || 0) > 0 ? ` @ ${Math.round(Number(s.bit_rate) / 1000)} kb/s` : '';
                const keptRate = Number(kept.bit_rate || 0) > 0 ? ` @ ${Math.round(Number(kept.bit_rate) / 1000)} kb/s` : '';
                workDone += `☐Stream ${s.index}: Removing duplicate (lower quality ${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrCleanLang}${rmRate}) - keeping stream ${kept.index} (${kept.codec_name || 'unknown'}${keptRate})\n`;
            } else
                seen.set(key, s);
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
    // aac_vbr is treated as the aac family for codec-identity checks — ffprobe always reports
    // codec_name 'aac' regardless of which encoder produced the track, so comparing against
    // 'aac_vbr' directly would never match and would needlessly re-encode existing AAC tracks.
    const stereoCodecFamily = stereoCodec === 'aac_vbr' ? 'aac' : stereoCodec;
    const channelMatch = (stream) => {
        //8 channel
        if(stream.channels > 6 && (downmixToSix === 'false') && (downmixToTwo === 'false') && (forceCodec === 'all' && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        //3-7 channel
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
        let aLang = downmixLanguage.indexOf((a.tags?.language || 'und').trim().toLowerCase());
        let bLang = downmixLanguage.indexOf((b.tags?.language || 'und').trim().toLowerCase());

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

    // Build the title for a new or replaced track. The original track title is always preserved and the new channel count is appended with -> (e.g. a source titled
    // "E-AC-3 Atmos 5.1" downmixed to stereo becomes "E-AC-3 Atmos 5.1 -> 2.0"). This keeps role words like "Commentary"/"Director's Commentary" visible after a downmix. When the
    // source has no title the new channel count alone is used (e.g. "2.0"). If the title already ends in the target label (not preceded by a digit/dot, so "5.1" won't match
    // "15.1") it is returned unchanged to avoid "... 2.0 -> 2.0".
    const buildTitle = (srcStream, targetLabel) => {
        const origTitle = (srcStream.tags?.title || '').trim();
        if (!origTitle) return targetLabel;
        const escapedLabel = targetLabel.replace(/\./g, '\\.');
        if (new RegExp(`(?:^|[^0-9.])${escapedLabel}$`).test(origTitle)) return origTitle;
        return `${origTitle} -> ${targetLabel}`;
    };

    // Lo/Ro stereo downmix matrices, generated from each source layout's exact channel order.
    //
    // WHY layout-keyed and not channel-count-keyed: several standard layouts share a channel count but
    // order their channels differently (e.g. 6 channels can be 5.1, 5.1(side), 6.0, 6.0(front), or
    // hexagonal). A count-based matrix would silently mis-route — dropping the wrong channel as "LFE" or
    // panning a back-center where a surround belongs — producing audio that sounds wrong without any error.
    // So we resolve the EXACT layout to its canonical channel list and build the matrix from speaker roles.
    // Any layout we don't have a verified channel list for returns null, and the caller falls back to
    // ffmpeg's safe built-in -ac 2 downmix rather than risk a confidently-wrong custom matrix.
    //
    // Downmix rules (standard Lo/Ro): FL/FR kept at full scale; FC at -3 dB (0.707) into both so dialogue
    // stays clear; LFE dropped (avoids mud); back/side/wide channels at -3 dB to their own side; any
    // centered channel (FC, BC) split equally to both sides. FL/FR are kept at peak 1.0 — the -3 dB
    // attenuation on center/surround provides the clipping headroom, matching the industry-standard Lo/Ro
    // downmix used by Blu-ray players, AV receivers, and streaming services.
    //
    // Canonical ffmpeg channel lists per layout (verified against ffmpeg-utils "Channel Layout" docs).
    // Position in the array is the cN index used by the pan filter.
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

    // Per-speaker contribution to the L and R downmix outputs.
    // Centered channels (FC, BC) contribute equally to both; left-side channels contribute only to L,
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

    // Build a Lo/Ro pan=stereo matrix string for a known canonical layout, or null if the layout
    // contributes no surround/center content (pure FL/FR or FL/FR/LFE), where -ac 2 is already correct.
    // FL/FR are kept at full scale (peak = 1.0); center and surround channels fold in at their standard
    // Lo/Ro gains (-3 dB for FC/BC/surrounds, LFE dropped). This matches the industry-standard Lo/Ro
    // downmix used by Blu-ray players, AV receivers, and streaming services. The -3 dB attenuation on
    // center/surround provides the clipping headroom — a global sum-normalization is not used because
    // it produces output 6-8 dB quieter than the source on typical content.
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

    // Resolve a source stream to its canonical layout key, then to a verified pan matrix (or null).
    // We normalize the ffmpeg channel_layout string (lowercased, trimmed). If the file reports no layout
    // or an unrecognized one, we return null so the caller uses ffmpeg's safe -ac 2 downmix.
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

    const streamsToProcess = workStreams;

    for (let i = 0; i < streamsToProcess.length; i++) {
        try {
            const ffstream = streamsToProcess[i];
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const streamLang = (ffstream.tags?.language || '').trim().toLowerCase();
            const outputAudioIdx = outputAudioIdxMap.get(ffstream.index);
            const srcAudioIdx = inputAudioIdxMap.get(ffstream.index);

            // Guard: if either index is missing the stream wasn't tracked correctly — skip rather than emitting a broken argument like -c:a:undefined which ffmpeg will reject with a cryptic error.
            if (outputAudioIdx === undefined || srcAudioIdx === undefined) {
                response.infoLog += `☒Stream ${ffstream.index}: Could not resolve audio index mapping, skipping.\n`;
                continue;
            }

            const ffstreamLangKey = ffstream.isTdarrCleanLang;
            const isProtected = protectedIndices.has(ffstream.index);

            // Human-readable source bitrate for the operation log. Falls back to the known
            // target bitrate for our own output codecs (common for freshly-transcoded tracks
            // where the muxer omits per-stream bitrate), or 'unknown bitrate' otherwise.
            const srcBitrate = Number(ffstream.bit_rate || 0);
            const srcRateStr = srcBitrate > 0
                ? `${Math.round(srcBitrate / 1000)} kb/s`
                : (() => {
                    const tb = targetTable(ffstreamCodec, ffstream.channels);
                    return tb > 0 ? `~${tb / 1000} kb/s` : 'unknown bitrate';
                })();

            // Secondary tracks (commentary, VI, etc.) and lang-secondary tracks (unlisted language) get the stereo-only path and never trigger the primary downmix (downmix_to_six/two).
            if (ffstream.isTdarrSecondaryTrack || ffstream.isTdarrLangSecondary) {
            // ---- SECONDARY: DOWNMIX TO STEREO ----
            // Each secondary surround track is transcoded in place independently — one stereo per secondary track, preserving all of them. keep_best_surround_safe never protects
            // secondary or lang-secondary tracks (they are excluded from protectedIndices), so there is no protected-source case here: an enabled secondary downmix always transcodes in place.
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
            /*-=-=-= DOWNMIX TO 6 CHANNELS =-=-=-*/
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

            /*-=-=-= DOWNMIX TO 2 CHANNELS =-=-=-*/
            // One stereo track per language, from its best >2ch source, only when the language has no primary stereo already. Protected best source: 'replace' becomes 'add'.
            // When 'replace' is requested but downmix_to_six already consumed this same source in place (single >6ch source, both downmixes enabled), the in-place slot is taken,
            // so we fall back to ADDING a stereo from the original input. The user enabled downmix_to_stereo expecting a 2.0 in the output, so a lone 7.1 with both downmixes
            // on yields a 5.1 and a 2.0 rather than silently dropping the stereo.
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

            /*-=-=-= FORCE CODEC =-=-=-*/
            // Skip protected best tracks UNLESS force_codec is 'all' — per keep_best_surround_safe, the protected track can only be touched when force_codec is 'all'. Also skip when the
            // source has more channels than the target codec supports (ac3/eac3 max 6ch, opus/aac max 8ch in ffmpeg's encoder) to avoid an ffmpeg encode failure.
            if (forceCodec !== 'false' && !modifiedAudioIdx.has(outputAudioIdx) && (!isProtected || forceCodec === 'all')) {
                const isStereo = ffstream.channels <= 2;
                const targetCodec = isStereo ? stereoCodec : surroundCodec;
                // aac_vbr is only valid for stereo; for family-identity checks compare against 'aac'.
                const targetCodecFamily = targetCodec === 'aac_vbr' ? 'aac' : targetCodec;

                if (ffstreamCodec !== targetCodecFamily) {
                    const shouldForce =
                        forceCodec === 'all' ||
                        (forceCodec === '6below' && !isStereo && ffstream.channels <= 6) ||
                        (forceCodec === '6below' && isStereo) ||
                        (forceCodec === '2below' && isStereo);

                    const targetMaxCh = ({ ac3: 6, eac3: 6, aac: 8, aac_vbr: 8, opus: 8 })[targetCodec] ?? 8;

                    if (shouldForce && ffstream.channels > targetMaxCh) {
                        workDone += `☒Stream ${ffstream.index}: Not forcing ${targetCodecFamily} - ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} exceeds the ${targetMaxCh}ch limit for ${targetCodecFamily}. Enable downmix_to_six to reduce channels first.\n`;
                    } else if (shouldForce) {
                        if (targetCodec === 'aac_vbr') {
                            // aac_vbr stereo force: use VBR 4 for low-bitrate sources, VBR 5 otherwise.
                            // srcBitrate is meaningful here — this is a codec-swap, same channel count.
                            const { encoder, args, approxRate } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true);
                            workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → aac stereo @ ${approxRate} (libfdk VBR q${srcBitrate > 0 && srcBitrate <= 144000 ? 4 : 5})\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: ffstream.channels, bps: 0, approxRate });
                        } else {
                            // Same channel count, codec swap only — honour the source bitrate as a floor so a
                            // high-bitrate lossy source isn't needlessly degraded (capped at the codec ceiling
                            // inside resolveBitrate). Lossless sources skip the floor: their bitrate is not a
                            // comparable quantity for a perceptual encode.
                            const dstBitArg = encoderArgsIdx(targetCodec, ffstream.channels, outputAudioIdx, srcBitrate, ffstream.isTdarrLossless);
                            const dstBitStr = resolveBitrate(targetCodec, ffstream.channels, srcBitrate, ffstream.isTdarrLossless);
                            workDone += `☐Stream ${ffstream.index}: Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${targetCodec} ${ffstream.channels}ch @ ${dstBitStr / 1000} kb/s\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${targetCodec}${dstBitArg}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: targetCodec, channels: ffstream.channels, bps: dstBitStr });
                        }
                        convert = true;
                    }
                }
            }
        } catch (err) {
            response.infoLog += `☒Error processing stream ${i}: ${err}\n`;
            response.processFile = false;
            return response;
        }
    }


    // Build the predicted output stream summary for the closing log line. Audio streams keep their
    // original codec unless an in-place override was recorded; removed duplicates are dropped; newly
    // created downmix tracks are appended (matching ffmpeg's -map 0 then -map 0:a:N ordering).
    // All streams are enriched with resolveStreamBitrate before summariseStream, matching the input
    // summary line — so untouched tracks (e.g. a copied stereo track) show their bitrate correctly.
    // aac_vbr overrides carry approxRate instead of a fixed bps; summariseStream receives the
    // approxRate string pre-formatted as the bit_rate field so the bracket token shows e.g. ~192k.
    const buildOutputSummary = () => {
        const tokens = [];
        // Build an audio token for a VBR override/append, where the rate is an approximate string
        // (e.g. '~192k') rather than a number summariseStream can format. Role comes from the shared
        // classifiers on the original source stream.
        const vbrAudioToken = (srcStream, channels, codec, approxRate) => {
            const lang = (srcStream.tags?.language || '').trim().toLowerCase();
            const langStr = (lang && lang !== 'und') ? lang : '';
            const role = isCommentary(srcStream) ? '/commentary' : (isDescriptive(srcStream) ? '/description' : '');
            return `[audio:${[langStr, `${channels}ch`, codec, approxRate].filter(Boolean).join(' ')}${role}]`;
        };
        for (const s of file.ffProbeData.streams) {
            const enriched = { ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate };
            if ((s?.codec_type || '').trim().toLowerCase() === 'audio') {
                if (streamsToRemove.has(s.index)) continue;
                const ov = outputAudioOverride.get(outputAudioIdxMap.get(s.index));
                if (ov) {
                    // approxRate carries the VBR display string (e.g. '~192k'); bps===0 flags this.
                    // summariseStream reads bit_rate numerically, so VBR overrides build the token via
                    // vbrAudioToken to show the tilde-prefixed approximate rate instead.
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
        // Dispositions (default flag) are intentionally left untouched. ffmpeg copies the source
        // stream's disposition onto mapped/transcoded outputs, so a downmix_to_stereo track created
        // from a default-flagged surround source will also carry the default flag — two tracks marked
        // default. This is acceptable: the tracks are near-identical content at different channel counts,
        // and most players handle multiple default flags without issue. Removing or reassigning the default
        // flag is a separate concern outside this plugin's scope.
        response.preset += `,-map 0 -c copy${extraArguments} -max_muxing_queue_size 9999${networkDataOpt}`;
        response.infoLog += workDone;
        response.infoLog += `☑Expected results: ${buildOutputSummary()}\n`;
        response.processFile = true;
    } else {
        if (workDone) response.infoLog += workDone;
        response.infoLog += `☑Audio already has the correct formats available.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
