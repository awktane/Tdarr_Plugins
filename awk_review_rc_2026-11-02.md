# Review of the `Tdarr_Plugin_awk_*` plugins (RC branch, 2026-11-02)

Scope: the five plugins at `origin/rc` commit `996aca0` (clean_and_remux 4.999.72, audio_clean 4.999.72,
stream_ordering 4.999.50, sub_worker 3.999.88, video_clean 3.999.74). Reviewed by an agent with **no**
CLAUDE.md or project memory, deliberately, so the notes below read the way a plugin user or a
first-time contributor would read the code. Every item is phrased as "check whether there is a reason";
several may be deliberate, and the project memory is the place to settle that.

Line numbers refer to the RC files as checked out on this branch.

---

## 0. What was verified and found sound

These were checked explicitly so nobody re-litigates them:

- **All 46 `SHARED` sections are byte-identical** across the files that carry them. A script that
  extracts every `// ===== SHARED [...]: name =====` ... `// ===== END SHARED: name =====` block and
  compares the text across files found 0 drift, every END label matches its opener, and every section's
  declared carrier list matches the files it actually appears in. The in-repo claim holds even though the
  checker that enforces it (`awk-shared-block-check`) is not in the repository.
- `node --check` passes on all five files.
- No identifier is declared and never referenced in any file **except one** (`keyframeTimes`, item 2.2).
- The run-order contract (clean_and_remux first, stream_ordering last) is stated in the sub_worker,
  video_clean and stream_ordering descriptions and the ordering-sensitive code matches it (clean_and_remux
  is the only language-tag writer; stream_ordering's truncation check assumes it sees the finished file).
- The non-video / missing-ffProbeData ordering (fail on missing probe data *before* the not-a-video
  skip) is the same in all five, so it is a convention rather than a drift. It still means a non-video
  file with no probe data fails instead of skipping, which the comment at clean_and_remux 1402-1405
  says must never happen; see 2.9.
- Preset assembly was traced for the per-type ordinals (`-metadata:s:a:N`, `-c:s:N`, `-tag:v:N`,
  `-disposition:a:N`) in clean_and_remux, audio_clean and sub_worker: survivors stay contiguous
  because every drop is applied before the ordinal is consumed or decremented back.

---

## 1. Repository tooling the plugins do not pass

The repo's own CI (`.github/workflows/lint_and_test.yml`, on every pull request) runs
`npm run checkPlugins`, `npm run lint` and `npm run test`. All three fail on the awk files today.
If these plugins only ever live on the awktane fork this may be accepted, but a user who clones the
repo and runs the documented commands sees red on these five files first.

### 1.1 `npm run checkPlugins` exits 1

- **sub_worker has no `Stage` key** (`Community/Tdarr_Plugin_awk_sub_worker.js:3-7`). The comment at
  line 2826 says this is deliberate ("declares no Stage, so Tdarr runs it in both stacks"). The checker
  (`tests/checkPlugins.js:132`) only accepts `'Pre-processing'` or `'Post-processing'`, and also reports
  every key after `id` as out of order and "details are too few". *Question for the project: is omitting
  `Stage` the only way to get a both-stacks plugin, and is there a way to tell the checker so?*
- **All five fail "Plugin Name is not capitalized"**: `tests/checkPlugins.js:127` requires every
  space-separated word of `Name` to start with an uppercase letter (the other Community plugins use
  Title Case throughout, e.g. "Migz-Transcode Using Nvidia GPU & FFMPEG"). The awk names are sentences
  ("Remove streams and metadata then remux file if necessary...").

### 1.2 `npm run test` exits 1

`tests/runTests.js` requires either `tests/Community/<plugin>.js` or a literal `// tdarrSkipTest`
comment in the plugin. None of the five has either, so the runner stops with
`Tdarr_Plugin_awk_video_clean.js does not have a test but should do.` before running anything else.
The comments mention a harness ("pinned by the harness", `__awkCap`, `__awkMoovFront`, scenario
assertion names such as `video-clean-a-preserved-dv-output-still-matches-its-own-fence`) but it is not
in the repository. *Either add the marker, or add a tests/Community entry that drives the harness.*

### 1.3 `npm run lint` reports ~27,000 errors on the five files

`.editorconfig` scopes a 4-space / 160-column style to `Community/Tdarr_Plugin_awk_*.js` and points
at `~/Claude/CLAUDE.md` for it, but `.eslintrc.json` (airbnb-base, 2-space, 120 columns) has no
matching `overrides` block and the files are not in `.eslintignore`. Beyond indent and max-len the
tally includes 116 `no-use-before-define`, 113 `no-nested-ternary`, 19 `no-shadow`, 19 `no-plusplus`.

The `no-plusplus` hits matter because four of the files open with
`/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */` and then use `++`/`--`
in statement position anyway (clean_and_remux 2833/2930/2976/3034/3068/3074, audio_clean
3062/3354/3370, stream_ordering 2002/2013, video_clean 1811/1821/3782/3801/3823). sub_worker carries
the same directive and honours it (`i += 1`, `k -= 1`). *Either drop the directive, or make the four
files match sub_worker, or add an eslint override for the awk style.*

---

## 2. Code findings

### 2.1 clean_and_remux: `language_fill` is the one free-text input read without `String()`

`Community/Tdarr_Plugin_awk_clean_and_remux.js:1307`

```js
const fillLanguage = (inputs.language_fill ? inputs.language_fill.toLowerCase().trim() : '');
```

Every other free-text input in the suite goes through `splitList(String(v || ''))`, `ddValue`
(`String(...)`) or `String(inputs.x).trim()`, and the shared `ddValue` comment explicitly says Tdarr
can hand a saved non-string value through unchanged. A `language_fill` stored as a number or boolean
(hand-edited or imported config) throws `TypeError: inputs.language_fill.toLowerCase is not a function`.
This runs *before* the `try` at line 2365, so it escapes `failUnexpected` and the file errors with a
bare stack and none of the plugin's own infoLog. Fix is `String(inputs.language_fill || '')`.

### 2.2 video_clean: `keyframeTimes` is dead

`Community/Tdarr_Plugin_awk_video_clean.js:1754` defines `keyframeTimes` and the comment at 1750
documents it, but nothing calls it (`runTestEncode` uses its own inline `keys()` over `packetRows`).
Only unused declaration in the five files.

### 2.3 clean_and_remux: the `DATA_CODECS` clause is unreachable

`Community/Tdarr_Plugin_awk_clean_and_remux.js:3132`

```js
} else if ((ffstreamType === 'data') || DATA_CODECS.includes(ffstreamCodec)) {
```

By this point every stream whose type is not one of video/audio/subtitle/attachment/data has already
been dropped at line 2715, and the subtitle/audio/video/attachment branches precede this one. So
`ffstreamType === 'data'` is always true here and the `DATA_CODECS` test (and the table at 1576-1579
with its three-line rationale, including the `tmcd` entry whose own comment says it "never matches on
the production probe") can be removed. *Check whether a non-production probe still needs it.*

### 2.4 Comments reference tooling and documents that are not in the repository

About 80 comment lines across the five files point a reader at things they cannot open:
`awk-ffmpeg-test` and its `fmtprobe` / `muxmatrix` / `memprobe` / `miprobe` rows (39 mentions in
video_clean alone), `awk-shared-block-check`, `input_surface_diff.js`, `build-facts.md`,
`gen_memprobe`, "CLAUDE.md's retired-option policy" (clean_and_remux 1382-1386, sub_worker 2845-2847,
video_clean 2894-2897), "the harness", and the scenario-assertion name at video_clean 4079.
Related: the production code carries test-injection hooks on `otherArguments` (`__awkCap` in
audio_clean, sub_worker, video_clean; `__awkMoovFront` in stream_ordering) that short-circuit real
probes. They are harmless (Tdarr never sets them) but a user reading `probeA53Captions` or
`moovBeforeMdat` meets them with no explanation of where they come from.

*Suggestion: one short in-repo note (README section or `Community/awk_README.md`) that names the
external tooling, says where it lives, and explains the `__awk*` injection contract; then the per-site
comments can refer to that note instead of to files nobody can find.*

### 2.5 Style drift inside and between files

The five files mostly share one voice, but a few things differ in ways a reader notices:

- `function cleanStreamTitle(rawTitle) {` (audio_clean 1868, clean_and_remux 1956) is the only
  function declaration in the suite; every other helper is a `const` arrow, and the repo lint is
  `func-style: expression` + `prefer-arrow-functions`. (video_clean's `function* hardware()` is a
  generator and has to be a declaration.)
- `audioQuality` closes with `}` and no `;` (stream_ordering 1184, audio_clean 1420) where every other
  `const x = () => {...};` carries one. Because it is a SHARED block both copies must change together.
- `if(` with no space: 26 occurrences in clean_and_remux, 3 in audio_clean, 1 in stream_ordering, 0
  in sub_worker and video_clean.
- `=== true` on values that are already booleans: `removeComments === true`, `removeBusytitle === true`,
  `shouldDrop === true`, `convert === true` (clean_and_remux 2819/2927/3104/3224/3234/3318/3340,
  audio_clean 3906) beside plain `if (removeBusytitle && ...)` at clean_and_remux 2792.
- `for (let i = 0; i < streams.length; i++)` where `i` is only used to index (clean_and_remux 2696,
  audio_clean 3400) could be `for (const ffstream of streams)`; stream_ordering 1832 legitimately
  needs `i` as `origPos`.

### 2.6 `details()` is rebuilt at runtime for one field

`audio_clean 3109`: `loudnormTagValue = () => \`${methodLoudnorm}-${details().Version}\`` is called
once per stamped track; `video_clean 4380`: `details().Version` inside the transcode path. Each call
re-creates the whole input form (every tooltip string). Cost is negligible, but it reads as odd and
a single `const PLUGIN_VERSION = details().Version;` next to `inputs = lib.loadDefaultValues(...)`
would be clearer.

### 2.7 Small redundancies and one-line wrappers

- stream_ordering 2058: `if (lk === 'title' || lk === 'comment' || lk === 'creation_time' ||
  lk.startsWith('awk_')) continue;` guards keys that `isGlobalJunkKey` can never match anyway
  (none are in `JUNK_ENCODER_GLOBAL` / `JUNK_DESCRIPTIVE`). It documents intent but is dead logic;
  the comment above it already states the always-kept set.
- clean_and_remux 2285: `(unstorableDisp[dstContainer] || new Set())` - `dstContainer` is validated to
  be `mkv` or `mp4`, both keys exist.
- clean_and_remux 3233: `getTagCI(...) ?? ''` - `getTagCI` never returns null/undefined.
- clean_and_remux 2808: `mi && !(ffstream.tags?.title) && mediaTitleClean !== ''` - a non-empty
  `mediaTitleClean` already implies `mi`.
- Wrappers that add a name without adding meaning: `const langTok = logSafe;` (audio_clean 2437),
  `hasPlainSameLang(set, lang) => set.has(langKey(lang))` (clean_and_remux 2336, two call sites),
  `relBasename = (rel) => path.basename(rel)` (sub_worker 1926), `logPath = (v) => logSafe(v, Infinity)`
  (sub_worker 2154; equals `logTok(v, Infinity)`). Each has a comment justifying it; a reader still has
  to look them up to learn they are aliases.
- clean_and_remux 1308 and audio_clean 2215/2217 lowercase list tokens before passing them to
  `langKey`, which lowercases again.
- clean_and_remux 3016-3020: `'srt'` in the mp4 conversion list never matches (ffprobe reports
  `subrip`); harmless.

### 2.8 Ordering that a reader has to work to follow

- sub_worker: `mountedLib` (2136-2139) closes over `unmappedMode`, which is declared ~700 lines later
  (2844). The comment says "this closure must stay lazy (called, never evaluated here)". All five
  files put the input reads after the shared helpers, so the convention is consistent, but this is
  the one place a helper silently depends on an input that has not been read yet. Moving the
  dropdown reads above the UNMAPPED-NODE block, or passing the mode in as an argument, would remove
  the hazard.
- clean_and_remux: `const path = require('path'); const fs = require('fs');` sits at line 1696,
  between shared sections, while sub_worker requires everything on line 266 and video_clean at
  1282-1284. Fine functionally (checkPlugins only requires `require` inside a function), just
  inconsistent.
- Several per-call helpers rescan `file.ffProbeData.streams` or recompute `mp4RebuiltTimecodes(kept)`
  (`isMp4RebuiltTimecode` per data stream, `mp4LostData([s], kept)` per dropped stream in
  `mp4UncopyableLog`). O(n^2) over stream counts in the teens; not worth changing, noted only so it
  is a known decision.

### 2.9 Behaviour worth a second look (may be intended)

- All five fail a file with missing `ffProbeData.streams` *before* testing `fileMedium`, so a
  non-video file without probe data goes to the error queue rather than being skipped. The
  clean_and_remux comment at 1402-1405 says a non-video file "must never be routed to the error
  queue". In practice Tdarr always supplies probe data for scanned files, so this is probably moot.
- audio_clean: a stereo-tier track with no measurable channel count gets two `noChannelCountSkip`
  lines when `codec_force` is also on (3433 and then 3522), one per setting. Possibly intended, since
  each names its own setting.
- stream_ordering: `moovBeforeMdat` opens the file on disk on every pass of every mp4-family file
  while `method_mp4_faststart=force` (the default). It reads a few box headers, so it is cheap, but
  it is the one filesystem read the plugin performs on a file it then skips.
- video_clean: `selectEncoder` is re-run (new `-encoders` / `nvidia-smi` spawns) for the guard_dv
  memory counterfactual and again in `untried()`; both are documented as deliberate. Noted only
  because they are spawns on the failure path.

---

## 3. Comment density

The user asked for comments that could be removed or that do not add anything. The honest answer is
that very few comments are *wrong*; the measured-fact style ("measured 2026-10-23 on jellyfin 7.1.4")
is consistent and the rationale usually earns its place. What a first-time reader struggles with is
volume and placement rather than accuracy:

- The five files total 18,344 lines; roughly half are comments, and the 46 SHARED sections are
  repeated verbatim (with their comments) in every carrier, so the same 2-15 line rationale appears
  up to five times across the suite. That is the stated price of single-file plugins; a short
  pointer ("see the SHARED section header in clean_and_remux") in the copies would halve the text
  a reader scrolls past without changing what the shared-block checker compares, *if* the checker
  can be taught to ignore a leading pointer line.
- Several comments describe history rather than the code ("re-fitted 2026-10-18 ... At the node's
  usual 4 GB every 4K reading sat at the ceiling", video_clean 2123-2125; "Two of them moved a long
  way - mpeg2video -32% and vp9 -21%", 2162-2163; "measured 5.7 s of blocked worker", several
  places). These read like commit messages. The RC log already carries them; the code comment could
  keep the number and drop the narrative.
- A few comments argue with a hypothetical refactor ("Do NOT 'fix' this by ...", "do not collapse
  these", "That ternary is not dead code to be tidied away", video_clean 3324-3325). They are useful
  guards against an agent's tidy-up pass, but a human reader cannot tell which refactor was tried
  and rejected and which is a prediction. A one-word tag such as `(measured)` vs `(reasoned)` would
  separate the two.
- Comments that reference external artefacts (item 2.4) are the ones that genuinely do not help a
  reader of this repository.

Nothing in the comments was found to contradict the code it describes, with two exceptions already
listed: the `no-plusplus` directive (1.3) and the `DATA_CODECS` / `tmcd` rationale that describes a
branch that cannot be reached (2.3).

---

## 4. Questions for the project memory

1. Is sub_worker's missing `Stage` the only way to run in both stacks, and is checkPlugins expected
   to fail on it?
2. Are the awk plugins ever intended to pass the repo's `npm run lint` / `npm run test`, or is the
   fork's CI disabled for them? If the former, an eslint `overrides` entry and a `// tdarrSkipTest`
   marker (or test entries) are the smallest fixes.
3. Where does `awk-ffmpeg-test` / the harness live, and should the repo carry a pointer to it?
4. Is `language_fill` deliberately read without `String()` (2.1)?
5. Can `DATA_CODECS` and `keyframeTimes` go (2.2, 2.3)?
6. Should the four files that violate their own `no-plusplus` directive be brought in line with
   sub_worker, or the directive dropped?
