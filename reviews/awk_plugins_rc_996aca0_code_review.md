# Code review: the `Tdarr_Plugin_awk_*` plugin suite on the `rc` branch

**Target:** `awktane/Tdarr_Plugins`, branch `rc` @ `996aca0` (2026-10-24). The suite is five classic Tdarr plugins, 18,344 lines:

| plugin | version | lines | stack position |
|---|---|---|---|
| `Tdarr_Plugin_awk_clean_and_remux` | 4.999.72 | 3,399 | first |
| `Tdarr_Plugin_awk_audio_clean` | 4.999.72 | 3,951 | middle |
| `Tdarr_Plugin_awk_sub_worker` | 3.999.88 | 4,306 | middle, before video_clean; also post-processing |
| `Tdarr_Plugin_awk_video_clean` | 3.999.74 | 4,472 | middle |
| `Tdarr_Plugin_awk_stream_ordering` | 4.999.50 | 2,216 | last |

**Date of review:** 2026-10-25. The branch has a feature launch in flight, so some findings may already be known or in progress.

**Scope:** each plugin individually, and the five as a group. The focus was:
- anything that would cause problems: data loss, failed or looping files, wrong results;
- anything a user could misread in the tooltips and options;
- whether the code comments are accurate.

The comments were not assumed correct. Every non-trivial claim a finding depends on was checked against the code, and against real ffmpeg where that was cheap.

**How to read it:** every finding has a severity, a verification status and rc line numbers. *Verified* means at least one independent verifier, told to refute the finding, failed to: it rebuilt its own reproduction and traced the code. High findings had two verifiers. The one exception is GRP-01, which a verifier found and I reproduced. Where verification changed a finding's severity or scope, the text says so. Section 7 lists what was refuted. Appendix B covers the method and the environment caveats, the main one being that tests ran on stock FFmpeg 6.1.1, not jellyfin-ffmpeg 7.1.4.

## Summary

The suite is ambitious and, for the most part, careful:
- The shared code is byte-identical across files.
- Index bookkeeping holds up under heavy option combinations.
- The defaults converge in one pass. The exception is SO-01's TS/PS captures.
- Validation is strict.
- The logs explain themselves.

Section 8 lists what holds up.

The problems cluster in four places:

1. **Deleting a source before its copy is committed** (sub_worker SW-01, SW-02, SW-15). Two of the four High findings are here. Both reproduce with **default settings**.
2. **Cross-pass state that is keyed wrongly:**
   - video_clean's fence is keyed on settings rather than on what changes for the file (VC-01).
   - stream_ordering's truncation check does not know about clean_and_remux's forced timestamp repair (SO-01).
   - The subtitle default flag has no owner (GRP-02).
3. **mp4 metadata that ffmpeg cannot round-trip:**
   - Track titles are lost on every remux (GRP-01).
   - The `original` flag cannot be stored (CR-02).
   - The marker → `use_metadata_tags` side effects (GRP-03).
   - The title loop without mediaInfo (CR-01).
4. **Tooltips that state a rule the code does not follow:** AC-01, CR-05, CR-07, VC-05, SO-05, and the stack-order and post-processing setup instructions (GRP-04, GRP-07).

The repo-level checks also fail. `checkPlugins` fails, `npm test` runs zero tests for the whole repo, and lint reports 27k errors (GRP-08). This predates rc, but it would block an upstream PR.

**Counts after verification:** 4 High, 35 Medium, 61 Low; 3 findings refuted outright (Section 7).

### Fix first

| # | ID | What | Default settings? |
|---|---|---|---|
| 1 | SW-01 | sub_worker deletes library sidecars during pre-processing, based on a cache file that may never be accepted | yes |
| 2 | SW-02 | Non-UTF-8 (cp1252/Latin-1) srt cues are silently dropped on import, and the sidecar is deleted as "safely embedded" | yes |
| 3 | SO-01 | A healthy MPEG-TS with a timestamp jump is failed as truncated on every retry | yes |
| 4 | VC-01 | Under shrink, any settings change re-encodes every already-shrunk file (a second lossy generation, kept) | shrink |
| 5 | GRP-01 | Every awk remux of an mp4 deletes all track titles (and with them, title-only roles such as "Commentary") | yes, on mp4 |
| 6 | GRP-02 | The default stack marks a subtitle default that the source never had | yes |
| 7 | SW-03 / CR-01 | Infinite loops that Tdarr's identical-preset guard cannot catch, or that hit it every pass | specific combinations |
| 8 | SO-03 | A .mov loses its cover to a faststart-only remux | yes |
| 9 | AC-01, CR-02, CR-03, CR-04, CR-15, AC-05, AC-10, SW-07, SW-15, VC-03, VC-18, SH-03, K5, GRP-03, GRP-04 | Remaining data-loss or failed-file Mediums | non-default |

### Tooltip and option text to fix (cheap, user-facing)

AC-01, AC-04, AC-06, AC-07, AC-08, AC-13, AC-14 · CR-05, CR-06, CR-07, CR-09, CR-10, CR-11, CR-12, CR-13, CR-14, CR-17, CR-19 · SW-06, SW-10, SW-11, SW-12, SW-13 · VC-05, VC-06, VC-07, VC-12, VC-14, VC-16 · SO-03, SO-04, SO-05, SO-06, SO-07, SO-08, SO-10, SO-12, SO-14 · GRP-02, GRP-03, GRP-04, GRP-05, GRP-06, GRP-07, GRP-11, GRP-12, GRP-15.

### Comments found inaccurate

| Where | Comment says | Actually |
|---|---|---|
| sub_worker `:4163-4164` | anything deleted here "is in the accepted library copy however the flow ends" | the check reads this job's uncommitted cache file (SW-01) |
| sub_worker `:4164` | "(a marker-listed member is handled below)" | the nothing-to-mux unlink never checks the marker (SW-01) |
| sub_worker `:3322-3323` | this branch "drops only subtitle/attachment streams" | commitPreset also maps out staged Matroska cover tracks since 996aca0 (K1) |
| sub_worker `:3031` | "Only subtitle streams … are ever added or dropped here" | contradicts `:3033-3035` of the same comment, which 996aca0 updated to list the cover drop (K1) |
| clean_and_remux `:1497` | "mkv keeps a valid region/script subtag so a pt-BR fill survives" | only with tag_language=disabled; under defaults a pt-BR fill writes `pt` (CR-06) |
| sub_worker `:2718`, video_clean `:2633` | "Does the primary video stream carry A53 caption side data?" | probes `v:0`, which can be a cover (SH-03) |
| sub_worker `:3327-3331` | the caption strip is "picture-lossless on H.264" | pictures are; random-access points (recovery-point SEI) are not (SW-07) |
| sub_worker `:1438`, `:2289` | "a hung ffmpeg … is killed" / "the spawn ceilings cover" | SIGTERM does not stop an ffmpeg blocked in open/read (SW-05) |
| sub_worker `:1876-1877` | the und rule keeps `<video>.und.hi.srt` as Hindi | that name is rejected outright (SW-09) |
| sub_worker `:1928` | grammar `…[.<encTitle>].<lang>[.<disp…>]…` | non-server flags go before the language (SW-13) |
| sub_worker `:3910-3912` | "only a file named after THIS video is ours to report" | longer siblings are warned about every pass (SW-08) |
| stream_ordering `:1653-1656` | a TS/AVI discontinuity "under-reports its own length" | the forward-jump case over-reports, and that is the case that fails (SO-01) |
| stream_ordering `:427-431` (shared isSecondaryTrack) | "stream_ordering never ranks one above a main track" | language rank puts a listed-language commentary above a main track (SO-02) |
| stream_ordering `:1760-1761` | "a codec copied from the log matches" | not for aliased codecs (SO-05) |
| video_clean `:2025-2028` | "An AV1 target goes 0-63 on every AV1 encoder" | av1_vaapi has no qp; av1_amf is 0-255; av1_qsv ICQ 1-51 (VC-04) |
| video_clean `:4019-4025` | after a libx265 drop "the output provably carries no captions" | only if the build's a53cc default is 0 (VC-02) |
| video_clean `:1495` | `'-'/"any"` = every family | only `'-'`/empty is (VC-12) |
| clean_and_remux `:783-784` (shared) | "every other data track is copied, so a GoPro 'gpmd' … survives" | clean_and_remux removes it (CR-18) |
| audio_clean `:2433-2434` | "langKey only trims and lowercases" | it folds region, names and ICU canonical forms (AC-15) |
| audio_clean `:2630`, `:3555-3556` | ac3/eac3 accept every layout | they re-matrix 6.0/hexagonal to 5.0 (AC-07) |
| video_clean `:2510-2514` | `-thread_type slice` justified by memory only | also costs decode speed on single-slice H.264 (VC-17; incomplete rather than wrong) |

