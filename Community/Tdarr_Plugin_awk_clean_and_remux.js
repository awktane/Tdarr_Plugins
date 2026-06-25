/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Identify and remove any data, image (MJPEG,BMP,PNG,GIF), and remux into mkv or mp4.\n\n
                  Removes any subtitle or audio tracks that are not in the specified language(s) and optionally removes any tracks that contain SDH in their description.\n\n
                  Option to modify metadata to remove metadata comments and titles.
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n`,
    Version: '1.5',
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
            tooltip: `Run with the ffmpeg +igndts option to ignore DTS (Decode Timestamps has nothing to do with Dobly DTS).
                 \\nShould generally be false but can fix errors like "Non-monotonous DTS in output stream" or "DTS out of order".
                 \\nWhen enabled, genpts will be forced as messing with the timestream is a daunting exercise.`,
        },
        {
            name: 'audio_language',
            type: 'string',
            defaultValue: 'eng,en,und,mul,zxx,mis',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tags here for the audio tracks you'd like to keep. Untagged or blank language tracks will not be removed.
                \\nExample: (und = undefined, mul = multiple languages, zxx = no linguistic content, mis = missing language / no language code)\\n
                    eng,en,und,mul,zxx,mis
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
                \\nExample: (und = undefined, mul = multiple languages, mis = unusual language)\\n
                    eng,en,und,mul,mis
                \\nExample:\\n
                    eng,jpn`,
        },
        {
            name: 'fill_language',
            type: 'string',
            defaultValue: 'eng',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tag here for the subtitle/audio tracks that are missing a language tag. Blank language or und tracks will be filled with this language tag.
                \\nTakes precedence over audio_language/sub_language if track language is und for undecided
                \\nShould follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nExample:\\n
                    eng
                \\nExample:\\n
                    jpn`,
        },
        {
            name: 'del_descriptive',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false'],
            },
            tooltip: `Should subtitle tracks that contain the word "SDH" in their description be removed? (Subtitles for the Deaf and Hard of hearing)`,
        },
        {
            name: 'tag_channel_audio_title',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true','false'],
            },
            tooltip: `Specify if we should add a title based on the number of audio channels to files missing or equivalent titles
                \\nSupported titles are 7.1, 5.1, 5.0, 4.0, 3.0, 2.1, Stereo, and Mono.
                \\nThis can cause track title duplication on some players (Dolby Digital 5.1 (5.1)) but is useful for players that don't display the number of channels.`,
        },        
        {
            name: 'clean_metadata_comments',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true','false'],
            },
            tooltip: `Should comments be removed from all streams? These are not usually shown by players and often contain unnecessary information.
                \\nForced for mp4 as mp4 does not support title tags at the audio track or subtitle track level and will cause an error if present.`,
        },
        {
            name: 'clean_metadata_busytitle',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true','false'],
            },
            tooltip: `Should audio/subtitle metadata titles be removed if they contain more than 3 periods? This removes most invalid or unnecessary titles that are added by some sources.
                \\nExample: This.Title.Has.Too.Many.Periods would have been set to blank`,
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

    //The titles we will replace for tagChannelAudioTitle
    const tagChannelAudioTitleRegex =  /^(7\.1|6\.1|5\.1|5\.0|4\.0|3\.0|2\.1|2\.0|stereo|mono)$/i;

    //A few more that should come through as boolean
    const recoveryDiscard = String(inputs.recovery_discard_frame) === 'true';
    const recoveryGenpts = String(inputs.recovery_genpts) === 'true';
    const recoveryIgndts = String(inputs.recovery_igndts) === 'true';
    const tagChannelAudioTitle = String(inputs.tag_channel_audio_title) === 'true';
    const metaCommentRemove = String(inputs.clean_metadata_comments) === 'true';
    const metaBusyTitleRemove = String(inputs.clean_metadata_busytitle) === 'true';
    const fillLanguage = (inputs.fill_language ? inputs.fill_language.toLowerCase().trim() : '');

    const delDescriptive = String(inputs.del_descriptive) === 'true';
    const descriptiveKeywords = [
        'sdh',
        'hearing impaired',
        'closed caption',
        'closed captions',
        'deaf',
    ];

    // Set up required variables.
    let extraArguments = '';
    let fflags = '';
    let workDone = '';
    let convert = false;
    let subtitleDropped = 0;
    let audioDropped = 0;
    let videoDropped = 0;
    let otherDropped = 0;
    let subtitleStreamIndex = -1;
    let audioStreamIndex = -1;
    let videoStreamIndex = -1;

    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
        try {
            const ffstream = file.ffProbeData.streams[i];
            const ffmedia = file?.mediaInfo?.track?.find(t => Number(t.StreamOrder) === i);
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const ffstreamType = (ffstream.codec_type || '').toLowerCase();

            //Original stream title - prefer stream title but use metadata if available. When we set tags.title both are set.
            const streamTitle = (ffstream.tags?.title || ffmedia?.Title || '');
            const streamLang = (ffstream.tags?.language ?? (ffmedia?.Language ?? '')).trim().toLowerCase().slice(0,3);

            //This will be added to the ffmpeg command if metadata needs to be changed. It will be built up as needed.
            let metadataCommand = '';
            let delStream = false;

            if(ffstreamType === 'subtitle') {
                //Start with zero based index for subtitle streams. This is only used when converting subtitle formats or changing metadata
                subtitleStreamIndex++;

                //First remove any subtitles that would be removed due to format as in that case language doesn't matter
                if((ffstreamCodec === 'eia_608') || (dstContainer === 'mp4' && ['hdmv_pgs_subtitle', 'dvd_subtitle', 'xsub'].includes(ffstreamCodec)) || (dstContainer === 'mkv' && ffstreamCodec === 'mov_text')) {
                    workDone += `☒Removing stream ${i} (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                } else if (fillLanguage && (!streamLang || streamLang === 'und')) {
                    workDone += `☒Language blank on subtitle stream ${i} - setting to ${fillLanguage}\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "language=${fillLanguage}"`;
                //If the audio is a language that should be removed then remove it regardless of other settings.
                } else {
                    //Gather all of the places where we may find the descriptive words we're looking for for delDescriptive
                    const subtitleDescription = [ffstream.tags?.title,ffstream.tags?.description,ffstream.tags?.handler_name,ffmedia?.Title,ffmedia?.Description].filter(Boolean).join(' ').toLowerCase();

                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(!subLanguage.includes(streamLang)) {
                        workDone += `☒Removing subtitle stream ${i} (${streamLang})\n`;
                        delStream = true;
                    } else if ((delDescriptive === true) && (ffstream.disposition?.hearing_impaired === 1 || descriptiveKeywords.some(keyword => subtitleDescription.includes(keyword)))) {
                        workDone += `☒Removing SDH subtitle stream ${i} (${subtitleDescription})\n`;
                        delStream = true;
                    }
                }

                if(delStream === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    subtitleDropped++;
                    continue;
                }

                //Remove surrounding whitespace, single quotes and double quotes as there's no reason for them
                let newStreamTitle = (streamTitle || '').trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
                
                if((metaBusyTitleRemove === true) && newStreamTitle.split('.').length > 4) {
                    newStreamTitle = '';
                }

                //We trimmed the title above so if it contains newlines or spaces they'll be removed. Make sure title is set at both metadata and stream levels
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☒Changing title of stream ${i} from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☒Metadata title does not match stream title "${(ffstream.tags?.title ?? '')}" vs "${(ffmedia?.Title ?? '')}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Removing comment from subtitle stream ${i} "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "comment="`;
                }
                
                /* Stopped trying to convert as this almost always results in error 'Subtitle codec 94213 is not supported'
                if((dstContainer === 'mkv') && (ffstreamCodec === 'mov_text')) {
                    workDone += `☒Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} to srt\n`;
                    extraArguments += ` -c:s:${subtitleStreamIndex} srt`+metadataCommand;
                    convert = true;
                    continue;
                }
                */
                if((dstContainer === 'mp4') && ['subrip', 'srt', 'ass', 'ssa', 'webvtt'].includes(ffstreamCodec)) {
                    workDone += `☒Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} to mov_text\n`;
                    extraArguments += ` -c:s:${subtitleStreamIndex} mov_text`+metadataCommand;
                    convert = true;
                    continue;
                }

                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }
            } else if(ffstreamType === 'audio') {
                //Start with zero based index for audio streams. This is only used when changing metadata.
                audioStreamIndex++;

                //First remove any audio tracks that need to be removed
                if (fillLanguage && (!streamLang || streamLang === 'und')) {
                    workDone += `☒Language blank on audio stream ${i} - setting to ${fillLanguage}\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "language=${fillLanguage}"`;
                //If the audio is a language that should be removed then remove it regardless of other settings.
                } else if(!audioLanguage.includes(streamLang)) {
                        workDone += `☒Removing audio stream ${i} (${streamLang})\n`;
                        delStream = true;
                }

                if(delStream === true) {
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    audioDropped++;
                    continue;
                }

                //Remove surrounding whitespace, single quotes and double quotes as there's no reason for them
                let newStreamTitle = (streamTitle || '').trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
                
                if((metaBusyTitleRemove === true) && newStreamTitle.split('.').length > 4) {
                    newStreamTitle = '';
                }

                if(tagChannelAudioTitle === true && ffstream.channels && (!newStreamTitle || tagChannelAudioTitleRegex.test(newStreamTitle))) {
                    switch(ffstream.channels)
                    {
                        case 8: newStreamTitle = '7.1'; break;
                        case 7: newStreamTitle = '6.1'; break;
                        case 6: newStreamTitle = '5.1'; break;
                        case 5: newStreamTitle = '5.0'; break;
                        case 4:
                            if((ffstream?.channel_layout ?? '').toLowerCase().includes('lfe')) {
                                newStreamTitle = '3.1'; 
                            } else
                            {
                                newStreamTitle = '4.0'; 
                            }
                            break;
                        case 3:
                            if((ffstream?.channel_layout ?? '').toLowerCase().includes('lfe')) {
                                newStreamTitle = '2.1'; 
                            } else
                            {
                                newStreamTitle = '3.0'; 
                            }
                            break;
                        case 2: newStreamTitle = 'Stereo'; break;
                        case 1: newStreamTitle = 'Mono'; break;
                    }
                }

                //We trimmed the title above so if it contains newlines or spaces they'll be removed.
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☒Changing title of stream ${i} from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☒Metadata title does not match stream title "${(ffstream.tags?.title ?? '')}" vs "${(ffmedia?.Title ?? '')}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Removing comment from audio stream ${i} "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "comment="`;
                }
                    
                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }
            } else if(ffstreamType === 'video') {
                //Start with zero based index for video streams. This is only used when changing metadata.
                videoStreamIndex++;

                if (['mjpeg', 'png', 'gif', 'bmp'].includes(ffstreamCodec)) {
                    workDone += `☒Removing stream ${i} (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    videoDropped++;
                    continue;
                }            

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Removing comment from video stream ${i} "${ffstream.tags?.comment ?? ffmedia?.Comment ?? ''}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "comment="`;
                }

                if((metaBusyTitleRemove === true) && ((ffstream.tags?.title ?? '').trim().split('.').length > 4 || (ffmedia?.Title ?? '').trim().split('.').length > 4)) {
                    workDone += `☒Removing title from video stream ${i} "${(ffstream.tags?.title ?? '').trim()}" and "${(ffmedia?.Title ?? '').trim()}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "title="`;
                }
                
                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }                
            }

            //First remove the streams we're going to delete anyways
            if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
                workDone += `☒Removing stream ${i} (${ffstreamType}-${ffstreamCodec})\n`;
                extraArguments += ` -map -0:${i}`;
                convert = true;
                otherDropped++;
                continue;
            }

            //The only other type of stream currently supported by ffmpeg is attachment which we will leave untouched. It's generally used for fonts and cover art so the metadata may be useful. If it needs to be removed then it can be done with a separate plugin.
        } catch (err) {
            // Error
            response.infoLog += `☒Error processing stream ${i}: ${err}\n`;
            response.processFile = false;
            return response;
        }
    }

    if(videoDropped >= (videoStreamIndex + 1)) {
        response.infoLog += `☒Removing specified streams would leave the file without any video streams. Check to make sure file contains valid streams. \n`;
        response.processFile = false;
        return response;
    }

    if(audioDropped >= (audioStreamIndex + 1)) {
        response.infoLog += `☒Removing specified streams would leave the file without any audio streams. Check to make sure file contains valid streams. \n`;
        response.processFile = false;
        return response;
    }

    if((videoDropped + audioDropped + subtitleDropped + otherDropped) >= file.ffProbeData.streams.length) {
        response.infoLog += `☒Removing specified streams would leave the file empty. Check to make sure file contains valid streams. \n`;
        response.processFile = false;
        return response;
    }

    //Now the file level metadata can be cleaned up if needed.
    if((metaCommentRemove === true) && file.meta?.comment) {
        workDone += `☒Removing comment from file "${file.meta.comment}"\n`;
        extraArguments += ` -metadata "comment="`;
        convert = true;
    }

    if((metaBusyTitleRemove === true) && (file.meta?.title ?? '').trim().split('.').length > 4) {
        workDone += `☒Removing title file "${(file.meta?.title ?? '').trim()}"\n`;
        extraArguments += ` -metadata "title="`;
        convert = true;
    }

    //Check if remuxing is required due to container change
    if (srcContainer !== dstContainer) {
        workDone += `☒Remuxing file (${srcContainer}->${dstContainer})\n`;
        convert = true;
    }

    // Include recovery flags if requested or if the source container is known to have timestamp issues.
    if(recoveryIgndts === true) {
        //Igndts can cause very strange problems if genpts isn't also enabled
        fflags += '+igndts+genpts';
    }

    if (['ts', 'avi', 'mpg', 'mpeg'].includes(srcContainer)) {
        if(!recoveryIgndts) {
            fflags += '+genpts';
        }
        extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
    } else if (recoveryGenpts === true && !recoveryIgndts) {
        fflags += '+genpts';
    }
    if(recoveryDiscard === true) {
        fflags += '+discardcorrupt';
    }
    if(fflags !== '') {
        fflags = `-fflags ${fflags}`;
    }

    // Convert file if convert variable is set to true.
    if (convert === true) {
        response.preset += `${fflags},-map 0${extraArguments} -c copy -max_muxing_queue_size 9999`;
        response.infoLog += workDone;
        response.processFile = true;
    } else {
        response.infoLog += `☑File is already ${dstContainer} and contains no streams requiring removal or conversion.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
