/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio (by language, then main/descriptive/commentary, then channels and quality) -> Subtitles (forced first, by language, then normal/signs/sdh/commentary) -> Attachments -> Data\n`,
    Version: '1.7.0',
    Tags: 'pre-processing,ffmpeg,stream-order',
    Inputs: [
        {
            name: 'preferred_languages',
            type: 'string',
            defaultValue: 'eng,und',
            inputUI: { type: 'text' },
            tooltip: `Comma separated language priority list (e.g. eng,jpn,und). Leave blank to leave language order untouched.
                 \\nAny languages not mentioned will be grouped by channel, etc but will be left in the language order they appear in the file.
                 \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US.
                 \\nIf two character is provided in the list then languages formatted like en-US will be treated as en
                 \\nExample: (channel_order ascending and preferred_languages eng,jpn)\\n
                 A file containing ger 2.0,fre 2.0,eng 2.0,jpn 2.0,eng 5.1,jpn 5.1 would be reordered eng 5.1,eng 2.0,jpn 5.1,jpn 2.0,ger 2.0,fre 2.0`,
        },
        {
            name: 'channel_order',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'ascending'],
            },
            tooltip: `Audio channel ordering preference - streams are ordered by channel then rating of codec/bitrate. Generally descending is recommended.
                \\nExample:\\n
                    ascending: 2.0,5.1
                \\nExample:\\n
                    descending: 5.1,2.0`
        },
        {
            name: 'quality_order',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'ascending'],
            },
            tooltip: `Audio quality ordering preference - streams are ordered by channel then rating of codec/bitrate. Generally descending is recommended.
                \\nExample:\\n
                    ascending: 128k,640k
                \\nExample:\\n
                    descending: 640k,128k`
        },
        {
            name: 'sdh_first',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: 'Should SDH tracks be put at the top? (Subtitles for the Deaf and Hard-of-Hearing)',
        },
        {
            name: 'default_audio_first',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Should we put the default audio first within its language group?
                \\nLeave this false unless you specifically know you want it. The default disposition flag is frequently wrong or arbitrary depending on the file source, and when enabled it sorts ABOVE role — a track flagged default will be placed above the main/descriptive/commentary ordering within its language. A mis-flagged default commentary track would therefore sort above the main feature audio.
                \\nOnly enable this if your files have a reliably-set default flag and you understand you are sorting on a potentially arbitrary tag.
                \\nNote: language priority is always respected first — a default German track will not sort above a non-default English track when English is preferred.`,
        },
        {
            name: 'temp_on_network',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false'],
            },
            tooltip: `Is the temp folder on the network? Enabling this adds stops ffmpeg from flushing the buffer quite as often. (-flush_packets 0)
                 \\nGenerally speaking this has very little effect if the files are local instead and therefore it's enabled by default.`,
        },
    ],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        FFmpegMode: true,
        container: `.${file.container}`,
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

    // Audio quality scoring — must be declared after response so infoLog is available
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
        //We scored atmos a little higher than typical eac3 - codec_long_name rarely says "atmos" so also check the stream title tag
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

        // No stream-level bitrate reported — return midpoint rather than full score to
        // avoid preferring an unknown-bitrate lossy track over a scored one. This is
        // expected for freshly-transcoded tracks (aac, opus, ac3, eac3, etc.), where the
        // muxer often omits per-stream bitrate; it is only worth attention for source
        // codecs that normally carry one (dts, ac3 from disc, etc.).
        if (bitrate <= 0) {
            const transcodeOutputs = new Set(['aac', 'opus', 'ac3', 'eac3', 'mp3', 'flac', 'vorbis']);
            if (!transcodeOutputs.has(codec))
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

    if(!['descending', 'ascending'].includes(inputs.channel_order)) {
        response.infoLog += '☒channel_order has not been configured, please configure required options.\n';
        response.processFile = false;
        return response;
    }
    if(!['descending', 'ascending'].includes(inputs.quality_order)) {
        response.infoLog += '☒quality_order has not been configured, please configure required options.\n';
        response.processFile = false;
        return response;
    }

    // VIDEO -> AUDIO -> SUBTITLE -> ATTACHMENT -> DATA -> OTHER?
    const streamOrder = { video: 0, audio: 1, subtitle: 2 , attachment: 3, data: 4};
    const preferredLanguages = (inputs.preferred_languages || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
    const sdhFirst = String(inputs.sdh_first) === 'true';
    const defaultAudioFirst = String(inputs.default_audio_first) === 'true';

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');

    //Collect the other languages from file
    const languageOrder = new Set(preferredLanguages);
    const streams = [];
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
        const ffstream = file.ffProbeData.streams[i];
        const streamTitle = (ffstream.tags?.title || '').trim().toLowerCase();
        const streamLang = (ffstream.tags?.language?.trim() || 'und').toLowerCase();
        const streamLangShort = streamLang.replace(/[-_.].*$/, '');
                
        //Add it to the list of languages if we don't have it or the two letter code that starts it if like en-US
        if (!languageOrder.has(streamLang) && !languageOrder.has(streamLangShort)) {
            preferredLanguages.push(streamLang);
            languageOrder.add(streamLang);
        }

        const streamType = (ffstream.codec_type || '').trim().toLowerCase();

        streams.push({
            index: i,
            stream: ffstream,
            type: streamType,
            title: streamTitle,
            lang: streamLang,
            shortlang: streamLangShort,
            channels: ffstream?.channels || 0,
            forced: ffstream?.disposition?.forced === 1,
            // Only score audio streams — scoring video/subtitle/data would spam the log with
            // bogus "unknown codec"/"invalid bitrate" notices and serves no purpose since the
            // quality value is only used to sort audio.
            audioquality: streamType === 'audio' ? audioQuality(ffstream) : 0,
            default: ffstream?.disposition?.default === 1,

            // simple classification (no helper functions)
            commentary: ffstream?.disposition?.comment === 1 ||
                        streamTitle.includes('commentary') ||
                        streamTitle.includes('producer'),

            descriptive:  ffstream?.disposition?.visual_impaired === 1 ||
                          streamTitle.includes('description') ||
                          streamTitle.includes('descriptive') ||
                          streamTitle.includes('dvs') ||
                          streamTitle.includes('narration'),

            sdh: ffstream?.disposition?.hearing_impaired === 1 ||
                 streamTitle.includes('sdh') ||
                 streamTitle.includes('hearing impaired') ||
                 streamTitle.includes('deaf'),

            signs: ffstream?.disposition?.karaoke === 1 ||
                   streamTitle.includes('signs') ||
                   streamTitle.includes('songs'),

            mjpeg: (ffstream.codec_name || '').trim().toLowerCase() === 'mjpeg',
        });
    }

    const getLangRank = (lang, shortlang) => {
        let idx = preferredLanguages.indexOf(lang);
        if (idx === -1) idx = preferredLanguages.indexOf(shortlang);
        return idx === -1 ? 999 : idx;
    };

    //Sort the streams
    streams.sort((a, b) => {
        //Stream Type
        const aOrder = streamOrder[a.type] ?? 99;
        const bOrder = streamOrder[b.type] ?? 99;

        if (aOrder !== bOrder)
            return aOrder - bOrder;

        //Video (but mjpeg goes last)
        if (a.type === 'video') {
            if (a.mjpeg !== b.mjpeg)
                return a.mjpeg ? 1 : -1;
        //Audio
        } else if(a.type === 'audio') {
            //Language priority first — defaultAudioFirst is a tiebreaker within the same language,
            //not a global override. A default German track should not sort above a non-default English track.
            const aRank = getLangRank(a.lang, a.shortlang);
            const bRank = getLangRank(b.lang, b.shortlang);
            if (aRank !== bRank)
                return aRank - bRank;

            //Within the same language group, honour the default flag if requested.
            //The default tag can be inaccurate depending on the file source.
            if(defaultAudioFirst && (a.default !== b.default))
                return a.default ? -1 : 1;

            //A commentary stream could be descriptive but it would still be a commentary
            const aRole = a.commentary ? 2 : (a.descriptive ? 1 : 0);
            const bRole = b.commentary ? 2 : (b.descriptive ? 1 : 0);
            if (aRole !== bRole)
                return aRole - bRole;

            //Channel ordering
            if (a.channels !== b.channels)
                return (inputs.channel_order === 'descending' ? b.channels - a.channels : a.channels - b.channels);

            //Quality
            if (a.audioquality !== b.audioquality)
                return (inputs.quality_order === 'descending' ? b.audioquality - a.audioquality : a.audioquality - b.audioquality);
        //Subtitles
        } else if (a.type === 'subtitle') {
            //Forced always first
            if (a.forced !== b.forced)
                return a.forced ? -1 : 1;

            //Override
            if(sdhFirst && (a.sdh !== b.sdh))
                return a.sdh ? -1 : 1;

            //Language
            const aRank = getLangRank(a.lang, a.shortlang);
            const bRank = getLangRank(b.lang, b.shortlang);

            if (aRank !== bRank)
                return aRank - bRank;

            //Normal, signs, SDH, commentary - sdhFirst flag overrides SDH position above
            const aRole = a.commentary ? 3 : (a.sdh ? 2 : (a.signs ? 1 : 0));
            const bRole = b.commentary ? 3 : (b.sdh ? 2 : (b.signs ? 1 : 0));
            if (aRole !== bRole)
                return aRole - bRole;
        }

        //Next would be attachments and data but the order of these aren't important
        return a.index - b.index;
    });

    //Check if order has changed and get the map ready
    let ffmpegMap = '';
    let changed = false;

    for (let i = 0; i < streams.length; i++) {
        ffmpegMap += ` -map 0:${streams[i].index}`;
        if (streams[i].index !== i) changed = true;
    }

    if (!changed) {
        response.infoLog += '☑Streams already in desired order.\n';
        return response;
    }

    // Build a human-readable summary of the new stream order for easier debugging
    const orderSummary = streams.map(s => {
        if (s.type === 'video') {
            const codec = s.stream.codec_name || 'unknown';
            return `[video:${codec}]`;
        } else if (s.type === 'audio') {
            const codec = s.stream.codec_name || 'unknown';
            const ch = s.channels ? `${s.channels}ch` : '';
            const lang = s.lang !== 'und' ? s.lang : '';
            // Measured bitrate from the probe (this plugin runs after any transcode, so it's a real
            // value). Shown as kbps; omitted when the stream carries no bit_rate so the entry stays clean.
            const bitrate = Number(s.stream.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = s.commentary ? '/commentary' : (s.descriptive ? '/description' : '');
            return `[audio:${[lang, ch, codec, rate].filter(Boolean).join(' ')}${role}]`;
        } else if (s.type === 'subtitle') {
            const lang = s.lang !== 'und' ? s.lang : '';
            const role = s.commentary ? '/commentary' : (s.sdh ? '/sdh' : (s.signs ? '/signs' : ''));
            const forced = s.forced ? '/forced' : '';
            return `[sub:${[lang].filter(Boolean).join(' ')}${forced}${role}]`;
        }
        return `[${s.type}]`;
    }).join(' ');

    response.processFile = true;
    response.reQueueAfter = true;
    response.preset = `,${ffmpegMap} -c copy -max_muxing_queue_size 9999${networkDataOpt}`;
    response.infoLog += `☒Streams are not in the correct order.\n☒New order: ${orderSummary}\n`;

    return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
