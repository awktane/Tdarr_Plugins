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
                  Removes unsupported image based subtitles during remux. Converts mov_text to srt when remuxing to mkv. Converts text-based subtitles to mov_text when remuxing to mp4. Drops broadcast-only, image-based, and non-muxable subtitle formats as needed per container.\n\n
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n
                  Image (cover-art) attachments are removed. Embedded fonts are kept while a styled subtitle that uses them (ASS/SSA) survives, and removed once orphaned. Unidentifiable attachments are left untouched.\n\n`,
    Version: '1.13.6',
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
                \\nmkv will also remove eia_608, ttml, and any other non-muxable subtitle formats. mov_text is converted to srt for compatibility.
                \\nmp4 will also remove image-based subtitles (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle, xsub), broadcast-only subtitles (dvb_teletext, arib_caption, eia_608), ttml, and hdmv_text_subtitle. Text-based subtitles (subrip, srt, ass, ssa, webvtt, text) are converted to mov_text. Genpts may be required to fix timestamps.`,
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
            tooltip: `Specify language tag/s here for the subtitle tracks you'd like to keep. If blank no tracks will be removed.
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
            name: 'fail_langs_blank',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false'],
            },
            tooltip: `If fill_language is set and more than one audio or subtitle stream has no language tag, should processing be aborted?
                \\nWhen multiple streams share the same blank language tag, fill_language assigns them all the same language. They may actually be different languages — the only way to know is by listening.
                \\nSubsequent plugins may then treat them as duplicates and remove one, causing silent content loss (e.g. deleting the only Japanese track because it was tagged the same as English).
                \\nIf true  - processing is aborted and the file is sent to the error queue. Tag the streams manually and requeue.
                \\nIf false - the fill_language assignment is logged as normal and processing continues.`,
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
    const failLangsBlank = String(inputs.fail_langs_blank) === 'true';

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');

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

    // If fill_language is set and more than one stream of the same type has no language tag, they will all receive the same language — but they may actually be different languages. If fail_langs_blank
    // is true, abort so the user can tag them manually and requeue. If false, processing continues and the fill_language assignments are logged as normal by the stream loop below.
    if (fillLanguage && failLangsBlank) {
        const streams = file.ffProbeData.streams || [];
        const untaggedAudio = streams.filter(s => (s?.codec_type || '').toLowerCase() === 'audio' && (!s?.tags?.language || s.tags.language.trim().toLowerCase() === 'und')).length;
        if (untaggedAudio > 1) {
            response.infoLog += `☒${untaggedAudio} audio streams have no language tag and would all be assigned "${fillLanguage}" by fill_language — they may be different languages. Tag them manually and requeue or set fail_langs_blank to false.\n`;
            response.processFile = false;
            return response;
        }
        const untaggedSubs =  streams.filter(s =>(s?.codec_type || '').toLowerCase() === 'subtitle' && (!s?.tags?.language || s.tags.language.trim().toLowerCase() === 'und')).length;
        if (untaggedSubs > 1) {
            response.infoLog += `☒${untaggedSubs} subtitle streams have no language tag and would all be assigned "${fillLanguage}" by fill_language — they may be different languages. Tag them manually and requeue or set fail_langs_blank to false.\n`;
            response.processFile = false;
            return response;
        }
    }


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

    // Classify an attachment stream so we only ever remove things we can positively identify:
    //   'image' - cover art / poster (mjpeg/png/gif/bmp, image/* mimetype, or an image filename). Always removed.
    //   'font'  - an embedded font (ttf/otf codec, a font mimetype, or a font filename extension). Removed ONLY
    //             when nothing in the output uses it (no surviving ASS/SSA subtitle). This is the key fix:
    //             on older ffmpeg builds fonts report codec_name 'none'/'unknown', so we identify by filename
    //             and mimetype as well as codec, and never delete a font while a styled subtitle still needs it.
    //   'other' - anything we cannot positively identify (a bare 'none'/'unknown' with no font/image signal).
    //             Left completely untouched — it could be anything, so deleting it is never safe to assume.
    const attachmentKind = (s) => {
        const codec = (s.codec_name || '').trim().toLowerCase();
        const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s.tags?.filename || '').trim().toLowerCase();
        const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
        if (['mjpeg', 'png', 'gif', 'bmp'].includes(codec) || mime.startsWith('image/')
            || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext))
            return 'image';
        const fontMime = mime.includes('font') || mime.includes('truetype')
            || mime.includes('opentype') || mime.includes('sfnt');
        if (['ttf', 'otf'].includes(codec) || fontMime
            || ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'].includes(ext))
            return 'font';
        return 'other';
    };

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

    // =====================================================================
    // SHARED BLOCK — keep byte-for-byte identical across all awk plugins.
    // clean_and_remux carries only resolveStreamBitrate + summariseStream.
    // stream_ordering and audio_clean also include codecInfo, codecAliases,
    // unknownCodecs, and audioQuality preceding these two functions.
    // =====================================================================

    // Resolve the best available bitrate (bps) for a stream: ffprobe first, mediaInfo fallback.
    // ffprobe cannot read per-stream bitrates from the container atom for some formats (e.g. DTS-HD MA
    // in MP4/M4V), but mediaInfo decodes the substream headers and usually has it. Returns 0 if neither
    // source has a value. Used to enrich stream objects before summariseStream or audioQuality sees them.
    const resolveStreamBitrate = (ffstream) => {
        const ffBitrate = Number(ffstream.bit_rate || 0);
        if (ffBitrate > 0) return ffBitrate;
        const ffmedia = (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === ffstream.index);
        return Number(ffmedia?.BitRate || 0);
    };

    // Build a single bracket token summarising one ffprobe stream for the input/output summary lines.
    // Shared verbatim across all three awk plugins — keep byte-for-byte identical when editing.
    // Shows: video codec; audio lang/channels/codec/bitrate(+role); subtitle lang/codec(+forced/role);
    // data and attachment codec. Role/forced detection mirrors the sorting logic (disposition flags
    // first, then title keywords) so every plugin's summary lines up. subrip is shown as srt to match
    // the friendlier name used when this pipeline converts subtitles.
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const title = (s.tags?.title || '').trim().toLowerCase();
        const disp = s.disposition || {};
        const langRaw = (s.tags?.language || 'und').trim().toLowerCase();
        const lang = langRaw !== 'und' ? langRaw : '';
        if (type === 'video')
            return `[video:${codec}]`;
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const commentary = disp.comment === 1 || title.includes('commentary') || title.includes('producer');
            const descriptive = disp.visual_impaired === 1 || title.includes('description') || title.includes('descriptive') || title.includes('dvs') || title.includes('narration');
            const role = commentary ? '/commentary' : (descriptive ? '/description' : '');
            return `[audio:${[lang, ch, codec, rate].filter(Boolean).join(' ')}${role}]`;
        }
        if (type === 'subtitle') {
            const commentary = disp.comment === 1 || title.includes('commentary') || title.includes('producer');
            const sdh = disp.hearing_impaired === 1 || title.includes('sdh') || title.includes('hearing impaired') || title.includes('deaf');
            const signs = disp.karaoke === 1 || title.includes('signs') || title.includes('songs');
            const role = commentary ? '/commentary' : (sdh ? '/sdh' : (signs ? '/signs' : ''));
            const forced = disp.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${forced}${role}]`;
        }
        if (type === 'attachment')
            return `[attach:${codec}]`;
        if (type === 'data')
            return `[data:${codec}]`;
        return `[${type || 'unknown'}:${codec}]`;
    };

    // =====================================================================
    // END SHARED BLOCK
    // =====================================================================

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

    // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset).
    // removedIndices: input stream positions dropped via -map -0:i.
    // subCodecOverride: input stream position -> converted subtitle codec ('srt' / 'mov_text').
    const removedIndices = new Set();
    const subCodecOverride = new Map();

    // Font attachments whose removal is deferred until after the main loop, when we know which subtitle
    // streams survive. Decided here (not inline) because an attachment can appear before its subtitles in
    // the file, so we cannot know whether a styled subtitle survives at the moment we reach the attachment.
    const deferredFontIndices = [];

    // Summarise the input streams exactly as they arrived, before any removal/remux, using the shared
    // bracket helper. This plugin runs first, so this captures the file as received; reading it alongside
    // the stream-ordering plugin's output line shows where a file came from and where it ended up.
    // Starts with ☐ as it details the state we are about to act on.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate })).join('')}\n`;

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

                //First remove any subtitles that would be removed due to format as in that case language doesn't matter.
                // eia_608: closed-caption data embedded in video bitstream, not a real subtitle stream — always drop.
                // ttml: ffmpeg has no working encoder or muxer path for ttml; drop for both containers.
                // dvb_teletext, arib_caption, hdmv_text_subtitle: decode-only, no encoder, no mp4 muxer support — drop for mp4.
                //   hdmv_text_subtitle copies into mkv fine so it is only in the mp4 list.
                // Image-based (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle, xsub): no encoder, mp4 rejects them — drop for mp4.
                const alwaysDrop   = ['eia_608', 'ttml'];
                const mp4OnlyDrop  = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub',
                                      'dvb_teletext', 'arib_caption', 'hdmv_text_subtitle'];
                if (alwaysDrop.includes(ffstreamCodec) || (dstContainer === 'mp4' && mp4OnlyDrop.includes(ffstreamCodec))) {
                    workDone += `☐Remove stream ${i} - unsupported (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                } else {
                    //Rescue any we can by filling in the language before deciding whether to remove it
                    if (fillLanguage && (!streamLang || streamLang === 'und')) {
                        workDone += `☐Language blank on stream ${i} - setting subtitle language to "${fillLanguage}"\n`;
                        metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "language=${escMeta(fillLanguage)}"`;
                        workLang = fillLanguage;
                    }

                    //Gather all of the places where we may find the deaf identification words we're looking for for delDeaf
                    const subtitleDescription = [ffstream.tags?.title,ffstream.tags?.description,ffstream.tags?.handler_name,ffmedia?.Title,ffmedia?.Description].filter(Boolean).join(' ').toLowerCase();

                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(subLanguage.length > 0 && !subLanguage.includes(workLang) && !subLanguage.includes(workLang.replace(/[-_.].*$/, ''))) {
                        workDone += `☐Remove stream ${i} - subtitle language (${streamLang})\n`;
                        delStream = true;
                    } else if ((delDeaf === true) && (ffstream.disposition?.hearing_impaired === 1 || deafKeywords.some(keyword => subtitleDescription.includes(keyword)))) {
                        workDone += `☐Remove stream ${i} - SDH (${subtitleDescription})\n`;
                        delStream = true;
                    }
                }

                if(delStream === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    extraArguments += ` -map -0:${i}`;
                    removedIndices.add(i);
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
                    workDone += `☐Change title of stream ${i} (subtitle) from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☐Change title of stream ${i} (subtitle) - Found "${(ffstream.tags?.title ?? '')}" and "${(ffmedia?.Title ?? '')}" change to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☐Wiping handler_name tag from ${i} (subtitle) "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'SubtitleHandler') {
                    workDone += `☐Setting handler_name tag from ${i} (subtitle) to SubtitleHandler "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name=SubtitleHandler"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐Remove comment from stream ${i} (subtitle) "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "comment="`;
                }
                
                // mkv: mov_text is a QuickTime-only format that most players won't render in mkv — convert to srt.
                //      All other subtitle codecs (subrip, ass, ssa, webvtt, hdmv_pgs_subtitle, dvd_subtitle,
                //      dvb_subtitle, xsub, hdmv_text_subtitle, text) are natively supported by the mkv muxer.
                if((dstContainer === 'mkv') && ffstreamCodec === 'mov_text') {
                    workDone += `☐Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} subtitle to srt\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} srt`;
                    subCodecOverride.set(i, 'srt');
                    convert = true;
                    continue;
                }

                // mp4: only mov_text is natively supported. All text-based subtitle codecs must be converted.
                //      text is a raw UTF-8 codec that ffmpeg normalises to subrip on mux, but handle explicitly
                //      for defensive coverage in case it ever appears as a distinct stream codec_name.
                if((dstContainer === 'mp4') && ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'text'].includes(ffstreamCodec)) {
                    workDone += `☐Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} subtitle to mov_text\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} mov_text`;
                    subCodecOverride.set(i, 'mov_text');
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
                    workDone += `☐Language blank on audio stream ${i} - setting to "${fillLanguage}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "language=${escMeta(fillLanguage)}"`;
                    workLang = fillLanguage;
                }

                //If the audio is a language that should be removed then remove it regardless of other settings.
                if(audioLanguage.length > 0 && !audioLanguage.includes(workLang) && !audioLanguage.includes(workLang.replace(/[-_.].*$/, ''))) {
                    workDone += `☐Remove stream ${i} - audio language (${streamLang})\n`;
                    delStream = true;
                }

                if(delStream === true) {
                    extraArguments += ` -map -0:${i}`;
                    removedIndices.add(i);
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
                    workDone += `☐Change title of stream ${i} (audio) from "${streamTitle}" to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☐Change title of stream ${i} (audio) - Found "${(ffstream.tags?.title ?? '')}" and "${(ffmedia?.Title ?? '')}" change to "${newStreamTitle}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☐Wiping handler_name tag from ${i} (audio) "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'SoundHandler') {
                    workDone += `☐Setting handler_name tag from ${i} (audio) to SoundHandler "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name=SoundHandler"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐Remove comment from audio stream ${i} (audio) "${(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
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
                    workDone += `☐Remove stream ${i} - image stream (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${i}`;
                    removedIndices.add(i);
                    convert = true;
                    videoDropped++;
                    videoStreamIndex--;
                    continue;
                }            

                if(metaCommentRemove === true && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐Remove comment from stream ${i} (video) "${ffstream.tags?.comment ?? ffmedia?.Comment ?? ''}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "comment="`;
                }

                if(metaBusyTitleRemove === true && ((ffstream.tags?.title ?? '').trim().split('.').length > 4 || (ffmedia?.Title ?? '').trim().split('.').length > 4)) {
                    workDone += `☐Remove title from stream ${i} (video) "${(ffstream.tags?.title ?? '').trim()}" and "${(ffmedia?.Title ?? '').trim()}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "title="`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☐Wiping handler_name tag from ${i} as it can cause problems for titles in mkv (video) "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'VideoHandler') {
                    workDone += `☐Setting handler_name tag from ${i} (video) to VideoHandler "${ffstream.tags?.handler_name}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "handler_name=VideoHandler"`;
                }
                
                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }                
            } else if(ffstreamType === 'attachment') {
                const kind = attachmentKind(ffstream);
                if (kind === 'image') {
                    workDone += `☐Remove stream ${i} - cover-art attachment (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${i}`;
                    removedIndices.add(i);
                    convert = true;
                    continue;
                }
                if (kind === 'font') {
                    // Defer: keep or drop is decided after the loop based on whether a styled subtitle survives.
                    deferredFontIndices.push(i);
                    continue;
                }
                // 'other' - unidentifiable attachment, leave it untouched (see attachmentKind).
            } else if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
                workDone += `☐Remove stream ${i} - data stream (${ffstreamType}-${ffstreamCodec})\n`;
                extraArguments += ` -map -0:${i}`;
                removedIndices.add(i);
                convert = true;
                continue;
            }

            //Any other stream type (e.g. an unrecognised attachment classified as 'other') is left untouched. If it needs to be removed it can be done with a separate plugin.
        } catch (err) {
            // Error
            response.infoLog += `☒Error processing stream ${i}: ${err}\n`;
            response.processFile = false;
            return response;
        }
    }

    // Resolve deferred font attachments now that subtitle removals are final. Embedded fonts are only
    // consumed by styled text subtitles (ASS/SSA). Keep the fonts if any such subtitle survives in the
    // output; otherwise they are orphaned and removed. mp4 output never keeps fonts: ASS/SSA are converted
    // to mov_text (which needs no fonts) and mp4 cannot carry font attachments anyway, so dstContainer
    // gates this to mkv. The source codec is read from ffProbeData (it is still 'ass'/'ssa' there even
    // when converted), which is why the mkv gate — not just the survivor check — is required.
    if (deferredFontIndices.length > 0) {
        const fontsNeeded = dstContainer === 'mkv' && file.ffProbeData.streams.some((s, idx) =>
            (s.codec_type || '').toLowerCase() === 'subtitle'
            && !removedIndices.has(idx)
            && ['ass', 'ssa'].includes((s.codec_name || '').toLowerCase()));

        if (!fontsNeeded) {
            for (const i of deferredFontIndices) {
                const fname = (file.ffProbeData.streams[i]?.tags?.filename || '').trim();
                workDone += `☐Remove stream ${i} - orphaned font attachment (no ASS/SSA subtitle uses it)${fname ? ` "${fname}"` : ''}\n`;
                extraArguments += ` -map -0:${i}`;
                removedIndices.add(i);
                convert = true;
            }
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
        workDone += `☐Remove comment from file "${file.ffProbeData.format?.tags?.comment}"\n`;
        extraArguments += ` -metadata "comment="`;
        convert = true;
    }

    if((metaBusyTitleRemove === true) && (file.ffProbeData.format?.tags?.title ?? '').trim().split('.').length > 4) {
        workDone += `☐Remove title from file "${(file.ffProbeData.format?.tags?.title ?? '').trim()}"\n`;
        extraArguments += ` -metadata "title="`;
        convert = true;
    }

    //Check if remuxing is required due to container change
    if (srcContainer !== dstContainer) {
        workDone += `☐Remux file (${srcContainer}->${dstContainer})\n`;
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
        const outSummary = file.ffProbeData.streams
            .map((s, idx) => ({ s, idx }))
            .filter(({ idx }) => !removedIndices.has(idx))
            .map(({ s, idx }) => (subCodecOverride.has(idx) ? { ...s, codec_name: subCodecOverride.get(idx) } : s))
            .map(summariseStream).join('');
        response.infoLog += `☑Expected results: ${outSummary}\n`;
        response.processFile = true;
    } else {
        response.infoLog += `☑File is already ${dstContainer} and contains no streams requiring removal or conversion.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
