/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Identify and remove any data, image (MJPEG,BMP,PNG,GIF), and remux into mkv or mp4.\n\n
                  Removes any subtitle or audio tracks that are not in the specified language(s) and optionally removes with deaf/SDH in their description.\n\n
                  Option to modify metadata to remove metadata comments and titles with too many periods.\n\n
                  Automatically deduplicates titles reducing "Stereo / Stereo" down to "Stereo" or "English - English" down to "English".\n\n
                  Removes unsupported image based subtitles during remux. Converts mov_text and webvtt to srt when remuxing to mkv for maximum player compatibility.\n\n
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n
                  Non-image attachment streams (e.g. embedded fonts for ASS/SSA subtitles) are intentionally left untouched.\n\n`,
    Version: '1.10.2',
    Tags: 'pre-processing,ffmpeg,configurable',
    Inputs: [
        {
            name: 'container',
            type: 'string',
            defaultValue: 'mkv',
            inputUI: {
                type: 'dropdown',
                options: ['mkv', 'mp4'],
            },
            tooltip: `Specify output container of file. Any streams that are not supported by the output container will be removed.
                \\n=====
                \\nActions
                \\n=====
                \\nmkv will also remove eia_608 and convert mov_text and webvtt subtitles to srt.
                \\nmp4 will also remove eia_608, hdmv_pgs_subtitle, dvd_subtitle, and xsub. Genpts may be required to fix timestamps.`,
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
                 \\nShould generally be false as it may cause a small blips of video/audio if there is damage but may still allow a damaged file to be processed.
                 \\nMay also cause problems with timestamps which may require +genpts and/or +igndts to fix.`,
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
            tooltip: `Run with the ffmpeg +igndts option to ignore DTS (Decode Time Stamps - has nothing to do with Dolby DTS).
                 \\nShould generally be false but can fix errors like "Non-monotonous DTS in output stream" or "DTS out of order".
                 \\nWhen enabled genpts will be automatically enabled even if false is specified as messing with the timestream is a daunting exercise.`,
        },
        {
            name: 'audio_language',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Specify language tags here for the audio tracks you'd like to keep. If blank no tracks will be removed.
                \\nStreams with no language tag are treated as though they had fill_language as their language or "und" if fill_language isn't set
                \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US
                \\nExample: 
                    en,eng,fr,fre,fra,und,mul,jpn,ja,zxx,mis
                    \\nEnglish, French, and Japanese (ISO-639-2 and ISO-639-1) (und = undefined, mul = multiple languages, zxx = no linguistic content, mis = missing language / no language code)
                \\nExample:\\n
                    en,eng,und`,
        },
        {
            name: 'sub_language',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Specify language tag/s here for the subtitle tracks you'd like to keep. If blank no tracks will be removed. Does not touch tracks with no language tag.
                \\nStreams with no language tag are treated as though they had fill_language as their language or "und" if fill_language isn't set
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
            inputUI: { type: 'text' },
            tooltip: `Specify language tag here for the subtitle/audio tracks that are missing a language tag. Blank language or und tracks will be filled with this language tag.
                \\nTakes precedence over audio_language/sub_language if track language is und for undecided
                \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nExample:\\n
                    eng
                \\nExample:\\n
                    jpn`,
        },
        {
            name: 'del_deaf',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Should subtitle tracks that contain the words "SDH, deaf, hearing impaired, etc" in their description be deleted?`,
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
            tooltip: `Should comments be removed from all streams? These are not usually shown by players and often contain unnecessary information.`,
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
                \\nNote this also checks the handler_name for the same thing.
                \\nExample:\\n
                This.Title.Has.Too.Many.Periods would have title set to blank`,
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

    const srcContainer = file.container.toLowerCase().trim();
    const dstContainer = inputs.container.toLowerCase().trim();
    response.container = `.${dstContainer}`;

    //The titles we will replace for tagChannelAudioTitle - include 2.0 to allow us to overwrite that with stereo
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
        response.infoLog += `☒fillLanguage is not a 3 character ISO-639-2 language code. It should follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes\n`;
        response.processFile = false;
        return response;
    }

    //If fillLanguage is set it should be a track that's kept (checked per-type so one type can legitimately exclude it)
    if(fillLanguage && subLanguage.length > 0 && !subLanguage.includes(fillLanguage))
    {
        response.infoLog += `☒You have specified that blank tracks should be tagged as ${fillLanguage}. You have not included it in sub_language which indirectly will remove untagged subtitle streams.\n`;
        response.processFile = false;
        return response;
    }
    if(fillLanguage && audioLanguage.length > 0 && !audioLanguage.includes(fillLanguage))
    {
        response.infoLog += `☒You have specified that blank tracks should be tagged as ${fillLanguage}. You have not included it in audio_language which indirectly will remove untagged audio streams.\n`;
        response.processFile = false;
        return response;
    }

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');

    const delDeaf = String(inputs.del_deaf) === 'true';
    const deafKeywords = [
        'sdh',
        'hearing impaired',
        'deaf'
    ];

    // Sanitize a metadata value before embedding it inside a double-quoted ffmpeg -metadata argument (e.g. -metadata:s:a:0 "title=...").
    //
    // Tdarr does NOT pass the preset through a shell — it splits the string into an argv array (quote-aware) and hands it to child_process.spawn. That means shell metacharacters
    // ($ ` ; | etc.) are inert: they reach ffmpeg as literal bytes and become harmless metadata text. The ONLY injection vector is breaking out of the quoted value to inject a new ffmpeg
    // ARGUMENT — which requires a double quote (to close the wrapper) or a control character.
    //
    // Tdarr's tokenizer strips quotes and has no documented backslash-escape convention, so backslash-escaping a double quote can't be relied on. Instead we remove the breakout
    // characters outright: double quotes and backslashes (neither is ever legitimately needed in a stream title or language tag), plus all control characters. What remains can contain
    // spaces and any other printable text safely, because Tdarr keeps the quoted value intact.
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, '')   // strip control characters (newlines, null bytes, etc.)
        .replace(/[\\"]/g, '');             // remove backslashes and double quotes (argument-breakout chars)

    //Clean up titles - Remove surrounding whitespace, single quotes and double quotes as there's no reason for them & wipes title as specified by busyTitleRemove
    function cleanStreamTitle(rawTitle, busyTitleRemove) {
        let title = (rawTitle || '').trim().replace(/^["']+|["']+$/g, '');
        if (busyTitleRemove && title.split('.').length > 4) return '';
        if (title) {
            const parts = title.split(/\s*(?:\/|\||-|•)\s*/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
            if (parts.length === 1) return parts[0];
            // When all parts are the same word (case-insensitive), deduplicate to the first occurrence.
            // "First part wins" is intentional: it preserves the original casing from the leading segment (e.g. "Stereo / stereo" → "Stereo", "ENGLISH - English" → "ENGLISH").
            if (parts.length > 1 && parts.every(p => p.toLowerCase() === parts[0].toLowerCase()))
                return parts[0];
        }
        return title;
    }    

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

    // Set up required variables.
    let extraArguments = '';
    let fflags = '';
    let workDone = '';
    let convert = false;
    let subtitleDropped = 0;
    let audioDropped = 0;
    let videoDropped = 0;
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
            let workLang = streamLang || 'und';

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
                } else {
                    //Rescue any we can by filling in the language before deciding whether to remove it
                    if (fillLanguage && (!streamLang || streamLang === 'und')) {
                        workDone += `☒Language blank on stream ${i} - setting subtitle language to "${fillLanguage}"\n`;
                        metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "language=${escMeta(fillLanguage)}"`;
                        workLang = fillLanguage;
                    }

                    //Gather all of the places where we may find the deaf identification words we're looking for for delDeaf
                    const subtitleDescription = [ffstream.tags?.title,ffstream.tags?.description,ffstream.tags?.handler_name,ffmedia?.Title,ffmedia?.Description].filter(Boolean).join(' ').toLowerCase();

                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(subLanguage.length > 0 && !subLanguage.includes(workLang) && !subLanguage.includes(workLang.replace(/[-_.].*$/, ''))) {
                        workDone += `☒Remove stream ${i} - subtitle language (${streamLang})\n`;
                        delStream = true;
                    } else if ((delDeaf === true) && (ffstream.disposition?.hearing_impaired === 1 || deafKeywords.some(keyword => subtitleDescription.includes(keyword)))) {
                        workDone += `☒Remove stream ${i} - SDH (${subtitleDescription})\n`;
                        delStream = true;
                    }
                }

                if(delStream === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    subtitleDropped++;
                    subtitleStreamIndex--;
                    continue;
                }

                //Remove surrounding whitespace, single quotes and double quotes as there's no reason for them. Clear the title if metaBusyTitleRemove conditions are met
                let newStreamTitle = cleanStreamTitle(streamTitle, metaBusyTitleRemove);

                //We trimmed the title above so if it contains newlines or spaces they'll be removed. Make sure title is set at both metadata and stream levels
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☒Change title of stream ${i} (subtitle) from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☒Change title of stream ${i} (subtitle) - Found "${(ffstream.tags?.title ?? '')}" and "${(ffmedia?.Title ?? '')}" change to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☒Wiping handler_name tag from ${i} (subtitle) "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'SubtitleHandler') {
                    workDone += `☒Setting handler_name tag from ${i} (subtitle) to SubtitleHandler "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name=SubtitleHandler"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Remove comment from stream ${i} (subtitle) "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "comment="`;
                }
                
                if((dstContainer === 'mkv') && ['mov_text', 'webvtt'].includes(ffstreamCodec)) {
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

                //Rescue any we can by filling in the language before deciding whether to remove it
                if (fillLanguage && (!streamLang || streamLang === 'und')) {
                    workDone += `☒Language blank on audio stream ${i} - setting to "${fillLanguage}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "language=${escMeta(fillLanguage)}"`;
                    workLang = fillLanguage;
                }

                //If the audio is a language that should be removed then remove it regardless of other settings.
                if(audioLanguage.length > 0 && !audioLanguage.includes(workLang) && !audioLanguage.includes(workLang.replace(/[-_.].*$/, ''))) {
                    workDone += `☒Remove stream ${i} - audio language (${streamLang})\n`;
                    delStream = true;
                }

                if(delStream === true) {
                    extraArguments += ` -map -0:${i}`;
                    convert = true;
                    audioDropped++;
                    audioStreamIndex--;
                    continue;
                }

                //Remove surrounding whitespace, single quotes and double quotes as there's no reason for them. Clear the title if metaBusyTitleRemove conditions are met
                let newStreamTitle = cleanStreamTitle(streamTitle, metaBusyTitleRemove);

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
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☒Change title of stream ${i} (audio) - Found "${(ffstream.tags?.title ?? '')}" and "${(ffmedia?.Title ?? '')}" change to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☒Wiping handler_name tag from ${i} (audio) "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'SoundHandler') {
                    workDone += `☒Setting handler_name tag from ${i} (audio) to SoundHandler "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name=SoundHandler"`;
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
                    videoStreamIndex--;
                    continue;
                }            

                if(metaCommentRemove === true && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☒Remove comment from stream ${i} (video) "${ffstream.tags?.comment ?? ffmedia?.Comment ?? ''}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "comment="`;
                }

                if(metaBusyTitleRemove === true && ((ffstream.tags?.title ?? '').trim().split('.').length > 4 || (ffmedia?.Title ?? '').trim().split('.').length > 4)) {
                    workDone += `☒Remove title from stream ${i} (video) "${(ffstream.tags?.title ?? '').trim()}" and "${(ffmedia?.Title ?? '').trim()}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "title="`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☒Wiping handler_name tag from ${i} as it can cause problems for titles in mkv (video) "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'VideoHandler') {
                    workDone += `☒Setting handler_name tag from ${i} (video) to VideoHandler "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "handler_name=VideoHandler"`;
                }
                
                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }                
            } else if(ffstreamType === 'attachment' && ['mjpeg', 'png', 'gif', 'bmp', 'none'].includes(ffstreamCodec)) {
                workDone += `☒Remove stream ${i} - attachment stream (${ffstreamType}-${ffstreamCodec})\n`;
                extraArguments += ` -map -0:${i}`;
                convert = true;
                continue;
            } else if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
                workDone += `☒Remove stream ${i} - data stream (${ffstreamType}-${ffstreamCodec})\n`;
                extraArguments += ` -map -0:${i}`;
                convert = true;
                continue;
            }

            //The only other type of stream currently supported by ffmpeg is attachment which we will leave untouched. It's generally used for fonts (ass/ssa subtitles) and cover art so the metadata may be useful. If it needs to be removed then it can be done with a separate plugin.
        } catch (err) {
            // Error
            response.infoLog += `☒Error processing stream ${i}: ${err}\n`;
            response.processFile = false;
            return response;
        }
    }

    if(videoDropped > 0 && videoStreamIndex === -1) {
        response.infoLog += `☒Removing specified streams would leave the file without any video streams. Check to make sure file contains valid streams. \n`;
        response.processFile = false;
        return response;
    }

    if(audioDropped > 0 && audioStreamIndex === -1) {
        response.infoLog += `☒Removing specified streams would leave the file without any audio streams. Check to make sure file contains valid streams. \n`;
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

    //Include recovery flags if requested or if the source container is known to have timestamp issues.

    //Igndts can cause very strange problems if genpts isn't also enabled
    if(recoveryIgndts === true) 
        fflags += '+igndts+genpts';

    if (['ts', 'avi', 'mpg', 'mpeg'].includes(srcContainer)) {
        if(!recoveryIgndts)
            fflags += '+genpts';
        extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
    } else if (recoveryGenpts === true && !recoveryIgndts) 
        fflags += '+genpts';

    if(recoveryDiscard === true) 
        fflags += '+discardcorrupt';
    if(fflags !== '') 
        fflags = `-fflags ${fflags}`;

    //Convert file if convert variable is set to true.
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
