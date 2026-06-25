/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `Identify and remove any data, image (MJPEG,BMP,PNG,GIF), and remux into mkv or mp4.\n\n
                  Removes any subtitle or audio tracks that are not in the specified language(s) and optionally removes any descriptive tracks with deaf/SDH in their description.\n\n
                  Option to modify metadata to remove metadata comments and titles with too many periods.\n\n
                  Automatically deduplicates titles reducing "Stereo / Stereo" down to "Stereo" or "English - English" down to "English".\n\n
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n`,
    Version: '1.7',
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
                 \\nShould generally be false as it may cause a small blips of video/audio but may allow a damaged file to be processed.
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
            tooltip: `Run with the ffmpeg +igndts option to ignore DTS (Decode Timestamps - has nothing to do with Dobly DTS).
                 \\nShould generally be false but can fix errors like "Non-monotonous DTS in output stream" or "DTS out of order".
                 \\nWhen enabled, genpts will be forced as messing with the timestream is a daunting exercise.`,
        },
        {
            name: 'audio_language',
            type: 'string',
            defaultValue: '',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tags here for the audio tracks you'd like to keep. If blank no tracks will be removed.
                \\nDoes not touch tracks with no language tag unless fill_language is specified. Ensure fill_langauge is in audio_language.
                \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US
                \\nExample: English, French, and Japanese (ISO-639-2 and ISO-639-1) (und = undefined, mul = multiple languages, zxx = no linguistic content, mis = missing language / no language code)\\n
                    en,eng,fr,fre,fra,und,mul,jpn,ja,zxx,mis
                \\nExample:\\n
                    en,eng,und`,
        },
        {
            name: 'sub_language',
            type: 'string',
            defaultValue: '',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tag/s here for the subtitle tracks you'd like to keep. If blank no tracks will be removed. Does not touch tracks with no language tag.
                \\nDoes not touch tracks with no language tag unless fill_language is specified. Ensure fill_langauge is in sub_language.
                \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US
                \\nExample: English and French (ISO-639-2 and ISO-639-1) (und = undefined, mul = multiple languages, mis = unusual language)\\n
                    en,eng,fr,fre,fra,und,mul,mis
                \\nExample:\\n
                    en,eng,und`,
        },
        {
            name: 'fill_language',
            type: 'string',
            defaultValue: '',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify language tag here for the subtitle/audio tracks that are missing a language tag. Blank language or und tracks will be filled with this language tag.
                \\nTakes precedence over audio_language/sub_language if track language is und for undecided
                \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nExample:\\n
                    eng
                \\nExample:\\n
                    jpn`,
        },
        {
            name: 'del_descriptive',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Should subtitle tracks that contain the words "SDH, deaf, hearing impaired, etc" in their description be removed?`,
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
                \\nSupported titles are 7.1, 5.1, 5.0, 4.0, 3.1, 3.0, 2.1, Stereo, and Mono.
                \\nThis can cause track title duplication on some players (Dolby Digital 5.1 (5.1)) but is useful for players that don't display the number of channels.`,
        },        
        {
            name: 'clean_metadata_comments',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Should comments be removed from all streams? These are not usually shown by players and often contain unnecessary information.
                \\nForced for mp4 as mp4 does not support title tags at the audio track or subtitle track level and will cause an error if present.`,
        },
        {
            name: 'clean_metadata_busytitle',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Should audio/subtitle metadata titles be removed if they contain more than 3 periods? This removes most invalid or unnecessary titles that are added by some sources.
                \\nExample: This.Title.Has.Too.Many.Periods would have been set to blank`,
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

    //The titles we will replace for tagChannelAudioTitle
    const tagChannelAudioTitleRegex =  /^(7\.1|6\.1|5\.1|5\.0|4\.0|3\.1|3\.0|2\.1|2\.0|stereo|mono)$/i;

    //A few more that should come through as boolean
    const recoveryDiscard = String(inputs.recovery_discard_frame) === 'true';
    const recoveryGenpts = String(inputs.recovery_genpts) === 'true';
    const recoveryIgndts = String(inputs.recovery_igndts) === 'true';
    const tagChannelAudioTitle = String(inputs.tag_channel_audio_title) === 'true';
    const metaCommentRemove = String(inputs.clean_metadata_comments) === 'true';
    const metaBusyTitleRemove = String(inputs.clean_metadata_busytitle) === 'true';

    const fillLanguage = (inputs.fill_language ? inputs.fill_language.toLowerCase().trim() : '');
    const subLanguage = inputs.sub_language.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const audioLanguage = inputs.audio_language.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');

    //Harder to cleanup than it is to fix now
    if(fillLanguage && fillLanguage.length !== 3)
    {
        response.infoLog += `☒fillLanguage is not a 3 character country string. It should follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes\n`;
        response.processFile = false;
        return response;
    }

    //If fillLanguage is set it should be a track that's kept
    if(fillLanguage && ((subLanguage.length > 0 && !subLanguage.includes(fillLanguage)) || (audioLanguage.length > 0 && !audioLanguage.includes(fillLanguage))))
    {
        response.infoLog += `☒You have specified that blank tracks should be tagged as ${fillLanguage}. You have not included this language in sub_language and audio_language which indirectly will remove untagged streams.\n`;
        response.processFile = false;
        return response;
    }

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');

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
            const ffstream = file.ffProbeData?.streams[i];
            const ffmedia = file?.mediaInfo?.track?.find(t => Number(t.StreamOrder) === i);
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const ffstreamType = (ffstream.codec_type || '').toLowerCase();

            //Original stream title - prefer stream title but use metadata if available. When we set tags.title both are set.
            const streamTitle = (ffstream.tags?.title || ffmedia?.Title || '');
            const streamLang = (ffstream.tags?.language ?? (ffmedia?.Language ?? '')).trim().toLowerCase();

            //This will be added to the ffmpeg command if metadata needs to be changed. It will be built up as needed.
            let metadataCommand = '';
            let delStream = false;

            if(ffstreamType === 'subtitle') {
                //Start with zero based index for subtitle streams. This is only used when converting subtitle formats or changing metadata
                subtitleStreamIndex++;

                //First remove any subtitles that would be removed due to format as in that case language doesn't matter
                if((ffstreamCodec === 'eia_608') || (dstContainer === 'mp4' && ['hdmv_pgs_subtitle', 'dvd_subtitle', 'xsub'].includes(ffstreamCodec))) {
                    workDone += `☒Remove stream ${i} - unsupported (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                //Rescue any we can by filling in the language
                } else if (fillLanguage && (!streamLang || streamLang === 'und')) {
                    workDone += `☒Language blank on stream ${i} - setting subtitle language to "${fillLanguage}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "language=${fillLanguage}"`;
                //If the audio is a language that should be removed then remove it regardless of other settings.
                } else {
                    //Gather all of the places where we may find the descriptive words we're looking for for delDescriptive
                    const subtitleDescription = [ffstream.tags?.title,ffstream.tags?.description,ffstream.tags?.handler_name,ffmedia?.Title,ffmedia?.Description].filter(Boolean).join(' ').toLowerCase();

                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(subLanguage.length > 0 && !subLanguage.includes(streamLang) && !subLanguage.includes(streamLang.replace(/[-_.].*$/, ''))) {
                        workDone += `☒Remove stream ${i} - subtitle language (${streamLang})\n`;
                        delStream = true;
                    } else if ((delDescriptive === true) && (ffstream.disposition?.hearing_impaired === 1 || descriptiveKeywords.some(keyword => subtitleDescription.includes(keyword)))) {
                        workDone += `☒Remove stream ${i} - SDH (${subtitleDescription})\n`;
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
                if((metaBusyTitleRemove === true) && (newStreamTitle.split('.').length > 4)) {
                    newStreamTitle = '';
                }

                //If title is as an example Stereo / Stereo reduce it to just Stereo. Avoids an infinite plugin loop situation
                if(newStreamTitle) {
                    const titleParts = newStreamTitle.split(/\s*(?:\/|\||-|•)\s*/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);

                    if (titleParts.length > 1) {
                        const firstPart = titleParts[0].toLowerCase();
                        if(titleParts.every(tp => tp.toLowerCase() === firstPart)) {
                            workDone += `☒Title deduplication. Changing handler to SubtitleHandler to avoid metadata causing plugin loop.\n`;
                            metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name=SubtitleHandler"`;
                            newStreamTitle = titleParts[0];
                        }
                    }
                }

                //We trimmed the title above so if it contains newlines or spaces they'll be removed. Make sure title is set at both metadata and stream levels
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☒Change title of stream ${i} (subtitle) from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☒Change title of stream ${i} (subtitle) - Found "${(ffstream.tags?.title ?? '')}" and "${(ffmedia?.Title ?? '')}" change to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Remove comment from stream ${i} (subtitle) "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "comment="`;
                }
                
                if((dstContainer === 'mkv') && (ffstreamCodec === 'mov_text')) {
                    workDone += `☒Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} subtitle to srt\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} srt`;
                    convert = true;
                    continue;
                }

                if((dstContainer === 'mp4') && ['subrip', 'srt', 'ass', 'ssa', 'webvtt'].includes(ffstreamCodec)) {
                    workDone += `☒Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} subtitle to mov_text\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} mov_text`;
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

                //Rescue any we can by filling in the language
                if (fillLanguage && (!streamLang || streamLang === 'und')) {
                    workDone += `☒Language blank on audio stream ${i} - setting to "${fillLanguage}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "language=${fillLanguage}"`;
                //If the audio is a language that should be removed then remove it regardless of other settings.
                } else if(audioLanguage.length > 0 && !audioLanguage.includes(streamLang) && !audioLanguage.includes(streamLang.replace(/[-_.].*$/, ''))) {
                        workDone += `☒Remove stream ${i} - audio language (${streamLang})\n`;
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

                //If title is as an example Stereo / Stereo reduce it to just Stereo. Avoids an infinite plugin loop situation
                if(newStreamTitle) {
                    const titleParts = newStreamTitle.split(/\s*(?:\/|\||-|•)\s*/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);

                    if (titleParts.length > 1) {
                        const firstPart = titleParts[0].toLowerCase();
                        if(titleParts.every(tp => tp.toLowerCase() === firstPart)) {
                            workDone += `☒Title deduplication. Changing handler to SoundHandler to avoid metadata causing plugin loop.\n`;
                            metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name=SoundHandler"`;
                            newStreamTitle = titleParts[0];
                        }
                    }
                }

                //Get the channel count string ready. Some assumptions are made but should handle most correctly.
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

                //We trimmed the title above so if it contains newlines or spaces they'll be removed. Ensure they are escaped before passing it to the command line.
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☒Change title of stream ${i} (audio) from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☒Change title of stream ${i} (audio) - Found "${(ffstream.tags?.title ?? '')}" and "${(ffmedia?.Title ?? '')}" change to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${newStreamTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Remove comment from audio stream ${i} (audio) "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
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
                    workDone += `☒Remove stream ${i} - image format (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    videoDropped++;
                    continue;
                }            

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Remove comment from stream ${i} (video) "${ffstream.tags?.comment ?? ffmedia?.Comment ?? ''}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "comment="`;
                }

                if((metaBusyTitleRemove === true) && ((ffstream.tags?.title ?? '').trim().split('.').length > 4 || (ffmedia?.Title ?? '').trim().split('.').length > 4)) {
                    workDone += `☒Remove title from stream ${i} (video) "${(ffstream.tags?.title ?? '').trim()}" and "${(ffmedia?.Title ?? '').trim()}"\n`;
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
                workDone += `☒Remove stream ${i} - data stream (${ffstreamType}-${ffstreamCodec})\n`;
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

    if(videoStreamIndex > -1 && videoDropped >= (videoStreamIndex + 1)) {
        response.infoLog += `☒Removing specified streams would leave the file without any video streams. Check to make sure file contains valid streams. \n`;
        response.processFile = false;
        return response;
    }

    if(audioStreamIndex > -1 && audioDropped >= (audioStreamIndex + 1)) {
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
    if((metaCommentRemove === true) && file.ffProbeData.format?.tags?.comment) {
        workDone += `☒Remove comment from file "${file.ffProbeData.format?.tags?.comment}"\n`;
        extraArguments += ` -metadata "comment="`;
        convert = true;
    }

    if((metaBusyTitleRemove === true) && (file.ffProbeData.format?.tags?.title ?? '').trim().split('.').length > 4) {
        workDone += `☒Remove title from file "${(file.ffProbeData.format?.tags?.title ?? '').trim()}"\n`;
        extraArguments += ` -metadata "title="`;
        convert = true;
    }

    //Check if remuxing is required due to container change
    if (srcContainer !== dstContainer) {
        workDone += `☒Remux file (${srcContainer}->${dstContainer})\n`;
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
        response.preset += `${fflags},-map 0 -c copy${extraArguments} -max_muxing_queue_size 9999${networkDataOpt}`;
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
