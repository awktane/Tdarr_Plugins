// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_sub_worker',
    Name: 'Subtitle sidecar worker - extract embedded text subs to sidecars and reimport them',
    Type: 'Subtitle',
    Operation: 'Transcode',
    Description: `Round-trips text subtitles between the container and media-server-style sidecar files so they can be reviewed/edited on disk (by hand or an
                external script).

                \\naction=extract writes each embedded TEXT subtitle to a sidecar next to the video (native format: srt/ass/vtt) and, by default, removes those
                tracks from the file.
                \\nA STYLED subtitle (ASS/SSA) in a file that has embedded fonts is exported as a bundle named
                .<video>.s<streamIndex>[.<title>].<lang>[.<flags>].styled.mks - one Matroska holding the subtitle plus those fonts, which leave the video with
                it (they exist nowhere else, and Matroska is the only container that can carry both). The leading dot hides it from Plex/Jellyfin. Import
                restores the subtitle and its fonts together. An mp4 target cannot hold font attachments at all, so a bundle is left on disk until the file is
                mkv again.
                \\naction=import muxes matching sidecars back into the file (restoring language, title, and disposition) and, by default, deletes the sidecar
                once it is safely embedded. Import never drops a subtitle - anything not already embedded is muxed in (a copy already present just becomes a
                duplicate, never a loss).
                \\nAn SRT carries no title/language/disposition, so all of that is encoded in the filename:
                <video>.s<streamIndex>[.<title>][.<other flags>].<lang>[.<forced|sdh>].<ext> - the stream index keeps names unique, the title is reversibly
                encoded, and the language plus at most ONE server-documented flag sit last so Plex/Jellyfin/Emby auto-detect them (Plex accepts only one, and
                forced wins the slot because it drives automatic selection). Every other flag - commentary, descriptive, original, visual_impaired - rides
                AHEAD of the language, where media servers ignore it and this plugin still reads it, so nothing is lost and nothing confuses them.
                \\nImport ALSO recognizes sidecars named the way those servers do, with no s<index> (e.g. <video>.en.forced.srt), anchored on the language
                token: the flag spellings foreign (= forced), cc and hi (= sdh) and default (ignored) are all understood, as is Emby's parenthesized
                description (<video>.English(Commentary).srt), which becomes the track title. hi is only read as hearing-impaired when a real language precedes
                it, so <video>.hi.srt stays Hindi.
                \\nBitmap subtitles (PGS/VobSub/DVB) can't become text and are always left embedded and untouched.
                \\nembedded_cc (off by default) turns EMBEDDED CLOSED CAPTIONS into a real subtitle. Those are not a track at all - they are caption data
                carried inside the video picture (EIA-608/708, standard on North American broadcast recordings), which is why no player lists them beside the
                subtitles. extract writes them to a sidecar, import turns them into an embedded track. Reading them decodes the video, so it happens only on a
                file a cheap check says has them, and the verdict is remembered so no later pass repeats it.
                \\nScope both actions with only_languages (comma-separated, e.g. eng,jpn; blank = all). deduplicate collapses byte-identical sidecar copies on
                import, and its enabled_checkmedia mode also reads the video's own subtitle tracks to drop a duplicate or an empty one (see its tooltip).
                \\nRuns standalone, or in the awk stack after clean_and_remux (first) / audio_clean and before stream_ordering (last). If the file has embedded
                closed captions, run this BEFORE video_clean - re-encoding the video is the one thing that destroys them.`,
    Version: '3.46.0',
    Tags: 'pre-processing,post-processing,ffmpeg,subtitle only,configurable',
    Inputs: [
        {
            name: 'action',
            type: 'string',
            defaultValue: 'import',
            inputUI: {
                type: 'dropdown',
                options: ['import', 'extract'] },
            tooltip: `Which direction to run. Either way remove_source decides whether the source copy is deleted once the content is confirmed at the
                other end - it defaults to on, so by default a subtitle MOVES rather than being copied.
                \\n=====
                \\nActions
                \\n=====
                \\nextract: pull embedded text subtitles out of the video into sidecar files beside it.
                \\nimport: mux sidecar files sitting beside the video back into it.`,
        },
        {
            name: 'only_languages',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Limit both actions to these languages, comma-separated. Blank (default) acts on every language.
                \\nOne form is enough - en, eng, or English all match the same language, region variants like en-US included.
                \\nExample:\\neng,fra`,
        },
        {
            name: 'deduplicate',
            type: 'string',
            defaultValue: 'enabled_only_sidecar',
            inputUI: {
                type: 'dropdown',
                options: ['enabled_only_sidecar', 'enabled_checkmedia', 'disabled']
            },
            tooltip: `What counts as a copy of a subtitle you already have. The TEXT decides, so only byte-for-byte duplicates are ever collapsed - two
                commentaries, or a real forced track beside a full one, are different text and both survive.
                \\n=====
                \\nActions
                \\n=====
                \\nenabled_only_sidecar (default) - compare the SIDECARS only. On import a byte-identical group becomes a single track carrying their
                combined flags (a plain + SDH pair imports once, tagged SDH), and a sidecar whose text is already embedded is skipped instead of added a
                second time. Nothing is removed from the video.
                \\nenabled_checkmedia - also read the video's own subtitle tracks, in both actions. That catches two problems the sidecars alone cannot
                show: a subtitle the video carries twice (the first copy survives and inherits the others' flags, title and language, so no tagging is
                lost), and a track holding no text at all, which a player still lists. This is the only setting that deletes a subtitle you did not ask to
                extract, and it costs one extra read of the file.
                \\ndisabled - mux every sidecar as its own track, byte-identical copies included, so you may end up with duplicate subtitles.
                \\nDeleting the sidecar FILES afterwards is remove_source's decision whatever this is set to, and it removes every member of a collapsed
                group rather than only the one that was muxed. Embedded closed captions are not subtitle tracks and are never seen here; once embedded_cc
                has turned them into a sidecar or a track they are ordinary subtitles and deduplicate like any other.`,
        },
        {
            name: 'embedded_cc',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'enabled']
            },
            tooltip: `Turn EMBEDDED CLOSED CAPTIONS into a real subtitle. These are not a subtitle track - they are caption data carried inside the video
                picture itself (EIA-608/708, standard on North American broadcast recordings), which is why no player lists them alongside the subtitles and
                why re-encoding the video destroys them.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): leave them alone.
                \\nenabled: read the captions out and hand them to action - extract writes a sidecar beside the video, import turns them into an embedded
                subtitle track over two passes, one to read and one to mux. Either way they arrive tagged undetermined language and flagged SDH, because
                CEA-608 carries no language of its own and anything else would be a guess; clean_and_remux can fill the language in later.
                \\nCost: reading captions DECODES the video, roughly 3x faster than playback on 4K, so it is far more expensive than an ordinary subtitle
                extract, which only copies. It is paid only on a file a cheap up-front check says has captions, and only once - the verdict is remembered
                in the file.
                \\nExpect less than a dedicated tool: ffmpeg's caption reader can come up empty on a file that genuinely has them (reported, never passed
                off as success), styling such as italics and colour is dropped, and roll-up captions repeat each line across three cues, which is what
                roll-up is rather than a fault.
                \\nRemoving the captions from the video is remove_source's decision, as for any other subtitle. It needs either a compatible source (H.264,
                not HDR, not Dolby Vision) or a later re-encode by video_clean, which picks the request up automatically.`,
        },
        {
            name: 'remove_source',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false']
            },
            tooltip: `Remove the source copy once the content is confirmed at the destination. One setting for both directions because it is one intention:
                on, a subtitle MOVES; off, it is copied and you keep both.
                \\n=====
                \\nActions
                \\n=====
                \\ntrue (default) on EXTRACT - remove each text subtitle from the video, but only after its sidecar is confirmed written, so a failed write
                costs you nothing but the extraction. For embedded closed captions this also strips the caption data out of the video bitstream - see
                embedded_cc.
                \\ntrue (default) on IMPORT - delete each sidecar once its text is confirmed to be one of the embedded subtitles.
                \\nfalse - keep both copies: nothing leaves the video on extract, and no sidecar is deleted on import.
                \\nADD THIS PLUGIN TO THE POST-PROCESSING PLUGIN STACK as well as the pre-processing one, or import will never delete anything. The deletion
                has to wait until you accept the transcode, since deleting sooner would destroy the sidecars of a run you then reject. Miss that stack entry
                and nothing is lost - the sidecars simply stay on disk.
                \\nStyled ASS/SSA depend on fonts embedded in the video, so extract exports them as a .mks bundle holding the subtitle and those fonts
                together, and removes the fonts along with it. That is what keeps the styling intact for a later reimport.
                \\nOn a node that cannot see the library folder, both a sidecar's arrival and its deletion work differently - see method_unmapped.`,
        },
        {
            name: 'method_import_metadata',
            type: 'string',
            defaultValue: 'embedded',
            inputUI: {
                type: 'dropdown',
                options: ['embedded', 'sidecar']
            },
            tooltip: `Who wins when a sidecar's TEXT is already one of the embedded tracks but its language, title or flags disagree. Reachable only while
                deduplicate is comparing text (either enabled value); a sidecar muxed as a NEW track always takes its metadata from its filename, since
                nothing else describes it.
                \\n=====
                \\nActions
                \\n=====
                \\nembedded (default) - leave the track as it is and report the difference. The safe choice with an older sidecar name: a name written
                before a flag existed carries no token for it, and applying it would strip that flag off a track that has it.
                \\nsidecar - the filename wins, so renaming a sidecar retunes the track already in the file - language, title and flags, including clearing
                flags you took out of the name. Use it when you renamed a sidecar deliberately; it costs one remux of the file.`,
        },
        {
            name: 'method_unmapped',
            type: 'string',
            defaultValue: 'error',
            inputUI: {
                type: 'dropdown',
                options: ['error', 'mount', 'text_file']
            },
            tooltip: `What to do on an UNMAPPED node - one handed a local copy of the video that never sees the library folder itself. Ignored entirely on a
                normal (mapped) node, where all of this just works.
                \\nEXTRACT already works on any node: a mapped node writes the sidecar straight into the library, an unmapped one extracts it locally and
                uploads it through Tdarr's file API. IMPORT is the problem, because finding sidecars means listing a directory and that API cannot list one.
                This setting is the answer to that.
                \\n=====
                \\nActions
                \\n=====
                \\nerror (default) - fail the file and say why, so nothing is skipped silently. Run import on a node that can see the library.
                \\nmount - reach the library directly. The node's own path is tried first, so a container bind-mounting the library at the server's own path
                (e.g. /media) needs nothing more. Otherwise set this node's Node Tag field, on the server's node options page, to a "key=value" entry - key
                being the FIRST folder of the server's path, value being where THIS node sees that same folder. Windows and macOS nodes need one, because the
                server's path cannot exist locally. Tdarr keeps its own tags in that field too, so add yours alongside them rather than replacing them.
                Extract writes directly in this mode as well, skipping the upload API.
                \\nExample: server library /media/Shows, mounted on this Windows node as M:\\Shows
                \\nmedia=M:
                \\ntext_file - read "<video>.subtitles.txt" beside the video: one filename per line, lines starting with # ignored. Extract seeds the list
                with what it wrote; after that it is yours to maintain, which is how a subtitle you OCR'd from an exported image sub gets imported. Each name
                must still follow the sidecar naming convention, since that is where its language, title and flags come from.
                \\nDELETING a sidecar (remove_source on import) is separate again: an unmapped node cannot delete a library file at all, since Tdarr's API
                offers upload and download but not delete. The post-processing pass does it server-side instead, which is why that stack entry is required.
                \\nOne case costs an extra pass: on an unmapped node with no mount, when every sidecar is ALREADY embedded there is nothing to mux - so no
                transcode, no acceptance, and no post-processing run in which to delete anything. remove_source then forces a lossless -c copy of the video
                purely to reach that stage. It is a full read and write to remove a few kB of text, but it is the only route and it happens at most ONCE per
                file.`,
        },
    ],
});
// #endregion

