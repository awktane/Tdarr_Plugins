/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
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
                duplicate, never a loss). It reads .srt/.ass/.ssa/.vtt sidecars; a .smi or .sub is named in the log but not imported (convert it to .srt).
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
    Version: '3.999.89',
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
                \\nimport: mux sidecar files sitting beside the video back into it. A sidecar it imported that something later removed from the file -
                clean_and_remux's language_sub or remove_sub_sdh, say - is not imported again, and stays on disk; rename it to bring it back. Matching
                only_languages to language_sub skips that one wasted import.`,
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
            tooltip: `What counts as a copy of a subtitle you already have. The TEXT decides, and it is compared ignoring the things ffmpeg rewrites on a round trip (line endings, a BOM, cue numbering), so a downloaded subtitle still matches its embedded copy - two
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
                subtitle track (over two passes where the node writes the library directly, one to read and one to mux). The read pass leaves the captions
                in a hidden sidecar beside the video, which - like any imported sidecar - only this plugin's post-processing pass deletes (see
                remove_source). Either way they arrive tagged undetermined language and flagged SDH, because
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
                \\ntrue (default) on IMPORT - delete each sidecar once its text is confirmed to be one of the embedded subtitles. A sidecar the import could
                only store in part is kept, and the log says what was dropped: a WebVTT's positioning, styling or voice tags, or an ASS/SSA - or an srt's
                font and {\\an8} overrides - going into an mp4.
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
                Extract writes directly in this mode as well, skipping the upload API. A mount that is READ-ONLY from this node still works: everything is
                read through it, while sidecars are placed through the upload API and deletion waits for the server, as if there were no mount.
                \\nExample: server library /media/Shows, mounted on this Windows node as M:\\Shows
                \\nmedia=M:
                \\ntext_file - read "<video>.subtitles.txt" beside the video: one filename per line, lines starting with # ignored. Extract seeds the list
                with what it wrote; after that it is yours to maintain, which is how a subtitle you OCR'd from an exported image sub gets imported. Each name
                must still follow the sidecar naming convention, since that is where its language, title and flags come from.
                \\nDELETING a sidecar (remove_source on import) is separate again: an unmapped node cannot delete a library file at all, since Tdarr's API
                offers upload and download but not delete. The post-processing pass does it server-side instead, which is why that stack entry is required.
                \\nOne case costs an extra pass: on an unmapped node with no mount it can write to, when every sidecar is ALREADY embedded there is nothing
                to mux - so no transcode, no acceptance, and no post-processing run in which to delete anything. remove_source then forces a lossless -c
                copy of the video purely to reach that stage. It is a full read and write to remove a few kB of text, but it is the only route and it
                happens at most ONCE per file.`,
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
// ===== END SHARED: language matching =====
// #endregion

const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')(); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
    const { spawnSync } = require('child_process'); const os = require('os');
    // eslint-disable-next-line no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    // Tdarr's classic-plugin consumer (Tdarr_Node/srcug/node/workers/transcodeSettings/settingsPlugin.js) reads only processFile, preset, container,
    // ffmpegMode, handbrakeMode, infoLog, error and reason - reQueueAfter is NOT among them, in any of the five plugins. It is plugin-creator TEMPLATE
    // residue: its one occurrence in the whole install is inside the scaffold string pluginCreatorMethods.js writes out, so setting it does nothing at all.
    // Don't re-add it. Re-running the stack until every plugin skips is the flow's own loop, not something a plugin requests - which is why this plugin's
    // confirm-and-delete second pass arrives without it.
    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        container: `.${file.container}`,
        FFmpegMode: true,
        infoLog: '',
    };
    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // #region SHARED helpers (19 sections: file-failure helpers … ffmpeg metadata escaping)
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
        // ffprobe's title, description and handler, then mediaInfo's Title less the handler's echo (mediaInfoOwnTitleParts) and its description. Every tag read
        // goes through getTagCI, as no casing is a safe guess: matroska UPPER-CASES tag keys on write (ffprobe shows HANDLER_NAME, DESCRIPTION), and MediaInfo
        // defines Comment/Description as GENERAL-only, so a per-TRACK value lands in the track's 'extra' bag under whatever spelling the container used. The
        // handler is read as the name it holds (handlerTextOf), so the length bytes a grown .mov name starts with ('HSDH ...') hide no role word. Its echo is
        // left out of the Title because MediaInfoLib can read it distorted: a .mov name as MacRoman, where 'Dubé' is 'Dub√©' and 'dub' a whole word (the next
        // pass read /dub, and clean_and_remux wrote the flag). What the Title holds then is ONE stored value - the title box on mp4 and mov, the title on
        // matroska - so it is one field, read whole: its own ' / ', and a line break MediaInfoLib renders so (mediaInfoFill), are the name's ('Hard
        // of<CR><LF>Hearing' reads /sdh, as the name does). The Title goes through mediaInfoText inside mediaInfoOwnTitleParts, which decodes the object
        // mediainfo.js gives for a value holding a control character: undecoded, a role word in it was missed, and the next pass, once a remux had moved the
        // name into the handler, read a role Expected results had not predicted.
        const fields = roleFieldsOf([getTagCI(s.tags, 'title'), getTagCI(s.tags, 'description'), handlerTextOf(getTagCI(s.tags, 'handler_name')),
            mediaInfoOwnTitleParts(s).join(' / '), mediaInfoText(getTagCI(mi?.extra, 'description'))]);
        roleFieldCache.set(s, fields);
        return fields;
    };
    // -=-=-= keywordRegex / matchesKeyword [all five] =-=-=-
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
            re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u');
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
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: read-back dispositions =====
    // -=-=-= carriesDisposition (+ readBackDispositions) [all five] =-=-=-
    // Whether an output's command writes any -disposition at all (readBackDispositions' `manual`).
    const carriesDisposition = (args) => /(^|\s)-disposition[:\s]/.test(String(args || ''));
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
        if (!mp4) return out;
        // The mov muxer writes every video stream but a cover as an ordinary track, read back with no attached_pic, still_image or timed_thumbnails flag
        // (attached_pic+default, attached_pic+timed_thumbnails - a QuickTime chapter-image track - still_image and timed_thumbnails alike, in mjpeg and png),
        // so there only an image codec still reads as cover art.
        const COVER_FLAGS = ['attached_pic', 'still_image', 'timed_thumbnails'];
        return out.map((x) => (codecTypeOf(streamOf(x)) === 'video' && !isMp4Cover(streamOf(x)) && COVER_FLAGS.some((k) => streamOf(x).disposition?.[k] === 1)
            ? flagged(x, Object.fromEntries(COVER_FLAGS.map((k) => [k, 0]))) : x));
    };
    // ===== END SHARED: read-back dispositions =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: matroska cover keep =====
    // -=-=-= matroskaCovers (+ its staging, -attach and log helpers)  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // A Matroska cover is an image attachment the demuxer reports as an attached_pic video stream (only for an image/gif, image/jpeg, image/png or image/tiff
    // mimetype - any other image is an ordinary attachment that -map 0 copies byte-identical), and a -map 0 -c copy writes it back as a one-frame video track
    // (V_MJPEG; V_MS/VFW/FOURCC for png, V_QUICKTIME for gif) that has lost attached_pic and probes at 30000/1, with -disposition attached_pic or without. Only
    // -attach writes an attachment, and it reads a FILE, so a remux these plugins make for another reason copies each cover's bytes out first, leaves the
    // stream out of its map and attaches the file again. The cover is never itself a reason to remux, and one that cannot be kept is dropped with a line, never
    // a failed file. A track an earlier plain copy made of a cover keeps the attachment's mimetype tag (see isCoverArt), so it is found too: the same remux
    // turns it back into an attachment, and copies it as the track it is when it cannot.
    const COVER_EXT_BY_CODEC = { mjpeg: 'jpg', png: 'png', gif: 'gif', tiff: 'tiff' };
    const COVER_MIME_BY_CODEC = { mjpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', tiff: 'image/tiff' };
    const matroskaCovers = (container, streams) => (isMatroskaFamily(container) ? (streams || []).filter((s) => codecTypeOf(s) === 'video'
        && (s.disposition?.attached_pic === 1 || (!!COVER_EXT_BY_CODEC[codecNameOf(s)] && /^image\//i.test(getTagCI(s.tags, 'mimetype'))))) : []);
    // This job's work directory. Tdarr hands a classic plugin a cacheFilePath inside its tdarr-workDir2-<jobId> folder (a Flow, inside a per-run
    // subfolder of it), creates the folder before any plugin runs, and deletes it recursively once no job holds the id - the server's cache cleaner every
    // 60 s, an unmapped node's own every 20 s, on the third sighting - or on a skip or reset verdict. A staged retry or review resumes the SAME folder,
    // possibly on another node, which is why every staged file is unlinked and copied out again on each pass. '' for any other path: a file left in the
    // cache root is cleaned by nobody, and one left beside the video is read by a media server.
    const coverWorkDir = (otherArgs) => {
        const dir = require('path').dirname(String(otherArgs?.cacheFilePath || '.'));
        return /(^|[\\/])tdarr-workDir2-[^\\/]+([\\/]|$)/.test(dir) ? dir : '';
    };
    // The copy-out reads as little of the file as it can, since the demuxer stops only once every used stream has refused a packet and a one-packet stream
    // never does: from the start, ffmpeg reads the whole file (1.1 GB measured). -sseof -1 re-queues every attached picture (a seek does), so an
    // attached_pic cover arrives first and about 3 MB is read - when the file has Cues; a cue-less or truncated file is read whole all the same. A track's
    // only packet sits in the first cluster, after any attachments, so a cover track, and an attached_pic cover whose seek run failed, are read through
    // ffmpeg's subfile protocol capped at COVER_BOUNDED_READ_BYTES (a cap that cuts the attachments fails the run, exit 251; 151 MB of fonts ahead of the
    // first cluster measured). An mkvpropedit-appended cover sits past any cap, which is why the seek run goes first. Each run is killed with SIGKILL:
    // ffmpeg ignores one SIGTERM once it has started, reads on to the end and exits 255. -c copy -f rawvideo writes the packet verbatim (the image2 muxer
    // rewrites a gif); -copyinkf keeps a packet not flagged key (a gif track's). Fixed names keep a classic pass that repeats its predecessor's arguments
    // visible to Tdarr's identical-arguments guard.
    const COVER_SEEK_TIMEOUT_MS = 10000;
    const COVER_BOUNDED_READ_BYTES = 268435456;
    const COVER_BOUNDED_TIMEOUT_MS = 60000;
    const copyCoversOut = (items, inputPath, otherArgs, seek) => {
        const fs = require('fs');
        const res = [];
        const go = items.filter((it) => {
            try { fs.unlinkSync(it.file); } catch (e) { if (e.code !== 'ENOENT') { res.push({ it, why: 'stage' }); return false; } }
            return true;
        });
        if (!go.length) return res;
        const input = seek ? inputPath : `subfile,,start,0,end,${COVER_BOUNDED_READ_BYTES},,:${inputPath}`;
        const args = ['-hide_banner', '-nostdin', '-v', 'error', '-y', ...(seek ? ['-sseof', '-1'] : []), '-i', input];
        for (const it of go) args.push('-map', `0:${it.s.index}`, '-c', 'copy', '-copyinkf', '-frames:v', '1', '-f', 'rawvideo', it.file);
        let r = null;
        try {
            r = require('child_process').spawnSync(ffmpegPathOf(otherArgs), args, { stdio: 'ignore', killSignal: 'SIGKILL',
                timeout: seek ? COVER_SEEK_TIMEOUT_MS : COVER_BOUNDED_TIMEOUT_MS });
        } catch (e) { /* read as a failed copy below */ }
        const timedOut = r?.error?.code === 'ETIMEDOUT';
        const detail = typeof r?.status === 'number' ? `exit ${r.status}` : String(r?.error?.code || r?.signal || 'not run');
        // Only a copy that exited 0 with a non-empty file is attached: an -attach of a missing or empty file takes the whole remux down (exit 254, 183).
        for (const it of go) {
            let size = 0;
            try { size = fs.statSync(it.file).size; } catch (e) { /* not written */ }
            if (r?.status === 0 && size > 0) res.push({ it });
            else res.push({ it, why: timedOut ? 'timeout' : 'extract', detail: timedOut ? '' : (r?.status === 0 ? 'nothing written' : detail) });
        }
        return res;
    };
    // Stages the covers of a Matroska-family remux: `kept` are attached again (matroskaCoverArgs), `dropped` and `asTrack` (a cover track that stays one)
    // carry the reason, and `leaveOut` is every input stream the map must leave out. No ownership test on the folder: on a CIFS or root-squashed NFS cache
    // every file reads as the mount's owner, and a retry may resume on another node; lstat refuses a symlink, and anyone who can write the work directory
    // can already replace the cache file Tdarr promotes. .webm stores no attachments (its muxer ignores -attach), so there no cover is attached again: an
    // attached_pic one is dropped, and a cover track is copied as the track it is.
    const stageMatroskaCovers = (container, covers, inputPath, otherArgs, streams) => {
        const path = require('path');
        const fs = require('fs');
        const res = { kept: [], dropped: [], asTrack: [], leaveOut: [] };
        const fail = (it, why, detail = '') => (it.track ? res.asTrack : res.dropped).push({ s: it.s, why, detail });
        const dir = coverWorkDir(otherArgs);
        const stageDir = dir ? `${dir}/awk_cover` : '';
        const todo = covers.map((s) => {
            const codec = codecNameOf(s);
            const ext = COVER_EXT_BY_CODEC[codec] || 'img';
            const base = `awk_cover_s${s.index}.${ext}`;
            const mime = String(getTagCI(s.tags, 'mimetype') || '');
            return { s, base, track: s.disposition?.attached_pic !== 1, file: stageDir ? `${stageDir}/${base}` : '',
                mime: /^image\/[\w.+-]+$/i.test(mime) ? mime : (COVER_MIME_BY_CODEC[codec] || 'image/jpeg'),
                name: String(getTagCI(s.tags, 'filename') || '') || `cover.${ext}`, title: String(getTagCI(s.tags, 'title') || '') };
        }).filter((it) => {
            const why = String(container).toLowerCase() === 'webm' ? 'webm' : (!dir ? 'nowork' : (!pathIsPresetSafe(it.file) ? 'unsafe'
                : ((streams || []).some((x) => x !== it.s && String(getTagCI(x.tags, 'filename')).toLowerCase() === it.base) ? 'name' : '')));
            if (why) fail(it, why, why === 'nowork' ? logSafe(otherArgs?.cacheFilePath ? path.dirname(String(otherArgs.cacheFilePath)) : 'none') : '');
            return !why;
        });
        if (todo.length) {
            try { fs.mkdirSync(stageDir); } catch (e) { /* EEXIST from an earlier pass of this job; anything else fails the lstat */ }
            let usable = false;
            try { usable = fs.lstatSync(stageDir).isDirectory(); } catch (e) { /* missing */ }
            if (!usable) todo.forEach((it) => fail(it, 'stage'));
            else {
                const seekRun = copyCoversOut(todo.filter((it) => !it.track), inputPath, otherArgs, true);
                const retry = seekRun.filter((r) => r.why && r.why !== 'stage').map((r) => r.it);
                const boundedRun = copyCoversOut([...todo.filter((it) => it.track), ...retry], inputPath, otherArgs, false);
                for (const r of [...seekRun.filter((x) => !x.why || x.why === 'stage'), ...boundedRun]) {
                    if (r.why) fail(r.it, r.why, r.detail);
                    else res.kept.push(r.it);
                }
            }
        }
        res.kept.sort((a, b) => a.s.index - b.s.index);
        res.leaveOut = [...res.kept.map((it) => it.s), ...res.dropped.map((d) => d.s)];
        return res;
    };
    // The output-side arguments that attach the kept covers again. Each is addressed by the name -attach gives it - the text after the last '/' of its
    // path on every platform (ffmpeg_mux_init.c), which is why the staged path is joined with '/' and passed verbatim (a backslash is a filename character
    // on POSIX) - so no count of the attachments mapped ahead of it can be off: a wrong t:N index tags a FONT and leaves the cover without a mimetype
    // (measured, exit 234). The m: value is read up to the next ':' with quotes and backslashes as escapes and compared exactly (fftools/cmdutils.c
    // stream_specifier_parse/match), so the staged base must never hold one - why it is awk_cover_s<index>.<ext>, not the cover's own name. The writes
    // apply in order, and every filename write comes last: one made first renames the stream before its mimetype write can find it.
    const matroskaCoverArgs = (kept) => {
        const at = (it) => ` -metadata:s:m:filename:${it.base}`;
        return kept.map((it) => ` -attach "${it.file}"`).join('')
            + kept.map((it) => `${at(it)} "mimetype=${escMeta(it.mime)}"${it.title ? `${at(it)} "title=${escMeta(it.title)}"` : ''}`).join('')
            + kept.map((it) => `${at(it)} "filename=${escMeta(it.name)}"`).join('');
    };
    // A kept cover as the next pass reads it back. Measured 2026-10-24 on jellyfin 7.1.4 (jpeg, png, gif and tiff; fonts before, between and after it; one
    // cover and two; mkvmerge- and mkvpropedit-written): its picture comes back byte-identical, with its filename, mimetype and description as escMeta writes
    // them (a double quote becomes ', a backslash /, <io> (io), a control character a space - the keep line names a changed one), read back as attached_pic
    // after every track and every copied attachment, in -attach order.
    const keptCoverStream = (it) => ({ ...it.s, disposition: { attached_pic: 1 },
        tags: { filename: escMeta(it.name), mimetype: escMeta(it.mime), ...(it.title ? { title: escMeta(it.title) } : {}) } });
    const COVER_LOST_WHY = {
        webm: '.webm stores no attachments',
        nowork: 'Tdarr\'s cache path is not inside a tdarr-workDir2- job folder, so there is nowhere to stage it for -attach',
        unsafe: 'the work directory\'s path holds a character a preset cannot carry',
        name: 'its staging name is already an attachment\'s in this file',
        stage: 'the work directory has no usable awk_cover folder to stage it in',
        extract: 'ffmpeg could not copy it out to attach it again',
        timeout: `copying it out was stopped after ${COVER_BOUNDED_TIMEOUT_MS / 1000} s`,
    };
    const coverShownName = (it) => (logSafe(escMeta(it.name)) === logSafe(it.name) ? logSafe(it.name)
        : `${logSafe(it.name)}, written as ${logSafe(escMeta(it.name))}`);
    const matroskaCoverLog = (staged) => staged.kept.map((it) => `☐${streamTag(it.s.index)} ${it.track ? 'Turning the cover-art track back into'
        : 'Copying out the cover art to keep it as'} an attachment (${coverShownName(it)}) - read back after every track and attachment\n`).join('')
        + [...staged.dropped.map((d) => ['Cover art dropped', d]), ...staged.asTrack.map((d) => ['The cover-art track stays a video track', d])]
            .map(([what, d]) => `☒${streamTag(d.s.index)} ${what} - ${COVER_LOST_WHY[d.why]}${d.detail ? ` (${d.detail})` : ''}\n`).join('');
    // ===== END SHARED: matroska cover keep =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4 uncopyable streams =====
    // -=-=-= mp4UncopyableStreams (+ mp4LostData, mp4UncopyableLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The data streams an mp4-family -c copy cannot carry as they are, which each remux here leaves out of its map. One is a stream ffprobe names no codec
    // for - in practice a camera's tmcd timecode track - in mp4/m4v/m4a: the mp4 muxer refuses it outright ("Could not find tag for codec none", exit 234 on
    // jellyfin 7.1.4) and takes the whole command down, so a -map 0 copy of such a file fails on every requeue. Its timecode survives where the muxer
    // rebuilds it (isMp4RebuiltTimecode). mov copies the track as-is and is left alone. The other is the chapter track, in mov too, which the muxer
    // always rebuilds from the chapters (see isMp4ChapterTrack). clean_and_remux removes every such stream the muxer would not put back, so in the designed
    // stack only a run without it meets a lost one. The log line names each stream left out and says what carries over.
    const mp4UncopyableStreams = (container, streams) => {
        const c = String(container || '').toLowerCase();
        const noCodec = (s) => ['mp4', 'm4v', 'm4a'].includes(c) && codecTypeOf(s) === 'data' && ['', 'unknown', 'none'].includes(codecNameOf(s));
        return (streams || []).filter((s) => noCodec(s) || (isMp4Family(c) && isMp4ChapterTrack(s)));
    };
    // The dropped streams whose data really leaves the output - all of them but a track the muxer rebuilds - so an Expected results line never promises one.
    // `kept` is what the output maps (see isMp4RebuiltTimecode); a tmcd carrying the timecode of a video the muxer cannot time is lost for that reason
    // (mp4OverfastFor), and one lost while the muxer still writes others is one past its one-per-video count.
    const mp4LostData = (dropped, kept) => dropped.filter((s) => !isMp4ChapterTrack(s) && !isMp4RebuiltTimecode(s, kept));
    const mp4UncopyableLog = (container, dropped, kept) => dropped.map((s) => {
        if (!mp4LostData([s], kept).length) return mp4RebuiltLine(s, container);
        const tmcd = String(s.codec_tag_string || '').toLowerCase() === 'tmcd';
        const what = tmcd ? 'tmcd timecode' : 'unidentified data';
        const fast = mp4OverfastFor(s, kept);
        const why = fast ? `the muxer cannot time one for a video ${fast.rateUpTo ? 'that can run ' : ''}above ${MP4_TMCD_MAX_FPS} fps`
            : mp4TimecodeCount(kept) ? 'the muxer rebuilds only one per video the output keeps' : 'the file has no timecode the muxer can rebuild it from';
        return `☐${streamTag(s.index)} Leaving out the ${what} track - .${String(container).toLowerCase()} cannot copy a stream with no codec`
            + `${tmcd ? `, and ${why}, so it is lost` : ''}\n`;
    }).join('');
    // ===== END SHARED: mp4 uncopyable streams =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: output muxer =====
    // -=-=-= OUTPUT_MUXER_BY_EXT (+ outputMuxerArg, noMuxerSkipLine)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // These four plugins write back into the source's own extension, and ffmpeg picks the muxer from the extension alone - which is wrong, or impossible,
    // for some extensions they accept (measured on jellyfin 7.1.4). .m4v and .m4a select the ipod muxer, which refuses HEVC, AV1, E-AC-3 and Opus, even on a
    // stream copy (exit 234); the mp4 muxer takes all of them into the same filename with identical iTunes tags and cover art, only major_brand moving to
    // isom. .tp/.trp/.tod and .divx have no muxer by extension at all but are plain MPEG-TS and AVI. A null entry has no -f that serves it: .m2p/.vro/.mod/
    // .evo (-f vob) and .dat (-f mpeg) take native DVD content but refuse a copied AAC track, so such a file is left for clean_and_remux to remux instead.
    // .m2v is the raw mpeg2video muxer, which takes only MPEG-2 video (an H.264, HEVC or AV1 write-back fails), and no muxer takes .mpv at all.
    // awk-ffmpeg-test's muxmatrix mirrors this table (guarded by selftest_mirrors) and re-measures its rows.
    const OUTPUT_MUXER_BY_EXT = {
        m4v: 'mp4', m4a: 'mp4', tp: 'mpegts', trp: 'mpegts', tod: 'mpegts', divx: 'avi', m2p: null, vro: null, mod: null, evo: null, dat: null,
        m2v: null, mpv: null,
    };
    // The output-side -f a container needs: '' where ffmpeg's own pick by extension is right, null where no muxer can write the extension back at all.
    const outputMuxerArg = (container) => {
        const c = String(container || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(OUTPUT_MUXER_BY_EXT, c)) return '';
        return OUTPUT_MUXER_BY_EXT[c] ? ` -f ${OUTPUT_MUXER_BY_EXT[c]}` : null;
    };
    const noMuxerSkipLine = (container) => `☒A .${container} file has no ffmpeg muxer that can write it back - left untouched; remux it to mkv or mp4 first`
        + ' (clean_and_remux does that)\n';
    // ===== END SHARED: output muxer =====
    // ===== SHARED [sub_worker, video_clean]: marker persistence =====
    // -=-=-= markerPersists  [sub_worker, video_clean] =-=-=-
    // Can a container carry a GLOBAL awk_* marker back out of a mux? Matroska and its siblings store an arbitrary tag natively; the mp4 family keeps one only
    // because every mux that carries one adds -movflags use_metadata_tags (mp4TagPlan). The listed set is what was MEASURED to keep one on the production
    // build; an unlisted container is assumed marker-hostile whether or not its muxer happens to preserve a tag, because that is the fail-safe direction - it
    // costs a declined pass rather than one that can never converge. Some are not fixable at all: .3gp/.3g2 discard a custom global tag WITH the flag as well
    // as without, so no marker can exist in one. Both carriers keep the SOURCE container, so the answer is the source's; clean_and_remux always writes mkv or
    // mp4, which is the way out of a hostile one. The stake is the same wherever a marker records work: a pass that cannot remember what it did does it again,
    // and where the arguments come out identical Tdarr ERRORS the file as an infinite transcode loop rather than merely repeating the cost.
    const markerPersists = (container) => isMatroskaFamily(container) || isMp4Family(container);
    // ===== END SHARED: marker persistence =====
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
        if (kept.some((s) => codecTypeOf(s) === 'audio' && codecNameOf(s) === 'truehd')) return ' -strict experimental';
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

    // #region SHARED helpers (1 section: ffmpeg path)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg path =====
    // -=-=-= ffmpegPathOf [all five] =-=-=-
    // The node's ffmpeg: Tdarr hands a classic plugin otherArguments.ffmpegPath, and the bare name - a PATH lookup - stands in when it supplied none. Every
    // ffmpeg spawn in the five plugins resolves the binary here, so a change to how it is found reaches all of them at once.
    const ffmpegPathOf = (otherArgs) => String(otherArgs?.ffmpegPath || 'ffmpeg');
    // ===== END SHARED: ffmpeg path =====
    // #endregion

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

    // STYLED subtitles render through fonts that exist only as container attachments, so extracting one to a loose text file destroys the styling
    // irrecoverably - it is exported as a Matroska BUNDLE instead, subtitle plus every font attachment. Matroska is the only container that can: mp4/mov
    // reject ass and carry no attachments, WebM allows only WebVTT, and a fonts-ONLY Matroska writes unreadable. .mks is Matroska's subtitle-only
    // extension (.mkv/.mka mux identically, but a server that scans dotfiles - Emby - would read those as a video/music track). Verified on
    // jellyfin-ffmpeg 7.1.4: language, title, disposition and the font bytes all survive the round trip. The fixed marker token before the extension is
    // what makes a bundle name unambiguous: clean_and_remux's remove_imagesubs=export writes dot-prefixed .mks IMAGE-subtitle sidecars in the same name
    // shape, and importing one of those as a bundle would silently re-add the image subtitle that pass had just removed. clean_and_remux writes the token
    // on its OWN styled bundles, so those DO come back through the import as bundles - the whole point of exporting them in that form.
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

    // #region SHARED helpers (6 sections: preset path safety … language display name)
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
            { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, maxBuffer: SIDECAR_SPAWN_MAX_OUTPUT_BYTES });
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
    // write_header leaves a header with no cluster ("End of file"), both measured on 7.1.4 - or { state: 'unknown' } when it could not be judged (no temp
    // dir, a spawn error or timeout, a read-out over the cap), where every caller keeps the answer it had before it could look.
    const readBundleSubtitle = (p) => {
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'awk_subbundle_')); } catch (e) { return { state: 'unknown' }; }
        const out = path.join(dir, 'b.ass');
        let res = { state: 'unknown' };
        try {
            const { spawnSync } = require('child_process');
            const r = spawnSync(ffmpegPathOf(otherArguments), ['-hide_banner', '-y', '-loglevel', 'info', '-i', p, '-map', '0:s:0', '-c:s', 'ass',
                '-fs', String(SIDECAR_HASH_MAX + 1), out], { encoding: 'utf8', timeout: SIDECAR_SPAWN_TIMEOUT_MS, maxBuffer: SIDECAR_SPAWN_MAX_OUTPUT_BYTES });
            if (!r.error && r.status !== 0) res = { state: 'unreadable' };
            else if (!r.error && fs.statSync(out).size <= SIDECAR_HASH_MAX) {
                res = { state: 'ok', buf: fs.readFileSync(out),
                    fonts: String(r.stderr || '').split('\n').filter((l) => l.trimStart().startsWith('Stream #') && l.includes(': Attachment:')).length };
            }
        } catch (e) { /* not judged - the caller keeps its old answer */ }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return res;
    };
    // ===== END SHARED: subtitle cue span =====

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

    // #region SHARED helpers (1 section: mov language remap)
    // ===== SHARED [audio_clean, sub_worker]: mov language remap =====
    // -=-=-= to6392T  [audio_clean, sub_worker] =-=-=-
    // Fold a language token to a lowercase 3-letter ISO 639-2/T code: langKey folds spelled names and 639-2/B onto the 2-letter key, which ISO639_1_TO_2 maps
    // to /T; an already-3-letter code (eng, fil, und) or an unmappable token is left as-is. Used where a 3-letter code is required - sub_worker's mp4-family
    // sidecar import (mdhd stores only /T) and the mov remap below - and it is the fold MOV_LANG expects. Mirrors clean_and_remux's toCanonicalTag
    // threeLetter(false).
    const to6392T = (lang) => { const key = langKey(lang); if (!key || key.length !== 2) return lang; return ISO639_1_TO_2[key] || lang; };
    // -=-=-= MOV_LANG (+ movLangCode)  [audio_clean, sub_worker] =-=-=-
    // mov is the exception to writing a language into the output container (mp4 stores only lowercase 3-letter /T, mkv keeps the raw spelling). The QuickTime
    // muxer does not store the letters: mov_write_mdhd_tag looks the code up in ffmpeg's legacy Macintosh language table and writes 0x7fff ("unspecified") on
    // a miss, which the demuxer then excludes - so the track reads back with NO language at all, exit 0 and no warning from either side. That table predates
    // ISO 639-2/T and spells 15 of the 20 dual-spelling languages the /B way, so to6392T's /T output is precisely the spelling mov throws away (measured on
    // jellyfin-ffmpeg 7.1.4: nld/deu/zho land 0x7fff, dut/ger/chi land a real code; 106 of the 184 codes to6392T can emit are dropped). ces/ron/slk/fra are
    // deliberately ABSENT - QuickTime spells those four the /T way and remapping them would break what works - and mri is absent because the table has no
    // Maori under any code. Anyone extending this must re-measure against the muxer: the table is a MIXTURE of /T and /B, so the ISO 639-2/B list is not a
    // safe source. mp4/m4v/m4a pack the letters directly and keep either spelling, which is why this is mov-only. movLangCode folds to /T then remaps:
    // audio_clean on an audio language write, sub_worker on a subtitle language write. Null-prototype so a container tag spelling an Object.prototype member
    // ('constructor', '__proto__') misses the table and falls through to the pass-through instead of resolving an inherited function.
    const MOV_LANG = Object.assign(Object.create(null), { sqi: 'alb', hye: 'arm', eus: 'baq', bod: 'tib', mya: 'bur', zho: 'chi', nld: 'dut', kat: 'geo',
        deu: 'ger', ell: 'gre', isl: 'ice', mkd: 'mac', msa: 'may', fas: 'per', cym: 'wel' });
    const movLangCode = (lang) => { const t = to6392T(lang); return MOV_LANG[t] || t; };
    // ===== END SHARED: mov language remap =====
    // #endregion

    // #region SHARED helpers (4 sections: track title … sidecar name tokens)
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
    // /handler$/. All but /@gpac/ are ANCHORED: a name may hold the word ('Dog Handler Commentary'), and one read as boilerplate is erased.
    const GENERIC_HANDLER_RES = [/handler$/i, /^(sound|video|metad)handle$/i, /^core media /i, /@gpac/i, /^iso ?media file produced by /i,
        /^(gestionnaire|gestor|procedura|module) d/i, /^gopro (avc|aac|tcd|met|sos|h\.?265|hevc)$/i];
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
    // -=-=-= mediaInfoText / edgeless / mediaInfoOwnTitleParts / trackNameBesideTitleTag / titleTagFate  [all five] =-=-=-
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
        const titleKey = Object.keys(s?.tags || {}).find((k) => k.toLowerCase() === 'title');
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
            if (echo) parts = partsOf(at(echo) > 0 ? joined.slice(echo.length + 3) : joined.slice(0, -echo.length - 3));
        }
        // A matroska per-track TITLE SimpleTag is a second title: ffprobe shows it alone, as 'TITLE' (the demuxer's dictionary replaces the track Name's
        // 'title' with it), and MediaInfoLib puts it after the Name as the Title's last part - or the HANDLER_NAME there instead, whichever of the two
        // SimpleTags comes last, since File_Mk.cpp stores both as one 'Title' key. So it is removed from the end as the echo is, leaving the Name ffprobe lost
        // (measured: 'New Audio / Description of scenes' read as one name gave /description, and audio_clean deleted the track). Readers find it through
        // getTagCI.
        if (mkv && titleKey && titleKey !== 'title') {
            const joined = parts.join(' / ');
            const tag = partsOf(mediaInfoFill(s.tags[titleKey])).join(' / ');
            if (tag && joined.endsWith(` / ${tag}`)) parts = partsOf(joined.slice(0, -tag.length - 3));
        }
        return edgeless(parts);
    };
    // A matroska track's one name where a per-track TITLE SimpleTag sits beside its Name, else '': ffprobe shows only the tag, as 'TITLE', and the Name is what
    // is left of mediaInfo's Title (mediaInfoOwnTitleParts) when it is not the tag itself. A remux keeps one title, written as the Name, so that name keeps
    // both values' roles (rolesNamed): the Name alone when the tag gives none the Name lacks, since players and media servers show the Name; else the two
    // joined as mediaInfo joins them, 'Name / TITLE', or else 'TITLE / Name', whichever reads exactly their roles together - a keyword can form across the
    // join ('Main Audio / Description Commentary' reads 'audio description'); else the Name, the roles only the tag gives lost (titleTagFate). Measured:
    // read as the tag, 'Director Commentary' beside 'German' was written over with 'German'; read as the Name alone, 'English' beside 'Director Commentary'
    // made the commentary the default audio.
    const trackNameBesideTitleTag = (s) => {
        const key = Object.keys(s?.tags || {}).find((k) => k.toLowerCase() === 'title');
        if (!isMatroskaFamily(readContainer) || !key || key === 'title') return '';
        const name = mediaInfoOwnTitleParts(s).join(' / ').trim();
        const tag = partsOf(mediaInfoFill(s.tags[key])).join(' / ');
        if (!name || name === tag) return '';
        const roles = (t) => rolesNamed(t, codecTypeOf(s)).sort().join();
        const both = [...new Set([...rolesNamed(name, codecTypeOf(s)), ...rolesNamed(tag, codecTypeOf(s))])].sort().join();
        return roles(name) === both ? name : [`${name} / ${tag}`, `${tag} / ${name}`].find((t) => roles(t) === both) || name;
    };
    // What that name leaves of the TITLE SimpleTag, for the line that writes it: whether the tag's text is joined into it, and the roles only the tag gives
    // that it lacks (their dispositionTypes tags), lost with the tag's text - none where no Name sits beside such a tag.
    const titleTagFate = (s) => {
        const named = trackNameBesideTitleTag(s);
        if (!named) return { joined: false, lost: [] };
        const tag = partsOf(mediaInfoFill(getTagCI(s?.tags, 'title'))).join(' / ');
        const lost = rolesNamed(tag, codecTypeOf(s)).filter((k) => !rolesNamed(named, codecTypeOf(s)).includes(k));
        return { joined: named !== mediaInfoOwnTitleParts(s).join(' / ').trim(), lost: [...new Set(lost.map((k) => dispositionTypes[k].tag || k))] };
    };
    // -=-=-= titleOutsideHandler / titleBesideHandler / mediaTitleFor  [all five] =-=-=-
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
    // A stream's title: ffprobe's title tag, else mediaInfo's Title outside the handler's echo (titleBesideHandler - on mp4 the udta/name box, which ffprobe
    // never surfaces), else a NAMED handler (isGenericHandler). A real title outranks the handler, so a GPAC release name in the handler never displaces
    // "Main Feature"; the handler is the title only when nothing else names the track. On matroska ffmpeg keeps an mp4 handler only as a HANDLER_NAME tag
    // (mediaInfo shows it as the Title, mkvmerge as no track name), so this makes an mp4 -> mkv remux carry the name as a real title.
    const mediaTitleFor = (s) => {
        const beside = titleBesideHandler(s);
        if (beside) return beside;
        const name = handlerTextOf(getTagCI(s?.tags, 'handler_name'));
        return isGenericHandler(name) ? '' : name;
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
        const untrail = (x) => x.replace(/[\s\-–—/:,;.]+$/, '');
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
        const named = quotedName(trackNameBesideTitleTag(s)); const tag = `the TITLE tag "${logShown(getTagCI(s.tags, 'title'))}"`;
        if (joined) return `☐${streamTag(s.index)} Writing ${named} as the title - the track name joined with ${tag} beside it, since ffmpeg keeps`
            + ' one title\n';
        return `☒${streamTag(s.index)} Writing the track name ${named} as the title, so ${tag} beside it is dropped`
            + `${lost.length ? ` with its ${lost.join(' and ')} role${lost.length > 1 ? 's' : ''} - no join of the two reads both their roles`
                : ' - ffmpeg keeps one title, and players show the name'}\n`;
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
        // On a matroska output, a track named beside a TITLE SimpleTag (trackNameBesideTitleTag): ffmpeg reads the tag in the Name's place and writes it as the
        // Name on every remux, and keeps no TITLE tag beside a Name - so the track's one name is restated, and titleTagLine says what it leaves of the tag.
        const named = isMatroskaFamily(container) ? trackNameBesideTitleTag(s) : '';
        if (named) {
            return { s, title: named, move: null, said: escMeta(named), fate: 'tag', why: '', cut: false,
                args: ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(named)}"` };
        }
        if (!isMp4Family(container)) return null;
        const title = mediaTitleFor(s);
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
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: track title carry =====
    // -=-=-= readBackFieldsOf  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // roleFieldsLower's fields for s as the next pass reads them once a remux leaves `handler` in its handler and `title` ('' for none) as its title: a
    // stand-in's readBackRoleFields, built by the same roleFieldsOf, so its Expected results line and the next pass's Input agree. On an mp4-family output
    // ffprobe shows the handler and mediaInfo the title box after the handler's echo, which roleFieldsLower leaves out, so the box is one field of its own,
    // read whole (a ' / ' or line break in it is the name's); on matroska the title is ffprobe's own field. s's two descriptions are kept.
    const readBackFieldsOf = (s, handler, title, container) => roleFieldsOf([nameTextOf(handler), title, getTagCI(s?.tags, 'description'),
        mediaInfoText(getTagCI(mediaInfoFor(s)?.extra, 'description'))]);
    // -=-=-= mp4NameCarries / mp4NameCarryArgs / keptWhy / mp4NameCarryLog / mp4NameCarryView  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The name carry (mp4NameCarry) over a whole output, for a plugin that remuxes for its own reasons (clean_and_remux runs it per stream). `kept` is the
    // output in order (the list mp4TimecodeArgs reads), and `skip` holds the source indices whose title this run writes itself, so no stream gets two.
    const mp4NameCarries = (container, kept, skip) => {
        const n = { v: 0, a: 0, s: 0 };
        return kept.map((s) => {
            const t = { video: 'v', audio: 'a', subtitle: 's' }[codecTypeOf(s)];
            if (!t) return null;
            const idx = n[t]++;
            return skip.has(s.index) ? null : mp4NameCarry(s, t, idx, container);
        }).filter(Boolean);
    };
    const mp4NameCarryArgs = (container, kept, skip = new Set()) => mp4NameCarries(container, kept, skip).map((c) => c.args).join('');
    // Why the handler beside a name the carry restates or drops stays (mp4NameCarry's why), as the line about that name says it.
    const keptWhy = (c) => {
        const h = handlerTextOf(getTagCI(c.s.tags, 'handler_name'));
        const why = { role: 'for a role the name does not give', boilerplate: '- a name that reads as boilerplate is not moved into it' }[c.why];
        const name = [nameTextOf(c.title), escMeta(nameTextOf(c.title))].includes(h);
        return `keeps ${quotedName(h)} ${why || `- it already holds ${name ? 'the name' : 'its cut'}`}`;
    };
    const mp4NameCarryLog = (container, kept, skip = new Set()) => mp4NameCarries(container, kept, skip).filter((c) => c.move !== null || c.fate)
        .map((c) => (c.fate === 'tag' ? titleTagLine(c.s)
            : c.fate ? `${c.fate === 'lost' ? '☒' : '☐'}${streamTag(c.s.index)} ${c.fate === 'lost' ? 'Dropping' : 'Writing'} the track name `
            + `${c.fate === 'lost' ? `"${logShown(c.title)}" - mov takes a non-ASCII name only in the handler` : `${quotedName(c.title)} into the title box`}`
            + `, and the handler ${keptWhy(c)}\n`
            : c.move ? `☐${streamTag(c.s.index)} Writing the track name ${quotedName(c.move)} into handler_name`
            + `${c.cut ? ' (cut to the 127 bytes mov holds)' : ''} - the only place an mp4 or mov remux keeps it\n`
            : `☐${streamTag(c.s.index)} Writing the muxer's default into handler_name - mov keeps no handler over 127 bytes, and no cut of this one reads`
            + ' as a track name\n')).join('');
    // Each carried stream as the next pass reads it back, for the carrier's Expected results line (fields by readBackFieldsOf): a moved track as the handler it
    // gets and the title restated beside it, if any (a name with no title box beside it as the form the handler holds - escMeta's, or a mov name's 127-byte
    // cut, which keeps its role words); a kept handler beside a title box the carry rewrites (fate) as that handler and the escMeta form restated, or the
    // handler alone where the name is lost; an untouched handler beside a title restated as it is, as it was. Its title is the box's name, else the handler's -
    // none for a kept handler that reads as boilerplate, which names nothing (measured: a lost non-ASCII .mov name beside 'SubtitleHandler' spelled the sidecar
    // 'g.s2.SubtitleHandler.eng.srt'); a matroska track beside a TITLE SimpleTag as its one name (trackNameBesideTitleTag). Keyed by source index, so it
    // still finds a stream readBackDispositions has copied.
    const mp4NameCarryView = (container, kept, skip = new Set()) => {
        const moved = new Map(mp4NameCarries(container, kept, skip).filter((c) => c.move !== null || c.fate).map((c) => [c.s.index, c]));
        return (s) => {
            const c = moved.get(s.index);
            if (!c) return s;
            const handler = c.move === null ? String(getTagCI(s.tags, 'handler_name') || '') : escMeta(c.move);
            const name = c.move === null ? handlerTextOf(handler) : handler;
            return { ...s, tags: { ...(s.tags || {}), title: c.said || (isGenericHandler(name) ? '' : name), handler_name: handler },
                readBackRoleFields: readBackFieldsOf(s, name, c.said, container) };
        };
    };
    // ===== END SHARED: track title carry =====
    // ===== SHARED [audio_clean, sub_worker]: track title write =====
    // -=-=-= titleMetaArgs  [audio_clean, sub_worker] =-=-=-
    // The args for a title this plugin writes (as nameTextOf has it), and on an mp4-family output the same text as handler_name (handlerNameFor), the one place
    // an mp4 remux keeps it - or `handler`, the one handlerFor leaves (null: none written, the track keeps its own). The title box gets the title where
    // titleBoxTakes allows, else the handler written beside it when the box takes that: on .mov a non-ASCII title lives in the handler alone, and a cut of it
    // that is ASCII in both boxes, as the name carry leaves it.
    const titleMetaArgs = (typeLetter, idx, title, container, handler = handlerNameFor(title, container)) => {
        const boxed = titleBoxTakes(title, container) ? nameTextOf(title) : (handler && titleBoxTakes(handler, container) ? handler : null);
        return (boxed === null ? '' : ` -metadata:s:${typeLetter}:${idx} "title=${escMeta(boxed)}"`)
            + (isMp4Family(container) && handler !== null ? ` -metadata:s:${typeLetter}:${idx} "handler_name=${escMeta(handler)}"` : '');
    };
    // -=-=-= titleReadBack  [audio_clean, sub_worker] =-=-=-
    // Stream s, its tags holding a title this run writes and the handler_name beside it, as an Expected results line shows the next pass reading it. A title
    // the box refuses (titleBoxTakes: a non-ASCII .mov name) is not in the file, so the track's name is its handler - over 127 bytes, the cut handlerNameFor
    // makes, which keeps its role words - and its role fields are that name's, in the handler and, where the box takes it, the box (readBackFieldsOf, as
    // titleMetaArgs writes it). Any other title reads back as written.
    const titleReadBack = (s, container) => {
        if (titleBoxTakes(s.tags?.title, container)) return s;
        const name = nameTextOf(getTagCI(s.tags, 'handler_name'));
        const boxed = titleBoxTakes(name, container) ? name : '';
        return { ...s, tags: { ...s.tags, title: name }, readBackRoleFields: readBackFieldsOf(s, name, boxed, container) };
    };
    // ===== END SHARED: track title write =====
    // ===== SHARED [clean_and_remux, sub_worker]: sidecar name tokens =====
    // -=-=-= DISPOSITIONS / DISP_ALIAS / DISP_IGNORE / DISP_TOKENS / DISP_AMBIGUOUS_LANG  [clean_and_remux, sub_worker] =-=-=-
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
    // Whether s's handler_name (read as the name it holds, handlerTextOf) names d's role and `title`, the title the sidecar carries, does not: sub_worker's
    // sidecar title, a name in whichever box it sits, and by default - for clean_and_remux's .mks export, which spells no title - the title other than the
    // handler (titleBesideHandler) that the .mks carries. A sidecar keeps no handler, so a role only the handler names gets its token, or it is gone after
    // import (measured: an mp4 handler 'SDH' and an mkv HANDLER_NAME 'Forced' both came back as plain tracks). Judged against the carried title, the spelling
    // does not depend on which box or container holds the name: 'English (SDH)' in an mp4 handler and the same mkv title both give
    // '<video>.s2.English (SDH).eng.srt' (measured: judged against the title beside the handler, the mp4 one got '.sdh' too, and a container conversion then
    // made the next extract write a second sidecar).
    const handlerOnlyDisp = (d, s, title = titleBesideHandler(s)) => {
        const handler = handlerTextOf(getTagCI(s.tags, 'handler_name')).toLowerCase();
        const keywords = dispositionTypes[d.ff]?.keywords || [];
        return !!handler && matchesKeyword(handler, keywords) && !matchesKeyword(String(title || '').toLowerCase(), keywords);
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

    // ====== SUBTITLE SIDECAR HELPERS ======
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
        // The decodable-to-text formats a sidecar is the only way out for (the shared decodable text subtitle vocabulary). eia_608 alone takes its own
        // encoder; the legacy family carries no overrides, so it takes srt like the canonical rows above. Listed AFTER them so EXT_TO_CODEC still resolves
        // .srt back to subrip.
        ...Object.fromEntries(CC_STREAM_SUBS.map((c) => [c, { ext: 'srt', enc: CC_STREAM_ENCODER }])),
        ...Object.fromEntries(LEGACY_TEXT_SUBS.map((c) => [c, { ext: 'srt', enc: 'srt' }])),
    };
    const isTextSub = (s) => Object.prototype.hasOwnProperty.call(TEXT_SUB, codecNameOf(s));
    // Both directions of the table above, derived from it so a new codec row is ONE edit: the loose-text sidecar extensions extract writes (parseSidecar
    // accepts these plus IMPORT_ONLY_EXTS; a bundle is admitted by STYLED_BUNDLE.ext instead, so 'mks' must never be a TEXT_SUB ext - extract would write
    // one no import could read back), and the reverse ext -> codec name for a sidecar not muxed in yet. Several codecs share an ext, so the reverse keeps
    // the FIRST row declaring it - the canonical spelling ffprobe reports back for a sidecar that row's encoder wrote (subrip for .srt, ass for .ass, webvtt
    // for .vtt). Keep the canonical codec first.
    const TEXT_EXTS = [...new Set(Object.values(TEXT_SUB).map((t) => t.ext))];
    const EXT_TO_CODEC = Object.fromEntries(TEXT_EXTS.map((ext) => [ext, Object.keys(TEXT_SUB).find((c) => TEXT_SUB[c].ext === ext)]));
    // Sidecar extensions import READS beyond the ones extract writes, each mapped to the extension its codec is written as - parseSidecar reports it under
    // that, so everything downstream treats an .ssa exactly as an .ass. The ass demuxer reads an .ssa as codec 'ass' and it copies into the file unchanged:
    // measured on 7.1.4, extracting it back gives the sidecar's own text, so the content identity the skip and the cleanup decide on holds. A SAMI .smi is
    // deliberately NOT here: Matroska cannot store sami (a copy exits 178), so it would import only as a lossy conversion whose text never matches the
    // sidecar again - and remove_source would then delete the only original. It is named instead (see NAMED_ONLY_EXTS).
    const IMPORT_ONLY_EXTS = { ssa: 'ass' };
    const IMPORT_EXTS = [...TEXT_EXTS, ...Object.keys(IMPORT_ONLY_EXTS)];
    // Subtitle extensions import never reads but does NAME when one is left beside the video, so a skipped file is not mistaken for an empty folder: .smi
    // (above), and .sub - MicroDVD text and the image half of a VobSub .sub+.idx pair share it, and only the text one could ever be read.
    const NAMED_ONLY_EXTS = ['smi', 'sub'];

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
    // A marker entry is a sidecar path, then ':' and the first MARKER_SHA_LEN hex of the sha1 of the text it was imported with - ':' never occurs inside an
    // encoded path, since MARKER_SAFE escapes it. The hash is what tells a sidecar REMOVED from the file since its import from one EDITED since
    // (goneSinceImport); an entry without one proves nothing about content and is read as the bare path it is.
    const MARKER_SHA_LEN = 12;
    const MARKER_SHA_RE = new RegExp(`^[0-9a-f]{${MARKER_SHA_LEN}}$`);
    const encodeMarkerEntries = (entries) => entries.map((e) => encodeMarker(e.rel) + (e.sha ? `:${e.sha.slice(0, MARKER_SHA_LEN)}` : '')).join(',');
    const decodeMarkerEntries = (v) => String(v || '').split(',').filter(Boolean).map((x) => {
        const [p, sha] = x.split(':');
        return { rel: pctDecode(p), sha: MARKER_SHA_RE.test(sha || '') ? sha : null };
    });
    const decodeMarkerList = (v) => decodeMarkerEntries(v).map((e) => e.rel);
    // The global tag that lists the sidecars an import muxed in - named once, because a read and a write that drift apart fail silently: the import never
    // recognises its own work again and re-muxes every sidecar on every pass.
    const SUB_MARKER_TAG = 'awk_sub_worker';

    // Recognise a filename token as a real language, so a server-native sidecar can be anchored on it without mis-reading an arbitrary token. The test is
    // purely "does ICU name this string" - it says nothing about our own sidecar-name vocabulary, so a caller that needs that (parseSidecar's disposition
    // strip, where ICU names 'sdh' as Southern Kurdish) must test DISP_TOKENS/EXTRA_TOKENS itself. und and mis have no ICU name and are rejected, which is
    // what stops '<video>.und.hi.srt' reading as an SDH flag on an undetermined track instead of Hindi; mul and zxx DO have names and are accepted on
    // purpose - a container can legitimately hold either. NOT interchangeable with the shared knownLangToken, which takes an ALREADY-FOLDED key (so it
    // answers false for a spelled-out 'English', which the Emby paren split and the server-native anchor both depend on here) and accepts und/mis and
    // qaa-qtz because a language INPUT must be able to name them.
    const isRealLanguageToken = (token) => { const k = langKey(token); if (!k) return false; return !!langDisplayName(k); };

    // Plex/Jellyfin/Emby all accept a spelled-out language NAME in a sidecar name (Movie.English.srt), which isRealLanguageToken recognises - but the name
    // itself is not a valid container language tag, so writing it through would stamp "language=English" into the mkv. Fold any non-code token to its code; a
    // token already shaped like a code keeps its region subtag (pt-BR), which is the whole point of keeping the raw token on mkv.
    const LANG_CODE_SHAPE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
    // A region-bearing token is CASED to canonical rather than written as it arrived. Our own extract can only produce a lowercase one - sidecarLangToken
    // lowercases and strips to [a-z0-9-] - while clean_and_remux's tag_language judges a region tag clean only at canonicalRegionTag's fixed point, so
    // writing 'pt-br' costs one whole extra remux per import purely to re-case it to 'pt-BR', and the extract/reimport round trip is not case-identity.
    // Emitting the form that canonicaliser converges on is the same fixed-point rule canonicalAudioTitle follows between audio_clean and clean_and_remux.
    // Guarded by isRealLanguageToken because getCanonicalLocales happily cases a structurally-valid nonsense tag (xx-YY), and wrapped because it throws on
    // malformed input. A BARE code must never reach the result - getCanonicalLocales('eng') is 'en', which would rewrite the language of every ordinary
    // sidecar - and it is held out twice on purpose: the subtag test returns before Intl is called at all (the common path, so no sidecar pays for an Intl
    // call it cannot use), and the result is taken only while it still carries a subtag. Either alone would do; keep both, and do not collapse them into one.
    const canonSidecarRegion = (lang) => {
        if (!lang.includes('-') || !isRealLanguageToken(lang)) return lang;
        try { const c = Intl.getCanonicalLocales(lang)[0] || ''; return c.includes('-') ? c : lang; } catch (e) { return lang; }
    };
    const normSidecarLang = (lang) => (LANG_CODE_SHAPE.test(String(lang)) ? canonSidecarRegion(String(lang)) : to6392T(lang));

    // The ffmpeg -disposition name a filename token restores on import. Import-only, so it stays out of the shared 'sidecar name tokens' section.
    const dispFfOf = (token) => (DISPOSITIONS.concat(EXTRA_DISPOSITIONS).find((d) => d.token === token) || {}).ff;

    // A title parseSidecar would read as something else. TITLE_SAFE passes letters and '_' straight through, so a title that IS a role or extra token
    // ('forced', 'original') encodes to that exact word and parseSidecar's token strip eats it - losing the title and inventing a flag; and beside a
    // DISP_AMBIGUOUS_LANG language slot, a title that NAMES a language ('English' ahead of 'hi') is the language-then-disposition shape the strip acts on, read
    // as the language plus an SDH flag. Such a title is written with its first character escaped (sidecarBasename), two bytes more.
    const titleIsToken = (t, lang) => DISP_TOKENS.has(t) || EXTRA_TOKENS.has(t) || (DISP_AMBIGUOUS_LANG.has(lang) && isRealLanguageToken(t));
    // Whether a title gives d's role, read as written and as NFC, as the cut reads it (cutName's rolesOf): a keyword stored decomposed reads only as NFC, and
    // read as written alone its role was not seen as cut away, so no token kept it (measured: 'Sous-titres forc' + 'e' + U+0301 + 's' lost /forced).
    const titleGives = (t, d) => [String(t || ''), String(t || '').normalize('NFC')]
        .some((x) => matchesKeyword(x.toLowerCase(), dispositionTypes[d.ff]?.keywords || []));
    // Keeps the sidecar basename under the filesystem's 255-byte cap. A title whose encoding pushes it over is cut by cutName (track title), the role-keeping
    // cut a .mov handler takes, measured in the bytes its percent-encoding spends in the filename (measured: a cut at the last character that fitted dropped a
    // role only the name gave, and the import brought the track back without it). It is a title's cut, so titleIsToken takes the place of cutName's boilerplate
    // test: a title that reads as a tool's boilerplate ('... the Dog Handler') is cut like any other, never to nothing (measured: the track lost its name and
    // gained a flag), and a cut that would be a bare token ('English ... commentary' cut to 'commentary', which the import read as a flag) keeps one more word
    // - or, where every cut clear of a token loses a role or is nothing, is the token escaped, its two bytes counted. Returns { enc, cut, budget }: the
    // encoded cut, the cut whose roles sidecarBasename checks, and the bytes the title had. titleTruncated flags a lossy cut, and each cut is made once a run
    // (sidecarTitleCuts). headTrim spells the previous sub_worker's cut - whole characters off the end of at most 255 - for earlierSidecarNames; lang is the
    // language slot beside the title.
    let titleTruncated = false;
    const sidecarTitleCuts = new Map();
    const encodeTitleCapped = (rawTitle, fixedLen, headTrim = false, lang = '') => {
        const raw = String(rawTitle);
        const enc = encodeTitle(raw);
        const token = (x) => !headTrim && titleIsToken(x, lang);
        const size = (x) => Buffer.byteLength(encodeTitle(x), 'utf8') + (token(x) ? 2 : 0);
        const budget = NAME_BYTE_CAP - fixedLen - (fixedLen ? 1 : 0);
        if ((headTrim ? Buffer.byteLength(enc, 'utf8') : size(raw)) <= budget) return { enc, cut: raw, budget };
        titleTruncated = true;
        if (headTrim) {
            let r = raw.slice(0, NAME_BYTE_CAP);
            let e = encodeTitle(r);
            while (r.length > 0 && Buffer.byteLength(`${e}${'.'.repeat(fixedLen ? 1 : 0)}`, 'utf8') + fixedLen > NAME_BYTE_CAP) {
                r = r.slice(0, -1); e = encodeTitle(r);
            }
            return { enc: e, cut: r, budget };
        }
        const key = `${budget}\n${DISP_AMBIGUOUS_LANG.has(lang) ? 1 : 0}\n${raw}`;
        if (!sidecarTitleCuts.has(key)) {
            const loses = (x) => DISPOSITIONS.some((d) => titleGives(raw, d) && !titleGives(x, d));
            const cut = cutName(raw, budget, size, token);
            // The plain cut, a token in it escaped, where the cut clear of a token loses a role or is nothing: a role-less title whose every fitting cut is a
            // token kept no name at all (measured: 'original sin of man' in 10 bytes gave no title, where '%6Friginal' fits).
            const bare = loses(cut) || !cut ? cutName(raw, budget, size, () => false) : '';
            sidecarTitleCuts.set(key, bare && (!cut || !loses(bare)) ? bare : cut);
        }
        const cut = sidecarTitleCuts.get(key);
        return { enc: encodeTitle(cut), cut, budget };
    };

    // The sidecar-name extension, and the basename of a library-relative path. Both are read by parseSidecar and again by the unparseable-name
    // warning in the import scan, which must agree with it exactly: a name the warning classifies differently from the parser is either a silent
    // skip or a false complaint. Every rel is built with '/' (scanSidecarDirs joins with it, readSubtitleList folds a typed '\' to it), so the platform's
    // own basename is exact: on Linux and macOS a '\' is an ordinary filename character that extract keeps ('AC\DC Live.s2.eng.srt'), and folding it
    // there cut the name at the backslash, so import never recognised its own sidecar. path.win32 splits on both, so Windows reads the same.
    const SIDECAR_EXT_RE = /\.([A-Za-z0-9]+)$/;
    const relBasename = (rel) => path.basename(rel);

    // For the name extract uses (logged): the role tokens the last sidecarBasename wrote for roles its title's cut could not keep, the roles that lost even
    // the token, and the bytes the title had before any token took its share.
    let cutRoleTokens = []; let cutRolesLost = []; let cutBudget = 0;
    // sidecarBasename <-> parseSidecar are exact inverses. Name = <videoBase>.s<index>[.<encTitle>][.<role...>].<lang>[.<forced|sdh>].<ext>, the two role runs
    // from sidecarNameTokens. parseSidecar ALSO accepts a server-native name with no s<index> (e.g. <videoBase>.en.forced.srt), anchored on a recognized <lang>
    // token. A styled-subtitle BUNDLE uses the same name with a leading dot and STYLED_BUNDLE.mark before its .mks extension, so media servers skip it (it is
    // an archive, not a subtitle to offer the viewer). The name stays the authority on language/title/disposition for a bundle too - the .mks also carries them
    // internally, but import re-applies the filename's values, so renaming a bundle retunes it exactly like renaming a loose sidecar.
    const sidecarBasename = (s, bundle, titleOf = sidecarTitleOf, onlyDisp, headTrim = false) => {
        // The stream's title - sidecarTitleOf (a named handler counts); titleOf, onlyDisp and headTrim spell an earlier name (earlierSidecarNames). Only for
        // a real subtitle stream: the caption pseudo-stream shares the VIDEO's index, and a mediaInfo join on it would read the video's title.
        const rawTitle = codecTypeOf(s) === 'subtitle' ? titleOf(s) : (s.tags?.title || '');
        const ext = bundle ? STYLED_BUNDLE.ext : TEXT_SUB[codecNameOf(s)].ext;
        const dot = bundle ? '.' : '';
        const mark = bundle ? `.${STYLED_BUNDLE.mark}` : '';
        // The role tokens, decided here alone: the shared rule (handlerOnlyDisp, sidecar name tokens), plus a token for each role the title gives that its cut
        // under the 255-byte cap could not keep - only where the role words do not fit the bytes a long video name leaves (logged; encodeTitleCapped). Each
        // such token shrinks the title's budget, so the name is spelled again until the cut loses no role, down to no title at all. The language slot and both
        // runs come from the shared sidecarNameTokens, so this plugin and clean_and_remux cannot spell them differently; only the TITLE token is assembled
        // here - sub_worker is the one that writes one.
        const kept = new Set();
        const roleToken = onlyDisp || ((d, x) => handlerOnlyDisp(d, x, rawTitle) || kept.has(d.token));
        // Where even the tokens do not fit the cap, the name is spelled without them and those roles are lost (logged), never refused: the title-less name
        // fits wherever the previous sub_worker wrote one (measured: a 238-byte video name and 'English forced' failed the file for the '.forced' token).
        let tooLong = [];
        let ownBudget = null;
        for (;;) {
            const { lang, pre, disp } = sidecarNameTokens(s, roleToken);
            // A title titleIsToken flags is written with its first character escaped, which pctDecode reverses exactly; encoding only ever expands, so ONLY
            // such a title can reach a token's spelling. The title tested is the one written - the cut, whose escape encodeTitleCapped counts - and the earlier
            // spelling (headTrim) tests the full title as the previous sub_worker did, its two bytes joining the fixed budget.
            const fixed = `${dot}${videoBase}.s${s.index}${pre}.${lang}${disp}${mark}.${ext}`;
            if (kept.size && Buffer.byteLength(fixed, 'utf8') > NAME_BYTE_CAP) { tooLong = [...kept]; kept.clear(); continue; }
            const headToken = headTrim && titleIsToken(rawTitle, lang);
            const { enc: encRaw, cut, budget } = rawTitle ? encodeTitleCapped(rawTitle, Buffer.byteLength(fixed, 'utf8') + (headToken ? 2 : 0), headTrim, lang)
                : { enc: '', cut: '', budget: 0 };
            if (ownBudget === null) ownBudget = budget;
            const collides = headTrim ? headToken : titleIsToken(cut, lang);
            const lost = onlyDisp || tooLong.length ? [] : DISPOSITIONS.filter((d) => !kept.has(d.token) && !d.flags.some((f) => s.disposition?.[f] === 1)
                && titleGives(rawTitle, d) && !titleGives(cut, d));
            if (lost.length) { lost.forEach((d) => kept.add(d.token)); continue; }
            cutRoleTokens = [...kept]; cutRolesLost = tooLong; cutBudget = ownBudget;
            const encTitle = collides && encRaw ? `${pctEncode(encRaw.slice(0, 1), NEVER_SAFE)}${encRaw.slice(1)}` : encRaw;
            return `${dot}${videoBase}.s${s.index}${encTitle ? `.${encTitle}` : ''}${pre}.${lang}${disp}${mark}.${ext}`;
        }
    };
    // The name a sidecar is spelled from: the track's name as the next pass reads it, in escMeta's form, as every write and import gives it. For a stand-in
    // (sidecarView: a fold's restamp, or the name carry's view of a kept stream - a .mov name's cut, or the kept handler beside a name the .mov box refuses)
    // that is the title it holds, else its named handler - never the source's mediaInfo its index still joins. So the next pass and container spell the same
    // name (measured: a quoted name, a .mov cut and a title restated into the handler each made the next extract write a second sidecar).
    const sidecarTitleOf = (v) => {
        if (!v.sidecarView) return nameTextOf(escMeta(mediaTitleFor(v)));
        const named = handlerTextOf(getTagCI(v.tags, 'handler_name'));
        return nameTextOf(escMeta(nameTextOf(v.tags?.title) || (isGenericHandler(named) ? '' : named)));
    };
    // The previous sub_worker's title for a track (earlierSidecarNames), read from the handler as stored: ffprobe's title tag, else mediaInfo's Title less each
    // part equal to the trimmed handler - so MediaInfoLib's mangled echo of a name stayed in it ('Fran√ßais Forced' for a .mov handler 'Français Forced').
    const earlierTitleOf = (s) => {
        const own = (s?.tags?.title || '').trim();
        if (own) return own;
        const handler = (getTagCI(s?.tags, 'handler_name') || '').trim();
        const mediaTitle = mediaInfoText(mediaInfoFor(s)?.Title).trim();
        if (!handler || !mediaTitle) return mediaTitle;
        return mediaTitle.split(' / ').filter((part) => part.trim() !== handler).join(' / ').trim();
    };
    // The previous sub_worker's role token beside that title, for a keyword the raw handler holds and the title lacks: none for an mkv title 'English SDH'
    // beside the same HANDLER_NAME, and none for a role at the front of a .mov handler of 256 bytes or more, which its length byte joined ('HSDH English ...'
    // gave 'w.s2.fra.srt').
    const earlierOnlyDisp = (d, s) => {
        const handler = String(getTagCI(s.tags, 'handler_name') || '').toLowerCase();
        const keywords = dispositionTypes[d.ff]?.keywords || [];
        return !!handler && matchesKeyword(handler, keywords) && !matchesKeyword(earlierTitleOf(s).toLowerCase(), keywords);
    };
    // The spellings the previous sub_worker (3.999.88, never released) gave the same track, so a sidecar already on disk under one counts as extracted, not a
    // second copy beside it: its own (earlierTitleOf, earlierOnlyDisp); and off .mov, which no container conversion writes, the name of view (the stream as
    // sidecarView gives it) as spelled before a conversion moved it - out of a title, as the title token with no handler role token; out of an mp4 or .mov
    // handler, with no title token and a token for each role the name gives; a non-ASCII .mov handler name as its MacRoman echo, with a token for a role only
    // the name as written spells. A title in any of these is cut as that sub_worker cut a long one (headTrim). carried (remove_source=true only) adds the
    // remove_source=false spelling a kept stream's sidecar took, and every track's current spelling less a flag token its title gives (below). Each is { name,
    // byText, own }: only an own spelling that is not byText (it has a title or a handler role token) stands in by its name; any other is also another track's
    // possible spelling - an untitled track's own at that index, a neighbour a reorder moved there, a waiting import, a user's copy - so it stands in only by
    // its cue texts (sameCueText; measured: another track's sidecar was kept as this one's and remove_source stripped the stream, its text then nowhere).
    // titleTruncated is left as it was: an adopted earlier spelling is a sidecar already on disk, never reported as cut.
    const earlierSidecarNames = (s, view, bundle, carried) => {
        const truncated = titleTruncated;
        const names = [];
        const add = (name, byText, own = false) => { if (!names.some((n) => n.name === name)) names.push({ name, byText, own }); };
        const own = sidecarBasename(s, bundle, earlierTitleOf, earlierOnlyDisp, true);
        add(own, own === sidecarBasename(s, bundle, () => '', () => false), true);
        if (readContainer !== 'mov') {
            const name = sidecarTitleOf(view);
            const mangled = macRoman(Buffer.from(name, 'utf8'));
            const gives = (t, d) => matchesKeyword(t.toLowerCase(), dispositionTypes[d.ff]?.keywords || []);
            add(sidecarBasename(view, bundle, () => name, () => false, true), false);
            add(sidecarBasename(view, bundle, () => '', (d, x) => gives(name, d) || handlerOnlyDisp(d, x, '')), true);
            if (mangled !== name) add(sidecarBasename(view, bundle, () => mangled, (d) => gives(name, d) && !gives(mangled, d), true), false);
        }
        if (carried) add(sidecarBasename(carried, bundle), false);
        // The current spelling less the token of each flag whose role its title already gives: the name a sidecar extracted before tag_disposition made a
        // flag of that role has, which the file API route, unable to list the folder, can only try by name (measured: a second sidecar uploaded beside it).
        const title = sidecarTitleOf(view);
        const unflagged = { ...view, disposition: { ...(view.disposition || {}) } };
        for (const d of DISPOSITIONS.filter((x) => titleGives(title, x))) d.flags.forEach((f) => { unflagged.disposition[f] = 0; });
        add(sidecarBasename(unflagged, bundle), true);
        titleTruncated = truncated;
        return names;
    };
    // A name with its hidden-marker dot taken off, or null when it is not named after this video. The marker is a dot BEYOND the video's own: a
    // dot-prefixed video ('.Pilot.mkv') keeps its dot in videoBase, so its loose sidecar '.Pilot.s2.eng.srt' carries no marker, and stripping a leading
    // dot unconditionally left 'Pilot.s2.eng.srt', which no longer starts with the video's name - every sidecar extract wrote was then unreadable, and
    // with remove_source the subtitle survived only in a file import skipped without a word.
    const ownSidecarBare = (name) => (name.startsWith(`${videoBase}.`) ? name : (name.startsWith(`.${videoBase}.`) ? name.slice(1) : null));
    const parseSidecar = (name) => {
        const extMatch = name.match(SIDECAR_EXT_RE);
        if (!extMatch) return null;
        const rawExt = extMatch[1].toLowerCase();
        const bundle = rawExt === STYLED_BUNDLE.ext;
        if (!bundle && !IMPORT_EXTS.includes(rawExt)) return null;
        const ext = IMPORT_ONLY_EXTS[rawExt] || rawExt;   // own property only: rawExt has passed the IMPORT_EXTS membership test above
        // A bundle is written only by us, always dot-prefixed and always with the s<index> anchor (required below), so an unrelated .mks dropped
        // beside the video is left alone rather than muxed in blind.
        if (bundle && !name.startsWith('.')) return null;
        // The hidden-marker dot is taken off EVERY sidecar, not just bundles, so the rest parses identically either way. A hidden text sidecar is a real
        // arrival, not junk: clean_and_remux exports image subtitles dot-prefixed for external OCR, and the OCR comes back as ".<video>.s<n>.<lang>.srt"
        // with that dot intact - refusing it here stranded the user's OCR work in the library forever. Hiding a sidecar from media servers says nothing
        // about whether we should read it, and an unrelated hidden file is still rejected below by the videoBase and language-token requirements.
        const bare = ownSidecarBare(name);
        if (bare === null) return null;
        const mid = bare.slice(videoBase.length + 1, bare.length - extMatch[0].length);
        const toks = mid.split('.');
        if (!toks.length) return null;
        // Require (and consume) the bundle marker before anything else reads the trailing tokens, so a clean_and_remux image-subtitle export sharing the
        // .mks extension and the same name shape is rejected here rather than re-imported as a styled bundle. See STYLED_BUNDLE.mark.
        if (bundle) { if (toks[toks.length - 1] !== STYLED_BUNDLE.mark) return null; toks.pop(); }
        // Our own sidecars lead with an s<index> order marker; a fresh server-native sidecar (Movie.en.forced.srt) has none. Consume the marker if
        // present (index only keeps our names unique); otherwise index is null and the language token below MUST be a recognized language, so an
        // unrelated .srt (Movie.backup.srt) is not mis-read as lang="backup" and imported as junk.
        const ours = /^s\d+$/.test(toks[0]);
        if (bundle && !ours) return null;
        const index = ours ? parseInt(toks.shift().slice(1), 10) : null;
        // Trailing dispositions, right-to-left. A DISP_AMBIGUOUS_LANG token only counts as a disposition when the token it would expose is a real language
        // AND is not one of our own name tokens: ICU names 'sdh' (Southern Kurdish), so on the language test alone our own '<video>.sN.sdh.hi.forced.srt'
        // would eat 'hi' as an SDH flag and then 'sdh' behind it, emptying toks and rejecting a name we wrote ourselves. With both halves Movie.en.hi.srt
        // still reads as English+SDH, while Movie.hi.srt, our own Movie.s3.Title.hi.srt and Movie.s3.sdh.hi.forced.srt all keep Hindi as the language.
        const rawDisp = [];
        while (toks.length && DISP_TOKENS.has(toks[toks.length - 1])) {
            const prev = toks[toks.length - 2] || '';
            if (DISP_AMBIGUOUS_LANG.has(toks[toks.length - 1]) && (DISP_TOKENS.has(prev) || EXTRA_TOKENS.has(prev) || !isRealLanguageToken(prev))) break;
            rawDisp.unshift(toks.pop());
        }
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
    // Parse each scanned path as a sidecar, carrying its relative path along as the identity everything downstream keys on.
    const parseSidecarRel = (rel) => { const p = parseSidecar(relBasename(rel)); return p ? { ...p, rel } : null; };
    // ====== END SUBTITLE SIDECAR HELPERS ======

    // ====== UNMAPPED-NODE LIBRARY ACCESS (method_unmapped) ======
    // An unmapped node is handed a local MIRROR of the library, never the library itself, and Tdarr withholds the user's own path translators from it - so the
    // node can work out that the server calls this folder /media/Show and reach nothing at that path. Two ways out, both measured on a real Windows node:
    //   mount     - the server's path may simply work (a container bind-mount), and otherwise a Node Tag names where THIS node sees it ("media=M:\").
    //               Tags are the only PER-NODE setting a classic plugin can read - fetched from /api/v2/get-nodes with the serverURL/apiKey/nodeID the
    //               node config already carries.
    //   text_file - no directory access at all; the user lists the filenames and each is fetched by name through the download API.
    const SUBTITLE_LIST_SUFFIX = '.subtitles.txt';
    const subtitleListName = `${videoBase}${SUBTITLE_LIST_SUFFIX}`;   // one name for the file, rather than the same join at every site
    const SUBTITLE_LIST_MAX = 1024 * 1024;   // one filename per line is a few KB; a file this size at the list's name is something else
    // seedSubtitleList answers '' for success and free prose for a real failure - but two of the values the caller compares its answer
    // against are NOT failures and the caller has to tell them apart to decide whether to warn. Naming them makes that a comparison against
    // a constant rather than against a sentence someone may reasonably reword, which would turn a healthy state into a ☒ on every pass.
    const LIST_SEED_EXISTS = 'exists';                              // the library already holds a list; nothing to create, nothing to say
    const LIST_SEED_NOTHING = 'nothing was placed to list';         // the caller's own answer when no sidecar landed, so there is nothing to list yet
    // Spawn ceilings for the helpers below, named once. curl counts SECONDS and spawnSync MILLISECONDS, so each pair is derived from a single number rather
    // than written twice - the two spellings of one duration are exactly what drifts. Sized by what the call actually moves: the node registry is a small
    // JSON document and a library file transfer is not. Each is a ceiling on a hang, not a target.
    const NODE_TAG_FETCH_S = 30;
    const LIBRARY_DOWNLOAD_S = 600;
    const SUBTITLE_LIST_UPLOAD_S = 300;
    // And the matching ceiling on how much a spawn may write back. Exceeding maxBuffer KILLS the child and reports a failure that never happened, so this is
    // sized for the largest legitimate output any of these four calls produces - the node registry JSON, an ffprobe -show_streams document, and the stderr of
    // the embedded-text extraction and its sidecar round trip - not for the smallest that usually suffices. Named once for the same reason the durations are:
    // an unlabelled ceiling gives nobody raising it a way to tell whether the number was chosen or copied.
    const SPAWN_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

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
    // path is only accepted once a real readdir succeeds, never because its shape looked right. ENOENT and EACCES are reported apart because they send
    // you to different places: a wrong value versus a path that exists but this node has no credentials for (typically Tdarr running as a service).
    // `writable` (dirWritable) steers ROUTING, never acceptance: a read-only mount is still the best possible view for reads (scans, dedup, feeding
    // ffmpeg inputs), while every write falls back to the file API exactly as if no mount had resolved. A writable candidate is preferred over an
    // earlier read-only one - both name the same library, and taking the writable view spares the API round-trips. Can this node write into dir?
    // access(W_OK) answers truthfully on Linux and macOS, but on Windows it answers yes for EVERY directory (libuv's fs__access: "Directories cannot be
    // read-only on Windows" - ACLs and read-only shares alike), and a wrong yes aims extract's sidecar outputs at a read-only mount, where ffmpeg fails
    // the whole command and the file is quarantined on every requeue. So on Windows the answer takes a real write: a zero-byte dot-named file created
    // exclusively and removed in the same breath. That is the one place a file appears in the library for the probe's sake, and only on Windows, where
    // nothing cheaper is truthful; a media server skips a dotfile, and one stranded by a crash between the two calls is a zero-byte dotfile, inert.
    const dirWritable = (dir) => {
        if (process.platform !== 'win32') {
            try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch (e) { return false; }
        }
        const probe = path.join(dir, `.awk_write_probe_${process.pid}_${Date.now()}`);
        try { fs.closeSync(fs.openSync(probe, 'wx')); } catch (e) { return false; }
        try { fs.unlinkSync(probe); } catch (e) { /* inert if it stays - see above */ }
        return true;
    };
    const resolveMountedLibDir = () => {
        const serverDir = serverSidePath(libDir);
        if (!serverDir) return { dir: '', why: `no path translator maps ${libDir} back to the server, so this node cannot name the library at all` };
        const candidates = [['the server\'s own path', serverDir]];
        for (const [k, v] of nodeTagPairs()) {
            const root = `/${String(k).replace(/^\/+/, '')}`;
            const norm = serverDir.replace(/\\/g, '/');
            // The tag must name a whole leading folder: "media" claims /media/TV, never /mediastore/TV or /media2. The remainder always starts with a
            // separator, so a drive-letter value ("M:" or "M:\") joins to the absolute M:\TV rather than the drive-relative M:TV.
            const rest = norm.startsWith(root) ? norm.slice(root.length) : null;
            if (rest === null || (rest && !rest.startsWith('/'))) continue;
            candidates.push([`Node Tag "${k}=${v}"`, path.normalize(String(v).replace(/[\\/]+$/, '') + (rest || '/'))]);
        }
        const tried = []; let readOnly = null;
        for (const [label, dir] of candidates) {
            try { fs.readdirSync(dir); } catch (e) {
                const code = (e && e.code) || '';
                tried.push(`${label} (${dir}) - ${code === 'ENOENT' ? 'not there'
                    : (code === 'EACCES' || code === 'EPERM' ? 'exists but unreadable from this node, check credentials' : code || e.message)}`);
                continue;
            }
            if (dirWritable(dir)) return { dir, via: label, writable: true };
            if (!readOnly) readOnly = { dir, via: label, writable: false };
        }
        if (readOnly) return readOnly;
        return { dir: '',
            why: `nothing reachable. Tried: ${tried.join('; ')}${nodeTagPairs().length ? '' : '. No "key=value" Node Tag is set for this node'}` };
    };
    // Reads unmappedMode, which is declared with the other dropdown reads further down - so this closure must stay lazy (called, never evaluated here).
    const mountedLib = (() => {
        let c = null;
        return () => { if (!c) c = (isUnmappedNode && unmappedMode === 'mount') ? resolveMountedLibDir() : { dir: '' }; return c; };
    })();

    // Every path below goes through these rather than libDir/isUnmappedNode directly, and READS and WRITES route independently: any resolved mount serves
    // reads (workLibDir), but only a WRITABLE one serves writes - a read-only mount reads like a mapped node while placing every write through the file
    // API. readViaApi is "no library view at all" (existence checks must ask the server); placeViaApi is "no writable view" (sidecars go up by upload, and
    // deletion can only happen in the server's own post-processing pass). serverDestFor names a sidecar's upload destination in SERVER space, and it must
    // derive from libDir, never workLibDir(): the translators map the node MIRROR back to the server, a mount tree matches no translator prefix, and a
    // mount-joined path would therefore translate to '' and refuse an upload the mirror path can name.
    const workLibDir = () => mountedLib().dir || libDir;
    const libPathOf = (...parts) => path.join(workLibDir(), ...parts);   // a path in the NODE's view of the library; libDir joins are server/mirror space
    const readViaApi = () => isUnmappedNode && !mountedLib().dir;
    const placeViaApi = () => isUnmappedNode && !(mountedLib().dir && mountedLib().writable);
    const serverDestFor = (name) => serverSidePath(path.join(libDir, name));
    // A path, or an fs error message carrying one, echoed into infoLog: sanitised like every echo (logSafe), but never cut - PATH_MAX already bounds it,
    // and the tail a cap would drop is the part that names the file. The library directory is the user's own name, so it can hold a newline.
    const logPath = (v) => logSafe(v, Infinity);

    // Fetch one library file to a local path, through the only read an unmapped node has. It addresses a single KNOWN path, which is exactly why the list has
    // to live at a name we can compute rather than one we would have to go looking for. Written straight to disk by curl, never buffered back through
    // spawnSync, so a large sidecar cannot silently exceed maxBuffer and report a failure that never happened. curl's EXIT STATUS is part of the success test,
    // not just the HTTP code: a transfer that dies after the response headers - the -m timeout, a dropped connection - still reports %{http_code} 200 and
    // leaves a non-empty file, so testing the code alone would call a truncated download complete. Returns { ok, serverAnswered, why }. serverAnswered is TRUE
    // only when curl exited 0 and the server sent a definitive non-200 answer (the download endpoint returns HTTP 400 for a missing file, 501 when unmapped
    // nodes are disabled) - i.e. the file genuinely is not retrievable, which a caller may treat as "nothing there". It is FALSE for every way the server was
    // NOT reached to a conclusion - no configured URL, a spawn/connection error, or a transfer that timed out or dropped mid-stream - because then the file may
    // well exist and we simply could not read it, so the two must not be conflated. `maxBytes`, when given, has curl refuse a larger file before writing any of
    // it (the server sends its length). That file EXISTS, so the answer is serverAnswered FALSE - a caller must never read it as "nothing there". `empty`
    // marks the 200 with no body: the file is there, holding nothing.
    const downloadLibraryFile = (dest, local, maxBytes) => {
        const url = serverApiUrl();
        if (!url) return { ok: false, serverAnswered: false, why: 'the node config carries no server URL' };
        try { fs.mkdirSync(path.dirname(local), { recursive: true }); } catch (e) { /* already there */ }
        const r = spawnSync('curl', ['-sS', '-m', String(LIBRARY_DOWNLOAD_S), ...(maxBytes ? ['--max-filesize', String(maxBytes)] : []),
            '-o', local, '-w', '%{http_code}', ...apiAuthArgs(),
            '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify({ filePath: dest }), `${url}/api/v2/file/download`],
            { encoding: 'utf8', timeout: LIBRARY_DOWNLOAD_S * 1000, input: apiAuthInput() });
        const code = String(r.stdout || '').trim();
        let size = 0; try { size = fs.statSync(local).size; } catch (e) { size = 0; }
        if (!r.error && r.status === 0 && code === '200' && size > 0) return { ok: true, serverAnswered: true, why: '' };
        const empty = !r.error && r.status === 0 && code === '200';   // the file is there and holds nothing
        try { fs.unlinkSync(local); } catch (e) { /* nothing landed */ }
        if (r.error) return { ok: false, serverAnswered: false, why: `download failed (${r.error.code || r.error.message})` };
        if (maxBytes && r.status === CURL_FILESIZE_EXCEEDED) return { ok: false, serverAnswered: false, why: `it is over the ${maxBytes}-byte limit` };
        return r.status === 0
            ? { ok: false, serverAnswered: true, why: `HTTP ${code || 'no response'}`, empty }
            : { ok: false, serverAnswered: false, why: `the transfer did not complete (curl exit ${r.status === null ? 'signalled' : r.status})` };
    };

    // Pull every listed sidecar into this node's mirror at the same relative path - everything downstream (dedup hash, -i inputs, marker) then works on
    // ordinary local files. A name missing because an earlier pass imported and cleaned it up is the list going stale in the ordinary way (the list is
    // seeded once, never rewritten); the marker is what tells that apart from a failure - without it a completed round trip reports one warning per
    // subtitle it successfully handled. The NAME is checked BEFORE anything is fetched: readSubtitleList only proves an entry stays inside the video's
    // folder, and the destination is in the mirror that also holds the video being transcoded - a line naming the video itself would have curl truncate
    // it, or delete it on an HTTP error, before any downstream test ran. An entry has to parse as a sidecar to be usable at all, so testing here costs
    // nothing and is the only place the test is in time.
    const fetchListedSidecars = (rels, embeddedAlready) => {
        const got = [];
        for (const rel of rels) {
            if (!parseSidecarRel(rel)) {
                response.infoLog += `☒[method_unmapped=text_file] ${subtitleListName} lists ${logSafe(rel)}, which is not a recognised sidecar name`
                    + ' - skipping\n';
                continue;
            }
            const dest = serverSidePath(path.join(libDir, rel));
            if (!dest) { response.infoLog += `☒[method_unmapped=text_file] Cannot work out the server path for ${logSafe(rel)}\n`; continue; }
            const dl = downloadLibraryFile(dest, path.join(libDir, rel));
            if (dl.ok) { got.push(rel); continue; }
            if (embeddedAlready && embeddedAlready.has(rel)) {
                response.infoLog += `☑[method_unmapped=text_file] ${subtitleListName} still lists ${logSafe(rel)}, which an earlier pass already embedded`
                    + ' and removed\n';
                continue;
            }
            response.infoLog += `☒[method_unmapped=text_file] ${subtitleListName} lists ${logSafe(rel)} but it could not be fetched - ${dl.why}\n`;
        }
        return got;
    };

    // Extract seeds the list once and then never touches it again - it is the user's file from that moment, and rewriting it every pass would quietly
    // discard the OCR'd subtitles they added, which is the one failure that would make the feature untrustworthy. The header explains itself, so opening
    // the file is enough to understand it.
    const seedSubtitleList = (rels) => {
        const dest = serverSidePath(path.join(libDir, subtitleListName));
        if (!dest) return `no path translator maps ${libDir} back to the server`;
        const there = sidecarExistsRemote(dest);
        if (there.state === 'present') return LIST_SEED_EXISTS;
        if (there.state === 'unknown') return `could not confirm whether one is already in the library (${there.why}), so it was left alone`;
        const body = [
            `# Subtitles to import for ${logPath(path.basename(libFilePath))} - one filename per line.`,
            '# Lines starting with "# " are ignored. This file was created once, automatically; it is yours to edit now.',
            '# A backslash is read as a folder separator, so a file whose own name contains one cannot be listed here.',
            '# Add any subtitle you have made yourself here - for example one you OCR\'d from an exported image subtitle -',
            '# naming it the same way as the lines below, since the language, title and flags are read from the filename.',
            ...rels,
            '',
        ].join('\n');
        // Staged in a private mkdtemp directory for the same reason placeSidecars is: a pid-derived name in the world-writable temp dir can be pre-created
        // as a symlink by another local user, and writeFileSync follows it. The inner name is fixed, so nothing user-supplied reaches curl's -F syntax.
        let stageDir = '';
        try { stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_sublist_')); }
        catch (e) { return `could not stage the list (${e && e.message ? e.message : e})`; }
        const tmp = path.join(stageDir, 'list.txt');
        try { fs.writeFileSync(tmp, body); } catch (e) { return `could not stage the list (${e && e.message ? e.message : e})`; }
        // Same endpoint and the same load-bearing field order as a sidecar placement, so it goes through the same helper - a shorter timeout because a
        // list is a few hundred bytes where a sidecar is bounded by the container.
        const up = uploadLibraryFile(dest, tmp, SUBTITLE_LIST_UPLOAD_S);
        try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return up.ok ? '' : up.why;
    };

    // One line per filename, '# ' for comments. Deliberately the simplest format that can be hand-edited without getting quoting wrong, because maintaining
    // it IS the point - it is how a subtitle OCR'd from an exported image sub announces itself. It must hold every name extract seeds, and those start with
    // the video's own name, which can itself begin with '#' ('#Alive (2020).mkv') or a space: so a comment is '#' followed by a space or nothing, and only
    // TRAILING space is forgiven (a name always ends in its extension). A leading byte-order mark, which some editors save, is dropped. Every entry is
    // confined to the library folder: '..', an absolute path and a UNC path are all rejected outright, and the joined result is then resolved and
    // re-checked to stay under the directory, so anything that slips the syntactic tests fails on the outcome instead.
    const readSubtitleList = (text) => {
        const ok = []; const bad = [];
        for (const line of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
            const entry = line.trimEnd();
            if (!entry || /^#(\s|$)/.test(entry)) continue;
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
    // ====== END UNMAPPED-NODE LIBRARY ACCESS ======

    // ====== SIDECAR SCAN / HASH / DEDUP (both node types) ======
    // The spawn ceiling for the subtitle hash and round-trip reads below: it scales with the container, and is a ceiling on a hang, not a target.
    const SUB_EXTRACT_TIMEOUT_MS = 600000;
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
    // Only a regular file, or a link to one, can be a sidecar; anything else at a sidecar-shaped name goes to `irregular` for the import to name. Read as a
    // sidecar, a directory reached ffmpeg as an -i it refuses, failing the file on every requeue, and a FIFO blocked the read until something wrote to it,
    // hanging the worker with no timeout (the spawn ceilings cover child processes, not an fs read).
    const scanSidecarDirs = () => {
        let top;
        try { top = fs.readdirSync(workLibDir(), { withFileTypes: true }); } catch (e) { return { err: e }; }
        const rels = []; const irregular = [];
        const byName = (a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
        const regular = (d, full) => d.isFile() || (d.isSymbolicLink() && (() => { try { return fs.statSync(full).isFile(); } catch (e) { return false; } })());
        const subs = [];
        for (const d of top.sort(byName)) {
            if (d.isDirectory() && SIDECAR_SUBDIRS.includes(d.name.toLowerCase())) subs.push(d.name);
            else (regular(d, libPathOf(d.name)) ? rels : irregular).push(d.name);
        }
        for (const s of subs) {
            let inner = [];
            // unreadable subfolder: the sidecars beside the video still import
            try { inner = fs.readdirSync(libPathOf(s), { withFileTypes: true }); } catch (e) { continue; }
            for (const d of inner.sort(byName)) (regular(d, libPathOf(s, d.name)) ? rels : irregular).push(`${s}/${d.name}`);
        }
        return { rels, irregular };
    };
    // Import order = the ORIGINAL stream order. Our own names carry the source stream index in their s<index> anchor, and that is the whole point of it:
    // a round trip should hand the tracks back in the order it found them, not in the order their names happen to sort (a plain lexical sort puts s11
    // ahead of s2). A server-native sidecar has no anchor, so it has no original position to restore and goes after the ones that do. The relative path
    // breaks ties, so the import order is identical on every node whatever order a filesystem listed the entries in.
    const byOriginalPosition = (a, b) => (a.index === null ? Infinity : a.index) - (b.index === null ? Infinity : b.index)
        || (a.rel < b.rel ? -1 : (a.rel > b.rel ? 1 : 0));

    // The text every content hash (subTextHash) is taken of, so a sidecar's own text, its round trip and an embedded extraction compare like for like;
    // cueTextKey, which leaves timing out, is the other key. It undoes ffmpeg's cheap-to-undo rewrites, measured on 7.1.4: CRLF folds to LF, a UTF-8 BOM is
    // dropped, a missing final blank line is added, and cue numbers are RENUMBERED from 1 (same byte COUNT, different bytes - a size check cannot even hint at
    // it). So an ordinary CRLF, gap-numbered .srt matches on its OWN text, the match that proves an import lost nothing; everything else ffmpeg rewrites is
    // left to sidecarRoundTripHash. Two traps, both deliberate: (1) only a numeric line IMMEDIATELY PRECEDING a "-->" line is dropped, because that is
    // structurally the cue number - dropping every standalone numeric line would delete a cue whose text is literally "7" and make two different subtitles
    // collide; (2) ass is normalised only for its BOM, line endings and trailing whitespace, never reduced to its Dialogue: lines, which would hash two
    // subtitles differing only in typesetting alike. trimEnd, never /\s+$/: that pattern is start-unanchored, so V8 retries it from every offset inside an
    // interior whitespace run - O(n^2) on the 64 MiB these buffers are capped at (measured 12.7 s at an 80 KB run; trimEnd does 4 MiB in 5.6 ms). trimEnd
    // strips exactly the JS \s set - verified over every code point U+0000-U+10FFFF, BOM and U+2028/2029 included - so hashes are unchanged.
    const subTextForHash = (buf, ext) => {
        const t = buf.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        const e = String(ext || '').toLowerCase().replace(/^\./, '');
        if (e !== 'srt' && e !== 'vtt') return t.trimEnd();
        const lines = t.split('\n');
        return lines.filter((ln, i) => !(/^\d+$/.test(ln.trim()) && String(lines[i + 1] || '').includes('-->'))).join('\n').trimEnd();
    };
    // The identity every sidecar comparison keys on: the sha1 of the normalised text above.
    const subTextHash = (buf, ext) => crypto.createHash('sha1').update(subTextForHash(buf, ext)).digest('hex');
    // The cue TEXTS of decoded subtitle text, in order, as one sha1 - each cue's lines trimmed, its number, timing and settings left out: the same subtitle
    // gives the same key whatever its timing (a mov_text -> srt conversion moves every cue about 21 ms, measured), another track's text a different one.
    // srt/vtt cues are the lines after a '-->' line up to a blank one; ass/ssa cues the text after a Dialogue line's ninth comma. One pass over the lines,
    // each tested with an anchored pattern, since the text is untrusted and up to SIDECAR_HASH_MAX.
    const cueTextKey = (text, ext) => {
        const ass = ext === 'ass' || ext === 'ssa';
        const cues = []; let cur = null;
        for (const line of String(text).split(/\r\n|\r|\n/)) {
            if (ass) {
                if (!/^\s*Dialogue\s*:/i.test(line)) continue;
                let at = -1;
                for (let k = 0; k < 9; k += 1) { at = line.indexOf(',', at + 1); if (at < 0) break; }
                if (at >= 0) cues.push(line.slice(at + 1).trim());
            } else if (line.includes('-->')) {
                if (cur) cues.push(cur.join('\n'));
                cur = [];
            } else if (!line.trim()) {
                if (cur) cues.push(cur.join('\n'));
                cur = null;
            } else if (cur) cur.push(line.trim());
        }
        if (cur) cues.push(cur.join('\n'));
        return crypto.createHash('sha1').update(cues.join('\n\n')).digest('hex');
    };

    // Does decoded subtitle text contain any actual CUES? Only srt writes a genuinely 0-byte file when it has nothing to say - webvtt still writes its WEBVTT
    // header and ass its whole [Script Info]/[V4+ Styles] preamble - so a size test alone would call an empty ass track populated. Both timed formats mark
    // every cue with the '-->' arrow, and ass marks every line of dialogue with a Dialogue: key, so one token per format settles it.
    const hasNoCues = (text, ext) => {
        if (!String(text).trim()) return true;
        // The leading class must exclude every character `^` can follow under /m, or the two overlap and the match is quadratic: from each of N line
        // starts the greedy star runs to the end of the whitespace run and gives a character back at a time testing for `D`, and on text with no
        // Dialogue line ahead of it none of those N attempts can succeed. JS has FOUR line terminators - \n, \r, U+2028, U+2029 - and `\s` matches
        // all of them, so `[^\S\r\n]` is NOT enough: it still overlaps on U+2028/U+2029 and stays quadratic (measured 23.7 s on 100k U+2028 versus
        // 12.7 ms on 2M newlines, so an LF-only test would report it fixed). The plain `^\s*Dialogue\s*:` form measured 4.14 s on 50k blank lines and
        // 66.9 s on 200k; this one, 424 ms on a 64 MiB blank-line file - the size the sidecar path actually permits, and one the plain form never
        // returns from. Behaviour is unchanged: `^` already anchors at the start of the Dialogue line, so the class only ever needed to skip the
        // indent on the cue's OWN line. The trim() above is no protection - one non-whitespace byte defeats it, and every real ass has [Script Info].
        return ext === 'ass' ? !/^[^\S\r\n\u2028\u2029]*Dialogue\s*:/mi.test(text) : !/-->/.test(text);
    };

    // The same stat-first rule for the other library files read whole as TEXT - the caption sidecar and the subtitle list sit at names anyone can put a
    // file at. Over the cap, or not a regular file (a FIFO would block the read; see scanSidecarDirs), it throws like an unreadable file, so each caller's
    // catch keeps its own failure direction; `overCap` and `notRegular` let one say why.
    const readTextCapped = (p, cap) => {
        const st = fs.statSync(p);
        if (!st.isFile()) throw Object.assign(new Error('it is not a regular file'), { notRegular: true });
        if (st.size > cap) throw Object.assign(new Error(`it is ${st.size} bytes, over the ${cap}-byte limit`), { overCap: true });
        const buf = fs.readFileSync(p);
        // Decoded as ffmpeg's text reader decodes an srt or ass (ff_text_init_avio, libavformat/subtitles.c, 7.1): a UTF-16 LE or BE byte-order mark
        // selects UTF-16, a UTF-8 one is dropped, else UTF-8. Its WebVTT demuxer reads raw bytes, so a .vtt is UTF-8 (measured on 7.1.4: a UTF-16 srt or
        // ass with the mark imports whole; a UTF-16 vtt, or one without the mark, fails to open). A user's edit saved as UTF-16 reads as its text.
        const at = (...mark) => mark.every((x, i) => buf[i] === x);
        if (path.extname(p).toLowerCase() === '.vtt' || !(at(0xff, 0xfe) || at(0xfe, 0xff))) return buf.toString('utf8', at(0xef, 0xbb, 0xbf) ? 3 : 0);
        return (at(0xfe, 0xff) ? buf.subarray(2, buf.length - (buf.length % 2)).swap16() : buf.subarray(2)).toString('utf16le');
    };
    // Whether decoded text holds a NUL beside other text: ffmpeg's text reader ends the subtitle at a NUL (measured on 7.1.4: one in an srt's second cue
    // imports the first cue alone) and cannot open UTF-16 without the mark, so such a file is never empty, never matched by its text, and never deleted
    // or written over; under remove_source=true it is not taken by its name either, except at the current name on the file API, judged by size alone.
    // Text of NULs and whitespace alone holds nothing, as a 0-byte file does, and is empty.
    const unreadableText = (text) => text.includes('\0') && /[^\0\s]/.test(text);
    // What importing a sidecar provably DROPS, so remove_source never deletes the only complete copy (deletionLoss). Measured on jellyfin-ffmpeg 7.1.4 by
    // muxing each shape into mkv and mp4 and extracting it back. Into Matroska an srt or ass/ssa survives whole - spaces, timestamp spelling, cue order,
    // tag case and Comment placement are re-serialised, nothing visible changes - but a WebVTT loses its cue settings (align/position/line), STYLE and
    // REGION blocks, and every tag except <b>/<i>/<u>: voice, class, lang, ruby (flattened into the text) and karaoke timestamps. Into mp4's mov_text an
    // ass/ssa loses all its styling, and an srt or vtt its <font> tags and {\...} overrides ({\an8} positioning). Over-reporting only keeps a sidecar that
    // could have gone, so the scan is coarse - and linear, never a backtracking pattern, since a sidecar is untrusted text up to SIDECAR_HASH_MAX.
    // Returns the first loss for each target family, '' for none.
    const importLosses = (text, ext) => {
        let any = '';
        if (ext === 'vtt') {
            for (const line of text.split('\n')) {
                const t = line.trim();
                if (t === 'STYLE' || t === 'REGION') { any = 'its STYLE/REGION block'; break; }
                const arrow = line.indexOf('-->');
                if (arrow >= 0 && line.slice(arrow + 3).trim().split(/\s+/).length > 1) { any = 'its cue positioning'; break; }
            }
            for (let p = text.indexOf('<'); !any && p >= 0;) {
                const q = text.indexOf('>', p);
                if (q < 0) break;
                if (!/^\/?[biu]$/i.test(text.slice(p + 1, q).trim())) any = 'its WebVTT voice, class, ruby or timing tags';
                p = text.indexOf('<', q + 1);
            }
        }
        let mp4 = any;
        if (!mp4) mp4 = ext === 'ass' ? 'its ASS styling' : ((/<font\b/i.test(text) || text.includes('{\\')) ? 'its font and positioning overrides' : '');
        return { any, mp4 };
    };

    // One read per sidecar answers every content question - hash identity (contentKey), cue emptiness (groupHasNoCues) and what importing it would drop
    // (importLosses) - mirroring embeddedTextHashes, whose one ffmpeg pass answers the first two for the embedded side. Memoised per rel. null = unreadable
    // or over the cap; each caller keeps its own failure direction (contentKey -> a unique never-merged key, groupHasNoCues -> false = not provably empty).
    // The size is checked FIRST: a name that merely parses as a sidecar says nothing about what is behind it, and a runaway OCR dump or a mis-renamed file left
    // as <video>.eng.srt would otherwise be pulled into the worker whole (the cap's why is at embeddedTextHashes).
    const sidecarContentMemo = new Map();
    const sidecarContent = (f) => {
        if (sidecarContentMemo.has(f.rel)) return sidecarContentMemo.get(f.rel);
        let out = null;
        try {
            const p = libPathOf(f.rel);
            const st = fs.statSync(p);
            if (st.isFile() && st.size <= SIDECAR_HASH_MAX) {
                const buf = fs.readFileSync(p);
                const text = buf.toString('utf8');
                out = {
                    sha1: subTextHash(buf, path.extname(f.rel)),
                    noCues: hasNoCues(text, f.ext),
                    loss: importLosses(text, f.ext),
                };
            }
        } catch (e) { out = null; }
        sidecarContentMemo.set(f.rel, out);
        return out;
    };

    // Source indices whose text decoded to no cues at all, filled in by embeddedTextHashes on the one pass it already makes. Only meaningful once that
    // call has returned, and it always has: dedupeEmbeddedSubs forces it first, so an unrun probe can never be mistaken for "no empty tracks".
    const embeddedEmptyIdx = new Set();
    // The same pass's cueSpan of every embedded text track it could read, keyed by source index: the yardstick existingSidecarVerdict holds a copy to.
    const embeddedSpan = new Map();
    // And the key of its cue TEXTS (cueTextKey): the yardstick a sidecar under any other spelling is held to (sameCueText, textDecides).
    const embeddedCues = new Map();

    // The CONTENT of every embedded text subtitle, as a sha1 keyed by source stream index - the only sound answer to "is this sidecar already in the file":
    // metadata cannot answer it in either direction (retitling changes every visible field while the text stays identical; two tracks can share language+title
    // with different text). One ffmpeg run extracts them all in a SINGLE pass through the same codec->format map the sidecars were written with. The bytes are
    // NOT directly comparable - ffmpeg re-serialises on the way out (CRLF folded, BOM dropped, cue numbers renumbered from 1), which is identical only for a
    // sidecar ffmpeg itself wrote - so every side hashes subTextForHash(), and a sidecar ffmpeg did not write is compared through its round trip
    // (sidecarRoundTripHash). Costs one sequential read (0.3s on an 885MB mkv), so callers only reach it with a real candidate - but the extract and
    // post-processing callers are gated on remove_source and the import on the marker or deduplicate (default on), so stock settings DO arrive here. An empty
    // map means "asked, found nothing"; null means the probe could not run, which every caller must read as "cannot prove anything" and import - a redundant
    // track is recoverable, a dropped one is not.
    let embeddedHashCache;
    const embeddedTextHashes = (subs) => {
        if (embeddedHashCache !== undefined) return embeddedHashCache;
        embeddedHashCache = null;
        const target = String(file._id || file.file || libFilePath || '');
        const wanted = subs.filter((s) => isTextSub(s));
        // The two are NOT the same answer, and every caller acts on the difference (see the contract above): with no path there is nothing to read, so the
        // probe could not run; a readable file that simply holds no text subtitle stream IS a run, and its empty map is positive evidence that no text
        // sidecar is embedded here.
        if (!target) return embeddedHashCache;   // null - the probe could not run
        if (!wanted.length) { embeddedHashCache = new Map(); return embeddedHashCache; }
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_subcmp_')); } catch (e) { return embeddedHashCache; }
        // Files rather than stdout: one run writing N outputs is one pass over the container, where N stdout captures would be N passes - and a large ASS
        // would sit against spawnSync's maxBuffer, reporting a failure that never happened.
        const args = ['-y', '-loglevel', 'error', '-i', target];
        const outs = new Map();
        for (const s of wanted) {
            const enc = TEXT_SUB[codecNameOf(s)];
            const out = path.join(dir, `s${s.index}.${enc.ext}`);
            // -fs is a per-OUTPUT byte cap, so it bounds this staging directory at write time rather than after the fact - see the SIDECAR_HASH_MAX
            // comment below for what it buys and why the ceiling sits one byte above the cap.
            args.push('-map', `0:${s.index}`, '-c:s', enc.enc, '-fs', String(SIDECAR_HASH_MAX + 1), out);
            outs.set(s.index, out);
        }
        const r = spawnSync(ffmpegPathOf(otherArguments), args,
            { encoding: 'utf8', timeout: SUB_EXTRACT_TIMEOUT_MS, maxBuffer: SPAWN_MAX_OUTPUT_BYTES });
        if (!r.error && r.status === 0) {
            const map = new Map();
            for (const [idx, out] of outs) {
                try {
                    // SIDECAR_HASH_MAX, the ceiling sidecarContent applies to the sidecar half: identical bytes must not be refused as a file on disk and
                    // accepted as a stream inside a container. Matroska allows per-track zlib compression, so a small mkv can hold a very large subtitle: 8.76
                    // MB of container expanded to 314 MB of srt through jellyfin-ffmpeg 7.1.4, and reading it took Tdarr's own Node runtime from 43 MB RSS to
                    // 629 MB, the Buffer and its UTF-8 copy alive together; past that, Node's own limits throw into this catch as a silent "no hash", so
                    // uncapped the worst case was a ~2.5 GiB peak that then evaporates. A missing hash fails SAFE - dedupeEmbeddedSubs never
                    // drops a stream it cannot hash, contentConfirms never authorises an unlink it cannot prove - and real text subtitles are kilobytes (a
                    // heavily typeset ASS a few MB), so this refuses no genuine one. The per-output -fs above enforces it at WRITE time: an oversized track
                    // truncates its own file at the first chunk past the limit - strictly ABOVE the cap, so this test still rejects it - while the other
                    // outputs complete, the run still exits 0, and ffmpeg stops reading once every output has capped. Without that bound this test governs only
                    // what is READ, leaving the pass free to stage N x (whatever the container decodes to) in os.tmpdir() first.
                    if (fs.statSync(out).size > SIDECAR_HASH_MAX) continue;
                    const buf = fs.readFileSync(out);
                    const text = buf.toString('utf8');
                    const ext = path.extname(out).replace('.', '');
                    embeddedSpan.set(idx, cueSpan(text, ext));
                    embeddedCues.set(idx, cueTextKey(text, ext));
                    // A track that decoded to no cues is EMPTY, not a duplicate. It gets no hash deliberately: every empty track would otherwise hash
                    // alike and be reported as a copy of the others, which describes the wrong problem and leaves one empty track standing.
                    if (hasNoCues(text, ext)) { embeddedEmptyIdx.add(idx); continue; }
                    map.set(idx, subTextHash(buf, path.extname(out)));
                } catch (e) {
                    /* a stream that could not be read simply has no hash, and matches nothing */
                }
            }
            embeddedHashCache = map;
        }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return embeddedHashCache;
    };

    // A sidecar's identity as the IMPORT will store it: the sidecar alone, muxed into the target's container the way the import mux does it (copied into
    // Matroska, converted to mov_text for mp4) and extracted back through TEXT_SUB like every embedded track. Its own text cannot stand in for that: ffmpeg
    // re-serialises far more than subTextForHash undoes - trimmed spaces, sorted cues, rewritten timestamps, a dropped vtt header, ass Comment lines moved,
    // every vtt/ass into mp4 back as srt - and each mismatch made the import add the same subtitle as one more track every cycle, never deleting the
    // sidecar. Re-serialised by ffmpeg itself, the two sides match by construction: on jellyfin-ffmpeg 7.1.4 this matched the real import's embedded copy
    // on all 34 shapes tried (17 srt/vtt/ass/ssa sidecars x mkv/mp4). The container step is required - decoding and re-encoding with none differed for
    // mov_text on 2 of them. Two short ffmpeg runs, memoised per target; null when either fails, and callers then have the sidecar's own text alone.
    const roundTripMemo = new Map();
    const sidecarRoundTripHash = (f, mp4) => {
        const key = `${mp4 ? 'mp4' : 'mkv'}|${f.rel}`;
        if (roundTripMemo.has(key)) return roundTripMemo.get(key);
        roundTripMemo.set(key, null);
        // An archive is not text, and a sidecar sidecarContent could not read (gone, or over the cap) is never handed to ffmpeg either.
        const enc = TEXT_SUB[mp4 ? 'mov_text' : EXT_TO_CODEC[f.ext]];
        if (f.bundle || !enc || !sidecarContent(f)) return null;
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_subrt_')); } catch (e) { return null; }
        const ff = (args) => spawnSync(ffmpegPathOf(otherArguments), ['-y', '-loglevel', 'error', ...args],
            { encoding: 'utf8', timeout: SUB_EXTRACT_TIMEOUT_MS, maxBuffer: SPAWN_MAX_OUTPUT_BYTES });
        const mux = path.join(dir, mp4 ? 'rt.mp4' : 'rt.mkv');
        const out = path.join(dir, `rt.${enc.ext}`);
        try {
            let r = ff(['-sub_charenc', 'UTF-8', '-i', libPathOf(f.rel), '-map', '0:0', '-c:s', mp4 ? 'mov_text' : 'copy',
                '-f', mp4 ? 'mp4' : 'matroska', mux]);
            if (!r.error && r.status === 0) r = ff(['-i', mux, '-map', '0:s:0', '-c:s', enc.enc, '-fs', String(SIDECAR_HASH_MAX + 1), out]);
            if (!r.error && r.status === 0 && fs.statSync(out).size <= SIDECAR_HASH_MAX) {
                roundTripMemo.set(key, subTextHash(fs.readFileSync(out), path.extname(out)));
            }
        } catch (e) { /* no round-trip identity - callers fall back to the sidecar's own text */ }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return roundTripMemo.get(key);
    };
    // A styled bundle's identity: the ASS inside it, read out the way embeddedTextHashes reads every embedded ass track. Import copies those packets in
    // unchanged (-map k:s:0, -c copy), so the bundle and its imported track hash alike by construction - the content test a bundle never had, which left
    // its NAME as the only evidence: a bundle whose subtitle carries a title the name does not spell (clean_and_remux's export writes no title token), or
    // one with no fonts at all, never matched its own imported track and was added again on every pass. The same run counts the bundle's font
    // attachments from ffmpeg's input listing ("Stream #0:1: Attachment: ttf", measured on 7.1.4), so a deletion knows whether the file must hold fonts
    // for nothing to be lost. Memoised per rel; null when the run fails, and callers then fall back to the name (metadataMatchesEmbedded).
    const bundleMemo = new Map();
    const bundleContent = (f) => {
        if (bundleMemo.has(f.rel)) return bundleMemo.get(f.rel);
        bundleMemo.set(f.rel, null);
        if (!f.bundle || !sidecarContent(f)) return null;   // gone, or over the cap
        const b = readBundleSubtitle(libPathOf(f.rel));
        if (b.state !== 'ok') return null;   // no content identity - callers fall back to the name
        const text = b.buf.toString('utf8');
        bundleMemo.set(f.rel, {
            // A subtitle with no cues gets no hash, exactly as embeddedTextHashes gives an empty track none - the name decides for it, as before.
            sha1: hasNoCues(text, 'ass') ? null : subTextHash(b.buf, '.ass'),
            fonts: b.fonts,
            span: cueSpan(text, 'ass'),
        });
        return bundleMemo.get(f.rel);
    };
    // Is this bundle's subtitle one of these embedded text hashes? true / false, or null when the bundle could not be read out.
    const bundleInFile = (f, hashes) => {
        const b = bundleContent(f);
        return b && b.sha1 ? new Set(hashes).has(b.sha1) : null;
    };
    // Which of a sidecar's two identities one of these embedded hashes carries: 'text' (its own text - the file holds it whole) or 'roundtrip' (what the
    // import stores - the file holds what ffmpeg KEPT of it), else null. The own-text test runs first and costs nothing; the round trip only on a miss.
    const sidecarMatch = (f, mp4, hashes) => {
        const set = new Set(hashes);
        const own = sidecarContent(f)?.sha1;
        if (own && set.has(own)) return 'text';
        const rt = sidecarRoundTripHash(f, mp4);
        return rt && set.has(rt) ? 'roundtrip' : null;
    };
    // remove_source deletes a sidecar only when nothing is lost by it. A 'text' match proves the file holds the whole subtitle; a 'roundtrip' match only
    // that it holds what the import kept, so a sidecar the import strips stays, and this names what deleting it would cost ('' = safe to delete).
    const deletionLoss = (f, how, mp4) => (how === 'roundtrip' ? (sidecarContent(f)?.loss?.[mp4 ? 'mp4' : 'any'] || '') : '');
    const keepForLossLine = (rel, loss) => `☒[remove_source=true] Keeping ${logSafe(rel)}: its text is in the file, but importing it dropped ${loss}`
        + ' - delete it yourself if you do not need that\n';
    // What a sidecar already at an extract's name is worth when remove_source is about to strip the stream it copies - an earlier run's file there would
    // otherwise become the ONLY copy, unexamined. { state }: 'whole' when it holds this stream's text exactly, or when its cues reach the stream's own end
    // (an edit that kept the timeline - trusted, as it always was); 'aborted' when it is empty, cue-less, or a bundle ffmpeg cannot decode while the stream
    // has cues - what an interrupted run leaves (readBundleSubtitle); 'short' (+ end, streamEnd) when its cues stop more than CUE_SPAN_SLACK_S before the
    // stream's own - a run that failed partway still finalises its outputs, and an edit can cut the tail, so neither may take the only copy; 'unreadable'
    // when its text holds a NUL beside other text (unreadableText); 'unknown' when either side could not be read, and the caller keeps its old answer.
    const existingSidecarVerdict = (s, rel, bundle, subs) => {
        const hashes = embeddedTextHashes(subs);
        const span = embeddedSpan.get(s.index);
        if (!hashes || !span) return { state: 'unknown' };
        const ext = bundle ? 'ass' : path.extname(rel).slice(1).toLowerCase();
        let buf = null;   // the copy's decoded text; null = a bundle ffmpeg could not decode
        if (bundle) {
            const b = readBundleSubtitle(libPathOf(rel));
            if (b.state === 'unknown') return { state: 'unknown' };
            if (b.state === 'ok') ({ buf } = b);
        } else {
            try { buf = Buffer.from(readTextCapped(libPathOf(rel), SIDECAR_HASH_MAX), 'utf8'); } catch (e) { return { state: 'unknown' }; }
            if (unreadableText(buf.toString('utf8'))) return { state: 'unreadable' };
        }
        const own = hashes.get(s.index);
        if (buf && own && subTextHash(buf, `.${ext}`) === own) return { state: 'whole' };
        const copy = buf ? cueSpan(buf.toString('utf8'), ext) : { cues: 0, end: 0 };
        if (!copy.cues) return { state: span.cues ? 'aborted' : 'whole' };   // an empty copy of an empty stream is a copy
        return copy.end < span.end - CUE_SPAN_SLACK_S ? { state: 'short', end: copy.end, streamEnd: span.end } : { state: 'whole' };
    };
    // Whether that verdict says an interrupted run left the file: nothing decodable where the stream has cues, or unreadable and empty.
    const leftIncomplete = (verdict, rel) => verdict.state === 'aborted' || (verdict.state === 'unknown' && !fileHasBytes(libPathOf(rel)));
    // The duplicates deduplicate=enabled_checkmedia removes this pass (the extract fills it): they leave the file, so the text they share with their keeper
    // is the keeper's alone (measured: counted, they stopped the folded keeper adopting either earlier sidecar, and a third was written for one track).
    const droppedDuplicates = new Set();
    // Whether this stream's text can decide what a file holds: the same pass read it (embeddedTextHashes), it has cues, and no other stream the file keeps
    // holds the same cue texts - two streams that share a text cannot tell their files apart, so neither adopts a file by it.
    const textDecides = (s, subs) => {
        if (!embeddedTextHashes(subs) || !embeddedCues.has(s.index) || embeddedEmptyIdx.has(s.index)) return false;
        const key = embeddedCues.get(s.index);
        return ![...embeddedCues].some(([i, k]) => i !== s.index && !droppedDuplicates.has(i) && k === key);
    };
    // Whether the file at p (rel names it, for its extension) holds no text while the stream has cues: 0 bytes, or no cue its text decodes to - what an
    // interrupted run leaves. Replacing it loses nothing, and one left beside a new sidecar fails the next import. The stream is read only for a file that
    // holds no cue, so a library already extracted pays for no ffmpeg pass; a bundle with bytes is judged under remove_source=true only
    // (existingSidecarVerdict). Never through a symbolic link; false whenever either side cannot be read, or its text holds a NUL beside other text.
    const emptyCopyAt = (s, p, rel, bundle, subs) => {
        try { if (isSymlinkAt(p) || !fs.statSync(p).isFile()) return false; } catch (e) { return false; }
        if (fileHasBytes(p)) {
            if (bundle) return false;
            let text = '';
            try { text = readTextCapped(p, SIDECAR_HASH_MAX); } catch (e) { return false; }
            if (unreadableText(text) || cueSpan(text, path.extname(rel).slice(1).toLowerCase()).cues) return false;
        }
        return !!embeddedTextHashes(subs) && embeddedCues.has(s.index) && !embeddedEmptyIdx.has(s.index);
    };
    // Whether the file at p holds this stream's subtitle by its cue texts (cueTextKey, against the same pass's read of the stream, which must decide -
    // textDecides): what a sidecar under any spelling but the current one and the previous sub_worker's titled or role-token one must show before it stands in
    // for the track (sidecarByText, earlierSidecarNames). p is the library's file, never read through a symbolic link, or a copy the file API route downloaded
    // (cueTextRemote); rel names it, for its extension. false whenever either side cannot be read, or its text holds a NUL beside other text.
    const sameCueText = (s, p, rel, bundle, subs) => {
        if (isSymlinkAt(p) || !textDecides(s, subs)) return false;
        let text = '';
        if (bundle) {
            const b = readBundleSubtitle(p);
            if (b.state !== 'ok') return false;
            text = b.buf.toString('utf8');
        } else {
            try { text = readTextCapped(p, SIDECAR_HASH_MAX); } catch (e) { return false; }
        }
        return !unreadableText(text) && cueTextKey(text, bundle ? 'ass' : path.extname(rel).slice(1).toLowerCase()) === embeddedCues.get(s.index);
    };
    // The same two tests where the node has no library view: the file is downloaded into a private staging directory, and curl refuses one past
    // SIDECAR_HASH_MAX before writing any of it (downloadLibraryFile), as embeddedTextHashes caps its own staging - uncapped, an 80 MiB file at a candidate
    // name was fetched whole before the read refused it (measured). 'same' when its cue texts are this stream's, 'empty' when the server holds it with no
    // text while the stream has cues, else 'other' - also whenever either side cannot be read.
    const cueTextRemote = (s, rel, bundle, subs) => {
        const dest = serverDestFor(rel);
        if (!dest) return 'other';
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_subcue_')); } catch (e) { return 'other'; }
        const local = path.join(dir, `c${path.extname(rel).replace(/[^.a-z0-9]/gi, '')}`);
        const got = downloadLibraryFile(dest, local, SIDECAR_HASH_MAX);
        let answer = 'other';
        if (got.ok) answer = sameCueText(s, local, rel, bundle, subs) ? 'same' : (emptyCopyAt(s, local, rel, bundle, subs) ? 'empty' : 'other');
        else if (got.empty && embeddedTextHashes(subs) && embeddedCues.has(s.index) && !embeddedEmptyIdx.has(s.index)) answer = 'empty';
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return answer;
    };
    // The previous sub_worker's own spelling (2) where the node has no library view: sidecarExistsRemote's answer, the copy fetched with the same cap and
    // judged as emptyCopyAt judges a library file - with bytes but no cue it is empty, never adopted by name (measured: adopted, it let remove_source=true
    // take out the stream, and every import then failed on it). `unreadable` when its text holds a NUL beside other text (unreadableText).
    const ownSpellingRemote = (s, rel, bundle, subs) => {
        let dir = '';
        try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_subcue_')); } catch (e) { dir = ''; }
        const local = dir ? path.join(dir, `c${path.extname(rel).replace(/[^.a-z0-9]/gi, '')}`) : '';
        const answer = sidecarExistsRemote(serverDestFor(rel), local, SIDECAR_HASH_MAX);
        const empty = !!answer.empty || (answer.state === 'present' && emptyCopyAt(s, local, rel, bundle, subs));
        let text = '';
        try { text = answer.state === 'present' && !bundle ? readTextCapped(local, SIDECAR_HASH_MAX) : ''; } catch (e) { text = ''; }
        if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ } }
        return { ...answer, empty, unreadable: unreadableText(text) };
    };
    // Whether two of this video's sidecar names restore a track the same way on import - the same title, language and flags, whatever their index. Under
    // remove_source=true the file found by its text becomes the track's only copy, so one spelling the track as it was brought back its old title and
    // dropped a flag set since (measured: a hearing_impaired flag tag_disposition set between two extracts, a retitle, a forced flag).
    const sameSpelledTrack = (a, b) => {
        const p = parseSidecar(a); const q = parseSidecar(b);
        const flags = (x) => [...new Set(x.disp)].sort().join();
        return !!p && !!q && p.title === q.title && langKey(p.lang) === langKey(q.lang) && flags(p) === flags(q);
    };
    // Where this node can read the library: any other file beside the video whose name parses as one of this video's sidecars (parseSidecar, an s<N> anchor at
    // any index) in the stream's language and format, under any title and any tokens, stands in when its cue texts are this stream's (sameCueText) - the
    // spelling a reorder, a container conversion, an import into .mov or a flag tag_disposition added gave the same track. A name another stream takes by name
    // (claimed) is passed over, so two streams never share one file. The enumerated earlier spellings (order) are tried first, then the rest by name, so every
    // node picks the same file. The stream is read (embeddedTextHashes) only when a candidate is there, so a first extract pays for no ffmpeg pass. null when
    // none qualifies, or the directory cannot be listed.
    const sidecarByText = (s, current, order, bundle, subs, claimed) => {
        const want = parseSidecar(current);
        if (!want) return null;
        let listed = [];
        try { listed = fs.readdirSync(workLibDir()).sort(); } catch (e) { return null; }
        const here = new Set(listed);
        const tried = new Set([current]);
        const candidates = [];
        for (const n of [...order.filter((x) => here.has(x)), ...listed]) {
            if (tried.has(n) || claimed.has(n)) continue;
            tried.add(n);
            const p = parseSidecar(n);
            if (!p || p.index === null || p.bundle !== bundle || p.ext !== want.ext || langKey(p.lang) !== langKey(want.lang)) continue;
            try { if (fs.statSync(libPathOf(n)).isFile()) candidates.push(n); } catch (e) { /* gone since the listing */ }
        }
        if (!candidates.length || !textDecides(s, subs)) return null;
        return candidates.find((n) => sameCueText(s, libPathOf(n), n, bundle, subs)) || null;
    };

    // deduplicate=enabled_checkmedia: the same duplicate test turned on the file's OWN tracks. Two subtitle streams holding identical text are one subtitle
    // stored twice, however their tags read, and this is the only place in the plugin that removes a subtitle the user did not ask to extract - which is why it
    // is its own opt-in value rather than part of enabled_only_sidecar. The survivor is chosen by the sidecar groups' rule: lowest source index wins, and it
    // inherits the union of the group's flags plus the first title and first real language any member carries - identical text, every tag folded onto the
    // keeper, so nothing is lost. Returns the source indices to drop and, only when the union differs from what the keeper already has, the metadata to restamp
    // it with. The title is the first a member holds outside its handler (titleOutsideHandler: an mkv title tag, the udta part of an mp4 or mov mediaInfo
    // Title), even one equal to its handler, and only with none the first named handler - mediaTitleFor's ranking within one track - so a release name in the
    // keeper's HANDLER_NAME never displaces a duplicate's real title ('English SDH', whose SDH role would go with it), and a keeper titled as its handler names
    // keeps that title rather than take a duplicate's. The fold's line names it as the output holds it (foldedStream: a non-ASCII .mov title reads as the
    // handler), in escMeta's form ('Say "Hi"' is written and named "Say 'Hi'").
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
            const title = ordered.map((s) => titleOutsideHandler(s)).find(Boolean) || ordered.map((s) => mediaTitleFor(s)).find(Boolean) || '';
            const lang = ordered.map((s) => resolveLang(s) || '').find((l) => l && l !== 'und') || (resolveLang(keep) || 'und');
            const keepDisp = new Set(activeDispositions(keep));
            const sameDisp = sameDispositions(keepDisp, disp);
            if (sameDisp && mediaTitleFor(keep) === title && langKey(resolveLang(keep) || 'und') === langKey(lang)) continue;
            const entry = { index: keep.index, lang, title, disp: [...disp] };
            out.retag = (out.retag || []).concat([entry]);
            out.log += `☐${streamTag(keep.index)}[deduplicate=enabled_checkmedia] Folding the removed streams' tags onto it (${
                [logSafe(lang), logSafe(escMeta(foldedStream([entry], keep).tags.title)), ...disp].filter(Boolean).join(' ')})\n`;
        }
        return out;
    };

    // The title test metaMatchesStream and the import retune share: the title extract names a sidecar from (mediaTitleFor, a track an mp4 -> mkv conversion
    // left named only by a HANDLER_NAME tag included) against the sidecar's title as the name gives it (nameTextOf) - the track it was extracted from - or as
    // titleMetaArgs writes it, in escMeta's form - the track it was imported as: a double quote goes in as ', so that track never matched, and an import beside
    // it added a copy, or retagged it, on every pass (measured). A name with no title agrees with a track named by its HANDLER_NAME alone, since an extract
    // that read no handler names gave it no title token (and a user may untitle one), and the title an import writes cannot clear a handler - so a mismatch
    // there would retag the same track, or report it, on every pass (measured).
    const titleAgrees = (s, title) => [nameTextOf(title), escMeta(nameTextOf(title))].includes(mediaTitleFor(s))
        || (!nameTextOf(title) && !titleBesideHandler(s));
    // Does stream s carry the language + title our import writes for sidecar or marker entry m? Language alone on an mp4-family target: a subtitle imported
    // there by a plugin that wrote no handler name lost its title on the next remux, and matching on the title would import it a second time.
    const metaMatchesStream = (s, m, mp4) => langKey(resolveLang(s) || 'und') === langKey(m.lang || 'und') && (mp4 || titleAgrees(s, m.title));
    // Does a marker-listed sidecar RESEMBLE something in the file? The marker records what the last import muxed; only an extract that takes a subtitle
    // OUT removes its entry (see the extract branch), and the value is ordinary container metadata any file can carry, so both readers confirm it against
    // the streams as they stand rather than trusting it. This is the METADATA half (metaMatchesStream). A bundle additionally has to see a font attachment
    // - carrying fonts is its reason to exist. Metadata can only say "something like this is here", never "this one is here" (an edited sidecar keeps its
    // name and matches just as well), so a DELETION trusts it alone only for a bundle whose subtitle cannot be read out (bundleContent); the import skip
    // also leans on it when the text cannot be read, since a wrong skip loses nothing. Otherwise the sidecar's own bytes must be one of the tracks. Only a
    // TEXT subtitle can stand in for a loose sidecar - a PGS/VobSub track holds pictures, however well its metadata matches.
    const metadataMatchesEmbedded = (f, subs, anyFont, mp4Target) => (!f.bundle || anyFont)
        && subs.filter((s) => f.bundle || isTextSub(s)).some((s) => metaMatchesStream(s, f, mp4Target));

    // The subtitle list is a file the USER may have typed into, so it is removed only once it demonstrably has nothing left to say: every name in it gone
    // from disk AND at least one of them a sidecar we actually embedded. Both halves matter - the first makes a hand-added or mistyped line protective
    // (it names a file still there, so the list stays and the user can fix it), the second proves the list did its job. Deliberately NOT conditioned on
    // method_unmapped: a list written by a text_file run and imported through mount is exactly as spent. Nothing is lost either way - a text_file extract
    // seeds a fresh one when it next needs it.
    const deleteSpentSubtitleList = (delReason, marked) => {
        const listPath = libPathOf(subtitleListName);
        let text;
        try { text = readTextCapped(listPath, SUBTITLE_LIST_MAX); } catch (e) {   // no list at all is the normal case, and says nothing
            return e && (e.overCap || e.notRegular) ? `☒[${delReason}] Leaving ${subtitleListName} in place - ${e.message}\n` : '';
        }
        const entries = readSubtitleList(text).ok;
        if (!entries.length || !entries.some((n) => marked.has(n))) return '';
        if (entries.some((n) => fs.existsSync(libPathOf(n)))) return '';
        try { fs.unlinkSync(listPath); return `☑[${delReason}] Deleted ${subtitleListName} - every sidecar it listed is now in the file\n`; }
        catch (e) { return `☒[${delReason}] Could not delete ${subtitleListName}: ${logPath(e && e.message ? e.message : e)}\n`; }
    };
    // ====== END SIDECAR SCAN / HASH / DEDUP ======

    // #region SHARED helpers (2 sections: closed-caption probe … closed-caption handoff)
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

    // Tdarr hands a plugin otherArguments.ffmpegPath and nothing else, and it is not always a path to a file named ffmpeg: Tdarr's Linux Docker image hands
    // the bare command 'tdarr-ffmpeg', a PATH link into the jellyfin-ffmpeg install, whose ffprobe sits beside the REAL binary - a name test accepting only
    // 'ffmpeg' leaves every Docker node without a caption probe, so guard_captions never protects there. The probe is the ffmpeg name with 'ffmpeg' in the
    // FINAL component swapped for 'ffprobe' (ffmpeg -> ffprobe, tdarr-ffmpeg -> tdarr-ffprobe, ffmpeg.exe -> ffprobe.exe), looked for beside the path as
    // given (a bare command resolved through PATH first) and then beside the target it links to. Only the final component: the production path carries
    // 'ffmpeg' as a DIRECTORY too (.../assets/app/ffmpeg/darwin_arm64/ffmpeg). A name with no 'ffmpeg' in it, or a derived file that is not there, gives ''
    // - never ffmpeg itself, which run with ffprobe's arguments would misreport the failure as an unreadable file. Every caller reads '' as "unknown".
    const deriveFfprobePath = (ffmpegPath) => {
        const given = String(ffmpegPath || '').trim();
        if (!given) return '';
        const pathMod = require('path');
        const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
        const token = 'ffmpeg';   // the part of the final component swapped for 'ffprobe'
        const swap = (p) => {
            const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
            const base = p.slice(cut + 1);
            const at = base.toLowerCase().lastIndexOf(token);
            return at < 0 ? '' : `${p.slice(0, cut + 1)}${base.slice(0, at)}ffprobe${base.slice(at + token.length)}`;
        };
        let resolved = given;
        if (!/[\\/]/.test(given)) {   // a bare command is a PATH lookup, so resolve it the way the OS would
            const exts = process.platform === 'win32' ? ['', ...String(process.env.PATHEXT || '.EXE').split(';').filter(Boolean)] : [''];
            const dirs = String(process.env.PATH || '').split(pathMod.delimiter).filter(Boolean);
            resolved = dirs.flatMap((d) => exts.map((x) => pathMod.join(d, given + x))).find(isFile) || '';
            if (!resolved) return '';
        }
        const candidates = [swap(resolved)];
        try { candidates.push(swap(fs.realpathSync(resolved))); } catch (e) { /* an unresolvable link leaves the first candidate only */ }
        return candidates.find((c) => c && isFile(c)) || '';
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
    //   none     - the caption channel was decoded and carried no caption text at all, so no later pass need pay for that decode again. Written only
    //              once BOTH fields have been read empty: a broadcast carrying its captions in field 2 behind a padded field 1 reads empty on the default
    //              decode, and a later re-encode told `none` drops captions nothing ever captured.
    //   decoded  - a full read of the caption channel finished (field auto-selected); decoded2 - a read of field 2 finished. sub_worker's own progress
    //              memos, stamped by the pass that runs the read: an empty sidecar with neither behind it was left by an interrupted read, not by an
    //              empty channel. Every other reader ignores them.
    //   imported - the captions are already embedded as a real subtitle track, so sub_worker must not read them out a second time.
    const CC_TOKENS = { strip: 'strip', removed: 'removed', none: 'none', decoded: 'decoded', decoded2: 'decoded2', imported: 'imported' };
    // The value is a COMMA LIST and every reader splits it, because the states genuinely combine: an imported round trip that could not strip in its own pass
    // records `imported,strip` - and `imported,removed` where it could. An empty channel records `none` ALONE - it never owes a strip. A writer therefore
    // EXTENDS the tag rather than replacing it with one token - a whole-value overwrite would erase a pending request instead of deferring it. A REQUEST is
    // retired by whoever SERVES it, and only then: video_clean rewrites `strip` to `removed` on the encode that carries the removal out. Without that the tag
    // only ever grows, and a satisfied request is indistinguishable from a fresh one - a file that later regains captions (a re-muxed capture, an external tool
    // re-inserting A53 SEI) has them dropped by a request answered encodes ago. `none` and `imported` are never retired: memos about the file, not requests,
    // they stay true for its life.
    const ccTokensOf = (tags) => getTagCI(tags || {}, CC_TAG).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    // ===== END SHARED: closed-caption handoff =====
    // #endregion

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
    // cc_dec's field selector, an input option on the lavfi caption source. Its default (auto) locks onto whichever field it meets first, so a broadcast
    // that pads field 1 and carries its captions in field 2 decodes to nothing; this reads field 2 instead (measured on jellyfin-ffmpeg 7.1.4).
    const CC_FIELD2_ARGS = ['-data_field', '1'];
    const ccLavfiArgs = (field2) => [...(field2 ? CC_FIELD2_ARGS : []), '-f', 'lavfi', '-i',
        `movie=${escapeMoviePath(String(file._id || file.file || ''))}[out0+subcc]`, '-map', '1:s:0', '-c:s', 'text', '-f', 'srt'];
    // The same read as the two mapped routes' preset input, field 2 when asked.
    const ccPresetInput = (field2) => `${field2 ? `${CC_FIELD2_ARGS.join(' ')} ` : ''}-f lavfi -i "movie=${escapeMoviePath(file.file)}[out0+subcc]" `;
    // The one wording for "the caption channel was read out to this sidecar", shared by the same two routes.
    const ccReadLine = (videoIdx, name) => `☑${streamTag(videoIdx)}[embedded_cc=enabled] Read the embedded closed captions -> ${name}\n`;
    // ====== END EMBEDDED CLOSED CAPTIONS ======

    // #region SHARED helpers (2 sections: special language code … language token recognition)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: special language code =====
    // -=-=-= isNonLang  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The special / non-language ISO 639-2 codes plus the qaa-qtz private-use range: und (undetermined), mul (multiple), zxx (no linguistic content),
    // mis (uncoded). One predicate so every consumer agrees on the set - knownLangToken ACCEPTS these in the free-text language lists, and clean_and_remux
    // accepts them in language_sub, refuses them in language_fill, and passes them unrewritten through tag canonicalisation. Drift the set in one spelling
    // and one settings string would mean different things at different pipeline stages.
    const isNonLang = (k) => k === 'und' || k === 'mul' || k === 'zxx' || k === 'mis' || /^q[a-t][a-z]$/.test(k);
    // ===== END SHARED: special language code =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: language token recognition =====
    // -=-=-= knownLangToken  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // Is an already-folded langKey a recognised language token: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to one base code), or
    // one of the special/private codes isNonLang accepts (load-bearing rather than laxness: stream language tags carry them, so a list has to be able to name
    // them). Why an unrecognised token STOPS the file is per-plugin and stays above this section, since it depends on what that plugin's input scopes; the
    // message itself is failLangToken.
    const knownLangToken = (key) => isNonLang(key) || !!langDisplayName(key);
    // ===== END SHARED: language token recognition =====
    // #endregion

    // ====== GUARDS + INPUT VALIDATION (before the try, per the suite's failFile convention) ======
    // WHICH STAGE this is. The plugin declares no Stage, so Tdarr runs it in both stacks; post-processing is handed exactly {homePath, handbrakePath,
    // ffmpegPath, mkvpropeditPath, originalLibraryFile}, and homePath is the discriminator because it is POSITIVE evidence - it appears nowhere else.
    // Testing for the ABSENCE of configVars/job would misread any caller that simply passes less (the flow shim passes no configVars at all, and would
    // take the delete-only path on a normal transcode); the two negatives stay as corroboration, so a release that adds homePath to pre-processing cannot
    // silently flip the branch. This stage can legitimately arrive without ffProbeData, so the probe guard below belongs to pre-processing alone.
    const isPostProcessing = !!otherArguments?.homePath && !otherArguments?.configVars && !otherArguments?.job;
    if (!isPostProcessing && (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))) {
        failFile('No ffProbe stream data available, cannot process this file');
    }
    const action = ddValue(inputs.action, 'import');
    // Deleting the sidecar FILES is remove_source's decision alone in every mode - deduplicate only ever decides what counts as a duplicate. An unrecognised
    // value FAILS the file rather than falling through to a default, since the three modes do materially different amounts of work and a typo must not
    // quietly pick one. That is true of every dropdown here, which is why they are validated together below.
    const dedupeMode = ddValue(inputs.deduplicate, 'enabled_only_sidecar');
    const dedupeSidecars = dedupeMode !== 'disabled';          // both enabled values collapse byte-identical sidecars and skip one already embedded
    const dedupeStreams = dedupeMode === 'enabled_checkmedia'; // only this one reads the file's own tracks, to find a duplicate or an empty one
    const ccMode = ddValue(inputs.embedded_cc, 'disabled');
    const metadataMode = ddValue(inputs.method_import_metadata, 'embedded');
    const unmappedMode = ddValue(inputs.method_unmapped, 'error');
    // Every dropdown's accepted set, as ONE table driving the shared checkDropdowns loop: input_surface_diff.js locates each validator here to report an
    // accepted-but-not-offered value, and a retired value must STOP the file (CLAUDE.md's retired-option policy). The message names the NORMALISED value, as
    // the other four plugins do.
    const dropdownChecks = [
        ['action',                 action,        ['extract', 'import']],
        ['deduplicate',            dedupeMode,    ['disabled', 'enabled_only_sidecar', 'enabled_checkmedia']],
        ['embedded_cc',            ccMode,        ['disabled', 'enabled']],
        ['method_import_metadata', metadataMode,  ['embedded', 'sidecar']],
        ['method_unmapped',        unmappedMode,  ['error', 'mount', 'text_file']],
    ];
    checkDropdowns(dropdownChecks);
    // Only a video: '' (a file Tdarr could not classify) skips too, as in the other four - the post-processing pass included, whose file object Tdarr
    // builds with the same scan that sets fileMedium.
    if (file.fileMedium !== 'video') return skip('☑File is not a video\n');
    // A language token that is not a language FAILS the file. only_languages scopes which subtitles are touched at all, so a typo ('eng,fer') silently matches
    // nothing and every subtitle in that language is quietly left out of the extract - the user gets a clean run that did none of the work they asked for, with
    // no way to tell it apart from a file that genuinely had no such subtitle. Stopping is the far cheaper failure. The und/mul/zxx/mis/qaa-qtz allowance is
    // load-bearing, NOT laxness: the filter is compared against langKey(resolveLang(s) || 'und'), so scoping on 'und' is how untagged subtitles are selected.
    const onlyLangRaw = splitList(inputs.only_languages);
    checkLangLists([['only_languages', onlyLangRaw]]);

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
    // ====== END GUARDS + INPUT VALIDATION ======

    // ====== POST-PROCESSING: remove sidecars now that the import is ACCEPTED ======
    // The only hook that runs after Tdarr's accept gate, and so the only place remove_source may act. Deleting during pre-processing would
    // destroy the sidecars of a transcode the user then REJECTS: the muxed copy goes with the work directory and the library file never had
    // those subtitles, so they would exist nowhere. This stage also runs SERVER-side, which is what lets it clean up on behalf of an
    // UNMAPPED node - the file API offers upload and download but nothing that removes a path, while the server simply has the library on
    // disk. Nothing here may throw: the post-processing runner swallows exceptions, so a throw would be invisible. Nothing here needs to
    // either - a delete that fails leaves a sidecar the marker already excludes from re-import, and the next pass over this file retries it.

    // The streams and global tags of the file as it stands NOW. Pre-processing is always handed ffProbeData; the post-processing stage may not be, so fall
    // back to running ffprobe here - otherArguments supplies ffmpegPath and ffprobe sits beside it under the matching name. null means neither route
    // worked, which the caller must read as "cannot confirm what is embedded" and therefore delete nothing.
    const PROBE_TIMEOUT_MS = 300000;   // the ceiling on its ffprobe: it scales with the container, and is a ceiling on a hang, not a target
    const probeCurrentFile = () => {
        const ff = file.ffProbeData;
        if (ff && Array.isArray(ff.streams)) return { streams: ff.streams, tags: ff.format?.tags || {} };
        const target = String(file._id || file.file || libFilePath || '');
        if (!target) return null;
        // The shared deriveFfprobePath, not a second hand-rolled regex: it replaces only the FINAL path component (the
        // production path carries 'ffmpeg' as a DIRECTORY too), checks that the result is a regular file (isFile), and returns
        // '' when the binary cannot be located. A lenient local regex that let an unexpected basename slip through to the
        // unmodified ffmpeg path would run FFMPEG with ffprobe's arguments and misreport the failure as an unreadable file.
        const ffprobePath = deriveFfprobePath(ffmpegPathOf(otherArguments));
        if (!ffprobePath) return null;
        const r = spawnSync(ffprobePath, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', target],
            { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, maxBuffer: SPAWN_MAX_OUTPUT_BYTES });
        if (r.error || r.status !== 0) return null;
        try {
            const j = JSON.parse(r.stdout); return Array.isArray(j.streams) ? { streams: j.streams, tags: j.format?.tags || {} } : null;
        } catch (e) { return null; }
    };

    // remove_source's actual deletion. Called ONLY from the post-processing pass, once Tdarr has accepted the transcode and moved it into the library, so the
    // embedded copy is the one that survives. This unlink is the one irreversible thing the plugin does, so each marker-listed sidecar has to be proved against
    // the accepted file's own text before it goes; the marker VALUE still scopes deletion to names we listed, so no file outside this video's sidecars is ever
    // a candidate. A false negative merely keeps the sidecar (a later pass, or the user, removes it) and never loses subtitle content, so this fails safe.
    const deleteImportedSidecars = (streamList, globalTags, mp4Target) => {
        const delReason = 'remove_source=true';   // this pass only runs when removal is on
        const marked = new Set(decodeMarkerList(getTagCI(globalTags || {}, SUB_MARKER_TAG)));
        if (!marked.size) return { deleted: 0, log: '' };
        const scan = scanSidecarDirs();
        if (scan.err) {
            return { deleted: 0, log: `☒[${delReason}] Cannot read the library directory to remove imported sidecars: `
                + `${logPath(scan.err.message || scan.err)}\n` };
        }
        const embedded = streamList.filter((s) => codecTypeOf(s) === 'subtitle');
        const anyFont = streamList.some((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s));
        // Language + title is a proxy for "this is in the file"; the TEXT is the fact itself, and only the fact may authorise an unlink. So the content test
        // is the ONLY one for an ordinary sidecar; a bundle is proved by the subtitle inside it plus, when it carries fonts, fonts in the file - the metadata
        // match serves only a bundle that cannot be read out. That is also what lets a copy the user named themselves be cleaned up: its title matches no
        // track by construction, yet its content is provably one of them. The hashes cost one pass over the accepted library file on every successful round
        // trip - the price of never unlinking a sidecar on a resemblance. `confirmedWhy` returns the REASON it may go, for the deletion line to report.
        let hashes;
        // 'text' / 'roundtrip' / null - which identity proved it (sidecarMatch); the loop below keeps a round-trip match the import stripped.
        const contentConfirms = (f) => {
            if (f.bundle) return null;
            if (hashes === undefined) hashes = embeddedTextHashes(embedded);
            if (!hashes || !hashes.size) return null;
            return sidecarMatch(f, mp4Target, hashes.values());
        };
        const confirmedWhy = (f) => {
            if (!f.bundle && contentConfirms(f)) return 'its text is in the file';
            // A loose sidecar the text cannot confirm STAYS - whether the probe ran and found no such text, or could not run at all. A failed probe must never
            // hand the unlink to the resemblance instead: the same file whose marker names the sidecar can make the probe fail (one text cue past the
            // extractor's 1 MiB event buffer exits 190), so a forged marker plus a forced failure would delete a sidecar that was never embedded anywhere.
            if (!f.bundle) return '';
            if (hashes === undefined) hashes = embeddedTextHashes(embedded);
            const b = bundleContent(f);
            // A bundle whose subtitle WAS read out fails closed the same way: with the file's probe failed (hashes null) its content cannot be compared, and
            // the resemblance is exactly what that forced failure would hand the unlink to. Only a bundle that cannot be read out falls back to metadata.
            if (b && b.sha1) return hashes && bundleInFile(f, hashes.values()) && (b.fonts === 0 || anyFont) ? 'its subtitle is in the file' : '';
            return metadataMatchesEmbedded(f, embedded, anyFont, mp4Target) ? 'the file carries a matching subtitle' : '';
        };
        let deleted = 0; let log = '';
        for (const f of scan.rels.map(parseSidecarRel).filter(Boolean).filter((x) => marked.has(x.rel))) {
            const why = confirmedWhy(f);
            if (!why) {
                log += `☒[${delReason}] Marker lists ${logSafe(f.rel)} but nothing in the file is confirmed to be it${
                    hashes === null ? " (the file's subtitle text could not be read)" : ''} - not deleting (unverified)\n`;
                continue;
            }
            const loss = deletionLoss(f, contentConfirms(f), mp4Target);
            if (loss) { log += keepForLossLine(f.rel, loss); continue; }
            try { fs.unlinkSync(libPathOf(f.rel)); deleted += 1; log += `☑[${delReason}] Deleted sidecar (${why}): ${logSafe(f.rel)}\n`; }
            catch (e) { log += `☒[${delReason}] Could not delete sidecar ${logSafe(f.rel)}: ${logPath(e && e.message ? e.message : e)}\n`; }
        }
        log += deleteSpentSubtitleList(delReason, marked);
        return { deleted, log };
    };

    if (isPostProcessing) {
        // Only the import workflow ends in a deletion. In extract mode this pass must do nothing at all: extract WRITES the sidecars, and with
        // remove_source off the embedded subtitles stay too - so a stale marker from an earlier import would confirm against those still-embedded
        // streams and delete the sidecar that was just written.
        if (action !== 'import') return skip(`☑[action=${action}] Nothing for post-processing to do outside import\n`);
        if (!removeSource) return skip('☑[remove_source=false] Imported sidecars left on disk\n');
        const probed = probeCurrentFile();
        if (!probed) return skip('☒[remove_source=true] Cannot read the accepted file to confirm what is embedded - every sidecar is left in place\n');
        const { log } = deleteImportedSidecars(probed.streams, probed.tags, isMp4);
        return skip(log ? `☑[remove_source=true] Working in ${logPath(workLibDir())}\n${log}`
            : `☑[remove_source=true] No imported sidecar is waiting to be removed\n`);
    }
    // ====== END POST-PROCESSING ======
    if (outputMuxerArg(dstContainer) === null) return skip(noMuxerSkipLine(dstContainer));   // an extension no muxer writes back (outputMuxerArg)

    // ====== SUBTITLE METADATA / RETAG ARGS ======
    // The one rule for writing a subtitle language into the output container: mp4 folds to /T (to6392T), mkv keeps the sidecar spelling (normSidecarLang),
    // and mov goes through movLangCode - the shared 'mov language remap' section has the why. escMeta guards the value either way.
    const langMetaValue = (l) => escMeta(dstContainer === 'mov' ? movLangCode(l) : isMp4 ? to6392T(l) : normSidecarLang(l));
    // Everything this plugin writes onto a subtitle stream, for ONE stream. Two callers reach it - the duplicate fold below and the sidecar-metadata retune -
    // and they must agree on both load-bearing rules: outIdx is the position among the SURVIVING subtitle streams, which is what -map 0 minus the drops
    // leaves; and an empty disposition set is written as the explicit 0 sentinel rather than omitted, or a flag the fold dropped would silently come back.
    // A null title writes none (the mp4 retune; the shared name carry restates the track's own); handler is the one titleMetaArgs writes beside it.
    const retagOne = (outIdx, lang, title, disp, handler) => ` -metadata:s:s:${outIdx} "language=${langMetaValue(lang)}"`
        + (title === null ? '' : titleMetaArgs('s', outIdx, title || '', dstContainer, handler))
        + ` -disposition:s:${outIdx} ${disp.length ? disp.join('+') : '0'}`;
    // The handler a fold writes beside its title on an mp4-family output: the shared handlerFor, so a handler naming a role the folded title lacks stays
    // (null - nothing written, the title restated beside it) exactly as the name carry would leave it; undefined off the mp4 family, which has no handler.
    // Measured on a keeper named "SDH" in its handler and "English" in udta: "English" written over the handler takes the role out of the file and out of
    // the sidecar's name.
    const foldHandler = (st, title) => (isMp4Family(dstContainer) ? handlerFor(st, title || '', dstContainer) : undefined);
    // Flush a folded tag set into output-side args. Each branch passes its own survivor list, since extract subtracts its extract removals as well as the
    // dedupe drops.
    const titleWritten = new Set();   // sources this run titles itself (retagArgs / the retune), which mp4NameCarryArgs leaves alone
    const retagArgs = (retag, survivingSubs) => {
        let args = '';
        for (const r of retag || []) {
            const outIdx = survivingSubs.findIndex((x) => x.index === r.index);
            if (outIdx < 0) continue;
            titleWritten.add(r.index);
            args += retagOne(outIdx, r.lang, r.title, r.disp, foldHandler(survivingSubs[outIdx], r.title));
        }
        return args;
    };
    // A source stream as retagArgs restamps it with `retag`: the folded language as the fold spells it, title and flags (ffmpeg flag names, so they make the
    // disposition object as they are), and on an mp4-family output the handler foldHandler gives beside that title, where a non-ASCII .mov title lives alone -
    // except in the full form, for a keeper remove_source takes out of the file, whose title stays as folded. extract names a keeper's sidecar from it and
    // foldedView shows it, so a role word only the folded title or the kept handler carries is promised where the next pass reads it.
    const foldedStream = (retag, st, full = false) => {
        const rt = (retag || []).find((r) => r.index === st.index);
        if (!rt) return st;
        const tags = { ...(st.tags || {}), language: rt.lang, title: rt.title };
        const handler = foldHandler(st, rt.title);
        if (typeof handler === 'string') tags.handler_name = handler;
        if (!full && !titleBoxTakes(rt.title, dstContainer)) tags.title = nameTextOf(getTagCI(tags, 'handler_name'));
        return { ...st, tags, disposition: Object.fromEntries(rt.disp.map((f) => [f, 1])) };
    };
    // foldedStream as the next pass reads it, on an Expected results line: its index still joins the source's mediaInfo, whose Title holds the title the fold
    // replaced, so its role fields are the title the box holds, the handler beside it and its two descriptions, each read on its own (readBackFieldsOf;
    // measured: a keeper whose role was only in an mkv DESCRIPTION tag read /commentary on the next pass). A folded title the .mov box refuses reads as the
    // handler alone (measured: a refused 'Ünïcødé Commentary' beside a kept 'SDH' handler promised /commentary; the next pass read /sdh).
    const foldedView = (retag, st) => {
        const f = foldedStream(retag, st);
        return f === st ? st : { ...f, readBackRoleFields: readBackFieldsOf(f, getTagCI(f.tags, 'handler_name') || '', f.tags.title || '', dstContainer) };
    };
    // ====== END SUBTITLE METADATA / RETAG ARGS ======

    // ====== PRESET ASSEMBLY + SUMMARY ======
    // Every container-global -metadata write the run queues, recorded where it is built so commitPreset hands mp4TagPlan exactly what the preset sets. A run
    // commits at most one preset, so one record serves it; a write built on a path that then skips is never committed and so never read.
    const globalWrites = {};
    const leftOut = new Set();   // indexes of the streams the committed preset's container will not hold - see outputView
    const unmapped = [];         // the streams the committed preset leaves out of its map - see outputView
    let manualDisposition = false;   // whether the committed preset writes any -disposition (carriesDisposition) - see outputView
    const keptCovers = [];           // the Matroska covers the committed preset attaches again from a staged copy (stageMatroskaCovers) - see outputView
    let carried = (s) => s;          // a name the committed preset's carry moves into the handler alone, read back as that handler - see outputView
    const dropMaps = (indices) => [...indices].map((i) => ` -map -0:${i}`).join('');   // a negative map per dropped input index, in the order given
    const globalMetaArg = (key, value) => {
        globalWrites[key] = value;
        return ` -metadata "${key}=${value}"`;
    };
    // Commit a built output-side arg string as the run: leave out any data track the container cannot copy (mp4UncopyableStreams), append the DV strict flag,
    // then -movflags use_metadata_tags where mp4TagPlan asks for it, then the universal output options - and set response.processFile, Tdarr's go/no-go switch,
    // so calling this IS the commit point for the whole run. Shared by the extract and import branches so their tails can't drift. Without that flag an
    // mp4-family mux drops every custom global tag, so it is what keeps a sibling's awk_* marker (awk_video/awk_recovered) through a -c copy and lands this
    // plugin's own awk_sub_worker and awk_cc at all - without it an mp4 marker silently vanishes and the next pass re-imports every sidecar it should have
    // skipped. list is the main output's stream list in its order (source streams less every removal, imports appended), which the name carry reads.
    const commitPreset = (out, list = streams) => {
        // The -strict level either -c copy remux needs (see mp4StrictArg): Dolby Vision's dvcC/dvvC boxes, or a TrueHD track the mp4 muxer refuses without it.
        // Only subtitle streams - and, on a bundled extract, their font attachments - are ever added or dropped here, so every audio/video stream is copied
        // and the copied-subset argument stays at its default; that includes any cover art, which is why every mapped stream is offered to the cover check.
        // The drops come last: a negative -map undoes the earlier `-map 0` for just that stream - an uncopyable data track, and a Matroska cover the main
        // output attaches again from a staged copy or drops (stageMatroskaCovers, which runs only for a remux this run makes for its own reasons); the
        // -attach arguments close the main output's option group, after any sidecar output ahead of it in `out`.
        const uncopyable = mp4UncopyableStreams(dstContainer, streams);
        const staged = stageMatroskaCovers(dstContainer, matroskaCovers(dstContainer, streams), file.file, otherArguments, streams);
        keptCovers.push(...staged.kept);
        const mapped = streams.filter((s) => !uncopyable.includes(s) && !staged.leaveOut.includes(s));   // every video in source order, for mp4TimecodeArgs
        let full = out + dropMaps([...uncopyable, ...staged.leaveOut].map((s) => s.index)) + mp4StrictArg(dstContainer, streams)
            + mp4TimecodeArgs(dstContainer, mapped) + mp4NameCarryArgs(dstContainer, list.filter((s) => mapped.includes(s)), titleWritten)
            + matroskaCoverArgs(staged.kept);
        carried = mp4NameCarryView(dstContainer, list.filter((s) => mapped.includes(s)), titleWritten);
        const tagPlan = mp4TagPlan(dstContainer, file.ffProbeData.format?.tags, globalWrites);
        if (tagPlan.flag) full += ' -movflags use_metadata_tags';
        full += globalOutputOpt + outputMuxerArg(dstContainer);
        response.preset = `<io>${full}`;
        response.processFile = true;
        manualDisposition = carriesDisposition(full);
        response.infoLog += mp4UncopyableLog(dstContainer, uncopyable, mapped) + matroskaCoverLog(staged)
            + mp4TagPlanLog(tagPlan, dstContainer, mapped) + mp4TimecodeLog(dstContainer, mapped)
            + mp4NameCarryLog(dstContainer, list.filter((s) => mapped.includes(s)), titleWritten);
        const goneData = mp4LostData(uncopyable, mapped);
        for (const s of [...goneData, ...mp4CoversLost(tagPlan, dstContainer, mapped), ...staged.leaveOut]) leftOut.add(s.index);
        unmapped.push(...uncopyable);
    };
    // The stream list as the committed output will actually hold it, in its order - every Expected results line goes through this, so a stream the container
    // cannot hold is not promised under the line that reports it left out, a track the muxer rebuilds or creates (mp4CreatedTracks) is listed after the
    // imported subtitles and a kept cover after those (mp4RebuiltLast), and the flags are the ones the output is read back with (readBackDispositions). A
    // Matroska cover attached again goes after all of it, attachments included - an attachment stream in the command, outside ffmpeg's default rule.
    // asWritten maps each listed stream to the one the command writes (foldedView), after the source streams have been placed by identity, and a name the
    // carry moves into the handler alone reads back as that handler (mp4NameCarryView, by source index, so after readBackDispositions' copies).
    const outputView = (list, asWritten = (s) => s) => {
        const shown = list.filter((s) => !leftOut.has(s.index));
        return readBackDispositions(dstContainer, mp4RebuiltLast(dstContainer, shown, unmapped,
            mp4CreatedTracks(dstContainer, shown.filter((s) => !unmapped.includes(s)))).map(asWritten), manualDisposition).map(carried)
            .concat(keptCovers.map(keptCoverStream));
    };
    // Every commit ends the same way: the preset, then the Expected results line - right only once commitPreset has filled leftOut - then the response.
    const commitWithExpected = (out, list, asWritten) => {
        commitPreset(out, list);
        response.infoLog += `☑Expected results: ${summariseAll(outputView(list, asWritten))}\n`;
        return response;
    };

    // Synthetic stream so a not-yet-muxed sidecar renders through summariseStream in the expected-results line. It stands in for the RESULT, so `mp4` names the
    // codec the mux is about to produce, not the one the sidecar arrived as: an mp4-family target transcodes every text sidecar to mov_text, and reporting
    // the source codec would have the two halves of one run disagree - the same file re-read on the next pass summarises that track as mov_text. The .ass
    // case is why it is worth more than tidiness: a loose styled sidecar is not filtered out for mp4 (only .mks BUNDLES are), so it is silently flattened
    // into mov_text and losing its styling while the log says [sub:eng ass].
    const sidecarToStream = (f, mp4) => {
        // A bundle always carries a styled subtitle, and can never reach an mp4 target. Every other sidecar maps back through EXT_TO_CODEC behind a TEXT_EXTS
        // gate - parseSidecar reports every ext it admits as one of TEXT_EXTS (see IMPORT_ONLY_EXTS), so an ext outside the table cannot reach here and the
        // webvtt fallback only guards a future caller that reads a sidecar without going through it.
        const codec = f.bundle ? 'ass' : (mp4 ? 'mov_text' : (TEXT_EXTS.includes(f.ext) ? EXT_TO_CODEC[f.ext] : 'webvtt'));
        const disposition = {};
        for (const d of DISPOSITIONS.concat(EXTRA_DISPOSITIONS)) if ((f.dispTokens.concat(f.extraTokens || [])).includes(d.token)) disposition[d.ff] = 1;
        // The title as the import writes it (titleMetaArgs): on an mp4-family output beside the same handler, which is all a .mov keeps of a non-ASCII one.
        const tags = { language: f.lang, title: f.title, ...(mp4 ? { handler_name: handlerNameFor(f.title, dstContainer) } : {}) };
        return titleReadBack({ codec_type: 'subtitle', codec_name: codec, index: -1, tags, disposition }, dstContainer);
    };

    // ====== END PRESET ASSEMBLY + SUMMARY ======

    try {
        response.infoLog += `☐Input streams: ${summariseAll(streams)}\n`;
        // An unmapped node with method_unmapped=error cannot import at all - there is no way to discover sidecars. Fail HERE, before the caption plan pays the
        // A53 caption probe and a remote existence round-trip it would only discard, since every requeue would otherwise re-pay them before quarantining.
        if (action === 'import' && isUnmappedNode && unmappedMode === 'error') {
            failFile('[method_unmapped=error] This node is unmapped and cannot see the library to find sidecars - '
                + 'set method_unmapped to mount or text_file, or run import on a node that shares the library filesystem');
        }

        // ====== EMBEDDED CLOSED CAPTIONS: PER-FILE PLAN ======
        // Answered once, ahead of both action branches, because both ask the same two questions: is there caption data worth the decode, and
        // where would it land? Everything that can end the question cheaply is checked before the probe, and the probe before the decode.
        // Returns a job only when there is real work; otherwise a note saying why not, so an enabled setting never passes in silence.
        const ccVideo = streams.find((s) => codecTypeOf(s) === 'video' && !isCoverArt(s));
        // The HDR test is the summary's own isHdrVideo, widened by HDR_Format_Compatibility so it can never be narrower than the plugin's notion of HDR -
        // and that is load-bearing: this filter deletes EVERY SEI NAL, and HDR10's static metadata (mastering-display colour volume, MaxCLL/MaxFALL) lives
        // in exactly those, so a narrower guard silently un-HDRs a file on a -c copy pass while the log still prints `hdr`. A refused file is not a lost
        // feature: it takes the awk_cc strip route and video_clean removes the captions on its next re-encode, the right answer for HDR anyway.
        const ccStripAllowed = () => {
            if (!ccVideo) return false;
            const mi = mediaInfoFor(ccVideo) || {};
            return codecNameOf(ccVideo) === 'h264' && !isDolbyVisionVideo(ccVideo, mi) && !isHdrVideo(ccVideo, mi)
                && !String(mi.HDR_Format_Compatibility || '').trim();
        };
        // The A53 caption probe as ccPlan's two strip/plan sites both spell it - the __awkCap test-injection contract plus the ffprobe-path derivation, defined
        // once so a future hardening of either can't land at one site and not the other. Declared ahead of ccPlan's IIFE, like the notes below.
        const ccProbeVerdict = () => {
            const inj = otherArguments && otherArguments.__awkCap;
            return probeA53Captions(file.file, deriveFfprobePath(ffmpegPathOf(otherArguments)), inj ? inj.captions === true : undefined);
        };

        // The two sentences the caption branches repeat verbatim. Written once because they are a CONTRACT with the user, not incidental wording: the memo
        // note tells them which containers keep the answer, and the deferral note names the plugin that will finish the job. Three and two sites respectively,
        // and a wording drift between them reads as two different situations. Declared ahead of ccPlan, which is an IIFE and would otherwise reach them in
        // their temporal dead zone.
        const ccMemoTail = () => (canRecord ? ''
            : `; ${dstContainer} cannot store the awk_cc memo, so a later pass reads it again - remux to mkv or mp4 to stop that`);
        const ccDeferNote = (idx) => `☒${streamTag(idx)}[remove_source=true] The captions cannot be removed from this video without re-encoding it`
            + ' - recorded the request, and video_clean will carry it out on its next encode; until then a player shows both copies\n';
        // Hidden on import, visible on extract. On import the sidecar is staging - the next pass muxes it in and remove_source deletes it - so a media server
        // must not offer it in the gap between the two; on extract it IS the deliverable and belongs in plain sight beside the video. Named once, out here,
        // because the import mux needs the same name later to recognise the staging file going in, long after the plan has stopped having anything to say.
        // On import the visible spelling is the caption sidecar too: an extract that kept the bitstream copy (remove_source=false) leaves exactly that, and
        // each import-side caption decision - the memo, the scope exemption, the untrusted gate, the strip request - must hold whichever copy goes in.
        const ccNameBare = (ccMode === 'enabled' && ccVideo) ? sidecarBasename(ccPseudoStream(ccVideo.index), false) : '';
        const ccName = ccNameBare && `${action === 'import' ? '.' : ''}${ccNameBare}`;
        const isCcSidecar = (rel) => !!ccName && (rel === ccName || (action === 'import' && rel === ccNameBare));
        // A caption sidecar ccPlan found already in the library on a LOCAL view: read it, and either answer the plan outright (every plan carries `job`)
        // or, having removed an unfinished or empty one, return { leftoverNote } so ccPlan reads the captions again. Out of ccPlan so its decode gate reads
        // as a list; it runs only from there, with its early returns and the unlink in their original order.
        const judgeLocalCaptionSidecar = (full, name, ccTokens, remoteDest) => {
            let text = null; let why = '';
            try { text = readTextCapped(full, SIDECAR_HASH_MAX); } catch (e) { text = null; why = e && (e.overCap || e.notRegular) ? e.message : ''; }
            if (text === null) {
                return { job: null, note: `☒[embedded_cc=enabled] Could not read ${name} to check it${why ? ` (${why})` : ''} - leaving it alone\n` };
            }
            // Cue text proves the channel carried captions, not that this file holds ALL of them. On the direct-write routes the srt is an extra output
            // of Tdarr's own ffmpeg run, written progressively (12 of 120 cues after 5 s of a killed 7.1.4 run), so a pass cancelled, killed or failed
            // partway leaves a well-formed PREFIX while its main output is never accepted - and the read's own memo rides in that main output. So a
            // finished read is exactly a decoded/decoded2 token on the file; without one this is that prefix, and stripping the bitstream or importing on
            // it would lose every caption past the cut. It is read again instead. Where the memos cannot persist (a marker-hostile container) nothing can
            // tell the two apart and a re-read would repeat forever, so the cue text stands there as before.
            const finishedRead = ccTokens.includes(CC_TOKENS.decoded) || ccTokens.includes(CC_TOKENS.decoded2);
            const cueless = hasNoCues(text, 'srt');
            if (!cueless && (finishedRead || !canRecord)) {
                // This sidecar landed on an earlier pass and holds real cue text, so the bitstream copy may NOW be removed - THIS is the pass that owes
                // the strip. It is deliberately not done in the pass that WRITES the sidecar: ffmpeg exits 0 having written a cue-less srt whenever the
                // caption channel decodes empty (a field-2-only capture with padded field 1 does exactly that), so a same-pass strip deletes captions
                // nothing ever captured. Re-probe instead of trusting the library flag - once the strip has landed the captions are gone, and owing a
                // SECOND identical strip is what Tdarr refuses as an infinite transcode loop, ERRORING the file. Only paid when remove_source is on
                // (the only setting that can owe a strip at all) AND this is an extract pass: stripOwed is read only by the extract branch - import
                // strips through its own consumed-sidecar path and never consults it, so the probe would be spent on an answer nobody reads.
                let owed = false;
                if (removeSource && action === 'extract') owed = ccProbeVerdict() === true;
                return { job: null, stripOwed: owed, note: `☑[embedded_cc=enabled] Captions already extracted to ${name}${owed && ccStripAllowed()
                    ? ' - removing the bitstream copy now that the sidecar is confirmed to hold them' : ''}\n` };
            }
            let unlinked = true;
            try { fs.unlinkSync(full); } catch (e) { unlinked = false; }
            if (!cueless) {
                // An unfinished read's prefix (see finishedRead). One that cannot be removed is left alone and kept out of the import below, which
                // would otherwise mux the prefix in and strip the bitstream on it; the captions stay in the video.
                if (!unlinked) {
                    return { job: null, untrusted: true, note: `☒[embedded_cc=enabled] ${name} holds captions no finished read stands behind (an `
                        + 'interrupted pass?) and could not be removed - leaving it, and the captions in the video\n' };
                }
                return { leftoverNote: `☒[embedded_cc=enabled] Removed ${name}: it holds captions no finished read stands behind (an interrupted pass?) - `
                    + 'reading them again\n' };
            } else {
                // An empty sidecar is a verdict only once BOTH fields have been read to completion (CC_TOKENS decoded, decoded2). After the first read it sends
                // the decode back for field 2 - a padded field 1 makes the default decode come back empty on captions that are really there (0 bytes on auto,
                // the full captions with -data_field 1, jellyfin-ffmpeg 7.1.4); with no read recorded at all it is what an interrupted read leaves (ffmpeg
                // creates the srt when it opens its outputs), so the captions are simply read again. Recording `none` on either was what let video_clean drop
                // captions nothing had captured. Only where the memos persist: a marker-hostile container cannot record which reads ran, so the single-read
                // verdict stands there. One that cannot be removed (a read-only mount) before both fields have been read is no verdict either: re-reading it
                // would need ffmpeg to write over a file it cannot replace, so it is declined - nothing recorded, kept out of the import - and the captions
                // stay in the video. video_clean takes awk_cc=none as leave to drop them, so recording it here would be the wrong fail-safe direction.
                if (canRecord && !unlinked && !ccTokens.includes(CC_TOKENS.decoded2)) {
                    return { job: null, untrusted: true, note: `☒[embedded_cc=enabled] ${name} is empty, but no read of both caption fields stands behind it,`
                        + ' and it could not be removed - leaving it, and the captions in the video\n' };
                }
                if (!canRecord || !unlinked || ccTokens.includes(CC_TOKENS.decoded2)) {
                    // Recording the verdict takes a mux of its own, and that is only safe where the tag comes back out. On a marker-hostile container the memo
                    // cannot be stored, so the identical tag-only pass would be recomputed and re-emitted every time - which Tdarr refuses as an infinite
                    // transcode loop and ERRORS the file. Decline the memo and say so: the decode is paid again, bounded, rather than the file lost.
                    return {
                        job: null,
                        record: canRecord ? CC_TOKENS.none : '',
                        note: `☒[embedded_cc=enabled] The caption channel carries no caption text - ${unlinked
                            ? `removed the empty ${name}` : `${name} could not be removed`}${canRecord ? ' and recorded it so no later pass re-reads it'
                            : ccMemoTail()}\n`,
                    };
                }
                if (ccTokens.includes(CC_TOKENS.decoded)) {
                    return { job: { name, full, remoteDest, field2: true }, note: '☐[embedded_cc=enabled] The first read of the caption channel found no '
                        + 'text - reading its second field, where some broadcasts carry them\n' };
                }
                return { leftoverNote: `☒[embedded_cc=enabled] Removed an empty ${name} that no finished read stands behind (an interrupted pass?) - `
                    + 'reading the captions again\n' };
            }
        };
        const ccPlan = (() => {
            if (ccMode !== 'enabled') return { job: null, note: '' };
            if (!ccVideo) return { job: null, note: '☑[embedded_cc=enabled] No video stream to read captions from\n' };
            // The memos that make this converge. Tdarr re-runs the stack until every plugin skips, so an answer already paid for must never be paid again.
            const ccTokens = ccTokensOf(file.ffProbeData.format?.tags);
            if (ccTokens.includes(CC_TOKENS.none))
                return { job: null, note: '☑[embedded_cc=enabled] The caption channel was read on an earlier pass and carries no caption text\n' };
            // Nothing is left in the bitstream, so this ends the round trip outright - and it also spares the A53 re-probe the sidecar-exists branch below
            // would otherwise pay on every later pass while remove_source is on, which is the whole point of writing the memo on the pass that strips.
            if (ccTokens.includes(CC_TOKENS.removed))
                return { job: null, note: '☑[embedded_cc=enabled] The captions were extracted and the bitstream copy removed on an earlier pass\n' };
            if (ccTokens.includes(CC_TOKENS.imported))
                return { job: null, note: '☑[embedded_cc=enabled] Closed captions are already embedded as a subtitle track\n' };
            // A `strip` already recorded but not yet served - this node cannot remove it (the source is not h264 SDR) - is video_clean's to retire on its next
            // encode. Re-deriving it here re-emits a byte-identical tag-only mux every pass, which Tdarr refuses as an infinite transcode loop and ERRORS an
            // undamaged file: the sidecar and the bitstream are both unchanged, so the probe keeps answering the same. Wait for the retire. When the source IS
            // strippable this early-return is skipped, the strip lands, and the `removed` memo above ends the round trip.
            if (ccTokens.includes(CC_TOKENS.strip) && !ccStripAllowed())
                return { job: null, note: '☑[embedded_cc=enabled] Caption removal already recorded - waiting for video_clean to re-encode\n' };
            const name = ccName;
            // The same finished-name refusal the extract loop applies (see the NAME_BYTE_CAP check there): the caption srt has no title to trim, so only
            // videoBase can overflow it, and both direct-write routes put this name into one ffmpeg command whose exit 193 would quarantine the file.
            // Checked before the existence probe and the A53 decode, which a name that can never be written would only waste.
            const nameBytes = Buffer.byteLength(name, 'utf8');
            if (nameBytes > NAME_BYTE_CAP) {
                return { job: null, note: `☒[embedded_cc=enabled] Caption sidecar name would be ${nameBytes} bytes, over the ${NAME_BYTE_CAP}-byte filesystem `
                    + 'limit - rename the video shorter and requeue, keeping the captions in the video\n' };
            }
            const full = libPathOf(name);
            if (!pathIsPresetSafe(full))
                return { job: null, note: `☒[embedded_cc=enabled] Library directory has a quote, control char or <io> - cannot write ${name} safely\n` };
            // The caption SOURCE path needs the same test, and the joined path above cannot stand in for it: videoBase strips a quote out of the NAME, so one
            // living in the video's own filename is invisible there while surviving verbatim in file.file - which is what the two mapped branches interpolate
            // into their quoted "movie=..." token. escapeMoviePath answers the filtergraph's parsers, not Tdarr's tokeniser, so a " there closes the token and
            // turns the rest into fresh argv entries, and an <io> truncates the whole command. Only the preset route is exposed: the API route hands the
            // same string to spawnSync as one argv element, so it is gated on !placeViaApi() and keeps working.
            if (!placeViaApi() && !pathIsPresetSafe(String(file.file || '')))
                return { job: null, note: '☒[embedded_cc=enabled] The video path has a quote, control char or <io> - cannot read the captions safely\n' };
            const remoteDest = placeViaApi() ? serverDestFor(name) : '';
            if (placeViaApi() && !remoteDest)
                return { job: null, note: `☒[embedded_cc=enabled] No path translator maps this library directory back to the server - cannot write ${name}\n` };
            // An existing caption sidecar is the memo that the decode already happened. Wherever the library can be READ - a mapped node, or
            // any resolved mount, read-only included - it can also be opened, which is the only way to tell a channel that carried no text from
            // one that was never read: A53 side data is present whether or not anyone was speaking, so an empty channel looks exactly like a
            // full one to the probe. A cue-less sidecar is deleted and the finding recorded, so no later pass repeats the decode. On the API
            // route an unconfirmed answer stops here: a job would upload over whatever is there, and the captions stay put for a later pass.
            // On import the extract-written visible spelling is looked for after the staging name and judged the same way (see ccName); a read it calls
            // for still writes the staging name. Returns a whole plan, a { leftoverNote }, or null when that spelling is absent.
            const lookFor = (at, atFull, atDest) => {
                const remote = readViaApi() ? sidecarExistsRemote(atDest) : null;
                if (remote && remote.state === 'unknown') {
                    return { job: null, note: `☒[embedded_cc=enabled] Could not confirm whether ${at} is already in the library (${remote.why}) - `
                        + 'not overwriting it; the captions stay in the video for a later pass\n' };
                }
                // A symbolic link at the name (isSymlinkAt) is neither read as the memo nor written through, and is kept out of the import below like any
                // untrusted sidecar. Only a local view can see one; the API route asks the server, which cannot say.
                if (!remote && isSymlinkAt(atFull)) {
                    return { job: null, untrusted: true, note: `☒[embedded_cc=enabled] ${at} in the library is a symbolic link - not reading or writing`
                        + ' through it, since it could point anywhere; remove it and requeue, the captions stay in the video\n' };
                }
                const existing = remote ? (remote.state === 'present' ? 'remote' : '')
                    : ((() => { try { return fs.existsSync(atFull) ? 'local' : ''; } catch (e) { return ''; } })());
                if (existing === 'remote')
                    return { job: null, staged: true, stagedName: at, note: `☑[embedded_cc=enabled] Caption sidecar already in the library: ${at}\n` };
                if (existing !== 'local') return null;
                const verdict = judgeLocalCaptionSidecar(atFull, at, ccTokens, atDest);
                return verdict.job ? { ...verdict, job: { ...verdict.job, name, full, remoteDest } } : verdict;
            };
            const spellings = [[name, full, remoteDest]];
            if (action === 'import') spellings.push([ccNameBare, libPathOf(ccNameBare), placeViaApi() ? serverDestFor(ccNameBare) : '']);
            let leftoverNote = '';
            for (const [at, atFull, atDest] of spellings) {
                const found = lookFor(at, atFull, atDest);
                if (!found) continue;
                if ('job' in found) return found;
                leftoverNote += found.leftoverNote;
            }
            // Nothing memoised, so pay for the cheap check. Only `true` from the library scan is information - it reports false both for a file with no
            // captions and for one its scanner could not parse - so a false still goes to the probe, and an 'unknown' probe leaves the file alone.
            if (file.hasClosedCaptions !== true) {
                const seen = ccProbeVerdict();
                if (seen === 'unknown') {
                    return { job: null,
                        note: `${leftoverNote}☒[embedded_cc=enabled] Could not check this file for closed captions on this node - leaving it alone\n` };
                }
                if (seen === false) return { job: null, note: `${leftoverNote}☑[embedded_cc=enabled] No embedded closed captions in this file\n` };
            }
            // A field-2 read already ran on this file (decoded2) and its sidecar is gone since, so the next read goes straight back to field 2.
            return { job: { name, full, remoteDest, field2: ccTokens.includes(CC_TOKENS.decoded2) }, note: leftoverNote };
        })();
        response.infoLog += ccPlan.note;
        // An in-plugin caption read is known to have finished, so an empty first read goes straight to field 2 (see ccPlan) before it counts as empty. One
        // spelling for both API routes: the retry is merged into the first read's result sets in place, and the answer is whether the sidecar placed came
        // from field 2.
        const retryCaptionField2 = (job, result) => {
            if (!result.empty.has(job.name) || ccPlan.job.field2) return false;
            const again = placeSidecars([{ ...job, args: ccLavfiArgs(true) }]);
            if (!again.empty.has(job.name)) result.empty.delete(job.name);
            if (again.placed.has(job.name)) { result.placed.add(job.name); return true; }
            if (again.failed.has(job.name)) result.failed.set(job.name, again.failed.get(job.name));
            return false;
        };

        // Union with whatever the tag already holds rather than replacing it: an earlier extract pass may have recorded a pending `strip` that video_clean has
        // not reached yet, and overwriting it would turn a deferred removal into one nothing will ever perform.
        const ccTagArg = (...add) => {
            const tokens = new Set(ccTokensOf(file.ffProbeData.format?.tags));
            for (const t of add) tokens.add(t);
            return globalMetaArg(CC_TAG, escMeta([...tokens].join(',')));
        };
        // Recording an empty caption channel takes a mux of its own: the tag IS the memo that stops the decode being repeated, and on a file with nothing
        // else queued there would be no other command to carry it. One pass, once per file, and every later pass reads the token and skips.
        if (ccPlan.record) return commitWithExpected(`-map 0 -c copy${ccTagArg(ccPlan.record)}`, streams);

        // The filter is addressed by the caption video's position among the OUTPUT's video streams, not by a literal 0. ccVideo is deliberately chosen past
        // any cover art (isCoverArt), and this branch drops only subtitle/attachment streams, so the two disagree exactly when an image "video" track precedes
        // the real one - a layout ffmpeg itself produces in Matroska, which drops the attached_pic disposition and writes the cover as a plain video track.
        // filter_units accepts no image codec: fed a png it does not warn or skip, it fails to INITIALISE and takes the whole output down (exit 234), killing
        // the sidecars written as earlier outputs of that same run. On every ordinary file the position is 0 and the emitted token is unchanged.
        // Captions are removed from the VIDEO BITSTREAM, not from a stream list, so the removal is a bitstream filter rather than a -map exclusion. It is
        // picture-lossless on H.264 only: remove_types takes NAL unit types and the numbering is CODEC-SPECIFIC, so 6 is SEI on H.264 but a VCL slice type
        // on HEVC, where the same filter would delete picture data. HDR and Dolby Vision are refused for the same reason in reverse - their metadata rides
        // in the SEI this drops. Dolby Vision is checked independently of the HDR tests and that is load-bearing, not belt-and-braces: profile 9 is 8-bit
        // AVC and SDR, so every HDR-shaped test passes it through and only the DV detector stands between it and a destroyed RPU.
        const H264_SEI_NAL_TYPE = 6;
        const ccStripArg = (removed) => {
            const vPos = streams.filter((s) => codecTypeOf(s) === 'video' && !removed.has(s.index)).findIndex((s) => s.index === ccVideo.index);
            return vPos < 0 ? '' : ` -bsf:v:${vPos} filter_units=remove_types=${H264_SEI_NAL_TYPE}`;
        };
        // ====== END EMBEDDED CLOSED CAPTIONS: PER-FILE PLAN ======

        if (action === 'extract') {
            // ====== EXTRACT: embedded text subs -> sidecars (+ optional removal) ======
            // Duplicate tracks the file already carries go before anything else: a dropped stream must not also be written to a sidecar, or the copy we just
            // decided was redundant comes straight back on the next import under a name of its own.
            const dupes = dedupeStreams ? dedupeEmbeddedSubs(streams.filter((s) => codecTypeOf(s) === 'subtitle')) : { dropIdx: [], retag: null, log: '' };
            response.infoLog += dupes.log;
            dupes.dropIdx.forEach((i) => droppedDuplicates.add(i));
            const eligible = streams.filter((s) => codecTypeOf(s) === 'subtitle' && isTextSub(s)
                && !dupes.dropIdx.includes(s.index)
                && !(langFilter && !langFilter.has(langKey(resolveLang(s) || 'und'))));
            // A DEFERRED caption strip is work of its own: the sidecar landed on an earlier pass, so there is no job and nothing to extract, yet the
            // bitstream copy still has to come out. Bailing here would leave the captions in the video forever, with the sidecar beside it.
            if (!eligible.length && !dupes.dropIdx.length && !ccPlan.job && !ccPlan.stripOwed) return skip('☑No text subtitles to extract\n');

            // method_unmapped=mount on a node where the mount is not actually there. Extract does not need it - the file API still lands every sidecar in the
            // library - so failing here would be gratuitous when the work can be done. But it must not pass in silence: the user asked for a mount, the mount
            // is not working, and the next IMPORT pass hard-fails on this very thing (there the directory is the only way to FIND sidecars, so there is
            // nothing to fall back to). Same wording as that failure, so the two read as one problem.
            if (isUnmappedNode && unmappedMode === 'mount' && !mountedLib().dir) {
                response.infoLog += `☒[method_unmapped=mount] Could not reach the library from this node - ${mountedLib().why}\n`;
                response.infoLog += '☒[method_unmapped=mount] Placing sidecars through the file API instead; '
                    + 'import will FAIL on this node until the mount works\n';
            } else if (isUnmappedNode && unmappedMode === 'mount' && !mountedLib().writable) {
                response.infoLog += `☒[method_unmapped=mount] The library at ${mountedLib().dir} (via ${mountedLib().via}) is read-only from this node - `
                    + 'reading through the mount, placing sidecars through the file API\n';
            } else if (isUnmappedNode && unmappedMode === 'mount') {
                response.infoLog += `☑[method_unmapped=mount] Writing to the library at ${mountedLib().dir} (via ${mountedLib().via})\n`;
            }

            // A styled subtitle is exported as a .mks BUNDLE carrying the subtitle plus every font attachment, because those fonts exist nowhere else
            // (see STYLED_BUNDLE.ext). Loose text sidecars stay the default for everything else: a plain srt, and an ass/ssa in a file with no fonts, have
            // nothing to carry and are far more useful as editable text on disk.
            const fontIndices = streams.filter((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s)).map((s) => s.index);
            const fontMaps = fontIndices.map((i) => ` -map 0:${i}`).join('');
            // deduplicate=enabled_checkmedia folds the removed duplicates' flags/title/language onto the keeper (dupes.retag), and retagArgs restamps the
            // SURVIVING stream with it - but a keeper remove_source extracts leaves keptSubs, so that restamp is dropped (retagArgs: outIdx < 0), and the
            // sidecar NAME is the sole authority on the reimported identity. So a name is spelled from the stream as the fold leaves it (foldedStream), or the
            // round trip loses the folded SDH flag / title / real-language-onto-und keeper; on an mp4-family output that includes the handler the fold writes
            // or keeps, or the next pass reads another handler-only role token and extracts the track again under a second name.
            const foldRetag = (st) => foldedStream(dupes.retag, st);
            // A stream as this pass's output holds it: a keeper as the fold restamps it, any other track as the name carry leaves it on an mp4-family output
            // (mp4NameCarryView); a changed one is marked sidecarView, so sidecarTitleOf reads its tags rather than the source's mediaInfo.
            const carryView = (st) => {
                const f = foldRetag(st);
                const v = f !== st ? f : mp4NameCarryView(dstContainer, [st])(st);
                return v === st ? st : { ...v, sidecarView: true };
            };
            // The stream a sidecar's name is spelled from (sidecarTitleOf): carryView's for a stream this pass keeps. A stream remove_source takes out of the
            // file keeps its FULL name, a keeper's folded title as it is: no box of the output holds it, so no box limit applies, and the sidecar is then its
            // only copy (measured: a non-ASCII title-box name was dropped from it without a word). carryView's spelling is an earlier name for it
            // (earlierSidecarNames).
            const sidecarView = (st) => {
                if (!removeSource) return carryView(st);
                const f = foldedStream(dupes.retag, st, true);
                return f === st ? st : { ...f, sidecarView: true };
            };

            // sidecarOut carries the extra ffmpeg outputs that write the sidecars on a node with a WRITABLE library view (mapped, or a writable mount).
            // Without one the same extractions are collected in placeJobs instead, to be run and uploaded by placeSidecars once the loop has seen every
            // stream - which is why the placement decision is made HERE: Tdarr runs the preset only after the plugin returns, so a preset output that
            // fails against a read-only mount cannot be caught and rerouted, only quarantined.
            let sidecarOut = ''; const removedIndices = new Set(dupes.dropIdx); let wrote = 0; let skipped = 0; let refused = 0; let bundled = 0;
            let deferred = 0; let held = 0;
            const placeJobs = [];
            // The caption extraction leads on both routes; on the API one that is a hard requirement - placeSidecars concatenates every job's args
            // after a single -i, so the caption job's '-f lavfi -i' only precedes all outputs if its job is first. On the direct-write route the
            // same input is emitted at the head of the OUTPUT side, where Tdarr's own -i is already spliced in ahead - on the input side it would
            // become input 0 and silently shift every existing -map 0. ccRecord is a SET because the awk_cc states genuinely combine and only one
            // value is written, so a single-token overwrite would erase whichever came first - `imported` pairs with either `strip` or `removed` on
            // the import side. In THIS branch the read memo (decoded/decoded2) can combine with removed or strip on the API route; a recorded `none`
            // short-circuits the strip/defer block below, because an empty channel never owes a strip. ccPlaced earns the removal: on the API route
            // the caption srt is uploaded BEFORE the preset returns (a rejected upload must not be followed by a strip that leaves the captions
            // nowhere). On the direct-write route ccPlaced deliberately stays false, so the fresh-extract pass never strips - the strip is owed on a
            // later pass via stripOwed, once the sidecar is proven to hold cues (see the empty-decode deferral note in that branch below).
            let ccInput = ''; const ccRecord = new Set(); let ccPlaced = false;
            if (ccPlan.job && placeViaApi()) {
                placeJobs.push({
                    name: ccPlan.job.name,
                    dest: ccPlan.job.remoteDest,
                    args: ccLavfiArgs(ccPlan.job.field2),
                    index: ccVideo.index,
                    bundle: false,
                    caption: true,
                });
            } else if (ccPlan.job) {
                ccInput = ccPresetInput(ccPlan.job.field2);
                // The read's own memo, on the same output: the next pass only trusts an empty sidecar as a verdict once a finished read stands behind it.
                if (canRecord) ccRecord.add(ccPlan.job.field2 ? CC_TOKENS.decoded2 : CC_TOKENS.decoded);
                sidecarOut += ` -map 1:s:0 -c:s text -f srt "${ccPlan.job.full}"`;
                wrote += 1;
                // Deliberately does NOT authorise the strip: ffmpeg exits 0 on an empty caption decode, writing a 0-byte srt while the same command would
                // delete the SEI - captions gone with nothing holding them. The next pass reads this sidecar, proves it has cues, and owes the strip then.
                response.infoLog += `☐${streamTag(ccVideo.index)}[embedded_cc=enabled] Reading the embedded closed captions -> ${ccPlan.job.name}`
                    + ' (decodes the video, so this pass is slower than an ordinary extract)\n';
            }
            // The sidecars whose subtitle this pass takes OUT of the file - each leaves the import marker too (see the preset below).
            const extractedRels = new Set();
            // A stream named beside a matroska TITLE SimpleTag leaves the file with its sidecar named after its one name (trackNameBesideTitleTag): where that
            // is the Name alone, the tag's text goes with the stream, and any role only the tag gave (titleTagFate) - said where the stream is taken out.
            const titleTagGoes = (st) => {
                const { joined, lost } = titleTagFate(st);
                if (!trackNameBesideTitleTag(st) || joined) return '';
                return `☒${streamTag(st.index)}[remove_source=true] The sidecar carries the track name ${quotedName(trackNameBesideTitleTag(st))}, so the TITLE`
                    + ` tag "${logShown(getTagCI(st.tags, 'title'))}" beside it is dropped`
                    + `${lost.length ? ` with its ${lost.join(' and ')} role${lost.length > 1 ? 's' : ''}` : ''}\n`;
            };
            // The names each stream takes by name - its current spelling, and the previous sub_worker's titled or role-token one - mapped to its index;
            // no other stream adopts one of them by its text (sidecarByText), or two would share one file and remove_source strip both.
            const claimedBy = new Map();
            {
                const truncated = titleTruncated; const roles = cutRoleTokens; const lostRoles = cutRolesLost; const budget = cutBudget;
                for (const st of eligible) {
                    const b = fontIndices.length > 0 && isStyledSub(st.codec_name);
                    claimedBy.set(sidecarBasename(sidecarView(st), b), st.index);
                    const own = earlierSidecarNames(foldRetag(st), sidecarView(st), b, null).find((c) => c.own && !c.byText);
                    if (own) claimedBy.set(own.name, st.index);
                }
                titleTruncated = truncated; cutRoleTokens = roles; cutRolesLost = lostRoles; cutBudget = budget;
            }
            for (const s of eligible) {
                const { enc } = TEXT_SUB[codecNameOf(s)];
                const bundle = fontIndices.length > 0 && isStyledSub(s.codec_name);
                // This name's cut (titleTruncated, cutRoleTokens) is reported below only if the extract keeps this name, not an earlier spelling.
                const truncatedBefore = titleTruncated;
                titleTruncated = false;
                // Spelled from sidecarView's stream (sidecarTitleOf); a track named only by its handler takes that name as a title token.
                const view = sidecarView(s);
                let name = sidecarBasename(view, bundle);
                const cutSpelling = titleTruncated ? name : null;
                const cutRoles = cutRoleTokens; const cutLost = cutRolesLost; const cutBytes = cutBudget;
                titleTruncated = truncatedBefore;
                // Which file already on disk is this track's sidecar, by one rule: (1) the current name, whenever it exists - a user's edit under it is theirs;
                // (2) else the previous sub_worker's own titled or role-token spelling, by name (earlierSidecarNames); (3) else a file under any other
                // spelling, only when its cue texts are this stream's and no other stream shares them - on a library this node can read, any of this video's
                // sidecars in the stream's language (sidecarByText), and on the file API route, which cannot list, the earlier spellings, each downloaded
                // (cueTextRemote) - and under remove_source=true only as it is when it spells the track as the current name does (sameSpelledTrack), else
                // renamed to the current name, or, where the node cannot rename, the stream kept and no new name written while that file stands (an empty or
                // incomplete current name is still written over); (4) a file at one of this track's earlier spellings that holds no text while the stream has
                // cues (emptyCopyAt; on the file API each downloaded, (2)'s too: ownSpellingRemote) is deleted, and where the node cannot delete it the current
                // name is written and, under remove_source=true, the stream kept; (5) never through a symbolic link, and a candidate fails the file only on the
                // file API, where an unconfirmed answer - or under remove_source=true a file holding a NUL - waits, and the pass fails when nothing else lands.
                const earlier = earlierSidecarNames(foldRetag(s), view, bundle, removeSource ? carryView(s) : null).filter((c) => c.name !== name);
                const claimed = new Set([...claimedBy].filter(([, i]) => i !== s.index).map(([n]) => n));
                // On the API route the answer for the name kept is reused by the existence test below.
                let remoteAnswer = null;
                // The empty earlier spellings this node cannot delete (4), and the files (3) finds that it cannot rename.
                const emptyLeft = []; const oldLeft = [];
                // Whether the current name can be written at all: the refusals below keep the stream, so no earlier file is renamed for a name they refuse.
                const writable = Buffer.byteLength(name, 'utf8') <= NAME_BYTE_CAP && pathIsPresetSafe(libPathOf(name));
                // What the rule leaves: a sidecar the user EDITED under a spelling no longer current matches no text, so one new sidecar is written beside
                // it; a stale file holding a text two streams share is taken by neither; and (1) has no content check, so after a renumbering a track whose
                // new index is a neighbour's old one takes that file by name and its own text is written again. On the file API, which cannot list, a file
                // at another index or under a title the track no longer has is not found: under remove_source=true the stream goes, and the import folds that
                // file with the current one (their flags joined, the first title by name).
                if (!readViaApi()) {
                    const current = fs.existsSync(libPathOf(name));
                    // A read-only mount renames and deletes nothing, so under remove_source=true (3) and (4) look beside the current name too.
                    const readOnly = removeSource && placeViaApi();
                    for (const c of !current || readOnly ? earlier : []) {
                        if (!emptyCopyAt(s, libPathOf(c.name), c.name, bundle, streams)) continue;
                        if (!placeViaApi()) {
                            try {
                                fs.unlinkSync(libPathOf(c.name));
                                response.infoLog += `☐${streamTag(s.index)} Replacing ${c.name} with ${name} - an earlier run left it empty\n`;
                                continue;
                            } catch (e) { /* it stays, reported below */ }
                        }
                        emptyLeft.push(c.name);
                    }
                    const own = current ? undefined : earlier.find((c) => c.own && !c.byText && !emptyLeft.includes(c.name)
                        && fs.existsSync(libPathOf(c.name)) && !isSymlinkAt(libPathOf(c.name)))?.name;
                    const found = own || (current && !readOnly) ? null : sidecarByText(s, name, earlier.map((c) => c.name), bundle, streams, claimed);
                    // Under remove_source=true, where the route can delete, (2)'s file is replaced under the current name when an interrupted run left it
                    // incomplete.
                    if (own && removeSource && !placeViaApi() && leftIncomplete(existingSidecarVerdict(s, own, bundle, streams), own)) {
                        try {
                            fs.unlinkSync(libPathOf(own));
                            response.infoLog += `☐${streamTag(s.index)}[remove_source=true] Replacing ${own} with ${name}`
                                + ' - an earlier run left it incomplete\n';
                        } catch (e) { name = own; }   // the check below meets it again, and says it could not be deleted
                    } else if (own) name = own;
                    else if (found && current) { if (!sameSpelledTrack(found, name)) oldLeft.push(found); }
                    else if (found && (!removeSource || sameSpelledTrack(found, name))) name = found;
                    else if (found && writable && !placeViaApi()) {
                        try {
                            fs.renameSync(libPathOf(found), libPathOf(name));
                            response.infoLog += `☐${streamTag(s.index)}[remove_source=true] Renaming ${found} to ${name} - its text is this track's\n`;
                        } catch (e) { oldLeft.push(found); }
                    } else if (found && writable) oldLeft.push(found);
                } else if (earlier.length && serverDestFor(name)) {
                    remoteAnswer = sidecarExistsRemote(serverDestFor(name));
                    const absent = remoteAnswer.state === 'absent' && !remoteAnswer.empty;
                    let adopted = false;
                    for (const c of absent || (removeSource && remoteAnswer.state !== 'unknown') ? earlier : []) {
                        if (adopted && !removeSource) break;
                        const byText = !c.own || c.byText;
                        const got = byText ? cueTextRemote(s, c.name, bundle, streams) : '';
                        const answer = byText ? null : ownSpellingRemote(s, c.name, bundle, streams);
                        if (got === 'empty' || answer?.empty) { emptyLeft.push(c.name); continue; }
                        if (got === 'same' && removeSource && !sameSpelledTrack(c.name, name)) { if (writable) oldLeft.push(c.name); adopted = true; continue; }
                        if (adopted || !absent) continue;
                        if (got === 'same') { name = c.name; remoteAnswer = { state: 'present', why: '' }; adopted = true; }
                        // One holding a NUL beside other text is not trusted by name where the stream would go: it waits, as for any unconfirmed answer.
                        else if (answer && answer.state !== 'absent' && answer.state !== 'over') {
                            name = c.name; adopted = true;
                            remoteAnswer = removeSource && answer.unreadable ? { state: 'unknown', unreadable: true } : answer;
                        }
                    }
                }
                // A remove_source=true import restores the track from its sidecar's name and folds the files holding its text, so a file this node can neither
                // rename nor delete keeps the stream while it stands (measured: an empty title-less spelling written over on the file API became the track's
                // only copy, and the import brought it back with no title; an old spelling beside the current name brought back its title and flags).
                if (oldLeft.length) {
                    const many = oldLeft.length > 1;
                    response.infoLog += `☒${streamTag(s.index)}[remove_source=true] ${oldLeft.join(', ')} from an earlier run ${many ? 'hold' : 'holds'} this`
                        + ` track's text under ${many ? 'names' : 'a name'} it had before, and this node cannot rename ${many ? 'them' : 'it'} - delete`
                        + ` ${many ? 'them' : 'it'} and requeue; keeping the embedded subtitle until then\n`;
                }
                if (emptyLeft.length) {
                    const many = emptyLeft.length > 1;
                    response.infoLog += `☒${streamTag(s.index)}${removeSource ? '[remove_source=true]' : ''} ${emptyLeft.join(', ')} from an earlier run`
                        + ` ${many ? 'are' : 'is'} empty, and this node cannot delete ${many ? 'them' : 'it'} - delete ${many ? 'them' : 'it'}`
                        + `${removeSource ? ' and requeue; keeping the embedded subtitle until then' : ''}\n`;
                }
                // The bytes the title had are the 255-byte cap's leftover before any role token took its share.
                if (name === cutSpelling) {
                    titleTruncated = true;
                    const room = cutBytes > 0 ? `has only the ${cutBytes} bytes the ${NAME_BYTE_CAP}-byte filename limit leaves it`
                        : `has no room under the ${NAME_BYTE_CAP}-byte filename limit`;
                    const tokens = (list) => list.map((t) => `.${t}`).join(' and ');
                    if (cutRoles.length) {
                        response.infoLog += `☒${streamTag(s.index)} The title in ${name} ${room}, too few for its role words - ${tokens(cutRoles)} in the name`
                            + ` keeps ${cutRoles.length > 1 ? 'those roles' : 'that role'}\n`;
                    }
                    if (cutLost.length) {
                        response.infoLog += `☒${streamTag(s.index)} The title in ${name} ${room}, too few for its role words, and the name has no room for`
                            + ` ${tokens(cutLost)} either - ${cutLost.length > 1 ? 'those roles are' : 'that role is'} lost\n`;
                    }
                }
                const full = libPathOf(name);
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
                // The byte budget is checked on the FINISHED name, not just on the title encodeTitleCapped trims: an untitled stream skips that call
                // entirely, and even with a title the fit loop can only trim to empty, so a video whose own basename runs past ~244 bytes overflows on its
                // own. The sidecar and the strip are outputs of ONE ffmpeg command, so an over-long name does not merely lose the sidecar - ffmpeg answers
                // "File name too long" (exit 193, verified on jellyfin-ffmpeg 7.1.4) and the whole extract dies, quarantining a file that re-fails on every
                // requeue while the log line above it claims the extract was queued. Refused per sidecar, exactly as an unsafe path is. NOT fixed by trimming
                // videoBase: parseSidecar anchors on it (startsWith(`${videoBase}.`), then slices at videoBase.length + 1), so a trimmed name would extract,
                // strip the embedded track, and then be unrecognisable for reimport - a quiet round-trip break in place of a loud refusal.
                if (Buffer.byteLength(name, 'utf8') > NAME_BYTE_CAP) {
                    refused += 1;
                    response.infoLog += `☒${streamTag(s.index)} Sidecar name would be ${Buffer.byteLength(name, 'utf8')} bytes, over the `
                        + `${NAME_BYTE_CAP}-byte filesystem limit - rename the video shorter and requeue, keeping the embedded subtitle\n`;
                    continue;
                }
                // A node placing through the API needs a server-side destination; with no translator claiming the path there is none at all, and the
                // extract is refused exactly as an unsafe path is. The existence test below is independent of that: it reads locally through any resolved
                // mount, and only asks the server when there is no library view to read.
                const remoteDest = placeViaApi() ? serverDestFor(name) : '';
                if (placeViaApi() && !remoteDest) {
                    refused += 1;
                    response.infoLog += `☒${streamTag(s.index)} No path translator maps this library directory back to the server - cannot write ${name}, `
                        + 'keeping the embedded subtitle\n';
                    continue;
                }
                // An existing sidecar is preserved (never overwrite the user's edits). The 0-byte-means-absent test guards ONE thing: an extract ffmpeg
                // aborted mid-write leaves a 0-byte file, and trusting it before stripping the embedded source would lose the subtitle - so re-extract. But
                // that protection only matters when the source WILL be stripped (removeSource). ffmpeg also writes a genuinely 0-byte srt for a cue-less
                // subtitle stream (measured on jellyfin-ffmpeg 7.1.4), so with removeSource=false the stream is never removed and a cue-less srt would
                // re-extract the identical 0-byte sidecar every pass - Tdarr errors the second identical preset as an infinite transcode loop. When nothing
                // will be stripped, plain existence is enough to mean "already handled", which breaks that loop. On the API route an UNCONFIRMED answer
                // is neither: extracting would upload over a sidecar that may be there, so the stream waits - for this job's next cycle when anything else
                // lands this pass, and otherwise for a requeue, since the pass then fails the file (see the endings below).
                const remote = readViaApi() ? (remoteAnswer || sidecarExistsRemote(remoteDest)) : null;
                if (remote && remote.state === 'unknown') {
                    deferred += 1;
                    response.infoLog += remote.unreadable
                        ? `☒${streamTag(s.index)}[remove_source=true] ${name} in the library is not text ffmpeg can read whole (it holds a NUL`
                            + ' character); keeping the embedded subtitle (save it as UTF-8, or delete it to extract it again)\n'
                        : `☒${streamTag(s.index)} Could not confirm whether ${name} is already in the library (${remote.why}) - `
                            + 'not overwriting it, keeping the embedded subtitle for a later pass\n';
                    continue;
                }
                // A symbolic link at the name (isSymlinkAt) is refused - neither trusted as the sidecar nor written through. Only a local view can see one.
                if (!remote && isSymlinkAt(full)) {
                    refused += 1;
                    response.infoLog += `☒${streamTag(s.index)} ${name} in the library is a symbolic link - not extracting through it, since it could point `
                        + 'anywhere; remove it and requeue, keeping the embedded subtitle\n';
                    continue;
                }
                let alreadyExtracted = remote ? remote.state === 'present'
                    : (removeSource ? fileHasBytes(full) : fs.existsSync(full));
                // A file here that holds no text while the stream has cues is replaced under remove_source=false too (emptyCopyAt): it holds nothing to lose,
                // and an import muxing it fails the file. A cue-less stream's own empty sidecar is its extract, and stays (or every pass would write it again,
                // an identical preset Tdarr errors as a loop).
                if (!remote && !removeSource && alreadyExtracted && emptyCopyAt(s, full, name, bundle, streams)) {
                    if (!placeViaApi()) {
                        try { fs.unlinkSync(full); } catch (e) {
                            refused += 1;
                            response.infoLog += `☒${streamTag(s.index)} An empty ${name} from an earlier run could not be deleted to extract it again - delete`
                                + ' it and requeue, keeping the embedded subtitle\n';
                            continue;
                        }
                    }
                    alreadyExtracted = false;
                    response.infoLog += `☐${streamTag(s.index)} Replacing ${name} - an earlier run left it empty\n`;
                }
                // remove_source is about to strip the stream this name copies, so a file already there must HOLD it (existingSidecarVerdict). An interrupted
                // run's leftover is replaced - deleted first on the direct-write route, since ffmpeg aborts the whole run rather than overwrite an output, and
                // uploaded over through a read-only mount - and one cut short or unreadable keeps the stream. Unjudged - on the file API route, which reads no
                // library file here, or when either side cannot be read - a file with bytes keeps the trust it always had.
                if (!remote && removeSource && fs.existsSync(full)) {
                    const verdict = existingSidecarVerdict(s, name, bundle, streams);
                    if (verdict.state === 'short') {
                        held += 1;
                        response.infoLog += `☒${streamTag(s.index)}[remove_source=true] ${name} already on disk stops at ${verdict.end.toFixed(1)} s but this `
                            + `subtitle runs to ${verdict.streamEnd.toFixed(1)} s - a run that failed partway, or an edit that cut the end; keeping the `
                            + 'embedded subtitle (delete the sidecar to extract it again)\n';
                        continue;
                    }
                    if (verdict.state === 'unreadable') {
                        held += 1;
                        response.infoLog += `☒${streamTag(s.index)}[remove_source=true] ${name} already on disk is not text ffmpeg can read whole (it holds a`
                            + ' NUL character); keeping the embedded subtitle (save it as UTF-8, or delete it to extract it again)\n';
                        continue;
                    }
                    if (leftIncomplete(verdict, name)) {
                        if (!placeViaApi()) {
                            try { fs.unlinkSync(full); } catch (e) {
                                refused += 1;
                                response.infoLog += `☒${streamTag(s.index)} An incomplete ${name} from an earlier run could not be deleted to extract it again `
                                    + '- delete it and requeue, keeping the embedded subtitle\n';
                                continue;
                            }
                        }
                        alreadyExtracted = false;
                        response.infoLog += `☐${streamTag(s.index)}[remove_source=true] Replacing ${name} - an earlier run left it incomplete\n`;
                    } else alreadyExtracted = true;
                }
                if (alreadyExtracted) { skipped += 1; response.infoLog += `☑${streamTag(s.index)} Sidecar already exists, not overwriting: ${name}\n`; }
                // While an old spelling this node cannot rename holds the track's text, no NEW name is written: an import before the user deletes it would mux
                // the new file beside the kept stream and the old one (measured: three copies of a styled bundle under the default deduplicate). A file at the
                // current name judged empty or incomplete above is still written over, the stream kept (keep): left as it was, it failed every import.
                else if (oldLeft.length && !(remote ? remote.empty : fs.existsSync(full))) { held += 1; continue; }
                // API placement: the extraction is deferred to placeSidecars after the loop, so this stream's removedIndices entry and its bundled tally
                // wait for the server's answer - nothing may be stripped until the sidecar is confirmed in the library.
                else if (placeViaApi()) {
                    const ffArgs = bundle ? ['-map', `0:${s.index}`, ...fontIndices.flatMap((i) => ['-map', `0:${i}`]), '-c', 'copy', '-f', STYLED_BUNDLE.fmt]
                        : ['-map', `0:${s.index}`, '-c:s', enc];
                    placeJobs.push({ name, dest: remoteDest, args: ffArgs, index: s.index, bundle, keep: emptyLeft.length + oldLeft.length > 0 });
                    continue;
                }
                // A bundle is muxed with -c copy so the subtitle and every font stay byte-exact; matroska auto-detects .mkv but NOT .mks, so -f is required.
                else if (bundle) {
                    sidecarOut += ` -map 0:${s.index}${fontMaps} -c copy -f ${STYLED_BUNDLE.fmt} "${full}"`; wrote += 1;
                    response.infoLog += `☐${streamTag(s.index)} Extract -> ${name} (styled subtitle bundled with ${fontIndices.length} font${
                        fontIndices.length === 1 ? '' : 's'})\n`;
                }
                else {
                    sidecarOut += ` -map 0:${s.index} -c:s ${enc} "${full}"`; wrote += 1; response.infoLog += `☐${streamTag(s.index)} Extract -> ${name}\n`;
                }
                if (bundle) bundled += 1;
                if (removeSource && !emptyLeft.length && !oldLeft.length) {
                    removedIndices.add(s.index); extractedRels.add(name); response.infoLog += titleTagGoes(s);
                }
            }
            // API placement: the deferred extractions run HERE, in one ffmpeg pass, and each result is uploaded to the library. Only a sidecar the server
            // confirms in place counts as written and earns its stream a removal - a failure logs ☒ and keeps that subtitle embedded, so the worst case
            // is an unextracted subtitle rather than a lost one.
            if (placeJobs.length) {
                const placedRes = placeSidecars(placeJobs);
                const { placed, failed, empty: emptyExtractions } = placedRes;
                const ccJob = placeJobs.find((j) => j.caption);
                // Which field the placed caption sidecar came from, for its read memo below.
                let ccReadField2 = !!(ccPlan.job && ccPlan.job.field2);
                if (ccJob && retryCaptionField2(ccJob, placedRes)) ccReadField2 = true;
                for (const j of placeJobs) {
                    if (!placed.has(j.name)) {
                        // A caption job's failure is not a subtitle left embedded, and its index names the VIDEO stream, so it says so in its own words.
                        // placeSidecars' `empty` set is the empty-channel answer arriving early on this route: the decode ran and found no caption text,
                        // which is worth recording so no later pass repeats it. Read as a set membership, never sniffed out of the failure prose.
                        if (j.caption) {
                            const empty = emptyExtractions.has(j.name);
                            if (empty && canRecord) ccRecord.add(CC_TOKENS.none);
                            response.infoLog += `☒${streamTag(j.index)}[embedded_cc=enabled] ${empty
                                ? `The caption channel carries no caption text${ccMemoTail()}`
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
                    if (j.caption) {
                        ccPlaced = true;   // the server confirms it holds the caption srt, which is what the bitstream removal below waits on
                        // The read is known to have finished (it ran in-plugin, synchronously), so record it as the direct-write route does - without the
                        // memo, every later pass would see this sidecar through a read-only mount as an interrupted read's prefix it cannot remove, and warn
                        // so for the life of the file. With remove_source off this costs one tag-only mux on this pass; the file then settles.
                        if (canRecord) ccRecord.add(ccReadField2 ? CC_TOKENS.decoded2 : CC_TOKENS.decoded);
                    }
                    if (j.bundle) bundled += 1;
                    // NEVER for a caption job: its index is the video stream's, and removedIndices becomes a -map -0:N exclusion. Captions leave the
                    // bitstream through the strip filter below (or through video_clean on a re-encode), never by dropping the stream that carries them.
                    if (removeSource && !j.caption && !j.keep) {
                        removedIndices.add(j.index); extractedRels.add(j.name);
                        response.infoLog += titleTagGoes(streams.find((st) => st.index === j.index) || {});
                    }
                    const bundleNote = j.bundle ? ` (styled subtitle bundled with ${fontIndices.length} font${fontIndices.length === 1 ? '' : 's'})` : '';
                    response.infoLog += j.caption ? ccReadLine(j.index, j.name) : `☑${streamTag(j.index)} Extracted -> ${j.name}${bundleNote}\n`;
                }
                // Seed the import list with what just landed, so a node that can only reach the library by name has somewhere to look (see seedSubtitleList).
                if (unmappedMode === 'text_file') {
                    const placedNames = placeJobs.filter((j) => placed.has(j.name)).map((j) => j.name);
                    const why = placedNames.length ? seedSubtitleList(placedNames) : LIST_SEED_NOTHING;
                    if (!why) response.infoLog += `☑[method_unmapped=text_file] Created ${subtitleListName} listing ${
                        placedNames.length} sidecar${placedNames.length === 1 ? '' : 's'} - edit it to add your own\n`;
                    else if (why !== LIST_SEED_EXISTS && why !== LIST_SEED_NOTHING) response.infoLog += `☒[method_unmapped=text_file] Could not create ${
                        subtitleListName} - ${why}\n`;
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
            // sidecarOut rather than wrote: on the API route the sidecars are already written, and with remove_source off there is genuinely nothing
            // left for ffmpeg to do. Three endings, only one a failure: extraction ASKED FOR that left NOTHING in the library (every eligible subtitle
            // refused) - processFile:false there would file the video under success with the subtitles never extracted. A run where some sidecars landed
            // keeps going and carries its ☒ lines into a successful log (a partial result, not a failed one); a sidecar an earlier pass placed is landed
            // just as much as one written this pass. Removing captions is a BITSTREAM edit with its own two routes: where the source qualifies it happens
            // right here, in the same -c copy pass; otherwise the request is recorded in awk_cc for video_clean's next re-encode - saying so matters,
            // because until then a player shows the captions AND the new subtitle. Gated on ccPlaced, not on a job having been PLANNED: removal may only
            // follow a copy the library is confirmed to hold. A channel proven EMPTY asks for nothing - the `none` memo already stops the decode repeating.
            let ccStrip = '';
            if (((ccPlan.job && ccPlaced) || ccPlan.stripOwed) && removeSource && !ccRecord.has(CC_TOKENS.none)) {
                if (ccStripAllowed()) {
                    ccStrip = ccStripArg(removedIndices);
                    // The one outcome we are CERTAIN about. Recording `removed` ends this plugin's round trip for these captions, and tells video_clean
                    // the video bitstream changed in this job, so its guard_shrink_savings never restores the captioned original over it. Declining the
                    // memo costs only a repeated read, never data, so unlike the request below a marker-hostile container needs no warning - it just
                    // goes unrecorded.
                    if (canRecord) ccRecord.add(CC_TOKENS.removed);
                    response.infoLog += `☐${streamTag(ccVideo.index)}[remove_source=true] Removing the closed captions from the video bitstream${
                        canRecord ? ' and recording it, so sub_worker does not read them out again' : ''}\n`;
                } else if (canRecord) {
                    ccRecord.add(CC_TOKENS.strip);
                    response.infoLog += ccDeferNote(ccVideo.index);
                } else {
                    response.infoLog += `☒${streamTag(ccVideo.index)}[remove_source=true] The captions cannot be removed from this video without re-encoding`
                        + ` it, and ${dstContainer} cannot store the awk_cc request for video_clean to find - they stay in the video and a player shows both`
                        + ' copies; remux to mkv or mp4 to hand the removal on\n';
                }
            }
            const ccMeta = ccRecord.size ? ccTagArg(...ccRecord) : '';

            // ccStrip and ccMeta count as work in their own right: on the API route the sidecars are already placed, so a caption-only run has an empty
            // sidecarOut and no removedIndices, and testing those alone would skip the pass that removes the captions from the bitstream.
            if (!sidecarOut && !removedIndices.size && !ccMeta && !ccStrip) {
                // Nothing landed. Refused or unconfirmed alike, a skip here would file the video as not required: Tdarr schedules no later pass for it, so
                // the "wait" would be forever - and a rejected API key or a proxy answering 404 would silently stop every extraction, where failing makes the
                // misconfiguration visible and a requeue retries a transient one. A sidecar already on disk, even one cut short (held), has landed.
                if ((refused || deferred) && !wrote && !skipped && !held) {
                    failFile(deferred
                        ? 'No subtitle could be extracted - a sidecar in the library is unconfirmed or unreadable, see the reasons above;'
                            + ' requeue once they are resolved'
                        : 'No subtitle could be extracted - every eligible subtitle was refused, see the reasons above');
                }
                // The tag reports the value IN EFFECT, which is not always false here: a caption job never enters removedIndices, so a run that placed only
                // captions and could neither strip them nor record the request reaches this line with removal ON - one line under the ☒ that says why.
                if (wrote) return skip(`☑[remove_source=${removeSource}] Sidecars placed in the library - nothing left to remux\n`);
                if (deferred || held) {
                    const why = deferred ? 'a sidecar in the library is unconfirmed or unreadable' : 'a sidecar already on disk keeps the embedded subtitle';
                    return skip(`☒Nothing extracted this pass - ${why}, see the reasons above\n`);
                }
                return skip('☑All eligible subtitles already extracted\n');
            }

            let out = `${ccInput}${sidecarOut} -map 0`;
            out += dropMaps(removedIndices);
            out += ' -c copy';
            const keptSubs = streams.filter((s) => !removedIndices.has(s.index) && codecTypeOf(s) === 'subtitle');
            out += retagArgs(dupes.retag, keptSubs) + ccStrip + ccMeta;
            // The marker names what an import put INTO the file. A subtitle this extract takes out leaves the list with it, so a later import of that
            // sidecar - edited or not - is a real arrival rather than a removal the import must respect (goneSinceImport). An emptied list clears the tag.
            const markerNow = decodeMarkerEntries(getTagCI(file.ffProbeData.format?.tags || {}, SUB_MARKER_TAG));
            const markerLeft = markerNow.filter((e) => !extractedRels.has(e.rel));
            if (markerLeft.length !== markerNow.length) out += globalMetaArg(SUB_MARKER_TAG, encodeMarkerEntries(markerLeft));
            return commitWithExpected(out, streams.filter((s) => !removedIndices.has(s.index)), (st) => foldedView(dupes.retag, st));
            // ====== END EXTRACT ======
        }

        // ====== IMPORT: sidecars -> embedded (+ safe deletion) ======
        // Whether the caption staging sidecar is in the library RIGHT NOW - either ccPlan's existence probe found it there, or this pass uploads it below.
        // Only the text_file import route reads it, because that route has no directory to scan and cannot put the name into the user's list.
        let ccStaged = ccPlan.staged === true;
        const ccStagedName = ccPlan.stagedName || ccName;   // the spelling ccPlan found in the library, for the text_file fetch
        // The read memo the API placement route owes the import's -c copy pass when the import does not consume the staged caption sidecar.
        let ccApiRead = '';
        // An import that ends with nothing to mux would leave no record of a caption read the API placement route just finished in-plugin (ccApiRead), so
        // the next pass would take the placed sidecar for an interrupted read's prefix - and through a read-only mount neither remove nor import it. So
        // each such exit spends one tag-only mux on the memo instead of skipping; the next pass reads nothing and settles.
        const endImport = (msg) => {
            if (!ccApiRead) return skip(msg);
            response.infoLog += `${msg}☐[embedded_cc=enabled] Recording the finished caption read so no later pass takes the sidecar for an interrupted one\n`;
            return commitWithExpected(`-map 0 -c copy${ccTagArg(ccApiRead)}`, streams);
        };
        // On a writable library view captions reach a subtitle TRACK over two passes, and that is a reuse decision rather than a compromise: this pass only
        // reads them out to a hidden staging sidecar, and the next runs that file through the ordinary import path, which already verifies content, collapses
        // duplicates against what is embedded, converts to mov_text for an mp4 target, restores metadata from the name and deletes the file afterwards. Muxing
        // the captions straight in would be a second, weaker copy of all of that. The staging file is dot-prefixed so no media server offers it in the gap
        // between the two passes. With no writable view the read runs in-plugin and falls through into this same pass (below).
        if (ccPlan.job && !placeViaApi()) {
            const readMemo = canRecord ? ccTagArg(ccPlan.job.field2 ? CC_TOKENS.decoded2 : CC_TOKENS.decoded) : '';   // see the extract route
            response.infoLog += `☐${streamTag(ccVideo.index)}[embedded_cc=enabled] Reading the embedded closed captions -> ${ccPlan.job.name}`
                + ' (decodes the video); the next pass muxes them in as a subtitle track\n';
            return commitWithExpected(`${ccPresetInput(ccPlan.job.field2)}-map 1:s:0 -c:s text -f srt "${ccPlan.job.full}" -map 0 -c copy${readMemo}`, streams);
        }
        // With no writable library view to aim an extra ffmpeg output at, the same extraction runs in-plugin and uploads through the file API - and
        // then falls THROUGH into the import below rather than returning, because the sidecar is in the library now and this pass can still mux it.
        if (ccPlan.job) {
            const ccJob = { name: ccPlan.job.name, dest: ccPlan.job.remoteDest, args: ccLavfiArgs(ccPlan.job.field2) };
            const placedRes = placeSidecars([ccJob]);
            const { placed, failed, empty: emptyExtractions } = placedRes;
            const readField2 = retryCaptionField2(ccJob, placedRes) || ccPlan.job.field2;
            if (placed.has(ccPlan.job.name)) {
                response.infoLog += ccReadLine(ccVideo.index, ccPlan.job.name);
                ccStaged = true;
                // The finished read's memo, written with this pass's import (see the extract route): the import below normally consumes the staged sidecar and
                // records `imported`, but one it does not consume must not be taken for an interrupted read's prefix next pass and left un-imported.
                if (canRecord) ccApiRead = readField2 ? CC_TOKENS.decoded2 : CC_TOKENS.decoded;
                // The list is seeded here only when there ISN'T one yet; an existing list is the user's file and is never rewritten (seedSubtitleList). A real
                // failure to create one is reported exactly as the extract route reports it; swallowing it would leave the user never told the list is missing.
                if (unmappedMode === 'text_file') {
                    const why = seedSubtitleList([ccPlan.job.name]);
                    if (why && why !== LIST_SEED_EXISTS)
                        response.infoLog += `☒[method_unmapped=text_file] Could not create ${subtitleListName} - ${why}\n`;
                }
            } else {
                // An empty channel is a VERDICT and has to be memoised, exactly as the direct-write route memoises it through ccPlan.record: the tag is the
                // only thing that stops the next pass paying for the same full-video decode, and it takes a mux of its own to write. Returning here defers
                // any other import work by one pass, as the direct-write route does too - and cheaply, since that pass no longer decodes. The two outcomes
                // are EXCLUSIVE, as they are on the extract route: a channel that carried no text is not a placement that failed, and reporting both leaves
                // the user reading a library/upload fault under a line that just said there was nothing to upload.
                if (emptyExtractions.has(ccPlan.job.name)) {
                    response.infoLog += `☒${streamTag(ccVideo.index)}[embedded_cc=enabled] The caption channel carries no caption text${canRecord
                        ? ' - recorded it so no later pass re-reads it'
                        : ccMemoTail()}\n`;
                    if (canRecord) return commitWithExpected(`-map 0 -c copy${ccTagArg(CC_TOKENS.none)}`, streams);
                } else {
                    response.infoLog += `☒${streamTag(ccVideo.index)}[embedded_cc=enabled] Could not place ${ccPlan.job.name} in the library - ${
                        failed.get(ccPlan.job.name)}\n`;
                }
            }
        }
        // The global marker VALUE lists the sidecar paths (relative to the video's directory) an earlier pass consumed, so a later pass deletes exactly what
        // it embedded (never a pre-existing collision) and never re-adds them. Tdarr only re-runs after a SUCCESSFUL mux, so a listed sidecar is safely in.
        const markerEntries = decodeMarkerEntries(getTagCI(file.ffProbeData.format?.tags || {}, SUB_MARKER_TAG));
        const importedSet = new Set(markerEntries.map((e) => e.rel));
        const markerSha = new Map(markerEntries.map((e) => [e.rel, e.sha]));
        // Import scope decided from a sidecar's NAME alone (no content, no download): the caption staging file is always ours;
        // otherwise the language must be in only_languages (or the filter is off); and a styled bundle cannot go into an mp4-family
        // target that has no font attachments. Pulled out so the marker-hostile refusal can be decided from the listed names BEFORE the
        // text_file route downloads them, and so that refusal and the found-filter below can never drift on what counts as importable.
        // The caption staging sidecar is OUR intermediate, not a subtitle the user chose to scope: captions carry no language of their own, so it is tagged
        // 'und', in nobody's only_languages list, and dropping it would strand the caption round trip (the full-video decode paid, the hidden sidecar written,
        // nothing importing it, awk_cc=imported never stamped, every later pass decoding again). Extract exempts embedded_cc from its own filter.
        const subLangInScope = (f) => isCcSidecar(f.rel) || !langFilter || langFilter.has(langKey(f.lang));
        // The caption staging sidecar ccPlan found unfinished and could not remove: never imported, so nothing is muxed or stripped on a prefix.
        const ccUntrusted = (f) => ccPlan.untrusted === true && isCcSidecar(f.rel);
        // An mp4-family target carries no font attachments, so importing a styled-subtitle bundle there would embed the subtitle and strand its fonts - and
        // remove_source would then delete the only copy that has them. The bundle stays untouched on disk (the drop also keeps it out of the deletion pass);
        // remuxing the file to mkv and running import again restores it.
        const subBundleFits = (f) => !(f.bundle && isMp4);
        // The WebM muxer stores WebVTT subtitles only, and no attachments: a -c copy of anything else (srt, ass/ssa, a bundle's ass and fonts) exits 234 at
        // header write on every requeue. Converting would flatten ASS styling and break the content identity remove_source deletes on, so it is refused.
        // The caption staging sidecar never meets this rule: webm carries VP8/VP9/AV1, none of which holds embedded A53 captions, so embedded_cc has nothing to
        // stage on a webm file.
        const subWebmFits = (f) => dstContainer !== 'webm' || (!f.bundle && String(f.ext || '').toLowerCase() === 'vtt');
        // The shared scope verdict WITH its user-facing line, used by the found-filter below and by the text_file route's pre-fetch filter, so the two routes
        // can never log different reasons. Every drop says so: a sidecar that is on disk and never mentioned again is indistinguishable from one the plugin
        // never saw, and that is precisely the report a user cannot debug. Idempotent by construction (pure predicates), so a rel the pre-fetch filter already
        // passed logs nothing when the found-filter re-tests it.
        const subInScopeLogged = (f) => {
            if (ccUntrusted(f)) return false;   // ccPlan's line already says why
            if (!subLangInScope(f)) {
                // The tag echoes a free-text input, so it gets the same treatment failLangToken gives its token: control characters collapsed (a raw newline
                // would split the line into a continuation with no ☐/☑/☒ symbol) and capped, since nothing bounds the list and this line is per-sidecar.
                response.infoLog += `☑[only_languages=${logSafe(inputs.only_languages)}] Skipping ${logSafe(f.rel)} - ${logSafe(f.lang)} is not in`
                    + ' the list\n';
                return false;
            }
            if (!subBundleFits(f)) {
                response.infoLog += `☒Cannot import ${logSafe(f.rel)} - an ${dstContainer} target carries no font attachments, `
                    + 'keeping the styled-subtitle bundle on disk\n';
                return false;
            }
            if (!subWebmFits(f)) {
                response.infoLog += `☒Cannot import ${logSafe(f.rel)} - a webm target stores only WebVTT subtitles and no font attachments, so it stays on disk;`
                    + ' remux to mkv (clean_and_remux does that) and run import again\n';
                return false;
            }
            return true;
        };
        // The marker-hostile refusal message, shared by the pre-fetch check (text_file route) and the post-scan check (mapped route) so they read identically.
        const markerHostileMsg = (n) => `[action=import][container=${dstContainer}] ${n} sidecar${n === 1 ? '' : 's'} to import, but ${dstContainer}`
            + ` cannot store the ${SUB_MARKER_TAG} marker that records them, so every later pass would import them again - remux to mkv or mp4 first`
            + ' (clean_and_remux does that), then run import';

        // Import discovers sidecars by SCANNING the library directory, and an unmapped node has no view of it - libDir there is the node-local
        // mirror Tdarr downloads into, so the scan would read back only the video it was given. The file API cannot stand in: it addresses one
        // known path at a time (upload/download) and offers no directory listing, while a sidecar's name encodes language, flags and title, so
        // there is nothing enumerable to ask for. method_unmapped decides which of the three ways out applies. Whatever happens, a mode that
        // cannot do the job FAILS the file rather than skipping: the user asked for import, and processFile:false is Tdarr's "no work needed"
        // signal, so returning it would file the video under success and leave a silently un-imported library nobody has reason to look at.
        let listedRels = null;   // non-null once method_unmapped=text_file has supplied the names, since there is no directory to scan
        if (isUnmappedNode) {
            // method_unmapped=error is refused earlier, before ccPlan, so only mount/text_file reach here.
            if (unmappedMode === 'mount' && !mountedLib().dir) {
                failFile(`[method_unmapped=mount] Could not reach the library from this node - ${mountedLib().why}`);
            }
            if (unmappedMode === 'mount') {
                response.infoLog += `☑[method_unmapped=mount] Reading the library at ${mountedLib().dir} (via ${mountedLib().via}${
                    mountedLib().writable ? '' : ', read-only'})\n`;
            }
            // Every route says WHERE it read from, this one included - see the mapped-route note below for why that line matters.
            if (unmappedMode === 'text_file') {
                // No directory access at all here, so the list IS the discovery: each name is fetched from the server by path, and so is the list itself
                // (see downloadLibraryFile for why it has to sit at a name we can compute).
                const listDest = serverSidePath(path.join(libDir, subtitleListName));
                if (!listDest) {
                    failFile(`[method_unmapped=text_file] No path translator maps ${libDir} back to the server, so ${subtitleListName} cannot be `
                        + 'fetched');
                }
                const listLocal = path.join(libDir, subtitleListName);
                // No list is NOTHING TO IMPORT, not a failure. It is the ordinary state of most files: extract only writes one when it actually placed
                // sidecars, so a video with no text subtitles never has one - and a completed round trip deletes the list once its last entry is embedded.
                // Failing here would quarantine every such file, turning both "nothing to do" and "finished successfully" into errors. This is the same
                // outcome a mapped node reaches by scanning the folder and finding no sidecars; only the way it looks is different.
                const listDl = downloadLibraryFile(listDest, listLocal, SUBTITLE_LIST_MAX);
                // A server-answered miss (curl reached it, HTTP 400/501) genuinely means no list is there - the same "nothing to import"
                // a mapped node reaches by scanning an empty folder. A transport failure (server unreachable, timed out, dropped, or no
                // server URL) is NOT that: the list may exist and we simply could not read it, so mapping it to the benign path would
                // file the video under success with a requested import silently skipped - the exact outcome the contract above says
                // import must fail on. failFile so Tdarr re-queues it, matching the mount route's unreachable failFile.
                if (!listDl.ok && !listDl.serverAnswered)
                    failFile(`[method_unmapped=text_file] Could not fetch ${subtitleListName} to find what to import - ${listDl.why}`);
                if (!listDl.ok) {
                    response.infoLog += `☑[method_unmapped=text_file] No ${subtitleListName} in the library, so there is nothing listed to import`
                        + ' - extract creates one when it writes sidecars, or add it yourself with one filename per line\n';
                    listedRels = [];   // nothing to import - but the file's own duplicate subtitle streams are still worth collapsing, so fall through
                }
                if (listedRels === null) {
                    let listText = '';
                    try { listText = readTextCapped(listLocal, SUBTITLE_LIST_MAX); } catch (e) {
                        failFile(e && e.overCap ? `[method_unmapped=text_file] ${subtitleListName} is too large to be a subtitle list - ${e.message}`
                            : `[method_unmapped=text_file] Fetched ${subtitleListName} but could not read it back: ${e && e.message ? e.message : e}`);
                    }
                    const parsed = readSubtitleList(listText);
                    for (const [entry, why] of parsed.bad)
                        response.infoLog += `☒[method_unmapped=text_file] Ignoring "${logSafe(entry)}" in ${subtitleListName} - ${why}\n`;
                    // An empty list is the same "nothing to import" as no list at all - a user who emptied it, or left only comments, has said so. A list whose
                    // every line was REJECTED is different: those were written with intent and not one can be used, which is a mistake worth stopping on.
                    if (!parsed.ok.length && parsed.bad.length) {
                        failFile(`[method_unmapped=text_file] ${subtitleListName} lists no usable filenames - every line was rejected, see above`);
                    }
                    if (!parsed.ok.length) {
                        response.infoLog += `☑[method_unmapped=text_file] ${subtitleListName} lists no filenames, so there is nothing to import - `
                            + 'add one filename per line\n';
                        listedRels = [];
                    } else {
                        // A marker-hostile target refuses this import anyway (the canRecord check below), and on this route that refusal would otherwise come
                        // only AFTER downloading every listed sidecar. Decide it from the NAMES here so a doomed import never pays the fetch (re-paid on every
                        // requeue); nothing importable falls through to the file's own duplicate cleanup, exactly as the canRecord check does.
                        const listedPairs = parsed.ok.map((rel) => [rel, parseSidecarRel(rel)]);
                        const listedParsed = listedPairs.map(([, f]) => f).filter(Boolean);
                        if (!canRecord) {
                            const wouldImport = listedParsed.filter((f) => subLangInScope(f) && subBundleFits(f));
                            if (wouldImport.length) failFile(markerHostileMsg(wouldImport.length));
                        }
                        // Scope is likewise decided from the NAMES, before any transfer: an out-of-scope entry (only_languages, or a styled bundle an
                        // mp4-family target cannot carry) gets its subInScopeLogged skip line and is never downloaded. Unfiltered, it re-downloaded on
                        // EVERY pass - a sidecar that is never imported never leaves the list. Unparseable names still go through, so fetchListedSidecars
                        // keeps warning about them by name.
                        const inScope = new Set(listedParsed.filter(subInScopeLogged).map((f) => f.rel));
                        listedRels = fetchListedSidecars(listedPairs.filter(([rel, f]) => !f || inScope.has(rel)).map(([rel]) => rel), importedSet);
                        // Names an earlier pass already embedded and removed are not a shortfall, so they count out of the total rather than as failures;
                        // the same goes for the out-of-scope names skipped above, which never entered the fetch.
                        const skippedScope = listedParsed.length - inScope.size;
                        const spent = parsed.ok.filter((rel) => inScope.has(rel) && importedSet.has(rel) && !listedRels.includes(rel)).length;
                        const wanted = inScope.size - spent;
                        response.infoLog += `☑[method_unmapped=text_file] Read ${parsed.ok.length} filename${parsed.ok.length === 1 ? '' : 's'} from ${
                            subtitleListName}, fetched ${listedRels.length} of the ${wanted} still to import${
                            spent ? ` (${spent} already embedded and removed)` : ''}${
                            skippedScope ? ` (${skippedScope} out of scope, skipped above)` : ''}\n`;
                    }
                }
                // The caption staging sidecar is the plugin's OWN intermediate, but on this route the user's list is the only discovery channel - and a list
                // seeded before embedded_cc was enabled, or written by hand, will never name it, while an existing list is never rewritten (seedSubtitleList).
                // So fetch it by name, on an answer this pass has already paid for: it was uploaded above, or ccPlan's probe found it in the library. Without
                // this the round trip stalls for good - uploaded, never fetched, never muxed, and awk_cc=imported, which the run needs to converge, never
                // written, while every later pass reports the sidecar is already there and does nothing.
                if (listedRels && ccStaged && ccStagedName && !listedRels.includes(ccStagedName))
                    listedRels = listedRels.concat(fetchListedSidecars([ccStagedName], importedSet));
            }
        }

        // Every route says WHERE it read from, the two unmapped ones above included. The mapped route matters MOST: it is the only one that can end up
        // reading a node-local mirror while looking exactly like a healthy run - sidecars found there import, compare and delete perfectly well, against the
        // wrong copy of the library. It also says when the node type is UNKNOWN: that comes from otherArguments.configVars, which only the classic worker
        // supplies, so a caller passing less (the flow shim passes no configVars at all) leaves an unmapped node indistinguishable from a mapped one, and the
        // mapped assumption points every read and every delete at the mirror. Naming both the directory and the missing configuration turns that into one line.
        if (!isUnmappedNode) response.infoLog += `☑Reading sidecars from ${logPath(workLibDir())}${
            otherArguments?.configVars ? '' : ' (node type unknown - Tdarr passed no node configuration for this run)'}\n`;
        const scan = listedRels ? { rels: listedRels } : scanSidecarDirs();
        if (scan.err) failFile(`Cannot read the library directory to find sidecars: ${logPath(scan.err.message || scan.err)}`);
        // Parse every scanned name once - the found-filter and the unparseable-name warning below read the same parse. The scope filter (with its skip lines)
        // is subInScopeLogged above; on the text_file route it already ran against the listed names, and re-testing the fetched survivors here passes silently.
        const scanParsed = scan.rels.map((rel) => [rel, parseSidecarRel(rel)]);
        const found = scanParsed.map(([, f]) => f).filter(Boolean)
            .sort(byOriginalPosition)
            .filter(subInScopeLogged);
        // A file that LOOKS like a subtitle but does not parse as a sidecar is almost always a hand-named one, and saying nothing about it turns a typo into
        // a long hunt for why "nothing happened". Only subtitle EXTENSIONS are named: the library folder holds plenty of unrelated files, and reporting
        // every one of them would be noise. This runs before the empty check, because a run that imports nothing is exactly when the user needs the reason.
        for (const [rel, relParsed] of scanParsed) {
            if (relParsed) continue;
            const relBase = relBasename(rel);
            const relExt = (relBase.match(SIDECAR_EXT_RE) || ['', ''])[1].toLowerCase();
            // A DOT-PREFIXED file is hidden from media servers, and an unparseable one is usually a file the user meant to leave alone: clean_and_remux's
            // remove_imagesubs=export writes ".<video>.s<index>.<lang>[.forced].mks" for VobSub/DVB and waits on an external OCR pass, so warning about it
            // every run, forever, would be noise. Our own bundles are dot-prefixed too, but they parse and never reach this line.
            // A hidden TEXT sidecar named after THIS video is the exception: that is the OCR coming back, it is importable now, so a name that still fails to
            // parse is a genuine mistake (a bad language token, a lost s<index>) and saying nothing would strand the work the user just did.
            const ownBare = ownSidecarBare(relBase);
            const hidden = ownBare !== null ? ownBare !== relBase : relBase.startsWith('.');
            if (hidden && !(IMPORT_EXTS.includes(relExt) && ownBare !== null)) continue;
            // Only a file named after THIS video is ours to report. A season folder holds every episode's sidecars, and each of those fails to parse here by
            // design (wrong video base), so naming them would print every other episode's subtitles as a warning on every run.
            if (ownBare === null) continue;
            if (NAMED_ONLY_EXTS.includes(relExt)) {
                response.infoLog += `☒Not importing ${logSafe(rel)} - .${relExt} subtitles cannot be imported as they are; convert it to .srt to import it\n`;
            } else if (IMPORT_EXTS.includes(relExt) || relExt === STYLED_BUNDLE.ext) {
                response.infoLog += `☒Not a recognised sidecar name, skipping: ${logSafe(rel)}\n`;
            }
        }
        // A directory, FIFO or dangling link at one of this video's sidecar names (scanSidecarDirs set it apart) is named, never imported.
        for (const rel of scan.irregular || []) {
            if (parseSidecarRel(rel)) response.infoLog += `☒Not importing ${logSafe(rel)} - it is not a regular file\n`;
        }
        // This pass never removes an embedded subtitle it was not asked to, and apart from ccPlan clearing an unfinished caption staging file and the spent
        // subtitle list, the only files it can unlink are sidecars whose content is provably already in the file - the redundant-only branch below, which has
        // nothing to mux and so never reaches post-processing. Every other deletion waits for the post-processing branch above, after acceptance.
        const embeddedSubs = streams.filter((s) => codecTypeOf(s) === 'subtitle');
        const hasFontAttachment = streams.some((s) => codecTypeOf(s) === 'attachment' && isFontAttachment(s));
        // Duplicates the file already carries, removed here as well as on extract - they are a property of the file, not of a workflow. Every output index
        // below counts SURVIVING subtitle streams (see retagArgs); the unfiltered list silently retags or lands tracks one slot off for every stream removed.
        const dupes = dedupeStreams ? dedupeEmbeddedSubs(embeddedSubs) : { dropIdx: [], retag: null, log: '' };
        response.infoLog += dupes.log;
        const removedIndices = new Set(dupes.dropIdx);
        const keptSubs = embeddedSubs.filter((s) => !removedIndices.has(s.index));
        // The sha1 of every text track that will STILL be in the file after this pass, so the marker skip below can be decided on the same fact the dedup
        // further down decides on. embeddedTextHashes memoises its one ffmpeg pass, so the two share it however many times either asks.
        const survivingTextHashes = () => {
            const all = embeddedTextHashes(embeddedSubs);
            return all && new Map([...all].filter(([idx]) => !removedIndices.has(idx)));
        };

        // Nothing to import does not mean nothing to do: the file's OWN duplicate subtitle streams are still removed. Reaching the mux below requires a
        // sidecar, and this is the one route to it that has none - a library with no sidecars at all, or a round trip that has already finished and cleaned
        // up after itself, would otherwise never have its duplicates collapsed.
        if (!found.length) {
            if (!removedIndices.size) return endImport('☑No subtitle sidecars found to import\n');
            let dropOnly = ' -map 0';
            dropOnly += dropMaps(removedIndices);
            dropOnly += ' -c copy';
            dropOnly += retagArgs(dupes.retag, keptSubs);
            if (ccApiRead) dropOnly += ccTagArg(ccApiRead);   // see endImport
            return commitWithExpected(dropOnly, streams.filter((x) => !removedIndices.has(x.index)), (x) => foldedView(dupes.retag, x));
        }

        // An import is only safe where the file can carry the record of it. The awk_sub_worker marker is the ONLY thing that tells a later
        // pass a sidecar is already in the file: the content test that also settles one is optional (deduplicate) and cannot speak for a
        // bundle or for a track the target mangled - mpegts, for one, accepts a text subtitle by writing it as an opaque data stream, which no
        // later probe can match back to the sidecar. So on a marker-hostile container one import becomes an unbounded one, adding another copy
        // of every sidecar on every pass until Tdarr happens to see two identical presets and errors the file anyway. Stopping HERE, past the
        // no-sidecars branch above, keeps the file's own duplicate-subtitle cleanup working and only ever fires when there is real import work
        // to refuse - and it stops rather than skips, because sidecars are sitting in the library for this video and processFile:false would
        // file that under success, leaving a silently un-imported library nobody has reason to look at. The text_file route reaches the same
        // refusal earlier, from the listed NAMES before the fetch (see there), so a doomed import there never pays the download.
        if (!canRecord) {
            failFile(markerHostileMsg(found.length));
        }

        // Import is NON-DESTRUCTIVE: every recognized sidecar not already handled by our own prior pass (marker) is muxed in. A sidecar is never suppressed
        // just because an embedded sub shares its lang|title|disposition - metadata can't prove same content, and dropping a distinct track is data loss,
        // whereas a redundant duplicate is not (genuine duplication collapses by CONTENT - deduplicate, below). The marker suppresses a re-import only while
        // the file STILL CARRIES that subtitle: the metadata match here plus the group's own text further down (the marker is not cleared by anything but an
        // extract, so it cannot be trusted alone - see metadataMatchesEmbedded). Either way the decision is logged - "nothing happened" and "nothing needed
        // to happen" look identical from outside. Each sidecar muxes as -i "${workLibDir()}/${rel}": a " or control char in that real path would close the
        // quote and inject ffmpeg args (pathIsPresetSafe), and unlike a name we generate it must match the file byte-for-byte, so it can't be sanitised -
        // skip it, never break out. A bundle is confirmed by the subtitle inside it whenever that can be read out (bundleContent) - its name cannot spell
        // the title the subtitle carries in, nor vouch for fonts it never had - and by the name otherwise, as every loose sidecar's metadata half is.
        const bundleConfirmed = (f) => {
            const surviving = survivingTextHashes();
            const inFile = surviving ? bundleInFile(f, surviving.values()) : null;
            return inFile === null ? metadataMatchesEmbedded(f, embeddedSubs, hasFontAttachment, isMp4) : inFile;
        };
        const alreadyEmbedded = (f) => importedSet.has(f.rel)
            && (f.bundle ? bundleConfirmed(f) : metadataMatchesEmbedded(f, embeddedSubs, hasFontAttachment, isMp4));
        // The marker entries a write records: each listed sidecar with the hash of its text now (what this pass imports, or carries forward), else the
        // hash an earlier entry already held for it.
        const markerFor = (rels) => rels.map((rel) => {
            const f = found.find((x) => x.rel === rel);
            return { rel, sha: (f && sidecarContent(f)?.sha1) || markerSha.get(rel) || null };
        });
        // A sidecar written with remove_source=false left the track it came from IN the file, so importing it adds a SECOND copy of that subtitle.
        // That is not a mistake to correct - it is the point of an edit round trip, where the sidecar on disk is deliberately no longer what was extracted -
        // and this pass cannot tell an edited sidecar from an untouched one without decoding the embedded track, so it must not drop either. But it can SAY
        // so: the name carries the source stream index, and finding that stream still present, still matching, is real provenance rather than a metadata
        // guess, matched through metaMatchesStream.
        const stillEmbedded = (m) => m.index !== null && embeddedSubs.some((s) => s.index === m.index && metaMatchesStream(s, m, isMp4));
        // Only the unsafe-name check filters INDIVIDUAL sidecars here. The marker skip deliberately waits until they have been grouped by content, because
        // it is a per-file test on a metadata match and would otherwise split a byte-identical group: with two copies of one subtitle under different names,
        // whichever the marker happens to confirm drops out, leaving the OTHER to speak for the group - and which one that is flips every pass, so a retune
        // ping-pongs between their two titles forever. Grouping first gives the group one identity no matter which member is confirmed, and the retune then
        // finds the track already matching and does nothing. See the group-level skip below.
        const candidates = found.filter((f) => {
            if (pathIsPresetSafe(libPathOf(f.rel))) return true;
            response.infoLog += `☒Skipping sidecar with an unsafe filename (a quote, control char or <io>), cannot import safely: ${logSafe(f.rel)}\n`;
            return false;
        });

        // Group candidates by byte-identical file content (disabled => every file is its own group). A file whose bytes cannot be read - gone since the
        // readdir, or too large to be a subtitle at all - gets a unique key, so it is imported on its own, never silently dropped or merged.
        const contentKey = (f) => sidecarContent(f)?.sha1 || `unreadable:${f.rel}`;
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

        // The CONTENT half of the same rule (the marker is not cleared by anything but an extract - see metadataMatchesEmbedded). Specific to THIS site:
        // a sidecar the user EDITED keeps its name, so metadata still matches while the text no longer does - a group is settled only once its own bytes
        // are one of the surviving tracks, or that edit would be skipped as "already embedded". A bundle (archive, not comparable text) and a probe that
        // could not run fall back to the marker's metadata match. Group-level by construction: every member is byte-identical. A sidecar with no CUES
        // can never be confirmed by content - importing it produces a track that decodes to nothing and gets no hash, so the marker skip could never
        // fire and the same empty subtitle would be muxed in again every cycle, one more dead track each time; the marker's metadata match decides there
        // too. An unreadable or oversized sidecar answers false and takes the ordinary content route, which imports - the recoverable direction.
        const groupHasNoCues = (f) => sidecarContent(f)?.noCues === true;
        // The counterpart of contentConfirms above, and DELIBERATELY the opposite polarity - hence the different verb. contentConfirms guards an UNLINK, so
        // "cannot prove it" must mean "do not delete on content grounds" and it fails CLOSED. This one guards a SKIP, so "cannot prove it" must mean "defer to
        // the marker", which alreadyEmbedded has already confirmed against the live streams - it fails OPEN. A bundle answers true here because alreadyEmbedded
        // has already decided it on the subtitle inside it (bundleConfirmed), or on its name when that cannot be read out; returning false would re-import an
        // already-imported styled bundle as a duplicate on every pass. The name says which way it fails; do not "fix" it to match its sibling.
        const contentAllowsSkip = (f) => {
            if (f.bundle || groupHasNoCues(f)) return true;
            const surviving = survivingTextHashes();
            if (!surviving) return true;       // the probe could not run, so nothing is proven either way and the marker's metadata match decides
            if (!surviving.size) return false; // the probe RAN and no surviving track holds text, so this sidecar is demonstrably not in the file - import it
            return !!sidecarMatch(f, isMp4, surviving.values());
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
        // f.matchedBy records which identity matched (sidecarMatch), so the deletion below can keep a sidecar the import stripped.
        const embeddedAt = (f) => {
            if (f.bundle || !embeddedHashes || !embeddedHashes.size || !groupHash.has(f.members)) return null;
            f.matchedBy = sidecarMatch(f, isMp4, embeddedHashes.values());
            if (!f.matchedBy) return null;
            const h = f.matchedBy === 'text' ? sidecarContent(f)?.sha1 : sidecarRoundTripHash(f, isMp4);
            for (const [idx, eh] of embeddedHashes) if (eh === h) return idx;
            return null;
        };
        // A track already in the file needs no mux, so the only open question is its METADATA - and unlike a new track it has metadata of its own to
        // disagree with. method_import_metadata decides who wins: 'embedded' keeps the track's tags and reports the difference (a sidecar name is frozen
        // when written, so an old one carries no token for a flag that did not exist yet, and applying it would STRIP that flag); 'sidecar' makes the
        // filename authoritative - renaming a sidecar retunes the track, dispositions included, written as an explicit 0 when the name carries none.
        // Comparison, write and log all leave an mp4-family track's title alone (see metaMatchesStream): the retune sets language and flags there, and the
        // shared name carry restates the track's own title and handler on the same remux. retunedAt records each retuned SOURCE index so the embedded-dedup
        // fold below leaves that track alone - ffmpeg takes the LAST -metadata/-disposition for a slot, so the fold, appended last, would silently overwrite a
        // retune the log already announced as done.
        const alreadyInFile = []; const toMux = []; let retuneMeta = ''; const retunedAt = new Set();
        for (const f of merged) {
            const at = embeddedAt(f);
            if (at === null) { toMux.push(f); continue; }
            f.embeddedAt = at;
            alreadyInFile.push(f);
            response.infoLog += `☑${streamTag(at)}[deduplicate=${dedupeMode}] ${f.rel} is already in the file - not importing a second copy\n`;
            const cur = keptSubs.find((s) => s.index === at);
            const sameTitle = isMp4 || (cur ? titleAgrees(cur, f.title) : !nameTextOf(f.title));
            const curDisp = new Set(activeDispositions(cur));
            // `default` is muxer-managed rather than a role, so no sidecar name can carry it (see DISPOSITIONS) and f.disp never holds it. The track's own
            // flag joins the wanted set instead, which both cancels it out of the comparison and stops the whole-set write below from stripping it. Without
            // that a default-flagged track never matches its sidecar: one wasted retune remux under 'sidecar', a disagreement warning under 'embedded' on
            // every pass that leaves the sidecar in place (that branch writes no marker, so nothing settles it), and on mkv the flag silently gone. Same
            // rule as dedupeEmbeddedSubs, which keeps its own keeper's default for the same reason.
            const wantDisp = new Set(f.disp);
            if (cur?.disposition?.default === 1) wantDisp.add('default');
            const sameDisp = sameDispositions(curDisp, wantDisp);
            // A name's 'und' is no opinion either: it only says the track had no language tag when extract named the sidecar. Read as an instruction it
            // took back the language clean_and_remux's language_fill had since given the track, and the two plugins re-tagged it back and forth on every
            // cycle - different presets, so Tdarr's repeat guard never stopped it. A name can set or change a real language, never erase one; zxx and mul
            // stay instructions, since a user renames to those on purpose.
            const nameLang = langKey(f.lang || 'und') === 'und' ? '' : f.lang;
            const wantLang = nameLang || resolveLang(cur) || 'und';
            if (sameTitle && langKey(resolveLang(cur) || 'und') === langKey(wantLang) && sameDisp) continue;
            const named = [logSafe(nameLang), isMp4 ? '' : logSafe(f.title), ...f.disp].filter(Boolean).join(' ');
            if (metadataMode !== 'sidecar') {
                response.infoLog += `☒${streamTag(at)}[method_import_metadata=${metadataMode}] The sidecar name and the embedded track disagree on metadata `
                    + `- keeping the track's own (name: ${named})\n`;
                continue;
            }
            const outIdx = keptSubs.findIndex((s) => s.index === at);   // position among the SURVIVING subtitle streams (see retagArgs)
            if (!isMp4) titleWritten.add(at);
            // An empty Set spreads to an empty array, so the '0' sentinel still applies.
            retuneMeta += retagOne(outIdx, wantLang, isMp4 ? null : f.title, [...wantDisp]);
            retunedAt.add(at);
            response.infoLog += `☐${streamTag(at)}[method_import_metadata=sidecar] Retagging the track already in the file from ${f.rel} (${
                named || (isMp4 ? 'no language or flags' : 'no language, title or flags')})\n`;
        }

        // Is there anything to write to the FILE at all: a sidecar to mux, a metadata retune, or a dedup drop. Named once because the two cleanup shortcuts
        // below must be its EXACT negation and the mux branch its plain form - three hand-spelled copies of one five-term condition are three chances for
        // them to stop agreeing. A sidecar this plugin imported, UNCHANGED since (its text still hashes to the one the marker recorded), whose content the
        // file no longer holds, was removed by something else after the import - clean_and_remux's language_sub or remove_sub_sdh on the next cycle, or the
        // user. Importing it again undoes that removal every cycle: the two plugins alternate import and drop, the presets alternate too, so Tdarr's
        // identical-arguments guard never fires and the worker remuxes the file forever (measured with language_sub=eng and a French sidecar, and with
        // remove_sub_sdh=all and the imported closed captions). So the removal stands, the sidecar stays on disk, and the line says how to bring it back.
        // An EDITED sidecar hashes differently and is imported as usual, and an extract that takes a subtitle out drops it from the marker, so extract ->
        // reimport still round-trips. Proof of absence is the content: a probe that cannot run proves nothing, and the import then goes ahead as before.
        const unchangedSinceImport = (m) => {
            const was = markerSha.get(m.rel);
            const now = sidecarContent(m)?.sha1;
            return !!was && !!now && now.startsWith(was);
        };
        const goneSinceImport = (f) => {
            if (!f.members.every(unchangedSinceImport)) return false;
            const surviving = survivingTextHashes();
            if (!surviving) return false;
            return f.bundle ? bundleInFile(f, surviving.values()) === false : !sidecarMatch(f, isMp4, surviving.values());
        };
        // The marker is written whole, so a removal the guard upholds survives only while its entry does: every marker rebuilt below carries goneRels, or
        // the first pass with other work to do (a new sidecar, a retune, a dedup drop) would erase it and the next pass would import the subtitle again.
        const goneRels = [];
        for (let k = toMux.length - 1; k >= 0; k -= 1) {
            const f = toMux[k];
            if (!goneSinceImport(f)) continue;
            toMux.splice(k, 1);
            goneRels.push(...f.members.map((m) => m.rel));
            response.infoLog += isCcSidecar(f.rel)
                ? `☒[embedded_cc=enabled] The closed captions imported from ${logSafe(f.rel)} have since been removed from the file (by another plugin's `
                    + 'subtitle filter, or by hand) - not importing them again; that hidden sidecar now holds the only copy\n'
                : `☒${logSafe(f.rel)} was imported by an earlier pass and has since been removed from the file (by another plugin's subtitle filter, or by `
                    + 'hand) - not importing it again, which would undo that every cycle; the sidecar stays on disk - rename it to import it again\n';
        }
        const nothingToMux = !toMux.length && !retuneMeta && !removedIndices.size;

        // Sidecars that were only ever redundant, with nothing to mux alongside them: no transcode to wait on, so the deletion happens now rather than in
        // post-processing - safe because anything reaching here had its content in the file BEFORE this flow started, so it is in the accepted library
        // copy however the flow ends (a marker-listed member is handled below). Requires a WRITABLE library view, which placeViaApi() is the negation of:
        // a read-only mount refuses the unlink, and without any mount workLibDir() is the node-local mirror - under text_file the sidecars there are this
        // run's own downloaded scratch copies, so unlinking them reports a deletion that never touched the library. Nor can any other route delete
        // directly (the file API has no delete; with nothing to mux there is no acceptance and no server-side pass), so the placeViaApi() branch buys the
        // server pass instead of claiming a deletion it did not perform. Both cleanup shortcuts below must be the EXACT negation of the mux branch's
        // trigger (toMux || retuneMeta || removedIndices) - a queued embedded-dedup drop is work on the FILE, and returning here would discard it
        // silently. A sidecar whose import stripped something stays whichever route would remove it (deletionLoss) - said once, here, for both.
        const deletable = (nothingToMux && removeSource) ? alreadyInFile.filter((f) => {
            const loss = deletionLoss(f, f.matchedBy, isMp4);
            if (loss) for (const m of f.members) response.infoLog += keepForLossLine(m.rel, loss);
            return !loss;
        }) : alreadyInFile;
        if (nothingToMux && deletable.length && removeSource && placeViaApi()) {
            const stranded = deletable.flatMap((f) => f.members.map((m) => m.rel));
            // Forcing twice for the same sidecar is worse than not forcing at all: Tdarr ERRORS a file whose consecutive passes emit identical arguments
            // (its own infinite-transcode-loop guard), so a repeat does not merely waste a remux, it quarantines the video. The marker is the record of
            // what an earlier pass already queued, and it is checked DIRECTLY here rather than through alreadyEmbedded, which cannot confirm a sidecar whose
            // decoded title differs from the track's - a hand-added copy under a name of the user's own choosing is exactly that, and would otherwise
            // re-force on every pass. Nothing is lost by stopping: that earlier pass's marker still names them, so post-processing deletes them when it runs.
            if (!stranded.some((rel) => !importedSet.has(rel))) {
                response.infoLog += '☑[remove_source=true] Already queued for removal by an earlier pass - '
                    + 'nothing more to do until the post-processing stage runs\n';
                return endImport('☑Nothing to import - every sidecar was already in the file\n');
            }
            // The marker is written whole, so anything left out of it is erased. Carry forward every sidecar still on disk that an earlier pass already
            // settled (alreadyEmbedded), exactly as the mux path below does for the same reason: dropped from the marker, it is no longer skipped and the
            // next pass imports it again as a duplicate track. A .mks bundle has no other way back - an archive is not comparable text, so its content can
            // never re-settle it and the marker entry is the whole record. Nothing is unlinked in this branch, so every entry added here still exists.
            const markList = [...new Set([...stranded, ...found.filter(alreadyEmbedded).map((f) => f.rel), ...goneRels])];
            // The only route left, so it is taken rather than offered: a lossless copy of the whole file is emitted purely to reach the post-processing stage
            // above. Making this a setting would only work for someone who already knew the trap existed, and by then they have been caught by it: asking for
            // the sidecars to be deleted IS asking for whatever it takes. It cannot repeat - one extra pass per file, ever - because the marker stamped here
            // lists them, so the next pass filters them out through alreadyEmbedded, whether or not the deletion that follows actually succeeded.
            response.infoLog += '☒[remove_source=true] Every sidecar is already in the file and this node cannot delete them from the library - '
                + 'remuxing losslessly, since only an accepted transcode gives the server a pass in which to do it\n';
            for (const rel of stranded) response.infoLog += `☐[remove_source=true] Queued for removal once accepted: ${rel}\n`;
            return commitWithExpected(` -map 0 -c copy${globalMetaArg(SUB_MARKER_TAG, encodeMarkerEntries(markerFor(markList)))}`, streams);
        }
        if (nothingToMux && deletable.length && removeSource) {
            let gone = 0; const removedRels = new Set();
            for (const rel of deletable.flatMap((f) => f.members.map((m) => m.rel))) {
                try {
                    fs.unlinkSync(libPathOf(rel)); gone += 1; removedRels.add(rel);
                    response.infoLog += `☑[remove_source=true] Deleted sidecar (its content is already in the file): ${rel}\n`;
                }
                catch (e) { response.infoLog += `☒[remove_source=true] Could not delete sidecar ${rel}: ${e && e.message ? e.message : e}\n`; }
            }
            response.infoLog += deleteSpentSubtitleList('remove_source=true', removedRels);   // same cleanup whichever route removed them
            return endImport(`☑Nothing to import - every sidecar was already in the file${gone ? `, ${gone} removed from ${workLibDir()}` : ''}\n`);
        }

        // A retune is a mux of its own: no new inputs and no new maps, just the metadata of a stream that is already there. It rides the same output as any
        // real import when both are due, so a pass that adds one track and retags another does it in a single remux.
        if (!nothingToMux) {
            // Mux one track per group. Extra -i inputs go on the OUTPUT side of the preset, so the video being transcoded stays input 0.
            let inputSide = ''; let extraMaps = ''; let meta = retuneMeta; let fontsRestored = false;
            toMux.forEach((f, k) => {
                const outIdx = keptSubs.length + k;
                // A bundle is a container, not raw text, so it takes no -sub_charenc and its subtitle is selected by type (:s:0) rather than by index.
                // Its fonts come back only when the file has none of its own - every bundle carries the full font set, so one restore is always complete
                // and a second bundle (or a re-import into a file that kept its fonts) can never duplicate them.
                const restoreFonts = f.bundle && !hasFontAttachment && !fontsRestored;
                if (f.bundle) {
                    inputSide += ` -i "${libPathOf(f.rel)}"`;
                    extraMaps += ` -map ${k + 1}:s:0`;
                    if (restoreFonts) { extraMaps += ` -map ${k + 1}:t?`; fontsRestored = true; }
                } else {
                    inputSide += ` -sub_charenc UTF-8 -i "${libPathOf(f.rel)}"`;
                    extraMaps += ` -map ${k + 1}:0`;
                }
                meta += ` -metadata:s:s:${outIdx} "language=${langMetaValue(f.lang)}"`;
                if (f.title) meta += titleMetaArgs('s', outIdx, f.title, dstContainer);
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
            const markList = [...new Set([...consumed, ...priorStillPresent, ...goneRels])];
            // The caption staging sidecar going in is what ends the caption round trip, and recording that is REQUIRED for the run to converge, not
            // a nicety: remove_source deletes the staging file once it is embedded, so without this token the next pass would find captions in the
            // bitstream and no sidecar, decode them out again, and repeat forever. Keyed on the name because by now the plan has nothing to say -
            // the sidecar's own existence was what stopped it re-extracting this pass. Removing the bitstream copy is remove_source's decision here
            // exactly as it is on extract, and for the same reason - the captions have MOVED to a subtitle track, so leaving them burned into the
            // video shows the user both at once. Same two routes: strip in this very -c copy pass where the source qualifies, otherwise record the
            // request for video_clean's next re-encode. `imported` is kept alongside `strip` rather than replaced by it, because that token is the
            // memo that stops this plugin decoding the captions out all over again; only the pair says both things at once.
            let ccStrip = '';
            if (consumed.some(isCcSidecar)) {
                const ccAdd = [CC_TOKENS.imported];
                if (removeSource) {
                    if (ccStripAllowed()) {
                        ccStrip = ccStripArg(removedIndices);
                        // Same certainty as on extract: `removed` also tells video_clean the video bitstream changed in this job.
                        ccAdd.push(CC_TOKENS.removed);
                        response.infoLog += `☐${streamTag(ccVideo.index)}[remove_source=true] Removing the closed captions from the video bitstream\n`;
                    } else {
                        ccAdd.push(CC_TOKENS.strip);
                        response.infoLog += ccDeferNote(ccVideo.index);
                    }
                }
                meta += ccTagArg(...ccAdd);
            } else if (ccApiRead) {
                meta += ccTagArg(ccApiRead);
            }
            // drops first, so the -map 0 they subtract from is still the whole file
            extraMaps = dropMaps(removedIndices) + extraMaps;
            // A track a sidecar name has already retuned is left out of the fold: under method_import_metadata=sidecar the filename is the authority, and two
            // full tag sets aimed at one slot would leave the LAST one standing - the fold - discarding the retune this run just logged as applied.
            const folds = (dupes.retag || []).filter((r) => !retunedAt.has(r.index));
            meta += retagArgs(folds, keptSubs);
            const out = `${inputSide} -map 0${extraMaps} -c copy${ccStrip}${meta}${globalMetaArg(SUB_MARKER_TAG, encodeMarkerEntries(markerFor(markList)))}`;
            // The arrow is required, not stylistic: a bare .map(sidecarToStream) would hand Array.map's INDEX over as the mp4 flag.
            return commitWithExpected(out, streams.filter((s) => !removedIndices.has(s.index)).concat(toMux.map((f) => sidecarToStream(f, isMp4))),
                (s) => foldedView(folds, s));
        }

        return endImport(importedSet.size ? '☑Sidecars already imported; nothing to do\n' : '☑All matching subtitles already present; nothing to import\n');
        // ====== END IMPORT ======
    } catch (err) {
        failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
