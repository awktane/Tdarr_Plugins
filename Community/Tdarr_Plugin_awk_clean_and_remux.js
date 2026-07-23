/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Prepares the file for any next steps including remuxing to mp4/mkv\n\n
                     -Identify and remove data streams and image/cover-art streams (by codec, or by attached_pic/still_image/timed_thumbnails disposition)\n\n
                     -Optionally removes any subtitle tracks that are not in the specified language(s) via language_sub (audio language filtering is audio_clean's job)\n\n
                     -Standardises the stored language tag per container (tag_language / method_tag_language) and fills missing or und tags from language_fill - the only awk plugin that WRITES language tags\n\n
                     -Optional pre-mux early warning (guard_audio_language) that aborts a multi-language file whose original audio track isn't marked, before any downstream encoding work\n\n
                     -Optionally removes SDH/CC accessibility subtitles via remove_sub_sdh (audio-description audio is audio_clean's downmix_secondary)\n\n
                     -Option to modify metadata to remove metadata comments and titles with too many periods\n\n
                     -Automatically deduplicates titles reducing "Stereo / Stereo" down to "Stereo" or "English - English" down to "English"\n\n
                     -Optionally rebuilds audio and/or subtitle titles from their disposition roles and imports title keywords into the real ffmpeg disposition flags\n\n
                     -Forcefully removes unsupported image based subtitles; optionally removes all image based subtitles, or exports them to hidden OCR sidecars, via remove_imagesubs\n\n
                     -Converts unsupported subtitles to a supported format\n\n
                     -Drops broadcast-only, image-based, and non-muxable subtitle formats as needed per container\n\n
                     -Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps\n\n
                     -Embedded fonts are kept while a styled subtitle that uses them (ASS/SSA) survives, and removed once orphaned. Unidentifiable attachments are left untouched on mkv, and dropped for an mp4 target (which cannot carry any attachment).\n\n`,
    Version: '4.3.0',
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
                \\nmkv removes eia_608, ttml, xsub, dvb_teletext, and any other subtitle format the mkv muxer can't carry. mov_text is converted to srt for compatibility.
                \\nmp4 additionally removes the image-based subtitles mkv keeps (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle), plus arib_caption and hdmv_text_subtitle. Text-based subtitles (subrip, srt, ass, ssa, webvtt, text) are converted to mov_text. Genpts may be required to fix timestamps. HEVC video is tagged hvc1 so Apple/QuickTime can play it.`,
        },
        {
            name: 'language_fill',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Specify language tag here to force upon subtitle/audio tracks that are missing a language tag. Blank language or und tracks will be filled with this language tag.
                \\nTakes precedence over language_sub if track language is und or blank.
                \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nExample:\\n
                    eng
                \\nExample:\\n
                    jpn`,
        },
        {
            name: 'language_fill_mode',
            type: 'string',
            defaultValue: 'single-or-error',
            inputUI: {
                type: 'dropdown',
                options: ['single-or-error', 'force-any'],
            },
            tooltip: `Only applies when language_fill is set. It decides what to do when language_fill would assign the SAME language to more than one untagged audio or subtitle stream of a type.
                \\nThose streams can't be told apart by language — the only way to know is by listening — so filling them identically lets a later plugin treat them as duplicates and remove one, causing silent content loss (e.g. deleting the only Japanese track because it was tagged the same as English). With language_fill blank the streams keep "und" (audio_clean's dedup skips und, so nothing collides) and this setting does nothing.
                \\nThis is not the "which track is the original language" check — for that, enable guard_audio_language. This runs before the remux, so any abort costs no mux.
                \\n=====
                \\nActions
                \\n=====
                \\nIf single-or-error - (Default) a single untagged stream of a type is filled and kept; two or more abort the file to the error queue. Tag them manually and requeue.
                \\nIf force-any       - fill and keep them all, however many there are, never aborting (accepts the duplicate-collision risk described above).`,
        },
        {
            name: 'language_sub',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Specify language tags here for the subtitle tracks you'd like to keep. If blank then no tracks will be removed.
                \\nStreams with no language tag are treated as though they had language_fill as their language or "und" if language_fill isn't set
                \\nOne form is enough - en, eng, or English all match the same language (including region variants like en-US), so you don't need to list every variant.
                \\nExample:\\n
                    eng,fra
                    \\nEnglish and French.
                \\nThe special codes und (undefined), mul (multiple languages) and mis (no language code) are matched literally - include them if you want to keep such tracks.
                \\nExample:\\n
                    eng,und
                    \\nEnglish and both subtitles marked as und or with no language set`,
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
            name: 'tag_language',
            type: 'string',
            defaultValue: 'invalid',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'invalid', 'strict'],
            },
            tooltip: `Standardise the language tag on tracks that already HAVE one (to set a language on UNtagged tracks use language_fill instead). Fixes tags that would be lost or misread - e.g. the full word "English" becomes "eng", and a 2-letter code like "en" becomes 3-letter when the output is mp4 (mp4 cannot store 2-letter codes and silently drops the language on remux). Applies to video, audio and subtitle streams. Output form follows method_tag_language.
                \\ndisabled: never change an existing language tag.
                \\ninvalid (default): only fix tags that are non-standard or won't store correctly in the output container - spelled-out names, wrong case, and 2-letter/region codes headed to mp4. Tags that already store cleanly (e.g. eng, or en/fre into mkv) are left alone.
                \\nstrict: rewrite every language tag to the exact method_tag_language standard, even valid ones (en becomes eng, and fre/fra are folded to your chosen bibliographic/terminologic form).
                \\nUndetermined / non-language codes (und, mul, zxx, mis) are always left untouched.`,
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
                \\nAudio: builds a channel-based title (7.1, 6.1, 5.1, 5.0, 4.0, 3.1, 3.0, 2.1, Stereo, Mono) with any disposition roles appended, e.g. "5.1 - Commentary" or "5.1 -> 2.0 - Descriptive".
                \\nSubtitle: only titles we own (empty or already just role words) are set to the role tag(s), e.g. "SDH" or "Forced Commentary"; custom subtitle titles are left untouched.
                \\nRole tags come from the track's real disposition flags and title keywords (Commentary, Descriptive, SDH, Forced, Lyrics, Dub, Original). The default flag is intentionally not surfaced.`,
        },
        {
            name: 'remove_busytitle',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Should audio/subtitle metadata titles be removed if they contain more than 3 periods? This removes most invalid or unnecessary titles that are added by some sources.
                \\nExample:\\n
                This.Title.Has.Too.Many.Periods would have title set to blank`,
        },
        {
            name: 'remove_comments',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Should comments be removed from all streams? These are not usually shown by players and often contain unnecessary information.`,
        },
        {
            name: 'remove_imagesubs',
            type: 'string',
            defaultValue: 'unsupported',
            inputUI: {
                type: 'dropdown',
                options: ['unsupported', 'all', 'export'],
            },
            tooltip: `What to do with image-based (bitmap) subtitles - hdmv_pgs_subtitle (Blu-ray PGS), dvd_subtitle (VobSub), dvb_subtitle. They can't be searched, restyled, or turned into text without OCR.
                \\nunsupported (default): keep them where the container carries them (mkv), drop them only where it can't (mp4 can't store these).
                \\nall: remove all image-based subtitles from any container (use when you only want text subtitles).
                \\nexport: save each image subtitle to a hidden sidecar next to the video (PGS -> ".<name>.<lang>.sup", VobSub/DVB -> ".<name>.<lang>.mks") and then remove it. The leading dot keeps Plex/Jellyfin from indexing it; run an external OCR tool on the sidecars to produce .srt, then reimport with awk_sub_worker. One-way - these are never reimported by this plugin.
                \\nEmby caveat: Emby does NOT skip dot-prefixed files, so an exported .mks may surface as a stray library item (it ignores .sup outright). On Emby, add a .embyignore file (4.9+) listing ".*" in the library root, or OCR and delete the sidecars before the next scan.
                \\nText subtitles are never affected. xsub is always removed (no Matroska CodecID) and is not exported.`,
        },
        {
            name: 'remove_sub_sdh',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'enabled'],
            },
            tooltip: `Remove SDH / Closed Caption subtitles (for the deaf/hard-of-hearing). Detected by the real ffmpeg disposition flag or by keywords in the title/handler/description.
                \\nSafety: a track is only removed when a "plain" subtitle of the same language survives - one carrying no commentary/descriptive/SDH/lyrics role, in a format the output container keeps and not stripped by remove_imagesubs. So extras are removed, never the last usable track.
                \\nAudio-description (visual_impaired) audio is not handled here - audio_clean's downmix_secondary owns it, along with commentary and M&E.`,
        },
        {
            name: 'method_tag_language',
            type: 'string',
            defaultValue: 'container',
            inputUI: {
                type: 'dropdown',
                options: ['639-2/b', '639-2/t', 'container', 'bcp47'],
            },
            tooltip: `Which language-code standard tag_language writes (only takes effect when tag_language is not disabled). Affects mainly the ~20 languages with two 3-letter codes (e.g. French fre/fra, German ger/deu) plus the 2-vs-3-letter choice; you can still type any form in the language lists regardless.
                \\nBy convention Matroska (mkv) uses ISO-639-2/B and mp4's mdhd box uses ISO-639-2/T; both containers accept either form.
                \\ncontainer (default): write each container its native form - 2-letter (en, fr) for mkv, 3-letter terminologic (eng, fra) for mp4. Most spec-accurate per container.
                \\n639-2/t: terminologic 3-letter codes everywhere - fra, deu, zho (matches mp4's mdhd; 3-letter is also the common mkv convention).
                \\n639-2/b ("mkv classic"): bibliographic 3-letter codes everywhere - fre, ger, chi.
                \\nbcp47: like container on mp4 (3-letter terminologic) but on mkv keeps the full BCP-47 tag - a region (ISO-3166) subtag like pt-BR/es-419 or a script (ISO-15924) subtag like zh-Hans; mp4 can't store a region so it still folds to 3-letter (por).`,
        },
        {
            name: 'guard_audio_language',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'enabled'],
            },
            tooltip: `An EARLY WARNING for multi-language files whose original language isn't marked. audio_clean is what actually keeps or drops audio by language, but it can only trust a track marked 'original' - it has no way to tell which of several untagged languages is the real original. This checks for that risk here, BEFORE the remux, so a file that needs your attention costs you nothing to find out about.
                \\nWhen enabled: if the file has MORE THAN ONE audio language among its genuine (non-commentary/descriptive) tracks and NO audio track is marked original (the ffmpeg 'original' disposition flag, or an "original" keyword in the title/handler), the file is aborted to the error queue. Mark the original track and requeue - audio_clean's guard_original can then protect it.
                \\nLanguages are compared folded, so en/eng/English/en-US count as one; an untagged track counts as its own "und" language. A file with a single audio language, or one that already marks its original, passes untouched.
                \\n=====
                \\nActions
                \\n=====
                \\nIf enabled  - abort a multi-language file that marks no original, so you can tag it before audio_clean acts on it.
                \\nIf disabled - (Default) no check; audio_clean handles whatever it finds.`,
        },
        {
            name: 'recover_bad_data',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'light', 'aggressive'],
            },
            tooltip: `Push a structurally damaged file through: visible/audible glitches, the job aborting on this file, won't seek, or a wrong duration.
                 \\nTry light first; if it doesn't help switch to aggressive.
                 \\ndisabled: no data recovery.
                 \\nlight (risk-free): -fflags +ignidx and -err_detect ignore_err - ignores a broken/corrupt index (AVI idx1, MOV/MP4 sample tables) and keeps reading past detected errors instead of failing. Drops no frames.
                 \\naggressive: additionally -fflags +discardcorrupt - drops packets flagged corrupt, which may cause small video/audio blips where the damage is.
                 \\nThe mode actually applied is recorded in an awk_recovered tag. Recovery re-runs only when a recover_bad_* mode changes, then settles.`,
        },
        {
            name: 'recover_bad_timestamps',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'light', 'aggressive'],
            },
            tooltip: `Fix a broken presentation timeline: stutter, audio/video desync, or ffmpeg errors like "first pts value must set", "Timestamps are unset in a packet for stream", "Non-monotonous DTS in output stream", or "DTS out of order".
                 \\nTry light first; if the error persists switch to aggressive.
                 \\ndisabled: no timestamp recovery.
                 \\nlight (risk-free): -fflags +genpts and -avoid_negative_ts make_zero - regenerates missing PTS and shifts negative start times to zero. Touches no frame data.
                 \\naggressive: additionally -fflags +igndts - ignores the source DTS and fully rebuilds the timeline (fixes "Non-monotonous DTS"). Can produce odd results, so only use it if light didn't help.
                 \\nThe mode actually applied is recorded in an awk_recovered tag. Recovery re-runs only when a recover_bad_* mode changes, then settles (it won't reprocess every pass). Container-forced timestamp fixes for ts/avi/mpg/mpeg still always apply.`,
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: file-failure helpers =====
    // -=-=-= AwkFailFile / failFile / failUnexpected  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Fail the whole file (send it to Tdarr's error queue) carrying the full infoLog as context. A returned processFile:false is Tdarr's "no work needed /
    // skip" signal, NOT a failure — the flow's runClassicTranscodePlugin checks `if (result.error) throw` before `if (result.processFile !== true) continue`,
    // so a skip return quietly moves on. To actually error the file a classic plugin must throw (works in classic AND flow mode). A raw throw discards the
    // returned response, so failFile rides the accumulated infoLog (input summary + the ☒ reason) along as the Error message, thrown with a leading \n so the
    // log starts on its own line instead of glued onto Tdarr's "...Plugin error! Error:" wrapper. The dedicated AwkFailFile type lets the body's outer catch
    // (failUnexpected) tell a DELIBERATE failure (rethrow unchanged) from an unexpected bug (annotate + wrap, still fail w/ log).
    class AwkFailFile extends Error {}
    const failFile = (msg) => {
        response.infoLog += `☒${msg}\n`;
        throw new AwkFailFile(`\n${response.infoLog}`);
    };
    const failUnexpected = (err) => {
        if (err instanceof AwkFailFile) throw err;
        response.infoLog += `☒Unexpected error: ${err && err.message ? err.message : err}\n`;
        throw new AwkFailFile(`\n${response.infoLog}`);
    };
    // ===== END SHARED: file-failure helpers =====

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file.
    // Split into labeled sections; each is byte-identical across the plugins named in its header, and a
    // plugin carries only the sections it uses. The section LABEL is the anchor (order is free). Verify any
    // edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all five awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description','visually impaired','visual impaired'], tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','hard of hearing','hoh','deaf'], tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign'],                                      tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                                              tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','music & effects','m&e','m and e'],   tag: null          },
        karaoke:          { streams:['audio'],                    keywords: ['karaoke'],                                               tag: 'Karaoke'     },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                                        tag: null          },
    };
    // -=-=-= roleTextLower  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // roleTextLower scrapes role-signal text from BOTH probes: dispositions are often incomplete and a title/description/handler can live in ffprobe OR
    // mediaInfo but not both, so we union every text field before classifying. mediaInfo is matched by StreamOrder (like resolveStreamBitrate); whole-token
    // matchesKeyword keeps generic values like "SoundHandler" inert. hasDisposition calls it repeatedly per stream, so memoize by stream object (WeakMap,
    // per-run closure - GC'd with the file, never shared across runs).
    const roleTextCache = new WeakMap();
    const roleTextLower = (s) => {
        if (roleTextCache.has(s)) return roleTextCache.get(s);
        const mi = mediaInfoFor(s);
        const text = [s.tags?.title, s.tags?.description, s.tags?.handler_name, mi?.Title, mi?.Description].filter(Boolean).join(' ').trim().toLowerCase();
        roleTextCache.set(s, text);
        return text;
    };
    // -=-=-= matchesKeyword  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Whole-token keyword matcher: a keyword matches only when not flanked by a letter/digit, so '[sdh]', 'eng-sdh', and 'sdh.' match while
    // 'deafening'/'aboriginal' do not. An internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). Keywords are
    // regex-escaped; the 'u' flag enables \p{L}/\p{N}. text must already be lowercased. The compiled regex is a pure function of the keyword list, so it is
    // memoized by keyword-array identity (WeakMap, per-run closure, GC'd with the run) instead of recompiled on every classifier call.
    const keywordRegexCache = new WeakMap();
    const matchesKeyword = (text, keywords) => {
        if (!keywords.length) return false;
        let re = keywordRegexCache.get(keywords);
        if (!re) {
            const pattern = keywords
                .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^\\p{L}\\p{N}]+'))
                .join('|');
            re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u');
            keywordRegexCache.set(keywords, re);
        }
        return re.test(text);
    };
    // -=-=-= hasDisposition  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes((s.codec_type || '').trim().toLowerCase())) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(roleTextLower(s), entry.keywords);
    };
    // -=-=-= role classifiers: isCommentary / isDescriptive / isSdh / isLyrics  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions');
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');
    // ===== END SHARED: role/disposition classifiers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last;
    // summariseStream flags them /cover.
    const IMAGE_CODECS = ['mjpeg', 'mjpegb', 'png', 'apng', 'gif', 'bmp', 'webp', 'tiff'];
    const isCoverArt = (s) => IMAGE_CODECS.includes((s.codec_name || '').trim().toLowerCase())
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: codec name resolution =====
    // -=-=-= codecAliases  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_alaw',  'g711'],   // G.711 A-law: LOSSY 8-bit companded telephony (64 kbps/ch), NOT lossless - carve out before the generic pcm_ fold
        ['pcm_mulaw', 'g711'],   // G.711 mu-law: same
        ['pcm_',   'pcm'],
        ['dsd',    'dsd'],       // DSD / SACD (1-bit): fold dsd_lsbf/dsd_msbf(_planar) to one lossless key
        ['mp4als', 'als'],       // MPEG-4 ALS: fold the mp4-wrapped spelling to the 'als' codecInfo key (a bare 'als' resolves directly)
        ['adpcm',  'adpcm'],
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= resolveCodecName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the
    // _x variant when DTS:X is detected) and eac3 into eac3atmos. Used for scoring by audioQuality (audio_clean, stream_ordering)
    // and isLosslessSource (audio_clean), and by summariseStream (all five) purely for accurate display labeling - a plugin
    // that doesn't score audio still benefits from showing "eac3atmos"/"dtsx" instead of a bare "eac3"/"dts" in its logs.
    // codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" (no subtype keyword), so longName alone can't
    // tell the subtypes apart there; we also check the stream profile ("DTS-HD MA"/"HRA"/"Express") and fall back to
    // mediaInfo's Format_Commercial_IfAny ("DTS-HD Master Audio"), which decodes the substream header. Atmos comes from
    // longName or the commercial name only - an editable title tag does not imply a real Atmos substream.
    // DTS:X detection is best-effort: MediaInfo exposes it via Format_AdditionalFeatures containing "XLL X" (vs plain
    // "XLL" for MA without X), but MediaInfo's own maintainers note this is incomplete for an undocumented format -
    // expect a real DTS:X track to sometimes still classify as the plain (non-X) subtype, never the reverse (this only
    // fires on an actual reported value, never on absence of one, so it can't produce a false positive).
    const resolveCodecName = (stream) => {
        let codec = (stream?.codec_name || '').toLowerCase().trim();
        const longName = (stream.codec_long_name || '').toLowerCase().trim();

        for (const [prefix, replacement] of codecAliases) {
            if (codec.startsWith(prefix)) {
                codec = replacement;
                break;
            }
        }

        //Do this first as there's no harm checking for additional info in the longName
        if (codec === 'dca')
            codec = 'dts';

        const profile    = (stream.profile || '').toLowerCase().trim();
        const mi         = mediaInfoFor(stream);
        const commercial = (mi?.Format_Commercial_IfAny || '').toLowerCase();
        if (codec === 'dts') {
            if      (longName.includes('master')          || profile.includes('hd ma')  || commercial.includes('master'))
                codec = 'dtsma';
            else if (longName.includes('high resolution') || profile.includes('hra')    || commercial.includes('high resolution'))
                codec = 'dtshr';
            else if (longName.includes('express')         || profile.includes('express')|| commercial.includes('express'))
                codec = 'dtsexpress';

            const DTS_X_VARIANT = { dtsma: 'dtsmax', dtshr: 'dtshrx', dts: 'dtsx', dtsexpress: 'dtsexpressx' };
            if (DTS_X_VARIANT[codec]) {
                // MediaInfo marks DTS:X with the token "XLL X" in Format_AdditionalFeatures (plain DTS-HD is "XLL"). Match it as a
                // whole trailing token (\bxll x\b) NOT a raw substring, so a hypothetical "XLL X96"/"XLL XBR" can't false-positive
                // (those core-extension tokens attach to plain DTS core, which has no XLL, but the boundary check makes the guarantee literal).
                const additionalFeatures = (mi?.Format_AdditionalFeatures || '').toLowerCase();
                // MediaInfo signal, plus an ffprobe fallback: jellyfin reports DTS:X in `profile` (e.g. "DTS-HD MA + DTS:X"), the only
                // object-audio signal when Tdarr supplies no mediaInfo track. /dts:?x/ matches "dts:x"/"dtsx"; no plain-DTS profile carries it.
                if (/\bxll x\b/.test(additionalFeatures) || /dts:?x/.test(profile))
                    codec = DTS_X_VARIANT[codec];
            }
        } else if (codec === 'eac3' && (longName.includes('atmos') || commercial.includes('atmos') || profile.includes('atmos')))
            codec = 'eac3atmos';

        return codec;
    };
    // -=-=-= codecDisplayName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Friendly single-token display string for a summary line, used only for the codecs resolveCodecName REFINES beyond the
    // bare container codec_name - the DTS subtypes and object-audio layers a raw "dts"/"eac3" hides. Any other codec falls
    // back to its own raw codec_name unchanged (so pcm_s16le keeps its bit depth, wmav2 stays wmav2, etc. - this only ever
    // ADDS subtype detail, never collapses an already-informative name). Single hyphenated tokens keep the terse token style.
    const CODEC_DISPLAY = {
        dtsma:   'dts-hd-ma',   dtsmax:      'dts-hd-ma-x',
        dtshr:   'dts-hd-hr',   dtshrx:      'dts-hd-hr-x',
        dtsx:    'dts-x',       dtsexpress:  'dts-express',   dtsexpressx: 'dts-express-x',
        eac3atmos: 'eac3-atmos', mpegh3d: 'mpeg-h',
    };
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || (stream.codec_name || 'unknown').trim().toLowerCase();
    // ===== END SHARED: codec name resolution =====
    // ===== SHARED [audio_clean, clean_and_remux, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [audio_clean, clean_and_remux, sub_worker, video_clean] =-=-=-
    // Look up a tag value case-insensitively - matroska UPPER-CASES tag keys on write, so a plugin reading its sibling's awk_* marker gets an uppercased key back. Returns the
    // raw value (or '' if absent); callers trim/decode as needed. One source so the four plugins that read each other's markers can't drift on the lookup convention.
    const getTagCI = (tags, name) => { const hit = Object.keys(tags || {}).find((k) => k.toLowerCase() === name); return hit === undefined ? '' : String(tags[hit] ?? ''); };
    // ===== END SHARED: case-insensitive tag lookup =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Find the mediaInfo track corresponding to an ffprobe stream (matched by StreamOrder === ffprobe index); undefined when absent. The single join point
    // between the two probes - resolveStreamBitrate/resolveChannels/resolveLang and the per-plugin language/loop sites all go through it.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === s.index);
    // -=-=-= resolveLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Resolve a stream's language: ffprobe tags.language, then mediaInfo Language (files often tag one probe but not the other), trimmed + lowercased. Empty
    // when neither reports it; callers wanting a placeholder use `resolveLang(s) || 'und'`.
    const resolveLang = (s) => { const t = (s.tags?.language || '').trim(); return (t || (mediaInfoFor(s)?.Language ?? '')).trim().toLowerCase(); };
    // -=-=-= resolveStreamBitrate  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // ffprobe first, then mediaInfo fallbacks: ffprobe can't read per-stream bitrates from the container atom for some formats (e.g. DTS-HD MA in MP4/M4V).
    // mediaInfo order: measured BitRate, declared BitRate_Nominal, then a bytes-based measurement (StreamSize bytes * 8 / Duration seconds) - the last is a
    // real measurement (MediaInfo usually derives BitRate from it, but some containers report size+duration without a bitrate field), far better than the
    // codec-target estimate audioQuality falls back to. Returns 0 only when truly unknown. Used to enrich streams before summariseStream/audioQuality.
    const resolveStreamBitrate = (ffstream) => {
        const ffBitrate = Number(ffstream.bit_rate || 0);
        if (ffBitrate > 0) return ffBitrate;
        const ffmedia = mediaInfoFor(ffstream);
        if (!ffmedia) return 0;
        const measured = Number(ffmedia.BitRate || 0) || Number(ffmedia.BitRate_Nominal || 0);
        if (measured > 0) return measured;
        const size = Number(ffmedia.StreamSize || 0);
        const dur = Number(ffmedia.Duration || 0);
        if (size > 0 && dur > 0) {
            const bps = Math.round((size * 8) / dur);
            if (bps > 1000 && bps < 100000000) return bps;   // clamp to a plausible audio range so a stray unit (ms Duration, etc.) or corrupt size can't inject garbage
        }
        return 0;
    };

    // -=-=-= resolveChannels (+ channelsFromLayout helper)  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Resolve an audio stream's channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string
    // from ffprobe channel_layout or mediaInfo ChannelLayout/ChannelPositions - "5.1(side)" -> 6, "stereo" -> 2, "FL+FR+LFE" -> 3. Returns 0 only when no
    // source reports it, so channel-dependent logic (scoring, dedup, downmix, labelling, codec forcing) stays correct for tracks whose ffprobe entry omits it.
    const channelsFromLayout = (layout) => {
        const s = String(layout || '').toLowerCase().trim();
        if (!s) return 0;
        if (s === 'mono') return 1;
        if (s === 'stereo' || s === 'downmix') return 2;
        if (s === 'quad') return 4;
        const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);              // "5.1"->6, "7.1(side)"->8, "7.1.4" Atmos -> 12 (front + LFE + height)
        if (m) return Number(m[1]) + Number(m[2]) + Number(m[3] || 0);
        const tokens = s.split(/[+\s,]+/).filter((t) => t && !t.endsWith(':'));   // "FL+FR+FC+LFE" -> 4; drop MediaInfo ChannelPositions labels ("Front:", "Side:")
        return tokens.length > 1 ? tokens.length : 0;
    };
    const resolveChannels = (ffstream) => {
        const ff = Number(ffstream.channels || 0);
        if (ff > 0) return ff;
        const ffmedia = mediaInfoFor(ffstream);
        const miChannels = Number(ffmedia?.Channels || 0);
        if (miChannels > 0) return miChannels;
        return channelsFromLayout(ffstream.channel_layout || ffmedia?.ChannelLayout || ffmedia?.ChannelPositions);
    };

    // -=-=-= enrichStream  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Enrich a stream with both-probe bitrate + channels before summariseStream/audioQuality/scoring, so ffprobe-unreadable values (e.g. DTS-HD MA
    // bitrate in MP4) fall back to mediaInfo. Every summary and scoring call site uses this so logged tokens and the scoring path enrich identically.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= is10Bit  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // True when a video stream is 10-bit (or deeper): raw sample depth or mediaInfo BitDepth >= 10, a 10-bit pixel format (p10le/p10be), or a 10-bit
    // profile (Main 10 / High 10). Single source for summariseStream's 10bit token and video_clean's re-encode depth decision so the two can't drift.
    const is10Bit = (s, mi = mediaInfoFor(s)) => Number(s.bits_per_raw_sample || mi?.BitDepth || 0) >= 10
        || /p10(le|be)?$|10le|10be/.test((s.pix_fmt || '').toLowerCase()) || /10/.test((s.profile || '').toLowerCase());
    // -=-=-= FONT_EXTS + isFontMime  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Embedded-font filename extensions + a font-mimetype test, shared by summariseStream's [attach:...] token and clean_and_remux's attachmentKind font classification.
    const FONT_EXTS = ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'];
    const isFontMime = (mime) => /font|truetype|opentype|sfnt/.test(mime);
    // -=-=-= HDR_TRANSFERS  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // The HDR transfer curves: ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg).
    // The single source for every HDR-curve test: summariseStream's vHdr token below, and video_clean's isHdr / dvNoBaseLayer / tonemap-setparams gate.
    const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
    // -=-=-= DYNAMIC_HDR_RE  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Recognises dynamic HDR (HDR10+) from a lowercased HDR_Format string. Matches the spellings real files use: 'hdr10+', 'hdr10 plus', and 'smpte st 2094'.
    // Bare '2094' suffices - only HDR10+ carries a 2094 block (plain HDR10 is SMPTE ST 2086). summariseStream's HDR10+ token and video_clean's isDynamicHdr
    // both read it, so the display token and the protective re-encode skip cannot disagree. DV is recognised separately (isDolbyVisionVideo / dvSignal).
    const DYNAMIC_HDR_RE = /2094|hdr10\+|hdr10 plus/;
    // -=-=-= summariseStream  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Per type: video codec + resolution/10bit/hdr (+/cover for cover-art/still images); data & attachment codec only. Audio & subtitle append /default, then their role markers.
    // Audio role markers: /commentary|/description then /dub|/original. Subtitle: /forced then /commentary|/description|/sdh|/lyrics.
    // /default and /forced read the REAL disposition flag only — a title keyword must not flip a selection flag (as forced already did).
    // The role markers mirror the sorting logic (flag OR title keyword, via the shared classifiers) so every plugin's summary lines up.
    // subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Audio uses codecDisplayName so a DTS subtype
    // or object-audio layer the container codec_name hides (dts-hd-ma, eac3-atmos, dts-express-x) shows in the token. Shared verbatim across all five.
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = resolveLang(s) || 'und';
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video') {
            const vmi = mediaInfoFor(s);
            const vHeight = Number(s.height || vmi?.Height || 0);
            const vTenbit = is10Bit(s, vmi);
            const vXfer = (s.color_transfer || vmi?.transfer_characteristics || '').toLowerCase().trim();
            const vHdr = HDR_TRANSFERS.includes(vXfer) || !!String(vmi?.HDR_Format || '').trim();
            // HDR sub-type marker, shown in place of 'hdr'. Dolby Vision via the shared isDolbyVisionVideo (fourcc / mediaInfo HDR_Format / DOVI record) - also
            // surfacing Profile-5 DV whose non-standard transfer sets no hdr flag. HDR10+ (DYNAMIC_HDR_RE) is stream-visible only via mediaInfo (ffprobe
            // carries 2094-40 per-frame, which Tdarr doesn't probe), so it degrades to plain 'hdr' when mediaInfo is absent.
            const vHdrFmt = String(vmi?.HDR_Format || vmi?.HDR_Format_Compatibility || '').toLowerCase();
            const vDv = isDolbyVisionVideo(s, vmi);
            const vHdrTok = vDv ? 'dv' : (DYNAMIC_HDR_RE.test(vHdrFmt) ? 'hdr10+' : (vHdr ? 'hdr' : ''));
            const vParts = [codec, vHeight > 0 ? `${vHeight}p` : '', vTenbit ? '10bit' : '', vHdrTok].filter(Boolean).join(' ');
            return `[video:${vParts}${isCoverArt(s) ? '/cover' : ''}]`;
        }
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            const prov = hasDisposition(s, 'dub') ? '/dub' : (hasDisposition(s, 'original') ? '/original' : '');
            // Dolby Surround EX marker (a rear channel matrix-folded into a 5.1 AC-3), read inline from mediaInfo Format_Settings_Mode - the flag's only home
            // (this shared helper can't call audio_clean's local isMatrixSurroundSource). Marks the EX copy so its token differs from a plain 5.1 twin.
            const surEx = /surround ex/i.test(mediaInfoFor(s)?.Format_Settings_Mode || '') ? 'dd-ex' : '';
            return `[audio:${[lang, ch, surEx, codecDisplayName(s), rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = hasDisposition(s, 'forced') ? '/forced' : '';   // flag OR title keyword, same test the classifiers use - so the summary token and the sort key can never disagree
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}]`;
        }
        if (type === 'attachment') {
            // codec_name is often absent/'none' on attachments (fonts especially). Fall back to the filename extension, then the mimetype: fonts read 'font',
            // everything else uses the mimetype SUBTYPE (image/png -> png, text/html -> html) so a removed attachment is legible by what it actually is.
            let label = codec;
            if (label === 'unknown' || label === 'none') {
                const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
                const fname = (s.tags?.filename || '').trim().toLowerCase();
                const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
                const sub   = mime.includes('/') ? mime.slice(mime.indexOf('/') + 1).replace(/^x-/, '') : '';
                if (FONT_EXTS.includes(ext)) label = ext;
                else if (isFontMime(mime)) label = 'font';
                else if (ext) label = ext;
                else if (sub) label = sub;
            }
            return `[attach:${label}]`;
        }
        if (type === 'data') {
            // Prefer a meaningful codec_name; when it's absent/generic, surface the mimetype SUBTYPE (text/html -> html) so a removed data stream is legible.
            const dmime = (s.tags?.mimetype || '').trim().toLowerCase();
            const dsub = dmime.includes('/') ? dmime.slice(dmime.indexOf('/') + 1).replace(/^x-/, '') : '';
            return `[data:${(codec === 'unknown' || codec === 'none') && dsub ? dsub : codec}]`;
        }
        return `[${type || 'unknown'}:${codec}]`;
    };

    // -=-=-= globalOutputOpt  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Output-side ffmpeg options applied to EVERY run (the place for any universal muxer/output flag). Two flags: -max_muxing_queue_size 9999 raises the
    // muxer packet-buffer ceiling for ffmpeg's "Too many packets buffered" interleave error (chiefly a transcode/recovery concern; mostly vestigial on
    // ffmpeg 7.x which auto-sizes the queue, but cheap insurance); -flush_packets 0 buffers muxer writes instead of flushing per packet - the throughput-
    // optimal choice for FILE muxing (helps high-latency/network temp storage, negligible cost when local), so it is always applied, not exposed as a toggle.
    const globalOutputOpt = ' -max_muxing_queue_size 9999 -flush_packets 0';

    // -=-=-= streamTag  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // infoLog stream tag: the SOURCE ffprobe index of the stream a line concerns, as a fixed 5-char field so columns line up ([s 0],[s 9],[s10],[s99];
    // an index >=100 widens to [s100]). Sits right after the status symbol, before any [input=value] tag. Used only where a line is about ONE source
    // stream - omitted on whole-file summaries and on brand-new/appended streams (imports, downmix appends) that have no source index of their own.
    const streamTag = (index) => `[s${String(index).padStart(2, ' ')}]`;
    // ===== END SHARED: stream / language / preset helpers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language matching =====
    // Normalize any language identifier to a stable comparison key so en / eng / EN / English / en-US - and ISO 639-2/B vs /T (fre vs fra) - all
    // compare equal, letting each plugin's language-list input accept one form and match every equivalent tag. Node ships full ICU, so no table or
    // module is needed. video_clean does no language matching, so it is the one plugin that does NOT carry this section.
    // -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'.
    const shortLang = (l) => l.replace(/[-_.].*$/, '');
    // -=-=-= langNameIndex  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Reverse map English language NAME -> 2-letter code (english->en), built once per run by probing every aa..zz pair (fallback:'none' returns
    // undefined for the invalid pairs, leaving the 190 real ISO 639-1 languages). Lazily built on first spelled-out name, then memoised for the run.
    const langNameIndex = (() => {
        let idx = null;
        return () => {
            if (idx) return idx;
            idx = {};
            const dn = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
            for (let a = 97; a <= 122; a++) for (let b = 97; b <= 122; b++) {   // 97-122 = ASCII a-z: every 2-letter combo
                const code = String.fromCharCode(a, b);
                const name = dn.of(code);
                if (name) idx[name.toLowerCase()] = code;
            }
            return idx;
        };
    })();
    // -=-=-= langKey  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Comparison key for a language token: lowercase/trim, strip any region/variant via shortLang, map a spelled-out English name to its code, then fold
    // code variants with Intl.getCanonicalLocales (eng->en, fre/fra->fr). Undetermined / non-language tokens (und, mul, zxx, mis, reserved qaa-qtz) and
    // anything unrecognised pass through unchanged, so they only ever match themselves.
    const langKey = (x) => {
        let s = shortLang(String(x || '').trim().toLowerCase());
        if (!s) return '';
        if (s.length >= 4 && langNameIndex()[s]) s = langNameIndex()[s];   // spelled-out English name -> its 2-letter code
        try { return String(Intl.getCanonicalLocales(s)[0] || s).toLowerCase(); } catch (e) { return s; }
    };
    // ===== END SHARED: language matching =====

    // ===== SHARED [clean_and_remux, audio_clean, sub_worker, stream_ordering, video_clean]: dolby vision detection =====
    // -=-=-= isDolbyVisionVideo  [clean_and_remux, audio_clean, sub_worker, stream_ordering, video_clean] =-=-=-
    // True when a video stream carries Dolby Vision, both-probe: a dvhe/dvh1/dvav/dva1/dav1 fourcc, a mediaInfo HDR_Format naming Dolby Vision, or an ffprobe
    // DOVI configuration record / dolby-vision side_data. The four -c copy plugins add `-strict unofficial` to an mp4/mov remux with it, so ffmpeg's mov
    // muxer keeps the dvcC/dvvC config boxes (a plain copy drops them, demoting DV to plain HEVC - verified on a real sample). video_clean uses it only for
    // the summariseStream [video:...dv] display token; its guard_dv ENCODE routing uses the NARROWER dvSignal (needs a parsed DOVI record) instead, since
    // libx265 -dolbyvision hard-requires a real RPU (see the note there). Pass the stream's paired mediaInfo (mediaInfoFor(stream)); a single-probe false
    // negative would silently lose the boxes.
    const isDolbyVisionVideo = (ffstream, ffmedia) => /^(dvhe|dvh1|dvav|dva1|dav1)$/.test((ffstream?.codec_tag_string || '').toLowerCase().trim())
        || String(ffmedia?.HDR_Format || ffmedia?.HDR_Format_Compatibility || '').toLowerCase().includes('dolby vision')
        || (Array.isArray(ffstream?.side_data_list) ? ffstream.side_data_list : []).some((sd) => /dovi configuration record|dolby vision/i.test(String(sd?.side_data_type || '')));
    // ===== END SHARED: dolby vision detection =====

    // ===== SHARED [audio_clean, clean_and_remux]: language list match =====
    // -=-=-= langListMatch  [audio_clean, clean_and_remux] =-=-=-
    // True when a stream's language matches any entry in a pre-normalised key list (keys = userList.map(langKey), computed once per run). Only these two plugins match a
    // stream language against a user list; stream_ordering/sub_worker use langKey directly (indexOf / Set), so they carry langKey but not this helper.
    const langListMatch = (streamLang, keys) => keys.includes(langKey(streamLang));
    // ===== END SHARED: language list match =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg metadata escaping =====
    // -=-=-= escMeta  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Tdarr does NOT pass the preset through a shell - it splits the string into a quote-aware argv array and hands it to child_process.spawn, so shell
    // metacharacters ($ ` ; |) are inert and reach ffmpeg as literal metadata bytes. The only injection vector is breaking out of the quoted value to
    // inject a new ffmpeg ARGUMENT, which needs a double quote (to close the wrapper) or a control character. Tdarr's tokenizer strips quotes with no
    // reliable backslash-escape convention, so we substitute rather than strip:
    //    backslash          -> forward-slash (readable, inert)
    //    double-quote       -> single-quote (safe inside the quoted value; preserves titles like "Director's Cut" and "AC3/Stereo")
    //    control characters -> space (avoids fusing words that a bare delete would join).
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')  // control characters (newlines, null bytes, etc.) → space
        .replace(/\\/g, '/')               // backslash → forward-slash (inert, readable)
        .replace(/"/g, "'");               // double-quote → single-quote (safe inside the quoted value)
    // ===== END SHARED: ffmpeg metadata escaping =====

    // Bail out gracefully on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Input validation. Order mirrors the Inputs array in details(); every type:'string' input is checked. The two free-text inputs (language_fill,
    // language_sub) have no fixed option set, so they are checked against the LANGUAGE RECOGNISER instead (knownLangToken below) - a typo in either
    // silently changes which streams survive, so neither is left unchecked. type:'boolean' inputs (remove_comments/remove_busytitle) are coerced to a real
    // true/false by loadDefaultValues (any out-of-set value becomes false), so a guard on them would be dead code. container is validated first (input #1)
    // and before the dstContainer parse below so an empty value fails cleanly rather than a raw TypeError. Remaining checks run after all inputs parse.
    if (!inputs.container || inputs.container === '')
        failFile(`[container=${inputs.container || ''}] not configured, check your settings`);

    const srcContainer = file.container.toLowerCase().trim();
    const dstContainer = inputs.container.toLowerCase().trim();
    // Membership guard (mirrors the sibling string-dropdown guards below): all container-specific logic branches on the literals mkv/mp4, so an out-of-set value
    // (only reachable via a hand-edited/imported config) would silently fall through to a generic remux into an unsupported container - a runtime ffmpeg muxer
    // error instead of a clean quarantine. Fail up front with the plugin's own infoLog, exactly like the sibling dropdown guards after the input parses.
    if(!['mkv', 'mp4'].includes(dstContainer))
        failFile(`[container=${dstContainer}] invalid value, check your settings`);
    response.container = `.${dstContainer}`;

    // Recovery modes: two symptom dropdowns, each disabled/light/aggressive. light = no-data-loss flags only; aggressive adds the side-effect ones.
    // Values outside the dropdown are rejected below (failFile) rather than silently no-op'd. tsLight/dataLight are "light-and-up" (true for light+aggressive).
    const recoverTs = String(inputs.recover_bad_timestamps).toLowerCase().trim();
    const recoverData = String(inputs.recover_bad_data).toLowerCase().trim();
    const tsLight = recoverTs === 'light' || recoverTs === 'aggressive';
    const tsAgg = recoverTs === 'aggressive';
    const dataLight = recoverData === 'light' || recoverData === 'aggressive';
    const dataAgg = recoverData === 'aggressive';
    const tagDisposition = String(inputs.tag_disposition || 'disabled').toLowerCase();
    const tagTitle = String(inputs.tag_title || 'disabled').toLowerCase();
    const applies = (opt, type) => opt === 'both' || opt === type;
    const metaCommentRemove = String(inputs.remove_comments) === 'true';
    const metaBusyTitleRemove = String(inputs.remove_busytitle) === 'true';
    const removeImageSubs = String(inputs.remove_imagesubs || 'unsupported').toLowerCase();

    const fillLanguage = (inputs.language_fill ? inputs.language_fill.toLowerCase().trim() : '');
    const subLanguage = inputs.language_sub.toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    // Pre-normalise the user language list to comparison keys once (langKey folds en/eng/english/en-US and 639-2/B vs /T) - the filter matches against these.
    const subLangKeys = subLanguage.map(langKey);
    const fillMode = String(inputs.language_fill_mode || 'single-or-error').toLowerCase();
    const removeSubSdh = String(inputs.remove_sub_sdh || 'disabled').toLowerCase();
    const tagLanguage = String(inputs.tag_language || 'invalid').toLowerCase();
    const methodTagLanguage = String(inputs.method_tag_language || 'container').toLowerCase();
    const guardAudioLanguage = String(inputs.guard_audio_language || 'disabled').toLowerCase();

    // ===== SHARED [audio_clean, clean_and_remux, sub_worker]: language display name =====
    // -=-=-= langDisplayName  [audio_clean, clean_and_remux, sub_worker] =-=-=-
    // Memoised ICU DisplayNames (built once, reused): the recognised English name for an ALREADY-normalised language code, or '' for a non-language/unknown
    // code. A fresh ICU instance per call is wasteful. Each caller normalises the token first - clean_and_remux via shortLang (tag recognition), audio_clean
    // and sub_worker via langKey (free-text language-list validation / sidecar name recognition).
    const langDisplayName = (() => {
        let dn = null;
        return (code) => { try { dn = dn || new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }); return dn.of(code) || ''; } catch (e) { return ''; } };
    })();
    // ===== END SHARED: language display name =====
    // Recognised language name for a tag's primary subtag, or '' - tells a real code (en, eng) from a spelled-out name ("english") or garbage (via shortLang, so a
    // spelled-out name or region tag folds to its base first). Used by the language_fill validation below and once per tagged stream via storesCleanly.
    const langName = (tag) => langDisplayName(shortLang(String(tag).toLowerCase()));

    // A recognised language token, given its already-folded langKey: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to a base
    // code) or a valid special/private code (und/mul/zxx/mis/qaa-qtz, mirroring isNonLang). Both free-text language inputs are checked through this, so
    // an unrecognised token (typo/garbage) fails the file rather than silently changing which streams survive.
    const knownLangToken = (key) => key === 'und' || key === 'mul' || key === 'zxx' || key === 'mis' || /^q[a-t][a-z]$/.test(key) || !!langName(key);
    // The failFile message echoes the offending token capped at 200 chars: free text is unbounded and Tdarr persists the whole error message.
    const failLangToken = (name, token) => failFile(`[${name}=${String(token ?? '').slice(0, 200)}] not a recognised language - use an ISO-639 code (en/eng/fre), an English name (English), a BCP-47 tag (pt-BR), or a special code (und/mul/zxx/mis/qaa-qtz)`);
    // Value checks continue in Inputs order (container already checked above), with ONE deliberate exception: language_sub's tokens are checked before the
    // language_fill/language_sub cross-check, which can only give a sensible message once both lists are known-good. Then the remaining dropdowns are checked
    // against their option set (boolean inputs need no check - see above).
    // A bad language_fill would be written into a stream and demote it downstream; a bad language_sub is worse - the keep test only asks whether the list is
    // non-empty, so ONE unrecognised token makes every subtitle fail the match and get mapped out on a remux that reports success.
    if(fillLanguage && !knownLangToken(langKey(fillLanguage)))
        failLangToken('language_fill', inputs.language_fill);
    for(let i = 0; i < subLangKeys.length; i++)
        if(!knownLangToken(subLangKeys[i])) failLangToken('language_sub', subLanguage[i]);
    // If fillLanguage is set it should be a subtitle that's kept. (There is no audio equivalent: audio_clean owns audio language, and it reads the tag
    // this plugin has already written rather than language_fill itself, so there is nothing here to cross-check against.)
    if(fillLanguage && subLanguage.length > 0 && !subLangKeys.includes(langKey(fillLanguage)))
        failFile(`[language_fill=${fillLanguage}] not in language_sub - untagged subtitle streams would be removed; add it to language_sub or clear language_fill`);
    if(!['single-or-error', 'force-any'].includes(fillMode))
        failFile(`[language_fill_mode=${fillMode}] invalid value, check your settings`);
    if(!['disabled', 'enabled'].includes(removeSubSdh))
        failFile(`[remove_sub_sdh=${removeSubSdh}] invalid value, check your settings`);
    if(!['disabled', 'audio', 'subtitle', 'both'].includes(tagDisposition))
        failFile(`[tag_disposition=${tagDisposition}] invalid value, check your settings`);
    if(!['disabled', 'audio', 'subtitle', 'both'].includes(tagTitle))
        failFile(`[tag_title=${tagTitle}] invalid value, check your settings`);
    if(!['disabled', 'invalid', 'strict'].includes(tagLanguage))
        failFile(`[tag_language=${tagLanguage}] invalid value, check your settings`);
    if(!['639-2/b', '639-2/t', 'container', 'bcp47'].includes(methodTagLanguage))
        failFile(`[method_tag_language=${methodTagLanguage}] invalid value, check your settings`);
    if(!['disabled', 'light', 'aggressive'].includes(recoverData))
        failFile(`[recover_bad_data=${recoverData}] invalid value, check your settings`);
    if(!['disabled', 'light', 'aggressive'].includes(recoverTs))
        failFile(`[recover_bad_timestamps=${recoverTs}] invalid value, check your settings`);
    if(!['disabled', 'enabled'].includes(guardAudioLanguage))
        failFile(`[guard_audio_language=${guardAudioLanguage}] invalid value, check your settings`);
    if(!['unsupported', 'all', 'export'].includes(removeImageSubs))
        failFile(`[remove_imagesubs=${removeImageSubs}] invalid value, check your settings`);

    // ====== LANGUAGE TAG CANONICALIZATION ======
    // Write-side helpers: this is the only plugin that WRITES container language tags via tag_language/language_fill; langKey/langListMatch (matching) are shared, the
    // ISO639_2_B/toCanonicalTag write-side logic below is clean_and_remux-only. Verified on this build: mp4's mdhd stores only a lowercase 3-letter ISO 639-2 code (2-letter /
    // uppercase / region are silently dropped, so a plain mkv->mp4 remux of an "en"-tagged stream loses its language), mkv stores any recognised code; und/mul/zxx/mis are never rewritten.
    // ===== SHARED [clean_and_remux, sub_worker]: iso639-1 to iso639-2 map =====
    // -=-=-= ISO639_1_TO_2  [clean_and_remux, sub_worker] =-=-=-
    // ISO 639-1 (2-letter) -> ISO 639-2/T (terminologic 3-letter), complete for every current 639-1 code; each row verified to name the same language via ICU. Both writers map
    // to /T for an mp4 target (its mdhd stores only a 3-letter code): clean_and_remux via toCanonicalTag/method_tag_language, sub_worker via to6392T on subtitle import.
    const ISO639_1_TO_2 = {
        aa:'aar',ab:'abk',ae:'ave',af:'afr',ak:'aka',am:'amh',an:'arg',ar:'ara',as:'asm',av:'ava',ay:'aym',az:'aze',ba:'bak',be:'bel',bg:'bul',
        bh:'bih',bi:'bis',bm:'bam',bn:'ben',bo:'bod',br:'bre',bs:'bos',ca:'cat',ce:'che',ch:'cha',co:'cos',cr:'cre',cs:'ces',cu:'chu',cv:'chv',
        cy:'cym',da:'dan',de:'deu',dv:'div',dz:'dzo',ee:'ewe',el:'ell',en:'eng',eo:'epo',es:'spa',et:'est',eu:'eus',fa:'fas',ff:'ful',fi:'fin',
        fj:'fij',fo:'fao',fr:'fra',fy:'fry',ga:'gle',gd:'gla',gl:'glg',gn:'grn',gu:'guj',gv:'glv',ha:'hau',he:'heb',hi:'hin',ho:'hmo',hr:'hrv',
        ht:'hat',hu:'hun',hy:'hye',hz:'her',ia:'ina',id:'ind',ie:'ile',ig:'ibo',ii:'iii',ik:'ipk',io:'ido',is:'isl',it:'ita',iu:'iku',ja:'jpn',
        jv:'jav',ka:'kat',kg:'kon',ki:'kik',kj:'kua',kk:'kaz',kl:'kal',km:'khm',kn:'kan',ko:'kor',kr:'kau',ks:'kas',ku:'kur',kv:'kom',kw:'cor',
        ky:'kir',la:'lat',lb:'ltz',lg:'lug',li:'lim',ln:'lin',lo:'lao',lt:'lit',lu:'lub',lv:'lav',mg:'mlg',mh:'mah',mi:'mri',mk:'mkd',ml:'mal',
        mn:'mon',mr:'mar',ms:'msa',mt:'mlt',my:'mya',na:'nau',nb:'nob',nd:'nde',ne:'nep',ng:'ndo',nl:'nld',nn:'nno',no:'nor',nr:'nbl',nv:'nav',
        ny:'nya',oc:'oci',oj:'oji',om:'orm',or:'ori',os:'oss',pa:'pan',pi:'pli',pl:'pol',ps:'pus',pt:'por',qu:'que',rm:'roh',rn:'run',ro:'ron',
        ru:'rus',rw:'kin',sa:'san',sc:'srd',sd:'snd',se:'sme',sg:'sag',si:'sin',sk:'slk',sl:'slv',sm:'smo',sn:'sna',so:'som',sq:'sqi',sr:'srp',
        ss:'ssw',st:'sot',su:'sun',sv:'swe',sw:'swa',ta:'tam',te:'tel',tg:'tgk',th:'tha',ti:'tir',tk:'tuk',tl:'tgl',tn:'tsn',to:'ton',tr:'tur',
        ts:'tso',tt:'tat',tw:'twi',ty:'tah',ug:'uig',uk:'ukr',ur:'urd',uz:'uzb',ve:'ven',vi:'vie',vo:'vol',wa:'wln',wo:'wol',xh:'xho',yi:'yid',
        yo:'yor',za:'zha',zh:'zho',zu:'zul',
    };
    // ===== END SHARED: iso639-1 to iso639-2 map =====
    // The 20 languages whose 639-2/B (bibliographic) code differs from /T above, keyed by 639-1. method_tag_language=639-2/b uses these; /t uses the table.
    const ISO639_2_B = {
        sq:'alb',hy:'arm',eu:'baq',bo:'tib',my:'bur',zh:'chi',cs:'cze',nl:'dut',ka:'geo',de:'ger',el:'gre',is:'ice',mk:'mac',mi:'mao',ms:'may',
        fa:'per',ro:'rum',sk:'slo',cy:'wel',fr:'fre',
    };
    // Undetermined / non-language codes we never rewrite (und, mul, zxx, mis, reserved qaa-qtz).
    const isNonLang = (k) => k === 'und' || k === 'mul' || k === 'zxx' || k === 'mis' || /^q[a-t][a-z]$/.test(k);
    // Canonical BCP-47 tag keeping the region/script subtag (mkv write side, bcp47 method only); '' for a bare code, non-language, or unrecognised region tag.
    // getCanonicalLocales folds+cases the base and keeps region/script (por-BR->pt-BR, PT-br->pt-BR, eng-US->en-US, zh-Hans, es-419); langName rejects a garbage
    // base (xx-YY) and getCanonicalLocales throws on malformed input (_ . normalised to - first). container / 639-2 / mp4 targets never call this (they fold region).
    const canonicalRegionTag = (x) => {
        const raw = String(x || '').trim().toLowerCase().replace(/[_.]/g, '-');
        if (!raw.includes('-')) return '';                          // bare code -> existing 2-letter / 639-2 path
        if (!langName(raw)) return '';                              // unrecognised base -> fold via existing path
        try { const c = Intl.getCanonicalLocales(raw)[0] || ''; return c.includes('-') ? c : ''; }
        catch (e) { return ''; }
    };
    // The canonical language code to WRITE, per method_tag_language + destination container. '' => leave as-is (undetermined / non-language / unmappable).
    const toCanonicalTag = (x) => {
        const key = langKey(x);
        if (!key || isNonLang(key)) return '';
        const three = (wantB) => {
            if (key.length !== 2) return key;                        // already a 3-letter-only code (fil, yue) -> canonical as-is
            const t = ISO639_1_TO_2[key];
            if (!t) return key;
            return wantB ? (ISO639_2_B[key] || t) : t;
        };
        if (methodTagLanguage === 'bcp47')     return dstContainer === 'mp4' ? three(false) : (canonicalRegionTag(x) || key);   // mkv: keep region/script (pt-BR); mp4: 639-2/T
        if (methodTagLanguage === 'container') return dstContainer === 'mp4' ? three(false) : key;                              // mkv: 2-letter BCP-47 (region folded); mp4: 639-2/T
        return three(methodTagLanguage === '639-2/b');                                                                          // single 3-letter form for both containers
    };
    // True when an already-present tag stores cleanly in dstContainer AS a recognised code (drives tag_language=invalid: leave these, fix the rest).
    const storesCleanly = (rawTag) => {
        const s = String(rawTag || '').trim();
        if (!s || isNonLang(langKey(s))) return true;               // blank / non-language -> not a rewrite candidate
        if (!langName(s)) return false;                             // spelled-out name or garbage -> fix
        // mkv: only an ALREADY-canonical region/script tag (pt-BR, zh-Hans) stores cleanly; a non-canonical one (EN-US, en_us, pt-br) is repaired (invalid keeps the
        // region and canonicalises it, strict enforces the method form). mp4 falls through and folds any region tag to 639-2/T.
        if (dstContainer !== 'mp4' && /[-_.]/.test(s)) return canonicalRegionTag(s) === s;
        if (s !== s.toLowerCase()) return false;                    // uppercase -> mp4 drops it / non-standard casing -> fix
        return dstContainer === 'mp4' ? /^[a-z]{3}$/.test(s) : /^[a-z]{2,3}$/.test(s);   // mp4 needs lowercase 3-letter; mkv keeps a bare 2/3-letter code
    };
    // A blank/und stream adopts language_fill only when filling is allowed for that stream and the fill is a real language (langKey 'und' fills nothing, so an und-fill can't
    // perpetually re-remux). Single predicate so the language the remove_sub_sdh pre-check filters on (resolveWorkLang) and the tag canonicalLangMeta writes derive from the SAME rule.
    const fillApplies = (sl, allowFill) => allowFill && fillLanguage && langKey(fillLanguage) !== 'und' && (!sl || sl === 'und');
    // Language tag to WRITE for a kept video/audio/subtitle stream, plus the language to filter on. Blank container tag + language_fill (audio/subtitle only): fill it (canonical
    // form always for mp4 - its mdhd stores only a 3-letter code - and when tag_language is on for mkv; else the raw fill on mkv, which round-trips it). Non-blank: canonicalise
    // per tag_language (invalid = only tags storesCleanly rejects; strict = every tag). und/non-language is never written. Returns { workLang, meta, log }.
    const canonicalLangMeta = (typeLetter, idx, ffstream, typeWord, allowFill) => {
        const rawTag = (ffstream.tags?.language || '').trim();
        const sl = resolveLang(ffstream);
        const blank = !sl || sl === 'und';
        const filled = fillApplies(sl, allowFill);
        let workLang = filled ? fillLanguage : (sl || 'und'), desired = '';
        if (filled) {
            // A fill is a WRITE of a NEW tag, never a preserved user tag, so it is ALWAYS canonicalised - tag_language=disabled means "don't rewrite EXISTING
            // tags", not "write an unrecognised string into a blank one" (language_fill accepts a spelled-out "English", which Matroska's Language element
            // cannot store as a code). mkv keeps a valid region/script subtag so a pt-BR fill survives (as the repair branch does); mp4's mdhd stores only a
            // lowercase 3-letter code.
            desired = (tagLanguage !== 'disabled' || dstContainer === 'mp4')
                ? toCanonicalTag(fillLanguage)
                : (canonicalRegionTag(fillLanguage) || toCanonicalTag(fillLanguage));
        } else if (!blank && tagLanguage !== 'disabled' && (tagLanguage === 'strict' || !storesCleanly(rawTag))) {
            // strict enforces the method form (folds region under container/639-2); invalid only repairs syntax, so a recognised region/script tag keeps its region
            // (canonicalised: en_us -> en-US, pt-br -> pt-BR) on mkv. mp4 can't store a region, so it still folds to 639-2/T via toCanonicalTag.
            const repairRegion = tagLanguage === 'invalid' && dstContainer !== 'mp4' ? canonicalRegionTag(sl) : '';
            desired = repairRegion || toCanonicalTag(sl);
        }
        const compareTo = blank ? '' : rawTag;
        if (!desired || desired === compareTo) return { workLang, meta: '', log: '' };
        const log = blank
            ? `☐${streamTag(ffstream.index)}[language_fill=${fillLanguage}] Language blank on ${typeWord} stream - setting to "${desired}"\n`
            : `☐${streamTag(ffstream.index)}[tag_language=${tagLanguage}] Standardise ${typeWord} language - "${rawTag}" to "${desired}"\n`;
        return { workLang, meta: ` -metadata:s:${typeLetter}:${idx} "language=${escMeta(desired)}"`, log };
    };
    // ====== END LANGUAGE TAG CANONICALIZATION ======

    // Subtitle codecs dropped purely by container/format, regardless of language - never assigned language_fill (counted separately by the
    // language_fill_mode check below). alwaysDropSubs is unmuxable by BOTH containers: eia_608 (closed-caption data embedded in the video
    // bitstream, not a real subtitle stream) and ttml (no working ffmpeg encoder/muxer path) either way; xsub and dvb_teletext have no Matroska
    // CodecID, so mkv rejects them too. mp4OnlyDropSubs muxes fine in mkv but not mp4: the image-based PGS/VobSub/DVB formats, plus arib_caption
    // and hdmv_text_subtitle (both decode-only for mp4; hdmv_text_subtitle copies into mkv fine).
    const alwaysDropSubs  = ['eia_608', 'ttml', 'xsub', 'dvb_teletext'];
    const mp4OnlyDropSubs = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'arib_caption', 'hdmv_text_subtitle'];
    // Legacy PC/fansub text codecs with no Matroska CodecID and no native mp4 support: a bare -c copy would fail the remux, but ffmpeg decodes them as text, so BOTH
    // container branches below convert them (mkv -> srt, mp4 -> mov_text). Hoisted once so the two branches can't drift (a codec added to one list but not the other aborts a remux).
    const legacyTextSubs = ['microdvd', 'mpl2', 'jacosub', 'sami', 'realtext', 'subviewer', 'subviewer1', 'vplayer', 'pjs'];
    const subFormatDropped = (codec) => alwaysDropSubs.includes(codec)
        || (dstContainer === 'mp4' && mp4OnlyDropSubs.includes(codec));
    // Image-based subtitles (PGS/VobSub/DVB) mkv muxes natively; remove_imagesubs governs them (mp4 drops them via mp4OnlyDropSubs regardless). xsub is image-based
    // too but has no Matroska CodecID, so it lives in alwaysDropSubs (always removed) and is NOT exportable to .mks. IMAGE_SUB maps each exportable image codec to its
    // native sidecar container: PGS -> raw .sup, VobSub/DVB -> a single-stream Matroska .mks (no vobsub muxer exists), both via -c:s copy. The .mks output needs an
    // explicit -f matroska - ffmpeg only auto-detects the matroska muxer from a .mkv extension, not .mks (verified); the .sup muxer auto-detects from the extension.
    const imageSubCodecs = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle'];
    const IMAGE_SUB = { hdmv_pgs_subtitle: { ext: 'sup', fmt: 'sup' }, dvd_subtitle: { ext: 'mks', fmt: 'matroska' }, dvb_subtitle: { ext: 'mks', fmt: 'matroska' } };
    const isImageSub = (codec) => imageSubCodecs.includes(codec);
    // 'all'/'export' drop every image sub; 'unsupported' relies on subFormatDropped (container-forced) alone. imageSubDropped is the remove_imagesubs-specific drop
    // beyond subFormatDropped, used by subDroppedAnyReason for the language_fill tally + accessibility plain-track guard.
    const imageSubDropped = (codec) => isImageSub(codec) && (removeImageSubs === 'all' || removeImageSubs === 'export');

    // ===== SHARED [clean_and_remux, sub_worker]: preset path safety =====
    // -=-=-= pathIsPresetSafe  [clean_and_remux, sub_worker] =-=-=-
    // True when a real on-disk path can be embedded in a preset's quoted "${path}" token. Tdarr never shells out, but its worker tokenises each preset
    // half with a quote-aware parser before spawning ffmpeg, so a " anywhere in the path closes the wrapper mid-token and everything after it becomes
    // fresh argv entries (a raw control character breaks the token just as badly). The name parts WE generate are sanitised at their source, but the
    // library DIRECTORY is a real path that has to stay literal - it can only be checked, never rewritten - so a caller that fails this test refuses
    // that one sidecar with a ☒ line rather than emit the token.
    const pathIsPresetSafe = (p) => !/["\x00-\x1f\x7f]/.test(String(p));
    // ===== END SHARED: preset path safety =====

    // Hidden dot-prefixed sidecar name for an exported image subtitle: ".<video>.s<index>.<lang>[.forced].<ext>". The leading dot makes Plex/Jellyfin ignore it (Jellyfin
    // skips **/.* ; Plex ignores .sup/.mks by extension). Emby is the exception - it scans dot-prefixed files, so an exported .mks needs a .embyignore entry there
    // (called out in the remove_imagesubs tooltip). Both metadata-derived name parts are made safe for the quoted "${path}" in the export preset: lang is
    // restricted to the language-code charset, and imageBase (the source basename) has any " / control char stripped so a crafted video filename can't close
    // the quote and inject args. The library DIRECTORY they are joined to is NOT sanitised - it has to stay literal - so the full path is CHECKED with
    // pathIsPresetSafe at the emit site below, and the export is refused when that check fails.
    const path = require('path');
    const libFile = otherArguments?.originalLibraryFile?.file || file.file;
    const libDir = path.dirname(libFile);
    const imageBase = path.basename(libFile).replace(/\.[^.]+$/, '').replace(/["\x00-\x1f\x7f]/g, '');
    const imageSidecarName = (ffstream, ext) => {
        const lang = (resolveLang(ffstream) || 'und').replace(/[^a-z0-9-]/g, '') || 'und';
        const forced = ffstream.disposition?.forced === 1 ? '.forced' : '';
        return `.${imageBase}.s${ffstream.index}.${lang}${forced}.${ext}`;
    };
    // A subtitle removed regardless of language - by container/format (subFormatDropped) or by remove_imagesubs (imageSubDropped). Neither is ever assigned
    // language_fill, and neither counts as a survivor for the language_fill_mode untagged tally or the remove_sub_sdh plain-track guard.
    const subDroppedAnyReason = (codec) => subFormatDropped(codec) || imageSubDropped(codec);

    // ===== SHARED [audio_clean, clean_and_remux]: title canonicalization =====
    // The canonical audio-title machinery both plugins share, so audio_clean's downmix titles come out already in clean_and_remux's tag_title form and a
    // later clean_and_remux pass has nothing to reorder (no wasted remux). Canonical form: "<channel/downmix base> - <role tags>", base first and any
    // disposition roles LAST (e.g. "5.1 -> 2.0 - Commentary"). canonicalAudioTitle is the entry point; the rest are its building blocks.
    // -=-=-= channel-label vocab: channelTitleLabels / bareChannelRegex / downmixChannelRegex  [audio_clean, clean_and_remux] =-=-=-
    //The channel labels we recognise/replace for tag_title - include 2.0 to allow us to overwrite that with stereo
    const channelTitleLabels = ['7.1', '6.1', '5.1', '5.0', '4.0', '3.1', '3.0', '2.1', '2.0', 'stereo', 'mono'];
    const channelLabelAlternation = channelTitleLabels.map(l => l.replace(/\./g, '\\.')).join('|');
    //A bare channel title (the whole title is just a channel label) - we own these and may derive/overwrite them.
    const bareChannelRegex = new RegExp(`^(${channelLabelAlternation})$`, 'i');
    //A downmix/channel-derived base produced elsewhere (e.g. audio_clean "5.1 -> 2.0"): a bare channel label on BOTH sides of the "->". Requiring the left side
    //to also be a channel label keeps a rich custom title that merely ends in "-> <channel>" (e.g. "Dolby Digital Plus / 7.1 / 48 kHz / 1024 kbps -> 2.0",
    //which audio_clean builds by appending the downmix arrow to the source title) classified as custom - so it is left alone, not stripped and rewritten.
    const downmixChannelRegex = new RegExp(`^(${channelLabelAlternation})\\s*->\\s*(${channelLabelAlternation})$`, 'i');
    // -=-=-= channelLabel  [audio_clean, clean_and_remux] =-=-=-
    // Map a channel count to our short label, honouring an LFE for the 3/4-channel ambiguity (3.1 vs 4.0, 2.1 vs 3.0). Callers resolve the count (ffprobe,
    // mediaInfo, or layout via resolveChannels) and pass whether the layout string carries an LFE; a target-only caller (audio_clean naming a downmix
    // result) passes the target count with hasLfe=false.
    const channelLabel = (channels, hasLfe) => {
        switch (channels) {
            case 8: return '7.1';
            case 7: return '6.1';
            case 6: return '5.1';
            case 5: return '5.0';
            case 4: return hasLfe ? '3.1' : '4.0';
            case 3: return hasLfe ? '2.1' : '3.0';
            case 2: return 'Stereo';
            case 1: return 'Mono';
            default: return '';
        }
    };
    // -=-=-= cleanStreamTitle  [audio_clean, clean_and_remux] =-=-=-
    //Clean up titles - remove surrounding whitespace/quotes (no reason for them), and dedupe repeated segments ("Stereo / Stereo" -> "Stereo").
    //Busy-title removal (>3 periods) is applied by callers AFTER tagging, not here - roles are captured into flags before an over-dotted title clears.
    function cleanStreamTitle(rawTitle) {
        let title = (rawTitle || '').trim().replace(/^["']+|["']+$/g, '');
        if (title) {
            const parts = title.split(/\s*(?:\/|\||-|•)\s*/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
            if (parts.length === 1) return parts[0];
            // When all parts are the same word (case-insensitive), deduplicate to the first occurrence.
            // "First part wins" is intentional: preserves the leading segment's casing (e.g. "Stereo / stereo"→"Stereo", "ENGLISH - English"→"ENGLISH").
            if (parts.length > 1 && parts.every(p => p.toLowerCase() === parts[0].toLowerCase()))
                return parts[0];
        }
        return title;
    }
    // -=-=-= dispKeysFor / titleTagsFor  [audio_clean, clean_and_remux] =-=-=-
    // dispKeysFor: the dispositions valid on a stream type. titleTagsFor: the deduped canonical tag strings a stream matches (real flag OR title keyword, via
    // hasDisposition), excluding untagged flags like default/cover-art. Both derive from the shared dispositionTypes table (single source of truth).
    const dispKeysFor = (type) => Object.keys(dispositionTypes).filter(k => dispositionTypes[k].streams.includes(type));
    const titleTagsFor = (s) => [...new Set(dispKeysFor((s.codec_type || '').trim().toLowerCase())
        .filter(k => dispositionTypes[k].tag && hasDisposition(s, k)).map(k => dispositionTypes[k].tag))];
    // -=-=-= stripWords / stripDispositionWords  [audio_clean, clean_and_remux] =-=-=-
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
    // -=-=-= canonicalAudioTitle  [audio_clean, clean_and_remux] =-=-=-
    // Reduce a cleaned title to the canonical "<base> - <roles>" form. Ownership: an empty or bare-channel base is replaced by bareLabel (the stream's own
    // channel label, or a downmix target's); a "<channel> -> <channel>" downmix base is kept verbatim; any other (custom) title is returned unchanged - we
    // don't own it. roleTags (from titleTagsFor) are appended LAST. A bareLabel of '' (an unmappable channel count) leaves the title as-is rather than
    // writing a bare "- Role".
    const canonicalAudioTitle = (cleanedTitle, bareLabel, roleTags) => {
        let base = stripDispositionWords(cleanedTitle);
        if (!(!base || bareChannelRegex.test(base) || downmixChannelRegex.test(base))) return cleanedTitle;
        if (!base || bareChannelRegex.test(base)) base = bareLabel;
        if (!base) return cleanedTitle;
        const suffix = roleTags.join(' ');
        return suffix ? `${base} - ${suffix}` : base;
    };
    // ===== END SHARED: title canonicalization =====

    // Channel layout string from ffprobe, falling back to mediaInfo (ChannelLayout/ChannelPositions) - lets us spot the LFE that separates 3.1 from 4.0 and
    // 2.1 from 3.0 even when ffprobe omits channel_layout. Feeds channelLabel's hasLfe argument at the tag_title call site.
    const channelLayoutStr = (ffstream) => {
        const ffmedia = mediaInfoFor(ffstream);
        return (ffstream.channel_layout || ffmedia?.ChannelLayout || ffmedia?.ChannelPositions || '').toLowerCase();
    };
    // ffprobe's canonical layout strings for 2.1 and 3.1 are literally "2.1"/"3.1" - no "lfe" substring - so a plain .includes('lfe') misses them and channelLabel would
    // mislabel (and clobber) a 2.1 track as 3.0 / a 3.1 as 4.0. Treat a nonzero digit after the first dot ("2.1","3.1","5.1","7.1.4") as an LFE too, alongside the verbose
    // "FL+FR+LFE" form. Only channelLabel's 3ch (2.1 vs 3.0) and 4ch (3.1 vs 4.0) cases read hasLfe, so 6/8-ch labels are unaffected.
    const layoutHasLfe = (ffstream) => { const s = channelLayoutStr(ffstream); return /lfe/.test(s) || /^\d+\.[1-9]/.test(s.trim()); };

    // Classify an attachment stream so we only ever remove things we can positively identify:
    //   'image' - cover art / poster (mjpeg/png/gif/bmp, image/* mimetype, or an image filename). Always removed.
    //   'font'  - an embedded font (ttf/otf codec, a font mimetype, or a font filename extension). Removed ONLY when nothing in the output uses it (no
    //             surviving ASS/SSA subtitle). Key fix: older ffmpeg builds report codec_name 'none'/'unknown' for fonts, so we also ID by filename/mimetype,
    //             and never delete a font while a styled subtitle still needs it.
    //   'other' - anything unidentifiable (a bare 'none'/'unknown', no font/image signal). Left untouched - could be anything, never safe to remove.
    const attachmentKind = (s) => {
        const codec = (s.codec_name || '').trim().toLowerCase();
        const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s.tags?.filename || '').trim().toLowerCase();
        const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
        if (IMAGE_CODECS.includes(codec) || mime.startsWith('image/')
            || ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'jp2', 'avif', 'heic'].includes(ext))
            return 'image';
        const fontMime = isFontMime(mime);
        if (['ttf', 'otf'].includes(codec) || fontMime
            || FONT_EXTS.includes(ext))
            return 'font';
        return 'other';
    };

    // >3-period 'busy'/scene-release title test (>4 dot-segments). Callers apply it AFTER role tagging, per the cleanStreamTitle note.
    const tooManyPeriods = (s) => (s || '').trim().split('.').length > 4;

    // Sanitize a file-supplied string (title/comment/handler/filename) for embedding in a single infoLog line. These fields can contain newlines/tabs/other
    // control characters; infoLog is newline-delimited and every line must start with ☐/☑/☒, so a raw char would split it into a continuation with no
    // status symbol. Collapse control characters to a space for display only - quotes/backslashes are preserved so the logged value reads faithfully
    // (unlike escMeta, which rewrites them for ffmpeg-argument safety). Display-only, never feeds ffmpeg.
    // Also length-capped (ellipsised), for the same reason the free-text inputs are: nothing bounds a container title, several call sites echo two or three of
    // them on one line, and the whole infoLog is persisted by Tdarr - a file carrying multi-KB titles on many streams would otherwise build a multi-MB log.
    const logSafe = (value, max = 200) => {
        const s = String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');
        return s.length > max ? `${s.slice(0, max)}…` : s;
    };

    // tag_disposition: the tagged dispositions a stream matches by title (or flag) that aren't already a real flag - i.e. the keywords to promote into
    // +flags. Same predicate for audio and subtitle, so keep it here. A promotion must be able to PERSIST in the destination container, or the flag never
    // "takes" and the plugin re-promotes it on every pass (an infinite remux loop). Empirically (jellyfin-ffmpeg): Matroska has no captions/lyrics flag, and
    // MP4/MOV has no original/lyrics flag - so a +flag for one of those is silently dropped by the muxer. captions is the SDH synonym of hearing_impaired
    // (same 'SDH' tag) and hearing_impaired persists in both containers, so we promote hearing_impaired in captions' place rather than dropping the SDH role;
    // a role with no storable flag in this container (lyrics anywhere; original into mp4) is skipped - its title keyword still drives the classifiers, summary
    // and sort order, so nothing is lost but a redundant, non-persisting flag write. Dedupe by target so a track matching both SDH synonyms promotes once.
    // The set therefore lists only flags with no storable target in the container: lyrics (neither) and original (mp4 only); captions needs no entry (remapped above).
    const unstorableDisp = { mkv: new Set(['lyrics']), mp4: new Set(['original', 'lyrics']) };
    const dispositionsToPromote = (s, type) => {
        const out = []; const seen = new Set();
        for (const key of dispKeysFor(type)) {
            if (!dispositionTypes[key].tag || !hasDisposition(s, key)) continue;
            const target = key === 'captions' ? 'hearing_impaired' : key;   // canonicalise the SDH synonym to the container-portable flag
            if (s.disposition?.[target] === 1 || (unstorableDisp[dstContainer] || new Set()).has(target) || seen.has(target)) continue;
            seen.add(target); out.push(target);
        }
        return out;
    };

    // Check if file is a video. If it isn't then exit plugin. This benign skip (processFile:false) must precede the per-file CONTENT checks below - the
    // language_fill_mode / guard_audio_language pre-checks can failFile (quarantine), and a non-video file the plugin only means to skip must never be routed to the error queue.
    if (file.fileMedium !== 'video') {
        response.infoLog += '☑File is not a video\n';
        response.processFile = false;
        return response;
    }

    // remove_sub_sdh safety guard.
    // (subDroppedAnyReason/subtitle drop lists defined earlier) A "plain" subtitle carries no commentary/descriptive/SDH/lyrics role - a genuine dialogue
    // subtitle. remove_sub_sdh removes an SDH/CC subtitle only when its language still has a plain subtitle that SURVIVES the language, format, and
    // remove_imagesubs filters, so we strip extras, never the last usable track. resolveWorkLang shares canonicalLangMeta's fillApplies rule so the language this guard filters on
    // and the tag that gets written can't drift. Computed BEFORE the language_fill_mode pre-check so that check can exclude the SDH tracks this guard will drop. Audio has no
    // equivalent here: audio_clean's downmix_secondary owns audio-description removal and carries its own plain-same-language fall-back rule.
    const plainSubLangs = new Set();
    const isPlainTrack = (s) => !isCommentary(s) && !isDescriptive(s) && !isSdh(s) && !isLyrics(s);
    const hasPlainSameLang = (set, wl) => set.has(langKey(wl));
    const resolveWorkLang = (s) => { const sl = resolveLang(s); return fillApplies(sl, true) ? fillLanguage : (sl || 'und'); };
    if (removeSubSdh === 'enabled') {
        for (const s of (file.ffProbeData?.streams || [])) {
            if ((s.codec_type || '').trim().toLowerCase() !== 'subtitle' || !isPlainTrack(s)) continue;
            if (subDroppedAnyReason((s.codec_name || '').toLowerCase())) continue;
            const wl = resolveWorkLang(s);
            if (subLangKeys.length > 0 && !langListMatch(wl, subLangKeys)) continue;
            plainSubLangs.add(langKey(wl));
        }
    }

    // Summarise the input streams exactly as they arrived, before any removal/remux/quarantine, using the shared bracket helper. This plugin runs first, so it
    // captures the file as received; reading it alongside the stream-ordering plugin's output line shows where a file came from and where it ended up. Emitted
    // before the guard_audio_language / language_fill_mode pre-checks so a quarantine there carries the same input picture the no-video quarantine does. Starts with ☐.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

    // guard_audio_language: an early warning, evaluated BEFORE the remux so a file that needs attention costs nothing to find out about. audio_clean decides
    // what audio to keep, but it can only trust a track MARKED 'original' - it has no way to tell which of several untagged languages is the real one. So when
    // this file carries more than one genuine audio language and marks no original, abort and let the user tag it. Languages fold through langKey (en/eng/
    // English/en-US are one language); an untagged track counts as its own "und". Commentary/descriptive tracks are excluded - a foreign-language commentary is
    // normal and says nothing about which track is the original.
    if (guardAudioLanguage === 'enabled') {
        const audioStreams = (file.ffProbeData.streams || []).filter((s) => (s?.codec_type || '').toLowerCase() === 'audio');
        const genuineLangs = new Set(audioStreams.filter((s) => !isCommentary(s) && !isDescriptive(s)).map((s) => langKey(resolveWorkLang(s))));
        if (genuineLangs.size > 1 && !audioStreams.some((s) => hasDisposition(s, 'original')))
            failFile(`[guard_audio_language=${guardAudioLanguage}] ${genuineLangs.size} audio languages (${[...genuineLangs].join(', ')}) and none marked original - one of them could be the original language; mark the original track and requeue, or set guard_audio_language=disabled`);
    }

    // language_fill_mode pre-check - only relevant WHEN language_fill will assign a real language. That is the one case where multiple untagged streams of a type
    // are a hazard: language_fill tags them all IDENTICALLY, and a later plugin can then treat them as duplicates and remove one (silent content loss). Left
    // untagged (no language_fill, or language_fill=und) they stay "und", which audio_clean's dedup skips - so there is no collision to guard against and this does
    // nothing. The separate "several audio languages, none marked original" concern is guard_audio_language's (opt-in), not re-litigated here. Counts only untagged
    // streams that WILL REACH THE OUTPUT: an untagged subtitle dropped by the language filter, by container/format (subDroppedAnyReason), or by the remove_sub_sdh
    // guard above never reaches a later plugin. This plugin never drops audio, so every untagged audio stream reaches the output and counts. Resolves language via
    // resolveLang (ffprobe tag, then mediaInfo fallback), so a language only mediaInfo supplies is not treated as blank here.
    if (fillMode === 'single-or-error' && fillLanguage && langKey(fillLanguage) !== 'und') {
        const streams = file.ffProbeData.streams || [];
        const isUntagged = (s) => { const lang = resolveLang(s); return !lang || lang === 'und'; };
        // Inside this block language_fill assigns fillLanguage to every untagged track, so "does it survive the subtitle filter" is one check: kept when the
        // language list is empty (keep-all) or contains fillLanguage. Mirrors the main loop's own keep/drop decision.
        const keptByLangFilter = (keys) => keys.length === 0 || langListMatch(fillLanguage, keys);
        // An untagged SDH subtitle the remove_sub_sdh guard would drop is excluded too - mirrors the loop's own removal predicate (untagged tracks resolve to fillLanguage).
        const removedBySdh = (s) => removeSubSdh === 'enabled' && isSdh(s) && hasPlainSameLang(plainSubLangs, fillLanguage);
        const untaggedAudio = streams.filter((s) => (s?.codec_type || '').toLowerCase() === 'audio' && isUntagged(s)).length;
        if (untaggedAudio > 1)
            failFile(`[language_fill_mode=${fillMode}] ${untaggedAudio} audio streams have no language tag and would all be assigned "${fillLanguage}" by language_fill - may be different languages; tag them manually and requeue, or set language_fill_mode=force-any`);
        const untaggedSubs = keptByLangFilter(subLangKeys)
            ? streams.filter((s) => (s?.codec_type || '').toLowerCase() === 'subtitle'
                && !subDroppedAnyReason((s.codec_name || '').toLowerCase()) && isUntagged(s) && !removedBySdh(s)).length : 0;
        if (untaggedSubs > 1)
            failFile(`[language_fill_mode=${fillMode}] ${untaggedSubs} subtitle streams have no language tag and would all be assigned "${fillLanguage}" by language_fill - may be different languages; tag them manually and requeue, or set language_fill_mode=force-any`);
    }

    // Set up required variables.
    let extraArguments = '';
    let sidecarOut = '';   // remove_imagesubs=export: accumulates the per-image-sub sidecar outputs, prepended to the main output in the preset below.
    let fflags = '';
    let inputArgs = '';   // recovery args that must precede -i (e.g. -err_detect); placed on the input side of the preset
    let workDone = '';
    let convert = false;
    let videoDropped = 0;
    let subtitleStreamIndex = -1;
    let audioStreamIndex = -1;
    let videoStreamIndex = -1;

    // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset).
    // removedIndices: input stream positions dropped via -map -0:ffstream.index.
    // subCodecOverride: input stream position -> converted subtitle codec ('srt' / 'mov_text').
    const removedIndices = new Set();
    const subCodecOverride = new Map();

    // Font attachments whose removal is deferred until after the main loop, when we know which subtitle streams survive. Decided here (not inline) because an
    // attachment can appear before its subtitles in the file, so we cannot know whether a styled subtitle survives at the moment we reach the attachment.
    const deferredFontIndices = [];

    // One guard around all the real work (the per-stream loop plus the font/metadata/preset build below): a deliberate failFile abort (AwkFailFile)
    // rethrows unchanged, and any UNEXPECTED error fails the file too — annotated and carrying the full infoLog — instead of silently skipping. (Earlier
    // input validation runs before this and fails via failFile directly.)
    try {
        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
            const ffstream = file.ffProbeData?.streams[i];
            const ffmedia = mediaInfoFor(ffstream);
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const ffstreamType = (ffstream.codec_type || '').toLowerCase();

            //Original stream title - prefer stream title but use metadata if available. When we set tags.title both are set.
            const streamTitle = (ffstream.tags?.title || ffmedia?.Title || '');
            const streamLang = resolveLang(ffstream);
            let workLang = streamLang || 'und';

            //This will be added to the ffmpeg command if metadata needs to be changed. It will be built up as needed.
            let metadataCommand = '';
            let delStream = false;
            // Factored per-stream metadata emitter (a per-iteration closure over this stream's ffstream/i/metadataCommand): the handler_name canonicalisation (mkv wipes it - it
            // can confuse mkv title display; mp4 sets the per-type handler) is common to the subtitle/audio/video branches. Branch-specific bits (title tagging, hvc1,
            // busy-title, comment removal) stay inline; wipeReason carries video's extra "problems for titles in mkv" note so the log stays byte-identical.
            // Read the handler case-insensitively (getTagCI): matroska UPPER-CASES it to HANDLER_NAME, which mediaInfo surfaces as the Title - miss it and
            // the busy handler survives to re-trigger remove_busytitle every pass (an infinite loop). ffmpeg matches -metadata keys case-insensitively, so
            // the lowercase "handler_name=" wipe still clears the uppercase tag.
            const emitHandlerMeta = (typeLetter, idx, typeWord, handlerName, wipeReason = '') => {
                const curHandler = getTagCI(ffstream.tags, 'handler_name');
                if (dstContainer === 'mkv' && curHandler) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Wiping handler_name tag${wipeReason} (${typeWord}) "${logSafe(curHandler)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "handler_name="`;
                } else if (dstContainer === 'mp4' && curHandler !== handlerName) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Setting handler_name tag (${typeWord}) to ${handlerName} "${logSafe(curHandler)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "handler_name=${handlerName}"`;
                }
            };
            // tag_disposition (audio/subtitle): import any surfaced disposition keyword found in the title into the real flag (additive, so existing flags are kept).
            const promoteDisposition = (type, typeLetter, idx) => {
                const promote = dispositionsToPromote(ffstream, type);
                if (promote.length > 0) {
                    workDone += `☐${streamTag(ffstream.index)}[tag_disposition=${tagDisposition}] Set disposition (${type}) from title - ${promote.map(k => dispositionTypes[k].tag).join(' ')}\n`;
                    metadataCommand += ` -disposition:${typeLetter}:${idx} ${promote.map(k => `+${k}`).join('')}`;
                }
            };
            // Busy-title removal (audio/subtitle): once tag_disposition (above) has captured any role keywords into the real flags, clear an over-dotted title so
            // tag_title (below) re-names it by the usual rules - it drops in and is treated as a blank title (an empty base becomes the channel label). Returns the title.
            const clearBusyTitle = (title, titleCauses) => {
                if (metaBusyTitleRemove && tooManyPeriods(title)) {
                    titleCauses.push('remove_busytitle=true');
                    return '';
                }
                return title;
            };
            // mediaInfo surfaces the container's HANDLER (mp4 udta handler / matroska HANDLER_NAME) AS the track Title, so a track whose mediaInfo Title merely
            // echoes its own handler has no real title at all - boilerplate like SoundHandler/SubtitleHandler must never be promoted into a real title tag by
            // the reconcile branch below. Read the handler case-insensitively (getTagCI): matroska stores it uppercase.
            const mediaTitleIsHandler = () => {
                const handler = (getTagCI(ffstream.tags, 'handler_name') || '').trim().toLowerCase();
                const mediaTitle = (ffmedia?.Title ?? '').trim().toLowerCase();
                return mediaTitle !== '' && mediaTitle === handler;
            };
            // Write a changed title, or reconcile ONLY when the ffprobe tag is missing but mediaInfo has a REAL one (mediaTitleIsHandler filters the handler
            // echo): the write adds the ffprobe tag so both probes agree next pass. The reverse (ffprobe has a title mediaInfo never reports) must NOT fire, or
            // a container that never surfaces Title to mediaInfo would remux every pass.
            const reconcileTitle = (typeLetter, idx, typeWord, streamTitle, newStreamTitle, titleCauses) => {
                if (newStreamTitle !== streamTitle) {
                    workDone += `☐${streamTag(ffstream.index)}${titleCauses.length ? `[${titleCauses.join('][')}]` : ''} Change title (${typeWord}) "${logSafe(streamTitle)}" -> "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(newStreamTitle)}"`;
                } else if (ffmedia && !(ffstream.tags?.title) && (ffmedia.Title ?? '') !== '' && !mediaTitleIsHandler()) {
                    workDone += `☐${streamTag(ffstream.index)} Change title (${typeWord}) - found "${logSafe(ffstream.tags?.title ?? '')}" and "${logSafe(ffmedia?.Title ?? '')}" change to "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(newStreamTitle)}"`;
                }
            };
            // remove_comments (audio/subtitle/video): drop a stream comment tag (players rarely show it). Guard + output mirror the handler_name emitter above.
            const emitCommentRemoval = (typeLetter, idx, typeWord) => {
                if (metaCommentRemove === true && (ffstream.tags?.comment || ffmedia?.Comment)) {
                    workDone += `☐${streamTag(ffstream.index)}[remove_comments=true] Remove comment (${typeWord}) "${logSafe(ffstream.tags?.comment ?? (ffmedia?.Comment ?? ''))}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "comment="`;
                }
            };

            if(ffstreamType === 'subtitle') {
                //Start with zero based index for subtitle streams. This is only used when converting subtitle formats or changing metadata
                subtitleStreamIndex++;

                // Image subs (PGS/VobSub/DVB) are governed by remove_imagesubs: 'unsupported' drops them only where the container can't carry them (mp4), 'all' drops them
                // from any container, 'export' saves each to a hidden dot-prefixed sidecar (PGS->.sup, VobSub/DVB->.mks, both ignored by Plex/Jellyfin) before dropping.
                // Non-image subs the container can't carry (ttml/eia_608/xsub/dvb_teletext, or mp4 arib/hdmv_text) are dropped by subFormatDropped as before. A kept image
                // sub (unsupported + carriable) and every non-image sub then fall through to the language/accessibility filters below.
                // remove_imagesubs = all/export drops the image sub explicitly; export first saves a hidden dot-prefixed sidecar for external OCR. The
                // export has to SUCCEED for the drop to be safe (the sidecar is the only surviving copy), so when the joined path can't be embedded in the
                // quoted preset token (pathIsPresetSafe - a " or control char in the library directory, which has to stay literal) the export is refused
                // with a ☒ and the drop is refused with it. The stream then falls through to the container test below, which still drops it on mp4 (which
                // cannot carry an image sub at all) and keeps it on mkv. That ☒ goes straight to the infoLog rather than into workDone: it warns about the
                // ENVIRONMENT, not a queued change, and workDone is flushed only on a real remux - so a file whose only pending change WAS the refused
                // export would otherwise report "nothing requiring removal or conversion" and swallow the warning entirely.
                const imageSubDrop = isImageSub(ffstreamCodec) && imageSubDropped(ffstreamCodec);
                let exportRefused = false;
                if (imageSubDrop && removeImageSubs === 'export') {
                    const sc = IMAGE_SUB[ffstreamCodec];   // { ext, fmt } - .mks needs an explicit -f matroska; .sup auto-detects from the extension
                    const sidecarName = imageSidecarName(ffstream, sc.ext);
                    const sidecarPath = path.join(libDir, sidecarName);
                    if (pathIsPresetSafe(sidecarPath)) {
                        sidecarOut += ` -map 0:${ffstream.index} -c:s copy -f ${sc.fmt} "${sidecarPath}"`;
                        workDone += `☐${streamTag(ffstream.index)}[remove_imagesubs=export] Export image subtitle -> ${sidecarName} for external OCR (before drop)\n`;
                    } else {
                        exportRefused = true;
                        response.infoLog += `☒${streamTag(ffstream.index)}[remove_imagesubs=export] Library directory contains a quote or control character - cannot write ${sidecarName} safely, keeping the subtitle\n`;
                    }
                }
                if (imageSubDrop && !exportRefused) {
                    workDone += `☐${streamTag(ffstream.index)}[remove_imagesubs=${removeImageSubs}] Remove image-based subtitle (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                } else if (subFormatDropped(ffstreamCodec)) {
                    // Container/format can't carry it. alwaysDropSubs (eia_608/ttml/xsub/dvb_teletext) drop in ANY container - no setting governs them, so no tag; the
                    // rest (image subs, arib/hdmv_text on mp4) drop only because of the chosen container, so they carry [container=<dst>].
                    const dropCause = alwaysDropSubs.includes(ffstreamCodec) ? '' : `[container=${dstContainer}]`;
                    workDone += `☐${streamTag(ffstream.index)}${dropCause} Remove unsupported (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                }

                if (!delStream) {
                    // Decide removal BEFORE standardising the tag, so a subtitle dropped by language_sub / remove_sub_sdh never logs a language
                    // correction it won't keep. workLang here equals canonicalLangMeta's own workLang (same fillApplies rule), so the keep/drop
                    // decision is unchanged - the tag write is just skipped for a stream about to be mapped out.
                    workLang = resolveWorkLang(ffstream);

                    //If the subtitle is a language that should be removed then remove it regardless of other settings.
                    if(subLanguage.length > 0 && !langListMatch(workLang, subLangKeys)) {
                        workDone += `☐${streamTag(ffstream.index)}[language_sub=${logSafe(inputs.language_sub)}] Remove subtitle language (${streamLang})\n`;   // logSafe's own 200-char cap matters here: this echoes the whole list once PER dropped subtitle
                        delStream = true;
                    } else if (removeSubSdh === 'enabled' && isSdh(ffstream) && hasPlainSameLang(plainSubLangs, workLang)) {
                        workDone += `☐${streamTag(ffstream.index)}[remove_sub_sdh=${removeSubSdh}] Remove accessibility subtitle SDH/CC (${logSafe(roleTextLower(ffstream))})\n`;
                        delStream = true;
                    }

                    // Kept subtitle: fill a blank language and/or standardise the tag (tag_language) now that we know it survives.
                    if (!delStream) {
                        const lm = canonicalLangMeta('s', subtitleStreamIndex, ffstream, 'subtitle', true);
                        if (lm.meta) { workDone += lm.log; metadataCommand += lm.meta; }
                    }
                }

                if(delStream === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    subtitleStreamIndex--;
                    continue;
                }

                //Remove surrounding whitespace, single/double quotes (no reason for them). Busy-title clearing happens after tag_disposition (below).
                let newStreamTitle = cleanStreamTitle(streamTitle);
                const titleCauses = [];   // the settings that actually changed the title, for a compound [tag]; empty = automatic whitespace/quote trim (no setting)

                if(applies(tagDisposition, 'subtitle')) promoteDisposition('subtitle', 's', subtitleStreamIndex);

                newStreamTitle = clearBusyTitle(newStreamTitle, titleCauses);

                //tag_title (subtitle): titles we own (empty/role-only, incl. a just-cleared busy title) get the role tag(s). Custom titles are left untouched.
                if(applies(tagTitle, 'subtitle')) {
                    const tags = titleTagsFor(ffstream);
                    if(tags.length > 0 && !stripDispositionWords(newStreamTitle)) {
                        newStreamTitle = tags.join(' ');
                        titleCauses.push(`tag_title=${tagTitle}`);
                    }
                }

                reconcileTitle('s', subtitleStreamIndex, 'subtitle', streamTitle, newStreamTitle, titleCauses);

                emitHandlerMeta('s', subtitleStreamIndex, 'subtitle', 'SubtitleHandler');

                emitCommentRemoval('s', subtitleStreamIndex, 'subtitle');

                // mkv: mov_text is a QuickTime-only format that most players won't render in mkv — convert to srt. mkv keeps subrip/ass/ssa/webvtt/text +
                //      the bitmap codecs (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle, hdmv_text_subtitle) natively. The legacy PC/fansub text formats below
                //      (microdvd, mpl2, jacosub, sami, realtext, subviewer, vplayer, pjs) have NO Matroska CodecID either, so a bare -c copy would fail the whole
                //      remux — ffmpeg decodes them as text, so convert to srt too. xsub has no CodecID and is not decodable text, so it is dropped above (alwaysDropSubs).
                // mp4 (below): only mov_text is natively supported. All decodable text subtitle codecs must be converted to it — the common ones (subrip/srt/ass/ssa/
                //      webvtt/text) plus the legacy PC/fansub formats (microdvd, mpl2, jacosub, sami, realtext, subviewer, vplayer, pjs) that ffmpeg decodes as
                //      text; without this they would hit the bare -c copy and fail the whole remux. text is raw UTF-8 that ffmpeg normalises to subrip on mux.
                let subConvertTarget = null;
                if (dstContainer === 'mkv' && ['mov_text', ...legacyTextSubs].includes(ffstreamCodec)) subConvertTarget = 'srt';
                else if (dstContainer === 'mp4' && ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'text', ...legacyTextSubs].includes(ffstreamCodec)) subConvertTarget = 'mov_text';
                if (subConvertTarget) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Unsupported codec - converting ${ffstreamCodec} subtitle to ${subConvertTarget}\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} ${subConvertTarget}`;
                    subCodecOverride.set(ffstream.index, subConvertTarget);
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

                // Fill a blank language and/or standardise the tag (tag_language) before deciding whether to remove it.
                {
                    const lm = canonicalLangMeta('a', audioStreamIndex, ffstream, 'audio', true);
                    workLang = lm.workLang;
                    if (lm.meta) { workDone += lm.log; metadataCommand += lm.meta; }
                }

                // This plugin never removes an audio stream - audio_clean owns every audio keep/drop decision (language via language_surround/language_stereo/
                // language_unlisted, role via downmix_secondary), so audio only ever gets metadata work here.

                //Remove surrounding whitespace, single/double quotes (no reason for them). Busy-title clearing happens after tag_disposition (below).
                let newStreamTitle = cleanStreamTitle(streamTitle);
                const titleCauses = [];   // the settings that actually changed the title, for a compound [tag]; empty = automatic whitespace/quote trim (no setting)

                if(applies(tagDisposition, 'audio')) promoteDisposition('audio', 'a', audioStreamIndex);

                newStreamTitle = clearBusyTitle(newStreamTitle, titleCauses);

                //tag_title (audio): rebuilds the title as a channel/downmix base (only when we own it - see bareChannelRegex/downmixChannelRegex) plus a
                //disposition suffix. The suffix reads each role from the shared classifiers (real flag OR title keyword, via hasDisposition), so a title-only
                //role like "5.1 Commentary" normalises to "5.1 - Commentary" and survives the reformat even when tag_disposition is off (that setting only
                //governs whether the role is also promoted into a real flag, above). Shared canonicalAudioTitle - audio_clean names its downmixes the same way.
                const audioCh = applies(tagTitle, 'audio') ? resolveChannels(ffstream) : 0;
                if(audioCh) {
                    const rebuilt = canonicalAudioTitle(newStreamTitle, channelLabel(audioCh, layoutHasLfe(ffstream)), titleTagsFor(ffstream));
                    if(rebuilt !== newStreamTitle) { newStreamTitle = rebuilt; titleCauses.push(`tag_title=${tagTitle}`); }
                }

                reconcileTitle('a', audioStreamIndex, 'audio', streamTitle, newStreamTitle, titleCauses);

                emitHandlerMeta('a', audioStreamIndex, 'audio', 'SoundHandler');

                emitCommentRemoval('a', audioStreamIndex, 'audio');

                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }
            } else if(ffstreamType === 'video') {
                //Start with zero based index for video streams. This is only used when changing metadata.
                videoStreamIndex++;

                const isImageCodec = IMAGE_CODECS.includes(ffstreamCodec);
                if (isCoverArt(ffstream)) {
                    workDone += `☐${streamTag(ffstream.index)} Remove ${isImageCodec ? 'image' : 'cover-art/thumbnail'} (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    videoDropped++;
                    videoStreamIndex--;
                    continue;
                }            

                // Standardise the video language tag (tag_language): video carries the same mdhd language field, so e.g. a 2-letter code is dropped by mp4.
                {
                    const lm = canonicalLangMeta('v', videoStreamIndex, ffstream, 'video', false);
                    if (lm.meta) { workDone += lm.log; metadataCommand += lm.meta; }
                }

                // A Dolby Vision HEVC stream carries a dvhe/dvh1 (etc.) fourcc / a DOVI configuration record, NOT hvc1 - and this is a -c copy path, so its own tag is
                // already correct. Forcing hvc1 onto it drops the DV configuration box and demotes the file to plain HEVC (verified: the output ffprobes as "Invalid
                // data found"), undoing what video_clean's guard_dv protects. Detect DV both-probe (fourcc / mediaInfo HDR_Format / ffprobe side_data) and leave its
                // tag untouched. (video_clean re-encodes, so it makes the finer dvh1-vs-hvc1 choice; here the safe action on a mere remux is to not retag DV at all.)
                const isDolbyVision = isDolbyVisionVideo(ffstream, ffmedia);

                // HEVC in mp4 must carry the hvc1 fourcc or Apple/QuickTime won't decode it - a plain remux writes hev1. Tag the retained HEVC video stream when the
                // output is mp4 and it isn't already hvc1 (and isn't Dolby Vision): this converges after one heal (an already-hvc1 file is a no-op, never a perpetual remux).
                if (dstContainer === 'mp4' && ffstreamCodec === 'hevc' && !isDolbyVision && (ffstream.codec_tag_string || '').toLowerCase() !== 'hvc1') {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Tag video as hvc1 - HEVC-in-mp4 needs the hvc1 fourcc for Apple/QuickTime playback\n`;
                    extraArguments += ` -tag:v:${videoStreamIndex} hvc1`;
                    convert = true;
                }

                // Dolby Vision in mp4: the dvcC/dvvC configuration boxes are "unofficial" in ISO mp4, so ffmpeg's muxer only writes them under -strict unofficial. Without it a
                // -c copy remux keeps the in-band RPU + the dvhe tag but DROPS those boxes, weakening DV detection (verified on the real profile-5 sample). Add the flag so any remux
                // this plugin performs preserves DV fully. It only SHAPES a remux another change already triggered - it does not set convert, since an untouched file keeps its boxes.
                if (dstContainer === 'mp4' && ffstreamCodec === 'hevc' && isDolbyVision && !/ -strict unofficial\b/.test(extraArguments)) {
                    extraArguments += ' -strict unofficial';
                }

                emitCommentRemoval('v', videoStreamIndex, 'video');

                if(metaBusyTitleRemove === true && (tooManyPeriods(ffstream.tags?.title ?? '') || tooManyPeriods(ffmedia?.Title ?? ''))) {
                    workDone += `☐${streamTag(ffstream.index)}[remove_busytitle=true] Remove title (video) "${logSafe((ffstream.tags?.title ?? '').trim())}" and "${logSafe((ffmedia?.Title ?? '').trim())}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "title="`;
                }

                emitHandlerMeta('v', videoStreamIndex, 'video', 'VideoHandler', ' as it can cause problems for titles in mkv');

                if (metadataCommand !== '') {
                    extraArguments += metadataCommand;
                    convert = true;
                    continue;
                }                
            } else if(ffstreamType === 'attachment') {
                const kind = attachmentKind(ffstream);
                if (kind === 'image') {
                    workDone += `☐${streamTag(ffstream.index)} Remove cover-art attachment (${ffstreamType}-${ffstreamCodec})\n`;
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
                // 'other' - unidentifiable attachment. mkv carries anything, so the "never remove what we can't identify" policy holds there (see
                // attachmentKind). It has to yield for mp4: the mp4/mov muxer has NO attachment stream support at all, so leaving one in -map 0 doesn't just
                // lose it - the whole remux fails.
                if (dstContainer === 'mp4') {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Remove attachment mp4 can't carry (${ffstreamType}-${ffstreamCodec})\n`;
                    extraArguments += ` -map -0:${ffstream.index}`;
                    removedIndices.add(ffstream.index);
                    convert = true;
                    continue;
                }
            } else if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
                workDone += `☐${streamTag(ffstream.index)} Remove data stream (${ffstreamType}-${ffstreamCodec})\n`;
                extraArguments += ` -map -0:${ffstream.index}`;
                removedIndices.add(ffstream.index);
                convert = true;
                continue;
            }

            //Any other stream type (e.g. an unrecognised attachment classified as 'other') is left untouched - remove it with a separate plugin if needed.
        }

        // Resolve deferred font attachments now that subtitle removals are final. Embedded fonts are only consumed by styled text subtitles (ASS/SSA). Keep the
        // fonts if any such subtitle survives in the output; otherwise they are orphaned and removed. mp4 output never keeps fonts: ASS/SSA are converted to
        // mov_text (which needs no fonts) and mp4 cannot carry font attachments anyway, so dstContainer gates this to mkv. The source codec is read from
        // ffProbeData (it is still 'ass'/'ssa' there even when converted), which is why the mkv gate — not just the survivor check — is required.
        // NOTE: if awk_sub_worker extracted a styled subtitle to a sidecar (remove_after_extract) and this plugin runs before the reimport, the ASS/SSA is gone from
        // the container so its fonts read as orphaned and are removed here - reimport styled subs before an intervening clean_and_remux pass to keep their fonts.
        if (deferredFontIndices.length > 0) {
            const fontsNeeded = dstContainer === 'mkv' && file.ffProbeData.streams.some(s =>
                (s.codec_type || '').toLowerCase() === 'subtitle'
                && !removedIndices.has(s.index)
                && ['ass', 'ssa'].includes((s.codec_name || '').toLowerCase()));

            if (!fontsNeeded) {
                for (const idx of deferredFontIndices) {
                    const fontStream = file.ffProbeData.streams.find(s => s.index === idx);
                    const fname = (fontStream?.tags?.filename || '').trim();
                    workDone += `☐${streamTag(idx)} Remove orphaned font attachment (no ASS/SSA subtitle uses it)${fname ? ` "${logSafe(fname)}"` : ''}\n`;
                    extraArguments += ` -map -0:${idx}`;
                    removedIndices.add(idx);
                    convert = true;
                }
            }
        }

        if(videoDropped > 0 && videoStreamIndex === -1)
            failFile('Removing the specified streams would leave the file with no video streams - check your removal settings');

        //Now the file level metadata can be cleaned up if needed.
        if((metaCommentRemove === true) && file.ffProbeData.format?.tags?.comment) {
            workDone += `☐[remove_comments=true] Remove comment from file "${logSafe(file.ffProbeData.format?.tags?.comment)}"\n`;
            extraArguments += ` -metadata "comment="`;
            convert = true;
        }

        if((metaBusyTitleRemove === true) && tooManyPeriods(file.ffProbeData.format?.tags?.title ?? '')) {
            workDone += `☐[remove_busytitle=true] Remove title from file "${logSafe((file.ffProbeData.format?.tags?.title ?? '').trim())}"\n`;
            extraArguments += ` -metadata "title="`;
            convert = true;
        }

        //Check if remuxing is required due to container change
        if (srcContainer !== dstContainer) {
            workDone += `☐[container=${dstContainer}] Remux file from ${srcContainer}\n`;
            convert = true;
        }

        // Recovery flags (below) apply when requested, or when the source container is known to need a timestamp fix. Recovery itself leaves nothing
        // observable in the stream layout and is a no-op with -c copy on already-cleaned content, so a routine health-check remux would otherwise
        // reprocess the file forever - to prevent that we stamp the requested recover_bad_* MODE SIGNATURE into a format-level awk_recovered tag and
        // only recover when it differs from the stamped one (a changed mode, or no tag yet), then re-stamp. That converges (matching tag = skip), so
        // changing a mode re-runs recovery exactly once and settles - no separate "run again" toggle is needed since the two recover_bad_* dropdowns
        // are themselves the intent.
        const recoverRequested = recoverTs !== 'disabled' || recoverData !== 'disabled';
        // Order-stable signature of the recovery modes requested this run (e.g. "ts-light+data-aggressive"). escMeta is a no-op here (alphanumeric + '-' + '+')
        // but keeps the compared value byte-identical to what gets written to awk_recovered below.
        const recoverSig = [recoverTs !== 'disabled' && `ts-${recoverTs}`, recoverData !== 'disabled' && `data-${recoverData}`].filter(Boolean).join('+');
        const recoverIntent = escMeta(recoverSig);
        const recoveredTag = getTagCI(file.ffProbeData.format?.tags || {}, 'awk_recovered').trim();
        const intentMatches = recoveredTag !== '' && recoveredTag === recoverIntent;
        // A real container change (e.g. mkv->mp4) already remuxes and is a one-shot (a fixed config makes
        // srcContainer==dstContainer afterward), so recovery can ride along regardless of the tag without looping.
        const containerChanging = srcContainer !== dstContainer;
        const runRecover = recoverRequested && (!intentMatches || containerChanging);

        // The flags below apply only when runRecover is true, so a remux triggered by other work never re-applies them; the ts/avi/mpg/mpeg
        // genpts/-avoid_negative_ts fix further down is container-forced instead (needed to remux those formats at all) and always applies.

        // recover_bad_timestamps: light = +genpts, aggressive = full +igndts+genpts rebuild (igndts can misbehave without genpts, so it always pulls it in).
        if(runRecover && tsAgg)
            fflags += '+igndts+genpts';
        else if(runRecover && tsLight)
            fflags += '+genpts';

        if (['ts', 'avi', 'mpg', 'mpeg'].includes(srcContainer)) {          // container-forced timestamp fix (always applied)
            if(!fflags.includes('genpts'))
                fflags += '+genpts';
            extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
        } else if (runRecover && tsLight && !extraArguments.includes('avoid_negative_ts'))
            extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;   // normalize negative starts on any container we rebuild

        // recover_bad_data: light = +ignidx + -err_detect ignore_err (drops nothing), aggressive additionally drops corrupt frames.
        if(runRecover && dataLight) {
            fflags += '+ignidx';
            inputArgs += ' -err_detect ignore_err';
        }
        if(runRecover && dataAgg)
            fflags += '+discardcorrupt';
        if(fflags !== '')
            fflags = `-fflags ${fflags}`;

        // A recover-only run has no other queued work, so runRecover alone must force the remux.
        if (runRecover)
            convert = true;

        // Re-stamp the recover intent on every remux while recover is requested, even when it already matches (e.g. across mkv->mp4), so awk_recovered is refreshed
        // and recovery doesn't re-trigger next pass. (The mp4 use_metadata_tags that makes any global tag persist is added for all mp4 remuxes below.)
        if (convert === true && recoverRequested) {
            if (runRecover)
                workDone += `☐Stamp awk_recovered=${recoverIntent} - recovery re-runs only if a recover_bad_* mode changes\n`;
            extraArguments += ` -metadata "awk_recovered=${recoverIntent}"`;
        }

        //Convert file if convert variable is set to true.
        if (convert === true) {
            // mp4/mov drops GLOBAL custom tags on a -c copy remux unless use_metadata_tags is set - this plugin's own awk_recovered AND any awk_video/awk_sub_worker
            // written by a sibling plugin. Add it for EVERY mp4 remux (not just recovery ones), matching the other four plugins, so those markers survive. This plugin
            // runs first, so a marker it drops is gone before the plugin that wrote it re-reads it (e.g. sub_worker's sidecar-delete would then find no marker).
            if (dstContainer === 'mp4')
                extraArguments += ' -movflags use_metadata_tags';
            response.preset += `${fflags}${inputArgs},${sidecarOut} -map 0 -c copy${extraArguments}${globalOutputOpt}`;
            response.infoLog += workDone;
            // Predicted output: re-renders the input streams with the two mutations this summary tracks - removedIndices filtering and subCodecOverride (converted
            // subtitle codec). It does NOT reflect queued language fills / tag_language standardization: those emit only a -metadata:s:...language= arg and never
            // mutate the ffprobe object summariseStream reads, so a track whose blank/looser tag will be rewritten still shows its pre-change lang token here.
            const outSummary = file.ffProbeData.streams
                .map(s => ({ s: enrichStream(s), idx: s.index }))
                .filter(({ idx }) => !removedIndices.has(idx))
                .map(({ s, idx }) => (subCodecOverride.has(idx) ? { ...s, codec_name: subCodecOverride.get(idx) } : s))
                .map(summariseStream).join('');
            response.infoLog += `☑Expected results: ${outSummary}\n`;
            response.processFile = true;
        } else {
            if (recoverRequested && intentMatches)
                response.infoLog += `☑Already recovered with these options (awk_recovered=${recoveredTag}) - skipping to avoid reprocessing; change a recover_bad_* mode to run again\n`;
            response.infoLog += `☑File is already ${dstContainer} and contains no streams requiring removal or conversion\n`;
            response.processFile = false;
        }
        return response;
    } catch (err) {
        failUnexpected(err);   // AwkFailFile → rethrow unchanged; anything else → annotate + fail the file with the full infoLog
    }
};
module.exports.details = details;
module.exports.plugin = plugin;
