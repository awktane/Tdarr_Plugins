/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio (by language, then channels and quality, then commentary, etc) -> Subtitles (forced first, by language, sdh, etc) -> Data -> Attachments.\n`,
    Version: '1.042069',
    Tags: 'pre-processing,ffmpeg,stream-order',
    Inputs: [
        {
            name: 'preferred_languages',
            type: 'string',
            defaultValue: 'eng,und',
            inputUI: { type: 'text' },
            tooltip: `Comma separated language priority list (e.g. eng,jpn,und). Leave blank to leave language order untouched.
                 \\nAny languages not mentioned will be grouped by channel, etc but will be left in the language order they appear in the file.
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
            tooltip: `Audio channel ordering preference - streams are ordered by channel then bitrate. Generally descending is recommended as media players will downgrade by moving dowen the list.
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
            tooltip: `Audio bitrate ordering preference - streams are ordered by channel then bitrate. Generally descending is recommended as media players will downgrade by moving down the list.
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
            tooltip: 'Should we put the default audio first? It is often inaccurate depending on the file source.',
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
        reQueueAfter: false,
        container: `.${file.container}`,
        infoLog: '',
    };

    // VIDEO -> AUDIO -> SUBTITLE -> OTHER
    const streamOrder = { video: 0, audio: 1, subtitle: 2 , attachment: 3, data: 4};
    const preferredLanguages = inputs.preferred_languages.toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
    const sdhFirst = String(inputs.sdh_first) === 'true';
    const defaultAudioFirst = String(inputs.default_audio_first) === 'true';

    // collect the other languages from file
    const languageOrder = new Set(preferredLanguages);
    const streams = [];
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
        const ffstream = file.ffProbeData.streams[i];
        const streamTitle = (ffstream.tags?.title || '').trim().toLowerCase();
        const streamLang = (ffstream.tags?.language || 'und').trim().toLowerCase();

        //Add it to the list of languages
        if (!languageOrder.has(streamLang)) {
            preferredLanguages.push(streamLang);
            languageOrder.add(streamLang);
        }

        streams.push({
            index: i,
            stream: ffstream,
            type: (ffstream.codec_type || '').trim().toLowerCase(),
            title: streamTitle,
            lang: streamLang,
            channels: ffstream?.channels || 0,
            forced: ffstream?.disposition?.forced === 1,
            bitrate: Number (ffstream?.bit_rate || 0),
            default: ffstream?.disposition?.default === 1,

            // simple classification (no helper functions)
            commentary: streamTitle.includes('commentary') ||
                        streamTitle.includes('director') ||
                        streamTitle.includes('producer') ||
                        streamTitle.includes('cast') ||
                        streamTitle.includes('crew'),

            descriptive: streamTitle.includes('description') ||
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

    //Sort the streams
    streams.sort((a, b) => {
        //First by stream type
        const aOrder = streamOrder[a.type] ?? 99;
        const bOrder = streamOrder[b.type] ?? 99;

        if (aOrder !== bOrder) {
            return aOrder - bOrder;
        }

        //Next comes video (but mjpeg goes last)
        if (a.type === 'video') {
            if (a.mjpeg !== b.mjpeg) {
                return a.mjpeg ? 1 : -1;
            }
        //audio
        } else if(a.type === 'audio') {
            //override
            if(defaultAudioFirst && (a.default !== b.default))
                return a.default ? -1 : 1;

            // language priority
            const aLang = preferredLanguages.indexOf(a.lang);
            const bLang = preferredLanguages.indexOf(b.lang);

            const aRank = aLang === -1 ? 999 : aLang;
            const bRank = bLang === -1 ? 999 : bLang;
            if (aRank !== bRank) return aRank - bRank;

            const aRole = a.commentary ? 1 : (a.descriptive ? 2 : 0);
            const bRole = b.commentary ? 1 : (b.descriptive ? 2 : 0);
            if (aRole !== bRole) return aRole - bRole;

            // channel ordering
            if (a.channels !== b.channels) {
                return (inputs.channel_order === 'descending' ? b.channels - a.channels : a.channels - b.channels);
            }

            if (a.bitrate !== b.bitrate) {
                return (inputs.bitrate_order === 'descending' ? b.bitrate - a.bitrate : a.bitrate - b.bitrate);
            }
        //subtitles
        } else if (a.type === 'subtitle') {
            //override
            if(sdhFirst && (a.sdh !== b.sdh))
                return a.sdh ? -1 : 1;

            // forced first
            if (a.forced !== b.forced)
                return a.forced ? -1 : 1;

            const aLang = preferredLanguages.indexOf(a.lang);
            const bLang = preferredLanguages.indexOf(b.lang);

            const aRank = aLang === -1 ? 999 : aLang;
            const bRank = bLang === -1 ? 999 : bLang;

            if (aRank !== bRank) return aRank - bRank;

            const aRole = a.sdh ? 1 : (a.signs ? 2 : 0);
            const bRole = b.sdh ? 1 : (b.signs ? 2 : 0);
            if (aRole !== bRole) return aRole - bRole;
        }

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
        response.infoLog += '☑ Streams already in desired order.\n';
        return response;
    }

    response.processFile = true;
    response.reQueueAfter = true;
    response.preset = `,${ffmpegMap} -c copy -max_muxing_queue_size 9999`;
    response.infoLog += '☒ Reordered streams (smart ordering applied)\n';

    return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
