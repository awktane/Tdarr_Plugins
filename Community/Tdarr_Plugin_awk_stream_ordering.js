/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio (by language, then channels and quality, then commentary, etc) -> Subtitles (forced first, by language, sdh, etc) -> Attachments -> Data\n`,
    Version: '1.2',
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
                 \\nA file containing ger 2.0,fre 2.0,eng 2.0,jpn 2.0,eng 5.1,jpn 5.1 would be reordered eng 5.1,eng 2.0,jpn 5.1,jpn 2.0,ger 2.0,fre 2.0`,
        },
        {
            name: 'channel_order',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'ascending'],
            },
            tooltip: `Audio channel ordering preference - streams are ordered by channel then bitrate. Generally descending is recommended.
                \\nExample: ascending\\n
                    2.0,5.1
                \\nExample: descending\\n
                    5.1,2.0`
        },
        {
            name: 'bitrate_order',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'ascending'],
            },
            tooltip: `Audio bitrate ordering preference - streams are ordered by channel then bitrate. Generally descending is recommended.
                \\nExample: ascending\\n
                    128k,640k
                \\nExample: descending\\n
                    640k,128k`
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
            tooltip: `Should we put the default audio first?
                \\nThe default tag can be inaccurate depending on the file source. If enabled a default track will sort above anything in preferred_languages`,
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

    if(!['descending', 'ascending'].includes(inputs.channel_order)) {
        response.infoLog += '☒channel_order has not been configured, please configure required options.\n';
        response.processFile = false;
        return response;
    }
    if(!['descending', 'ascending'].includes(inputs.bitrate_order)) {
        response.infoLog += '☒bitrate_order has not been configured, please configure required options.\n';
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

        streams.push({
            index: i,
            stream: ffstream,
            type: (ffstream.codec_type || '').trim().toLowerCase(),
            title: streamTitle,
            lang: streamLang,
            shortlang: streamLangShort,
            channels: ffstream?.channels || 0,
            forced: ffstream?.disposition?.forced === 1,
            bitrate: Number(ffstream?.bit_rate || 0),
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
            //Override
            if(defaultAudioFirst && (a.default !== b.default))
                return a.default ? -1 : 1;

            //Language priority
            const aRank = getLangRank(a.lang, a.shortlang);
            const bRank = getLangRank(b.lang, b.shortlang);
            if (aRank !== bRank)
                return aRank - bRank;

            //A commentary stream could be descriptive but it would still be a commentary
            const aRole = a.commentary ? 2 : (a.descriptive ? 1 : 0);
            const bRole = b.commentary ? 2 : (b.descriptive ? 1 : 0);
            if (aRole !== bRole)
                return aRole - bRole;

            //Channel ordering
            if (a.channels !== b.channels)
                return (inputs.channel_order === 'descending' ? b.channels - a.channels : a.channels - b.channels);

            //Quality
            if (a.bitrate !== b.bitrate)
                return (inputs.bitrate_order === 'descending' ? b.bitrate - a.bitrate : a.bitrate - b.bitrate);
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

    response.processFile = true;
    response.reQueueAfter = true;
    response.preset = `,${ffmpegMap} -c copy -max_muxing_queue_size 9999${networkDataOpt}`;
    response.infoLog += `☒Streams are not in the correct order. (${ffmpegMap})\n`;

    return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
