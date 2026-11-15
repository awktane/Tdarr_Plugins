/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_clean_and_remux',
    Stage: 'Pre-processing',
    Name: 'Remove streams and metadata then remux file if necessary. Optionally attempt to recover damaged files.',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Prepares the file for any next steps including remuxing to mp4/mkv\n\n
                     -Identify and remove data streams and image/cover-art streams (by codec, by attached_pic/still_image/timed_thumbnails disposition, or
                         by the image mimetype a Matroska cover attachment keeps once an earlier remux wrote it out as a video track). An mp4 output keeps
                         its chapter track and a tmcd timecode track, which the mp4 muxer rebuilds from the chapters and from the video's timecode\n\n
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
    Version: '4.999.86',
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
                exported as a font bundle rather than flattened.
                HEVC video is tagged hvc1 - dvh1 for Dolby Vision Profile 5 - so Apple and QuickTime can play it.
                A track name is kept in the track handler, the one place mp4 keeps it through a remux. mp4 stores no original flag, so an audio track
                flagged original gets "Original" added to its name.`,
        },
        {
            name: 'language_fill',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Force this language onto audio and subtitle tracks that carry no language tag, or are tagged "und". Blank (default) leaves them as
                they are.
                \\nTakes precedence over language_sub when a track's language is blank or und.
                \\nOne form is enough - en, eng, English or a BCP-47 tag like pt-BR all work; the form written follows method_tag_language and the output
                container (eng into mkv and mp4 by default). A region such as pt-BR is kept only with method_tag_language=bcp47, or with tag_language=disabled,
                on mkv - otherwise it is written as the language alone (por). Codes: https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
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
                them manually and requeue. A commentary or other secondary audio track is not counted, as no plugin deletes one as a duplicate.
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
                \\naudio: surface Commentary, Descriptive, Dub and Original on audio tracks. mp4 stores no Original flag, so there that role stays in the
                title.
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
                \\nstrict: rewrite every language tag to the method_tag_language standard, valid ones included - by default en becomes eng, and fre/fra
                fold to the container's form.
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
                \\nsubtitle: set the title to its role tags, e.g. "SDH" or "Forced Commentary". Only titles this plugin owns are rewritten - an untitled
                one, or one that is already nothing but role words - so a custom subtitle title is left untouched.
                \\nboth: apply to audio and subtitle tracks.
                \\nRole tags come from the track's real disposition flags and title keywords (Commentary, Descriptive, SDH, Forced, Lyrics, Dub, Original).
                The default flag is deliberately not surfaced. On mp4 a name kept only in the track handler counts as the track's title.`,
        },
        {
            name: 'remove_busytitle',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false','true'],
            },
            tooltip: `Blank the title of any audio, subtitle or video track whose title holds more than 3 periods. That clears most of the junk titles some
                sources write, which are usually the release filename rather than a description of the track. On mp4 a track's name lives in its track
                handler, so a busy handler name is cleared too. A track whose busy title sits beside a plain handler name takes that name instead of going
                blank - on mp4, and on an mkv converted from one, which keeps the handler name as a tag.
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
                \\nexport: save each one to a hidden sidecar beside the video (PGS -> ".<name>.s<N>.<lang>.sup", VobSub/DVB -> ".<name>.s<N>.<lang>.mks",
                N being the stream index; a role or flag token such as .forced can sit beside <lang>) and then remove it. The leading dot keeps Plex and
                Jellyfin from indexing it. Run an external OCR tool over the sidecars to produce .srt, then reimport with awk_sub_worker. One-way - this
                plugin never reimports them.
                \\nxsub (DivX) is ALWAYS removed whatever this is set to, since no container can carry it, but export still saves it first to a
                ".<name>.s<N>.<lang>.avi" - AVI being the only format that holds xsub.
                \\nexport works on any node - an unmapped node uploads the sidecar into the library through the Tdarr server's file API. The subtitle is
                dropped only once its sidecar is confirmed in place; if it cannot be placed the file is failed with the subtitle still embedded, so nothing
                is lost.
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
                SDH or lyrics role and not forced (a forced track holds only the foreign-language lines), in a format the output container keeps, not
                stripped by remove_imagesubs and not exported to a bundle. So extras go, never your last usable subtitle of that language.
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
            tooltip: `Which language-code standard is written: by tag_language when it rewrites a tag, and by language_fill in every tag_language mode (under
                disabled, a fill's region is kept on mkv - see language_fill). You can still type any form you like in the language lists regardless.
                \\n=====
                \\nActions
                \\n=====
                \\ncontainer (default): give each container the form its language field is specified to hold - 3-letter bibliographic (eng, fre, ger)
                for mkv, as MKVToolNix writes it, and 3-letter terminologic (eng, fra, deu) for mp4's mdhd box.
                \\n639-2/t: terminologic 3-letter codes everywhere - fra, deu, zho.
                \\n639-2/b ("mkv classic"): bibliographic 3-letter codes everywhere - fre, ger, chi.
                \\nbcp47: like container on mp4, but on mkv writes the BCP-47 form - 2-letter (en, fr), keeping a region subtag such as pt-BR or es-419,
                or a script subtag such as zh-Hans. ffmpeg stores it in mkv's ISO 639-2 language field, as it has no way to write the BCP-47 one, so
                ffmpeg-based players such as Jellyfin, and MediaInfo, read pt-BR back, while MKVToolNix reads it as por. A region MKVToolNix stored in
                its own BCP-47 field, which ffmpeg cannot carry through a remux, is written into the ISO 639-2 field too, under tag_language invalid and
                strict.
                mp4 cannot store a region, so there it still folds to 3-letter (por).
                \\nThis mainly affects the ~20 languages that have two 3-letter codes (French fre/fra, German ger/deu), plus the 2-vs-3-letter choice.`,
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
                \\nmp4 refuses a long list that mkv accepts: MLP, WMA, WavPack, TTA, AMR, most ADPCM, A-law / mu-law / unsigned 8-bit PCM, LATM AAC (what
                every DVB and broadcast capture carries), VP8, Theora, ProRes, DNxHD, CineForm, FFV1, HuffYUV, MagicYUV, UtVideo, v210, raw video, DV,
                Cinepak, H.263, the WMV / MS-MPEG-4 family, and the QuickTime-only codecs. TrueHD stores in mp4 only as experimental, so a TrueHD track
                arriving from another container is gated the same way, while one ALREADY in an mp4-family file is kept as it stands.
                \\nA few fit in NEITHER container - AC-4, SMPTE 302M, IMA-QT ADPCM, Nellymoser, RealVideo 1-3 and the RealAudio codecs bar 14.4 - so for
                those no container choice is a way out. Blu-ray, DVD and signed 8-bit PCM, which neither stores as they are, are instead repacked as plain
                PCM without losing a sample, as is big-endian float PCM bound for mkv.`,
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
                \\nenabled: abort the file to the error queue when it carries MORE THAN ONE audio language among its genuine tracks (not commentary,
                audio description, M&E or karaoke) and NO audio track is marked original - either the ffmpeg 'original' disposition flag or an
                "original" keyword in the title or handler. Mark the original track and requeue; audio_clean's guard_original can then protect it. mp4
                cannot store the flag, so container=mp4 adds "Original" to the name of a track flagged original, where the role survives.
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
                \\nRecovery re-runs only when you change one of the recover_bad_* settings, then settles - it will not reprocess the file on every pass.
                \\nOn an mp4, m4v or mov output the recovery stamp stays on the file for good, and keeping it makes every later remux write the file's tags
                as QuickTime metadata keys, which taggers and Apple players cannot read. Recover into mkv to keep them readable.
                \\nA repaired file can come out INCOMPLETE (a truncated source is salvaged to its true, shorter length), which stream_ordering accepts with a
                warning in the job that repairs it, rather than failing it (a later job checks its length in full again). Review such a file in Tdarr and
                confirm it plays through before approving - do not auto-approve a recovery queue, or an invisibly short result is kept silently.`,
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
                \\nRe-runs only on a recover_bad_* change, as for recover_bad_data, and on an mp4-family output its stamp costs the file its readable tags the
                same way. Container-forced timestamp fixes apply regardless, for the whole
                MPEG-TS family (ts/m2ts/mts/m2t/tp/trp/tod), the whole MPEG-PS family (mpg/mpeg/vob/evo/m2p/vro/mod), and avi.
                \\nA repaired file can come out INCOMPLETE (a truncated source is salvaged to its true, shorter length), which stream_ordering accepts with a
                warning in the job that repairs it, rather than failing it (a later job checks its length in full again). Review such a file in Tdarr and
                confirm it plays through before approving - do not auto-approve a recovery queue, or an invisibly short result is kept silently.`,
        },
    ],
});
// #endregion

// #region SHARED helpers (1 section: language matching)
// ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language matching =====
// Normalize any language identifier to a stable comparison key so en / eng / EN / English / en-US - and ISO 639-2/B vs /T (fre vs fra) - all compare
// equal. Node ships full ICU, so no table or module is needed. This section sits at MODULE scope rather than inside plugin(): every symbol in it is a
// pure const closure, which is what the top-level rule allows, and langNameIndex's memo is only worth keeping if it outlives a single plugin() call.
// -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
// Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'. `[\s\S]*` rather than `.*` because `.` cannot
// cross a line terminator and `$` without /m only matches true end-of-input (JS, unlike Perl/Python, will NOT match before a trailing newline) - so on a
// run of separators followed by an interior \r, \n, U+2028 or U+2029 the engine retries from every separator, runs the star to the terminator, and gives
// a character back at a time against a `$` it can never reach: O(n^2) with no possible match, so no early exit. A container language tag is unbounded
// metadata that reaches here uncapped on every language read, and ffprobe hands a 60,000-character Matroska Language element through verbatim - measured
// 20.1 s of blocked worker for one such file, 0.9 s -> 0.9 ms with this form. Same defect and reasoning as cleanStreamTitle's quote strip. It also folds
// a tag ENDING in a newline ('en-US\n' -> 'en'), which the `.*` form silently left unfolded.
const shortLang = (l) => l.replace(/[-_.][\s\S]*$/, '');
// -=-=-= langNameIndex  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
// Reverse map English language NAME -> code, probed out of Intl.DisplayNames and memoised. Consulted ONLY for a token of 4+ characters, so an ordinary
// 2- or 3-letter code (en, eng) never touches it and pays nothing. Built in TWO TIERS because the tiers cost wildly different amounts: the 676 two-letter
// codes take ~1.6 ms and already answer almost every spelled-out name a user types, while the 17,576 three-letter codes take ~170-190 ms - roughly 100x
// more - and are needed only for a language with NO two-letter form (cantonese -> yue, cebuano -> ceb, hawaiian -> haw). So the cheap tier is built first
// and the expensive one only when a name misses it. The two-letter entries are then overlaid ON TOP of the three-letter ones, which is what keeps a
// language that HAS a two-letter code winning its own name (english -> en, never eng) and langKey's fold unchanged. Measured on Tdarr's own bundled
// runtime and proven exhaustively rather than sampled: both build orders yield 636 keys with 0 differing values across every key, junk tokens included.
// Null-prototype so a tag spelling an Object.prototype member ('constructor') misses the map instead of resolving inherited junk. Do NOT collapse this
// back to a single pass: the whole point is that a file whose language tag is spelled out pays ~1.6 ms rather than ~180.
const langNameIndex = (() => {
    let two = null; let all = null;
    const probe = (three) => {
        const idx = Object.create(null);
        const dn = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
        const add = (code) => { const name = dn.of(code); if (name) idx[name.toLowerCase()] = code; };
        const A = 'a'.charCodeAt(0); const Z = 'z'.charCodeAt(0);   // every code is lowercase a-z
        for (let a = A; a <= Z; a++) for (let b = A; b <= Z; b++) {
            if (!three) { add(String.fromCharCode(a, b)); continue; }
            for (let c = A; c <= Z; c++) add(String.fromCharCode(a, b, c));
        }
        return idx;
    };
    return (name) => {
        if (!two) two = probe(false);
        if (two[name] !== undefined) return two[name];
        if (!all) all = Object.assign(probe(true), two);   // two-letter overlaid LAST, so english -> en rather than eng
        return all[name];
    };
})();
// -=-=-= langKey  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
// Comparison key for a language token: lowercase/trim, strip any region/variant via shortLang, map a spelled-out English name to its code, then fold
// code variants with Intl.getCanonicalLocales (eng->en, fre/fra->fr) and strip again: ICU's legacy aliases ADD a subtag to a few codes (sh/hbs -> sr-Latn,
// cnr -> sr-ME, prs -> fa-AF), which would otherwise key apart from every other spelling of the language. Undetermined / non-language tokens (und, mul,
// zxx, mis, reserved qaa-qtz) and anything unrecognised pass through unchanged, so they only ever match themselves.
const langKey = (x) => {
    let s = shortLang(String(x || '').trim().toLowerCase());
    if (!s) return '';
    if (s.length >= 4) { const code = langNameIndex(s); if (code) s = code; }   // spelled-out English name -> its code
    try { return shortLang(String(Intl.getCanonicalLocales(s)[0] || s).toLowerCase()); } catch (e) { return s; }
};
// -=-=-= langMatchKey  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
// The key a user's language LIST is matched on, list side and track side alike: langKey plus the one macrolanguage fold ICU does not make. ICU keeps
// Norwegian Bokmål (nb, nob) and Nynorsk (nn, nno) apart from Norwegian (no, nor) - measured on Tdarr's bundled Node 24.22.1, ICU 78.3 - so a list naming
// Norwegian missed both, and nb-NO is the common streaming tag. List matching only: a tag WRITTEN, and one track compared with another (dedup, the
// one-downmix-per-language sets, sidecar identity, language counts), stay on langKey and keep the two written standards apart - folded into langKey,
// tag_language rewrote nob and nno to nor on an mkv -> mp4 conversion (measured).
const langMatchKey = (x) => { const k = langKey(x); return (k === 'nb' || k === 'nn') ? 'no' : k; };
// ===== END SHARED: language matching =====
// #endregion

