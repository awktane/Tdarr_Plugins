/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Identify and remove data streams and image/cover-art streams (by codec, or by attached_pic/still_image/timed_thumbnails disposition), and remux into mkv or mp4.\n\n
                  Removes any subtitle or audio tracks that are not in the specified language(s), and optionally removes accessibility tracks (SDH/CC subtitles, audio-description audio) via del_accessible - only when a plain track of the same language remains.\n\n
                  Option to modify metadata to remove metadata comments and titles with too many periods.\n\n
                  Automatically deduplicates titles reducing "Stereo / Stereo" down to "Stereo" or "English - English" down to "English".\n\n
                  Optionally rebuilds audio and/or subtitle titles from their disposition roles (tag_title) and imports title keywords into the real ffmpeg disposition flags (tag_disposition), each selectable per stream type (audio, subtitle, or both).\n\n
                  Removes unsupported image based subtitles during remux. Converts mov_text to srt when remuxing to mkv. Converts text-based subtitles to mov_text when remuxing to mp4. Drops broadcast-only, image-based, and non-muxable subtitle formats as needed per container.\n\n
                  Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps.\n\n
                  Image (cover-art) attachments are removed. Embedded fonts are kept while a styled subtitle that uses them (ASS/SSA) survives, and removed once orphaned. Unidentifiable attachments are left untouched.\n\n`,
    Version: '1.20.0',
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
            name: 'del_accessible',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'subtitle', 'audio', 'both'],
            },
            tooltip: `Remove accessibility tracks. Choose which stream types to apply to: disabled, subtitle, audio, or both.
                \\nSubtitle removes SDH / Closed Caption tracks (for the deaf/hard-of-hearing). Audio removes audio-description tracks (visual_impaired, for the blind). Detected by the real ffmpeg disposition flag or by keywords in the title/handler/description.
                \\nSafety: a track is only removed when a "plain" track of the same language survives - one carrying no commentary/descriptive/SDH/lyrics role (and, for subtitles, in a format the output container keeps). So extras are removed, never the last usable track.`,
        },
        {
            name: 'tag_disposition',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'audio', 'subtitle', 'both'],
            },
            tooltip: `Import disposition keywords found in a track's title into the real ffmpeg disposition flags. Choose which stream types to apply to: disabled, audio, subtitle, or both.
                \\nScans each title for words such as Commentary, Descriptive, SDH, Forced, Lyrics, Dub, and Original (and similar) and adds the matching ffmpeg disposition flag when it isn't already set. Existing flags are preserved.
                \\nAudio surfaces Commentary/Descriptive/Dub/Original; subtitle surfaces Commentary/Descriptive/SDH/Forced/Lyrics. This makes the flags the source of truth. Pair it with tag_title so title-only keywords are captured into the flags before the title is rebuilt.
                \\nDoes not touch the default flag - that is managed by track order in the stream ordering plugin.`,
        },
        {
            name: 'tag_title',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'audio', 'subtitle', 'both'],
            },
            tooltip: `Rebuild stream titles from what the track actually is. Choose which stream types to apply to: disabled, audio, subtitle, or both.
                \\nAudio: builds a channel-based title (7.1, 5.1, 5.0, 4.0, 3.1, 3.0, 2.1, Stereo, Mono) with any disposition roles appended, e.g. "5.1 - Commentary" or "5.1 -> 2.0 - Descriptive".
                \\nSubtitle: only titles we own (empty or already just role words) are set to the role tag(s), e.g. "SDH" or "Forced Commentary"; custom subtitle titles are left untouched.
                \\nRole tags come from the track's real disposition flags and title keywords (Commentary, Descriptive, SDH, Forced, Lyrics, Dub, Original). The default flag is intentionally not surfaced.`,
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
            name: 'recover_seesaw',
            type: 'string',
            defaultValue: 'see',
            inputUI: {
                type: 'dropdown',
                options: ['see', 'saw'],
            },
            tooltip: `A see-saw toggle to force the recover_ options to run again. The recover options actually applied are recorded in an awk_recovered tag together with this value.
                \\nFlip this to its other value (see <-> saw) to re-run the enabled recover_ options once on every file that doesn't already carry the new value, then it settles and won't reprocess again.
                \\nNote flipping this reprocesses (remuxes) every previously-recovered file it touches, so only flip it when you actually want to re-run recovery across the library.`,
        },
        {
            name: 'recover_discard_frame',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +discardcorrupt options to drop any corrupt frames from the file.
                 \\nShould generally be false as it may cause a small blips of video/audio if there is damage but may still allow a damaged file to be processed.
                 \\nMay also cause problems with timestamps which may require +genpts and/or +igndts to fix.
                 \\nThe recover options actually applied are recorded in an awk_recovered tag. Recovery re-runs when the set of recover options changes or recover_seesaw is flipped, then settles (it won't reprocess every pass). Container-forced timestamp fixes for ts/avi/mpg/mpeg still always apply.`,
        },
        {
            name: 'recover_genpts',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +genpts option to generate missing PTS (Presentation Timestamps).
                 \\nShould generally be false but can fix errors such as "first pts value must set", "Can't write packet with unknown timestamp", or "Timestamps are unset in a packet for stream".
                 \\nCombining this with igndts will tell ffmpeg to completely rebuild the timestamps for the file.
                 \\nNote this is forced to true for ts, avi, mpg, and mpeg files as they often have timestamp issues.
                 \\nThe recover options actually applied are recorded in an awk_recovered tag. Recovery re-runs when the set of recover options changes or recover_seesaw is flipped, then settles.`,
        },
        {
            name: 'recover_igndts',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: `Run with the ffmpeg +igndts option to ignore DTS (Decode Time Stamps - has nothing to do with Dolby DTS).
                 \\nShould generally be false but can fix errors like "Non-monotonous DTS in output stream" or "DTS out of order".
                 \\nWhen enabled genpts will be automatically enabled even if false is specified as messing with the timestream is a daunting exercise.
                 \\nThe recover options actually applied are recorded in an awk_recovered tag. Recovery re-runs when the set of recover options changes or recover_seesaw is flipped, then settles.`,
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

    //The channel labels we recognise/replace for tag_title - include 2.0 to allow us to overwrite that with stereo
    const channelTitleLabels = ['7.1', '6.1', '5.1', '5.0', '4.0', '3.1', '3.0', '2.1', '2.0', 'stereo', 'mono'];
    const channelLabelAlternation = channelTitleLabels.map(l => l.replace(/\./g, '\\.')).join('|');
    //A bare channel title (the whole title is just a channel label) - we own these and may derive/overwrite them.
    const bareChannelRegex = new RegExp(`^(${channelLabelAlternation})$`, 'i');
    //A downmix/channel-derived base produced elsewhere (e.g. audio_clean "5.1 -> 2.0") ending in "-> <channel>".
    const downmixChannelRegex = new RegExp(`->\\s*(${channelLabelAlternation})\\s*$`, 'i');
    //Map an audio stream's channel count to our short label, honouring LFE for the 3/4 channel ambiguity.
    const channelLabel = (ffstream) => {
        switch (ffstream.channels) {
            case 8: return '7.1';
            case 7: return '6.1';
            case 6: return '5.1';
            case 5: return '5.0';
            case 4: return (ffstream?.channel_layout ?? '').toLowerCase().includes('lfe') ? '3.1' : '4.0';
            case 3: return (ffstream?.channel_layout ?? '').toLowerCase().includes('lfe') ? '2.1' : '3.0';
            case 2: return 'Stereo';
            case 1: return 'Mono';
            default: return '';
        }
    };

    //A few more that should come through as boolean
    const recoverDiscard = String(inputs.recover_discard_frame) === 'true';
    const recoverGenpts = String(inputs.recover_genpts) === 'true';
    const recoverIgndts = String(inputs.recover_igndts) === 'true';
    const recoverSeesaw = String(inputs.recover_seesaw).toLowerCase().trim();
    const tagDisposition = String(inputs.tag_disposition || 'disabled').toLowerCase();
    const tagTitle = String(inputs.tag_title || 'disabled').toLowerCase();
    const applies = (opt, type) => opt === 'both' || opt === type;
    const metaCommentRemove = String(inputs.clean_metadata_comments) === 'true';
    const metaBusyTitleRemove = String(inputs.clean_metadata_busytitle) === 'true';

    const fillLanguage = (inputs.fill_language ? inputs.fill_language.toLowerCase().trim() : '');
    const subLanguage = inputs.sub_language.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const audioLanguage = inputs.audio_language.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const failLangsBlank = String(inputs.fail_langs_blank) === 'true';

    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');

    if(!['see', 'saw'].includes(recoverSeesaw)) {
        response.infoLog += `☒Somehow invalid recover_seesaw option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }

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
        // Resolve each stream's language exactly as the main loop does below (ffprobe tag first, then the
        // mediaInfo fallback). A stream whose language only mediaInfo supplies is never filled, so counting
        // it as "untagged" here would abort files that would actually process fine.
        const isUntagged = (s) => {
            const ffmedia = file?.mediaInfo?.track?.find(t => Number(t.StreamOrder) === s.index);
            const lang = (s?.tags?.language ?? (ffmedia?.Language ?? '')).trim().toLowerCase();
            return !lang || lang === 'und';
        };
        const untaggedAudio = streams.filter((s) => (s?.codec_type || '').toLowerCase() === 'audio' && isUntagged(s)).length;
        if (untaggedAudio > 1) {
            response.infoLog += `☒${untaggedAudio} audio streams have no language tag and would all be assigned "${fillLanguage}" by fill_language — they may be different languages. Tag them manually and requeue or set fail_langs_blank to false.\n`;
            response.processFile = false;
            return response;
        }
        const untaggedSubs =  streams.filter((s) =>(s?.codec_type || '').toLowerCase() === 'subtitle' && isUntagged(s)).length;
        if (untaggedSubs > 1) {
            response.infoLog += `☒${untaggedSubs} subtitle streams have no language tag and would all be assigned "${fillLanguage}" by fill_language — they may be different languages. Tag them manually and requeue or set fail_langs_blank to false.\n`;
            response.processFile = false;
            return response;
        }
    }


    const delAccessible = String(inputs.del_accessible || 'disabled').toLowerCase();
    if(!['disabled', 'subtitle', 'audio', 'both'].includes(delAccessible)) {
        response.infoLog += `☒Somehow invalid del_accessible option provided. Check your settings!\n`;
        response.processFile = false;
        return response;
    }

    // Classify an attachment stream so we only ever remove things we can positively identify:
    //   'image' - cover art / poster (mjpeg/png/gif/bmp, image/* mimetype, or an image filename). Always removed.
    //   'font'  - an embedded font (ttf/otf codec, a font mimetype, or a font filename extension). Removed ONLY
    //             when nothing in the output uses it (no surviving ASS/SSA subtitle). This is the key fix:
    //             on older ffmpeg builds fonts report codec_name 'none'/'unknown', so we identify by filename
    //             and mimetype as well as codec, and never delete a font while a styled subtitle still needs it.
    //   'other' - anything we cannot positively identify (a bare 'none'/'unknown' with no font/image signal).
    //             Left completely untouched — it could be anything, so deleting it is never safe to assume.
    // Still-image / cover-art codecs, shared by attachmentKind and the video-stream image drop below.
    const IMAGE_CODECS = ['mjpeg', 'mjpegb', 'png', 'apng', 'gif', 'bmp', 'webp', 'tiff'];
    const attachmentKind = (s) => {
        const codec = (s.codec_name || '').trim().toLowerCase();
        const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s.tags?.filename || '').trim().toLowerCase();
        const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
        if (IMAGE_CODECS.includes(codec) || mime.startsWith('image/')
            || ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'jp2', 'avif', 'heic'].includes(ext))
            return 'image';
        const fontMime = mime.includes('font') || mime.includes('truetype')
            || mime.includes('opentype') || mime.includes('sfnt');
        if (['ttf', 'otf'].includes(codec) || fontMime
            || ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'].includes(ext))
            return 'font';
        return 'other';
    };

    //Clean up titles - Remove surrounding whitespace, single quotes and double quotes as there's no reason for them, and deduplicate repeated segments ("Stereo / Stereo" -> "Stereo").
    //Busy-title removal (more than 3 periods) is applied by the callers AFTER tagging, not here, so disposition roles are captured into flags before an over-dotted title is cleared.
    function cleanStreamTitle(rawTitle) {
        let title = (rawTitle || '').trim().replace(/^["']+|["']+$/g, '');
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

    // Sanitize a file-supplied string (title/comment/handler/filename) for embedding in a single infoLog
    // line. These fields can legitimately contain newlines/tabs/other control characters; infoLog is
    // newline-delimited and every line must start with ☐/☑/☒, so a raw control character would split the
    // line into a continuation with no status symbol. Collapse control characters to a space for display
    // only — quotes and backslashes are preserved so the logged value still reads faithfully (unlike
    // escMeta, which rewrites them for ffmpeg-argument safety). This is display-only and never feeds ffmpeg.
    const logSafe = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');

    // =====================================================================
    // SHARED BLOCK — keep byte-for-byte identical across all awk plugins.
    // Audio plugins (audio_clean, stream_ordering) carry the whole block:
    //   codecInfo, codecAliases, unknownCodecs, resolveCodecName, audioQuality,
    //   the role/forced classifiers, resolveStreamBitrate, summariseStream, escMeta.
    // clean_and_remux carries only the audio-independent tail: the classifiers,
    // resolveStreamBitrate, summariseStream, and escMeta (the codec-scoring half is audio-only).
    // =====================================================================

    /* -=-=-= Stream role/forced classifiers =-=-=- */
    // Classifiers group the real ffmpeg disposition flags below into the roles the pipeline sorts and
    // tags by. dispositionTypes is keyed by the actual ffmpeg disposition; each entry declares the stream
    // types it is valid on (streams), the title keywords that also indicate it (each keyword lives on one
    // flag so title->flag promotion stays unambiguous), and the canonical string written into a stream
    // title (tag, null when never written). hasDisposition gates on codec_type and matches keywords as
    // whole tokens via matchesKeyword. summariseStream, the stream-ordering sort keys, audio_clean's
    // secondary-track detection, and clean_and_remux's title/flag tagging all read from this table.
    // Shared verbatim across all three awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description'], tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','deaf'],         tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced'],                                tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                              tag: 'Original'    },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                        tag: null          },
    };
    const streamTitleLower = (s) => (s.tags?.title || '').trim().toLowerCase();
    // Whole-token keyword matcher: a keyword matches only when not flanked by a letter/digit, so '[sdh]',
    // 'eng-sdh', and 'sdh.' match while 'deafening'/'aboriginal' do not. An internal space matches any run
    // of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). Keywords are regex-escaped; the 'u'
    // flag enables \p{L}/\p{N}. text must already be lowercased.
    const matchesKeyword = (text, keywords) => {
        if (!keywords.length) return false;
        const pattern = keywords
            .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^\\p{L}\\p{N}]+'))
            .join('|');
        return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u').test(text);
    };
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes((s.codec_type || '').trim().toLowerCase())) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(streamTitleLower(s), entry.keywords);
    };
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions');
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');

    /* -=-=-= Resolve the best available bitrate (bps) for a stream =-=-=- */
    // ffprobe first, mediaInfo fallback. ffprobe cannot read per-stream bitrates from the container atom for some formats (e.g. DTS-HD MA in MP4/M4V), 
    // but mediaInfo decodes the substream headers and usually has it. Returns 0 if neither source has a value. Used to enrich stream objects before summariseStream or audioQuality sees them.
    const resolveStreamBitrate = (ffstream) => {
        const ffBitrate = Number(ffstream.bit_rate || 0);
        if (ffBitrate > 0) return ffBitrate;
        const ffmedia = (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === ffstream.index);
        return Number(ffmedia?.BitRate || 0);
    };

    /* -=-=-= Build single token summarising one ffprobe stream for the input/output summary lines. =-=-=- */
    // Shows: video codec; audio lang/channels/codec/bitrate(+role); subtitle lang/codec(+forced/role); data and attachment codec.
    // Role/forced detection mirrors the sorting logic (disposition flags first, then title keywords, via the shared classifiers) so every plugin's summary lines up. subrip
    // is shown as srt to match the friendlier name used when this pipeline converts subtitles.
    // Shared verbatim across all three awk plugins
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = (s.tags?.language || 'und').trim().toLowerCase();
        const lang = langRaw !== 'und' ? langRaw : '';
        if (type === 'video')
            return `[video:${codec}]`;
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            return `[audio:${[lang, ch, codec, rate].filter(Boolean).join(' ')}${role}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = s.disposition?.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${forced}${role}]`;
        }
        if (type === 'attachment')
            return `[attach:${codec}]`;
        if (type === 'data')
            return `[data:${codec}]`;
        return `[${type || 'unknown'}:${codec}]`;
    };

    /* -=-=-= Sanitize value for embedding inside a double quotes ffmpeg -metadata argument (e.g. -metadata:s:a:0 "title=...") =-=-=- */
    // Tdarr does NOT pass the preset through a shell — it splits the string into a quote-aware argv array and hands it to child_process.spawn, so shell metacharacters ($ ` ; |)
    // are inert and reach ffmpeg as literal metadata bytes. The only injection vector is breaking out of the quoted value to inject a new ffmpeg ARGUMENT, which needs a double quote (to close the wrapper)
    // or a control character.
    // Tdarr's tokenizer strips quotes with no reliable backslash-escape convention,  so we substitute rather than strip:
    //    backslash          -> forward-slash (readable, inert)
    //    double-quote       -> single-quote (safe inside the quoted value; preserves titles like "Director's Cut" and "AC3/Stereo")
    //    control characters -> space (avoids fusing words that a bare delete would join).
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')  // control characters (newlines, null bytes, etc.) → space
        .replace(/\\/g, '/')               // backslash → forward-slash (inert, readable)
        .replace(/"/g, "'");               // double-quote → single-quote (safe inside the quoted value)

    // =====================================================================
    // END SHARED BLOCK
    // =====================================================================

    // -=-=-= Disposition title/flag helpers (clean_and_remux only) =-=-=-
    // Everything derives from the shared dispositionTypes table so there is a single source of truth.
    // dispKeysFor: the dispositions valid on a stream type. titleTagsFor: the deduped canonical tag
    // strings a stream matches (flag or keyword, via the shared classifiers), excluding untagged flags
    // like default/cover-art. These drive both flag promotion and title rebuilding below.
    const dispKeysFor = (type) => Object.keys(dispositionTypes).filter(k => dispositionTypes[k].streams.includes(type));
    const titleTagsFor = (s) => [...new Set(dispKeysFor((s.codec_type || '').trim().toLowerCase())
        .filter(k => dispositionTypes[k].tag && hasDisposition(s, k)).map(k => dispositionTypes[k].tag))];
    // Accessibility keywords for del_accessible's broad description scan (title/description/handler/mediaInfo),
    // sourced from the shared table and matched whole-token via matchesKeyword. Subtitle side = hearing (SDH/CC);
    // audio side = visual (audio description). visual_impaired carries 'audio description' in the shared table
    // so AD tracks tagged only in the title are recognised everywhere (classification and removal), not just here.
    const sdhKeywords = [...dispositionTypes.hearing_impaired.keywords, ...dispositionTypes.captions.keywords];
    const adKeywords  = dispositionTypes.visual_impaired.keywords;
    // Single-word keywords stripped when recovering the channel/base portion of a title (multi-word
    // keywords like "hearing impaired" can't appear as a lone channel token, so they are skipped).
    const stripWords = new Set(Object.values(dispositionTypes).flatMap(d => d.keywords).filter(w => !w.includes(' ')));
    // Drop disposition keywords and stray separators from a title, leaving the channel/downmix base.
    // Splits on whitespace, keeps the "->" downmix arrow, drops lone separators and any keyword token.
    const stripDispositionWords = (title) => (title || '')
        .split(/\s+/)
        .filter(tok => !['-', '/', '|', '•'].includes(tok)
            && !stripWords.has(tok.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase()))
        .join(' ')
        .trim();

    // -=-=-= del_accessible safety guard (clean_and_remux only) =-=-=-
    // Subtitle codecs dropped purely by container/format (also applied in the subtitle loop) - hoisted so the
    // pre-pass here and the loop share one definition.
    const alwaysDropSubs  = ['eia_608', 'ttml'];
    const mp4OnlyDropSubs = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub',
                             'dvb_teletext', 'arib_caption', 'hdmv_text_subtitle'];
    const subFormatDropped = (codec) => alwaysDropSubs.includes(codec)
        || (dstContainer === 'mp4' && mp4OnlyDropSubs.includes(codec));

    // A "plain" track carries no commentary/descriptive/SDH/lyrics role - a genuine main audio or dialogue
    // subtitle. del_accessible removes an accessibility track (SDH/CC subtitle, audio-description audio) only
    // when its language still has a plain track that SURVIVES the language (and, for subtitles, format) filter,
    // so we strip extras and never the last usable track. resolveWorkLang mirrors the loop's language resolution.
    const isPlainTrack = (s) => !isCommentary(s) && !isDescriptive(s) && !isSdh(s) && !isLyrics(s);
    const resolveWorkLang = (s) => {
        const m = file?.mediaInfo?.track?.find(t => Number(t.StreamOrder) === s.index);
        const sl = (s?.tags?.language ?? (m?.Language ?? '')).trim().toLowerCase();
        return (fillLanguage && (!sl || sl === 'und')) ? fillLanguage : (sl || 'und');
    };
    const plainAudioLangs = new Set();
    const plainSubLangs = new Set();
    if (delAccessible !== 'disabled') {
        for (const s of (file.ffProbeData?.streams || [])) {
            const t = (s.codec_type || '').trim().toLowerCase();
            if ((t !== 'audio' && t !== 'subtitle') || !isPlainTrack(s)) continue;
            if (t === 'subtitle' && subFormatDropped((s.codec_name || '').toLowerCase())) continue;
            const wl = resolveWorkLang(s);
            const langs = t === 'audio' ? audioLanguage : subLanguage;
            if (langs.length > 0 && !langs.includes(wl) && !langs.includes(wl.replace(/[-_.].*$/, ''))) continue;
            const set = t === 'audio' ? plainAudioLangs : plainSubLangs;
            set.add(wl); set.add(wl.replace(/[-_.].*$/, ''));
        }
    }
    const hasPlainSameLang = (set, wl) => set.has(wl) || set.has(wl.replace(/[-_.].*$/, ''));

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
    // removedIndices: input stream positions dropped via -map -0:ffstream.index.
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
            const ffmedia = file?.mediaInfo?.track?.find(t => Number(t.StreamOrder) === ffstream.index);
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
                if (subFormatDropped(ffstreamCodec)) {
                    workDone += `☐Remove stream ${i} - unsupported (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                } else {
                    //Rescue any we can by filling in the language before deciding whether to remove it
                    if (fillLanguage && (!streamLang || streamLang === 'und')) {
                        workDone += `☐Language blank on stream ${i} - setting subtitle language to "${fillLanguage}"\n`;
                        metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "language=${escMeta(fillLanguage)}"`;
                        workLang = fillLanguage;
                    }

                    //Gather all of the places where we may find the accessibility (SDH/CC) identification words for del_accessible
                    const subtitleDescription = [ffstream.tags?.title,ffstream.tags?.description,ffstream.tags?.handler_name,ffmedia?.Title,ffmedia?.Description].filter(Boolean).join(' ').toLowerCase();

                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(subLanguage.length > 0 && !subLanguage.includes(workLang) && !subLanguage.includes(workLang.replace(/[-_.].*$/, ''))) {
                        workDone += `☐Remove stream ${i} - subtitle language (${streamLang})\n`;
                        delStream = true;
                    } else if (applies(delAccessible, 'subtitle')
                        && (ffstream.disposition?.hearing_impaired === 1 || ffstream.disposition?.captions === 1 || matchesKeyword(subtitleDescription, sdhKeywords))
                        && hasPlainSameLang(plainSubLangs, workLang)) {
                        workDone += `☐Remove stream ${i} - accessibility subtitle SDH/CC (${logSafe(subtitleDescription)})\n`;
                        delStream = true;
                    }
                }

                if(delStream === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    subtitleDropped++;
                    subtitleStreamIndex--;
                    continue;
                }

                //Remove surrounding whitespace, single quotes and double quotes as there's no reason for them. Busy-title clearing happens after tag_disposition (below).
                let newStreamTitle = cleanStreamTitle(streamTitle);

                //tag_disposition: import any surfaced disposition keyword found in the title into the real flag (additive so existing flags are kept).
                if(applies(tagDisposition, 'subtitle')) {
                    const promote = dispKeysFor('subtitle').filter(key => dispositionTypes[key].tag && hasDisposition(ffstream, key) && ffstream.disposition?.[key] !== 1);
                    if(promote.length > 0) {
                        workDone += `☐Set disposition on stream ${i} (subtitle) from title - ${promote.map(k => dispositionTypes[k].tag).join(' ')}\n`;
                        metadataCommand += ` -disposition:s:${subtitleStreamIndex} ${promote.map(k => `+${k}`).join('')}`;
                    }
                }

                //Busy-title removal: now that tag_disposition (above) has captured any role keywords into the
                //real flags, clear an over-dotted title so tag_title (below) re-names it by the usual rules -
                //it drops in and is treated exactly as a blank title would be.
                if(metaBusyTitleRemove && newStreamTitle.split('.').length > 4)
                    newStreamTitle = '';

                //tag_title (subtitle): titles we own (empty/role-only, including a just-cleared busy title) are set to the role tag(s). Custom titles are left untouched.
                if(applies(tagTitle, 'subtitle')) {
                    const tags = titleTagsFor(ffstream);
                    if(tags.length > 0 && !stripDispositionWords(newStreamTitle))
                        newStreamTitle = tags.join(' ');
                }

                //We trimmed the title above so if it contains newlines or spaces they'll be removed. Make sure title is set at both metadata and stream levels
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☐Change title of stream ${i} (subtitle) from "${logSafe(streamTitle)}" to "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☐Change title of stream ${i} (subtitle) - Found "${logSafe(ffstream.tags?.title ?? '')}" and "${logSafe(ffmedia?.Title ?? '')}" change to "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☐Wiping handler_name tag from ${i} (subtitle) "${logSafe(ffstream.tags?.handler_name)}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'SubtitleHandler') {
                    workDone += `☐Setting handler_name tag from ${i} (subtitle) to SubtitleHandler "${logSafe(ffstream.tags?.handler_name)}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "handler_name=SubtitleHandler"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐Remove comment from stream ${i} (subtitle) "${logSafe(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:s:${subtitleStreamIndex} "comment="`;
                }
                
                // mkv: mov_text is a QuickTime-only format that most players won't render in mkv — convert to srt.
                //      All other subtitle codecs (subrip, ass, ssa, webvtt, hdmv_pgs_subtitle, dvd_subtitle,
                //      dvb_subtitle, xsub, hdmv_text_subtitle, text) are natively supported by the mkv muxer.
                if((dstContainer === 'mkv') && ffstreamCodec === 'mov_text') {
                    workDone += `☐Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} subtitle to srt\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} srt`;
                    subCodecOverride.set(ffstream.index, 'srt');
                    convert = true;
                    continue;
                }

                // mp4: only mov_text is natively supported. All text-based subtitle codecs must be converted.
                //      text is a raw UTF-8 codec that ffmpeg normalises to subrip on mux, but handle explicitly
                //      for defensive coverage in case it ever appears as a distinct stream codec_name.
                if((dstContainer === 'mp4') && ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'text'].includes(ffstreamCodec)) {
                    workDone += `☐Codec unsupported for ${dstContainer} in ${i} - converting ${ffstreamCodec} subtitle to mov_text\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} mov_text`;
                    subCodecOverride.set(ffstream.index, 'mov_text');
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

                //Title/handler/mediaInfo scanned for the audio-description identifiers (del_accessible audio).
                const audioDescription = [ffstream.tags?.title, ffstream.tags?.handler_name, ffmedia?.Title].filter(Boolean).join(' ').toLowerCase();

                //If the audio is a language that should be removed then remove it regardless of other settings.
                if(audioLanguage.length > 0 && !audioLanguage.includes(workLang) && !audioLanguage.includes(workLang.replace(/[-_.].*$/, ''))) {
                    workDone += `☐Remove stream ${i} - audio language (${streamLang})\n`;
                    delStream = true;
                } else if (applies(delAccessible, 'audio')
                    && (ffstream.disposition?.visual_impaired === 1 || matchesKeyword(audioDescription, adKeywords))
                    && hasPlainSameLang(plainAudioLangs, workLang)) {
                    workDone += `☐Remove stream ${i} - audio description (${logSafe(audioDescription)})\n`;
                    delStream = true;
                }

                if(delStream === true) {
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    audioDropped++;
                    audioStreamIndex--;
                    continue;
                }

                //Remove surrounding whitespace, single quotes and double quotes as there's no reason for them. Busy-title clearing happens after tag_disposition (below).
                let newStreamTitle = cleanStreamTitle(streamTitle);

                //tag_disposition: import any surfaced disposition keyword found in the title into the real flag (additive so existing flags are kept).
                if(applies(tagDisposition, 'audio')) {
                    const promote = dispKeysFor('audio').filter(key => dispositionTypes[key].tag && hasDisposition(ffstream, key) && ffstream.disposition?.[key] !== 1);
                    if(promote.length > 0) {
                        workDone += `☐Set disposition on stream ${i} (audio) from title - ${promote.map(k => dispositionTypes[k].tag).join(' ')}\n`;
                        metadataCommand += ` -disposition:a:${audioStreamIndex} ${promote.map(k => `+${k}`).join('')}`;
                    }
                }

                //Busy-title removal: now that tag_disposition (above) has captured any role keywords into the
                //real flags, clear an over-dotted title so tag_title (below) re-names it by the usual rules -
                //it drops in and is treated as a blank title (an empty base becomes the channel label).
                if(metaBusyTitleRemove && newStreamTitle.split('.').length > 4)
                    newStreamTitle = '';

                //tag_title (audio): rebuild the title as a channel/downmix base plus a disposition suffix. The suffix reads each role from the
                //shared classifiers (real flag OR title keyword, via hasDisposition), so a title-only role like "5.1 Commentary" is normalised to
                //"5.1 - Commentary" and survives the reformat instead of being stripped when tag_disposition is off. tag_disposition still governs whether
                //that title role is additionally promoted into a real flag above.
                //Only titles we own are touched: empty, a bare channel label, or a downmix/channel-derived title (e.g. "5.1 -> 2.0"). Custom titles are left alone.
                if(applies(tagTitle, 'audio') && ffstream.channels) {
                    let base = stripDispositionWords(newStreamTitle);
                    if(!base || bareChannelRegex.test(base) || downmixChannelRegex.test(base)) {
                        if(!base || bareChannelRegex.test(base))
                            base = channelLabel(ffstream);
                        const suffix = titleTagsFor(ffstream).join(' ');
                        newStreamTitle = suffix ? `${base} - ${suffix}` : base;
                    }
                }

                //We trimmed the title above so if it contains newlines or spaces they'll be removed. Ensure they are escaped before passing it to the command line.
                if(newStreamTitle !== streamTitle)
                {
                    workDone += `☐Change title of stream ${i} (audio) from "${logSafe(streamTitle)}" to "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                } else if((ffstream.tags?.title ?? '') !== (ffmedia?.Title ?? ''))
                {
                    workDone += `☐Change title of stream ${i} (audio) - Found "${logSafe(ffstream.tags?.title ?? '')}" and "${logSafe(ffmedia?.Title ?? '')}" change to "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "title=${escMeta(newStreamTitle)}"`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☐Wiping handler_name tag from ${i} (audio) "${logSafe(ffstream.tags?.handler_name)}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'SoundHandler') {
                    workDone += `☐Setting handler_name tag from ${i} (audio) to SoundHandler "${logSafe(ffstream.tags?.handler_name)}"\n`;
                    metadataCommand += ` -metadata:s:a:${audioStreamIndex} "handler_name=SoundHandler"`;
                }

                if((metaCommentRemove === true) && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐Remove comment from audio stream ${i} (audio) "${logSafe(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
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

                const isImageCodec = IMAGE_CODECS.includes(ffstreamCodec);
                if (isImageCodec || hasDisposition(ffstream, 'attached_pic') || hasDisposition(ffstream, 'still_image') || hasDisposition(ffstream, 'timed_thumbnails')) {
                    workDone += `☐Remove stream ${i} - ${isImageCodec ? 'image' : 'cover-art/thumbnail'} stream (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    videoDropped++;
                    videoStreamIndex--;
                    continue;
                }            

                if(metaCommentRemove === true && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐Remove comment from stream ${i} (video) "${logSafe(ffstream.tags?.comment ?? ffmedia?.Comment ?? '')}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "comment="`;
                }

                if(metaBusyTitleRemove === true && ((ffstream.tags?.title ?? '').trim().split('.').length > 4 || (ffmedia?.Title ?? '').trim().split('.').length > 4)) {
                    workDone += `☐Remove title from stream ${i} (video) "${logSafe((ffstream.tags?.title ?? '').trim())}" and "${logSafe((ffmedia?.Title ?? '').trim())}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "title="`;
                }

                //The set_handler isn't needed at all for mkv and can cause some oddness with the title
                if(dstContainer === 'mkv' && ffstream.tags?.handler_name) {
                    workDone += `☐Wiping handler_name tag from ${i} as it can cause problems for titles in mkv (video) "${logSafe(ffstream.tags?.handler_name)}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "handler_name="`;
                } else if(dstContainer === 'mp4' && ffstream.tags?.handler_name !== 'VideoHandler') {
                    workDone += `☐Setting handler_name tag from ${i} (video) to VideoHandler "${logSafe(ffstream.tags?.handler_name)}"\n`;
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
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    continue;
                }
                if (kind === 'font') {
                    // Defer: keep or drop is decided after the loop based on whether a styled subtitle survives.
                    deferredFontIndices.push(ffstream.index);
                    continue;
                }
                // 'other' - unidentifiable attachment, leave it untouched (see attachmentKind).
            } else if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
                workDone += `☐Remove stream ${i} - data stream (${ffstreamType}-${ffstreamCodec})\n`;
                extraArguments += ` -map -0:${ffstream.index}`;
                removedIndices.add(ffstream.index);
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
        const fontsNeeded = dstContainer === 'mkv' && file.ffProbeData.streams.some(s =>
            (s.codec_type || '').toLowerCase() === 'subtitle'
            && !removedIndices.has(s.index)
            && ['ass', 'ssa'].includes((s.codec_name || '').toLowerCase()));

        if (!fontsNeeded) {
            for (const idx of deferredFontIndices) {
                const fontStream = file.ffProbeData.streams.find(s => s.index === idx);
                const fname = (fontStream?.tags?.filename || '').trim();
                workDone += `☐Remove stream ${idx} - orphaned font attachment (no ASS/SSA subtitle uses it)${fname ? ` "${logSafe(fname)}"` : ''}\n`;
                extraArguments += ` -map -0:${idx}`;
                removedIndices.add(idx);
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
        workDone += `☐Remove comment from file "${logSafe(file.ffProbeData.format?.tags?.comment)}"\n`;
        extraArguments += ` -metadata "comment="`;
        convert = true;
    }

    if((metaBusyTitleRemove === true) && (file.ffProbeData.format?.tags?.title ?? '').trim().split('.').length > 4) {
        workDone += `☐Remove title from file "${logSafe((file.ffProbeData.format?.tags?.title ?? '').trim())}"\n`;
        extraArguments += ` -metadata "title="`;
        convert = true;
    }

    //Check if remuxing is required due to container change
    if (srcContainer !== dstContainer) {
        workDone += `☐Remux file (${srcContainer}->${dstContainer})\n`;
        convert = true;
    }

    //Include recovery flags if requested or if the source container is known to have timestamp issues.

    // Recovery (discard/genpts/igndts) leaves nothing observable in the stream layout, and with -c copy it is
    // a no-op on already-cleaned content, so forcing a remux purely for it would make every Tdarr health-check
    // pass reprocess the file forever. We record the recover intent - "<recover_seesaw>:<flags signature>" - in
    // a format-level awk_recovered tag and only recover when the current intent differs from what is stamped
    // (a changed recover option, a flipped seesaw, or no tag), then re-stamp. That converges (a matching tag
    // means we skip), so a change re-runs recovery exactly once and then settles - no loop, no reset toggle.
    const recoverRequested = recoverDiscard || recoverGenpts || recoverIgndts;
    // Order-stable signature of the recover flags requested this run.
    const recoverSig = [recoverDiscard && 'discardcorrupt', (recoverGenpts || recoverIgndts) && 'genpts', recoverIgndts && 'igndts'].filter(Boolean).join('+');
    // Full intent = seesaw + signature. escMeta is a no-op here (alphanumeric + ':' + '+') but keeps the
    // compared value byte-identical to what gets written to awk_recovered below.
    const recoverIntent = escMeta(`${recoverSeesaw}:${recoverSig}`);
    // Read case-insensitively on the key (matroska upper-cases tag keys on write; the value is preserved).
    const recoveredTag = String(Object.entries(file.ffProbeData.format?.tags || {})
        .find(([k]) => k.toLowerCase() === 'awk_recovered')?.[1] ?? '').trim();
    const intentMatches = recoveredTag !== '' && recoveredTag === recoverIntent;
    // A real container change (e.g. mkv->mp4) already remuxes and is a one-shot (a fixed config makes
    // srcContainer==dstContainer afterward), so recovery can ride along regardless of the tag without looping.
    const containerChanging = srcContainer !== dstContainer;
    const runRecover = recoverRequested && (!intentMatches || containerChanging);

    // Recover-option flags apply only on a run (a matching intent with no container change is skipped) so a
    // remux triggered by OTHER work never re-applies them. The ts/avi/mpg/mpeg genpts/-avoid_negative_ts
    // below is container-forced (needed to remux those formats at all) and is therefore always applied.

    //Igndts can cause very strange problems if genpts isn't also enabled
    if(runRecover && recoverIgndts === true)
        fflags += '+igndts+genpts';

    if (['ts', 'avi', 'mpg', 'mpeg'].includes(srcContainer)) {
        if(!fflags.includes('genpts'))
            fflags += '+genpts';
        extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
    } else if (runRecover && recoverGenpts === true && !recoverIgndts)
        fflags += '+genpts';

    if(runRecover && recoverDiscard === true)
        fflags += '+discardcorrupt';
    if(fflags !== '')
        fflags = `-fflags ${fflags}`;

    // A recover-only run has no other queued work, so force the remux when this intent needs applying (a
    // matching intent with no container change means recovery already ran, so we don't reprocess).
    if (runRecover)
        convert = true;

    // (Re)stamp the recover intent whenever we remux with recover requested. A fresh run is logged; when the
    // intent already matches we still re-write it idempotently so it survives the remux - notably mkv->mp4,
    // where mp4 drops a custom key unless -movflags use_metadata_tags is set (verified). Without this a
    // container change would drop awk_recovered and the next pass would re-run recovery.
    if (convert === true && recoverRequested) {
        if (runRecover)
            workDone += `☐Stamp awk_recovered=${recoverIntent} - recovery re-runs only if a recover option or recover_seesaw changes\n`;
        extraArguments += ` -metadata "awk_recovered=${recoverIntent}"`;
        if (dstContainer === 'mp4')
            extraArguments += ' -movflags use_metadata_tags';
    }

    //Convert file if convert variable is set to true.
    if (convert === true) {
        response.preset += `${fflags},-map 0 -c copy${extraArguments} -max_muxing_queue_size 9999${networkDataOpt}`;
        response.infoLog += workDone;
        const outSummary = file.ffProbeData.streams
            .map(s => ({ s: { ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate }, idx: s.index }))
            .filter(({ idx }) => !removedIndices.has(idx))
            .map(({ s, idx }) => (subCodecOverride.has(idx) ? { ...s, codec_name: subCodecOverride.get(idx) } : s))
            .map(summariseStream).join('');
        response.infoLog += `☑Expected results: ${outSummary}\n`;
        response.processFile = true;
    } else {
        if (recoverRequested && intentMatches)
            response.infoLog += `☑Already recovered with these options (awk_recovered=${recoveredTag}) - skipping to avoid reprocessing. Change a recover option or flip recover_seesaw to run again.\n`;
        response.infoLog += `☑File is already ${dstContainer} and contains no streams requiring removal or conversion.\n`;
        response.processFile = false;
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
