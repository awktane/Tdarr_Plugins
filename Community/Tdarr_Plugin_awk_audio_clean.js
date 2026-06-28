/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin cleans up the audio tracks. There are options to downmix and convert tracks based on channel count and language.\n\n
                  Ensure options are set directly as this can be destructive especially with incorrectly tagged audio tracks`,
    Version: '1.12.1',
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
                options: ['false','replace','true'],
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
                options: ['false','replace','true'],
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
                options: ['false','true'],
            },
            tooltip: `Should commentary, visual impaired tracks, and other secondary tracks be downmixed to stereo? Unlike the primary downmix options, each surround secondary track is transcoded in place to stereo independently — one stereo per secondary track, preserving all of them. This would normally be false.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false - secondary tracks are left untouched
                \\nIf true  - each secondary track with more than 2 channels is transcoded in place to a stereo stereo_codec track (using the stereo_downmix matrix). A protected best source is added rather than replaced.`,
        },
        {
            name: 'remove_duplicates',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','clean','true'],
            },
            tooltip: `If true then one track is allowed per channel count, language, and type (commentary, descriptive, etc). The highest quality stream in each group is kept and the rest are removed. Any stream newly created by downmix_to_six or downmix_to_stereo would also be kept.
                \\nAssuming the example stream below
                \\nExample:\\n
                22.2 english mpegh3d, 7.1 english aac, 7.1 english flac, 5.1 french aac, 2.0 french truehd, 2.0 french aac, 2.0 english ac3, 2.0 english mp3, 5.1 english aac commentary\\n
                If clean results will be as seen below - assuming downmix_to_stereo is true, downmix_language is set to 'eng,en', keep_best_surround_safe is set to 'quality', force_codec is set to '6below', downmix_secondary_stereo is true
                \\nExample:\\n
                7.1 english flac (orig), 5.1 french aac (orig), 2.0 french aac (from truehd track), 2.0 english aac (from ac3), 5.1 english aac commentary (orig->stereo), 2.0 english aac commentary (from 5.1 commentary)
                \\nIf clean results will be as seen below - assuming downmix_to_six is replace, downmix_to_stereo is replace, downmix_language is set to 'eng,en', force_codec is set to 'all', downmix_secondary_stereo is true, keep_best_surround_safe is false
                \\nExample:\\n
                5.1 english aac (from 7.1 flac), 2.0 french aac (from truehd track), 2.0 english aac (from ac3 track), 2.0 english aac commentary (from 5.1 commentary)
                \\nIf tru results will be as seen below - assuming default options
                \\nExample:\\n
                22.2 english mpegh3d, 7.1 english flac, 5.1 french aac, 2.0 french truehd, 2.0 english ac3, 5.1 english aac commentary
                \\nIf false results will be as seen below 
                \\nExample:\\n
                22.2 english mpegh3d, 7.1 english aac, 7.1 english flac, 5.1 french aac, 2.0 french truehd, 2.0 french aac, 2.0 english ac3, 2.0 english mp3, 5.1 english aac commentary`,
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
                options: ['aac','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created stereo tracks. AAC and Opus are the most compatible choices for modern media servers and clients. EAC3 is useful for Dolby branding on compatible devices. AC3 is the most broadly compatible legacy choice.`,
        },        
        {
            name: 'force_codec',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','6below','2below','all'],
            },
            tooltip: `Transcode all tracks to the codecs specified in surround_codec and stereo_codec depending on their channel count
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

    //Codecs and some values to help us score the quality so that we can pick the best track - some of these formats are not supported by ffmpeg yet (ac4)
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

    // Audio quality scoring 
    const audioQuality = (stream) => {
        let codec = (stream?.codec_name || '').toLowerCase().trim();
        const longName = (stream.codec_long_name || '').toLowerCase().trim();

        for (const [prefix, replacement] of codecAliases) {
            if (codec.startsWith(prefix)) {
                codec = replacement;
                break;
            }
        }

        //Do this first as there's no harm checking for additional info in the longName
        if(codec === 'dca')
            codec = 'dts';

        //bit of an exception for DTS Core and DTS-HD MA
        if (codec === 'dts') {
            if (longName.includes('master'))
                codec = 'dtsma';
            else if (longName.includes('high resolution'))
                codec = 'dtshr';
            else if (longName.includes('express'))
                codec = 'dtsexpress';
        //We scored atmos a little higher than typical eac3
        // codec_long_name rarely says "atmos" so also check the stream title tag
        } else if (codec === 'eac3' && (longName.includes('atmos') || (stream.tags?.title || '').toLowerCase().includes('atmos')))
            codec = 'eac3atmos';

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

        // Invalid bitrate — return midpoint rather than full score to avoid
        // preferring an unknown-bitrate lossy track over a scored one.
        if (bitrate <= 0) {
            response.infoLog += `☒Stream ${stream.index}: Invalid bitrate, assuming nominal quality.\n`;
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

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video. \n';
        response.processFile = false;
        return response;
    }

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');
    
    //Check our inputs
    const downmixLanguage = String(inputs.downmix_language).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const downmixToSix = String(inputs.downmix_to_six).trim();
    const downmixToTwo = String(inputs.downmix_to_stereo).trim();
    const downmixSecondaryStereo = String(inputs.downmix_secondary_stereo).trim();
    const removeDuplicates = String(inputs.remove_duplicates).trim();
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
    if(!['false','clean','true'].includes(removeDuplicates)) {
        response.infoLog += `☒Somehow invalid removeDuplicates option provided. Check your settings!\n`;
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
    if(!['ac3','eac3','aac','opus'].includes(stereoCodec)) {
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

    //We really only care about the audio streams
    let audioStreams = file.ffProbeData.streams.filter(stream => (stream?.codec_type ?? '').trim().toLowerCase() === 'audio');
    if (audioStreams.length === 0) {
        response.infoLog += '☒ Video file has no audio streams to manage.\n';
        return response;
    }

    const isSecondaryTrack = (stream) => {
        const title = String(stream.tags?.title || '').toLowerCase();
        const disposition = stream.disposition || {};
        return (
            disposition.comment === 1 || 
            disposition.visual_impaired === 1 ||
            disposition.karaoke === 1 ||
            title.includes('commentary') ||
            title.includes('producer') ||
            title.includes('description') ||
            title.includes('descriptive') ||
            title.includes('dvs') ||
            title.includes('narration') ||
            title.includes('signs') ||
            title.includes('songs'));
    };

    //Add secondary track flag and the cleaned language to each track
    audioStreams = audioStreams.map(item => {
        const cleanLang = String((item.tags?.language || 'und').trim().toLowerCase().replace(/[-_.].*$/, ''));
        return {...item,
            isTdarrSecondaryTrack: isSecondaryTrack(item),
            // Language-secondary: track language is not in downmixLanguage (when the list is non-empty).
            // These tracks follow the secondary path (downmix_secondary_stereo, force_codec) but are
            // excluded from the primary downmix paths (downmix_to_six, downmix_to_stereo).
            isTdarrLangSecondary: downmixLanguage.length > 0 && !downmixLanguage.includes(cleanLang),
            isTdarrCleanLang: cleanLang,
            isTdarrQuality: audioQuality(item)
        };
    });

    // candidateStreams: the pool for workStreams and keep_best_surround_safe.
    // Lang-secondary tracks (unlisted language) are included here so force_codec and
    // downmix_secondary_stereo can act on them. They are excluded from the primary downmix
    // paths (downmix_to_six, downmix_to_stereo) in the processing loop below.
    // Secondary and lang-secondary tracks are only dropped from the pool when there is
    // genuinely nothing to do with them: downmix_secondary_stereo is false AND force_codec is
    // false. When force_codec is set they stay so the force-codec path can standardize their
    // codec too (e.g. force_codec='all' must touch every track, including commentary and
    // unlisted-language tracks).
    let candidateStreams = audioStreams;
    if (downmixSecondaryStereo === 'false' && forceCodec === 'false')
        candidateStreams = candidateStreams.filter(stream => !stream.isTdarrSecondaryTrack && !stream.isTdarrLangSecondary);

    // keep_best_surround_safe: protect the best track per language among preferred-language primary tracks.
    // Lang-secondary and disposition-secondary tracks are excluded — protecting a non-preferred-language
    // track or a commentary track serves no purpose and would prevent force_codec from touching it.
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

    // Languages that already have a primary stereo track, so downmix_to_stereo can honour
    // "create a 2 channel track only if one doesn't exist".
    // Uses isTdarrCleanLang (normalised short code, e.g. 'en' for 'en-US') to match the same
    // key used by created2chLangs and ffstreamLangKey — preventing redundant stereo creation
    // when the existing track is tagged with a regional variant like en-US.
    const existingStereoLangs = new Set(audioStreams.filter(s => s.channels === 2 && !s.isTdarrSecondaryTrack && !s.isTdarrLangSecondary).map(s => s.isTdarrCleanLang));

    // Languages that already have a primary 5.1/6ch track, so downmix_to_six can honour
    // "create a 5.1 track only if one doesn't exist". Mirrors existingStereoLangs.
    // Channels > 4 && <= 6 covers 5.0 and 5.1 without catching 4.0/4.1 or 7.1 sources.
    const existingSixLangs = new Set(audioStreams.filter(s => s.channels > 4 && s.channels <= 6 && !s.isTdarrSecondaryTrack && !s.isTdarrLangSecondary).map(s => s.isTdarrCleanLang));

    // Identify lower-quality duplicates. Within each group keep only the highest quality stream
    // and mark the rest for removal. The grouping key depends on the mode:
    //   'true'  - group by (lang, exact channel count, primary/secondary): one track per distinct
    //             channel count survives (e.g. a 7.1, a 5.1 and a 2.0 of the same language are all kept).
    //   'clean' - group by (lang, surround-vs-stereo tier, primary/secondary): collapses every
    //             surround variant of a language down to a single best surround plus a single best
    //             stereo, for a more predictable layout. Downmix targets created later are unaffected
    //             since they don't exist in audioStreams yet.
    // Note: deduplication runs across ALL audio streams regardless of downmix_language or
    // downmix_secondary_stereo, since those settings govern transcoding candidates, not what's a
    // genuine duplicate. A duplicate TrueHD in a non-preferred language is still a duplicate.
    // Protected (keep_best_surround_safe) tracks are never removed.
    const streamsToRemove = new Set();
    if (removeDuplicates === 'true' || removeDuplicates === 'clean') {
        const seen = new Map();
        const byQuality = [...audioStreams].sort((a, b) => b.isTdarrQuality - a.isTdarrQuality || a.index - b.index);
        for (const s of byQuality) {
            const tier = removeDuplicates === 'clean' ? (s.channels > 2 ? 'surround' : 'stereo') : s.channels;
            // Group only by the genuine commentary/VI marker (isTdarrSecondaryTrack), NOT by
            // lang-secondary. A foreign-language MAIN track and a foreign-language COMMENTARY
            // track share the same language and channel count but are different content — keying
            // on lang-secondary would collapse them together and wrongly delete the commentary.
            const key = `${s.isTdarrCleanLang}|${tier}|${s.isTdarrSecondaryTrack}`;
            if (seen.has(key)) {
                if (protectedIndices.has(s.index)) continue;
                streamsToRemove.add(s.index);
                workDone += `☒Stream ${s.index}: Removing duplicate (lower quality ${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrCleanLang})\n`;
            } else
                seen.set(key, s);
        }
    }

    // inputAudioIdxMap: 0-based audio-type index within the INPUT file (for -map 0:a:N).
    // outputAudioIdxMap: 0-based audio-type index within the OUTPUT (for -c:a:N and -metadata:s:a:N).
    // These differ when removeDuplicates removes streams, since -map 0:a:N always references input.
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
    const channelMatch = (stream) => {
        //8 channel
        if(stream.channels > 6 && (downmixToSix === 'false') && (downmixToTwo === 'false') && (forceCodec === 'all' && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        //3-7 channel
        else if(stream.channels > 2 && stream.channels <= 6 && (downmixToTwo === 'false') && (['all','6below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        if((stream.channels <= 2) && ['all','6below','2below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === stereoCodec))
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

    // Build the title for a new or replaced track. The original track title is always
    // preserved and the new channel count is appended with -> (e.g. a source titled
    // "E-AC-3 Atmos 5.1" downmixed to stereo becomes "E-AC-3 Atmos 5.1 -> 2.0"). This keeps
    // role words like "Commentary"/"Director's Commentary" visible after a downmix. When the
    // source has no title the new channel count alone is used (e.g. "2.0"). If the title
    // already ends in the target label (not preceded by a digit/dot, so "5.1" won't match
    // "15.1") it is returned unchanged to avoid "... 2.0 -> 2.0".
    const buildTitle = (srcStream, targetLabel) => {
        const origTitle = (srcStream.tags?.title || '').trim();
        if (!origTitle) return targetLabel;
        const escapedLabel = targetLabel.replace(/\./g, '\\.');
        if (new RegExp(`(?:^|[^0-9.])${escapedLabel}$`).test(origTitle)) return origTitle;
        return `${origTitle} -> ${targetLabel}`;
    };
    // Sanitize a value before embedding it inside a double-quoted ffmpeg -metadata argument.
    // Tdarr splits the preset into an argv array (no shell) and feeds it to spawn, so shell
    // metacharacters are inert — the only injection vector is breaking out of the quoted value
    // to inject a new ffmpeg argument, which needs a double quote or control character. Tdarr's
    // tokenizer strips quotes with no reliable backslash-escape convention, so we remove the
    // breakout characters (double quotes, backslashes) and control characters outright rather
    // than escape them. Spaces and other printable text are safe inside the kept quoted value.
    const escTitle = (t) => String(t || '')
        .replace(/[\x00-\x1f\x7f]/g, '')   // strip control characters (newlines, null bytes, etc.)
        .replace(/[\\"]/g, '');             // remove backslashes and double quotes (argument-breakout chars)

    // Lo/Ro stereo downmix matrices using ffmpeg's standard positional channel order.
    // Center is kept at -3 dB (0.707) so dialogue stays clear; LFE is dropped to avoid mud.
    // Returns null for layouts we cannot safely map positionally, so callers fall back to -ac 2.
    //
    // All matrices are peak-normalized: each coefficient is divided by the maximum possible
    // sum for that channel (worst-case all inputs simultaneously at full scale). This prevents
    // clipping on loud content without cutting the overall perceived volume — real program
    // material rarely hits all channels at full simultaneously, so typical levels are unaffected.
    //
    // Verified channel layouts and worked examples (raw → normalized):
    //   2.1 (FL FR LFE) returns null: dropping LFE and keeping FL/FR is identical to -ac 2, no pan needed.
    //   3.0 (FL FR FC)  returns null: no surround channels and no LFE, -ac 2 handles it fine.
    //   3.1  FL FR FC LFE                     raw peak L=R=1.707       → norm /1.707 ≈ 0.586*c0+0.414*c2
    //   4.0  FL FR FC BC                      raw peak L=2.207,R=1.707 → norm by L peak /2.207
    //   5.0  FL FR FC BL BR                   raw peak L=2.414         → norm /2.414
    //   5.1  FL FR FC LFE BL BR (drop LFE)    raw peak L=2.414         → norm /2.414
    //   5.1(side) FL FR FC LFE SL SR          identical positional indices to 5.1, same matrix
    //   6.1       FL FR FC LFE BC SL SR       raw peak L=2.914         → norm /2.914
    //   6.1(back) FL FR FC LFE BL BR BC       raw peak L=2.914         → norm /2.914
    //   6.1(front) FL FR LFE FLC FRC SL SR    no FC; FLC/FRC as front  raw peak L=2.414 → norm /2.414
    //   7.1           FL FR FC LFE BL BR SL SR                  raw peak L=2.707 → norm /2.707
    //   7.1(wide)     FL FR FC LFE BL BR FLC FRC (FLC/FRC full) raw peak L=3.121 → norm /3.121
    //   7.1(wide-side) FL FR FC LFE FLC FRC SL SR               raw peak L=3.121 → norm /3.121
    const downmixMatrix = (srcStream) => {
        const ch = Number(srcStream?.channels) || 0;
        const layoutFull = (srcStream?.channel_layout || '').toLowerCase().trim();
        const layout = layoutFull.replace(/\(.*\)$/, '').trim();

        // 4-channel layouts: 3.1 (FL FR FC LFE) and 4.0 (FL FR FC BC) share the same count
        // but have different channel positions and require different matrices.
        if (ch === 4) {
            if (layout === '3.1')
                // 3.1 : FL FR FC LFE  (drop LFE c3); peak = 1+0.707 = 1.707
                return 'pan=stereo|FL=0.586*c0+0.414*c2|FR=0.586*c1+0.414*c2';
            if (layout === '4.0')
                // 4.0 : FL FR FC BC  (BC c3 split to both sides); peak L = 1+0.707+0.5 = 2.207
                return 'pan=stereo|FL=0.453*c0+0.320*c2+0.227*c3|FR=0.453*c1+0.320*c2+0.227*c3';
            return null;
        }

        if (ch === 5)
            // 5.0 : FL FR FC BL BR; peak L = 1+0.707+0.707 = 2.414
            return 'pan=stereo|FL=0.414*c0+0.293*c2+0.293*c3|FR=0.414*c1+0.293*c2+0.293*c4';

        if (ch === 6)
            // 5.1      : FL FR FC LFE BL BR  (c0..c5) — LFE c3 dropped; peak L = 1+0.707+0.707 = 2.414
            // 5.1(side): FL FR FC LFE SL SR  (c0..c5) — same positional indices, identical matrix
            return 'pan=stereo|FL=0.414*c0+0.293*c2+0.293*c4|FR=0.414*c1+0.293*c2+0.293*c5';

        if (ch === 7) {
            // 6.1(back) : FL FR FC LFE BL BR BC  (c0..c6) — BL c4, BR c5, BC c6 shared; peak L = 1+0.707+0.707+0.5 = 2.914
            if (layoutFull === '6.1(back)')
                return 'pan=stereo|FL=0.343*c0+0.243*c2+0.243*c4+0.172*c6|FR=0.343*c1+0.243*c2+0.243*c5+0.172*c6';
            // 6.1(front): FL FR LFE FLC FRC SL SR  (c0..c6) — no FC; FLC c3, FRC c4 as front; SL c5, SR c6; peak L = 1+0.707+0.707 = 2.414
            if (layoutFull === '6.1(front)')
                return 'pan=stereo|FL=0.414*c0+0.293*c3+0.293*c5|FR=0.414*c1+0.293*c4+0.293*c6';
            // 6.1 (default): FL FR FC LFE BC SL SR  (c0..c6) — BC c4 shared, SL c5, SR c6; peak L = 1+0.707+0.5+0.707 = 2.914
            return 'pan=stereo|FL=0.343*c0+0.243*c2+0.172*c4+0.243*c5|FR=0.343*c1+0.243*c2+0.172*c4+0.243*c6';
        }

        if (ch === 8) {
            // 7.1(wide)     : FL FR FC LFE BL BR FLC FRC  (c0..c7) — FLC c6, FRC c7 are front-of-center (full weight); peak L = 1+0.707+0.707+0.707 = 3.121
            if (layoutFull === '7.1(wide)')
                return 'pan=stereo|FL=0.320*c0+0.227*c2+0.227*c4+0.227*c6|FR=0.320*c1+0.227*c2+0.227*c5+0.227*c7';
            // 7.1(wide-side): FL FR FC LFE FLC FRC SL SR  (c0..c7) — FLC c4, FRC c5 front-of-center; SL c6, SR c7; peak L = 1+0.707+0.707+0.5 = 2.914
            if (layoutFull === '7.1(wide-side)')
                return 'pan=stereo|FL=0.343*c0+0.243*c2+0.243*c4+0.172*c6|FR=0.343*c1+0.243*c2+0.243*c5+0.172*c7';
            // 7.1 (default) : FL FR FC LFE BL BR SL SR  (c0..c7) — back+side at 0.5 each; peak L = 1+0.707+0.5+0.5 = 2.707
            return 'pan=stereo|FL=0.369*c0+0.261*c2+0.185*c4+0.185*c6|FR=0.369*c1+0.261*c2+0.185*c5+0.185*c7';
        }

        return null;
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

            // Guard: if either index is missing the stream wasn't tracked correctly — skip rather than
            // emitting a broken argument like -c:a:undefined which ffmpeg will reject with a cryptic error.
            if (outputAudioIdx === undefined || srcAudioIdx === undefined) {
                response.infoLog += `☒Stream ${ffstream.index}: Could not resolve audio index mapping, skipping.\n`;
                continue;
            }

            const ffstreamLangKey = ffstream.isTdarrCleanLang;
            const isProtected = protectedIndices.has(ffstream.index);

            // Secondary tracks (commentary, VI, etc.) and lang-secondary tracks (unlisted language)
            // get the stereo-only path and never trigger the primary downmix (downmix_to_six/two).
            if (ffstream.isTdarrSecondaryTrack || ffstream.isTdarrLangSecondary) {
            // ---- SECONDARY: DOWNMIX TO STEREO ----
            // Each secondary surround track is transcoded in place independently — one stereo
            // per secondary track, preserving all of them. A protected best source is never
            // replaced in place, so it gets a new stereo stream added alongside it instead.
            if (downmixSecondaryStereo !== 'false' && ffstream.channels > 2) {
                const newTitle = escTitle(buildTitle(ffstream, '2.0'));
                const addInstead = isProtected;

                if (!addInstead && !modifiedAudioIdx.has(outputAudioIdx)) {
                    workDone += `☒Stream ${ffstream.index}: Transcoding secondary ${ffstream.channels}ch to stereo ${stereoCodec} in place\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${stereoCodec}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escTitle(streamLang)}"`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    convert = true;
                } else if (addInstead) {
                    workDone += `☒Stream ${ffstream.index}: Adding secondary stereo ${stereoCodec} downmix from ${ffstream.channels}ch (protected source kept)\n`;
                    extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${stereoCodec}${stereoArg(newStreamOutputIdx, ffstream)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escTitle(streamLang)}"`;
                    newStreamOutputIdx++;
                    convert = true;
                }
            }
            } else {
            // ---- DOWNMIX TO 6 CHANNELS ----
            // One 6ch per language, from its best >6ch source. A protected best source is
            // never replaced in place, so 'replace' becomes 'add' for it.
            if (downmixToSix !== 'false' && ffstream.channels > 6 && !created6chLangs.has(ffstreamLangKey)
                && !existingSixLangs.has(ffstreamLangKey)) {
                const newTitle = escTitle(buildTitle(ffstream, '5.1'));
                const sixMode = (downmixToSix === 'replace' && isProtected) ? 'true' : downmixToSix;

                if (sixMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    workDone += `☒Stream ${ffstream.index}: Transcoding ${ffstream.channels}ch to 6ch ${surroundCodec} in place\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${surroundCodec} -ac:a:${outputAudioIdx} 6 -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escTitle(streamLang)}"`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    created6chLangs.add(ffstreamLangKey);
                    convert = true;
                } else if (sixMode === 'true') {
                    workDone += `☒Stream ${ffstream.index}: Adding 6ch ${surroundCodec} downmix from ${ffstream.channels}ch\n`;
                    extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${surroundCodec} -ac:a:${newStreamOutputIdx} 6 -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escTitle(streamLang)}"`;
                    newStreamOutputIdx++;
                    created6chLangs.add(ffstreamLangKey);
                    convert = true;
                }
            }

            // ---- DOWNMIX TO 2 CHANNELS ----
            // One stereo per language, from its best >2ch source, only when the language
            // has no primary stereo already. Protected best source: 'replace' becomes 'add'.
            // When 'replace' is requested but downmix_to_six already consumed this same source
            // in place (single >6ch source, both downmixes enabled), the in-place slot is taken,
            // so we fall back to ADDING a stereo from the original input. The user enabled
            // downmix_to_stereo expecting a 2.0 in the output, so a lone 7.1 with both downmixes
            // on yields a 5.1 and a 2.0 rather than silently dropping the stereo.
            if (downmixToTwo !== 'false' && ffstream.channels > 2
                && !created2chLangs.has(ffstreamLangKey)
                && !existingStereoLangs.has(ffstreamLangKey)) {
                const newTitle = escTitle(buildTitle(ffstream, '2.0'));
                const twoMode = (downmixToTwo === 'replace' && isProtected) ? 'true' : downmixToTwo;

                if (twoMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    workDone += `☒Stream ${ffstream.index}: Transcoding ${ffstream.channels}ch to stereo ${stereoCodec} in place\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${stereoCodec}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${outputAudioIdx} "language=${escTitle(streamLang)}"`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    created2chLangs.add(ffstreamLangKey);
                    convert = true;
                } else if (twoMode === 'true' || (twoMode === 'replace' && modifiedAudioIdx.has(outputAudioIdx))) {
                    workDone += `☒Stream ${ffstream.index}: Adding stereo ${stereoCodec} downmix from ${ffstream.channels}ch\n`;
                    extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${stereoCodec}${stereoArg(newStreamOutputIdx, ffstream)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escTitle(streamLang)}"`;
                    newStreamOutputIdx++;
                    created2chLangs.add(ffstreamLangKey);
                    convert = true;
                }
                }
            }

            // ---- FORCE CODEC ----
            // Skip protected best tracks UNLESS force_codec is 'all' — per keep_best_surround_safe,
            // the protected track can only be touched when force_codec is 'all'. Also skip when the
            // source has more channels than the target codec supports (ac3/eac3 max 6ch, opus/aac max 8ch
            // in ffmpeg's encoder) to avoid an ffmpeg encode failure.
            if (forceCodec !== 'false' && !modifiedAudioIdx.has(outputAudioIdx) && (!isProtected || forceCodec === 'all')) {
                const isStereo = ffstream.channels <= 2;
                const targetCodec = isStereo ? stereoCodec : surroundCodec;

                if (ffstreamCodec !== targetCodec) {
                    const shouldForce =
                        forceCodec === 'all' ||
                        (forceCodec === '6below' && !isStereo && ffstream.channels <= 6) ||
                        (forceCodec === '6below' && isStereo) ||
                        (forceCodec === '2below' && isStereo);

                    const targetMaxCh = ({ ac3: 6, eac3: 6, aac: 8, opus: 8 })[targetCodec] ?? 8;

                    if (shouldForce && ffstream.channels > targetMaxCh) {
                        workDone += `☒Stream ${ffstream.index}: Not forcing ${targetCodec} - ${ffstream.channels}ch exceeds the ${targetMaxCh}ch limit for ${targetCodec}. Enable downmix_to_six to reduce channels first.\n`;
                    } else if (shouldForce) {
                        workDone += `☒Stream ${ffstream.index}: Transcoding ${ffstreamCodec} to ${targetCodec}\n`;
                        extraArguments += ` -c:a:${outputAudioIdx} ${targetCodec}`;
                        modifiedAudioIdx.add(outputAudioIdx);
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


    // Convert file if convert variable is set to true.
    if (convert === true) {
        response.preset += `,-map 0 -c copy${extraArguments} -max_muxing_queue_size 9999${networkDataOpt}`;
        response.infoLog += workDone;
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
