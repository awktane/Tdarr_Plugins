/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio -> Subtitles -> Attachments -> Data, except that cover art in mp4/m4v/m4a stays after
        every track, where the format stores it. Audio-only .mka and .m4a files are reordered too. Audio sorts by language, then role (main, descriptive,
        commentary, then M&E and karaoke), then preferred codec, channels and quality - audio_first can lift whichever track the file flags original, default or
        descriptive above language, for foreign films. Subtitles sort forced-first, then by language and role - subtitle_first can lift the track flagged
        default, SDH or descriptive. The first MAIN audio track is marked the sole default (in containers that can store the flag - Matroska and mp4/mov; ts/avi
        are left as they are): a commentary, audio-description, M&E or karaoke track never takes it while the file has a main track, unless
        audio_first=descriptive_tagged leads with the description. Can also strip junk metadata tags (remove_junk_tags: encoder/provenance, or the fuller
        metadata set, which leaves an audio-only file's music tags alone - rides the reorder remux, so no extra pass) and front-load the mp4 moov atom for
        instant remote playback (method_mp4_faststart - every mp4 the other awk plugins write is front-loaded, so force adds one extra lossless remux only
        on a file none of them remuxed; under strip, a remux this plugin makes comes out back-loaded). Cover art in a Matroska file stays an attachment
        through a reorder remux, listed after every track and attachment, and a cover-art video track an earlier plain copy left is turned back into one;
        .webm stores no attachments, so there the remux leaves the cover out and the log says so. A file with nothing else to change keeps it untouched, and
        a .mov carrying cover art, which a .mov remux cannot write back, is not remuxed only to front-load it or strip its tags.\n\nBecause it runs last
        it also checks the finished file's duration against the library original, and FAILS (rather than accepts) a file that has come out
        more than 1% and more than a second SHORT, or that reports no duration at all where the original had one - the
        signature of an out-of-memory-killed or unfinalised encode from an earlier stage. A longer output is accepted, and so is a file clean_and_remux's
        recover_bad_* repaired in the same job: a repaired file legitimately reports its true, shorter duration, so it is flagged with a warning for manual
        review rather than failed. The same goes for a broadcast .ts or .mpg capture remuxed to mkv or mp4 in the same job with its video copied, not
        re-encoded: a capture whose timestamps jump or reset states a longer length than it holds. A later job on that file is checked in full again. This
        check is always on and has no setting.\n`,
    Version: '4.999.66',
    Tags: 'pre-processing,ffmpeg,stream-order',
    Inputs: [
        {
            name: 'audio_first',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'original_tagged', 'default_tagged', 'descriptive_tagged'],
            },
            tooltip: `Which audio track sorts first. This key sits above every other audio key. Every option but disabled promotes the track the FILE
                itself flags - a container disposition, or the role named in the track title - which is what _tagged means here.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): promote nothing - the normal ordering stands, so order_language decides.
                \\noriginal_tagged: promote the original-language track (the ffmpeg 'original' disposition, or an 'original' title) above language, so a
                foreign film leads with its original audio rather than a dub.
                \\ndefault_tagged: promote the track already flagged default (the ffmpeg 'default' disposition), so the source's chosen audio stays first.
                Where several tracks carry the flag - a source track and a downmix that inherited it, say - the highest-priority one by normal ordering
                leads. Only a main track counts: while the file has one, the main track that takes the default always leads, so a flag on a
                commentary, description, M&E or karaoke track - or no flag at all - never leaves one of those first.
                \\ndescriptive_tagged: promote the descriptive (audio-description) track above language.
                \\noriginal_tagged and descriptive_tagged fall back to normal ordering when no track carries the flag they name; default_tagged with no
                default flag on any track leads with the main track normal ordering ranks first.
                \\nWhichever you pick, the first sorted MAIN track becomes the sole default - a commentary, audio-description, M&E or karaoke track
                never does while the file has a main track, even where order_language sorts it first. descriptive_tagged is the one exception: it makes
                the audio description your default audio.`,
        },
        {
            name: 'subtitle_first',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'default_tagged', 'sdh_tagged', 'descriptive_tagged'],
            },
            tooltip: `Which subtitle role is promoted to the top of its language. Forced subtitles and order_language priority still lead. Every option
                but disabled promotes the track the FILE itself flags - a container disposition, or the role named in the track title - which is what
                _tagged means here.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): promote nothing - the standard role order within each language stands, so normal, then songs/lyrics, sdh,
                descriptive, commentary.
                \\ndefault_tagged: lift the track flagged default (ffmpeg 'default' disposition) to the top of its language.
                \\nsdh_tagged: lift SDH tracks (Subtitles for the Deaf and Hard-of-Hearing) to the top of their language.
                \\ndescriptive_tagged: lift descriptive tracks to the top of their language.`,
        },
        {
            name: 'order_language',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Comma-separated language priority list. Listed languages sort first; blank (the default) skips language ordering.
                \\nOne form is enough - en, eng, or English all match the same language, region variants like en-US included.
                \\nA language not in the list is not reordered by language: it sorts by the other keys (role, codec, channel, quality) and keeps its
                original position relative to the others.
                \\nExample: with order_channel descending and order_language eng,jpn\\nger 2.0, fre 2.0, eng 2.0, jpn 2.0, eng 5.1, jpn 5.1 is reordered to
                eng 5.1, eng 2.0, jpn 5.1, jpn 2.0, ger 2.0, fre 2.0`,
        },
        {
            name: 'order_codec',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Comma-separated list of preferred audio codecs. Blank (the default) skips codec ordering.
                \\nMatching streams are grouped above non-matching ones within their language, and each group is still ordered by order_channel then
                order_quality. The list is a membership set, not a ranking. It sits below role and above channels and quality.
                \\nMatching is by family prefix on the canonical codec: dts matches DTS-HD MA, HR and Express, and eac3 includes Atmos. Use dtsma, dtshr,
                dtsexpress or eac3atmos to name a specific variant; the spelling the Input streams log line prints, such as dts-hd-ma or eac3-atmos, works
                too.
                \\nExample:\\neac3,aac`,
        },
        {
            name: 'order_channel',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'descending <=6', 'descending <=8', 'ascending', 'disabled'],
            },
            tooltip: `Audio channel ordering - streams are ordered by channel count, then by the codec and bitrate rating. Descending is generally
                recommended.
                \\n=====
                \\nActions
                \\n=====
                \\ndescending (default): most channels first, so 5.1 then 2.0.
                \\ndescending <=6: as descending, but any track above 5.1 is demoted to the END of its own language/role/codec tier.
                \\ndescending <=8: the same, with the cap at 7.1 instead.
                \\nascending: fewest channels first, so 2.0 then 5.1.
                \\ndisabled: skip channel ordering entirely. With order_quality disabled as well, audio is not reordered by channels or quality at all,
                though language, role and order_codec still apply.
                \\nWhy cap: a client whose ceiling is 5.1 or 7.1 then auto-picks the best track it can actually play, rather than landing on a 22.2 it must
                down-convert. The demoted tail keeps the requested descending order, largest first - the cap only shifts which serveable track leads, it
                never re-sorts the tail.
                \\nThe cap applies to descending only, since ascending already puts the smallest first. If order_quality also caps, a track over EITHER cap
                is demoted. Tracks promoted by audio_first outrank the cap and still lead the audio.`
        },
        {
            name: 'order_quality',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'descending <=1024k', 'ascending', 'disabled'],
            },
            tooltip: `Audio quality ordering - streams are ordered by their computed quality score, which weighs codec and bitrate against what is
                transparent for that codec. Descending is generally recommended.
                \\n=====
                \\nActions
                \\n=====
                \\ndescending (default): best quality first, so 640k then 128k.
                \\ndescending <=1024k: as descending, but tracks above 1024k - lossless-scale TrueHD and DTS-HD MA, including a lossless track whose bitrate
                is unknown - are demoted to the END of their own language/role/codec tier.
                \\nascending: lowest quality first, so 128k then 640k.
                \\ndisabled: skip quality ordering entirely. See order_channel for what disabling both leaves.
                \\nWhy cap: the client's auto-pick then leads with a track it can serve without a heavy transcode, rather than the huge one. The demoted
                tail keeps the requested descending order, and ordering within each group is still by quality score.
                \\nA track is demoted here too if order_channel caps and it is over that cap as well. Tracks promoted by audio_first outrank the cap and
                still lead the audio.`
        },
        {
            name: 'remove_junk_tags',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'encoder', 'metadata'],
            },
            tooltip: `Strip junk metadata tags the file carries, both container-global and per-stream, riding this plugin's reorder remux so no extra pass
                is needed. Only tags actually present are cleared, so a file without them is untouched.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): leave all tags.
                \\nencoder: remove only encoder and muxer provenance nobody reads - encoded_by, and the per-stream encoder tag (a leftover
                "Lavc.../HandBrake" string). Safe on any library.
                \\nmetadata: also remove descriptive movie and TV metadata and iTunes/app flags - genre, date, description, synopsis, show, network,
                season/episode, media_type, artist, album, composer, copyright, keywords, compilation, sort-order keys and the like. An audio-only .mka or
                .m4a keeps all of these: on a music file they are the artist, album, track and genre tags a music library is organised by, so there
                metadata removes only what encoder does.
                \\nAlways kept, whichever you pick: title and comment, stream language tags, per-track bitrate statistics (BPS), the container-level encoder
                tag, and the creation date.
                \\nRunning last is what lets this clear the per-stream encoder tag a video or audio re-encode leaves behind, which a first-in-stack plugin
                could only catch a pass later.
                \\nBefore choosing metadata: a media server set to read local or in-file metadata DOES read some mp4 descriptive tags - genre, date,
                description, show and so on. That means Plex with local media assets enabled, and Jellyfin or Emby with an nfo or in-file metadata reader.
                Use it only if you do not rely on in-file metadata.
                \\nA file whose cover art a remux cannot keep - any .mov, since the .mov muxer stores none - is not remuxed only to remove tags: the tags
                stay rather than the cover going. The same goes for a Dolby Vision record a remux would drop - one no ffmpeg copy keeps, or any Dolby Vision
                .mov, whose box a .mov cannot store (clean_and_remux moves the file to mp4 or mkv, which keep it).`,
        },
        {
            name: 'method_mp4_faststart',
            type: 'string',
            defaultValue: 'force',
            inputUI: {
                type: 'dropdown',
                options: ['force', 'strip'],
            },
            tooltip: `mp4, m4v, m4a and mov only: where the moov atom, the file's index, sits. At the FRONT, players start and seek instantly on progressive
                download and remote direct-play; at the end, they have to fetch the tail first. mkv is unaffected. Every mp4-family file another awk plugin
                writes comes out front-loaded whatever this is set to, so it decides only what this plugin does.
                \\n=====
                \\nActions
                \\n=====
                \\nforce (default): front-load the moov atom. It rides any remux this plugin makes, and otherwise forces ONE lossless -c copy remux the
                first time a file arrives back-loaded (detected without decoding) - in a full awk stack, only a file no plugin before it remuxed. An
                already-fronted file is left untouched, so this settles after one pass and never loops. A file whose Dolby Vision record no ffmpeg copy
                keeps (one whose colour does not match its compatibility id, or an AV1 Profile 10.0 record), any Dolby Vision .mov (a .mov cannot store
                its box - clean_and_remux moves the file to mp4 or mkv), or a file whose cover art a remux would drop (any .mov - its muxer stores none)
                stays back-loaded rather than be remuxed for this alone.
                \\nstrip: never front-load. A remux this plugin makes for another reason - reordering, the default flag or remove_junk_tags - writes the
                moov atom at the END, the mov muxer's default, so a front-loaded file it remuxes comes out back-loaded; it never remuxes for this alone.
                Only pick this if you never stream this library remotely.`,
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
// Norwegian would miss both, and nb-NO is the common streaming tag. List matching only: a tag WRITTEN, and one track compared with another (dedup, the
// one-downmix-per-language sets, sidecar identity, language counts), stay on langKey and keep the two written standards apart - folded into langKey,
// tag_language rewrote nob and nno to nor on an mkv -> mp4 conversion (measured).
const langMatchKey = (x) => { const k = langKey(x); return (k === 'nb' || k === 'nn') ? 'no' : k; };
// ===== END SHARED: language matching =====
// #endregion

const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    const fs = require('fs');
    // eslint-disable-next-line no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        FFmpegMode: true,
        container: `.${file.container}`,
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

    // #region SHARED helpers (28 sections: stream codec type … mp4 strict compliance arg)
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
    // Keyed by the real ffmpeg disposition flag; each entry declares the valid stream types, the title keywords that also indicate the role (each
    // keyword lives on ONE flag PER STREAM TYPE - hasDisposition scopes by entry.streams - so title->flag promotion stays unambiguous;
    // descriptive/descriptions/dvs deliberately appear on both the audio and subtitle entries), and the canonical title string (tag, null when never
    // written). The single table every classifier, sort key, summary token and title tagger reads, so the lists can never drift; isCoverArt alone reads
    // its three cover-art flags raw (see there). The roles also carry the words European releases title such tracks with, unflagged: commentary, audio
    // description and SDH in German, French, Spanish, Portuguese, Italian, Dutch, Polish and the Nordic languages; forced in all of those but the Nordic
    // ones, which have no standard forced label; dub in all but German, Dutch and Finnish; original in German, French, Italian, Dutch and Polish, and in
    // Spanish and Portuguese through the bare 'original'. Plurals and the one-word compounds release labels use (Kommentare, Audiokommentar) are
    // included - compounds have no end, so these are the standard labels, not every word. Each is a whole-token match, so only a word that means nothing
    // else in a track title belongs here: VO, OV and UT stay out, and French, Italian, Dutch and Polish carry 'original' as the phrase, since their lone
    // word also names an original soundtrack (bande originale, oryginalna ścieżka dźwiękowa). Every one is pinned by the harness.
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
                                'hörgeschädigte', 'gehörlose', 'sordos', 'non udenti', 'slechthorenden', 'surdos', 'niesłyszących',
                                'hörselskadade', 'hørehæmmede', 'hørselshemmede', 'kuulovammaiset'],                            tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign', 'forcé', 'forcés', 'forzados',
                                'erzwungen', 'forçadas', 'forçada', 'forzati', 'geforceerd', 'wymuszone'],                      tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed', 'dubbing', 'doublage', 'doblaje', 'doblado', 'dublado', 'dublagem',
                                'doppiaggio', 'doppiato', 'dubbad', 'dubbet'],                                                  tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original', 'originalton', 'o-ton', 'originalfassung', 'version originale',
                                'versione originale', 'originele versie', 'wersja oryginalna'],                                 tag: 'Original'    },
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
    // -=-=-= IMAGE_CODECS / COVER_FLAGS / isCoverArt [all five] =-=-=-
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
    const COVER_FLAGS = ['attached_pic', 'still_image', 'timed_thumbnails'];
    // Reads ffprobe fields only - the raw flags, on a video stream as dispositionTypes scopes them, never hasDisposition, whose
    // keyword half reaches mediaInfoFor - so it is safe on another file's streams (the library original's, in primaryVideo and
    // stream_ordering's truncation check). A keyword added to those three dispositionTypes rows is not read here.
    const isCoverArt = (s) => IMAGE_CODECS.includes(codecNameOf(s))
        || (codecTypeOf(s) === 'video' && (COVER_FLAGS.some((k) => s.disposition?.[k] === 1) || /^image\//i.test(getTagCI(s.tags, 'mimetype'))));
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
    // -=-=-= mp4CreatedTracks (+ MP4_CHAPTER_KEY) [all five] =-=-=-
    // mediaInfo's Menu keys each chapter by its start time (_00_01_23_456).
    const MP4_CHAPTER_KEY = /^_(\d{2})_(\d{2})_(\d{2})_(\d{3})$/;
    // The tracks an mp4-family mux writes that no source stream stands behind, as the next pass's ffprobe reports them, so an Expected results line matches the
    // next Input streams line: a chapter track (data, bin_data, 'text') when the file has chapters but no source chapter track (isMp4ChapterTrack), and a tmcd
    // (data, no codec name, 'tmcd') for each one mp4TimecodeCount counts in `kept` beyond the source tmcds it rebuilds. Index -1, so no mediaInfo track joins
    // either. mp4 and mov write both, as do .m4v and .m4a under the -f mp4 outputMuxerArg forces (the ipod muxer an .m4v selects by extension writes no tmcd),
    // and a copied tmcd (mov) stops the muxer writing any. Measured 2026-10-23 on jellyfin 7.1.4 and mediainfo.js 0.2.0; awk-ffmpeg-test's fmtprobe create:*
    // and miprobe mi:menu* rows re-measure it. Summary only: nothing is mapped or counted as work.
    const mp4CreatedTracks = (container, kept) => {
        if (!isMp4Family(container)) return [];
        const streams = file?.ffProbeData?.streams || [];
        // The muxer writes the chapter track from chapter TITLES, empty ones included: a list with none writes a Nero list alone. Tdarr probes without
        // -show_chapters, so they are read off mediaInfo's Menu, which lists an empty title not at all, while the mov demuxer gives every Nero entry a title.
        // So a track is promised for any chapter key, and for a Menu naming no field (every title empty, Nero or Matroska). mediainfo.js spells a
        // Matroska chapter with no title at all as its own start time, exactly as it spells one titled with that time (once ffmpeg has written the file,
        // which stores no chapter language - one tagged with a language reads 'en:...'), and the two cannot be told apart without -show_chapters; the
        // titled shape is the one promised, measured 2026-11-14 on the sample corpus's Matroska files: one chapter titled its own start time (Anime
        // Sample1, read back bare after any ffmpeg remux, whose mp4 copy gains the chapter track) and no untitled one, so a file whose chapters carry
        // no title at all - whose mp4 copy writes only a Nero list - is the residual that promises a track the next pass does not read. A zero-entry Nero
        // list reads as an empty one, though ffmpeg writes a list only for a file with chapters. An MPEG-TS program Menu and a QuickTime chapter track's
        // own Menu name fields and key no chapter, so neither counts.
        const titled = (t) => Object.keys(t).every((k) => ['@type', '@typeorder', ''].includes(k))
            || Object.keys(t.extra || {}).some((k) => MP4_CHAPTER_KEY.test(k));
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
    // Whether an output's command writes any -disposition at all (readBackDispositions' `manual`). Quoted values are blanked first, so a title holding
    // ' -disposition:' is no write - escMeta leaves no double quote inside a value.
    const carriesDisposition = (args) => /(^|\s)-disposition[:\s]/.test(String(args || '').replace(/"[^"]*"/g, '""'));
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
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg path =====
    // -=-=-= ffmpegPathOf [all five] =-=-=-
    // The node's ffmpeg: Tdarr hands a classic plugin otherArguments.ffmpegPath, and the bare name - a PATH lookup - stands in when it supplied none. Every
    // ffmpeg spawn in the five plugins resolves the binary here, so a change to how it is found reaches all of them at once.
    const ffmpegPathOf = (otherArgs) => String(otherArgs?.ffmpegPath || 'ffmpeg');
    // ===== END SHARED: ffmpeg path =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: matroska cover keep =====
    // -=-=-= matroskaCovers (+ its staging, -attach and log helpers)  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // A Matroska cover is an image attachment the demuxer reports as an attached_pic video stream (only for an image/gif, image/jpeg, image/png or image/tiff
    // mimetype - any other image is an ordinary attachment that -map 0 copies byte-identical), and a -map 0 -c copy writes it back as a one-frame video track
    // (V_MJPEG; V_MS/VFW/FOURCC for png, V_QUICKTIME for gif) that has lost attached_pic and probes at 30000/1, with -disposition attached_pic or without. Only
    // -attach writes an attachment, and it reads a FILE, so a remux these plugins make for another reason copies each cover's bytes out first, leaves the
    // stream out of its map and attaches the file again. The cover is never itself a reason to remux, and one that cannot be attached again is copied as a
    // video track instead, with a line, never a failed file. A track a plain copy made of a cover keeps the attachment's mimetype tag (see isCoverArt), so it
    // is found too: the next remux that can stage it turns it back into an attachment. An attached one is dropped only when its picture does not read as
    // an image (see stageMatroskaCovers), and every cover on .webm, which stores neither.
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
    // Stages the covers of a Matroska-family remux: `kept` are attached again (matroskaCoverArgs), `asTrack` (every other cover, copied as a video track -
    // `track` says it was one already) and `dropped` carry the reason, and `leaveOut` is every input stream the map must leave out. No ownership test on the
    // folder: on a CIFS or root-squashed NFS cache every file reads as the mount's owner, and a retry may resume on another node; lstat refuses a symlink, and
    // anyone who can write the work directory can already replace the cache file Tdarr promotes. .webm stores no attachments (its muxer ignores -attach), and
    // its muxer refuses an image track (only VP8/VP9/AV1 video; exit 234, jellyfin 7.1.4), so there every cover is dropped.
    const stageMatroskaCovers = (container, covers, inputPath, otherArgs, streams) => {
        const path = require('path');
        const fs = require('fs');
        const res = { kept: [], dropped: [], asTrack: [], leaveOut: [] };
        // An attached picture that does not parse as its mimetype's codec (a PNG or WebP labelled image/jpeg, a truncated JPEG) probes at 0x0, and copied as a
        // track it takes the whole Matroska mux down ('dimensions not set', exit 234; measured 2026-11-09 on jellyfin 7.1.4), so only one with dimensions
        // can stay a track; the other is dropped for that reason.
        const fail = (it, why, detail = '') => {
            if (why !== 'webm' && (it.track || (Number(it.s.width) > 0 && Number(it.s.height) > 0)))
                res.asTrack.push({ s: it.s, why, detail, track: it.track });
            else res.dropped.push(why === 'webm' ? { s: it.s, why, detail } : { s: it.s, why: 'unreadable', detail: '' });
        };
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
        unreadable: 'its picture does not read as the image its mimetype names, and as a track it would fail the whole remux',
        stage: 'the work directory has no usable awk_cover folder to stage it in',
        extract: 'ffmpeg could not copy it out to attach it again',
        timeout: `copying it out was stopped after ${COVER_BOUNDED_TIMEOUT_MS / 1000} s`,
    };
    // Where Matroska reads a cover copied as a track (stageMatroskaCovers' asTrack) back: after the tracks ahead of it in the command and before every
    // attachment, since the demuxer reports every track first - so an attached one that -map 0 copies from among the attachments comes back ahead of them
    // (measured 2026-11-09 on jellyfin 7.1.4: font then cover in, cover then font out). `list` is an Expected results list in command order.
    const coverTracksAsRead = (list, asTrack, streamOf = (x) => x) => {
        const moved = new Set(asTrack.map((d) => d.s.index));
        const out = [];
        for (const x of list) {
            let at = out.length;
            while (moved.has(streamOf(x).index) && at > 0 && codecTypeOf(streamOf(out[at - 1])) === 'attachment') at -= 1;
            out.splice(at, 0, x);
        }
        return out;
    };
    const coverShownName = (it) => (logSafe(escMeta(it.name)) === logSafe(it.name) ? logSafe(it.name)
        : `${logSafe(it.name)}, written as ${logSafe(escMeta(it.name))}`);
    const matroskaCoverLog = (staged) => staged.kept.map((it) => `☐${streamTag(it.s.index)} ${it.track ? 'Turning the cover-art track back into'
        : 'Copying out the cover art to keep it as'} an attachment (${coverShownName(it)}) - read back after every track and attachment\n`).join('')
        + [...staged.dropped.map((d) => ['Cover art dropped', d]), ...staged.asTrack.map((d) => [d.track ? 'The cover-art track stays a video track'
            : 'Cover art kept as a video track until a later remux can attach it again', d])]
            .map(([what, d]) => `☒${streamTag(d.s.index)} ${what} - ${COVER_LOST_WHY[d.why]}${d.detail ? ` (${d.detail})` : ''}\n`).join('');
    // ===== END SHARED: matroska cover keep =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4 uncopyable streams =====
    // -=-=-= isUnidentifiedStream / mp4UncopyableStreams (+ mp4LostData, mp4UncopyableLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // A stream ffmpeg cannot identify at all: ffprobe omits its codec_type (an MPEG-TS private-section PID, stream_type 0x05, as DVB recordings carry), and
    // ffmpeg refuses any map of it, -map 0 included ("Cannot map stream ... unsupported type", exit 234 on jellyfin 7.1.4; -map 0 -map -0:N exits 0), so a
    // remux keeping it fails on every requeue, in any container. clean_and_remux removes it; a run without that meets it here.
    const isUnidentifiedStream = (s) => !['video', 'audio', 'subtitle', 'attachment', 'data'].includes(codecTypeOf(s));
    // The streams a -c copy cannot carry as they are, which each remux here leaves out of its map: in every container a stream ffmpeg cannot identify, and
    // two data streams of the mp4 family. One is a stream ffprobe names no codec for - in practice a camera's tmcd timecode track - in mp4/m4v/m4a: the mp4
    // muxer refuses it outright ("Could not find tag for codec none", exit 234 on jellyfin 7.1.4) and takes the whole command down, so a -map 0 copy of such a
    // file fails on every requeue. Its timecode survives where the muxer rebuilds it (isMp4RebuiltTimecode). mov copies the track as-is and is left alone.
    // The other is the chapter track, in mov too, which the muxer always rebuilds from the chapters (see isMp4ChapterTrack). clean_and_remux removes every
    // such stream the muxer would not put back, so in the designed stack only a run without it meets a lost one. The log line names each stream left out and
    // says what carries over.
    const mp4UncopyableStreams = (container, streams) => {
        const c = String(container || '').toLowerCase();
        const noCodec = (s) => ['mp4', 'm4v', 'm4a'].includes(c) && codecTypeOf(s) === 'data' && ['', 'unknown', 'none'].includes(codecNameOf(s));
        return (streams || []).filter((s) => isUnidentifiedStream(s) || noCodec(s) || (isMp4Family(c) && isMp4ChapterTrack(s)));
    };
    // The dropped streams whose data really leaves the output - all of them but a track the muxer rebuilds - so an Expected results line never promises one.
    // `kept` is what the output maps (see isMp4RebuiltTimecode); a tmcd carrying the timecode of a video the muxer cannot time is lost for that reason
    // (mp4OverfastFor), and one lost while the muxer still writes others is one past its one-per-video count.
    const mp4LostData = (dropped, kept) => dropped.filter((s) => !isMp4ChapterTrack(s) && !isMp4RebuiltTimecode(s, kept));
    const mp4UncopyableLog = (container, dropped, kept) => dropped.map((s) => {
        if (isUnidentifiedStream(s)) {
            return `☐${streamTag(s.index)} Leaving out a stream ffmpeg cannot identify - it cannot be copied (${codecTypeOf(s) || 'unknown'}-`
                + `${codecNameOf(s) || 'none'})\n`;
        }
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
    // .rm's muxer exits 0 but writes every video as an RV20 stream (RV10 for rv10) that no longer decodes - a copy of rv10, rv20 or H.264 and an HEVC
    // encode all decoded 0 frames - so a write-back would replace the file with one whose picture is gone (an audio-only .ra writes back whole, so it has
    // no row); .rmvb, .ogm, .mk3d, .qt, .3gpp, .wm, .mpe and .dvr-ms have no muxer by extension (exit 234).
    // awk-ffmpeg-test's muxmatrix mirrors this table (guarded by selftest_mirrors) and re-measures its rows.
    const OUTPUT_MUXER_BY_EXT = {
        m4v: 'mp4', m4a: 'mp4', tp: 'mpegts', trp: 'mpegts', tod: 'mpegts', divx: 'avi', m2p: null, vro: null, mod: null, evo: null, dat: null,
        m2v: null, mpv: null, rm: null, rmvb: null, ogm: null, mk3d: null, qt: null, '3gpp': null, wm: null, mpe: null, 'dvr-ms': null,
    };
    // The output-side -f a container needs: '' where ffmpeg's own pick by extension is right, null where no muxer can write the extension back at all.
    const outputMuxerArg = (container) => {
        const c = String(container || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(OUTPUT_MUXER_BY_EXT, c)) return '';
        return OUTPUT_MUXER_BY_EXT[c] ? ` -f ${OUTPUT_MUXER_BY_EXT[c]}` : null;
    };
    const noMuxerSkipLine = (container) => `☒A .${container} file has no ffmpeg muxer that can write it back - left untouched; remux it to mkv or mp4 first`
        + ' (clean_and_remux does that)\n';
    // -=-=-= CONTAINER_REFUSES_COPY (+ containerRefusesCopy, copyRefusedSkipLine)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The cells where even a STREAM COPY back into the same container is refused: the muxer has no way to store the codec at all, so it refuses at header
    // write whatever tag the stream carries (measured on jellyfin-ffmpeg 7.1.4, 2026-10-12; .wtv and .mxf 2026-11-14). Only another tool writes such a
    // file - an AV1 .mov the mp4 muxer wrote, say - and a copy of its video back fails it on every requeue with nothing but ffmpeg's message (exit 234;
    // 255 from .wtv and .mxf). H.264 is no .wtv cell: a .wtv's own H.264 copies back whole, and only an avcC stream from another container is refused.
    // video_clean's CONTAINER_REFUSES_VIDEO holds these cells and more that fail only an ENCODE: avi/asf/wmv write whatever fourcc the stream carries, so an
    // encode with none is refused or reads back as rawvideo while a copy that keeps the source's working tag muxes and reads back fine; and the MPEG-PS/TS AV1
    // cells cannot be reached by a copy, since a source those muxers cannot carry never probes as av1. awk-ffmpeg-test's muxmatrix mirrors this table too
    // (WRITEBACK_COPY_REFUSES).
    const CONTAINER_REFUSES_COPY = {
        webm: ['hevc', 'h264'], mov: ['av1'], '3gp': ['hevc', 'av1'], '3g2': ['hevc', 'av1'],
        ogv: ['hevc', 'h264', 'av1'], ogg: ['hevc', 'h264', 'av1'], wtv: ['hevc'], mxf: ['hevc', 'av1'],
    };
    const containerRefusesCopy = (container, codec) => (Object.prototype.hasOwnProperty.call(CONTAINER_REFUSES_COPY, container)
        ? CONTAINER_REFUSES_COPY[container] : []).includes(codec);
    // The skip for a copy of `streams` back into `container` when it refuses one of their video codecs ('' when it refuses none), tagged with that stream
    // and `tag`, the input that asked for the copy.
    const copyRefusedSkipLine = (container, streams, tag = '') => {
        const v = (streams || []).find((s) => codecTypeOf(s) === 'video' && containerRefusesCopy(container, codecNameOf(s)));
        return v ? `☒${streamTag(v.index)}${tag} A .${container} file cannot hold ${codecNameOf(v)} video, so even a lossless copy is refused - left untouched;`
            + ' remux it to mkv or mp4 first (clean_and_remux does that)\n' : '';
    };
    // -=-=-= movDvLossLine  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // One warning per video stream a write into `container` takes a Dolby Vision box from (movLosesDvBox), '' when none does, on the pass that writes
    // it; `act` names a write that is not a remux. `streams` is the list the output maps, each written stream as the caller reads it.
    const movDvLossLine = (container, streams, act = 'remux') => streams.filter((s) => movLosesDvBox(container, s))
        .map((s) => `☒${streamTag(s.index)} Dolby Vision is lost in this ${act} - ffmpeg cannot write its box into a .mov; run clean_and_remux first to move`
            + ' the file to mp4 or mkv\n').join('');
    // -=-=-= ROLE_LOSS_WHY / roleLossLine  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // One warning per stream a write takes role flags from (MOV_UNSTORED_ROLES names them all), worded as movDvLossLine: those readBackDispositions
    // reads back 0 on the output. Only two outputs store fewer than a source of their own kind can hold: a .mov the mp4 muxer wrote (-f mp4) holds
    // them all and the mov muxer stores none; a .webm mkvmerge wrote holds Matroska's flags, and ffmpeg's webm muxer keeps only default, forced and a
    // subtitle's one WebVTT kind (measured: a stream_ordering reorder of an mkvmerge --webm file dropped its commentary, original and
    // visual_impaired flags). So a forced subtitle that stops showing by itself, or a commentary read as a main track, is said.
    const ROLE_LOSS_WHY = { mov: ['ffmpeg writes no role flag into a .mov', 'mp4 or mkv'],
        webm: ['a .webm keeps only forced and, on a subtitle, one WebVTT kind', 'mkv'] };
    const roleLossLine = (container, streams, act = 'remux') => {
        const why = ROLE_LOSS_WHY[String(container || '').toLowerCase()];
        return why ? streams.map((s) => {
            const back = readBackDispositions(container, [s], true)[0].disposition || {};
            const lost = MOV_UNSTORED_ROLES.filter((k) => s.disposition?.[k] === 1 && back[k] !== 1);
            return lost.length ? `☒${streamTag(s.index)} Its ${lost.join(' and ')} flag${lost.length > 1 ? 's are' : ' is'} lost in this ${act} - ${why[0]};`
                + ` run clean_and_remux first to move the file to ${why[1]}\n` : '';
        }).join('') : '';
    };
    // -=-=-= dvCopyFourccArgs (+ dvCopyFourccLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The -tag:v args dvCopyFourcc asks for on `kept`, the streams the output writes in output order: each video is addressed by its place among the
    // output's video streams.
    const dvCopyFourccArgs = (container, kept) => kept.filter((s) => codecTypeOf(s) === 'video')
        .map((v, n) => (dvCopyFourcc(container, v) ? ` -tag:v:${n} ${dvCopyFourcc(container, v)}` : '')).join('');
    // One ☐ line per video the args retag.
    const dvCopyFourccLog = (container, kept) => kept.filter((s) => codecTypeOf(s) === 'video' && dvCopyFourcc(container, s))
        .map((s) => `☐${streamTag(s.index)} Tag video as ${dvCopyFourcc(container, s)} - a Profile 5 Dolby Vision record keeps its box in mp4 only under a`
            + ' Dolby Vision fourcc\n').join('');
    // ===== END SHARED: output muxer =====
    // ===== SHARED [audio_clean, stream_ordering]: mka cover-art refusal =====
    // -=-=-= mkaCarriesCoverArt + mkaCoverArtSkipLine  [audio_clean, stream_ordering] =-=-=-
    // An audio-medium .mka with cover art is left untouched by audio_clean and stream_ordering alike. Production ffprobe (jellyfin 7.1.4) reports Matroska's
    // image attachment as an attached_pic VIDEO stream - video/mjpeg, avg_frame_rate 0/0, probed last - so any video-typed stream in one is cover art. A
    // plain -c copy would write it back as a real V_MJPEG video TRACK, after which Tdarr reads the music file as a video and clean_and_remux renames it to
    // .mkv; a remux by these plugins keeps it an attachment only by copying the image out and attaching it again (matroskaCovers), which needs Tdarr's work
    // directory and an extra ffmpeg run, and copies it as that video track when either fails. A music file's cover is its one picture, so neither plugin
    // puts it through that, and both refuse the file with the same words. An .mka Tdarr reads as a video - one carrying an earlier plain copy's cover TRACK -
    // is not refused: it takes the video path, where a remux made anyway turns the track back into an attachment.
    const mkaCarriesCoverArt = (container, streams) => container === 'mka' && (streams || []).some((s) => codecTypeOf(s) === 'video');
    const mkaCoverArtSkipLine = '☒[mka] This .mka carries cover art - left untouched, so a remux can never lose it\n';
    // ===== END SHARED: mka cover-art refusal =====

    // ===== SHARED [audio_clean, stream_ordering]: audio codec scoring =====
    // -=-=-= codecInfo  [audio_clean, stream_ordering] =-=-=-
    // Codec quality weights + bitrate thresholds for picking the best track (audioQuality). Three row shapes, each field one job:
    //   lossless: { score }                                    - already perfect; audioQuality returns score directly.
    //   encodable (aac/opus/ac3/eac3): { score, minimum }      - SCORING thresholds come from the CODEC_TARGET_BPS ladder (see scoreThresholds); no
    //       `transparent` here, and `minimum` is kept ONLY as the transcode floor read by resolveBitrate (audio_clean).
    //   source-lossy (everything else): { score, transparent } - `transparent` is the 2-CHANNEL baseline; scoreThresholds scales it by (ch/2)^0.65 and
    //       derives minimum as MIN_RATIO of transparent. Some formats here aren't ffmpeg-encodable (e.g. ac4).
    // objectAudio: true marks a codec carrying object-audio metadata (Atmos/DTS:X/MPEG-H/AC-4) that ffmpeg cannot re-encode - read only by audio_clean's
    // guard_object_audio, never by the score/threshold math. AC-4 is flagged WHOLESALE because no probe separates its immersive variants (IMS, AJOC) from
    // plain channel-based AC-4: protect-all is the fail-safe half, since AC-4 has no ffmpeg encoder - a "protected" channel-based track merely stays AC-4,
    // whereas an unprotected IMS track (2ch, immersive, indistinguishable from plain stereo) would be flattened to stereo AAC.
    const codecInfo = {
        // Lossless
        pcm:         { score: 100, lossless: true },
        g711:        { score: 40,  transparent: 64000 },   // G.711 A-law/mu-law: lossy 8-bit telephony, a heavy score BELOW every real music codec so it never wins a dedup group or guard_lossless
        s302m:       { score: 100, lossless: true },   // SMPTE 302M PCM (broadcast MPEG-TS) — effectively uncompressed, so guard_lossless must protect it
        flac:        { score: 100, lossless: true },
        alac:        { score: 100, lossless: true },
        wavpack:     { score: 100, lossless: true },
        ape:         { score: 100, lossless: true },
        tak:         { score: 100, lossless: true },
        tta:         { score: 100, lossless: true },
        wmalossless: { score: 100, lossless: true },
        als:         { score: 100, lossless: true },   // MPEG-4 ALS (ffprobe 'als'; the mp4-wrapped 'mp4als' folds here via foldCodecAlias) — lossless, so guard_lossless must protect it
        dsd:         { score: 100, lossless: true },   // DSD / SACD 1-bit (ffprobe dsd_lsbf/dsd_msbf[_planar], folded via foldCodecAlias) — lossless, so guard_lossless must protect it
        // Decode-only lossless: no ffmpeg encoder, so each can only ever arrive as a SOURCE. All four carry ffmpeg's lossless flag (the trailing S of D.AI.S
        // in `ffprobe -codecs`), and without a row here they'd fall to UNKNOWN_CODEC_SCORE (70, no lossless flag) - below aac and mp3, leaving them unguarded.
        dst:         { score: 100, lossless: true },   // DST (Direct Stream Transfer) — the COMPRESSED form of DSD carried by every SACD ISO rip; dsd above is the raw form
        ralf:        { score: 100, lossless: true },   // RealAudio Lossless (RealMedia containers)
        shorten:     { score: 100, lossless: true },   // Shorten (.shn) — the pre-FLAC live-taping format
        osq:         { score: 100, lossless: true },   // OSQ (Original Sound Quality)
        mlp:         { score: 99,  lossless: true },

        // Dolby family
        truehd:      { score: 99,  lossless: true },
        truehdatmos: { score: 99,  lossless: true,       objectAudio: true },
        dtsma:       { score: 98,  lossless: true },
        dtsmax:      { score: 98,  lossless: true,       objectAudio: true },
        dtshr:       { score: 94,  transparent: 1470000 },
        dtshrx:      { score: 96,  transparent: 1470000, objectAudio: true },
        dts:         { score: 91,  transparent: 740000 },
        dtsx:        { score: 93,  transparent: 740000,  objectAudio: true },
        eac3atmos:   { score: 92,  transparent: 375000,  objectAudio: true },
        dtsexpress:  { score: 80,  transparent: 188000 },
        dtsexpressx: { score: 82,  transparent: 188000,  objectAudio: true },

        // Modern multichannel codecs
        ac4:         { score: 90,  transparent: 188000,  objectAudio: true },
        eac3:        { score: 89,  minimum:     192000 },  // encodable -> scores off CODEC_TARGET_BPS; minimum = transcode floor only
        mpegh3d:     { score: 89,  transparent: 250000,  objectAudio: true },

        // Modern general-purpose codecs
        opus:        { score: 89,  minimum:      64000 },  // encodable
        aac:         { score: 87,  minimum:      96000 },  // encodable
        vorbis:      { score: 86,  transparent: 256000 },

        // Legacy but still excellent
        ac3:         { score: 84,  minimum:     192000 },  // encodable
        atrac:       { score: 83,  transparent: 192000 },
        wma:         { score: 82,  transparent: 192000 },
        wmavoice:    { score: 45,  transparent:  24000 },  // low-bitrate SPEECH codec (~4-20 kbps) - scored well below music codecs so a wmavoice track never outranks a real one
        wmapro:      { score: 82,  transparent: 256000 },
        mpc:         { score: 82,  transparent: 220000 },

        // Older codecs
        mp3:         { score: 78,  transparent: 320000 },
        mp2:         { score: 73,  transparent: 256000 },
        mp1:         { score: 68,  transparent: 384000 },  // MPEG-1 Layer I (old MPEG-1/VCD, DVB captures) - needs more bitrate than mp2/mp3 to match them
        adpcm:       { score: 60,  transparent: 256000 },
        cook:        { score: 58,  transparent: 128000 },

        // Speech / telephony - every score below cook (58), the lowest music codec, so a low-bitrate voice track can never win a dedup group or satisfy a
        // quality guard. transparent is each codec's own top rate. Joins g711 (40) and wmavoice (45), carved out above for the same reason.
        qdm:         { score: 55,  transparent: 128000 },  // QDesign Music 1/2, old QuickTime - music-capable, so highest of this group
        nellymoser:  { score: 50,  transparent:  88000 },  // Flash/FLV speech-music hybrid
        speex:       { score: 42,  transparent:  44000 },  // VoIP / old web audio
        amr_wb:      { score: 42,  transparent:  23850 },  // AMR wideband (G.722.2), top mode
        sipr:        { score: 38,  transparent:  32000 },  // RealAudio SIPR / ACELP.NET
        ra_288:      { score: 36,  transparent:  15200 },  // RealAudio 2.0 (28.8) - the codec a real .rm/.rmvb rip carries; ralf/cook/sipr are its siblings
        gsm:         { score: 35,  transparent:  13200 },  // GSM 06.10 full-rate (folds gsm_ms)
        qcelp:       { score: 34,  transparent:  14000 },  // Qualcomm PureVoice (QCELP-13) - CDMA phone video (.3g2), amr_nb's counterpart there
        evrc:        { score: 33,  transparent:   9600 },  // EVRC, the CDMA successor to QCELP (.3g2)
        amr_nb:      { score: 32,  transparent:  12200 },  // AMR narrowband, top mode - every .3gp phone recording
        ra_144:      { score: 30,  transparent:   8000 },  // RealAudio 1.0 (14.4) - fixed 8 kbps, the oldest of the family
        truespeech:  { score: 30,  transparent:   9600 },  // DSP Group TrueSpeech, very old
        g729:        { score: 30,  transparent:   8000 },  // G.729 - IP cameras, NVRs and VoIP at 8 kbps
        g723_1:      { score: 30,  transparent:   6300 },  // G.723.1 - VoIP / NVR at 5.3-6.3 kbps
        ilbc:        { score: 30,  transparent:  15200 },  // iLBC - VoIP at 13.3-15.2 kbps (G.726 is adpcm_g726 to ffprobe, so it folds to adpcm)
    };
    // -=-=-= unknownCodecs  [audio_clean, stream_ordering] =-=-=-
    const unknownCodecs = new Set();

    // -=-=-= CODEC_TARGET_BPS  [audio_clean, stream_ordering] =-=-=-
    // Per-channel target bitrate (bps) for our encodable output codecs (ac3/eac3 cap at 6ch in ffmpeg). Single source for scoreThresholds' transparent
    // point, audioQuality's bitrate-less membership check, and audio_clean's transcode targetTable - so scored transparent and transcode target can't drift.
    const CODEC_TARGET_BPS = {
        aac:  { 1: 128000, 2: 256000, 3: 320000, 4: 384000, 5: 448000, 6: 512000, 7: 576000, 8: 640000 },
        opus: { 1: 128000, 2: 192000, 3: 256000, 4: 320000, 5: 320000, 6: 384000, 7: 448000, 8: 448000 },
        ac3:  { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
        eac3: { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
    };
    // -=-=-= MIN_RATIO / scoreThresholds  [audio_clean, stream_ordering] =-=-=-
    // Channel-count-aware thresholds (bps): transparent (0 penalty) and minimum (max penalty). Encodable codecs read the CODEC_TARGET_BPS ladder - so
    // scoring-transparent IS the encode target and the two can't drift; every other codec scales its 2-channel transparent by (ch/2)^0.65. minimum is a
    // uniform MIN_RATIO fraction of transparent, so no hand-tuned floor can land on top of a standard reduced-rate mode (e.g. half-rate DTS @768k).
    const MIN_RATIO = 0.4;
    // Fallbacks for a codec with no codecInfo row. The score sits between mp2 and adpcm - an uncatalogued codec is more likely mediocre than excellent,
    // but guessing it worthless would let a real track lose a dedup it should win. 320k is the 2ch figure the catalogued lossy codecs land on.
    const UNKNOWN_CODEC_SCORE = 70;
    const UNKNOWN_TRANSPARENT_BPS = 320000;
    // Perceptual quality-vs-channel-count exponent: transparent scales by (ch/2)^this - shared by scoreThresholds and audio_clean's resolveBitrate.
    const CHANNEL_SCALE_EXPONENT = 0.65;
    const scoreThresholds = (codec, channels) => {
        const family = codec === 'aac_vbr' ? 'aac' : codec;
        const tbl = CODEC_TARGET_BPS[family];
        let transparent;
        if (tbl) {
            const cap = (family === 'ac3' || family === 'eac3') ? 6 : 8;
            transparent = tbl[Math.min(Math.max(1, Number(channels) || 1), cap)] ?? tbl[cap];
        } else {
            transparent = (codecInfo[codec]?.transparent ?? UNKNOWN_TRANSPARENT_BPS) * Math.pow(Math.max(2, Number(channels) || 2) / 2, CHANNEL_SCALE_EXPONENT);
        }
        return { minimum: transparent * MIN_RATIO, transparent };
    };
    // -=-=-= audioQuality  [audio_clean, stream_ordering] =-=-=-
    // Scores a stream's quality (codec + bitrate vs transparent bitrate) to identify the "best" track.
    const audioQuality = (stream) => {
        const codec = resolveCodecName(stream);

        // Warn once per unrecognised codec, not once per stream
        if(!(codec in codecInfo) && !unknownCodecs.has(codec)) {
            unknownCodecs.add(codec);
            response.infoLog += `☒${streamTag(stream.index)} Unknown audio codec "${codec}", using generic quality weighting\n`;
        }

        const info = codecInfo[codec] ?? { score: UNKNOWN_CODEC_SCORE };
        const maxPenalty = 18;

        // Lossless codecs are already "perfect"
        if (info.lossless)
            return info.score;

        // No stream-level bitrate reported (freshly-transcoded tracks routinely omit it). A codec we encode is assumed to sit at our per-channel target,
        // which IS its transparent point (see scoreThresholds), so it scores full marks; a source codec that normally carries a bitrate (dts, ac3 from
        // disc, etc.) is logged once and scored nominally.
        const bitrate = Number(stream.bit_rate || 0);
        if (bitrate <= 0) {
            if (CODEC_TARGET_BPS[codec === 'aac_vbr' ? 'aac' : codec])
                return info.score;
            response.infoLog += `☒${streamTag(stream.index)} No bitrate reported for ${codec}, assuming nominal quality\n`;
            return info.score - (maxPenalty / 2);
        }

        const { minimum, transparent } = scoreThresholds(codec, Number(stream?.channels ?? 2));
        let penalty = maxPenalty;
        if (bitrate > minimum) {
            if (bitrate >= transparent)
                penalty = 0;
            else
                penalty = maxPenalty * (1 - ((bitrate - minimum) / (transparent - minimum)));
        }

        return info.score - penalty;
    }
    // ===== END SHARED: audio codec scoring =====

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
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mov language table =====
    // -=-=-= MOV_LANG  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // mov is the exception to writing a language into the output container (mp4 stores only lowercase 3-letter /T, mkv keeps the raw spelling). The QuickTime
    // muxer does not store the letters: mov_write_mdhd_tag looks the code up in ffmpeg's legacy Macintosh language table and writes 0x7fff ("unspecified") on
    // a miss, which the demuxer then excludes - so the track reads back with NO language at all, exit 0 and no warning from either side. That table predates
    // ISO 639-2/T and spells 15 of the 20 dual-spelling languages the /B way, so their /T spelling is precisely the one mov throws away (measured on
    // jellyfin-ffmpeg 7.1.4: nld/deu/zho land 0x7fff, dut/ger/chi land a real code; 106 of the 184 codes to6392T can emit are dropped). It spells four of
    // the others the /T way, so their /B spellings map back (fre -> fra, cze -> ces, rum -> ron, slo -> slk), and Maori has no row, as the table holds
    // it under no code. Each such row maps a spelling the muxer drops to the one it stores for the same language. Anyone extending this must re-measure
    // against the muxer: the table is a MIXTURE of /T and /B, so the ISO 639-2/B list is not a safe source. mp4/m4v/m4a pack the letters directly and keep
    // either spelling, which is why this is mov-only. Null-prototype so a container tag spelling an Object.prototype member ('constructor', '__proto__')
    // misses the table instead of resolving an inherited function.
    const MOV_LANG = Object.assign(Object.create(null), { sqi: 'alb', hye: 'arm', eus: 'baq', bod: 'tib', mya: 'bur', zho: 'chi', nld: 'dut', kat: 'geo',
        deu: 'ger', ell: 'gre', isl: 'ice', mkd: 'mac', msa: 'may', fas: 'per', cym: 'wel', fre: 'fra', cze: 'ces', rum: 'ron', slo: 'slk',
        // Rows of another kind: the table holds Norwegian only as the macrolanguage nor, not its two written forms, so Bokmål and Nynorsk (nob and nno,
        // which land 0x7fff) are written as nor - the language kept, the written form lost, and a .mov holds the two as one language. Every other
        // language the muxer drops still reads back with none: the table holds Swedish and Irish only as Mac codes ffmpeg spells sve and iri, which no
        // plugin reads as a language.
        nob: 'nor', nno: 'nor' });
    // -=-=-= movLangRespellArgs (+ movLangRespelled, movLangRespellLog, movLangReadBack)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The language writes a remux into .mov owes the tracks it copies or re-encodes: a .mov another tool wrote can hold a spelling the table lacks
    // (AVFoundation stores deu and nld), which the copy would lose, so each such language goes back in MOV_LANG's spelling and nothing else is touched (a
    // census of 400 spellings on jellyfin-ffmpeg 7.1.4: the muxer drops every key and stores every value). Matched by the language itself - the output stream
    // specifier m:language:<code> - so no output index is needed; a track whose language a run writes itself gets the same spelling (movLangCode).
    const movLangRespelled = (container, streams) => (container !== 'mov' ? [] : [...new Set(streams.map((s) => getTagCI(s?.tags, 'language')))]
        .filter((l) => MOV_LANG[l]));
    const movLangRespellArgs = (container, streams) => movLangRespelled(container, streams)
        .map((l) => ` -metadata:s:m:language:${l} language=${MOV_LANG[l]}`).join('');
    // One line per language the args respell among `streams`, the ones the output holds, so a language change the next pass reads is said; Bokmål and
    // Nynorsk (nob, nno) say that they merge.
    const movLangRespellLog = (container, streams) => movLangRespelled(container, streams).map((l) => `☐Writing ${l} as ${MOV_LANG[l]} - a .mov stores no`
        + ` ${l}${MOV_LANG[l] === 'nor' ? ', so Bokmål and Nynorsk both become Norwegian and can no longer be told apart' : ''}\n`).join('');
    // Stream s as the next pass reads its language after a .mov write, for an Expected results line.
    const movLangReadBack = (container, s) => {
        const l = getTagCI(s?.tags, 'language');
        return container === 'mov' && MOV_LANG[l] ? { ...s, tags: { ...(s.tags || {}), language: MOV_LANG[l] } } : s;
    };
    // ===== END SHARED: mov language table =====

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
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: dolby vision record =====
    // -=-=-= doviRecord [all five] =-=-=-
    // The stream's Dolby Vision configuration record as ffprobe reports it, or undefined.
    const doviRecord = (s) => (Array.isArray(s?.side_data_list) ? s.side_data_list : [])
        .find((sd) => /dovi configuration record/i.test(String(sd?.side_data_type || '')));
    // -=-=-= dvRecordSurvivesCopy [all five] =-=-=-
    // Whether a -c copy keeps the stream's Dolby Vision record (true with none), the fourcc aside: jellyfin's muxers check the base layer's pixel format and
    // colour against the compat id (its ff_isom_validate_dovi_config) and drop a record that fails under ANY fourcc, mkv to mkv included, so any remux costs
    // such a stream its Dolby Vision. Matched the copy on all 17 measured sources (P5, P7, P8.1, P8.2, P8.4, P20 from Dolby, ffmpeg, mkvmerge, MP4Box and an
    // iPhone-style mov). Compat 0's fourcc condition is dvNeedsDvFourcc's (below). Read by clean_and_remux's convert gate, hevcCopyPlan's Matroska arm and
    // dvCopyDropsRecord (below).
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
    // -=-=-= movLosesDvBox (+ dvLostReadBack, movDvReadBack) [all five] =-=-=-
    // Whether a write into `container` takes this video stream's Dolby Vision box away. The mov muxer (MODE_MOV) writes no dvcC/dvvC box under any fourcc
    // (0 of 96 readable .mov outputs, jellyfin 7.1.4), so -strict unofficial does not help: an iPhone Profile 8.4 .mov remuxed into .mov reads back as
    // plain HLG HEVC. `-f mp4` is no escape, as the mp4 muxer refuses that file's mebx tracks. clean_and_remux writes only mkv or mp4, so the box survives
    // when it runs first. A fourcc-only signal (a dvhe .mov) counts too: its record is gone either way. Cover art is never the subject.
    // awk-ffmpeg-test's dvbox:p5-fourcc row measures it (its mov-annexb-hvc1 cell): that cell turning present means .mov can carry the box and this is stale.
    const movLosesDvBox = (container, s) => container === 'mov' && codecTypeOf(s) === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s));
    // Stream s as the next pass reads it once a write has dropped its Dolby Vision record, for an Expected results token: the record gone and mediaInfo
    // detached (index -1, summariseStream joins by index), its transfer kept so the hdr token stands. Where mediaInfo's HDR_Format names a static layer
    // beside the Dolby Vision and the transfer names no HDR curve (none, or a loose bt2020-10), that layer is what the next pass reads ('Dolby Vision /
    // SMPTE ST 2086' reads back 'SMPTE ST 2086', hdr), so smpte2084 stands in for it; an HDR10+ layer there reads back hdr10+ but is predicted hdr.
    const dvLostReadBack = (s) => {
        const others = String(mediaInfoFor(s)?.HDR_Format || '').split('/').filter((p) => p.trim() !== '' && !/dolby vision/i.test(p));
        const trc = videoTransferOf(s);
        return { ...s, side_data_list: [], color_transfer: others.length && !HDR_TRANSFERS.includes(trc) ? 'smpte2084' : trc, index: -1 };
    };
    // The same once a .mov write has taken the box. An untagged copy writes a dvh1 stream as hev1 and keeps dvhe, which still reads dv (both measured on
    // jellyfin 7.1.4).
    const movDvReadBack = (container, s) => (movLosesDvBox(container, s) ? { ...dvLostReadBack(s),
        codec_tag_string: String(s.codec_tag_string || '').toLowerCase().trim() === 'dvh1' ? 'hev1' : s.codec_tag_string } : s);
    // -=-=-= dvCopyFourcc [all five] =-=-=-
    // The fourcc an mp4/m4v -c copy must give a video to keep its Profile 5 record, or '' where its own serves or none can. The muxer carries the source fourcc
    // through a copy, and under hev1/hvc1 the record is lost (dvNeedsDvFourcc), so each takes the Dolby Vision fourcc that reads its hvcC the same way: hev1
    // (parameter sets in-band) dvhe, hvc1 dvh1. Both kept the record and decoded on jellyfin 7.1.4, a real Profile 5 copied each way. AV1 under av01 has none:
    // dav1 keeps the record, but production ffprobe then reads the stream as codec_name=unknown (awk-ffmpeg-test's dvbox:av1-p10-fourcc row re-measures it; its
    // dav1 cell reading av1 means AV1 has a Dolby Vision fourcc too). Nothing in .mov (movLosesDvBox).
    const dvCopyFourcc = (container, s) => {
        if (!['mp4', 'm4v'].includes(container) || !dvNeedsDvFourcc(s)) return '';
        const tag = String(s.codec_tag_string || '').toLowerCase().trim();
        return tag === 'hev1' ? 'dvhe' : tag === 'hvc1' ? 'dvh1' : '';
    };
    // -=-=-= dvCopyDropsRecord (+ dvCopyReadBack, dvCopyLossLine) [all five] =-=-=-
    // Whether a -c copy into `container` loses the stream's Dolby Vision record: one no copy keeps (dvRecordSurvivesCopy), or in the mp4 family a compat-0
    // record under a fourcc that is neither Dolby Vision's nor one dvCopyFourcc gives it - AV1 under av01, or hev1/hvc1 in a .mov.
    const dvCopyDropsRecord = (container, s) => !dvRecordSurvivesCopy(s) || (isMp4Family(container) && dvNeedsDvFourcc(s) && !dvCopyFourcc(container, s)
        && !DV_FOURCC_RE.test(String(s.codec_tag_string || '').toLowerCase().trim()));
    // Stream s as the next pass reads it after a -c copy into `container`, for every Expected results line of a copy: without a record the copy loses, and
    // without the box a .mov write takes.
    const dvCopyReadBack = (container, s) => movDvReadBack(container, dvCopyDropsRecord(container, s) ? dvLostReadBack(s) : s);
    // One warning per video a -c copy into `container` takes the record from, worded as the write-back plugins' movDvLossLine, which says a .mov
    // write's own loss. A stream under a Dolby Vision fourcc keeps it through the copy and still reads as Dolby Vision (only a colour mismatch costs such
    // a stream its record), so its line says the record is dropped rather than the Dolby Vision lost.
    const dvCopyLossLine = (container, streams, act = 'remux') => streams.filter((s) => codecTypeOf(s) === 'video' && !isCoverArt(s)
        && dvCopyDropsRecord(container, s) && !movLosesDvBox(container, s))
        .map((s) => {
            const tag = String(s.codec_tag_string || '').toLowerCase().trim();
            if (DV_FOURCC_RE.test(tag)) {
                return `☒${streamTag(s.index)} The Dolby Vision record is dropped in this ${act} - it does not match the video's colour, so no ffmpeg copy`
                    + ` keeps it; the ${tag} fourcc stays, so the file still reads as Dolby Vision\n`;
            }
            return `☒${streamTag(s.index)} Dolby Vision is lost in this ${act} - ${dvRecordSurvivesCopy(s) ? 'no fourcc this copy can give the video keeps'
                + ' its record' : 'its record does not match the video\'s colour, so no ffmpeg copy keeps it'}\n`;
        }).join('');
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
    // #endregion

    // Fail the file cleanly on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Value checks. The two free-text inputs (order_language/order_codec) have no fixed option set; the six dropdowns each do, and are checked here as
    // [inputName, valueToTest, validOptions], top-down, failing on the first bad value. Every dropdown value is case/whitespace-normalised ONCE here and the
    // use sites below read those same constants, so the value that gets validated is provably the value that gets executed, and the failFile message shows that
    // normalised value - the same discipline the other four plugins follow.
    const audioFirst = ddValue(inputs.audio_first, 'disabled');
    const subtitleFirst = ddValue(inputs.subtitle_first, 'disabled');
    const orderChannel = ddValue(inputs.order_channel, 'descending');
    const orderQuality = ddValue(inputs.order_quality, 'descending');
    const removeJunkTags = ddValue(inputs.remove_junk_tags, 'disabled');
    const methodMp4Faststart = ddValue(inputs.method_mp4_faststart, 'force');

    const dropdownChecks = [
        ['audio_first',          audioFirst,         ['disabled', 'original_tagged', 'default_tagged', 'descriptive_tagged']],
        ['subtitle_first',       subtitleFirst,      ['disabled', 'default_tagged', 'sdh_tagged', 'descriptive_tagged']],
        ['order_channel',        orderChannel,       ['descending', 'descending <=6', 'descending <=8', 'ascending', 'disabled']],
        ['order_quality',        orderQuality,       ['descending', 'descending <=1024k', 'ascending', 'disabled']],
        ['remove_junk_tags',     removeJunkTags,     ['disabled', 'encoder', 'metadata']],
        ['method_mp4_faststart', methodMp4Faststart, ['force', 'strip']],
    ];
    checkDropdowns(dropdownChecks);
    // order_language has no option set, but it still holds LANGUAGES, so a token that is not one FAILS the file. A typo does not announce itself here: an
    // unmatched entry simply scores as "not listed" and the tracks the user meant to promote stay wherever they were, which reads exactly like the ordering
    // rules not working. order_codec is genuinely open (codec names come and go, and an unknown one is inert rather than misleading), so it stays unchecked.
    // The und/mul/zxx/mis/qaa-qtz allowance matches every other language input - 'und' is a real ordering target, since untagged tracks sort somewhere too.
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

    const orderLangTokens = splitList(inputs.order_language);
    checkLangLists([['order_language', orderLangTokens]]);

    // The container this plugin writes, derived the same way in every other plugin that needs it. This plugin never changes the container, so it is always
    // the source's - but every membership test must see it normalised: a Tdarr container string of 'MKV' misses a bare includes() and silently takes the
    // marker-hostile branch. The response.container default above deliberately keeps the RAW value: that string becomes the output file's extension, and
    // lowercasing it there would rename the file rather than answer a question about it.
    const dstContainer = String(file.container || '').toLowerCase().trim();

    // Audio-only files get real work here as well as in audio_clean: after audio_clean force-codecs a track this strips the per-stream encoder tag it leaves,
    // and a multi-track .mka or .m4a still wants order_language/order_codec and the sole-default normalisation. Those two ONLY, and the reason is cover art.
    // Every other audio container carries it as an attached_pic VIDEO stream, which TYPE_ORDER ranks 0: it would be hoisted above the music to become track
    // 0, and a music file whose first track is a JPEG reads as a video to taggers and media servers. Excluding them is what lets the comparator stay
    // untouched, so none of this can reach a video file. An .m4a's cover is a covr atom, which the mp4 muxer writes after every track wherever it is mapped,
    // so it is mapped last and never ordered (isCovrRow below); any other video stream in one - a QuickTime chapter-image track, which a remux writes as an
    // ordinary video track - would be hoisted all the same, so such an .m4a is left untouched (past the truncation check, see there). So is an audio-medium
    // .mka with cover art (mkaCarriesCoverArt has the reason). Both skip lines say why.
    const AUDIO_MEDIUM_CONTAINERS = ['mka', 'm4a'];
    if (file.fileMedium !== 'video' && !(file.fileMedium === 'audio' && AUDIO_MEDIUM_CONTAINERS.includes(dstContainer))) {
        if (file.fileMedium === 'audio')
            return skip(`☑[${dstContainer || 'none'}] Audio-only file - only mka and m4a are reordered, since every other audio container carries cover art`
                + ' as a video stream that would be ordered ahead of the audio\n');
        return skip('☑File is not a video\n');
    }
    if (file.fileMedium === 'audio' && mkaCarriesCoverArt(dstContainer, file.ffProbeData?.streams)) {
        return skip(mkaCoverArtSkipLine);
    }
    if (outputMuxerArg(dstContainer) === null) return skip(noMuxerSkipLine(dstContainer));   // an extension no muxer writes back (outputMuxerArg)
    const copyRefused = copyRefusedSkipLine(dstContainer, file.ffProbeData?.streams);
    if (copyRefused) return skip(copyRefused);   // a video codec the container refuses even on a copy (CONTAINER_REFUSES_COPY)

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

    // One guard around all the reordering work below: a deliberate failFile abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the
    // file too — annotated and carrying the full infoLog — instead of silently skipping. (Input validation runs above this, failing via failFile too.)
    try {
        // ====== TRUNCATION CHECK ======
        // An encode that is OOM-killed, or dies with the output never finalised, can still leave a file ffmpeg exits 0 on and Tdarr accepts - the library then
        // quietly keeps a video that stops a few minutes in. This plugin is designed to run LAST, so it sees the finished article, and the check sits ahead of
        // everything else here BECAUSE the ordinary outcome is `skip` a few hundred lines down: on the final cycle the streams are usually already in order, so
        // a check placed beside the reordering work would be dead in exactly the case it exists for.
        const durVideoStream = (obj) => (obj?.ffProbeData?.streams || []).find(s => codecTypeOf(s) === 'video' && !isCoverArt(s));
        // The timed streams a container duration spans, as a sorted type list - equal on both sides exactly when no type's count changed. Attachments and
        // cover art carry no timeline, so dropping one cannot move the container duration.
        const durStreamShape = (obj) => (obj?.ffProbeData?.streams || []).filter((s) => codecTypeOf(s) !== 'attachment' && !isCoverArt(s))
            .map((s) => codecTypeOf(s)).sort().join(',');
        // Matroska's per-track statistics tag, "HH:MM:SS.nnnnnnnnn" - where an mkv keeps a video track's length. ffmpeg's matroska muxer writes it fresh from
        // the packets when it finalises a file and never carries the source's over (a 20 s mkv cut to 5 s, copied or re-encoded, reports 5 s), and a killed,
        // unfinalised file carries none - measured on jellyfin-ffmpeg 7.1.4. So it cannot vouch for a truncated output.
        const durTagSeconds = (v) => {
            const m = /^(\d{1,3}):([0-5]\d):([0-5]\d(?:\.\d{1,9})?)$/.exec(String(v ?? '').trim());
            return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
        };
        // Every DURATION_SIGNALS row must answer with a real duration or 0 - 0 IS the "no signal" sentinel the oldAny/newAny/verdict accumulation below
        // reads by truthiness, and the failFile at the end of that accumulation turns "the old side had one and the new side has none" into a
        // quarantine. A row that returns something else (a NaN, a negative, an already-coerced value) breaks the guard silently.
        const durOrZero = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
        // The signals, tried in order: the first that resolves on BOTH sides decides, so a container that stores one but not the other cannot make a healthy
        // file look broken. FRAME COUNT is deliberately not among them: video_clean's interlace repair emits bwdif=mode=send_field, which DOUBLES the frame
        // count at field rate, so a frame comparison reports a 2x change on a perfectly good file; wall time survives that untouched. Matroska stores no
        // per-stream duration on the ffprobe side, so the ffprobe row reads the track's DURATION tag there (durTagSeconds), and mediaInfo's row leads. The
        // container duration comes last and only when no timed stream was added or removed (needsSameStreams, durStreamShape): it is the maximum across all
        // streams, so audio_clean dropping a commentary track, or clean_and_remux a subtitle, that outlasts the video legitimately shrinks it.
        const DURATION_SIGNALS = [
            // The join must require @type 'Video' as well as the StreamOrder match: MPEG-TS gives its video track the two-part StreamOrder "0-0"
            // (Number() -> NaN, so it never matches) while its MENU track reports a bare "0", and without the type test the guard silently compares a
            // menu/chapter track's duration instead of the video's.
            { name: 'the mediaInfo video-track duration', perTrack: true,
                read: (probed) => { const v = durVideoStream(probed); if (!v) return 0;
                    return durOrZero(((probed?.mediaInfo?.track || []).find(t => t['@type'] === 'Video'
                        && Number(t.StreamOrder) === v.index) || {}).Duration); } },
            { name: 'the ffprobe video-stream duration', perTrack: true, read: (probed) => { const v = durVideoStream(probed);
                return durOrZero(v?.duration) || durOrZero(durTagSeconds(getTagCI(v?.tags, 'DURATION'))); } },
            { name: 'the container duration', read: (probed) => durOrZero(probed?.ffProbeData?.format?.duration), needsSameStreams: true },
        ];
        // Tolerance is 1% SHORT, fixed, with no input to relax it: a user hitting a false positive would have no recourse but removing the plugin, so the
        // headroom is deliberately double the 0.5% the long-standing community duration-check plugin defaults to. A dead encode is short by far more.
        // Deliberately one-sided. An output LONGER than its source cannot have been truncated or OOM-killed, and it is a state healthy files reach: both
        // leading signals are PTS-derived, so a source whose timestamps are broken can state a length its content does not have, and clean_and_remux's
        // recover_* remux (-fflags +genpts+ignidx) exists to repair exactly those - after which the file reports its true length. Failing a longer one would
        // quarantine a correctly repaired file and send the user hunting an OOM kill that never happened. An over-length alarm, if ever wanted, needs its own
        // branch and its own wording - none of the text below is true of it. The SHORTER case a broken source produces is tsPsRemux below.
        const DURATION_TOLERANCE_PCT = 1;
        // ...and the shortfall must also exceed one second. One frame is more than 1% of a clip under about 4 s at 24 fps, and a remux can lose one: a real
        // HandBrake 3 s mp4 remuxed to mkv reads 98.6% of its length (jellyfin-ffmpeg 7.1.4, MediaInfoLib 23.07), which 1% alone fails on every requeue.
        const DURATION_SHORTFALL_MIN_SEC = 1;
        // A track cannot outlast the container holding it, so a perTrack reading longer than its own file's container duration is a stale statistics
        // tag, not a length: mkvmerge writes DURATION per track, a later cut by another tool copies it unchanged, and MediaInfo 23.07 reports the tag as
        // the track's Duration. Tdarr refreshes those tags only when its server-wide "Run mkvpropedit on files before running plugins" is on - off by
        // default - so on a default install the ORIGINAL routinely carries them, and a faithful -c copy reorder (whose tags ffmpeg writes fresh) was
        // failed as truncated against a 43-minute tag on a 30 s file, on every retry. Such a reading counts as no signal and the next one decides. It
        // cannot make a healthy file fail: on the original side it only shortens the yardstick, and on the new side the stale reading it discards was
        // the one that could have hidden a real truncation. A file with no container duration keeps every reading - there is nothing to bound it by.
        const boundedByContainer = (probed, d) => {
            const c = durOrZero(probed?.ffProbeData?.format?.duration);
            return c && d > c * (1 + DURATION_TOLERANCE_PCT / 100) ? 0 : d;
        };
        // The two sentences the verdicts hand the operator, declared once because each is written by both a short-duration and a no-duration branch
        // and they are a CONTRACT with the user, not incidental wording: one tells them where to look for the cause, the other that an accepted file
        // still needs playing through (a recover_bad_* repair adds what not to do with a recovery queue). A drift between the two copies of either reads
        // as two different situations. The ` (compared using ...)` suffix is not part of them - only the short-duration verdict can name a signal.
        const OOM_HINT = 'the file has been failed rather than accepted; check this node\'s log for an out-of-memory kill';
        const REVIEW_HINT = 'accepted for review rather than failed; play it through in Tdarr before approving';
        // The yardstick is the file as it entered the library - not the previous stage's output - and Tdarr scans it in full, ffProbeData and mediaInfo alike.
        const originalFile = otherArguments?.originalLibraryFile;
        if (originalFile?.ffProbeData) {
            const sameStreams = durStreamShape(originalFile) === durStreamShape(file);
            const newVideo = durVideoStream(file);
            // Carries its own trailing separator, so an audio-only file (or one whose only video stream is cover art - durVideoStream excludes those) does not
            // leave a bare space sitting directly after the ☒ status symbol.
            const durTag = newVideo ? `${streamTag(newVideo.index)} ` : '';
            let verdict = null;
            let oldAny = 0;
            let newAny = 0;
            for (const sig of DURATION_SIGNALS) {
                const oldDur = sig.perTrack ? boundedByContainer(originalFile, sig.read(originalFile)) : sig.read(originalFile);
                const newDur = sig.perTrack ? boundedByContainer(file, sig.read(file)) : sig.read(file);
                // ANY resolved duration proves that side HAS a duration, so every signal feeds oldAny/newAny - otherwise the no-duration
                // verdict below fires on a healthy audio-cleaned file whose only resolvable signal is the container's. The needsSameStreams
                // caveat concerns duration SHRINKAGE (a dropped track longer than the video legitimately shortens the container maximum),
                // a property of the COMPARISON, so it gates only whether this signal may set the verdict - never the existence test.
                if (!oldAny) oldAny = oldDur;
                if (!newAny) newAny = newDur;
                if (sig.needsSameStreams && !sameStreams) continue;
                if (!verdict && oldDur && newDur) verdict = { name: sig.name, old: oldDur, now: newDur };
            }
            // A file clean_and_remux repaired IN THIS JOB can legitimately be SHORTER than the library-entry original: recovery salvages a truncated source
            // whose intact header claimed the full length into a file reporting its true, shorter duration - the mirror of the over-length recover_* case the
            // tolerance comment above already spares. Erroring it removes the salvaged result the user asked for and loops forever (fixed tolerance, no
            // relaxing input), so soften both verdicts to a ☒ warning and ACCEPT the file for review. Users should NOT auto-approve a recovery queue - the
            // recover_bad_* tooltips say so. The awk_recovered stamp is PERMANENT (no plugin removes it, every later remux and encode carries it, and light
            // mode stamps healthy files too), so its presence alone would waive this guard for every later job on the file - an OOM-killed encode included,
            // long after recovery ran. Recovery ran in this job exactly when the stamp differs from the library original's: clean_and_remux re-runs it only for
            // a mode the stamp does not already record, and a later job's original IS the stamped file. (A container change re-runs it with the same stamp, on
            // a file already at its true length.)
            const recoveredTagOf = (probed) => getTagCI(probed?.ffProbeData?.format?.tags || {}, RECOVERED_TAG).trim();
            const recovered = recoveredTagOf(file) !== '' && recoveredTagOf(file) !== recoveredTagOf(originalFile);
            // An MPEG-TS/PS capture whose timestamps jump forward (signal loss, a channel splice) or reset backward states far more than it holds: 120.0 s
            // for 20 s of content with a +100 s jump, 95,253.7 s with a reset (jellyfin-ffmpeg 7.1.4; a jump under ffmpeg's ~10 s correction threshold
            // stays in the remux and reads the same on both sides). clean_and_remux's remux of one into mkv or mp4 holds every packet and reports the true
            // length, so measured against the original it reads as truncated on every retry. Such a remux is accepted for review, but only while the video
            // is still a copy: an ffmpeg encode stamps 'Lavc<version> <encoder>' on the video stream's encoder tag in Matroska, mp4 and mov (libx265,
            // libsvtav1, VideoToolbox measured) and every later -c copy keeps it, while a TS/PS original carries no per-stream encoder tag (a language tag,
            // yes) - so on a TS/PS original any Lavc stamp is an encode from this job, which keeps the full guard. The ipod muxer, ffmpeg's default for
            // .m4v, writes no stamp, so an .m4v another tool encoded reads as a copy; these plugins write .m4v with the mp4 muxer (OUTPUT_MUXER_BY_EXT),
            // which stamps. That is also why the output must be Matroska or mp4: a TS/PS output holds no stamp, and nothing would tell a copy from an encode.
            // An mp4 muxer's own XDCAM name on MPEG-2 is not a Lavc stamp.
            // Only the video's stamp counts: a cut-short audio-only encode reads exactly like a jump capture whose audio audio_clean re-encoded, and no
            // duration tells them apart (the original's audio states the same inflated length), so both are accepted for review and the line names the jump as
            // a possibility, not the cause.
            const originalContainer = String(originalFile.container || '').toLowerCase().trim();
            const tsPsOriginal = isMpegTsPsFamily(originalContainer);
            const videoEncoded = /^lavc/i.test(getTagCI(newVideo?.tags, 'encoder').trim());
            const tsPsRemux = tsPsOriginal && (isMatroskaFamily(dstContainer) || isMp4Family(dstContainer)) && !videoEncoded;
            // Both verdicts below: a recover_bad_* repair from THIS job is accepted for review with a warning, anything else fails the file.
            const truncationVerdict = (soft, hard, reviewTail = '', failTail = '') => {
                if (recovered) response.infoLog += `☒${durTag}${soft}\n☒${durTag}${REVIEW_HINT}, and do not auto-approve a recovery queue${reviewTail}\n`;
                else failFile(`${durTag}${hard}\n☒${durTag}${OOM_HINT}${failTail}`);
            };
            if (verdict) {
                const pct = (verdict.now / verdict.old) * 100;
                if (pct < 100 - DURATION_TOLERANCE_PCT && verdict.old - verdict.now > DURATION_SHORTFALL_MIN_SEC) {
                    // Under 1% the share takes two significant digits, so a timestamp reset (20 s of a stated 95,253.7 s) does not print as 0.0%
                    const pctText = pct < 1 ? pct.toPrecision(2) : pct.toFixed(1);
                    const shorter = `output duration ${verdict.now.toFixed(1)} s is ${pctText}% of the original ${verdict.old.toFixed(1)} s`;
                    const compared = `(compared using ${verdict.name})`;
                    if (!recovered && tsPsRemux) {
                        response.infoLog += `☒${durTag}${shorter}, but the .${originalContainer} original was remuxed in this job with its video`
                            + ' copied, not re-encoded - it may be a capture whose timestamps jump or reset, which states a longer length than it holds'
                            + ` while the remux reports the true one\n☒${durTag}${REVIEW_HINT} ${compared}\n`;
                    } else {
                        const tsPsCause = tsPsOriginal ? `, or the .${originalContainer} original's timestamps jump or reset and state a longer length`
                            + ' than it holds' : '';
                        const tsPsHint = tsPsOriginal ? `\n☒${durTag}if this capture's timestamps jump, set clean_and_remux's recover_bad_timestamps to`
                            + ' light: its repair in the same job is then accepted for review' : '';
                        truncationVerdict(`${shorter}, but this file carries an ${RECOVERED_TAG} tag - a recover_bad_* repair of a truncated source `
                            + 'legitimately reports a shorter true duration', `${shorter} - the transcode did not run to completion${tsPsCause}`,
                            ` ${compared}`, `${tsPsHint}\n☒${durTag}${compared}`);
                    }
                }
            } else if (oldAny && !newAny) {
                // A severely truncated or unfinalised output is precisely the file most likely to probe with no duration at all, so treating "no duration" as
                // "nothing to compare" would silence the guard on exactly what it hunts. Reaching here means NO signal resolved on the new side while at least
                // one did on the old, so it cannot fire merely because a container stores one signal and not another.
                const absent = `the output reports no duration at all while the original had ${oldAny.toFixed(1)} s`;
                truncationVerdict(`${absent}, but this file carries an ${RECOVERED_TAG} tag - a recover_bad_* repair of a truncated source can legitimately `
                    + 'report a shorter or absent duration', `${absent} - that is what a truncated or unfinalised transcode looks like`);
            }
        }
        // ====== END TRUNCATION CHECK ======
        // The .m4a with a video stream besides its cover (AUDIO_MEDIUM_CONTAINERS) is left untouched only now:
        // audio_clean re-encodes such a file's audio, so a cut-short encode of it must still meet the check above.
        if (file.fileMedium === 'audio' && dstContainer === 'm4a'
            && (file.ffProbeData?.streams || []).some((s) => codecTypeOf(s) === 'video' && !isMp4Cover(s))) {
            return skip('☒[m4a] This .m4a carries a video stream besides its cover art, which a reorder would write ahead of the audio - left untouched\n');
        }

        // Input summary — the streams exactly as they arrived, before re-ordering.
        response.infoLog += `☐Input streams: ${summariseAll(file.ffProbeData.streams)}\n`;
        response.infoLog += trackNamesUnreadLine(file.ffProbeData.streams);

        // ====== ORDERING KEYS ======

        const TYPE_ORDER = { video: 0, audio: 1, subtitle: 2 , attachment: 3, data: 4};
        const UNKNOWN_TYPE_ORDER = 99;   // a codec_type not in TYPE_ORDER (video/audio/subtitle/attachment/data) sorts last
        // Which stream flag each subtitle_first value lifts. One map instead of three near-identical clauses, so adding a fourth value is a row here rather
        // than a fourth copy of the same two lines - and so the three cannot drift into asking different questions of the same setting.
        const SUBTITLE_FIRST_KEY = { default_tagged: 'default', sdh_tagged: 'sdh', descriptive_tagged: 'descriptive' };
        const subFirstKey = SUBTITLE_FIRST_KEY[subtitleFirst];
        // The same for audio_first's two flag values; its default_tagged lifts the single winningDefault instead (see compareAudioStreams).
        const AUDIO_FIRST_KEY = { original_tagged: 'original', descriptive_tagged: 'descriptive' };
        const audFirstKey = AUDIO_FIRST_KEY[audioFirst];
        // Role precedence within a language, lowest first. Defined once per stream type and applied to both comparands - inlined, it would be the same
        // ternary chain twice, where a change to one copy silently makes the comparator asymmetric.
        const subtitleRoleRank = (s) => (s.commentary ? 4 : (s.descriptive ? 3 : (s.sdh ? 2 : (s.lyrics ? 1 : 0))));
        // Any other secondary role (isSecondaryTrack: M&E, karaoke) ranks LAST: neither carries dialogue a viewer would choose, and ranked as main a 5.1 mix
        // outsorted the 2.0 dialogue track and became the sole default every player auto-selects.
        const audioRoleRank = (s) => (s.commentary ? 2 : (s.descriptive ? 1 : (s.secondary ? 3 : 0)));
        const preferredLangKeys = orderLangTokens.map(langMatchKey);   // en/eng/english/en-US, 639-2/B vs /T and no/nb/nn all rank together
        const getLangRank = (lang) => {
            const idx = preferredLangKeys.indexOf(langMatchKey(lang));
            // The "not listed" sentinel must exceed every real index; a bare 999 would collide on a >999-entry order_language list (unbounded free text).
            return idx === -1 ? preferredLangKeys.length : idx;
        };
        // order_codec takes the canonical key (eac3atmos) or the spelling this plugin's own Input streams line prints (eac3-atmos): a display token maps
        // back to its key, so a codec copied from the log matches. Built from the shared CODEC_DISPLAY, so a new display name needs no second edit here.
        const codecKeyForDisplay = new Map(Object.entries(CODEC_DISPLAY).map(([key, shown]) => [shown, key]));
        const codecFirstList = splitList(inputs.order_codec).map(c => c.toLowerCase())   // canon codec names are lowercase, so the list must be too
            .map(c => codecKeyForDisplay.get(c) || c);

        // Parse an order mode ('descending' | 'descending <=N' | 'ascending' | 'disabled') into {enabled, dir, cap}. The '<=N' suffix caps descending: a stream
        // whose cap-metric exceeds N is demoted below every at/under-cap stream. A trailing 'k' (order_quality's bitrate cap) means N is in kbps -> bps. Parsed
        // ONCE here, not per-comparison, because the comparator below runs O(n log n) times.
        const parseOrderMode = (mode) => {
            if (mode === 'disabled') return { enabled: false };
            const m = /^descending\s*<=\s*(\d+)(k?)$/.exec(mode);
            if (m) return { enabled: true, dir: 'descending', cap: Number(m[1]) * (m[2] === 'k' ? 1000 : 1) };
            return { enabled: true, dir: mode === 'ascending' ? 'ascending' : 'descending', cap: Infinity };
        };
        const channelMode = parseOrderMode(orderChannel);
        const qualityMode = parseOrderMode(orderQuality);
        // Union-of-caps demotion: a track over EITHER the channel cap OR the quality cap sorts below the under-all-caps tracks in its own language/role/codec
        // tier, so the fully-serveable track leads - e.g. a 5.1 under the <=6 channel cap but over the <=1024k quality cap is still demoted, not kept above a
        // stereo. Only a 'descending <=N' mode caps (plain descending/ascending/disabled -> Infinity). Channel caps by channel count, quality by capBitrate.
        const chanCap = (channelMode.enabled && channelMode.dir === 'descending') ? channelMode.cap : Infinity;
        const qualCap = (qualityMode.enabled && qualityMode.dir === 'descending') ? qualityMode.cap : Infinity;
        const overCap = (s) => s.channels > chanCap || s.capBitrate > qualCap;

        // Audio ordering below audio_first, shared by the sort AND the winning-default pre-pass: language -> role -> order_codec -> the union cap partition
        // (over EITHER cap -> tail) -> channel (direction) -> quality (direction). Returns 0 when every key ties. The cap ONLY partitions; within each
        // partition channel/quality keep their requested direction, so a 'descending <=N' list stays fully descending - it just shifts which track leads.
        const compareAudioKeys = (a, b) => {
            const aRank = a.langRank;
            const bRank = b.langRank;
            if (aRank !== bRank) return aRank - bRank;
            // A commentary stream could be descriptive but it would still be a commentary
            const aRole = audioRoleRank(a);
            const bRole = audioRoleRank(b);
            if (aRole !== bRole) return aRole - bRole;
            // order_codec tier: preferred codecs group above the rest
            if (codecFirstList.length > 0 && a.codecMatch !== b.codecMatch) return a.codecMatch ? -1 : 1;
            if (chanCap < Infinity || qualCap < Infinity) {
                const aOver = overCap(a), bOver = overCap(b);
                if (aOver !== bOver) return aOver ? 1 : -1;
            }
            if (channelMode.enabled && a.channels !== b.channels)
                return channelMode.dir === 'ascending' ? a.channels - b.channels : b.channels - a.channels;
            if (qualityMode.enabled && a.audioQuality !== b.audioQuality)
                return qualityMode.dir === 'ascending' ? a.audioQuality - b.audioQuality : b.audioQuality - a.audioQuality;
            return 0;
        };
        // The video and subtitle comparators (pure: read only a/b and the keys above). Each returns 0 on a full tie, so the sort dispatcher falls through to
        // source-index order. Video: cover art / posters / thumbnails sort last.
        const compareVideoStreams = (a, b) => (a.coverArt !== b.coverArt) ? (a.coverArt ? 1 : -1) : 0;
        // Subtitle: forced first, then language priority, then subtitle_first lifts the default/SDH/descriptive subtitle to the top of THEIR language,
        // then the normal role order (normal, lyrics/songs, SDH, descriptive, commentary).
        const compareSubtitleStreams = (a, b) => {
            if (a.forced !== b.forced)
                return a.forced ? -1 : 1;
            const aRank = a.langRank;
            const bRank = b.langRank;
            if (aRank !== bRank)
                return aRank - bRank;
            if (subFirstKey && a[subFirstKey] !== b[subFirstKey])
                return a[subFirstKey] ? -1 : 1;
            const aRole = subtitleRoleRank(a);
            const bRole = subtitleRoleRank(b);
            if (aRole !== bRole)
                return aRole - bRole;
            return 0;
        };
        // ====== END ORDERING KEYS ======

        // ====== STREAM TABLE + SORT ======

        const sortRows = [];
        // A track named beside a matroska TITLE SimpleTag leaves any remux under its one name (the name carry restates it; a role only the tag gives is lost
        // where no join keeps it), so its roles are read as the output holds them (mp4NameCarryView): sorted by roles the remux drops, the next pass would
        // sort it again.
        const roleRead = mp4NameCarryView(dstContainer, file.ffProbeData.streams.filter((x) => isMatroskaFamily(dstContainer) && trackNameBesideTitleTag(x)));
        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
            const ffstream = file.ffProbeData.streams[i];
            const roles = roleRead(ffstream);
            // Enrich with the both-probe bitrate and channel count before audioQuality/summariseStream (see resolveStreamBitrate/resolveChannels above).
            const enrichedStream = enrichStream(ffstream);
            const streamLang = resolveLang(ffstream) || 'und';

            const streamType = codecTypeOf(ffstream);
            // Resolve the canonical codec once (resolveCodecName does a probe-join + string work); order_codec membership can't change between list entries.
            const canon = streamType === 'audio' ? resolveCodecName(enrichedStream) : '';

            sortRows.push({
                index: ffstream.index,
                origPos: i,
                stream: enrichedStream,
                type: streamType,
                // Language sort rank precomputed once here (getLangRank -> langKey -> Intl.getCanonicalLocales is expensive), not per O(n log n) comparison -
                // mirrors audio_clean's awkLangKey precompute and the parseOrderMode-once discipline.
                langRank: getLangRank(streamLang),
                channels: enrichedStream.channels || 0,
                // Bitrate the order_quality cap compares against, in bps (shared resolveStreamBitrate fallback, via enrichStream). order_quality sorts by
                // the audioQuality score but CAPS by raw bitrate ('descending <=1024k'), so the cap threshold needs an actual bitrate, not the score -
                // derive any new bitrate-cap key from THIS field, not from a raw bit_rate. A LOSSLESS track whose bitrate neither probe reports (0) is still
                // a heavy, hard-to-serve track, so it must count as OVER any bitrate cap (Infinity), never under it. A non-lossless bitrate-0 track (e.g. a
                // freshly-transcoded aac) is genuinely small and stays 0 = under-cap. Only the '<=Nk' cap reads this; plain descending/ascending ignore it.
                capBitrate: (streamType === 'audio' && !(enrichedStream.bit_rate > 0) && codecInfo[canon]?.lossless === true)
                    ? Infinity : (enrichedStream.bit_rate || 0),
                forced: hasDisposition(roles, 'forced'),   // flag OR title keyword - a "Forced"/"Foreign Parts Only" title counts where the flag isn't set
                // Only score audio, and only when order_quality actually reads the score: scoring video/subtitle/data would spam bogus "unknown audio codec" /
                // "no bitrate reported" notices, and with order_quality=disabled the score is dead - scoring anyway warns about values the sort ignores.
                audioQuality: (streamType === 'audio' && qualityMode.enabled) ? audioQuality(enrichedStream) : 0,
                // Does this audio stream's canonical codec match order_codec? Family-prefix: "dts" catches dtsma/dtshr/dtsexpress, "eac3" catches eac3atmos.
                codecMatch: canon !== '' && codecFirstList.some(c => canon.startsWith(c)),
                default: ffstream?.disposition?.default === 1,
                original: hasDisposition(roles, 'original'),   // for audio_first='original_tagged': promote the original-language track above language

                // Role classification via the shared classifiers (single source of truth — keeps the sort and the summary line in agreement).
                commentary: isCommentary(roles),
                descriptive: isDescriptive(roles),
                secondary: isSecondaryTrack(roles),
                sdh: isSdh(roles),
                lyrics: isLyrics(roles),

                // Cover art/poster/thumbnail sort last: cover-art dispositions (any codec) or a still-image codec - mirrors clean_and_remux image removal.
                coverArt: isCoverArt(ffstream),
            });
        }

        // Which audio tracks may hold the sole default flag: a main track, never a secondary one (isSecondaryTrack) - language ranks before role, so
        // order_language=eng on a Japanese film whose English tracks are only a commentary and an audio description sorts the description first, and as the
        // default every player would auto-select it over the Japanese main track. audio_first=descriptive_tagged asks for exactly that, so there the
        // description qualifies too. A file with no qualifying track gives the flag to its first track, as before.
        const audioRows = sortRows.filter((s) => s.type === 'audio');
        const defaultEligible = (s) => !s.secondary || (audioFirst === 'descriptive_tagged' && s.descriptive);
        const eligibleRows = audioRows.some(defaultEligible) ? audioRows.filter(defaultEligible) : audioRows;
        // audio_first='default_tagged': only ONE audio track can remain default (the normalisation below marks the first eligible sorted audio the sole
        // default). So promote the single track that will HOLD the flag - the default-flagged eligible track that wins the normal ordering, else the eligible
        // track that does - and the emitted order already matches the post-normalisation state: a fixpoint. Promoting every default would lead with a
        // lower-priority default on pass 1, then re-sort it once its default is stripped; promoting a secondary track the flag cannot stay on, or leaving a
        // file with no default-flagged track to the normal ordering when a secondary track sorts first, would do the same. Identity-compared below.
        const winningDefault = audioFirst === 'default_tagged'
            ? eligibleRows.slice().sort((a, b) => (b.default - a.default) || compareAudioKeys(a, b) || a.index - b.index)[0]
            : undefined;

        // Audio: audio_first lifts the tracks the setting names above every audio key - the whole flagged class for original/descriptive, only
        // winningDefault for default_tagged (see above) - then compareAudioKeys. Returns 0 on a full tie, like the comparators in ORDERING KEYS.
        const compareAudioStreams = (a, b) => {
            if (audFirstKey && a[audFirstKey] !== b[audFirstKey])
                return a[audFirstKey] ? -1 : 1;
            if (audioFirst === 'default_tagged') {
                const aWin = a === winningDefault, bWin = b === winningDefault;
                if (aWin !== bWin) return aWin ? -1 : 1;
            }
            return compareAudioKeys(a, b);
        };

        // Sort the streams: stream-type precedence, then the per-type comparator, then source-index order as the final tie-break.
        sortRows.sort((a, b) => {
            const aOrder = TYPE_ORDER[a.type] ?? UNKNOWN_TYPE_ORDER;
            const bOrder = TYPE_ORDER[b.type] ?? UNKNOWN_TYPE_ORDER;

            if (aOrder !== bOrder)
                return aOrder - bOrder;

            let cmp = 0;
            if (a.type === 'video') cmp = compareVideoStreams(a, b);
            else if (a.type === 'audio') cmp = compareAudioStreams(a, b);
            else if (a.type === 'subtitle') cmp = compareSubtitleStreams(a, b);
            if (cmp !== 0) return cmp;

            // Attachments and data get no comparator - their relative order doesn't matter
            return a.index - b.index;
        });
        // ====== END STREAM TABLE + SORT ======

        // ====== JUNK TAG STRIP: KEYS + PER-STREAM ======

        // remove_junk_tags: strip encoder/muxer-provenance (+ optional descriptive) tags on the reorder remux. 'encoder' = pure provenance
        // (global encoded_by; per-stream encoder/encoded_by); 'metadata' (superset) also drops iTunes/movie-TV container tags. Always kept:
        // title/comment, awk_* markers (idempotency), creation_time, the mkv BPS/statistics family (mediaInfo's per-track bitrate source), the
        // functional per-stream tags, and the GLOBAL 'encoder' tag (muxer-managed: every mux re-stamps it, so stripping would loop).
        // Per-stream 'encoder' - including the Lavc tag an upstream re-encode stamps - is NOT re-added on a -c copy, so running last clears it
        // in the SAME remux (a first-in-stack plugin could only catch it a pass later). The one exception is muxerRegenerates below.
        const JUNK_PERSTREAM = new Set(['encoded_by', 'encoder']);   // only encoder-tier keys are safe per-stream (descriptive ones are functional, kept)
        const JUNK_ENCODER_GLOBAL = new Set(['encoded_by']);
        const JUNK_DESCRIPTIVE = new Set(['compilation', 'gapless_playback', 'hd_video', 'purchase_date', 'sort_name', 'sort_album', 'sort_album_artist',
            'sort_artist', 'sort_composer', 'sort_show', 'genre', 'date', 'description', 'synopsis', 'show', 'episode_id', 'network', 'episode_sort',
            'season_number', 'media_type', 'artist', 'album', 'album_artist', 'composer', 'grouping', 'lyrics', 'copyright', 'keywords', 'track', 'disc',
            'itunmovi', 'itunextc',   // iTunMOVI (the cast/crew plist) and iTunEXTC (the rating) are freeform atoms the mov demuxer names verbatim
            // ...and the Matroska tagging spec's own names for the same kind of tag, which ffprobe reports lowercased. The external IDs (imdb/tmdb/tvdb) are
            // kept: a media server matches the file on them.
            'date_released', 'date_recorded', 'date_encoded', 'date_tagged', 'summary', 'director', 'actor', 'performer', 'written_by', 'producer',
            'content_type', 'law_rating', 'original_media_type']);
        // On an audio-only file these tags are its music tags - artist, album, track, disc, date, genre, compilation, the sort keys - which a music library
        // is organised by, so metadata strips there only what encoder does.
        const metadataTier = removeJunkTags === 'metadata' && file.fileMedium !== 'audio';
        const isGlobalJunkKey = (lowerKey) => removeJunkTags !== 'disabled'
            && (JUNK_ENCODER_GLOBAL.has(lowerKey) || (metadataTier && JUNK_DESCRIPTIVE.has(lowerKey)));
        // For MPEG-2 video at the XDCAM frame sizes (1280x720, 1440x1080, 1920x1080) with no encoder tag, the mov/mp4 muxer synthesises an 'XDCAM EX 1080p29'-
        // style stsd compressorname, and the mov demuxer reports it back as the stream's encoder tag (measured, jellyfin-ffmpeg 7.1.4). Clearing it is exactly
        // what makes the muxer write it, so the next pass would build the identical preset and Tdarr's identical-preset guard would error the file. It is muxer
        // provenance this plugin cannot remove: leave it. Matched on the VALUE, so a non-XDCAM tag on such a stream is still cleared once and then settles.
        const muxerRegenerates = (ffstream, key) => key.toLowerCase() === 'encoder' && isMp4Family(dstContainer) && codecNameOf(ffstream) === 'mpeg2video'
            && /^xdcam /i.test(String(ffstream.tags[key]));
        // Per-stream encoder/encoded_by clears for the stream at OUTPUT index outIdx - the post-sort position -metadata:s:<index> targets, not the source
        // ffprobe index. Present-only, so a clean stream adds nothing and never forces a mux on its own. escMeta guards the probe-derived key.
        const junkStreamClears = (ffstream, outIdx) => {
            if (removeJunkTags === 'disabled') return '';
            let meta = '';
            for (const k of Object.keys(ffstream.tags || {}))
                if (JUNK_PERSTREAM.has(k.toLowerCase()) && !muxerRegenerates(ffstream, k)) meta += ` -metadata:s:${outIdx} "${escMeta(k)}="`;
            return meta;
        };
        // The strip's two accumulators: the per-stream clears are added in the output-map loop below, the global ones after it.
        let junkArgs = '';
        let junkLog = '';
        // ====== END JUNK TAG STRIP: KEYS + PER-STREAM ======

        // ====== OUTPUT MAP + SOLE-DEFAULT FLAG ======
        // Set orderChanged if the sort moved a stream, and build the map; also normalise the audio default flag so exactly one audio track — the first
        // eligible one in sorted order (defaultEligible) — is default. Additive +default/-default keeps forced/commentary/etc.; subtitle/video untouched.
        let ffmpegMap = '';
        let dispositionArgs = '';
        let orderChanged = false;
        let audioIndex = -1;

        // A default-track flag only round-trips in a container that can STORE it: the Matroska and mp4 families persist it; MPEG-TS and AVI silently
        // drop it (measured on jellyfin-ffmpeg 7.1.4 via set→remux→re-probe). This plugin keeps the source container (dstContainer = file.container), so a
        // standalone run on a .ts/.avi capture would otherwise write '+default' every pass, read it back missing, and re-emit a byte-identical preset - which
        // Tdarr's infinite-transcode-loop guard errors, quarantining a healthy file. Normalize the sole-default flag only where it sticks; elsewhere leave the
        // audio default flags untouched (the same container-unstorable-flag skip clean_and_remux's tag_disposition already applies to captions/original).
        // .3gp and .3g2 store it too, both ways (measured 2026-11-13).
        const canPersistDefault = isMatroskaFamily(dstContainer) || isMp4Family(dstContainer) || ['3gp', '3g2'].includes(dstContainer);
        let defaultFlagSkipped = false;

        // Two kinds of stream are left out of the map, so outIdx - the output position the per-stream -metadata writes key on - counts only the streams
        // actually mapped: a stream the container cannot copy (mp4UncopyableStreams: one ffmpeg cannot identify at all, in any container, or a data track the
        // mp4 family cannot carry), and every Matroska cover (matroskaCovers: attached again from a staged copy, or dropped, after the skip test - a cover that
        // cannot be staged is mapped as a track after everything, so no outIdx moves). Neither forces a remux on its own: the order test reads only the mapped
        // streams, so a cover's place is never work, and an uncopyable stream is dropped only from a remux some other change already called for. The
        // -disposition:a: writes key on the audio-relative audioIndex instead, which no such stream can move: none is ever an audio stream.
        const uncopyable = mp4UncopyableStreams(dstContainer, file.ffProbeData.streams);
        const mkvCoverStreams = matroskaCovers(dstContainer, file.ffProbeData.streams);
        const leftOutOfMap = (r) => [...uncopyable, ...mkvCoverStreams].some((s) => s.index === r.index);
        // Into the mp4 family a cover's place is not this plugin's to set: the muxer stores it as a covr atom, which the next pass reads after every track
        // wherever it was mapped (isMp4Cover). So it is mapped last, where it will be read, and the order test passes over it - a file whose only disorder
        // is its cover is in order, and nothing is remuxed only to move one.
        const isCovrRow = (r) => isMp4Family(dstContainer) && isMp4Cover(r.stream);
        const outputRows = [...sortRows.filter((r) => !isCovrRow(r)), ...sortRows.filter(isCovrRow)];
        const mappedRows = outputRows.filter((r) => !leftOutOfMap(r));
        let outIdx = -1;
        let lastPos = -1;
        // The track the normalisation below makes the sole default: the first eligible audio in output order (defaultEligible, above).
        const mappedAudio = mappedRows.filter((r) => r.type === 'audio');
        const defaultRow = mappedAudio.find(defaultEligible) || mappedAudio[0];
        for (const row of mappedRows) {
            // Compare each mapped stream's ORIGINAL array position, not its absolute ffprobe index, against the one mapped before it, so a file already in the
            // desired order but with non-contiguous indices (e.g. 0,1,3 after an upstream drop) isn't remuxed pointlessly. -map uses the absolute index below.
            if (!isCovrRow(row)) {
                if (row.origPos < lastPos) orderChanged = true;
                lastPos = row.origPos;
            }
            outIdx++;
            ffmpegMap += ` -map 0:${row.index}`;

            // remove_junk_tags (per-stream): clear this stream's encoder tags, keyed on its OUTPUT index (see junkStreamClears).
            const streamJunk = junkStreamClears(row.stream, outIdx);
            if (streamJunk) {
                junkArgs += streamJunk;
                junkLog += `☐${streamTag(row.index)}[remove_junk_tags=${removeJunkTags}] Remove encoder tag(s) from ${row.type} stream\n`;
            }

            if (row.type === 'audio') {
                audioIndex++;
                const wantDefault = row === defaultRow;
                if (!canPersistDefault) {
                    // Container can't keep the flag - suppress the write (else it loops); remember one skip so the ☒ note below fires exactly once.
                    if (row.default !== wantDefault) defaultFlagSkipped = true;
                } else {
                    if (wantDefault && !row.default)
                        dispositionArgs += ` -disposition:a:${audioIndex} +default`;
                    else if (!wantDefault && row.default)
                        dispositionArgs += ` -disposition:a:${audioIndex} -default`;
                    // Reflect the normalized flag in the Expected results summary (summariseStream reads disposition.default);
                    // shallow-clone so the source probe object is untouched.
                    if (row.default !== wantDefault)
                        row.stream = { ...row.stream, disposition: { ...row.stream.disposition, default: wantDefault ? 1 : 0 } };
                }
            }
        }
        // ffmpeg flags a stream default ON ITS OWN when an output carries no -disposition at all: the first stream of every type with two or more streams
        // and none flagged default (fftools set_dispositions; a single manual -disposition anywhere switches the rule off for the whole file). A reorder
        // that only moved streams therefore made a French forced subtitle the default subtitle of an English show - default on none of its four
        // subtitles before, on the first sorted one after (jellyfin-ffmpeg 7.1.4). So where that rule would fire and nothing above wrote a disposition,
        // the preset restates output stream 0's own flags: an exact no-op that makes the dispositions manual. It rides only on a remux this plugin emits
        // for its own reasons - it never enters the skip test below, or every in-order file with undefaulted subtitles would be remuxed on every pass. `rows`
        // is every mapped row in output order, a cover track mapped after everything included.
        const autoDefaultPinFor = (rows) => {
            const typeCount = {};
            const typeHasDefault = {};
            for (const r of rows) {
                typeCount[r.type] = (typeCount[r.type] || 0) + 1;
                if (r.stream?.disposition?.default === 1) typeHasDefault[r.type] = true;
            }
            if (!canPersistDefault || dispositionArgs !== '' || !rows.length || !Object.keys(typeCount).some((t) => typeCount[t] > 1 && !typeHasDefault[t]))
                return '';
            const flags = Object.entries(rows[0].stream?.disposition || {}).filter(([, v]) => v === 1).map(([k]) => k).join('+');
            return ` -disposition:0 ${flags || '0'}`;
        };
        // ====== END OUTPUT MAP + SOLE-DEFAULT FLAG ======

        // ====== JUNK TAG STRIP: GLOBAL ======
        // remove_junk_tags (global): clear the provenance / descriptive container tags present, matched case-insensitively. escMeta guards the key. Each
        // clear is also recorded in globalWrites, for mp4TagPlan - keyed by a name read off the media, hence no prototype for one to collide with.
        const globalWrites = Object.create(null);
        const keptMusicTags = [];   // the metadata-tier keys an audio-only file keeps (metadataTier)
        if (removeJunkTags !== 'disabled')
            for (const k of Object.keys(file.ffProbeData.format?.tags || {})) {
                const lk = k.toLowerCase();
                if (lk === 'title' || lk === 'comment' || lk === 'creation_time' || lk.startsWith('awk_')) continue;
                if (isGlobalJunkKey(lk)) {
                    junkArgs += ` -metadata "${escMeta(k)}="`;
                    globalWrites[k] = '';
                    junkLog += `☐[remove_junk_tags=${removeJunkTags}] Remove ${k} tag from file\n`;
                } else if (removeJunkTags === 'metadata' && JUNK_DESCRIPTIVE.has(lk)) keptMusicTags.push(logSafe(k, 40));
            }
        // Said whether or not the pass remuxes, so a user who picked metadata sees why a music file's tags are still there.
        if (keptMusicTags.length)
            response.infoLog += `☑[remove_junk_tags=metadata] Audio-only file - keeping its music tags (${keptMusicTags.slice(0, 5).join(', ')}`
                + `${keptMusicTags.length > 5 ? ` and ${keptMusicTags.length - 5} more` : ''}), which a music library is organised by\n`;
        // ====== END JUNK TAG STRIP: GLOBAL ======

        // Why a remux made only for optional work (the front-load, remove_junk_tags) leaves video s alone, for the hold and its line, or '' when it does not:
        // a record the copy loses (dvCopyDropsRecord), or any Dolby Vision box in a .mov, which every .mov write loses (movLosesDvBox) and clean_and_remux's
        // move to mp4 or mkv keeps. A box a .mov write has dropped is gone for good, even where its HDR10/HLG base still plays (an iPhone Profile 8.4 HLG
        // recording), so that work is not worth it.
        const dvHeldWhy = (s) => (movLosesDvBox(dstContainer, s) && !dvCopyDropsRecord('mp4', s)
            ? 'which a .mov cannot store - clean_and_remux moves the file to mp4 or mkv'
            : dvCopyDropsRecord(dstContainer, s) ? 'which no ffmpeg remux keeps' : '');

        // ====== MOOV / FASTSTART PROBE ======

        // True if the mp4 already has moov before mdat (front-loaded), so method_mp4_faststart needn't remux it. Reads only top-level box headers (a few
        // 16-byte reads, seeking by box size) - no ffmpeg spawn, no full-file read. otherArguments.__awkMoovFront overrides for the harness (which has
        // no real file on disk). Fail-safe: any read/parse anomaly returns true (treat as fronted -> skip) so we never loop on a file we can't inspect.
        const moovBeforeMdat = (filePath, otherArgs) => {
            const inj = otherArgs?.__awkMoovFront;
            if (inj !== undefined) return inj === true;
            let fd;
            try {
                fd = fs.openSync(filePath, 'r');
                // A top-level box header is 4-byte size + 4-byte FourCC; when size === 1 the real size follows as
                // a 64-bit largesize at offset 8. So every read must cover the largesize too: BOX_READ_BYTES must
                // stay >= BOX_HEADER_BYTES + 8 or the readBigUInt64BE below runs off the buffer on a >4GB mdat.
                const BOX_HEADER_BYTES = 8;
                const BOX_READ_BYTES = 16;
                const head = Buffer.alloc(BOX_READ_BYTES);
                let pos = 0;
                // Safety bound against a pathological/corrupt box chain - exceeding it is treated as already-fronted (fail-safe).
                const MAX_MP4_TOP_LEVEL_BOXES = 100;
                for (let i = 0; i < MAX_MP4_TOP_LEVEL_BOXES; i++) {
                    const n = fs.readSync(fd, head, 0, BOX_READ_BYTES, pos);
                    if (n < BOX_HEADER_BYTES) return true;
                    let size = head.readUInt32BE(0);
                    const type = head.toString('latin1', 4, 8);
                    if (size === 1) size = Number(head.readBigUInt64BE(BOX_HEADER_BYTES));   // 64-bit largesize
                    if (type === 'moov') return true;
                    if (type === 'mdat') return false;
                    if (size < BOX_HEADER_BYTES) return true;                 // malformed / size-0 (extends to EOF)
                    pos += size;
                }
                return true;
            } catch { return true; } finally { if (fd !== undefined) fs.closeSync(fd); }
        };
        // method_mp4_faststart=force front-loads the mp4 moov atom. +faststart rides every remux this plugin emits (mp4MovflagsArg), but a file already in
        // order is skipped, so a back-loaded one (moovBeforeMdat, fail-safe, defined just above) forces a one-time remux of its own - it settles after one
        // pass and never loops. Not on a video dvHeldWhy holds (dvHeld), for which a remux made only to move the moov is not worth its record:
        // clean_and_remux holds such a record back only from a remux its fourcc alone would start, so the file can arrive here back-loaded. A remux made
        // for anything else still front-loads it.
        const faststartOn = methodMp4Faststart === 'force';
        const backLoaded = faststartOn && isMp4Family(dstContainer) && !moovBeforeMdat(file.file, otherArguments);
        const dvHeld = file.ffProbeData.streams.filter((s) => dvHeldWhy(s) !== '');
        const needsFront = backLoaded && !dvHeld.length;
        // ====== END MOOV / FASTSTART PROBE ======

        // ====== DECIDE + REPORT ======

        // Container can't store a default-track flag (ts/avi): the block above left dispositionArgs empty rather than looping. Say so once, whether
        // the pass otherwise remuxes (a reorder) or skips - so a user never wonders why the sole-default flag was left alone. ☒, not ☑: a
        // normalisation WAS wanted here and was declined, which is the warning case, and it is the only way a user learns it did not happen - nothing
        // configures this behaviour, so there is no setting to inspect instead. Same symbol the sibling plugins use for the same class of message
        // (video_clean declining a shrink, sub_worker declining the awk_cc request and the marker) whenever the destination container cannot store
        // what this pass wanted to write. On ts/avi ffprobe always reads default=0, so this fires on every pass over such a file that has audio.
        if (defaultFlagSkipped)
            response.infoLog += `☒${dstContainer} cannot store a default-track flag, so audio default flags are left as they are\n`;

        if (!orderChanged && dispositionArgs === '' && !backLoaded && junkArgs === '') return skip('☑Streams already in desired order\n');
        // An mp4-family -c copy keeps a sibling's custom GLOBAL marker (clean_and_remux's awk_recovered, set upstream) only under use_metadata_tags, so
        // mp4TagPlan sets it exactly when one is there - dropping it would re-trigger that plugin's work.
        const tagPlan = mp4TagPlan(dstContainer, file.ffProbeData.format?.tags, globalWrites);
        // A remux whose only work is front-loading the moov or clearing junk tags is not worth the Dolby Vision record (dvHeld) or the cover art it would
        // drop (mp4CoversLost: every cover in a .mov, and elsewhere in the mp4 family the ones a kept awk_* marker costs), so the file is left as it is and
        // one line says what the remux would drop and why it was wanted. A reorder or a default-flag fix is work in its own right: it still remuxes, and
        // each loss is logged where it happens.
        const coversAtRisk = mp4CoversLost(tagPlan, dstContainer, file.ffProbeData.streams.filter((s) => !uncopyable.includes(s)));
        if (!orderChanged && dispositionArgs === '' && (dvHeld.length || coversAtRisk.length)) {
            const why = [backLoaded && 'front-load the moov atom', junkArgs !== '' && 'remove junk tags'].filter(Boolean).join(' and ');
            const lost = [...dvHeld.map((s) => `${dvHeld.length > 1 ? `the Dolby Vision record of video ${s.index}` : 'this video\'s Dolby Vision record'}, ${
                dvHeldWhy(s)}`), ...(coversAtRisk.length ? [`the cover art, which .${dstContainer} cannot store${dstContainer === 'mov' ? ''
                : ` beside the ${tagPlan.markers.map((m) => logSafe(m, 40)).join(', ')} marker`}`] : [])];
            return skip(`☑${dvHeld.length === 1 ? streamTag(dvHeld[0].index) : ''}${backLoaded ? `[method_mp4_faststart=${methodMp4Faststart}]` : ''}`
                + `${junkArgs !== '' ? `[remove_junk_tags=${removeJunkTags}]` : ''} Left as it is - a remux to ${why} would drop ${lost.join(', and ')}\n`);
        }

        // A subtitle ffprobe names no codec for cannot be copied (sub_worker's commitPreset has the measurement), so the remux is stopped, naming it.
        const noCodecSubs = mappedRows.filter((r) => r.type === 'subtitle' && ['', 'unknown', 'none'].includes(codecNameOf(r.stream)));
        if (noCodecSubs.length) {
            failFile(`${noCodecSubs.map((r) => streamTag(r.index)).join('')} ffmpeg names no codec for this subtitle stream (a WebVTT track mkvmerge wrote`
                + ' reads so), and it cannot copy one, so this file cannot be written back - convert or remove that track with mkvmerge, then requeue');
        }
        response.processFile = true;
        // Describe the reorder itself - this plugin's headline change, and the only one that would otherwise leave no trace in the log: without these lines a
        // pure reorder runs straight from the input summary to Expected results and the user has to diff the two token lists to see that anything happened.
        // The two causes are reported separately because they answer different questions and a user acts on them differently - regrouping
        // is the fixed video → audio → subtitle → attachment → data precedence that no setting changes, while a within-group sort is what the order_* and
        // audio_first/subtitle_first settings decide. Both lines stay BARE of an [input=value] tag: regrouping has no setting behind it, and a within-group
        // sort is the combined verdict of the whole order_* precedence chain, so naming any one of them would be a guess (see the infoLog contract).
        // A cover the muxer stores as a covr atom is no part of either (see isCovrRow); when it moves, its own line says why.
        const orderedRows = mappedRows.filter((r) => !isCovrRow(r));
        const originalOrder = orderedRows.slice().sort((a, b) => a.origPos - b.origPos);
        const typeSeq = (arr) => arr.map((s) => s.type).join(',');
        const regrouped = typeSeq(originalOrder) !== typeSeq(orderedRows);
        const sortedWithin = [];   // "<n> <type>" per type group whose members changed order among themselves
        for (const t of new Set(orderedRows.map((s) => s.type))) {
            const positions = orderedRows.filter((s) => s.type === t).map((s) => s.origPos);
            if (!positions.every((p, i) => i === 0 || positions[i - 1] < p)) sortedWithin.push(`${positions.length} ${t}`);
        }
        if (regrouped)
            response.infoLog += '☐Regrouping streams into video → audio → subtitle → attachment → data order\n';
        if (sortedWithin.length) {
            const list = sortedWithin.length > 1
                ? `${sortedWithin.slice(0, -1).join(', ')} and ${sortedWithin[sortedWithin.length - 1]}`
                : sortedWithin[0];
            response.infoLog += `☐Sorting the ${list} streams within their group${sortedWithin.length > 1 ? 's' : ''}\n`;
        }
        if (dispositionArgs !== '')
            response.infoLog += defaultRow === mappedAudio[0] ? '☐Set the first audio track as the sole default\n'
                : `☐${streamTag(defaultRow.index)} Set the first main audio track as the sole default - every audio track sorted ahead of it is a`
                + ' commentary, audio-description, M&E or karaoke track\n';
        response.infoLog += junkLog;
        // Logged whenever the moov actually moves, not only when faststart is the sole reason for the pass: +faststart rides every remux this plugin emits
        // under force (mp4MovflagsArg), so a reorder or a disposition fix front-loads the file just as surely - one the Dolby Vision hold keeps from a remux
        // of its own included - and a ☐ line marks a change about to be made.
        if (backLoaded)
            response.infoLog += `☐[method_mp4_faststart=${methodMp4Faststart}] Front-load the mp4 moov atom on this remux\n`;
        // ====== END DECIDE + REPORT ======
        // ====== PRESET ASSEMBLY ======

        // The Matroska covers, staged only now that the pass remuxes anyway (stageMatroskaCovers): a kept one is attached again (matroskaCoverArgs), and a
        // cover that cannot be staged is mapped as a track after everything, so no other row's output index moves - junkStreamClears' writes and the
        // -disposition writes still address the streams they were built for.
        const staged = stageMatroskaCovers(dstContainer, mkvCoverStreams, file.file, otherArguments, file.ffProbeData.streams);
        const asTrackRows = staged.asTrack.map((d) => sortRows.find((r) => r.index === d.s.index));
        for (const r of asTrackRows) ffmpegMap += ` -map 0:${r.index}`;
        const autoDefaultPin = autoDefaultPinFor([...mappedRows, ...asTrackRows]);

        // The -strict level this mp4/mov -c copy remux needs (see mp4StrictArg): Dolby Vision's dvcC/dvvC boxes, or a TrueHD track the mp4 muxer refuses
        // without it. It reads the RAW ffprobe streams, never sortRows (see its header); this plugin only reorders, and the streams it leaves out
        // (mp4UncopyableStreams) are data tracks that can trigger neither -strict reason, so the copied-subset argument stays at its default.
        const strictArg = mp4StrictArg(dstContainer, file.ffProbeData.streams);
        // The mapped streams in OUTPUT order, which the per-video clears of mp4TimecodeArgs and the per-type ordinals of mp4NameCarryArgs and dvCopyFourccArgs
        // key on: a cover sorts after every real video, and into the mp4 family after every track (isCovrRow).
        const outStreams = [...mappedRows, ...asTrackRows].map((r) => r.stream);
        response.infoLog += mp4NameCarryLog(dstContainer, outStreams) + dvCopyFourccLog(dstContainer, outStreams) + movLangRespellLog(dstContainer, outStreams);
        response.preset = `<io>${ffmpegMap} -c copy${dispositionArgs}${autoDefaultPin}${junkArgs}${movLangRespellArgs(dstContainer, outStreams)}${strictArg}`
            + `${mp4TimecodeArgs(dstContainer, outStreams)}${dvCopyFourccArgs(dstContainer, outStreams)}`
            + `${mp4NameCarryArgs(dstContainer, outStreams)}${matroskaCoverArgs(staged.kept)}${globalOutputOpt}`
            + `${mp4MovflagsArg(dstContainer, tagPlan, faststartOn)}${outputMuxerArg(dstContainer)}`;
        const mapped = file.ffProbeData.streams.filter((s) => !uncopyable.includes(s) && !staged.leaveOut.includes(s));
        response.infoLog += mp4UncopyableLog(dstContainer, uncopyable, mapped) + matroskaCoverLog(staged)
            + asTrackRows.filter((r) => r.stream.disposition?.attached_pic !== 1).map((r) => `☐${streamTag(r.index)} The cover-art track goes after every`
                + ' other track - cover art is never sorted among the real video\n').join('')
            + mp4TagPlanLog(tagPlan, dstContainer, mapped) + mp4TimecodeLog(dstContainer, outStreams)
            + dvCopyLossLine(dstContainer, mapped) + movDvLossLine(dstContainer, mapped) + roleLossLine(dstContainer, mapped);
        const goneData = mp4LostData(uncopyable, mapped);
        const coversLost = mp4CoversLost(tagPlan, dstContainer, mapped);
        // A kept covr cover the source reports ahead of a track - a udta written before the tracks - is read back after every one once remuxed.
        response.infoLog += mappedRows.filter((r) => isCovrRow(r) && !coversLost.some((s) => s.index === r.index)
            && file.ffProbeData.streams.slice(r.origPos + 1).some((s) => !isMp4Cover(s)))
            .map((r) => `☐${streamTag(r.index)} Cover art goes after every track - the .${dstContainer} muxer stores it as a cover atom, read back`
                + ' after them\n')
            .join('');
        const leftOut = new Set([...goneData, ...coversLost, ...mkvCoverStreams].map((s) => s.index));
        // a track the muxer rebuilds or creates lands after every mapped one, where the muxer writes it, and a kept cover after those (mp4RebuiltLast); the
        // flags are the ones the output is read back with (readBackDispositions), and this preset's own -disposition writes turn ffmpeg's default rule off
        const created = mp4CreatedTracks(dstContainer, outStreams);
        const shown = mp4RebuiltLast(dstContainer, outputRows.filter((s) => !leftOut.has(s.index)), uncopyable, created, (s) => ({ index: -1, stream: s }));
        // a cover copied as a track is mapped after everything and read back after every track (coverTracksAsRead); a cover attached again is an attachment
        // stream in the command, outside ffmpeg's default rule, and is listed after everything
        const withTracks = coverTracksAsRead([...shown, ...asTrackRows], staged.asTrack, (r) => r.stream);
        const outRows = readBackDispositions(dstContainer, withTracks, carriesDisposition(response.preset), (r) => r.stream, (r, s) => ({ ...r, stream: s }));
        const carried = mp4NameCarryView(dstContainer, outStreams);   // a name the carry moves into the handler alone reads back as that handler
        const outList = outRows.map((r) => carried(r.stream)).concat(staged.kept.map(keptCoverStream));
        response.infoLog += `☑Expected results: ${outList.map((st) => summariseStream(movLangReadBack(dstContainer, dvCopyReadBack(dstContainer, st))))
            .join('')}\n`;

        return response;
        // ====== END PRESET ASSEMBLY ======
    } catch (err) {
        failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