const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    // eslint-disable-next-line no-param-reassign
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
    // -=-=-= ddValue (+ checkDropdowns) [all five] =-=-=-
    // Every dropdown is read through ddValue - case- and whitespace-folded, only an ABSENT value (undefined/null/'') taking the input's default - so
    // the value checkDropdowns validates is the value each use site compares, and a hand-edited 'Enabled' reads the same in all five plugins (Tdarr
    // trims a saved value but does not fold its case). A non-string falsy value is not absent: Tdarr hands a saved boolean false to an input that has
    // since become a dropdown unchanged, and it must stop the file as invalid rather than quietly read as the default. checkDropdowns stops the file on
    // the first value outside its option set, naming the input and the offending value.
    const ddValue = (v, dflt) => String(v === undefined || v === null || v === '' ? dflt : v).toLowerCase().trim();
    const checkDropdowns = (checks) => {
        for (const [name, value, opts] of checks)
            if (!opts.includes(value)) failFile(`[${name}=${logSafe(value)}] invalid value, check your settings`);
    };
    // ===== END SHARED: file-failure helpers =====
    // #endregion

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // #region SHARED helpers (18 sections: stream codec type … ffmpeg metadata escaping)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream codec type =====
    // -=-=-= codecTypeOf [all five] =-=-=-
    // The stream's kind - video / audio / subtitle / attachment / data - normalised once; the single most repeated test in the suite. jellyfin-ffprobe emits
    // a fixed lowercase enum, so trim+lowercase are pure defensiveness - but one definition keeps every site defensive the SAME way, where per-site
    // spellings could classify the same stream differently. Optional-chained, so a nullish stream reads as "no type" rather than throwing.
    const codecTypeOf = (s) => (s?.codec_type || '').trim().toLowerCase();
    // -=-=-= codecNameOf [all five] =-=-=-
    // The stream's codec NAME, normalised the one way - jellyfin-ffprobe emits a fixed lowercase token, so trim+lowercase are pure defensiveness, but one
    // definition keeps every site defensive the SAME way (a padded 'prores ' can't classify differently at two sites). Mirrors codecTypeOf; optional-chained.
    const codecNameOf = (s) => (s?.codec_name || '').trim().toLowerCase();
    // ===== END SHARED: stream codec type =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [all five] =-=-=-
    // Look up a tag value case-insensitively on BOTH sides - matroska UPPER-CASES tag keys on write, so a plugin reading its sibling's awk_*
    // marker gets an uppercased key back, and the lookup name is folded too so a mixed-case name still matches. Returns the value as a string ('' if
    // absent); callers trim/decode as needed. One source so the five plugins that read each other's markers can't drift on the lookup convention. An exact-case
    // key wins over another case of it: ffprobe never gives one name twice, but a stand-in view sets 'title' beside a source's 'TITLE'.
    const getTagCI = (tags, name) => {
        const want = String(name).toLowerCase();
        const keys = Object.keys(tags || {});
        const hit = keys.includes(String(name)) ? String(name) : keys.find((k) => k.toLowerCase() === want);
        return hit === undefined ? '' : String(tags[hit] ?? '');
    };
    // ===== END SHARED: case-insensitive tag lookup =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes [all five] =-=-=-
    // Keyed by the real ffmpeg disposition flag; each entry declares the valid stream types, the title keywords that also indicate the role (each keyword
    // lives on ONE flag PER STREAM TYPE - hasDisposition scopes by entry.streams - so title->flag promotion stays unambiguous; descriptive/descriptions/dvs
    // deliberately appear on both the audio and subtitle entries), and the canonical title string (tag, null when never written). The single table every
    // classifier, sort key, summary token and title tagger reads, so the lists can never drift. The commentary, audio-description, dub, SDH, forced and
    // original roles also carry the words European releases title such tracks with, unflagged (German, French, Spanish, Portuguese, Italian, Dutch,
    // Polish and the Nordic languages), plurals and the one-word compounds release labels use (Kommentare, Audiokommentar) included - compounds have no
    // end, so these are the standard labels, not every word. Each is a whole-token match, so only a word that means nothing else in a track title belongs
    // here (VO, OV, UT stay out), and every one is pinned by the harness.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary', 'kommentar', 'commentaire', 'comentario', 'comentário', 'commento',
                                'commentaar', 'komentarz', 'kommentaari', 'kommentare', 'kommentarer', 'audiokommentar', 'regiekommentar',
                                'commentaires', 'audiocommentaire', 'comentarios', 'comentários', 'commenti', 'audiocommentaar', 'commentaren',
                                'komentarze'],                                                                                  tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','descriptions','dvs','audio description','described video',
                                'visually impaired','visual impaired', 'audiodeskription', 'hörfilm', 'audiodescription', 'audiodescripción',
                                'audiodescrição', 'audiodescrizione', 'audiodescriptie', 'audiodeskrypcja', 'syntolkning', 'synstolkning', 'synstolking',
                                'kuvailutulkkaus', 'audio described'],                                                          tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','descriptions','dvs'],                      tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','hard of hearing','hoh','deaf', 'malentendants',
                                'hörgeschädigte', 'gehörlose', 'sordos', 'non udenti', 'slechthorenden'],                       tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign', 'forcé', 'forcés', 'forzados',
                                'erzwungen'],                                                                                   tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed', 'dubbing', 'doublage', 'doblaje', 'doblado', 'dublado', 'dublagem',
                                'doppiaggio', 'doppiato', 'dubbad', 'dubbet'],                                                  tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original', 'originalton', 'o-ton', 'originalfassung', 'version originale',
                                'versione originale'],                                                                          tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','music & effects','m&e','m and e'],   tag: 'M&E'         },
        karaoke:          { streams:['audio'],                    keywords: ['karaoke'],                                               tag: 'Karaoke'     },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                                        tag: null          },
    };
    // -=-=-= roleFieldsOf / roleFieldsLower [all five] =-=-=-
    // NFC first, so a title stored decomposed (an o followed by a combining diaeresis) matches the precomposed keyword it reads as.
    const roleFieldsOf = (fields) => fields.map((t) => String(t || '').normalize('NFC').toLowerCase().trim()).filter(Boolean);
    // Memoized by stream object (WeakMap, per-run closure): hasDisposition reads a stream's fields repeatedly.
    const roleFieldCache = new WeakMap();
    // Role-signal text from BOTH probes - a title/description/handler can live in ffprobe OR mediaInfo but not both - as FIELDS, each matched on its own
    // (hasDisposition). Joined, a name in two of them read 'name name', whose last and first words spelled a keyword neither copy holds: 'Description of the
    // scenes with the new Audio' read 'audio description' and audio_clean deleted the track (measured on an mkv title, an mp4/mov name a remux moved into the
    // handler beside its title box, and a .mov cut); two different fields did the same ('English Audio' beside an mkv DESCRIPTION 'Description of the mix').
    const roleFieldsLower = (s) => {
        // A stand-in for a track the next pass reads by another name carries that pass's fields (readBackFieldsOf): its index still joins the source's
        // mediaInfo, whose Title holds words the output drops, and a property survives the copies a summary makes where a seeded cache entry does not.
        if (Array.isArray(s.readBackRoleFields)) return s.readBackRoleFields;
        if (roleFieldCache.has(s)) return roleFieldCache.get(s);
        const mi = mediaInfoFor(s);
        // ffprobe's title, a TITLE SimpleTag beside the Name (titleTagText: a 'TITLE-<lang>', which mediaInfo's Title shows only when it was written last),
        // description and handler, then mediaInfo's Title less the handler's echo (mediaInfoOwnTitleParts) and its description. Every tag read
        // goes through getTagCI, as no casing is a safe guess: matroska UPPER-CASES tag keys on write (ffprobe shows HANDLER_NAME, DESCRIPTION), and MediaInfo
        // defines Comment/Description as GENERAL-only, so a per-TRACK value lands in the track's 'extra' bag under whatever spelling the container used. The
        // handler is read as the name it holds (handlerTextOf), so the length bytes a grown .mov name starts with ('HSDH ...') hide no role word. Its echo is
        // left out of the Title because MediaInfoLib can read it distorted: a .mov name as MacRoman, where 'Dubé' is 'Dub√©' and 'dub' a whole word (the next
        // pass read /dub, and clean_and_remux wrote the flag). What the Title holds then is ONE stored value - the title box on mp4 and mov, the title on
        // matroska - so it is one field, read whole: its own ' / ', and a line break MediaInfoLib renders so (mediaInfoFill), are the name's ('Hard
        // of<CR><LF>Hearing' reads /sdh, as the name does). The Title goes through mediaInfoText inside mediaInfoOwnTitleParts, which decodes the object
        // mediainfo.js gives for a value holding a control character: undecoded, a role word in it was missed, and the next pass, once a remux had moved the
        // name into the handler, read a role Expected results had not predicted.
        const fields = roleFieldsOf([getTagCI(s.tags, 'title'), titleTagText(s), getTagCI(s.tags, 'description'),
            handlerTextOf(getTagCI(s.tags, 'handler_name')), mediaInfoOwnTitleParts(s).join(' / '), mediaInfoText(getTagCI(mi?.extra, 'description'))]);
        roleFieldCache.set(s, fields);
        return fields;
    };
    // -=-=-= ROLE_NEGATORS / keywordRegex / matchesKeyword [all five] =-=-=-
    // A keyword naming a role the track lacks does not match: one with a negator word one to three non-alphanumerics before it ('English (Non-SDH)', 'No
    // Commentary', 'ohne Kommentar' - the languages the keywords serve), or '-free'/'-less' after it ('commentary-free'). Read as the role, the Non-SDH
    // subtitle is what remove_sub_sdh deletes and the main 'No Commentary' track what downmix_secondary=delete removes. Accepted false negations, where
    // 'no' or 'sin' means something else: 'Dr. No Commentary', 'Kantoku no Commentary', 'Original Sin Commentary' and a Norwegian 'NO SDH' lose a role only
    // their title gives. Every narrower rule un-negates a real one - negating only at a field's start or after a bracket reads 'English No Commentary' as
    // commentary, and dropping 'no'/'sin' loses 'No Commentary' and 'sin comentarios' - so it can delete a main track, where the false negation costs at
    // most a role read as absent: a commentary read as a main track (measured: removed as a duplicate under audio_clean's method_deduplicate=channel), an
    // SDH or forced subtitle read as plain.
    const ROLE_NEGATORS = ['non', 'no', 'not', 'without', 'ohne', 'sans', 'sin', 'sem', 'senza', 'zonder', 'bez', 'uten', 'utan', 'uden', 'ilman'];
    // The whole-token regex for a keyword list: a keyword matches only when not flanked by a letter/digit - '[sdh]', 'eng-sdh', 'sdh.' match, 'deafening' does
    // not - and an internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). It is case-sensitive, so the text must
    // already be lowercased. A pure function of the list, so memoized by keyword-array identity rather than recompiled per classifier call; the mov cut
    // (cutName) also reads it, to find where a role phrase lies.
    const keywordRegexCache = new WeakMap();
    const keywordRegex = (keywords) => {
        let re = keywordRegexCache.get(keywords);
        if (!re) {
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // A gap before a token that itself starts with a non-alphanumeric ('music & effects') excludes that character: otherwise the gap and the literal
            // can both take the same '&', and on a title of 'music' plus a long run of '&' the two runs backtrack quadratically (1.7 s at 32k chars, measured)
            // over role text that nothing caps. Every spelling that matched still matches - the gap only stops short of the literal it was about to overlap.
            const gapBefore = (token) => (/^[\p{L}\p{N}]/u.test(token) ? '[^\\p{L}\\p{N}]+' : `[^\\p{L}\\p{N}${token[0].replace(/[\\\]^-]/g, '\\$&')}]+`);
            const pattern = keywords
                .map((k) => k.trim().split(/\s+/).map((token, i) => (i ? gapBefore(token) : '') + esc(token)).join(''))
                .join('|');
            // The negator test (ROLE_NEGATORS) is bounded, so its lookbehind costs the same at every offset of a title nothing caps.
            const negated = `(?<!(?<![\\p{L}\\p{N}])(?:${ROLE_NEGATORS.join('|')})[^\\p{L}\\p{N}]{1,3})`;
            re = new RegExp(`(?<![\\p{L}\\p{N}])${negated}(?:${pattern})(?![\\p{L}\\p{N}])(?!-(?:free|less)(?![\\p{L}\\p{N}]))`, 'u');
            keywordRegexCache.set(keywords, re);
        }
        return re;
    };
    const matchesKeyword = (text, keywords) => keywords.length > 0 && keywordRegex(keywords).test(text);
    // -=-=-= hasDisposition [all five] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes(codecTypeOf(s))) return false;
        return s.disposition?.[key] === 1 || roleFieldsLower(s).some((t) => matchesKeyword(t, entry.keywords));
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: secondary audio role =====
    // -=-=-= isSecondaryTrack  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // A secondary audio track is any commentary, visually-impaired/descriptive, music-and-effects (clean_effects) or karaoke track, by flag or title keyword
    // through the shared classifiers (lyrics is a subtitle-only role). None carries the dialogue a viewer picks a film's audio by, so none speaks for a
    // language: audio_clean keeps them out of the language tiers and the dedup groups, clean_and_remux's guard_audio_language does not count their
    // languages, and stream_ordering ranks one below every main track of its language - unless audio_first lifts it: descriptive_tagged lifts every
    // descriptive track, original_tagged an original-flagged one - and gives it the sole default flag only when the file has no main track, or
    // audio_first=descriptive_tagged leads with the description. One definition, so the three cannot disagree about which tracks those are.
    const isSecondaryTrack = (stream) => isCommentary(stream) || isDescriptive(stream)
        || hasDisposition(stream, 'clean_effects') || hasDisposition(stream, 'karaoke');
    // ===== END SHARED: secondary audio role =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt [all five] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last; summariseStream
    // flags them /cover. Two codecs that LOOK like they belong are deliberately ABSENT, for one reason: they are also real moving-picture codecs. mjpeg/mjpegb
    // is camcorder/AVI-era footage, and jpeg2000 is the DCP / IMF / broadcast-mezzanine codec - listing either drops genuine video as cover art, while
    // neither is ever WRITTEN as cover art (mkv attaches image/jpeg or image/png; the mp4 covr atom encodes only JPEG or PNG). Real cover art in those
    // codecs still matches via the disposition clause below - mp4 marks it attached_pic, and ffprobe reports an mkv image attachment as an attached_pic
    // video stream - so a dispositionless mjpeg/jpeg2000 video stream reads as real video, the fail-safe direction. nb_frames cannot substitute for the
    // disposition test: in mkv it is N/A for real MJPEG video AND for cover art. A Matroska image attachment that a plain -map 0 -c copy has written out as a
    // one-frame video track carries no flag, and in mjpeg no image codec either, but it keeps the attachment's filename and mimetype tags (image/jpeg,
    // image/png; measured 2026-10-23 on jellyfin 7.1.4). No real video track carries an image mimetype, so the mimetype clause names it cover art.
    const IMAGE_CODECS = ['png', 'apng', 'gif', 'bmp', 'webp', 'tiff', 'qoi'];
    const isCoverArt = (s) => IMAGE_CODECS.includes(codecNameOf(s))
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails')
        || (codecTypeOf(s) === 'video' && /^image\//i.test(getTagCI(s.tags, 'mimetype')));
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
        ['musepack', 'mpc'],   // ffprobe reports musepack7/musepack8 (mpc7/mpc8 are only the DECODER names); fold both to the mpc key
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= foldCodecAlias [all five] =-=-=-
    // A normalised codec name with its alias prefix folded to the canonical key (first matching row wins) and nothing more: resolveCodecName's first
    // step, and on its own the fold an identity check wants.
    const foldCodecAlias = (codec) => {
        for (const [prefix, replacement] of codecAliases) if (codec.startsWith(prefix)) return replacement;
        return codec;
    };
    // -=-=-= resolveCodecName [all five] =-=-=-
    // Folds aliases (foldCodecAlias), maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the _x variant when DTS:X is
    // detected) and eac3/truehd into eac3atmos/truehdatmos - scoring for the carriers that score, accurate display labels for the rest. Each refinement
    // checks longName, the ffprobe profile AND mediaInfo's Format_Commercial_IfAny, because no single source is complete: DTS longName in MP4/M4V is
    // "DCA (DTS Coherent Acoustics)" with no subtype keyword, and an E-AC-3 longName carries no Atmos marker (an editable title tag never counts - it
    // does not imply a real Atmos substream). DTS:X detection is best-effort: MediaInfo's own maintainers note the "XLL X" signal is incomplete for an
    // undocumented format, so a real DTS:X track may still classify as the plain subtype - never the reverse, since detection only fires on an actual
    // reported value, never on the absence of one.
    const resolveCodecName = (stream) => {
        let codec = foldCodecAlias(codecNameOf(stream));
        const longName = (stream.codec_long_name || '').toLowerCase().trim();

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
    // (pcm_s16le keeps its bit depth) - this only ever ADDS subtype detail, never collapses an already-informative name. Null-prototype, so a codec_name
    // spelling an Object.prototype member ('constructor') misses the table instead of displaying an inherited function.
    const CODEC_DISPLAY = Object.assign(Object.create(null), {
        dtsma:   'dts-hd-ma',   dtsmax:      'dts-hd-ma-x',
        dtshr:   'dts-hd-hr',   dtshrx:      'dts-hd-hr-x',
        dtsx:    'dts-x',       dtsexpress:  'dts-express',   dtsexpressx: 'dts-express-x',
        eac3atmos: 'eac3-atmos', truehdatmos: 'truehd-atmos', mpegh3d: 'mpeg-h',
    });
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || codecNameOf(stream) || 'unknown';
    // ===== END SHARED: codec name resolution =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family [all five] =-=-=-
    // The mp4/mov container family: the containers whose -c copy keeps a custom GLOBAL tag (a sibling plugin's awk_* marker) only under `-movflags
    // use_metadata_tags` (see mp4TagPlan), and the container test behind the mp4 `-strict` gates. One source so no consumer drifts on the set (video_clean's
    // video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // -=-=-= MP4_NATIVE_TAGS (+ MP4_REGENERATED_TAGS) [all five] =-=-=-
    // The global tags the mov muxer stores WITHOUT use_metadata_tags - as iTunes atoms in mp4/m4v/m4a, as QuickTime udta strings in mov - measured on jellyfin
    // 7.1.4 by writing each and reading it back (awk-ffmpeg-test's fmtprobe tag:native re-measures it per node). A flagless mux drops every other key.
    const MP4_NATIVE_TAGS = {
        mp4: ['title', 'artist', 'album_artist', 'composer', 'album', 'date', 'comment', 'genre', 'copyright', 'grouping', 'lyrics', 'description', 'synopsis',
            'show', 'episode_id', 'network', 'keywords', 'track', 'disc', 'compilation', 'gapless_playback', 'hd_video', 'media_type', 'episode_sort',
            'season_number'],
        mov: ['title', 'artist', 'album', 'date', 'comment', 'genre', 'copyright', 'location', 'make', 'model'],
    };
    // Tags the muxer rebuilds itself (ftyp, mvhd, the video track's own timecode, its own encoder string), so a flagless mux loses none of them.
    const MP4_REGENERATED_TAGS = ['major_brand', 'minor_version', 'compatible_brands', 'creation_time', 'encoder', 'timecode'];
    // -=-=-= mp4TagPlan [all five] =-=-=-
    // Whether an mp4-family output needs `-movflags use_metadata_tags`, and what a mux without it leaves behind. The flag is the ONLY way such a file keeps a
    // custom global key, but it is not free: the muxer then writes EVERY global tag as a QuickTime mdta key instead of its native form, which iTunes-style
    // readers (mutagen, so Picard and beets) and Apple's own players cannot read while ffprobe still shows every tag, and mp4/m4v/m4a lose their covr cover
    // art - ffmpeg cannot write covr beside mdta keys (measured 2026-10-01, jellyfin 7.1.4). So it is set only when the output will carry an awk_* marker, the
    // one tag whose loss makes a sibling redo its work; otherwise the native tags keep their readable form and any other custom key is dropped (`dropped`).
    // A `normalize-` awk_video fence is no such marker: normalize fires only on a mismatch its own encode removes, so video_clean writes none into the mp4
    // family, and one an earlier version wrote lapses on the next flagless mux. `writes` holds the global keys this run sets (an empty value clears one);
    // keys match case-insensitively, as ffmpeg's -metadata does.
    const mp4TagPlan = (container, formatTags, writes = {}) => {
        const c = String(container || '').toLowerCase();
        if (!isMp4Family(c)) return { flag: false, markers: [], dropped: [] };
        const out = new Map();
        for (const [k, v] of [...Object.entries(formatTags || {}), ...Object.entries(writes)]) out.set(k.toLowerCase(), [k, String(v ?? '').trim()]);
        const kept = [...out.values()].filter(([, v]) => v !== '');
        const markers = kept.filter(([k, v]) => /^awk_/i.test(k) && !(k.toLowerCase() === 'awk_video' && /^normalize-/i.test(v))).map(([k]) => k);
        const native = MP4_NATIVE_TAGS[c === 'mov' ? 'mov' : 'mp4'];
        const dropped = markers.length ? [] : kept.map(([k]) => k)
            .filter((k) => !/^awk_/i.test(k) && !native.includes(k.toLowerCase()) && !MP4_REGENERATED_TAGS.includes(k.toLowerCase()));
        return { flag: markers.length > 0, markers, dropped };
    };
    // -=-=-= mp4MovflagsArg [all five] =-=-=-
    // The one -movflags an mp4-family output carries, built in one place because a later -movflags without a leading + replaces the earlier value:
    // use_metadata_tags where mp4TagPlan asks for it, and +faststart, which writes the moov - the file's index - ahead of the media, so a player starts and
    // seeks on progressive download or remote direct play without fetching the tail first. Every mp4-family write the other four plugins make front-loads,
    // so a file one of them remuxed reaches stream_ordering fronted and its method_mp4_faststart has no remux of its own to force; stream_ordering passes
    // `faststart` false for that input's strip, and only it ever remuxes for the flag alone. It moves the moov and nothing else (packets, tags, chapters, tmcd
    // tracks, covers and Dolby Vision boxes read back identical; mediaInfo's IsStreamable turns Yes) by writing the whole file once more at the end of the
    // mux: 0.2-1.2x a plain -c copy remux's wall time (CPU-saturated to idle M1, 291 MB to 2.5 GB, jellyfin 7.1.4, 2026-11-09).
    const mp4MovflagsArg = (container, plan, faststart = true) => {
        const flags = `${plan.flag ? 'use_metadata_tags' : ''}${faststart && isMp4Family(container) ? '+faststart' : ''}`;
        return flags ? ` -movflags ${flags}` : '';
    };
    // -=-=-= isMp4Cover (+ mp4CoversLost) [all five] =-=-=-
    // A cover the mp4/mov muxer stores as an iTunes covr atom rather than as a track: a video stream whose ONLY disposition is attached_pic, the muxer's own
    // test - one with another flag beside it (attached_pic+default) is written as a one-frame video track instead, in mov too, and read back as plain video.
    // The mov demuxer reports a covr cover after every track, the chapter and tmcd tracks the muxer writes included, wherever it was mapped; ffmpeg writes the
    // atom after every track, and only a file whose udta precedes its tracks (another tool's layout) reports its cover first. Measured 2026-10-23 on jellyfin
    // 7.1.4 in mp4, m4v (the ipod muxer and -f mp4) and mov, with one cover and two.
    const isMp4Cover = (s) => codecTypeOf(s) === 'video' && s.disposition?.attached_pic === 1
        && Object.entries(s.disposition).every(([k, v]) => k === 'attached_pic' || v !== 1);
    // The covers among `kept` (the streams a plugin maps into the output) the container will not store: every one in mov (the QuickTime flavour writes no covr
    // at all, flag or not), and in mp4/m4v/m4a the ones use_metadata_tags costs. The plugins that drop cover art themselves pass none; the others leave these
    // out of their Expected results line too, so the summary and the warning agree.
    const mp4CoversLost = (plan, container, kept = []) => {
        const c = String(container || '').toLowerCase();
        return isMp4Family(c) && (c === 'mov' || plan.flag) ? kept.filter(isMp4Cover) : [];
    };
    // -=-=-= mp4TagPlanLog [all five] =-=-=-
    // What the plan costs, as log lines: the native tags the flag rewrites, the custom keys a flagless mux leaves behind, and each cover mp4CoversLost
    // names (same `kept` argument). The rewrite is said on every mux that keeps a marker: nothing else names it, so a library recovered into mp4 lost
    // its readable tags in silence, and the marker is permanent.
    const mp4TagPlanLog = (plan, container, kept = []) => {
        const c = String(container || '').toLowerCase();
        const TAG_KEY_LOG_MAX = 40;   // several keys share one line, and a key is a name rather than free text, so each echo is kept short
        const names = (keys) => keys.map((k) => logSafe(k, TAG_KEY_LOG_MAX)).join(', ');
        let log = '';
        if (plan.flag) {
            log += `☒Keeping the ${names(plan.markers)} marker in .${c} writes every tag as a QuickTime metadata key, which taggers and Apple players`
                + ' cannot read (Matroska keeps both)\n';
        }
        if (plan.dropped.length) {
            log += `☐Not carrying ${names(plan.dropped)} - .${c} has no standard tag for ${plan.dropped.length === 1 ? 'it' : 'them'}`
                + `, and keeping one would rewrite every other tag in a form taggers cannot read${c === 'mov' ? '' : ' and drop any cover art'}\n`;
        }
        for (const s of mp4CoversLost(plan, c, kept)) {
            log += c === 'mov' ? `☒${streamTag(s.index)} Cover art dropped - .mov cannot store it\n`
                : `☒${streamTag(s.index)} Cover art dropped - keeping the ${names(plan.markers)} marker in .${c} takes QuickTime metadata keys, and ffmpeg `
                + 'cannot write cover art beside them\n';
        }
        return log;
    };
    // -=-=-= isMp4ChapterTrack [all five] =-=-=-
    // An mp4-family file's chapter track. ffmpeg's mov demuxer reads the chapters out of the text track a 'chap' reference names and reports it as a DATA
    // stream (bin_data, one sample per chapter) under its fourcc - 'text' where ffmpeg wrote it, 'tx3g' where GPAC/MP4Box did - and the mp4/mov muxer writes
    // the chapters back as a fresh 'text' track of that shape on every -c copy. So no remux into the mp4 family removes it, and mapping it is worse:
    // mp4/m4v/m4a write the copy as a second, junk 'gpmd' data track (one more each pass), and mov refuses it ("Tag text incompatible with output codec id",
    // exit 183) - measured for both fourccs on jellyfin 7.1.4, 2026-10-22. Every plugin writing an mp4-family output leaves it unmapped, and clean_and_remux
    // never counts that as work (a removal the muxer undoes emits the same preset every pass, which Tdarr errors); its remux into Matroska removes it like any
    // data stream, Matroska carrying the chapters natively. The fourcc list stays closed: every other data track is copied (a GoPro 'gpmd' telemetry track in a
    // chaptered file survives), and a 'tx3g' track no chapter reference names is demuxed as a mov_text subtitle, not as data. The demuxer is read from
    // format_name, never the extension. Tdarr probes without -show_chapters, so chapters are known from mediaInfo's Menu tracks or from the track's own
    // nb_frames, the chapter count ffmpeg reads (equal at 1, 3, 4, 7 and 20 chapters), which still answers when mediaInfo did not scan the file; a
    // chapter-fourcc track with neither holds no chapter to rebuild and is removed like any other. awk-ffmpeg-test's fmtprobe rebuild:* rows re-measure it.
    const isMp4ChapterTrack = (s) => String(file?.ffProbeData?.format?.format_name || '').split(',').some(isMp4Family)
        && codecTypeOf(s) === 'data' && ['text', 'tx3g'].includes(String(s.codec_tag_string || '').toLowerCase())
        && ((file?.mediaInfo?.track || []).some((t) => t?.['@type'] === 'Menu') || Number(s.nb_frames) > 0);
    // -=-=-= mp4TimecodeFps (+ MP4_TMCD_MAX_FPS) [all five] =-=-=-
    // Above this the muxer refuses at the trailer a tmcd it has already created (mp4TimecodeArgs).
    const MP4_TMCD_MAX_FPS = 255;
    // The whole fps the mp4/mov muxer times a tmcd by: the rate rounded to nearest as its ROUNDED_DIV does (255.4 is 255, 255.5 is 256), or 0 for a rate
    // without a positive numerator and denominator.
    const mp4TimecodeFps = (rate) => {
        const [num, den] = String(rate || '').split('/').map(Number);
        return num > 0 && den > 0 ? Math.floor((num + Math.floor(den / 2)) / den) : 0;
    };
    // -=-=-= isTmcdTrack (+ mp4GlobalTimecodeKey, MP4_TIMECODE, mp4TimecodeAccepted, mp4VideoTimecode, mp4TimedVideo) [all five] =-=-=-
    // A tmcd timecode track. Every rule below measured 2026-10-23 on jellyfin 7.1.4; awk-ffmpeg-test's fmtprobe create:tmcd* rows re-measure them.
    const isTmcdTrack = (s) => codecTypeOf(s) === 'data' && String(s.codec_tag_string || '').toLowerCase() === 'tmcd';
    const mp4GlobalTimecodeKey = () => Object.keys(file?.ffProbeData?.format?.tags || {}).find((k) => k.toLowerCase() === 'timecode');
    // A timecode as libavutil's av_timecode_init_from_string parses it, sscanf "%d:%d:%d%c%d": blanks may lead each number and a sign may lead it, no field is
    // range-checked (99 frames, -01 or 25 hours all write a track), trailing text is ignored, and any separator before the frames but ':' means drop-frame.
    const MP4_TIMECODE = /^[ \t\n\v\f\r]*[+-]?\d+:[ \t\n\v\f\r]*[+-]?\d+:[ \t\n\v\f\r]*[+-]?\d+(\D)[ \t\n\v\f\r]*[+-]?\d+/;
    // Whether the muxer writes a tmcd for `timecode` at `rate`: it times the track by that frame rate in whole fps (mp4TimecodeFps), and below 1 fps writes
    // none (a cover's 0/0, a 1/3 fps stream - but a PNG-codec video or an attached picture at 25/1 gets one), nor for drop-frame at a rate that does not round
    // to a multiple of 30 (29.97, 30, 59.94 and 60 take it; 23.976, 24, 25 and 50 do not), and above 255 none is written either: mp4TimecodeArgs stops the one
    // that would fail the mux (`cap`, which mp4OverfastVideo lifts).
    const mp4TimecodeAccepted = (timecode, rate, cap = MP4_TMCD_MAX_FPS) => {
        const sep = (MP4_TIMECODE.exec(String(timecode ?? '')) || [])[1];
        const fps = mp4TimecodeFps(rate);
        return sep !== undefined && fps >= 1 && fps <= cap && (sep === ':' || fps % 30 === 0);
    };
    // The string a video's tmcd is written from: the muxer reads the file's global timecode whenever the file has that tag, even an empty one, and the stream's
    // own only otherwise (a global 02:00:00:00 beside a video 01:00:00:00 writes 02:00:00:00; a global 'garbage' beside a valid video tag writes none).
    const mp4VideoTimecode = (v) => {
        const key = mp4GlobalTimecodeKey();
        return key === undefined ? getTagCI(v.tags, 'timecode') : String(file.ffProbeData.format.tags[key] ?? '');
    };
    // A video stream the mp4/mov muxer writes a tmcd for: each one it accepts gets a tmcd of its own (two videos under a global timecode, two).
    const mp4TimedVideo = (v) => codecTypeOf(v) === 'video' && mp4TimecodeAccepted(mp4VideoTimecode(v), v.avg_frame_rate);
    // -=-=-= mp4TimecodeArgs (+ mp4OverfastVideo, mp4OverfastFor, mp4TimecodeLog) [all five] =-=-=-
    // A video the muxer cannot time a tmcd for: above 255 fps it still creates the track, then refuses it at the trailer ("fps 300 is too large", exit 234), so
    // the file errors on every requeue. Judged on a stream as the output writes it (a copy at its avg_frame_rate, an encode at the rate it writes or, marked
    // rateUpTo, the most it can); a rateUpTo encode may run slower than that bound (video_clean's encodeRateUpTo says why), and the remedy applies all the
    // same, because a missing one fails the mux where a needless one only loses a timecode. Measured 2026-10-23 on jellyfin 7.1.4 in mp4, mov and -f mp4: 255/1
    // and 1277/5 write a tmcd, 511/2, 256/1 and 300/1 fail (fmtprobe create:tmcd-fps re-measures it).
    const mp4OverfastVideo = (v) => codecTypeOf(v) === 'video' && mp4TimecodeAccepted(mp4VideoTimecode(v), v.avg_frame_rate, Infinity)
        && mp4TimecodeFps(v.avg_frame_rate) > MP4_TMCD_MAX_FPS;
    // The fast video whose timecode a source tmcd carries.
    const mp4OverfastFor = (s, kept) => kept.find((v) => mp4OverfastVideo(v) && mp4VideoTimecode(v) === getTagCI(s.tags, 'timecode'));
    // The output-side args that keep a fast video from failing the whole mp4-family mux, over `kept`, the streams as the output writes them in output order.
    // A copied tmcd (mov) stops the muxer creating any and is timed by its own sample description, so it needs nothing. Where no other kept video gets a tmcd,
    // -write_tmcd 0 turns the muxer's tmcd creation off: it loses nothing more and keeps a global timecode that use_metadata_tags stores. Where one does, that
    // switch would take its tmcd too, so only the fast video's timecode is cleared, by its place among the output's video streams; a global timecode beats
    // every video's own, so it is cleared as well and restated on each other video, which then writes exactly the tmcd it would have. Each remedy exits 0
    // (measured with mp4OverfastVideo's rates).
    const mp4TimecodeArgs = (container, kept) => {
        if (!isMp4Family(container) || kept.some(isTmcdTrack)) return '';
        const videos = kept.filter((s) => codecTypeOf(s) === 'video');
        const fast = videos.filter(mp4OverfastVideo);
        if (!fast.length) return '';
        if (!videos.some(mp4TimedVideo)) return ' -write_tmcd 0';
        const key = mp4GlobalTimecodeKey();
        const global = key === undefined ? null : escMeta(file.ffProbeData.format.tags[key]);
        return (global === null ? '' : ' -metadata timecode=') + videos.map((v, n) => (fast.includes(v) ? ` -metadata:s:v:${n} timecode=`
            : global === null ? '' : ` -metadata:s:v:${n} "timecode=${global}"`)).join('');
    };
    // A line for each fast video, whose timecode is lost; a rateUpTo one's names the rate as an upper bound.
    const mp4TimecodeLog = (container, kept) => (mp4TimecodeArgs(container, kept) ? kept.filter(mp4OverfastVideo) : []).map((v) => {
        const [c, fps] = [String(container).toLowerCase(), mp4TimecodeFps(v.avg_frame_rate)];
        const why = v.rateUpTo ? `it can run at up to ${fps} fps, and the .${c} muxer cannot time one above ${MP4_TMCD_MAX_FPS}`
            : `the .${c} muxer cannot time one at ${fps} fps (${MP4_TMCD_MAX_FPS} at most)`;
        return `☐${streamTag(v.index)} Writing no tmcd timecode track for this video - ${why}, so its timecode is lost\n`;
    }).join('');
    // -=-=-= isMp4RebuiltTimecode (+ mp4TimecodeCount, mp4RebuiltTimecodes) [all five] =-=-=-
    // How many tmcds the muxer writes for `kept`, the streams as the output writes them: one per mp4TimedVideo stream the output maps, none beside a copied
    // tmcd (mov) - each written from its video's mp4VideoTimecode, never from a source track.
    const mp4TimecodeCount = (kept) => (kept.some(isTmcdTrack) ? 0 : kept.filter(mp4TimedVideo).length);
    // The source tmcds left out of the map that come back: one per kept timed video, a tmcd whose own timecode tag is the one that video is written with, then
    // the first left in file order for each video none matches; the rest are lost. A PNG-codec video stored first at 05:00:00:00 beside an h264 at 01:00:00:00,
    // each with its own tmcd, keeps the h264's when the PNG is dropped, and so does a ProRes proxy in a .mov (measured 2026-10-23; fmtprobe create:tmcd-cap and
    // create:tmcd-pair). Under a global timecode every video asks for that one, so a tmcd it does not match comes back carrying the file's timecode, as its
    // line says.
    const mp4RebuiltTimecodes = (kept) => {
        const left = (file?.ffProbeData?.streams || []).filter((x) => isTmcdTrack(x) && !kept.some((k) => k.index === x.index));
        const paired = [];
        let unpaired = 0;
        for (const v of mp4TimecodeCount(kept) ? kept.filter(mp4TimedVideo) : []) {
            const at = left.findIndex((x) => getTagCI(x.tags, 'timecode') === mp4VideoTimecode(v));
            if (at < 0) unpaired += 1;
            else paired.push(...left.splice(at, 1));
        }
        return [...paired, ...left.slice(0, unpaired)];
    };
    // A tmcd timecode track the mp4/mov muxer puts back when a remux leaves it out, so the output reads exactly as the copy would have (measured 2026-10-01
    // and 2026-10-22: 01:00:00:00 in and out). That holds for a tmcd the video track does not reference (no 'tref') too: the video then shows no timecode
    // tag, but the mov demuxer puts the track's timecode in the global tags, and the muxer writes the track back from those (measured 2026-10-23 on an mp4
    // and a mov with the reference removed).
    const isMp4RebuiltTimecode = (s, kept) => isTmcdTrack(s) && mp4RebuiltTimecodes(kept).some((x) => x.index === s.index);
    // -=-=-= mp4CreatedTracks (+ MP4_CHAPTER_KEY, MP4_CHAPTER_TIME) [all five] =-=-=-
    // mediaInfo's Menu keys each chapter by its start time (_00_01_23_456) and spells an untitled Matroska chapter as that time (MP4_CHAPTER_TIME).
    const MP4_CHAPTER_KEY = /^_(\d{2})_(\d{2})_(\d{2})_(\d{3})$/;
    const MP4_CHAPTER_TIME = '$1:$2:$3.$4';
    // The tracks an mp4-family mux writes that no source stream stands behind, as the next pass's ffprobe reports them, so an Expected results line matches the
    // next Input streams line: a chapter track (data, bin_data, 'text') when the file has chapters but no source chapter track (isMp4ChapterTrack), and a tmcd
    // (data, no codec name, 'tmcd') for each one mp4TimecodeCount counts in `kept` beyond the source tmcds it rebuilds. Index -1, so no mediaInfo track joins
    // either. mp4 and mov write both, as do .m4v and .m4a under the -f mp4 outputMuxerArg forces (the ipod muxer an .m4v selects by extension writes no tmcd),
    // and a copied tmcd (mov) stops the muxer writing any. Measured 2026-10-23 on jellyfin 7.1.4 and mediainfo.js 0.2.0; awk-ffmpeg-test's fmtprobe create:*
    // and miprobe mi:menu* rows re-measure it. Summary only: nothing is mapped or counted as work.
    const mp4CreatedTracks = (container, kept) => {
        if (!isMp4Family(container)) return [];
        const streams = file?.ffProbeData?.streams || [];
        const movDemuxed = String(file?.ffProbeData?.format?.format_name || '').split(',').some(isMp4Family);
        // The muxer writes the chapter track from chapter TITLES, empty ones included: a list with none writes a Nero list alone. Tdarr probes without
        // -show_chapters, so they are read off mediaInfo's Menu, which lists an empty title not at all, while the mov demuxer gives every Nero entry a title.
        // So a track is promised for a key whose value is not its own start time, for any key in a file the mov demuxer reads, and for a Menu naming no field
        // (every title empty, Nero or Matroska). A Matroska chapter titled exactly its own start time reads as untitled (one tagged with a language reads
        // 'en:...'), and a zero-entry Nero list as an empty one - though ffmpeg writes a list only for a file with chapters. An MPEG-TS program Menu and a
        // QuickTime chapter track's own Menu name fields and key no chapter, so neither counts.
        const titled = (t) => Object.keys(t).every((k) => ['@type', '@typeorder', ''].includes(k)) || Object.entries(t.extra || {})
            .some(([k, v]) => MP4_CHAPTER_KEY.test(k) && (movDemuxed || String(v) !== k.replace(MP4_CHAPTER_KEY, MP4_CHAPTER_TIME)));
        const chapters = !streams.some(isMp4ChapterTrack) && (file?.mediaInfo?.track || []).some((t) => t?.['@type'] === 'Menu' && titled(t));
        const rebuilt = mp4RebuiltTimecodes(kept).length;
        return [...(chapters ? [{ index: -1, codec_type: 'data', codec_name: 'bin_data', codec_tag_string: 'text' }] : []),
            ...Array.from({ length: mp4TimecodeCount(kept) - rebuilt }, () => ({ index: -1, codec_type: 'data', codec_tag_string: 'tmcd' }))];
    };
    // -=-=-= mp4RebuiltLine (+ mp4RebuiltLast) [all five] =-=-=-
    // A track left out of the map that the muxer rebuilds (isMp4ChapterTrack, isMp4RebuiltTimecode) is still in the output, so its line is a ☑.
    const mp4RebuiltLine = (s, container) => {
        const timecode = mp4GlobalTimecodeKey() !== undefined ? "the file's timecode" : "the video track's timecode";
        const [what, from] = isMp4ChapterTrack(s) ? ['chapter', 'the chapters'] : ['tmcd timecode', timecode];
        return `☑${streamTag(s.index)} Keeping the ${what} track - the .${String(container).toLowerCase()} muxer rebuilds it from ${from}\n`;
    };
    // The muxer writes the tracks it rebuilds after every mapped stream, the chapter track first and then each tmcd (measured 2026-10-22), so an Expected
    // results line lists them last in that order: this moves the items of `list` (anything carrying a source index) that are among `rebuilt` to the end, and
    // slots the `created` tracks (mp4CreatedTracks) in by the same rule - a chapter track ahead of every tmcd, each tmcd last - each made a list item by
    // `wrap`. Into an mp4-family `container` a kept cover (isMp4Cover, judged on the source stream at the item's index) goes after all of them, where the next
    // pass reads it.
    const mp4RebuiltLast = (container, list, rebuilt, created = [], wrap = (s) => s) => {
        const cover = (x) => isMp4Family(container) && isMp4Cover((file?.ffProbeData?.streams || []).find((s) => s.index === x.index));
        const rank = (x) => { const s = rebuilt.find((r) => r.index === x.index); return !s ? 0 : isMp4ChapterTrack(s) ? 1 : 2; };
        const out = list.filter((x) => !cover(x)).sort((a, b) => rank(a) - rank(b));
        const firstTmcd = out.findIndex((x) => rank(x) === 2);
        out.splice(firstTmcd < 0 ? out.length : firstTmcd, 0, ...created.filter((s) => !isTmcdTrack(s)).map(wrap));
        return [...out, ...created.filter(isTmcdTrack).map(wrap), ...list.filter(cover)];
    };
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: matroska-family container =====
    // -=-=-= isMatroskaFamily [all five] =-=-=-
    // The Matroska family: mkv, its audio (mka) and subtitle (mks) spellings, and WebM, the Matroska subset. All of them store arbitrary tags and flags
    // natively, so each "does this survive a remux" test starts here - and each consumer keeps its own measurement of the property it relies on.
    const isMatroskaFamily = (container) => ['mkv', 'mka', 'mks', 'webm'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: matroska-family container =====
    // ===== SHARED [clean_and_remux, stream_ordering]: mpeg ts/ps container =====
    // -=-=-= isMpegTsPsFamily  [clean_and_remux, stream_ordering] =-=-=-
    // The extensions ffmpeg demuxes as MPEG-TS (ts/m2ts/mts/m2t/tp/trp/tod) or MPEG-PS (mpg/mpeg/vob/evo/m2p/vro/mod/dat), grouped by DEMUXER FAMILY, not
    // spelling: file.container is only the lowercased extension, and ffmpeg picks its demuxer by probing content. Broadcast timestamps in either family
    // cannot be remuxed as they stand, so clean_and_remux regenerates them on every remux of one, and the duration such an original states can be far from
    // what it holds (stream_ordering's truncation check). Not hypothetical: identical MPEG-PS bytes named .vob hard-fail a bare -c copy remux ("Can't write
    // packet with unknown timestamp", exit -22) while the same bytes named .mpg are repaired - and vob/evo/m2ts are in Tdarr's DEFAULT containerFilter. The
    // bar is every real spelling of the family, not Tdarr's defaults, all measured on the production build (.dat is a VCD's AVSEQnn.DAT); a new one goes
    // here, in the family it demuxes as.
    const isMpegTsPsFamily = (container) => ['ts', 'm2ts', 'mts', 'm2t', 'tp', 'trp', 'tod', 'mpg', 'mpeg', 'vob', 'evo', 'm2p', 'vro', 'mod', 'dat']
        .includes(String(container || '').toLowerCase().trim());
    // ===== END SHARED: mpeg ts/ps container =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: read-back dispositions =====
    // -=-=-= carriesDisposition / MOV_UNSTORED_ROLES (+ readBackDispositions) [all five] =-=-=-
    // Whether an output's command writes any -disposition at all (readBackDispositions' `manual`).
    const carriesDisposition = (args) => /(^|\s)-disposition[:\s]/.test(String(args || ''));
    // The role flags a .mov stores none of (measured at readBackDispositions' last rule).
    const MOV_UNSTORED_ROLES = ['forced', 'comment', 'hearing_impaired', 'captions', 'visual_impaired', 'descriptions', 'dub', 'original'];
    // The dispositions an output is read back with, as its Expected results line shows them: `list` is the line's items in output order, `streamOf` reads an
    // item's stream, `withStream` makes an item of a changed copy, and `manual` is carriesDisposition's answer. Summary only - no plugin overrides these flags,
    // and only an audio or subtitle token prints a default one. ffmpeg and the mov muxer change flags no plugin asks for, each rule beside the code that
    // applies it (measured 2026-10-23 on jellyfin 7.1.4; the FFmpeg 7.1 source agrees - fftools set_dispositions, movenc enable_tracks).
    const readBackDispositions = (container, list, manual, streamOf = (x) => x, withStream = (x, s) => s) => {
        const mp4 = isMp4Family(container);
        if (!mp4 && !isMatroskaFamily(container)) return list;
        const flagged = (x, flags) => withStream(x, { ...streamOf(x), disposition: { ...(streamOf(x).disposition || {}), ...flags } });
        const out = [...list];
        // A type none of whose streams is default gets one from two writers. ffmpeg itself, on an output whose command carries no -disposition, makes the first
        // stream of each type that has two or more default - an attached_pic stream counted but never chosen - and one -disposition anywhere switches that off
        // for the whole output; Matroska (mkv and webm measured) and the mp4 family store the flag, while MPEG-TS and AVI read every stream back undefaulted,
        // so nothing is shown there. The mov muxer, into the mp4 family, enables the first video, audio and subtitle track - a lone track too, whatever
        // -disposition says - and the mov demuxer reads an enabled track as default; a cover (isMp4Cover) is no track, and a chapter or tmcd track the muxer
        // writes is never enabled. Measured on an mkv's undefaulted subtitles, a lone audio written with -disposition 0, and an mp4 whose default subtitle is
        // dropped, whose next subtitle then reads default.
        for (const type of ['video', 'audio', 'subtitle']) {
            const ofType = out.filter((x) => codecTypeOf(streamOf(x)) === type);
            if (ofType.some((x) => streamOf(x).disposition?.default === 1)) continue;
            const pick = (!manual && ofType.length > 1 ? ofType.find((x) => streamOf(x).disposition?.attached_pic !== 1) : undefined)
                || (mp4 ? ofType.find((x) => !isMp4Cover(streamOf(x))) : undefined);
            if (pick) out[out.indexOf(pick)] = flagged(pick, { default: 1 });
        }
        // A .webm stores default and forced on every track and, on a subtitle, one WebVTT kind as its codec (D_WEBVTT/CAPTIONS, else DESCRIPTIONS, else
        // METADATA): every other flag reads back 0, and of two kinds the first alone (measured 2026-11-14 on jellyfin 7.1.4, each flag written on video,
        // audio and a webvtt subtitle and copied once more).
        if (String(container || '').toLowerCase() === 'webm') {
            return out.map((x) => {
                const d = streamOf(x).disposition || {};
                const kind = codecTypeOf(streamOf(x)) === 'subtitle' ? ['captions', 'descriptions', 'metadata'].find((k) => d[k] === 1) : undefined;
                const gone = Object.keys(d).filter((k) => d[k] === 1 && k !== 'default' && k !== 'forced' && k !== kind);
                return gone.length ? flagged(x, Object.fromEntries(gone.map((k) => [k, 0]))) : x;
            });
        }
        if (!mp4) return out;
        // The mov muxer writes every video stream but a cover as an ordinary track, read back with no attached_pic, still_image or timed_thumbnails flag
        // (attached_pic+default, attached_pic+timed_thumbnails - a QuickTime chapter-image track - still_image and timed_thumbnails alike, in mjpeg and png),
        // so there only an image codec still reads as cover art. It stores no original flag either: a copied one and a +original write both read back 0
        // (audio and subtitle, mp4, m4v and mov; measured 2026-11-09 on jellyfin 7.1.4), so the role survives only as a title keyword. A .mov, which the mov
        // muxer writes (no -f mp4), stores no role flag at all, since only its MP4 mode writes the box that carries them: forced, comment, hearing_impaired,
        // captions, visual_impaired, descriptions and dub written on audio and subtitle read back 0 from .mov, and 1 from .mp4 and from .m4v and .m4a under
        // -f mp4 (measured 2026-11-14 on jellyfin 7.1.4).
        const COVER_FLAGS = ['attached_pic', 'still_image', 'timed_thumbnails'];
        const lost = String(container || '').toLowerCase() === 'mov' ? MOV_UNSTORED_ROLES : ['original'];
        return out.map((x) => {
            const d = streamOf(x).disposition || {};
            const cover = codecTypeOf(streamOf(x)) === 'video' && !isMp4Cover(streamOf(x)) && COVER_FLAGS.some((k) => d[k] === 1);
            const roles = lost.filter((k) => d[k] === 1);
            if (!cover && !roles.length) return x;
            return flagged(x, { ...(cover ? Object.fromEntries(COVER_FLAGS.map((k) => [k, 0])) : {}), ...Object.fromEntries(roles.map((k) => [k, 0])) });
        });
    };
    // ===== END SHARED: read-back dispositions =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor [all five] =-=-=-
    // The single join point between the two probes: the mediaInfo track whose StreamOrder equals the ffprobe index; undefined when absent. Deliberately
    // NOT memoised (unlike roleFieldsLower's WeakMap): the scan measures ~20 microseconds per file against a transcode measured in minutes. Bound to THIS
    // file: it joins against the closure's file.mediaInfo, so it - and every helper that reaches it (roleFieldsLower, resolveLang, resolveChannels, ...)
    // - is sound ONLY on streams from the same file.ffProbeData. Never feed it a FOREIGN stream list (e.g. otherArguments.originalLibraryFile's): it
    // would read THIS file's mediaInfo track at the foreign stream's index and silently answer about the wrong stream. Menu is excluded because it is
    // the one track kind whose StreamOrder is NOT a stream index: MediaInfo numbers an MPEG-TS program's Menu by PROGRAM ordinal ("0") while that
    // program's real tracks carry a two-part "0-0"/"0-1" that Number() turns into NaN - so on a single-program .ts the Menu is the only numeric match
    // and ffprobe stream 0 reads the Menu's fields. Its Language is a concatenated program list (" / en / en / en"), which makes an untagged track look
    // tagged and silences language_fill, and tag_language=strict then writes that string into the container where nothing can repair it (toCanonicalTag
    // passes it through unchanged). Measured on 6 of the corpus's MPEG-TS files; stream_ordering's DURATION_SIGNALS already guards the same way. Do NOT
    // "fix" this by joining on the last component of the two-part form - measured wrong on both a teletext capture and a multi-program mux.
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
        const mi = mediaInfoFor(ffstream);
        if (!mi) return 0;
        const measured = Number(mi.BitRate || 0) || Number(mi.BitRate_Nominal || 0);
        if (measured > 0) return measured;
        const size = Number(mi.StreamSize || 0);
        const dur = Number(mi.Duration || 0);
        if (size > 0 && dur > 0) {
            const bps = Math.round((size * 8) / dur);
            // clamp to a plausible audio range so a stray unit (ms Duration, etc.) or corrupt size can't inject garbage
            if (bps > 1000 && bps < 100000000) return bps;
        }
        return 0;
    };

    // -=-=-= resolveChannels (+ channelsFromLayout, resolveChannelLayout helpers) [all five] =-=-=-
    // Audio channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string from either probe
    // - "5.1(side)" -> 6, "FL+FR+LFE" -> 3. Returns 0 only when no source reports it. resolveChannelLayout is that string, '' when neither probe has one.
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
    const resolveChannelLayout = (s, mi = mediaInfoFor(s)) => String(s.channel_layout || mi?.ChannelLayout || mi?.ChannelPositions || '');
    const resolveChannels = (ffstream) => {
        const ff = Number(ffstream.channels || 0);
        if (ff > 0) return ff;
        const mi = mediaInfoFor(ffstream);
        const miChannels = Number(mi?.Channels || 0);
        if (miChannels > 0) return miChannels;
        return channelsFromLayout(resolveChannelLayout(ffstream, mi));
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
    // -=-=-= attachmentNameParts [all five] =-=-=-
    // The three name-derived facts an attachment is classified by - its mimetype, its filename, and the extension taken off that filename - resolved once.
    // Three sites ask for them (summariseStream's [attach:...] token, isFontAttachment, and clean_and_remux's attachmentKind), and the extension rule is the
    // fragile part: a filename with NO dot must yield '' rather than the whole name, or every dotless attachment classifies as an extension of itself.
    const attachmentNameParts = (s) => {
        const mime = (s?.tags?.mimetype || '').trim().toLowerCase();
        const fname = (s?.tags?.filename || '').trim().toLowerCase();
        return { mime, fname, ext: fname.includes('.') ? fname.slice(fname.lastIndexOf('.') + 1) : '' };
    };
    // -=-=-= HDR_TRANSFERS [all five] =-=-=-
    // The HDR transfer curves - ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg). The single
    // source for every HDR-curve test.
    const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
    // -=-=-= videoTransferOf (+ isHdrVideo) [all five] =-=-=-
    // A video stream's transfer curve from either probe (ffprobe's tag is routinely absent, or a loose bt2020-10, on a file mediaInfo reads as HDR10), and
    // whether the stream is HDR: an HDR curve, or ANY HDR format mediaInfo names (static HDR10 announces itself "SMPTE ST 2086"). It is the summary's hdr
    // token, so a gate that must treat a file as HDR whenever the log calls it hdr - video_clean's tonemap, sub_worker's SEI strip - builds on it.
    const videoTransferOf = (s, mi = mediaInfoFor(s)) => (s.color_transfer || mi?.transfer_characteristics || '').toLowerCase().trim();
    const isHdrVideo = (s, mi = mediaInfoFor(s)) => HDR_TRANSFERS.includes(videoTransferOf(s, mi)) || !!String(mi?.HDR_Format || '').trim();
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
    // -=-=-= logTok  [all five] =-=-=-
    // The one sanitiser for any untrusted string an infoLog line echoes - a container title, handler, language token or free-text input. Control characters
    // become a space because infoLog is NEWLINE-DELIMITED: a raw newline in a container tag splits the line into a continuation carrying no ☐/☑/☒ symbol,
    // which is a status line the plugin never wrote. The length cap exists because nothing bounds a container tag and Tdarr persists the whole infoLog.
    // Quotes and backslashes are deliberately KEPT - this is display-only and never feeds ffmpeg, so unlike escMeta the value should read faithfully.
    // Shared, and used by every echo site, because the rule is log-integrity relevant: a per-site spelling would let a hardening (also stripping
    // U+2028/U+2029, say, which JSON-embedded logs treat as line terminators) land at one echo site while the others keep emitting the character.
    const logTok = (v, max = 64) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);
    // -=-=-= logSafe  [all five] =-=-=-
    // logTok with the truncation made VISIBLE: the same sanitising (see above), but a value that was actually cut ends in an ellipsis, so a reader can tell a
    // clipped echo from a value that genuinely ends there. EVERY echo of an unbounded value goes through this - a free-text input, a container tag, a sidecar
    // path - so the marker means one thing in every plugin rather than appearing in whichever one happened to wrap it. summariseStream's tokens deliberately
    // do NOT: they call logTok directly at its 64 cap, where an ellipsis would render inside an [attach:...] token for any ordinary long mimetype or filename.
    const logSafe = (value, max = 200) => { const s = logTok(value, Infinity); return s.length > max ? `${s.slice(0, max)}…` : s; };
    // -=-=-= summariseStream [all five] =-=-=-
    // The [type:details] summary token. Audio & subtitle append /default then EVERY role marker that applies. /default reads the REAL disposition flag
    // alone - a title keyword must not flip a selection flag; every other marker uses the same flag-OR-title-keyword test the sort keys use, so every
    // plugin's summary lines up. Exception: the subtitle /original is a raw flag, display only - no classifier scopes it to subtitles. subrip shows as
    // srt. Audio uses codecDisplayName so a DTS subtype or object-audio layer the container codec_name hides shows in the token. The optional second
    // argument describes a RE-ENCODED output track as { codec, channels, bps, rate } - so NEVER pass this helper straight to .map(): Array.map would
    // supply the element index as that argument.
    const summariseStream = (s, out) => {
        // Every container-supplied value here (language tags, attachment filenames, mimetypes) is clamped via logTok - see its header for why; 64 covers the
        // longest registered mimetype subtype (59), everything else is far shorter.
        const tok = logTok;   // the shared sanitiser at its default 64-char cap
        // A mimetype's log token: its subtype with any experimental x- prefix stripped (application/x-truetype-font -> truetype-font). The attachment and
        // data label fallbacks below implement the same rule, so it lives once here.
        const mimeSubtype = (m) => (m.includes('/') ? m.slice(m.indexOf('/') + 1).replace(/^x-/, '') : '');
        const type = codecTypeOf(s);
        let codec = codecNameOf(s) || 'unknown';
        if (codec === 'subrip') codec = 'srt';
        const langRaw = tok(resolveLang(s) || 'und');
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video') {
            const vmi = mediaInfoFor(s);
            const vHeight = Number(s.height || vmi?.Height || 0);
            const vTenbit = is10Bit(s, vmi);
            const vHdr = isHdrVideo(s, vmi);
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
                const { mime, ext } = attachmentNameParts(s);
                const sub = mimeSubtype(mime);
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
            const dsub = mimeSubtype(dmime);
            return `[data:${tok((codec === 'unknown' || codec === 'none') && dsub ? dsub : codec)}]`;
        }
        return `[${type || 'unknown'}:${codec}]`;
    };
    // -=-=-= summariseAll [all five] =-=-=-
    // A whole stream list as its token line - the Input streams line, and every plain "Expected results" line. Those are meant to be the SAME view of the
    // stream set before and after, often from mutually exclusive branches, so hand-typed copies drift in a way only one run type ever shows.
    const summariseAll = (list) => list.map((s) => summariseStream(enrichStream(s))).join('');

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

    // ===== SHARED [audio_clean, clean_and_remux]: language list match =====
    // -=-=-= langListMatch  [audio_clean, clean_and_remux] =-=-=-
    // True when a stream's language matches any entry in a pre-normalised key list (keys = userList.map(langMatchKey), computed once per run). Only these
    // two plugins match through a key list; stream_ordering/sub_worker call langMatchKey directly (indexOf / Set), so they carry it, not this.
    const langListMatch = (streamLang, keys) => keys.includes(langMatchKey(streamLang));
    // ===== END SHARED: language list match =====

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
    const isDolbyVisionVideo = (ffstream, mi) => DV_FOURCC_RE.test((ffstream?.codec_tag_string || '').toLowerCase().trim())
        || String(mi?.HDR_Format || mi?.HDR_Format_Compatibility || '').toLowerCase().includes('dolby vision')
        || (Array.isArray(ffstream?.side_data_list) ? ffstream.side_data_list : [])
            .some((sd) => /dovi configuration record|dolby vision/i.test(String(sd?.side_data_type || '')));
    // ===== END SHARED: dolby vision detection =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: dolby vision record =====
    // -=-=-= doviRecord [all five] =-=-=-
    // The stream's Dolby Vision configuration record as ffprobe reports it, or undefined.
    const doviRecord = (s) => (Array.isArray(s?.side_data_list) ? s.side_data_list : [])
        .find((sd) => /dovi configuration record/i.test(String(sd?.side_data_type || '')));
    // -=-=-= dvRecordSurvivesCopy [all five] =-=-=-
    // Whether a -c copy keeps the stream's Dolby Vision record (true with none), the fourcc aside: jellyfin's muxers check the base layer's pixel format and
    // colour against the compat id (its ff_isom_validate_dovi_config) and drop a record that fails under ANY fourcc, mkv to mkv included, so any remux costs
    // such a stream its Dolby Vision. Matched the copy on all 17 measured sources (P5, P7, P8.1, P8.2, P8.4, P20 from Dolby, ffmpeg, mkvmerge, MP4Box and an
    // iPhone-style mov). Compat 0's fourcc condition is dvNeedsDvFourcc's (below). Read by clean_and_remux's convert gate, hevcCopyPlan's Matroska arm and the
    // write-back plugins' dvCopyDropsRecord.
    const dvRecordSurvivesCopy = (s) => {
        const id = String(doviRecord(s)?.dv_bl_signal_compatibility_id ?? '');
        const p10 = s.pix_fmt === 'yuv420p10le';
        const hdr = (trc) => p10 && s.color_transfer === trc && s.color_primaries === 'bt2020' && s.color_space === 'bt2020nc' && s.color_range === 'tv';
        return id === '0' ? p10 : id === '1' || id === '6' ? hdr('smpte2084') : id === '2' ? s.pix_fmt === 'yuv420p' : id === '4' ? hdr('arib-std-b67') : true;
    };
    // -=-=-= dvNeedsDvFourcc [all five] =-=-=-
    // A record naming no compatible base (compatibility id 0: Profile 5). jellyfin's muxers write a compat-0 record's box only under a dvh1/dvhe fourcc or no
    // tag at all (its ff_isom_validate_dovi_config), so under hev1 or hvc1 the stream silently becomes plain HEVC whose IPT colour every player shows wrong.
    // Every other compat id is checked against the stream's colour instead, under any fourcc.
    const dvNeedsDvFourcc = (s) => String(doviRecord(s)?.dv_bl_signal_compatibility_id) === '0';
    // ===== END SHARED: dolby vision record =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: mp4 strict compliance arg =====
    // -=-=-= mp4StrictArg [all five] =-=-=-
    // The ' -strict <level>' an mp4/mov -c copy needs, or '' when it needs none. Three independent reasons share one flag, because `experimental` is a strict
    // SUPERSET of `unofficial` and does every job:
    //   experimental - a TrueHD stream copied INTO mp4, which the muxer otherwise refuses outright (rc 88); `unofficial` does NOT satisfy it. Matched on
    //                  the raw codec_name, not resolveCodecName, whose refined truehdatmos would not equal 'truehd'.
    //   unofficial   - a Dolby Vision video stream, so the mov muxer keeps its dvcC/dvvC boxes; a plain copy drops them, demoting DV to plain HEVC/AV1
    //                  (verified on real HEVC + AV1 DV samples). Cover art is excluded so a leading cover-art stream cannot mask a real DV stream.
    //                  Or an mp3 below 16 kHz, which the mp4 muxer refuses without it ('not standard', exit 234 at 8, 11.025 and 12 kHz; .mov takes
    //                  one either way; measured on jellyfin 7.1.4).
    // Pass the RAW file.ffProbeData.streams as `streams`: the DV signals (codec_tag_string / side_data_list) live only there. `copied` is the subset this
    // run emits as -c copy (defaults to all) - a caller that drops or re-encodes tracks passes its own survivor list, so a TrueHD track on its way out
    // never pulls in a flag the output does not need. Never decide this by regex over the half-built argument string: it carries container-supplied
    // -metadata title values verbatim, so a track titled " -strict foo" reads as already-emitted and the remux silently drops a DV file's boxes.
    const mp4StrictArg = (container, streams, copied) => {
        if (!isMp4Family(container)) return '';
        const list = Array.isArray(streams) ? streams : [];
        const kept = Array.isArray(copied) ? copied : list;
        if (kept.some((s) => codecTypeOf(s) === 'audio' && codecNameOf(s) === 'truehd')) return ' -strict experimental';
        const lowRateMp3 = kept.some((s) => codecTypeOf(s) === 'audio' && codecNameOf(s) === 'mp3' && (Number(s.sample_rate) || 16000) < 16000);
        return lowRateMp3 || list.some((s) => codecTypeOf(s) === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s)))
            ? ' -strict unofficial' : '';
    };
    // ===== END SHARED: mp4 strict compliance arg =====
    // ===== SHARED [clean_and_remux, video_clean]: hevc copy fourcc =====
    // -=-=-= isQtVideoContainer  [clean_and_remux, video_clean] =-=-=-
    // QuickTime VIDEO containers - the gate for every QuickTime fourCC emit (hvc1/dvh1/av01/avc1), on both the encode and the copy path; the two
    // non-QuickTime fourCCs (video_clean's avi RIFF retag, hevcCopyPlan's Matroska dvhe) key on their own container tests. Deliberately mp4/m4v/mov WITHOUT
    // m4a: isMp4Family includes m4a and is right for the -movflags use_metadata_tags decision, but not for tagging a video stream.
    const isQtVideoContainer = (container) => ['mp4', 'm4v', 'mov'].includes(container);
    // -=-=-= HVCC_HEADER_BYTES  [clean_and_remux, video_clean] =-=-=-
    // An hvcC is 23 fixed bytes plus one array per parameter-set type, so only an extradata_size above 23 holds the VPS/SPS/PPS; at 23 they ride in-band,
    // in the samples (Dolby's own P5 and P8.1 mp4s, every mkv made from them, GPAC's xps_inband). ffprobe prints the size whenever there is extradata, and
    // Tdarr 3.04's scan removes only the `extradata` hex (tdarr_core remove_ffprobe_extradata), so the size reaches a plugin.
    const HVCC_HEADER_BYTES = 23;
    // -=-=-= firstKeyParamSets  [clean_and_remux, video_clean] =-=-=-
    // Whether the first KEYFRAME of an HEVC stream carries VPS, SPS and PPS: true / false / null (not read). It is the packet the mov muxer builds an hvcC
    // from once hevc_mp4toannexb has emptied the extradata - a -c copy drops every packet before the first keyframe, and this read is a -c copy too, so it
    // sees that same packet. One packet as Annex B on stdout: 19-84 ms on the samples, the 4K Dolby Vision ones included.
    const HEVC_PS_NAL_TYPES = [32, 33, 34];
    const FIRST_KEY_TIMEOUT_MS = 60000;
    const FIRST_KEY_MAX_BYTES = 64 * 1024 * 1024;
    const firstKeyParamSets = (ffmpegPath, filePath, absIndex) => {
        try {
            const r = require('child_process').spawnSync(ffmpegPath, ['-hide_banner', '-v', 'error', '-i', filePath, '-map', `0:${absIndex}`, '-c', 'copy',
                '-frames:v', '1', '-f', 'hevc', '-'], { timeout: FIRST_KEY_TIMEOUT_MS, maxBuffer: FIRST_KEY_MAX_BYTES, killSignal: 'SIGKILL' });
            if (!r || r.error || r.status !== 0 || !Buffer.isBuffer(r.stdout) || !r.stdout.length) return null;
            const b = r.stdout;
            const seen = new Set();
            for (let i = 0; i + 3 < b.length; i += 1) {
                if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) { seen.add((b[i + 3] >> 1) & 0x3f); i += 2; }
            }
            return HEVC_PS_NAL_TYPES.every((t) => seen.has(t));
        } catch (e) { return null; }
    };
    // -=-=-= hevcCopyPlan  [clean_and_remux, video_clean] =-=-=-
    // The one fourcc plan for an HEVC stream COPIED into another file: clean_and_remux's remux and video_clean's shrink restore both apply it, so neither
    // re-triggers the other. `tag` is the fourcc the copy carries - the source's own from the mp4 demuxer, '' from any other (ffprobe reports Matroska's as
    // [0][0][0][0]). Returns { state: ok|retag|rebuild|stuck, want, have, keep, ps, args }, args on output video ordinal `ord`.
    const hevcCopyPlan = (s, tag, ord, ffmpegPath, filePath, container) => {
        const have = String(tag || '').toLowerCase().trim();
        // Matroska stores no fourcc but checks the one a copy carries: it refuses dvh1 (exit 183), and keeps a compat-0 record only under a Dolby Vision tag
        // (hev1 and hvc1 drop it). dvhe passes both, measured on P5 and P8.1 mp4s. A record above profile 10 (P20), which Matroska stores under no tag, or one
        // no copy keeps (dvRecordSurvivesCopy) takes no tag: a dvh1 is left for the muxer to refuse, so the file keeps its Dolby Vision, and a hev1/hvc1 goes
        // in as it comes, its record lost under any tag. Any other container takes the copy as it comes.
        if (!isQtVideoContainer(container)) {
            const dvhe = isMatroskaFamily(container) && !(Number(doviRecord(s)?.dv_profile) > 10) && dvRecordSurvivesCopy(s)
                && (have === 'dvh1' || (['hev1', 'hvc1'].includes(have) && dvNeedsDvFourcc(s)));
            return { state: dvhe ? 'retag' : 'ok', want: 'dvhe', have, args: dvhe ? ` -tag:v:${ord} dvhe` : '' };
        }
        // Apple's AVFoundation decodes HEVC only as hvc1 or dvh1 over an hvcC holding the parameter sets (hev1 and dvhe failed on every sample, a complete
        // hvcC included). The fourcc is dvh1 for dvNeedsDvFourcc, else hvc1, and a dvh1 stream with a complete hvcC keeps it: Apple decodes dvh1 with or
        // without its box, and video_clean's encode writes it. .mov always takes hvc1: its muxer refuses dvh1 (exit 183) and writes no Dolby Vision box under
        // any fourcc, and a dvh1 copied in untagged comes out hev1.
        const want = container !== 'mov' && dvNeedsDvFourcc(s) ? 'dvh1' : 'hvc1';
        const tagOk = have === want || (have === 'dvh1' && container !== 'mov');
        // With no size, a stream already under an accepted tag counts as complete - hvc1 over an hvcC without parameter sets cannot be read at all - and any
        // other is read first: a rebuild of a complete hvcC only adds them to its keyframes, and the next pass finds the tag and stops.
        const size = Number(s?.extradata_size);
        if (size > HVCC_HEADER_BYTES || (!(size > 0) && tagOk)) {
            return { state: tagOk ? 'ok' : 'retag', want, have, args: tagOk ? '' : ` -tag:v:${ord} ${want}` };
        }
        // The filter empties a 23-byte hvcC, so the muxer builds a complete one from the first keyframe and every packet comes out byte-identical. The tag
        // alone exits 0 but writes an EMPTY hvcC - movenc demands every parameter-set array under hvc1 and ignores its own failure - so nothing can open it.
        const ps = firstKeyParamSets(ffmpegPath, filePath, s.index);
        if (ps === true) return { state: 'rebuild', want, have, ps, args: ` -bsf:v:${ord} hevc_mp4toannexb -tag:v:${ord} ${want}` };
        // Stuck: no -c copy gives it an hvcC Apple decodes (or the read failed, and a later pass reads again), so it keeps a fourcc that stays readable - its
        // own, or dvhe for a compat-0 stream arriving without a Dolby Vision fourcc, the one that keeps its box.
        const dvhe = want === 'dvh1' && !DV_FOURCC_RE.test(have);
        return { state: 'stuck', want, have, ps, keep: dvhe ? 'dvhe' : have || 'hev1', args: dvhe ? ` -tag:v:${ord} dvhe` : '' };
    };
    // ===== END SHARED: hevc copy fourcc =====

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

    // #region SHARED helpers (1 section: ffmpeg path)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg path =====
    // -=-=-= ffmpegPathOf [all five] =-=-=-
    // The node's ffmpeg: Tdarr hands a classic plugin otherArguments.ffmpegPath, and the bare name - a PATH lookup - stands in when it supplied none. Every
    // ffmpeg spawn in the five plugins resolves the binary here, so a change to how it is found reaches all of them at once.
    const ffmpegPathOf = (otherArgs) => String(otherArgs?.ffmpegPath || 'ffmpeg');
    // ===== END SHARED: ffmpeg path =====
    // #endregion

    // Missing/partial probe data fails the file with a clear reason, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');
    const streams = file.ffProbeData.streams;   // a real array from here on - the guard above fails the file otherwise

    // Input validation - every type:'string' input is checked; the free-text ones (language_fill, language_sub) against the language recogniser
    // (knownLangToken below), since a typo silently changes which streams survive. type:'boolean' inputs are coerced by loadDefaultValues, so a guard on
    // them would be dead code. container goes first, because response.container and every container test below derive from it.
    const srcContainer = String(file.container || '').toLowerCase().trim();
    // let, not const: method_unmuxable=mkv_fallback rewrites this (and response.container) for THIS file when the target container cannot store one of its
    // codecs. The rewrite happens before any consumer runs - see the muxability gate at the top of the per-file work below.
    let dstContainer = ddValue(inputs.container, 'mkv');
    // Membership guard, like the sibling dropdown guards below: all container-specific logic branches on the literals mkv/mp4, so an out-of-set value (only
    // reachable via a hand-edited/imported config) would silently fall through to a generic remux into an unsupported container - a runtime ffmpeg muxer
    // error instead of a clean quarantine.
    if(!['mkv', 'mp4'].includes(dstContainer))
        failFile(`[container=${logSafe(dstContainer)}] invalid value, check your settings`);
    response.container = `.${dstContainer}`;

    // Recovery modes: two symptom dropdowns, each disabled/light/aggressive. light = no-data-loss flags only; aggressive adds the side-effect ones.
    // Values outside the dropdown are rejected below (failFile) rather than silently no-op'd.
    const recoverTs = ddValue(inputs.recover_bad_timestamps, 'disabled');
    const recoverData = ddValue(inputs.recover_bad_data, 'disabled');
    const tsOn = recoverTs === 'light' || recoverTs === 'aggressive';
    const tsAgg = recoverTs === 'aggressive';
    const dataOn = recoverData === 'light' || recoverData === 'aggressive';
    const dataAgg = recoverData === 'aggressive';
    const tagDisposition = ddValue(inputs.tag_disposition, 'disabled');
    const tagTitle = ddValue(inputs.tag_title, 'disabled');
    // Does a tag_disposition / tag_title mode (disabled|audio|subtitle|both) cover this stream type?
    const appliesToType = (mode, type) => mode === 'both' || mode === type;
    const removeComments = String(inputs.remove_comments) === 'true';
    const removeBusytitle = String(inputs.remove_busytitle) === 'true';
    const removeImageSubs = ddValue(inputs.remove_imagesubs, 'unsupported');
    const methodUnmuxable = ddValue(inputs.method_unmuxable, 'error');

    const fillLanguage = (inputs.language_fill ? inputs.language_fill.toLowerCase().trim() : '');
    const subLanguages = splitList(inputs.language_sub).map(lang => lang.toLowerCase());
    // Pre-normalise the user language list to comparison keys once (langMatchKey folds en/eng/english/en-US, 639-2/B vs /T and nb/nn -> no) - the filter
    // matches against these.
    const subLangKeys = subLanguages.map(langMatchKey);
    const fillMode = ddValue(inputs.language_fill_mode, 'single-or-error');
    const removeSubSdh = ddValue(inputs.remove_sub_sdh, 'disabled');
    const tagLanguage = ddValue(inputs.tag_language, 'invalid');
    const methodTagLanguage = ddValue(inputs.method_tag_language, 'container');
    const guardAudioLanguage = ddValue(inputs.guard_audio_language, 'disabled');

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

    // #region SHARED helpers (1 section: special language code)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: special language code =====
    // -=-=-= isNonLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The special / non-language ISO 639-2 codes plus the qaa-qtz private-use range: und (undetermined), mul (multiple), zxx (no linguistic content),
    // mis (uncoded). One predicate so every consumer agrees on the set - knownLangToken ACCEPTS these in the free-text language lists, and clean_and_remux
    // accepts them in language_sub, refuses them in language_fill, and passes them unrewritten through tag canonicalisation. Drift the set in one spelling
    // and one settings string would mean different things at different pipeline stages.
    const isNonLang = (k) => k === 'und' || k === 'mul' || k === 'zxx' || k === 'mis' || /^q[a-t][a-z]$/.test(k);
    // ===== END SHARED: special language code =====
    // #endregion
    // A recognised language token, given its already-folded langKey: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to a base
    // code) or one of the isNonLang special/private codes. Both free-text language inputs are checked through this, so an unrecognised token (typo/garbage)
    // fails the file rather than silently changing which streams survive.
    const knownLangToken = (key) => isNonLang(key) || !!langName(key);
    // #region SHARED helpers (1 section: language token failure)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language token failure =====
    // -=-=-= failLangToken  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The failFile message echoes the offending token capped at 200 chars, with control characters collapsed to a space: free text is unbounded and Tdarr
    // persists the whole error message, and a raw newline in the echo would split the line into a continuation carrying no ☐/☑/☒ status symbol.
    const failLangToken = (name, token) => failFile(`[${name}=${logSafe(token)}] not a recognised language`
        + ' - use an ISO-639 code (en/eng/fre), an English name (English), a BCP-47 tag (pt-BR), or a special code (und/mul/zxx/mis/qaa-qtz)');
    // -=-=-= checkLangLists  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The free-text language lists' counterpart of checkDropdowns: one loop over [input name, raw tokens] rows, failing on the first token this plugin's
    // knownLangToken does not recognise. Rows and tokens run in order, so the first failure is the first bad token of the first listed input.
    const checkLangLists = (checks) => {
        for (const [name, tokens] of checks) for (const tok of tokens) if (!knownLangToken(langKey(tok))) failLangToken(name, tok);
    };
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
    checkLangLists([['language_sub', subLanguages]]);
    // If fillLanguage is set it should be a subtitle that's kept. (There is no audio equivalent: audio_clean owns audio language, and it reads the tag
    // this plugin has already written rather than language_fill itself, so there is nothing here to cross-check against.)
    if(fillLanguage && subLanguages.length > 0 && !subLangKeys.includes(langMatchKey(fillLanguage)))
        failFile(`[language_fill=${logSafe(fillLanguage)}] not in language_sub - untagged subtitle streams would be removed;`
            + ' add it to language_sub or clear language_fill');
    // Every dropdown's accepted set, as ONE table driving the shared checkDropdowns loop. The shape matters beyond the line count:
    // CLAUDE.md's retired-option policy says a value the dropdown no longer offers must STOP the file, and input_surface_diff.js has
    // to locate each dropdown's validator to report an accepted-but-not-offered value. A uniform table is an anchor it can find; a
    // run of differently-shaped `if` statements is not, and one of them going stale is invisible. Non-dropdown checks stay where
    // they are. `container` is NOT here: it is checked far earlier, because response.container is derived from it before this point.
    const dropdownChecks = [
        ['language_fill_mode',   fillMode,           ['single-or-error', 'force-any']],
        ['tag_disposition',      tagDisposition,     ['disabled', 'audio', 'subtitle', 'both']],
        ['tag_language',         tagLanguage,        ['invalid', 'strict', 'disabled']],
        ['tag_title',            tagTitle,           ['disabled', 'audio', 'subtitle', 'both']],
        ['remove_imagesubs',     removeImageSubs,    ['unsupported', 'all', 'export']],
        ['remove_sub_sdh',       removeSubSdh,       ['disabled', 'if_plain_survives', 'all']],
        ['method_tag_language',  methodTagLanguage,  ['container', '639-2/t', '639-2/b', 'bcp47']],
        ['method_unmuxable',     methodUnmuxable,    ['error', 'drop', 'mkv_fallback']],
        ['guard_audio_language', guardAudioLanguage, ['disabled', 'enabled']],
        ['recover_bad_data',     recoverData,        ['disabled', 'light', 'aggressive']],
        ['recover_bad_timestamps', recoverTs,        ['disabled', 'light', 'aggressive']],
    ];
    checkDropdowns(dropdownChecks);

    // This benign skip (processFile:false) sits BETWEEN config validation (above) and the per-file CONTENT checks (below), and both edges are load-bearing:
    // a bad setting must still fail loudly on a non-video file, while the language_fill_mode / guard_audio_language pre-checks can failFile (quarantine),
    // and a non-video file the plugin only means to skip must never be routed to the error queue.
    if (file.fileMedium !== 'video') return skip('☑File is not a video\n');

    // #region SHARED helpers (1 section: iso639-1 to iso639-2 map)
    // ===== SHARED [audio_clean, clean_and_remux, sub_worker]: iso639-1 to iso639-2 map =====
    // -=-=-= ISO639_1_TO_2  [audio_clean, clean_and_remux, sub_worker] =-=-=-
    // ISO 639-1 (2-letter) -> ISO 639-2/T (terminologic 3-letter), complete for every current 639-1 code; each row verified to name the same language via ICU.
    // Both writers map to /T for an mp4 target (its mdhd stores only a 3-letter code): clean_and_remux via toCanonicalTag/method_tag_language, sub_worker via
    // to6392T on subtitle import.
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
    // ====== LANGUAGE TAG CANONICALIZATION ======
    // Write-side helpers: this is the only plugin that WRITES container language tags via tag_language/language_fill; langKey/langListMatch
    // (matching) are shared, the ISO639_2_B/toCanonicalTag write-side logic below is clean_and_remux-only. Verified on this build: mp4's
    // mdhd stores only a lowercase 3-letter ISO 639-2 code (2-letter / uppercase / region are silently dropped, so a plain mkv->mp4 remux
    // of an "en"-tagged stream loses its language), mkv stores any code verbatim in its ISO 639-2 Language element (see toCanonicalTag); und/mul/zxx/mis
    // are never rewritten.
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
        // mp4 can store only a 3-letter code, so both container-aware modes write 639-2/T there. On mkv, container writes 639-2/B - what Matroska's
        // Language element is specified to hold, and what mkvmerge writes - while bcp47 writes the BCP-47 form, keeping a region/script subtag (pt-BR).
        // ffmpeg writes either into that same ISO 639-2 element and never the LanguageBCP47 one: ffprobe and MediaInfo read pt-BR back, mkvmerge reads
        // it as por and a bare en as eng (measured 2026-11-09 on jellyfin 7.1.4 and mkvmerge 103.0). The other modes write one 3-letter form anywhere.
        if (methodTagLanguage === 'bcp47')     return dstContainer === 'mp4' ? threeLetter(false) : (canonicalRegionTag(x) || key);
        if (methodTagLanguage === 'container') return threeLetter(dstContainer !== 'mp4');
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
        // mp4 needs lowercase 3-letter. mkv keeps a bare 2/3-letter code: every reader takes a 2-letter one (mkvmerge reads en as eng), so only strict
        // rewrites it into the container form.
        return dstContainer === 'mp4' ? /^[a-z]{3}$/.test(s) : /^[a-z]{2,3}$/.test(s);
    };
    // A blank/und stream adopts language_fill when filling is allowed for that stream. fillLanguage is validated above to be a real language, so there is no
    // non-language case left to exclude here. Single predicate so the language the remove_sub_sdh pre-check filters on (resolveWorkLang) and the tag
    // canonicalLangMeta writes derive from the SAME rule.
    const fillApplies = (streamLang, allowFill) => allowFill && fillLanguage && (!streamLang || streamLang === 'und');
    // A stream's effective language: its own, or language_fill where fillApplies - the language every filter and guard below reads.
    const resolveWorkLang = (s) => { const streamLang = resolveLang(s); return fillApplies(streamLang, true) ? fillLanguage : (streamLang || 'und'); };
    // Language tag to WRITE for a kept video/audio/subtitle stream. Blank container tag + language_fill (audio/subtitle only): fill it, always in a canonical
    // form (see the fill branch below). Non-blank: canonicalise per tag_language (invalid = only tags storesCleanly rejects; strict = every tag), which
    // includes PROMOTING a language only mediaInfo reports into a real tag. und/non-language is never written. Returns { workLang, meta, log }.
    const canonicalLangMeta = (typeLetter, idx, ffstream, typeWord, allowFill) => {
        const rawTag = (ffstream.tags?.language || '').trim();
        const streamLang = resolveLang(ffstream);
        const blank = !streamLang || streamLang === 'und';
        const filled = fillApplies(streamLang, allowFill);
        const workLang = filled ? fillLanguage : (streamLang || 'und');
        // MKVToolNix stores a region beside its legacy code (Language por, LanguageBCP47 pt-BR): ffprobe reads por, mediaInfo pt-BR, and ffmpeg never
        // writes the BCP-47 element, so any later remux drops the region. Under bcp47 on mkv that region is the tag to write, when its language is the
        // ffprobe tag's and that tag carries no region of its own.
        const miRegion = methodTagLanguage === 'bcp47' && dstContainer !== 'mp4' && rawTag && !canonicalRegionTag(rawTag)
            ? canonicalRegionTag(mediaInfoText(mediaInfoFor(ffstream)?.Language)) : '';
        const keptRegion = miRegion && langKey(miRegion) === langKey(rawTag) ? miRegion : '';
        let desired = '';
        if (filled) {
            // A fill is a WRITE of a NEW tag, never a preserved user tag, so it is ALWAYS canonicalised - tag_language=disabled means "don't rewrite EXISTING
            // tags", not "write an unrecognised string into a blank one" (language_fill accepts a spelled-out "English", which Matroska's Language element
            // cannot store as a code). Under disabled, mkv keeps a valid region/script subtag (pt-BR); every other mode, and mp4, writes the method's form.
            desired = (tagLanguage !== 'disabled' || dstContainer === 'mp4')
                ? toCanonicalTag(fillLanguage)
                : (canonicalRegionTag(fillLanguage) || toCanonicalTag(fillLanguage));
        } else if (!blank && tagLanguage !== 'disabled' && keptRegion) {
            desired = keptRegion;
        } else if (!blank && tagLanguage !== 'disabled'
            && ((tagLanguage === 'strict' && (rawTag || langName(streamLang))) || (!rawTag && langName(streamLang)) || !storesCleanly(rawTag))) {
            // strict enforces the method form (folds region under container/639-2); invalid only repairs syntax, so a recognised region/script
            // tag keeps its region (canonicalised: en_us -> en-US, pt-br -> pt-BR) on mkv. mp4 can't store a region, so it still folds to 639-2/T
            // via toCanonicalTag. The !rawTag arm is the both-probe promotion: a language resolved with NO ffprobe tag behind it lives only where
            // mediaInfo can see it (an mkv carrying LanguageIETF beside an explicit und), and ffmpeg demuxes the same dict ffprobe printed - so
            // with no write the remux drops the very language this run used to decide keep/drop, and the summary promises one the file will not
            // carry. langName(streamLang) is mandatory, not defensive, on both arms that can write a language only mediaInfo reports (strict's
            // and the promotion): toCanonicalTag hands an unrecognised key back unchanged, and a mediaInfo Language that is no language at all
            // must never reach the container. tag_language=disabled still means "never change an existing tag", so it declines the promotion too.
            const repairRegion = tagLanguage === 'invalid' && dstContainer !== 'mp4' ? canonicalRegionTag(streamLang) : '';
            desired = repairRegion || toCanonicalTag(streamLang);
        }
        const compareTo = blank ? '' : rawTag;
        if (!desired || desired === compareTo) return { workLang, meta: '', log: '' };
        // Both echoed tags go through logSafe: the raw one is unbounded container metadata, and an UNRECOGNISED tag passes through the canonicaliser
        // unchanged, so `desired` inherits whatever the file supplied. escMeta already makes the -metadata value below safe; this is the log's own guard.
        const st = streamTag(ffstream.index);
        const log = blank
            ? `☐${st}[language_fill=${logSafe(fillLanguage)}] Language blank on ${typeWord} stream - setting to "${logSafe(desired)}"\n`
            : (rawTag
                ? `☐${st}[tag_language=${tagLanguage}] Standardise ${typeWord} language - "${logSafe(rawTag)}" to "${logSafe(desired)}"\n`
                : `☐${st}[tag_language=${tagLanguage}] Set language (${typeWord}) from mediaInfo "${logSafe(streamLang)}" to "${logSafe(desired)}"`
                    + ' (no ffprobe language tag)\n');
        return { workLang, meta: ` -metadata:s:${typeLetter}:${idx} "language=${escMeta(desired)}"`, log };
    };
    // ====== END LANGUAGE TAG CANONICALIZATION ======

    // ====== AUDIO / VIDEO CODEC x CONTAINER MUXABILITY ======
    // Which audio/video codecs the destination MUXER refuses on a -c copy. Every row was muxed for real into both containers; the 78-row matrix came out
    // IDENTICAL on Mac/Linux/Windows jellyfin-ffmpeg 7.1.4 (a muxer's codec-tag table is compiled-in, not a build option), so a static table is correct
    // and no runtime probe is needed - and a row measured later on one platform generalizes for that same reason. A codec this build cannot ENCODE is still
    // measurable: retag an encodable sibling (patch the AVI FOURCC, the WAV wFormatTag, the RealMedia or QuickTime FOURCC, or the Matroska CodecID), since -c
    // copy never decodes and the muxer's refusal names the codec, which is also what proves the retag took. rawvideo is refused whatever its pixel format
    // (yuv420p measured), so it is listed here although matroska takes its YUV formats (see MKV_UNMUXABLE). Tested and PASSED into mp4, so deliberately absent:
    // vc1, wmv3's successor and the one WMV-family codec mp4 can tag. Keyed on the RAW ffprobe codec_name, NEVER resolveCodecName: that helper folds
    // aac_latm->aac and pcm_*->pcm, and since plain aac and pcm_s16le mux into mp4 fine, a resolved key would miss the exact rows this table exists for -
    // aac_latm above all, the codec every DVB/broadcast capture carries. Only PROVEN failures are listed, which is what makes it fail-safe: an unlisted codec
    // reaches ffmpeg and fails there exactly as it does today - incompleteness costs a missed diagnosis, never a wrongly-refused file.
    const MP4_UNMUXABLE = [
        // audio - "Could not find tag for codec X in stream #N, codec not currently supported in container"
        'aac_latm', 'adpcm_ima_wav', 'adpcm_ms', 'adpcm_yamaha', 'mlp', 'pcm_alaw', 'pcm_mulaw', 'pcm_u8',
        'wmalossless', 'wmapro', 'wmav1', 'wmav2', 'wmavoice', 'adpcm_g722', 'adpcm_g726', 'amr_nb', 'amr_wb', 'g723_1', 'pcm_s64le', 'ra_144', 'tta',
        'wavpack',
        // video - same error
        'cinepak', 'dnxhd', 'dvvideo', 'ffv1', 'ffvhuff', 'flv1', 'h263', 'huffyuv', 'magicyuv', 'msmpeg4v2', 'msmpeg4v3',
        'prores', 'qtrle', 'rv40', 'svq1', 'theora', 'utvideo', 'v210', 'vp8', 'wmv1', 'wmv2', 'wmv3',
        'amv', 'asv1', 'asv2', 'avrp', 'cfhd', 'cljr', 'flashsv', 'h261', 'msvideo1', 'r210', 'rawvideo', 'rpza', 'smc', 'snow', 'speedhq', 'v308', 'zmbv',
        // Flash ADPCM: mp4 has no tag for it, but matroska does carry it (its sibling adpcm_ima_qt does not) - so mkv_fallback CAN rescue this one.
        'adpcm_swf',
    ];
    // Refused by BOTH muxers, so mkv_fallback cannot rescue these - there is nothing to fall back TO; the gate degrades them to error/drop and says so. The
    // wording differs by family: matroska answers "No wav codec tag found for codec X" for the audio rows and "The Matroska muxer does not yet support muxing
    // X" for RealVideo 1-3 and the RealAudio codecs bar 14.4 (cook, ra_288, sipr, atrac3 measured by retagging a 14.4 track's CodecID). (s302m occurs naturally
    // only in MPEG-TS and the Real codecs in RealMedia, which is how a file can be carrying a codec neither of our two output containers accepts. Blu-ray and
    // DVD LPCM are converted instead, see PCM_LOSSLESS_REMAP. rv40 is deliberately NOT here: it is the one RealVideo generation matroska implements, so it sits
    // in the mp4-only list above, where mkv_fallback genuinely rescues it.)
    const UNMUXABLE_ANYWHERE = ['ac4', 'adpcm_ima_qt', 'atrac3', 'cook', 'nellymoser', 'ra_288', 'rv10', 'rv20', 'rv30', 's302m', 'sipr'];
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
    // PCM a target refuses only for its byte order, sample size or disc framing, and the PCM codec it is converted to instead, losing nothing: the decoded
    // samples came out md5-identical (jellyfin 7.1.4) for Blu-ray LPCM 5.1 at 16 and 24 bits and DVD LPCM at 16 and 24 bits, into mkv and mp4 alike, and for
    // QuickTime 8-bit 'twos' and the big-endian floats into mkv. Neither container stores Blu-ray/DVD LPCM or 8-bit PCM; mp4 stores the big-endian floats
    // as they are, so those are converted only into mkv. A 16-bit target is taken only where the probe says 16 bits or fewer (sample_fmt s16, or u8 for
    // 8-bit); anything deeper, or unread, is written 24-bit, which holds the 20- and 24-bit disc formats exactly. Every target still reads as pcm
    // (resolveCodecName), so audio_clean's guard_lossless keeps protecting it, and the next pass copies it. s302m is NOT converted: it can carry Dolby E,
    // which a PCM decode would garble.
    const PCM_LOSSLESS_REMAP = { pcm_bluray: 'pcm_s16le', pcm_dvd: 'pcm_s16le', pcm_s8: 'pcm_s16le', pcm_f32be: 'pcm_f32le', pcm_f64be: 'pcm_f64le' };
    // The codec stream s is converted to for the current destination, or '' when it is copied as it is.
    const pcmLosslessTarget = (s) => {
        const codec = codecNameOf(s);
        if (!Object.prototype.hasOwnProperty.call(PCM_LOSSLESS_REMAP, codec) || (dstContainer === 'mp4' && codec.startsWith('pcm_f'))) return '';
        return PCM_LOSSLESS_REMAP[codec] === 'pcm_s16le' && !/^(s16|u8)p?$/.test(String(s.sample_fmt || '')) ? 'pcm_s24le' : PCM_LOSSLESS_REMAP[codec];
    };
    // Which of the three the codec falls into for the CURRENT destination, or '' when it muxes fine. Read once per stream by the gate below.
    const unmuxableClass = (codec) => {
        if (UNMUXABLE_ANYWHERE.includes(codec)) return 'anywhere';
        if (dstContainer !== 'mp4') return MKV_UNMUXABLE.includes(codec) ? 'mkv' : '';
        if (MP4_STRICT_GATED.includes(codec)) return isMp4Family(srcContainer) ? '' : 'mp4';   // already-mp4 TrueHD is preserved with -strict, see above
        return MP4_UNMUXABLE.includes(codec) ? 'mp4' : '';
    };
    // ====== END AUDIO / VIDEO CODEC x CONTAINER MUXABILITY ======

    // Codec names dropped as data streams even when codec_type is not 'data': ffmpeg's generic 'data', and bin_data, where ARIB captions land (no
    // libaribb24 in the build). tmcd guards a probe that names a QuickTime/mp4 timecode track by its tag: ffprobe 7.1.4 reports one as codec_name 'unknown'
    // with codec_type 'data', so the type test removes it and this entry never matches on the production probe.
    const DATA_CODECS = ['data', 'bin_data', 'tmcd'];

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

    // #region SHARED helpers (1 section: decodable text subtitle vocabulary)
    // ===== SHARED [clean_and_remux, sub_worker]: decodable text subtitle vocabulary =====
    // -=-=-= LEGACY_TEXT_SUBS / CC_STREAM_SUBS / CC_STREAM_ENCODER  [clean_and_remux, sub_worker] =-=-=-
    // The decodable-to-text subtitle formats no container we target can store: clean_and_remux CONVERTS them on a remux (a bare -c copy would fail it)
    // and sub_worker EXTRACTS them, the only way they leave the file on a standalone run. Shared so the two cannot drift - a codec only one side knew
    // would convert on remux yet be invisible to a standalone extract. Every one has a decoder on the production build. LEGACY_TEXT_SUBS: PC/fansub
    // text codecs with no Matroska CodecID and no native mp4 support - they become srt (mkv, sidecar) or mov_text (mp4). CC_STREAM_SUBS: eia_608 as a
    // real SUBTITLE STREAM - rare but real (a QuickTime 608 capture in the corpus), NOT the bitstream-embedded closed captions (sub_worker's
    // embedded_cc). It takes CC_STREAM_ENCODER rather than srt: cc_dec emits ASS internally and the srt encoder passes unknown override tags THROUGH -
    // measured, 17 `{\an7}`-style tokens on positioned content against 0 for `text`, plus a <font> wrapper - which Plex renders as literal on-screen
    // words. `text` lands as subrip in matroska, so the choice costs nothing but the overrides; mov_text strips them too, so mp4 needs no case.
    const LEGACY_TEXT_SUBS = ['microdvd', 'mpl2', 'jacosub', 'sami', 'realtext', 'subviewer', 'subviewer1', 'vplayer', 'pjs', 'stl'];
    const CC_STREAM_SUBS = ['eia_608'];
    const CC_STREAM_ENCODER = 'text';
    // ===== END SHARED: decodable text subtitle vocabulary =====
    // #endregion

    const subFormatDropped = (codec) => alwaysDropSubs.includes(codec)
        || (dstContainer === 'mkv' && mkvOnlyDropSubs.includes(codec))
        || (dstContainer === 'mp4' && mp4OnlyDropSubs.includes(codec));

    // Image-based subtitles: mkv muxes PGS/VobSub/DVB natively and mp4 carries VobSub alone (as mp4s), so remove_imagesubs governs all three, while
    // mp4OnlyDropSubs additionally drops PGS and DVB on mp4. xsub is image-based too and stays in alwaysDropSubs because it muxes into NO container -
    // but it is still EXPORTABLE: AVI is its native home and a -c:s copy into one preserves the codec and every packet (verified). Being in both lists
    // is the point - the export is the user's choice, the drop is not. IMAGE_SUB maps each image codec to its sidecar container: PGS -> raw .sup,
    // VobSub/DVB -> a single-stream Matroska .mks (no vobsub muxer exists), xsub -> .avi, all via -c:s copy. What decides the mapping is whether the
    // RAW stream is SELF-DESCRIBING: PGS segments carry PTS and xsub packets carry inline [HH:MM:SS.mmm-...] ranges, so a raw or native container
    // round-trips; VobSub/DVB timing lives outside the stream (in the .idx), so those need a real container. The .mks output needs an explicit -f
    // matroska - ffmpeg only auto-detects matroska from a .mkv extension, not .mks (verified); .sup and .avi both auto-detect from the extension.
    const IMAGE_SUB = {
        hdmv_pgs_subtitle: { ext: 'sup', fmt: 'sup'      },   // raw PGS segments; they carry their own PTS, so no container is needed
        dvd_subtitle:      { ext: 'mks', fmt: 'matroska' },   // VobSub timing lives in a separate .idx, so the stream needs a real container
        dvb_subtitle:      { ext: 'mks', fmt: 'matroska' },
        xsub:              { ext: 'avi', fmt: 'avi'      },   // AVI is the only container that holds xsub; packets carry inline timestamp ranges
    };
    const isImageSub = (codec) => Object.prototype.hasOwnProperty.call(IMAGE_SUB, codec);
    // 'all'/'export' drop every image sub; 'unsupported' relies on subFormatDropped (container-forced) alone. imageSubDropped is the remove_imagesubs-specific
    // drop beyond subFormatDropped, read by subDroppedRegardlessOfLanguage for the language_fill tally and the accessibility plain-track guard.
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
    // A styled subtitle cannot go into mp4 without being flattened into mov_text, which turns its override tags into literal on-screen text (measured: 99.6% of
    // lines in a real anime ASS carry one). So on an mp4 target it is EXPORTED as a Matroska bundle carrying the subtitle plus the container's font attachments
    // - the fonts exist nowhere else - and dropped from the video, rather than converted into garbage. mkv carries ass natively and never reaches this.
    const styledSubExported = (codec) => dstContainer === 'mp4' && isStyledSub(codec);
    // Matroska is the only container that can hold a subtitle and its fonts together (mp4 carries no attachments at all), and .mks is its subtitle-only
    // extension, so a media server that does not skip dotfiles still does not read the bundle as a video. Its 'styled' mark: see sidecarBasename.
    // #region SHARED helpers (1 section: styled bundle vocabulary)
    // ===== SHARED [clean_and_remux, sub_worker]: styled bundle vocabulary =====
    // -=-=-= STYLED_BUNDLE  [clean_and_remux, sub_worker] =-=-=-
    // The styled-subtitle .mks bundle vocabulary, one definition for the two-plugin round trip: ext (extension), mark (the fixed name token before the
    // extension), fmt (the ffmpeg muxer format). clean_and_remux EXPORTS the bundle - its mp4 styled export deletes the source stream on the promise the .mks
    // is a complete record - and sub_worker RECOGNISES and RE-IMPORTS it (parseSidecar returns null, a silent skip, on a mark/ext mismatch). Shared because a
    // one-sided drift would strand the only copy of a styled subtitle on disk, unimportable and undiagnosed, and the shared-block check cannot see it while the
    // two sides spell the vocabulary in different shapes.
    const STYLED_BUNDLE = { ext: 'mks', fmt: 'matroska', mark: 'styled' };
    // ===== END SHARED: styled bundle vocabulary =====
    // #endregion

    // A subtitle removed regardless of language - by container/format (subFormatDropped), by remove_imagesubs (imageSubDropped), or by the mp4
    // styled-subtitle bundle export (styledSubExported), which maps the track out of the video WHEN THE EXPORT SUCCEEDS. Such a track is not assigned
    // language_fill and does not count as a survivor for the language_fill_mode untagged tally or the remove_sub_sdh plain-track guard: a track this run
    // deletes cannot be the plain track another falls back on. One exception on the styled path - a REFUSED export (unmapped node / name over the byte cap /
    // unsafe path) survives as a mov_text conversion and DOES receive language_fill (see the emitLangMeta call in the subtitle branch), so the tally
    // exclusion is slightly conservative there.
    const subDroppedRegardlessOfLanguage = (codec) => subFormatDropped(codec) || imageSubDropped(codec) || styledSubExported(codec);

    // #region SHARED helpers (2 sections: preset path safety … font attachment test)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: preset path safety =====
    // -=-=-= pathIsPresetSafe [all five] =-=-=-
    // True when a real on-disk path can be embedded in a preset's quoted "${path}" token. Tdarr never shells out, but its worker tokenises each preset half
    // with a quote-aware parser before spawning ffmpeg, so a " anywhere in the path closes the wrapper mid-token and everything after it becomes fresh argv
    // entries (a raw control character breaks the token just as badly). The literal <io> is refused for a second reason: it is the preset's own input/output
    // split marker, and Tdarr reads only the first two parts, so a path carrying one silently DELETES every argument after it. The name parts WE generate are
    // sanitised at their source, but a library or work-directory path has to stay literal - it can only be checked, never rewritten - so a caller that fails
    // this test refuses that one output (a sidecar, a cover's staged copy for -attach, or video_clean's restore from the library original) with a ☒ line rather
    // than emit the token.
    const pathIsPresetSafe = (p) => !/["\x00-\x1f\x7f]/.test(String(p)) && !/<io>/i.test(String(p));
    // ===== END SHARED: preset path safety =====

    // ===== SHARED [clean_and_remux, sub_worker]: font attachment test =====
    // -=-=-= isFontAttachment  [clean_and_remux, sub_worker] =-=-=-
    // True when an attachment stream is an embedded font. Identified three ways because older builds report codec_name 'none'/'unknown' for a font:
    // the ttf/otf codec name, a font mimetype, or a font filename extension. Read by clean_and_remux's attachmentKind (orphaned-font removal) and
    // sub_worker's styled-subtitle .mks bundle (the fonts that must travel with an extracted ASS/SSA so its styling survives the round-trip).
    const isFontAttachment = (s, parts) => {
        const { mime, ext } = parts || attachmentNameParts(s);
        return ['ttf', 'otf'].includes(codecNameOf(s)) || isFontMime(mime) || FONT_EXTS.includes(ext);
    };
    // ===== END SHARED: font attachment test =====
    // #endregion

    const path = require('path'); const fs = require('fs');   // fs: the sidecar placement section below (temp staging dir + sizes) and the export exists-check

    // #region SHARED helpers (3 sections: sidecar path derivation … subtitle cue span)
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
    const videoBase = path.basename(libFilePath).replace(/\.[^.]+$/, '').replace(/["\x00-\x1f\x7f]/g, '').replace(/<io>/gi, '(io)');
    const sidecarLangToken = (s) => (resolveLang(s) || 'und').replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'und';
    // videoBase is the one part NOTHING bounds - it is the user's own filename, legally ~250 bytes on ext4/APFS/NTFS, and the shortest suffix either plugin
    // appends is ~11 bytes. So each caller must measure the FINISHED name against this cap and refuse that one sidecar, exactly as it refuses an unsafe path.
    // The refusal has to be at the caller because the two differ in what they do next; trimming videoBase instead is NOT an option, since sub_worker's
    // parseSidecar anchors on it to read the name back and a trimmed one would extract, strip the track, and then be unrecognisable for reimport.
    const NAME_BYTE_CAP = 255;
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
    // Ceiling on the extraction's captured stderr. Exceeding it KILLS the child, so the run reports an extraction failure that never happened -
    // which is why it is named here beside the timeout rather than left as a bare literal at the spawn.
    const SIDECAR_SPAWN_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
    const SIDECAR_SPAWN_TIMEOUT_S = String(SIDECAR_SPAWN_TIMEOUT_MS / 1000);
    const CURL_FILESIZE_EXCEEDED = 63;   // curl's exit status when --max-filesize refuses a transfer
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
    // Is a non-empty sidecar already at this server path? Download is the only read the API offers, so the test IS a fetch - discarded to the null device, or
    // written to `saveTo` (a path in the caller's private staging directory) when the caller must judge the body - and measured with curl's own counters, never
    // buffered through spawnSync (a large body silently exceeds maxBuffer and fakes a failure). Three answers, not two, because a caller's next step on
    // 'absent' is an upload, and the upload endpoint REPLACES whatever is there - possibly a sidecar the user has OCR'd or edited. So 'absent' needs a
    // completed request the server answered definitively: its File-not-found (HTTP 400), or a 200 with no body, which holds nothing to lose. Everything else -
    // no URL, a spawn error, a non-zero curl exit (connection refused, the -m timeout, a dropped transfer), a 5xx, a 501 - is 'unknown': the sidecar may well
    // be there, so the caller leaves it alone this pass instead of writing over it. Returns { state: 'present' | 'absent' | 'unknown', why, empty }: `why` is
    // for the user's log line ('' unless 'unknown'); `empty` marks the 200 with no body - a file IS there, holding nothing, which no API route can delete (only
    // DB-indexed media and cache paths are deletable), so a caller that writes under another name would leave it beside the new one. `maxBytes`, when given,
    // has curl refuse a larger file before fetching any of it, answered 'over': a file there that is no sidecar of this stream, never fetched whole on every
    // pass (measured: an 80 MiB file at an earlier spelling was downloaded in full).
    const sidecarExistsRemote = (dest, saveTo = '', maxBytes = 0) => {
        const { spawnSync } = require('child_process');
        const url = serverApiUrl();
        if (!url) return { state: 'unknown', why: 'the node config carries no server URL' };
        const cap = maxBytes ? ['--max-filesize', String(maxBytes)] : [];
        const r = spawnSync('curl', ['-sS', '-m', SIDECAR_SPAWN_TIMEOUT_S, ...cap, '-o', saveTo || nullDevice, '-w', '%{http_code} %{size_download}',
            ...apiAuthArgs(), '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify({ filePath: dest }), `${url}/api/v2/file/download`],
            { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, input: apiAuthInput() });
        if (r.error) return { state: 'unknown', why: `the existence check failed (${r.error.code || r.error.message})` };
        if (maxBytes && r.status === CURL_FILESIZE_EXCEEDED) return { state: 'over', why: `it is over the ${maxBytes}-byte limit` };
        if (r.status !== 0) return { state: 'unknown', why: `the existence check did not complete (curl exit ${r.status === null ? 'signalled' : r.status})` };
        const [code, got] = String(r.stdout || '').trim().split(/\s+/);
        if (code === '200') return Number(got) > 0 ? { state: 'present', why: '' } : { state: 'absent', why: '', empty: true };
        if (code === '400') return { state: 'absent', why: '' };
        return { state: 'unknown', why: `the server answered HTTP ${code || 'nothing'}` };
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
        const ff = spawnSync(ffmpegPathOf(otherArguments), args,
            { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, maxBuffer: SIDECAR_SPAWN_MAX_OUTPUT_BYTES, killSignal: 'SIGKILL' });
        if (ff.error || ff.status !== 0) {
            const why = ff.error ? `extraction failed (${ff.error.code || ff.error.message})`
                : `extraction failed (ffmpeg exit ${ff.status}: ${logSafe(String(ff.stderr || '').trim())})`;
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
    // -=-=-= fileHasBytes  [clean_and_remux, sub_worker] =-=-=-
    // Is ANYTHING at a sidecar's name? The first of two questions both plugins ask before a destructive step - clean_and_remux drops an embedded subtitle
    // only because a sidecar is supposed to hold it, and sub_worker strips one for the same reason. Zero bytes counts as ABSENT: a killed export leaves
    // one (measured on 7.1.4 - a small srt is still fully buffered when the run dies), and trusting it strips the only copy. Any stat failure is absent
    // too, so a permission error re-extracts rather than silently dropping. Whether what IS there holds the whole subtitle is the second question, and
    // size cannot answer it (a byte-truncated raw .sup reads as valid - measured): see the subtitle cue span section. Shared so a refinement cannot land
    // on one plugin's copy and leave the other answering differently about the same file.
    const fileHasBytes = (p) => { try { return fs.statSync(p).size > 0; } catch (e) { return false; } };
    // -=-=-= isSymlinkAt  [clean_and_remux, sub_worker] =-=-=-
    // Is the entry at a sidecar's library name a symbolic link? Asked before either question above, because both plugins write a sidecar as an extra output
    // of Tdarr's ffmpeg run and ffmpeg opens an output THROUGH a link (no O_NOFOLLOW - verified on 7.1.4): one planted at the predictable name, pointing at
    // a file that does not exist, has the export create that file wherever the link points, as the Tdarr user, holding bytes the media supplier chose.
    // existsSync and stat follow the link, so a dangling one reads as absent - hence lstat. A link found here is refused, never followed or deleted: the
    // name is ours, so a link at it was planted. Only the pre-planted link is closed; one created between the plugin returning and ffmpeg's open() is not.
    const isSymlinkAt = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } };
    // ===== END SHARED: sidecar placement =====

    // ===== SHARED [clean_and_remux, sub_worker]: subtitle cue span =====
    // -=-=-= SIDECAR_HASH_MAX / CUE_SPAN_SLACK_S  [clean_and_remux, sub_worker] =-=-=-
    // The ceiling on subtitle text read whole into memory - a sidecar, an embedded track decoded to a temp file, a bundle's subtitle; why 64 MiB and why
    // each write-time -fs sits one byte above it is explained at sub_worker's embeddedTextHashes. CUE_SPAN_SLACK_S is how far short of the subtitle's
    // own end a copy's last cue may stop and still count as the whole of it: a complete export ends where the stream does, to the centisecond.
    const SIDECAR_HASH_MAX = 64 * 1024 * 1024;
    const CUE_SPAN_SLACK_S = 1;
    // -=-=-= hmsSeconds  [clean_and_remux, sub_worker] =-=-=-
    // A [H:]MM:SS[.,]fff stamp in seconds - a cue's timing (srt's decimal comma folded to a point) or a Matroska DURATION statistics tag, a missing one
    // reading 0. clean_and_remux reads a subtitle's DURATION with it too, so a bundle's last cue and the stream's own end are parsed by one rule.
    const hmsSeconds = (stamp) => String(stamp || '').trim().replace(',', '.').split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
    // -=-=-= cueSpan  [clean_and_remux, sub_worker] =-=-=-
    // How many cues decoded subtitle text holds and where the LAST one ends, in seconds: { cues, end }. Whether a sidecar already on disk is the whole
    // subtitle or only its start - a run that FAILS partway (an ffmpeg error, not a kill) still finalises every output, so its sidecar is well-formed and
    // simply stops early, which no size or parse test can see, while a user's edit keeps the timeline. srt/vtt cues are their '-->' timing lines; ass/ssa cues
    // their Dialogue lines, whose End is the third field in both formats. Untrusted text up to SIDECAR_HASH_MAX, so it is cut into lines first and each line
    // tested with an anchored or literal-led pattern - nothing here can backtrack across lines (sub_worker's hasNoCues says what an unanchored ^\s* costs).
    const cueSpan = (text, ext) => {
        const ass = ext === 'ass' || ext === 'ssa';
        let cues = 0; let end = 0;
        for (const line of String(text).split(/\r\n|[\n\r\u2028\u2029]/)) {
            const m = ass ? /^[^\S\r\n\u2028\u2029]*Dialogue\s*:[^,]*,[^,]*,([^,]*),/i.exec(line) : /-->[ \t]*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})/.exec(line);
            if (!m) continue;
            const t = hmsSeconds(m[1]);
            if (!Number.isFinite(t)) continue;
            cues += 1;
            if (t > end) end = t;
        }
        return { cues, end };
    };
    // -=-=-= readBundleSubtitle  [clean_and_remux, sub_worker] =-=-=-
    // The subtitle inside a styled .mks bundle, decoded to ASS by ffmpeg into a private temp dir, and how many font attachments ffmpeg's input listing
    // names ("Stream #0:1: Attachment: ttf", measured on 7.1.4). { state: 'ok', buf, fonts }, or { state: 'unreadable' } when ffmpeg RAN and could not
    // decode it - what an interrupted export leaves: killed mid-write it ends "File ended prematurely", and a run whose OTHER output failed at
    // write_header leaves a header with no cluster ("End of file"), both measured on 7.1.4 - or { state: 'unknown' } when it could not be judged (gone, or
    // not a regular file - ffmpeg blocks on a FIFO's -i until the timeout -, no temp dir, a spawn error or timeout, a read-out over the cap), where every
    // caller keeps the answer it had before it could look.
    const readBundleSubtitle = (p) => {
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'awk_subbundle_')); } catch (e) { return { state: 'unknown' }; }
        const out = path.join(dir, 'b.ass');
        let res = { state: 'unknown' };
        try {
            const { spawnSync } = require('child_process');
            const r = fs.statSync(p).isFile() ? spawnSync(ffmpegPathOf(otherArguments), ['-hide_banner', '-y', '-loglevel', 'info', '-i', p, '-map', '0:s:0',
                '-c:s', 'ass', '-fs', String(SIDECAR_HASH_MAX + 1), out],
            { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, maxBuffer: SIDECAR_SPAWN_MAX_OUTPUT_BYTES, killSignal: 'SIGKILL' }) : null;
            if (r && !r.error && r.status !== 0) res = { state: 'unreadable' };
            else if (r && !r.error && fs.statSync(out).size <= SIDECAR_HASH_MAX) {
                res = { state: 'ok', buf: fs.readFileSync(out),
                    fonts: String(r.stderr || '').split('\n').filter((l) => l.trimStart().startsWith('Stream #') && l.includes(': Attachment:')).length };
            }
        } catch (e) { /* not judged - the caller keeps its old answer */ }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return res;
    };
    // ===== END SHARED: subtitle cue span =====
    // #endregion

    // #region SHARED helpers (2 sections: title canonicalization … track title)
    // ===== SHARED [audio_clean, clean_and_remux]: title canonicalization =====
    // Canonical audio-title machinery, shared so audio_clean's downmix titles come out already in clean_and_remux's tag_title form (no wasted remux).
    // Canonical form: "<channel/downmix base> - <role tags>", roles LAST ("5.1 -> 2.0 - Commentary"). canonicalAudioTitle is the entry point.
    // -=-=-= channel-label vocab: channelTitleLabels / bareChannelRegex / downmixChannelRegex  [audio_clean, clean_and_remux] =-=-=-
    // The channel labels we recognise/replace for tag_title - 2.0 included so it can be overwritten with Stereo. Every label clean_and_remux's layoutLabel
    // can write is listed (the 7.0 / 6.0 / 4.1 / 8.0 and height layouts included), so a title it wrote stays OWNED: its role suffix is normalised and a
    // downmix base built on it is recognised, instead of being taken for a custom title on the next pass.
    const channelTitleLabels = ['22.2', '10.0.6', '9.1.4', '7.2.3', '7.1.4', '7.1.2', '5.1.4', '5.1.2', '4.0.4', '3.1.2', '8.0', '7.1', '7.0', '6.1', '6.0',
        '5.1', '5.0', '4.1', '4.0', '3.1', '3.0', '2.1', '2.0', 'stereo', 'mono'];
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
        // Strip the surrounding quotes by index, and only a genuine PAIR. An unmatched quote is part of the title, not packaging: 'Commentary by "The
        // Director"' would otherwise lose its last character AND have the interior " rewritten to ' by escMeta on the way out, so a file needing no other
        // work is remuxed purely to store damaged metadata. One-sided stripping is therefore refused in both directions, and a title that is ALL quotes has
        // no pair either, so it survives verbatim rather than collapsing to empty. Index walk rather than /^["']+|["']+$/, which is quadratic in an INTERIOR
        // quote run: the ^-anchored branch can only try offset 0, so once a word character leads, ["']+$ re-scans from every offset inside the run, consumes
        // it greedily and gives back a character at a time against a failing $ (60k quote characters measured 5.7 s of blocked worker). Same defect and the
        // same reasoning as the whitespace pre-collapse below - a title is unbounded container metadata, so neither may be left to backtrack.
        let title = (rawTitle || '').trim();
        let qa = 0; let qb = title.length;
        while (qa < qb && (title[qa] === '"' || title[qa] === "'")) qa += 1;
        while (qb > qa && (title[qb - 1] === '"' || title[qb - 1] === "'")) qb -= 1;
        if (qa > 0 && qb < title.length) title = title.slice(qa, qb);
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
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: track title =====
    // -=-=-= HDLR_TYPE_FOURCCS / GENERIC_HANDLER_RES / nameTextOf / isGenericHandler  [all five] =-=-=-
    // A track HANDLER holds a name or a writing tool's boilerplate, and only a name is a title. On mp4 it is the one place a track name survives an ffmpeg
    // remux, which reads handler_name back and writes it again but never reads back the udta/name box it writes a title into; HandBrake --aname and MP4Box
    // :name= write the name there too. A copy of the handler-type fourcc ('soun') is boilerplate, compared exactly, as MediaInfoLib does.
    const HDLR_TYPE_FOURCCS = new Set(['vide', 'soun', 'sbtl', 'text', 'subt', 'subp', 'clcp', 'tmcd', 'meta', 'hint', 'data', 'mdta', 'mdir', 'pict',
        'auxv', 'twen', 'odsm', 'sdsm', 'ocsm', 'alis', 'url', 'mpeg']);
    // Boilerplate measured on 80 local mp4-family files: ffmpeg's own (VideoHandler, SoundHandler, SubtitleHandler; its source adds DataHandler,
    // TimeCodeHandler, ClosedCaptionHandler, HintHandler, PictureHandler, 'GoPro MET'), Apple's, Bento4's and GPAC's '... Handler', AVFoundation's
    // 'Core Media *' and MP4Box's '<import>@GPAC<ver>'. From writers' source or published dumps, unsampled: Android's SoundHandle, VideoHandle and MetadHandle,
    // Google's 'ISO Media file produced by Google Inc.', QuickTime's localised component names, the GoPro camera ones; any other tool's '... Handler' matches
    // /handler$/. The writers' spaced spellings of that word have a pattern of their own as well, since a title box holding one names no track
    // (boxNamesNothing): 8 of the 17 handler names in 47 corpus files ('Apple Sound Media Handler', 'Video Media Handler', 'Bento4 Video Handler', 'sound
    // handler' and kin), and, from the writers' source, unsampled, older MP4Box's 'GPAC ISO Video Handler', L-SMASH's, Mainconcept's and Apple's text and
    // subtitle components. All but /@gpac/ are ANCHORED: a name may hold the word ('Dog Handler Commentary'), and one read as boilerplate is erased. A
    // real name that ENDS in the word ('Commentary by the Dog Handler') is read as boilerplate all the same - the price of the catch-all, no such name
    // seen - and loses only its text, a role it names still reaching a flag, a sidecar token or the lost-roles line. Exempting a name that gives a role
    // would pass 'Closed Caption Handler' too.
    const GENERIC_HANDLER_RES = [/handler$/i,
        /^(?:apple |bento4 |gpac iso |l-smash |mainconcept )?(?:sound|video|audio|text|subtitle|closed caption)(?: media)? handler$/i,
        /^(sound|video|metad)handle$/i, /^core media /i, /@gpac/i, /^iso ?media file produced by /i, /^(gestionnaire|gestor|procedura|module) d/i,
        /^gopro (avc|aac|tcd|met|sos|h\.?265|hevc)$/i];
    // nameTextOf: a name as written (a handler's or a title's) less control bytes, U+FFFD and whitespace at both ends. A QuickTime-style writer can leave its
    // Pascal length byte in front of an ISO name (ffmpeg strips it only from a QuickTime file, mov.c mov_read_hdlr); from 128 bytes up ffmpeg keeps a mov
    // name's length byte, which ffprobe prints as U+FFFD (movLengthBytes); and escMeta writes a control byte as a space, so a name with one at its edge came
    // back with a space there and was rewritten on the next pass (measured: '\x05Hello World', two passes). An index walk: a /[...]+$/ strip backtracks from
    // every offset in a long interior run of the class, quadratic in a name nothing caps.
    const NAME_EDGE = /[\s\x00-\x1f\x7f\ufffd]/;
    const nameTextOf = (t) => {
        const s = String(t || '');
        let a = 0; let b = s.length;
        while (a < b && NAME_EDGE.test(s[a])) a += 1;
        while (b > a && NAME_EDGE.test(s[b - 1])) b -= 1;
        return s.slice(a, b);
    };
    const isGenericHandler = (h) => {
        const t = nameTextOf(h);
        return !t || HDLR_TYPE_FOURCCS.has(t) || GENERIC_HANDLER_RES.some((re) => re.test(t));
    };
    // -=-=-= rolesNamed  [all five] =-=-=-
    // The roles a name's words give a track of `type` (the classifiers' keywords, dispositionTypes) - or, with no type, a track of any type.
    const rolesNamed = (text, type) => Object.keys(dispositionTypes).filter((k) => k !== 'default'
        && (type === undefined || dispositionTypes[k].streams.includes(type))
        && matchesKeyword(String(text || '').normalize('NFC').toLowerCase(), dispositionTypes[k].keywords));
    // -=-=-= readContainer / MOV_WORD_START / movLengthBytes / handlerTextOf  [all five] =-=-=-
    // The container this pass reads, whatever it writes: mov length bytes (movLengthBytes) and MediaInfoLib's handler reading (handlerReading) depend on it.
    const readContainer = String(file?.container || '').toLowerCase().trim();
    // Where a word starts (dropLast): a letter before a lowercase letter; a capital word (capitals and digits) or a lone lowercase letter that no letter or
    // digit follows; a digit; an opening bracket or quote before a letter or digit.
    const MOV_WORD_START = /^(?:[A-Za-z]\p{Ll}|[A-Z][A-Z0-9]*(?![\p{L}\p{N}])|[a-z](?![\p{L}\p{N}])|[0-9]|[(\[{"'][\p{L}\p{N}])/u;
    // movLengthBytes: how many leading characters of a stored handler are length bytes ffmpeg wrote - 0 unless this pass reads a .mov, since only the mov muxer
    // writes one (an mp4, m4v or m4a handler is a C string, a matroska HANDLER_NAME plain text). From 128 bytes up ffmpeg reads a mov handler back with its
    // Pascal length byte and writes a new one in front on every remux (MOV_HANDLER_MAX_BYTES), so a grown name starts with a run of them, each the count of the
    // bytes after it mod 256: from 0x80 ffprobe prints one as U+FFFD, and from 256 bytes the count wraps, so a byte below 0x80 is that character (measured:
    // ffprobe and mediaInfo both read a 301-byte name as '-Main ...' and its next remux as '.-Main ...'). Memoized: a pass reads each many times.
    const lengthBytesCache = new Map();
    const movLengthBytes = (h) => {
        const s = String(h || '');
        if (readContainer !== 'mov') return 0;
        if (lengthBytesCache.has(s)) return lengthBytesCache.get(s);
        const run = /^[\x00-\x7f\ufffd]*/.exec(s)[0];
        let after = Buffer.byteLength(s, 'utf8') - 2 * (run.split('\ufffd').length - 1);
        // The run: each leading U+FFFD with 128 bytes or more after it (with fewer it is a character of the name - a byte that is no UTF-8, or a U+FFFE, which
        // ffprobe prints so), and each character below 0x80 equal to the count with 256 bytes or more after it (counts): as the run's first character always;
        // later, at once when the next character counts too, since two in a row are a run ffmpeg wrote ('lkjiCommentary' is a 361-byte 'Commentary ...' written
        // once and remuxed three times, measured); else as the run's last only where dropLast drops it.
        const counts = (i, left) => left >= 256 && run.charCodeAt(i) === (left & 0xff);
        // dropLast judges a run's last character. The bytes cannot tell a length byte from a letter equal to the count ('HGerman' is 'H' + 'German' or 'H' +
        // 'G' + 'erman'), and a dropped real letter loses any role it spells ('DCommentary' read as 'ommentary' lost /commentary), where a kept stray character
        // is what the name held before. So it is dropped when the name read without it gives every role (rolesNamed) the name with it gives and more
        // ('3210Commentary' reads 'Commentary'), kept in the opposite case ('EDCommentary', 'Commentary ...' remuxed twice, keeps its 'C'), and otherwise
        // dropped only when it starts no word (MOV_WORD_START).
        const more = (a, b) => a.length > b.length && b.every((k) => a.includes(k));
        const dropLast = (i) => {
            const kept = rolesNamed(s.slice(i)); const dropped = rolesNamed(s.slice(i + 1));
            return more(dropped, kept) || (!more(kept, dropped) && !MOV_WORD_START.test(s.slice(i)));
        };
        // Two residuals: a real length byte that ends a run, starts a word and changes no role stays as a stray character ('IHfeature' reads 'Hfeature'); and a
        // name whose first character is one less than its length byte (by coincidence: about one name in 256, from its first write) is read with the run going
        // on through it and each next character one less than the one before, the last judged by dropLast ('gfeature film' reads 'eature film').
        let n = 0;
        for (const c of run) {
            after -= 1;
            if (c === '\ufffd' ? after < 128 : !(counts(n, after) && (!n || counts(n + 1, after - 1) || dropLast(n)))) break;
            n += 1;
        }
        lengthBytesCache.set(s, n);
        return n;
    };
    const handlerTextOf = (h) => nameTextOf(String(h || '').slice(movLengthBytes(h)));
    // -=-=-= MAC_ROMAN_HIGH / macRoman  [all five] =-=-=-
    // The upper half of MediaInfoLib's MacRoman table (MediaInfo_Config.cpp Ztring_MacRoman), for a QuickTime Pascal string: a mov name "Ü" reads "√ú".
    const MAC_ROMAN_HIGH = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»…\u00a0ÀÃÕŒœ\u2013\u2014“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ'
        + '\uf8ffÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
    const macRoman = (bytes) => Array.from(bytes, (x) => (x >= 0x80 ? MAC_ROMAN_HIGH[x - 0x80] : String.fromCharCode(x))).join('');
    // -=-=-= HANDLER_LEFT_OUT_MP4 / HANDLER_LEFT_OUT_MKV / partsOf / mediaInfoFill / handlerReading / handlerEchoes / mediaInfoShows  [all five] =-=-=-
    // How MediaInfoLib 23.07 builds a track's Title (File_Mpeg4_Elements.cpp moov_trak_mdia_hdlr and moov_udta_xxxx, File_Mpeg4.cpp Streams_Finish,
    // File_Mk.cpp; each rule measured on mediainfo.js 0.2.0). mp4 and mov: the handler's reading (handlerReading), then each udta name, joined ' / ' in that
    // order whatever the box order, a repeat kept ('English / English'). The reading is left out when it holds 'Handler' or ' handler' or starts 'Module ',
    // 'Gestionnaire ', 'Gestor ' or 'Procedura ' (every ffmpeg default named '...Handler', and names: 'Dog Handler Commentary', 'Module Three Lecture'; not
    // 'HANDLER Mix' or 'Handlebar'), and on mp4 when it is its own track's type (handlerReading). Matroska: the track title, then the HANDLER_NAME, left out
    // when it holds 'Handler', 'handler', 'vide' or 'soun' - so with no title tag the Title is the HANDLER_NAME alone or nothing.
    const HANDLER_LEFT_OUT_MP4 = /Handler| handler|^(?:Gestionnaire|Module|Gestor|Procedura) /;
    const HANDLER_LEFT_OUT_MKV = /Handler|handler|vide|soun/;
    // A Title or echo form in parts, each as nameTextOf has it, so a mov or matroska echo that keeps a leading control byte (MediaInfoLib gives those verbatim)
    // is the handler too. It is cut at ' / ' before anything is trimmed: trimmed first, a .mov name whose Pascal reading takes in an older length byte 0x0a or
    // 0x0d (' / English St') was a title '/ English St' that every plugin's carry wrote over the name (measured: a 266-byte name remuxed once).
    const partsOf = (t) => String(t || '').split(' / ').map(nameTextOf);
    // A value as MediaInfoLib stores it. Every value goes through Fill() (File__Analyze_Streams.cpp 838-993, each step measured on mediainfo.js 0.2.0), so
    // every echo form is compared as Fill leaves it. '\r\n', '\r' and '\n' become ' / ' (CarriageReturnReplace, MediaInfo_Config.cpp), and then ONE ' / ' left
    // at the end goes (measured: a .mov handler '\n\n' beside 'XY Mix' reads ' /  / XY Mix'). A plain value's leading U+FEFF go too, which nameTextOf trims
    // from every part. An empty value is not stored, and one made only of U+FEFF or U+FFFE throws: mediainfo.js returns an error for the file.
    const mediaInfoFill = (v) => {
        const breaks = (x) => {
            if (!/[\r\n]/.test(x)) return x;
            const t = x.replace(/\r\n|[\r\n]/g, ' / ');
            return t.endsWith(' / ') ? t.slice(0, -3) : t;
        };
        const t = breaks(String(v || ''));
        // A value that starts U+FFFE has every character's two low bytes swapped (U+FFFE U+6400 U+7500 U+6200 is stored 'dub') and its leading U+FEFF dropped,
        // and the line-break rule runs again on the result: a Title passes it in Fill's char* overload, then in the swap's own Fill call (U+FFFE 'Main' U+0A00
        // 'Mix' is stored as the swapped 'Main' and 'Mix' joined by ' / ').
        if (t.charCodeAt(0) !== 0xfffe) return t;
        const swap = (x) => String.fromCharCode(((x << 8) & 0xffff) | ((x >> 8) & 0xff));
        const swapped = Array.from(t, (c) => swap(c.codePointAt(0))).join('');
        let bom = 0;
        while (swapped.charCodeAt(bom) === 0xfeff) bom += 1;
        return breaks(swapped.slice(bom));
    };
    // The handler as MediaInfoLib reads it, before Fill (mediaInfoFill).
    const handlerReading = (s, stored) => {
        if (isMatroskaFamily(readContainer)) return stored;
        const raw = Buffer.from(stored, 'utf8');
        const n = raw.length;
        // On mov, as MacRoman. A name of 128 bytes or more keeps its length byte through every ffmpeg remux and gains a new one in front (movLengthBytes), and
        // MediaInfoLib reads all but the newest as MacRoman ahead of the name: a 131-byte name remuxed three times is four U+FFFD to ffprobe and "ÖÑÉ" + the
        // name to mediaInfo (bytes 133, 132, 131). From 256 bytes it reads the run verbatim, as ffprobe does - nothing when the newest byte is 0x80 or more,
        // which is no UTF-8, or, when that byte is below 0x20, that many bytes as MacRoman ('Dog ' for 260 bytes of 'Dog Handler ...').
        if (readContainer === 'mov') {
            const lengthBytes = movLengthBytes(stored);
            if (!lengthBytes) return macRoman(raw);
            const kept = Buffer.from(stored.slice(lengthBytes), 'utf8');
            const after = [...Array.from({ length: lengthBytes - 1 }, (_, i) => (kept.length + lengthBytes - 2 - i) & 0xff), ...kept];
            const newest = after.length & 0xff;
            if (after.length < 256) return macRoman(after);
            if (newest < 0x20) return macRoman(after.slice(0, newest));
            return newest >= 0x80 ? '' : stored;
        }
        // On mp4 a handler that is its own track's type ('soun' on audio, 'vide' on video, 'sbtl' on a mov_text) is left out.
        if (stored === { audio: 'soun', video: 'vide', subtitle: s.codec_name === 'mov_text' ? 'sbtl' : '' }[codecTypeOf(s)]) return '';
        // MediaInfoLib GUESSES an mp4 C string is a Pascal one when its first byte, as a length, equals the name's length or that less 1 (or less 2 with
        // padding after the NUL, which ffprobe hides: handlerEchoes), or is below 0x20, and reads that many bytes after it as MacRoman: an 85-byte
        // "The Director..." ('T' is 84) reads "he Director...", '\x03English' "Eng", and an 86-byte one whole unless a padding byte follows its NUL (measured).
        if (n > 1 && (raw[0] < 0x20 || raw[0] === n || raw[0] === n - 1)) {
            const size = raw[0] === n + 1 ? n : raw[0];
            return size <= n ? macRoman(raw.subarray(1, 1 + size)) : '';
        }
        return stored;
    };
    // Every form the handler's echo can take in the Title, each as Fill leaves it, in parts (partsOf); a form missing here reads as a title that outranks the
    // handler. The forms: the name as stored and as nameTextOf has it, each also as MacRoman - the stored one's MacRoman keeps its edges, since as MacRoman a
    // no-break space, BOM or ideographic space at an edge is no space nameTextOf trims ('Commentary' + U+00A0 reads "Commentary¬†", measured); a grown .mov
    // name, its edges included (they count in its length bytes), behind its older length bytes as MacRoman; MediaInfoLib's reading (handlerReading); the Pascal
    // guess from the length less 2 as well; and a name starting U+FFFD also as starting U+FFFE, which ffprobe prints as U+FFFD (the swap in mediaInfoFill).
    const handlerEchoes = (s, handler) => {
        const stored = String(handler || '');
        const raw = Buffer.from(stored, 'utf8');
        const n = raw.length;
        const lengthBytes = movLengthBytes(stored);
        const kept = Buffer.from(stored.slice(lengthBytes), 'utf8');
        const grown = Array.from({ length: Math.max(0, lengthBytes - 1) }, (_, i) => (kept.length + lengthBytes - 2 - i) & 0xff);
        const asStored = stored.charCodeAt(0) === 0xfffd ? [stored, String.fromCharCode(0xfffe) + stored.slice(1)] : [stored];
        const out = [...asStored.flatMap((t) => [t, nameTextOf(t)].flatMap((x) => [x, macRoman(Buffer.from(x, 'utf8'))])),
            macRoman([...grown, ...kept]), handlerReading(s, stored)];
        if (n > 1 && (raw[0] < 0x20 || (raw[0] >= n - 2 && raw[0] <= n))) out.push(macRoman(raw.subarray(1, 1 + Math.min(raw[0], n - 1))));
        return [...new Set(out.map((e) => partsOf(mediaInfoFill(e)).join(' / ')).filter(Boolean))];
    };
    // Whether MediaInfoLib shows the handler in the Title: its reading (handlerReading), judged by the read container's leave-out rule and not empty once Fill
    // has it - so a handler read as a single line break is not shown, and one of two or more is (mediaInfoFill). Measured: an mp4 handler '\x01\nXY Mix', read
    // as the one byte '\n', is not shown, so the title 'XY Mix / Part 2' keeps its first part; a 200-byte .mov 'Module ...' grown once reads '»Module ...', and
    // a 78-byte one on mp4 'odule ...': both shown. An mp4 name holding U+FFFD is taken as read (mediaInfoOwnTitleParts).
    const mediaInfoShows = (s, handler) => {
        const reading = handlerReading(s, String(handler || ''));
        return !!mediaInfoFill(reading) && !(isMatroskaFamily(readContainer) ? HANDLER_LEFT_OUT_MKV : HANDLER_LEFT_OUT_MP4).test(reading);
    };
    // -=-=-= mediaInfoText / edgeless / titleTagKey / titleTagText / titleTagInNamePlace / tagForms / printedAs / mediaInfoOwnTitleParts /
    //        trackNameBesideTitleTag / titleTagFate  [all five] =-=-=-
    // A mediaInfo value as text. mediainfo.js gives a value holding a control character as {"@dt": "binary.base64", "#value": <its UTF-8 in base64>}, not a
    // string (measured: a handler 'Tab<TAB>Name' is the Title {"@dt":"binary.base64","#value":"VGFiCU5hbWU="}); any other non-string reads as none. Taken as a
    // string, such a value threw and failed the file.
    const mediaInfoText = (v) => (typeof v === 'string' ? v
        : (v?.['@dt'] === 'binary.base64' ? Buffer.from(String(v['#value'] || ''), 'base64').toString('utf8') : ''));
    // The parts less the empty ones at either edge: a line break at either edge of a title box leaves an empty part there (mediaInfoFill), and kept,
    // '<LF>Commentary' read '/ Commentary', which every carry then wrote as the name (measured).
    const edgeless = (parts) => {
        let a = 0; let b = parts.length;
        while (a < b && !nameTextOf(parts[a])) a += 1;
        while (b > a && !nameTextOf(parts[b - 1])) b -= 1;
        return parts.slice(a, b);
    };
    // The key of a matroska per-track TITLE SimpleTag, or undefined. ffprobe shows one in the Name's place - the demuxer's dictionary replaces the Name's
    // 'title' with it, as 'TITLE', or under the Name's own key where the tag is spelled 'title' - or, carrying a TagLanguage, as 'TITLE-<lang>' beside the
    // Name, which an mkv copy keeps beside it and an mp4 one drops (measured: 'TITLE-ger'). A key in the Name's place wins; of several beside it, the last,
    // which MediaInfoLib appends (measured: 'TITLE-ger' then 'TITLE-fre' read 'Name / <fre>'). A 'title' key is the Name unless mediaInfo's Title shows
    // another (trackNameBesideTitleTag): read as the Name, 'Director Commentary' beside a 'title' SimpleTag 'Nederlands' lost its role to every remux.
    const titleTagKey = (s) => {
        if (!isMatroskaFamily(readContainer)) return undefined;
        const keys = Object.keys(s?.tags || {}).filter((k) => /^title(?:-[a-z]{2,3}(?:-[a-z0-9]+)*)?$/i.test(k));
        return keys.find((k) => k !== 'title' && !k.includes('-')) || keys.filter((k) => k.includes('-')).pop() || keys.find((k) => k === 'title');
    };
    const titleTagText = (s) => { const k = titleTagKey(s); return k ? String(s.tags[k] ?? '') : ''; };
    // Whether that tag sits in the Name's place: ffmpeg then writes it as the Name on every remux and keeps no TITLE tag beside a Name, so even a matroska
    // output keeps one title. One beside the Name only a write into another container, or a sidecar, drops.
    const titleTagInNamePlace = (s) => { const k = titleTagKey(s); return !!k && !k.includes('-'); };
    // A tag's text in the forms mediaInfo's Title can hold it, each compared as the Name is (mediaInfoOwnTitleParts): in parts as Fill leaves them, the
    // empty ones at either edge dropped (edgeless), and a leading U+FFFD read as U+FFFE too, which ffprobe prints so (the swap in mediaInfoFill). Compared
    // any other way a Name alone read as a second title in 6 of 68 builds (a leading line break or ' / ', a trailing ' / ', a leading U+FFFE); compared
    // so, in none of 76 (measured on mediainfo.js 0.2.0).
    const tagForms = (t) => {
        const x = String(t ?? '');
        const forms = x.charCodeAt(0) === 0xfffd ? [x, String.fromCharCode(0xfffe) + x.slice(1)] : [x];
        return [...new Set(forms.map((y) => edgeless(partsOf(mediaInfoFill(y))).join(' / ')))];
    };
    // Whether `read`, a text as mediaInfo reads it, is the one ffprobe prints as `printed`. The two decode some bytes apart: ffprobe prints U+FFFE and
    // U+FFFF as U+FFFD, which MediaInfoLib keeps, and a U+FFFD for each sequence that is no UTF-8, which MediaInfoLib may decode as one UTF-16 unit
    // (an overlong '/', each half of a CESU-8 pair) - so a U+FFFD there stands for any one unit. Read as a second title, a Name holding U+FFFE made
    // clean_and_remux repeat one mkv preset every pass, and an overlong or CESU-8 one cost a pass (measured on jellyfin 7.1.4 and mediainfo.js 0.2.0).
    const printedAs = (printed, read) => {
        if (printed.length !== read.length) return false;
        for (let i = 0; i < printed.length; i += 1) if (printed[i] !== read[i] && printed.charCodeAt(i) !== 0xfffd) return false;
        return true;
    };
    // The Title's parts without the handler's echo - the title box on mp4 and mov, the title on matroska - which roleFieldsLower reads as the one stored value
    // they are. The echo goes because the raw join welds boilerplate into a title ('Core Media Audio -> 2.0') no later pass can tell from one the user chose.
    // Stated residuals - five layouts are read as the usual one: a file title box ahead of the tracks leaves every handler out (MediaInfoLib reads a handler
    // into the Title only while the file has no title yet), so a title's first part repeating its handler is lost; a QuickTime data handler (minf) named
    // without 'Handler' joins second, its name read as part of the title (ffprobe shows only the media handler); and three lose a title's first part only when
    // it repeats the handler - an mp4 handler holding a byte that is no UTF-8 (MediaInfoLib reads no name, but ffprobe shows it as U+FFFD like a real one, so
    // it is taken as read), an mp4 handler padded after its NUL (guessed a Pascal string from the length less 2), and an mp4 subtitle other than mov_text named
    // its own handler type ('subp' on a dvd_subtitle beside 'subp / Part 2' reads 'Part 2'). Of the five, ffmpeg writes only the handler holding a byte that is
    // no UTF-8, when a copy carries the byte over.
    const mediaInfoOwnTitleParts = (s) => {
        let parts = partsOf(mediaInfoText(mediaInfoFor(s)?.Title));
        const handler = String(getTagCI(s?.tags, 'handler_name') || '');
        const mkv = isMatroskaFamily(readContainer);
        const titleKey = titleTagKey(s);
        let fromEnd = false;
        // The echo is removed ONCE, where MediaInfoLib puts it - from the front, and on matroska beside a title ffprobe shows from the end alone
        // ('Description / Audio' beside its HANDLER_NAME 'Description' is 'Description / Audio / Description', whose front removed left 'Audio / Description',
        // a role neither value gives, and audio_clean deleted the track; measured) - as a RUN of whole parts (a name holding ' / ' is several parts), never by
        // prefix, and only an echo MediaInfoLib shows: beside a handler it leaves out, the Title is all title ('Dog Handler Commentary / Part 2' beside that
        // handler reads whole). Once, so a title's own part equal to the handler stays ('Too Hot to Handle / Remix' beside the handler 'Too Hot to Handle');
        // removing every occurrence emptied a .mov name cut to 127 bytes at a ' / ', which reads 'cut / full name', down to its last part (measured). A string
        // comparison, linear in the title, since a title and a handler are both unbounded: on a 20,000-part title a window-by-window comparison took 0.75 s a
        // removal and 3.7 s a stream_ordering run, against 12 ms and 96 ms for this one (measured on an M-series Mac at load average about 5).
        if (handler && mediaInfoShows(s, handler)) {
            const joined = parts.join(' / ');
            const last = mkv && !!nameTextOf(getTagCI(s?.tags, 'title'));
            const at = (e) => (joined === e ? 1 : (last ? (joined.endsWith(` / ${e}`) ? -1 : 0) : (joined.startsWith(`${e} / `) ? 1 : 0)));
            const echo = handlerEchoes(s, handler).filter(at).reduce((a, e) => (e.length > a.length ? e : a), '');
            fromEnd = !!echo && at(echo) < 0;
            if (echo) parts = partsOf(at(echo) > 0 ? joined.slice(echo.length + 3) : joined.slice(0, -echo.length - 3));
        }
        // A matroska per-track TITLE SimpleTag (titleTagKey) is a second title, which MediaInfoLib puts after the Name as the Title's last part - or the
        // HANDLER_NAME there instead, whichever of the two SimpleTags comes last, since File_Mk.cpp stores both as one 'Title' key. So it is removed from the
        // end as the echo is, leaving the Name (measured: 'New Audio / Description of scenes' read as one name gave /description, and audio_clean deleted the
        // track) - unless the echo came off the end, when MediaInfoLib appended the handler and not the tag (measured: removed as well, the tag's text took
        // the Name 'Director Commentary / English' beside TITLE 'English' down to 'Director Commentary'). roleFieldsLower reads the tag as a field of its own.
        if (titleKey && !fromEnd) {
            const joined = parts.join(' / ');
            const tag = tagForms(s.tags[titleKey]).find((t) => t && joined.endsWith(` / ${t}`));
            if (tag) parts = partsOf(joined.slice(0, -tag.length - 3));
        }
        return edgeless(parts);
    };
    // A matroska track's one name where a per-track TITLE SimpleTag (titleTagKey) sits beside its Name, else '' - the Name being what is left of mediaInfo's
    // Title (mediaInfoOwnTitleParts) when no tag form is it (tagForms), the one place it shows where the tag is in its place. An output that keeps one title -
    // any remux of a tag in the Name's place (titleTagInNamePlace), else a write into another container or a sidecar - writes it as the Name, so that name
    // keeps both values' roles (rolesNamed): the Name alone when the tag gives none the Name lacks, since players and media servers show the Name; else the two
    // joined as mediaInfo joins them, 'Name / TITLE', or else 'TITLE / Name', whichever reads exactly their roles together - a keyword can form across the
    // join ('Main Audio / Description Commentary' reads 'audio description'); else the Name, the roles only the tag gives lost (titleTagFate). Measured:
    // read as the tag, 'Director Commentary' beside 'German' was written over with 'German'; read as the Name alone, 'English' beside 'Director Commentary'
    // made the commentary the default audio.
    const trackNameBesideTitleTag = (s) => {
        const key = titleTagKey(s);
        if (!key) return '';
        let name = mediaInfoOwnTitleParts(s).join(' / ').trim();
        const forms = tagForms(s.tags[key]);
        const tag = forms[0];
        // A 'TITLE-<lang>' on a track mediaInfo shows no Name for: ffprobe's title is the Name where there is one (mediainfo.js lists no tracks once
        // mkvpropedit has moved the Tracks element after the clusters, and read as no Name the tag replaced it - measured), else a named HANDLER_NAME
        // stands in for it, else the tag is the one name (measured: beside a later HANDLER_NAME mediaInfo's Title is that handler alone, and read so an
        // mp4 conversion lost the tag's role while Expected results promised it).
        if (!name && !titleTagInNamePlace(s)) {
            const handler = handlerTextOf(getTagCI(s.tags, 'handler_name'));
            name = nameTextOf(getTagCI(s.tags, 'title')) || (isGenericHandler(handler) ? '' : handler);
            if (!name) return tag;
        }
        // The Name is the tag where the two engines only decode one text apart (printedAs): compared as Fill and nameTextOf leave each, and with the tag
        // whole, since they trim a U+FFFD at an edge that mediaInfo read as a character (a CESU-8 pair opening the Name).
        const read = [name, ...tagForms(name.replace(/[\ufffe\uffff]/g, '\ufffd'))];
        if (!name || [...forms, String(s.tags[key] ?? '').trim()].some((f) => read.some((n) => printedAs(f, n)))) return '';
        const roles = (t) => rolesNamed(t, codecTypeOf(s)).sort().join();
        const both = [...new Set([...rolesNamed(name, codecTypeOf(s)), ...rolesNamed(tag, codecTypeOf(s))])].sort().join();
        return roles(name) === both ? name : [`${name} / ${tag}`, `${tag} / ${name}`].find((t) => roles(t) === both) || name;
    };
    // What that name leaves of the TITLE SimpleTag, for the line that writes it: whether the tag's text is joined into it, and the roles only the tag gives
    // that it lacks (their dispositionTypes tags), lost with the tag's text - none where no Name sits beside such a tag.
    const titleTagFate = (s) => {
        const named = trackNameBesideTitleTag(s);
        if (!named) return { joined: false, lost: [] };
        const tag = tagForms(titleTagText(s))[0];
        const lost = rolesNamed(tag, codecTypeOf(s)).filter((k) => !rolesNamed(named, codecTypeOf(s)).includes(k));
        return { joined: named !== mediaInfoOwnTitleParts(s).join(' / ').trim(), lost: [...new Set(lost.map((k) => dispositionTypes[k].tag || k))] };
    };
    // -=-=-= titleOutsideHandler / titleBesideHandler / boxNamesNothing / mediaTitleFor  [all five] =-=-=-
    // The track's own title: the title tag (on matroska beside a TITLE SimpleTag, the track's one name: trackNameBesideTitleTag), else the Title less the
    // handler's echo, even one repeating the handler (sub_worker's duplicate fold reads it so).
    const titleOutsideHandler = (s) => {
        const ownTagTitle = nameTextOf(getTagCI(s?.tags, 'title'));
        if (ownTagTitle) return trackNameBesideTitleTag(s) || ownTagTitle;
        const raw = mediaInfoText(mediaInfoFor(s)?.Title);
        if (!getTagCI(s?.tags, 'handler_name') || !nameTextOf(raw)) return nameTextOf(edgeless(raw.split(' / ')).join(' / '));
        return mediaInfoOwnTitleParts(s).join(' / ').trim();
    };
    // The title OTHER than the handler, for the callers that need that: the name carry beside a handler it keeps, handlerOnlyDisp's default, the reconcile log,
    // sub_worker's duplicate fold, audio_clean's channel-label base. It is '' when the title IS the named handler: a title tag equal to it as much as the same
    // name in both mp4 boxes, the box holding it as escMeta writes it included - the carry writes that form beside a handler holding 'Director "Cut"
    // Commentary', and read as another title it moved into the handler and cost clean_and_remux a second pass. The handler is read through getTagCI (matroska
    // stores the key uppercase) as the name it holds (handlerTextOf).
    const titleBesideHandler = (s) => {
        const handler = getTagCI(s?.tags, 'handler_name') || '';
        const name = handlerTextOf(handler);
        const title = titleOutsideHandler(s);
        if (nameTextOf(getTagCI(s?.tags, 'title'))) return title === name && !isGenericHandler(name) ? '' : title;
        return title && name && (handlerEchoes(s, handler).includes(title) || (escMeta(name) === title && !isGenericHandler(name))) ? '' : title;
    };
    // A title box that names no track: boilerplate by a tool's own pattern, the writers' spaced '... Handler' spellings among them, or a one-word
    // '...Handler' (ffmpeg's SoundHandler; measured: 'Core Media Audio' and 'Apple Sound Media Handler' beside 'SoundHandler' each became an mkv
    // conversion's title), that gives a track of its type no role. Beside a boilerplate handler the box is the one place its role words live, so
    // 'Apple Closed Caption Media Handler' stays a subtitle's title: read as nothing, an mkv conversion dropped the SDH role Expected results promised,
    // and an extract named the sidecar with neither. A spaced name only the '... Handler' catch-all reads as boilerplate is a name there ('The Dog
    // Handler' beside Apple's 'Core Media Audio' handler).
    const boxNamesNothing = (t, type) => {
        const x = nameTextOf(t);
        return isGenericHandler(x) && !rolesNamed(x, type).length
            && !(/\s/.test(x) && !HDLR_TYPE_FOURCCS.has(x) && GENERIC_HANDLER_RES.slice(1).every((re) => !re.test(x)));
    };
    // A stream's title: ffprobe's title tag, else mediaInfo's Title outside the handler's echo (titleBesideHandler - on mp4 the udta/name box, which ffprobe
    // never surfaces), else a NAMED handler (isGenericHandler). A real title outranks the handler, so a GPAC release name in the handler never displaces
    // "Main Feature"; the handler is the title only when nothing else names the track, or when, with no title tag, the box beside it reads as boilerplate
    // (measured: 'Core Media Audio' beside 'Deutsch Kommentar' became an mkv conversion's title and the handler was wiped, its name gone). Beside a
    // boilerplate handler such a box is no name either where a tool wrote it (boxNamesNothing); a name it merely reads as stays. On matroska
    // ffmpeg keeps an mp4 handler only as a HANDLER_NAME tag (mediaInfo shows it as the Title, mkvmerge as no track name), so this makes an mp4 -> mkv
    // remux carry the name as a real title.
    const mediaTitleFor = (s) => {
        const beside = titleBesideHandler(s);
        const name = handlerTextOf(getTagCI(s?.tags, 'handler_name'));
        const named = isGenericHandler(name) ? '' : name;
        if (!beside || !isGenericHandler(beside) || nameTextOf(getTagCI(s?.tags, 'title'))) return beside || named;
        return named || (boxNamesNothing(beside, codecTypeOf(s)) ? '' : beside);
    };
    // -=-=-= MOV_HANDLER_MAX_BYTES / movHandlerGrows / cutName / movNameCut / handlerNameFor  [all five] =-=-=-
    // mov stores the handler as a Pascal string, and ffmpeg's reader compares its length byte as a plain char (mov.c mov_read_hdlr), signed on x86 and Apple
    // arm64: from 128 bytes up it reads the length byte back as part of the name (measured on jellyfin-ffmpeg 7.1.4, Mac arm64), so such a name grows by a byte
    // on every remux, and from 256 the length wraps. 127 is the bound every node shares, so a mov handler is cut there (movNameCut) and the full title goes
    // into udta/name beside it when that box takes it (titleBoxTakes). mp4, m4v and m4a write a C string, which has no such limit.
    const MOV_HANDLER_MAX_BYTES = 127;
    // A handler past that bound on a .mov output, counted as stored: a length byte (movLengthBytes) is one byte, not the three of the U+FFFD ffprobe prints.
    const movHandlerGrows = (handler, container) => {
        const h = String(handler || '');
        const lengthBytes = movLengthBytes(h);
        return String(container || '').toLowerCase() === 'mov' && lengthBytes + Buffer.byteLength(h.slice(lengthBytes), 'utf8') > MOV_HANDLER_MAX_BYTES;
    };
    // The role-keeping cut of a name `t` to `max` bytes: whole words - as much of the start as fits, then the first phrase of each role the full name gives,
    // units dropped from the middle with nothing put in their place - giving the classifiers exactly the full name's roles, never fewer and never more (short
    // of the limits at its end). A cut is the name's own characters, so an ASCII name's cut is ASCII. A cut that reads as boilerplate ('... Dog Handler') is
    // cut further back, since a name read as boilerplate is no name to move and the old handler would go on growing; a name that reads as boilerplate whole is
    // '' (the muxer's default). `size` measures every length: a name's UTF-8 bytes, or for sub_worker's sidecar title the bytes its percent-encoding spends in
    // the filename (encodeTitleCapped), so the 255-byte name cap keeps the same role words. `generic` is the test a cut must fail: isGenericHandler for a
    // handler. A sidecar title is never a handler ('... the Dog Handler' is still the track's name), so encodeTitleCapped passes its own token test, or none.
    const cutName = (t, max, size = (x) => Buffer.byteLength(x, 'utf8'), generic = isGenericHandler) => {
        const fits = (x) => size(x) <= max;
        if (fits(t) || generic(t)) return generic(t) ? '' : t;
        // An index walk, for the reason nameTextOf is one: keepRoles' candidates keep whole units of any length (measured: 526 s for one 60,000-character
        // .mov name stripped by /[...]+$/).
        const UNTRAIL_CHAR = /[\s\-–—/:,;.]/;
        const untrail = (x) => { let b = x.length; while (b > 0 && UNTRAIL_CHAR.test(x[b - 1])) b -= 1; return x.slice(0, b); };
        // The roles a name gives each classifier, read both as written and as NFC (rolesNamed folds to NFC; handlerOnlyDisp and clean_and_remux's cleared-role
        // test read the case-folded text as written). Every candidate passes reads(): it fits, it reads as a name, and it gives exactly the full name's roles -
        // or, for the plain cut the limits leave (`lose`), a subset of them, never one the name lacks. The roles are the cut's alone: the next pass reads it
        // beside the full name (roleFieldsLower: the handler and the title box are two fields), never joined to it. reads() leaves out the busy-title test and
        // the channel label: holding either would send most long names without a role to the muxer's default (measured: 5,728 busy flips and 44 channel-label
        // flips in 20,000 generated names). A cut that drops periods or a channel label matters only where the cut is the track's only name, a non-ASCII .mov
        // name, and tag_title rewrites that one keeping its roles (clean_and_remux's busyFallback takes a handler that is a title's own cut for that title).
        const rolesOf = (x) => [x, x.normalize('NFC')].map((y) => Object.keys(dispositionTypes)
            .filter((k) => k !== 'default' && matchesKeyword(y.toLowerCase(), dispositionTypes[k].keywords)));
        const full = rolesOf(t);
        const reads = (x, lose) => !!x && fits(x) && !generic(x)
            && rolesOf(x).every((r, i) => (lose ? r.every((k) => full[i].includes(k)) : r.join() === full[i].join()));
        const words = [...t.matchAll(/\S+/g)];
        // The units the cut keeps or drops, each [start, end) in t and the word it lies in: whole words, and the parts between '.', '_' and '-' of a word too
        // long to keep or named in `split`. A word with no space in it (a release name, 'Film.2020.1080p...Commentaire') is kept whole while it can be.
        const unitsOf = (split) => words.flatMap((w, k) => (fits(w[0]) && !split.has(k) ? [[w.index, w.index + w[0].length, k]]
            : [...w[0].matchAll(/[^._-]+/g)].map((p) => [w.index + p.index, w.index + p.index + p[0].length, k])));
        let cut = '';
        for (const ch of t) { if (!fits(cut + ch)) break; cut += ch; }
        const within = (spans) => spans.filter(([, b]) => b <= cut.length).length;
        const base = unitsOf(new Set());
        const plain = untrail(within(base) ? t.slice(0, base[within(base) - 1][1]) : cut);
        if (reads(plain)) return plain;
        const EDGE_PUNCT = /[^\p{L}\p{N}()[\]{}]/u;
        // The role-keeping cut over `spans`, or '' when none reads as the name does within the bytes; `held` gets the words its role phrases lie in.
        const keepRoles = (spans, held) => {
            // The text each unit is kept after: a space after a word, its own separator after a part.
            const seps = spans.map(([a], i) => (i ? t.slice(spans[i - 1][1], a) : '')).map((g) => (/\s/.test(g) ? ' ' : g));
            // Each role's first phrase, as NFC and as written: in `grouped` with the bracket group around it when the whole group fits, in `bare` alone. Both
            // forms, as a keyword stored decomposed reads only as NFC: where a precomposed copy came later, the first phrase alone read one role fewer as
            // written, every candidate failed and the plain cut lost a role ('... forc' + U+0301 + ' then ... Hard of Hearing ... Forced' lost /sdh; measured).
            const grouped = new Set(); const bare = new Set();
            for (const [r, form] of [[1, (x) => x.normalize('NFC')], [0, (x) => x]]) {
                // Each unit in this form, lowercased, and where it starts in their join, which the role keywords and the bracket pairs are found in.
                const lower = spans.map(([a, b]) => form(t.slice(a, b)).toLowerCase());
                const at = []; let joined = '';
                lower.forEach((w, i) => { joined += seps[i]; at.push(joined.length); joined += w; });
                const pairs = []; const open = [];
                for (let i = 0; i < joined.length; i += 1) {
                    const kind = '([{)]}'.indexOf(joined[i]);
                    if (kind >= 0 && kind < 3) open.push(i);
                    else if (kind >= 3 && open.length && joined[open[open.length - 1]] === '([{'[kind - 3]) pairs.push([open.pop(), i]);
                }
                const over = (a, b) => spans.map((_, i) => i).filter((i) => at[i] < b && at[i] + lower[i].length > a);
                for (const k of full[r]) {
                    const m = keywordRegex(dispositionTypes[k].keywords).exec(joined);
                    if (!m) continue;
                    const phrase = over(m.index, m.index + m[0].length);
                    const group = pairs.filter(([o, c]) => o < m.index && c >= m.index + m[0].length).reduce((g, p) => (g && g[0] > p[0] ? g : p), null);
                    const whole = group ? over(group[0], group[1] + 1) : [];
                    phrase.forEach((i) => bare.add(i));
                    (whole.length && fits(t.slice(spans[whole[0]][0], spans[whole[whole.length - 1]][1])) ? whole : phrase).forEach((i) => grouped.add(i));
                }
            }
            bare.forEach((i) => held.add(spans[i][2]));
            // The head (as much of the start as fits) and the kept units after it; a bracket at the edge of a run of kept units, or behind the punctuation that
            // ends or starts one, that nothing in the name pairs with is dropped - a separating unit (sep, below) counts as a run of its own.
            const nameOf = (keep, h, sep = -1) => {
                let name = untrail(t.slice(0, h ? spans[h - 1][1] : 0));
                const edges = new Set(); let last = h - 1;
                const end = (j) => { for (edges.add(j); j > 0 && EDGE_PUNCT.test(name[j]);) edges.add(j -= 1); };
                const start = (j) => { for (edges.add(j); j < name.length - 1 && EDGE_PUNCT.test(name[j]);) edges.add(j += 1); };
                for (const i of [...keep].filter((x) => x >= h).sort((x, y) => x - y)) {
                    const fresh = i !== last + 1 || !name || i === sep || last === sep;
                    if (fresh && last >= h) end(name.length - 1);
                    if (name) name += seps[i];
                    const from = name.length;
                    name += t.slice(spans[i][0], spans[i][1]);
                    if (fresh) start(from);
                    last = i;
                }
                if (last >= h) end(name.length - 1);
                const lone = new Set(); const stack = [];
                for (let i = 0; i < name.length; i += 1) {
                    const kind = '([{)]}'.indexOf(name[i]);
                    if (kind >= 0 && kind < 3) stack.push(i);
                    else if (kind >= 3 && stack.length && name[stack[stack.length - 1]] === '([{'[kind - 3]) stack.pop();
                    else if (kind >= 3) lone.add(i);
                }
                stack.forEach((i) => lone.add(i));
                return untrail(name.split('').filter((_, i) => !(edges.has(i) && lone.has(i))).join(''));
            };
            // As much of the start as fits first, a shorter head next. Joining two kept words across dropped ones can spell another role's keyword ('... new
            // Audio' + '(Described as the Latin American dub)' reads 'audio described', and audio_clean then deleted the dub as audio description), so when
            // every such cut does, each is tried again with one dropped unit between two kept runs (or the head and the first) kept as well, which separates
            // that junction - each distinct unit that fits, left to right.
            const keeps = grouped.size === bare.size ? [grouped] : [grouped, bare];
            for (const keep of keeps) {
                for (let h = within(spans); h >= 0; h -= 1) if (reads(nameOf(keep, h))) return nameOf(keep, h);
            }
            for (const keep of keeps) {
                for (let h = within(spans); h >= 0; h -= 1) {
                    const kept = [...keep].filter((x) => x >= h).sort((x, y) => x - y);
                    const room = max - size(nameOf(keep, h));
                    for (let j = 0; j < kept.length; j += 1) {
                        const tried = new Set();
                        for (let d = (j ? kept[j - 1] : h - 1) + 1; d < kept[j]; d += 1) {
                            const unit = t.slice(spans[d][0], spans[d][1]);
                            if (size(unit) >= room || tried.has(unit)) continue;
                            tried.add(unit);
                            const name = nameOf(new Set([...keep, d]), h, d);
                            if (reads(name)) return name;
                        }
                    }
                }
            }
            return '';
        };
        // A word that holds a role phrase but does not fit whole beside the others is cut at its '.', '_' and '-', the longest such word first, until a cut
        // reads as the name does.
        const held = new Set();
        let name = keepRoles(base, held);
        const split = new Set();
        for (const k of [...held].filter((x) => fits(words[x][0]) && /[._-]/.test(words[x][0]))
            .sort((x, y) => size(words[y][0]) - size(words[x][0]))) {
            if (name) break;
            split.add(k);
            name = keepRoles(unitsOf(split), new Set());
        }
        if (name) return name;
        // The limits, where no candidate reads as the name does: (1) the smallest pieces holding its role words (split at spaces and at '.', '_' and '-')
        // together pass `max`, or (2) every candidate that keeps them and fits reads as boilerplate or joins two kept pieces into another role's keyword. Then
        // it is the plain cut - the whole units that fit, or the first `max` bytes at a UTF-8 boundary when the first unit alone passes them - which may lose a
        // role but never gains one: cut at a UTF-8 boundary it can end on a keyword its word only starts ('...+commentaryxyz' cut after 'commentary'), so it
        // steps back a character at a time until it reads none the name lacks. (3) It is '' (the muxer's default) when that plain cut reads as boilerplate.
        let last = plain;
        while (last && !generic(last) && !reads(last, true)) last = untrail([...last].slice(0, -1).join(''));
        return reads(last, true) ? last : '';
    };
    // Each name is cut once a run: the carry asks for the same cut from its arguments, its log and its view, and the separating-unit search is linear in the
    // dropped units (a crafted 289 KB title of 20,000 of them that all spell a keyword at the junction: 0.37 s, measured on an M-series Mac).
    const movNameCuts = new Map();
    const movNameCut = (t, max) => {
        const key = `${max}\n${t}`;
        if (!movNameCuts.has(key)) movNameCuts.set(key, cutName(t, max));
        return movNameCuts.get(key);
    };
    // The handler_name an mp4-family output carries for a track titled `title`, or '' for the muxer's per-type default. Every title a plugin writes there goes
    // into the handler as well, or the next remux by any plugin drops it (HDLR_TYPE_FOURCCS) - unless the name READS as boilerplate, which the next pass would
    // erase: such a name is kept as the title alone. On .mov it is cut to MOV_HANDLER_MAX_BYTES, and audio_clean's downmix suffix (' -> 2.0') is kept whole
    // after the rest cut to the bytes left, so a downmix never shares its source's cut.
    const handlerNameFor = (title, container) => {
        const t = nameTextOf(title);
        if (String(container || '').toLowerCase() !== 'mov') return isGenericHandler(t) ? '' : t;
        const tail = Buffer.byteLength(t, 'utf8') > MOV_HANDLER_MAX_BYTES && / -> \d+(?:\.\d+)+$/.exec(t);
        const base = tail ? movNameCut(nameTextOf(t.slice(0, tail.index)), MOV_HANDLER_MAX_BYTES - Buffer.byteLength(tail[0], 'utf8')) : '';
        return base ? `${base}${tail[0]}` : movNameCut(t, MOV_HANDLER_MAX_BYTES);
    };
    // -=-=-= titleBoxTakes  [all five] =-=-=-
    // Whether a name may go into an mp4-family track's udta/name box. ffmpeg writes it as raw UTF-8 and AVFoundation (QuickTime, the Apple TV app, iOS) reads a
    // .mov one as MacRoman, so a non-ASCII name there is garbled in Apple players, not in VLC (measured). On .mov only an ASCII name goes in; a non-ASCII one
    // lives in the handler alone (handlerNameFor), which Apple does not show, unless its cut there is ASCII and goes in both. AVFoundation ignores the box on
    // .mp4.
    const titleBoxTakes = (title, container) => String(container || '').toLowerCase() !== 'mov' || /^[\x00-\x7f]*$/.test(String(title || ''));
    // -=-=-= logShown / quotedName  [all five] =-=-=-
    // A name as stored, each control byte spelled out ('\t', '\x1b'): logSafe prints a space, so 'Tab<TAB>Name' (written 'Tab Name') would look unchanged.
    const logShown = (t) => logSafe(String(t ?? '').replace(/[\x00-\x1f\x7f]/g, (c) => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r' }[c]
        || `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)));
    // A track name as a log line quotes it. escMeta rewrites a double quote, a backslash, a control character and '<io>' on the way into the command (Tdarr's
    // tokenizer cannot carry them), so a name it alters is given in the form the file will hold as well, or the line names a title the output never has.
    const quotedName = (t) => (escMeta(t) === t ? `"${logSafe(t)}"` : `"${logShown(t)}" (written as "${logSafe(escMeta(t))}")`);
    // -=-=-= titleTagLine  [all five] =-=-=-
    // The line a write of a track's one name (trackNameBesideTitleTag) as its title logs, by what that leaves of the TITLE SimpleTag (titleTagFate).
    const titleTagLine = (s) => {
        const { joined, lost } = titleTagFate(s);
        const named = quotedName(trackNameBesideTitleTag(s)); const tag = `the TITLE tag "${logShown(titleTagText(s))}"`;
        if (joined) return `☐${streamTag(s.index)} Writing ${named} as the title - the track name joined with ${tag} beside it, since ffmpeg keeps`
            + ' one title\n';
        return `☒${streamTag(s.index)} Writing the track name ${named} as the title, so ${tag} beside it is dropped`
            + `${lost.length ? ` with its ${lost.join(' and ')} role${lost.length > 1 ? 's' : ''} - no join of the two reads both their roles`
                : ' - ffmpeg keeps one title, and players show the name'}\n`;
    };
    // -=-=-= trackNamesUnreadLine  [all five] =-=-=-
    // Tdarr's mediainfo.js lists only the General track for a Matroska file whose Tracks element sits after its clusters (mkvpropedit moves it there when an
    // edit does not fit), so a Name beside a TITLE SimpleTag in its place, which only mediaInfo shows, is unseen: the track reads as the tag (measured: a
    // 'Director Commentary' Name beside TITLE 'English' read as plain English audio) and a remux writes the tag over the Name. Nothing here can recover it.
    const trackNamesUnreadLine = (streams) => {
        const tracks = file?.mediaInfo?.track || [];
        if (!tracks.length || tracks.some((t) => t['@type'] !== 'General') || !streams.some((x) => titleTagInNamePlace(x) && titleTagKey(x) !== 'title')) {
            return '';
        }
        return '☒mediaInfo lists no tracks in this Matroska file (its Tracks element sits after the clusters), so a track name beside a TITLE tag cannot be'
            + ' read and a remux writes the tag over it - a plain mkvmerge remux moves the Tracks element back to the front\n';
    };
    // -=-=-= handlerFor / mp4NameCarry  [all five] =-=-=-
    // The handler a write of `title` leaves on s (null: s's own, untouched), shared with sub_worker's duplicate fold. A handler is left as it is when it
    // carries a role word the title lacks: clean_and_remux promotes such a role to a flag before it replaces the handler, and no other plugin can - except a
    // .mov handler over 127 bytes, which no remux keeps (movHandlerGrows; measured: its growing echo named a new sidecar on every sub_worker pass), so it is
    // cut like any long mov name, its roles kept (handlerNameFor), and written as the muxer's default when no cut of it reads as a name.
    const handlerFor = (s, title, container) => {
        const handler = getTagCI(s?.tags, 'handler_name');
        const want = handlerNameFor(title, container);
        const type = codecTypeOf(s);
        const grows = movHandlerGrows(handler, container);
        if ((want || !grows) && rolesNamed(handlerTextOf(handler), type).every((k) => rolesNamed(want, type).includes(k))) return want;
        return grows ? handlerNameFor(handlerTextOf(handler), container) : null;
    };
    // A remux of an mp4-family file keeps each track's handler and drops its udta/name title - which VLC, QuickTime on mov and mediaInfo read, and which can
    // hold the track's only role word. So a plugin that remuxes one for its own reasons restates each named track's title (mediaTitleFor) on that remux, and
    // moves it into the handler unless the handler already says it (handlerFor; with no title, a growing .mov handler gets the default); it never remuxes for
    // this alone.
    const mp4NameCarry = (s, typeLetter, idx, container) => {
        // On a matroska output, a track named beside a TITLE SimpleTag in its place (trackNameBesideTitleTag, titleTagInNamePlace): ffmpeg reads the tag in
        // the Name's place and writes it as the Name on every remux, and keeps no TITLE tag beside a Name - so the track's one name is restated, and
        // titleTagLine says what it leaves of the tag. A 'TITLE-<lang>' beside the Name rides the remux as it is.
        const named = isMatroskaFamily(container) && titleTagInNamePlace(s) ? trackNameBesideTitleTag(s) : '';
        if (named) {
            return { s, title: named, move: null, said: escMeta(named), fate: 'tag', why: '', cut: false,
                args: ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(named)}"` };
        }
        if (!isMp4Family(container)) return null;
        // A title box that reads as boilerplate names no track (mediaTitleFor), but the remux drops it, so it is restated as it is.
        const title = mediaTitleFor(s) || titleBesideHandler(s);
        const handler = String(getTagCI(s.tags, 'handler_name') || '');
        const grows = movHandlerGrows(handler, container);
        const next = title ? handlerFor(s, title, container) : (grows ? '' : null);
        // A handler already holding the name as escMeta writes it is left alone: rewritten, it changed no byte and claimed a move (measured).
        const move = next === null || next === handler || (next && escMeta(next) === handler) || (!next && !grows) ? null : next;   // '' is the muxer's default
        const beside = move === null && !!titleBesideHandler(s);
        // The name goes into the title box as well, in escMeta's form (a double quote, a backslash, a control character and '<io>' rewritten): whole wherever
        // the box takes it, else the .mov cut where the box takes that (titleBoxTakes). So no pass that moves a name leaves the box without it (measured:
        // 'Descriptive<TAB>Audio' moved into the handler left both Apple boxes empty until the next remux), a name the handler already holds keeps the box it
        // had (measured: 'Director "Cut" Commentary' in both boxes lost it to every carrier's remux), and a long ASCII .mov name stays whole there beside its
        // cut (measured: with a tab in it the box got the cut). A name stays out of the box only where titleBoxTakes refuses every form: a non-ASCII .mov name
        // whose cut is not ASCII. ffmpeg never reads a title box back, so mediaInfo's Title is a title-box name's only reading, and a line break in it comes
        // back as ' / ' (mediaInfoFill): the carry restates 'Audio / Description' for a stored 'Audio<LF>Description', a stated residual. A handler's line
        // break, which ffprobe shows, is written as escMeta writes it, a space.
        const said = [title, move].map((x) => escMeta(x || '')).find((x) => x && titleBoxTakes(x, container)) || '';
        // Beside a handler the carry keeps, the title box is a name's only place (fate): one escMeta alters is restated in escMeta's form, and one the .mov box
        // refuses is lost - each logged with the reason the handler stays (why: a role the name does not give, a name that reads as boilerplate, or a handler
        // that already holds it), and read back as the next pass reads it (mp4NameCarryView, track title carry; measured: 'Descriptive<TAB>Audio' beside a
        // 'Commentary' handler was dropped by every carrier's remux, and Expected results still promised its /description).
        const fate = beside && said !== title ? (said ? 'restated' : 'lost') : '';
        const why = next === null ? 'role' : (next ? 'held' : 'boilerplate');   // why a handler the carry keeps stays
        if (!said && move === null && !fate) return null;
        const args = (said ? ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(said)}"` : '')
            + (move === null ? '' : ` -metadata:s:${typeLetter}:${idx} "handler_name=${escMeta(move)}"`);
        return { s, title, move, said, fate, why, cut: !!move && move !== title, args };
    };
    // ===== END SHARED: track title =====
    // #endregion

    // #region SHARED helpers (1 section: sidecar name tokens)
    // ===== SHARED [clean_and_remux, sub_worker]: sidecar name tokens =====
    // -=-=-= DISPOSITIONS / DISP_ALIAS / DISP_IGNORE / DISP_TOKENS / DISP_AMBIGUOUS_LANG  [clean_and_remux, sub_worker] =-=-=-
    // Dispositions encoded as filename tokens, in fixed order. `ff` is the ffmpeg -disposition name restored on import; `flags` are the ffprobe
    // disposition keys that, when set on the source, emit this token on extract. They differ only for SDH: hearing_impaired and captions are
    // the same closed-captions role, but captions has no Matroska flag and does not survive an mp4->mkv round-trip (the muxer silently drops
    // +captions), so BOTH normalise to the container-portable hearing_impaired - extract emits a single 'sdh' token for either flag and import
    // restores hearing_impaired - on a .webm, which keeps no hearing_impaired flag, the WebVTT captions kind (sub_worker's dispFfOf). The
    // human-readable role also survives in the encoded title. `default` is deliberately NOT tracked: muxers
    // auto-manage it (mp4 forces default on the first subtitle), so it is neither identity-stable nor ours. Nothing in the stack normalises a
    // SUBTITLE default either - stream_ordering's +default/-default pass is audio-only, and only READS the flag for subtitle_first=default_tagged
    // - so whatever a muxer stamped survives untouched. That is deliberate: "no subtitle is default" and "the first forced subtitle is default"
    // are both defensible library policies, and silently clearing a user's forced-subtitle default would change what every player auto-enables.
    const DISPOSITIONS = [
        { token: 'forced',      ff: 'forced',           flags: ['forced'] },
        { token: 'sdh',         ff: 'hearing_impaired', flags: ['hearing_impaired', 'captions'] },
        { token: 'commentary',  ff: 'comment',          flags: ['comment'] },
        { token: 'descriptive', ff: 'descriptions',     flags: ['descriptions'] },
    ];
    // Media-server filename tokens that normalise onto a canonical token above (parse-only; extract never writes them), so a sidecar named by
    // Plex/Jellyfin/Emby - or by hand from their docs - still imports with its role intact instead of being read as the language and skipped:
    // 'cc' and 'hi' are the closed-captions/hearing-impaired spellings of SDH, 'foreign' is Jellyfin's and Emby's spelling of forced.
    const DISP_ALIAS = { cc: 'sdh', hi: 'sdh', foreign: 'forced' };
    // Parse-only tokens recognised so they aren't mis-read as the language, but carrying NO disposition: 'default' is muxer-managed, not a role we track or
    // restore.
    const DISP_IGNORE = new Set(['default']);
    const DISP_TOKENS = new Set([...DISPOSITIONS.map((d) => d.token), ...Object.keys(DISP_ALIAS), ...DISP_IGNORE]);
    // Alias tokens that are ALSO a real ISO 639-1 code, so the right-to-left disposition strip must not swallow the language slot: 'hi' is both the
    // hearing-impaired flag and Hindi. Such a token counts as a disposition only when a real language sits immediately before it (Jellyfin's own rule),
    // so <name>.en.hi.srt is English+SDH while <name>.hi.srt stays a Hindi track. See the guard in parseSidecar's disposition loop.
    const DISP_AMBIGUOUS_LANG = new Set(['hi']);
    // -=-=-= EXTRA_DISPOSITIONS / EXTRA_TOKENS  [clean_and_remux, sub_worker] =-=-=-
    // Flags that must survive the round trip but that NO media server understands as a filename token. Written BEFORE the language: the servers parse
    // right-to-left from the extension, so everything ahead of the language is ignored while the trailing <lang>[.disp] they do read stays as it was - an
    // unknown flag in the trailing run is how a sidecar silently stops being imported at all. Both are raw ffmpeg dispositions, NOT dispositionTypes roles
    // (that table scopes each to audio), yet mkvtoolnix writes either on a subtitle; reading the raw flag is deliberate, so extract -> import returns the
    // stream exactly as found regardless of any title keyword or tagging setting. Container limits, measured on jellyfin-ffmpeg: Matroska keeps both
    // through a -c copy remux; mp4 drops 'original' whatever we do, and cannot tell 'visual_impaired' from 'descriptions' (either reads back as BOTH). The
    // tokens use ffmpeg's own spelling, and an underscore is something a language token can never be (sidecarLangToken restricts to [a-z0-9-]), so
    // 'visual_impaired' cannot collide with a language the way 'hi'/Hindi does.
    const EXTRA_DISPOSITIONS = [
        { token: 'original',        ff: 'original',        flags: ['original'] },
        { token: 'visual_impaired', ff: 'visual_impaired', flags: ['visual_impaired'] },
    ];
    const EXTRA_TOKENS = new Set(EXTRA_DISPOSITIONS.map((d) => d.token));
    // -=-=-= SERVER_FLAG_TOKENS / handlerOnlyDisp / dispTokensOf / extraTokensOf  [clean_and_remux, sub_worker] =-=-=-
    // The only tokens a media server both documents and acts on, and Plex takes just ONE of them - ".forced.sdh" is not a supported combination, it is one
    // or the other. So the trailing run carries a single flag and every other role joins 'original' ahead of the language, where servers do not look and
    // nothing is lost because our own parser reads both regions. forced wins the slot over sdh: it drives AUTOMATIC selection (a forced track that loses
    // its flag stops appearing by itself), whereas an unlabelled SDH track is still listed and selectable, just not marked.
    const SERVER_FLAG_TOKENS = ['forced', 'sdh'];
    // Whether a field a sidecar keeps nothing of - s's handler_name (read as the name it holds, handlerTextOf), a description, ffprobe's or mediaInfo's, or a
    // matroska TITLE SimpleTag other than the track's one name (titleTagText; a 'TITLE-<lang>' on a track with no Name came back a plain track) -
    // names d's role and `title`, the title the sidecar carries, does not: sub_worker's sidecar title, a name in whichever box it sits, and by default - for
    // clean_and_remux's .mks export, which spells no title - the title other than the handler (titleBesideHandler) that the .mks carries. A sidecar keeps no
    // handler or description, so a role only one of them names gets its token, or it is gone after import (measured: an mp4 handler 'SDH', an mkv
    // HANDLER_NAME 'Forced' and an mkv DESCRIPTION 'Commentary' all came back as plain tracks). Judged against the carried title, the spelling
    // does not depend on which box or container holds the name: 'English (SDH)' in an mp4 handler and the same mkv title both give
    // '<video>.s2.English (SDH).eng.srt' (measured: judged against the title beside the handler, the mp4 one got '.sdh' too, and a container conversion then
    // made the next extract write a second sidecar). A role is named by the words of any flag its token stands for, so captions words give sdh too
    // (measured: a real .mov's 'Apple Closed Caption Media Handler' extracted with no token, and the import brought back a plain track).
    const handlerOnlyDisp = (d, s, title = titleBesideHandler(s)) => {
        const keywords = d.flags.flatMap((f) => dispositionTypes[f]?.keywords || []);
        const lost = [handlerTextOf(getTagCI(s.tags, 'handler_name')), getTagCI(s.tags, 'description'),
            mediaInfoText(getTagCI(mediaInfoFor(s)?.extra, 'description')),
            titleTagKey(s) && (!titleTagInNamePlace(s) || trackNameBesideTitleTag(s)) ? titleTagText(s) : ''];
        return lost.some((t) => matchesKeyword(String(t || '').toLowerCase(), keywords)) && !matchesKeyword(String(title || '').toLowerCase(), keywords);
    };
    // The token rule for every sidecar either plugin names: one canonical token per role the stream's real flags carry (sdh covers hearing_impaired OR
    // captions), plus each role onlyDisp (handlerOnlyDisp by default) adds. Names live in titles and flags come from clean_and_remux (the owner's rule): a role
    // a title gives is left to that title, which the name holds (encoded) and the import restores, and clean_and_remux's tag_disposition, when enabled, makes a
    // flag of it on its next pass, after which the sidecar carries the token - so an import adds no flag the track lacked, and a media server sees forced or
    // SDH from a track's name only once tag_disposition is on. sub_worker decides its tokens in sidecarBasename alone: this rule, and the one exception its
    // 255-byte name cap makes.
    const dispTokensOf = (s, onlyDisp = handlerOnlyDisp) => DISPOSITIONS.filter((d) => d.flags.some((f) => s.disposition?.[f] === 1) || onlyDisp(d, s))
        .map((d) => d.token);
    const extraTokensOf = (s) => EXTRA_DISPOSITIONS.filter((d) => d.flags.some((f) => s.disposition?.[f] === 1)).map((d) => d.token);
    // -=-=-= sidecarNameTokens  [clean_and_remux, sub_worker] =-=-=-
    // The language slot and the two disposition runs that surround it, for any sidecar either plugin writes - the part of a sidecar name that BOTH a media
    // server and our own parseSidecar read as authoritative. Shared because the writer and the reader live in different files: clean_and_remux exports the
    // styled .mks bundle and sub_worker imports it. parseSidecar treats a bundle's filename as the disposition authority and writes an explicit
    // `-disposition 0` when the name carries no token, so a vocabulary that drifts on either side silently clears every role the .mks really holds - sdh,
    // commentary, descriptive, original, visual_impaired - on the way back in, and the styled export has already deleted the source stream. Assembly stays
    // local, since only sub_worker writes a title token; the VOCABULARY and the collision escape live here, where both sides read one copy.
    const sidecarNameTokens = (s, onlyDisp) => {
        // lang is the only metadata-derived component read raw (a title is percent-encoded, disp/ext are fixed enums); the shared sidecarLangToken restricts
        // it to the language-code charset - see its definition for why. parseSidecar round-trips it unchanged, a valid code (en/eng/pt-br) already fitting.
        const langRaw = sidecarLangToken(s);
        // A tag that sanitises to a disposition-token word (a crafted tags.language of "forced"/"sdh"/etc.) would be consumed as a trailing disposition by
        // parseSidecar's right-to-left disp strip, nulling or corrupting the reimport - collapse any such collision to 'und' so the fixed language slot can
        // never be shaped like a disposition token. A DISP_AMBIGUOUS_LANG token is exempt because it is also a real language code: the disp strip only reads
        // it as a disposition when a real language sits immediately before it, so a Hindi track keeps 'hi' here rather than losing its language to 'und'.
        // The bundle mark is the third word the slot must never spell: an image-subtitle export carries no mark, so a language of 'styled' after a flag
        // token ('.visual_impaired.styled.mks') read back as a styled bundle and muxed the picture subtitle this pass removed straight back in.
        const lang = ((DISP_TOKENS.has(langRaw) && !DISP_AMBIGUOUS_LANG.has(langRaw)) || EXTRA_TOKENS.has(langRaw) || langRaw === STYLED_BUNDLE.mark)
            ? 'und' : langRaw;
        const roles = dispTokensOf(s, onlyDisp);
        const trailing = SERVER_FLAG_TOKENS.find((t) => roles.includes(t));   // at most one, and only a token every server documents
        // Everything else - a second server flag Plex could not have taken anyway, plus our own roles - rides ahead of the language beside 'original'.
        const extra = extraTokensOf(s).concat(roles.filter((t) => t !== trailing));
        return { lang, pre: extra.length ? `.${extra.join('.')}` : '', disp: trailing ? `.${trailing}` : '' };
    };
    // ===== END SHARED: sidecar name tokens =====
    // #endregion

    // This stream's hidden export filename, ".<video>.s<index>.<lang>[.forced][.<mark>].<ext>" - the shape sub_worker's own sidecarBasename writes and
    // parses back. The dot makes Plex/Jellyfin ignore it; Emby scans dotfiles, so an exported .mks needs a .embyignore entry there (called out in the
    // remove_imagesubs tooltip). `mark` carries sub_worker's bundle token on a STYLED-subtitle export - what tells its import to read the file back as a
    // bundle, fonts and all, which makes the export a round trip rather than a one-way archive; an image-subtitle export deliberately has none, so
    // importing one can never re-add the picture subtitle this pass just removed.
    const sidecarBasename = (ffstream, ext, mark) => {
        // Every other token comes from the shared sidecarNameTokens (see there for why its vocabulary must match sub_worker's importer). No title token:
        // the .mks carries its title through the -c copy, and import only overwrites a title the name spells.
        const { lang, pre, disp } = sidecarNameTokens(ffstream);
        return `.${videoBase}.s${ffstream.index}${pre}.${lang}${disp}${mark ? `.${mark}` : ''}.${ext}`;
    };

    // #region SHARED helpers (1 section: recovered marker vocabulary)
    // ===== SHARED [clean_and_remux, stream_ordering, video_clean]: recovered marker vocabulary =====
    // -=-=-= RECOVERED_TAG  [clean_and_remux, stream_ordering, video_clean] =-=-=-
    // The format-level tag clean_and_remux stamps on every recover_bad_* remux, and a cross-plugin marker whose spelling is executable code in three files
    // (awk_cc has its own shared section; awk_video, awk_vq, awk_loudnorm and awk_sub_worker are each single-plugin). clean_and_remux reads it back to stay
    // idempotent; stream_ordering reads it to soften BOTH truncation verdicts from a failFile quarantine to a warning that accepts the file for review,
    // because a recover_bad_* repair of a truncated source legitimately reports a shorter or absent duration - so a reader that stopped matching would
    // quarantine every salvaged file in a loop the user cannot break (fixed tolerance, no relaxing input); video_clean reads it to keep a job whose recovery
    // repaired the video out of guard_shrink_savings' size verdict, whose restore would bring the unrepaired original back. SHARED because a writer and a
    // reader whose vocabularies drift fail SILENTLY. Only the KEY needs guarding - every read is getTagCI (case-insensitive) and tests only non-emptiness
    // and equality with the library original's value, so no VALUE format can drift. Interpolate it into the log lines that NAME the tag too, or a rename
    // here leaves user-facing text pointing at a key nothing writes any more.
    const RECOVERED_TAG = 'awk_recovered';
    // ===== END SHARED: recovered marker vocabulary =====
    // #endregion

    // #region SHARED helpers (2 sections: closed-caption handoff … imported caption track)
    // ===== SHARED [clean_and_remux, sub_worker, video_clean]: closed-caption handoff =====
    // -=-=-= CC_TAG / CC_TOKENS / ccTokensOf  [clean_and_remux, sub_worker, video_clean] =-=-=-
    // The cross-plugin channel for embedded closed captions. They live in the video BITSTREAM rather than in a stream list, so sub_worker can read them out
    // to a sidecar or a subtitle track but can only DELETE them where its own -c copy pass may filter the bitstream (H.264, not HDR, not Dolby Vision);
    // video_clean is the only plugin that re-encodes video, so it is the only one that can be rid of them on anything else. The request therefore travels in
    // a global CC_TAG tag on the file, written by sub_worker and read by video_clean - and by clean_and_remux, whose subtitle filters would otherwise drop an
    // imported caption track unnoticed. It is SHARED so a token added or renamed on one side cannot go missing on the other: a writer and a reader whose
    // vocabularies drift fail SILENTLY, leaving the captions in the file twice. Deliberately not the awk_sub_worker marker - that is a list of sidecar PATHS
    // whose reader matches entries against paths, so a flag word pushed in there would be read as a filename.
    const CC_TAG = 'awk_cc';
    //   strip    - the captions are out (a sidecar or a subtitle track holds them) but the bitstream copy is still there; drop it on the next re-encode.
    //   removed  - the captions are out AND the bitstream copy went with them in that same pass: the fact paired with the `strip` request, telling every
    //              later pass there is nothing left to act on. It changes no encode command - video_clean probes and carries captions as on an untagged
    //              file - so the tag carried onto a video that still holds captions (an outside tool's re-encode keeps global tags) cannot drop them.
    //   none     - both caption fields were read and neither decoded to CEA-608 text, so no later pass need pay for that decode again. sub_worker's own
    //              memo: video_clean ignores it, because ffmpeg reads only CEA-608 and a CEA-708-only service reads empty on both fields (cea708_dtv.mpg,
    //              89+12 valid 708 triplets), so dropping the caption data on `none` would destroy a service nothing can extract.
    //   decoded  - a read of field 1 finished; decoded2 - a read of field 2 finished. sub_worker reads both, and counts field 1 as read under decoded2 alone
    //              too (an earlier build read field 2 into the field-1 name after an empty first read). Its own progress memos, stamped by the pass that
    //              runs the read: an empty sidecar with neither behind it was left by an interrupted read, not by an empty channel. Every other reader
    //              ignores them.
    //   fp:<id8>.<dig> - the video field 1 was read from (the video fingerprint section). An fp with no read token beside it is a read video_clean
    //              withdrew because the video changed under its request, so sub_worker reads the captions of the video that is there.
    //   imported - the captions are already embedded as a real subtitle track, so sub_worker must not read them out a second time. On Matroska each
    //              track sub_worker imports also carries awk_cc=imported in its own tags (the imported caption track section).
    const CC_TOKENS = { strip: 'strip', removed: 'removed', none: 'none', decoded: 'decoded', decoded2: 'decoded2', imported: 'imported' };
    // The value is a COMMA LIST and every reader splits it, because the states genuinely combine: an imported round trip that could not strip in its own pass
    // records `imported,strip` - and `imported,removed` where it could. An empty channel records `none` - it never owes a strip. A writer therefore EXTENDS
    // the tag rather than replacing it with one token - a whole-value overwrite would erase a pending request instead of deferring it. A REQUEST is retired
    // by whoever SERVES it, and only then: sub_worker's in-pass strip or video_clean's encode rewrites `strip` to `removed`, taking the fp with it. Without
    // that the tag only ever grows, and a satisfied request is indistinguishable from a fresh one - a file that later regains captions (a re-muxed capture,
    // an external tool re-inserting A53 SEI) has them dropped by a request answered encodes ago. `none` and `imported` are never retired: memos about the
    // file, not requests, they stay true for its life - bar video_clean's clear of a request whose caption track is gone, which keeps only the fp.
    const ccTokensOf = (tags) => getTagCI(tags || {}, CC_TAG).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    // ===== END SHARED: closed-caption handoff =====

    // ===== SHARED [clean_and_remux, video_clean]: imported caption track =====
    // -=-=-= importedCaptionTracks  [clean_and_remux, video_clean] =-=-=-
    // The subtitle tracks holding the closed captions sub_worker imported - the only copy left IN the video once the bitstream copy is stripped or owed a
    // strip. A track sub_worker imported into Matroska carries awk_cc=imported in its own tags, which stays true after language_fill gives it a language.
    // Beside the marked ones, under the file's global `imported` memo, every non-image subtitle that is hearing impaired and und or untagged counts too:
    // the shape sub_worker writes them in (CEA-608 carries no language), and the only sign an mp4 (which keeps no track tag) or an import from before the
    // mark carries. isImage(codec) names the image subtitle codecs the caller leaves out.
    const importedCaptionTracks = (streams, tokens, isImage) => (streams || []).filter((s) => codecTypeOf(s) === 'subtitle' && !isImage(codecNameOf(s))
        && (ccTokensOf(s.tags).includes(CC_TOKENS.imported)
            || (tokens.includes(CC_TOKENS.imported) && s.disposition?.hearing_impaired === 1 && ['', 'und'].includes(resolveLang(s)))));
    // ===== END SHARED: imported caption track =====
    // #endregion

    // The closed-caption tracks sub_worker imported (the imported caption track section): dropping one leaves the captions at most in sub_worker's hidden
    // staging sidecar - kept while the import job is still running (sub_worker does not re-import a track removed after its import), deleted once an
    // accepted import is confirmed - which neither filter below may do without saying so.
    const ccImportedTracks = new Set(importedCaptionTracks(file.ffProbeData.streams, ccTokensOf(file.ffProbeData.format?.tags), isImageSub)
        .map((s) => s.index));
    const isImportedCaptionTrack = (s) => ccImportedTracks.has(s.index);

    // The both-probe channel layout (resolveChannelLayout), lowercased, so tag_title can name the layout even when ffprobe omits channel_layout.
    const channelLayoutStr = (ffstream) => resolveChannelLayout(ffstream).toLowerCase();
    // ffprobe's canonical layout strings for 2.1 and 3.1 are literally "2.1"/"3.1" - no "lfe" substring - so a plain .includes('lfe') misses them. Treat a
    // nonzero digit after the first dot ("2.1","3.1","5.1","7.1.4") as an LFE too, alongside the verbose "FL+FR+LFE" form.
    const layoutHasLfe = (ffstream) => { const s = channelLayoutStr(ffstream); return /lfe/.test(s) || /^\d+\.[1-9]/.test(s.trim()); };
    // tag_title's channel label, read from the stream's LAYOUT so it names what the layout is rather than the conventional layout for its channel count.
    // channelLabel alone reads the LFE only at 3-4 channels, so it names 7.0 '6.1', 6.0 '5.1', 4.1 '5.0' and octagonal '7.1' - it stays as it is because
    // audio_clean names downmix TARGETS with it, where a 6ch result is 5.1. Read in order:
    // - ffprobe's numeric names (7.0, 6.0(front), 4.1, 5.1(side), 5.1.2, 7.1.4, 7.2.3, 22.2) as-is, when their digits add up to the channel count;
    // - its other named layouts, mapped to the same form (NAMED_LAYOUT_LABEL, from `ffmpeg -layouts` on jellyfin-ffmpeg 7.1.4);
    // - a verbose ffprobe/mediaInfo listing, counted: LFE/LFE2 are the LFE digit, T-prefixed (top) and Vh (vertical height) channels the height digit;
    // - with no layout at all 7.0 cannot be told from 6.1, so a title that already names a layout of the right size is kept, and only an unnamed track
    //   gets the conventional label - otherwise a correct "7.0" would be overwritten with "6.1".
    const NAMED_LAYOUT_LABEL = { quad: '4.0', 'quad(side)': '4.0', hexagonal: '6.0', octagonal: '8.0', cube: '4.0.4', hexadecagonal: '10.0.6' };
    const labelChannelSum = (label) => String(label).split('.').reduce((n, d) => n + Number(d), 0);
    const layoutLabel = (ffstream, channels, currentTitle) => {
        if (channels <= 2) return channelLabel(channels, false);
        const s = channelLayoutStr(ffstream).trim();
        const numeric = /^(\d+\.\d+(?:\.\d+)?)(?:\([a-z-]+\))?$/.exec(s);
        if (numeric && labelChannelSum(numeric[1]) === channels) return numeric[1];
        const named = NAMED_LAYOUT_LABEL[s];
        if (named && labelChannelSum(named) === channels) return named;
        if (s) {
            let main = 0; let lfe = 0; let height = 0; let section = '';
            for (const tok of s.split(/[\s+,/]+/).filter(Boolean)) {
                if (tok.endsWith(':')) { section = tok; continue; }
                if (/^lfe\d?$/.test(tok)) lfe += 1;
                else if (section === 'top:' || /^(t[fbs]?[lrc]|tc|vh[lrc])$/.test(tok)) height += 1;
                else main += 1;
            }
            if (main + lfe + height === channels) return height ? `${main}.${lfe}.${height}` : `${main}.${lfe}`;
            return channels >= 5 ? (layoutHasLfe(ffstream) ? `${channels - 1}.1` : `${channels}.0`) : channelLabel(channels, layoutHasLfe(ffstream));
        }
        const base = stripDispositionWords(currentTitle);
        if (/^\d/.test(base) && bareChannelRegex.test(base) && labelChannelSum(base) === channels) return base;
        return channelLabel(channels, false);
    };

    // >3-period 'busy'/scene-release title test (>4 dot-segments). Callers apply it AFTER role tagging, per the cleanStreamTitle note.
    const tooManyPeriods = (s) => (s || '').trim().split('.').length > 4;

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
        const codec = codecNameOf(s);
        const parts = attachmentNameParts(s);
        if (IMAGE_CODECS.includes(codec) || parts.mime.startsWith('image/') || IMAGE_EXTS.includes(parts.ext)) return 'image';
        if (isFontAttachment(s, parts)) return 'font';
        return 'other';
    };

    // tag_disposition: the title keywords to promote into real +flags (audio and subtitle share the predicate). A promotion must PERSIST in the
    // destination container, or the flag never "takes" and the plugin re-promotes every pass - an infinite remux loop. Empirically (jellyfin-ffmpeg):
    // Matroska has no captions/lyrics flag, MP4/MOV no original/lyrics flag, and `-disposition +karaoke` reads back 0 from both - a +flag for those is
    // silently dropped by the muxer. captions is the SDH synonym of hearing_impaired (which persists in both containers), so hearing_impaired is promoted
    // in its place; a role with no storable flag is skipped - its title keyword still drives the classifiers, summary and sort order, so nothing is lost
    // but a non-persisting write. The set lists only flags with no storable target: lyrics/karaoke/clean_effects (neither container - clean_effects
    // measured on jellyfin-ffmpeg 7.1.4, `+clean_effects` reads back 0 from both, which is why its title label is the role's only durable carrier),
    // original (mp4 only). `keys` narrows the roles considered; by default every role the stream carries.
    const unstorableDisp = { mkv: new Set(['lyrics', 'karaoke', 'clean_effects']), mp4: new Set(['original', 'lyrics', 'karaoke', 'clean_effects']) };
    const promoteTarget = (key) => (key === 'captions' ? 'hearing_impaired' : key);   // canonicalise the SDH synonym to the container-portable flag
    const dispositionsToPromote = (s, type, keys = dispKeysFor(type).filter((k) => hasDisposition(s, k))) => {
        const out = []; const seen = new Set();
        for (const key of keys) {
            if (!dispositionTypes[key].tag) continue;
            const target = promoteTarget(key);
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
    // A track's title as this command finds it: its title tag, else mediaTitleFor's - and where the output keeps one title, a track named beside a TITLE
    // SimpleTag goes by its one name (trackNameBesideTitleTag): every write of a tag in the Name's place, an mp4 one of a 'TITLE-<lang>' beside it. Read as
    // the title tag, a 'title' SimpleTag was written over the Name, and read as the Name alone, an mp4 lost the role only a 'TITLE-<lang>' gave (measured).
    const sourceTitleOf = (s) => ((dstContainer === 'mp4' || titleTagInNamePlace(s)) && trackNameBesideTitleTag(s)) || s.tags?.title || mediaTitleFor(s)
        || '';
    // A track's descriptions, ffprobe's and mediaInfo's. mp4 keeps neither (measured 2026-11-09 on jellyfin 7.1.4: an mkv DESCRIPTION is gone after a copy
    // into mp4), so on an mp4 target a role only a description gives is a cleared one (clearedOnlyRoles), as a sidecar's is (handlerOnlyDisp).
    const descriptionsOf = (s) => [getTagCI(s.tags, 'description'), mediaInfoText(getTagCI(mediaInfoFor(s)?.extra, 'description'))];
    // The text a track's role still lives in once this command runs: the title it WRITES, never the source's (a busy-title clear removes that on the same
    // command, so counting it would let a role carried by both title and handler go with neither), plus, off mp4, the descriptions and a 'TITLE-<lang>'
    // beside the Name, which a matroska remux keeps (titleTagInNamePlace), each a field of its own (roleFieldsOf: a keyword never spans two).
    const survivingRoleFields = (s, newTitle) => roleFieldsOf([newTitle,
        ...(dstContainer === 'mp4' ? [] : [...descriptionsOf(s), titleTagInNamePlace(s) ? '' : titleTagText(s)])]);
    // The handler_name this remux clears (mkv) or replaces (mp4, see emitHandlerMeta) can be the ONLY place a role lives: a QuickTime-family muxer writes the
    // track name ('Commentary') into the mp4 handler box, and mediaInfo's Title is that handler echoed, so one wipe takes the role out of both probes and every
    // later plugin reads the track as a plain one. So can a busy title remove_busytitle clears ('Movie.2020.Director.Commentary.1080p'), and on an mp4
    // target a description (descriptionsOf). clearedOnlyRoles returns the roles those carriers hold that neither a real flag nor surviving text
    // (survivingRoleFields) still holds, the title read as sourceTitleOf has it. 'default' is a selection flag, not a role.
    const clearedOnlyRoles = (s, type, newTitle, handlerCleared) => {
        const handler = handlerCleared ? String(getTagCI(s.tags, 'handler_name') || '').toLowerCase() : '';
        const title = String(sourceTitleOf(s)).toLowerCase();
        const described = dstContainer === 'mp4' ? roleFieldsOf(descriptionsOf(s)) : [];
        if (!handler && !title && !described.length) return { roles: [], viaTitle: false, viaHandler: false, viaDescription: false, by: {} };
        const surviving = survivingRoleFields(s, newTitle);
        // One role can live under two keys (captions is the SDH synonym of hearing_impaired - promoteTarget), so it survives when the surviving text
        // matches ANY key of its class: a 'CC' title rebuilt to 'SDH' still carries the role, and promoting a flag for it would be an unrequested write.
        const survives = (k) => dispKeysFor(type).some((j) => promoteTarget(j) === promoteTarget(k)
            && surviving.some((t) => matchesKeyword(t, dispositionTypes[j].keywords)));
        const holds = (t, k) => matchesKeyword(t, dispositionTypes[k].keywords);
        const roles = dispKeysFor(type).filter((k) => k !== 'default' && s.disposition?.[promoteTarget(k)] !== 1
            && [handler, title, ...described].some((t) => holds(t, k)) && !survives(k));
        // Each role's carrier, the title first, as the lines name them.
        const by = Object.fromEntries(roles.map((k) => [k, holds(title, k) ? 'title' : (holds(handler, k) ? 'handler' : 'description')]));
        return { roles, viaTitle: roles.some((k) => holds(title, k)), viaHandler: roles.some((k) => holds(handler, k)),
            viaDescription: roles.some((k) => described.some((t) => holds(t, k))), by };
    };

    // remove_sub_sdh safety guard. A "plain" subtitle carries no commentary/descriptive/SDH/lyrics role and is not FORCED: a forced track holds only
    // the foreign-language lines, so counting it as the survivor deleted the only full subtitle on the common SDH-plus-forced disc layout. A track
    // titled just "Signs" is indistinguishable from a plain one and stays one. On if_plain_survives an SDH/CC subtitle goes only when its language
    // still has a plain subtitle that SURVIVES every whole-file drop reason (subDroppedRegardlessOfLanguage), so extras go and the last usable track
    // of that language stays; on `all` it goes regardless, and ending with no subtitles is an accepted outcome there. The language it filters on is
    // resolveWorkLang's (beside fillApplies), so it cannot drift from the tag canonicalLangMeta writes. Audio has no equivalent: audio_clean's
    // downmix_secondary owns audio-description removal. plainSubLangs is FILLED after the muxability gate below (the format-filter test reads
    // dstContainer, which mkv_fallback can rewrite); sdhRemoved is the single predicate every site consults, so the tiers cannot drift across sites.
    const plainSubLangs = new Set();
    const isPlainTrack = (s) => !isCommentary(s) && !isDescriptive(s) && !isSdh(s) && !isLyrics(s) && !hasDisposition(s, 'forced');
    const hasPlainSameLang = (set, workLang) => set.has(langKey(workLang));
    const sdhRemoved = (s, workLang) => removeSubSdh !== 'disabled' && isSdh(s)
        && (removeSubSdh === 'all' || hasPlainSameLang(plainSubLangs, workLang));
    // The two filters that discard a subtitle on its own merits rather than because of its codec or the container - language_sub and remove_sub_sdh - as a
    // predicate the remove_imagesubs=export sites can consult BEFORE writing anything. Mirrors the stream loop's own tests exactly, so the answer here and
    // the drop it takes there can never disagree. Only the export needs it: exporting is one-way, so a sidecar written for a track those filters were about
    // to discard is a permanent file (and, on an unmapped node, an upload) giving the user an OCR job for a language they excluded.
    const subFilterDrops = (s) => {
        const workLang = resolveWorkLang(s);
        if (subLanguages.length > 0 && !langListMatch(workLang, subLangKeys)) return true;
        return sdhRemoved(s, workLang);
    };

    // Declared outside the try so the catch below can still reach it: workDone is buffered so the log reads as one block, but failFile/failUnexpected build
    // the quarantine message from response.infoLog ALONE - so a terminal that THROWS has to flush it itself, or the error-queue entry loses the per-stream
    // lines that say WHICH streams the abort is about. Any throw after a workDone write must go through failWithBuffers: an AwkFailFile captures infoLog
    // when it is thrown, so the catch's flush reaches only an UNEXPECTED error's message, and the pre-check failFile calls above the stream loop are safe
    // only because workDone is still empty there. The header is conditional because a pre-check that aborts before any stream work has nothing to introduce.
    let workDone = '';
    const flushBuffers = () => {
        if (workDone) response.infoLog += '☒Run stopped here - the decisions it had made up to this point follow\n';
        response.infoLog += workDone; workDone = '';
    };
    const failWithBuffers = (msg) => { flushBuffers(); failFile(msg); };

    // One guard around all the per-file work (the input summary, the muxability / guard_audio_language / language_fill_mode pre-checks, the unmapped-node
    // image-sub export, the per-stream loop and the font/metadata/preset build): a deliberate failFile abort (AwkFailFile) rethrows unchanged, and any
    // UNEXPECTED error fails the file too — annotated and carrying the full infoLog — instead of silently skipping. The summary walk is inside it because it
    // reads both probes for every stream, so it is real work that can throw. (Earlier input validation runs before this and fails via failFile directly.)
    try {
        // Summarise the input streams exactly as they arrived, before any removal/remux/quarantine. This plugin runs first, so it captures the file as
        // received; reading it alongside the stream-ordering plugin's output line shows where a file came from and where it ended up. Emitted ahead of the
        // muxability / guard_audio_language / language_fill_mode pre-checks so a quarantine from any of them still carries the input picture.
        response.infoLog += `☐Input streams: ${summariseAll(streams)}\n`;
        response.infoLog += trackNamesUnreadLine(streams);

        // method_unmuxable: the destination muxer cannot store one of this file's codecs, so a -c copy remux would die on an opaque ffmpeg error. Runs
        // FIRST among the pre-checks - it is the most fundamental "can this even be written" question - and, load-bearing, before anything reads
        // dstContainer, since mkv_fallback rewrites it. Audio and video only: the three subtitle tables above already handle subtitles, by conversion
        // where one exists and by dropping where none does, and that behaviour is not this input's to override.
        const unmuxableDrops = new Set();
        {
            const isAvStream = (s) => ['audio', 'video'].includes(codecTypeOf(s));
            const avStreams = streams.filter(isAvStream);
            const offenders = avStreams
                .map((s) => ({ s, codec: codecNameOf(s) }))
                .map((o) => ({ ...o, cls: unmuxableClass(o.codec) }))
                .filter((o) => o.cls);
            if (offenders.length) {
                const names = [...new Set(offenders.map((o) => o.codec))].join(', ');
                // A codec the fallback container cannot store either has nowhere to go, so mkv_fallback degrades to error and says why - silently doing
                // nothing, or silently dropping a track the user asked to keep, would both be worse than stopping. Two ways to end up there: no container
                // accepts the codec ('anywhere'), or MATROSKA is the one refusing it ('mkv'), where falling back to mkv is no answer at all.
                const stuck = offenders.filter((o) => o.cls === 'anywhere' || o.cls === 'mkv');
                // A codec MATROSKA refuses is stuck under mkv_fallback no matter the CURRENT target: unmuxableClass only reports mkv-refusal when the target
                // is already non-mp4, so an mkv-unmuxable codec (mpegh_3d_audio) that muxes into the user's mp4 target is NOT an offender above and would
                // otherwise ride -c copy into the mkv fallback the muxer then rejects with a raw "no tag for codec" error. Fold any such stream into stuck so
                // the fallback degrades to the same clear diagnostic instead. Guarded by offenders.length (this whole block): a file carrying ONLY such a
                // codec has no offender, never falls back, and stays mp4 where it muxes fine - failing it pre-emptively would be wrong.
                if (methodUnmuxable === 'mkv_fallback') {
                    const seen = new Set(stuck.map((o) => o.s.index));
                    for (const s of streams) {
                        const codec = codecNameOf(s);
                        if (isAvStream(s) && MKV_UNMUXABLE.includes(codec) && !seen.has(s.index)) stuck.push({ s, codec, cls: 'mkv' });
                    }
                }
                if (methodUnmuxable === 'mkv_fallback' && stuck.length) {
                    failFile(`[method_unmuxable=mkv_fallback] ${[...new Set(stuck.map((o) => o.codec))].join(', ')} cannot be stored in mkv either,`
                        + ' so there is no container to fall back to - set method_unmuxable=drop to remove '
                        + `${stuck.length > 1 ? 'those streams' : 'that stream'},`
                        + ' or remux this file outside Tdarr');
                }
                if (methodUnmuxable === 'error') {
                    // Offer only the remedies that would clear it. Switching container helps only when the OTHER container stores every audio/video stream
                    // in the file - not just the offenders: a stream that muxes fine into the current target can be the one the other refuses (mpegh_3d_audio
                    // beside an mp4-refused codec). mkv_fallback is the mp4 target's version of the same switch, so it is offered exactly when that holds.
                    const other = dstContainer === 'mp4' ? 'mkv' : 'mp4';
                    const refusedBy = (container, codec) => UNMUXABLE_ANYWHERE.includes(codec) || (container === 'mp4'
                        ? MP4_UNMUXABLE.includes(codec) || (MP4_STRICT_GATED.includes(codec) && !isMp4Family(srcContainer))
                        : MKV_UNMUXABLE.includes(codec));
                    const streamCodecs = avStreams.map(codecNameOf);
                    const stuckInOther = [...new Set(streamCodecs.filter((c) => refusedBy(other, c)))];
                    const keepable = [...new Set(offenders.map((o) => o.codec).filter((c) => !refusedBy(other, c)))];
                    const streamWord = offenders.length > 1 ? 'those streams' : 'that stream';
                    let advice;
                    if (!stuckInOther.length) {
                        advice = `${names} cannot be stored in ${dstContainer} - set container=${other}, or method_unmuxable=drop to remove `
                            + `${streamWord}`
                            + `${dstContainer === 'mp4' ? ' / mkv_fallback to keep just this file in mkv' : ''}`;
                    } else if (!keepable.length && offenders.every((o) => o.cls === 'anywhere')) {
                        advice = `${names} cannot be stored in mkv or mp4 - set method_unmuxable=drop to remove ${streamWord}, or remux this file `
                            + 'outside Tdarr';
                    } else {
                        advice = `${names} cannot be stored in ${dstContainer}, and ${other} cannot store ${stuckInOther.join(', ')} - set method_unmuxable=drop to`
                            + ` remove ${streamWord}${keepable.length ? ` (with container=${other} as well it keeps ${keepable.join(', ')} and drops only`
                            + ` ${stuckInOther.join(', ')})` : ''}, or remux this file outside Tdarr`;
                    }
                    failFile(`[method_unmuxable=error][container=${dstContainer}] ${advice}`);
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

        // Fill the remove_sub_sdh plain-track set (declared above). AFTER the muxability gate because subDroppedRegardlessOfLanguage reads dstContainer, which
        // mkv_fallback rewrites - any earlier and a PGS track would count as format-dropped under the abandoned mp4 target. Still ahead of the
        // language_fill_mode pre-check, which subtracts the SDH tracks this guard will drop. Only if_plain_survives consults the set.
        if (removeSubSdh === 'if_plain_survives') {
            for (const s of streams) {
                if (codecTypeOf(s) !== 'subtitle' || !isPlainTrack(s)) continue;
                if (subDroppedRegardlessOfLanguage(codecNameOf(s))) continue;
                const workLang = resolveWorkLang(s);
                if (subLangKeys.length > 0 && !langListMatch(workLang, subLangKeys)) continue;
                plainSubLangs.add(langKey(workLang));
            }
        }

        // guard_audio_language: an early warning, BEFORE the remux costs anything. audio_clean decides what audio to keep but can only trust a track
        // MARKED 'original' - so when this file carries more than one genuine audio language and marks no original, abort and let the user tag it.
        // Languages fold through langKey; an untagged track counts as the language language_fill would give it, else "und". Secondary tracks
        // (isSecondaryTrack) are excluded - a foreign commentary or karaoke mix says nothing about the original. Counts only tracks that WILL REACH THE
        // OUTPUT, the same rule the language_fill_mode check below states in full. It cuts both ways here: a second language carried only by a track
        // method_unmuxable=drop deletes never reaches audio_clean, so quarantining over it is a stop the user cannot act on; and an 'original' flag
        // sitting on such a track is no answer either, so counting it would wave through exactly the ambiguity this guard is for.
        if (guardAudioLanguage === 'enabled') {
            const audioStreams = streams.filter((s) => codecTypeOf(s) === 'audio' && !unmuxableDrops.has(s.index));
            const genuineLangs = new Set(audioStreams.filter((s) => !isSecondaryTrack(s)).map((s) => langKey(resolveWorkLang(s))));
            // logSafe each token, like every other echo of a container-supplied value: langKey deliberately passes an unrecognised tag through as-is (right for
            // matching), so this set can hold an arbitrary-length, control-character-bearing string, and THIS message is what Tdarr stores in the error queue.
            // Uncapped, a 200k tag carrying a newline produced a 200,351-character entry whose abort line was split across rows with no leading symbol - the
            // infoLog contract break logSafe exists to prevent. summariseStream's tok already caps the same field at 64 on the input-summary line above.
            if (genuineLangs.size > 1 && !audioStreams.some((s) => hasDisposition(s, 'original')))
                failFile(`[guard_audio_language=${guardAudioLanguage}] ${genuineLangs.size} audio languages`
                    + ` (${[...genuineLangs].map((k) => logSafe(k)).join(', ')})`
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
            // A secondary track (isSecondaryTrack) is left out, as guard_audio_language leaves it out: audio_clean never dedups one, so tagging it alike loses
            // nothing, and counting it would fail every file pairing an untagged main track with an untagged commentary.
            const untaggedAudio = streams.filter((s) => codecTypeOf(s) === 'audio' && isUntagged(s) && !isSecondaryTrack(s) && !unmuxableDrops.has(s.index))
                .length;
            if (untaggedAudio > 1) failUntagged(untaggedAudio, 'audio');
            const untaggedSubs = keptByLangFilter(subLangKeys)
                ? streams.filter((s) => codecTypeOf(s) === 'subtitle'
                    && !subDroppedRegardlessOfLanguage(codecNameOf(s)) && isUntagged(s) && !removedBySdh(s)).length : 0;
            if (untaggedSubs > 1) failUntagged(untaggedSubs, 'subtitle');
        }

        let extraArguments = '';
        let nameCarryArgs = '';   // restatements that ride a remux this run makes anyway; never metadataCommand, which sets convert
        let sidecarOut = '';   // remove_imagesubs=export: accumulates the per-image-sub sidecar outputs, prepended to the main output in the preset below.
                               // Stays empty on an unmapped node, where placeSidecars below uploads the exports instead of riding them on the remux.
        let convert = false;
        // The N in -metadata:s:<t>:N, -c:s:N and -bsf:v:N/-tag:v:N. Start at -1 so the increment in each branch yields 0 for the first stream of that type.
        // subtitle and video are decremented again when their stream is dropped, so the survivors stay contiguous; audio needs no decrement, because the one
        // path that drops audio (method_unmuxable=drop) removes the stream BEFORE the type branches increment anything.
        let subtitleOutOrdinal = -1;
        let audioOutOrdinal = -1;
        let videoOutOrdinal = -1;
        // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset). removedIndices: input stream positions
        // dropped via -map -0:ffstream.index. streamOverlay: input stream position -> the fields the output writes differently, laid over that stream (a
        // converted subtitle's or PCM track's codec_name).
        const removedIndices = new Set();
        const streamOverlay = new Map();
        const muxerRebuilt = [];   // streams left out of the map that the mp4 muxer writes back (see the data branch) - summarised last, where it writes them
        // clearedRolePrediction: input stream position -> { adds, roleFields } for a stream whose cleared carrier held a role (see clearedOnlyRoles) - the
        // flags the remux promotes and the role fields that survive it. handlerRolesLost: '[s N] Role' entries no flag in the target can hold, on ONE line.
        const clearedRolePrediction = new Map();
        const handlerRolesLost = [];
        const titleRolesLost = [];   // the same, for roles the title this command changes was the last carrier of - { entry, cause }
        const descriptionRolesLost = [];   // the same, for roles only a description gave, which mp4 does not keep
        // Drop one input stream. The three writes are NOT independent: removedIndices is the sole input to the "Expected results" summary filter and to the
        // orphaned-font survivor test, so a drop site that maps a stream out without recording it makes the summary advertise a stream the command deletes.
        // Per-branch extras (a stream-index decrement, the continue) stay at the call site.
        const dropStream = (index) => {
            extraArguments += ` -map -0:${index}`;
            removedIndices.add(index);
            convert = true;
        };
        // Font attachments whose removal is deferred until after the main loop, when we know which subtitle streams survive. Decided here (not inline)
        // because an attachment can appear before its subtitles in the file, so we cannot know whether a styled subtitle survives at the moment we reach
        // the attachment.
        const deferredFontIndices = [];

        let exportRefusedCount = 0;   // image-sub exports that could not be written this run - any at all fails the file, see the check after the stream loop
        // Styled bundles a requeue can still export: one already on disk that could be neither trusted nor replaced (cut short, undeletable, a symbolic link),
        // or an unmapped placement that did not complete (unconfirmedSidecars). Unlike the other styled refusals these clear, so the file fails with the styled
        // original intact rather than flattening it to mov_text for good - see the check after the stream loop.
        let bundleHeldCount = 0;
        const placedSidecars = new Set(); const failedSidecars = new Map(); const emptySidecars = new Set();
        // The subset of failedSidecars a requeue can clear: the server could not say whether the sidecar is already there, or the placement itself failed (an
        // upload refused or timed out, a staging or extraction fault). A styled export never flattens over one (see the styled refusal); only a path no
        // translator maps, a permanent gap, does.
        const unconfirmedSidecars = new Set();
        // The font attachments a styled-subtitle bundle carries. Read once here: they are the same set for every styled subtitle in the file, and the
        // pre-scan below needs them before the stream loop runs.
        const styledFontIndices = streams
            .filter((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s)).map((s) => s.index);
        // Where a subtitle stream ENDS, in seconds, or 0 when no probe says: ffprobe's own duration (mp4), else Matroska's per-track DURATION statistics
        // tag (written by both ffmpeg and mkvmerge, as H:MM:SS.nnnnnnnnn), else mediaInfo's. The yardstick an existing bundle's last cue is held to.
        const subtitleEndSec = (ffstream) => {
            for (const v of [ffstream.duration, hmsSeconds(getTagCI(ffstream.tags || {}, 'DURATION')), mediaInfoFor(ffstream)?.Duration]) {
                const n = Number(v);
                if (Number.isFinite(n) && n > 0) return n;
            }
            return 0;
        };
        // What a styled bundle already in the library is worth, judged ONE way for both routes - the mapped one reads it in place, the unmapped one from a
        // private staging copy of the server's file - so they cannot disagree about whether a sidecar holds the only copy: 'trust' (its cues reach the
        // stream's end, or it could not be judged, which keeps the trust it had), 'short' (its cues stop more than CUE_SPAN_SLACK_S short of the stream's
        // end - a run that failed partway still finalises it, and so does an edit that cut the tail - so it is neither trusted nor replaced), or 'replace'
        // (ffmpeg cannot decode it, or it decodes to no cue: what an interrupted export leaves).
        const judgeBundle = (localPath, ffstream) => {
            const bundle = readBundleSubtitle(localPath);
            if (bundle.state === 'unknown') return { verdict: 'trust' };
            const span = bundle.state === 'ok' ? cueSpan(bundle.buf.toString('utf8'), 'ass') : { cues: 0, end: 0 };
            const streamEnd = subtitleEndSec(ffstream);
            if (span.cues && streamEnd && span.end < streamEnd - CUE_SPAN_SLACK_S) return { verdict: 'short', end: span.end, streamEnd };
            return { verdict: span.cues ? 'trust' : 'replace' };
        };
        // The unmapped pre-scan's verdicts on bundles already on the server, for stageSidecar to answer from: trusted ones are 'exists', short ones are held.
        const trustedRemoteBundles = new Set(); const shortRemoteBundles = new Map();
        // WHAT a sidecar export is called and WHICH ffmpeg selection produces it, for the two sites that need it: the unmapped pre-scan below (which hands the
        // tokens to placeSidecars as argv) and stageSidecar, which serves both in-loop branches and owns the single sidecarOut append. A divergence between
        // those two forms is invisible to every check here - one is an array and the other a template literal - and the unmapped copy is UPLOADED into the
        // user's library rather than being a discardable extra output, so the two must not be able to disagree. The REFUSAL paths stay at their call sites:
        // they differ deliberately (an image refusal fails the file, a styled one falls through to mov_text, the pre-scan's just records into failedSidecars).
        const sidecarPlan = (ffstream, styled) => {
            const spec = styled ? STYLED_BUNDLE : IMAGE_SUB[codecNameOf(ffstream)];
            return {
                name: sidecarBasename(ffstream, spec.ext, styled ? STYLED_BUNDLE.mark : ''),
                mapTokens: styled
                    ? ['-map', `0:${ffstream.index}`, ...styledFontIndices.flatMap((i) => ['-map', `0:${i}`]), '-c', 'copy', '-f', spec.fmt]
                    : ['-map', `0:${ffstream.index}`, '-c:s', 'copy', '-f', spec.fmt],
            };
        };
        // The mechanical half of an export, shared by the image-sub and the styled-bundle branches so the two cannot stage a file differently: the path join,
        // the unmapped-node lookups, the refusal tests, the already-exists probe, and the single sidecarOut append that rides the export on the remux.
        // Returns { status, name, why?, bytes?, end?, streamEnd? } - status 'placed' (unmapped, already uploaded), 'empty' (unmapped, the decode produced
        // nothing), 'exists', 'queued' or 'refused'. A refusal names only the CAUSE in `why`: 'unmapped' and 'unconfirmed' (failedSidecars holds the
        // detail), 'namecap' (with `bytes`), 'unsafe', 'symlink', 'leftover', and 'short' (with `end` and `streamEnd`; a styled bundle only). The two
        // callers spell the CONSEQUENCE differently: an image refusal keeps the subtitle and fails the file, a styled one falls through to mov_text unless a
        // requeue can clear it (bundleHeldCount).
        const stageSidecar = (ffstream, styled) => {
            const { name, mapTokens } = sidecarPlan(ffstream, styled);
            const sidecarPath = path.join(libDir, name);
            // videoBase is the user's own filename and nothing bounds it, so the finished name can exceed the filesystem's 255-byte basename cap on its own.
            // On a mapped node the sidecar and the strip are outputs of ONE ffmpeg command, so an over-long name does not merely lose the sidecar: ffmpeg
            // answers "File name too long" and refuses EVERY output of the run, quarantining a file that re-fails on every requeue. On an unmapped node the
            // server's filesystem refuses the upload after a full extraction, under a reason that never names the cause (the pre-scan skips such a name).
            // Tested BEFORE the route and the path - it is a property of the name, not of the directory.
            const bytes = Buffer.byteLength(name, 'utf8');
            if (bytes > NAME_BYTE_CAP) return { status: 'refused', name, why: 'namecap', bytes };
            if (isUnmappedNode) {
                if (placedSidecars.has(name)) return { status: 'placed', name };
                if (trustedRemoteBundles.has(name)) return { status: 'exists', name };
                if (shortRemoteBundles.has(name)) return { status: 'refused', name, why: 'short', ...shortRemoteBundles.get(name) };
                if (emptySidecars.has(name)) return { status: 'empty', name };
                return { status: 'refused', name, why: unconfirmedSidecars.has(name) ? 'unconfirmed' : 'unmapped' };
            }
            if (!pathIsPresetSafe(sidecarPath)) return { status: 'refused', name, why: 'unsafe' };
            // A file an earlier pass left at this name. ffmpeg refuses to overwrite an existing output (no -y reaches the preset - it answers "Not overwriting
            // - exiting") and aborts the ENTIRE run, on every requeue, so whatever is not trusted is deleted before the export is queued. Zero bytes is never
            // trusted: it is what a killed export leaves. An IMAGE-sub .sup is never trusted either: reaching here means the source stream is still present,
            // and a completed export always drops it, so it can only be a run that died mid-write - and a raw bitmap .sup is never user-authored (any OCR
            // happens after a completed run, once the stream is already gone). A STYLED bundle may since have been edited, so one that holds the subtitle is
            // trusted and the drop goes ahead - forcing it (-y) could only destroy that work. judgeBundle tells that apart from what an interrupted export
            // leaves: 'replace' is deleted and re-exported, 'short' fails the file with the subtitle intact. A file that cannot be deleted is refused rather
            // than trusted: each one reaching that is known bad. A symbolic link at the name is refused first (isSymlinkAt).
            if (isSymlinkAt(sidecarPath)) return { status: 'refused', name, why: 'symlink' };
            if (fs.existsSync(sidecarPath)) {
                if (styled && fileHasBytes(sidecarPath)) {
                    const judged = judgeBundle(sidecarPath, ffstream);
                    if (judged.verdict === 'short') return { status: 'refused', name, why: 'short', end: judged.end, streamEnd: judged.streamEnd };
                    if (judged.verdict === 'trust') return { status: 'exists', name };
                }
                try { fs.unlinkSync(sidecarPath); } catch (e) { return { status: 'refused', name, why: 'leftover' }; }
            }
            sidecarOut += ` ${mapTokens.join(' ')} "${sidecarPath}"`;
            return { status: 'queued', name };
        };
        // remove_imagesubs=export on an UNMAPPED node: the sidecars cannot ride along as extra outputs of the remux (see the sidecar-placement section), so
        // they are extracted and uploaded HERE, before the stream loop decides anything - the loop then drops an image sub only when its export is in
        // placedSidecars, refusing the drop otherwise exactly as an unsafe path does. The pre-scan repeats the loop's own export test, so the two cannot
        // select different streams.
        if (isUnmappedNode) {
            const exportJobs = [];
            for (const s of streams) {
                const codec = codecNameOf(s);
                if (codecTypeOf(s) !== 'subtitle' || subFilterDrops(s)) continue;
                // Two kinds of export land here, differing only in what goes into the file: an image subtitle copied alone, or a styled subtitle bundled
                // with the container's fonts. Both upload BEFORE the stream loop decides anything (see the pre-scan header above).
                const styled = styledSubExported(codec);
                const image = imageSubDropped(codec) && removeImageSubs === 'export';
                if (!styled && !image) continue;
                const { name, mapTokens } = sidecarPlan(s, styled);
                if (Buffer.byteLength(name, 'utf8') > NAME_BYTE_CAP) continue;   // refused in the loop (stageSidecar), with nothing probed or uploaded
                const dest = serverSidePath(path.join(libDir, name));
                if (!dest) { failedSidecars.set(name, 'no path translator maps this library directory back to the server'); continue; }
                // An image .sup is always extracted again and uploaded over whatever is there, as the mapped route deletes and re-exports one: the source
                // stream is still embedded, so a .sup already there is a run that died mid-write, and a raw bitmap .sup is never user-authored. Trusting
                // it because it is non-empty would drop the stream with a truncated copy left as the only one.
                if (image) { exportJobs.push({ name, dest, args: mapTokens }); continue; }
                // A styled bundle may have been edited, so one already on the server is fetched to private staging and judged exactly as the mapped route
                // judges one on disk (judgeBundle). An unconfirmed answer is a failed placement - an upload could replace a bundle that is there - so the
                // stream is kept, as for any other.
                let there;
                let stageDir = '';
                try {
                    stageDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'awk_bundlecheck_'));
                    const local = path.join(stageDir, 'b.mks');
                    // Fetched whole, with no byte cap, deliberately: a bundle's size is its fonts, which the Matroska muxer writes ahead of the first cue
                    // (measured: a 72 MB font at byte 97, the subtitle after it), so no text cap bounds it - and a cap whose 'over' meant trust would hand
                    // a truncated large bundle the only copy, where judged here it is 'short' and held (measured: a killed export kept 385 of 600 cues).
                    there = sidecarExistsRemote(dest, local);
                    if (there.state === 'present') {
                        const judged = judgeBundle(local, s);
                        if (judged.verdict === 'trust') { trustedRemoteBundles.add(name); continue; }
                        if (judged.verdict === 'short') { shortRemoteBundles.set(name, { end: judged.end, streamEnd: judged.streamEnd }); continue; }
                    }
                } catch (e) {
                    there = { state: 'unknown', why: `could not stage it for a check (${e && e.message ? e.message : e})` };
                } finally {
                    if (stageDir) try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
                }
                if (there.state === 'unknown') {
                    unconfirmedSidecars.add(name);
                    failedSidecars.set(name, `could not confirm whether it is already there (${there.why}), so it was not exported over it`);
                    continue;
                }
                exportJobs.push({ name, dest, args: mapTokens });
            }
            if (exportJobs.length) {
                const { placed, failed, empty } = placeSidecars(exportJobs);
                for (const n of placed) placedSidecars.add(n);
                for (const n of empty) emptySidecars.add(n);
                for (const [n, why] of failed) { failedSidecars.set(n, why); unconfirmedSidecars.add(n); }
            }
        }

        // The videos this remux maps, read before the loop because a tmcd's verdict rests on them (isMp4RebuiltTimecode) and a video can follow its tmcd in
        // the file: every one but cover art and a method_unmuxable=drop removal, the loop's only two video drops (see the all-gone check after it).
        const mappedVideos = streams.filter((s) => codecTypeOf(s) === 'video' && !unmuxableDrops.has(s.index) && !isCoverArt(s));
        for (let i = 0; i < streams.length; i++) {
            const ffstream = streams[i];
            const ffstreamCodec = codecNameOf(ffstream);
            const ffstreamType = codecTypeOf(ffstream);

            // method_unmuxable=drop: the destination cannot store this codec at all, so the stream goes before any per-type work reads it. Dropping BEFORE the
            // type branches (rather than inside them) means the per-type output ordinal is never incremented for it, so survivors stay contiguous with no
            // decrement to remember.
            if (unmuxableDrops.has(ffstream.index)) {
                workDone += `☐${streamTag(ffstream.index)}[method_unmuxable=drop] Remove ${ffstreamType}-${ffstreamCodec} - ${dstContainer} cannot store it\n`;
                dropStream(ffstream.index);
                continue;
            }

            // A stream ffmpeg cannot identify (ffprobe omits codec_type - an MPEG-TS private-section PID, stream_type 0x05, as DVB recordings carry) cannot be
            // copied at all: ffmpeg refuses to map it ("Cannot map stream ... unsupported type"), so keeping it fails every remux of the file in any container.
            // The "never remove what we can't identify" rule (attachmentKind) yields here as it does for an attachment mp4 cannot carry. Measured on
            // jellyfin-ffmpeg 7.1.4: `-map 0` exits 234 on such a file, `-map 0 -map -0:N` exits 0.
            if (!['video', 'audio', 'subtitle', 'attachment', 'data'].includes(ffstreamType)) {
                workDone += `☐${streamTag(ffstream.index)} Remove a stream ffmpeg cannot identify - it cannot be copied`
                    + ` (${ffstreamType || 'unknown'}-${ffstreamCodec || 'none'})\n`;
                dropStream(ffstream.index);
                continue;
            }

            // The stream's title, a named handler included - see the shared mediaTitleFor.
            const mediaTitleClean = mediaTitleFor(ffstream);
            const streamTitle = sourceTitleOf(ffstream);

            //Metadata edits for this stream, accumulated by the emitters below and flushed onto the command at the end of the iteration.
            let metadataCommand = '';
            let carryCommand = '';   // see nameCarryArgs
            let nameWritten = false;   // a title or handler write for this stream is queued, so the carry has nothing to restate
            let shouldDrop = false;
            // Keep a role whose only copies are a handler and/or a busy title this command clears: promote its real flag on this same command even with
            // tag_disposition off - it preserves what the file already says rather than adding anything. Where tag_disposition covers the type it has
            // promoted every role already, and a second -disposition for one stream would override the first. A role no flag in the target can hold is lost
            // with its carrier, and said so once for the whole file (handlerRolesLost / titleRolesLost) rather than per stream. Runs once the title this
            // command writes is decided, since that title is what survives. titleCauses names the settings that changed the title, so a line blames the
            // setting the user actually set - a busy-title clear reads as cleared, any other change as rewritten.
            const preserveClearedRoles = (typeLetter, idx, typeWord, newTitle, titleCauses, handlerCleared) => {
                const { roles, viaTitle, viaHandler, viaDescription, by } = clearedOnlyRoles(ffstream, typeWord, newTitle, handlerCleared);
                if (!roles.length) return;
                const titleCause = viaTitle ? titleCauses.join('][') : '';
                const covered = appliesToType(tagDisposition, typeWord);
                const promoted = covered ? dispositionsToPromote(ffstream, typeWord) : dispositionsToPromote(ffstream, typeWord, roles);
                if (!covered && promoted.length) {
                    const handlerFate = dstContainer === 'mkv' ? 'cleared' : 'replaced';
                    const titleFate = titleCauses.includes('remove_busytitle=true') ? 'cleared' : 'rewritten';
                    const from = viaTitle && viaHandler ? `the title and handler_name before they are ${titleFate === 'cleared' ? 'cleared' : 'changed'}`
                        : (viaTitle ? `the title before it is ${titleFate}`
                            : (viaHandler ? `handler_name before it is ${handlerFate}` : 'the DESCRIPTION tag, which mp4 does not keep'));
                    const cause = [titleCause, (viaHandler || viaDescription) && `container=${dstContainer}`].filter(Boolean).join('][');
                    workDone += `☐${streamTag(ffstream.index)}${cause ? `[${cause}]` : ''} Set disposition (${typeWord}) from ${from} - `
                        + `${promoted.map((k) => dispositionTypes[k].tag).join(' ')}\n`;
                    metadataCommand += ` -disposition:${typeLetter}:${idx} ${promoted.map((k) => `+${k}`).join('')}`;
                }
                const lost = [...new Set(roles.map(promoteTarget))].filter((k) => !promoted.includes(k));
                for (const via of ['title', 'handler', 'description']) {
                    const mine = lost.filter((k) => roles.some((j) => promoteTarget(j) === k && by[j] === via));
                    if (!mine.length) continue;
                    const entry = `${streamTag(ffstream.index)} ${mine.map((k) => dispositionTypes[k].tag || k).join(' ')}`;
                    if (via === 'title') titleRolesLost.push({ entry, cause: titleCause });
                    else (via === 'handler' ? handlerRolesLost : descriptionRolesLost).push(entry);
                }
                clearedRolePrediction.set(ffstream.index, { adds: promoted, roleFields: survivingRoleFields(ffstream, newTitle) });
            };
            // Per-stream handler_name canonicalisation, common to the subtitle/audio/video branches. mkv wipes it (it can confuse mkv title display). mp4
            // carries the track's title in it (handlerNameFor), or the per-type name when the track has none or its name reads as boilerplate - except that a
            // named handler is kept beside a name that reads as boilerplate, as every plugin's name carry (mp4NameCarry) keeps it, as the name it holds
            // (handlerTextOf: a .mov length byte copied into an mp4 C string is a stray byte): replacing it loses the name (measured: 'Francais' and 'Deutsch
            // Kommentar' beside boilerplate title boxes became SoundHandler). A role it names is promoted where tag_disposition asks; one mp4 cannot flag
            // (unstorableDisp: Karaoke, M&E) is replaced, its loss reported (handlerRolesLost). wipeReason lets the video branch append its own note. Read
            // case-insensitively (getTagCI): matroska UPPER-CASES it to HANDLER_NAME, which mediaInfo surfaces as the Title - miss it and the busy handler
            // re-triggers remove_busytitle every pass (an infinite loop). ffmpeg matches -metadata keys case-insensitively, so the lowercase wipe still clears
            // the uppercase tag. Returns whether the handler is cleared or replaced, for preserveClearedRoles.
            const emitHandlerMeta = (typeLetter, idx, typeWord, genericName, newTitle, wipeReason = '') => {
                const curHandler = getTagCI(ffstream.tags, 'handler_name');
                const title = nameTextOf(newTitle);
                const named = handlerNameFor(title, dstContainer);
                const ownName = handlerTextOf(curHandler);
                const unflaggable = rolesNamed(ownName, codecTypeOf(ffstream)).some((k) => (unstorableDisp[dstContainer] || new Set()).has(promoteTarget(k)));
                const keep = !named && !!title && !!ownName && !isGenericHandler(ownName) && !unflaggable;
                const want = named || (keep ? ownName : genericName);
                const titleQueued = nameWritten;
                // A handler already holding the name as escMeta writes it is the name: writing it again changed no byte and cost a remux of its own (measured).
                const holds = curHandler === want || curHandler === escMeta(want);
                // A handler kept as the name it holds is not replaced, though the write drops a .mov length byte: counted so, the role it names was promoted
                // to a flag tag_disposition had not asked for (measured).
                const replaced = !!((dstContainer === 'mkv' && curHandler) || (dstContainer === 'mp4' && !holds && !keep));
                if (dstContainer === 'mkv' && curHandler) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Wiping handler_name tag${wipeReason} (${typeWord})`
                        + ` "${logSafe(curHandler)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "handler_name="`;
                } else if (dstContainer === 'mp4' && !holds) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Setting handler_name tag (${typeWord}) to `
                        + `${named ? `the track title ${quotedName(want)} - the only place mp4 keeps a track name`
                            : (keep ? `the name it holds, ${quotedName(want)}` : genericName)}`
                        + `${curHandler ? ` (was "${logShown(curHandler)}")` : ''}\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "handler_name=${escMeta(want)}"`;
                    // The remux drops the udta title box, so unless a title write is queued already the name goes there too, in escMeta's form as mp4NameCarry
                    // writes it: the name the handler now holds, or a name that reads as boilerplate (that box is its only mp4 home) when no source title tag
                    // rides -map 0 into the box.
                    if (title && !titleQueued && (named || !ffstream.tags?.title)) {
                        metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(title)}"`;
                    }
                    nameWritten = true;
                }
                // Quoted as the file will hold it: a queued title went in as escMeta writes it, and so does a title-box name beside a handler left as it is
                // (mp4NameCarry restates it); a source title tag rides -map 0 unaltered.
                if (dstContainer === 'mp4' && title && !named && (nameWritten || (!ffstream.tags?.title && escMeta(title) !== title))) {
                    const shown = titleQueued || !ffstream.tags?.title ? quotedName(title) : `"${logSafe(title)}"`;
                    workDone += `☒${streamTag(ffstream.index)}[container=mp4] ${shown} reads as a tool's default handler name, so mp4 keeps it only as the`
                        + ' track title, which a remux by another tool drops\n';
                }
                if (dstContainer === 'mp4' && !nameWritten) carryCommand += mp4NameCarry(ffstream, typeLetter, idx, dstContainer)?.args || '';
                return replaced;
            };
            // tag_disposition (audio/subtitle): import any surfaced disposition keyword into the real flag (additive, so existing flags are kept), the line
            // naming the field each was read from - the title, else the tag no title holds it in.
            const promoteDisposition = (type, typeLetter, idx) => {
                const promote = dispositionsToPromote(ffstream, type);
                const fields = [['title', [streamTitle]], ['handler_name', [handlerTextOf(getTagCI(ffstream.tags, 'handler_name'))]],
                    ['the TITLE tag', [titleTagText(ffstream)]], ['the DESCRIPTION tag', descriptionsOf(ffstream)]];
                const from = (k) => (fields.find(([, ts]) => roleFieldsOf(ts).some((t) => dispKeysFor(type)
                    .some((j) => promoteTarget(j) === k && matchesKeyword(t, dispositionTypes[j].keywords)))) || ['title'])[0];
                if (promote.length > 0) {
                    workDone += `☐${streamTag(ffstream.index)}[tag_disposition=${tagDisposition}] Set disposition (${type}) from`
                        + ` ${[...new Set(promote.map(from))].join(' and ')}`
                        + ` - ${promote.map(k => dispositionTypes[k].tag).join(' ')}\n`;
                    metadataCommand += ` -disposition:${typeLetter}:${idx} ${promote.map(k => `+${k}`).join('')}`;
                }
            };
            // The plain name a busy title falls back to: the track's handler, unless it reads as boilerplate, is busy itself, or is the title as handlerNameFor
            // writes it (escMeta's form included) - on .mov the title's 127-byte cut, which every carrier writes for a long name: that handler is the title,
            // not a plain name beside it, though the busy test alone passes it: a cut can hold three periods or fewer where its title holds more. '' if none.
            const busyFallback = () => {
                const handler = handlerTextOf(getTagCI(ffstream.tags, 'handler_name'));
                const ownCut = handlerNameFor(streamTitle, readContainer);
                return isGenericHandler(handler) || tooManyPeriods(handler) || [ownCut, escMeta(ownCut)].includes(handler) ? '' : handler;
            };
            // Busy-title removal (audio/subtitle; the video branch calls busyFallback itself): an over-dotted title becomes busyFallback's name, else a blank
            // that tag_title (below) re-names by the usual rules (on audio an empty base becomes the channel label). A role the title carried survives through
            // tag_disposition's flag, tag_title's rebuilt name, or, when neither covers the type, preserveClearedRoles' flag. Returns the title.
            const clearBusyTitle = (title, titleCauses) => {
                if (removeBusytitle && tooManyPeriods(title)) {
                    titleCauses.push('remove_busytitle=true');
                    return busyFallback();
                }
                return title;
            };
            // Reconcile ONLY when the ffprobe tag is missing but the track has a REAL title (mediaTitleFor: mediaInfo's with the handler echo removed, else a
            // named handler), so a Title that is nothing but a boilerplate handler echo reconciles to nothing and is never promoted into a title tag. The write
            // adds the ffprobe tag so both probes agree next pass. Two cases must NOT reconcile, since the write can never make the probes agree and the file
            // would remux every pass (Tdarr errors an unchanging preset as an infinite transcode loop): the reverse (ffprobe has a title mediaInfo never
            // reports), and an mp4 target, where the reconcile is emitHandlerMeta's handler write, which ffprobe sees - a title tag alone would stay invisible.
            // A matroska TITLE SimpleTag in the Name's place (getTagCI: ffprobe gives it as 'TITLE') is a title tag; beside a Name the track's one name
            // (trackNameBesideTitleTag) is restated, since ffmpeg would write the tag over the Name, and noteTitleTagDropped says what becomes of the tag. A
            // 'TITLE-<lang>' beside the Name (titleTagInNamePlace) rides a matroska remux as it is, so it is no reason to write.
            const emitTitleReconcile = (typeLetter, idx, typeWord, title) => {
                const named = titleTagInNamePlace(ffstream) && !!trackNameBesideTitleTag(ffstream);
                if ((getTagCI(ffstream.tags, 'title') && !named) || !title || mediaTitleClean === '' || dstContainer === 'mp4') return;
                const from = mediaTitleClean === titleBesideHandler(ffstream) ? 'mediaInfo' : 'handler_name';
                if (!named) workDone += `☐${streamTag(ffstream.index)} Set title (${typeWord}) from ${from} ${quotedName(title)} (no title tag)\n`;
                metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(title)}"`;
                nameWritten = true;
            };
            // The TITLE SimpleTag beside a Name, which no remux keeps beside the title it writes where it sits in the Name's place, and no mp4 keeps at all -
            // the track's one name (titleTagLine says what that keeps of the tag), or a title this command sets: said once, and the output read by that title
            // alone (clearedRolePrediction's role fields) with the flags tag_disposition promotes, so Expected results promise exactly the roles it holds.
            const noteTitleTagDropped = (newTitle, typeWord) => {
                if (!trackNameBesideTitleTag(ffstream) || (dstContainer !== 'mp4' && !titleTagInNamePlace(ffstream))) return;
                const written = nameTextOf(newTitle);
                if (written === trackNameBesideTitleTag(ffstream)) workDone += titleTagLine(ffstream);
                else {
                    workDone += `☒${streamTag(ffstream.index)} ${written ? `Writing ${quotedName(written)} as the title` : 'Clearing the title'}, so the`
                        + ` TITLE tag "${logShown(titleTagText(ffstream))}" beside it is dropped - ffmpeg keeps one title, and players show the`
                        + ' name\n';
                }
                if (!clearedRolePrediction.has(ffstream.index)) {
                    const adds = appliesToType(tagDisposition, typeWord) ? dispositionsToPromote(ffstream, typeWord) : [];
                    clearedRolePrediction.set(ffstream.index, { adds, roleFields: survivingRoleFields(ffstream, written) });
                }
            };
            const emitTitleMeta = (typeLetter, idx, typeWord, streamTitle, newStreamTitle, titleCauses) => {
                if (newStreamTitle !== streamTitle) {
                    const written = nameTextOf(newStreamTitle);   // see nameTextOf: a control byte at the edge would come back as a space
                    workDone += `☐${streamTag(ffstream.index)}${titleCauses.length ? `[${titleCauses.join('][')}]` : ''} Change title (${typeWord})`
                        + ` "${logShown(streamTitle)}" -> ${quotedName(written)}\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(written)}"`;
                    nameWritten = true;
                } else emitTitleReconcile(typeLetter, idx, typeWord, newStreamTitle);
                noteTitleTagDropped(newStreamTitle, typeWord);
            };
            // remove_comments (audio/subtitle/video): drop a stream comment tag (players rarely show it). Guard + output mirror the handler_name emitter
            // above, the case-insensitive read (getTagCI) included - matroska stores this key as COMMENT; see there for why the lowercase wipe still clears it.
            // No mediaInfo fallback: MediaInfo defines Comment as a GENERAL-only parameter, so a per-TRACK comment never appears as track.Comment, and no
            // container puts a per-track comment in mediaInfo without ffprobe reporting it too.
            const emitCommentRemoval = (typeLetter, idx, typeWord) => {
                const curComment = getTagCI(ffstream.tags, 'comment');
                if (removeComments === true && curComment) {
                    workDone += `☐${streamTag(ffstream.index)}[remove_comments=true] Remove comment (${typeWord}) "${logSafe(curComment)}"\n`;
                    metadataCommand += ` -metadata:s:${typeLetter}:${idx} "comment="`;
                }
            };
            // language_fill / tag_language: write the canonical language tag for a kept stream. canonicalLangMeta decides it; this records the decision the
            // same way for all three stream types, so the "log it AND emit it" pair can never be applied to one branch and forgotten in another. (The
            // subtitle branch resolves its own working language first - resolveWorkLang - since it must decide keep/drop before writing a tag.)
            const emitLangMeta = (typeLetter, idx, typeWord, allowFill) => {
                const langMeta = canonicalLangMeta(typeLetter, idx, ffstream, typeWord, allowFill);
                if (langMeta.meta) { workDone += langMeta.log; metadataCommand += langMeta.meta; }
            };

            if(ffstreamType === 'subtitle') {
                subtitleOutOrdinal++;

                // Image subs are governed by remove_imagesubs (see imageSubDropped / IMAGE_SUB); subs no container - or this one - can carry are dropped by
                // subFormatDropped; everything else falls through to the language/accessibility filters below. The export has to SUCCEED for the drop to
                // be safe (the sidecar is the only surviving copy): when the joined path can't be embedded in the quoted preset token (pathIsPresetSafe -
                // the library directory has to stay literal) the export AND the drop are refused with a ☒, and the stream falls through to the container
                // test, which still drops it on mp4 and keeps it on mkv. That ☒ goes straight to the infoLog rather than workDone: it warns about the
                // ENVIRONMENT, not a queued change, so it belongs outside the decision block rather than buffered with it. workDone itself always reaches
                // the log - on the convert path at the remux, and through flushBuffers on any quarantine - and a refused image export always quarantines.
                const imageSubDrop = imageSubDropped(ffstreamCodec);
                // language_sub / remove_sub_sdh discard this track on its own merits, so it must not be exported first: the sidecar is permanent (nothing
                // here ever deletes one, and on an unmapped node it is uploaded into the library over the file API), it hands the user an OCR job for a
                // track they excluded, and a refused export of one would fail the WHOLE file. The drop still happens - the stream simply falls through to
                // those filters below, which log the real reason. Only the export defers this way; 'all' keeps reporting the drop as its own.
                const exportSuppressed = removeImageSubs === 'export' && subFilterDrops(ffstream);
                let exportRefused = false;
                if (imageSubDrop && removeImageSubs === 'export' && !exportSuppressed) {
                    const { status, name: sidecarName, why, bytes } = stageSidecar(ffstream, false);
                    const inputTag = `${streamTag(ffstream.index)}[remove_imagesubs=export]`;
                    if (status === 'queued') {
                        workDone += `☐${inputTag} Export image subtitle -> ${sidecarName} for external OCR (before drop)\n`;
                    } else if (status === 'placed') {
                        // Unmapped: the export already ran, above this loop - so the line is ☑ rather than ☐, reporting work already done.
                        workDone += `☑${inputTag} Exported image subtitle -> ${sidecarName} for external OCR (before drop)\n`;
                    } else if (status === 'exists') {
                        workDone += `☑${inputTag} Sidecar already exists, not overwriting: ${sidecarName}\n`;
                    } else if (status === 'empty') {
                        // Nothing came out of the decode, which is an answer about the SOURCE and never changes on a requeue - so it must not be counted as a
                        // refusal, or the file quarantines forever. A mapped node already resolves it this way (ffmpeg writes a 0-byte sidecar as an extra
                        // output of the remux and the drop proceeds); this keeps the two routes agreeing on the same file.
                        workDone += `☑${inputTag} Nothing to export to ${sidecarName} - the subtitle stream carries no data (dropping it loses nothing)\n`;
                    } else {
                        // Every refusal keeps the subtitle, and any at all fails the file after the loop: the sidecar would have been its only copy.
                        const refusal = {
                            unmapped: `Could not place ${sidecarName} in the library - ${failedSidecars.get(sidecarName)}, keeping the subtitle`,
                            unconfirmed: `Could not place ${sidecarName} in the library - ${failedSidecars.get(sidecarName)}, keeping the subtitle`,
                            namecap: `Sidecar name would be ${bytes} bytes, over the ${NAME_BYTE_CAP}-byte filesystem limit`
                                + ' - rename the video shorter and requeue, keeping the subtitle',
                            unsafe: `Library directory has a quote, control char or <io> - cannot write ${sidecarName} safely, keeping the subtitle`,
                            leftover: `An incomplete ${sidecarName} from an earlier run could not be deleted to export it again - delete it and requeue,`
                                + ' keeping the subtitle',
                            symlink: `${sidecarName} in the library is a symbolic link - not exporting through it, since it could point anywhere; remove it`
                                + ' and requeue, keeping the subtitle',
                        };
                        exportRefused = true; exportRefusedCount += 1;
                        response.infoLog += `☒${inputTag} ${refusal[why]}\n`;
                    }
                }
                if (imageSubDrop && !exportRefused && !exportSuppressed) {
                    // A codec that is ALSO in alwaysDropSubs (xsub) is removed whatever remove_imagesubs says, so it carries no input tag even
                    // when an export ran first - the export is caused by the setting, the removal is not, and the tag names the cause.
                    const imgCause = alwaysDropSubs.includes(ffstreamCodec) ? '' : `[remove_imagesubs=${removeImageSubs}]`;
                    workDone += `☐${streamTag(ffstream.index)}${imgCause} Remove image-based subtitle (${ffstreamType}-${ffstreamCodec})\n`;
                    shouldDrop = true;
                } else if (subFormatDropped(ffstreamCodec)) {
                    // Container/format can't carry it. alwaysDropSubs (xsub/dvb_teletext) drop in ANY container - no setting governs them, so no tag;
                    // the rest (ttml on mkv; image subs, arib/hdmv_text on mp4) drop only because of the chosen container, so they carry [container=<dst>].
                    const dropCause = alwaysDropSubs.includes(ffstreamCodec) ? '' : `[container=${dstContainer}]`;
                    workDone += `☐${streamTag(ffstream.index)}${dropCause} Remove unsupported (${ffstreamType}-${ffstreamCodec})\n`;
                    shouldDrop = true;
                }

                if (!shouldDrop) {
                    // Decide removal BEFORE standardising the tag, so a subtitle dropped by language_sub / remove_sub_sdh / the styled-bundle export never
                    // logs a language correction it won't keep. workLang here equals canonicalLangMeta's own workLang (same fillApplies rule), so the
                    // keep/drop decision is unchanged - the tag write is just skipped for a stream about to be mapped out.
                    const workLang = resolveWorkLang(ffstream);

                    //language_sub: drop a subtitle whose (possibly filled) language is not on the keep list. A blank list keeps every language.
                    if(subLanguages.length > 0 && !langListMatch(workLang, subLangKeys)) {
                        // Stop rather than lose the imported captions (isImportedCaptionTrack): the file is left untouched for the user to decide, and the
                        // usual cause is the track's honest und tag - which is exactly what language_fill exists to fill.
                        if (isImportedCaptionTrack(ffstream)) {
                            failWithBuffers(`${streamTag(ffstream.index)}[language_sub=${logSafe(inputs.language_sub)}] Would remove the closed-caption track `
                                + `sub_worker imported (language ${logSafe(workLang)}) - the only copy of those captions left in the video, which sub_worker `
                                + `will not read out again - set language_fill to a language on language_sub`
                                + `${fillLanguage ? '' : ' (or add und to language_sub)'}, then requeue`);
                        }
                        // logSafe's 200-char cap matters here: the whole language_sub list is echoed once PER dropped subtitle.
                        workDone += `☐${streamTag(ffstream.index)}[language_sub=${logSafe(inputs.language_sub)}] `
                            + `Remove subtitle language (${logSafe(workLang)})\n`;
                        shouldDrop = true;
                    } else if (sdhRemoved(ffstream, workLang)) {
                        workDone += `☐${streamTag(ffstream.index)}[remove_sub_sdh=${removeSubSdh}] Remove accessibility subtitle SDH/CC`
                            + ` (${logSafe(roleFieldsLower(ffstream).join(' '))})\n`;
                        // Honoured - removing SDH is what the setting asks for - but this one is the last copy of the imported captions, so say so.
                        if (isImportedCaptionTrack(ffstream)) {
                            workDone += `☒${streamTag(ffstream.index)}[remove_sub_sdh=${removeSubSdh}] That is the closed-caption track sub_worker imported - `
                                + 'the only copy of those captions left in the video; sub_worker will not read them out or import them again\n';
                        }
                        shouldDrop = true;
                    }
                }

                if(shouldDrop === true) {
                    //Deleting the stream so including metadataCommand will cause problems
                    dropStream(ffstream.index);
                    subtitleOutOrdinal--;
                    continue;
                }

                // A styled subtitle bound for mp4: export the bundle and drop the track rather than flatten it (see styledSubExported). AFTER every removal
                // filter, so a track language_sub or remove_sub_sdh discards is never exported first. The export must SUCCEED for the drop to be safe
                // (the bundle then holds the only styled copy); a refusal falls through to the mov_text conversion below with a ☒ naming the loss - a
                // mangled subtitle beats a vanished one.
                if (styledSubExported(ffstreamCodec)) {
                    const staged = stageSidecar(ffstream, true);
                    const { status, name: sidecarName, why, bytes } = staged;
                    const inputTag = `${streamTag(ffstream.index)}[container=mp4]`;
                    const fontNote = styledFontIndices.length
                        ? ` with ${styledFontIndices.length} font attachment${styledFontIndices.length === 1 ? '' : 's'}` : ' (no embedded fonts to carry)';
                    const exported = ['queued', 'placed', 'exists'].includes(status);
                    if (status === 'queued') {
                        workDone += `☐${inputTag} Export styled ${ffstreamCodec} subtitle -> ${sidecarName}${fontNote}`
                            + ' - mp4 cannot carry it without flattening the styling into on-screen text\n';
                    } else if (status === 'placed') {
                        workDone += `☑${inputTag} Exported styled ${ffstreamCodec} subtitle -> ${sidecarName}${fontNote}\n`;
                    } else if (status === 'exists') {
                        workDone += `☑${inputTag} Styled-subtitle bundle already exists, not overwriting: ${sidecarName}\n`;
                    } else {
                        // Except a bundle already in the library that is cut short, undeletable or a symbolic link, or an unmapped placement that did not
                        // complete (unconfirmedSidecars): those clear on a requeue, so the file fails with the styled original intact instead of flattening it
                        // for good (bundleHeldCount). The bundle route has no 'empty' answer of its own and does not need one: placeSidecars files an empty
                        // extraction under BOTH empty and failed, so the unmapped refusal already names it ('extraction produced no data') rather than reading
                        // undefined.
                        const refusal = {
                            unmapped: `Could not place ${sidecarName} in the library - ${failedSidecars.get(sidecarName)}; converting to mov_text instead,`
                                + ' which loses the styling',
                            namecap: `Sidecar name would be ${bytes} bytes, over the ${NAME_BYTE_CAP}-byte filesystem limit - converting to mov_text`
                                + ' instead, which loses the styling; rename the video shorter to keep it',
                            unsafe: `Library directory has a quote, control char or <io> - cannot write ${sidecarName} safely; converting to mov_text`
                                + ' instead, which loses the styling',
                            leftover: `An incomplete ${sidecarName} from an earlier run could not be deleted to export it again - delete it and requeue`,
                            symlink: `${sidecarName} in the library is a symbolic link - not exporting through it, since it could point anywhere; remove it`
                                + ' and requeue',
                            unconfirmed: `Could not place ${sidecarName} in the library - ${failedSidecars.get(sidecarName)}; a fault a requeue can clear, so`
                                + ' the styled subtitle is not flattened over it - requeue once it is resolved',
                            short: `${sidecarName} already in the library stops at ${Number(staged.end).toFixed(1)} s but this subtitle runs to `
                                + `${Number(staged.streamEnd).toFixed(1)} s - a run that failed partway, or an edit that cut the end, so it cannot be `
                                + 'trusted with the only copy - delete it and requeue to export the whole subtitle',
                        };
                        if (why === 'short' || why === 'leftover' || why === 'symlink' || why === 'unconfirmed') bundleHeldCount += 1;
                        response.infoLog += `☒${inputTag} ${refusal[why || 'unmapped']}\n`;
                    }
                    if (exported) { dropStream(ffstream.index); subtitleOutOrdinal--; continue; }
                }

                // Kept subtitle: fill a blank language and/or standardise the tag (tag_language) now that it has survived BOTH the removal filters above and
                // the styled-bundle export - the last thing on this branch that can still map the stream out. Not guarded by styledSubExported: a refused
                // export (an unmapped node with no route, a library directory carrying a quote / control character) survives as mov_text below and still
                // wants its language tag.
                emitLangMeta('s', subtitleOutOrdinal, 'subtitle', true);

                //Trim the surrounding whitespace and quotes (cleanStreamTitle); the busy-title clear follows tag_disposition below, not here.
                let newStreamTitle = cleanStreamTitle(streamTitle);
                const titleCauses = [];   // the settings that changed the title, for a compound [tag]; empty = an automatic whitespace/quote trim (no setting)

                if(appliesToType(tagDisposition, 'subtitle')) promoteDisposition('subtitle', 's', subtitleOutOrdinal);

                newStreamTitle = clearBusyTitle(newStreamTitle, titleCauses);

                //tag_title (subtitle): titles we own (empty/role-only, incl. a just-cleared busy title) get the role tag(s). Custom titles are left untouched.
                if(appliesToType(tagTitle, 'subtitle')) {
                    const tags = titleTagsFor(ffstream);
                    if(tags.length > 0 && !stripDispositionWords(newStreamTitle)) {
                        newStreamTitle = tags.join(' ');
                        titleCauses.push(`tag_title=${tagTitle}`);
                    }
                }

                emitTitleMeta('s', subtitleOutOrdinal, 'subtitle', streamTitle, newStreamTitle, titleCauses);

                preserveClearedRoles('s', subtitleOutOrdinal, 'subtitle', newStreamTitle, titleCauses,
                    emitHandlerMeta('s', subtitleOutOrdinal, 'subtitle', 'SubtitleHandler', newStreamTitle));
                // mp4 stores no original flag (readBackDispositions). The audio branch carries that role into the title for the plugins that read it; nothing
                // reads a subtitle's, and carried it would rename the track in every player, so its loss is said instead.
                if (dstContainer === 'mp4' && ffstream.disposition?.original === 1) {
                    workDone += `☒${streamTag(ffstream.index)}[container=mp4] The subtitle's original-language flag is dropped - mp4 stores no original flag\n`;
                }

                emitCommentRemoval('s', subtitleOutOrdinal, 'subtitle');

                // mkv: mov_text is a QuickTime-only format that most players won't render in mkv — convert to srt. The LEGACY_TEXT_SUBS formats have NO
                //      Matroska CodecID either, so a bare -c copy would fail the whole remux — ffmpeg decodes them as text, so they convert to srt too.
                //      mkv keeps subrip/ass/ssa/webvtt/text + the bitmap codecs (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle, hdmv_text_subtitle)
                //      natively; xsub has no CodecID and is not decodable text, so it is dropped above (alwaysDropSubs).
                // mp4: only mov_text is natively supported, so every decodable text codec converts to it — subrip/srt/ass/ssa/webvtt/text plus
                //      LEGACY_TEXT_SUBS — or they hit the bare -c copy and fail the whole remux. text is raw UTF-8 that ffmpeg normalises to subrip on mux.
                let subConvertTarget = null;
                if (dstContainer === 'mkv' && CC_STREAM_SUBS.includes(ffstreamCodec)) subConvertTarget = CC_STREAM_ENCODER;   // NOT srt - see CC_STREAM_SUBS
                else if (dstContainer === 'mkv' && ['mov_text', ...LEGACY_TEXT_SUBS].includes(ffstreamCodec)) subConvertTarget = 'srt';
                else if (dstContainer === 'mp4'
                    && ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'text', ...CC_STREAM_SUBS, ...LEGACY_TEXT_SUBS].includes(ffstreamCodec))
                    subConvertTarget = 'mov_text';
                if (subConvertTarget) {
                    // The ENCODER and the codec that ends up in the container are the same everywhere except `text`, which matroska stores as subrip
                    // (S_TEXT/UTF8). Both the log and the predicted-output summary name what the file will actually carry, not the flag we passed.
                    const landsAs = subConvertTarget === 'text' ? 'subrip' : subConvertTarget;
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Unsupported codec - converting ${ffstreamCodec} subtitle`
                        + ` to ${landsAs}\n`;
                    extraArguments += metadataCommand+` -c:s:${subtitleOutOrdinal} ${subConvertTarget}`;
                    nameCarryArgs += carryCommand;
                    streamOverlay.set(ffstream.index, { codec_name: landsAs });
                    convert = true;
                    continue;
                }

            } else if(ffstreamType === 'audio') {
                audioOutOrdinal++;

                // Fill a blank language and/or standardise the tag (tag_language).
                emitLangMeta('a', audioOutOrdinal, 'audio', true);

                // Past the muxability gate above, nothing here removes an audio stream - audio_clean owns every audio keep/drop decision (language via
                // language_surround/language_stereo/language_unlisted, role via downmix_secondary), so audio only ever gets metadata work in this branch.

                //Title cleanup mirrors the subtitle branch above - see there for the trim rule and why busy-title clearing follows tag_disposition.
                let newStreamTitle = cleanStreamTitle(streamTitle);
                const titleCauses = [];

                if(appliesToType(tagDisposition, 'audio')) promoteDisposition('audio', 'a', audioOutOrdinal);

                newStreamTitle = clearBusyTitle(newStreamTitle, titleCauses);

                //tag_title (audio): rebuilds the title as a channel/downmix base (only when we own it - see bareChannelRegex/downmixChannelRegex) plus a
                //disposition suffix. The suffix reads each role from the shared classifiers (real flag OR title keyword, via hasDisposition), so a title-only
                //role like "5.1 Commentary" normalises to "5.1 - Commentary" and survives the reformat even when tag_disposition is off (that setting only
                //governs whether the role is also promoted into a real flag, above). Shared canonicalAudioTitle - audio_clean names its downmixes the same way.
                const audioCh = appliesToType(tagTitle, 'audio') ? resolveChannels(ffstream) : 0;
                if(audioCh) {
                    const rebuilt = canonicalAudioTitle(newStreamTitle, layoutLabel(ffstream, audioCh, newStreamTitle), titleTagsFor(ffstream));
                    if(rebuilt !== newStreamTitle) { newStreamTitle = rebuilt; titleCauses.push(`tag_title=${tagTitle}`); }
                }

                // mp4 stores no original flag (readBackDispositions), so there the role lives on only as a title keyword - which every classifier reads
                // too (hasDisposition), guard_audio_language and audio_clean's guard_original included. A flagged track whose written title lacks one gets
                // it, in the role-suffix form canonicalAudioTitle writes - an untitled commentary or description named for its role first ('Commentary -
                // Original'), or it reads 'Original', the main track's name - and Expected results read the role from that title (clearedRolePrediction).
                // The title alone is tested: mp4 keeps no description (descriptionsOf).
                const originalByTitle = dstContainer === 'mp4' && ffstream.disposition?.original === 1;
                if (originalByTitle && !roleFieldsOf([newStreamTitle]).some((t) => matchesKeyword(t, dispositionTypes.original.keywords))) {
                    const seed = newStreamTitle
                        || (isSecondaryTrack(ffstream) ? titleTagsFor(ffstream).filter((t) => t !== dispositionTypes.original.tag).join(' ') : '');
                    newStreamTitle = seed ? `${seed} - Original` : 'Original';
                    titleCauses.push(`container=${dstContainer}`);
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Naming the original-language role in the audio title - mp4 stores`
                        + ' no original flag, so the title keyword is what keeps it\n';
                }

                emitTitleMeta('a', audioOutOrdinal, 'audio', streamTitle, newStreamTitle, titleCauses);

                preserveClearedRoles('a', audioOutOrdinal, 'audio', newStreamTitle, titleCauses,
                    emitHandlerMeta('a', audioOutOrdinal, 'audio', 'SoundHandler', newStreamTitle));
                if (originalByTitle && !clearedRolePrediction.has(ffstream.index)) {
                    clearedRolePrediction.set(ffstream.index, { adds: appliesToType(tagDisposition, 'audio') ? dispositionsToPromote(ffstream, 'audio') : [],
                        roleFields: survivingRoleFields(ffstream, newStreamTitle) });
                }

                emitCommentRemoval('a', audioOutOrdinal, 'audio');

                const pcmTarget = pcmLosslessTarget(ffstream);   // PCM the target refuses, repacked as PCM it stores (PCM_LOSSLESS_REMAP)
                if (pcmTarget) {
                    workDone += `☐${streamTag(ffstream.index)}[container=${dstContainer}] Unsupported codec - converting ${ffstreamCodec} audio to ${pcmTarget}`
                        + ' (lossless)\n';
                    extraArguments += ` -c:a:${audioOutOrdinal} ${pcmTarget}`;
                    // the rate the next pass reads: 8-bit PCM doubles in 16 bits, a 20-bit disc track grows by a fifth in 24
                    const rate = Number(ffstream.sample_rate) * Number(ffstream.channels) * Number(pcmTarget.replace(/\D/g, ''));
                    streamOverlay.set(ffstream.index, { codec_name: pcmTarget, ...(rate > 0 ? { bit_rate: String(rate) } : {}) });
                    convert = true;
                }

            } else if(ffstreamType === 'video') {
                videoOutOrdinal++;

                const isImageCodec = IMAGE_CODECS.includes(ffstreamCodec);
                if (isCoverArt(ffstream)) {
                    workDone += `☐${streamTag(ffstream.index)} Remove ${isImageCodec ? 'image' : 'cover-art/thumbnail'} (${ffstreamType}-${ffstreamCodec})\n`;
                    dropStream(ffstream.index);
                    videoOutOrdinal--;
                    continue;
                }

                // Standardise the video language tag (tag_language): video carries the same mdhd language field, so e.g. a 2-letter code is dropped by mp4.
                emitLangMeta('v', videoOutOrdinal, 'video', false);

                // HEVC takes hevcCopyPlan's fourcc. A stream no remux can fix says so straight to the log, since a file with nothing else to do never flushes
                // workDone. A record no copy keeps (dvRecordSurvivesCopy) is lost by any remux, so the fourcc alone never starts one for it: its args ride a
                // remux something else starts, and otherwise the file keeps its Dolby Vision as it is.
                if (ffstreamCodec === 'hevc') {
                    const plan = hevcCopyPlan(ffstream, isMp4Family(srcContainer) ? ffstream.codec_tag_string : '', videoOutOrdinal,
                        ffmpegPathOf(otherArguments), String(file._id || file.file || ''), dstContainer);
                    const at = `${streamTag(ffstream.index)}[container=${dstContainer}]`;
                    const why = plan.want === 'dvhe' ? 'Matroska stores no fourcc but refuses dvh1, and keeps a Profile 5 Dolby Vision box only under a'
                        + ' Dolby Vision fourcc' : plan.want === 'dvh1' ? 'Dolby Vision with no compatible base keeps its Dolby Vision box in mp4 only as'
                        + ' dvh1, the fourcc Apple/QuickTime play it under' : 'HEVC-in-mp4 needs the hvc1 fourcc for Apple/QuickTime playback';
                    if (plan.state === 'retag') workDone += `☐${at} Tag video as ${plan.want} - ${why}\n`;
                    if (plan.state === 'rebuild') {
                        workDone += `☐${at} Tag video as ${plan.want} and move its in-band parameter sets into the hvcC box - ${why}, with the parameter sets`
                            + ' in that box\n';
                    }
                    if (plan.state === 'stuck' && plan.args) {
                        const read = plan.ps === false ? 'carries no parameter sets' : 'could not be read on this pass';
                        workDone += `☐${at} Tag video as dvhe - its first keyframe ${read}, so it cannot take the dvh1 Apple/QuickTime need; dvhe keeps its`
                            + ' Dolby Vision box\n';
                    } else if (plan.state === 'stuck') {
                        const verb = plan.keep === plan.have ? 'stays' : 'gets';
                        response.infoLog += plan.ps === false
                            ? `☒${at} Video ${verb} ${plan.keep} - its first keyframe carries no parameter sets, so no remux can build the complete hvcC`
                                + ` box Apple/QuickTime need under ${plan.want}; other players are unaffected\n`
                            : `☒${at} Video ${verb} ${plan.keep} for now - its first keyframe could not be read; a later pass reads it again\n`;
                    }
                    if (plan.args) { extraArguments += plan.args; if (dvRecordSurvivesCopy(ffstream)) convert = true; }
                }

                emitCommentRemoval('v', videoOutOrdinal, 'video');

                // Busy-title removal (video): test ONE effective title, as the other branches do - ffprobe's tag, else mediaTitleFor, whose mediaInfo Title has
                // the handler echo removed: the raw Title lets a scene-release handler_name blank a good title that was never busy, and emitHandlerMeta
                // normalises that handler on this same command anyway. A busy title beside a plain handler name falls back to it (busyFallback).
                const videoTitle = String(sourceTitleOf(ffstream)).trim() || mediaTitleClean;
                const videoBusy = removeBusytitle === true && tooManyPeriods(videoTitle);
                const newVideoTitle = videoBusy ? busyFallback() : videoTitle;
                if(videoBusy) {
                    workDone += newVideoTitle
                        ? `☐${streamTag(ffstream.index)}[remove_busytitle=true] Change title (video) "${logSafe(videoTitle)}" -> ${quotedName(newVideoTitle)}\n`
                        : `☐${streamTag(ffstream.index)}[remove_busytitle=true] Remove title (video) "${logSafe(videoTitle)}"\n`;
                    metadataCommand += ` -metadata:s:v:${videoOutOrdinal} "title=${escMeta(newVideoTitle)}"`;
                    nameWritten = true;
                } else emitTitleReconcile('v', videoOutOrdinal, 'video', videoTitle);
                noteTitleTagDropped(newVideoTitle, 'video');

                emitHandlerMeta('v', videoOutOrdinal, 'video', 'VideoHandler', newVideoTitle, ' as it can cause problems for titles in mkv');

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
            } else if ((ffstreamType === 'data') || DATA_CODECS.includes(ffstreamCodec)) {
                // A track the mp4 muxer writes back on its own - the chapter track (isMp4ChapterTrack), or a tmcd timecode it rebuilds from the video's
                // or the file's timecode, one per video the output maps (isMp4RebuiltTimecode) - is left out of an mp4 output's map without counting as
                // work, and not recorded in removedIndices: the output holds it again, so the Expected results line keeps it, last (see mp4RebuiltLast). Its
                // line goes straight to the log, since a file with nothing else to do never flushes workDone.
                if (isMp4Family(dstContainer) && (isMp4ChapterTrack(ffstream) || isMp4RebuiltTimecode(ffstream, mappedVideos))) {
                    response.infoLog += mp4RebuiltLine(ffstream, dstContainer);
                    extraArguments += ` -map -0:${ffstream.index}`;
                    muxerRebuilt.push(ffstream);
                    continue;
                }
                // A tmcd carrying the timecode of a video above 255 fps (mp4OverfastFor) is one the muxer would rebuild but cannot time, so its line says so:
                // on a file with nothing else to do, the remux exists only to drop it.
                const fast = isMp4Family(dstContainer) && isTmcdTrack(ffstream) ? mp4OverfastFor(ffstream, mappedVideos) : undefined;
                const fastWhy = fast ? ` - the .${dstContainer} muxer cannot time a tmcd for the ${mp4TimecodeFps(fast.avg_frame_rate)} fps video beside it`
                    + ` (${MP4_TMCD_MAX_FPS} at most)` : '';
                workDone += `☐${streamTag(ffstream.index)} Remove data stream (${ffstreamType}-${ffstreamCodec})${fastWhy}\n`;
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
            nameCarryArgs += carryCommand;

            //An unrecognised attachment classified as 'other' is left untouched in mkv - remove it with a separate plugin if needed.
        }
        if (handlerRolesLost.length) {
            workDone += `☒[container=${dstContainer}] handler_name is being ${dstContainer === 'mkv' ? 'cleared' : 'replaced'} and was the only place these `
                + `roles lived, with no ${dstContainer} flag to hold them - lost: ${handlerRolesLost.join(', ')}\n`;
        }
        if (descriptionRolesLost.length) {
            workDone += `☒[container=${dstContainer}] The DESCRIPTION tag, which ${dstContainer} does not keep, was the only place these roles lived, with no`
                + ` ${dstContainer} flag to hold them - lost: ${descriptionRolesLost.join(', ')}\n`;
        }
        // One line per combination of settings that changed a title, naming them.
        for (const cause of [...new Set(titleRolesLost.map((r) => r.cause))]) {
            const what = cause.includes('remove_busytitle=true') ? 'A busy title being cleared' : 'A title being rewritten';
            workDone += `☒${cause ? `[${cause}] ` : ''}${what} was the only place these roles lived, with no ${dstContainer} flag to hold them `
                + `- lost: ${titleRolesLost.filter((r) => r.cause === cause).map((r) => r.entry).join(', ')}\n`;
        }

        // Resolve deferred font attachments now that subtitle removals are final: embedded fonts are only consumed by styled subtitles (ASS/SSA), so keep
        // them iff one survives in the output. mp4 never keeps fonts - it cannot carry a font attachment at all, and its styled subtitles have either
        // left in a bundle that took the fonts with them or been flattened to mov_text - so dstContainer gates this to mkv; the source codec is read from
        // ffProbeData (still 'ass'/'ssa' there even when converted), which is why the survivor check alone is not enough. A styled subtitle extracted by
        // sub_worker likewise takes its fonts with it (.mks bundle, back on reimport), so a missing ASS/SSA genuinely means these fonts are orphaned.
        if (deferredFontIndices.length > 0) {
            const fontsNeeded = dstContainer === 'mkv' && streams.some(s =>
                codecTypeOf(s) === 'subtitle'
                && !removedIndices.has(s.index)
                && isStyledSub(s.codec_name));

            if (!fontsNeeded) {
                for (const idx of deferredFontIndices) {
                    const fontStream = streams.find(s => s.index === idx);
                    const fname = (fontStream?.tags?.filename || '').trim();
                    workDone += `☐${streamTag(idx)} Remove orphaned font attachment (no ASS/SSA subtitle uses it)${fname ? ` "${logSafe(fname)}"` : ''}\n`;
                    dropStream(idx);
                }
            }
        }

        // One spelling of the all-gone test and of the method_unmuxable=drop wording for both stream types, so a remedy fix cannot reach only one of them.
        // mkv_fallback is offered only where it keeps the file, matroska storing every codec in it - never on an mkv target, which drops what matroska refuses.
        const allGone = (type) => streams.some((s) => codecTypeOf(s) === type) && !streams.some((s) => codecTypeOf(s) === type && !removedIndices.has(s.index));
        const fallbackKeeps = !streams.some((s) => [...UNMUXABLE_ANYWHERE, ...MKV_UNMUXABLE].includes(codecNameOf(s)));
        const failUnmuxableDropAll = (type) => failWithBuffers(`[method_unmuxable=drop] Dropping every ${type} stream ${dstContainer} cannot store would `
            + `leave the file with no ${type} at all - set method_unmuxable=error to stop instead${fallbackKeeps ? ', or mkv_fallback to keep this file in a'
            + ' container that can hold them' : ''}`);

        // Every path that can drop a video stream (method_unmuxable=drop above, cover art in the video branch, the pair mappedVideos reads) records it in
        // removedIndices, so the survivors are read from there. The first clause exists to stop the second being VACUOUSLY true: with no video stream at all,
        // "no video stream survives" holds trivially and would fail a file nothing was taken from. It is structural, not a policy about audio-only files - the
        // not-a-video skip far above means only a file the scanner classified as video reaches here, so an audio-only file never arrives to be protected.
        if (allGone('video')) {
            // Name the gate when it is the one that took the video, mirroring the audio guard below: its own two escapes are the fix, where the generic
            // wording sends the user to removal inputs that had nothing to do with it. A prores .mov bound for mp4 is the reachable case - prores is in
            // MP4_UNMUXABLE and is the file's only video stream, so method_unmuxable=drop empties the file on its own.
            if (streams.some((s) => codecTypeOf(s) === 'video' && unmuxableDrops.has(s.index))) failUnmuxableDropAll('video');
            failWithBuffers('Removing the specified streams would leave the file with no video streams - check your removal settings');
        }

        // method_unmuxable=drop is the ONLY path here that removes an audio stream (audio_clean owns every other audio keep/drop), so it needs its own
        // all-gone guard - the video one above does not cover audio. Gated on the file having had audio to begin with, so a genuinely silent file is untouched.
        if (unmuxableDrops.size > 0 && allGone('audio')) failUnmuxableDropAll('audio');

        // Post-loop file-level state: the container-global -metadata writes (for mp4TagPlan), and the recovery flags that go on the input side.
        const globalWrites = {};
        let fflags = '';
        let inputArgs = '';   // recovery args that must precede -i (e.g. -err_detect); placed on the input side of the preset

        // Case-insensitive read (getTagCI) for the reason spelled out at emitHandlerMeta above: matroska stores this key as COMMENT.
        const fileComment = getTagCI(file.ffProbeData.format?.tags, 'comment');
        if((removeComments === true) && fileComment) {
            workDone += `☐[remove_comments=true] Remove comment from file "${logSafe(fileComment)}"\n`;
            extraArguments += ` -metadata "comment="`;
            globalWrites.comment = '';
            convert = true;
        }

        // Case-insensitive for the same reason: a global title held in a matroska Tags element arrives as TITLE, and it replaces the Segment Info title in
        // ffmpeg's dictionary, so a file carrying both forms reports TITLE alone. The `title=` write below clears both forms.
        const fileTitle = getTagCI(file.ffProbeData.format?.tags, 'title') ?? '';
        if((removeBusytitle === true) && tooManyPeriods(fileTitle)) {
            workDone += `☐[remove_busytitle=true] Remove title from file "${logSafe(String(fileTitle).trim())}"\n`;
            extraArguments += ` -metadata "title="`;
            globalWrites.title = '';
            convert = true;
        }

        if (srcContainer !== dstContainer) {
            workDone += `☐[container=${dstContainer}] Remux file from ${srcContainer}\n`;
            convert = true;
        }

        // Recovery flags (below) apply when requested, or when the source container is known to need a timestamp fix. Recovery itself leaves nothing
        // observable in the stream layout and is a no-op with -c copy on already-cleaned content, so a routine health-check remux would otherwise reprocess
        // the file forever - to prevent that we stamp the requested recover_bad_* MODE SIGNATURE into a format-level awk_recovered tag and only recover when
        // it differs from the stamped one (a changed mode, or no tag yet), then re-stamp. That converges (matching tag = skip), so changing a mode re-runs
        // recovery exactly once and settles - no separate "run again" toggle is needed since the two recover_bad_* dropdowns are themselves the intent.
        const recoverRequested = recoverTs !== 'disabled' || recoverData !== 'disabled';
        // Order-stable signature of the recovery modes requested this run (e.g. "ts-light+data-aggressive"). escMeta is a no-op here (alphanumeric + '-' + '+')
        // but keeps the compared value byte-identical to what gets written to awk_recovered below.
        const recoverSig = [recoverTs !== 'disabled' && `ts-${recoverTs}`, recoverData !== 'disabled' && `data-${recoverData}`].filter(Boolean).join('+');
        const recoverIntent = escMeta(recoverSig);
        const recoveredTag = getTagCI(file.ffProbeData.format?.tags || {}, RECOVERED_TAG).trim();
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
        } else if(runRecover && tsOn) {
            fflags += '+genpts';
            workDone += `☐[recover_bad_timestamps=${recoverTs}] Regenerating missing PTS and shifting negative start times to zero\n`;
        }

        // MPEG-TS and MPEG-PS by demuxer family (isMpegTsPsFamily has the spellings and the .vob measurement), and AVI.
        if (isMpegTsPsFamily(srcContainer) || srcContainer === 'avi') {   // container-forced timestamp fix (always applied)
            const genptsAlreadySet = fflags.includes('genpts');
            if(!genptsAlreadySet)
                fflags += '+genpts';
            extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;
            // Independent of the recover_bad_* settings, so it needs saying even when they are disabled - otherwise a user sees a plain remux line and no
            // sign that the timestamps were rewritten. Suppressed when a recover_bad_timestamps line above already said the same thing.
            if(!genptsAlreadySet)
                workDone += `☐[container=${dstContainer}] Repairing ${srcContainer} timestamps - this source format cannot be remuxed without regenerating `
                    + 'PTS and shifting negative start times to zero\n';
        } else if (runRecover && tsOn)
            extraArguments = ` -avoid_negative_ts make_zero${extraArguments}`;   // normalize negative starts on any container we rebuild

        // recover_bad_data: light = +ignidx + -err_detect ignore_err (drops nothing), aggressive additionally drops corrupt frames.
        if(runRecover && dataOn) {
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
        if (convert === true && recoverRequested) {
            if (runRecover)
                workDone += `☐Stamp ${RECOVERED_TAG}=${recoverIntent} - recovery re-runs only if a recover_bad_* mode changes\n`;
            extraArguments += ` -metadata "${RECOVERED_TAG}=${recoverIntent}"`;
            globalWrites[RECOVERED_TAG] = recoverIntent;
        }

        // remove_imagesubs=export asked for a sidecar that could not be written, so the export did not happen and neither did the drop it protects. Fail
        // rather than remux around it: every cause counted here is environmental (a quote in the library directory, no path translator, a rejected upload)
        // and recurs on every future run, or transient (a server that could not say whether the sidecar is already there), and either way a remux around it
        // would leave the export setting quietly doing nothing while each run reported success. Failing costs nothing - the file is untouched and the image
        // subtitle is still embedded - and the error clears once the environment is fixed or the server answers, and the file is requeued. That last clause
        // is why an EMPTY extraction is diverted above rather than counted: nothing about it is fixable, so it would never clear.
        if (exportRefusedCount) {
            failWithBuffers(`[remove_imagesubs=export] ${exportRefusedCount} image subtitle${exportRefusedCount === 1 ? '' : 's'} could not be exported,`
                + ' see the reasons above - nothing was removed from the file');
        }
        if (bundleHeldCount) {
            failWithBuffers(`[container=mp4] ${bundleHeldCount} styled subtitle${bundleHeldCount === 1 ? '' : 's'} could not be exported to a bundle, see the `
                + 'reasons above - nothing was flattened or removed');
        }

        if (convert === true) {
            // An mp4 output keeps a global awk_* marker - this plugin's own awk_recovered, or one a sibling wrote - only under use_metadata_tags, and the
            // flag costs the native tags their readable form (mp4TagPlan). This plugin runs first, so a marker it drops is gone before the plugin that
            // wrote it re-reads it (sub_worker's sidecar-delete would then find no marker). Cover art never reaches the output here, so none is passed.
            const tagPlan = mp4TagPlan(dstContainer, file.ffProbeData.format?.tags, globalWrites);
            extraArguments += mp4MovflagsArg(dstContainer, tagPlan);
            workDone += mp4TagPlanLog(tagPlan, dstContainer);
            // The ' -strict <level>' this remux needs, or '' (see mp4StrictArg): TrueHD already living in an mp4-family file and re-muxed back into one
            // would see the very remux the muxability gate allowed FAIL without it, and a Dolby Vision stream would lose its dvcC/dvvC boxes to a plain mp4
            // copy. Reads the FINAL target container (mkv_fallback rewrites it) and the survivor set that gate leaves behind - a -strict describing a stream
            // this run no longer keeps would contradict MP4_STRICT_GATED's refusal rationale; only unmuxableDrops can remove an AUDIO stream, so the survivor
            // set is already complete. Read here rather than as a `convert = true` trigger: it is inert unless some other work emits a command, and forcing
            // a remux just to add a flag would be a loop (an untouched file keeps its boxes).
            const strictArg = mp4StrictArg(dstContainer, streams, streams.filter((s) => !unmuxableDrops.has(s.index)));
            // The streams the output maps, in its order (-map 0 less every removal and every track the muxer rebuilds): mp4TimecodeArgs keys its per-video
            // clears on that order, and mp4CreatedTracks counts the tracks the muxer adds from it.
            const mappedStreams = streams.filter((s) => !removedIndices.has(s.index) && !muxerRebuilt.includes(s));
            workDone += mp4TimecodeLog(dstContainer, mappedStreams);
            response.preset += `${fflags}${inputArgs}<io>${sidecarOut} -map 0 -c copy${extraArguments}${nameCarryArgs}${strictArg}`
                + `${mp4TimecodeArgs(dstContainer, mappedStreams)}${globalOutputOpt}`;
            response.infoLog += workDone;
            // A stream whose cleared handler or title held a role (clearedRolePrediction), as the output will carry it: the handler gone (or holding the title,
            // whose text is in the surviving role fields), the promoted flags set, and only the role fields that survive. roleFieldsLower memoises per stream
            // OBJECT, so seeding it for this predicted copy is what every classifier then reads - the copy keeps the source index, which mediaInfoFor joins on,
            // so the handler echo in mediaInfo's Title would otherwise still count.
            const predictClearedRoles = (s) => {
                const p = clearedRolePrediction.get(s.index);
                if (!p) return s;
                const tags = Object.fromEntries(Object.entries(s.tags || {}).filter(([k]) => k.toLowerCase() !== 'handler_name'));
                const out = { ...s, tags, disposition: { ...(s.disposition || {}), ...Object.fromEntries(p.adds.map((k) => [k, 1])) } };
                roleFieldCache.set(out, p.roleFields);
                return out;
            };
            // Predicted output: re-renders the input streams with the mutations this summary tracks - removedIndices filtering, streamOverlay (a converted
            // stream's codec), predictClearedRoles, the tracks the muxer rebuilds or creates, where it writes them (mp4RebuiltLast, mp4CreatedTracks), and the
            // flags the output is read back with (readBackDispositions, ahead of predictClearedRoles, whose copy is the one roleFieldsLower is seeded for). It
            // does NOT reflect queued language fills / tag_language standardization: those emit only a -metadata:s:...language= arg and never mutate the
            // ffprobe object summariseStream reads, so a track whose blank/looser tag will be rewritten still shows its pre-change lang token here.
            const shown = mp4RebuiltLast(dstContainer, streams, muxerRebuilt, mp4CreatedTracks(dstContainer, mappedStreams))
                .map(s => ({ s: enrichStream(s), idx: s.index }))
                .filter(({ idx }) => !removedIndices.has(idx))
                .map(({ s, idx }) => (streamOverlay.has(idx) ? { ...s, ...streamOverlay.get(idx) } : s));
            const outSummary = readBackDispositions(dstContainer, shown, carriesDisposition(response.preset))
                .map(predictClearedRoles)
                .map((s) => summariseStream(s)).join('');
            response.infoLog += `☑Expected results: ${outSummary}\n`;
            response.processFile = true;
        } else {
            if (recoverRequested && intentMatches)
                response.infoLog += `☑Already recovered with these options (${RECOVERED_TAG}=${recoveredTag}) - skipping to avoid reprocessing;`
                    + ' change a recover_bad_* mode to run again\n';
            return skip(`☑File is already ${dstContainer} and contains no streams requiring removal or conversion\n`);
        }
        return response;
    } catch (err) {
        flushBuffers();        // an unexpected bug must not swallow the diagnostics either - see failWithBuffers above
        failUnexpected(err);
    }
};
module.exports.details = details;
module.exports.plugin = plugin;
