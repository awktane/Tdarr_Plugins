/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin can cleans up the audio tracks. There are options to downmix and convert tracks based on channel count and language.\n\n
                  Ensure options are set directly as this can be destructive especially with incorrectly tagged audio tracks`,
    Version: '1.069420710',
    Tags: 'pre-processing,ffmpeg,audio_only,configurable',
    Inputs: [
        {
            name: 'downmix_to_six',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','replace','true'],
            },
            tooltip: `Specify if we should downmix tracks from 8 channel to 6 channel if available
                \\nIf false - no 6 channel is created from 8 channel
                \\nIf replace - a 6 channel ac3 track will replace the 8 channel track
                \\nIf true - a 6 channel ac3 track will be created from the 8 channel track and both tracks will be kept`,
        },
        {
            name: 'downmix_to_stereo',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','replace','true'],
            },
            tooltip: `Specify if we should downmix a 2 channel track from other higher channel tracks if available
                \\nIf false - no 2 channel is created
                \\nIf replace - 2 channel track replaces any and all higher channel tracks
                \\nIf true - a 2 channel track will be created from a higher channel track and both will be kept`,
        },        
        {
            name: 'downmix_single',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Take the highest quality channel that matches the first language we find in the list (if set) and only work with this one track. Ignore other languages and try to ignore commentary tracks, etc`,
        },        
        {
            name: 'downmix_secondary',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Should commentary, visual impaired tracks, etc be queued for downmixing? This would normally be false`,
        },
        {
            name: 'surround_codec',
            type: 'string',
            defaultValue: 'ac3',
            inputUI: {
                type: 'dropdown',
                options: ['ac3','aac'],
            },
            tooltip: `Specify codec for newly created surround tracks.`,
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
                \\nIf 6below - Streams with six or fewer channels will be transcoded to the corrected codec
                \\nIf 2below - Streams with six or fewer channels will be transcoded to the corrected codec
                \\nIf true   - All streams will be transcoded to the new codec`,
        },                
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
    const downmixLanguage = String(inputs.downmix_language).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const preserveTitle = String(inputs.preserve_title).trim();
    const forceCodec = String(inputs.force_codec).trim();
    const stereoCodec = String(inputs.stereo_codec).trim();
    const surroundCodec = String(inputs.surround_codec).trim();

    if(!['false','replace','true'].includes(downmixToSix)) {
        response.infoLog += `☒Somehow invalid downmixToSix option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['false','replace','true'].includes(downmixToTwo)) {
        response.infoLog += `☒Somehow invalid downmixToSix option provided. Check your settings!\n`;
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
    if(!['ac3','aac'].includes(stereoCodec)) {
        response.infoLog += `☒Somehow invalid stereoCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }
    if(!['ac3','aac'].includes(surroundCodec)) {
        response.infoLog += `☒Somehow invalid forceCodec option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }

    // Set up required variables.
    let extraArguments = '';
    let workDone = '';
    let convert = false;
    let audioStreamIndex = -1;

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
            title.includes('director') || 
            title.includes('producer') || 
            title.includes('cast') || 
            title.includes('crew') || 
            title.includes('description') || 
            title.includes('descriptive') || 
            title.includes('dvs') || 
            title.includes('narration') || 
            title.includes('signs') || 
            title.includes('songs'));
    };
    //Add secondary track flag and the cleaned language to each track
    audioStreams = audioStreams.map(item => ({...item, isTdarrSecondaryTrack: isSecondaryTrack(item), isTdarrCleanLang: String((item.tags?.language || 'und').trim().toLowerCase().replace(/[-_.].*$/, ''))}));

    //Remove tracks considered secondary if we shouldn't pay attention to them
    if(downmixSecondary !== true)
        audioStreams = audioStreams.filter(stream => !stream.isTdarrSecondaryTrack);

    //Remove tracks not in a language we're paying attention to
    if(downmixLanguage.length !== 0)
        audioStreams = audioStreams.filter(stream => downmixLanguage.includes(stream.isTdarrCleanLang));

    //Remove any tracks that we won't use based on channel count, etc. This may leave some extra (ex: 5.1 & 4.0 when we're only looking to downmix a 2 channel) but is good for a first pass
    const channelMatch = (stream) => {
        //8 channel
        if(stream.channels > 6 && (downmixToSix === 'false') && (downmixToTwo === 'false') && (forceCodec === 'true' && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        //3-7 channel
        else if(stream.channels > 2 && (downmixToTwo === 'false') && (['true','6below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
            return false;
        if((stream.channels <= 2) && ['true','6below','2below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === stereoCodec))
            return false;
        return true;
    }
    audioStreams = audioStreams.filter(stream => channelMatch(stream));

    //Let's now order by codec and quality
    const codecInfo = {
        pcm:      { score: 100, max: 9000000 },
        flac:     { score: 99,  max: 5000000 },
        truehd:   { score: 98,  max: 8000000 },
        alac:     { score: 97,  max: 5000000 },
        mlp:      { score: 96,  max: 6000000 },
        wavpack:  { score: 96, max: 6000000 },
        dts:      { score: 90,  max: 6000000 },
        eac3:     { score: 80,  max: 1024000 },
        opus:     { score: 79,  max: 512000 },
        aac:      { score: 78,  max: 640000 },
        vorbis:   { score: 77,  max: 500000 },
        ac3:      { score: 75,  max: 640000 },
        mp2:      { score: 70,  max: 384000 },
        mp3:      { score: 65,  max: 320000 },
    };

    const unknownCodecs = new Set();
    function audioQuality(stream) {
        let codec = (stream?.codec_name ?? '').toLowerCase().trim();
        const bitrate = Number(stream.bit_rate || 0);

        if(codec.startsWith('pcm_'))
            codec = 'pcm';

        if (!(codec in codecInfo) && !unknownCodecs.has(codec)) {
            unknownCodecs.add(codec);
            response.infoLog += `☒ Unknown audio codec "${codec}" using default quality weighting.\n`;
        }

        //bit of an exception for DTS Core and DTS-HD MA
        if (codec === 'dts') {
            const longName = (stream.codec_long_name || '').toLowerCase().trim();

            if (longName.includes('master'))
                return 98 + bitrate / 6000000;

            if (longName.includes('high resolution'))
                return 94 + bitrate / 3000000;
        }

        //Pull the score
        const info = codecInfo[codec] || { score: 50, max: 2000000 };
        return info.score + bitrate / info.max;
    }
    
    audioStreams.sort((a, b) => {
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
        if (a.channels !== b.channels) {
            return b.channels - a.channels;
        }

        const aQuality = audioQuality(a);
        const bQuality = audioQuality(b);
        if(aQuality !== bQuality) return bQuality - aQuality;

        return a.index - b.index;
    });

    //Now remove any tracks we won't need for transcoding

    if (audioStreams.length === 0) {
        response.infoLog += '☑ No primary or configured language audio tracks found to manipulate.\n';
        return response;
    }

    for (let i = 0; i < audioStreams.length; i++) {
        try {
                audioStreamIndex++;
                const ffstream = audioStreams[i];
                const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
                const streamTitle = (ffstream.tags?.title  || '');
                const streamLang = (ffstream.tags?.language ?? '').trim().toLowerCase();


            

            //The only other type of stream currently supported by ffmpeg is attachment which we will leave untouched. It's generally used for fonts and cover art so the metadata may be useful. If it needs to be removed then it can be done with a separate plugin.
        } catch (err) {
            // Error
            response.infoLog += `☒Error processing stream ${i}: ${err}\n`;
            response.processFile = false;
            return response;
        }
    }


    // Convert file if convert variable is set to true.
    if (convert === true) {
        response.preset += `,-map 0 -c:v copy -c:s copy${extraArguments} -max_muxing_queue_size 9999${networkDataOpt}`;
        response.infoLog += workDone;
        response.processFile = true;
    } else {
        response.infoLog += `☑Audio already has the correct formats available.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