// eslint-disable-next-line no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')(); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
    // eslint-disable-next-line no-param-reassign
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

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // #region SHARED helpers (15 sections: file-failure helpers … ffmpeg metadata escaping)
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
    // ===== SHARED [sub_worker, video_clean]: marker persistence =====
    // -=-=-= markerPersists  [sub_worker, video_clean] =-=-=-
    // Can a container carry a GLOBAL awk_* marker back out of a mux? Matroska and its siblings store an arbitrary tag natively; the mp4 family keeps one only
    // because every mux here adds -movflags use_metadata_tags. The listed set is what was MEASURED to keep one on the production build; an unlisted container
    // is assumed marker-hostile whether or not its muxer happens to preserve a tag, because that is the fail-safe direction - it costs a declined pass rather
    // than one that can never converge. Some are not fixable at all: .3gp/.3g2 discard a custom global tag WITH the flag as well as without, so no marker can
    // exist in one. Both carriers keep the SOURCE container, so the answer is the source's; clean_and_remux always writes mkv or mp4, which is the way out of
    // a hostile one. The stake is the same wherever a marker records work: a pass that cannot remember what it did does it again, and where the arguments come
    // out identical Tdarr ERRORS the file as an infinite transcode loop rather than merely repeating the cost.
    const markerPersists = (container) => ['mkv', 'mka', 'mks', 'webm'].includes(String(container || '').toLowerCase()) || isMp4Family(container);
    // ===== END SHARED: marker persistence =====
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language token failure =====
    // -=-=-= failLangToken  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The failFile message echoes the offending token capped at 200 chars, with control characters collapsed to a space: free text is unbounded and Tdarr
    // persists the whole error message, and a raw newline in the echo would split the line into a continuation carrying no ☐/☑/☒ status symbol.
    const failLangToken = (name, token) => failFile(`[${name}=${String(token ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}] not a recognised language`
        + ' - use an ISO-639 code (en/eng/fre), an English name (English), a BCP-47 tag (pt-BR), or a special code (und/mul/zxx/mis/qaa-qtz)');
    // ===== END SHARED: language token failure =====

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

    // ============= SUBTITLE SIDECAR HELPERS (non-shared) =============
    // Text subtitle codecs we can round-trip, mapped to the sidecar's native extension + ffmpeg encoder. Bitmap
    // codecs (hdmv_pgs_subtitle/dvd_subtitle/dvb_subtitle/xsub) have no text form: never extracted, never removed.
    const TEXT_SUB = {
        subrip:   { ext: 'srt', enc: 'srt' },
        srt:      { ext: 'srt', enc: 'srt' },
        mov_text: { ext: 'srt', enc: 'srt' },
        text:     { ext: 'srt', enc: 'srt' },
        ass:      { ext: 'ass', enc: 'ass' },
        ssa:      { ext: 'ass', enc: 'ass' },
        webvtt:   { ext: 'vtt', enc: 'webvtt' },
    };
    const isTextSub = (codec) => Object.prototype.hasOwnProperty.call(TEXT_SUB, String(codec).toLowerCase());
    // Both directions of the table above, derived from it so a new codec row is ONE edit: the loose-text sidecar extensions parseSidecar accepts (a bundle
    // is admitted by BUNDLE_EXT instead, so 'mks' must never be a TEXT_SUB ext - extract would write one no import could read back), and the reverse ext ->
    // codec name for a sidecar not muxed in yet. Several codecs share an ext, so the reverse keeps the FIRST row declaring it - the canonical spelling
    // ffprobe reports back for a sidecar that row's encoder wrote (subrip for .srt, ass for .ass, webvtt for .vtt). Keep the canonical codec first.
    const TEXT_EXTS = [...new Set(Object.values(TEXT_SUB).map((t) => t.ext))];
    const EXT_TO_CODEC = Object.fromEntries(TEXT_EXTS.map((ext) => [ext, Object.keys(TEXT_SUB).find((c) => TEXT_SUB[c].ext === ext)]));
    // STYLED subtitles render through fonts that exist only as container attachments, so extracting one to a loose text file destroys the styling
    // irrecoverably - it is exported as a Matroska BUNDLE instead, subtitle plus every font attachment. Matroska is the only container that can: mp4/mov
    // reject ass and carry no attachments, WebM allows only WebVTT, and a fonts-ONLY Matroska writes unreadable. .mks is Matroska's subtitle-only
    // extension (.mkv/.mka mux identically, but a server that scans dotfiles - Emby - would read those as a video/music track). Verified on
    // jellyfin-ffmpeg 7.1.4: language, title, disposition and the font bytes all survive the round trip. The fixed marker token before the extension is
    // what makes a bundle name unambiguous: clean_and_remux's remove_imagesubs=export writes dot-prefixed .mks IMAGE-subtitle sidecars in the same name
    // shape, and importing one of those as a bundle would silently re-add the image subtitle that pass had just removed. clean_and_remux writes the token
    // on its OWN styled bundles, so those DO come back through the import as bundles - the whole point of exporting them in that form.
    const BUNDLE_EXT = 'mks';
    const BUNDLE_TOKEN = 'styled';

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

    // Dispositions encoded as filename tokens, in fixed order. `ff` is the ffmpeg -disposition name restored on import; `flags` are the ffprobe
    // disposition keys that, when set on the source, emit this token on extract. They differ only for SDH: hearing_impaired and captions are
    // the same closed-captions role, but captions has no Matroska flag and does not survive an mp4->mkv round-trip (the muxer silently drops
    // +captions), so BOTH normalise to the container-portable hearing_impaired - extract emits a single 'sdh' token for either flag and import
    // restores hearing_impaired. The human-readable role also survives in the encoded title. `default` is deliberately NOT tracked: muxers
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
    // Parse-only tokens recognised so they aren't mis-read as the language, but carrying
    // NO disposition: 'default' is muxer-managed, not a role we track or restore.
    const DISP_IGNORE = new Set(['default']);
    const DISP_TOKENS = new Set([...DISPOSITIONS.map((d) => d.token), ...Object.keys(DISP_ALIAS), ...DISP_IGNORE]);
    // Alias tokens that are ALSO a real ISO 639-1 code, so the right-to-left disposition strip must not swallow the language slot: 'hi' is both the
    // hearing-impaired flag and Hindi. Such a token counts as a disposition only when a real language sits immediately before it (Jellyfin's own rule),
    // so <name>.en.hi.srt is English+SDH while <name>.hi.srt stays a Hindi track. See the guard in parseSidecar's disposition loop.
    const DISP_AMBIGUOUS_LANG = new Set(['hi']);
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
    // The only tokens a media server both documents and acts on, and Plex takes just ONE of them - ".forced.sdh" is not a supported combination, it is one
    // or the other. So the trailing run carries a single flag and every other role joins 'original' ahead of the language, where servers do not look and
    // nothing is lost because our own parser reads both regions. forced wins the slot over sdh: it drives AUTOMATIC selection (a forced track that loses
    // its flag stops appearing by itself), whereas an unlabelled SDH track is still listed and selectable, just not marked.
    const SERVER_FLAG_TOKENS = ['forced', 'sdh'];
    const dispFfOf = (token) => (DISPOSITIONS.concat(EXTRA_DISPOSITIONS).find((d) => d.token === token) || {}).ff;
    // extract: one canonical token per role the stream's real flags carry (sdh covers hearing_impaired OR captions), deduped.
    const dispTokensOf = (s) => DISPOSITIONS.filter((d) => d.flags.some((f) => s.disposition?.[f] === 1)).map((d) => d.token);
    const extraTokensOf = (s) => EXTRA_DISPOSITIONS.filter((d) => d.flags.some((f) => s.disposition?.[f] === 1)).map((d) => d.token);
    // The RAW ffmpeg disposition flags a stream actually has set, and whether two such sets are the same. One concept and one comparison, because the two
    // places that ask - the duplicate fold's retag decision and the sidecar-metadata retune - must agree or the file never converges: a refinement landing at
    // one site only (folding 'captions' onto 'hearing_impaired' before comparing, say) would have the retune queue a remux on every pass for a pair the fold
    // already considers identical. Optional-chained so a null stream yields an empty set rather than throwing.
    const activeDispositions = (s) => Object.keys(s?.disposition || {}).filter((k) => s.disposition[k] === 1);
    const sameDispositions = (a, b) => a.size === b.size && [...b].every((k) => a.has(k));

    // One reversible percent-codec behind both filename-ish tokens this plugin writes. A char in the caller's `safe` set passes through; every other char's
    // UTF-8 bytes become uppercase %XX. pctDecode is the exact inverse, and validates the two hex digits so malformed input (a hand-edited or foreign marker)
    // round-trips unchanged rather than decoding to a NUL byte - a mangled name then simply matches no sidecar, which is the safe outcome.
    const pctEncode = (str, safe) => {
        let out = '';
        for (const ch of String(str)) {
            if (safe.test(ch)) { out += ch; continue; }
            for (const b of Buffer.from(ch, 'utf8')) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
        }
        return out;
    };
    const pctDecode = (str) => {
        const s = String(str);
        const bytes = [];
        for (let i = 0; i < s.length; i += 1) {
            if (s[i] === '%' && i + 2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
            else for (const b of Buffer.from(s[i], 'utf8')) bytes.push(b);
        }
        return Buffer.from(bytes).toString('utf8');
    };
    // The safe sets. TITLE_SAFE keeps a title readable in one filesystem-safe, dot-free filename token (safe on Windows, Linux and Mac alike) - the rest (.
    // / \ : * ? " < > | % and non-ASCII) is encoded, the dot because it is the sidecar name's field separator. MARKER_SAFE is stricter: the import marker's
    // VALUE carries sidecar paths, relative to the video's directory, so it must survive escMeta and carry no comma (the list separator). The marker is a
    // GLOBAL tag because only that survives every container (mp4 drops per-stream title/default); what it is for is at the import branch.
    // NEVER_SAFE matches nothing, so pctEncode escapes whatever it is handed - it forces a character out of a spelling that would otherwise be read as a token.
    const TITLE_SAFE = /[A-Za-z0-9 _()',!&+=@#-]/;
    const MARKER_SAFE = /[A-Za-z0-9]/;
    const NEVER_SAFE = /(?!)/;
    const encodeTitle = (t) => pctEncode(t, TITLE_SAFE);
    const encodeMarker = (s) => pctEncode(s, MARKER_SAFE);
    const encodeMarkerList = (names) => names.map(encodeMarker).join(',');
    const decodeMarkerList = (v) => String(v || '').split(',').filter(Boolean).map(pctDecode);
    // Keep the sidecar basename under the filesystem's 255-byte cap; if the encoded title pushes it over,
    // trim the RAW title (whole chars, so UTF-8 stays valid) until it fits and flag the lossy truncation.
    let titleTruncated = false;
    const NAME_BYTE_CAP = 255;   // filesystem basename byte limit (ext4/APFS/NTFS) the encoded sidecar name must fit under
    const encodeTitleCapped = (rawTitle, fixedLen) => {
        let raw = String(rawTitle);
        // Bound the work: the name budget is 255 bytes and encodeTitle emits >= 1 byte per raw char, so any raw title longer
        // than 255 chars can never fit - trimming it up front makes the fit loop O(cap) instead of O(N^2) on a crafted multi-KB
        // title (untrusted container metadata), losing only chars the loop would trim anyway (output identical, still flagged).
        if (raw.length > NAME_BYTE_CAP) { raw = raw.slice(0, NAME_BYTE_CAP); titleTruncated = true; }
        let enc = encodeTitle(raw);
        while (raw.length > 0 && Buffer.byteLength(`${enc}${'.'.repeat(fixedLen ? 1 : 0)}`, 'utf8') + fixedLen > NAME_BYTE_CAP) {
            raw = raw.slice(0, -1); enc = encodeTitle(raw); titleTruncated = true;
        }
        return enc;
    };

    // #region SHARED helpers (5 sections: preset path safety … language display name)
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
    // Recognise a filename token as a real language, so a server-native sidecar can be anchored on it without mis-reading an arbitrary token. NOT
    // interchangeable with the shared knownLangToken - they differ in both directions: this one takes a RAW token and folds it itself, so it recognises
    // 'English' (the Emby paren split and the server-native anchor depend on that), while knownLangToken takes an ALREADY-FOLDED key and answers false for
    // a spelled-out name; and knownLangToken accepts und/mis and qaa-qtz because a language INPUT must be able to name them, while here they are not
    // languages at all - reading 'und' as one turns '<video>.und.hi.srt' from Hindi into an SDH flag on an undetermined track.
    const isRealLanguageToken = (token) => { const k = langKey(token); if (!k) return false; return !!langDisplayName(k); };

    // #region SHARED helpers (3 sections: iso639-1 to iso639-2 map … closed-caption handoff)
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

    // ===== SHARED [sub_worker, video_clean]: closed-caption probe =====
    // -=-=-= A53 probe constants / deriveFfprobePath / probeA53Captions  [sub_worker, video_clean] =-=-=-
    // Closed captions are not a stream. They ride INSIDE the video bitstream as A53/EIA-608 SEI, so no stream list mentions them and nothing short of a
    // decode-side probe can see them - which is also why a re-encode is the one operation that can destroy them. ffprobe reports them as per-frame side data,
    // and reading a BOUNDED window of frames answers the question at a cost independent of duration (measured 0.2-17s across the sample corpus, a clip and a
    // feature alike) because -read_intervals stops the read instead of scanning to EOF. Do NOT reach for the movie=...[out0+subcc] filter to detect: it has no
    // working bound - on a caption-FREE file the subtitle output never ends, so ffmpeg decodes the whole file hunting packets that never arrive.
    const A53_PROBE_TIMEOUT_MS = 120000;
    const A53_PROBE_MAX_BYTES = 8 * 1024 * 1024;
    const A53_PROBE_FRAMES = 400;                         // captions are sparse, and a programme's opening is often silent; 400 frames spans enough to decide
    const A53_SIDE_DATA = 'A53 Part 4 Closed Captions';   // ffprobe's spelling of the side-data type, and the only positive signal there is

    // Tdarr hands a plugin otherArguments.ffmpegPath and nothing else; ffprobe sits beside it under the same name. Replace only the FINAL path component: the
    // production path carries 'ffmpeg' as a DIRECTORY as well as the basename (.../assets/app/ffmpeg/darwin_arm64/ffmpeg), so a plain string replace rewrites
    // the directory and yields a path to nothing. Returns '' when the binary can't be located, which every caller must read as "unknown", never as "no".
    const deriveFfprobePath = (ffmpegPath) => {
        const p = String(ffmpegPath || '').trim();
        if (!p) return '';
        const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        const base = p.slice(cut + 1);
        if (!/^ffmpeg(\.exe)?$/i.test(base)) return '';   // an unexpected basename (a wrapper script, say): no safe derivation
        const probe = p.slice(0, cut + 1) + base.replace(/^ffmpeg/i, 'ffprobe');
        if (cut < 0) return probe;                        // a bare 'ffmpeg' means a PATH lookup, and 'ffprobe' resolves the same way
        try { return fs.existsSync(probe) ? probe : ''; } catch (e) { return ''; }
    };

    // Does the primary video stream carry A53 caption side data? Returns true / false / 'unknown' - and 'unknown' is NOT 'no': it means the probe could not
    // run, so a caller stays fail-safe rather than concluding the file is caption-free. `cap` is the test-injected verdict (__awkCap.captions): supplying it
    // short-circuits the spawn entirely, which is how the harness stays free of real binaries.
    const probeA53Captions = (filePath, ffprobePath, cap) => {
        if (cap === true || cap === false) return cap;
        if (!filePath || !ffprobePath) return 'unknown';
        try {
            const { spawnSync } = require('child_process');
            const args = ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', `%+#${A53_PROBE_FRAMES}`,
                '-show_frames', '-show_entries', 'frame=side_data_list', '-of', 'default=nw=1', filePath];
            const r = spawnSync(ffprobePath, args, { encoding: 'utf8', timeout: A53_PROBE_TIMEOUT_MS, maxBuffer: A53_PROBE_MAX_BYTES });
            if (!r || r.status !== 0) return 'unknown';
            return String(r.stdout || '').includes(A53_SIDE_DATA);
        } catch (e) { return 'unknown'; }
    };
    // ===== END SHARED: closed-caption probe =====

    // ===== SHARED [sub_worker, video_clean]: closed-caption handoff =====
    // -=-=-= CC_TAG / CC_TOKENS / ccTokensOf  [sub_worker, video_clean] =-=-=-
    // The cross-plugin channel for embedded closed captions. They live in the video BITSTREAM rather than in a stream list, so sub_worker can read them out
    // to a sidecar or a subtitle track but can only DELETE them where its own -c copy pass may filter the bitstream (H.264, not HDR, not Dolby Vision);
    // video_clean is the only plugin that re-encodes video, so it is the only one that can be rid of them on anything else. The request therefore travels in
    // a global CC_TAG tag on the file, written by sub_worker and read by video_clean. It is SHARED so a token added or renamed on one side cannot go missing
    // on the other: a writer and a reader whose vocabularies drift fail SILENTLY, leaving the captions in the file twice. Deliberately not the awk_sub_worker
    // marker - that is a list of sidecar PATHS whose reader matches entries against paths, so a flag word pushed in there would be read as a filename.
    //   strip    - the captions are out (a sidecar or a subtitle track holds them) but the bitstream copy is still there; drop it on the next re-encode.
    //   none     - the caption channel was decoded and carried no caption text at all, so no later pass need pay for that decode again.
    //   imported - the captions are already embedded as a real subtitle track, so sub_worker must not read them out a second time.
    // The value is a COMMA LIST and every reader splits it, because the states genuinely combine: an imported round trip that could not strip in its own pass
    // records `imported,strip`, and an empty channel on a source the filter refuses records `none,strip`. A writer therefore EXTENDS the tag rather than
    // replacing it with one token - a whole-value overwrite would erase a pending request instead of deferring it.
    const CC_TAG = 'awk_cc';
    const CC_TOKENS = { strip: 'strip', none: 'none', imported: 'imported' };
    const ccTokensOf = (tags) => getTagCI(tags || {}, CC_TAG).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    // ===== END SHARED: closed-caption handoff =====
    // #endregion
    // Normalise a sidecar language token to a lowercase 3-letter ISO 639-2/T code for an mp4-family import target (mdhd silently drops 2-letter/spelled codes).
    // langKey folds spelled names and 639-2/B onto the 2-letter key, which ISO639_1_TO_2 maps to /T; an already-3-letter code (eng, fil, und) or an unmappable
    // token is left as-is. Mirrors clean_and_remux's toCanonicalTag three(false); mkv keeps the raw token where it is already a code (see normSidecarLang).
    const to6392T = (lang) => { const key = langKey(lang); if (!key || key.length !== 2) return lang; return ISO639_1_TO_2[key] || lang; };
    // Plex/Jellyfin/Emby all accept a spelled-out language NAME in a sidecar name (Movie.English.srt), which isRealLanguageToken recognises - but the name
    // itself is not a valid container language tag, so writing it through would stamp "language=English" into the mkv. Fold any non-code token to its code; a
    // token already shaped like a code is passed through untouched so a region tag (pt-BR) survives - the whole point of keeping the raw token on mkv.
    const LANG_CODE_SHAPE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
    const normSidecarLang = (lang) => (LANG_CODE_SHAPE.test(String(lang)) ? lang : to6392T(lang));

    // sidecarBasename <-> parseSidecar are exact inverses. Name = <videoBase>.s<index>[.<encTitle>].<lang>[.<disp...>].<ext>. parseSidecar ALSO
    // accepts a server-native name with no s<index> (e.g. <videoBase>.en.forced.srt), anchored on a recognized <lang> token. A styled-subtitle BUNDLE
    // uses the same name with the .mks extension and a leading dot, so media servers skip it (it is an archive, not a subtitle to offer the viewer).
    // The name stays the authority on language/title/disposition for a bundle too - the .mks also carries them internally, but import re-applies the
    // filename's values, so renaming a bundle retunes it exactly like renaming a loose sidecar.
    const sidecarBasename = (s, bundle) => {
        // lang is the only metadata-derived filename component read raw (title is percent-encoded via encodeTitle, disp/ext are fixed enums); the shared
        // sidecarLangToken restricts it to the language-code charset - see its definition for why. parseSidecar round-trips it unchanged, since a valid
        // code (en/eng/pt-br) already fits within [a-z0-9-].
        const langRaw = sidecarLangToken(s);
        // A tag that sanitises to a disposition-token word (a crafted tags.language of "forced"/"sdh"/etc.) would be consumed as a trailing disposition by
        // parseSidecar's right-to-left disp strip, nulling or corrupting the reimport - collapse any such collision to 'und' so the fixed language slot can
        // never be shaped like a disposition token. A DISP_AMBIGUOUS_LANG token is exempt because it is also a real language code: the disp strip only reads
        // it as a disposition when a real language sits immediately before it, so a Hindi track keeps 'hi' here rather than losing its language to 'und'.
        // The `collides` escape below is what keeps that preceding slot free of anything the strip would mistake for a language.
        const lang = ((DISP_TOKENS.has(langRaw) && !DISP_AMBIGUOUS_LANG.has(langRaw)) || EXTRA_TOKENS.has(langRaw)) ? 'und' : langRaw;
        const roles = dispTokensOf(s);
        const trailing = SERVER_FLAG_TOKENS.find((t) => roles.includes(t));   // at most one, and only a token every server documents
        const disp = trailing ? [trailing] : [];
        // Everything else - a second server flag Plex could not have taken anyway, plus our own roles - rides ahead of the language beside 'original'.
        const extra = extraTokensOf(s).concat(roles.filter((t) => t !== trailing));
        const ext = bundle ? BUNDLE_EXT : TEXT_SUB[String(s.codec_name).toLowerCase()].ext;
        const dot = bundle ? '.' : '';
        const mark = bundle ? `.${BUNDLE_TOKEN}` : '';
        const pre = extra.length ? `.${extra.join('.')}` : '';
        const rawTitle = s.tags?.title || '';
        // The same collision one field to the left: TITLE_SAFE passes letters and '_' straight through, so a title that IS a token ("forced", "original")
        // would encode to that exact word and be eaten by parseSidecar's token strip - losing the title and inventing a flag. Encoding only ever expands, so
        // ONLY a title that already is the token can reach that spelling; escape its first character in that one case, which pctDecode reverses exactly. A
        // DISP_AMBIGUOUS_LANG language slot collides the same way with a title that NAMES a language ("English" ahead of 'hi'): that is exactly the
        // language-then-disposition shape the strip acts on, so it would read the title as the language and invent an SDH flag. Escape that title too. The
        // two extra bytes join the fixed budget so the 255-byte name cap still holds.
        const collides = DISP_TOKENS.has(rawTitle) || EXTRA_TOKENS.has(rawTitle) || (DISP_AMBIGUOUS_LANG.has(lang) && isRealLanguageToken(rawTitle));
        const fixed = `${dot}${videoBase}.s${s.index}${pre}.${lang}${disp.length ? `.${disp.join('.')}` : ''}${mark}.${ext}`;
        const encRaw = rawTitle ? encodeTitleCapped(rawTitle, Buffer.byteLength(fixed, 'utf8') + (collides ? 2 : 0)) : '';
        const encTitle = collides && encRaw ? `${pctEncode(encRaw.slice(0, 1), NEVER_SAFE)}${encRaw.slice(1)}` : encRaw;
        return `${dot}${videoBase}.s${s.index}${encTitle ? `.${encTitle}` : ''}${pre}.${lang}${disp.length ? `.${disp.join('.')}` : ''}${mark}.${ext}`;
    };
    const parseSidecar = (name) => {
        const extMatch = name.match(/\.([A-Za-z0-9]+)$/);
        if (!extMatch) return null;
        const ext = extMatch[1].toLowerCase();
        const bundle = ext === BUNDLE_EXT;
        if (!bundle && !TEXT_EXTS.includes(ext)) return null;
        // A bundle is written only by us, always dot-prefixed and always with the s<index> anchor (required below), so an unrelated .mks dropped
        // beside the video is left alone rather than muxed in blind.
        if (bundle && !name.startsWith('.')) return null;
        // The leading dot is stripped for EVERY sidecar, not just bundles, so the rest parses identically either way. A hidden text sidecar is a real
        // arrival, not junk: clean_and_remux exports image subtitles dot-prefixed for external OCR, and the OCR comes back as ".<video>.s<n>.<lang>.srt"
        // with that dot intact - refusing it here stranded the user's OCR work in the library forever. Hiding a sidecar from media servers says nothing
        // about whether we should read it, and an unrelated hidden file is still rejected below by the videoBase and language-token requirements.
        const bare = name.startsWith('.') ? name.slice(1) : name;
        if (!bare.startsWith(`${videoBase}.`)) return null;
        const mid = bare.slice(videoBase.length + 1, bare.length - extMatch[0].length);
        const toks = mid.split('.');
        if (!toks.length) return null;
        // Require (and consume) the bundle marker before anything else reads the trailing tokens, so a clean_and_remux image-subtitle export sharing the
        // .mks extension and the same name shape is rejected here rather than re-imported as a styled bundle. See BUNDLE_TOKEN.
        if (bundle) { if (toks[toks.length - 1] !== BUNDLE_TOKEN) return null; toks.pop(); }
        // Our own sidecars lead with an s<index> order marker; a fresh server-native sidecar (Movie.en.forced.srt) has none. Consume the marker if
        // present (index only keeps our names unique); otherwise index is null and the language token below MUST be a recognized language, so an
        // unrelated .srt (Movie.backup.srt) is not mis-read as lang="backup" and imported as junk.
        const ours = /^s\d+$/.test(toks[0]);
        if (bundle && !ours) return null;
        const index = ours ? parseInt(toks.shift().slice(1), 10) : null;
        // Trailing dispositions, right-to-left. A DISP_AMBIGUOUS_LANG token only counts as a disposition when the token it would expose is itself a real
        // language, so Movie.en.hi.srt reads as English+SDH while Movie.hi.srt - and our own Movie.s3.Title.hi.srt - keeps Hindi as its language.
        const rawDisp = [];
        while (toks.length && DISP_TOKENS.has(toks[toks.length - 1])) {
            if (DISP_AMBIGUOUS_LANG.has(toks[toks.length - 1]) && !isRealLanguageToken(toks[toks.length - 2] || '')) break;
            rawDisp.unshift(toks.pop());
        }
        // drop ignored (default), normalise aliases (cc/hi->sdh, foreign->forced), dedupe
        const dispTokens = [...new Set(rawDisp.filter((t) => !DISP_IGNORE.has(t)).map((t) => DISP_ALIAS[t] || t))];
        if (!toks.length) return null;
        let lang = toks.pop();                                            // language is the next-from-right token
        if (!lang) return null;
        // Emby distinguishes same-language extras by appending a parenthesised description to the language token (Home Alone.English(Commentary).srt) rather
        // than by a flag. Split it so the language is still recognised and the description becomes the track title - only when the bare prefix really is a
        // language, so an ordinary bracketed token is still rejected below. Our own names can't reach here: sidecarBasename restricts lang to [a-z0-9-].
        let parenTitle = '';
        const parenMatch = !isRealLanguageToken(lang) && lang.match(/^([^()]+)\(([^()]+)\)$/);
        if (parenMatch && isRealLanguageToken(parenMatch[1])) { [, lang, parenTitle] = parenMatch; }
        if (!ours && !isRealLanguageToken(lang)) return null;                     // server-native has no s<index> anchor, so its language token must be real
        // Flags we park AHEAD of the language because media servers would choke on them there (EXTRA_DISPOSITIONS). Only our own s<index> names carry
        // them, and they sit between the encoded title and the language, so they are consumed here - before the residual-token count below decides what
        // is left is a title. A name that carries none of them simply skips this step.
        const extraTokens = [];
        const preRoles = [];
        while (ours && toks.length && (EXTRA_TOKENS.has(toks[toks.length - 1]) || DISP_TOKENS.has(toks[toks.length - 1]))) {
            const t = toks.pop();
            if (EXTRA_TOKENS.has(t)) extraTokens.unshift(t); else if (!DISP_IGNORE.has(t)) preRoles.unshift(DISP_ALIAS[t] || t);
        }
        // A real server-native sidecar names the FULL video basename then lang[.disp] - it never carries a title token. So for a
        // non-ours name any residual token is actually the tail of a LONGER sibling video's basename (Avatar.Extended.en.srt vs
        // Avatar.mkv): reject it, or the shorter video would mux the sibling's subtitle. Our s<index> names keep their title.
        if (!ours && toks.length) return null;
        if (toks.length > 1) return null;                                // 0 or 1 residual token = the encoded title (our own s<index> sidecars only)
        const title = toks.length ? pctDecode(toks[0]) : parenTitle;
        const allRoles = [...new Set(dispTokens.concat(preRoles))];
        return {
            name, bundle, index, lang, title, ext, dispTokens: allRoles, extraTokens,
            disp: [...new Set(allRoles.concat(extraTokens).map(dispFfOf).filter(Boolean))],
        };
    };

    // ============= UNMAPPED-NODE LIBRARY ACCESS (method_unmapped) =============
    // An unmapped node is handed a local MIRROR of the library, never the library itself, and Tdarr withholds the user's own path translators from it -
    // so the node can work out that the server calls this folder /media/Show and reach nothing at that path. Two ways out, both measured on a real
    // Windows node:
    //   mount     - the server's path may simply work (a container bind-mount), and otherwise a Node Tag names where THIS node sees it ("media=M:\").
    //               Tags are the only PER-NODE setting a classic plugin can read - fetched from /api/v2/get-nodes with the serverURL/apiKey/nodeID the
    //               node config already carries.
    //   text_file - no directory access at all; the user lists the filenames and each is fetched by name through the download API.
    const unmappedMode = String(inputs.method_unmapped || 'error').toLowerCase();
    const SUBTITLE_LIST_SUFFIX = '.subtitles.txt';
    // seedSubtitleList answers '' for success and free prose for a real failure - but two of its outcomes are NOT failures and the caller has to tell them
    // apart to decide whether to warn. Naming them makes that a comparison against a constant rather than against a sentence someone may reasonably reword,
    // which would turn a healthy state into a ☒ on every pass.
    const LIST_SEED_EXISTS = 'exists';                              // the library already holds a list; nothing to create, nothing to say
    const LIST_SEED_NOTHING = 'nothing was placed to list';         // the caller's own answer when no sidecar landed, so there is nothing to list yet
    // Spawn ceilings for the helpers below, named once. curl counts SECONDS and spawnSync MILLISECONDS, so each pair is derived from a single number rather
    // than written twice - the two spellings of one duration are exactly what drifts. Sized by what the call actually moves: the node registry is a small
    // JSON document, a library file transfer is not, and the two ffmpeg/ffprobe reads scale with the container. Each is a ceiling on a hang, not a target.
    const NODE_TAG_FETCH_S = 30;
    const LIBRARY_DOWNLOAD_S = 600;
    const SIDECAR_UPLOAD_S = 300;
    const PROBE_TIMEOUT_MS = 300000;
    const SUB_EXTRACT_TIMEOUT_MS = 600000;
    // And the matching ceiling on how much a spawn may write back. Exceeding maxBuffer KILLS the child and reports a failure that never happened, so this is
    // sized for the largest legitimate output any of these three calls produces - the node registry JSON, an ffprobe -show_streams document, and the caption
    // extraction's stderr - not for the smallest that usually suffices. Named once for the same reason the durations are: an unlabelled ceiling gives nobody
    // raising it a way to tell whether the number was chosen or copied.
    const SPAWN_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

    // ====== EMBEDDED CLOSED CAPTIONS ======
    // Captions are read out through the lavfi `movie` source with its subcc output, which decodes the video and surfaces the A53 caption channel as a
    // subtitle stream. It is the only route ffmpeg offers, and it is a DECODE - so it is reached only after the cheap bounded probe (the shared
    // closed-caption probe section) says the file has captions at all. Intent is recorded in the shared awk_cc tag (the closed-caption handoff section),
    // which is how a removal request survives the one thing this plugin cannot always do: taking the captions out of a bitstream it may not filter.

    // The movie= filename runs TWO parsers - the filtergraph, then the filter's own key=value splitter - and each character is special at a different
    // level. Measured on the production binary: ':' '=' are option-level (depth 2), '[' ']' ',' ';' filtergraph-level (1), '\' and '\'' special at BOTH
    // (3); everything else, spaces included, passes untouched. The backslash pass must run FIRST or it re-escapes what the later passes add. ESCAPES
    // rather than refuses, because a Windows path always contains ':' - refusing would disable the feature on every Windows node. Absolute paths only: a
    // RELATIVE path whose first component precedes a ':' is read by ffmpeg as a protocol name, which no escaping fixes.
    const escapeMoviePath = (p) => String(p)
        .replace(/[\\']/g, (c) => `\\\\\\${c}`)
        .replace(/[:=]/g, (c) => `\\\\${c}`)
        .replace(/[[\],;]/g, (c) => `\\${c}`);

    // The caption sidecar is named through sidecarBasename like any other, from a stand-in stream describing what the captions ARE: they belong to the video
    // stream (so its index anchors the name and can never collide with a real subtitle's), they carry no language of their own, and closed captions are the
    // SDH role in this plugin's vocabulary. Going through sidecarBasename is what keeps parseSidecar its exact inverse, so the import side needs no special
    // case - and the s<index> anchor is load-bearing: without it parseSidecar requires the language token to be a REAL language, and 'und' is not one.
    const CC_LANG = 'und';
    const ccPseudoStream = (videoIdx) => ({ index: videoIdx, codec_name: 'subrip', tags: { language: CC_LANG }, disposition: { hearing_impaired: 1 } });
    // The IN-PLUGIN caption extraction, as argv. Both unmapped routes run it - extract defers it into placeSidecars' batch, import runs it alone before
    // falling through to the mux - and a correction applied to one array only (making the map tolerant, say) would leave the two behaving differently on the
    // SAME file and the SAME node, in the one route no mapped test run ever exercises. The MAPPED route's preset forms stay written out at their call sites:
    // they name file.file because Tdarr runs that command against the working file, where this spawn needs the real path the node holds now.
    const ccLavfiArgs = () => ['-f', 'lavfi', '-i', `movie=${escapeMoviePath(String(file._id || file.file || ''))}[out0+subcc]`,
        '-map', '1:s:0', '-c:s', 'text', '-f', 'srt'];
    // The one wording for "the caption channel was read out to this sidecar", shared by the same two routes.
    const ccReadLine = (videoIdx, name) => `☑${streamTag(videoIdx)}[embedded_cc=enabled] Read the embedded closed captions -> ${name}\n`;

    // This node's Node Tags, as [key, value] pairs. One request, memoised, and only ever made when something actually needs it. Tdarr maintains entries in
    // the SAME field - a node restart rewrites it to e.g. "unmapped,media=M:\" - so the field is shared, not ours: split on commas and keep only the
    // "key=value" tokens, leaving Tdarr's own bare tags alone rather than assuming the field contains nothing but our setting.
    const nodeTagPairs = (() => {
        let cached = null;
        return () => {
            if (cached) return cached;
            cached = [];
            const url = serverApiUrl();
            if (!url) return cached;
            const { spawnSync } = require('child_process');
            const r = spawnSync('curl', ['-sS', '-m', String(NODE_TAG_FETCH_S), ...apiAuthArgs(), `${url}/api/v2/get-nodes`],
                { encoding: 'utf8', timeout: NODE_TAG_FETCH_S * 1000, maxBuffer: SPAWN_MAX_OUTPUT_BYTES, input: apiAuthInput() });
            if (r.error || r.status !== 0) return cached;
            try {
                const reg = JSON.parse(String(r.stdout || '')) || {};
                const me = reg[String(nodeConfig.nodeID || '')] || Object.values(reg).find((n) => n && n.nodeName === nodeConfig.nodeName);
                const raw = me && me.nodeTags;
                const tags = Array.isArray(raw) ? raw : String(raw || '').split(',');
                cached = tags.map((t) => String(t).trim()).filter(Boolean)
                    .map((t) => { const i = t.indexOf('='); return i === -1 ? null : [t.slice(0, i).trim(), t.slice(i + 1).trim()]; }).filter(Boolean);
            } catch (e) { /* a non-JSON reply just means no tags are available */ }
            return cached;
        };
    })();

    // The library directory as THIS node can actually open it, or '' with the reason it could not. Candidates are tried in order and each is PROBED - a
    // path is only accepted once a real readdir succeeds, never because its shape looked right. ENOENT and EACCES are reported apart because they send you
    // to different places: a wrong value versus a path that exists but this node has no credentials for (typically Tdarr running as a service).
    const resolveMountedLibDir = () => {
        const serverDir = serverSidePath(libDir);
        if (!serverDir) return { dir: '', why: `no path translator maps ${libDir} back to the server, so this node cannot name the library at all` };
        const candidates = [['the server\'s own path', serverDir]];
        for (const [k, v] of nodeTagPairs()) {
            const root = `/${String(k).replace(/^\/+/, '')}`;
            const norm = serverDir.replace(/\\/g, '/');
            if (!norm.startsWith(root)) continue;
            candidates.push([`Node Tag "${k}=${v}"`, path.normalize(String(v).replace(/[\\/]+$/, '') + norm.slice(root.length))]);
        }
        const tried = [];
        for (const [label, dir] of candidates) {
            try { fs.readdirSync(dir); return { dir, via: label }; } catch (e) {
                const code = (e && e.code) || '';
                tried.push(`${label} (${dir}) - ${code === 'ENOENT' ? 'not there'
                    : (code === 'EACCES' || code === 'EPERM' ? 'exists but unreadable from this node, check credentials' : code || e.message)}`);
            }
        }
        return { dir: '',
            why: `nothing reachable. Tried: ${tried.join('; ')}${nodeTagPairs().length ? '' : '. No "key=value" Node Tag is set for this node'}` };
    };
    const mountedLib = (() => {
        let c = null;
        return () => { if (!c) c = (isUnmappedNode && unmappedMode === 'mount') ? resolveMountedLibDir() : { dir: '' }; return c; };
    })();

    // Every path below goes through these two rather than libDir/isUnmappedNode directly: with a resolved mount the node behaves exactly like a mapped one,
    // reading and writing the real library, and the API routes are only for a node that genuinely cannot reach it.
    const workLibDir = () => mountedLib().dir || libDir;
    const placeViaApi = () => isUnmappedNode && !mountedLib().dir;

    // Fetch one library file to a local path, through the only read an unmapped node has. It addresses a single KNOWN path, which is exactly why
    // the list has to live at a name we can compute rather than one we would have to go looking for. Written straight to disk by curl, never
    // buffered back through spawnSync, so a large sidecar cannot silently exceed maxBuffer and report a failure that never happened. curl's EXIT
    // STATUS is part of the success test, not just the HTTP code: a transfer that dies after the response headers - the -m timeout, a dropped
    // connection - still reports %{http_code} 200 and leaves a non-empty file, so testing the code alone would call a truncated download complete.
    const downloadLibraryFile = (dest, local) => {
        const url = serverApiUrl();
        if (!url) return 'the node config carries no server URL';
        const { spawnSync } = require('child_process');
        try { fs.mkdirSync(path.dirname(local), { recursive: true }); } catch (e) { /* already there */ }
        const r = spawnSync('curl', ['-sS', '-m', String(LIBRARY_DOWNLOAD_S), '-o', local, '-w', '%{http_code}', ...apiAuthArgs(),
            '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify({ filePath: dest }), `${url}/api/v2/file/download`],
            { encoding: 'utf8', timeout: LIBRARY_DOWNLOAD_S * 1000, input: apiAuthInput() });
        const code = String(r.stdout || '').trim();
        let size = 0; try { size = fs.statSync(local).size; } catch (e) { size = 0; }
        if (!r.error && r.status === 0 && code === '200' && size > 0) return '';
        try { fs.unlinkSync(local); } catch (e) { /* nothing landed */ }
        if (r.error) return `download failed (${r.error.code || r.error.message})`;
        return r.status === 0 ? `HTTP ${code || 'no response'}` : `the transfer did not complete (curl exit ${r.status === null ? 'signalled' : r.status})`;
    };

    // Pull every listed sidecar into this node's mirror at the same relative path - everything downstream (dedup hash, -i inputs, marker) then works on
    // ordinary local files. A name missing because an earlier pass imported and cleaned it up is the list going stale in the ordinary way (the list is
    // seeded once, never rewritten); the marker is what tells that apart from a failure - without it a completed round trip reports one warning per
    // subtitle it successfully handled. The NAME is checked BEFORE anything is fetched: readSubtitleList only proves an entry stays inside the video's
    // folder, and the destination is in the mirror that also holds the video being transcoded - a line naming the video itself would have curl truncate
    // it, or delete it on an HTTP error, before any downstream test ran. An entry has to parse as a sidecar to be usable at all, so testing here costs
    // nothing and is the only place the test is in time.
    const fetchListedSidecars = (rels, listName, embeddedAlready) => {
        const got = [];
        for (const rel of rels) {
            if (!parseSidecarRel(rel)) {
                response.infoLog += `☒[method_unmapped=text_file] ${listName} lists ${rel}, which is not a recognised sidecar name - skipping\n`;
                continue;
            }
            const dest = serverSidePath(path.join(libDir, rel));
            if (!dest) { response.infoLog += `☒[method_unmapped=text_file] Cannot work out the server path for ${rel}\n`; continue; }
            const why = downloadLibraryFile(dest, path.join(libDir, rel));
            if (!why) { got.push(rel); continue; }
            if (embeddedAlready && embeddedAlready.has(rel)) {
                response.infoLog += `☑[method_unmapped=text_file] ${listName} still lists ${rel}, which an earlier pass already embedded and removed\n`;
                continue;
            }
            response.infoLog += `☒[method_unmapped=text_file] ${listName} lists ${rel} but it could not be fetched - ${why}\n`;
        }
        return got;
    };

    // Extract seeds the list once and then never touches it again - it is the user's file from that moment, and rewriting it every pass would quietly
    // discard the OCR'd subtitles they added, which is the one failure that would make the feature untrustworthy. The header explains itself, so opening
    // the file is enough to understand it.
    const seedSubtitleList = (rels) => {
        const listName = `${videoBase}${SUBTITLE_LIST_SUFFIX}`;
        const dest = serverSidePath(path.join(libDir, listName));
        if (!dest) return `no path translator maps ${libDir} back to the server`;
        if (sidecarExistsRemote(dest)) return LIST_SEED_EXISTS;
        const body = [
            `# Subtitles to import for ${path.basename(libFilePath)} - one filename per line.`,
            '# Lines starting with # are ignored. This file was created once, automatically; it is yours to edit now.',
            '# Add any subtitle you have made yourself here - for example one you OCR\'d from an exported image subtitle -',
            '# naming it the same way as the lines below, since the language, title and flags are read from the filename.',
            ...rels,
            '',
        ].join('\n');
        // Staged in a private mkdtemp directory for the same reason placeSidecars is: a pid-derived name in the world-writable temp dir can be pre-created
        // as a symlink by another local user, and writeFileSync follows it. The inner name is fixed, so nothing user-supplied reaches curl's -F syntax.
        let stageDir = '';
        try { stageDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'awk_sublist_')); }
        catch (e) { return `could not stage the list (${e && e.message ? e.message : e})`; }
        const tmp = path.join(stageDir, 'list.txt');
        try { fs.writeFileSync(tmp, body); } catch (e) { return `could not stage the list (${e && e.message ? e.message : e})`; }
        // Same endpoint and the same load-bearing field order as a sidecar placement, so it goes through the same helper - a shorter timeout because a
        // list is a few hundred bytes where a sidecar is bounded by the container.
        const up = uploadLibraryFile(dest, tmp, SIDECAR_UPLOAD_S);
        try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return up.ok ? '' : up.why;
    };

    // One line per filename, # for comments. Deliberately the simplest format that can be hand-edited without getting quoting wrong, because maintaining it
    // IS the point - it is how a subtitle OCR'd from an exported image sub announces itself. Every entry is confined to the library folder: '..', an
    // absolute path and a UNC path are all rejected outright, and the joined result is then resolved and re-checked to stay under the directory, so
    // anything that slips the syntactic tests fails on the outcome instead.
    const readSubtitleList = (text) => {
        const ok = []; const bad = [];
        for (const line of String(text || '').split(/\r?\n/)) {
            const entry = line.trim();
            if (!entry || entry.startsWith('#')) continue;
            const norm = entry.replace(/\\/g, '/');
            if (/^([a-zA-Z]:|\/|\\)/.test(entry) || norm.startsWith('//')) {
                bad.push([entry, 'absolute paths are not allowed, name a file inside the video\'s own folder']); continue;
            }
            if (norm.split('/').includes('..')) { bad.push([entry, '".." is not allowed, a listed file must sit inside the video\'s own folder']); continue; }
            const full = path.resolve(workLibDir(), norm);
            if (full !== path.resolve(workLibDir()) && !full.startsWith(path.resolve(workLibDir()) + path.sep)) {
                bad.push([entry, 'resolves outside the video\'s folder']); continue;
            }
            ok.push(norm);
        }
        return { ok, bad };
    };

    // Where a sidecar can legitimately live. Plex is the only one of the three servers that reads a SUBFOLDER: it accepts `subs` or `subtitles` beside the
    // video (the season directory for a show), with the files inside named exactly as they would be beside the video. Jellyfin reads only the video's own
    // directory - subfolder support is an open feature request there, not behaviour - and Emby documents no subfolder either. So IMPORT reads all of them,
    // because pulling a Plex-only layout into the container is what makes those subtitles work on every server, while EXTRACT only ever writes beside the
    // video, the one location all three read. Matched case-insensitively: the docs say lowercase, users type Subs.
    const SIDECAR_SUBDIRS = ['subs', 'subtitles'];
    // Every entry under the video's directory and those subfolders, as a path RELATIVE to the video's directory ('name' or 'subs/name'). Sorted at both
    // levels because readdir order is filesystem-dependent (ext4 hash order vs APFS): the callers that do NOT re-sort - the unparseable-name warnings and the
    // post-processing deletion pass - then report and delete in the same order on every node. Import re-sorts into original stream order (byOriginalPosition).
    // A relative path is also what the marker stores, so a sidecar in a subfolder is distinguishable from a same-named one beside the video.
    const scanSidecarDirs = () => {
        let top;
        try { top = fs.readdirSync(workLibDir(), { withFileTypes: true }); } catch (e) { return { err: e }; }
        const rels = top.filter((d) => !d.isDirectory()).map((d) => d.name).sort();
        const subs = top.filter((d) => d.isDirectory() && SIDECAR_SUBDIRS.includes(d.name.toLowerCase())).map((d) => d.name).sort();
        for (const s of subs) {
            let inner = [];
            // unreadable subfolder: the sidecars beside the video still import
            try { inner = fs.readdirSync(path.join(workLibDir(), s)); } catch (e) { continue; }
            for (const n of inner.sort()) rels.push(`${s}/${n}`);
        }
        return { rels };
    };
    // Parse each scanned path as a sidecar, carrying its relative path along as the identity everything downstream keys on.
    const parseSidecarRel = (rel) => { const p = parseSidecar(path.posix.basename(rel.replace(/\\/g, '/'))); return p ? { ...p, rel } : null; };
    // Import order = the ORIGINAL stream order. Our own names carry the source stream index in their s<index> anchor, and that is the whole point of it:
    // a round trip should hand the tracks back in the order it found them, not in the order their names happen to sort (a plain lexical sort puts s11
    // ahead of s2). A server-native sidecar has no anchor, so it has no original position to restore and goes after the ones that do. The relative path
    // breaks ties, so the import order is identical on every node whatever order a filesystem listed the entries in.
    const byOriginalPosition = (a, b) => (a.index === null ? Infinity : a.index) - (b.index === null ? Infinity : b.index)
        || (a.rel < b.rel ? -1 : (a.rel > b.rel ? 1 : 0));

    // The sha1 of a sidecar's bytes - the identity both the import grouping and the post-processing deletion decide on. '' means "could not be read", which
    // every caller must treat as proving nothing: such a sidecar is grouped on its own and is never confirmed for deletion. The size is checked FIRST,
    // because a name that merely parses as a sidecar says nothing about what is behind it - a runaway OCR dump or a mis-renamed file left as
    // <video>.eng.srt would otherwise be pulled into the worker whole for a hash that is not even needed. Real text subtitles are kilobytes and a heavily
    // typeset ASS a few MB, so 64 MiB is orders of magnitude of headroom and never refuses a genuine one. (Node itself already refuses past 2 GiB.)
    const SIDECAR_HASH_MAX = 64 * 1024 * 1024;
    const sidecarSha1 = (rel) => {
        const p = path.join(workLibDir(), rel);
        try {
            if (fs.statSync(p).size > SIDECAR_HASH_MAX) return '';
            return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
        } catch (e) { return ''; }
    };

    // The streams and global tags of the file as it stands NOW. Pre-processing is always handed ffProbeData; the post-processing stage may not be, so fall
    // back to running ffprobe here - otherArguments supplies ffmpegPath and ffprobe sits beside it under the matching name. null means neither route
    // worked, which the caller must read as "cannot confirm what is embedded" and therefore delete nothing.
    const probeCurrentFile = () => {
        const ff = file.ffProbeData;
        if (ff && Array.isArray(ff.streams)) return { streams: ff.streams, tags: ff.format?.tags || {} };
        const target = String(file._id || file.file || libFilePath || '');
        if (!target) return null;
        const ffmpegPath = String(otherArguments?.ffmpegPath || 'ffmpeg');
        const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'ffprobe.exe' : 'ffprobe'));
        const { spawnSync } = require('child_process');
        const r = spawnSync(ffprobePath, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', target],
            { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, maxBuffer: SPAWN_MAX_OUTPUT_BYTES });
        if (r.error || r.status !== 0) return null;
        try {
            const j = JSON.parse(r.stdout); return Array.isArray(j.streams) ? { streams: j.streams, tags: j.format?.tags || {} } : null;
        } catch (e) { return null; }
    };

    // Does decoded subtitle text contain any actual CUES? Only srt writes a genuinely 0-byte file when it has nothing to say - webvtt still writes its WEBVTT
    // header and ass its whole [Script Info]/[V4+ Styles] preamble - so a size test alone would call an empty ass track populated. Both timed formats mark
    // every cue with the '-->' arrow, and ass marks every line of dialogue with a Dialogue: key, so one token per format settles it.
    const hasNoCues = (text, ext) => {
        if (!String(text).trim()) return true;
        return ext === 'ass' ? !/^\s*Dialogue\s*:/mi.test(text) : !/-->/.test(text);
    };

    // Source indices whose text decoded to no cues at all, filled in by embeddedTextHashes on the one pass it already makes. Read through
    // embeddedEmptyTextStreams so a caller cannot see a stale empty set from before the probe ran.
    const embeddedEmptyIdx = new Set();

    // The CONTENT of every embedded text subtitle, as a sha1 keyed by source stream index - the only sound answer to "is this sidecar already in the
    // file": metadata cannot answer it in either direction (retitling changes every visible field while the text stays identical; two tracks can share
    // language+title with different text). One ffmpeg run extracts them all in a SINGLE pass through the same codec->format map the sidecars were written
    // with, so the bytes are directly comparable (measured identical across a -c copy remux for srt and ass). Costs one sequential read (0.3s on an 885MB
    // mkv), so callers only reach it with deduplicate enabled and a real candidate. An empty map means "asked, found nothing"; null means the probe could
    // not run, which every caller must read as "cannot prove anything" and import - a redundant track is recoverable, a dropped one is not.
    let embeddedHashCache;
    const embeddedTextHashes = (subs) => {
        if (embeddedHashCache !== undefined) return embeddedHashCache;
        embeddedHashCache = null;
        const target = String(file._id || file.file || libFilePath || '');
        const wanted = subs.filter((s) => isTextSub(s.codec_name));
        // The two are NOT the same answer, and every caller acts on the difference (see the contract above): with no path there is nothing to read, so the
        // probe could not run; a readable file that simply holds no text subtitle stream IS a run, and its empty map is positive evidence that no text
        // sidecar is embedded here.
        if (!target) return embeddedHashCache;   // null - the probe could not run
        if (!wanted.length) { embeddedHashCache = new Map(); return embeddedHashCache; }
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'awk_subcmp_')); } catch (e) { return embeddedHashCache; }
        // Files rather than stdout: one run writing N outputs is one pass over the container, where N stdout captures would be N passes - and a large ASS
        // would sit against spawnSync's maxBuffer, reporting a failure that never happened.
        const args = ['-y', '-loglevel', 'error', '-i', target];
        const outs = new Map();
        for (const s of wanted) {
            const enc = TEXT_SUB[String(s.codec_name).toLowerCase()];
            const out = path.join(dir, `s${s.index}.${enc.ext}`);
            args.push('-map', `0:${s.index}`, '-c:s', enc.enc, out);
            outs.set(s.index, out);
        }
        const { spawnSync } = require('child_process');
        const r = spawnSync(String(otherArguments?.ffmpegPath || 'ffmpeg'), args,
            { encoding: 'utf8', timeout: SUB_EXTRACT_TIMEOUT_MS, maxBuffer: SPAWN_MAX_OUTPUT_BYTES });
        if (!r.error && r.status === 0) {
            const map = new Map();
            for (const [idx, out] of outs) {
                try {
                    const buf = fs.readFileSync(out);
                    // A track that decoded to no cues is EMPTY, not a duplicate. It gets no hash deliberately: every empty track would otherwise hash
                    // alike and be reported as a copy of the others, which describes the wrong problem and leaves one empty track standing.
                    if (hasNoCues(buf.toString('utf8'), path.extname(out).replace('.', ''))) { embeddedEmptyIdx.add(idx); continue; }
                    map.set(idx, crypto.createHash('sha1').update(buf).digest('hex'));
                } catch (e) {
                    /* a stream that could not be read simply has no hash, and matches nothing */
                }
            }
            embeddedHashCache = map;
        }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return embeddedHashCache;
    };

    // deduplicate=enabled_checkmedia: the same duplicate test turned on the file's OWN tracks. Two subtitle streams holding identical text are one
    // subtitle stored twice, however their tags read, and this is the only place in the plugin that removes a subtitle the user did not ask to extract -
    // which is exactly why it is its own opt-in value rather than part of `enabled`. The survivor is chosen by the rule the sidecar groups already use, so
    // there is nothing new to learn: lowest source index wins, and it inherits the union of the group's flags plus the first title and first real language
    // any member carries. Nothing is lost by dropping the others - identical text, and every tag folded onto the keeper. Returns the source indices to drop
    // and, only when the union actually differs from what the keeper already has, the metadata to restamp it with.
    const dedupeEmbeddedSubs = (subs) => {
        const hashes = embeddedTextHashes(subs);
        const out = { dropIdx: [], retag: null, log: '' };
        if (!hashes) return out;   // the probe could not run, so nothing is proven and nothing is removed
        // An EMPTY track goes first, and on the same evidence: the read that hashes the others also shows which ones decoded to nothing. A player still
        // lists such a track and shows the viewer nothing, so it is worth keeping only in the sense that a blank page is. Nothing is lost by removing it -
        // there is no content to keep and, unlike a duplicate, no survivor to fold the tags onto. "Could not read the track" is NOT empty (see the catch
        // in embeddedTextHashes): an unreadable stream never enters this set, so a failed probe leaves every subtitle alone.
        for (const s of subs) {
            if (!embeddedEmptyIdx.has(s.index)) continue;
            out.dropIdx.push(s.index);
            out.log += `☐${streamTag(s.index)}[deduplicate=enabled_checkmedia] Removing this subtitle stream - it carries no subtitle text at all\n`;
        }
        if (hashes.size < 2) return out;
        const byHash = new Map();
        for (const s of subs) { const h = hashes.get(s.index); if (!h) continue; if (!byHash.has(h)) byHash.set(h, []); byHash.get(h).push(s); }
        for (const g of byHash.values()) {
            if (g.length < 2) continue;
            const ordered = g.slice().sort((a, b) => a.index - b.index);
            const keep = ordered[0]; const drop = ordered.slice(1);
            out.dropIdx.push(...drop.map((s) => s.index));
            out.log += `☐${streamTag(keep.index)}[deduplicate=enabled_checkmedia] Removing ${drop.length} duplicate subtitle stream${
                drop.length === 1 ? '' : 's'} (${drop.map((s) => `s${s.index}`).join(', ')}) - byte-identical to this one\n`;
            // `default` is the one flag NOT unioned: it says which track a player should pick, not what the subtitle IS, so this plugin never tracks it
            // (see DISPOSITIONS). Folding it would let a duplicate hand the survivor a default flag it never had, silently changing what plays - so the
            // keeper simply keeps its own, and the disposition write below, which replaces the whole set, neither invents nor strips it.
            const disp = new Set(ordered.flatMap(activeDispositions));
            disp.delete('default');
            if (keep.disposition?.default === 1) disp.add('default');
            const title = ordered.map((s) => s.tags?.title || '').find(Boolean) || '';
            const lang = ordered.map((s) => resolveLang(s) || '').find((l) => l && l !== 'und') || (resolveLang(keep) || 'und');
            const keepDisp = new Set(activeDispositions(keep));
            const sameDisp = sameDispositions(keepDisp, disp);
            if (sameDisp && (keep.tags?.title || '') === title && langKey(resolveLang(keep) || 'und') === langKey(lang)) continue;
            out.retag = (out.retag || []).concat([{ index: keep.index, lang, title, disp: [...disp] }]);
            out.log += `☐${streamTag(keep.index)}[deduplicate=enabled_checkmedia] Folding the removed streams' tags onto it (${
                [lang, title, ...disp].filter(Boolean).join(' ')})\n`;
        }
        return out;
    };

    // Does a marker-listed sidecar RESEMBLE something in the file? The marker records what the last import muxed and NOTHING ever clears it (an extract
    // pass strips the subtitles and leaves the tag still naming them, and the value is ordinary container metadata any file can carry), so both readers
    // confirm it against the streams as they stand rather than trusting it. This is the METADATA half: match on language + title, the identity our import
    // writes - except on an mp4/mov target, which DROPS per-stream subtitle titles on the mux, so there language alone decides (else a titled sidecar we
    // DID embed never matches its now-title-less stream). A bundle additionally has to see a font attachment - carrying fonts is its reason to exist.
    // Metadata can only say "something like this is here", never "this one is here" (an edited sidecar keeps its name and matches just as well), so it
    // decides alone only for a bundle (an archive is not comparable text) or when the text cannot be read; otherwise the sidecar's own bytes must be one
    // of the tracks. Only a TEXT subtitle can stand in for a loose sidecar - a PGS/VobSub track holds pictures, however well its metadata matches.
    const markerConfirmsEmbedded = (f, subs, anyFont, mp4Target) => (!f.bundle || anyFont)
        && subs.filter((s) => f.bundle || isTextSub(s.codec_name)).some((s) =>
            langKey(resolveLang(s) || 'und') === langKey(f.lang || 'und') && (mp4Target || (s.tags?.title || '') === (f.title || '')));

    // The subtitle list is a file the USER may have typed into, so it is removed only once it demonstrably has nothing left to say: every name in it gone
    // from disk AND at least one of them a sidecar we actually embedded. Both halves matter - the first makes a hand-added or mistyped line protective
    // (it names a file still there, so the list stays and the user can fix it), the second proves the list did its job. Deliberately NOT conditioned on
    // method_unmapped: a list written by a text_file run and imported through mount is exactly as spent. Nothing is lost either way - a text_file extract
    // seeds a fresh one when it next needs it.
    const deleteSpentSubtitleList = (delReason, marked) => {
        const listName = `${videoBase}${SUBTITLE_LIST_SUFFIX}`;
        const listPath = path.join(workLibDir(), listName);
        let text;
        try { text = fs.readFileSync(listPath, 'utf8'); } catch (e) { return ''; }   // no list at all is the normal case, and says nothing
        const entries = readSubtitleList(text).ok;
        if (!entries.length || !entries.some((n) => marked.has(n))) return '';
        if (entries.some((n) => fs.existsSync(path.join(workLibDir(), n)))) return '';
        try { fs.unlinkSync(listPath); return `☑[${delReason}] Deleted ${listName} - every sidecar it listed is now in the file\n`; }
        catch (e) { return `☒[${delReason}] Could not delete ${listName}: ${e && e.message ? e.message : e}\n`; }
    };

    // remove_source's actual deletion. Called ONLY from the post-processing pass, once Tdarr has accepted the transcode and moved it into the
    // library, so the embedded copy is the one that survives. This unlink is the one irreversible thing the plugin does, so each marker-listed sidecar has to
    // be proved against the accepted file's own text before it goes; the marker VALUE still scopes deletion to names we listed, so no file outside this
    // video's sidecars is ever a candidate. A false negative merely keeps the sidecar (a later pass, or the user, removes it) and never loses subtitle
    // content, so this fails safe.
    const deleteImportedSidecars = (streamList, globalTags, mp4Target) => {
        const delReason = 'remove_source=true';   // this pass only runs when removal is on
        const marked = new Set(decodeMarkerList(getTagCI(globalTags || {}, 'awk_sub_worker')));
        if (!marked.size) return { deleted: 0, log: '' };
        const scan = scanSidecarDirs();
        if (scan.err) {
            return { deleted: 0, log: `☒[${delReason}] Cannot read the library directory to remove imported sidecars: ${scan.err.message || scan.err}\n` };
        }
        const embedded = streamList.filter((s) => codecTypeOf(s) === 'subtitle');
        const anyFont = streamList.some((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s));
        // Language + title is a proxy for "this is in the file"; the TEXT is the fact itself, and only the fact may authorise an unlink. So the content test
        // is the PRIMARY one for every ordinary sidecar, and the metadata match is only the fallback for what content cannot cover: a bundle (an .mks is an
        // archive, and its fonts are what the metadata path checks for) and a probe that could not run at all. That is also what lets a copy the user named
        // themselves be cleaned up: its title matches no track by construction, yet its content is provably one of them. The hashes cost one pass over the
        // accepted library file on every successful round trip - the price of never unlinking a sidecar on a resemblance. `confirmed` returns the REASON it
        // may go, so the deletion line reports what was actually proved.
        let hashes;
        const contentConfirms = (f) => {
            if (f.bundle) return false;
            if (hashes === undefined) hashes = embeddedTextHashes(embedded);
            if (!hashes || !hashes.size) return false;
            const h = sidecarSha1(f.rel);
            return !!h && [...hashes.values()].includes(h);
        };
        const confirmed = (f) => {
            if (!f.bundle && contentConfirms(f)) return 'its text is in the file';
            // An EMPTY map is not a failed probe - it is the probe saying the accepted file holds no text for this sidecar to be, which is the strongest
            // possible answer against deleting it. Only a null map (nothing could be read at all) hands the decision back to the metadata resemblance.
            const metaOnly = f.bundle || !hashes;   // an archive, or a probe that could not run - the two cases the text cannot settle
            return (metaOnly && markerConfirmsEmbedded(f, embedded, anyFont, mp4Target)) ? 'the file carries a matching subtitle' : '';
        };
        let deleted = 0; let log = '';
        for (const f of scan.rels.map(parseSidecarRel).filter(Boolean).filter((x) => marked.has(x.rel))) {
            const why = confirmed(f);
            if (!why) { log += `☒[${delReason}] Marker lists ${f.rel} but nothing in the file is confirmed to be it - not deleting (unverified)\n`; continue; }
            try { fs.unlinkSync(path.join(workLibDir(), f.rel)); deleted += 1; log += `☑[${delReason}] Deleted sidecar (${why}): ${f.rel}\n`; }
            catch (e) { log += `☒[${delReason}] Could not delete sidecar ${f.rel}: ${e && e.message ? e.message : e}\n`; }
        }
        log += deleteSpentSubtitleList(delReason, marked);
        return { deleted, log };
    };


    // Synthetic stream so a not-yet-muxed sidecar renders through summariseStream in the expected-results line.
    const sidecarToStream = (f) => {
        // A bundle always carries a styled subtitle. Every other sidecar maps back through EXT_TO_CODEC behind the same TEXT_EXTS gate parseSidecar applies,
        // so an ext outside the table cannot reach here - the webvtt fallback only guards a future caller that reads a sidecar without going through it.
        const codec = f.bundle ? 'ass' : (TEXT_EXTS.includes(f.ext) ? EXT_TO_CODEC[f.ext] : 'webvtt');
        const disposition = {};
        for (const d of DISPOSITIONS.concat(EXTRA_DISPOSITIONS)) if ((f.dispTokens.concat(f.extraTokens || [])).includes(d.token)) disposition[d.ff] = 1;
        return { codec_type: 'subtitle', codec_name: codec, index: -1, tags: { language: f.lang, title: f.title }, disposition };
    };

    // ============= guards + input validation (before the try, per the suite's failFile convention) =============
    // WHICH STAGE this is. The plugin declares no Stage, so Tdarr runs it in both stacks; post-processing is handed exactly {homePath, handbrakePath,
    // ffmpegPath, mkvpropeditPath, originalLibraryFile}, and homePath is the discriminator because it is POSITIVE evidence - it appears nowhere else.
    // Testing for the ABSENCE of configVars/job would misread any caller that simply passes less (the flow shim passes no configVars at all, and would
    // take the delete-only path on a normal transcode); the two negatives stay as corroboration, so a release that adds homePath to pre-processing cannot
    // silently flip the branch. This stage can legitimately arrive without ffProbeData, so the probe guard below belongs to pre-processing alone.
    const isPostProcessing = !!otherArguments?.homePath && !otherArguments?.configVars && !otherArguments?.job;
    if (!isPostProcessing && (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))) {
        failFile('No ffProbe stream data available, cannot process this file');
    }
    const action = String(inputs.action);
    if (action !== 'extract' && action !== 'import') failFile(`[action=${action}] invalid value, check your settings`);
    // Deleting the sidecar FILES is remove_source's decision alone in every mode - this setting only ever decides what counts as a duplicate. An
    // unrecognised value FAILS the file rather than falling through to a default, since the three modes do materially different amounts of work and a typo
    // must not quietly pick one. The failFile message shows the RAW inputs value.
    const dedupeMode = String(inputs.deduplicate || 'enabled_only_sidecar').toLowerCase().trim();
    if (!['disabled', 'enabled_only_sidecar', 'enabled_checkmedia'].includes(dedupeMode))
        failFile(`[deduplicate=${inputs.deduplicate}] invalid value, check your settings`);
    const dedupeSidecars = dedupeMode !== 'disabled';          // both enabled values collapse byte-identical sidecars and skip one already embedded
    const dedupeStreams = dedupeMode === 'enabled_checkmedia'; // only this one reads the file's own tracks, to find a duplicate or an empty one
    const ccMode = String(inputs.embedded_cc || 'disabled').toLowerCase().trim();
    if (!['disabled', 'enabled'].includes(ccMode)) failFile(`[embedded_cc=${inputs.embedded_cc}] invalid value, check your settings`);
    if (!['error', 'mount', 'text_file'].includes(unmappedMode)) failFile(`[method_unmapped=${inputs.method_unmapped}] invalid value, check your settings`);
    const metadataMode = String(inputs.method_import_metadata || 'embedded').toLowerCase();
    if (!['embedded', 'sidecar'].includes(metadataMode)) {
        failFile(`[method_import_metadata=${inputs.method_import_metadata}] invalid value, check your settings`);
    }
    if (file.fileMedium && file.fileMedium !== 'video') return skip('☑Not a video file - skipping\n');
    // A language token that is not a language FAILS the file. only_languages scopes which subtitles are touched at all, so a typo ('eng,fer') silently matches
    // nothing and every subtitle in that language is quietly left out of the extract - the user gets a clean run that did none of the work they asked for, with
    // no way to tell it apart from a file that genuinely had no such subtitle. Stopping is the far cheaper failure. The und/mul/zxx/mis/qaa-qtz allowance is
    // load-bearing, NOT laxness: the filter is compared against langKey(resolveLang(s) || 'und'), so scoping on 'und' is how untagged subtitles are selected.
    // #region SHARED helpers (1 section: language token recognition)
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: language token recognition =====
    // -=-=-= knownLangToken  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // Is an already-folded langKey a recognised language token: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to one base code), or
    // a valid special/private code - und (undetermined), mul (multiple), zxx (no linguistic content), mis (uncoded) and the qaa-qtz private-use range. Those
    // specials are load-bearing rather than laxness: stream language tags carry them, so a list has to be able to name them. Why an unrecognised token STOPS
    // the file is per-plugin and stays above this section, since it depends on what that plugin's input scopes; the message itself is failLangToken.
    const knownLangToken = (key) => key === 'und' || key === 'mul' || key === 'zxx' || key === 'mis' || /^q[a-t][a-z]$/.test(key) || !!langDisplayName(key);
    // ===== END SHARED: language token recognition =====
    // #endregion
    const onlyLangRaw = splitList(inputs.only_languages);
    for (const tok of onlyLangRaw) if (!knownLangToken(langKey(tok))) failLangToken('only_languages', tok);

    const streams = (file.ffProbeData && file.ffProbeData.streams) || [];   // [] only in post-processing, which reads the file through probeCurrentFile instead
    // Built from the array validated just above, so the token set that PASSED is provably the one the filter executes - two independent parses of one input
    // would let a hardening of either drift out of the other. Folded through langKey (so en/eng/English match); null, never an empty Set, means "no filter",
    // which is what both consumers test for.
    const langFilter = onlyLangRaw.length ? new Set(onlyLangRaw.map(langKey)) : null;
    // One setting, both directions: remove the source copy once its content is confirmed at the destination - the embedded track after an extract, the
    // sidecar file after an import. Each direction keeps its own verification; this only ever answers whether removal was asked for.
    const removeSource = String(inputs.remove_source) === 'true';
    const dstContainer = String(file.container || '').toLowerCase().trim();
    const isMp4 = isMp4Family(dstContainer);
    // Everything this plugin remembers between passes is a GLOBAL container tag - awk_sub_worker (which sidecars are already in the file) and awk_cc (what was
    // done about the bitstream captions) - so on a marker-hostile container the plugin has no memory at all and every pass starts from scratch. What that
    // costs depends on the operation, so each site decides for itself rather than the whole plugin declining: an extract memoises through the SIDECAR ON DISK
    // and needs no tag, while an import has nothing else to tell an already-embedded sidecar from a new one.
    const canRecord = markerPersists(dstContainer);
    // The one rule for writing a language into the output container: mp4 stores only lowercase 3-letter ISO 639-2/T, while mkv keeps the sidecar spelling.
    // mov is the exception. The QuickTime muxer does not store the letters: mov_write_mdhd_tag looks the code up in ffmpeg's legacy Macintosh language table
    // and writes 0x7fff ("unspecified") on a miss, which the demuxer then excludes - so the track reads back with NO language at all, exit 0 and no warning
    // from either side. That table predates ISO 639-2/T and spells 15 of the 20 dual-spelling languages the /B way, so to6392T's /T output is precisely the
    // spelling mov throws away (measured on jellyfin-ffmpeg 7.1.4: nld/deu/zho land 0x7fff, dut/ger/chi land a real code; 106 of the 184 codes to6392T can
    // emit are dropped). ces/ron/slk/fra are deliberately ABSENT - QuickTime spells those four the /T way and remapping them would break what works - and mri
    // is absent because the table has no Maori under any code. Anyone extending this must re-measure against the muxer: the table is a MIXTURE of /T and /B,
    // so the ISO 639-2/B list is not a safe source. mp4/m4v/m4a pack the letters directly and keep either spelling, which is why this is mov-only.
    const MOV_LANG = { sqi: 'alb', hye: 'arm', eus: 'baq', bod: 'tib', mya: 'bur', zho: 'chi', nld: 'dut', kat: 'geo',
        deu: 'ger', ell: 'gre', isl: 'ice', mkd: 'mac', msa: 'may', fas: 'per', cym: 'wel' };
    const langMetaValue = (l) => { const v = isMp4 ? to6392T(l) : normSidecarLang(l); return escMeta(dstContainer === 'mov' ? (MOV_LANG[v] || v) : v); };
    // Everything this plugin writes onto a subtitle stream, for ONE stream. Two callers reach it - the duplicate fold below and the sidecar-metadata retune -
    // and they must agree on both load-bearing rules: outIdx is the position among the SURVIVING subtitle streams, which is what -map 0 minus the drops
    // leaves; and an empty disposition set is written as the explicit 0 sentinel rather than omitted, or a flag the fold dropped would silently come back.
    const retagOne = (outIdx, lang, title, disp) => ` -metadata:s:s:${outIdx} "language=${langMetaValue(lang)}"`
        + ` -metadata:s:s:${outIdx} "title=${escMeta(title || '')}"`
        + ` -disposition:s:${outIdx} ${disp.length ? disp.join('+') : '0'}`;
    // Flush a folded tag set into output-side args. Each branch passes its own survivor list, since extract subtracts its extract removals as well as the
    // dedupe drops.
    const retagArgs = (retag, survivingSubs) => {
        let args = '';
        for (const r of retag || []) {
            const outIdx = survivingSubs.findIndex((x) => x.index === r.index);
            if (outIdx < 0) continue;
            args += retagOne(outIdx, r.lang, r.title, r.disp);
        }
        return args;
    };

    // ============= POST-PROCESSING: remove sidecars now that the import is ACCEPTED =============
    // The only hook that runs after Tdarr's accept gate, and so the only place remove_source may act. Deleting during pre-processing would
    // destroy the sidecars of a transcode the user then REJECTS: the muxed copy goes with the work directory and the library file never had
    // those subtitles, so they would exist nowhere. This stage also runs SERVER-side, which is what lets it clean up on behalf of an
    // UNMAPPED node - the file API offers upload and download but nothing that removes a path, while the server simply has the library on
    // disk. Nothing here may throw: the post-processing runner swallows exceptions, so a throw would be invisible. Nothing here needs to
    // either - a delete that fails leaves a sidecar the marker already excludes from re-import, and the next pass over this file retries it.
    if (isPostProcessing) {
        // Only the import workflow ends in a deletion. In extract mode this pass must do nothing at all: extract WRITES the sidecars, and with
        // remove_source off the embedded subtitles stay too - so a stale marker from an earlier import would confirm against those still-embedded
        // streams and delete the sidecar that was just written.
        if (action !== 'import') return skip(`☑[action=${action}] Nothing for post-processing to do outside import\n`);
        if (!removeSource) return skip('☑[remove_source=false] Imported sidecars left on disk\n');
        const probed = probeCurrentFile();
        if (!probed) return skip('☒[remove_source=true] Cannot read the accepted file to confirm what is embedded - every sidecar is left in place\n');
        const { deleted, log } = deleteImportedSidecars(probed.streams, probed.tags, isMp4);
        return skip(log ? `☑[remove_source=true] Working in ${workLibDir()}\n${log}`
            : `☑[remove_source=true] No imported sidecar is waiting to be removed\n`);
    }
    // The -strict level either -c copy remux below needs (see mp4StrictArg): Dolby Vision's dvcC/dvvC boxes, or a TrueHD track the mp4 muxer refuses without
    // it. Only subtitle streams are ever added or dropped here, so every audio/video stream is copied and the copied-subset argument stays at its default.
    const strictArg = mp4StrictArg(dstContainer, streams);
    // The stream-summary token line. The input summary and every "Expected results" line are meant to be the SAME view of the stream set before and after,
    // and those result lines sit in mutually exclusive branches - so hand-typed copies could drift in a way only one run type ever shows.
    const summariseAll = (list) => list.map((s) => summariseStream(enrichStream(s))).join('');
    // Commit a built output-side arg string as the run: append the DV strict flag, then (mp4 only) -movflags use_metadata_tags, then the universal output
    // options - and set response.processFile, Tdarr's go/no-go switch, so calling this IS the commit point for the whole run. Shared by the extract and
    // import branches so their tails can't drift. The mov muxer writes only the tags it recognises unless that flag is set (measured on jellyfin-ffmpeg),
    // so it both keeps sibling plugins' global awk_* tags (awk_video/awk_recovered) through a -c copy and lands this plugin's own awk_sub_worker marker at
    // all - without it an mp4 marker silently vanishes and the next pass re-imports every sidecar it should have skipped.
    const commitPreset = (out) => {
        let full = out + strictArg;
        if (isMp4) full += ' -movflags use_metadata_tags';
        full += globalOutputOpt;
        response.preset = `<io>${full}`;
        response.processFile = true;
    };

    try {
        response.infoLog += `☐Input streams: ${summariseAll(streams)}\n`;

        // ---- embedded closed captions ---- Answered once, ahead of both action branches, because both ask the same two questions: is there caption data
        // worth the decode, and where would it land? Everything that can end the question cheaply is checked before the probe, and the probe before the
        // decode. Returns a job only when there is real work; otherwise a note saying why not, so an enabled setting never passes in silence.
        const ccVideo = streams.find((s) => codecTypeOf(s) === 'video' && !isCoverArt(s));
        // Both HDR tests read what summariseStream reads, and that is load-bearing: this filter deletes EVERY SEI NAL, and HDR10's static metadata
        // (mastering-display colour volume, MaxCLL/MaxFALL) lives in exactly those - a guard narrower than the plugin's own notion of HDR silently
        // un-HDRs a file on a -c copy pass while the log still prints `hdr`. So the transfer is both-probe (ffprobe's tag is routinely absent, or a loose
        // bt2020-10 in no allow-list, on a file mediaInfo still reports as HDR10), and ANY non-empty HDR_Format blocks, not only the dynamic spellings -
        // static HDR10 announces itself "SMPTE ST 2086", matching neither 2094 nor hdr10+. A refused file is not a lost feature: it takes the awk_cc strip
        // route and video_clean removes the captions on its next re-encode, the right answer for HDR anyway.
        const ccStripAllowed = () => {
            if (!ccVideo) return false;
            const mi = mediaInfoFor(ccVideo) || {};
            const xfer = String(ccVideo.color_transfer || mi.transfer_characteristics || '').toLowerCase().trim();
            const hdrFmt = String(mi.HDR_Format || mi.HDR_Format_Compatibility || '').trim();
            return String(ccVideo.codec_name || '').toLowerCase().trim() === 'h264'
                && !isDolbyVisionVideo(ccVideo, mi) && !HDR_TRANSFERS.includes(xfer) && !hdrFmt;
        };

        // Hidden on import, visible on extract. On import the sidecar is staging - the next pass muxes it in and remove_source deletes it - so a media server
        // must not offer it in the gap between the two; on extract it IS the deliverable and belongs in plain sight beside the video. Named once, out here,
        // because the import mux needs the same name later to recognise the staging file going in, long after the plan has stopped having anything to say.
        const ccName = (ccMode === 'enabled' && ccVideo)
            ? `${action === 'import' ? '.' : ''}${sidecarBasename(ccPseudoStream(ccVideo.index), false)}` : '';
        const ccPlan = (() => {
            if (ccMode !== 'enabled') return { job: null, note: '' };
            if (!ccVideo) return { job: null, note: '☑[embedded_cc=enabled] No video stream to read captions from\n' };
            // The memos that make this converge. Tdarr re-runs the stack until every plugin skips, so an answer already paid for must never be paid again.
            const ccTokens = ccTokensOf(file.ffProbeData.format?.tags);
            if (ccTokens.includes(CC_TOKENS.none))
                return { job: null, note: '☑[embedded_cc=enabled] The caption channel was read on an earlier pass and carries no caption text\n' };
            if (ccTokens.includes(CC_TOKENS.imported))
                return { job: null, note: '☑[embedded_cc=enabled] Closed captions are already embedded as a subtitle track\n' };
            const hidden = action === 'import';
            const name = ccName;
            const full = path.join(workLibDir(), name);
            if (!pathIsPresetSafe(full))
                return { job: null, note: `☒[embedded_cc=enabled] Library directory has a quote, control char or <io> - cannot write ${name} safely\n` };
            // The caption SOURCE path needs the same test, and the joined path above cannot stand in for it: videoBase strips a quote out of the NAME, so one
            // living in the video's own filename is invisible there while surviving verbatim in file.file - which is what the two mapped branches interpolate
            // into their quoted "movie=..." token. escapeMoviePath answers the filtergraph's parsers, not Tdarr's tokeniser, so a " there closes the token and
            // turns the rest into fresh argv entries, and an <io> truncates the whole command. Only the preset route is exposed: the unmapped route hands the
            // same string to spawnSync as one argv element, so it is gated on !placeViaApi() and keeps working.
            if (!placeViaApi() && !pathIsPresetSafe(String(file.file || '')))
                return { job: null, note: '☒[embedded_cc=enabled] The video path has a quote, control char or <io> - cannot read the captions safely\n' };
            const remoteDest = placeViaApi() ? serverSidePath(full) : '';
            if (placeViaApi() && !remoteDest)
                return { job: null, note: `☒[embedded_cc=enabled] No path translator maps this library directory back to the server - cannot write ${name}\n` };
            // An existing caption sidecar is the memo that the decode already happened. On a MAPPED node it can also be read, which is the only way to tell
            // a channel that carried no text from one that was never read: A53 side data is present whether or not anyone was speaking, so an empty channel
            // looks exactly like a full one to the probe. A cue-less sidecar is deleted and the finding recorded, so no later pass repeats the decode.
            const existing = placeViaApi() ? (sidecarExistsRemote(remoteDest) ? 'remote' : '')
                : ((() => { try { return fs.existsSync(full) ? 'local' : ''; } catch (e) { return ''; } })());
            if (existing === 'remote') return { job: null, note: `☑[embedded_cc=enabled] Caption sidecar already in the library: ${name}\n` };
            if (existing === 'local') {
                let text = null;
                try { text = fs.readFileSync(full, 'utf8'); } catch (e) { text = null; }
                if (text === null) return { job: null, note: `☒[embedded_cc=enabled] Could not read ${name} to check it - leaving it alone\n` };
                if (!hasNoCues(text, 'srt')) return { job: null, note: `☑[embedded_cc=enabled] Captions already extracted to ${name}\n` };
                let unlinked = true;
                try { fs.unlinkSync(full); } catch (e) { unlinked = false; }
                // Recording the verdict takes a mux of its own, and that is only safe where the tag comes back out. On a marker-hostile container the memo
                // cannot be stored, so the identical tag-only pass would be recomputed and re-emitted every time - which Tdarr refuses as an infinite
                // transcode loop and ERRORS the file. Decline the memo and say so: the decode is paid again, which is bounded, rather than the file lost.
                return {
                    job: null,
                    record: canRecord ? CC_TOKENS.none : '',
                    note: `☒[embedded_cc=enabled] The caption channel carries no caption text - ${unlinked
                        ? `removed the empty ${name}` : `${name} could not be removed`}${canRecord ? ' and recorded it so no later pass re-reads it'
                        : `; ${dstContainer} cannot store the awk_cc memo, so a later pass reads it again - remux to mkv or mp4 to stop that`}\n`,
                };
            }
            // Nothing memoised, so pay for the cheap check. Only `true` from the library scan is information - it reports false both for a file with no
            // captions and for one its scanner could not parse - so a false still goes to the probe, and an 'unknown' probe leaves the file alone.
            if (file.hasClosedCaptions !== true) {
                const inj = otherArguments && otherArguments.__awkCap;
                const seen = probeA53Captions(file.file, deriveFfprobePath(String(otherArguments?.ffmpegPath || 'ffmpeg')),
                    inj ? inj.captions === true : undefined);
                if (seen === 'unknown')
                    return { job: null, note: '☒[embedded_cc=enabled] Could not check this file for closed captions on this node - leaving it alone\n' };
                if (seen === false) return { job: null, note: '☑[embedded_cc=enabled] No embedded closed captions in this file\n' };
            }
            return { job: { name, full, remoteDest, hidden, stream: ccPseudoStream(ccVideo.index) }, note: '' };
        })();
        response.infoLog += ccPlan.note;

        // Captions are removed from the VIDEO BITSTREAM, not from a stream list, so the removal is a bitstream filter rather than a -map exclusion. It is
        // picture-lossless on H.264 only: remove_types takes NAL unit types and the numbering is CODEC-SPECIFIC, so 6 is SEI on H.264 but a VCL slice type
        // on HEVC, where the same filter would delete picture data. HDR and Dolby Vision are refused for the same reason in reverse - their metadata rides
        // in the SEI this drops. Dolby Vision is checked independently of the HDR tests and that is load-bearing, not belt-and-braces: profile 9 is 8-bit
        // AVC and SDR, so every HDR-shaped test passes it through and only the DV detector stands between it and a destroyed RPU.
        // Recording an empty caption channel takes a mux of its own: the tag IS the memo that stops the decode being repeated, and on a file with nothing
        // else queued there would be no other command to carry it. One pass, once per file, and every later pass reads the token and skips.
        // Union with whatever the tag already holds rather than replacing it: an earlier extract pass may have recorded a pending `strip` that video_clean has
        // not reached yet, and overwriting it would turn a deferred removal into one nothing will ever perform.
        const ccTagArg = (...add) => {
            const tokens = new Set(ccTokensOf(file.ffProbeData.format?.tags));
            for (const t of add) tokens.add(t);
            return ` -metadata "${CC_TAG}=${escMeta([...tokens].join(','))}"`;
        };
        if (ccPlan.record) {
            commitPreset(`-map 0 -c copy${ccTagArg(ccPlan.record)}`);
            response.infoLog += `☑Expected results: ${summariseAll(streams)}\n`;
            return response;
        }

        // The filter is addressed by the caption video's position among the OUTPUT's video streams, not by a literal 0. ccVideo is deliberately chosen past
        // any cover art (isCoverArt), and this branch drops only subtitle/attachment streams, so the two disagree exactly when an image "video" track precedes
        // the real one - a layout ffmpeg itself produces in Matroska, which drops the attached_pic disposition and writes the cover as a plain video track.
        // filter_units accepts no image codec: fed a png it does not warn or skip, it fails to INITIALISE and takes the whole output down (exit 234), killing
        // the sidecars written as earlier outputs of that same run. On every ordinary file the position is 0 and the emitted token is unchanged.
        const ccStripArg = (removed) => {
            const vPos = streams.filter((s) => codecTypeOf(s) === 'video' && !removed.has(s.index)).findIndex((s) => s.index === ccVideo.index);
            return vPos < 0 ? '' : ` -bsf:v:${vPos} filter_units=remove_types=6`;
        };

        if (action === 'extract') {
            // ============= EXTRACT: embedded text subs -> sidecars (+ optional removal) =============
            // Duplicate tracks the file already carries go before anything else: a dropped stream must not also be written to a sidecar, or the copy we just
            // decided was redundant comes straight back on the next import under a name of its own.
            const dupes = dedupeStreams ? dedupeEmbeddedSubs(streams.filter((s) => codecTypeOf(s) === 'subtitle')) : { dropIdx: [], retag: null, log: '' };
            response.infoLog += dupes.log;
            const eligible = streams.filter((s) => codecTypeOf(s) === 'subtitle' && isTextSub(s.codec_name)
                && !dupes.dropIdx.includes(s.index)
                && !(langFilter && !langFilter.has(langKey(resolveLang(s) || 'und'))));
            if (!eligible.length && !dupes.dropIdx.length && !ccPlan.job) return skip('☑No text subtitles to extract\n');

            // method_unmapped=mount on a node where the mount is not actually there. Extract does not need it - the file API still lands every sidecar in the
            // library - so failing here would be gratuitous when the work can be done. But it must not pass in silence: the user asked for a mount, the mount
            // is not working, and the next IMPORT pass hard-fails on this very thing (there the directory is the only way to FIND sidecars, so there is
            // nothing to fall back to). Same wording as that failure, so the two read as one problem.
            if (isUnmappedNode && unmappedMode === 'mount' && !mountedLib().dir) {
                response.infoLog += `☒[method_unmapped=mount] Could not reach the library from this node - ${mountedLib().why}\n`;
                response.infoLog += '☒[method_unmapped=mount] Placing sidecars through the file API instead; '
                    + 'import will FAIL on this node until the mount works\n';
            } else if (isUnmappedNode && unmappedMode === 'mount') {
                response.infoLog += `☑[method_unmapped=mount] Writing to the library at ${mountedLib().dir} (via ${mountedLib().via})\n`;
            }

            // A styled subtitle is exported as a .mks BUNDLE carrying the subtitle plus every font attachment, because those fonts exist nowhere else
            // (see BUNDLE_EXT). Loose text sidecars stay the default for everything else: a plain srt, and an ass/ssa in a file with no fonts, have
            // nothing to carry and are far more useful as editable text on disk.
            const fontIndices = streams.filter((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s)).map((s) => s.index);
            const fontMaps = fontIndices.map((i) => ` -map 0:${i}`).join('');

            // sidecarOut carries the extra ffmpeg outputs that write the sidecars on a MAPPED node. On an unmapped node it stays empty and the same
            // extractions are collected in placeJobs instead, to be run and uploaded by placeSidecars once the loop has seen every stream.
            let sidecarOut = ''; const removedIndices = new Set(dupes.dropIdx); let wrote = 0; let skipped = 0; let refused = 0; let bundled = 0;
            const placeJobs = [];
            // The caption extraction leads on both routes; on the unmapped one that is a hard requirement - placeSidecars concatenates every job's args
            // after a single -i, so the caption job's '-f lavfi -i' only precedes all outputs if its job is first. On the mapped route the same input is
            // emitted at the head of the OUTPUT side, where Tdarr's own -i is already spliced in ahead - on the input side it would become input 0 and
            // silently shift every existing -map 0. ccRecord is a SET because the awk_cc states combine and only one value is written: an empty channel on
            // a strip-refused source records BOTH `none` and `strip`, and a single-token overwrite would erase whichever came first. ccPlaced earns the
            // removal: on the unmapped route the caption srt is uploaded BEFORE the preset returns (a rejected upload must not be followed by a strip that
            // leaves the captions nowhere); on the mapped route sidecar and strip are outputs of the SAME command, so it is true by construction.
            let ccInput = ''; const ccRecord = new Set(); let ccPlaced = false;
            if (ccPlan.job && placeViaApi()) {
                placeJobs.push({
                    name: ccPlan.job.name,
                    dest: ccPlan.job.remoteDest,
                    args: ccLavfiArgs(),
                    index: ccVideo.index,
                    bundle: false,
                    caption: true,
                });
            } else if (ccPlan.job) {
                ccInput = `-f lavfi -i "movie=${escapeMoviePath(file.file)}[out0+subcc]" `;
                sidecarOut += ` -map 1:s:0 -c:s text -f srt "${ccPlan.job.full}"`;
                wrote += 1;
                ccPlaced = true;   // same ffmpeg command as the strip below, so the sidecar and the removal cannot come apart
                response.infoLog += `☐${streamTag(ccVideo.index)}[embedded_cc=enabled] Reading the embedded closed captions -> ${ccPlan.job.name}`
                    + ' (decodes the video, so this pass is slower than an ordinary extract)\n';
            }
            for (const s of eligible) {
                const { enc } = TEXT_SUB[String(s.codec_name).toLowerCase()];
                const bundle = fontIndices.length > 0 && isStyledSub(s.codec_name);
                const name = sidecarBasename(s, bundle);
                const full = path.join(workLibDir(), name);
                // The path goes into the quoted "${full}" token of the extract preset, so it has to survive Tdarr's quote-aware tokenizer
                // (pathIsPresetSafe). Only the library directory can fail that - the name we build is already sanitised - and a directory has to stay
                // literal, so the extract is skipped instead. The stream is NOT recorded in removedIndices either: a refused extract must never strip the
                // embedded track, which would then be the only remaining copy.
                if (!pathIsPresetSafe(full)) {
                    refused += 1;
                    response.infoLog += `☒${streamTag(s.index)} Library directory has a quote, control char or <io> - cannot write ${name} safely, `
                        + 'keeping the embedded subtitle\n';
                    continue;
                }
                // An unmapped node cannot reach the library to test or write the sidecar locally, so both happen through the server. With no translator
                // claiming the path there is no server-side destination at all, and the extract is refused exactly as an unsafe path is.
                const remoteDest = placeViaApi() ? serverSidePath(full) : '';
                if (placeViaApi() && !remoteDest) {
                    refused += 1;
                    response.infoLog += `☒${streamTag(s.index)} No path translator maps this library directory back to the server - cannot write ${name}, `
                        + 'keeping the embedded subtitle\n';
                    continue;
                }
                // An existing sidecar is preserved (never overwrite the user's edits) - but only if it has content. A 0-byte sidecar is the fingerprint of
                // an extract ffmpeg aborted mid-write; trusting it and then stripping the embedded source would lose the subtitle, so re-extract it instead.
                const existsNonEmpty = placeViaApi() ? sidecarExistsRemote(remoteDest)
                    : (fs.existsSync(full) && (() => { try { return fs.statSync(full).size > 0; } catch { return false; } })());
                if (existsNonEmpty) { skipped += 1; response.infoLog += `☑${streamTag(s.index)} Sidecar already exists, not overwriting: ${name}\n`; }
                // Unmapped: the extraction is deferred to placeSidecars after the loop, so this stream's removedIndices entry and its bundled tally wait for
                // the server's answer - nothing may be stripped until the sidecar is confirmed in the library.
                else if (placeViaApi()) {
                    const ffArgs = bundle ? ['-map', `0:${s.index}`, ...fontIndices.flatMap((i) => ['-map', `0:${i}`]), '-c', 'copy', '-f', 'matroska']
                        : ['-map', `0:${s.index}`, '-c:s', enc];
                    placeJobs.push({ name, dest: remoteDest, args: ffArgs, index: s.index, bundle });
                    continue;
                }
                // A bundle is muxed with -c copy so the subtitle and every font stay byte-exact; matroska auto-detects .mkv but NOT .mks, so -f is required.
                else if (bundle) {
                    sidecarOut += ` -map 0:${s.index}${fontMaps} -c copy -f matroska "${full}"`; wrote += 1;
                    response.infoLog += `☐${streamTag(s.index)} Extract -> ${name} (styled subtitle bundled with ${fontIndices.length} font${
                        fontIndices.length === 1 ? '' : 's'})\n`;
                }
                else {
                    sidecarOut += ` -map 0:${s.index} -c:s ${enc} "${full}"`; wrote += 1; response.infoLog += `☐${streamTag(s.index)} Extract -> ${name}\n`;
                }
                if (bundle) bundled += 1;
                if (removeSource) removedIndices.add(s.index);
            }
            // Unmapped node: the deferred extractions run HERE, in one ffmpeg pass, and each result is uploaded to the library. Only a sidecar the server
            // confirms in place counts as written and earns its stream a removal - a failure logs ☒ and keeps that subtitle embedded, so the worst case
            // is an unextracted subtitle rather than a lost one.
            if (placeJobs.length) {
                const { placed, failed, empty: emptyExtractions } = placeSidecars(placeJobs);
                for (const j of placeJobs) {
                    if (!placed.has(j.name)) {
                        // A caption job's failure is not a subtitle left embedded, and its index names the VIDEO stream, so it says so in its own words.
                        // placeSidecars' `empty` set is the empty-channel answer arriving early on this route: the decode ran and found no caption text,
                        // which is worth recording so no later pass repeats it. Read as a set membership, never sniffed out of the failure prose.
                        if (j.caption) {
                            const empty = emptyExtractions.has(j.name);
                            if (empty && canRecord) ccRecord.add(CC_TOKENS.none);
                            response.infoLog += `☒${streamTag(j.index)}[embedded_cc=enabled] ${empty
                                ? `The caption channel carries no caption text${canRecord ? ''
                                    : `; ${dstContainer} cannot store the awk_cc memo, so a later pass reads it again - remux to mkv or mp4 to stop that`}`
                                : `Could not place ${j.name} in the library - ${failed.get(j.name)}`
                                    + ' - keeping them in the video so a later pass can retry'}\n`;
                            continue;
                        }
                        // Counted only for a SUBTITLE STREAM: `refused` drives the "asked for an extraction and left nothing in the library" failure below,
                        // and a caption placement that did not land leaves no subtitle un-extracted - it leaves the captions where they already were, for
                        // the next pass to retry. Failing the file over a transient server condition would quarantine an undamaged video.
                        refused += 1;
                        response.infoLog += `☒${streamTag(j.index)} Could not place ${j.name} in the library - ${failed.get(j.name)}, `
                            + 'keeping the embedded subtitle\n';
                        continue;
                    }
                    wrote += 1;
                    if (j.caption) ccPlaced = true;   // the server confirms it holds the caption srt, which is what the bitstream removal below waits on
                    if (j.bundle) bundled += 1;
                    // NEVER for a caption job: its index is the video stream's, and removedIndices becomes a -map -0:N exclusion. Captions leave the
                    // bitstream through the strip filter below (or through video_clean on a re-encode), never by dropping the stream that carries them.
                    if (removeSource && !j.caption) removedIndices.add(j.index);
                    const bundleNote = j.bundle ? ` (styled subtitle bundled with ${fontIndices.length} font${fontIndices.length === 1 ? '' : 's'})` : '';
                    response.infoLog += j.caption ? ccReadLine(j.index, j.name) : `☑${streamTag(j.index)} Extracted -> ${j.name}${bundleNote}\n`;
                }
                // Seed the import list with what just landed, so a node that can only reach the library by name has somewhere to look (see seedSubtitleList).
                if (unmappedMode === 'text_file') {
                    const placedNames = placeJobs.filter((j) => placed.has(j.name)).map((j) => j.name);
                    const why = placedNames.length ? seedSubtitleList(placedNames) : LIST_SEED_NOTHING;
                    if (!why) response.infoLog += `☑[method_unmapped=text_file] Created ${videoBase}${SUBTITLE_LIST_SUFFIX} listing ${
                        placedNames.length} sidecar${placedNames.length === 1 ? '' : 's'} - edit it to add your own\n`;
                    else if (why !== LIST_SEED_EXISTS && why !== LIST_SEED_NOTHING) response.infoLog += `☒[method_unmapped=text_file] Could not create ${
                        videoBase}${SUBTITLE_LIST_SUFFIX} - ${why}\n`;
                }
            }
            // The fonts leave with the styled subtitles that need them, but only once a bundle actually holds them (bundled) and no styled subtitle is
            // left behind to use them - one kept by only_languages, or every track kept by remove_source=false. Removing them here just makes the
            // container consistent a pass earlier: with no ASS/SSA left they are orphaned, and clean_and_remux would remove them anyway.
            if (removeSource && bundled
                && !streams.some((s) => codecTypeOf(s) === 'subtitle' && isStyledSub(s.codec_name) && !removedIndices.has(s.index))) {
                for (const idx of fontIndices) removedIndices.add(idx);
                response.infoLog += `☐[remove_source=true] Removing ${fontIndices.length} font attachment${
                    fontIndices.length === 1 ? '' : 's'} - now archived in the styled-subtitle bundle\n`;
            }
            if (titleTruncated) response.infoLog += '☒A subtitle title was too long for the filename and was truncated\n';
            // sidecarOut rather than wrote: on an unmapped node the sidecars are already written, and with remove_source off there is genuinely nothing
            // left for ffmpeg to do. Three endings, only one a failure: extraction ASKED FOR that left NOTHING in the library (every eligible subtitle
            // refused) - processFile:false there would file the video under success with the subtitles never extracted. A run where some sidecars landed
            // keeps going and carries its ☒ lines into a successful log (a partial result, not a failed one); a sidecar an earlier pass placed is landed
            // just as much as one written this pass. Removing captions is a BITSTREAM edit with its own two routes: where the source qualifies it happens
            // right here, in the same -c copy pass; otherwise the request is recorded in awk_cc for video_clean's next re-encode - saying so matters,
            // because until then a player shows the captions AND the new subtitle. Gated on ccPlaced, not on a job having been PLANNED: removal may only
            // follow a copy the library is confirmed to hold. A channel proven EMPTY asks for nothing - the `none` memo already stops the decode repeating.
            let ccStrip = '';
            if (ccPlan.job && ccPlaced && removeSource && !ccRecord.has(CC_TOKENS.none)) {
                if (ccStripAllowed()) {
                    ccStrip = ccStripArg(removedIndices);
                    response.infoLog += `☐${streamTag(ccVideo.index)}[remove_source=true] Removing the closed captions from the video bitstream\n`;
                } else if (canRecord) {
                    ccRecord.add(CC_TOKENS.strip);
                    response.infoLog += `☒${streamTag(ccVideo.index)}[remove_source=true] The captions cannot be removed from this video without re-encoding`
                        + ' it - recorded the request, and video_clean will carry it out on its next encode; until then a player shows both copies\n';
                } else {
                    response.infoLog += `☒${streamTag(ccVideo.index)}[remove_source=true] The captions cannot be removed from this video without re-encoding`
                        + ` it, and ${dstContainer} cannot store the awk_cc request for video_clean to find - they stay in the video and a player shows both`
                        + ' copies; remux to mkv or mp4 to hand the removal on\n';
                }
            }
            const ccMeta = ccRecord.size ? ccTagArg(...ccRecord) : '';

            // ccStrip and ccMeta count as work in their own right: on an unmapped node the sidecars are already placed, so a caption-only run has an empty
            // sidecarOut and no removedIndices, and testing those alone would skip the pass that removes the captions from the bitstream.
            if (!sidecarOut && !removedIndices.size && !ccMeta && !ccStrip) {
                if (refused && !wrote && !skipped) failFile('No subtitle could be extracted - every eligible subtitle was refused, see the reasons above');
                return skip(wrote ? '☑[remove_source=false] Sidecars placed in the library - nothing left to remux\n'
                    : '☑All eligible subtitles already extracted\n');
            }

            let out = `${ccInput}${sidecarOut} -map 0`;
            for (const idx of removedIndices) out += ` -map -0:${idx}`;
            out += ' -c copy';
            const keptSubs = streams.filter((s) => !removedIndices.has(s.index) && codecTypeOf(s) === 'subtitle');
            out += retagArgs(dupes.retag, keptSubs) + ccStrip + ccMeta;
            commitPreset(out);
            const survivors = streams.filter((s) => !removedIndices.has(s.index));
            response.infoLog += `☑Expected results: ${summariseAll(survivors)}\n`;
            return response;
        }

        // ============= IMPORT: sidecars -> embedded (+ safe deletion) =============
        // Captions reach a subtitle TRACK over two passes, and that is a reuse decision rather than a compromise: this pass only reads them out to a hidden
        // staging sidecar, and the next runs that file through the ordinary import path, which already verifies content, collapses duplicates against what
        // is embedded, converts to mov_text for an mp4 target, restores metadata from the name and deletes the file afterwards. Muxing the captions straight
        // in would be a second, weaker copy of all of that. The staging file is dot-prefixed so no media server offers it in the gap between the two passes.
        if (ccPlan.job && !placeViaApi()) {
            commitPreset(`-f lavfi -i "movie=${escapeMoviePath(file.file)}[out0+subcc]" -map 1:s:0 -c:s text -f srt "${ccPlan.job.full}" -map 0 -c copy`);
            response.infoLog += `☐${streamTag(ccVideo.index)}[embedded_cc=enabled] Reading the embedded closed captions -> ${ccPlan.job.name}`
                + ' (decodes the video); the next pass muxes them in as a subtitle track\n';
            response.infoLog += `☑Expected results: ${summariseAll(streams)}\n`;
            return response;
        }
        // An unmapped node has no library to write an extra ffmpeg output into, so the same extraction runs in-plugin and uploads through the file API - and
        // then falls THROUGH into the import below rather than returning, because the sidecar is in the library now and this pass can still mux it.
        if (ccPlan.job) {
            const { placed, failed, empty: emptyExtractions } = placeSidecars([{ name: ccPlan.job.name, dest: ccPlan.job.remoteDest, args: ccLavfiArgs() }]);
            if (placed.has(ccPlan.job.name)) {
                response.infoLog += ccReadLine(ccVideo.index, ccPlan.job.name);
                if (unmappedMode === 'text_file') seedSubtitleList([ccPlan.job.name]);
            } else {
                // An empty channel is a VERDICT and has to be memoised, exactly as the mapped route memoises it through ccPlan.record: the tag is the only
                // thing that stops the next pass paying for the same full-video decode, and it takes a mux of its own to write. Returning here defers any
                // other import work by one pass, which is what the mapped route does too - and cheaply, since that pass no longer decodes. The two outcomes
                // are EXCLUSIVE, as they are on the extract route: a channel that carried no text is not a placement that failed, and reporting both leaves
                // the user reading a library/upload fault under a line that just said there was nothing to upload.
                if (emptyExtractions.has(ccPlan.job.name)) {
                    response.infoLog += `☒${streamTag(ccVideo.index)}[embedded_cc=enabled] The caption channel carries no caption text${canRecord
                        ? ' - recorded it so no later pass re-reads it'
                        : `; ${dstContainer} cannot store the awk_cc memo, so a later pass reads it again - remux to mkv or mp4 to stop that`}\n`;
                    if (canRecord) {
                        commitPreset(`-map 0 -c copy${ccTagArg(CC_TOKENS.none)}`);
                        response.infoLog += `☑Expected results: ${summariseAll(streams)}\n`;
                        return response;
                    }
                } else {
                    response.infoLog += `☒${streamTag(ccVideo.index)}[embedded_cc=enabled] Could not place ${ccPlan.job.name} in the library - ${
                        failed.get(ccPlan.job.name)}\n`;
                }
            }
        }
        // The global marker VALUE lists the sidecar paths (relative to the video's directory) an earlier pass consumed, so a later pass deletes exactly what
        // it embedded (never a pre-existing collision) and never re-adds them. Tdarr only re-runs after a SUCCESSFUL mux, so a listed sidecar is safely in.
        const importedSet = new Set(decodeMarkerList(getTagCI(file.ffProbeData.format?.tags || {}, 'awk_sub_worker')));

        // Import discovers sidecars by SCANNING the library directory, and an unmapped node has no view of it - libDir there is the node-local
        // mirror Tdarr downloads into, so the scan would read back only the video it was given. The file API cannot stand in: it addresses one
        // known path at a time (upload/download) and offers no directory listing, while a sidecar's name encodes language, flags and title, so
        // there is nothing enumerable to ask for. method_unmapped decides which of the three ways out applies. Whatever happens, a mode that
        // cannot do the job FAILS the file rather than skipping: the user asked for import, and processFile:false is Tdarr's "no work needed"
        // signal, so returning it would file the video under success and leave a silently un-imported library nobody has reason to look at.
        let listedRels = null;   // non-null once method_unmapped=text_file has supplied the names, since there is no directory to scan
        if (isUnmappedNode) {
            if (unmappedMode === 'error') {
                failFile('[method_unmapped=error] This node is unmapped and cannot see the library to find sidecars - '
                    + 'set method_unmapped to mount or text_file, or run import on a node that shares the library filesystem');
            }
            if (unmappedMode === 'mount' && !mountedLib().dir) {
                failFile(`[method_unmapped=mount] Could not reach the library from this node - ${mountedLib().why}`);
            }
            if (unmappedMode === 'mount') response.infoLog += `☑[method_unmapped=mount] Reading the library at ${mountedLib().dir} (via ${mountedLib().via})\n`;
            // Every route says WHERE it read from, this one included - see the mapped-route note below for why that line matters.
            if (unmappedMode === 'text_file') {
                // No directory access at all here, so the list IS the discovery: each name is fetched from the server by path, and so is the list itself
                // (see downloadLibraryFile for why it has to sit at a name we can compute).
                const listName = `${videoBase}${SUBTITLE_LIST_SUFFIX}`;
                const listDest = serverSidePath(path.join(libDir, listName));
                if (!listDest) failFile(`[method_unmapped=text_file] No path translator maps ${libDir} back to the server, so ${listName} cannot be fetched`);
                const listLocal = path.join(libDir, listName);
                // No list is NOTHING TO IMPORT, not a failure. It is the ordinary state of most files: extract only writes one when it actually placed
                // sidecars, so a video with no text subtitles never has one - and a completed round trip deletes the list once its last entry is embedded.
                // Failing here would quarantine every such file, turning both "nothing to do" and "finished successfully" into errors. This is the same
                // outcome a mapped node reaches by scanning the folder and finding no sidecars; only the way it looks is different.
                const listWhy = downloadLibraryFile(listDest, listLocal);
                if (listWhy) {
                    response.infoLog += `☑[method_unmapped=text_file] No ${listName} in the library, so there is nothing listed to import - extract creates `
                        + 'one when it writes sidecars, or add it yourself with one filename per line\n';
                    listedRels = [];   // nothing to import - but the file's own duplicate subtitle streams are still worth collapsing, so fall through
                }
                if (listedRels === null) {
                    let listText = '';
                    try { listText = fs.readFileSync(listLocal, 'utf8'); } catch (e) {
                        failFile(`[method_unmapped=text_file] Fetched ${listName} but could not read it back: ${e && e.message ? e.message : e}`);
                    }
                    const parsed = readSubtitleList(listText);
                    for (const [entry, why] of parsed.bad) response.infoLog += `☒[method_unmapped=text_file] Ignoring "${entry}" in ${listName} - ${why}\n`;
                    // An empty list is the same "nothing to import" as no list at all - a user who emptied it, or left only comments, has said so. A list whose
                    // every line was REJECTED is different: those were written with intent and not one can be used, which is a mistake worth stopping on.
                    if (!parsed.ok.length && parsed.bad.length) {
                        failFile(`[method_unmapped=text_file] ${listName} lists no usable filenames - every line was rejected, see above`);
                    }
                    if (!parsed.ok.length) {
                        response.infoLog += `☑[method_unmapped=text_file] ${listName} lists no filenames, so there is nothing to import - `
                            + 'add one filename per line\n';
                        listedRels = [];
                    } else {
                        listedRels = fetchListedSidecars(parsed.ok, listName, importedSet);
                        // Names an earlier pass already embedded and removed are not a shortfall, so they count out of the total rather than as failures.
                        const spent = parsed.ok.filter((rel) => importedSet.has(rel) && !listedRels.includes(rel)).length;
                        const wanted = parsed.ok.length - spent;
                        response.infoLog += `☑[method_unmapped=text_file] Read ${parsed.ok.length} filename${parsed.ok.length === 1 ? '' : 's'} from ${
                            listName}, fetched ${listedRels.length} of the ${wanted} still to import${
                            spent ? ` (${spent} already embedded and removed)` : ''}\n`;
                    }
                }
            }
        }

        // Every route says WHERE it read from, the two unmapped ones above included. The mapped route matters MOST: it is the only one that can end up
        // reading a node-local mirror while looking exactly like a healthy run - sidecars found there import, compare and delete perfectly well, against the
        // wrong copy of the library. It also says when the node type is UNKNOWN: that comes from otherArguments.configVars, which only the classic worker
        // supplies, so a caller passing less (the flow shim passes no configVars at all) leaves an unmapped node indistinguishable from a mapped one, and the
        // mapped assumption points every read and every delete at the mirror. Naming both the directory and the missing configuration turns that into one line.
        if (!isUnmappedNode) response.infoLog += `☑Reading sidecars from ${workLibDir()}${
            otherArguments?.configVars ? '' : ' (node type unknown - Tdarr passed no node configuration for this run)'}\n`;
        const scan = listedRels ? { rels: listedRels } : scanSidecarDirs();
        if (scan.err) failFile(`Cannot read the library directory to find sidecars: ${scan.err.message || scan.err}`);
        // Every drop from here down says so. A sidecar that is on disk and never mentioned again is indistinguishable from one the plugin never saw, and
        // that is precisely the report a user cannot debug - so each filter names the file and the setting that excluded it.
        const found = scan.rels.map(parseSidecarRel).filter(Boolean)
            .sort(byOriginalPosition)
            .filter((f) => {
                if (!langFilter || langFilter.has(langKey(f.lang))) return true;
                // The tag echoes a free-text input, so it gets the same treatment failLangToken gives its token: control characters collapsed (a raw newline
                // would split the line into a continuation with no ☐/☑/☒ symbol) and capped, since nothing bounds the list and this line is per-sidecar.
                response.infoLog += `☑[only_languages=${String(inputs.only_languages ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}] Skipping ${
                    f.rel} - ${f.lang} is not in the list\n`;
                return false;
            })
            // An mp4-family target carries no font attachments at all, so importing a styled-subtitle bundle there would embed the subtitle and strand
            // its fonts - and remove_source would then delete the only copy that has them. Leave the bundle untouched on disk instead
            // (dropping it from `found` also keeps it out of the deletion pass below); remux the file to mkv and run import again to restore it.
            .filter((f) => {
                if (!f.bundle || !isMp4) return true;
                response.infoLog += `☒Cannot import ${f.rel} - an ${dstContainer} target carries no font attachments, `
                    + 'keeping the styled-subtitle bundle on disk\n';
                return false;
            });
        // A file that LOOKS like a subtitle but does not parse as a sidecar is almost always a hand-named one, and saying nothing about it turns a typo into
        // a long hunt for why "nothing happened". Only subtitle EXTENSIONS are named: the library folder holds plenty of unrelated files, and reporting
        // every one of them would be noise. This runs before the empty check, because a run that imports nothing is exactly when the user needs the reason.
        for (const rel of scan.rels) {
            if (parseSidecarRel(rel)) continue;
            const relBase = path.posix.basename(rel.replace(/\\/g, '/'));
            const relExt = (relBase.match(/\.([A-Za-z0-9]+)$/) || ['', ''])[1].toLowerCase();
            // A DOT-PREFIXED file is hidden from media servers, and an unparseable one is usually a file the user meant to leave alone: clean_and_remux's
            // remove_imagesubs=export writes ".<video>.s<index>.<lang>[.forced].mks" for VobSub/DVB and waits on an external OCR pass, so warning about it
            // every run, forever, would be noise. Our own bundles are dot-prefixed too, but they parse and never reach this line.
            // A hidden TEXT sidecar named after THIS video is the exception: that is the OCR coming back, it is importable now, so a name that still fails to
            // parse is a genuine mistake (a bad language token, a lost s<index>) and saying nothing would strand the work the user just did.
            if (relBase.startsWith('.') && !(TEXT_EXTS.includes(relExt) && relBase.slice(1).startsWith(`${videoBase}.`))) continue;
            if (TEXT_EXTS.includes(relExt) || relExt === BUNDLE_EXT) response.infoLog += `☒Not a recognised sidecar name, skipping: ${rel}\n`;
        }
        // This pass only ever ADDS subtitles - it never deletes a sidecar. remove_source acts in the post-processing branch above, after acceptance.
        const embeddedSubs = streams.filter((s) => codecTypeOf(s) === 'subtitle');
        const hasFontAttachment = streams.some((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s));
        // Duplicates the file already carries, removed here as well as on extract - they are a property of the file, not of a workflow. Every output index
        // below counts SURVIVING subtitle streams (see retagArgs); the unfiltered list silently retags or lands tracks one slot off for every stream removed.
        const dupes = dedupeStreams ? dedupeEmbeddedSubs(embeddedSubs) : { dropIdx: [], retag: null, log: '' };
        response.infoLog += dupes.log;
        // removedIndices is what THIS run maps out - the same name the extract branch and the sibling plugins use.
        const removedIndices = new Set(dupes.dropIdx);
        const keptSubs = embeddedSubs.filter((s) => !removedIndices.has(s.index));

        // Nothing to import does not mean nothing to do: the file's OWN duplicate subtitle streams are still removed. Reaching the mux below requires a
        // sidecar, and this is the one route to it that has none - a library with no sidecars at all, or a round trip that has already finished and cleaned
        // up after itself, would otherwise never have its duplicates collapsed.
        if (!found.length) {
            if (!removedIndices.size) return skip('☑No subtitle sidecars found to import\n');
            let dropOnly = ' -map 0';
            for (const idx of removedIndices) dropOnly += ` -map -0:${idx}`;
            dropOnly += ' -c copy';
            dropOnly += retagArgs(dupes.retag, keptSubs);
            commitPreset(dropOnly);
            response.infoLog += `☑Expected results: ${summariseAll(streams.filter((x) => !removedIndices.has(x.index)))}\n`;
            return response;
        }

        // An import is only safe where the file can carry the record of it. The awk_sub_worker marker is the ONLY thing that tells a later pass a sidecar is
        // already in the file: the content test that also settles one is optional (deduplicate) and cannot speak for a bundle or for a track the target
        // mangled - mpegts, for one, accepts a text subtitle by writing it as an opaque data stream, which no later probe can match back to the sidecar. So on
        // a marker-hostile container one import becomes an unbounded one, adding another copy of every sidecar on every pass until Tdarr happens to see two
        // identical presets and errors the file anyway. Stopping HERE, past the no-sidecars branch above, keeps the file's own duplicate-subtitle cleanup
        // working and only ever fires when there is real import work to refuse - and it stops rather than skips, because sidecars are sitting in the library
        // for this video and processFile:false would file that under success, leaving a silently un-imported library nobody has reason to look at.
        if (!canRecord) {
            failFile(`[action=import][container=${dstContainer}] ${found.length} sidecar${found.length === 1 ? '' : 's'} to import, but ${dstContainer}`
                + ' cannot store the awk_sub_worker marker that records them, so every later pass would import them again - remux to mkv or mp4 first'
                + ' (clean_and_remux does that), then run import');
        }

        // Import is NON-DESTRUCTIVE: every recognized sidecar not already handled by our own prior pass (marker) is muxed in. A sidecar is never suppressed
        // just because an embedded sub shares its lang|title|disposition - metadata can't prove same content, and dropping a distinct track is data loss,
        // whereas a redundant duplicate is not (genuine duplication collapses by CONTENT - deduplicate, below). The marker suppresses a re-import only while
        // the file STILL CARRIES that subtitle: the metadata match here plus the group's own text further down (the marker is never cleared, so it cannot be
        // trusted alone - see markerConfirmsEmbedded). Either way the decision is logged - "nothing happened" and "nothing needed to happen" look identical
        // from outside. Each sidecar muxes as -i "${workLibDir()}/${rel}": a " or control char in that real path would close the quote and inject ffmpeg args
        // (pathIsPresetSafe), and unlike a name we generate it must match the file byte-for-byte, so it can't be sanitised - skip it, never break out.
        const alreadyEmbedded = (f) => importedSet.has(f.rel) && markerConfirmsEmbedded(f, embeddedSubs, hasFontAttachment, isMp4);
        // A sidecar written with remove_source=false left the track it came from IN the file, so importing it adds a SECOND copy of that subtitle.
        // That is not a mistake to correct - it is the point of an edit round trip, where the sidecar on disk is deliberately no longer what was extracted -
        // and this pass cannot tell an edited sidecar from an untouched one without decoding the embedded track, so it must not drop either. But it can SAY
        // so: the name carries the source stream index, and finding that stream still present, still matching, is real provenance rather than a metadata
        // guess. Matched on language + title, except on mp4/mov where the muxer drops per-stream titles and only the language survives to compare.
        const stillEmbedded = (m) => m.index !== null && embeddedSubs.some((s) => s.index === m.index
            && langKey(resolveLang(s) || 'und') === langKey(m.lang || 'und') && (isMp4 || (s.tags?.title || '') === (m.title || '')));
        // Only the unsafe-name check filters INDIVIDUAL sidecars here. The marker skip deliberately waits until they have been grouped by content, because
        // it is a per-file test on a metadata match and would otherwise split a byte-identical group: with two copies of one subtitle under different names,
        // whichever the marker happens to confirm drops out, leaving the OTHER to speak for the group - and which one that is flips every pass, so a retune
        // ping-pongs between their two titles forever. Grouping first gives the group one identity no matter which member is confirmed, and the retune then
        // finds the track already matching and does nothing. See the group-level skip below.
        const candidates = found.filter((f) => {
            if (pathIsPresetSafe(path.join(workLibDir(), f.rel))) return true;
            response.infoLog += `☒Skipping sidecar with an unsafe filename (a quote, control char or <io>), cannot import safely: ${f.rel}\n`;
            return false;
        });

        // Group candidates by byte-identical file content (disabled => every file is its own group). A file whose bytes cannot be read - gone since the
        // readdir, or too large to be a subtitle at all - gets a unique key, so it is imported on its own, never silently dropped or merged.
        const contentKey = (f) => sidecarSha1(f.rel) || `unreadable:${f.rel}`;
        const groups = []; const groupHash = new Map();
        if (!dedupeSidecars) { for (const f of candidates) groups.push([f]); }
        else {
            const byHash = new Map();
            for (const f of candidates) {
                const h = contentKey(f); let g = byHash.get(h);
                if (!g) { g = []; byHash.set(h, g); groups.push(g); groupHash.set(g, h); }
                g.push(f);
            }
        }

        // One import per group: union the members' disposition tokens (byte-identical plain + SDH -> SDH), and take the first non-"und" language and
        // first non-empty title. The physical file muxed is the member with the most-specific dispositions (deterministic tie-break by name); its
        // metadata is overridden by the merged values, so which identical copy we pick doesn't matter.
        let merged = groups.map((g) => {
            const dispTokens = [...new Set(g.flatMap((m) => m.dispTokens))];
            const extraTokens = [...new Set(g.flatMap((m) => m.extraTokens || []))];   // unioned with the roles, so a merged group keeps every member's flags
            const lang = (g.find((m) => m.lang && m.lang !== 'und') || g[0]).lang;
            const title = g.map((m) => m.title).find(Boolean) || '';
            const src = g.slice().sort((a, b) => b.dispTokens.length - a.dispTokens.length || (a.name < b.name ? -1 : 1))[0];
            return {
                members: g, name: src.name, rel: src.rel, ext: src.ext, bundle: src.bundle, lang, title, dispTokens, extraTokens,
                disp: [...new Set(dispTokens.concat(extraTokens).map(dispFfOf).filter(Boolean))],
            };
        });

        // The sha1 of every text track that will STILL be in the file after this pass, so the marker skip below can be decided on the same fact the dedup
        // further down decides on. embeddedTextHashes memoises its one ffmpeg pass, so the two share it however many times either asks.
        const survivingTextHashes = () => {
            const all = embeddedTextHashes(embeddedSubs);
            return all && new Map([...all].filter(([idx]) => !removedIndices.has(idx)));
        };
        // The CONTENT half of the same rule (the marker is never cleared - see markerConfirmsEmbedded). Specific to THIS site: a sidecar the user EDITED
        // keeps its name, so metadata still matches while the text no longer does - a group is settled only once its own bytes are one of the surviving
        // tracks, or that edit would be skipped as "already embedded". A bundle (archive, not comparable text) and a probe that could not run fall back to
        // the marker's metadata match. Group-level by construction: every member is byte-identical. A sidecar with no CUES can never be confirmed by
        // content - importing it produces a track that decodes to nothing and gets no hash, so the marker skip could never fire and the same empty
        // subtitle would be muxed in again every cycle, one more dead track each time; the marker's metadata match decides there too. An unreadable or
        // oversized sidecar answers false and takes the ordinary content route, which imports - the recoverable direction.
        const groupHasNoCues = (f) => {
            try {
                const p = path.join(workLibDir(), f.rel);
                if (fs.statSync(p).size > SIDECAR_HASH_MAX) return false;
                return hasNoCues(fs.readFileSync(p, 'utf8'), f.ext);
            } catch (e) { return false; }
        };
        // The counterpart of contentConfirms above, and DELIBERATELY the opposite polarity - hence the different verb. contentConfirms guards an UNLINK, so
        // "cannot prove it" must mean "do not delete on content grounds" and it fails CLOSED. This one guards a SKIP, so "cannot prove it" must mean "defer to
        // the marker", which alreadyEmbedded has already confirmed against the live streams - it fails OPEN. Returning false for a bundle here would re-import
        // an already-imported styled bundle as a duplicate on every pass, and a bundle is an archive rather than comparable text, so nothing could ever settle
        // it again. The name says which way it fails; do not "fix" it to match its sibling.
        const contentAllowsSkip = (f) => {
            if (f.bundle || groupHasNoCues(f)) return true;
            const eh = survivingTextHashes();
            if (!eh) return true;          // the probe could not run, so nothing is proven either way and the marker's metadata match decides
            if (!eh.size) return false;    // the probe RAN and no surviving track holds text, so this sidecar is demonstrably not in the file - import it
            return [...eh.values()].includes(groupHash.get(f.members) || contentKey(f));
        };
        // The marker skip, now that a group has ONE identity. A group is done only when EVERY member is confirmed embedded AND the group's text is really
        // there: a partly-confirmed group still has something to say (its merged title or flags may not be on the track yet), and processing it is harmless
        // because its content is then found already embedded below. The test runs on a GROUP, never on a bare file - see the candidates filter above for why.
        const settled = new Set(merged.filter((f) => f.members.every(alreadyEmbedded) && contentAllowsSkip(f)));
        for (const f of settled) {
            const names = f.members.length > 1 ? `${f.members.length} copies of it (${f.members.map((m) => m.rel).join(', ')})` : f.rel;
            response.infoLog += `☑Skipping ${names} - already embedded by an earlier pass\n`;
        }
        merged = merged.filter((f) => !settled.has(f));

        // Dedup does not stop at sidecar-vs-sidecar. A sidecar whose TEXT is already one of the embedded tracks is just as much a duplicate, and muxing it
        // leaves the file carrying the same subtitle twice - the state remove_source=false sets up, since the track stayed behind and the sidecar was
        // written from it. No metadata test can see this (see embeddedTextHashes), so the content decides - the same surviving-track hashes the marker skip
        // above reads, from the same single ffmpeg pass. The sidecar still counts as consumed: its content is demonstrably in the file, and preserving the
        // information is the test, not which container it ends up living in.
        const embeddedHashes = (dedupeSidecars && merged.some((f) => !f.bundle)) ? survivingTextHashes() : new Map();
        // A bundle is an archive, not comparable text, so it is never matched this way; a null map means the probe could not run (see embeddedTextHashes).
        const embeddedAt = (f) => {
            if (f.bundle || !embeddedHashes || !embeddedHashes.size) return null;
            const h = groupHash.get(f.members);
            if (!h) return null;
            for (const [idx, eh] of embeddedHashes) if (eh === h) return idx;
            return null;
        };
        // A track already in the file needs no mux, so the only open question is its METADATA - and unlike a new track it has metadata of its own to
        // disagree with. method_import_metadata decides who wins: 'embedded' keeps the track's tags and reports the difference (a sidecar name is frozen
        // when written, so an old one carries no token for a flag that did not exist yet, and applying it would STRIP that flag); 'sidecar' makes the
        // filename authoritative - renaming a sidecar retunes the track, dispositions included, written as an explicit 0 when the name carries none.
        // Comparison ignores per-stream titles on mp4/mov (the muxer drops them). retunedAt records each retuned SOURCE index so the embedded-dedup fold
        // below leaves that track alone - ffmpeg takes the LAST -metadata/-disposition for a slot, so the fold, appended last, would silently overwrite a
        // retune the log already announced as done.
        const alreadyInFile = []; const toMux = []; let retuneMeta = ''; const retunedAt = new Set();
        for (const f of merged) {
            const at = embeddedAt(f);
            if (at === null) { toMux.push(f); continue; }
            f.embeddedAt = at;
            alreadyInFile.push(f);
            response.infoLog += `☑${streamTag(at)}[deduplicate=${dedupeMode}] ${f.rel} is already in the file byte-for-byte - not importing a second copy\n`;
            const cur = keptSubs.find((s) => s.index === at);
            const curTitle = isMp4 ? (f.title || '') : (cur?.tags?.title || '');
            const curDisp = new Set(activeDispositions(cur));
            // `default` is muxer-managed rather than a role, so no sidecar name can carry it (see DISPOSITIONS) and f.disp never holds it. The track's own
            // flag joins the wanted set instead, which both cancels it out of the comparison and stops the whole-set write below from stripping it. Without
            // that a default-flagged track never matches its sidecar: one wasted retune remux under 'sidecar', a disagreement warning under 'embedded' on
            // every pass that leaves the sidecar in place (that branch writes no marker, so nothing settles it), and on mkv the flag silently gone. Same
            // rule as dedupeEmbeddedSubs, which keeps its own keeper's default for the same reason.
            const wantDisp = new Set(f.disp);
            if (cur?.disposition?.default === 1) wantDisp.add('default');
            const sameDisp = sameDispositions(curDisp, wantDisp);
            if (curTitle === (f.title || '') && langKey(resolveLang(cur) || 'und') === langKey(f.lang || 'und') && sameDisp) continue;
            const named = [f.lang, f.title, ...f.disp].filter(Boolean).join(' ');
            if (metadataMode !== 'sidecar') {
                response.infoLog += `☒${streamTag(at)}[method_import_metadata=${metadataMode}] The sidecar name and the embedded track disagree on metadata `
                    + `- keeping the track's own (name: ${named})\n`;
                continue;
            }
            const outIdx = keptSubs.findIndex((s) => s.index === at);   // position among the SURVIVING subtitle streams (see retagArgs)
            retuneMeta += retagOne(outIdx, f.lang, f.title, [...wantDisp]);   // an empty Set spreads to an empty array, so the '0' sentinel still applies
            retunedAt.add(at);
            response.infoLog += `☐${streamTag(at)}[method_import_metadata=sidecar] Retagging the track already in the file from ${f.rel} (${
                named || 'no language, title or flags'})\n`;
        }

        // Sidecars that were only ever redundant, with nothing to mux alongside them: no transcode to wait on, so the deletion happens now rather than in
        // post-processing - safe precisely because these never entered the marker (anything reaching here had its content in the file BEFORE this flow
        // started, so it is in the accepted library copy however the flow ends). Requires REACHING the library, which placeViaApi() is the negation of:
        // without that, workLibDir() is the node-local mirror, and under text_file the sidecars there are this run's own downloaded scratch copies -
        // unlinking them reports a deletion that never touched the library. Nor can any other route stand in (the file API has no delete; with nothing to
        // mux there is no acceptance and no server-side pass), so it says so and leaves them alone rather than claim a deletion it did not perform. Both
        // cleanup shortcuts below must be the EXACT negation of the mux branch's trigger (toMux || retuneMeta || removedIndices) - a queued embedded-dedup
        // drop is work on the FILE, and returning here would discard it silently.
        if (!toMux.length && !retuneMeta && !removedIndices.size && alreadyInFile.length && removeSource && placeViaApi()) {
            const stranded = alreadyInFile.flatMap((f) => f.members.map((m) => m.rel));
            // Forcing twice for the same sidecar is worse than not forcing at all: Tdarr ERRORS a file whose consecutive passes emit identical arguments
            // (its own infinite-transcode-loop guard), so a repeat does not merely waste a remux, it quarantines the video. The marker is the record of
            // what an earlier pass already queued, and it is checked DIRECTLY here rather than through alreadyEmbedded, which cannot confirm a sidecar whose
            // decoded title differs from the track's - a hand-added copy under a name of the user's own choosing is exactly that, and would otherwise
            // re-force on every pass. Nothing is lost by stopping: that earlier pass's marker still names them, so post-processing deletes them when it runs.
            if (!stranded.some((rel) => !importedSet.has(rel))) {
                response.infoLog += '☑[remove_source=true] Already queued for removal by an earlier pass - '
                    + 'nothing more to do until the post-processing stage runs\n';
                return skip('☑Nothing to import - every sidecar was already in the file\n');
            }
            // The marker is written whole, so anything left out of it is erased. Carry forward every sidecar still on disk that an earlier pass already
            // settled (alreadyEmbedded), exactly as the mux path below does for the same reason: dropped from the marker, it is no longer skipped and the
            // next pass imports it again as a duplicate track. A .mks bundle has no other way back - an archive is not comparable text, so its content can
            // never re-settle it and the marker entry is the whole record. Nothing is unlinked in this branch, so every entry added here still exists.
            const markList = [...new Set([...stranded, ...found.filter(alreadyEmbedded).map((f) => f.rel)])];
            // The only route left, so it is taken rather than offered: a lossless copy of the whole file is emitted purely to reach the post-processing stage
            // above. Making this a setting would only work for someone who already knew the trap existed, and by then they have been caught by it: asking for
            // the sidecars to be deleted IS asking for whatever it takes. It cannot repeat - one extra pass per file, ever - because the marker stamped here
            // lists them, so the next pass filters them out through alreadyEmbedded, whether or not the deletion that follows actually succeeded.
            response.infoLog += '☒[remove_source=true] Every sidecar is already in the file and this node cannot reach the library to delete them - '
                + 'remuxing losslessly, since only an accepted transcode gives the server a pass in which to do it\n';
            for (const rel of stranded) response.infoLog += `☐[remove_source=true] Queued for removal once accepted: ${rel}\n`;
            commitPreset(` -map 0 -c copy -metadata "awk_sub_worker=${encodeMarkerList(markList)}"`);
            response.infoLog += `☑Expected results: ${summariseAll(streams)}\n`;
            return response;
        }
        if (!toMux.length && !retuneMeta && !removedIndices.size && alreadyInFile.length && removeSource) {
            let gone = 0; const removedRels = new Set();
            for (const rel of alreadyInFile.flatMap((f) => f.members.map((m) => m.rel))) {
                try {
                    fs.unlinkSync(path.join(workLibDir(), rel)); gone += 1; removedRels.add(rel);
                    response.infoLog += `☑[remove_source=true] Deleted sidecar (its content is already in the file): ${rel}\n`;
                }
                catch (e) { response.infoLog += `☒[remove_source=true] Could not delete sidecar ${rel}: ${e && e.message ? e.message : e}\n`; }
            }
            response.infoLog += deleteSpentSubtitleList('remove_source=true', removedRels);   // same cleanup whichever route removed them
            return skip(`☑Nothing to import - every sidecar was already in the file${gone ? `, ${gone} removed from ${workLibDir()}` : ''}\n`);
        }

        // A retune is a mux of its own: no new inputs and no new maps, just the metadata of a stream that is already there. It rides the same output as any
        // real import when both are due, so a pass that adds one track and retags another does it in a single remux.
        if (toMux.length || retuneMeta || removedIndices.size) {
            // Mux one track per group. Extra -i inputs go on the OUTPUT side of the preset, so the video being transcoded stays input 0.
            let inputSide = ''; let extraMaps = ''; let meta = retuneMeta; let fontsRestored = false;
            toMux.forEach((f, k) => {
                const outIdx = keptSubs.length + k;
                // A bundle is a container, not raw text, so it takes no -sub_charenc and its subtitle is selected by type (:s:0) rather than by index.
                // Its fonts come back only when the file has none of its own - every bundle carries the full font set, so one restore is always complete
                // and a second bundle (or a re-import into a file that kept its fonts) can never duplicate them.
                const restoreFonts = f.bundle && !hasFontAttachment && !fontsRestored;
                if (f.bundle) {
                    inputSide += ` -i "${path.join(workLibDir(), f.rel)}"`;
                    extraMaps += ` -map ${k + 1}:s:0`;
                    if (restoreFonts) { extraMaps += ` -map ${k + 1}:t?`; fontsRestored = true; }
                } else {
                    inputSide += ` -sub_charenc UTF-8 -i "${path.join(workLibDir(), f.rel)}"`;
                    extraMaps += ` -map ${k + 1}:0`;
                }
                meta += ` -metadata:s:s:${outIdx} "language=${langMetaValue(f.lang)}"`;
                if (f.title) meta += ` -metadata:s:s:${outIdx} "title=${escMeta(f.title)}"`;
                // The filename stays the authority on disposition. A loose text sidecar arrives carrying none, so "no tokens" needs no argument at all;
                // a bundle's subtitle brings its own flags through the copy, so "no tokens" has to be written as an explicit 0 or a token the user
                // removed by renaming would silently come back.
                if (f.disp.length) meta += ` -disposition:s:${outIdx} ${f.disp.join('+')}`;
                else if (f.bundle) meta += ` -disposition:s:${outIdx} 0`;
                if (isMp4) meta += ` -c:s:${outIdx} mov_text`;
                // Report EVERY flag being restored, the pre-language ones included - they are the whole reason that slot exists, and a line naming only the
                // roles would say "(chi forced)" while writing forced+original, or nothing at all for a sidecar carrying visual_impaired alone.
                const flagsBack = f.dispTokens.concat(f.extraTokens || []);
                const flagText = flagsBack.length ? ` ${flagsBack.join('+')}` : '';
                const origin = f.members.find(stillEmbedded);
                if (origin) response.infoLog += `☒${streamTag(origin.index)} Importing ${f.rel} as a SECOND copy - the stream it was extracted from is still `
                    + `in the file${embeddedHashes && embeddedHashes.size ? ' and its text differs' : ''}, so both will be present\n`;
                if (f.members.length > 1) response.infoLog += `☑[deduplicate=${dedupeMode}] Deduplicated ${f.members.length} byte-identical sidecars -> ${
                    f.rel} (${f.lang}${flagText})\n`;
                response.infoLog += `☐Import ${f.rel} -> subtitle ${outIdx} (${f.lang}${flagText})${restoreFonts ? ' and its bundled font attachments' : ''}\n`;
            });
            // Consumed = every sidecar this pass accounted for, INCLUDING the ones already in the file. They are not muxed, but their content is provably
            // embedded, so listing them is what lets remove_source clear them alongside the rest once the transcode is accepted.
            const consumed = toMux.concat(alreadyInFile).flatMap((f) => f.members.map((m) => m.rel));
            // Carry prior-pass marks forward for every sidecar STILL ON DISK and still confirmed embedded, so it stays in the skip set across incremental
            // passes (otherwise the next pass re-imports it as a duplicate track). Nothing is unlinked in this stage, so such a sidecar stays listed; one
            // the post-processing pass later deletes simply stops being found, and a marker entry naming a file that no longer exists - or one the file no
            // longer carries - is harmless either way, since the entry only counts while the confirmation agrees with it.
            const priorStillPresent = found.filter(alreadyEmbedded).map((f) => f.rel);
            const markList = [...new Set([...consumed, ...priorStillPresent])];
            // The caption staging sidecar going in is what ends the caption round trip, and recording that is REQUIRED for the run to converge, not
            // a nicety: remove_source deletes the staging file once it is embedded, so without this token the next pass would find captions in the
            // bitstream and no sidecar, decode them out again, and repeat forever. Keyed on the name because by now the plan has nothing to say -
            // the sidecar's own existence was what stopped it re-extracting this pass. Removing the bitstream copy is remove_source's decision here
            // exactly as it is on extract, and for the same reason - the captions have MOVED to a subtitle track, so leaving them burned into the
            // video shows the user both at once. Same two routes: strip in this very -c copy pass where the source qualifies, otherwise record the
            // request for video_clean's next re-encode. `imported` is kept alongside `strip` rather than replaced by it, because that token is the
            // memo that stops this plugin decoding the captions out all over again; only the pair says both things at once.
            let ccStrip = '';
            if (ccName && consumed.includes(ccName)) {
                const ccAdd = [CC_TOKENS.imported];
                if (removeSource) {
                    if (ccStripAllowed()) {
                        ccStrip = ccStripArg(removedIndices);
                        response.infoLog += `☐${streamTag(ccVideo.index)}[remove_source=true] Removing the closed captions from the video bitstream\n`;
                    } else {
                        ccAdd.push(CC_TOKENS.strip);
                        response.infoLog += `☒${streamTag(ccVideo.index)}[remove_source=true] The captions cannot be removed from this video without`
                            + ' re-encoding it - recorded the request, and video_clean will carry it out on its next encode; until then a player shows'
                            + ' both copies\n';
                    }
                }
                meta += ccTagArg(...ccAdd);
            }
            // drops first, so the -map 0 they subtract from is still the whole file
            for (const idx of removedIndices) extraMaps = ` -map -0:${idx}${extraMaps}`;
            // A track a sidecar name has already retuned is left out of the fold: under method_import_metadata=sidecar the filename is the authority, and two
            // full tag sets aimed at one slot would leave the LAST one standing - the fold - discarding the retune this run just logged as applied.
            meta += retagArgs((dupes.retag || []).filter((r) => !retunedAt.has(r.index)), keptSubs);
            let out = `${inputSide} -map 0${extraMaps} -c copy${ccStrip}${meta} -metadata "awk_sub_worker=${encodeMarkerList(markList)}"`;
            commitPreset(out);
            const expected = streams.filter((s) => !removedIndices.has(s.index)).concat(toMux.map(sidecarToStream));
            response.infoLog += `☑Expected results: ${summariseAll(expected)}\n`;
            return response;
        }

        return skip(importedSet.size ? '☑Sidecars already imported; nothing to do\n' : '☑All matching subtitles already present; nothing to import\n');
    } catch (err) {
        failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