**Comments checked and found accurate** (some had been suspected):
- the jellyfin `5.1(side)` libopus claim (AC-03; patched in Tdarr's build);
- clean_and_remux's mp4 title-guard comment (`:2798-2802`; see CR-01 and GRP-01);
- sub_worker's `ffmpegMode`/`handbrakeMode` field names (IN-17);
- the mp4 per-stream tag loss and covr/mdta behaviour;
- the disposition-storage matrix;
- the MP4_UNMUXABLE rows that are present;
- the memory-table measurements;
- the order_language worked example;
- video_clean's DV encode parameters;
- the guard_quality examples;
- the clean_and_remux container claims about ttml, dvd_subtitle, PGS/DVB and eia_608.

---
## 1. The suite as a group

These findings come from the five plugins working together: stack order, the stamps and tags they pass to each other, shared helpers, and repo conformance. Single-plugin findings are in sections 2-6.

**ID mapping.** The integration review's IDs were renumbered here, and the text sometimes cites the originals:

| integration ID | here | integration ID | here |
|---|---|---|---|
| IN-01 | GRP-04 | IN-09 | GRP-10 |
| IN-02 | GRP-05 | IN-10 | CR-05 / CR-13 |
| IN-03 | GRP-03 | IN-11 | GRP-11 |
| IN-04 | GRP-06 | IN-12 | GRP-12 |
| IN-05 | GRP-02 | IN-13 | GRP-13 |
| IN-06 | GRP-07 | IN-14 | GRP-14 |
| IN-07 | GRP-08 | IN-15 | GRP-15 |
| IN-08 | GRP-09 | IN-16 | GRP-16 |

IN-17 was refuted (Section 7). From the first whole-file pass: K2 → SH-01, K3 → GRP-02, K4 → SH-03, K6 → SH-02, K7 → GRP-13. K1 and K5 keep their IDs (sections 4 and 5).

### GRP-01 · Medium · data-loss: every awk remux of an mp4 silently deletes all track titles
- **Where:** each plugin's mp4-family `-map … -c copy` remux, e.g. `Community/Tdarr_Plugin_awk_stream_ordering.js` (reorder preset), and `Community/Tdarr_Plugin_awk_clean_and_remux.js:2803-2811` (the title reconcile write is skipped on mp4).
- **Verified:** A clean_and_remux (CR-01) verifier found this as a side observation, and I reproduced it on the stream_ordering default path. It was not separately put to an adversarial verifier.
- **What happens:**
  - The mov muxer writes a track title to `trak/udta/name`.
  - The mov demuxer never reads that atom back; it maps only `©nam` to `title`. That is true in 6.1.1, and the verifier checked the n7.1 and master sources too.
  - So any mp4 → mp4 `-c copy` drops every track title unless the plugin re-sends `-metadata:s:N title=…`.
  - The plugins know where the titles live: the shared `mediaTitleFor` reads them from mediaInfo, "mp4 keeps it in udta/name, which ffprobe never surfaces" (sub_worker:1941).
  - None of the plugins re-sends them on an mp4 remux. clean_and_remux's reconcile branch runs only when mediaInfo is present, and it excludes mp4 on purpose: ffprobe never sees the written udta/name title, so reconciling would remux on every pass (comment `:2798-2802`). The separate no-mediaInfo loop is CR-01.
- **Evidence:**
  - `t.mp4` has audio titled "Stereo Mix" and "Surround Mix", with mediaInfo `Title` set.
  - stream_ordering with `{}` returns `<io> -map 0:0 -map 0:2 -map 0:1 -c copy -disposition:a:0 +default … -movflags +faststart`.
  - Running that preset gives an output with zero `name` atoms; the input had two.
- **Why it matters beyond cosmetics:** several plugins read roles from titles: Commentary, Descriptive, SDH, Forced and Original. A role that lives only in an mp4 title is lost on the first remux. After that, later passes treat a commentary as a main track.
- **Fix:** in the shared mp4 tag plan, re-emit `-metadata:s:<out> title=<mediaTitleFor(s)>` for every mapped stream whose mediaInfo title is non-empty, on every mp4-family remux. This is safe from the CR-01 loop because it re-sends the existing value rather than a new one. With no mediaInfo, log ☒ that track titles cannot be preserved.

### GRP-02 · Medium · bug: nobody owns the subtitle `default` flag, and the default stack invents one
- **Where:**
  - `Community/Tdarr_Plugin_awk_clean_and_remux.js:121-122`, the tag_disposition tooltip: "The default flag is untouched here - track order in the stream ordering plugin owns that".
  - stream_ordering normalises only audio defaults (`:2012-2027`). Its `autoDefaultPinFor` (`:2037-2048`) guards only its own remux.
- **Verified:** Confirmed. Found three times independently: the K3 first pass, integration review IN-05, and its verifier.
- **What happens:**
  - The ordinary remuxes in clean_and_remux, audio_clean, sub_worker and video_clean carry no `-disposition`.
  - When a Matroska output has two or more subtitles and none is flagged default, ffmpeg's auto rule marks the first one default.
  - stream_ordering never clears a subtitle default. Its `subtitle_first=default_tagged` then promotes the invented flag as "the track the FILE itself flags" (`:60`).
  - The finished file forces subtitles on in players. With a French *forced* track listed first, an English-audio show auto-enables French subtitles.
- **Evidence:**
  - A.mkv at all defaults goes from `s:eng | s:fra | s` (none default) to `s:eng/Def` after pass 1, and then converges.
  - clean_and_remux's own Expected results line predicts `[sub:fre srt/default/forced]`.
- **Scope:** Matroska only, with 2+ undefaulted subtitles. In mp4 the mov muxer enables the first subtitle track whatever `-disposition` says, so a pin cannot help there (K3 verifier).
- **Fix:** move `autoDefaultPinFor` into a SHARED block and apply it to every plugin's remux. Alternatively, have stream_ordering restore subtitle defaults against `originalLibraryFile`. Then make the tag_disposition tooltip say which plugin owns the flag.

### GRP-03 · Medium · data-loss / tooltip gap: on mp4, the first `awk_*` marker changes every later mux for the life of the file
- **Where:**
  - shared `mp4TagPlan` / `mp4CoversLost` (`Community/Tdarr_Plugin_awk_clean_and_remux.js:715-750`, identical in all five).
  - Writers: sub_worker `:4200`, `:4293` (`awk_sub_worker`, `awk_cc`) and video_clean `:4011-4014`, `:4036` (`awk_video`, `awk_vq`).
  - The only disclosure is the recover_bad_* tooltip (`clean_and_remux.js:325-326`).
- **Verified:** Partially confirmed. The mechanism and the cover loss reproduce.
- **What happens:**
  - Once any `awk_*` global tag is on an mp4, every plugin adds `-movflags use_metadata_tags` so the tag survives.
  - That rewrites the native iTunes atoms (`©nam`, `©gen` …) as QuickTime `mdta` keys, which mutagen and Apple players cannot read.
  - It also drops `covr` cover art. That is new for sub_worker; video_clean drops covers anyway by design, so for video_clean shrink only the tag rewrite is new.
  - sub_worker's default `action=import` triggers this on an mp4, as does video_clean `shrink`.
- **Corrections from verification:**
  - It is not silent: every such mux logs a ☒ line.
  - The tag rewrite reverses once the marker is gone, but nothing clears sub_worker's import marker short of extracting that subtitle again, and the lost cover is permanent.
  - The default stack (clean_and_remux `container=mkv`) never reaches this. It needs sub_worker standalone on mp4, `container=mp4`, or video_clean shrink on an mp4.
- **Fix:** disclose it in sub_worker's Description and `action` tooltip and in video_clean's `shrink`/`guard_shrink_savings` tooltips. Consider whether sub_worker needs a persistent marker on mp4 at all; import is one-shot.

### GRP-04 · Medium · tooltip gap / data-loss: "clean_and_remux first" is not in clean_and_remux's own Description
- **Where:** `Community/Tdarr_Plugin_awk_clean_and_remux.js:9-32` (Description) and `Community/Tdarr_Plugin_awk_audio_clean.js:9-15` (Description).
- **Verified:** Partially confirmed. This merges IN-01 and CR-08, both reproduced.
- **What happens:**
  - The rule appears only in code comments ("This plugin runs first", `:2366`, `:3342`) and in other plugins' text: sub_worker `:37`, video_clean `:14` and `:318`.
  - Neither clean_and_remux's nor audio_clean's Description says where it belongs.
  - Order matters for data: audio_clean reads the language tags that clean_and_remux's `language_fill` writes.
  - The clean_and_remux Description also never mentions its unconditional `handler_name` wipe (mkv) / replace (mp4). That wipe alone forces one lossless, logged remux of any mkv that ffmpeg wrote, since those carry HANDLER_NAME.
- **Evidence:**
  - Settings: `language_fill=jpn`, audio_clean `language_surround=eng,jpn` and `language_unlisted=delete`.
  - In the documented order, the untagged stereo track is tagged `ja` and kept.
  - With audio_clean first, it is deleted as `und`.
- **Scope (from verification):** it needs `language_fill` set and `language_unlisted=delete`. Without `language_fill`, the `und` track is deleted in either order.
- **Fix:** put one canonical line, identical, in all five Descriptions:
  `clean_and_remux → audio_clean → sub_worker → video_clean → stream_ordering (+ sub_worker again in post-processing)`
  Say why the two orderings that matter do: language tags, and captions before any re-encode. Add a bullet for the handler_name normalisation.

### GRP-05 · Low · tooltip-unclear: the order statements that exist don't agree
- **Where:**
  - video_clean `:14`: "Designed to run after clean_and_remux and before/around audio_clean".
  - sub_worker `:37-38`: "after clean_and_remux (first) / audio_clean and before stream_ordering (last) … run this BEFORE video_clean".
- **Verified:** Confirmed, downgraded from Medium. "Around" makes it vague rather than a strict cycle.
- In simulation, moving video_clean ahead of audio_clean changed nothing. The only order that changes results here is sub_worker before video_clean for captions, and both plugins agree on that.
- **Fix:** the single canonical line in GRP-04.

### GRP-06 · Medium · option-interaction: captions imported by `embedded_cc` meet clean_and_remux's subtitle filters
- **Where:** sub_worker `:111-112` ("clean_and_remux can fill the language in later") and clean_and_remux `:2903-2922`.
- **Verified:** Partially confirmed.
- **What happens:**
  - Imported captions are `und` + SDH.
  - With `language_sub=eng` and no `language_fill`, clean_and_remux deliberately throws on the next pass. The message explains the fix, but no tooltip warns beforehand.
  - sub_worker's advice to match `only_languages` to `language_sub` cannot help, because the caption sidecar is exempt from `only_languages` (`:3736`).
  - With `remove_sub_sdh=all`, the caption track is removed from the video. The hidden staging sidecar stays on disk, so the captions are not destroyed, but they are gone from the file.
- **Fix:**
  - In the `embedded_cc` tooltip: "with clean_and_remux `language_sub` set, also set `language_fill` or list `und`; `remove_sub_sdh=all` will remove these captions".
  - Mirror that in `language_sub` and `remove_sub_sdh`.
  - Consider exempting the imported caption track from `remove_sub_sdh`.

### GRP-07 · Medium · robustness / tooltip: sub_worker has no `Stage`, and its two-stack setup is buried and under-specified
- **Where:**
  - `Community/Tdarr_Plugin_awk_sub_worker.js:3-40` (no Stage; Tags say `pre-processing,post-processing`).
  - `:142-144` (remove_source: "ADD THIS PLUGIN TO THE POST-PROCESSING PLUGIN STACK as well").
  - `:2826-2831` (comment: "declares no Stage, so Tdarr runs it in both stacks").
  - `:2976-2977` (the post pass reads its own entry's inputs).
- **Verified:** Partially confirmed. This merges IN-06 and SW-04.
- **What happens:**
  - The repo's contract (`tests/checkPlugins.js`; the example's "Stage … Determines when the plugin will be executed") requires `Pre-processing` or `Post-processing`.
  - What Tdarr does with a missing Stage is undocumented. The comment ("declares no Stage, so Tdarr runs it in both stacks") and the tooltip ("ADD THIS PLUGIN TO THE POST-PROCESSING PLUGIN STACK as well") can be read as the same two-entry model; the verifiers found them ambiguous rather than contradictory.
  - The instruction appears only in the 5th input's tooltip, not in the Description.
  - The two entries' inputs must agree, and nothing says so. **Reproduced:** a pre entry with `remove_source=false` plus a post entry left at defaults deletes the sidecar the user chose to keep. The marker is written whatever remove_source is (`:4290`).
  - In a Flow, the classic shim (`FlowPluginsTs/FlowHelpers/1.0.0/classicPlugins.ts:130-142`) passes `job` and no `homePath`, so the post-processing pass never happens.
- **Fix:**
  - Give sub_worker `Stage: 'Pre-processing'` and ship a thin `Tdarr_Plugin_awk_sub_worker_post` with `Stage: 'Post-processing'` that only deletes.
  - At minimum, state the two-entry setup in the Description, including that the entries must use the same `action`/`remove_source`, and that Flows never get the deletion pass.

### GRP-08 · Medium · conformance: the awk files break the repo's CI
- **Where:** `tests/runTests.js:7`, `:18-20`; `tests/checkPlugins.js:132-134`; `.github/workflows/lint_and_test.yml`.
- **Verified:** Confirmed on rc and on a `git archive master` snapshot. All of this predates rc, which only adds lint errors.

| check | rc (996aca0) | master (bb7c9e7) |
|---|---|---|
| `node tests/checkPlugins.js` | exit 1. "Plugin Name is not capitalized" ×5. sub_worker has no `Stage`, which cascades into 7 key-order errors and "too few", and prints a mislabelled "does not have a valid Type" (it is really the Stage check). | same |
| `npm test` | `runTests.js` reverses the folder listing and calls `process.exit(1)` at "Tdarr_Plugin_awk_video_clean.js does not have a test", so **0 of the repo's 93 tests run**, other authors' included. | same |
| `eslint` (repo config) | 27,132 errors, mostly indent (4 spaces vs airbnb's 2) and max-len (~160 vs 120). | 17,012 errors |

- **Feasibility:** four of the five plugins run cleanly against `tests/sampleData/media/sampleH264_1.json`, so minimal tests are possible. sub_worker throws on a missing sidecar folder.
- **Fix:**
  - Add a `tests/Community/Tdarr_Plugin_awk_*.js` per plugin (the skip/validation paths are enough to start), or `// tdarrSkipTest`.
  - Capitalise the Names and add the Stage.
  - Agree a per-file eslint override (indent/max-len) with the upstream maintainer, or run `eslint --fix`.

### GRP-09 · Low · option-interaction: there is no single cover-art policy
- clean_and_remux always drops covers and has no option to keep them (`:3071-3075`, `:3112-3115`).
- video_clean drops them on every output it writes, including the lossless HDR10+/DV strip (`:3022-3024`; see VC-07).
- audio_clean, sub_worker and stream_ordering carefully stage covers and re-attach them (`SHARED: matroska cover keep`).
- So without clean_and_remux, whether a file keeps its cover depends on whether video_clean happened to touch it.
- **Verified:** Confirmed. Reproduced: audio_clean keeps the cover, then video_clean removes it.
- **Fix:** pick one policy. Either add a cover option to clean_and_remux and have video_clean keep covers it can copy, or state in clean_and_remux's and video_clean's Descriptions that they remove covers, and in the other three that a cover they keep is still removed by clean_and_remux or by a video_clean encode.

### GRP-10 · Low · performance: faststart costs an extra full remux in almost every mp4 job
- Only stream_ordering writes `+faststart` (`:2105-2170`). Every sibling mp4 remux writes `ftyp free mdat moov`, so stream_ordering's default `force` then remuxes once more just to move the moov.
- An mp4 shrink job costs the encode, then the awk_vq tag remux, then the faststart remux.
- **Verified:** Confirmed. This merges IN-09 and SO-09. The tooltip is literally true per file state, but it never says siblings undo it.
- **Fix:** add `+faststart` to every mp4-family remux through the shared movflags assembly. `strip` keeps working, because it only acts on stream_ordering's own remuxes.

### GRP-11 · Low · tooltip-unclear: the same concepts get different names across plugins
- In stream_ordering, "descriptive" means the audio-description role in `audio_first`/`subtitle_first`, and genre/date metadata in `remove_junk_tags`.
- Audio description has five names: audio-description, descriptive, "visually impaired (audio description)", "visual_impaired audio", and the title keyword "Descriptive".
- Special language codes are listed inconsistently:
  - `language_sub` lists und/mul/mis, though zxx and qaa-qtz also work.
  - audio_clean omits qaa-qtz.
  - `language_fill` lists all five.
  - `order_language` and `only_languages` say nothing.
- **Verified:** Partially confirmed. The naming-prefix and dropdown-convention parts are style, not defects.
- **Fix:** rename the junk-tag value (e.g. `metadata`), use "audio description (visual_impaired)" everywhere, and give every language field the same special-code sentence.

### GRP-12 · Low · tooltip-inaccurate: cross-plugin claims that hold only under one setting
- video_clean guard_lossless (`:318-319`) says "With an mp4 TARGET … clean_and_remux, which runs first, stops the file before video_clean ever sees it".
  - That is false under `method_unmuxable=mkv_fallback`, where the file arrives as mkv. Reproduced with ProRes.
  - It is also false without clean_and_remux in the stack.
- video_clean `:15` and sub_worker `:38`, `:103` say re-encoding "destroys" captions. The guard_captions tooltip itself lists libx264/libx265/NVENC/VAAPI as carrying them. Write "can destroy".
- **Verified:** Partially confirmed.

### GRP-13 · Low · maintainability: helpers duplicated outside the SHARED blocks
- **Duration parsing (K7):** the Matroska DURATION tag is parsed three ways.
  - stream_ordering `durTagSeconds` (`:1631`) returns 0 on mismatch.
  - video_clean's local `hmsSeconds` (`:2747`) returns NaN for empty or garbage.
  - The SHARED `hmsSeconds` (clean_and_remux `:1874`, sub_worker `:1566`) returns 0 for missing and NaN for garbage.
  - Two functions share the name `hmsSeconds` but treat a missing value differently. No caller is broken today.
- **knownLangToken:** clean_and_remux `:1349` defines its own `knownLangToken` outside the shared block (equivalent today).
- **HEVC → `hvc1` retag on copy:** clean_and_remux `:3091` and video_clean `:3100` have no in-band parameter-set guard. video_clean's restore path (`:4347-4353`) has one. The verifier could not make a non-DV file fail, so for now this is about drift.
- **Verified:** Partially confirmed. K7 is confirmed. IN-13's knownLangToken and hvc1 points are real as drift, but the hvc1 harm did not reproduce (Section 7). No live failure.
- **Fix:** move each into a SHARED block.

### GRP-14 · Low · maintainability: nothing in the repo enforces the SHARED contract
- All 46 SHARED block names are byte-identical across their carriers today, and every header's plugin list is exact. A 60-line script checked this.
- Nothing in CI checks it. The code also refers to tooling that is not in the repo, on 56 lines (90 mentions): `awk-shared-block-check` (sub_worker `:287`), `awk-ffmpeg-test` fmtprobe/muxmatrix/selftest_mirrors, `input_surface_diff.js`, "CLAUDE.md's retired-option policy".
- About 92 comment lines pin behaviour to jellyfin-ffmpeg 7.1.4, and no plugin checks the ffmpeg version, although Tdarr lets a node use a custom ffmpeg. See the build-sensitive findings: AC-03, VC-02, VC-04, VC-14, VC-18.
- **Verified:** Confirmed.
- **Fix:** commit the shared-block check (e.g. `tests/checkAwkShared.js`, wired into `checkPlugins`) and the ffmpeg self-tests, or remove the references. Consider one `ffmpeg -version` probe that logs a ☒ line when the node is not on the measured build.

### GRP-15 · Low · tooltip-unclear: sub_worker's Description uses a different line-break convention
- sub_worker's Description holds literal `\\n` (the tooltip convention). The other four awk plugins, and every other Description in the repo, use real newlines.
- So at most one style renders as intended.
- **Verified:** Confirmed by evaluating `details().Description` for every Community plugin. Of the 104 whose Description contains line breaks, sub_worker is the only one holding literal `\\n`.

### GRP-16 · Low · housekeeping: version placeholders
- rc carries `4.999.72 / 4.999.72 / 4.999.50 / 3.999.88 / 3.999.74`; master had `4.26.1 / 4.26.0 / 4.22.0 / 3.46.0 / 3.30.0`.
- The `.999` is a pre-release placeholder. The Version field is display-only, so this is a reminder to choose release numbers before merging, not a defect.
- **Verified:** Partially confirmed. The plugins do not bump in lockstep.

### Shared-helper findings (these SHARED blocks sit in several plugins)

#### SH-01 · Low · data-loss: `stageMatroskaCovers` drops an attached_pic cover it fails to stage (K2)
- **Where:** `Community/Tdarr_Plugin_awk_stream_ordering.js:890`, `:923`. The block is identical in audio_clean `:1127` and sub_worker `:878`.
- **What happens:**
  - `fail` sends a cover that is already an attachment (`attached_pic === 1`) to `dropped`, which goes into `leaveOut` and is mapped out.
  - Only a cover that is already a track falls back to `asTrack`.
  - So an environmental failure deletes cover art. The triggers are:
    - a copy-out timeout or extract failure (a cue-less file, or an mkvpropedit-appended cover past the 256 MB cap);
    - an unusable `awk_cover` folder;
    - a quote or control character in the cache path;
    - a name clash.
  - A missing `tdarr-workDir2-` folder cannot occur under Tdarr's classic or Flow runners.
  - A plain `-map 0:<cover>` copy would keep the bytes and the MIMETYPE, and the next pass would turn it back into an attachment.
- **Verified:** Confirmed by reproduction ("☒[s 3] Cover art dropped"; preset maps only 0:0 0:2 0:1). Downgraded to Low: the failure needs an environment fault, and the log says so.
- **Fix:** on any staging failure, keep the cover as a track (`asTrack`) instead of dropping it.

#### SH-02 · Low · bug: `carriesDisposition` regex-scans metadata values (K6)
- **Where:** shared `carriesDisposition` (e.g. stream_ordering `:781`); consumers clean_and_remux `:3381`, stream_ordering `:2204`, audio_clean `:3901`, video_clean `:3050`, sub_worker `:3047`/`:3061`. Only the Expected results log line is affected.
- **What happens:** the bare regex `/(^|\s)-disposition[:\s]/` runs over the whole preset, quoted `-metadata` values included. A title such as `Signs -disposition:x` therefore reads as a manual disposition. Expected results then leaves out the `/default` ffmpeg will still set.
- **Verified:** Confirmed. Reproduced in clean_and_remux; a control title gives the correct prediction.
- **Fix:** have the preset builders record a boolean when they emit `-disposition`, rather than parsing the finished string. The mp4StrictArg comment already warns against this kind of regex.

#### SH-03 · Medium · bug: `probeA53Captions` probes `v:0`, not the primary video (K4)
- **Where:** sub_worker `:2721-2731`; video_clean `:2636-2646`.
- **What happens:**
  - The comment says "Does the primary video stream carry A53 caption side data?", but the code hard-codes `-select_streams v:0`.
  - In ffprobe, `v` also matches attached_pic covers and mimetype-tagged cover tracks.
  - With a cover ahead of the real video, the probe reads the cover and answers "no captions". It then reaches two places:
    - sub_worker's `embedded_cc` misses the captions. That is permanent when sub_worker runs standalone; in a stack where stream_ordering later reorders the file, the next pass finds them.
    - video_clean's guard_captions lets a caption-dropping encoder run, and the captions are destroyed.
- **Verified:** Confirmed. Reproduced with injected A53 SEI and two layouts: an mp4 with udta ahead of trak, and an mkv with a mimetype-tagged mjpeg first. Controls with the cover last read 100 captioned frames.
- **Scope:** narrower in the designed stack, because clean_and_remux removes covers first. Real risk comes when either plugin runs without it. It also needs `embedded_cc=enabled` or `guard_captions=enabled`, both non-default.
- **Fix:** pass the cover-aware primary or ccVideo index and probe `-select_streams <absolute index>`.
## 2. clean_and_remux (v4.999.72)

`Community/Tdarr_Plugin_awk_clean_and_remux.js`. Line numbers are rc line numbers. All repros were run on ffmpeg 6.1.1. Where a result depended on mediaInfo, the verifier re-ran it with MediaInfoLib 24.12.

| ID | Sev | Verified | Summary |
|---|---|---|---|
| CR-01 | Medium | Partial | mp4 + `tag_title` loops forever when the file object has no mediaInfo |
| CR-02 | Medium | Confirmed | mkv→mp4 silently drops the `original` flag; `guard_audio_language` then fails the file on every requeue |
| CR-03 | Medium | Confirmed | Unmapped node: a transient upload failure permanently flattens a styled ASS to mov_text |
| CR-04 | Medium | Confirmed | Role keywords ignore negation: "non-SDH" is SDH, "Non-Forced" is forced |
| CR-05 | Medium | Confirmed | `method_tag_language=container` writes 2-letter codes into Matroska's ISO 639-2 field; the tooltip calls this "most spec-accurate" and its strict example is backwards |
| CR-06 | Low | Confirmed | `language_fill` follows `method_tag_language` even with `tag_language=disabled`; "only pt-BR keeps the region" is false under defaults |
| CR-07 | Medium | Confirmed | "a STYLED ass/ssa" is exported to a hidden file on mp4, but really EVERY ass/ssa is, and it leaves the video |
| CR-09 | Low | Confirmed | `language_fill` not listed in `language_sub` fails every file at validation |
| CR-10 | Low | Confirmed | `remove_busytitle` / `remove_comments` also act on video and file-level titles/comments |
| CR-11 | Low | Confirmed | tag_title example says "Forced Commentary"; code writes "Commentary Forced" |
| CR-12 | Low | Confirmed | `tag_disposition=disabled` still writes flags; "Lyrics" is never written; "Original" is never written on mp4 |
| CR-13 | Low | Confirmed | "the only awk plugin that WRITES language tags" is false |
| CR-14 | Low | Confirmed | The mp4-unmuxable table misses rawvideo, wavpack, tta, speex, ra_144, g722/g726 and low-rate mp3 |
| CR-15 | Medium | Confirmed | Unmapped export reads `file._id` but maps stream indices from `file.file`: wrong stream exported silently |
| CR-16 | Low | Confirmed | `language_fill_mode=single-or-error` counts commentary tracks and aborts |
| CR-17 | Low | Partial | Recovery also re-runs on a container change; `.dat` is missing from the tooltip list |
| CR-18 | Low | Confirmed | Shared comment says a GoPro gpmd track survives; this plugin removes it |
| CR-19 | Low | Confirmed | The container tooltip's "also removes" wording is wrong (ttml); legacy text formats are not mentioned |
| CR-20 | Low | Confirmed | `tag_language=disabled` + mp4 silently loses 2-letter/region tags, and Expected results claims they survive |

CR-08 (Description never says "run first", and never mentions the handler_name wipe) is merged into GRP-04. The title-loss variant of CR-01 is GRP-01. Integration finding IN-10 (the language-tag form on mkv) is merged into CR-05 and CR-13.

### CR-01 · Medium · loop: mp4 + tag_title rewrites the same title on every pass when mediaInfo is absent
- **Where:** `:2803-2812` (emitTitleMeta), `:2722-2724` (streamTitle), `:2037-2044` (mediaTitleFor); callers `:3002`, `:3060`.
- **What happens:**
  - ffprobe cannot read mp4 track titles (see GRP-01). `streamTitle` falls back to the mediaInfo `Title`.
  - When mediaInfo is missing, stale, or has no Title, every pass sees `""`. It writes e.g. `title=Mono` again and emits an identical preset, which Tdarr errors as a transcode loop.
- **Verified:** Partially confirmed (2 verifiers):
  - With no mediaInfo, passes 1-4 are all identical.
  - With a real MediaInfo scan re-run each pass, it converges on pass 2.
- **Scope:** needs `container=mp4`, `tag_title` on (both non-default), and a pass without a usable mediaInfo. That is why it is Medium, not the High it was first rated.
- **Fix:** on an mp4 target with no mediaInfo Title, skip the title write, or compare against the plugin's own rebuild rather than the read-back. Log once that mp4 titles cannot be verified.

### CR-02 · Medium · bug: an mkv→mp4 remux drops `original` without a word, then guard_audio_language fails the converted file
- **Where:** `:2278` (`unstorableDisp.mp4` contains `original`), `:2469-2481` (guard), `:944-961` + `:3381` (Expected results via readBackDispositions); tooltip `:286-305` (remedy at `:301`).
- **What happens:**
  - mp4 cannot store the `original` disposition. Measured: `+original` reads back 0 on 6.1.1 and 7.0.2.
  - The plugin plans a plain `-map 0 -c copy` with no warning, and Expected results still prints `/original`.
  - On the stack restart, `guard_audio_language=enabled` fails the mp4: "2 audio languages (en, fr) and none marked original".
  - That repeats on every requeue, because the library mkv already has the flag the message asks for.
  - The "original" title-keyword escape works only when mediaInfo is present (GRP-01).
  - audio_clean's `guard_original` loses its anchor the same way.
- **Verified:** Confirmed (2 verifiers; one rated it High, one Medium).
  - On the guard_audio_language path, the file is errored, not damaged.
  - The repro verifier also reproduced silent loss through audio_clean: with `guard_original=enabled` and `language_unlisted=delete`, the original-language track kept in the mkv is deleted from the mp4.
  - It stays Medium because every path needs non-default settings.
- **Fix:**
  - Treat `original` as lost on mp4 in readBackDispositions and in the guard.
  - Before an mkv→mp4 remux, either write an "Original" title keyword or warn.
  - Say in the guard_audio_language and tag_disposition tooltips that mp4 cannot hold the flag.

### CR-03 · Medium · data-loss: on an unmapped node, a transient upload failure turns a styled ASS into plain mov_text for good
- **Where:** `:2952-2974` (held-refusal list at `:2973`), stageSidecar `:2609`.
- **What happens:**
  - On an unmapped node, any failure inside placeSidecars ends up as `why='unmapped'`: no server URL, a staging-dir error, an ffmpeg extract error, an HTTP 500, or a dropped connection.
  - The styled branch holds the file (bundleHeldCount) only for short/leftover/symlink/unconfirmed.
  - So the subtitle falls through to `-c:s mov_text`, and its styling is lost permanently. A requeue would have succeeded.
  - Image subtitles under the same failure correctly fail the file with nothing removed.
- **Verified:** Confirmed. Reproduced with a fake Tdarr file API: download 400 + upload 500 → `-c:s:0 mov_text`; a dropped connection gives the same.
- **Fix:** hold the file on every transport or extraction failure, and flatten only for the permanent causes (no translator, name cap, unsafe path).

### CR-04 · Medium · data-loss: role keywords have no notion of negation
- **Where:** `:560-573` (matchesKeyword), keyword lists `:510`, `:519`, `:523`; `:2337-2338` (sdhRemoved); tooltip `:113`.
- **What happens:**
  - `matchesKeyword` checks only that the keyword is not flanked by a letter or digit.
  - "English (non-SDH)" is therefore SDH, and `remove_sub_sdh=all` deletes it.
  - "English (Non-Forced)" is forced, so `tag_disposition=subtitle` writes a permanent `+forced`, and players then auto-show a full subtitle.
  - "Commentary-free" is commentary.
  - Because "a flag is only ever added", nothing undoes these.
- **Verified:** Confirmed, and the scope is wider than first reported (Non-Forced → forced). `if_plain_survives` fails safe.
- **Fix:**
  - Reject a keyword preceded by a negator (`non`, `no`, `not`, `without`) or followed by `-free`/`-less`.
  - At minimum, never let a title-only keyword drive a destructive action or a permanent flag unless a flag or handler corroborates it.

### CR-05 · Medium · tooltip-inaccurate: the default `method_tag_language=container` writes off-spec codes into mkv and is described as the most accurate
- **Where:** tooltip `:251-252`, `:255-258`, strict example `:139`; code `:1462-1465`.
- **What happens:**
  - On mkv, `container` writes the bare 2-letter key: `en`, `fr`, and `pt` for pt-BR.
  - ffmpeg writes only the legacy Matroska `Language` element (0x22B59C). The spec defines it as ISO 639-2.
  - ffmpeg never writes `LanguageBCP47`: not in 6.1.1, not in the n7.1.1 source, not in master.
  - So "2-letter for mkv … The most spec-accurate per container" is backwards. The same tooltip's last line ("By convention mkv uses ISO-639-2/B") contradicts it.
  - `tag_language=strict` with the default method rewrites every compliant `eng` to `en` across a library, the opposite of its own example "en becomes eng".
- **Cross-plugin (IN-10, verified Low):**
  - sub_worker's `langMetaValue` (`sub_worker.js:2990`) keeps a code-shaped token such as `eng` as-is on mkv.
  - Under `tag_language=strict`, the next clean_and_remux pass therefore rewrites it to `en`, so every import costs one extra pass before the stack converges.
  - Under the default `tag_language=invalid` there is no extra pass.
- **Verified:** Confirmed by scanning the EBML of the outputs. Medium, because the tooltip steers users toward a library-wide rewrite.
- **Fix:**
  - Make `container` mean 639-2/B on mkv and 639-2/T on mp4.
  - Describe `bcp47`-on-mkv as non-standard until ffmpeg writes LanguageBCP47.
  - Re-check on jellyfin 7.1.4 before changing the default.

### CR-06 · Low · tooltip-inaccurate: language_fill and method_tag_language
- method_tag_language (`:246`) says it "Only takes effect while tag_language is not disabled". In fact every `language_fill` write goes through `toCanonicalTag` (`:1498-1500`) and follows it regardless.
- language_fill (`:63-64`) says "only pt-BR keeps the region". Under the defaults a pt-BR fill writes `pt`. The region survives only with `method=bcp47`, or, oddly, with `tag_language=disabled`.
- **Verified:** Confirmed. Reproduced all three cases (`pt-BR` → `pt`; disabled → `pt-BR`; `fra` + 639-2/b + disabled → `fre`).
- **Fix:** document that method_tag_language governs the fill too, and drop the special case where `tag_language=disabled` changes what a fill writes.

### CR-07 · Medium · tooltip-unclear: every ASS/SSA on an mp4 target leaves the video, not only "styled" ones
- **Where:** Description `:26-28`; container tooltip `:52-53`; code `:1641-1648` (`styledSubExported = (codec) => dstContainer === 'mp4' && isStyledSub(codec)`), export branch `:2938-2977`.
- **What happens:**
  - Both texts say "a STYLED ass/ssa", which reads as a check on content. The test is codec-only.
  - Every ass/ssa on mp4, plain ones included, moves to a hidden `.<name>.sN.<lang>.styled.mks` and is mapped out.
  - Plex and Jellyfin skip dotfiles, so to the user the subtitle simply disappears.
  - The container tooltip's list "(… ass, ssa …) become mov_text" is true only on the refusal fallback.
- **Verified:** Confirmed.
- **Fix:**
  - Say "every ASS/SSA subtitle … is moved to a hidden .mks next to the video".
  - Consider an option to convert to mov_text instead, or detect override-free ASS and convert it.

### CR-09 · Low · option-interaction: language_fill must appear in language_sub, or every file fails
- **Where:** `:1379-1381`, which runs during config validation, before the non-video skip at `:1405`.
- **What happens:**
  - `{language_fill:"eng", language_sub:"fra"}` fails every file, audio-only and fully tagged ones included: "☒[language_fill=eng] not in language_sub".
  - Because the fill has no audio/subtitle scope, "fill untagged audio as English, keep only French subs" cannot be configured.
  - Neither tooltip mentions this. language_fill's "Takes precedence over language_sub" suggests the two are independent.
- **Fix:** document it in both tooltips. Better, make it a per-file check that fires only when an untagged subtitle exists.

### CR-10 · Low · tooltip-inaccurate: the scope of remove_busytitle / remove_comments
- remove_busytitle (`:174`) says "audio or subtitle track". It also blanks the video stream title (`:3104-3107`) and the global file title (`:3233-3239`).
- remove_comments (`:186`) says "every stream", but also clears the file-level comment (`:3223-3228`).
- Acronyms trip the >3-periods rule ("S.W.A.T.", "M.A.S.H."). That matches the tooltip literally, but is worth calling out.
- **Fix:** list all four scopes. Consider requiring dot-separated words of 2+ letters before calling a title busy.

### CR-11 · Low · tooltip-inaccurate: tag_title's example order
- The `:160` example says "Forced Commentary". `titleTagsFor` (`:1986-1987`) orders tags by `dispositionTypes` key order and writes "Commentary Forced".
- A title that is literally "Forced Commentary" is treated as role-only and rewritten to that order.
- **Fix:** change the example, or order Forced first.

### CR-12 · Low · tooltip-inaccurate: tag_disposition
- "disabled (default): leave dispositions alone" (`:117`) is not quite true. `preserveClearedRoles` (`:2735-2756`) still writes a flag:
  - when it wipes (mkv) or replaces (mp4) a `handler_name` holding a role keyword, which happens at all defaults;
  - when `remove_busytitle` clears a role-bearing title.
- "subtitle: surface … Lyrics": `lyrics` is in `unstorableDisp` for both containers, so it is never written. `original` is never written on mp4.
- **Fix:** say that the defaults still preserve roles a cleared handler or title carried. Drop Lyrics, and note that Original is mkv-only.

### CR-13 · Low · tooltip-inaccurate: "the only awk plugin that WRITES language tags" (Description `:15-16`)
- sub_worker writes `language=` on every import (`:4234`) and on dedup survivors (`:2994`), normalising the spelling.
- audio_clean writes it on the tracks it creates (`:3172-3176`).
- **Fix:** "the only plugin that fills or standardises existing language tags".

### CR-14 · Low · validation: gaps in the mp4-unmuxable table
- **Where:** `:1539-1554`; tooltip `:279-283`.
- **What happens:**
  - These codecs fail into mp4 with "Could not find tag for codec" but are accepted by mkv: rawvideo, wavpack, tta, speex, ra_144, adpcm_g722, adpcm_g726. mp3 below 16 kHz fails too ("not standard … set strict to -1").
  - None of them is in `MP4_UNMUXABLE` / `UNMUXABLE_ANYWHERE`.
  - So `method_unmuxable=mkv_fallback` cannot rescue them. Reproduced with h264+wavpack: an mp4 preset that dies with the opaque error.
  - The tooltip's "fit in NEITHER container" list also leaves out RealVideo 1-3, which the code has.
- **Verified:** Confirmed on 6.1.1. Re-check on 7.1.4.

### CR-15 · Medium · data-loss: unmapped export reads one file but takes its stream indices from another
- **Where:** `:1828` (placeSidecars `-i file._id || file.file`). The `-map 0:<index>` values come from `file.ffProbeData`, which describes `file.file`.
- **What happens:**
  - Whenever `_id` and `file.file` differ, the wrong stream is extracted or the extraction fails.
  - That happens when a plugin that changes the stream layout runs before this one, on an unmapped node.
  - Verifier repro: the original holds [h264, aac, srt fra, ass eng]; the working copy has the srt removed.
    - The log says "Exported styled ass subtitle -> .Movie.s2.eng.styled.mks".
    - The uploaded bundle actually holds the French SRT, and the preset drops the English ASS.
    - The only copy is lost, silently.
- **Verified:** Confirmed; the verifier raised it from Low to Medium. With clean_and_remux first, as designed, the trigger is narrow.
- **Fix:** extract from `file.file` (the probed file), or re-probe `_id` and map by stream identity.

### CR-16 · Low · option-interaction: language_fill_mode counts secondary tracks
- `:2503` tallies every untagged audio stream. An untagged main track plus an untagged commentary therefore aborts the file.
- The tooltip's reason (a later plugin may dedup identically tagged tracks) does not apply: audio_clean never dedups a secondary track (`audio_clean:2544`).
- **Fix:** exclude `isSecondaryTrack` streams from the tally, as guard_audio_language already does (`:2471`).

### CR-17 · Low · tooltip-inaccurate: recover_bad_*
- "Recovery re-runs only when you change one of the recover_bad_* settings" (`:324`, `:350`) is not the whole rule. `runRecover = recoverRequested && (!intentMatches || containerChanging)`, so a container change re-runs it too.
- The MPEG-PS list in the tooltip leaves out `.dat`, which the code includes (`:3285`).
- **Verified:** Partially confirmed. The reviewer's third point, that the stamp is permanent across light → disabled → light, is by design and not a tooltip error.

### CR-18 · Low · comment-inaccurate: the shared isMp4ChapterTrack header (`:783-784`)
- It says "every other data track is copied, so a GoPro 'gpmd' telemetry track … survives". In clean_and_remux the data branch (`:3132-3150`) removes every data stream except a rebuilt chapter or tmcd track.
- **Fix:** scope the sentence to the plugins that copy data tracks.

### CR-19 · Low · tooltip-unclear: the container tooltip (`:48-53`)
- "mp4: also removes hdmv_pgs_subtitle …" reads as "mkv's list plus these", which would mean mp4 drops ttml. It keeps ttml as `stpp`.
- "plus any other subtitle format the mkv muxer cannot carry and ffmpeg cannot read as text" describes no rule: `subFormatDropped` is a fixed list. Counter-example: an mkv subtitle with an unrecognised CodecID is not removed, and the remux then fails.
- The legacy text formats (microdvd, mpl2, sami, subviewer, vplayer, pjs, stl…) are converted, and neither line says so.
- The measured claims all hold on 6.1.1: ttml rejected by mkv, dvd_subtitle as `mp4s`, PGS/DVB refused by mp4, eia_608 → text with `{\an8}` stripped.

### CR-20 · Low · robustness: tag_language=disabled + mp4 drops tags without a word
- With `tag_language=disabled`, an mkv→mp4 remux passes `en`, `EN-us` and `English` straight to the mp4 muxer, which drops them.
- Nothing is logged, and Expected results shows the tags as surviving. `storesCleanly` already knows they will not.
- The tag_language tooltip does warn about this in general terms.
- **Fix:** log ☒ for each stream whose tag the target will drop, and correct Expected results.
## 3. audio_clean (v4.999.72)

`Community/Tdarr_Plugin_awk_audio_clean.js`. The audio reviewer checked the following and found them correct: stream-index bookkeeping, the never-empty floor, convergence of downmix-add/dedup/loudnorm, the guard_quality tooltip examples, and the loudnorm spawn timeouts.

| ID | Sev | Verified | Summary |
|---|---|---|---|
| AC-01 | Medium | Confirmed | "language_surround blank = every language surround" is false once language_stereo matches: other languages are deleted or downmixed |
| AC-04 | Medium | Confirmed | Loudnorm "within 1 LU" skip ignores LRA and true peak, so quiet_room often does nothing |
| AC-05 | Medium | Confirmed | The stereo tier creates a second stereo of a language that already has one; dedup then deletes the studio stereo |
| AC-10 | Medium | Confirmed | Norwegian: nb/nob does not match "nor"/"no"/"Norwegian", so `language_unlisted=delete` removes it |
| AC-03 | Low | Partial | 5.1(side) → libopus fails on a stock ffmpeg (fine on Tdarr's jellyfin build) |
| AC-06 | Low | Confirmed | `method_stereo_downmix=dialogue` uses the same coefficients as `default` |
| AC-07 | Low | Confirmed | ac3/eac3 silently re-matrix 6.0/hexagonal to 5.0; the log says 6ch |
| AC-08 | Low | Confirmed | Under the default guard_quality, downmix `replace` ALWAYS becomes `add`; the tooltips say "usually" |
| AC-09 | Low | Confirmed | six=add + stereo=replace + guard_quality=disabled replaces the 7.1 that add promised to keep |
| AC-11 | Low | Confirmed | A track ffmpeg cannot decode fails the whole file once loudnorm is on |
| AC-12 | Low | Confirmed | The "enable downmix_to_six" advice is printed when it is already enabled, on every pass |
| AC-13 | Low | Confirmed | codec_force tooltip: "only ever apply to newly created tracks" is false |
| AC-14 | Low | Confirmed | downmix_secondary: "Unlike the language downmix paths" is false for language_stereo |
| AC-15 | Low | Confirmed | Comment says langKey "only trims and lowercases" |

### AC-01 · Medium · tooltip-inaccurate → data-loss: a blank language_surround stops meaning "everything surround" once language_stereo is set
- **Where:** tooltip `:39-40` ("Blank (default) treats every language as surround"); tier logic `:2404-2410`; hasWantedLang `:2383-2385`.
- **What happens:**
  - An empty `langSurroundKeys` never matches.
  - A single `language_stereo` match makes `hasWantedLang` true.
  - Every language outside language_stereo then falls through to `tier = langUnlisted`.
- **Evidence:** on an eng/spa/jpn 5.1 file, `{language_stereo:"spa", language_unlisted:"delete"}`:
  - logs `Removing ac3 6ch en`, `Removing ac3 6ch ja`, then `Expected results: [audio:spa 2ch aac 256k]`;
  - with `=stereo`, all three are flattened.
- **Verified:** Confirmed (2 verifiers), downgraded from High to Medium. It needs non-default `language_unlisted`, and every removal is logged. The same tooltip's later line ("A language in neither this list nor language_stereo is 'unlisted'") states the rule the code follows, so the tooltip contradicts itself.
- **Fix:** when language_surround is blank, give every language not in language_stereo the surround tier and skip language_unlisted. Otherwise fix the tooltip, and log a ☒ line when delete runs with language_surround blank.

### AC-04 · Medium · option-interaction: the loudnorm skip tests integrated loudness only
- **Where:** `:3072`; tooltip `:293-300`, `:308-309`.
- **What happens:**
  - The skip is `|input_i − preset.I| ≤ 1`. LRA and TP are never compared.
  - tv and quiet_room share I = −16 and differ only in LRA (11 vs 6).
  - So a track near −16 LUFS is "already within tolerance" under quiet_room however wide its range, and is never compressed.
  - Switching a library from tv to quiet_room re-measures everything and changes nothing.
  - Peaks above the TP target are kept.
- **Evidence:**
  - I −15.29 / LRA 18.0 under quiet_room is stamped and left at LRA 18. The same content 6 dB quieter is compressed to LRA 9.3.
  - I −15.56 / TP +0.77 dBTP under tv stays above 0 dBTP.
- **Fix:** skip only when I, LRA and TP are all within tolerance. Otherwise say plainly that only integrated loudness is checked.

### AC-05 · Medium · option-interaction / convergence: the stereo tier duplicates a language's existing stereo
- **Where:** `:3420-3449` (stereo-tier in-place fold); `:2883-2884` (existingStereoLangs holds only surround-tier survivors).
- **What happens:**
  - The stereo tier folds every >2ch track of a stereo-tier language to stereo, even when that language already has a 2.0.
  - This breaks the author's own rule (`:2893-2896`) that every stereo-creating site must call `hasStereoForLang`. The remix path does call it.
  - With dedup on, pass 2 removes one of the pair, and with real bitrates the 238k fold-down beats the 127k studio stereo, so the original is deleted.
  - With dedup off, the duplicate stays for good.
- **Verified:** Confirmed, including the bitrate case the reviewer had only marked plausible. It converges on pass 3.
- **Fix:** in the stereo tier, when the language already has a stereo, drop the surround track (it was not wanted at surround) or skip the fold.

### AC-10 · Medium · validation: Norwegian Bokmål does not fold to Norwegian (shared langKey)
- **Where:** `:487-492`; tooltip `:41` ("One form is enough").
- **What happens:**
  - `nor`, `no` and "Norwegian" fold to `no`; `nob`, `nb`, `nb-NO` and "Norwegian Bokmål" fold to `nb`; `nno` folds to `nn`.
  - A list written `nor` or "Norwegian" therefore misses an `nb-NO` track, which is common on streaming rips, and `language_unlisted=delete` removes it.
  - The other macrolanguage cases checked already fold: zsm, arb, pes, cmn, swh.
- **Verified:** Confirmed by running the real helper under Node 22 ICU. The verifier raised it to Medium as silent data loss for Norwegian libraries.
- **Fix:** add an nb/nn → no fold in langKey (it is shared, so every plugin benefits), or document it.

### AC-03 · Low · bug (build-dependent): 5.1(side) is treated as libopus-safe
- **Where:** `:2633` (OPUS_OK_LAYOUTS); used by `:2726`, `:3557`, `:3696`/`:3718`/`:3765`.
- **What happens:**
  - On stock FFmpeg 6.1.1, libopus rejects 5.1(side), the layout ffprobe reports for almost every AC-3/E-AC-3/DTS/TrueHD 5.1.
  - So `codec_force` → opus fails the job (exit 234) on every requeue.
- **Verification correction:** Tdarr's bundled jellyfin-ffmpeg carries a patch (`0056-opus-allow-5point1-side-inputs`) that makes this work, so the code comment is right for a default node. It fails only with a custom or stock `ffmpegPath`.
- **Fix:** relabel 5.1(side) to 5.1 losslessly (as is already done for 5.0(side)). That works on every build.

### AC-06 · Low · tooltip-inaccurate: "dialogue" is the default fold
- **What happens:**
  - With `-v debug`, ffmpeg's own stereo matrix for all 14 CANON_LAYOUTS has the same gains as `SPEAKER_GAINS` (`:3223-3239`): FL/FR 1, FC/BL/BR/SL/SR 0.707, BC 0.5, LFE 0.
  - The only difference is FLC/FRC on 6.1(front) and 7.1(wide…).
  - The emitted `pan=stereo|FL=1.000*c0+0.707*c2+0.707*c4|…` is indistinguishable from the default: 0.0007 dB RMS apart.
  - So "a more opinionated fold that shifts the spatial image" (`:326-327`) is false.
- **Fix:** make dialogue actually different (e.g. centre at 0 dB, surrounds at −6 dB), or remove the option.

### AC-07 · Low · tooltip-inaccurate: "AC3, EAC3 and AAC accept every layout" (`:274`; comments `:2630`, `:3555-3556`)
- ac3 and eac3 exit 0 on 6.0, 6.0(front) and hexagonal, but write 5.0(side) (5 channels). One channel is lost.
- codec_force logs "→ ac3 6ch", Expected results says 6ch, and guard_quality's channel-drop rule never sees the loss.
- **Fix:** let ac3/eac3 hold only 5.1/5.1(side) and layouts of 5 channels or fewer. Route other 6-channel layouts to aac, or count the conversion as a channel drop.

### AC-08 · Low · tooltip-unclear: "replace" never replaces under the default guard
- `guardBlocks` fires on any channel drop (`:2458`), and only surround-tier tracks reach downmix_to_*. So under the default `guard_quality=enabled` (and under strict), `replace` always behaves as `add`.
- The guard_quality tooltip (`:430-431`) states it plainly: "a downmix 'replace' always behaves as 'add' under either enabled or strict". But downmix_to_stereo says "usually" (`:189-191`), guard_lossless says "usually" (`:351-352`), and downmix_to_six says nothing (`:170-172`).
- The log line `[downmix_to_six=replace] Adding …` hides the reason.
- guard_lossless's "will usually keep blocking" is also "always": the top encodable score is 89, against a threshold of 91 or more.
- **Fix:** say "replace acts as add unless guard_quality=disabled", and add `[guard_quality=enabled]` to the log line.

### AC-09 · Low · option-interaction: downmix_to_six=add + downmix_to_stereo=replace + guard_quality=disabled
- `appendSix` (`:3344-3358`) never marks its source as modified. downmix_to_stereo=replace then re-encodes the 7.1 in place (`:3498-3506`), so the master that `add` promised to keep is lost, and the stereo takes slot 0 and the default flag.
- **Fix:** when downmix_to_six=add has just derived from this source, fall back to add.

### AC-11 · Low · robustness: one undecodable track fails the whole file under method_loudnorm
- Any analysis error, including a non-zero ffmpeg exit, calls `failWithBuffers` (`:3063-3067`).
- A track with no codec_name passes guardBlocks under the defaults. AC-4 and MPEG-H do too once guard_object_audio is disabled.
- In mp4 (MPEG-H) the file would otherwise copy fine.
- **Fix:** log ☒ and skip that track's measurement instead of failing the file, or document the behaviour in the method_loudnorm tooltip.

### AC-12 · Low · log text
- The codec_force over-ceiling skip (`:3540-3543`) always says "enable downmix_to_six to create a 5.1 from it first". It does so even when downmix_to_six is enabled and the 5.1 exists, and it repeats as ☒ on every converged pass.

### AC-13 · Low · tooltip-inaccurate: codec_force (`:87-88`)
- "With this off, those two settings only ever apply to newly created tracks." Not so: with `codec_force=disabled`, two paths still re-encode existing tracks to codec_stereo/codec_surround:
  - the stereo tier (in place);
  - loudnorm convergence of an unencodable source (`:3688`). This is also the only place a layout remix can then happen. Reproduced: an mp3 under loudnorm comes out as codec_stereo.

### AC-14 · Low · tooltip-unclear: downmix_secondary (`:151-152`)
- "Unlike the language downmix paths, each surround secondary track is handled in place." language_stereo is handled in place too, through the same branch (`:3424-3426`).
- Only downmix_to_six/downmix_to_stereo are one-per-language. Write "Unlike downmix_to_stereo".

### AC-15 · Low · comment-inaccurate (`:2433-2434`)
- The comment says "langKey only trims and lowercases it". In fact langKey strips the region, maps English names to codes, and canonicalises through ICU (eng → en, pt-BR → pt).

**Refuted:** AC-02, "dormancy is armed by a language_stereo match". The behaviour is real, but it is documented in three places (`:49-50`, `:64-65`, `:74-76`, and the comment at `:2379-2381`), and `guard_original` is the documented protection. It is a design preference, not a defect.
## 4. sub_worker (v3.999.88)

`Community/Tdarr_Plugin_awk_sub_worker.js`. Checked and found correct:
- `escapeMoviePath` handles spaces, quotes, `,` `:` `[]` `;` `=` `\` `%` `$` and non-ASCII.
- `goneSinceImport` stops the language_sub/remove_sub_sdh re-import loop.
- extract → import restores language, title and every flag, including the collision escapes.
- The styled bundle round-trips with its font.

| ID | Sev | Verified | Summary |
|---|---|---|---|
| SW-01 | **High** | Confirmed ×2 | Pre-processing deletes library sidecars because their text is "already in the file", but on a later pass "the file" is the job's cache copy. If the job is rejected, the subtitle is gone everywhere |
| SW-02 | **High** | Confirmed ×2 | ffmpeg silently drops cues it cannot decode (cp1252/Latin-1 srt); the round-trip check matches the damaged track and the sidecar is deleted |
| SW-03 | Medium | Confirmed | `method_import_metadata=sidecar` + clean_and_remux `tag_title` swap a title forever: an infinite loop that Tdarr's identical-preset guard cannot catch |
| SW-06 | Medium | Confirmed | Flag tokens are case-sensitive: `Movie.en.Forced.srt` and `Movie.English.SDH.srt` are rejected |
| SW-07 | Medium | Confirmed | The caption strip `filter_units=remove_types=6` removes every SEI, including recovery points; open-GOP/intra-refresh files can no longer seek |
| SW-15 | Medium | Confirmed | A caption sidecar whose memo was lost is deleted and re-read; with remove_source=true the captions are destroyed |
| SW-16 | Medium | Confirmed (code) | Folder-to-folder libraries: sidecars land next to the SOURCE, while the stripped video goes to the output folder |
| SW-05 | Low | Confirmed | ffmpeg/ffprobe spawns use SIGTERM timeouts, which a blocked ffmpeg ignores; a FIFO at a bundle name hangs the worker |
| SW-08 | Low | Confirmed | A sibling video `Movie.s01.mkv` has its sidecars imported into `Movie.mkv` and then deleted |
| SW-09 | Low | Confirmed | `Movie.SDH.srt` imports with language "SDH" (Southern Kurdish); `Movie.und.hi.srt` is rejected, contrary to its comment |
| SW-10 | Low | Confirmed | Node Tag key can be any leading path, not "the FIRST folder"; unRAID users need `mnt/user/media=` |
| SW-11 | Low | Partial | deduplicate / remove_source / only_languages wording (normalised vs "byte-identical", etc.) |
| SW-12 | Low | Confirmed | text_file ignores only `# `/`#`, not every line starting with `#` |
| SW-13 | Low | Confirmed | The bundle grammar in Description `:14` and comment `:1928` puts flags after the language; the code puts them before |
| SW-14 | Low | Confirmed | Non-ASCII titles are percent-encoded (9 bytes per CJK char), so names are unreadable and titles truncate at ~25 chars |
| SW-17 | Low | Confirmed | seedSubtitleList leaks its temp dir on a write error; the remote existence probe waits 30 min per stream |
| K1 | Low | Partial | ccStripArg's `-bsf:v:N` index ignores staged covers (unmapped route only) |

SW-04 (missing Stage, and the two-stack setup) is merged into GRP-07. The caption probe on `v:0` is SH-03.

### SW-01 · High · data-loss: pre-processing deletes sidecars whose text exists only in this job's uncommitted cache file
- **Where:**
  - `:4162-4213`: the "nothing to mux" unlink at `:4196-4212`.
  - The promise in the comment at `:4163-4164`: "had its content in the file BEFORE this flow started, so it is in the accepted library copy however the flow ends".
  - The plugin's own rule that deletion must wait for acceptance: `:2883-2885` and the tooltip at `:142-144`.
- **What happens:**
  1. Pass 1 imports a sidecar into the job's cache file.
  2. Something then makes the embedded track's metadata differ from the sidecar name, so the group is not "settled". Four triggers reproduced:
     - clean_and_remux `language_fill` on an `und` sidecar;
     - clean_and_remux `tag_title=subtitle`;
     - `escMeta` turning `"` into `'` in a title (sub_worker alone, all defaults);
     - two byte-identical sidecars with different titles (all defaults).
  3. On the restarted pass, the content check reads the cache file, finds the text, and unlinks the library sidecar during PRE-processing. Nothing in that branch checks the marker or compares `file.file` with `originalLibraryFile`.
  4. If the job is rejected, a later plugin errors, or the job is cancelled, the cache is discarded and the subtitle exists nowhere.
- **Evidence:**
  - Verifier S1, sub_worker alone at defaults with `Movie.s2.Say %22Hi%22.eng.srt`: pass 2 logs "Deleted sidecar (its content is already in the file)". The library then holds only `Movie.mkv` with 0 subtitle streams.
  - After deleting the cache, `grep` for a line of the subtitle finds nothing.
  - When `_id` was instead set to the library path, the same case re-imported a duplicate track on every pass: 12 passes, 12 copies. Under either reading of Tdarr's `_id`, this branch is broken.
- **Fix:** in pre-processing, unlink only after proving the text is in `otherArguments.originalLibraryFile` (probe that file), or only when `file.file` is the library file. Otherwise add the sidecar to the marker and leave deletion to post-processing.

### SW-02 · High · data-loss: cues ffmpeg cannot decode vanish, and the sidecar is deleted as "safely embedded"
- **Where:**
  - sidecarRoundTripHash `:2495-2526`; deletionLoss `:2563-2565`; confirmedWhy `:2942-2943`.
  - import mux `:4231` (`-sub_charenc UTF-8`); extract `:3527`.
  - The claim "Import never drops a subtitle" (Description `:19`).
- **What happens:**
  - ffmpeg drops subtitle events it cannot decode ("Unable to recode subtitle event") and still exits 0. Non-UTF-8 srt (cp1252/Latin-1) is common. Malformed cues are mis-parsed instead: a `->` typo is merged, and `0:0:0.9` becomes 0.009 s.
  - The "round-trip" identity runs the sidecar through the same decoder, so it matches the damaged embedded track.
  - `importLosses` checks only styling, so `remove_source` (default true) deletes the sidecar.
  - Into **mp4** (mov_text), the cues are gone immediately.
  - Into **mkv**, the raw bytes are copied, but every ffmpeg reader drops them. A later `action=extract` (remove_source default) writes a short sidecar and strips the track. Extract never compares the sidecar with the stream.
- **Evidence:** a 4-cue cp1252 `Movie.fr.srt` ends with 2 cues anywhere on disk, in both mp4 and mkv. There is no TextDecoder/charset check anywhere in the file.
- **Fix:**
  - Validate UTF-8 (`new TextDecoder('utf-8', {fatal:true})`) before importing, and keep or transcode files that fail.
  - Compare the sidecar's own cue count and span with the round-trip output before trusting a match.
  - On extract, compare the decoded cue count with the stream's packet count before stripping.

### SW-03 · Medium · loop: method_import_metadata=sidecar erases titles, and fights clean_and_remux tag_title forever
- **Where:** `:4100-4123` (retune; compare `curTitle === (f.title || '')`); tooltip `:165-166`.
- **What happens:**
  - A sidecar name with no title token is treated as an order to clear the track's title. Language has an "und = no opinion" exception (`:4106-4110`); titles do not.
  - clean_and_remux `tag_title=subtitle` sets "SDH" on an untitled SDH track, and sub_worker clears it again.
  - The two presets alternate, so Tdarr's identical-arguments guard (which the comment at `:4178` relies on) never fires, and the stack never converges.
  - The embedded_cc staging sidecar (SDH, untitled) triggers it without any user-made sidecar.
- **Verified:** Confirmed independently. With the default `method_import_metadata=embedded` it converges.
- **Fix:** treat an empty title token like `und`: it may set a title, never erase one. Note in the tooltip that `sidecar` mode fights any plugin that edits subtitle titles.

### SW-06 · Medium · tooltip-inaccurate / bug: server-style flag tokens are matched case-sensitively
- **Where:** `:1709-1722` (DISP_TOKENS, lowercase), `:1994`, `:2015`; Description `:26-29`.
- **What happens:** these are all rejected with "Not a recognised sidecar name", although Plex, Jellyfin and Emby accept them and they are common in downloaded subtitles:
  - `Movie.en.Forced.srt`
  - `Movie.EN.FORCED.srt`
  - `Movie.English.SDH.srt`
  - `Movie.en.HI.srt`
- Nothing is deleted. The sidecar is just not imported.
- **Fix:** lowercase tokens for the DISP/EXTRA membership tests. Make the title-collision escape at `:1950` case-insensitive so a title "Forced" still round-trips.

### SW-07 · Medium · bug: the caption strip removes every H.264 SEI, recovery points included
- **Where:** `:3332-3336` (`filter_units=remove_types=6`); `:3105-3109` (ccStripAllowed checks only h264 and not HDR/DV); comment `:3327-3331` ("picture-lossless on H.264"); tooltip `:119-120`.
- **What happens:**
  - Pictures stay bit-identical.
  - On open-GOP or intra-refresh H.264, the stream loses the recovery-point SEI that marks random-access points. That is typical of broadcast and IPTV, which is exactly where captions come from.
  - `ffmpeg -ss 5` then decodes 0 frames: open-GOP mkv 75 → 0, ts 50 → 0, mp4 75 → 0; intra-refresh mkv 63 → 0.
  - The container key flags survive the strip pass itself, but collapse on the next `-c copy` remux, which the stack does routinely.
- **Verified:** Confirmed; the seek failure is broader than reported. It needs `embedded_cc=enabled`.
- **Fix:** strip only when every keyframe is an IDR (a cheap bounded ffprobe), otherwise defer to video_clean as the HDR case does. There is no off-the-shelf bsf in 6.1.1 that removes only the A53 payload.

### SW-15 · Medium · data-loss: a caption sidecar is deleted and re-read when its memo is missing
- **Where:** `:3164-3174` (judgeLocalCaptionSidecar).
- **What happens:**
  - A cue-bearing caption sidecar with no `decoded`/`decoded2` token on the file is unlinked and re-read.
  - The memo is lost when an outside tool drops global tags, or when the job that wrote it was rejected.
  - (a) This includes the visible extract deliverable `Movie.s0.und.sdh.srt`, which the user may have edited. Reproduced: the edit is lost.
  - (b) Found by the verifier: with remove_source=true, the bitstream copy was already stripped (memo `decoded,removed`). If that memo is lost, the next pass unlinks the sidecar *before* probing. The probe then finds no captions ("No embedded closed captions in this file"), and the only copy of the captions is destroyed.
- **Verified:** Confirmed; raised from Low to Medium. It needs `embedded_cc=enabled` plus an outside tool that drops the tag.
- **Fix:** never unlink a cue-bearing caption sidecar before the probe has shown the captions are still in the video. On the visible extract name, keep a newer file or rename it aside.

### SW-16 · Medium · option-interaction: Tdarr's output-folder mode
- **Where:** `:1403-1404`. `librarySettings` is never read; every sidecar path derives from `originalLibraryFile`.
- **What happens:**
  - In folder-to-folder mode the accepted transcode goes to the output tree.
  - So extract (with remove_source defaulting to true) writes sidecars beside the **source**, while the stripped video lands in the output folder.
  - A media server reading the output tree sees a video with no subtitles. Nothing is lost on disk.
- **Verified:** Confirmed by code; the docs are not reachable from here.
- **Fix:** refuse `extract` with `remove_source` when an output folder is configured, or place sidecars beside the output, and document it.

### SW-05 · Low · robustness: spawn timeouts use SIGTERM
- **Where:** spawnSync at `:1522`, `:1599`, `:2458`, `:2512`, `:2728`, `:2906`. The cover helper at `:857` uses SIGKILL, and its comment says why.
- **What happens:**
  - An ffmpeg blocked in an `open()`/`read()` ignores SIGTERM. Tested: a FIFO with a 2 s timeout returns only when the writer exits, after about 12-30 s; with SIGKILL it returns after about 2 s.
  - Concretely, `existingSidecarVerdict` (`:2580-2581`) opens a styled-bundle name without the regular-file check that loose sidecars get (`:2361`). A FIFO at `.<video>.sN.<lang>.styled.mks` therefore hangs the worker.
- **Fix:** `killSignal: 'SIGKILL'` on every ffmpeg/ffprobe spawnSync, and `lstat().isFile()` before readBundleSubtitle.

### SW-08 · Low · bug: sibling videos named `<base>.s<N>`
- `Movie.s01.s2.eng.srt` and even plain `Movie.s01.en.srt`, belonging to `Movie.s01.mkv`, are parsed as `Movie.mkv`'s own (`:1986-1988`). They are imported into it and then deleted by remove_source, so the sibling loses its subtitle.
- `Movie.Extended.en.srt` draws a ☒ on every pass, contrary to the comment at `:3910-3912`.

### SW-09 · Low · bug / comment-inaccurate
- `Movie.SDH.srt` imports with language `SDH`, which ICU reads as Southern Kurdish, and with no SDH flag. Lowercase `Movie.sdh.srt` is rejected instead, which is inconsistent.
- The comment at `:1876-1877` says the und rule stops `<video>.und.hi.srt` being read as SDH "instead of Hindi". In fact that name is rejected outright.

### SW-10 · Low · tooltip-unclear: method_unmapped Node Tag key (`:186-188`)
- The tooltip says the key is "the FIRST folder of the server's path". The code (`:2111-2118`) accepts any leading path, so `mnt/user/media=M:` works, which is exactly what an unRAID or NAS share needs.
- Following the tooltip (`mnt=M:`) maps to the wrong folder. The failure is loud.
- **Fix:** "one or more leading folders of the server's path", with an unRAID example.

### SW-11 · Low · tooltip-inaccurate (partially confirmed)
- "byte-identical" (tooltip `:81-82`, Description `:35`, log `:2622`): the match is on normalised text (BOM, CRLF and renumbering ignored, `:2331-2337`). The tooltip header itself describes that normalisation, so the tooltip contradicts itself.
- remove_source=false "nothing leaves the video on extract" (`:141`): with `enabled_checkmedia`, duplicates are still mapped out.
- only_languages "Limit both actions" (`:64`): checkmedia dedup and embedded_cc ignore the filter.

### SW-12 · Low · tooltip-inaccurate
- text_file: "lines starting with # ignored" (`:193`). The parser (`:2258`) ignores only `#` followed by whitespace or end of line, which is deliberate since a name can start with `#`.
- `#note` therefore draws a ☒ on every pass. Say "lines starting with `# `".

### SW-13 · Low · tooltip / comment-inaccurate
- The bundle grammar in Description `:14` and comment `:1928` is `…[.<title>].<lang>[.<flags>]…`. The code (`:1951-1954`) puts every non-server flag *before* the language.
- A hand-written name following the Description (`.Movie.s5.eng.original.styled.mks`) parses with language `original`.
- Use the grammar from `:22` in both places.

### SW-14 · Low · data-loss (title metadata)
- TITLE_SAFE (`:1854`) is ASCII-only, so a CJK character costs 9 bytes. A 43-character Japanese title becomes an unreadable 251-byte name, truncated to 26 characters.
- With `method_import_metadata=sidecar`, the embedded full title is then "retuned" down to the truncated one.
- **Fix:** allow non-ASCII letters (all three filesystems accept UTF-8 names), and never retune from a name extract truncated.

### SW-17 · Low · robustness
- seedSubtitleList returns without removing its mkdtemp dir when writeFileSync fails (`:2240`).
- The remote existence probe (`:1469-1471`) uses the 30-minute SIDECAR_SPAWN_TIMEOUT, against 600 s for the real download. A server that accepts the connection and never answers costs N × 30 min per pass.

### K1 · Low · bug: ccStripArg counts a staged cover track
- **Where:** `:3333-3336`; callers `:3610`, `:4275`; the cover drop is in commitPreset `:3037-3040`.
- **What happens:**
  - `-bsf:v:N` is computed excluding only removed subtitles and fonts.
  - commitPreset then maps out a mimetype-tagged cover track that sat ahead of the video. So the filter addresses a stream that does not exist, ffmpeg exits 0, the captions stay, and `awk_cc` records `removed`.
  - video_clean trusts that memo, so the captions end up in the file twice.
  - The comment at `:3322-3323` ("drops only subtitle/attachment streams") is stale since the latest commit.
  - In commitPreset's own comment, `:3031` ("Only subtitle streams - and, on a bundled extract, their font attachments - are ever added or dropped here") contradicts `:3033-3035` in the same block, which 996aca0 updated to list the Matroska cover drop.
- **Verified:** Partially confirmed (2 verifiers: Low and Medium). On the default mapped route, the strip pass comes later, after the cover has moved, and gets `v:0`.
  - It reproduces on the unmapped API route.
  - It also reproduces on an import that finds the staged caption sidecar while the cover is still ahead.
  - clean_and_remux first, as designed, removes covers anyway.
- **Side observation:** the caption sidecar name is tied to the video's stream index. When the cover moves, the mapped flow decodes again and leaves two sidecars.
- **Fix:** compute the position after `stageMatroskaCovers` has decided `leaveOut`, or exclude `leaveOut` in ccStripArg. Correct the two comments.
## 5. video_clean (v3.999.74)

`Community/Tdarr_Plugin_awk_video_clean.js`. Checked and found correct:
- The defaults really do nothing.
- guard_dv encodes carry `-dolbyvision:v:0 1 -strict unofficial` with tiered maxrate/bufsize.
- The guard_shrink_savings restore works end to end in mkv and mp4 over three passes.
- Both deinterlace repairs work and converge.
- hvc1 tagging is right, and covers are mapped out by absolute index.
- The method_speed mapping matches its tooltip.
- Every spawnSync has a timeout.
- The re-fitted memory tables reproduce their own quoted measurements.

| ID | Sev | Verified | Summary |
|---|---|---|---|
| VC-01 | **High** | Confirmed ×2 | Under shrink, changing ANY setting re-encodes every already-shrunk file, even when the change does nothing to it, and the second lossy generation is kept |
| VC-02 | Medium | Partial | libx265 caption drop relies on the build's `a53cc` default; on FFmpeg 6.0–7.0.x captions survive and `awk_cc=removed` is a false memo |
| VC-03 | Medium | Confirmed | Odd-dimension sources (MPEG-4 ASP, VP9, AV1) are never made even, so the plugin's CPU encoders (libx264/libx265/libsvtav1) refuse them and the file errors on every requeue |
| VC-04 | Medium | Partial | AV1 quality on av1_vaapi (no `-qp` at all) and av1_amf (0-255 qindex) is ignored or mis-scaled: near-lossless, huge files |
| VC-05 | Medium | Confirmed | guard_dv does NOT override strip_dynamic under hdr_cleanup_only, although both tooltips say it does |
| VC-06 | Medium | Confirmed | Portrait video is fitted into a landscape box, and its quality tier is keyed on the long side (1080x1920 → crf 25) |
| VC-18 | Medium | Confirmed | On a 6.x-based ffmpeg, a tonemapped mp4 keeps its HDR mastering metadata, so normalize re-tonemaps it every pass |
| VC-07 | Low | Partial | Every output drops cover art, including the "harmless" lossless strip (documented, but at odds with the siblings) |
| VC-09 | Low | Confirmed | An outside remux strips the mp4 fence, so hardware/SVT-AV1 shrink output is re-encoded on the next scan |
| VC-10 | Low | Confirmed | Quality fields: 52-63 silently clamped to 51 (log and fence say q55); decimals rounded; `0x10` accepted; 0 means something different per encoder |
| VC-11 | Low | Confirmed | guard_shrink_bitrate never reads the Matroska BPS tag and skips silently when the bitrate is unknown |
| VC-12 | Low | Partial | The tooltip says set the node to "any", but the code treats only `-`/empty as any |
| VC-13 | Low | Confirmed | VideoToolbox `-q:v` is refused on Intel Macs, so every VT test encode fails |
| VC-14 | Low | Confirmed | tonemap_sdr needs jellyfin-ffmpeg (`tonemapx`, `tonemap_cuda` …); on a stock ffmpeg the whole feature fails |
| VC-15 | Low | Partial | idet 20% threshold + no parity check: false positives on synthetic content only; real content read 0% |
| VC-16 | Low | Partial | Small tooltip gaps: "best encoder" vs "fixed order"; "inert" inputs still error when malformed; the 168 h maximum is undocumented |
| VC-17 | Low | Partial | `-thread_type slice` slows single-slice H.264 decode; no measurable cost at the default speed=slow |
| K5 | Medium | Confirmed | detectInterlace has no `-map`, so it can analyse a cover-art track instead of the video |

### VC-01 · High · generational loss: under shrink, any settings change re-encodes every shrunk file
- **Where:**
  - `:4081-4083` (videoSigCore builds the fence from *settings*: `deint`, `sdr`/`strip`, `h<N>`, bit depth);
  - `:4383` (fenceMatches is a whole-string compare);
  - `:4427` (the implicit x26x fence is consulted only when `priorSig === ''` or the fence is stale);
  - `:3379-3381` (shrink always has a same-codec trigger).
- **What happens:**
  - Take a library already shrunk to HEVC and change one setting: `deinterlace=enabled`, `hdr_mode=strip_dynamic`/`tonemap_sdr`, `downscale=1080`/`2160`, or `method_bitdepth=10`.
  - Every file is re-encoded, even where the transform does nothing: progressive video, SDR video, video already inside the box.
  - guard_shrink_savings (default 1%) keeps the second generation, because a re-encode of a re-encode is usually at least 1% smaller.
  - This contradicts the deinterlace tooltip (`:89-90`, "already-progressive video are unaffected, so on a mixed library this touches only a small slice") and method_bitdepth (`:174`, "never causes one by itself").
  - Carrying a fence from other settings is worse than carrying none: the same file with *no* awk_video tag is skipped by the implicit x265-crf check.
- **Evidence:** progressive 720p shrunk to x265 q22 (19.8% saving).
  - Job B with only `deinterlace=enabled` logs "No combing found (0% combed frames) - nothing to repair", then "[shrink] Transcoding video @ libx265 q22".
  - The next pass logs "2.1% smaller … keeping it".
  - PSNR against the source drops from 45.14 to 44.05 dB.
- **Fix:**
  - Build the fence from the transforms that *apply to this file*: no `deint` when idet reads progressive, no `sdr`/`strip` on SDR, no `h<N>` when already inside the box. Alternatively, match token by token with those exemptions.
  - Also let the implicit fence apply when the stored fence differs only in no-op tokens.

### VC-02 · Medium · bug (build-dependent): libx265 caption removal relies on the build default
- **Where:** `:1369`, `:1383` (A53_CAP `hevc.cpu = 'optin'`), `:2503-2506` (`-a53cc 1` is emitted only when keeping; nothing is emitted on a drop), `:4019-4025` ("the output provably carries no captions" → `strip` rewritten to `removed`).
- **What happens:**
  - The libx265 `a53cc` default is 1 in FFmpeg n6.0–n7.0.2 and 0 in n7.1+ (checked in the upstream source).
  - On a 6.0–7.0.x build (e.g. Ubuntu 24.04's 6.1.1, or an older jellyfin 6/7.0), a sub_worker-exported file is re-encoded with its captions still in the bitstream.
  - The log says "Dropping the embedded closed captions", and `awk_cc=removed` becomes a false memo that later passes trust. Viewers see the captions twice.
- **Evidence:** reproduced on 6.1.1: A53 on 60/60 output frames; 0/60 with an explicit `-a53cc 0`.
- **Verification correction:** the "High on any non-jellyfin ffmpeg" framing was wrong. 7.1+ stock builds behave as the table assumes.
- **Fix:** always emit an explicit `-a53cc 0` or `-a53cc 1` on every encoder that has the option (libx264, libx265, nvenc, h264_qsv).

### VC-03 · Medium · bug: odd frame dimensions are never made even
- **Where:** `:2457` (a scale filter only when `willDownscale`), `:2489`.
- **What happens:**
  - A source with an odd width or height is sent to the encoder at its own size whenever no downscale fires. libx265, libx264 and libsvtav1 all refuse 4:2:0 at odd sizes ("Picture height must be an integer multiple of the specified chroma subsampling").
  - The test encode and its retry fail, and the file errors with "no encoder on this node could encode this file" on every requeue. This also happens when a downscale box is set that the file already fits.
  - H.264/HEVC sources cannot have odd 4:2:0 sizes, so this affects MPEG-4 ASP (Xvid/DivX: 640x267, 720x407), VP9, AV1 and similar sources.
- **Fix:** when either dimension is odd, add `scale=trunc(iw/2)*2:trunc(ih/2)*2` (or `crop`) in both the preset and the test encode.

### VC-04 · Medium · bug / comment-inaccurate: AV1 quality on VAAPI and AMF
- **Where:** comment `:2025-2028` ("An AV1 target goes 0-63 on every AV1 encoder"); emit `:2035-2036`.
- **What happens:**
  - av1_vaapi has no `qp` option, in 6.1.1 and in the 7.1 source. `-rc_mode CQP -qp 31` is ignored with only a warning, and rc_quality falls back to `default_quality = 25` on a 0-255 qindex scale. The encode runs near-lossless, and the test encode does not catch it.
  - av1_amf's `qp_i`/`qp_p` take a −1–255 qindex (so 31 is near-lossless), and it has no `qp_b` option at all.
  - av1_qsv ICQ clips `global_quality` to 1-51, so 52-63 is also wrong for qsv.
  - guard_shrink_savings is shrink-only, so a normalize run with `codec=av1` on AMD vaapi/amf silently writes a much larger file.
- **Verification correction:** av1_nvenc `-cq` is 0-63 in 7.1, so the comment is right for nvenc on the target build.
- **Evidence:** PLAUSIBLE for the impact; verified from the encoder option lists and source. No AMD hardware was available.
- **Fix:** map AV1 quality per encoder (av1_vaapi via `-global_quality <qindex>`, av1_amf to a qindex of roughly q×4, qsv clamp) and measure them as the h264/hevc rows were measured.

### VC-05 · Medium · tooltip-inaccurate: guard_dv and strip_dynamic under the default action
- **Where:** tooltips `:125` ("Overridden per file by guard_dv, which preserves the DV instead") and `:266-268` (guard_dv=enabled "overrides hdr_mode=strip_dynamic"); code `:3200` (`guardDvLive = guardDv && action !== 'hdr_cleanup_only'`), `:3161-3172`.
- **What happens:**
  - Under hdr_cleanup_only (the default action) with guard_dv=enabled (the default), `strip_dynamic` strips the DV RPU losslessly: "Stripping Dolby Vision Profile 8.1 losslessly".
  - Under normalize/shrink, the same request is refused ("guard_dv keeps the Dolby Vision instead").
  - The code comment at `:3197-3199` shows this is intended, so only the tooltips are wrong.
- **Fix:** say in both tooltips that guard_dv does not apply under hdr_cleanup_only, where a strip is always honoured.

### VC-06 · Medium · bug / tooltip-unclear: portrait video
- **Where:** `:3185-3189`, `:3317-3334`; tooltips `:100-106`, `:140-164`.
- **What happens:**
  - With `downscale=1080`, a 1080x1920 phone clip, which most people call "1080p", becomes 608x1080, a 3.2× pixel cut. A portrait 4K clip lands there too.
  - With no downscale, the quality tier is keyed on the displayed height. A portrait 1080p clip gets quality_4k (crf 25 instead of 23), and a portrait 720p clip gets crf 25 instead of 22.
  - The downscale half is deliberate (the comment at `:3181` names this case) and matches the tooltip literally. The tier half contradicts the tooltip's "height > 1080, i.e. 1440p/4K".
- **Fix:** pick the tier from the shorter side or the pixel count, and fit portrait sources to the transposed box, or say plainly that portrait is fitted into a landscape frame.

### VC-18 · Medium · loop (build-dependent): tonemap → mp4 → re-tonemap
- **Where:** `:4010-4013` (normalize writes no fence in mp4), `:1056` (isHdrVideo accepts any mediaInfo HDR_Format); comments `:652-653`, `:4141` ("no real tonemap encode has yet been read as SDR on both probes").
- **What happens:**
  - On FFmpeg 6.0/6.1, the CLI copies the input's mastering-display and CLL side data onto the encoded output. A bt709 tonemapped mp4 therefore still carries MDCV/CLL, and MediaInfo reports `HDR_Format: SMPTE ST 2086`.
  - normalize on mp4 then tonemaps again on the next pass, stamping `setparams=color_trc=smpte2084` onto SDR frames. The colour is corrupted each pass, and it loops.
  - In mkv, the fence stops it.
- **Verified:** Confirmed by the verifier on 6.0/6.1 with container-level mastering metadata, and raised from Low to Medium.
  - FFmpeg 7.1 (the jellyfin 7.1.4 base) copies side data only on stream copy, and jellyfin's tonemap filters strip MDCV/CLL when the target is not PQ, so the target build likely does not trigger it.
  - jellyfin-ffmpeg 6.0.1-8 (which has tonemapx) would.
- **Fix:** write a fence for normalize when tonemap ran, or strip mastering metadata explicitly on a tonemap encode (`-bsf:v` / side-data removal), and treat bt709 output as SDR whatever HDR_Format says.

### VC-07 · Low · option-interaction: every output drops cover art
- `outputDrops` (`:3022-3024`) is applied on every output path: the lossless strip `:3100`, the encode `:4015`, the awk_vq tag remux `:4215` and the restore `:4359`.
- The Description (`:8`) does say covers are dropped, and in the designed stack clean_and_remux has already removed them. So this is policy inconsistency (GRP-09), not a hidden loss.
- The hdr_cleanup_only text ("harmless", "A safe do-nothing default", `:32-34`) does not mention that a strip_dynamic strip also removes the cover, which is a small omission. "only hdr_mode is live" is about which inputs act, and is not contradicted.

### VC-09 · Low · generational loss across scans: outside tools strip the mp4 fence
- Inside the suite the mp4 fence survives (mp4TagPlan). A plain `ffmpeg -map 0 -c copy` removes `awk_video`/`awk_vq`.
- The implicit fence (`:4427-4436`) recognises only an x264/x265 settings line in mediaInfo. So NVENC/QSV/VAAPI/AMF/VideoToolbox/SVT-AV1 shrink output in mp4 is re-encoded once per outside remux, and guard_shrink_savings usually keeps it (27% here).
- A code comment admits the limit; no tooltip does.
- The stream-level `encoder` tag (e.g. `Lavc60.31.102 libx265`) survived the plain remux and could serve as a second, free check.

### VC-10 · Low · validation: quality fields
- **Where:** parseQuality `:2859-2864`; nativeQuality `:2025-2029`; log `:4061`, fence `:4081`.
- **What happens:**
  - Accepted range is 0-63 for every codec. HEVC/H.264 silently clamp at 51, while the log and fence say "q55". Under shrink, q55 and q60 give different fences but the same `-crf 51`, so switching between them re-encodes at identical settings.
  - Decimals are rounded (23.5 → 24), and hex and exponent strings are accepted (`0x10` → 16).
  - 0 means something different on each encoder: NVENC `-cq 0` = automatic; QSV leaves ICQ; VAAPI = no explicit QP.
- **Fix:** accept `^\d+(\.\d+)?$` within each codec's real range, and log the effective value.

### VC-11 · Low · robustness: guard_shrink_bitrate's bitrate source
- `:3396-3400` reads only `resolveStreamBitrate` (ffprobe bit_rate, then mediaInfo) and never the Matroska `BPS` tag. When the bitrate is unknown the guard is skipped without a word.
- With mediaInfo present, a BPS-tagged mkv is guarded correctly (MediaInfo's BitRate is the BPS tag). The realistic gap is an mkv with no statistics tags.
- guard_shrink_savings reverts an encode that grew, so the cost is a wasted encode.
- **Fix:** fall back to BPS, and log when the bitrate is unknown.

### VC-12 · Low · tooltip-unclear: "any" node hardware type
- The tooltip (`:198`, `:203`, `:208`) and the comment at `:1495` say a node set to "any" tests every family. The code (`:1504-1505`) treats only `''` or `'-'` as unpinned; a literal `any` reads as an unsupported type (CPU under node, an error under node_strict).
- Tdarr's own Worker Type flow plugin treats `'-'` as unset, so "any" may just be the UI label. Unproven on a real node.
- **Fix:** accept `any`/`auto` as well, or name the actual value in the tooltip.

### VC-13 · Low · robustness: VideoToolbox on Intel Macs
- nativeQuality (`:2037`) gives VideoToolbox `-q:v`. videotoolboxenc rejects QSCALE unless built for ARM64 macOS (checked in release/7.1 and master; no jellyfin patch touches it).
- On an Intel Mac GPU worker, every file therefore runs a failing VT test encode plus a retry and drops to the CPU. Under node_strict it errors.
- **Fix:** on darwin/x64 use a bitrate target for VT, or skip VT.

### VC-14 · Low · tooltip-unclear (build-dependent): tonemap_sdr needs jellyfin-ffmpeg
- The CPU fallback `tonemapx` (`:2438`) exists only in jellyfin-ffmpeg. The GPU islands also need jellyfin filters: stock ffmpeg has no `tonemap_cuda`/`tonemap_videotoolbox`, and stock `tonemap_opencl` has no bt2390.
- On a node pointed at a stock ffmpeg, the whole tonemap_sdr feature fails ("No such filter: 'tonemapx'"), not just the fallback.
- **Fix:** probe the filter once per node and refuse with a clear message, or say in the tooltip that jellyfin-ffmpeg (Tdarr's bundled build) is required.

### VC-15 · Low · robustness: idet threshold (partially confirmed)
- detectInterlace calls a file interlaced at 20% combed Multi-frame detections (`:2534`, `:2577`), with no parity-dominance check (`:2583`).
- A synthetic testsrc2 pattern reads 87% combed and gets `bwdif send_field`, which doubles the fps.
- Real progressive samples (Big Buck Bunny 360p, low-bitrate animation, live action) all read 0%. Real-world impact is unproven. A parity-consistency check would still be cheap insurance.

### VC-16 · Low · tooltip-unclear (partially confirmed)
- The Name and Description say "best encoder"; method_encoder says the order is "fixed per platform, not ranked by quality".
- hdr_cleanup_only calls quality and similar inputs "inert", yet every numeric field is range-checked before any action branch (`:2859-2891`). A malformed value therefore errors every file. That is deliberate per `:2875-2876`, but not stated in the tooltips.
- guard_encode_hours does not state its 168 h maximum (`ENCODE_CAP_MAX_HOURS`, `:1643`).

### VC-17 · Low · performance note (partially confirmed)
- Every CPU encode from h264/hevc/vp9 gets an input-side `-thread_type slice` (`:2510-2515`, `:3783`) for memory reasons.
- On single-slice H.264 that serialises the decode. x265's WPP streams still slice-thread, at about 1.9× a single thread.
- There is no measurable cost at the default `method_speed=slow`. It only matters for fast encodes from 4K sources. Mention the trade-off in the comment.

### K5 · Medium · bug: detectInterlace lets ffmpeg pick the stream
- **Where:** `:2556-2561` (argv `-i <file> -frames:v 400 -vf idet …` with no `-map`); the caller at `:3228-3238` passes `file.file` and `startSec`, not `primary.index`.
- **What happens:**
  - ffmpeg scores each video stream by width×height, plus bonuses for new packets and the default flag.
  - A mimetype-tagged cover written as a plain video track (what a plain `-map 0 -c copy` remux of an mkv attachment produces) can outscore the real video and be the stream idet reads.
  - Reproduced with an interlaced 720x480 h264 mkv plus a cover image, under `deinterlace=enabled`:
    - on a 10 s file, idet decodes the single cover frame and logs "No combing found (0%)", so combed video is encoded unrepaired and fenced;
    - in other layouts it fails with "Could not read an interlace verdict".
- **Scope:** clean_and_remux first removes covers, so the risk is in stacks without it.
- **Fix:** add `-map 0:<primary.index>` to the idet argv.

**Refuted:** VC-08. The claim was that the lossless strip forces `hvc1` onto HEVC with no parameter-set arrays and writes an unreadable file. In fact the strip always runs a CBS bitstream filter (dovi_rpu / hevc_metadata), whose init rewrites the extradata. movenc then builds a full hvcC from the in-band parameter sets, so the ≤23-byte hvcC condition cannot arise on that path.
## 6. stream_ordering (v4.999.50)

`Community/Tdarr_Plugin_awk_stream_ordering.js`. Checked and found correct:
- The order_language worked example (`eng 5.1, eng 2.0, jpn 5.1, jpn 2.0, ger 2.0, fre 2.0`) reproduces in mkv and mp4.
- The channel and quality caps, forced-first and subtitle_first behave as their tooltips say.
- The sort is stable.
- Output indices (`-metadata:s:N`, `-disposition:a:N`) are right.
- autoDefaultPin works.
- The moov box walk is right.
- Matroska covers are re-attached.
- Five test files converged through the full five-plugin stack in both mkv and mp4 libraries.
- The plugin spawns no ffprobe.

| ID | Sev | Verified | Summary |
|---|---|---|---|
| SO-01 | **High** | Confirmed ×2 | A healthy MPEG-TS with a forward PTS jump is failed as "truncated" on every retry, with default settings |
| SO-02 | Medium | Partial | Language outranks role: a commentary/AD in a listed language becomes the default audio over another language's main track |
| SO-03 | Medium | Confirmed | A .mov loses its cover art to a faststart-only remux, with all defaults |
| SO-04 | Medium | Confirmed | `remove_junk_tags=descriptive` strips artist/album/track/date from .m4a/.mka music |
| SO-05 | Medium | Confirmed | order_codec: spellings from the log line (`pcm_s24le`, `wmav2`, `aac_latm`) never match; typos are silently ignored |
| SO-06 | Low | Partial | "keeps its original position relative to the others" is misleading |
| SO-07 | Low | Confirmed | remove_junk_tags forces its own remux, not only "rides the reorder remux" |
| SO-08 | Low | Confirmed | faststart `strip` never strips anything by itself; "mp4 and mov only" also covers m4v/m4a |
| SO-10 | Low | Partial | The `<=1024k` cap also demotes lossy full-rate DTS and PCM |
| SO-11 | Low | Confirmed | The 1% truncation tolerance has no absolute floor: a 2 s mp4 fails the plugin's own remux |
| SO-12 | Low | Partial | The "always on" duration check is skipped for every early-return file and silently when no original exists |
| SO-13 | Low | Confirmed | The ts/avi "cannot store a default-track flag" ☒ prints every pass; wrong for .3gp/.3g2, which can |
| SO-14 | Low | Partial | order_language's `Example:` line holds prose rather than a value |

SO-09 (faststart costs an extra remux after every sibling mp4 remux) is merged into GRP-10.

### SO-01 · High · bug / loop: healthy MPEG-TS recordings with a timestamp jump are failed as truncated, forever
- **Where:** `:1639-1730` (the truncation verdict); the comment at `:1653-1656`; the awk_recovered exemption at `:1708-1709`; clean_and_remux's stamp, written only `if (convert === true && recoverRequested)` (`clean_and_remux.js:3316-3323`).
- **What happens:**
  - A broadcast or IPTV capture with a forward PTS jump (signal loss, channel splice) probes as much longer than its content: 140 s for 40 s of video.
  - clean_and_remux's container-forced TS→mkv remux, which is on by default, produces a correct 40 s mkv with every packet. ffmpeg's own MPEG-TS discontinuity correction closes the gap.
  - The other plugins skip. stream_ordering then compares 40 s against the library original's 140 s and fails the file: "output duration 40.0 s is 28.6% … check this node's log for an out-of-memory kill".
  - That repeats on every retry, because the original never changes.
  - The "repaired in the same job" exemption does not apply. clean_and_remux stamps `awk_recovered` only for explicit recover_bad_* runs, never for its forced TS/PS/AVI fix.
  - The comment at `:1654` allows only for the opposite case ("under-reports its own length").
- **Corrections from verification:**
  - `+genpts` is not the cause: a plain `-c copy` gives the same result.
  - It needs a jump larger than ffmpeg's ~10 s `dts_delta_threshold` (an 8 s jump survives), and the jump must exceed 1% of the length.
  - AVI is not affected; TS and PS are.
  - With MediaInfo attached it fails the same way.
  - Workaround: `recover_bad_timestamps=light` makes clean_and_remux stamp the file, and stream_ordering then warns and accepts.
- **Fix:**
  - Have clean_and_remux stamp its container-forced timestamp repair too (e.g. `awk_recovered=ts-forced`), so the existing exemption applies.
  - At minimum, name the timestamp-discontinuity cause and the recover_bad_timestamps workaround in the failure text rather than "out-of-memory kill".
  - Correct the comment.

### SO-02 · Medium · bug: a commentary or audio-description track can become the sole default audio
- **Where:** `:1787-1806` (compareAudioKeys: `langRank` before `audioRoleRank`), `:1891-1899`, `:2012-2027` (sole default); shared comment `:427-431` ("stream_ordering never ranks one above a main track").
- **What happens:**
  - Example: a Japanese film with `jpn flac [default, original]`, plus English "Commentary" and "Audio Description" tracks, run with `order_language=eng`.
  - The AD comes first, and the preset makes it the sole default (`-disposition:a:0 +default … -disposition:a:2 -default`). Players auto-select the description track.
  - With `audio_first=original_tagged`, an English commentary whose title says "original" can lead in the same way, if order_language ranks its language above the original's.
- **Verification corrections:**
  - Language-before-role is documented (Description `:10-11`), so this is a design whose consequence is not spelled out, not a hidden bug. Hence Medium.
  - It needs a non-default `order_language` and a file where the listed language has only secondary tracks.
  - The shared comment at `:431` is false.
- **Fix:** give secondary tracks the "unlisted" language rank, or never let a secondary track be the sole default when a main track exists. Then correct the comment.

### SO-03 · Medium · data-loss: a .mov loses its cover to a faststart-only remux
- **Where:** `:2104-2106`, `:2120`; shared `mp4CoversLost` (`:581-584`, returns every cover for mov); Description `:9-10`, `:18`.
- **What happens:**
  - A .mov with a covr cover, its moov at the end, and nothing to reorder is remuxed only for the default `method_mp4_faststart=force`.
  - The mov muxer cannot write the cover back, so the plugin knowingly drops it and logs a ☒ after the fact.
  - With `strip`, the same file is skipped and keeps its cover.
  - The latest commit message documents this, but neither the faststart tooltip (`:178-188`) nor the Description does: Description `:9-10` lists only mp4/m4v/m4a covers, and nothing warns that a .mov cover is dropped. (The "keeps it untouched" sentence at `:18` is about Matroska covers.)
- **Fix:** do not let faststart (or junk stripping) alone remux a .mov that carries a cover. Skip and say so, or at least document it in the tooltip.

### SO-04 · Medium · option-interaction: remove_junk_tags=descriptive on music files
- **Where:** `:1567-1568` (AUDIO_ORDERED lets .m4a/.mka through); `:1929-1936` (JUNK_DESCRIPTIVE); `:2055-2064`, `:2120`; tooltip `:160-168`.
- **What happens:**
  - Audio-only .m4a/.mka files are processed as of this rc.
  - `descriptive` strips their artist, album, album_artist, composer, track, disc, date and genre, which is the music library's whole tagging.
  - It forces a remux on its own. Like any m4a remux, that remux also turns `major_brand` from `M4A ` into `isom`, which is documented at `:988-990`.
  - The tooltip lists those keys, but frames them as "movie and TV metadata" and warns only about media servers reading mp4 movie tags.
- **Fix:** keep music keys when `fileMedium === 'audio'`, and say in the tooltip that audio-only files are affected.

### SO-05 · Medium · tooltip-inaccurate / validation: order_codec spellings
- **Where:** tooltip `:91-93`; matching `:1762-1764`, `:1863`; the comment at `:1760-1761` makes the same claim ("a codec copied from the log matches"); display fallback `:530`.
- **What happens:**
  - The tooltip says the spelling printed on the Input streams log line works. For aliased codecs the log prints the raw codec_name (`pcm_s24le`, `wmav2`, `aac_latm`, `adpcm_*`, `dsd_*`).
  - Matching is `canon.startsWith(token)` against the folded key (`pcm`, `wma`, `aac`), so those spellings can never match.
  - Typos (`DTS-HD MA`, `dts-hd`, `e-ac-3`, `ddp`) are silently inert, with no log line. That is deliberate per the comment at `:1529`, so logging them is a suggestion, not a defect.
  - Prefix behaviour is otherwise as documented: `ac3` does not match eac3, `dts` matches DTS-HD MA.
- **Fix:** run each token through `foldCodecAlias` (plus dca → dts) and log one ☐ line naming entries that match nothing.

### SO-06 · Low · tooltip-unclear (`:78-79`)
- "A language not in the list … keeps its original position relative to the others" can be read as "unlisted tracks are never moved among themselves".
- In fact all unlisted languages share one rank and are sorted by role, codec, channels and quality; only full ties keep source order.
- The first half of the same sentence already says so. The verifier judged the clause ambiguous rather than false.

### SO-07 · Low · tooltip-inaccurate (`:152-153`, Description `:14-15`)
- The tooltip says remove_junk_tags strips the tags "riding this plugin's reorder remux so no extra pass is needed", and the Description says "rides the reorder remux, so no extra pass". In fact a non-empty junk list is its own reason to remux (`:2120`).
- Any ffmpeg-made mkv carries per-stream `ENCODER` tags, so an in-order file is remuxed once just to strip them. It converges.
- Use the faststart tooltip's wording.

### SO-08 · Low · tooltip-unclear (`:176-188`)
- "strip: actively REMOVE faststart - it does not simply leave the file alone": strip never triggers a remux, so a front-loaded, in-order mp4 stays front-loaded. It only leaves `+faststart` off remuxes made for other reasons.
- "mp4 and mov only" also leaves out m4v and m4a, which are handled.

### SO-10 · Low · tooltip-unclear (`:135-136`)
- "descending <=1024k" names TrueHD and DTS-HD MA. Lossy full-rate DTS (1509k) is demoted too; PCM fits "lossless-scale".
- The reviewer's second point is refuted: ffprobe does report a bitrate for DTS and AC-3 in mkv, so mkv and mp4 behave alike.

### SO-11 · Low · robustness (`:1658`, `:1716-1717`)
- The 1% tolerance has no absolute floor.
- On an mp4 with a 21 ms video start offset, every `-c copy` remux flips the video duration between 2.000 and 1.979 s. For a 2 s file, the plugin's own reorder therefore fails on the next pass.
- The message is self-contradictory: "2.0 s is 99.0% of 2.0 s".
- Only files shorter than about 2.1 s are affected.
- **Fix:** require both a percentage and an absolute shortfall (e.g. more than 1% and more than 1-2 s), and print more decimals.

### SO-12 · Low · tooltip-inaccurate (Description `:18-23`)
- The duration check is "always on and has no setting", but it sits after every `return skip(...)` (`:1568-1580`):
  - non-video files;
  - audio-only files other than mka/m4a;
  - an .mka with a cover;
  - an .m4a with a non-cover video stream;
  - extensions with no muxer.
- It is also skipped with no log line when `originalLibraryFile` is missing (`:1677`).
- The reviewer's impact example is wrong: no awk plugin re-encodes .flac/.mp3. Most of these are files no awk plugin transcodes.
- The one real in-stack gap is an audio-medium .m4a with a non-cover video track: audio_clean processes it, but stream_ordering skips it before the check. The rest matter only for third-party plugins in the stack.

### SO-13 · Low · log noise
- On ts/avi, "☒ … cannot store a default-track flag" prints on every pass of every file with audio, single-track files included. The comment at `:2112-2116` accepts the per-pass repeat.
- The line is wrong for .3gp/.3g2, which use the mov muxer and do store the flag. The sole-default normalisation is skipped for them too: `canPersistDefault` (`:1972`) does not include them.

### SO-14 · Low · tooltip-unclear (`:80`)
- order_language's `\\nExample:` line holds prose ("with order_channel descending and …"). The repo's `Example:\\n<value>` convention, used about 256 times, puts a value there.
- Use `\\nExample:\\neng,jpn` and put the worked layout on its own line.
## 7. Refuted or withdrawn during verification

These came up during review. Independent verifiers then showed them to be wrong or intended. They are listed so nobody re-raises them.

| ID | Claim | Why it was dropped |
|---|---|---|
| AC-02 | audio_clean "dormancy" is switched off by a language_stereo match, so a dub-only file loses its original | The behaviour is real but documented in three places (`audio_clean.js:49-50`, `:64-65`, `:74-76`) and the comment at `:2379-2381`; `guard_original` is the documented protection. Design preference, not a defect. |
| IN-17 | sub_worker's comment wrongly says Tdarr reads `ffmpegMode`/`handbrakeMode` | The repo's own classic-plugin consumer (`FlowPluginsTs/.../runClassicTranscodePlugin`, `FlowHelpers/1.0.0/classicPlugins.ts`) copies `FFmpegMode` → `ffmpegMode` under "Backwards compatibility" and branches on the lowercase names. The comment is right. |
| SO-10 (part 2) | Without mediaInfo, lossy mkv audio has no bitrate, so the cap misses it | ffprobe does report `bit_rate` for DTS/AC-3 in Matroska. Only AAC/Opus/Vorbis lack one, and those never exceed 1024k. |
| SO-12 (impact) | A truncated audio_clean re-encode of a .flac/.mp3 is never caught | No awk plugin processes .flac/.mp3 (audio_clean has the same gate), so it cannot happen inside the suite. |
| CR-17 (part 2) | The recovery stamp being permanent across light → disabled → light is a tooltip error | "Only when" states a necessary condition; re-running the same recovery mode is pointless by design. |
| VC-08 | video_clean's lossless strip forces `hvc1` onto an HEVC with no parameter-set arrays (the case its restore path guards against) | The strip always runs a CBS bitstream filter, whose init rewrites the extradata; movenc then builds a full hvcC from the in-band parameter sets, so the ≤23-byte condition cannot arise there. |
| IN-13 (harm) | `hvc1` forced onto an HEVC with no in-band parameter-set arrays writes an unreadable file in clean_and_remux | A non-DV `hev1` with `extradata_size=23` retagged `hvc1` probes and decodes cleanly on 6.1.1, and clean_and_remux already excludes DV. Kept only as a maintainability note (GRP-13). |

## 8. What looks good

The reviewers noted the following. Each point came from at least one reviewer, and several from more than one.

- **Consistent shared code.** All 46 SHARED blocks are byte-identical across their carriers, and every header's plugin list is exact.
- **Index bookkeeping holds up.** Input vs output and per-type vs absolute indices stayed correct in every heavy combination tried: audio_clean removing, appending and transcoding in one run; stream_ordering's absolute/audio-relative/per-video specifiers; video_clean's `-c:v:0`/`-filter:v:0`.
- **Convergence is mostly excellent.** The defaults, and "every option on into mkv", settle in one pass. Nine simulated stacks converged without ping-pong, including reversed order and mixed mkv/mp4. The loops found (CR-01, SW-03, VC-18) need specific non-default combinations or builds. The exception is SO-01: a repeated failure rather than a ping-pong, and it happens at defaults on TS/PS captures with a timestamp jump.
- **Validation is strict.** Junk, comma-joined, special-code and case variants of language inputs fail clearly. Every dropdown is checked against one table.
- **Fail-safe direction is deliberate.** Deletion fails closed, a skip fails open, and unknown remote state is never overwritten. Temp dirs are private (mkdtemp), the API key stays off argv, symlinks are refused, untrusted text goes through `logSafe`, and every spawnSync has a timeout (but see SW-05).
- **The logs explain themselves.** Nearly every branch says why it fired and which setting to change.
- **Measured claims hold.** Container and muxer claims re-tested on 6.1.1 matched: ttml/stpp, dvd_subtitle as mp4s, per-stream tag loss in mp4, covr/mdta behaviour, the disposition-storage matrix, the MP4_UNMUXABLE rows, and video_clean's memory tables (no unit errors).
- **Careful video handling.** video_clean's per-file test encode, its decode check that separates a bad source from a bad encoder, the guard_shrink_savings restore path and the HDR/DV layer handling are all unusually careful.

## Appendix A: cross-plugin contract inventory

All of these are global container tags unless noted, and all are read case-insensitively. Matroska keeps them all. The mp4 family keeps a global marker only under `-movflags use_metadata_tags` (cost: GRP-03), and per-stream custom tags are lost in mp4 even with that flag.

| tag | written by | read by | when missing or stale |
|---|---|---|---|
| `awk_recovered` | clean_and_remux (explicit recover_bad_* only; *not* its forced TS/PS/AVI fix, see SO-01) | clean_and_remux (idempotence), stream_ordering (softens the truncation verdict), video_clean (exempts the job from the shrink-savings restore) | recovery re-runs; stream_ordering fails a legitimately shorter file |
| `awk_cc` (comma list: strip / removed / none / decoded / decoded2 / imported) | sub_worker; video_clean rewrites strip → removed | video_clean, clean_and_remux, sub_worker | sub_worker re-decodes and video_clean probes on its own; a false `removed` (K1, VC-02) leaves captions in twice |
| `awk_sub_worker` (sidecar paths + hashes) | sub_worker | sub_worker (pre and post) | re-import, which dedup turns into a skip; the post stage deletes nothing |
| `awk_video` (fence) / `awk_vq` (size verdict) | video_clean | video_clean | one more encode at the same settings (VC-01, VC-09) |
| `awk_loudnorm` (per-stream) | audio_clean, Matroska only | audio_clean | mp4: re-measured on every stack cycle (disclosed) |
| ffmpeg `default` disposition | stream_ordering (audio only); ffmpeg auto-sets it on other plugins' remuxes | stream_ordering `*_first=default_tagged` | subtitle defaults have no owner (GRP-02) |
| language tags | clean_and_remux (fill and standardise), sub_worker (import, dedup survivor), audio_clean (tracks it creates) | all | untagged counts as `und` everywhere, so order matters (GRP-04); the mkv form differs between writers (CR-05) |
| mp4 track title (`udta/name`) | every plugin's mp4 mux | mediaInfo only (ffprobe cannot read it) | lost on every mp4 remux (GRP-01) |

## Appendix B: how this review was run

- **Target:** branch `rc` @ `996aca0` (2026-10-24). The five files `Community/Tdarr_Plugin_awk_*.js` total 18,344 lines. rc is 179 commits ahead of `master` (bb7c9e7).
- **Passes:**
  1. A whole-file correctness pass over all five plugins (the K-series findings).
  2. Five per-plugin reviewers. Each was told to check every input's tooltip against the code, verify the comments rather than trust them, and hunt for correctness bugs, reproducing with real media where cheap.
  3. One reviewer for the suite as a group: stack order, cross-plugin contracts, SHARED identity, repo conformance, and a classic-stack simulator that restarts from the top after each transcode.
  4. **Adversarial verification.** Every finding went to independent verifiers instructed to *refute* it, rebuilding their own repros rather than reusing the reviewer's.
     - High findings got two verifiers with different lenses (code-trace and reproduce).
     - Medium findings got one.
     - Low findings were batched.
     - The verifier's severity is the one reported here. Where it differs from the reviewer's, the change is noted.
     - GRP-01 came out of verification itself. I reproduced it, but it was not adversarially re-verified.
  5. A final consistency critic and a line-reference fact-check of this report (175 references checked). Their corrections are applied.
- **Environment caveats:**
  - Tests ran on Ubuntu's stock **FFmpeg 6.1.1**. The plugins' comments are measured on **jellyfin-ffmpeg 7.1.4**, which Tdarr bundles. Build-sensitive findings are flagged in the text (AC-03, VC-02, VC-04, VC-14, VC-18).
  - There was no `mediainfo` binary, so most repros pass no `file.mediaInfo`. Where the result depends on it, verifiers re-ran with MediaInfoLib 24.12 via pymediainfo (CR-01, CR-02, SO-01).
  - There was no GPU, so hardware-encoder findings are code-traced or option-list-traced and marked PLAUSIBLE.
  - docs.tdarr.io was not reachable from the sandbox. Tdarr behaviour was taken from this repo's `methods/`, `examples/`, the Flow classic-plugin shim, and general knowledge. Claims that depend on undocumented Tdarr internals (missing `Stage`, `_id` on later passes, folder-to-folder output) are marked as such.
- **Severity scale:**
  - **High:** data loss, or a file failed or looped under default or common settings.
  - **Medium:** a wrong result under a plausible non-default setting, or a misleading tooltip likely to cause a destructive configuration.
  - **Low:** minor, cosmetic or rare.
