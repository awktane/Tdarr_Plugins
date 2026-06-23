/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove Data & Image Formats then remux file',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Identify and remove any data, image (MJPEG,BMP,PNG,GIF), and remux into mkv or mp4.\n\n
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n`,
    Version: '1.069420710',
    Tags: 'pre-processing,ffmpeg,video only',
    Inputs: [
        {
            name: 'container',
            type: 'string',
            defaultValue: 'mkv',
            inputUI: {
                type: 'dropdown',
                options: ['mkv', 'mp4'],
            },
            tooltip: `Specify output container of file
                \\nAny streams that are not supported by the output container will be removed.
               \\nmkv will also remove eia_608.
               \\nmp4 will also remove eia_608 and hdmv_pgs_subtitle. Genpts may be required to fix timestamps.`,
        },
        {
            name: 'recovery_discard',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +discardcorrupt options to drop any corrupt frames from the file.
                 \\nShould generally be false as it may cause a small loss of video/audio but may allow a damaged file to be processed.
                 \\nMay cause problems with timestamps which may require +genpts and/or +igndts to fix.`,
        },
        {
            name: 'recovery_genpts',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +genpts option to generate missing PTS (Presentation Timestamps).
                 \\nShould generally be false but can fix errors such as "first pts value must set", "Can't write packet with unknown timestamp", or "Timestamps are unset in a packet for stream".
                 \\nCombining this with igndts will tell ffmpeg to completely rebuild the timestamps for the file.
                 \\nNote this is forced to true for ts, avi, mpg, and mpeg files as they often have timestamp issues.`,
        },
        {
            name: 'recovery_igndts',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +igndts option to ignore DTS (Decode Timestamps).
                 \\nShould generally be false but can fix errors like "Non-monotonous DTS in output stream" or "DTS out of order".
                 \\nCombining this with genpts will tell ffmpeg to completely rebuild the timestamps for the file.`,
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
        reQueueAfter: false,
        infoLog: '',
    };

    // Check if inputs.container has been configured. If it hasn't then exit plugin. Shouldn't happen. Doesn't hurt to check.
    if (!inputs.container || inputs.container === '') {
        response.infoLog += '☒Container has not been configured, please configure required options. \n';
        response.processFile = false;
        return response;
    }

    const srcContainer = file.container.toLowerCase().trim();
    const dstContainer = inputs.container.toLowerCase().trim();
    response.container = `.${dstContainer}`;

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video. \n';
        response.processFile = false;
        return response;
    }

    // Set up required variables.
    let extraArguments = '';
    let fflags = '';
    let workDone = '';
    let convert = false;
    let totalDropped = 0;
    let subtitleStreamIndex = 0;

    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
        try {
            const ffstream = file.ffProbeData.streams[i];
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const ffstreamType = (ffstream.codec_type || '').toLowerCase();

            if(ffstreamType === 'subtitle') {
                if((dstContainer === 'mkv') && (ffstreamCodec === 'mov_text')) {
                    workDone += `${i}s->srt,`
                    extraArguments += ` -c:s:${subtitleStreamIndex} subrip`;
                    convert = true;
                    subtitleStreamIndex++;
                    continue;
                }

                if((dstContainer === 'mp4') && (ffstreamCodec === 'subrip')) {
                    workDone += `${i}s->mov_text,`
                    extraArguments += ` -c:s:${subtitleStreamIndex} mov_text`;
                    convert = true;
                    subtitleStreamIndex++;
                    continue;
                }

                if(ffstreamCodec === 'eia_608') {
                    workDone += `${i}s,`
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    totalDropped++;
                    subtitleStreamIndex++;
                    continue;
                }

                if ((dstContainer === 'mp4') && (ffstreamCodec === 'hdmv_pgs_subtitle')) {
                    workDone += `${i}s,`
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    totalDropped++;
                    subtitleStreamIndex++;
                    continue;
                }

                subtitleStreamIndex++;
                continue;
            }

            if (['mjpeg', 'png', 'gif', 'bmp'].includes(ffstreamCodec)) {
                workDone += `${i}v,`
                extraArguments += ` -map -0:${i}`;
                convert = true;
                totalDropped++;
                continue;
            }

            if ((ffstreamCodec === 'data') || (ffstreamType === 'data')) {
                workDone += `${i}d,`
                extraArguments += ` -map -0:${i}`;
                convert = true;
                totalDropped++;
                continue;
            }
        } catch (err) {
            // Error
        }
    }

    if (workDone !== '') {
        workDone = `has unsupported streams: (${workDone.slice(0, -1)})`
    }

    if(totalDropped >= file.ffProbeData.streams.length) {
        response.infoLog += `☒Work ${workDone} and removing them would leave the file empty. Check to make sure file contains valid streams. \n`;
        response.processFile = false;
        return response;
    }

    if (srcContainer !== dstContainer) {
        if (workDone !== '') {
            workDone += ` and needs remuxing (${srcContainer}->${dstContainer})`;
        } else {
            workDone += `needs remuxing (${srcContainer}->${dstContainer})`;
        }
        convert = true;
    }

    // Include recovery flags if requested or if the source container is known to have timestamp issues.
    if (['ts', 'avi', 'mpg', 'mpeg'].includes(srcContainer)) {
        fflags += '+genpts';
        extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
    } else if (inputs.recovery_genpts === true) {
        fflags += '+genpts';
    }
    if(inputs.recovery_discard === true) {
        fflags += '+discardcorrupt';
    }
    if(inputs.recovery_igndts === true) {
        fflags = '+igndts';
    }
    if(fflags !== '') {
        fflags = `-fflags ${fflags}`;
    }

    // Convert file if convert variable is set to true.
    if (convert === true) {
        response.preset += `${fflags},-map 0${extraArguments} -c copy -max_muxing_queue_size 9999`;
        response.infoLog += `☒File ${workDone} \n`
        response.processFile = true;
    } else {
        response.infoLog += `☑File is already ${dstContainer} and contains no unsupported image or data streams.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
