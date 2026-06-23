/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove Data & Image Formats then remux file if necessary. Limit language tracks to those specified. Optionally attempt to recover damaged files.',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Identify and remove any data, image (MJPEG,BMP,PNG,GIF), and remux into mkv or mp4.\n\n
                  Removes any subtitle or audio tracks that are not in the specified language(s) and optionally removes any tracks that contain SDH or commentary in their description.\n\n
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n`,
    Version: '1.2',
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
            name: 'recovery_discard_frame',
            type: 'boolean',
            defaultValue: false,
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
            defaultValue: false,
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
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +igndts option to ignore DTS (Decode Timestamps).
                 \\nShould generally be false but can fix errors like "Non-monotonous DTS in output stream" or "DTS out of order".
                 \\nCombining this with genpts will tell ffmpeg to completely rebuild the timestamps for the file.`,
        },
        {
            name: 'audio_language',
            type: 'string',
            defaultValue: 'eng',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tag/s here for the audio tracks you'd like to keep. Untagged or blank language tracks will not be removed.
                \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nExample:\\n
                    eng
                \\nExample:\\n
                    eng,jpn`,
        },
        {
            name: 'sub_language',
            type: 'string',
            defaultValue: 'eng',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tag/s here for the subtitle tracks you'd like to keep. Untagged or blank language subtitle tracks will not be removed.
                \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nExample:\\n
                    eng
                \\nExample:\\n
                    eng,jpn`,
        },
        {
            name: 'del_commentary',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: [
                    'false',
                    'true',
                ],
            },
            tooltip: `Specify if audio/subtitle tracks that contain commentary in their description should be removed.
                \\nExample:\\n
                true

                \\nExample:\\n
                false`,
        },
        {
            name: 'del_sdh',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: [
                    'true',
                    'false',
                ],
            },
            tooltip: `Specify if audio/subtitle tracks that contain SDH (Subtitles for the Deaf and Hard of hearing) in their description should be removed.
                    \\nExample:\\n
                    true

                    \\nExample:\\n
                    false`,
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

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== 'video') {
        response.infoLog += '☒File is not a video. \n';
        response.processFile = false;
        return response;
    }

    // Check if inputs.container has been configured. If it hasn't then exit plugin. Shouldn't happen. Doesn't hurt to check.
    if (!inputs.container || inputs.container === '') {
        response.infoLog += '☒Container has not been configured, please configure required options. \n';
        response.processFile = false;
        return response;
    }
    const srcContainer = file.container.toLowerCase().trim();
    const dstContainer = inputs.container.toLowerCase().trim();
    response.container = `.${dstContainer}`;

    // Check if inputs.sub_language has been configured
    if (!inputs.sub_language || inputs.sub_language.trim() === '') {
        response.infoLog += '☒Subtitle language has not been configured. Leaving it blank would remove all subtitles. If intended put an invalid language code or a comma rather than leaving blank. \n';
        response.processFile = false;
        return response;
    }
    const subLanguage = inputs.sub_language.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');

    // Check if inputs.audio_language has been configured
    if (!inputs.audio_language || inputs.audio_language.trim() === '') {
        response.infoLog += '☒Audio language has not been configured. Leaving it blank would remove all audio tracks. If intended put an invalid language code or a comma rather than leaving blank. \n';
        response.processFile = false;
        return response;
    }
    const audioLanguage = inputs.audio_language.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');

    //A few more that should come through as boolean
    const delSdh = String(inputs.del_sdh) === 'true';
    const delCommentary = String(inputs.del_commentary) === 'true';
    const recoveryDiscard = String(inputs.recovery_discard_frame) === 'true';    
    const recoveryGenpts = String(inputs.recovery_genpts) === 'true';
    const recoveryIgndts = String(inputs.recovery_igndts) === 'true';    

    // Set up required variables.
    let extraArguments = '';
    let fflags = '';
    let workDone = '';
    let convert = false;
    let totalDropped = 0;
    let subtitleStreamIndex = -1;

    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
        try {
            const ffstream = file.ffProbeData.streams[i];
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const ffstreamType = (ffstream.codec_type || '').toLowerCase();

            if(ffstreamType === 'subtitle') {
                //Start with zero based index for subtitle streams. This is only used when converting subtitle formats.
                subtitleStreamIndex++;

                //First remove any subtitles that would be removed due to format as in that case language doesn't matter
                if(ffstreamCodec === 'eia_608') {
                    workDone += `${i}s,`
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    totalDropped++;
                    continue;
                }

                if ((dstContainer === 'mp4') && ['hdmv_pgs_subtitle', 'dvd_subtitle', 'xsub'].includes(ffstreamCodec)) {
                    workDone += `${i}s,`
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    totalDropped++;
                    continue;
                }

                //Next remove any subtitles that would be removed due to language
                if(ffstream.tags && ffstream.tags.language && (ffstream.tags.language.trim() !== '')) {
                    let delSub = false;
                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(!subLanguage.includes(ffstream.tags.language.trim().toLowerCase())) {
                        workDone += `${i}s(lang),`
                        delSub = true;
                    } else if ((delSdh === true) && ffstream.tags.title && ffstream.tags.title.toLowerCase().includes('sdh')) {
                        workDone += `${i}s(sdh),`
                        delSub = true;
                    } else if ((delCommentary === true) && ffstream.tags.title && ffstream.tags.title.toLowerCase().includes('commentary')) {
                        workDone += `${i}s(com),`
                        delSub = true;
                    }

                    if(delSub === true) {
                        extraArguments += ` -map -0:${i}`;
                        convert = true;
                        totalDropped++;
                        continue;
                    }
                }

                //Finally convert subtitles if the current subtitle stream is being kept but is in a format that is not supported by the destination container.
                if((dstContainer === 'mkv') && (ffstreamCodec === 'mov_text')) {
                    workDone += `${i}s->srt,`
                    extraArguments += ` -c:s:${subtitleStreamIndex} subrip`;
                    convert = true;
                    continue;
                }

                if((dstContainer === 'mp4') && ['subrip', 'srt', 'ass', 'ssa', 'webvtt'].includes(ffstreamCodec)) {
                    workDone += `${i}s->mov_text,`
                    extraArguments += ` -c:s:${subtitleStreamIndex} mov_text`;
                    convert = true;
                    continue;
                }
            } else if(ffstreamType === 'audio') {
                //Next remove any audio tracks that would be removed due to language
                if(ffstream.tags && ffstream.tags.language && (ffstream.tags.language.trim() !== '')) {
                    let delAudio = false;
                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(!audioLanguage.includes(ffstream.tags.language.trim().toLowerCase())) {
                        workDone += `${i}a(lang),`
                        delAudio = true;
                    } else if ((delSdh === true) && ffstream.tags.title && ffstream.tags.title.toLowerCase().includes('sdh')) {
                        workDone += `${i}a(sdh),`
                        delAudio = true;
                    } else if ((delCommentary === true) && ffstream.tags.title && ffstream.tags.title.toLowerCase().includes('commentary')) {
                        workDone += `${i}a(com),`
                        delAudio = true;
                    }

                    if(delAudio === true) {
                        extraArguments += ` -map -0:${i}`;
                        convert = true;
                        totalDropped++;
                        continue;
                    }
                }
            }

            if (['mjpeg', 'png', 'gif', 'bmp'].includes(ffstreamCodec)) {
                workDone += `${i}v,`
                extraArguments += ` -map -0:${i}`;
                convert = true;
                totalDropped++;
                continue;
            }

            if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
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
        workDone = `has streams to remove or convert: (${workDone.slice(0, -1)})`
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
    } else if (recoveryGenpts === true) {
        fflags += '+genpts';
    }
    if(recoveryDiscard === true) {
        fflags += '+discardcorrupt';
    }
    if(recoveryIgndts === true) {
        fflags += '+igndts';
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
        response.infoLog += `☑File is already ${dstContainer} and contains no streams requiring removal or conversion.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
