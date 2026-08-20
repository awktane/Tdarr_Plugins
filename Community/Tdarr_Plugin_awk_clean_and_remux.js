/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Prepares the file for any next steps including remuxing to mp4/mkv\n\n
                     -Identify and remove data streams and image/cover-art streams (by codec, or by attached_pic/still_image/timed_thumbnails disposition)\n\n
                     -Optionally removes any subtitle tracks that are not in the specified language(s)
                         via language_sub (audio language filtering is audio_clean's job)\n\n
                     -Standardises the stored language tag per container (tag_language / method_tag_language) and fills
                         missing or und tags from language_fill - the only awk plugin that WRITES language tags\n\n
                     -Optional pre-mux early warning (guard_audio_language) that aborts a multi-language file
                         whose original audio track isn't marked, before any downstream encoding work\n\n
                     -Optionally removes SDH/CC accessibility subtitles via remove_sub_sdh (audio-description audio is audio_clean's downmix_secondary)\n\n
                     -Option to modify metadata to remove metadata comments and titles with too many periods\n\n
                     -Automatically deduplicates titles reducing "Stereo / Stereo" down to "Stereo" or "English - English" down to "English"\n\n
                     -Optionally rebuilds audio and/or subtitle titles from their disposition roles
                         and imports title keywords into the real ffmpeg disposition flags\n\n
                     -Forcefully removes unsupported image based subtitles; optionally removes all image
                         based subtitles, or exports them to hidden OCR sidecars, via remove_imagesubs\n\n
                     -Converts unsupported subtitles to a supported format. The exception is a STYLED ass/ssa subtitle on an mp4 target: mp4 can only
                         store it as mov_text, which turns its positioning and drawing tags into literal on-screen text, so it is exported to a hidden
                         .mks bundle carrying the subtitle plus the container's fonts and dropped from the video instead\n\n
                     -Drops broadcast-only, image-based, and non-muxable subtitle formats as needed per container\n\n
                     -Includes option to attempt to recover damaged or corrupted files by removing corrupt frames and fixing timestamps\n\n
                     -Embedded fonts are kept while a styled subtitle that uses them (ASS/SSA) survives, and removed once orphaned. Unidentifiable
                         attachments are left untouched on mkv, and dropped for an mp4 target (which cannot carry any attachment).\n\n`,
    Version: '4.25.0',
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
            tooltip: `Output container. Any stream the target cannot carry is converted or removed, so this choice decides which of your subtitles survive.
                \\n=====
                \\nActions
                \\n=====
                \\nmkv (default): keeps almost everything. Removes ttml, xsub and dvb_teletext, plus any other subtitle format the mkv muxer cannot carry
                and ffmpeg cannot read as text. mov_text becomes srt, and a closed-caption (eia_608) track becomes plain text.
                \\nmp4: also removes hdmv_pgs_subtitle and dvb_subtitle, plus arib_caption and hdmv_text_subtitle. dvd_subtitle (VobSub) survives -
                mp4 stores it as mp4s - so remove_imagesubs alone decides its fate.
                Text subtitles (subrip, srt, ass, ssa, webvtt, text, eia_608) become mov_text - except a STYLED ass/ssa, which is
                exported as a font bundle rather than flattened. HEVC video is tagged hvc1 so Apple and QuickTime can play it.`,
        },
        {
            name: 'language_fill',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Force this language onto audio and subtitle tracks that carry no language tag, or are tagged "und". Blank (default) leaves them as
                they are.
                \\nTakes precedence over language_sub when a track's language is blank or und.
                \\nOne form is enough - en, eng, English or a BCP-47 tag like pt-BR all work; the form actually written follows method_tag_language and the
                output container, so type the one that carries what you mean (only pt-BR keeps the region). Codes: https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                \\nIt must be a REAL language: the special codes und, mul, zxx, mis and qaa-qtz are refused here, because they store as nothing and would
                change which tracks survive without ever tagging one. To keep untagged tracks instead, leave this blank and list und in language_sub.
                \\nExample:\\neng`,
        },
        {
            name: 'language_fill_mode',
            type: 'string',
            defaultValue: 'single-or-error',
            inputUI: {
                type: 'dropdown',
                options: ['single-or-error', 'force-any'],
            },
            tooltip: `Only applies when language_fill is set. Decides what to do when language_fill would give the SAME language to more than one untagged
                audio or subtitle stream of a type.
                \\n=====
                \\nActions
                \\n=====
                \\nsingle-or-error (default) - a single untagged stream of a type is filled and kept; two or more abort the file to the error queue. Tag
                them manually and requeue.
                \\nforce-any - fill and keep them all, however many there are, never aborting.
                \\nWhy the default stops: identically tagged streams cannot be told apart by language - only by listening - so a later plugin can treat
                them as duplicates and delete one, silently losing content (e.g. dropping the only Japanese track because it was tagged as English). The
                abort happens before the remux, so it costs no mux.
                \\nThis is not the "which track is the original language" check - that is guard_audio_language.`,
        },
        {
            name: 'language_sub',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Subtitle languages to KEEP, comma-separated. Blank (default) keeps every subtitle.
                \\nOne form is enough - en, eng, or English all match the same language, region variants like en-US included.
                \\nA track with no language tag counts as language_fill's value, or "und" when language_fill is blank.
                \\nExample:\\neng,fra
                \\nKeep English and French subtitles only.
                \\nThe special codes und (undefined), mul (multiple languages) and mis (no language code) match literally - list them to keep those tracks.
                \\nExample:\\neng,und
                \\nKeep English, plus anything marked und or carrying no language at all.`,
        },
        {
            name: 'tag_disposition',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'audio', 'subtitle', 'both'],
            },
            tooltip: `Turn role keywords found in a track's TITLE into real ffmpeg disposition flags, so the flags become the source of truth rather than
                the text. A flag is only ever added, never cleared.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): leave dispositions alone.
                \\naudio: surface Commentary, Descriptive, Dub and Original on audio tracks.
                \\nsubtitle: surface Commentary, Descriptive, SDH, Forced and Lyrics on subtitle tracks.
                \\nboth: apply to audio and subtitle tracks.
                \\nPair it with tag_title so title-only keywords reach the flags before the title is rebuilt. The default flag is untouched here - track
                order in the stream ordering plugin owns that.`,
        },
        {
            name: 'tag_language',
            type: 'string',
            defaultValue: 'invalid',
            inputUI: {
                type: 'dropdown',
                options: ['invalid', 'strict', 'disabled'],
            },
            tooltip: `Standardise the language tag on tracks that already HAVE one - to set a language on UNtagged tracks use language_fill instead.
                Applies to video, audio and subtitle streams; the form written follows method_tag_language.
                \\n=====
                \\nActions
                \\n=====
                \\ninvalid (default): fix only the tags that are non-standard or would not survive the output container - spelled-out names, wrong case,
                and 2-letter or region codes headed for mp4. Tags that already store cleanly (eng, or en/fre into mkv) are left alone.
                \\nstrict: rewrite every language tag to the method_tag_language standard, valid ones included - en becomes eng, and fre/fra fold to your
                chosen form.
                \\ndisabled: never change an existing language tag.
                \\nWhy it matters: mp4 cannot store a 2-letter code and silently drops the language on remux, so an "en" track would come out with no
                language at all. Undetermined and non-language codes (und, mul, zxx, mis) are always left untouched.`,
        },
        {
            name: 'tag_title',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'audio', 'subtitle', 'both'],
            },
            tooltip: `Rebuild stream titles from what the track actually is.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): leave titles alone.
                \\naudio: build a channel-based title - 7.1, 6.1, 5.1, 5.0, 4.0, 3.1, 3.0, 2.1, Stereo or Mono - with any roles appended, e.g.
                "5.1 - Commentary" or "5.1 -> 2.0 - Descriptive".
                \\nsubtitle: set the title to its role tags, e.g. "SDH" or "Forced Commentary". Only titles this plugin owns are rewritten - an empty one,
                or one that is already nothing but role words - so a custom subtitle title is left untouched.
                \\nboth: apply to audio and subtitle tracks.
                \\nRole tags come from the track's real disposition flags and title keywords (Commentary, Descriptive, SDH, Forced, Lyrics, Dub, Original).
                The default flag is deliberately not surfaced.`,
        },
        {
            name: 'remove_busytitle',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Blank the title of any audio or subtitle track whose title holds more than 3 periods. That clears most of the junk titles some
                sources write, which are usually the release filename rather than a description of the track.
                \\nExample:\\nThis.Title.Has.Too.Many.Periods is blanked`,
        },
        {
            name: 'remove_comments',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Remove the comment tag from every stream. Players rarely show it and it usually carries nothing worth keeping.`,
        },
        {
            name: 'remove_imagesubs',
            type: 'string',
            defaultValue: 'unsupported',
            inputUI: {
                type: 'dropdown',
                options: ['unsupported', 'all', 'export'],
            },
            tooltip: `What to do with image-based (bitmap) subtitles - hdmv_pgs_subtitle (Blu-ray PGS), dvd_subtitle (VobSub) and dvb_subtitle. They are
                pictures, so they cannot be searched or restyled, and cannot become text without OCR.
                \\n=====
                \\nActions
                \\n=====
                \\nunsupported (default): keep them wherever the container can carry them - all three on mkv, VobSub only on mp4 - and drop them
                only where it cannot (PGS and DVB on mp4).
                \\nall: remove every image-based subtitle from any container. Use this when you only want text subtitles.
                \\nexport: save each one to a hidden sidecar beside the video (PGS -> ".<name>.<lang>.sup", VobSub/DVB -> ".<name>.<lang>.mks") and then
                remove it. The leading dot keeps Plex and Jellyfin from indexing it. Run an external OCR tool over the sidecars to produce .srt, then
                reimport with awk_sub_worker. One-way - this plugin never reimports them.
                \\nxsub (DivX) is ALWAYS removed whatever this is set to, since no container can carry it, but export still saves it first to a
                ".<name>.<lang>.avi" - AVI being the only format that holds xsub.
                \\nexport works on any node. Where the node shares the library filesystem the sidecar is written beside the video as an extra output of the
                remux; on an unmapped node it is extracted here and uploaded into the library through Tdarr's file API before anything is removed. Either
                way the subtitle is only dropped once its sidecar is confirmed in place - if it cannot be placed the file is failed with the subtitle still
                embedded, so nothing is ever lost.
                \\nOn Emby, exported sidecars need care: Emby does not skip dot-prefixed files, so a stray .mks or .avi may surface as a library item
                (.sup it ignores outright). The xsub .avi is the worst case, since Emby reads it as a broken zero-duration title. Add a .embyignore file
                (4.9+) listing ".*" in the library root, or OCR and delete the sidecars before the next scan.
                \\nText subtitles are never affected. ttml is kept on mp4, where it stores as stpp, and removed only on mkv, which has no CodecID for it.`,
        },
        {
            name: 'remove_sub_sdh',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'if_plain_survives', 'all'],
            },
            tooltip: `Remove SDH / Closed Caption subtitles - the ones written for deaf and hard-of-hearing viewers. Detected from the real ffmpeg
                disposition flag, or from keywords in the title, handler or description.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): keep them.
                \\nif_plain_survives: remove them, but only where a plain subtitle of the same language survives - one carrying no commentary, descriptive,
                SDH or lyrics role, in a format the output container keeps, not stripped by remove_imagesubs and not exported to a bundle. So extras go,
                never your last usable subtitle of that language.
                \\nall: remove every one of them, whatever else the file carries. A file can legitimately end up with no subtitles at all.
                \\nAudio description (visual_impaired audio) is not handled here - audio_clean's downmix_secondary owns it, along with commentary and M&E.`,
        },
        {
            name: 'method_tag_language',
            type: 'string',
            defaultValue: 'container',
            inputUI: {
                type: 'dropdown',
                options: ['container', '639-2/t', '639-2/b', 'bcp47'],
            },
            tooltip: `Which language-code standard tag_language writes. Only takes effect while tag_language is not disabled, and you can still type any
                form you like in the language lists regardless.
                \\n=====
                \\nActions
                \\n=====
                \\ncontainer (default): give each container its native form - 2-letter (en, fr) for mkv, 3-letter terminologic (eng, fra) for mp4. The
                most spec-accurate per container.
                \\n639-2/t: terminologic 3-letter codes everywhere - fra, deu, zho. Matches mp4's mdhd box, and 3-letter is the common mkv convention too.
                \\n639-2/b ("mkv classic"): bibliographic 3-letter codes everywhere - fre, ger, chi.
                \\nbcp47: like container on mp4, but on mkv keeps the full BCP-47 tag - a region subtag such as pt-BR or es-419, or a script subtag such
                as zh-Hans. mp4 cannot store a region, so there it still folds to 3-letter (por).
                \\nThis mainly affects the ~20 languages that have two 3-letter codes (French fre/fra, German ger/deu), plus the 2-vs-3-letter choice. By
                convention mkv uses ISO-639-2/B and mp4's mdhd box uses ISO-639-2/T, though both containers accept either.`,
        },
        {
            name: 'method_unmuxable',
            type: 'string',
            defaultValue: 'error',
            inputUI: {
                type: 'dropdown',
                options: ['error', 'drop', 'mkv_fallback'],
            },
            tooltip: `What to do when a stream's codec CANNOT be stored in the target container. Without this the remux dies deep inside ffmpeg on an
                opaque "Could not find tag for codec ...", with nothing in the log saying which stream or why.
                \\n=====
                \\nActions
                \\n=====
                \\nerror (default): stop and quarantine the file, naming the codec and the container. Nothing is changed, so the decision stays yours -
                the safest option, and the only one that never loses a track nor overrides your container choice.
                \\ndrop: remove the offending streams and remux the rest, for a track you are happy to lose. Removing every video stream, or every audio
                stream, still fails the file rather than writing a stump.
                \\nmkv_fallback: keep THIS file in mkv with every stream intact; your container setting still applies to every other file. A codec mkv
                cannot store either falls back to error, there being nothing to fall back TO.
                \\nmp4 refuses a long list that mkv accepts: MLP, WMA, most ADPCM, A-law / mu-law / 8-bit PCM, LATM AAC (what every DVB and broadcast
                capture carries), VP8, Theora, ProRes, DNxHD, FFV1, HuffYUV, MagicYUV, UtVideo, v210, DV, Cinepak, H.263, the WMV / MS-MPEG-4 family, and
                the QuickTime-only codecs. TrueHD stores in mp4 only as experimental, so a TrueHD track arriving from another container is gated the same
                way, while one ALREADY in an mp4-family file is kept as it stands.
                \\nA few fit in NEITHER container - AC-4, Blu-ray PCM, SMPTE 302M, IMA-QT ADPCM, Nellymoser - so for those no container choice is a way out.`,
        },
        {
            name: 'guard_audio_language',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'enabled'],
            },
            tooltip: `An EARLY WARNING for multi-language files whose original language is not marked. It runs before the remux, so a file that needs your
                attention costs nothing to find.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): no check. audio_clean handles whatever it finds.
                \\nenabled: abort the file to the error queue when it carries MORE THAN ONE audio language among its genuine (non-commentary,
                non-descriptive) tracks and NO audio track is marked original - either the ffmpeg 'original' disposition flag or an "original" keyword in
                the title or handler. Mark the original track and requeue; audio_clean's guard_original can then protect it.
                \\nWhy it is worth catching early: audio_clean is what keeps or drops audio by language, but it can only trust a track marked original -
                it has no way to tell which of several untagged languages is the real one.
                \\nLanguages are compared folded, so en/eng/English/en-US count as one, and an untagged track counts as whatever language_fill would give
                it, or "und" when that is blank. A file with a single audio language, or one that already marks its original, passes untouched.`,
        },
        {
            name: 'recover_bad_data',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'light', 'aggressive'],
            },
            tooltip: `Push a structurally damaged file through: visible or audible glitches, the job aborting on this file, video that will not seek, or a
                wrong duration. Try light first, and move to aggressive only if it does not help.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): no data recovery.
                \\nlight (risk-free): -fflags +ignidx and -err_detect ignore_err. Ignores a broken or corrupt index (AVI idx1, MOV/MP4 sample tables) and
                keeps reading past detected errors instead of failing. Drops no frames.
                \\naggressive: also -fflags +discardcorrupt, which drops packets flagged corrupt. Expect small video or audio blips wherever the damage is.
                \\nRecovery re-runs only when you change one of the recover_bad_* settings, then settles - it will not reprocess the file on every pass.`,
        },
        {
            name: 'recover_bad_timestamps',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'light', 'aggressive'],
            },
            tooltip: `Fix a broken presentation timeline: stutter, audio and video drifting out of sync, or ffmpeg errors such as "first pts value must
                set", "Timestamps are unset in a packet for stream", "Non-monotonous DTS in output stream" or "DTS out of order". Try light first, and
                move to aggressive only if the error persists.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): no timestamp recovery.
                \\nlight (risk-free): -fflags +genpts and -avoid_negative_ts make_zero. Regenerates missing PTS and shifts negative start times to zero.
                Touches no frame data.
                \\naggressive: also -fflags +igndts, which ignores the source DTS and rebuilds the timeline outright - this is what fixes "Non-monotonous
                DTS". It can produce odd results, so only reach for it if light did not help.
                \\nRe-runs only on a recover_bad_* change, as for recover_bad_data. Container-forced timestamp fixes apply regardless, for the whole
                MPEG-TS family (ts/m2ts/mts/m2t/tp/trp/tod), the whole MPEG-PS family (mpg/mpeg/vob/evo/m2p/vro/mod), and avi.`,
        },
    ],
});
// #endregion

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

    // #region SHARED helpers (1 section: file-failure helpers)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: file-failure helpers =====
    // -=-=-= AwkFailFile / failFile / failUnexpected [all five] =-=-=-
    // Fail the whole file (Tdarr's error queue) carrying the full infoLog: a returned processFile:false is Tdarr's "no work / skip" signal, NOT a failure -
    // only a throw errors the file. A raw throw discards the returned response, so failFile rides the accumulated infoLog along as the Error message,
    // with a leading \n so the log starts on its own line instead of glued onto Tdarr's "...Plugin error! Error:" wrapper. The dedicated AwkFailFile type
    // lets the body's outer catch (failUnexpected) tell a DELIBERATE failure (rethrow unchanged) from an unexpected bug (annotate + wrap, still fail w/ log).
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
    // -=-=-= skip [all five] =-=-=-
    // The OTHER terminal: a benign skip means there is nothing for this plugin to do - the file is left untouched and the flow moves on. Every call site
    // keeps its own `return`, so a skip still reads as a terminal where it stands.
    const skip = (msg) => { response.infoLog += msg; response.processFile = false; return response; };
    // ===== END SHARED: file-failure helpers =====
    // #endregion

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // #region SHARED helpers (13 sections: stream codec type … ffmpeg metadata escaping)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream codec type =====
    // -=-=-= codecTypeOf [all five] =-=-=-
    // The stream's kind - video / audio / subtitle / attachment / data - normalised once; the single most repeated test in the suite. jellyfin-ffprobe emits
    // a fixed lowercase enum, so trim+lowercase are pure defensiveness - but one definition keeps every site defensive the SAME way, where per-site
    // spellings could classify the same stream differently. Optional-chained, so a nullish stream reads as "no type" rather than throwing.
    const codecTypeOf = (s) => (s?.codec_type || '').trim().toLowerCase();
    // ===== END SHARED: stream codec type =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes [all five] =-=-=-
    // Keyed by the real ffmpeg disposition flag; each entry declares the valid stream types, the title keywords that also indicate the role (each keyword
    // lives on ONE flag so title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). The single table every
    // classifier, sort key, summary token and title tagger reads, so the lists can never drift.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','descriptions','dvs','audio description','described video','visually impaired','visual impaired'], tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','descriptions','dvs'],                      tag: 'Descriptive' },
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
    // -=-=-= roleTextLower [all five] =-=-=-
    // Role-signal text unioned from BOTH probes - a title/description/handler can live in ffprobe OR mediaInfo but not both. Memoized by stream object
    // (WeakMap, per-run closure) because hasDisposition calls it repeatedly per stream.
    // Both description reads go through getTagCI, and neither casing is a guess: matroska UPPER-CASES tag keys on write, so the ffprobe side comes back
    // DESCRIPTION; and MediaInfo defines Comment/Description as GENERAL-only parameters, so a per-TRACK value never appears top-level - it lands in the
    // track's 'extra' bag under whatever spelling the container used. Both legs were dead before this: a fixed-case top-level read matched neither.
    const roleTextCache = new WeakMap();
    const roleTextLower = (s) => {
        if (roleTextCache.has(s)) return roleTextCache.get(s);
        const mi = mediaInfoFor(s);
        const text = [s.tags?.title, getTagCI(s.tags, 'description'), s.tags?.handler_name,
            mi?.Title, getTagCI(mi?.extra, 'description')].filter(Boolean).join(' ').trim().toLowerCase();
        roleTextCache.set(s, text);
        return text;
    };
    // -=-=-= matchesKeyword [all five] =-=-=-
    // Whole-token keyword matcher: a keyword matches only when not flanked by a letter/digit - '[sdh]', 'eng-sdh', 'sdh.' match, 'deafening' does not -
    // and an internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). text must already be lowercased. The compiled
    // regex is a pure function of the keyword list, so it is memoized by keyword-array identity rather than recompiled per classifier call.
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
    // -=-=-= hasDisposition [all five] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes(codecTypeOf(s))) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(roleTextLower(s), entry.keywords);
    };
    // -=-=-= role classifiers: isCommentary / isDescriptive / isSdh / isLyrics [all five] =-=-=-
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    // A subtitle can carry the raw visual_impaired flag (mkvtoolnix writes it; the sidecar round trip restores it) but the table scopes that key to audio.
    // Read the subtitle case as a RAW flag, deliberately NOT by widening the table entry - that would let its audio-oriented keywords ('audio description')
    // invent the role from a subtitle's title. 'descriptions' remains the keyword-matched subtitle spelling of the same role.
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions')
        || (codecTypeOf(s) === 'subtitle' && s.disposition?.visual_impaired === 1);
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');
    // ===== END SHARED: role/disposition classifiers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt [all five] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last;
    // summariseStream flags them /cover. Two codecs that LOOK like they belong are deliberately ABSENT, for one reason: they are also real
    // moving-picture codecs. mjpeg/mjpegb is camcorder/AVI-era footage, and jpeg2000 is the DCP / IMF / broadcast-mezzanine codec - listing
    // either drops genuine video as cover art, while neither is ever WRITTEN as cover art (mkv attaches image/jpeg or image/png; the mp4 covr
    // atom encodes only JPEG or PNG). Real cover art in those codecs still matches via the disposition clause below - mp4 marks it attached_pic
    // and mkv carries it as an ATTACHMENT, not a video stream - so a dispositionless mjpeg/jpeg2000 video stream reads as real video, the
    // fail-safe direction. nb_frames cannot substitute for the disposition test: in mkv it is N/A for real MJPEG video AND for cover art.
    const IMAGE_CODECS = ['png', 'apng', 'gif', 'bmp', 'webp', 'tiff', 'qoi'];
    const isCoverArt = (s) => IMAGE_CODECS.includes((s.codec_name || '').trim().toLowerCase())
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: codec name resolution =====
    // -=-=-= codecAliases [all five] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_alaw',  'g711'],   // G.711 A-law: LOSSY 8-bit companded telephony (64 kbps/ch), NOT lossless - carve out before the generic pcm_ fold
        ['pcm_mulaw', 'g711'],   // G.711 mu-law: same
        ['pcm_',   'pcm'],
        ['dsd',    'dsd'],       // DSD / SACD (1-bit): fold dsd_lsbf/dsd_msbf(_planar) to one lossless key
        ['mp4als', 'als'],       // MPEG-4 ALS: fold the mp4-wrapped spelling to the 'als' codecInfo key (a bare 'als' resolves directly)
        ['adpcm',  'adpcm'],
        ['gsm',    'gsm'],      // GSM 06.10 full-rate and the Microsoft variant (gsm_ms) are one speech family - fold to one key
        ['qdm',    'qdm'],      // QDesign Music 1 and 2 (qdmc/qdm2), old QuickTime - fold to one key
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= resolveCodecName [all five] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the _x variant when DTS:X is
    // detected) and eac3/truehd into eac3atmos/truehdatmos - scoring for the carriers that score, accurate display labels for the rest. Each refinement
    // checks longName, the ffprobe profile AND mediaInfo's Format_Commercial_IfAny, because no single source is complete: DTS longName in MP4/M4V is
    // "DCA (DTS Coherent Acoustics)" with no subtype keyword, and an E-AC-3 longName carries no Atmos marker (an editable title tag never counts - it
    // does not imply a real Atmos substream). DTS:X detection is best-effort: MediaInfo's own maintainers note the "XLL X" signal is incomplete for an
    // undocumented format, so a real DTS:X track may still classify as the plain subtype - never the reverse, since detection only fires on an actual
    // reported value, never on the absence of one.
    const resolveCodecName = (stream) => {
        let codec = (stream?.codec_name || '').toLowerCase().trim();
        const longName = (stream.codec_long_name || '').toLowerCase().trim();

        for (const [prefix, replacement] of codecAliases) {
            if (codec.startsWith(prefix)) {
                codec = replacement;
                break;
            }
        }

        // Fold dca -> dts before the DTS subtype refinements below, which are gated on the 'dts' name
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
                // MediaInfo marks DTS:X as the token "XLL X" in Format_AdditionalFeatures (plain DTS-HD is "XLL"). Matched as a whole token, NOT a raw
                // substring, so a hypothetical "XLL X96"/"XLL XBR" can't false-positive.
                const additionalFeatures = (mi?.Format_AdditionalFeatures || '').toLowerCase();
                // ffprobe fallback: jellyfin reports DTS:X in `profile` ("DTS-HD MA + DTS:X") - the only object-audio signal when mediaInfo is absent.
                if (/\bxll x\b/.test(additionalFeatures) || /dts:?x/.test(profile))
                    codec = DTS_X_VARIANT[codec];
            }
        } else if ((codec === 'eac3' || codec === 'truehd') && (longName.includes('atmos') || commercial.includes('atmos') || profile.includes('atmos')))
            codec = codec === 'eac3' ? 'eac3atmos' : 'truehdatmos';

        return codec;
    };
    // -=-=-= codecDisplayName [all five] =-=-=-
    // Friendly display token for the codecs resolveCodecName REFINES beyond the bare codec_name; anything else falls back to its own raw codec_name
    // (pcm_s16le keeps its bit depth) - this only ever ADDS subtype detail, never collapses an already-informative name.
    const CODEC_DISPLAY = {
        dtsma:   'dts-hd-ma',   dtsmax:      'dts-hd-ma-x',
        dtshr:   'dts-hd-hr',   dtshrx:      'dts-hd-hr-x',
        dtsx:    'dts-x',       dtsexpress:  'dts-express',   dtsexpressx: 'dts-express-x',
        eac3atmos: 'eac3-atmos', truehdatmos: 'truehd-atmos', mpegh3d: 'mpeg-h',
    };
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || (stream.codec_name || 'unknown').trim().toLowerCase();
    // ===== END SHARED: codec name resolution =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family [all five] =-=-=-
    // The mp4/mov container family whose -c copy needs `-movflags use_metadata_tags` to keep sibling plugins' GLOBAL awk_* markers through the remux (dropping
    // one re-triggers work upstream); also the container test behind the mp4 `-strict` gates. One source so no consumer drifts on the set (video_clean's
    // video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [all five] =-=-=-
    // Look up a tag value case-insensitively - matroska UPPER-CASES tag keys on write, so a plugin reading its
    // sibling's awk_* marker gets an uppercased key back. Returns the raw value (or '' if absent); callers trim/decode
    // as needed. One source so the five plugins that read each other's markers can't drift on the lookup convention.
    const getTagCI = (tags, name) => {
        const hit = Object.keys(tags || {}).find((k) => k.toLowerCase() === name);
        return hit === undefined ? '' : String(tags[hit] ?? '');
    };
    // ===== END SHARED: case-insensitive tag lookup =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor [all five] =-=-=-
    // The single join point between the two probes: the mediaInfo track whose StreamOrder equals the ffprobe index; undefined when absent. Deliberately
    // NOT memoised (unlike roleTextLower's WeakMap): the scan measures ~20 microseconds per file against a transcode measured in minutes.
    // Menu is excluded because it is the one track kind whose StreamOrder is NOT a stream index: MediaInfo numbers an MPEG-TS program's Menu by PROGRAM
    // ordinal ("0") while that program's real tracks carry a two-part "0-0"/"0-1" that Number() turns into NaN - so on a single-program .ts the Menu is the
    // only numeric match and ffprobe stream 0 reads the Menu's fields. Its Language is a concatenated program list (" / en / en / en"), which makes an
    // untagged track look tagged and silences language_fill, and tag_language=strict then writes that string into the container where nothing can repair it
    // (toCanonicalTag passes it through unchanged). Measured on 6 of the corpus's MPEG-TS files; stream_ordering's DURATION_SIGNALS already guards the same
    // way. Do NOT "fix" this by joining on the last component of the two-part form - measured wrong on both a teletext capture and a multi-program mux.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => t['@type'] !== 'Menu' && Number(t.StreamOrder) === s.index);
    // -=-=-= resolveLang [all five] =-=-=-
    // ffprobe tags.language, else mediaInfo Language (files often tag one probe but not the other); '' when neither reports it - callers wanting a
    // placeholder use `resolveLang(s) || 'und'`.
    const resolveLang = (s) => { const t = (s.tags?.language || '').trim(); return (t || (mediaInfoFor(s)?.Language ?? '')).trim().toLowerCase(); };
    // -=-=-= resolveStreamBitrate [all five] =-=-=-
    // ffprobe first, then mediaInfo: some formats hide per-stream bitrate from ffprobe (e.g. DTS-HD MA in MP4/M4V). mediaInfo order: measured BitRate,
    // declared BitRate_Nominal, then StreamSize*8/Duration - still a real measurement, far better than the codec-target estimate audioQuality falls back
    // to. Returns 0 only when truly unknown.
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
            // clamp to a plausible audio range so a stray unit (ms Duration, etc.) or corrupt size can't inject garbage
            if (bps > 1000 && bps < 100000000) return bps;
        }
        return 0;
    };

    // -=-=-= resolveChannels (+ channelsFromLayout helper) [all five] =-=-=-
    // Audio channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string from either probe
    // - "5.1(side)" -> 6, "FL+FR+LFE" -> 3. Returns 0 only when no source reports it.
    const channelsFromLayout = (layout) => {
        const s = String(layout || '').toLowerCase().trim();
        if (!s) return 0;
        if (s === 'mono') return 1;
        if (s === 'stereo' || s === 'downmix') return 2;
        if (s === 'quad') return 4;
        const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);              // "5.1"->6, "7.1(side)"->8, "7.1.4" Atmos -> 12 (front + LFE + height)
        if (m) return Number(m[1]) + Number(m[2]) + Number(m[3] || 0);
        // "FL+FR+FC+LFE" -> 4; drop MediaInfo ChannelPositions labels ("Front:", "Side:")
        const tokens = s.split(/[+\s,]+/).filter((t) => t && !t.endsWith(':'));
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

    // -=-=-= enrichStream [all five] =-=-=-
    // Both-probe bitrate + channels enrichment; every summary and scoring call site uses it so logged tokens and the scoring path enrich identically.
    // The enriched .channels is NOT a drop-in for resolveChannels() in a numeric test: on a stream no probe can measure, resolveChannels returns 0 but the
    // `|| s.channels` fallback lands `undefined` here, and `undefined <= 0` is false - so any guard keying on 0 must call resolveChannels() itself.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= is10Bit [all five] =-=-=-
    // 10-bit or deeper: raw sample depth / mediaInfo BitDepth >= 10, a p10le-p16be pixel format, or a 10-bit profile name. The pixel-format leg spans
    // 10-16 because it is the LAST resort and a 12/16-bit master read as 8-bit is the costliest miss; the profile leg stays 10-only because the deeper
    // profile names carry no depth digit ('Rext'), and matching them would call an 8-bit 4:4:4 file 10-bit. Single source for the 10bit token and
    // video_clean's re-encode depth decision.
    const is10Bit = (s, mi = mediaInfoFor(s)) => Number(s.bits_per_raw_sample || mi?.BitDepth || 0) >= 10
        || /p(1[0-6])(le|be)?$|1[0-6]le|1[0-6]be/.test((s.pix_fmt || '').toLowerCase()) || /10/.test((s.profile || '').toLowerCase());
    // -=-=-= FONT_EXTS + isFontMime [all five] =-=-=-
    // Embedded-font file extensions + a font-mimetype test. Read by summariseStream's [attach:...] token and isFontAttachment (clean_and_remux/sub_worker).
    const FONT_EXTS = ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'];
    const isFontMime = (mime) => /font|truetype|opentype|sfnt/.test(mime);
    // -=-=-= HDR_TRANSFERS [all five] =-=-=-
    // The HDR transfer curves - ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg). The single
    // source for every HDR-curve test.
    const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
    // -=-=-= HDR10P_RE / VIVID_HDR_RE [all five] =-=-=-
    // Dynamic-HDR recognisers over a lowercased HDR_Format, split BY FORMAT because they differ downstream: HDR10+ has a lossless strip path
    // (hevc_metadata=remove_hdr10plus, HEVC only), HDR Vivid/CUVA has none. A bare '2094' suffices for HDR10+ (plain static HDR10 is ST 2086 only), and
    // production MediaInfo 23.07 spells Vivid 'HDR Vivid'. No union is composed here - every decision but video_clean's local isDynamicHdr wants a SINGLE
    // format. DV is recognised separately (isDolbyVisionVideo). Probe limit: production MediaInfo 23.07 reports no Video track at all for H.266/VVC, so a
    // VVC stream can never be recognised as dynamic HDR by any path here.
    const HDR10P_RE = /2094|hdr10\+|hdr10 plus/;
    const VIVID_HDR_RE = /hdr vivid|cuva/;
    // -=-=-= isDdEx [all five] =-=-=-
    // Dolby Surround EX: a rear-surround (6.1) channel matrix-folded into an ordinary 5.1 AC-3/E-AC-3 - strictly MORE than a plain 5.1 twin, still decodes
    // as plain 5.1. mediaInfo's Format_Settings_Mode is the flag's only home (ffprobe does not expose it). One definition so summariseStream's dd-ex token
    // and audio_clean's dedup tie-break can never disagree about what counts as EX.
    const isDdEx = (s) => /surround ex/i.test(mediaInfoFor(s)?.Format_Settings_Mode || '');
    // -=-=-= summariseStream [all five] =-=-=-
    // The [type:details] summary token. Audio & subtitle append /default then EVERY role marker that applies. /default reads the REAL disposition flag
    // alone - a title keyword must not flip a selection flag; every other marker uses the same flag-OR-title-keyword test the sort keys use, so every
    // plugin's summary lines up. Exception: the subtitle /original is a raw flag, display only - no classifier scopes it to subtitles. subrip shows as
    // srt. Audio uses codecDisplayName so a DTS subtype or object-audio layer the container codec_name hides shows in the token. The optional second
    // argument describes a RE-ENCODED output track as { codec, channels, bps, rate } - so NEVER pass this helper straight to .map(): Array.map would
    // supply the element index as that argument.
    const summariseStream = (s, out) => {
        // Container-supplied values (language tags, attachment filenames, mimetypes) are unbounded and the whole infoLog is persisted by Tdarr, so every
        // one is clamped: control characters become spaces (a raw newline would split the summary line) and the token caps at 64 chars - the longest
        // registered mimetype subtype is 59, everything else is far shorter.
        const tok = (v) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 64);
        const type = codecTypeOf(s);
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = tok(resolveLang(s) || 'und');
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video') {
            const vmi = mediaInfoFor(s);
            const vHeight = Number(s.height || vmi?.Height || 0);
            const vTenbit = is10Bit(s, vmi);
            const vXfer = (s.color_transfer || vmi?.transfer_characteristics || '').toLowerCase().trim();
            const vHdr = HDR_TRANSFERS.includes(vXfer) || !!String(vmi?.HDR_Format || '').trim();
            // HDR sub-type marker, shown in place of 'hdr'. DV via the shared isDolbyVisionVideo - also surfacing Profile-5 DV whose non-standard transfer
            // sets no hdr flag. HDR10+ and HDR Vivid are stream-visible only via mediaInfo (ffprobe carries their metadata per-FRAME, which Tdarr doesn't
            // probe), so both degrade to plain 'hdr' without it. A stream can carry BOTH at once (real DVB multiplexes do), so the token names every
            // format present - 'hdr10+/vivid'.
            const vHdrFmt = String(vmi?.HDR_Format || vmi?.HDR_Format_Compatibility || '').toLowerCase();
            const vDv = isDolbyVisionVideo(s, vmi);
            const vDynTok = [HDR10P_RE.test(vHdrFmt) ? 'hdr10+' : '', VIVID_HDR_RE.test(vHdrFmt) ? 'vivid' : ''].filter(Boolean).join('/');
            const vHdrTok = vDv ? 'dv' : (vDynTok || (vHdr ? 'hdr' : ''));
            const vParts = [codec, vHeight > 0 ? `${vHeight}p` : '', vTenbit ? '10bit' : '', vHdrTok].filter(Boolean).join(' ');
            return `[video:${vParts}${isCoverArt(s) ? '/cover' : ''}]`;
        }
        if (type === 'audio') {
            // What survives a RE-ENCODE is decided here, once: language and disposition markers carry through and still read off the source stream; the
            // source-only mediaInfo markers (EX matrix, commercial subtype) do NOT - a fresh encode has neither, so claiming them would be false.
            const chNum = out ? out.channels : s.channels;
            const ch = chNum ? `${chNum}ch` : '';
            // An explicit pre-formatted rate string wins - a VBR encode's rate is an ESTIMATE ('~192k') that cannot be known until the encode runs.
            const bps = Number((out ? out.bps : s.bit_rate) || 0);
            const rate = (out && out.rate) || (bps > 0 ? `${Math.round(bps / 1000)}k` : '');
            const role = `${isCommentary(s) ? '/commentary' : ''}${isDescriptive(s) ? '/description' : ''}`;
            const prov = `${hasDisposition(s, 'dub') ? '/dub' : ''}${hasDisposition(s, 'original') ? '/original' : ''}`;
            const surEx = !out && isDdEx(s) ? 'dd-ex' : '';
            // A re-encode is named by the codec it is being encoded TO - resolved through a bare object so no source profile/long-name/mediaInfo can leak in.
            const name = out ? codecDisplayName({ codec_name: out.codec }) : codecDisplayName(s);
            return `[audio:${[lang, ch, surEx, name, rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            // A subtitle can also carry 'visual_impaired' and 'original' (mkvtoolnix writes either; the sidecar round trip restores them) but
            // dispositionTypes scopes both to audio - so 'original' is read as a RAW flag here, exactly like /default and /forced: a title keyword must
            // not be able to invent one. visual_impaired needs no special case - isDescriptive reads that raw flag itself.
            const descriptive = isDescriptive(s);
            const role = `${isCommentary(s) ? '/commentary' : ''}${descriptive ? '/description' : ''}${isSdh(s) ? '/sdh' : ''}${isLyrics(s) ? '/lyrics' : ''}`;
            const forced = hasDisposition(s, 'forced') ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}${s.disposition?.original === 1 ? '/original' : ''}]`;
        }
        if (type === 'attachment') {
            // codec_name is often absent/'none' on attachments (fonts especially): fall back to the filename extension, then the mimetype - fonts read
            // 'font', everything else the mimetype SUBTYPE (image/png -> png) - so a removed attachment is legible by what it actually is.
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
            return `[attach:${tok(label)}]`;
        }
        if (type === 'data') {
            // As for attachments: when codec_name is absent/generic, surface the mimetype SUBTYPE so a removed data stream is legible.
            const dmime = (s.tags?.mimetype || '').trim().toLowerCase();
            const dsub = dmime.includes('/') ? dmime.slice(dmime.indexOf('/') + 1).replace(/^x-/, '') : '';
            return `[data:${tok((codec === 'unknown' || codec === 'none') && dsub ? dsub : codec)}]`;
        }
        return `[${type || 'unknown'}:${codec}]`;
    };

    // -=-=-= globalOutputOpt [all five] =-=-=-
    // Output-side options applied to EVERY run (the place for any universal muxer/output flag). -max_muxing_queue_size 9999 pre-empts ffmpeg's "Too many
    // packets buffered" interleave error (mostly vestigial on ffmpeg 7.x, cheap insurance); -flush_packets 0 buffers muxer writes instead of flushing per
    // packet - throughput-optimal for file muxing, so always applied rather than exposed as a toggle.
    const globalOutputOpt = ' -max_muxing_queue_size 9999 -flush_packets 0';

    // -=-=-= streamTag [all five] =-=-=-
    // infoLog stream tag: the SOURCE ffprobe index as a fixed 5-char field so columns line up (widens past [s99]). Omitted where a line concerns no single
    // source stream - whole-file summaries, and brand-new/appended streams that have no source index of their own.
    const streamTag = (index) => `[s${String(index).padStart(2, ' ')}]`;
    // ===== END SHARED: stream / language / preset helpers =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language matching =====
    // Normalize any language identifier to a stable comparison key so en / eng / EN / English / en-US - and ISO 639-2/B vs /T (fre vs fra) - all compare
    // equal. Node ships full ICU, so no table or module is needed.
    // -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'.
    const shortLang = (l) => l.replace(/[-_.].*$/, '');
    // -=-=-= langNameIndex  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Reverse map English language NAME -> 2-letter code (english->en), lazily built by probing every aa..zz pair through Intl.DisplayNames, memoised for
    // the run. Null-prototype so a container tag spelling an Object.prototype member ('constructor') misses the map instead of resolving inherited junk.
    const langNameIndex = (() => {
        let idx = null;
        return () => {
            if (idx) return idx;
            idx = Object.create(null);
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: free-text list split =====
    // -=-=-= splitList  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Tokenise a free-text comma list exactly one way across the suite: split on commas, trim each token, drop the empties - so ' eng , , jpn ' and 'eng,jpn'
    // are the same list. Every list a USER types goes through it (the language lists, stream_ordering's order_codec), because one settings string has to scope
    // the same tracks at every stage: a split rule hardened in one file and not the others silently means something different per plugin, and the damage is
    // invisible - an unmatched list reads as a clean run that did none of the requested work. Case is NOT folded here; each caller decides, since some lists
    // match through langKey (which lowercases) and some against lowercase canon codec names. Values this suite itself wrote (the awk_* marker and tag lists)
    // are a different concept and keep their own parsers.
    const splitList = (v) => String(v || '').split(',').map(t => t.trim()).filter(Boolean);
    // ===== END SHARED: free-text list split =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: dolby vision detection =====
    // -=-=-= DV_FOURCC_RE [all five] =-=-=-
    // The DV fourccs: HEVC dvhe/dvh1, AVC dvav/dva1, AV1 dav1. Named so the set has ONE definition (video_clean's dvCodecTag tests the same constant).
    // Non-global, so `.test()` on one shared instance is stateless.
    const DV_FOURCC_RE = /^(dvhe|dvh1|dvav|dva1|dav1)$/;

    // -=-=-= isDolbyVisionVideo [all five] =-=-=-
    // Both-probe DV test: the fourcc, a mediaInfo HDR_Format naming Dolby Vision, or an ffprobe DOVI configuration record / dolby-vision side_data. Drives
    // the -c copy plugins' `-strict unofficial` (mp4StrictArg) and the summariseStream dv token. video_clean's guard_dv ENCODE routing deliberately uses
    // the NARROWER dvSignal instead - libx265 -dolbyvision hard-requires a real RPU (see the note there). Pass the stream's paired mediaInfo
    // (mediaInfoFor(stream)); a single-probe false negative would silently lose the boxes.
    const isDolbyVisionVideo = (ffstream, ffmedia) => DV_FOURCC_RE.test((ffstream?.codec_tag_string || '').toLowerCase().trim())
        || String(ffmedia?.HDR_Format || ffmedia?.HDR_Format_Compatibility || '').toLowerCase().includes('dolby vision')
        || (Array.isArray(ffstream?.side_data_list) ? ffstream.side_data_list : [])
            .some((sd) => /dovi configuration record|dolby vision/i.test(String(sd?.side_data_type || '')));
    // ===== END SHARED: dolby vision detection =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4 strict compliance arg =====
    // -=-=-= mp4StrictArg [all five] =-=-=-
    // The ' -strict <level>' an mp4/mov -c copy needs, or '' when it needs none. Two independent reasons share one flag, because `experimental` is a strict
    // SUPERSET of `unofficial` and does both jobs:
    //   experimental - a TrueHD stream copied INTO mp4, which the muxer otherwise refuses outright (rc 88); `unofficial` does NOT satisfy it. Matched on
    //                  the raw codec_name, not resolveCodecName, whose refined truehdatmos would not equal 'truehd'.
    //   unofficial   - a Dolby Vision video stream, so the mov muxer keeps its dvcC/dvvC boxes; a plain copy drops them, demoting DV to plain HEVC/AV1
    //                  (verified on real HEVC + AV1 DV samples). Cover art is excluded so a leading cover-art stream cannot mask a real DV stream.
    // Pass the RAW file.ffProbeData.streams as `streams`: the DV signals (codec_tag_string / side_data_list) live only there. `copied` is the subset this
    // run emits as -c copy (defaults to all) - a caller that drops or re-encodes tracks passes its own survivor list, so a TrueHD track on its way out
    // never pulls in a flag the output does not need. Never decide this by regex over the half-built argument string: it carries container-supplied
    // -metadata title values verbatim, so a track titled " -strict foo" reads as already-emitted and the remux silently drops a DV file's boxes.
    const mp4StrictArg = (container, streams, copied) => {
        if (!isMp4Family(container)) return '';
        const list = Array.isArray(streams) ? streams : [];
        const kept = Array.isArray(copied) ? copied : list;
        if (kept.some((s) => codecTypeOf(s) === 'audio' && (s?.codec_name || '').toLowerCase().trim() === 'truehd')) return ' -strict experimental';
        return list.some((s) => codecTypeOf(s) === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s))) ? ' -strict unofficial' : '';
    };
    // ===== END SHARED: mp4 strict compliance arg =====

    // ===== SHARED [audio_clean, clean_and_remux]: language list match =====
    // -=-=-= langListMatch  [audio_clean, clean_and_remux] =-=-=-
    // True when a stream's language matches any entry in a pre-normalised key list (keys = userList.map(langKey), computed once per run). Only these two
    // plugins match a stream language against a user list; stream_ordering/sub_worker use langKey directly (indexOf / Set), so they carry langKey, not this.
    const langListMatch = (streamLang, keys) => keys.includes(langKey(streamLang));
    // ===== END SHARED: language list match =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg metadata escaping =====
    // -=-=-= escMeta [all five] =-=-=-
    // Tdarr does NOT pass the preset through a shell - it splits the string into a quote-aware argv array for child_process.spawn, so shell metacharacters
    // ($ ` ; |) are inert. The only injection vector is breaking out of the quoted value to inject a new ffmpeg ARGUMENT, which needs a double quote or a
    // control character; Tdarr's tokenizer strips quotes with no reliable backslash-escape convention, so we substitute rather than strip (each line below
    // says how). <io> must also be neutralised: it is the preset's OWN input/output split marker, and a second one inside a value silently DELETES every
    // argument after it - trailing -metadata writes and muxer flags never reach ffmpeg, with no error from either Tdarr or ffmpeg.
    const escMeta = (value) => String(value || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')  // control characters (newlines, null bytes, etc.) → space
        .replace(/\\/g, '/')               // backslash → forward-slash (inert, readable)
        .replace(/"/g, "'")                // double-quote → single-quote (safe inside the quoted value)
        .replace(/<io>/gi, '(io)');        // preset split marker → inert text (a value may never carry a second marker)
    // ===== END SHARED: ffmpeg metadata escaping =====
    // #endregion

    // Missing/partial probe data fails the file with a clear reason, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Input validation - every type:'string' input is checked; the free-text ones (language_fill, language_sub) against the language recogniser
    // (knownLangToken below), since a typo silently changes which streams survive. type:'boolean' inputs are coerced by loadDefaultValues, so a guard on
    // them would be dead code. container goes first, before the dstContainer parse, so an empty value fails cleanly rather than as a raw TypeError.
    if (!inputs.container || inputs.container === '')
        failFile(`[container=${inputs.container || ''}] not configured, check your settings`);

    const srcContainer = file.container.toLowerCase().trim();
    // let, not const: method_unmuxable=mkv_fallback rewrites this (and response.container) for THIS file when the target container cannot store one of its
    // codecs. The rewrite happens before any consumer runs - see the muxability gate at the top of the per-file work below.
    let dstContainer = inputs.container.toLowerCase().trim();
    // Membership guard, like the sibling dropdown guards below: all container-specific logic branches on the literals mkv/mp4, so an out-of-set value (only
    // reachable via a hand-edited/imported config) would silently fall through to a generic remux into an unsupported container - a runtime ffmpeg muxer
    // error instead of a clean quarantine.
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
    // Does a tag_disposition / tag_title mode (disabled|audio|subtitle|both) cover this stream type?
    const appliesToType = (mode, type) => mode === 'both' || mode === type;
    const removeComments = String(inputs.remove_comments) === 'true';
    const removeBusytitle = String(inputs.remove_busytitle) === 'true';
    const removeImageSubs = String(inputs.remove_imagesubs || 'unsupported').toLowerCase();
    const methodUnmuxable = String(inputs.method_unmuxable || 'error').toLowerCase().trim();

    const fillLanguage = (inputs.language_fill ? inputs.language_fill.toLowerCase().trim() : '');
    const subLanguage = splitList(inputs.language_sub).map(lang => lang.toLowerCase());
    // Pre-normalise the user language list to comparison keys once (langKey folds en/eng/english/en-US and 639-2/B vs /T) - the filter matches against these.
    const subLangKeys = subLanguage.map(langKey);
    const fillMode = String(inputs.language_fill_mode || 'single-or-error').toLowerCase();
    const removeSubSdh = String(inputs.remove_sub_sdh || 'disabled').toLowerCase();
    const tagLanguage = String(inputs.tag_language || 'invalid').toLowerCase();
    const methodTagLanguage = String(inputs.method_tag_language || 'container').toLowerCase();
    const guardAudioLanguage = String(inputs.guard_audio_language || 'disabled').toLowerCase();

    // #region SHARED helpers (1 section: language display name)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language display name =====
    // -=-=-= langDisplayName  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Memoised ICU DisplayNames (built once, reused): the recognised English name for an ALREADY-normalised language code, or '' for a non-language/unknown
    // code. A fresh ICU instance per call is wasteful. Each caller normalises the token first - clean_and_remux via shortLang (tag recognition),
    // audio_clean, stream_ordering and sub_worker via langKey (free-text language-list validation / sidecar name recognition).
    const langDisplayName = (() => {
        let dn = null;
        return (code) => {
            try { dn = dn || new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }); return dn.of(code) || ''; }
            catch (e) { return ''; }
        };
    })();
    // ===== END SHARED: language display name =====
    // #endregion
    // Recognised language name for a tag's primary subtag, or '' - tells a real code (en, eng) from a spelled-out name ("english") or garbage. shortLang strips
    // any region/variant subtag first, so en-US is judged as en. Used by knownLangToken (both free-text language inputs), canonicalRegionTag and storesCleanly.
    const langName = (tag) => langDisplayName(shortLang(String(tag).toLowerCase()));

    // Sanitize a file-supplied string (title/comment/handler/filename) for one infoLog line: control characters become a space (a raw newline would split
    // the line into a continuation with no ☐/☑/☒ symbol), quotes/backslashes are preserved so the value reads faithfully (unlike escMeta - this is
    // display-only, never feeds ffmpeg), and it is length-capped: nothing bounds a container title and Tdarr persists the whole infoLog.
    const logSafe = (value, max = 200) => {
        const s = String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');
        return s.length > max ? `${s.slice(0, max)}…` : s;
    };

    // Undetermined / non-language codes we never rewrite (und, mul, zxx, mis, reserved qaa-qtz). Also the set knownLangToken accepts in the two free-text
    // language inputs, so one definition keeps input acceptance and the tag-canonicalisation side from disagreeing about what counts as a language.
    const isNonLang = (k) => k === 'und' || k === 'mul' || k === 'zxx' || k === 'mis' || /^q[a-t][a-z]$/.test(k);
    // A recognised language token, given its already-folded langKey: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to a base
    // code) or one of the isNonLang special/private codes. Both free-text language inputs are checked through this, so an unrecognised token (typo/garbage)
    // fails the file rather than silently changing which streams survive.
    const knownLangToken = (key) => isNonLang(key) || !!langName(key);
    // #region SHARED helpers (1 section: language token failure)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language token failure =====
    // -=-=-= failLangToken  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The failFile message echoes the offending token capped at 200 chars, with control characters collapsed to a space: free text is unbounded and Tdarr
    // persists the whole error message, and a raw newline in the echo would split the line into a continuation carrying no ☐/☑/☒ status symbol.
    const failLangToken = (name, token) => failFile(`[${name}=${String(token ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}] not a recognised language`
        + ' - use an ISO-639 code (en/eng/fre), an English name (English), a BCP-47 tag (pt-BR), or a special code (und/mul/zxx/mis/qaa-qtz)');
    // ===== END SHARED: language token failure =====
    // #endregion
    // Value checks resume here (container was checked above): the free-text language inputs first, their cross-check once both are known-good, then the
    // dropdowns. A bad language_fill would be written into a stream and demote it downstream; a bad language_sub is worse - ONE unrecognised token makes
    // every subtitle fail the match and get mapped out on a remux that reports success.
    if(fillLanguage && !knownLangToken(langKey(fillLanguage)))
        failLangToken('language_fill', inputs.language_fill);
    // language_fill is a WRITE, so unlike language_sub it does not accept the isNonLang special codes. Every one of them canonicalises to nothing (see
    // toCanonicalTag), so the fill would emit no tag at all - yet resolveWorkLang still reports it, so untagged tracks would be kept or dropped against a
    // language the file will never carry. Silent, and it never converges. Rejected here rather than quietly ignored, in line with every other language INPUT.
    if(fillLanguage && isNonLang(langKey(fillLanguage)))
        failFile(`[language_fill=${logSafe(fillLanguage)}] a special code (und/mul/zxx/mis/qaa-qtz) cannot be written as a fill - an untagged track already`
            + ' counts as und; use a real language code, or clear language_fill and list the special code in language_sub to keep those tracks');
    for(let i = 0; i < subLangKeys.length; i++)
        if(!knownLangToken(subLangKeys[i])) failLangToken('language_sub', subLanguage[i]);
    // If fillLanguage is set it should be a subtitle that's kept. (There is no audio equivalent: audio_clean owns audio language, and it reads the tag
    // this plugin has already written rather than language_fill itself, so there is nothing here to cross-check against.)
    if(fillLanguage && subLanguage.length > 0 && !subLangKeys.includes(langKey(fillLanguage)))
        failFile(`[language_fill=${logSafe(fillLanguage)}] not in language_sub - untagged subtitle streams would be removed;`
            + ' add it to language_sub or clear language_fill');
    if(!['single-or-error', 'force-any'].includes(fillMode))
        failFile(`[language_fill_mode=${fillMode}] invalid value, check your settings`);
    if(!['disabled', 'if_plain_survives', 'all'].includes(removeSubSdh))
        failFile(`[remove_sub_sdh=${removeSubSdh}] invalid value, check your settings`);
    if(!['disabled', 'audio', 'subtitle', 'both'].includes(tagDisposition))
        failFile(`[tag_disposition=${tagDisposition}] invalid value, check your settings`);
    if(!['disabled', 'audio', 'subtitle', 'both'].includes(tagTitle))
        failFile(`[tag_title=${tagTitle}] invalid value, check your settings`);
    if(!['invalid', 'strict', 'disabled'].includes(tagLanguage))
        failFile(`[tag_language=${tagLanguage}] invalid value, check your settings`);
    if(!['container', '639-2/t', '639-2/b', 'bcp47'].includes(methodTagLanguage))
        failFile(`[method_tag_language=${methodTagLanguage}] invalid value, check your settings`);
    if(!['disabled', 'light', 'aggressive'].includes(recoverData))
        failFile(`[recover_bad_data=${recoverData}] invalid value, check your settings`);
    if(!['disabled', 'light', 'aggressive'].includes(recoverTs))
        failFile(`[recover_bad_timestamps=${recoverTs}] invalid value, check your settings`);
    if(!['disabled', 'enabled'].includes(guardAudioLanguage))
        failFile(`[guard_audio_language=${guardAudioLanguage}] invalid value, check your settings`);
    if(!['unsupported', 'all', 'export'].includes(removeImageSubs))
        failFile(`[remove_imagesubs=${removeImageSubs}] invalid value, check your settings`);
    if(!['error', 'drop', 'mkv_fallback'].includes(methodUnmuxable))
        failFile(`[method_unmuxable=${methodUnmuxable}] invalid value, check your settings`);

    // ====== LANGUAGE TAG CANONICALIZATION ======
    // Write-side helpers: this is the only plugin that WRITES container language tags via tag_language/language_fill; langKey/langListMatch
    // (matching) are shared, the ISO639_2_B/toCanonicalTag write-side logic below is clean_and_remux-only. Verified on this build: mp4's
    // mdhd stores only a lowercase 3-letter ISO 639-2 code (2-letter / uppercase / region are silently dropped, so a plain mkv->mp4 remux
    // of an "en"-tagged stream loses its language), mkv stores any recognised code; und/mul/zxx/mis are never rewritten.
    // #region SHARED helpers (1 section: iso639-1 to iso639-2 map)
    // ===== SHARED [clean_and_remux, sub_worker]: iso639-1 to iso639-2 map =====
    // -=-=-= ISO639_1_TO_2  [clean_and_remux, sub_worker] =-=-=-
    // ISO 639-1 (2-letter) -> ISO 639-2/T (terminologic 3-letter), complete for every current 639-1 code; each row
    // verified to name the same language via ICU. Both writers map to /T for an mp4 target (its mdhd stores only a
    // 3-letter code): clean_and_remux via toCanonicalTag/method_tag_language, sub_worker via to6392T on subtitle import.
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
    // #endregion
    // The 20 languages whose 639-2/B (bibliographic) code differs from /T above, keyed by 639-1. method_tag_language=639-2/b uses these; /t uses the table.
    const ISO639_2_B = {
        sq:'alb',hy:'arm',eu:'baq',bo:'tib',my:'bur',zh:'chi',cs:'cze',nl:'dut',ka:'geo',de:'ger',el:'gre',is:'ice',mk:'mac',mi:'mao',ms:'may',
        fa:'per',ro:'rum',sk:'slo',cy:'wel',fr:'fre',
    };
    // Canonical BCP-47 tag keeping the region/script subtag - the mkv write side only; '' for a bare code, non-language, or unrecognised region tag.
    // getCanonicalLocales folds+cases the base and keeps region/script (por-BR->pt-BR, PT-br->pt-BR, eng-US->en-US, zh-Hans, es-419); langName rejects a
    // garbage base (xx-YY) and getCanonicalLocales throws on malformed input (_ . normalised to - first). No mp4 path calls this: mp4's mdhd cannot store
    // a region, so an mp4 target always folds it away.
    const canonicalRegionTag = (x) => {
        const raw = String(x || '').trim().toLowerCase().replace(/[_.]/g, '-');
        if (!raw.includes('-')) return '';                          // bare code -> existing 2-letter / 639-2 path
        if (!langName(raw)) return '';                              // unrecognised base -> fold via existing path
        try { const c = Intl.getCanonicalLocales(raw)[0] || ''; return c.includes('-') ? c : ''; }
        catch (e) { return ''; }
    };
    // The canonical language code to WRITE, per method_tag_language + destination container. '' => leave as-is (blank / undetermined / non-language).
    const toCanonicalTag = (x) => {
        const key = langKey(x);
        if (!key || isNonLang(key)) return '';
        const threeLetter = (wantB) => {
            if (key.length !== 2) return key;                        // already a 3-letter-only code (fil, yue) -> canonical as-is
            const t = ISO639_1_TO_2[key];
            if (!t) return key;
            return wantB ? (ISO639_2_B[key] || t) : t;
        };
        // mp4 can store only a 3-letter code, so both container-aware modes fold to 639-2/T there. On mkv, bcp47 keeps a region/script subtag (pt-BR) and
        // container keeps the bare 2-letter BCP-47 form (region folded away). The remaining modes write one 3-letter form to either container.
        if (methodTagLanguage === 'bcp47')     return dstContainer === 'mp4' ? threeLetter(false) : (canonicalRegionTag(x) || key);
        if (methodTagLanguage === 'container') return dstContainer === 'mp4' ? threeLetter(false) : key;
        return threeLetter(methodTagLanguage === '639-2/b');
    };
    // True when an already-present tag stores cleanly in dstContainer AS a recognised code (drives tag_language=invalid: leave these, fix the rest).
    const storesCleanly = (rawTag) => {
        const s = String(rawTag || '').trim();
        if (!s || isNonLang(langKey(s))) return true;               // blank / non-language -> not a rewrite candidate
        if (!langName(s)) return false;                             // spelled-out name or garbage -> fix
        // mkv: only an ALREADY-canonical region/script tag (pt-BR, zh-Hans) stores cleanly; a non-canonical one (EN-US, en_us, pt-br) is repaired
        // (invalid keeps the region and canonicalises it, strict enforces the method form). mp4 falls through and folds any region tag to 639-2/T.
        if (dstContainer !== 'mp4' && /[-_.]/.test(s)) return canonicalRegionTag(s) === s;
        if (s !== s.toLowerCase()) return false;                    // uppercase -> mp4 drops it / non-standard casing -> fix
        return dstContainer === 'mp4' ? /^[a-z]{3}$/.test(s) : /^[a-z]{2,3}$/.test(s);   // mp4 needs lowercase 3-letter; mkv keeps a bare 2/3-letter code
    };
    // A blank/und stream adopts language_fill when filling is allowed for that stream. fillLanguage is validated above to be a real language, so there is no
    // non-language case left to exclude here. Single predicate so the language the remove_sub_sdh pre-check filters on (resolveWorkLang) and the tag
    // canonicalLangMeta writes derive from the SAME rule.
    const fillApplies = (sl, allowFill) => allowFill && fillLanguage && (!sl || sl === 'und');
    // Language tag to WRITE for a kept video/audio/subtitle stream. Blank container tag + language_fill (audio/subtitle only): fill it, always in a canonical
    // form (see the fill branch below). Non-blank: canonicalise per tag_language (invalid = only tags storesCleanly rejects; strict = every tag).
    // und/non-language is never written. Returns { workLang, meta, log }.
    const canonicalLangMeta = (typeLetter, idx, ffstream, typeWord, allowFill) => {
        const rawTag = (ffstream.tags?.language || '').trim();
        const sl = resolveLang(ffstream);
        const blank = !sl || sl === 'und';
        const filled = fillApplies(sl, allowFill);
        let workLang = filled ? fillLanguage : (sl || 'und'), desired = '';
        if (filled) {
            // A fill is a WRITE of a NEW tag, never a preserved user tag, so it is ALWAYS canonicalised - tag_language=disabled means "don't rewrite EXISTING
            // tags", not "write an unrecognised string into a blank one" (language_fill accepts a spelled-out "English", which Matroska's Language element
            // cannot store as a code). mkv keeps a valid region/script subtag so a pt-BR fill survives (as the repair branch does); mp4 folds it away.
            desired = (tagLanguage !== 'disabled' || dstContainer === 'mp4')
                ? toCanonicalTag(fillLanguage)
                : (canonicalRegionTag(fillLanguage) || toCanonicalTag(fillLanguage));
        } else if (!blank && tagLanguage !== 'disabled' && (tagLanguage === 'strict' || !storesCleanly(rawTag))) {
            // strict enforces the method form (folds region under container/639-2); invalid only repairs syntax, so a recognised region/script tag keeps
            // its region (canonicalised: en_us -> en-US, pt-br -> pt-BR) on mkv. mp4 can't store a region, so it still folds to 639-2/T via toCanonicalTag.
            const repairRegion = tagLanguage === 'invalid' && dstContainer !== 'mp4' ? canonicalRegionTag(sl) : '';
            desired = repairRegion || toCanonicalTag(sl);
        }
        const compareTo = blank ? '' : rawTag;
        if (!desired || desired === compareTo) return { workLang, meta: '', log: '' };
        // Both echoed tags go through logSafe: the raw one is unbounded container metadata, and an UNRECOGNISED tag passes through the canonicaliser
        // unchanged, so `desired` inherits whatever the file supplied. escMeta already makes the -metadata value below safe; this is the log's own guard.
        const log = blank
            ? `☐${streamTag(ffstream.index)}[language_fill=${logSafe(fillLanguage)}] Language blank on ${typeWord} stream - setting to "${logSafe(desired)}"\n`
            : `☐${streamTag(ffstream.index)}[tag_language=${tagLanguage}] Standardise ${typeWord} language - "${logSafe(rawTag)}" to "${logSafe(desired)}"\n`;
        return { workLang, meta: ` -metadata:s:${typeLetter}:${idx} "language=${escMeta(desired)}"`, log };
    };
    // ====== END LANGUAGE TAG CANONICALIZATION ======

    // Subtitle codecs dropped purely by container/format, regardless of language - never assigned language_fill, excluded from the language_fill_mode tally.
    // alwaysDropSubs = unmuxable by BOTH containers AND not decodable to text: xsub (no Matroska CodecID, no mp4 tag - AVI is its only home) and
    // dvb_teletext (matroska rejects it; it CAN decode to srt, but only with a per-broadcaster teletext PAGE ffprobe does not expose - guessing yields the
    // whole teletext service, ~1300x the size). mkvOnlyDropSubs = carried by mp4 but not mkv: ttml muxes into mp4 as stpp (verified) while matroska has no
    // CodecID for it. mp4OnlyDropSubs = fine in mkv, not mp4: PGS and DVB (the mp4 muxer answers "Could not find tag for codec X in stream #N", measured),
    // plus arib_caption and hdmv_text_subtitle (decode-only for mp4). VobSub is deliberately NOT here - mp4 DOES carry dvd_subtitle, as the private mp4s/0xE0
    // object type: -c copy exits 0, codec_tag reads mp4s, the 152-byte palette extradata survives, ffmpeg decodes and renders it, and MediaInfo 23.07 reads it
    // back as Format VobSub / CodecID mp4s-E0. It needs no -strict and no conversion. arib_caption is effectively unreachable - no libaribb24 in the build, so
    // ARIB captions arrive as bin_data streams.
    const alwaysDropSubs  = ['xsub', 'dvb_teletext'];
    const mkvOnlyDropSubs = ['ttml'];
    const mp4OnlyDropSubs = ['hdmv_pgs_subtitle', 'dvb_subtitle', 'arib_caption', 'hdmv_text_subtitle'];
    // Legacy PC/fansub text codecs with no Matroska CodecID and no native mp4 support: a bare -c copy would fail the
    // remux, but ffmpeg decodes them as text, so BOTH container branches below convert them (mkv -> srt, mp4 -> mov_text).
    // Hoisted once so the two branches can't drift (a codec added to one list but not the other aborts a remux).
    const legacyTextSubs = ['microdvd', 'mpl2', 'jacosub', 'sami', 'realtext', 'subviewer', 'subviewer1', 'vplayer', 'pjs', 'stl'];
    // eia_608 as a real SUBTITLE STREAM - rare but real (a QuickTime 608 capture in the corpus). NOT the bitstream-embedded closed captions, which are
    // sub_worker's embedded_cc business. Neither container stores it, but ffmpeg DECODES it, so it converts rather than being thrown away. Listed
    // separately because it converts to `text`, not `srt`, on mkv: cc_dec emits ASS internally and the srt encoder passes unknown override tags THROUGH
    // (measured 17 `{\an7}`-style tokens on positioned content vs 0 for `text`), which Plex renders as literal on-screen words. Both land as subrip
    // inside matroska, so the choice costs nothing but the overrides; mov_text strips them too, so mp4 needs no special case.
    const CC_STREAM_SUBS = ['eia_608'];
    const subFormatDropped = (codec) => alwaysDropSubs.includes(codec)
        || (dstContainer === 'mkv' && mkvOnlyDropSubs.includes(codec))
        || (dstContainer === 'mp4' && mp4OnlyDropSubs.includes(codec));

    // ====== AUDIO / VIDEO CODEC x CONTAINER MUXABILITY ======
    // Which audio/video codecs the destination MUXER refuses on a -c copy. Every row was muxed for real into both containers; the 78-row matrix came out
    // IDENTICAL on Mac/Linux/Windows jellyfin-ffmpeg 7.1.4 (a muxer's codec-tag table is compiled-in, not a build option), so a static table is correct
    // and no runtime probe is needed. Keyed on the RAW ffprobe codec_name, NEVER resolveCodecName: that helper folds aac_latm->aac and pcm_*->pcm, and
    // since plain aac and pcm_s16le mux into mp4 fine, a resolved key would miss the exact rows this table exists for - aac_latm above all, the codec
    // every DVB/broadcast capture carries. Only PROVEN failures are listed, which is what makes it fail-safe: an unlisted codec reaches ffmpeg and fails
    // there exactly as it does today - incompleteness costs a missed diagnosis, never a wrongly-refused file.
    const MP4_UNMUXABLE = [
        // audio - "Could not find tag for codec X in stream #N, codec not currently supported in container"
        'aac_latm', 'adpcm_ima_wav', 'adpcm_ms', 'adpcm_yamaha', 'mlp', 'pcm_alaw', 'pcm_mulaw', 'pcm_u8', 'wmav1', 'wmav2',
        // video - same error
        'cinepak', 'dnxhd', 'dvvideo', 'ffv1', 'ffvhuff', 'flv1', 'h263', 'huffyuv', 'magicyuv', 'msmpeg4v2', 'msmpeg4v3',
        'prores', 'qtrle', 'svq1', 'theora', 'utvideo', 'v210', 'vp8', 'wmv1', 'wmv2',
        // Flash ADPCM: mp4 has no tag for it, but matroska does carry it (its sibling adpcm_ima_qt does not) - so mkv_fallback CAN rescue this one.
        'adpcm_swf',
    ];
    // Refused by BOTH muxers - matroska answers "No wav codec tag found for codec X". mkv_fallback cannot rescue these, because there is nothing to fall back
    // TO; the gate degrades them to error/drop and says so. (s302m and pcm_bluray occur naturally only in MPEG-TS and on Blu-ray respectively, which is how a
    // file can be carrying a codec neither of our two output containers accepts.)
    const UNMUXABLE_ANYWHERE = ['ac4', 'adpcm_ima_qt', 'nellymoser', 'pcm_bluray', 's302m'];
    // Refused by MATROSKA but muxable into mp4 - the mirror of MP4_UNMUXABLE, measured the same way. Deliberately SHORTER than the mp4 half: only a codec
    // this build can encode, or that exists as a real sample, is testable at all, and matroska accepted nearly everything offered (every lossless video
    // codec, wmav1/wmav2, the adpcm family bar the two above, aac_latm, VVC, DTS, TrueHD). rawvideo is the one measured failure deliberately NOT listed:
    // matroska refuses only its RGB pixel formats while yuv420p/gray mux fine, and the gate is keyed on codec_name alone - listing it would wrongly refuse
    // every YUV rawvideo file, the opposite of fail-safe (a missing row costs a diagnosis, a wrong row costs the user their file).
    const MKV_UNMUXABLE = ['mpegh_3d_audio'];
    // The one codec mp4 gates rather than refuses: it answers "truehd in MP4 support is experimental, add '-strict -2'" (rc 88), and an OUTPUT-side -strict
    // experimental / -2 does satisfy it (-strict unofficial does not). That flag is deliberately NOT used to force a conversion - it writes a valid but
    // non-standard file most players cannot decode, trading a loud diagnosable failure for a quiet unplayable one - so a truehd mkv bound for mp4 is gated
    // exactly like the rows above. It survives only for a file that is ALREADY mp4-family TrueHD (codec_tag mlpa), where the format is a fact on disk rather
    // than a conversion we are choosing: re-muxing mp4 -> mp4 emits the flag and preserves it instead of overriding the user's container.
    const MP4_STRICT_GATED = ['truehd'];
    // Which of the three the codec falls into for the CURRENT destination, or '' when it muxes fine. Read once per stream by the gate below.
    const unmuxableClass = (codec) => {
        if (UNMUXABLE_ANYWHERE.includes(codec)) return 'anywhere';
        if (dstContainer !== 'mp4') return MKV_UNMUXABLE.includes(codec) ? 'mkv' : '';
        if (MP4_STRICT_GATED.includes(codec)) return isMp4Family(srcContainer) ? '' : 'mp4';   // already-mp4 TrueHD is preserved with -strict, see above
        return MP4_UNMUXABLE.includes(codec) ? 'mp4' : '';
    };
    // ====== END AUDIO / VIDEO CODEC x CONTAINER MUXABILITY ======
    // Image-based subtitles: mkv muxes PGS/VobSub/DVB natively and mp4 carries VobSub alone (as mp4s), so remove_imagesubs governs all three,
    // while mp4OnlyDropSubs additionally drops PGS and DVB on mp4. xsub is image-based too and stays in alwaysDropSubs because it muxes into NO
    // container - but it is still EXPORTABLE:
    // AVI is its native home and a -c:s copy into one preserves the codec and every packet (verified). Being in both lists is the point -
    // the export is the user's choice, the drop is not. IMAGE_SUB maps each image codec to its sidecar container: PGS -> raw .sup,
    // VobSub/DVB -> a single-stream Matroska .mks (no vobsub muxer exists), xsub -> .avi, all via -c:s copy. What decides the mapping is
    // whether the RAW stream is SELF-DESCRIBING: PGS segments carry PTS and xsub packets carry inline [HH:MM:SS.mmm-...] ranges, so a raw
    // or native container round-trips; VobSub/DVB timing lives outside the stream (in the .idx), so those need a real container. The .mks
    // output needs an explicit -f matroska - ffmpeg only auto-detects matroska from a .mkv extension, not .mks (verified); .sup and .avi
    // both auto-detect from the extension.
    const IMAGE_SUB = {
        hdmv_pgs_subtitle: { ext: 'sup', fmt: 'sup'      },   // raw PGS segments; they carry their own PTS, so no container is needed
        dvd_subtitle:      { ext: 'mks', fmt: 'matroska' },   // VobSub timing lives in a separate .idx, so the stream needs a real container
        dvb_subtitle:      { ext: 'mks', fmt: 'matroska' },
        xsub:              { ext: 'avi', fmt: 'avi'      },   // AVI is the only container that holds xsub; packets carry inline timestamp ranges
    };
    const isImageSub = (codec) => Object.prototype.hasOwnProperty.call(IMAGE_SUB, codec);
    // 'all'/'export' drop every image sub; 'unsupported' relies on subFormatDropped (container-forced) alone. imageSubDropped is the
    // remove_imagesubs-specific drop beyond subFormatDropped, used by subDroppedAnyReason for the language_fill tally + accessibility plain-track guard.
    const imageSubDropped = (codec) => isImageSub(codec) && (removeImageSubs === 'all' || removeImageSubs === 'export');

    // #region SHARED helpers (1 section: styled subtitle test)
    // ===== SHARED [clean_and_remux, sub_worker]: styled subtitle test =====
    // -=-=-= STYLED_SUBS / isStyledSub  [clean_and_remux, sub_worker] =-=-=-
    // ASS/SSA are the subtitle formats whose CONTENT is markup: positioning, drawing commands and style overrides live inside the cue text itself. Every
    // other text format degrades gracefully when converted - srt and webvtt lose only colour and alignment - but flattening a styled subtitle renders its
    // overrides as literal on-screen words, so both plugins must recognise the pair before deciding what to do with a subtitle, and must recognise the
    // same pair. Bitmap subtitle formats are not styled text and are handled separately in both.
    const STYLED_SUBS = ['ass', 'ssa'];
    const isStyledSub = (codec) => STYLED_SUBS.includes(String(codec).toLowerCase());
    // ===== END SHARED: styled subtitle test =====
    // #endregion
    // A styled subtitle cannot go into mp4 without being flattened into mov_text, which turns its override tags into literal on-screen text (measured: 99.6%
    // of lines in a real anime ASS carry one). So on an mp4 target it is EXPORTED as a Matroska bundle carrying the subtitle plus the container's font
    // attachments - the fonts exist nowhere else - and dropped from the video, rather than converted into garbage. mkv carries ass natively and never
    // reaches this. The name wears sub_worker's bundle marker so its import reads it back as a bundle rather than as an image-subtitle sidecar.
    const styledSubExported = (codec) => dstContainer === 'mp4' && isStyledSub(codec);
    // Matroska is the only container that can hold a subtitle and its fonts together (mp4 carries no attachments at all), and .mks is its subtitle-only
    // extension, so a media server that does not skip dotfiles still does not read the bundle as a video. The 'styled' mark is sub_worker's bundle token:
    // with it the file reimports as a bundle, fonts and all - which is what makes the export a round trip rather than a one-way archive.
    const STYLED_BUNDLE = { ext: 'mks', fmt: 'matroska', mark: 'styled' };

    // #region SHARED helpers (2 sections: preset path safety … font attachment test)
    // ===== SHARED [clean_and_remux, sub_worker]: preset path safety =====
    // -=-=-= pathIsPresetSafe  [clean_and_remux, sub_worker] =-=-=-
    // True when a real on-disk path can be embedded in a preset's quoted "${path}" token. Tdarr never shells out, but its worker tokenises each preset
    // half with a quote-aware parser before spawning ffmpeg, so a " anywhere in the path closes the wrapper mid-token and everything after it becomes
    // fresh argv entries (a raw control character breaks the token just as badly). The literal <io> is refused for a second reason: it is the preset's own
    // input/output split marker, and Tdarr reads only the first two parts, so a path carrying one silently DELETES every argument after it. The name parts
    // WE generate are sanitised at their source, but the library DIRECTORY is a real path that has to stay literal - it can only be checked, never
    // rewritten - so a caller that fails this test refuses that one sidecar with a ☒ line rather than emit the token.
    const pathIsPresetSafe = (p) => !/["\x00-\x1f\x7f]/.test(String(p)) && !/<io>/i.test(String(p));
    // ===== END SHARED: preset path safety =====

    // ===== SHARED [clean_and_remux, sub_worker]: font attachment test =====
    // -=-=-= isFontAttachment  [clean_and_remux, sub_worker] =-=-=-
    // True when an attachment stream is an embedded font. Identified three ways because older builds report codec_name 'none'/'unknown' for a font:
    // the ttf/otf codec name, a font mimetype, or a font filename extension. Read by clean_and_remux's attachmentKind (orphaned-font removal) and
    // sub_worker's styled-subtitle .mks bundle (the fonts that must travel with an extracted ASS/SSA so its styling survives the round-trip).
    const isFontAttachment = (s) => {
        const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s.tags?.filename || '').trim().toLowerCase();
        const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
        return ['ttf', 'otf'].includes((s.codec_name || '').trim().toLowerCase()) || isFontMime(mime) || FONT_EXTS.includes(ext);
    };
    // ===== END SHARED: font attachment test =====
    // #endregion

    const path = require('path'); const fs = require('fs');   // fs: the sidecar placement section below (temp staging dir + sizes) and the export exists-check

    // #region SHARED helpers (2 sections: sidecar path derivation … sidecar placement)
    // ===== SHARED [clean_and_remux, sub_worker]: sidecar path derivation =====
    // -=-=-= libFilePath / libDir / videoBase / sidecarLangToken  [clean_and_remux, sub_worker] =-=-=-
    // Where a sidecar is written, plus the two metadata-derived name parts that get interpolated into the quoted "${path}" token of a preset. These two plugins
    // are the only ones that write files next to the library video, and both must sanitise identically, so the derivation lives here rather than being spelled
    // out twice - it is security-relevant, and a copy outside the shared markers is one awk-shared-block-check structurally cannot compare.
    // originalLibraryFile is the true on-disk file; file.file is the fallback so the plugin still works when a caller (or the test harness) omits it.
    // videoBase and sidecarLangToken are sanitised at their source: a crafted filename or container language tag must not inject a path separator or
    // ".." (escaping libDir) or a " that closes the quote and appends ffmpeg args, and must not carry the preset's own <io> split marker (Tdarr reads
    // only the first two parts, so a second marker deletes every argument after it). Nothing bounds a container language tag either, so the token is
    // capped as well: 32 clears every real ISO 639 / BCP-47 value by a wide margin, while an uncapped one runs past NAME_MAX, and ffmpeg answers an
    // unopenable output path by refusing EVERY output of the run - the whole remux - rather than just that sidecar. The library DIRECTORY is deliberately
    // NOT sanitised - a real path has to stay literal - so callers CHECK the joined path with pathIsPresetSafe and refuse that one sidecar when it fails.
    const libFilePath = otherArguments?.originalLibraryFile?.file || file.file || '';
    const libDir = path.dirname(libFilePath);
    const videoBase = path.basename(libFilePath).replace(/\.[^.]+$/, '').replace(/["\x00-\x1f\x7f]/g, '').replace(/<io>/gi, '');
    const sidecarLangToken = (s) => (resolveLang(s) || 'und').replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'und';
    // ===== END SHARED: sidecar path derivation =====

    // ===== SHARED [clean_and_remux, sub_worker]: sidecar placement =====
    // -=-=-= nodeConfig / isUnmappedNode / serverSidePath  [clean_and_remux, sub_worker] =-=-=-
    // Where a sidecar lands depends on the node. A MAPPED node sees the real library, so a sidecar emitted as an extra output of Tdarr's own ffmpeg run
    // lands in it - and sidecar + strip are outputs of the SAME command, so they succeed or fail together. An UNMAPPED node works in a mirror and uploads
    // only the transcode RESULT back - a sidecar written beside it is discarded while the strip succeeds, the one shape that loses subtitle content.
    // nodeType is the authority; a filesystem probe false-passes, because the mirror genuinely is a writable directory holding a real copy of the video.
    const nodeConfig = otherArguments?.configVars?.config || {};
    const isUnmappedNode = String(nodeConfig.nodeType || '').toLowerCase() === 'unmapped';
    // A node path -> the server's own path for it, via the translators Tdarr auto-populates on an unmapped node; longest node prefix wins. '' means no
    // translator claims the path - the destination is unknowable, and a caller must refuse the export instead of inventing one.
    const serverSidePath = (p) => {
        const hit = (Array.isArray(nodeConfig.pathTranslators) ? nodeConfig.pathTranslators : [])
            .filter((t) => t && t.node && String(p).startsWith(String(t.node)))
            .sort((a, b) => String(b.node).length - String(a.node).length)[0];
        return hit ? String(hit.server) + String(p).slice(String(hit.node).length) : '';
    };

    // -=-=-= sidecarExistsRemote / placeSidecars  [clean_and_remux, sub_worker] =-=-=-
    // The unmapped route: Tdarr runs the preset only AFTER the plugin returns, so there is no post-ffmpeg hook - extraction happens HERE and must be
    // confirmed placed before the caller may strip the embedded stream. The API is gated server-side on "Allow unmapped Nodes and source/cache file access
    // through API", and the server cannot have handed this job to an unmapped node with that off - so no capability probe, and also why a MAPPED node must
    // keep writing directly (the option is off by default). curl through spawnSync because a classic plugin is synchronous. Values go through
    // --form-string so a comma/semicolon in a title can never be read as curl -F syntax; the file part names an index-built temp path, never the sidecar name.
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
    // One generous ceiling for every spawn here - a hung ffmpeg or curl is killed rather than holding the worker forever. curl takes seconds and spawnSync
    // milliseconds; deriving one from the other keeps the two spellings from drifting.
    const SIDECAR_SPAWN_TIMEOUT_MS = 1800000;
    const SIDECAR_SPAWN_TIMEOUT_S = String(SIDECAR_SPAWN_TIMEOUT_MS / 1000);
    // The server base URL, trailing slashes stripped. '' means the config carries no URL at all - "no route", never a request against an empty host.
    const serverApiUrl = () => String(nodeConfig.serverURL || '').replace(/\/+$/, '');
    // The API key authorises upload/download across the WHOLE library. As -H arguments it would sit in the process table (/proc/<pid>/cmdline is
    // world-readable on Linux, where this route almost always runs) for the life of the spawn - so the headers go in on STDIN as a curl config and argv
    // carries only `--config -`. No call site feeds curl a body via stdin, so it is free for this. Inside curl's double-quoted config syntax a backslash
    // or quote is escaped, and control characters - which would end the line and start a fresh directive - are dropped.
    const apiAuthKey = () => String(nodeConfig.apiKey || '').replace(/[\x00-\x1f\x7f]/g, '').replace(/([\\"])/g, '\\$1');
    const apiAuthArgs = () => (apiAuthKey() ? ['--config', '-'] : []);
    const apiAuthInput = () => {
        const key = apiAuthKey();
        return key ? `header = "x-api-key: ${key}"\nheader = "tdarrKey: ${key}"\nheader = "Authorization: Bearer ${key}"\n` : '';
    };
    // Is a non-empty sidecar already at this server path? Download is the only read the API offers, so the test IS a fetch - discarded to the null device
    // and measured with curl's own counters, never buffered through spawnSync (a large body silently exceeds maxBuffer and fakes a failure).
    const sidecarExistsRemote = (dest) => {
        const { spawnSync } = require('child_process');
        const url = serverApiUrl();
        if (!url) return false;
        const r = spawnSync('curl', ['-sS', '-m', SIDECAR_SPAWN_TIMEOUT_S, '-o', nullDevice, '-w', '%{http_code} %{size_download}', ...apiAuthArgs(),
            '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify({ filePath: dest }), `${url}/api/v2/file/download`],
            { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, input: apiAuthInput() });
        const [code, got] = String(r.stdout || '').trim().split(/\s+/);
        return code === '200' && Number(got) > 0;
    };
    // -=-=-= uploadLibraryFile  [clean_and_remux, sub_worker] =-=-=-
    // The multipart POST to /api/v2/file/upload, in ONE place because the field ORDER is load-bearing: the server parses the stream as it arrives, so
    // filePath and fileSize must precede the file part or the upload is rejected as pathless. The 200 IS the verification - the server compares what it
    // wrote against fileSize. timeoutS is the caller's (a sidecar and a few-hundred-byte list differ by orders of magnitude). Returns { ok: true }, else
    // { ok: false, why } - plus empty: true for the one failure that is a VERDICT, not a fault: a staged file with no bytes. Callers key on that flag;
    // the prose in `why` is for the user, and nothing may re-derive meaning from its wording.
    const uploadLibraryFile = (dest, localPath, timeoutS) => {
        const { spawnSync } = require('child_process');
        const url = serverApiUrl();
        if (!url) return { ok: false, why: 'the node config carries no server URL to upload through' };
        let size = 0;
        try { size = fs.statSync(localPath).size; } catch (e) { size = 0; }
        if (!size) return { ok: false, empty: true, why: 'extraction produced no data' };
        const up = spawnSync('curl', ['-sS', '-m', String(timeoutS), '-o', nullDevice, '-w', '%{http_code}', ...apiAuthArgs(),
            '--form-string', `filePath=${dest}`, '--form-string', `fileSize=${size}`, '--form-string', `nodeID=${String(nodeConfig.nodeID || '')}`,
            '-F', `file=@${localPath}`, `${url}/api/v2/file/upload`], { encoding: 'utf8', timeout: Number(timeoutS) * 1000, input: apiAuthInput() });
        const code = String(up.stdout || '').trim();
        if (!up.error && code === '200') return { ok: true };
        return { ok: false, why: `upload rejected (${up.error ? (up.error.code || up.error.message) : `HTTP ${code || 'no response'}`})` };
    };
    // Extract every pending sidecar in ONE ffmpeg pass (even a tiny subtitle stream demuxes the whole container), then upload each. Returns the names
    // genuinely in the library - a caller may strip only those; anything in `failed` keeps its embedded stream, exactly as a refused export does. `empty`
    // names the subset whose extraction produced zero bytes - an answer about the source, not a transport fault, memoisable so no later pass pays for the
    // same decode. A Set precisely so nobody has to read it back out of a prose message.
    const placeSidecars = (jobs) => {
        const os = require('os');
        const { spawnSync } = require('child_process');
        const placed = new Set(); const failed = new Map(); const empty = new Set();
        const tmpExt = (name) => path.extname(name).replace(/[^.a-z0-9]/gi, '');   // from our own table-driven extension, so the temp name stays ours alone
        const failAll = (why) => { for (const j of jobs) failed.set(j.name, why); return { placed, failed, empty }; };
        const url = serverApiUrl();
        if (!url) return failAll('the node config carries no server URL to upload through');
        // A PRIVATE staging directory: os.tmpdir() is world-writable on Unix, so a predictable name can be pre-created as a symlink by another local
        // user and ffmpeg's -y then writes THROUGH it, as the Tdarr user. mkdtemp's 0700 directory closes that window outright. Inside it names stay
        // trivially short - still from our own extension table, never the sidecar name.
        let stageDir = '';
        try { stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_sidecar_')); }
        catch (e) { return failAll(`could not create a staging directory (${e && e.message ? e.message : e})`); }
        const staged = jobs.map((j, i) => ({ ...j, tmp: path.join(stageDir, `${i}${tmpExt(j.name)}`) }));
        // Best effort: a staging directory left behind is harmless, and failing the placement over it would lose the sidecars it just uploaded.
        const clearStaged = () => { try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) { /* see above */ } };
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', String(file._id || file.file || '')];
        for (const j of staged) args.push(...j.args, j.tmp);
        const ff = spawnSync(String(otherArguments?.ffmpegPath || 'ffmpeg'), args,
            { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
        if (ff.error || ff.status !== 0) {
            const why = ff.error ? `extraction failed (${ff.error.code || ff.error.message})`
                : `extraction failed (ffmpeg exit ${ff.status}: ${String(ff.stderr || '').trim().slice(0, 200)})`;
            clearStaged();
            return failAll(why);
        }
        for (const j of staged) {
            const up = uploadLibraryFile(j.dest, j.tmp, SIDECAR_SPAWN_TIMEOUT_MS / 1000);
            if (up.ok) { placed.add(j.name); continue; }
            if (up.empty) empty.add(j.name);
            failed.set(j.name, up.why);
        }
        clearStaged();
        return { placed, failed, empty };
    };
    // ===== END SHARED: sidecar placement =====
    // #endregion

    // Hidden dot-prefixed sidecar name: ".<video>.s<index>.<lang>[.forced][.<mark>].<ext>". The dot makes Plex/Jellyfin ignore it; Emby scans dotfiles, so
    // an exported .mks needs a .embyignore entry there (called out in the remove_imagesubs tooltip). `mark` carries sub_worker's bundle token on a
    // STYLED-subtitle export - what tells its import to read the file back as a font bundle; an image-subtitle export deliberately has none, so importing
    // one can never re-add the picture subtitle this pass just removed.
    const exportSidecarName = (ffstream, ext, mark) => {
        const forced = ffstream.disposition?.forced === 1 ? '.forced' : '';
        return `.${videoBase}.s${ffstream.index}.${sidecarLangToken(ffstream)}${forced}${mark ? `.${mark}` : ''}.${ext}`;
    };
    // A subtitle removed regardless of language - by container/format (subFormatDropped), by remove_imagesubs
    // (imageSubDropped), or by the mp4 styled-subtitle bundle export (styledSubExported), which maps the track out of the
    // video. None is ever assigned language_fill, and none counts as a survivor for the language_fill_mode untagged tally or
    // the remove_sub_sdh plain-track guard: a track this run deletes cannot be the plain track another track falls back on.
    const subDroppedAnyReason = (codec) => subFormatDropped(codec) || imageSubDropped(codec) || styledSubExported(codec);

    // #region SHARED helpers (1 section: title canonicalization)
    // ===== SHARED [audio_clean, clean_and_remux]: title canonicalization =====
    // Canonical audio-title machinery, shared so audio_clean's downmix titles come out already in clean_and_remux's tag_title form (no wasted remux).
    // Canonical form: "<channel/downmix base> - <role tags>", roles LAST ("5.1 -> 2.0 - Commentary"). canonicalAudioTitle is the entry point.
    // -=-=-= channel-label vocab: channelTitleLabels / bareChannelRegex / downmixChannelRegex  [audio_clean, clean_and_remux] =-=-=-
    // The channel labels we recognise/replace for tag_title - 2.0 included so it can be overwritten with Stereo
    const channelTitleLabels = ['7.1', '6.1', '5.1', '5.0', '4.0', '3.1', '3.0', '2.1', '2.0', 'stereo', 'mono'];
    const channelLabelAlternation = channelTitleLabels.map(l => l.replace(/\./g, '\\.')).join('|');
    // A bare channel title (the whole title is just a channel label) - we own these and may derive/overwrite them
    const bareChannelRegex = new RegExp(`^(${channelLabelAlternation})$`, 'i');
    // A downmix base ("5.1 -> 2.0"): a bare channel label on BOTH sides of the "->". Requiring the left side too keeps a rich custom title that merely
    // ends in "-> <channel>" ("Dolby Digital Plus / 7.1 / 48 kHz / 1024 kbps -> 2.0") classified as custom - left alone, not stripped and rewritten.
    const downmixChannelRegex = new RegExp(`^(${channelLabelAlternation})\\s*->\\s*(${channelLabelAlternation})$`, 'i');
    // -=-=-= channelLabel  [audio_clean, clean_and_remux] =-=-=-
    // Channel count -> short label, honouring an LFE for the 3/4-channel ambiguity (3.1 vs 4.0, 2.1 vs 3.0). A target-only caller (audio_clean naming a
    // downmix result) passes the target count with hasLfe=false.
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
    // Strip surrounding whitespace/quotes and dedupe repeated segments ("Stereo / Stereo" -> "Stereo"). Busy-title removal (>3 periods) is applied by
    // callers AFTER tagging, not here - roles are captured into flags before an over-dotted title clears.
    function cleanStreamTitle(rawTitle) {
        // Strip the surrounding quotes by index. /^["']+|["']+$/ is quadratic in an INTERIOR quote run: the ^-anchored branch can only try offset 0, so
        // once a word character leads, ["']+$ re-scans from every offset inside the run, consumes it greedily and gives back a character at a time against
        // a failing $ (60k quote characters measured 5.7 s of blocked worker). Same defect, same reasoning and the same output as the whitespace
        // pre-collapse below - a title is unbounded container metadata, so neither may be left to backtrack.
        let title = (rawTitle || '').trim();
        let qa = 0; let qb = title.length;
        while (qa < qb && (title[qa] === '"' || title[qa] === "'")) qa += 1;
        while (qb > qa && (title[qb - 1] === '"' || title[qb - 1] === "'")) qb -= 1;
        title = title.slice(qa, qb);
        if (title) {
            // Collapse whitespace runs BEFORE the split: the leading \s* otherwise backtracks a character at a time from every offset inside a long run,
            // which is quadratic in that run's length (an interior 80k-space title measured 20 s of blocked worker). Output is unchanged - every part is
            // re-collapsed on this same line anyway, and the fall-through `return title` below deliberately still answers with the RAW string.
            const parts = title.replace(/\s+/g, ' ').split(/\s*(?:\/|\||-|•)\s*/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
            if (parts.length === 1) return parts[0];
            // When all parts are the same word (case-insensitive), deduplicate to the first occurrence. "First part wins" is
            // intentional: preserves the leading segment's casing (e.g. "Stereo / stereo"→"Stereo", "ENGLISH - English"→"ENGLISH").
            if (parts.length > 1 && parts.every(p => p.toLowerCase() === parts[0].toLowerCase()))
                return parts[0];
        }
        return title;
    }
    // -=-=-= dispKeysFor / titleTagsFor  [audio_clean, clean_and_remux] =-=-=-
    // dispKeysFor: the dispositions valid on a stream type. titleTagsFor: the deduped canonical tag strings a stream matches, excluding untagged flags
    // like default/cover-art. Both derive from dispositionTypes.
    const dispKeysFor = (type) => Object.keys(dispositionTypes).filter(k => dispositionTypes[k].streams.includes(type));
    const titleTagsFor = (s) => [...new Set(dispKeysFor(codecTypeOf(s))
        .filter(k => dispositionTypes[k].tag && hasDisposition(s, k)).map(k => dispositionTypes[k].tag))];
    // -=-=-= stripWords / trimNonWord / stripDispositionWords  [audio_clean, clean_and_remux] =-=-=-
    // Single-word keywords stripped when recovering the channel/base portion of a title (multi-word
    // keywords like "hearing impaired" can't appear as a lone channel token, so they are skipped).
    const stripWords = new Set(Object.values(dispositionTypes).flatMap(d => d.keywords).filter(w => !w.includes(' ')));
    // Trim a token's non-word edges by index, for the reason cleanStreamTitle's quote strip does: /^[^\w]+|[^\w]+$/ backtracks from every offset inside a
    // long interior non-word run. \w is ASCII-only, so every non-Latin LETTER counts as non-word and an ordinary whitespace-free CJK/Cyrillic title is one
    // token long enough to trigger it (60k characters measured 5.7 s of blocked worker) - no crafted punctuation needed. Output is identical.
    const WORD_CHAR = /\w/;
    const trimNonWord = (tok) => {
        const s = String(tok);
        let a = 0; let b = s.length;
        while (a < b && !WORD_CHAR.test(s[a])) a += 1;
        while (b > a && !WORD_CHAR.test(s[b - 1])) b -= 1;
        return s.slice(a, b);
    };
    // Drop disposition keywords and stray separators from a title, leaving the channel/downmix base.
    // Splits on whitespace, keeps the "->" downmix arrow, drops lone separators and any keyword token.
    const stripDispositionWords = (title) => (title || '')
        .split(/\s+/)
        .filter(tok => !['-', '/', '|', '•'].includes(tok)
            && !stripWords.has(trimNonWord(tok).toLowerCase()))
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
    // #endregion

    // Channel layout string from ffprobe, falling back to mediaInfo (ChannelLayout/ChannelPositions) - lets us spot the LFE that separates 3.1 from 4.0 and
    // 2.1 from 3.0 even when ffprobe omits channel_layout. Feeds channelLabel's hasLfe argument at the tag_title call site.
    const channelLayoutStr = (ffstream) => {
        const ffmedia = mediaInfoFor(ffstream);
        return (ffstream.channel_layout || ffmedia?.ChannelLayout || ffmedia?.ChannelPositions || '').toLowerCase();
    };
    // ffprobe's canonical layout strings for 2.1 and 3.1 are literally "2.1"/"3.1" - no "lfe" substring - so a plain
    // .includes('lfe') misses them and channelLabel would mislabel (and clobber) a 2.1 track as 3.0 / a 3.1 as 4.0. Treat
    // a nonzero digit after the first dot ("2.1","3.1","5.1","7.1.4") as an LFE too, alongside the verbose "FL+FR+LFE"
    // form. Only channelLabel's 3ch (2.1 vs 3.0) and 4ch (3.1 vs 4.0) cases read hasLfe, so 6/8-ch labels are unaffected.
    const layoutHasLfe = (ffstream) => { const s = channelLayoutStr(ffstream); return /lfe/.test(s) || /^\d+\.[1-9]/.test(s.trim()); };

    // Image filename extensions, for an attachment whose codec_name is absent or reads 'none'/'unknown'. COMPOSED from IMAGE_CODECS - every name there is
    // also its own file extension - so a codec added to that shared list is recognised by extension too, plus the extensions IMAGE_CODECS deliberately omits:
    // a filename extension is unambiguous where a codec name is not, so the JPEG family, JPEG 2000, AVIF and HEIC are safe here even though mjpeg/jpeg2000/
    // av1/hevc must stay out of IMAGE_CODECS as real moving-picture codecs. 'tif' is the alternate spelling of the 'tiff' codec name.
    const IMAGE_EXTS = [...IMAGE_CODECS, 'jpg', 'jpeg', 'jpe', 'jfif', 'tif', 'jp2', 'avif', 'heic'];

    // Classify an attachment stream so we only ever remove things we can positively identify:
    //   'image' - cover art / poster (an IMAGE_CODECS codec name, an image/* mimetype, or an IMAGE_EXTS filename extension). Always removed.
    //   'font'  - an embedded font (ttf/otf codec, a font mimetype, or a font filename extension). Removed ONLY when nothing in the output uses it (no
    //             surviving ASS/SSA subtitle). Older ffmpeg builds report codec_name 'none'/'unknown' for fonts, so we also ID by filename/mimetype,
    //             and never delete a font while a styled subtitle still needs it.
    //   'other' - anything unidentifiable (a bare 'none'/'unknown', no font/image signal). Left untouched - could be anything, never safe to remove.
    const attachmentKind = (s) => {
        const codec = (s.codec_name || '').trim().toLowerCase();
        const mime  = (s.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s.tags?.filename || '').trim().toLowerCase();
        const ext   = fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '';
        if (IMAGE_CODECS.includes(codec) || mime.startsWith('image/') || IMAGE_EXTS.includes(ext)) return 'image';
        if (isFontAttachment(s)) return 'font';
        return 'other';
    };

    // >3-period 'busy'/scene-release title test (>4 dot-segments). Callers apply it AFTER role tagging, per the cleanStreamTitle note.
    const tooManyPeriods = (s) => (s || '').trim().split('.').length > 4;

    // tag_disposition: the title keywords to promote into real +flags (audio and subtitle share the predicate). A promotion must PERSIST in the
    // destination container, or the flag never "takes" and the plugin re-promotes every pass - an infinite remux loop. Empirically (jellyfin-ffmpeg):
    // Matroska has no captions/lyrics flag, MP4/MOV no original/lyrics flag, and `-disposition +karaoke` reads back 0 from both - a +flag for those is
    // silently dropped by the muxer. captions is the SDH synonym of hearing_impaired (which persists in both containers), so hearing_impaired is promoted
    // in its place; a role with no storable flag is skipped - its title keyword still drives the classifiers, summary and sort order, so nothing is lost
    // but a non-persisting write. The set lists only flags with no storable target: lyrics/karaoke (neither container), original (mp4 only).
    const unstorableDisp = { mkv: new Set(['lyrics', 'karaoke']), mp4: new Set(['original', 'lyrics', 'karaoke']) };
    const dispositionsToPromote = (s, type) => {
        const out = []; const seen = new Set();
        for (const key of dispKeysFor(type)) {
            if (!dispositionTypes[key].tag || !hasDisposition(s, key)) continue;
            const target = key === 'captions' ? 'hearing_impaired' : key;   // canonicalise the SDH synonym to the container-portable flag
            if (s.disposition?.[target] === 1 || (unstorableDisp[dstContainer] || new Set()).has(target) || seen.has(target)) continue;
            seen.add(target); out.push(target);
        }
        // The same persistence rule for a mutually exclusive PAIR: matroska carries dub/original in ONE tri-state element (FlagOriginal), so setting both
        // bits writes NEITHER - and a promotion is additive, so it also clears whichever the source already carried (verified: `+dub+original` reads back
        // neither, and dub=1 remuxed with `+original` reads back neither). When the EFFECTIVE disposition - promoted plus already-carried - would hold
        // both, promote neither: the write cannot persist, it would destroy a real flag downstream guards key on (guard_original, guard_audio_language),
        // and the next pass would re-emit the identical preset until Tdarr errors the file as a transcode loop. mp4 stores dub alone and already lists
        // original as unstorable, so the pair can never be emitted there.
        if (dstContainer === 'mkv') {
            const effective = new Set(out.concat(['dub', 'original'].filter((k) => s.disposition?.[k] === 1)));
            if (effective.has('dub') && effective.has('original')) return out.filter((k) => k !== 'dub' && k !== 'original');
        }
        return out;
    };

    // This benign skip (processFile:false) must precede the per-file CONTENT checks below - the language_fill_mode / guard_audio_language pre-checks can
    // failFile (quarantine), and a non-video file the plugin only means to skip must never be routed to the error queue.
    if (file.fileMedium !== 'video') return skip('☑File is not a video\n');

    // remove_sub_sdh safety guard. A "plain" subtitle carries no commentary/descriptive/SDH/lyrics role. On if_plain_survives an SDH/CC subtitle goes only
    // when its language still has a plain subtitle that SURVIVES every whole-file drop reason (subDroppedAnyReason), so extras go and the last usable
    // track of that language stays; on `all` it goes regardless, and ending with no subtitles is an accepted outcome there. resolveWorkLang shares
    // canonicalLangMeta's fillApplies rule so the language this guard filters on and the tag that gets written can't drift. Audio has no equivalent:
    // audio_clean's downmix_secondary owns audio-description removal. plainSubLangs is FILLED after the muxability gate below (the format-filter test
    // reads dstContainer, which mkv_fallback can rewrite); sdhRemoved is the single predicate every site consults, so the tiers cannot drift across sites.
    const plainSubLangs = new Set();
    const isPlainTrack = (s) => !isCommentary(s) && !isDescriptive(s) && !isSdh(s) && !isLyrics(s);
    const hasPlainSameLang = (set, wl) => set.has(langKey(wl));
    const resolveWorkLang = (s) => { const sl = resolveLang(s); return fillApplies(sl, true) ? fillLanguage : (sl || 'und'); };
    const sdhRemoved = (s, wl) => removeSubSdh !== 'disabled' && isSdh(s) && (removeSubSdh === 'all' || hasPlainSameLang(plainSubLangs, wl));
    // The two filters that discard a subtitle on its own merits rather than because of its codec or the container - language_sub and remove_sub_sdh - as a
    // predicate the remove_imagesubs=export sites can consult BEFORE writing anything. Mirrors the stream loop's own tests exactly, so the answer here and
    // the drop it takes there can never disagree. Only the export needs it: exporting is one-way, so a sidecar written for a track those filters were about
    // to discard is a permanent file (and, on an unmapped node, an upload) giving the user an OCR job for a language they excluded.
    const subFilterDrops = (s) => {
        const wl = resolveWorkLang(s);
        if (subLanguage.length > 0 && !langListMatch(wl, subLangKeys)) return true;
        return sdhRemoved(s, wl);
    };

    // One guard around all the per-file work (the input summary, the muxability / guard_audio_language / language_fill_mode pre-checks, the unmapped-node
    // image-sub export, the per-stream loop and the font/metadata/preset build): a deliberate failFile abort (AwkFailFile) rethrows unchanged, and any
    // UNEXPECTED error fails the file too — annotated and carrying the full infoLog — instead of silently skipping. The summary walk is inside it because it
    // reads both probes for every stream, so it is real work that can throw. (Earlier input validation runs before this and fails via failFile directly.)
    try {
        // Summarise the input streams exactly as they arrived, before any removal/remux/quarantine. This plugin runs first, so it captures the file as
        // received; reading it alongside the stream-ordering plugin's output line shows where a file came from and where it ended up. Emitted ahead of the
        // muxability / guard_audio_language / language_fill_mode pre-checks so a quarantine from any of them still carries the input picture.
        response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

        // method_unmuxable: the destination muxer cannot store one of this file's codecs, so a -c copy remux would die on an opaque ffmpeg error. Runs
        // FIRST among the pre-checks - it is the most fundamental "can this even be written" question - and, load-bearing, before anything reads
        // dstContainer, since mkv_fallback rewrites it. Audio and video only: the three subtitle tables above already handle subtitles, by conversion
        // where one exists and by dropping where none does, and that behaviour is not this input's to override.
        const unmuxableDrops = new Set();
        {
            const offenders = (file.ffProbeData.streams || [])
                .filter((s) => ['audio', 'video'].includes(codecTypeOf(s)))
                .map((s) => ({ s, codec: (s.codec_name || '').toLowerCase().trim() }))
                .map((o) => ({ ...o, cls: unmuxableClass(o.codec) }))
                .filter((o) => o.cls);
            if (offenders.length) {
                const names = [...new Set(offenders.map((o) => o.codec))].join(', ');
                // A codec the fallback container cannot store either has nowhere to go, so mkv_fallback degrades to error and says why - silently doing
                // nothing, or silently dropping a track the user asked to keep, would both be worse than stopping. Two ways to end up there: no container
                // accepts the codec ('anywhere'), or MATROSKA is the one refusing it ('mkv'), where falling back to mkv is no answer at all.
                const stuck = offenders.filter((o) => o.cls === 'anywhere' || o.cls === 'mkv');
                if (methodUnmuxable === 'mkv_fallback' && stuck.length) {
                    failFile(`[method_unmuxable=mkv_fallback] ${[...new Set(stuck.map((o) => o.codec))].join(', ')} cannot be stored in mkv either,`
                        + ' so there is no container to fall back to - set method_unmuxable=drop to remove '
                        + `${stuck.length > 1 ? 'those streams' : 'that stream'},`
                        + ' or remux this file outside Tdarr');
                }
                if (methodUnmuxable === 'error') {
                    failFile(`[method_unmuxable=error][container=${dstContainer}] ${names} cannot be stored in ${dstContainer}`
                        + ` - set container=${dstContainer === 'mp4' ? 'mkv' : 'mp4'}, or method_unmuxable=drop to remove`
                        + ` ${offenders.length > 1 ? 'those streams' : 'that stream'} / mkv_fallback to keep just this file in mkv`);
                }
                if (methodUnmuxable === 'drop') {
                    for (const o of offenders) unmuxableDrops.add(o.s.index);
                } else {   // mkv_fallback, and every offender is mkv-storable (the 'anywhere' case failed above)
                    const abandoned = dstContainer;
                    dstContainer = 'mkv';
                    response.container = `.${dstContainer}`;
                    // Say the target was abandoned even when the fallback is a no-op. Landing back on the source's own container can leave nothing to do at
                    // all, and then the file is simply skipped - so without this line the user's container setting appears to have silently done nothing.
                    response.infoLog += `☒${streamTag(offenders[0].s.index)}[method_unmuxable=mkv_fallback] ${names} cannot be stored in ${abandoned}`
                        + ' - keeping this file in mkv instead'
                        + `${srcContainer === 'mkv' ? ' (it is already mkv, so no remux is needed for the container)' : ''}\n`;
                }
            }
        }

        // The ' -strict <level>' this remux needs, or '' (see mp4StrictArg). Computed HERE, right after the muxability gate, because it reads the FINAL
        // target container (mkv_fallback rewrites it) and the survivor set that gate leaves behind - a -strict describing a stream this run no longer
        // keeps would contradict MP4_STRICT_GATED's refusal rationale. Only unmuxableDrops can remove an AUDIO stream, so the survivor set is already complete.
        const strictArg = mp4StrictArg(dstContainer, file.ffProbeData.streams,
            (file.ffProbeData.streams || []).filter((s) => !unmuxableDrops.has(s.index)));

        // Fill the remove_sub_sdh plain-track set (declared above). AFTER the muxability gate because subDroppedAnyReason reads dstContainer, which
        // mkv_fallback rewrites - any earlier and a PGS track would count as format-dropped under the abandoned mp4 target. Still ahead of the
        // language_fill_mode pre-check, which subtracts the SDH tracks this guard will drop. Only if_plain_survives consults the set.
        if (removeSubSdh === 'if_plain_survives') {
            for (const s of (file.ffProbeData?.streams || [])) {
                if (codecTypeOf(s) !== 'subtitle' || !isPlainTrack(s)) continue;
                if (subDroppedAnyReason((s.codec_name || '').toLowerCase())) continue;
                const wl = resolveWorkLang(s);
                if (subLangKeys.length > 0 && !langListMatch(wl, subLangKeys)) continue;
                plainSubLangs.add(langKey(wl));
            }
        }

        // guard_audio_language: an early warning, BEFORE the remux costs anything. audio_clean decides what audio to keep but can only trust a track
        // MARKED 'original' - so when this file carries more than one genuine audio language and marks no original, abort and let the user tag it.
        // Languages fold through langKey; an untagged track counts as the language language_fill would give it, else "und". Commentary/descriptive tracks
        // are excluded - a foreign-language commentary says nothing about which track is the original.
        if (guardAudioLanguage === 'enabled') {
            const audioStreams = (file.ffProbeData.streams || []).filter((s) => codecTypeOf(s) === 'audio');
            const genuineLangs = new Set(audioStreams.filter((s) => !isCommentary(s) && !isDescriptive(s)).map((s) => langKey(resolveWorkLang(s))));
            if (genuineLangs.size > 1 && !audioStreams.some((s) => hasDisposition(s, 'original')))
                failFile(`[guard_audio_language=${guardAudioLanguage}] ${genuineLangs.size} audio languages (${[...genuineLangs].join(', ')})`
                    + ' and none marked original - one of them could be the original language;'
                    + ' mark the original track and requeue, or set guard_audio_language=disabled');
        }

        // language_fill_mode pre-check - only relevant when language_fill is set: it tags every untagged stream of a type IDENTICALLY, and a later plugin
        // can then treat them as duplicates and remove one (silent content loss); untagged they stay "und", which audio_clean's dedup skips. The separate
        // "several audio languages, none marked original" concern is guard_audio_language's (opt-in), not re-litigated here. Counts only untagged streams
        // that WILL REACH THE OUTPUT - one dropped by the language filter, container/format, the remove_sub_sdh guard or method_unmuxable=drop never
        // reaches a later plugin, and quarantining a file over tracks this very run deletes would be a stop the user cannot act on. Resolves language via
        // resolveLang, so a language only mediaInfo supplies is not treated as blank.
        if (fillMode === 'single-or-error' && fillLanguage) {
            const streams = file.ffProbeData.streams || [];
            const isUntagged = (s) => { const lang = resolveLang(s); return !lang || lang === 'und'; };
            // Inside this block language_fill assigns fillLanguage to every untagged track, so "does it survive the subtitle filter" is one check: kept
            // when the language list is empty (keep-all) or contains fillLanguage. Mirrors the main loop's own keep/drop decision.
            const keptByLangFilter = (keys) => keys.length === 0 || langListMatch(fillLanguage, keys);
            // An untagged SDH subtitle the remove_sub_sdh guard would drop is excluded too -
            // mirrors the loop's own removal predicate (untagged tracks resolve to fillLanguage).
            const removedBySdh = (s) => sdhRemoved(s, fillLanguage);
            // Both halves of the guard say the same thing about their own stream type, so they say it from one place - a user comparing two error-queue
            // entries from one feature should never find them worded differently, and the echoed fill value's logSafe cap is part of that wording.
            const failUntagged = (count, typeWord) =>
                failFile(`[language_fill_mode=${fillMode}] ${count} ${typeWord} streams have no language tag`
                    + ` and would all be assigned "${logSafe(fillLanguage)}" by language_fill`
                    + ' - may be different languages; tag them manually and requeue, or set language_fill_mode=force-any');
            const untaggedAudio = streams.filter((s) => codecTypeOf(s) === 'audio' && isUntagged(s) && !unmuxableDrops.has(s.index)).length;
            if (untaggedAudio > 1) failUntagged(untaggedAudio, 'audio');
            const untaggedSubs = keptByLangFilter(subLangKeys)
                ? streams.filter((s) => codecTypeOf(s) === 'subtitle'
                    && !subDroppedAnyReason((s.codec_name || '').toLowerCase()) && isUntagged(s) && !removedBySdh(s)).length : 0;
            if (untaggedSubs > 1) failUntagged(untaggedSubs, 'subtitle');
        }

        let extraArguments = '';
        let sidecarOut = '';   // remove_imagesubs=export: accumulates the per-image-sub sidecar outputs, prepended to the main output in the preset below.
                               // Stays empty on an unmapped node, where placeSidecars below uploads the exports instead of riding them on the remux.
        let fflags = '';
        let inputArgs = '';   // recovery args that must precede -i (e.g. -err_detect); placed on the input side of the preset
        let workDone = '';
        let convert = false;
        // Per-type OUTPUT ordinals, not source indices: they number the streams this run actually emits, and are threaded into -metadata:s:<t>:N, the
        // subtitle format conversion -c:s:N, and the hvc1 -tag:v:N. Start at -1 so the increment in each branch yields 0 for the first stream of that type.
        // subtitle and video are decremented again when their stream is dropped, so the survivors stay contiguous; audio needs no decrement, because the one
        // path that drops audio (method_unmuxable=drop) removes the stream BEFORE the type branches increment anything.
        let subtitleStreamIndex = -1;
        let audioStreamIndex = -1;
        let videoStreamIndex = -1;

        // remove_imagesubs=export on an UNMAPPED node: the sidecars cannot ride along as extra outputs of the remux (see the sidecar-placement section), so
        // they are extracted and uploaded HERE, before the stream loop decides anything - the loop then drops an image sub only when its export is in
        // placedSidecars, refusing the drop otherwise exactly as an unsafe path does. The pre-scan repeats the loop's own export test, so the two cannot
        // select different streams.
        let exportRefusedCount = 0;   // image-sub exports that could not be written this run - any at all fails the file, see the check after the stream loop
        const placedSidecars = new Set(); const failedSidecars = new Map();
        // The font attachments a styled-subtitle bundle carries. Read once here: they are the same set for every styled subtitle in the file, and the
        // pre-scan below needs them before the stream loop runs.
        const styledFontIndices = (file.ffProbeData.streams || [])
            .filter((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s)).map((s) => s.index);
        // WHAT a sidecar export is called and WHICH ffmpeg selection produces it, for the three sites that need it: the unmapped pre-scan below (which hands
        // the tokens to placeSidecars as argv) and the two in-loop preset builders (which join them into sidecarOut). A divergence between those two forms is
        // invisible to every check here - one is an array and the other a template literal - and the unmapped copy is UPLOADED into the user's library rather
        // than being a discardable extra output, so the two must not be able to disagree. The REFUSAL paths stay at their call sites: they differ deliberately
        // (an image refusal fails the file, a styled one falls through to mov_text, the pre-scan's just records into failedSidecars).
        const sidecarPlan = (ffstream, styled) => {
            const spec = styled ? STYLED_BUNDLE : IMAGE_SUB[(ffstream?.codec_name || '').toLowerCase()];
            return {
                name: exportSidecarName(ffstream, spec.ext, styled ? STYLED_BUNDLE.mark : ''),
                mapTokens: styled
                    ? ['-map', `0:${ffstream.index}`, ...styledFontIndices.flatMap((i) => ['-map', `0:${i}`]), '-c', 'copy', '-f', spec.fmt]
                    : ['-map', `0:${ffstream.index}`, '-c:s', 'copy', '-f', spec.fmt],
            };
        };
        if (isUnmappedNode) {
            const exportJobs = [];
            for (const s of (file.ffProbeData.streams || [])) {
                const codec = (s?.codec_name || '').toLowerCase();
                if (codecTypeOf(s) !== 'subtitle' || subFilterDrops(s)) continue;
                // Two kinds of export land here, differing only in what goes into the file: an image subtitle copied alone, or a styled subtitle bundled
                // with the container's fonts. Both upload BEFORE the stream loop decides anything (see the pre-scan header above).
                const styled = styledSubExported(codec);
                const image = imageSubDropped(codec) && removeImageSubs === 'export';
                if (!styled && !image) continue;
                const { name, mapTokens } = sidecarPlan(s, styled);
                const dest = serverSidePath(path.join(libDir, name));
                if (!dest) { failedSidecars.set(name, 'no path translator maps this library directory back to the server'); continue; }
                // Already on the server (a re-run, or a prior export the drop never followed): count it placed rather than re-extracting and re-uploading it.
                if (sidecarExistsRemote(dest)) { placedSidecars.add(name); continue; }
                exportJobs.push({ name, dest, args: mapTokens });
            }
            if (exportJobs.length) {
                const { placed, failed } = placeSidecars(exportJobs);
                for (const n of placed) placedSidecars.add(n);
                for (const [n, why] of failed) failedSidecars.set(n, why);
            }
        }

        // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset). removedIndices: input stream positions
        // dropped via -map -0:ffstream.index. subCodecOverride: input stream position -> converted subtitle codec ('srt' / 'mov_text').
        const removedIndices = new Set();
        const subCodecOverride = new Map();
        // Drop one input stream. The three writes are NOT independent: removedIndices is the sole input to the "Expected results" summary filter and to the
        // orphaned-font survivor test, so a drop site that maps a stream out without recording it makes the summary advertise a stream the command deletes.
        // Per-branch extras (a stream-index decrement, the continue) stay at the call site.
        const dropStream = (index) => {
            extraArguments += ` -map -0:${index}`;
            removedIndices.add(index);
            convert = true;
        };
        // The -strict level settled at the muxability gate: TrueHD already living in an mp4-family file and re-muxed back into one would see the very remux
        // that gate allowed FAIL without it, and a Dolby Vision stream would lose its dvcC/dvvC boxes to a plain mp4 copy. Emitted here rather than at the
        // gate because extraArguments is built inside this block. Not a `convert = true` trigger - it is inert unless some other work emits a command, and
        // forcing a remux just to add a flag would be a loop (an untouched file keeps its boxes).
        extraArguments += strictArg;

        // Font attachments whose removal is deferred until after the main loop, when we know which subtitle streams survive. Decided here (not inline)
        // because an attachment can appear before its subtitles in the file, so we cannot know whether a styled subtitle survives at the moment we reach
        // the attachment.
        const deferredFontIndices = [];

        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
            const ffstream = file.ffProbeData?.streams[i];
            const ffmedia = mediaInfoFor(ffstream);
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const ffstreamType = codecTypeOf(ffstream);

            // method_unmuxable=drop: the destination cannot store this codec at all, so the stream goes before any per-type work reads it. Dropping BEFORE the
            // type branches (rather than inside them) means the per-type output ordinal is never incremented for it, so survivors stay contiguous with no
            // decrement to remember.
            if (unmuxableDrops.has(ffstream.index)) {
                workDone += `☐${streamTag(ffstream.index)}[method_unmuxable=drop] Remove ${ffstreamType}-${ffstreamCodec} - ${dstContainer} cannot store it\n`;
                dropStream(ffstream.index);
                continue;
            }

            //Original stream title: ffprobe's tag, falling back to mediaInfo's Title (a title this plugin writes lands in both).
            const streamTitle = (ffstream.tags?.title || ffmedia?.Title || '');
            const streamLang = resolveLang(ffstream);
            let workLang = streamLang || 'und';

            //Metadata edits for this stream, accumulated by the emitters below and flushed onto the command at the end of the iteration.
            let metadataCommand = '';
            let delStream = false;
            // Per-stream handler_name canonicalisation, common to the subtitle/audio/video branches (mkv wipes it - it can confuse mkv title display; mp4
            // sets the per-type handler); wipeReason lets the video branch append its own note. Read case-insensitively (getTagCI): matroska UPPER-CASES
            // it to HANDLER_NAME, which mediaInfo surfaces as the Title - miss it and the busy handler re-triggers remove_busytitle every pass (an
            // infinite loop). ffmpeg matches -metadata keys case-insensitively, so the lowercase wipe still clears the uppercase tag.
            const emitHandlerMeta = (typeLetter, idx, typeWord, handlerName, wipeReason = '') => {
                const curHandler = getTagCI(ffstream.tags, 'handler_name');
                if (dstContainer === 'mkv' && curHandler) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Wiping handler_name tag${wipeReason} (${typeWord})`
                        + ` "${logSafe(curHandler)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "handler_name="`;
                } else if (dstContainer === 'mp4' && curHandler !== handlerName) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Setting handler_name tag (${typeWord}) to ${handlerName}`
                        + ` "${logSafe(curHandler)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "handler_name=${handlerName}"`;
                }
            };
            // tag_disposition (audio/subtitle): import any surfaced disposition keyword
            // found in the title into the real flag (additive, so existing flags are kept).
            const promoteDisposition = (type, typeLetter, idx) => {
                const promote = dispositionsToPromote(ffstream, type);
                if (promote.length > 0) {
                    workDone += `☐${streamTag(ffstream.index)}[tag_disposition=${tagDisposition}] Set disposition (${type}) from title`
                        + ` - ${promote.map(k => dispositionTypes[k].tag).join(' ')}\n`;
                    metadataCommand += ` -disposition:${typeLetter}:${idx} ${promote.map(k => `+${k}`).join('')}`;
                }
            };
            // Busy-title removal (audio/subtitle): once tag_disposition (above) has captured any role keywords into
            // the real flags, clear an over-dotted title so tag_title (below) re-names it by the usual rules - it
            // drops in and is treated as a blank title (an empty base becomes the channel label). Returns the title.
            const clearBusyTitle = (title, titleCauses) => {
                if (removeBusytitle && tooManyPeriods(title)) {
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
            // The same handler echo, but for a track that has a REAL title too: mediaInfo does not merely substitute the handler, it JOINS the two with " / "
            // (verified on the bundled MediaInfoLib 23.07 - mkv gives "Main Feature / Movie.2020.1080p.x264-GRP", mp4 the same pair handler-first), so an
            // exact-equality test sees nothing and a dot count over the join charges the handler's periods to the title. Drop the handler part and what is
            // left is the track's own title (empty when the handler was all of it). Needed because ffprobe does not surface an mp4 track's udta/name box at
            // all, so on mp4 the joined mediaInfo Title is the only place a per-track title appears. The handler itself is normalised by emitHandlerMeta.
            const mediaTitleSansHandler = () => {
                const handler = (getTagCI(ffstream.tags, 'handler_name') || '').trim();
                const mediaTitle = (ffmedia?.Title ?? '').trim();
                if (!handler || !mediaTitle) return mediaTitle;
                return mediaTitle.split(' / ').filter((part) => part.trim() !== handler).join(' / ').trim();
            };
            // Write a changed title, or reconcile ONLY when the ffprobe tag is missing but mediaInfo has a REAL one (mediaTitleIsHandler filters the handler
            // echo): the write adds the ffprobe tag so both probes agree next pass. The reverse (ffprobe has a title mediaInfo never reports) must NOT fire, or
            // a container that never surfaces Title to mediaInfo would remux every pass.
            const emitTitleMeta = (typeLetter, idx, typeWord, streamTitle, newStreamTitle, titleCauses) => {
                if (newStreamTitle !== streamTitle) {
                    workDone += `☐${streamTag(ffstream.index)}${titleCauses.length ? `[${titleCauses.join('][')}]` : ''} Change title (${typeWord})`
                        + ` "${logSafe(streamTitle)}" -> "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(newStreamTitle)}"`;
                } else if (ffmedia && !(ffstream.tags?.title) && (ffmedia.Title ?? '') !== '' && !mediaTitleIsHandler()) {
                    workDone += `☐${streamTag(ffstream.index)} Change title (${typeWord}) - found "${logSafe(ffstream.tags?.title ?? '')}"`
                        + ` and "${logSafe(ffmedia?.Title ?? '')}" change to "${logSafe(newStreamTitle)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(newStreamTitle)}"`;
                }
            };
            // remove_comments (audio/subtitle/video): drop a stream comment tag (players rarely show it). Guard + output mirror the handler_name emitter
            // above, the case-insensitive read (getTagCI) included - matroska stores this key as COMMENT; see there for why the lowercase wipe still clears it.
            // No mediaInfo fallback: MediaInfo defines Comment as a GENERAL-only parameter, so a per-TRACK comment never appears as track.Comment - the old
            // second half of this read could not fire, and no container puts a per-track comment in mediaInfo without ffprobe reporting it too.
            const emitCommentRemoval = (typeLetter, idx, typeWord) => {
                const curComment = getTagCI(ffstream.tags, 'comment');
                if (removeComments === true && curComment) {
                    workDone += `☐${streamTag(ffstream.index)}[remove_comments=true] Remove comment (${typeWord}) "${logSafe(curComment)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "comment="`;
                }
            };
            // language_fill / tag_language: write the canonical language tag for a kept stream. canonicalLangMeta decides it; this records the decision the
            // same way for all three stream types, so the "log it AND emit it" pair can never be applied to one branch and forgotten in another. Returns
            // canonicalLangMeta's workLang; the subtitle branch instead resolves its own earlier (resolveWorkLang), since it must decide keep/drop first.
            const emitLangMeta = (typeLetter, idx, typeWord, allowFill) => {
                const langMeta = canonicalLangMeta(typeLetter, idx, ffstream, typeWord, allowFill);
                if (langMeta.meta) { workDone += langMeta.log; metadataCommand += langMeta.meta; }
                return langMeta.workLang;
            };

            if(ffstreamType === 'subtitle') {
                subtitleStreamIndex++;

                // Image subs are governed by remove_imagesubs (see imageSubDropped / IMAGE_SUB); subs no container - or this one - can carry are dropped by
                // subFormatDropped; everything else falls through to the language/accessibility filters below. The export has to SUCCEED for the drop to
                // be safe (the sidecar is the only surviving copy): when the joined path can't be embedded in the quoted preset token (pathIsPresetSafe -
                // the library directory has to stay literal) the export AND the drop are refused with a ☒, and the stream falls through to the container
                // test, which still drops it on mp4 and keeps it on mkv. That ☒ goes straight to the infoLog rather than workDone: it warns about the
                // ENVIRONMENT, not a queued change, and workDone is flushed only on a real remux - a file whose only pending change WAS the refused export
                // would otherwise report "nothing requiring removal or conversion" and swallow the warning entirely.
                const imageSubDrop = imageSubDropped(ffstreamCodec);
                // language_sub / remove_sub_sdh discard this track on its own merits, so it must not be exported first: the sidecar is permanent (nothing
                // here ever deletes one, and on an unmapped node it is uploaded into the library over the file API), it hands the user an OCR job for a
                // track they excluded, and a refused export of one would fail the WHOLE file. The drop still happens - the stream simply falls through to
                // those filters below, which log the real reason. Only the export defers this way; 'all' keeps reporting the drop as its own.
                const exportSuppressed = removeImageSubs === 'export' && subFilterDrops(ffstream);
                let exportRefused = false;
                if (imageSubDrop && removeImageSubs === 'export' && !exportSuppressed) {
                    const { name: sidecarName, mapTokens } = sidecarPlan(ffstream, false);
                    const sidecarPath = path.join(libDir, sidecarName);
                    // Unmapped: the export already ran, above this loop - the drop is allowed only for a sidecar the server confirmed it holds, and the
                    // line is ☑ rather than ☐ because it reports work already done. A refusal reads like the unsafe-path one below and keeps the subtitle.
                    if (isUnmappedNode) {
                        if (placedSidecars.has(sidecarName)) {
                            workDone += `☑${streamTag(ffstream.index)}[remove_imagesubs=export] Exported image subtitle -> ${sidecarName}`
                                + ' for external OCR (before drop)\n';
                        } else {
                            exportRefused = true; exportRefusedCount += 1;
                            response.infoLog += `☒${streamTag(ffstream.index)}[remove_imagesubs=export] Could not place ${sidecarName} in the library`
                                + ` - ${failedSidecars.get(sidecarName)}, keeping the subtitle\n`;
                        }
                    } else if (pathIsPresetSafe(sidecarPath)) {
                        // ffmpeg refuses to overwrite an existing output file and aborts the ENTIRE run, so a sidecar left by an earlier pass would take the
                        // whole remux down with it rather than just skipping its own export. An existing sidecar has already served its purpose and may since
                        // have been OCR'd, so the export is simply not repeated and the drop still goes ahead - forcing it (-y) could only destroy that work.
                        let sidecarExists = false;
                        try { sidecarExists = fs.statSync(sidecarPath).size > 0; } catch (e) { sidecarExists = false; }
                        if (sidecarExists) {
                            workDone += `☑${streamTag(ffstream.index)}[remove_imagesubs=export] Sidecar already exists, not overwriting: ${sidecarName}\n`;
                        } else {
                            sidecarOut += ` ${mapTokens.join(' ')} "${sidecarPath}"`;
                            workDone += `☐${streamTag(ffstream.index)}[remove_imagesubs=export] Export image subtitle -> ${sidecarName}`
                                + ' for external OCR (before drop)\n';
                        }
                    } else {
                        exportRefused = true; exportRefusedCount += 1;
                        response.infoLog += `☒${streamTag(ffstream.index)}[remove_imagesubs=export] Library directory has a quote, control char or <io>`
                            + ` - cannot write ${sidecarName} safely, keeping the subtitle\n`;
                    }
                }
                if (imageSubDrop && !exportRefused && !exportSuppressed) {
                    // A codec that is ALSO in alwaysDropSubs (xsub) is removed whatever remove_imagesubs says, so it carries no input tag even
                    // when an export ran first - the export is caused by the setting, the removal is not, and the tag names the cause.
                    const imgCause = alwaysDropSubs.includes(ffstreamCodec) ? '' : `[remove_imagesubs=${removeImageSubs}]`;
                    workDone += `☐${streamTag(ffstream.index)}${imgCause} Remove image-based subtitle (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                } else if (subFormatDropped(ffstreamCodec)) {
                    // Container/format can't carry it. alwaysDropSubs (xsub/dvb_teletext) drop in ANY container - no setting governs them, so no tag;
                    // the rest (ttml on mkv; image subs, arib/hdmv_text on mp4) drop only because of the chosen container, so they carry [container=<dst>].
                    const dropCause = alwaysDropSubs.includes(ffstreamCodec) ? '' : `[container=${dstContainer}]`;
                    workDone += `☐${streamTag(ffstream.index)}${dropCause} Remove unsupported (${ffstreamType}-${ffstreamCodec})\n`;
                    delStream = true;
                }

                if (!delStream) {
                    // Decide removal BEFORE standardising the tag, so a subtitle dropped by language_sub / remove_sub_sdh / the styled-bundle export never
                    // logs a language correction it won't keep. workLang here equals canonicalLangMeta's own workLang (same fillApplies rule), so the
                    // keep/drop decision is unchanged - the tag write is just skipped for a stream about to be mapped out.
                    workLang = resolveWorkLang(ffstream);

                    //language_sub: drop a subtitle whose (possibly filled) language is not on the keep list. A blank list keeps every language.
                    if(subLanguage.length > 0 && !langListMatch(workLang, subLangKeys)) {
                        // logSafe's 200-char cap matters here: the whole language_sub list is echoed once PER dropped subtitle.
                        workDone += `☐${streamTag(ffstream.index)}[language_sub=${logSafe(inputs.language_sub)}] `
                            + `Remove subtitle language (${logSafe(workLang)})\n`;
                        delStream = true;
                    } else if (sdhRemoved(ffstream, workLang)) {
                        workDone += `☐${streamTag(ffstream.index)}[remove_sub_sdh=${removeSubSdh}] Remove accessibility subtitle SDH/CC`
                            + ` (${logSafe(roleTextLower(ffstream))})\n`;
                        delStream = true;
                    }
                }

                if(delStream === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    dropStream(ffstream.index);
                    subtitleStreamIndex--;
                    continue;
                }

                // A styled subtitle bound for mp4: export the bundle and drop the track rather than flatten it (see styledSubExported). AFTER every removal
                // filter, so a track language_sub or remove_sub_sdh discards is never exported first. The export must SUCCEED for the drop to be safe
                // (the bundle then holds the only styled copy); a refusal falls through to the mov_text conversion below with a ☒ naming the loss - a
                // mangled subtitle beats a vanished one.
                if (styledSubExported(ffstreamCodec)) {
                    const { name: sidecarName, mapTokens } = sidecarPlan(ffstream, true);
                    const sidecarPath = path.join(libDir, sidecarName);
                    const fontNote = styledFontIndices.length
                        ? ` with ${styledFontIndices.length} font attachment${styledFontIndices.length === 1 ? '' : 's'}` : ' (no embedded fonts to carry)';
                    let exported = false;
                    if (isUnmappedNode) {
                        if (placedSidecars.has(sidecarName)) { exported = true; workDone += `☑${streamTag(ffstream.index)}[container=mp4] Exported styled`
                            + ` ${ffstreamCodec} subtitle -> ${sidecarName}${fontNote}\n`; }
                        else response.infoLog += `☒${streamTag(ffstream.index)}[container=mp4] Could not place ${sidecarName} in the library`
                            + ` - ${failedSidecars.get(sidecarName)}; converting to mov_text instead, which loses the styling\n`;
                    } else if (pathIsPresetSafe(sidecarPath)) {
                        // ffmpeg aborts the whole run rather than overwrite an output file, so an existing bundle is left alone and the drop still goes
                        // ahead - it already holds this subtitle, and re-exporting could only destroy a copy the user may have edited.
                        let bundleExists = false;
                        try { bundleExists = fs.statSync(sidecarPath).size > 0; } catch (e) { bundleExists = false; }
                        exported = true;
                        if (bundleExists) workDone += `☑${streamTag(ffstream.index)}[container=mp4] Styled-subtitle bundle already exists,`
                            + ` not overwriting: ${sidecarName}\n`;
                        else {
                            sidecarOut += ` ${mapTokens.join(' ')} "${sidecarPath}"`;
                            workDone += `☐${streamTag(ffstream.index)}[container=mp4] Export styled ${ffstreamCodec} subtitle -> ${sidecarName}${fontNote}`
                                + ' - mp4 cannot carry it without flattening the styling into on-screen text\n';
                        }
                    } else {
                        response.infoLog += `☒${streamTag(ffstream.index)}[container=mp4] Library directory has a quote, control char or <io> - cannot`
                            + ` write ${sidecarName} safely; converting to mov_text instead, which loses the styling\n`;
                    }
                    if (exported) { dropStream(ffstream.index); subtitleStreamIndex--; continue; }
                }

                // Kept subtitle: fill a blank language and/or standardise the tag (tag_language) now that it has survived BOTH the removal filters above and
                // the styled-bundle export - the last thing on this branch that can still map the stream out. Written as a reorder rather than a
                // styledSubExported guard on the call, because the export can legitimately be REFUSED (unmapped node with no route, or a library directory
                // carrying a quote / control character); the track then survives as mov_text below and still wants its language tag.
                emitLangMeta('s', subtitleStreamIndex, 'subtitle', true);

                //Trim the surrounding whitespace and quotes (cleanStreamTitle); the busy-title clear follows tag_disposition below, not here.
                let newStreamTitle = cleanStreamTitle(streamTitle);
                const titleCauses = [];   // the settings that changed the title, for a compound [tag]; empty = an automatic whitespace/quote trim (no setting)

                if(appliesToType(tagDisposition, 'subtitle')) promoteDisposition('subtitle', 's', subtitleStreamIndex);

                newStreamTitle = clearBusyTitle(newStreamTitle, titleCauses);

                //tag_title (subtitle): titles we own (empty/role-only, incl. a just-cleared busy title) get the role tag(s). Custom titles are left untouched.
                if(appliesToType(tagTitle, 'subtitle')) {
                    const tags = titleTagsFor(ffstream);
                    if(tags.length > 0 && !stripDispositionWords(newStreamTitle)) {
                        newStreamTitle = tags.join(' ');
                        titleCauses.push(`tag_title=${tagTitle}`);
                    }
                }

                emitTitleMeta('s', subtitleStreamIndex, 'subtitle', streamTitle, newStreamTitle, titleCauses);

                emitHandlerMeta('s', subtitleStreamIndex, 'subtitle', 'SubtitleHandler');

                emitCommentRemoval('s', subtitleStreamIndex, 'subtitle');

                // mkv: mov_text is a QuickTime-only format that most players won't render in mkv — convert to srt. The legacyTextSubs formats have NO Matroska
                //      CodecID either, so a bare -c copy would fail the whole remux — ffmpeg decodes them as text, so they convert to srt too. mkv keeps
                //      subrip/ass/ssa/webvtt/text + the bitmap codecs (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle, hdmv_text_subtitle) natively; xsub has
                //      no CodecID and is not decodable text, so it is dropped above (alwaysDropSubs).
                // mp4: only mov_text is natively supported, so every decodable text codec converts to it — subrip/srt/ass/ssa/webvtt/text plus
                //      legacyTextSubs — or they hit the bare -c copy and fail the whole remux. text is raw UTF-8 that ffmpeg normalises to subrip on mux.
                let subConvertTarget = null;
                if (dstContainer === 'mkv' && CC_STREAM_SUBS.includes(ffstreamCodec)) subConvertTarget = 'text';   // NOT srt - see CC_STREAM_SUBS
                else if (dstContainer === 'mkv' && ['mov_text', ...legacyTextSubs].includes(ffstreamCodec)) subConvertTarget = 'srt';
                else if (dstContainer === 'mp4'
                    && ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'text', ...CC_STREAM_SUBS, ...legacyTextSubs].includes(ffstreamCodec))
                    subConvertTarget = 'mov_text';
                if (subConvertTarget) {
                    // The ENCODER and the codec that ends up in the container are the same everywhere except `text`, which matroska stores as subrip
                    // (S_TEXT/UTF8). Both the log and the predicted-output summary name what the file will actually carry, not the flag we passed.
                    const landsAs = subConvertTarget === 'text' ? 'subrip' : subConvertTarget;
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Unsupported codec - converting ${ffstreamCodec} subtitle`
                        + ` to ${landsAs}\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleStreamIndex} ${subConvertTarget}`;
                    subCodecOverride.set(ffstream.index, landsAs);
                    convert = true;
                    continue;
                }

            } else if(ffstreamType === 'audio') {
                audioStreamIndex++;

                // Fill a blank language and/or standardise the tag (tag_language) before deciding whether to remove it.
                workLang = emitLangMeta('a', audioStreamIndex, 'audio', true);

                // Past the muxability gate above, nothing here removes an audio stream - audio_clean owns every audio keep/drop decision (language via
                // language_surround/language_stereo/language_unlisted, role via downmix_secondary), so audio only ever gets metadata work in this branch.

                //Title cleanup mirrors the subtitle branch above - see there for the trim rule and why busy-title clearing follows tag_disposition.
                let newStreamTitle = cleanStreamTitle(streamTitle);
                const titleCauses = [];

                if(appliesToType(tagDisposition, 'audio')) promoteDisposition('audio', 'a', audioStreamIndex);

                newStreamTitle = clearBusyTitle(newStreamTitle, titleCauses);

                //tag_title (audio): rebuilds the title as a channel/downmix base (only when we own it - see bareChannelRegex/downmixChannelRegex) plus a
                //disposition suffix. The suffix reads each role from the shared classifiers (real flag OR title keyword, via hasDisposition), so a title-only
                //role like "5.1 Commentary" normalises to "5.1 - Commentary" and survives the reformat even when tag_disposition is off (that setting only
                //governs whether the role is also promoted into a real flag, above). Shared canonicalAudioTitle - audio_clean names its downmixes the same way.
                const audioCh = appliesToType(tagTitle, 'audio') ? resolveChannels(ffstream) : 0;
                if(audioCh) {
                    const rebuilt = canonicalAudioTitle(newStreamTitle, channelLabel(audioCh, layoutHasLfe(ffstream)), titleTagsFor(ffstream));
                    if(rebuilt !== newStreamTitle) { newStreamTitle = rebuilt; titleCauses.push(`tag_title=${tagTitle}`); }
                }

                emitTitleMeta('a', audioStreamIndex, 'audio', streamTitle, newStreamTitle, titleCauses);

                emitHandlerMeta('a', audioStreamIndex, 'audio', 'SoundHandler');

                emitCommentRemoval('a', audioStreamIndex, 'audio');

            } else if(ffstreamType === 'video') {
                videoStreamIndex++;

                const isImageCodec = IMAGE_CODECS.includes(ffstreamCodec);
                if (isCoverArt(ffstream)) {
                    workDone += `☐${streamTag(ffstream.index)} Remove ${isImageCodec ? 'image' : 'cover-art/thumbnail'} (${ffstreamType}-${ffstreamCodec})\n`;
                    dropStream(ffstream.index);
                    videoStreamIndex--;
                    continue;
                }

                // Standardise the video language tag (tag_language): video carries the same mdhd language field, so e.g. a 2-letter code is dropped by mp4.
                emitLangMeta('v', videoStreamIndex, 'video', false);

                // A Dolby Vision HEVC stream carries a dvhe/dvh1 (etc.) fourcc / a DOVI configuration record, NOT hvc1 - and this is a -c
                // copy path, so its own tag is already correct. Forcing hvc1 onto it drops the DV configuration box and demotes the file
                // to plain HEVC (verified: the output ffprobes as "Invalid data found"), undoing what video_clean's guard_dv protects.
                // Detect DV both-probe (fourcc / mediaInfo HDR_Format / ffprobe side_data) and leave its tag untouched. (video_clean
                // re-encodes, so it makes the finer dvh1-vs-hvc1 choice; here the safe action on a mere remux is to not retag DV at all.)
                const isDolbyVision = isDolbyVisionVideo(ffstream, ffmedia);

                // HEVC in mp4 must carry the hvc1 fourcc or Apple/QuickTime won't decode it - a plain remux writes hev1.
                // Tag the retained HEVC video stream when the output is mp4 and it isn't already hvc1 (and isn't Dolby
                // Vision): this converges after one heal (an already-hvc1 file is a no-op, never a perpetual remux).
                if (dstContainer === 'mp4' && ffstreamCodec === 'hevc' && !isDolbyVision && (ffstream.codec_tag_string || '').toLowerCase() !== 'hvc1') {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Tag video as hvc1 - HEVC-in-mp4 needs the hvc1 fourcc`
                        + ' for Apple/QuickTime playback\n';
                    extraArguments += ` -tag:v:${videoStreamIndex} hvc1`;
                    convert = true;
                }

                emitCommentRemoval('v', videoStreamIndex, 'video');

                // Busy-title removal (video). Test ONE effective title the way the audio and subtitle branches do - ffprobe's tag wins, mediaInfo is the
                // fallback - and take mediaInfo's with the handler echo removed, or a scene-release handler_name blanks a perfectly good title that was
                // never busy (and the handler is separately normalised by emitHandlerMeta on this same command, so the wipe would buy nothing).
                const videoTitle = (ffstream.tags?.title ?? '').trim() || mediaTitleSansHandler();
                if(removeBusytitle === true && tooManyPeriods(videoTitle)) {
                    workDone += `☐${streamTag(ffstream.index)}[remove_busytitle=true] Remove title (video) "${logSafe(videoTitle)}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoStreamIndex} "title="`;
                }

                emitHandlerMeta('v', videoStreamIndex, 'video', 'VideoHandler', ' as it can cause problems for titles in mkv');

            } else if(ffstreamType === 'attachment') {
                const kind = attachmentKind(ffstream);
                if (kind === 'image') {
                    workDone += `☐${streamTag(ffstream.index)} Remove cover-art attachment (${ffstreamType}-${ffstreamCodec})\n`;
                    dropStream(ffstream.index);
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
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Remove attachment mp4 can't carry`
                        + ` (${ffstreamType}-${ffstreamCodec})\n`;
                    dropStream(ffstream.index);
                    continue;
                }
            } else if ((ffstreamType === 'data') || ['data','bin_data','tmcd'].includes(ffstreamCodec)) {
                workDone += `☐${streamTag(ffstream.index)} Remove data stream (${ffstreamType}-${ffstreamCodec})\n`;
                dropStream(ffstream.index);
                continue;
            }

            // Flush this stream's queued metadata edits. metadataCommand is per-iteration (declared above), and only the subtitle/audio/video branches
            // append to it, so reaching here from any other branch flushes nothing. Every branch that must NOT flush - a stream being deleted, a subtitle
            // conversion that emits its own -c:s alongside the metadata, a removal - has already `continue`d past this point.
            if (metadataCommand !== '') {
                extraArguments += metadataCommand;
                convert = true;
            }

            //Any other stream type (e.g. an unrecognised attachment classified as 'other') is left untouched - remove it with a separate plugin if needed.
        }

        // Resolve deferred font attachments now that subtitle removals are final: embedded fonts are only consumed by styled subtitles (ASS/SSA), so keep
        // them iff one survives in the output. mp4 never keeps fonts - it cannot carry a font attachment at all, and its styled subtitles have either
        // left in a bundle that took the fonts with them or been flattened to mov_text - so dstContainer gates this to mkv; the source codec is read from
        // ffProbeData (still 'ass'/'ssa' there even when converted), which is why the survivor check alone is not enough. A styled subtitle extracted by
        // sub_worker likewise takes its fonts with it (.mks bundle, back on reimport), so a missing ASS/SSA genuinely means these fonts are orphaned.
        if (deferredFontIndices.length > 0) {
            const fontsNeeded = dstContainer === 'mkv' && file.ffProbeData.streams.some(s =>
                codecTypeOf(s) === 'subtitle'
                && !removedIndices.has(s.index)
                && isStyledSub(s.codec_name));

            if (!fontsNeeded) {
                for (const idx of deferredFontIndices) {
                    const fontStream = file.ffProbeData.streams.find(s => s.index === idx);
                    const fname = (fontStream?.tags?.filename || '').trim();
                    workDone += `☐${streamTag(idx)} Remove orphaned font attachment (no ASS/SSA subtitle uses it)${fname ? ` "${logSafe(fname)}"` : ''}\n`;
                    dropStream(idx);
                }
            }
        }

        // Every path that can drop a video stream (method_unmuxable=drop above, cover art in the video branch) records it in removedIndices, so the
        // survivors are read from there. Gated on the file having had video to begin with, so an audio-only file is untouched.
        if(file.ffProbeData.streams.some((s) => codecTypeOf(s) === 'video')
            && !file.ffProbeData.streams.some((s) => codecTypeOf(s) === 'video' && !removedIndices.has(s.index)))
            failFile('Removing the specified streams would leave the file with no video streams - check your removal settings');

        // method_unmuxable=drop is the ONLY path here that removes an audio stream (audio_clean owns every other audio keep/drop), so it needs its own
        // all-gone guard - the video one above does not cover audio. Gated on the file having had audio to begin with, so a genuinely silent file is untouched.
        if(unmuxableDrops.size > 0
            && file.ffProbeData.streams.some((s) => codecTypeOf(s) === 'audio')
            && !file.ffProbeData.streams.some((s) => codecTypeOf(s) === 'audio' && !removedIndices.has(s.index)))
            failFile(`[method_unmuxable=drop] Dropping every audio stream ${dstContainer} cannot store would leave the file with no audio at all`
                + ' - set method_unmuxable=error to stop instead, or mkv_fallback to keep this file in a container that can hold them');

        // Case-insensitive read (getTagCI) for the reason spelled out at emitHandlerMeta above: matroska stores this key as COMMENT.
        const fileComment = getTagCI(file.ffProbeData.format?.tags, 'comment');
        if((removeComments === true) && fileComment) {
            workDone += `☐[remove_comments=true] Remove comment from file "${logSafe(fileComment)}"\n`;
            extraArguments += ` -metadata "comment="`;
            convert = true;
        }

        if((removeBusytitle === true) && tooManyPeriods(file.ffProbeData.format?.tags?.title ?? '')) {
            workDone += `☐[remove_busytitle=true] Remove title from file "${logSafe((file.ffProbeData.format?.tags?.title ?? '').trim())}"\n`;
            extraArguments += ` -metadata "title="`;
            convert = true;
        }

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

        // The flags below apply only when runRecover is true, so a remux triggered by other work never re-applies them; the genpts/-avoid_negative_ts fix
        // further down is forced by the SOURCE container instead (needed to remux those formats at all) and always applies.

        // recover_bad_timestamps: light = +genpts, aggressive = full +igndts+genpts rebuild (igndts can misbehave without genpts, so it always pulls it in).
        // Each repair is logged where it is decided, so the line and the flag it describes cannot drift apart. Recovery leaves nothing visible in the stream
        // layout - no removal, no codec change - so without these lines the whole feature is invisible in the infoLog, and 'aggressive' discards data.
        if(runRecover && tsAgg) {
            fflags += '+igndts+genpts';
            workDone += `☐[recover_bad_timestamps=${recoverTs}] Rebuilding the timeline - ignoring the source DTS, regenerating PTS and shifting negative `
                + 'start times to zero\n';
        } else if(runRecover && tsLight) {
            fflags += '+genpts';
            workDone += `☐[recover_bad_timestamps=${recoverTs}] Regenerating missing PTS and shifting negative start times to zero\n`;
        }

        // Grouped by DEMUXER FAMILY, not extension spelling - ffmpeg picks its demuxer by probing content, while file.container is just the lowercased
        // extension. mpegts = ts/m2ts/mts/m2t/tp/trp/tod · MPEG-PS = mpg/mpeg/vob/evo/m2p/vro/mod · avi. Add a new spelling to the family it demuxes as.
        // Not hypothetical: identical MPEG-PS bytes named .vob hard-fail a bare -c copy remux ("Can't write packet with unknown timestamp", exit -22)
        // while the same bytes named .mpg are repaired here - and vob/evo/m2ts are in Tdarr's DEFAULT containerFilter, so the gap was reachable out of the
        // box. The bar is "every real spelling of the family", not Tdarr's defaults; all measured on the production build.
        if (['ts', 'm2ts', 'mts', 'm2t', 'tp', 'trp', 'tod',
            'mpg', 'mpeg', 'vob', 'evo', 'm2p', 'vro', 'mod', 'avi'].includes(srcContainer)) {   // container-forced timestamp fix (always applied)
            const already = fflags.includes('genpts');
            if(!already)
                fflags += '+genpts';
            extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
            // Independent of the recover_bad_* settings, so it needs saying even when they are disabled - otherwise a user sees a plain remux line and no
            // sign that the timestamps were rewritten. Suppressed when a recover_bad_timestamps line above already said the same thing.
            if(!already)
                workDone += `☐[container=${dstContainer}] Repairing ${srcContainer} timestamps - this source format cannot be remuxed without regenerating `
                    + 'PTS and shifting negative start times to zero\n';
        } else if (runRecover && tsLight)
            extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;   // normalize negative starts on any container we rebuild

        // recover_bad_data: light = +ignidx + -err_detect ignore_err (drops nothing), aggressive additionally drops corrupt frames.
        if(runRecover && dataLight) {
            fflags += '+ignidx';
            inputArgs += ' -err_detect ignore_err';
            workDone += `☐[recover_bad_data=${recoverData}] Ignoring a broken or corrupt index and continuing past demux errors - nothing is discarded\n`;
        }
        if(runRecover && dataAgg) {
            fflags += '+discardcorrupt';
            workDone += `☐[recover_bad_data=${recoverData}] Also dropping packets flagged corrupt - this discards data, expect brief video or audio blips `
                + 'wherever the damage is\n';
        }
        if(fflags !== '')
            fflags = `-fflags ${fflags}`;

        // A recover-only run has no other queued work, so runRecover alone must force the remux.
        if (runRecover)
            convert = true;

        // Re-stamp the recover intent on every remux while recover is requested, even when it already matches
        // (e.g. across mkv->mp4), so awk_recovered is refreshed and recovery doesn't re-trigger next pass.
        // (The mp4 use_metadata_tags that makes any global tag persist is added for all mp4 remuxes below.)
        if (convert === true && recoverRequested) {
            if (runRecover)
                workDone += `☐Stamp awk_recovered=${recoverIntent} - recovery re-runs only if a recover_bad_* mode changes\n`;
            extraArguments += ` -metadata "awk_recovered=${recoverIntent}"`;
        }

        // remove_imagesubs=export asked for a sidecar that could not be written, so the export did not happen and neither did the drop it protects. Fail
        // rather than remux around it: every cause is environmental (a quote in the library directory, no path translator, a rejected upload) and so
        // recurs on every future run, which would leave the export setting quietly doing nothing while each run reported success. Failing costs nothing -
        // the file is untouched and the image subtitle is still embedded - and the error clears itself once the environment is fixed and the file requeued.
        if (exportRefusedCount) {
            failFile(`[remove_imagesubs=export] ${exportRefusedCount} image subtitle${exportRefusedCount === 1 ? '' : 's'} could not be exported,`
                + ' see the reasons above - nothing was removed from the file');
        }

        if (convert === true) {
            // mp4/mov drops GLOBAL custom tags on a -c copy remux unless use_metadata_tags is set - this plugin's own awk_recovered
            // AND any awk_video/awk_sub_worker written by a sibling plugin. Add it for EVERY mp4 remux (not just recovery ones),
            // matching the other four plugins, so those markers survive. This plugin runs first, so a marker it drops is gone
            // before the plugin that wrote it re-reads it (e.g. sub_worker's sidecar-delete would then find no marker).
            if (dstContainer === 'mp4')
                extraArguments += ' -movflags use_metadata_tags';
            response.preset += `${fflags}${inputArgs}<io>${sidecarOut} -map 0 -c copy${extraArguments}${globalOutputOpt}`;
            response.infoLog += workDone;
            // Predicted output: re-renders the input streams with the two mutations this summary tracks - removedIndices
            // filtering and subCodecOverride (converted subtitle codec). It does NOT reflect queued language fills / tag_language
            // standardization: those emit only a -metadata:s:...language= arg and never mutate the ffprobe object summariseStream
            // reads, so a track whose blank/looser tag will be rewritten still shows its pre-change lang token here.
            const outSummary = file.ffProbeData.streams
                .map(s => ({ s: enrichStream(s), idx: s.index }))
                .filter(({ idx }) => !removedIndices.has(idx))
                .map(({ s, idx }) => (subCodecOverride.has(idx) ? { ...s, codec_name: subCodecOverride.get(idx) } : s))
                .map((s) => summariseStream(s)).join('');
            response.infoLog += `☑Expected results: ${outSummary}\n`;
            response.processFile = true;
        } else {
            if (recoverRequested && intentMatches)
                response.infoLog += `☑Already recovered with these options (awk_recovered=${recoveredTag}) - skipping to avoid reprocessing;`
                    + ' change a recover_bad_* mode to run again\n';
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
