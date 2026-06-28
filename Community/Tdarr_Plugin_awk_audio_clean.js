/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin cleans up the audio tracks. There are options to downmix and convert tracks based on channel count and language.\n\n
                  Ensure options are set directly as this can be destructive especially with incorrectly tagged audio tracks`,
    Version: '1.5',
    Tags: 'pre-processing,ffmpeg,audio_only,configurable',
    Inputs: [
        {
            name: 'downmix_language',
            type: 'string',
            defaultValue: 'en,eng,und',
            inputUI: { type: 'text' },
            tooltip: `Specify language tags here for the audio tracks you'd like to convert. If blank then all tracks will be considered.
                \\nStreams with no language tag are treated as though they their language is "und"
                \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US
                \\nExample: English, French, and Japanese (ISO-639-2 and ISO-639-1) (und = undefined, mul = multiple languages, zxx = no linguistic content, mis = missing language / no language code)\\n
                    en,eng,fr,fre,fra,und,mul,jpn,ja,zxx,mis
                \\nExample:\\n
                    en,eng,und`,
        },                
        {
            name: 'downmix_to_six',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','replace','true'],
            },
            tooltip: `Specify if we should downmix a 5.1 track from 8 channel from the best quality higher channel track for that language. If no higher channel track exists no work is done.
                \\nIf false - no 6 channel is created from 8 channel
                \\nIf replace - a 6 channel track replaces the 8 channel track used to create it unless it's the highest quality option and keep_best_surround_safe is enabled
                \\nIf true - a 6 channel track will be created from the 8 channel track and both will be kept. surround_codec is used for the codec.`,
        },
        {
            name: 'downmix_to_stereo',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','replace','true'],
            },
            tooltip: `Specify if we should downmix a 2 channel track if one doesn't exist from the best quality higher channel track for that language. If no higher channel track exists no work is done.
                \\nIf false - no 2 channel is created
                \\nIf replace - 2 channel track replaces the higher channel track used to create it unless it's the highest quality option and keep_best_surround_safe is enabled
                \\nIf true - a 2 channel track will be created from a higher channel track and both will be kept. stereo_codec is used for the codec.`,
        },        
        {
            name: 'downmix_single',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Take the highest quality highest channel track that matches the first language we find in downmix_language (if set) and only work with this one track. Ignore other languages and try to ignore commentary tracks, etc.`,
        },
        {
            name: 'downmix_secondary',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Should commentary, visual impaired tracks, etc be queued for downmixing to lower channel counts? This would normally be false`,
        },
        {
            name: 'remove_duplicates',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Remove lower quality audio streams that share the same language, channel count, and general track type (primary vs secondary/commentary).
                \\nThe highest quality stream in each group is kept; the rest are removed.`,
        },
        {
            name: 'keep_best_surround_safe',
            type: 'string',
            defaultValue: 'quality',
            inputUI: {
                type: 'dropdown',
                options: ['false','quality','channel'],
            },
            tooltip: `If enabled then we should keep the best quality and highest channel option for each language. This track will be treated as a source and will not be transcoded or removed. This may override force_codec for that track.
                \\nIf false  - No track is treated as protected
                \\nIf quality- The focus is on track quality. A lossless 5.1 track would be kept over a lossy 7.1 as an example. If there is a 5.1 and 7.1 of similar quality then the 7.1 is marked as safe.
                \\nIf channel- The focus is on channel count. A lossy 7.1 track will always be kept over the lossless 5.1 track in the previous example.`,

        },        
        {
            name: 'surround_codec',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','eac3','ac3'],
            },
            tooltip: `Specify codec for newly created surround tracks. Note that both AC3 and EAC3 are limited to 6 channels by ffmpeg's encoder, so tracks with more than 6 channels will not be transcoded to either even if force_codec is applied.`,
        },
        {
            name: 'stereo_codec',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','ac3'],
            },
            tooltip: `Specify codec for newly created stereo tracks.`,
        },        
        {
            name: 'force_codec',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','6below','2below','true'],
            },
            tooltip: `Transcode all tracks to the codecs specified in surround_codec and stereo_codec
                \\nIf false  - Codecs will be left as is and those two settings will only apply to new tracks
                \\nIf 6below - Streams with six or fewer channels will be transcoded to surround_codec (unless protected by keep_best_surround_safe)
                \\nIf 2below - Streams with two or fewer channels will be transcoded to stereo_codec
                \\nIf true   - All streams will be transcoded to the new codec`,
        },                
        {
            name: 'preserve_title',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','source','true'],
            },
            tooltip: `Specify whether downmixed tracks should preserve the original track title.
                \\nWhen false the stream title will contain a description of the transcode (e.g. "2.0" or "5.1").
                \\nWhen source the stream title will contain where the track came from based on channel count (e.g. "5.1 -> 2.0")
                \\nWhen true the stream title will contain the title of the original track with the new channel count at the end (e.g. "E-AC-3 Atmos 5.1 - 2.0")`,
        },
        {
            name: 'stereo_downmix',
            type: 'string',
            defaultValue: 'dialogue',
            inputUI: {
                type: 'dropdown',
                options: ['default','dialogue'],
            },
            tooltip: `Method used when creating stereo (2.0) tracks from surround sources.
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
    
    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        container: `.${file.container}`,
        FFmpegMode: true,
        infoLog: '',
    };

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video. \n';
        response.processFile = false;
        return response;
    }

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');
    
    //Check our inputs
    const downmixToSix = String(inputs.downmix_to_six).trim();
    const downmixToTwo = String(inputs.downmix_to_stereo).trim();
    const downmixSingle = String(inputs.downmix_single) === 'true';
    const downmixSecondary = String(inputs.downmix_secondary) === 'true';
    const removeDuplicates = String(inputs.remove_duplicates) === 'true';
    const downmixLanguage = String(inputs.downmix_language).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const preserveTitle = String(inputs.preserve_title).trim();
    const forceCodec = String(inputs.force_codec).trim();
    const stereoCodec = String(inputs.stereo_codec).trim();
    const stereoDownmix = String(inputs.stereo_downmix).trim();
    const surroundCodec = String(inputs.surround_codec).trim();
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
    if(!['false','source','true'].includes(preserveTitle)) {
        response.infoLog += `☒Somehow invalid preserveTitle option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['false','6below','2below','true'].includes(forceCodec)) {
        response.infoLog += `☒Somehow invalid forceCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['ac3','eac3','aac'].includes(surroundCodec)) {
        response.infoLog += `☒Somehow invalid surroundCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['ac3','aac'].includes(stereoCodec)) {
        response.infoLog += `☒Somehow invalid stereoCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['default','dialogue'].includes(stereoDownmix)) {
        response.infoLog += `☒Somehow invalid stereoDownmix option provided. Check your settings!\n`;
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
    audioStreams = audioStreams.map(item => ({...item,
                        isTdarrSecondaryTrack: isSecondaryTrack(item),
                        isTdarrCleanLang: String((item.tags?.language || 'und').trim().toLowerCase().replace(/[-_.].*$/, '')),
                        isTdarrQuality: audioQuality(item)
                    }));

    // candidateStreams: language+secondary filtered but NOT channelMatch filtered.
    // Used for duplicate detection and as the pool for workStreams.
    let candidateStreams = audioStreams;
    if (downmixSecondary !== true)
        candidateStreams = candidateStreams.filter(stream => !stream.isTdarrSecondaryTrack);
    if (downmixLanguage.length !== 0)
        candidateStreams = candidateStreams.filter(stream => downmixLanguage.includes(stream.isTdarrCleanLang));

    // keep_best_surround_safe: protect the best track per language. (based on setting of keep_best_surround_safe quality vs channel)
    // Protected tracks are never removed or force-transcoded, and a 'replace' downmix on them becomes an 'add' so the pristine source survives.
    const protectedIndices = new Set();
    if (keepBestSurroundSafe !== 'false') {
        const bestByLang = new Map();
        const qualityFirst = keepBestSurroundSafe === 'quality';
        for (const s of candidateStreams) {
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
    const existingStereoLangs = new Set(audioStreams.filter(s => s.channels === 2 && !s.isTdarrSecondaryTrack).map(s => s.isTdarrCleanLang));

    // Identify lower-quality duplicates: group by (lang, channels, primary/secondary).
    // Within each group, keep only the highest quality stream and mark the rest for removal.
    // Note: deduplication runs across ALL audio streams regardless of downmix_language or
    // downmix_secondary, since those settings govern transcoding candidates, not what's a
    // genuine duplicate. A duplicate TrueHD in a non-preferred language is still a duplicate.
    const streamsToRemove = new Set();
    if (removeDuplicates) {
        const seen = new Map();
        const byQuality = [...audioStreams].sort((a, b) => b.isTdarrQuality - a.isTdarrQuality || a.index - b.index);
        for (const s of byQuality) {
            const key = `${s.isTdarrCleanLang}|${s.channels}|${s.isTdarrSecondaryTrack}`;
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
        if(stream.channels > 6 && (downmixToSix === 'false') && (downmixToTwo === 'false') && (forceCodec === 'true' && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        //3-7 channel
        else if(stream.channels > 2 && stream.channels <= 6 && (downmixToTwo === 'false') && (['true','6below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        if((stream.channels <= 2) && ['true','6below','2below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === stereoCodec))
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

        const aRole = a.isTdarrSecondaryTrack ? 1 : 0;
        const bRole = b.isTdarrSecondaryTrack ? 1 : 0;
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

    // Prefer channel_layout (e.g. '3.1', '2.1', '4.0') over channel count alone, since
    // multiple layouts share the same count (3ch = 2.1 or 3.0; 4ch = 3.1, 4.0, or quad).
    // Strip parenthesised variants like '5.1(side)' → '5.1' for label purposes.
    const chLabel = (stream) => {
        const layout = (stream?.channel_layout || '').toLowerCase().replace(/\(.*\)$/, '').trim();
        const ch = Number(stream?.channels ?? 0);
        const byLayout = {
            'mono': 'Mono', 'stereo': 'Stereo', 'downmix': 'Stereo',
            '2.1': '2.1', '3.0': '3.0', '3.1': '3.1',
            'quad': 'Quad', '4.0': '4.0', '4.1': '4.1',
            '5.0': '5.0', '5.1': '5.1',
            '6.0': '6.0', '6.1': '6.1',
            '7.0': '7.0', '7.1': '7.1',
        };
        const byCount = { 8: '7.1', 7: '6.1', 6: '5.1', 5: '5.0', 4: '4.0', 3: '3.0', 2: 'Stereo', 1: 'Mono' };
        return byLayout[layout] ?? byCount[ch] ?? `${ch}ch`;
    };

    // Build the title for a new or replaced track.
    const buildTitle = (srcStream, targetLabel) => {
        const srcLabel = chLabel(srcStream);
        const origTitle = (srcStream.tags?.title || '').trim();
        if (preserveTitle === 'false') return targetLabel;
        if (preserveTitle === 'source') return `${srcLabel} -> ${targetLabel}`;
        if (!origTitle) return targetLabel;
        const escapedLabel = targetLabel.replace(/\./g, '\\.');
        if (new RegExp(`(?:^|[^0-9.])${escapedLabel}$`).test(origTitle)) return origTitle;
        return `${origTitle} - ${targetLabel}`;
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

    // With downmixSingle, only the first (highest-quality) stream is used as a downmix source.
    // forceCodec is also limited to that one track for consistency.
    const streamsToProcess = downmixSingle ? workStreams.slice(0, 1) : workStreams;

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

            // ---- DOWNMIX TO 6 CHANNELS ----
            // One 6ch per language, from its best >6ch source. A protected best source is
            // never replaced in place, so 'replace' becomes 'add' for it.
            if (downmixToSix !== 'false' && ffstream.channels > 6 && !created6chLangs.has(ffstreamLangKey)) {
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
                } else if (twoMode === 'true') {
                    workDone += `☒Stream ${ffstream.index}: Adding stereo ${stereoCodec} downmix from ${ffstream.channels}ch\n`;
                    extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${stereoCodec}${stereoArg(newStreamOutputIdx, ffstream)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
                    if (streamLang) extraArguments += ` -metadata:s:a:${newStreamOutputIdx} "language=${escTitle(streamLang)}"`;
                    newStreamOutputIdx++;
                    created2chLangs.add(ffstreamLangKey);
                    convert = true;
                }
            }

            // ---- FORCE CODEC ----
            // Skip protected best tracks. Also skip when the source has more channels than
            // the target codec supports (ac3/eac3 max 6ch in ffmpeg's encoder) to avoid an ffmpeg encode failure.
            if (forceCodec !== 'false' && !modifiedAudioIdx.has(outputAudioIdx) && !isProtected) {
                const isStereo = ffstream.channels <= 2;
                const targetCodec = isStereo ? stereoCodec : surroundCodec;

                if (ffstreamCodec !== targetCodec) {
                    const shouldForce =
                        forceCodec === 'true' ||
                        (forceCodec === '6below' && !isStereo && ffstream.channels <= 6) ||
                        (forceCodec === '6below' && isStereo) ||
                        (forceCodec === '2below' && isStereo);

                    const targetMaxCh = ({ ac3: 6, eac3: 6, aac: 8 })[targetCodec] ?? 8;

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
        response.preset += `,-map 0 -c:v copy -c:a copy -c:s copy${extraArguments} -max_muxing_queue_size 9999${networkDataOpt}`;
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
