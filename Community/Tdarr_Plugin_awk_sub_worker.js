const details = () => ({
    id: 'Tdarr_Plugin_awk_sub_worker',
    Name: 'Subtitle sidecar worker - extract embedded text subs to sidecars and reimport them',
    Type: 'Subtitle',
    Operation: 'Transcode',
    Description: `Round-trips text subtitles between the container and media-server-style sidecar files so they can be reviewed/edited on disk (by hand or an external script).

                \\naction=extract writes each embedded TEXT subtitle to a sidecar next to the video (native format: srt/ass/vtt) and, by default, removes those tracks from the file.
                \\nA STYLED subtitle (ASS/SSA) in a file that has embedded fonts is exported as a bundle named .<video>.s<streamIndex>[.<title>].<lang>[.<flags>].styled.mks - one Matroska holding the subtitle plus those fonts, which leave the video with it (they exist nowhere else, and Matroska is the only container that can carry both). The leading dot hides it from Plex/Jellyfin. Import restores the subtitle and its fonts together. An mp4 target cannot hold font attachments at all, so a bundle is left on disk until the file is mkv again.
                \\naction=import muxes matching sidecars back into the file (restoring language, title, and disposition) and, by default, deletes the sidecar once it is safely embedded. Import never drops a subtitle - anything not already embedded is muxed in (a copy already present just becomes a duplicate, never a loss); deduplicate collapses byte-identical copies.
                \\nAn SRT carries no title/language/disposition, so all of that is encoded in the filename: <video>.s<streamIndex>[.<title>][.<other flags>].<lang>[.<forced|sdh>].<ext> - the stream index keeps names unique, the title is reversibly encoded, and the language plus at most ONE server-documented flag sit last so Plex/Jellyfin/Emby auto-detect them (Plex accepts only one, and forced wins the slot because it drives automatic selection). Every other flag - commentary, descriptive, original, visual_impaired - rides AHEAD of the language, where media servers ignore it and this plugin still reads it, so nothing is lost and nothing confuses them.
                \\nImport ALSO recognizes sidecars named the way those servers do, with no s<index> (e.g. <video>.en.forced.srt), anchored on the language token: the flag spellings foreign (= forced), cc and hi (= sdh) and default (ignored) are all understood, as is Emby's parenthesized description (<video>.English(Commentary).srt), which becomes the track title. hi is only read as hearing-impaired when a real language precedes it, so <video>.hi.srt stays Hindi.
                \\nBitmap subtitles (PGS/VobSub/DVB) can't become text and are always left embedded and untouched.
                \\nScope both actions with only_languages (comma-separated, e.g. eng,jpn; blank = all). deduplicate collapses byte-identical sidecar copies on import (see its tooltip for the disabled/enabled modes).
                \\nRuns standalone, or in the awk stack after clean_and_remux (first) / audio_clean and before stream_ordering (last).`,
    Version: '3.33.0',
    Tags: 'pre-processing,post-processing,ffmpeg,subtitle only,configurable',
    Inputs: [
        {
            name: 'action',
            type: 'string',
            defaultValue: 'import',
            inputUI: {
                type: 'dropdown',
                options: ['import', 'extract'] },
            tooltip: `Which direction to run.
                \\nextract: pull embedded text subtitles out to sidecar files (and remove them from the video unless extract_remove_stream is off).
                \\nimport: mux sidecar files back into the video (and delete the sidecar once embedded unless import_remove_sidecar is off).`,
        },
        {
            name: 'deduplicate',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled', 'enabled_embedded', 'disabled']
            },
            tooltip: `What counts as a copy of a subtitle you already have. The TEXT always decides, so genuinely different tracks - two commentaries, a real forced track vs a full one - are never collapsed; only byte-for-byte duplicates are.
                \\nenabled - on import, mux one track per byte-identical group of sidecars, combining their flags (a plain + SDH pair imports once, tagged SDH), and skip a sidecar whose text is ALREADY one of the embedded tracks rather than adding a second copy of it. Every member of a group is listed in the marker, so import_remove_sidecar cleans up the whole group. Nothing is removed from the video.
                \\nenabled_embedded - all of the above, and in BOTH actions also removes a subtitle the video itself carries twice. The lowest-numbered copy survives and inherits the others' flags, title and language, so no tagging is lost. This is the only setting that deletes a subtitle you did not ask to extract, and it costs one extra read of the file to compare the tracks.
                \\ndisabled - mux every sidecar as its own track, even byte-identical copies (you may end up with duplicate subtitles).
                \\nWhether the sidecar FILES are deleted afterwards is import_remove_sidecar's decision alone, whatever this is set to.`,
        },
        {
            name: 'only_languages',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Optional comma-separated languages to act on (e.g. eng,jpn). Blank = all languages. One form is enough - en, eng, or English all match the same language (including region variants like en-US), so you don't need to list every variant.
                \\nExample:\\neng,fra`,
        },
        {
            name: 'extract_remove_stream',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false']
            },
            tooltip: `On extract, remove each text subtitle from the video after it is written to a sidecar. Off = write sidecars but keep the embedded tracks.
                \\nStyled ASS/SSA rely on embedded fonts, so they are exported as a .mks bundle holding the subtitle and those fonts together, and the fonts are removed from the video along with it - the styling survives the round-trip whatever else runs in between.
                \\nThe sidecar lands next to the video in the library on any node. A node that shares the library filesystem writes it there directly; an unmapped node, which only ever sees a local copy of the file, extracts the sidecar itself and uploads it through Tdarr's file API. Either way the embedded track is removed ONLY once the sidecar is confirmed in place, so a failed write costs you nothing but the extraction.`,
        },
        {
            name: 'import_remove_sidecar',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false']
            },
            tooltip: `On import, delete each sidecar whose basename is listed in the file's global awk_sub_worker marker (stamped by the mux pass) once an embedded subtitle matching its language and title confirms the content really is in the file.
                \\ntrue (default) - delete them once they are safely embedded. The deletion runs in POST-PROCESSING, after you accept the transcode: deleting earlier would destroy the sidecars of a run you then reject, leaving those subtitles nowhere. So ADD THIS PLUGIN TO THE POST-PROCESSING PLUGIN STACK as well as the pre-processing one. Without that, nothing is ever lost, but the sidecars simply stay on disk. That stage runs on the SERVER, which is also how it cleans up for an unmapped node - one has no way of its own to delete a library file, since Tdarr's API offers upload and download but no delete.
                \\nfalse - leave every sidecar on disk.
                \\nOne case needs more than that: on an unmapped node with no mount, when every sidecar is ALREADY in the file, there is nothing to mux - so no transcode, no acceptance, and no post-processing pass in which to delete anything. There, true forces a lossless -c copy of the video purely to reach that stage. It is a full read and write to remove a few kB of text, but it is the only route, it happens at most ONCE per file (the pass marks those sidecars and the next one skips them), and asking for them to be deleted is taken as asking for whatever that costs. Set false if you would rather keep them.`,
        },
        {
            name: 'method_import_metadata',
            type: 'string',
            defaultValue: 'embedded',
            inputUI: {
                type: 'dropdown',
                options: ['embedded', 'sidecar']
            },
            tooltip: `Which side owns the language/title/flags when a sidecar's TEXT is already one of the embedded tracks - i.e. who wins a disagreement about a subtitle that is already in the file. Reachable only when deduplicate is comparing text (enabled or enabled_embedded); a sidecar muxed as a NEW track always takes its metadata from its filename, because nothing else describes it.
                \\nembedded - leave the track exactly as it is and report the difference. Safe with an OLD sidecar name: a name written before a flag existed carries no token for it, and applying it would strip that flag off a track that has it.
                \\nsidecar  - the filename wins, so renaming a sidecar retunes the track already in the file (language, title and flags, including clearing flags you removed from the name). Use it when you renamed the sidecar deliberately; it costs one remux of the file.`,
        },
        {
            name: 'method_unmapped',
            type: 'string',
            defaultValue: 'error',
            inputUI: {
                type: 'dropdown',
                options: ['error', 'mount', 'text_file']
            },
            tooltip: `What to do on an UNMAPPED node, which is only ever given a local copy of the video and never sees the library folder. Ignored entirely on a normal (mapped) node.
                \\nExtract already works everywhere - the sidecar is uploaded to the library through Tdarr's file API. It is IMPORT that has the problem: finding sidecars means listing a directory, and the API offers no way to list one.
                \\nerror     - fail the file and say so. Nothing is silently skipped; run import on a node that can see the library.
                \\nmount     - reach the library directly. The node's own path is tried first (a container bind-mounting the library at the server's own path, e.g. /media, needs nothing more), then any "key=value" Node Tag set for this node in the server's web UI, which names where THIS node sees that folder - for example "media=M:\\\\" when the server calls it /media. A tag is needed on Windows and macOS, where the server's path cannot exist locally. Extract writes directly too in this mode, skipping the upload API.
                \\ntext_file - read "<video>.subtitles.txt" next to the video: one filename per line, lines starting with # ignored. Extract seeds it with what it wrote; after that it is yours to maintain, which is how a subtitle you OCR'd from an exported image sub gets imported. Each name must still follow the sidecar naming convention, since that is where language, title and flags come from.`,
        },
    ],
});

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
    // SHARED CODE - duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all five awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','descriptions','dvs','audio description','visually impaired','visual impaired'], tag: 'Descriptive' },
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
    // A subtitle can carry the raw visual_impaired flag - mkvtoolnix writes it and sub_worker's sidecar round trip restores it - but the table scopes that key
    // to audio, where it means an audio-description TRACK, so hasDisposition rejects it on a subtitle. Read the subtitle case as a RAW flag, deliberately NOT by
    // widening the table entry: that would also let its audio-oriented keywords ('audio description', 'visually impaired') invent the role from a subtitle's
    // title, which the subtitle summary explicitly refuses to allow. 'descriptions' remains the keyword-matched subtitle spelling of the same role.
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions')
        || ((s.codec_type || '').trim().toLowerCase() === 'subtitle' && s.disposition?.visual_impaired === 1);
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
        ['gsm',    'gsm'],      // GSM 06.10 full-rate and the Microsoft variant (gsm_ms) are one speech family - fold to one key
        ['qdm',    'qdm'],      // QDesign Music 1 and 2 (qdmc/qdm2), old QuickTime - fold to one key
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= resolveCodecName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the _x variant when DTS:X is detected)
    // and eac3/truehd into eac3atmos/truehdatmos. Used by audioQuality (audio_clean, stream_ordering), isLosslessSource (audio_clean), and summariseStream
    // (all five) purely for accurate display labeling - a plugin that doesn't score audio still benefits from showing "eac3atmos"/"dtsx" instead of a bare
    // "eac3"/"dts" in its logs. codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" (no subtype keyword), so longName alone can't tell the
    // subtypes apart there; we also check the stream profile ("DTS-HD MA"/"HRA"/"Express") and fall back to mediaInfo's Format_Commercial_IfAny ("DTS-HD
    // Master Audio"), which decodes the substream header. Atmos comes from longName, the ffprobe profile ("... + Dolby Atmos"), or the commercial name
    // (profile/commercial being the reliable ones - an E-AC-3 longName carries no Atmos marker); an editable title tag does not imply a real Atmos substream.
    // DTS:X detection is best-effort: MediaInfo exposes it via Format_AdditionalFeatures containing "XLL X" (vs plain "XLL" for MA without X), but MediaInfo's
    // own maintainers note this is incomplete for an undocumented format - expect a real DTS:X track to sometimes still classify as the
    // plain (non-X) subtype, never the reverse (this only fires on an actual reported value, never on absence of one, so it can't produce a false positive).
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
        } else if ((codec === 'eac3' || codec === 'truehd') && (longName.includes('atmos') || commercial.includes('atmos') || profile.includes('atmos')))
            codec = codec === 'eac3' ? 'eac3atmos' : 'truehdatmos';

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
        eac3atmos: 'eac3-atmos', truehdatmos: 'truehd-atmos', mpegh3d: 'mpeg-h',
    };
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || (stream.codec_name || 'unknown').trim().toLowerCase();
    // ===== END SHARED: codec name resolution =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The mp4/mov container family whose -c copy needs `-movflags use_metadata_tags` to keep sibling plugins' GLOBAL
    // awk_* markers through the remux (dropping one re-triggers work upstream). One source so the four writers can't
    // drift on the set (video_clean's video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [audio_clean, clean_and_remux, sub_worker, video_clean] =-=-=-
    // Look up a tag value case-insensitively - matroska UPPER-CASES tag keys on write, so a plugin reading its
    // sibling's awk_* marker gets an uppercased key back. Returns the raw value (or '' if absent); callers trim/decode
    // as needed. One source so the four plugins that read each other's markers can't drift on the lookup convention.
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
    // Embedded-font filename extensions + a font-mimetype test, shared by summariseStream's
    // [attach:...] token and clean_and_remux's attachmentKind font classification.
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
    // Per type: video codec + resolution/10bit/hdr (+/cover for cover-art/still images); data & attachment codec only. Audio & subtitle append /default,
    // then EVERY role marker that applies, so a track flagged two ways shows both. Audio: /commentary /description then /dub /original. Subtitle: /forced
    // then /commentary /description /sdh /lyrics then /original. /default and /forced read the REAL disposition flag only — a title keyword must not flip
    // a selection flag (as forced already did). The classifier-driven markers mirror the sorting logic (flag OR title keyword, via the shared classifiers)
    // so every plugin's summary lines up; the subtitle branch's two raw-flag markers are display only, as no classifier scopes those flags to subtitles.
    // subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Audio uses codecDisplayName so a DTS
    // subtype or object-audio layer the container codec_name hides (dts-hd-ma, eac3-atmos, dts-express-x) shows in the token. Shared verbatim across all
    // five. The optional second argument describes a RE-ENCODED output track as { codec, channels, bps, rate } - see the audio branch for what an encode
    // keeps and what it drops. Because of it, NEVER pass this helper straight to .map(): Array.map would supply the element index as that argument.
    const summariseStream = (s, out) => {
        // Every value below that comes from container metadata rather than from ffprobe's own bounded tables is clamped through this: control characters
        // become spaces (a raw newline would split the summary into a continuation line carrying no ☐/☑/☒) and the token is cut to 64 chars. Nothing bounds
        // a language tag, an attachment filename or a mimetype, and the whole infoLog is persisted by Tdarr - the same reasoning that caps the workDone
        // lines. 64 clears every real value: the longest registered mimetype subtype is 59 chars, and language codes and font extensions are far shorter.
        const tok = (v) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 64);
        const type = (s.codec_type || '').trim().toLowerCase();
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
            // What survives a RE-ENCODE is decided here, once, so a plugin's before/after summary lines are built by the same rules. Language and the
            // disposition markers carry through an encode and still read off the source stream; the source-only mediaInfo markers do NOT - a fresh encode
            // has neither the source's Dolby Surround EX matrix nor its commercial subtype, so claiming either on the output would state something false.
            const chNum = out ? out.channels : s.channels;
            const ch = chNum ? `${chNum}ch` : '';
            // An explicit pre-formatted rate string wins, because a VBR encode's rate is an ESTIMATE ('~192k') that cannot be known until the encode runs;
            // otherwise format the bit rate - from the override when this is an output token, from the stream itself when it is not.
            const bps = Number((out ? out.bps : s.bit_rate) || 0);
            const rate = (out && out.rate) || (bps > 0 ? `${Math.round(bps / 1000)}k` : '');
            const role = `${isCommentary(s) ? '/commentary' : ''}${isDescriptive(s) ? '/description' : ''}`;
            const prov = `${hasDisposition(s, 'dub') ? '/dub' : ''}${hasDisposition(s, 'original') ? '/original' : ''}`;
            // Dolby Surround EX marker (a rear channel matrix-folded into a 5.1 AC-3), read inline from mediaInfo Format_Settings_Mode - the flag's only home
            // (this shared helper can't call audio_clean's local isMatrixSurroundSource). Marks the EX copy so its token differs from a plain 5.1 twin.
            const surEx = !out && /surround ex/i.test(mediaInfoFor(s)?.Format_Settings_Mode || '') ? 'dd-ex' : '';
            // A re-encode is named by the codec it is being encoded TO - resolved through a bare object so no source profile/long-name/mediaInfo can leak in.
            const name = out ? codecDisplayName({ codec_name: out.codec }) : codecDisplayName(s);
            return `[audio:${[lang, ch, surEx, name, rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            // A subtitle can also carry 'visual_impaired' and 'original' - mkvtoolnix writes either, and sub_worker's sidecar round trip restores them - but
            // dispositionTypes scopes both to audio, where they mean an audio-description track and the original-language one. 'original' is therefore read as
            // a RAW flag here: exactly like /default and /forced, a title keyword must not be able to invent one. visual_impaired needs no special case any
            // more - isDescriptive reads that subtitle-scoped raw flag itself, on the same terms, so the summary and the classifiers cannot disagree about it.
            const descriptive = isDescriptive(s);
            const role = `${isCommentary(s) ? '/commentary' : ''}${descriptive ? '/description' : ''}${isSdh(s) ? '/sdh' : ''}${isLyrics(s) ? '/lyrics' : ''}`;
            const forced = hasDisposition(s, 'forced') ? '/forced' : '';   // flag OR title keyword, same test the classifiers use - so the summary token and the sort key can never disagree
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}${s.disposition?.original === 1 ? '/original' : ''}]`;
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
            return `[attach:${tok(label)}]`;
        }
        if (type === 'data') {
            // Prefer a meaningful codec_name; when it's absent/generic, surface the mimetype SUBTYPE (text/html -> html) so a removed data stream is legible.
            const dmime = (s.tags?.mimetype || '').trim().toLowerCase();
            const dsub = dmime.includes('/') ? dmime.slice(dmime.indexOf('/') + 1).replace(/^x-/, '') : '';
            return `[data:${tok((codec === 'unknown' || codec === 'none') && dsub ? dsub : codec)}]`;
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
    // Null-prototype so a container tag spelling an Object.prototype member ('constructor') misses the map instead of resolving to an inherited value.
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

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language token failure =====
    // -=-=-= failLangToken  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The failFile message echoes the offending token capped at 200 chars, with control characters collapsed to a space: free text is unbounded and Tdarr
    // persists the whole error message, and a raw newline in the echo would split the line into a continuation carrying no ☐/☑/☒ status symbol.
    const failLangToken = (name, token) => failFile(`[${name}=${String(token ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}] not a recognised language - use an ISO-639 code (en/eng/fre), an English name (English), a BCP-47 tag (pt-BR), or a special code (und/mul/zxx/mis/qaa-qtz)`);
    // ===== END SHARED: language token failure =====

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
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: dolby vision strict mp4 arg =====
    // -=-=-= dvStrictMp4Arg  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // The ' -strict unofficial' an mp4/mov -c copy needs so ffmpeg's mov muxer keeps a Dolby Vision stream's dvcC/dvvC boxes; a plain copy drops them,
    // demoting DV to plain HEVC/AV1 (verified on real HEVC + AV1 DV samples). Finds the DV video stream DIRECTLY - isDolbyVisionVideo, cover art excluded -
    // so a leading cover-art stream can't mask it (not just the first video stream); HEVC-DV and AV1-DV both qualify. Pass the RAW file.ffProbeData.streams:
    // codec_tag_string / side_data_list (the DV signals) live only there. clean_and_remux does the equivalent per-stream in its own loop.
    const dvStrictMp4Arg = (container, streams) => {
        if (!isMp4Family(container)) return '';
        const list = Array.isArray(streams) ? streams : [];
        const hasDv = list.some((s) => (s.codec_type || '').toLowerCase() === 'video' && !isCoverArt(s) && isDolbyVisionVideo(s, mediaInfoFor(s)));
        return hasDv ? ' -strict unofficial' : '';
    };
    // ===== END SHARED: dolby vision strict mp4 arg =====

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
    const TEXT_EXTS = ['srt', 'ass', 'vtt'];
    // STYLED subtitles render through fonts that exist only as attachments inside the container, so extracting one to a loose text file and letting the
    // fonts be removed as orphaned destroys the styling irrecoverably. Such a subtitle is exported as a Matroska BUNDLE instead - the subtitle plus every
    // font attachment in one file - so the fonts travel with it. Matroska is the only container that can do this: mp4/mov reject ass and carry no
    // attachments at all, WebM allows only WebVTT, and a fonts-ONLY Matroska is not an option either (ffmpeg exits 0 but writes an unreadable file).
    // .mks is Matroska's subtitle-only extension - .mkv/.mka would mux byte-identically, but a server that ignores dotfiles would scan those as a video
    // or a music track. Verified on jellyfin-ffmpeg 7.1.4: language, title, disposition and the font bytes all survive the full round-trip.
    // The fixed marker token before the extension is what makes a bundle name unambiguous: clean_and_remux's remove_imagesubs=export writes its own
    // dot-prefixed .mks image-subtitle sidecars in the same "<base>.s<index>.<lang>[.forced]" shape, and importing one of those as a bundle would
    // silently re-add the image subtitle that pass had just exported and removed. It is stripped before the disposition tokens, so it never occupies
    // the language slot, and no disposition token spells 'styled'.
    const STYLED_SUBS = ['ass', 'ssa'];
    const BUNDLE_EXT = 'mks';
    const BUNDLE_TOKEN = 'styled';
    const isStyledSub = (codec) => STYLED_SUBS.includes(String(codec).toLowerCase());

    // Dispositions encoded as filename tokens, in fixed order. `ff` is the ffmpeg -disposition name restored on import; `flags` are the ffprobe
    // disposition keys that, when set on the source, emit this token on extract. They differ only for SDH: hearing_impaired and captions are
    // the same closed-captions role, but captions has no Matroska flag and does not survive an mp4->mkv round-trip (the muxer silently drops
    // +captions), so BOTH normalise to the container-portable hearing_impaired - extract emits a single 'sdh' token for either flag and import
    // restores hearing_impaired. The human-readable role also survives in the encoded title. `default` is deliberately NOT tracked: muxers
    // auto-manage it (mp4 forces default on the first subtitle), so it is neither identity-stable nor ours - stream_ordering picks it last.
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
    // Flags that must survive the round trip but that NO media server understands as a filename token. They are written BEFORE the language instead of
    // after it, in the same region as our s<index> anchor and encoded title - Plex/Jellyfin/Emby parse right-to-left from the extension, so everything
    // ahead of the language is ignored by them while the trailing <lang>[.disp] they do read stays exactly as it was. Putting one in the trailing run
    // instead would hand them an unknown flag where they expect a known one, which is how a sidecar silently stops being imported at all.
    // Both are raw ffmpeg dispositions, NOT roles dispositionTypes classifies (that table scopes each to audio, where they mean the original-language track
    // and an audio-description one), yet mkvtoolnix writes either on a subtitle. Reading the raw flag is deliberate: they are carried purely so extract ->
    // import returns the stream exactly as it was found, which must not depend on a title keyword or on any title-tagging setting. Container limits,
    // measured on jellyfin-ffmpeg rather than assumed: Matroska stores both and keeps them through a -c copy remux; mp4 drops 'original' at the muxer
    // whatever we do, and cannot tell 'visual_impaired' from 'descriptions' (setting either reads back as BOTH), so an mp4 round trip can widen those two
    // into each other. Both are container limits, not ours. The tokens use ffmpeg's own spelling, and an underscore is also something a language token can
    // never be - sidecarLangToken restricts a language to [a-z0-9-], so 'visual_impaired' cannot collide with one the way 'hi'/Hindi does.
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
    // VALUE carries the sidecar basenames muxed in the most-recent pass, so it must survive escMeta and carry no comma (the list separator). A GLOBAL tag value
    // survives every container (incl. mp4, which drops per-stream title/default), so pass 2 deletes exactly what pass 1 embedded without re-reading metadata.
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
        while (raw.length > 0 && Buffer.byteLength(`${enc}${'.'.repeat(fixedLen ? 1 : 0)}`, 'utf8') + fixedLen > NAME_BYTE_CAP) { raw = raw.slice(0, -1); enc = encodeTitle(raw); titleTruncated = true; }
        return enc;
    };

    // ===== SHARED [clean_and_remux, sub_worker]: preset path safety =====
    // -=-=-= pathIsPresetSafe  [clean_and_remux, sub_worker] =-=-=-
    // True when a real on-disk path can be embedded in a preset's quoted "${path}" token. Tdarr never shells out, but its worker tokenises each preset
    // half with a quote-aware parser before spawning ffmpeg, so a " anywhere in the path closes the wrapper mid-token and everything after it becomes
    // fresh argv entries (a raw control character breaks the token just as badly). The name parts WE generate are sanitised at their source, but the
    // library DIRECTORY is a real path that has to stay literal - it can only be checked, never rewritten - so a caller that fails this test refuses
    // that one sidecar with a ☒ line rather than emit the token.
    const pathIsPresetSafe = (p) => !/["\x00-\x1f\x7f]/.test(String(p));
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
    // ".." (escaping libDir) or a " that closes the quote and appends ffmpeg args. The library DIRECTORY is deliberately NOT sanitised - a real path
    // has to stay literal - so callers CHECK the joined path with pathIsPresetSafe instead and refuse that one sidecar when it fails.
    const libFilePath = otherArguments?.originalLibraryFile?.file || file.file || '';
    const libDir = path.dirname(libFilePath);
    const videoBase = path.basename(libFilePath).replace(/\.[^.]+$/, '').replace(/["\x00-\x1f\x7f]/g, '');
    const sidecarLangToken = (s) => (resolveLang(s) || 'und').replace(/[^a-z0-9-]/g, '') || 'und';
    // ===== END SHARED: sidecar path derivation =====

    // ===== SHARED [clean_and_remux, sub_worker]: sidecar placement =====
    // -=-=-= nodeConfig / isUnmappedNode / serverSidePath  [clean_and_remux, sub_worker] =-=-=-
    // These two plugins are the only ones that write a file NEXT TO the library video, and where that file lands depends on the node. A MAPPED node sees
    // the real library, so a sidecar emitted as an extra output of Tdarr's own ffmpeg run is written straight into it - and because the sidecar and the
    // strip that follows are outputs of the SAME command, they succeed or fail together. An UNMAPPED node never sees the library at all: Tdarr mirrors the
    // library tree under its unmappedNodeCache, downloads the file into that mirror, and uploads only the transcode RESULT back - so a sidecar written
    // beside it is discarded with the job while the strip succeeds, the one shape that loses subtitle content. nodeType is the authority for that
    // difference; a filesystem probe false-passes, because the mirror genuinely is a writable directory holding a real copy of the video.
    const nodeConfig = otherArguments?.configVars?.config || {};
    const isUnmappedNode = String(nodeConfig.nodeType || '').toLowerCase() === 'unmapped';
    // A node path -> the server's own path for it, through the translators Tdarr auto-populates on an unmapped node (e.g. /media -> /cache/tiny/media).
    // The longest node prefix wins, so a nested mapping beats the parent it sits under. '' means no translator claims the path, which makes the server-side
    // destination unknowable rather than guessable - a caller must refuse the export instead of inventing one.
    const serverSidePath = (p) => {
        const hit = (Array.isArray(nodeConfig.pathTranslators) ? nodeConfig.pathTranslators : [])
            .filter((t) => t && t.node && String(p).startsWith(String(t.node)))
            .sort((a, b) => String(b.node).length - String(a.node).length)[0];
        return hit ? String(hit.server) + String(p).slice(String(hit.node).length) : '';
    };

    // -=-=-= sidecarExistsRemote / placeSidecars  [clean_and_remux, sub_worker] =-=-=-
    // The unmapped route, in one place: ask the server whether a sidecar is already there, then extract and upload the ones that are not. Tdarr runs the
    // preset only AFTER the plugin returns, so there is no post-ffmpeg hook to upload from - extraction has to happen HERE, and be confirmed placed before
    // the caller may strip the embedded stream. Both routes are gated server-side on "Allow unmapped Nodes and source/cache file access through API", and
    // the server cannot have handed this job to an unmapped node with that off, so the transport needs no capability probe (it is also why a MAPPED node
    // must keep writing directly - that option is off by default, so routing its sidecar through the API would fail on a normal install). curl through
    // spawnSync because a classic plugin is synchronous: Tdarr does await the result, but making the whole plugin async would ripple through every caller
    // for one branch that runs on unmapped nodes alone. Values go through --form-string so a comma or semicolon in a title can never be read as curl -F
    // syntax, and the file part names a temp path built from an index, never from the sidecar name.
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const apiAuthArgs = () => {
        const key = String(nodeConfig.apiKey || '');
        return key ? ['-H', `x-api-key: ${key}`, '-H', `tdarrKey: ${key}`, '-H', `Authorization: Bearer ${key}`] : [];
    };
    // Is a non-empty sidecar already at this server path? Download is the only read the API offers, so the test IS a fetch - discarded to the null device
    // and measured with curl's own counters, never buffered back through spawnSync (a large body silently exceeds maxBuffer and reports a failure that
    // never happened). Absent is the common case and answers with a cheap 404, and a hit skips the extraction entirely.
    const sidecarExistsRemote = (dest) => {
        const { spawnSync } = require('child_process');
        const url = String(nodeConfig.serverURL || '').replace(/\/+$/, '');
        if (!url) return false;
        const r = spawnSync('curl', ['-sS', '-m', '1800', '-o', nullDevice, '-w', '%{http_code} %{size_download}', ...apiAuthArgs(),
            '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify({ filePath: dest }), `${url}/api/v2/file/download`],
            { encoding: 'utf8', timeout: 1800000 });
        const [code, got] = String(r.stdout || '').trim().split(/\s+/);
        return code === '200' && Number(got) > 0;
    };
    // Extract every pending sidecar in ONE ffmpeg pass (even a tiny subtitle stream demuxes the whole container, so a second pass would re-read the lot),
    // then upload each to its server path. The upload's 200 IS the verification: the server compares what it wrote against the fileSize field and reports
    // success only when they match, a stronger check than this side could make. Returns the names genuinely in the library - a caller may strip only
    // those, and anything in `failed` keeps its embedded stream, exactly as a refused export does. The multipart field ORDER is load-bearing: the server
    // parses the stream as it arrives, so filePath and fileSize have to precede the file part or the upload is rejected as pathless.
    const placeSidecars = (jobs) => {
        const os = require('os');
        const { spawnSync } = require('child_process');
        const placed = new Set(); const failed = new Map();
        const tmpExt = (name) => path.extname(name).replace(/[^.a-z0-9]/gi, '');   // from our own table-driven extension, so the temp name stays ours alone
        const failAll = (why) => { for (const j of jobs) failed.set(j.name, why); return { placed, failed }; };
        const url = String(nodeConfig.serverURL || '').replace(/\/+$/, '');
        if (!url) return failAll('the node config carries no server URL to upload through');
        // A PRIVATE staging directory, not predictable names in the shared temp dir. os.tmpdir() is world-writable on Unix, so a name derived from the pid
        // and an index can be pre-created as a symlink by any other local user, and ffmpeg's -y then writes THROUGH it - overwriting whatever it points at,
        // as the Tdarr user. mkdtemp's 0700 directory closes that window outright rather than racing it, which is what embeddedTextHashes already does.
        // Inside it the names can stay trivially short, since nothing else can get in; they still come from our own extension table, never the sidecar name.
        let stageDir = '';
        try { stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awk_sidecar_')); }
        catch (e) { return failAll(`could not create a staging directory (${e && e.message ? e.message : e})`); }
        const staged = jobs.map((j, i) => ({ ...j, tmp: path.join(stageDir, `${i}${tmpExt(j.name)}`) }));
        // Best effort: a staging directory left behind is harmless, and failing the placement over it would lose the sidecars it just uploaded.
        const clearStaged = () => { try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) { /* see above */ } };
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', String(file._id || file.file || '')];
        for (const j of staged) args.push(...j.args, j.tmp);
        // The ceiling is bounded by the container's size and the node's storage rather than by the sidecar, so it is generous - but a hung ffmpeg is
        // killed rather than holding the worker forever.
        const ff = spawnSync(String(otherArguments?.ffmpegPath || 'ffmpeg'), args, { encoding: 'utf8', timeout: 1800000, maxBuffer: 4 * 1024 * 1024 });
        if (ff.error || ff.status !== 0) {
            const why = ff.error ? `extraction failed (${ff.error.code || ff.error.message})`
                : `extraction failed (ffmpeg exit ${ff.status}: ${String(ff.stderr || '').trim().slice(0, 200)})`;
            clearStaged();
            return failAll(why);
        }
        for (const j of staged) {
            let size = 0;
            try { size = fs.statSync(j.tmp).size; } catch (e) { size = 0; }
            if (!size) { failed.set(j.name, 'extraction produced no data'); continue; }
            const up = spawnSync('curl', ['-sS', '-m', '1800', '-o', nullDevice, '-w', '%{http_code}', ...apiAuthArgs(),
                '--form-string', `filePath=${j.dest}`, '--form-string', `fileSize=${size}`, '--form-string', `nodeID=${String(nodeConfig.nodeID || '')}`,
                '-F', `file=@${j.tmp}`, `${url}/api/v2/file/upload`], { encoding: 'utf8', timeout: 1800000 });
            const code = String(up.stdout || '').trim();
            if (!up.error && code === '200') placed.add(j.name);
            else failed.set(j.name, `upload rejected (${up.error ? (up.error.code || up.error.message) : `HTTP ${code || 'no response'}`})`);
        }
        clearStaged();
        return { placed, failed };
    };
    // ===== END SHARED: sidecar placement =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language display name =====
    // -=-=-= langDisplayName  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // Memoised ICU DisplayNames (built once, reused): the recognised English name for an ALREADY-normalised language code, or '' for a non-language/unknown
    // code. A fresh ICU instance per call is wasteful. Each caller normalises the token first - clean_and_remux via shortLang (tag recognition), audio_clean
    // audio_clean, stream_ordering and sub_worker via langKey (free-text language-list validation / sidecar name recognition).
    const langDisplayName = (() => {
        let dn = null;
        return (code) => { try { dn = dn || new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }); return dn.of(code) || ''; } catch (e) { return ''; } };
    })();
    // ===== END SHARED: language display name =====
    // Recognise a filename token as a real language (2/3-letter ISO code or English name) so a server-native sidecar can
    // be anchored on it without mis-reading an arbitrary token as a language. Normalises via the shared langKey, then
    // confirms it names a real language through langDisplayName (which returns '' for a non-language/unrecognised code).
    const isKnownLang = (token) => { const k = langKey(token); if (!k) return false; return !!langDisplayName(k); };

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
    // Normalise a sidecar language token to a lowercase 3-letter ISO 639-2/T code for an mp4-family import target (mdhd silently drops 2-letter/spelled codes).
    // langKey folds spelled names and 639-2/B onto the 2-letter key, which ISO639_1_TO_2 maps to /T; an already-3-letter code (eng, fil, und) or an unmappable
    // token is left as-is. Mirrors clean_and_remux's toCanonicalTag three(false); mkv keeps the raw token where it is already a code (see normSidecarLang).
    const to6392T = (lang) => { const key = langKey(lang); if (!key || key.length !== 2) return lang; return ISO639_1_TO_2[key] || lang; };
    // Plex/Jellyfin/Emby all accept a spelled-out language NAME in a sidecar name (Movie.English.srt), which isKnownLang
    // recognises - but the name itself is not a valid container language tag, so writing it through would stamp
    // "language=English" into the mkv. Fold any non-code token to its 3-letter code; a token already shaped like a code is passed
    // through untouched so a region tag (pt-BR) survives, which is the whole point of keeping the raw token on the mkv path.
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
        const collides = DISP_TOKENS.has(rawTitle) || EXTRA_TOKENS.has(rawTitle) || (DISP_AMBIGUOUS_LANG.has(lang) && isKnownLang(rawTitle));
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
            if (DISP_AMBIGUOUS_LANG.has(toks[toks.length - 1]) && !isKnownLang(toks[toks.length - 2] || '')) break;
            rawDisp.unshift(toks.pop());
        }
        const dispTokens = [...new Set(rawDisp.filter((t) => !DISP_IGNORE.has(t)).map((t) => DISP_ALIAS[t] || t))];   // drop ignored (default), normalise aliases (cc/hi->sdh, foreign->forced), dedupe
        if (!toks.length) return null;
        let lang = toks.pop();                                            // language is the next-from-right token
        if (!lang) return null;
        // Emby distinguishes same-language extras by appending a parenthesised description to the language token (Home Alone.English(Commentary).srt) rather
        // than by a flag. Split it so the language is still recognised and the description becomes the track title - only when the bare prefix really is a
        // language, so an ordinary bracketed token is still rejected below. Our own names can't reach here: sidecarBasename restricts lang to [a-z0-9-].
        let parenTitle = '';
        const parenMatch = !isKnownLang(lang) && lang.match(/^([^()]+)\(([^()]+)\)$/);
        if (parenMatch && isKnownLang(parenMatch[1])) { [, lang, parenTitle] = parenMatch; }
        if (!ours && !isKnownLang(lang)) return null;                     // server-native has no s<index> anchor, so its language token must be real
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
    // An unmapped node is handed a local MIRROR of the library under unmappedNodeCache, never the library itself, and Tdarr withholds the user's own path
    // translators from it - configVars.config.pathTranslators carries only the mirror mappings Tdarr generates, and librarySettings.folder is the mirror
    // too. So the node can work out that the server calls this folder /media/Show and reach nothing at that path. Two ways out, both measured on a real
    // Windows node rather than assumed:
    //   mount     - the server's path may simply work (a container bind-mounting the library at /media), and otherwise a Node Tag names where THIS node
    //               sees it ("media=M:\"). Tags are the only PER-NODE setting a classic plugin can read: they reach flow plugins directly but not this
    //               one, so they are fetched from /api/v2/get-nodes using the serverURL, apiKey and nodeID the node config already carries.
    //   text_file - no directory access at all; the user lists the filenames and each is fetched by name through the download API.
    const unmappedMode = String(inputs.method_unmapped || 'error').toLowerCase();
    const SUBTITLE_LIST_SUFFIX = '.subtitles.txt';

    // This node's Node Tags, as [key, value] pairs. One request, memoised, and only ever made when something actually needs it. Tdarr maintains entries in
    // the SAME field - a node restart rewrites it to e.g. "unmapped,media=M:\" - so the field is shared, not ours: split on commas and keep only the
    // "key=value" tokens, leaving Tdarr's own bare tags alone rather than assuming the field contains nothing but our setting.
    const nodeTagPairs = (() => {
        let cached = null;
        return () => {
            if (cached) return cached;
            cached = [];
            const url = String(nodeConfig.serverURL || '').replace(/\/+$/, '');
            if (!url) return cached;
            const { spawnSync } = require('child_process');
            const r = spawnSync('curl', ['-sS', '-m', '30', ...apiAuthArgs(), `${url}/api/v2/get-nodes`], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
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
                tried.push(`${label} (${dir}) - ${code === 'ENOENT' ? 'not there' : (code === 'EACCES' || code === 'EPERM' ? 'exists but unreadable from this node, check credentials' : code || e.message)}`);
            }
        }
        return { dir: '', why: `nothing reachable. Tried: ${tried.join('; ')}${nodeTagPairs().length ? '' : '. No "key=value" Node Tag is set for this node'}` };
    };
    const mountedLib = (() => { let c = null; return () => { if (!c) c = (isUnmappedNode && unmappedMode === 'mount') ? resolveMountedLibDir() : { dir: '' }; return c; }; })();

    // Every path below goes through these two rather than libDir/isUnmappedNode directly: with a resolved mount the node behaves exactly like a mapped one,
    // reading and writing the real library, and the API routes are only for a node that genuinely cannot reach it.
    const workLibDir = () => mountedLib().dir || libDir;
    const placeViaApi = () => isUnmappedNode && !mountedLib().dir;

    // Fetch one library file to a local path, through the only read an unmapped node has. It addresses a single KNOWN path, which is exactly why the list
    // has to live at a name we can compute rather than one we would have to go looking for. Written straight to disk by curl, never buffered back through
    // spawnSync, so a large sidecar cannot silently exceed maxBuffer and report a failure that never happened.
    // curl's EXIT STATUS is part of the success test, not just the HTTP code: a transfer that dies after the response headers - the -m timeout, a dropped
    // connection - still reports %{http_code} 200 and leaves a non-empty file, so testing the code alone would call a truncated download complete.
    const downloadLibraryFile = (dest, local) => {
        const url = String(nodeConfig.serverURL || '').replace(/\/+$/, '');
        if (!url) return 'the node config carries no server URL';
        const { spawnSync } = require('child_process');
        try { fs.mkdirSync(path.dirname(local), { recursive: true }); } catch (e) { /* already there */ }
        const r = spawnSync('curl', ['-sS', '-m', '600', '-o', local, '-w', '%{http_code}', ...apiAuthArgs(),
            '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify({ filePath: dest }), `${url}/api/v2/file/download`],
            { encoding: 'utf8', timeout: 600000 });
        const code = String(r.stdout || '').trim();
        let size = 0; try { size = fs.statSync(local).size; } catch (e) { size = 0; }
        if (!r.error && r.status === 0 && code === '200' && size > 0) return '';
        try { fs.unlinkSync(local); } catch (e) { /* nothing landed */ }
        if (r.error) return `download failed (${r.error.code || r.error.message})`;
        return r.status === 0 ? `HTTP ${code || 'no response'}` : `the transfer did not complete (curl exit ${r.status === null ? 'signalled' : r.status})`;
    };

    // Pull every listed sidecar into this node's own copy of the library folder, at the same relative path. Everything downstream - the dedup hash, the -i
    // inputs, the marker - then works on ordinary local files and needs to know nothing about how they arrived. The copy lives in the throwaway mirror,
    // which is the right place for it: it is consumed by this one mux and goes with the job.
    // A name that is missing because we already imported it and cleaned it up is the list going stale in the ordinary way, not a problem: the list is seeded
    // once and never rewritten, so it still names files whose whole purpose has been served. The marker is what tells the two apart - it records what an
    // earlier pass embedded - and without that distinction a completed round trip reports itself as one warning per subtitle it successfully handled.
    // The NAME is checked before anything is fetched. readSubtitleList only proves an entry stays inside the video's folder; it says nothing about the entry
    // being a subtitle, and the destination is path.join(libDir, rel) in the mirror that also holds the video being transcoded - so a line naming the video
    // itself would have curl truncate it, or delete it outright on an HTTP error, before the first name test downstream ever ran. An entry has to parse as a
    // sidecar to be usable at all (that is exactly what the import filters on), so testing it here costs nothing and is the only place the test is in time.
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
            if (embeddedAlready && embeddedAlready.has(rel)) { response.infoLog += `☑[method_unmapped=text_file] ${listName} still lists ${rel}, which an earlier pass already embedded and removed\n`; continue; }
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
        if (sidecarExistsRemote(dest)) return 'exists';
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
        const url = String(nodeConfig.serverURL || '').replace(/\/+$/, '');
        const { spawnSync } = require('child_process');
        const size = fs.statSync(tmp).size;
        const up = spawnSync('curl', ['-sS', '-m', '300', '-o', nullDevice, '-w', '%{http_code}', ...apiAuthArgs(),
            '--form-string', `filePath=${dest}`, '--form-string', `fileSize=${size}`, '--form-string', `nodeID=${String(nodeConfig.nodeID || '')}`,
            '-F', `file=@${tmp}`, `${url}/api/v2/file/upload`], { encoding: 'utf8', timeout: 300000 });
        try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        const code = String(up.stdout || '').trim();
        return (!up.error && code === '200') ? '' : `upload rejected (${up.error ? (up.error.code || up.error.message) : `HTTP ${code || 'no response'}`})`;
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
            if (/^([a-zA-Z]:|\/|\\)/.test(entry) || norm.startsWith('//')) { bad.push([entry, 'absolute paths are not allowed, name a file inside the video\'s own folder']); continue; }
            if (norm.split('/').includes('..')) { bad.push([entry, '".." is not allowed, a listed file must sit inside the video\'s own folder']); continue; }
            const full = path.resolve(workLibDir(), norm);
            if (full !== path.resolve(workLibDir()) && !full.startsWith(path.resolve(workLibDir()) + path.sep)) { bad.push([entry, 'resolves outside the video\'s folder']); continue; }
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
    // levels because readdir order is filesystem-dependent (ext4 hash order vs APFS) and it propagates into the dedup groups, the extra -i inputs, the
    // outIdx assignment and so the appended subtitle order - unsorted, the same file embeds its sidecars in a different order on different nodes.
    // A relative path is also what the marker stores, so a sidecar in a subfolder is distinguishable from a same-named one beside the video.
    const scanSidecarDirs = () => {
        let top;
        try { top = fs.readdirSync(workLibDir(), { withFileTypes: true }); } catch (e) { return { err: e }; }
        const rels = top.filter((d) => !d.isDirectory()).map((d) => d.name).sort();
        const subs = top.filter((d) => d.isDirectory() && SIDECAR_SUBDIRS.includes(d.name.toLowerCase())).map((d) => d.name).sort();
        for (const s of subs) {
            let inner = [];
            try { inner = fs.readdirSync(path.join(workLibDir(), s)); } catch (e) { continue; }   // unreadable subfolder: the sidecars beside the video still import
            for (const n of inner.sort()) rels.push(`${s}/${n}`);
        }
        return { rels };
    };
    // Parse each scanned path as a sidecar, carrying its relative path along as the identity everything downstream keys on.
    const parseSidecarRel = (rel) => { const p = parseSidecar(path.posix.basename(rel.replace(/\\/g, '/'))); return p ? { ...p, rel } : null; };
    // Import order = the ORIGINAL stream order. Our own names carry the source stream index in their s<index> anchor, and that is the whole point of it:
    // a round trip should hand the tracks back in the order it found them, not in the order their names happen to sort (a plain lexical sort puts s11
    // ahead of s2). A server-native sidecar has no anchor, so it has no original position to restore and goes after the ones that do. The relative path
    // breaks ties, keeping the result identical on every node whatever order a filesystem lists entries in - which is what the scan's own sort is for.
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
            { encoding: 'utf8', timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
        if (r.error || r.status !== 0) return null;
        try { const j = JSON.parse(r.stdout); return Array.isArray(j.streams) ? { streams: j.streams, tags: j.format?.tags || {} } : null; } catch (e) { return null; }
    };

    // The CONTENT of every embedded text subtitle, as a sha1 keyed by source stream index. This is the only sound answer to "is this sidecar already in the
    // file". Metadata cannot answer it in either direction: retitling a sidecar changes every visible field while the text stays identical, and two tracks
    // can share a language and title while holding completely different text. One ffmpeg run extracts them all in a SINGLE pass, re-encoded through the same
    // codec->format map the sidecars were written with, so the bytes are directly comparable - measured identical across a -c copy remux on jellyfin-ffmpeg
    // for both srt and ass. The cost is one sequential read of the file (0.3s on an 885MB mkv from cache, and the import mux reads AND writes it anyway),
    // which is why callers only reach it with deduplicate enabled and a candidate that could actually be a duplicate. An empty map means "asked, found
    // nothing"; null means the probe could not run at all, and every caller must read that as "cannot prove anything" and import - a redundant track is
    // recoverable, a dropped one is not.
    let embeddedHashCache;
    const embeddedTextHashes = (subs) => {
        if (embeddedHashCache !== undefined) return embeddedHashCache;
        embeddedHashCache = null;
        const target = String(file._id || file.file || libFilePath || '');
        const wanted = subs.filter((s) => isTextSub(s.codec_name));
        if (!target || !wanted.length) { embeddedHashCache = new Map(); return embeddedHashCache; }
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
        const r = spawnSync(String(otherArguments?.ffmpegPath || 'ffmpeg'), args, { encoding: 'utf8', timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
        if (!r.error && r.status === 0) {
            const map = new Map();
            for (const [idx, out] of outs) {
                try { map.set(idx, crypto.createHash('sha1').update(fs.readFileSync(out)).digest('hex')); } catch (e) { /* a stream that wrote nothing simply has no hash, and matches nothing */ }
            }
            embeddedHashCache = map;
        }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort - a temp dir left behind is harmless */ }
        return embeddedHashCache;
    };

    // deduplicate=enabled_embedded: the same duplicate test turned on the file's OWN tracks. Two subtitle streams holding identical text are one
    // subtitle stored twice, however their tags read, and this is the only place in the plugin that removes a subtitle the user did not ask to extract -
    // which is exactly why it is its own opt-in value rather than part of `enabled`. The survivor is chosen by the rule the sidecar groups already use, so
    // there is nothing new to learn: lowest source index wins, and it inherits the union of the group's flags plus the first title and first real language
    // any member carries. Nothing is lost by dropping the others - identical text, and every tag folded onto the keeper. Returns the source indices to drop
    // and, only when the union actually differs from what the keeper already has, the metadata to restamp it with.
    const dedupeEmbeddedSubs = (subs) => {
        const hashes = embeddedTextHashes(subs);
        const out = { dropIdx: [], retag: null, log: '' };
        if (!hashes || hashes.size < 2) return out;
        const byHash = new Map();
        for (const s of subs) { const h = hashes.get(s.index); if (!h) continue; if (!byHash.has(h)) byHash.set(h, []); byHash.get(h).push(s); }
        for (const g of byHash.values()) {
            if (g.length < 2) continue;
            const ordered = g.slice().sort((a, b) => a.index - b.index);
            const keep = ordered[0]; const drop = ordered.slice(1);
            out.dropIdx.push(...drop.map((s) => s.index));
            out.log += `☐${streamTag(keep.index)}[deduplicate=enabled_embedded] Removing ${drop.length} duplicate subtitle stream${drop.length === 1 ? '' : 's'} (${drop.map((s) => `s${s.index}`).join(', ')}) - byte-identical to this one\n`;
            // `default` is the one flag NOT unioned. It is not a property of the subtitle, it is a statement about which track a player should pick, and
            // this plugin does not track it anywhere else for exactly that reason - muxers auto-manage it (mp4 forces it onto the first subtitle) and
            // stream_ordering decides it last. Folding it would let a duplicate hand the survivor a default flag it never had, silently changing what plays.
            // So the keeper simply keeps its own, and the disposition write below - which replaces the whole set - neither invents nor strips it.
            const disp = new Set(ordered.flatMap((s) => Object.keys(s.disposition || {}).filter((k) => s.disposition[k] === 1)));
            disp.delete('default');
            if (keep.disposition?.default === 1) disp.add('default');
            const title = ordered.map((s) => s.tags?.title || '').find(Boolean) || '';
            const lang = ordered.map((s) => resolveLang(s) || '').find((l) => l && l !== 'und') || (resolveLang(keep) || 'und');
            const keepDisp = new Set(Object.keys(keep.disposition || {}).filter((k) => keep.disposition[k] === 1));
            const sameDisp = keepDisp.size === disp.size && [...disp].every((k) => keepDisp.has(k));
            if (sameDisp && (keep.tags?.title || '') === title && langKey(resolveLang(keep) || 'und') === langKey(lang)) continue;
            out.retag = (out.retag || []).concat([{ index: keep.index, lang, title, disp: [...disp] }]);
            out.log += `☐${streamTag(keep.index)}[deduplicate=enabled_embedded] Folding the removed streams' tags onto it (${[lang, title, ...disp].filter(Boolean).join(' ')})\n`;
        }
        return out;
    };

    // Does a marker-listed sidecar RESEMBLE something in the file? The marker records what the last import muxed and NOTHING ever clears it, so an extract
    // pass strips the subtitles and leaves a tag behind still naming them, and the marker VALUE is ordinary container metadata any file can carry. Both
    // readers therefore confirm it against the streams as they stand rather than trusting it. This is the METADATA half: an embedded subtitle matches on
    // language + title, the identity our own import writes. On an mp4/mov target the container DROPS per-stream subtitle titles on the -c copy mux, so a
    // re-probe cannot see the title - there we match on LANGUAGE alone, else a titled sidecar we DID embed never matches its now-title-less stream. A bundle
    // additionally has to see a font attachment in the file: carrying fonts is its whole reason to exist, so confirming only its subtitle would let the
    // archive go while the styling stayed broken. Metadata can only ever say "something like this is here", never "this one is here" - a sidecar the user
    // edited keeps its name and matches just as well - so it decides alone only for a bundle (an archive is not comparable text) or when the text cannot be
    // read at all. Otherwise both readers require the sidecar's own bytes to be one of the tracks.
    const markerConfirmsEmbedded = (f, subs, anyFont, mp4Target) => (!f.bundle || anyFont) && subs.some((s) =>
        langKey(resolveLang(s) || 'und') === langKey(f.lang || 'und') && (mp4Target || (s.tags?.title || '') === (f.title || '')));

    // The subtitle list is a file the USER may have typed into, so it is only ever removed once it demonstrably has nothing left to say: every name in it is
    // gone from disk, AND at least one of those names was a sidecar we actually embedded. Both halves matter. The first makes a hand-added or mistyped line
    // protective - it names a file that is still there, so the list stays and the user can fix it. The second proves the list did its job rather than being a
    // list of names that never existed. Deliberately NOT conditioned on method_unmapped: a list written by a text_file run and then imported through mount is
    // exactly as spent, and leaving it behind only misleads a later pass. Nothing is lost either way, since a text_file extract seeds a fresh one when it
    // next needs it.
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

    // import_remove_sidecar's actual deletion. Called ONLY from the post-processing pass, once Tdarr has accepted the transcode and moved it into the
    // library, so the embedded copy is the one that survives. This unlink is the one irreversible thing the plugin does, so each marker-listed sidecar has to
    // be proved against the accepted file's own text before it goes; the marker VALUE still scopes deletion to names we listed, so no file outside this
    // video's sidecars is ever a candidate. A false negative merely keeps the sidecar (a later pass, or the user, removes it) and never loses subtitle
    // content, so this fails safe.
    const deleteImportedSidecars = (streamList, globalTags, mp4Target) => {
        const delReason = 'import_remove_sidecar=true';   // this pass only runs when removal is on
        const marked = new Set(decodeMarkerList(getTagCI(globalTags || {}, 'awk_sub_worker')));
        if (!marked.size) return { deleted: 0, log: '' };
        const scan = scanSidecarDirs();
        if (scan.err) return { deleted: 0, log: `☒[${delReason}] Cannot read the library directory to remove imported sidecars: ${scan.err.message || scan.err}\n` };
        const embedded = streamList.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle');
        const anyFont = streamList.some((s) => (s.codec_type || '').toLowerCase() === 'attachment' && isFontAttachment(s));
        // Language + title is a proxy for "this is in the file"; the TEXT is the fact itself, and only the fact may authorise an unlink. So the content test
        // is the PRIMARY one for every ordinary sidecar, and the metadata match survives only as the fallback the content cannot cover: a bundle (an .mks is
        // an archive, and its fonts are what the metadata path checks for) and a probe that could not run at all. This is also what lets a copy the user named
        // themselves be cleaned up: its title matches no track by construction, yet its content is provably one of them. The hashes cost one pass over the
        // accepted library file, now paid by every successful round trip rather than only by the ones metadata could not vouch for - the price of never
        // unlinking a sidecar on a resemblance. `confirmed` returns the REASON it may go, so the deletion line reports what was actually proved.
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
            const metaOnly = f.bundle || !hashes || !hashes.size;   // an archive, or a probe that could not run - the two cases the text cannot settle
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


    const parseLangFilter = (v) => { const l = String(v || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean); return l.length ? new Set(l.map(langKey)) : null; };   // keys, so en/eng/English match
    // Synthetic stream so a not-yet-muxed sidecar renders through summariseStream in the expected-results line.
    const sidecarToStream = (f) => {
        const codec = (f.bundle || f.ext === 'ass') ? 'ass' : (f.ext === 'srt' ? 'subrip' : 'webvtt');   // a bundle always carries a styled subtitle
        const disposition = {}; for (const d of DISPOSITIONS.concat(EXTRA_DISPOSITIONS)) if ((f.dispTokens.concat(f.extraTokens || [])).includes(d.token)) disposition[d.ff] = 1;
        return { codec_type: 'subtitle', codec_name: codec, index: -1, tags: { language: f.lang, title: f.title }, disposition };
    };

    // ============= guards + input validation (before the try, per the suite's failFile convention) =============
    // WHICH STAGE this is. The plugin declares no Stage, so Tdarr runs it in both stacks (each runner accepts Stage === undefined), and the two are told
    // apart by what otherArguments carries: post-processing is handed exactly {homePath, handbrakePath, ffmpegPath, mkvpropeditPath, originalLibraryFile}.
    // homePath is the discriminator because it is POSITIVE evidence of that stage - it appears nowhere else. Testing for the ABSENCE of configVars/job
    // instead would misread any caller that simply passes less: the flow shim runs classic plugins with no configVars at all, and would then take the
    // delete-only path on a normal transcode. The two negatives stay as corroboration, so a future release that adds homePath to pre-processing cannot
    // silently flip the branch. This stage can legitimately arrive without ffProbeData (probeCurrentFile falls back to ffprobe), so the probe guard below
    // belongs to pre-processing alone.
    const isPostProcessing = !!otherArguments?.homePath && !otherArguments?.configVars && !otherArguments?.job;
    if (!isPostProcessing && (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))) failFile('No ffProbe stream data available, cannot process this file');
    const action = String(inputs.action);
    if (action !== 'extract' && action !== 'import') failFile(`[action=${action}] invalid value, check your settings`);
    // Deleting the sidecar FILES is import_remove_sidecar's decision alone in every mode - this setting only ever decides what counts as a duplicate. An
    // unrecognised value FAILS the file rather than falling through to a default, since the three modes do materially different amounts of work and a typo
    // must not quietly pick one. The failFile message shows the RAW inputs value.
    const dedupeMode = String(inputs.deduplicate || 'enabled').toLowerCase().trim();
    if (!['disabled', 'enabled', 'enabled_embedded'].includes(dedupeMode)) failFile(`[deduplicate=${inputs.deduplicate}] invalid value, check your settings`);
    const dedupeSidecars = dedupeMode !== 'disabled';        // both enabled values collapse byte-identical sidecars and skip one already embedded
    const dedupeStreams = dedupeMode === 'enabled_embedded'; // only this one also removes a duplicate the file already carries
    if (!['error', 'mount', 'text_file'].includes(unmappedMode)) failFile(`[method_unmapped=${inputs.method_unmapped}] invalid value, check your settings`);
    const metadataMode = String(inputs.method_import_metadata || 'embedded').toLowerCase();
    if (!['embedded', 'sidecar'].includes(metadataMode)) failFile(`[method_import_metadata=${inputs.method_import_metadata}] invalid value, check your settings`);
    if (file.fileMedium && file.fileMedium !== 'video') { response.infoLog += '☑Not a video file - skipping\n'; return response; }
    // A language token that is not a language FAILS the file. only_languages scopes which subtitles are touched at all, so a typo ('eng,fer') silently matches
    // nothing and every subtitle in that language is quietly left out of the extract - the user gets a clean run that did none of the work they asked for, with
    // no way to tell it apart from a file that genuinely had no such subtitle. Stopping is the far cheaper failure. The und/mul/zxx/mis/qaa-qtz allowance is
    // load-bearing, NOT laxness: the filter is compared against langKey(resolveLang(s) || 'und'), so scoping on 'und' is how untagged subtitles are selected.
    const knownLangToken = (key) => key === 'und' || key === 'mul' || key === 'zxx' || key === 'mis' || /^q[a-t][a-z]$/.test(key) || !!langDisplayName(key);
    const onlyLangRaw = String(inputs.only_languages || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const tok of onlyLangRaw) if (!knownLangToken(langKey(tok))) failLangToken('only_languages', tok);

    const streams = (file.ffProbeData && file.ffProbeData.streams) || [];   // [] only in post-processing, which reads the file through probeCurrentFile instead
    const langFilter = parseLangFilter(inputs.only_languages);
    const removeAfterExtract = String(inputs.extract_remove_stream) === 'true';
    const removeSidecarAfterImport = String(inputs.import_remove_sidecar) === 'true';
    const dstContainer = String(file.container || '').toLowerCase().trim();
    const isMp4 = isMp4Family(dstContainer);   // shared checker; cached once for this container

    // ============= POST-PROCESSING: remove sidecars now that the import is ACCEPTED =============
    // The only hook that runs after Tdarr's accept gate, and so the only place import_remove_sidecar may act. Deleting during pre-processing would
    // destroy the sidecars of a transcode the user then REJECTS: the muxed copy goes with the work directory and the library file never had those
    // subtitles, so they would exist nowhere. This stage also runs SERVER-side, which is what lets it clean up on behalf of an UNMAPPED node - the file
    // API offers upload and download but nothing that removes a path, while the server simply has the library on disk.
    // Nothing here may throw: the post-processing runner swallows exceptions, so a throw would be invisible. Nothing here needs to either - a delete that
    // fails leaves a sidecar the marker already excludes from re-import, and the next pass over this file retries it.
    if (isPostProcessing) {
        // Only the import workflow ends in a deletion. In extract mode this pass must do nothing at all: extract WRITES the sidecars, and with
        // extract_remove_stream off the embedded subtitles stay too - so a stale marker from an earlier import would confirm against those still-embedded
        // streams and delete the sidecar that was just written.
        if (action !== 'import') { response.infoLog += `☑[action=${action}] Nothing for post-processing to do outside import\n`; return response; }
        if (!removeSidecarAfterImport) { response.infoLog += '☑[import_remove_sidecar=false] Imported sidecars left on disk\n'; return response; }
        const probed = probeCurrentFile();
        if (!probed) { response.infoLog += '☒[import_remove_sidecar=true] Cannot read the accepted file to confirm what is embedded - every sidecar is left in place\n'; return response; }
        const { deleted, log } = deleteImportedSidecars(probed.streams, probed.tags, isMp4);
        response.infoLog += log ? `☑[import_remove_sidecar=true] Working in ${workLibDir()}\n${log}` : `☑[import_remove_sidecar=true] No imported sidecar is waiting to be removed\n`;
        return response;
    }
    // Preserve Dolby Vision's dvcC/dvvC boxes on either -c copy remux below (see dvStrictMp4Arg) - a plain copy of a DV HEVC/AV1 stream drops them,
    // demoting DV to plain HEVC/AV1.
    const dvStrictArg = dvStrictMp4Arg(dstContainer, streams);
    // Commit a built output-side arg string as the run: append the DV strict flag, then (mp4 only) -movflags use_metadata_tags so a -c copy keeps sibling
    // plugins' global awk_* tags (awk_video/awk_recovered), then the universal output options - and set response.processFile, Tdarr's go/no-go switch, so
    // calling this IS the commit point for the whole run. Shared by the extract and import branches so their tails can't drift.
    // The stream-summary token line. The input summary and both "Expected results" summaries are meant to be the SAME view of the stream set before and
    // after, and the two expected-results lines sit in mutually exclusive branches - so three hand-typed copies could drift in a way only one run type shows.
    const summariseAll = (list) => list.map((s) => summariseStream(enrichStream(s))).join('');
    const commitPreset = (out) => {
        let full = out + dvStrictArg;
        if (isMp4) full += ' -movflags use_metadata_tags';
        full += globalOutputOpt;
        response.preset = `<io>${full}`;
        response.processFile = true;
    };

    try {
        response.infoLog += `☐Input streams: ${summariseAll(streams)}\n`;

        if (action === 'extract') {
            // ============= EXTRACT: embedded text subs -> sidecars (+ optional removal) =============
            // Duplicate tracks the file already carries go before anything else: a dropped stream must not also be written to a sidecar, or the copy we just
            // decided was redundant comes straight back on the next import under a name of its own.
            const dupes = dedupeStreams ? dedupeEmbeddedSubs(streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle')) : { dropIdx: [], retag: null, log: '' };
            response.infoLog += dupes.log;
            const eligible = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle' && isTextSub(s.codec_name)
                && !dupes.dropIdx.includes(s.index)
                && !(langFilter && !langFilter.has(langKey(resolveLang(s) || 'und'))));
            if (!eligible.length && !dupes.dropIdx.length) { response.infoLog += '☑No text subtitles to extract\n'; return response; }

            // method_unmapped=mount on a node where the mount is not actually there. Extract does not need it - the file API still lands every sidecar in the
            // library - so failing here would be gratuitous when the work can be done. But it must not pass in silence: the user asked for a mount, the mount
            // is not working, and the next IMPORT pass hard-fails on this very thing (there the directory is the only way to FIND sidecars, so there is
            // nothing to fall back to). Same wording as that failure, so the two read as one problem.
            if (isUnmappedNode && unmappedMode === 'mount' && !mountedLib().dir) {
                response.infoLog += `☒[method_unmapped=mount] Could not reach the library from this node - ${mountedLib().why}\n`;
                response.infoLog += '☒[method_unmapped=mount] Placing sidecars through the file API instead; import will FAIL on this node until the mount works\n';
            } else if (isUnmappedNode && unmappedMode === 'mount') {
                response.infoLog += `☑[method_unmapped=mount] Writing to the library at ${mountedLib().dir} (via ${mountedLib().via})\n`;
            }

            // A styled subtitle is exported as a .mks BUNDLE carrying the subtitle plus every font attachment, because those fonts exist nowhere else
            // (see BUNDLE_EXT). Loose text sidecars stay the default for everything else: a plain srt, and an ass/ssa in a file with no fonts, have
            // nothing to carry and are far more useful as editable text on disk.
            const fontIndices = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'attachment' && isFontAttachment(s)).map((s) => s.index);
            const fontMaps = fontIndices.map((i) => ` -map 0:${i}`).join('');

            // sidecarOut carries the extra ffmpeg outputs that write the sidecars on a MAPPED node. On an unmapped node it stays empty and the same
            // extractions are collected in placeJobs instead, to be run and uploaded by placeSidecars once the loop has seen every stream.
            let sidecarOut = ''; const removeIdx = [...dupes.dropIdx]; let wrote = 0; let skipped = 0; let unsafe = 0; let bundled = 0;
            const placeJobs = [];
            for (const s of eligible) {
                const { enc } = TEXT_SUB[String(s.codec_name).toLowerCase()];
                const bundle = fontIndices.length > 0 && isStyledSub(s.codec_name);
                const name = sidecarBasename(s, bundle);
                const full = path.join(workLibDir(), name);
                // The path goes into the quoted "${full}" token of the extract preset, so it has to survive Tdarr's quote-aware tokenizer
                // (pathIsPresetSafe). Only the library directory can fail that - the name we build is already sanitised - and a directory has to stay
                // literal, so the extract is skipped instead. The stream is NOT pushed to removeIdx either: a refused extract must never strip the
                // embedded track, which would then be the only remaining copy.
                if (!pathIsPresetSafe(full)) {
                    unsafe += 1;
                    response.infoLog += `☒${streamTag(s.index)} Library directory contains a quote or control character - cannot write ${name} safely, keeping the embedded subtitle\n`;
                    continue;
                }
                // An unmapped node cannot reach the library to test or write the sidecar locally, so both happen through the server. With no translator
                // claiming the path there is no server-side destination at all, and the extract is refused exactly as an unsafe path is.
                const remoteDest = placeViaApi() ? serverSidePath(full) : '';
                if (placeViaApi() && !remoteDest) {
                    unsafe += 1;
                    response.infoLog += `☒${streamTag(s.index)} No path translator maps this library directory back to the server - cannot write ${name}, keeping the embedded subtitle\n`;
                    continue;
                }
                // An existing sidecar is preserved (never overwrite a user's on-disk edits) - but only if it has
                // content. A 0-byte sidecar is the fingerprint of a prior extract ffmpeg aborted mid-write; trusting
                // it and then stripping the embedded source would lose the subtitle, so re-extract it instead.
                const existsNonEmpty = placeViaApi() ? sidecarExistsRemote(remoteDest)
                    : (fs.existsSync(full) && (() => { try { return fs.statSync(full).size > 0; } catch { return false; } })());
                if (existsNonEmpty) { skipped += 1; response.infoLog += `☑${streamTag(s.index)} Sidecar already exists, not overwriting: ${name}\n`; }
                // Unmapped: the extraction is deferred to placeSidecars after the loop, so this stream's removeIdx entry and its bundled tally wait for
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
                    response.infoLog += `☐${streamTag(s.index)} Extract -> ${name} (styled subtitle bundled with ${fontIndices.length} font${fontIndices.length === 1 ? '' : 's'})\n`;
                }
                else { sidecarOut += ` -map 0:${s.index} -c:s ${enc} "${full}"`; wrote += 1; response.infoLog += `☐${streamTag(s.index)} Extract -> ${name}\n`; }
                if (bundle) bundled += 1;
                if (removeAfterExtract) removeIdx.push(s.index);
            }
            // Unmapped node: the deferred extractions run HERE, in one ffmpeg pass, and each result is uploaded to the library. Only a sidecar the server
            // confirms in place counts as written and earns its stream a removal - a failure logs ☒ and keeps that subtitle embedded, so the worst case
            // is an unextracted subtitle rather than a lost one.
            if (placeJobs.length) {
                const { placed, failed } = placeSidecars(placeJobs);
                for (const j of placeJobs) {
                    if (!placed.has(j.name)) {
                        unsafe += 1;
                        response.infoLog += `☒${streamTag(j.index)} Could not place ${j.name} in the library - ${failed.get(j.name)}, keeping the embedded subtitle\n`;
                        continue;
                    }
                    wrote += 1;
                    if (j.bundle) bundled += 1;
                    if (removeAfterExtract) removeIdx.push(j.index);
                    const bundleNote = j.bundle ? ` (styled subtitle bundled with ${fontIndices.length} font${fontIndices.length === 1 ? '' : 's'})` : '';
                    response.infoLog += `☑${streamTag(j.index)} Extracted -> ${j.name}${bundleNote}\n`;
                }
                // Seed the import list with what just landed, so a node that can only reach the library by name has somewhere to look. Written once and
                // never again: from here it belongs to the user, who adds their own OCR'd subtitles to it.
                if (unmappedMode === 'text_file') {
                    const placedNames = placeJobs.filter((j) => placed.has(j.name)).map((j) => j.name);
                    const why = placedNames.length ? seedSubtitleList(placedNames) : 'nothing was placed to list';
                    if (!why) response.infoLog += `☑[method_unmapped=text_file] Created ${videoBase}${SUBTITLE_LIST_SUFFIX} listing ${placedNames.length} sidecar${placedNames.length === 1 ? '' : 's'} - edit it to add your own\n`;
                    else if (why !== 'exists' && why !== 'nothing was placed to list') response.infoLog += `☒[method_unmapped=text_file] Could not create ${videoBase}${SUBTITLE_LIST_SUFFIX} - ${why}\n`;
                }
            }
            // The fonts leave with the styled subtitles that need them, but only once a bundle actually holds them (bundled) and no styled subtitle is
            // left behind to use them - one kept by only_languages, or every track kept by extract_remove_stream=false. Removing them here just makes the
            // container consistent a pass earlier: with no ASS/SSA left they are orphaned, and clean_and_remux would remove them anyway.
            if (removeAfterExtract && bundled
                && !streams.some((s) => (s.codec_type || '').toLowerCase() === 'subtitle' && isStyledSub(s.codec_name) && !removeIdx.includes(s.index))) {
                for (const idx of fontIndices) removeIdx.push(idx);
                response.infoLog += `☐[extract_remove_stream=true] Removing ${fontIndices.length} font attachment${fontIndices.length === 1 ? '' : 's'} - now archived in the styled-subtitle bundle\n`;
            }
            if (titleTruncated) response.infoLog += '☒A subtitle title was too long for the filename and was truncated\n';
            // sidecarOut rather than wrote, because on an unmapped node the sidecars are already written and only a removal still needs a remux: with
            // extract_remove_stream off there is then genuinely nothing left for ffmpeg to do, and emitting a whole-file copy would earn nothing.
            // Three distinct endings, and only one of them is a failure: extraction that was ASKED FOR and left NOTHING in the library - every eligible
            // subtitle refused, whether by an unsafe library path or a placement that would not land. Returning processFile:false there files the video
            // under success and the subtitles are never extracted, with nothing to draw the eye. A run where some sidecars did land keeps going and carries
            // its ☒ lines into a successful log; that is a partial result, not a failed one - and a sidecar an earlier pass already placed (skipped) is
            // landed just as much as one written this pass, since sitting in the library is the only property the rest of the round trip depends on.
            if (!sidecarOut && !removeIdx.length) {
                if (unsafe && !wrote && !skipped) failFile('No subtitle could be extracted - every eligible subtitle was refused, see the reasons above');
                response.infoLog += wrote ? '☑[extract_remove_stream=false] Sidecars placed in the library - nothing left to remux\n'
                    : '☑All eligible subtitles already extracted\n';
                return response;
            }

            let out = `${sidecarOut} -map 0`;
            for (const idx of removeIdx) out += ` -map -0:${idx}`;
            out += ' -c copy';
            // A folded tag set is addressed by the keeper's position among the SURVIVING subtitle streams, which is what -map 0 minus the drops leaves.
            const keptSubs = streams.filter((s) => !removeIdx.includes(s.index) && (s.codec_type || '').toLowerCase() === 'subtitle');
            for (const r of dupes.retag || []) {
                const n = keptSubs.findIndex((s) => s.index === r.index);
                if (n < 0) continue;
                out += ` -metadata:s:s:${n} "language=${escMeta(isMp4 ? to6392T(r.lang) : normSidecarLang(r.lang))}"`;
                out += ` -metadata:s:s:${n} "title=${escMeta(r.title || '')}"`;
                out += ` -disposition:s:${n} ${r.disp.length ? r.disp.join('+') : '0'}`;
            }
            commitPreset(out);
            const survivors = streams.filter((s) => !removeIdx.includes(s.index));
            response.infoLog += `☑Expected results: ${summariseAll(survivors)}\n`;
            return response;
        }

        // ============= IMPORT: sidecars -> embedded (+ safe deletion) =============
        // The global marker VALUE lists the basenames muxed in the prior pass, so pass 2 deletes exactly what pass 1
        // embedded (never a pre-existing collision) and never re-adds them - robust even where a container drops
        // per-stream title/default (mp4). Tdarr only re-runs after a SUCCESSFUL mux, so a listed sidecar is safely in.
        const importedSet = new Set(decodeMarkerList(getTagCI(file.ffProbeData.format?.tags || {}, 'awk_sub_worker')));

        // Import discovers sidecars by SCANNING the library directory, and an unmapped node has no view of it - libDir there is the node-local mirror
        // Tdarr downloads into, so the scan would read back only the video it was given. The file API cannot stand in: it addresses one known path at a
        // time (upload/download) and offers no directory listing, while a sidecar's name encodes language, flags and title, so there is nothing
        // enumerable to ask for.
        // method_unmapped decides which of the three ways out applies. Whatever happens, a mode that cannot do the job FAILS the file rather than skipping:
        // the user asked for import, and processFile:false is Tdarr's "no work needed" signal, so returning it would file the video under success and leave
        // a silently un-imported library nobody has reason to look at.
        let listedRels = null;   // non-null once method_unmapped=text_file has supplied the names, since there is no directory to scan
        if (isUnmappedNode) {
            if (unmappedMode === 'error') {
                failFile('[method_unmapped=error] This node is unmapped and cannot see the library to find sidecars - set method_unmapped to mount or text_file, or run import on a node that shares the library filesystem');
            }
            if (unmappedMode === 'mount' && !mountedLib().dir) failFile(`[method_unmapped=mount] Could not reach the library from this node - ${mountedLib().why}`);
            if (unmappedMode === 'mount') response.infoLog += `☑[method_unmapped=mount] Reading the library at ${mountedLib().dir} (via ${mountedLib().via})\n`;
            // Nothing below this point can tell you WHERE a sidecar came from unless the mode that found it says so, and every route deserves that line -
            // an import that reads the wrong directory looks exactly like one that read the right one and found nothing.
            if (unmappedMode === 'text_file') {
                // No directory access at all here, so the list IS the discovery: each name is fetched from the server by path. The file itself is read the
                // same way, which is why it has to sit at a name we can compute rather than one we would have to go looking for.
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
                    response.infoLog += `☑[method_unmapped=text_file] No ${listName} in the library, so there is nothing listed to import - extract creates one when it writes sidecars, or add it yourself with one filename per line\n`;
                    listedRels = [];   // nothing to import - but the file's own duplicate subtitle streams are still worth collapsing, so fall through
                }
                if (listedRels === null) {
                    let listText = '';
                    try { listText = fs.readFileSync(listLocal, 'utf8'); } catch (e) { failFile(`[method_unmapped=text_file] Fetched ${listName} but could not read it back: ${e && e.message ? e.message : e}`); }
                    const parsed = readSubtitleList(listText);
                    for (const [entry, why] of parsed.bad) response.infoLog += `☒[method_unmapped=text_file] Ignoring "${entry}" in ${listName} - ${why}\n`;
                    // An empty list is the same "nothing to import" as no list at all - a user who emptied it, or left only comments, has said so. A list whose
                    // every line was REJECTED is different: those were written with intent and not one can be used, which is a mistake worth stopping on.
                    if (!parsed.ok.length && parsed.bad.length) failFile(`[method_unmapped=text_file] ${listName} lists no usable filenames - every line was rejected, see above`);
                    if (!parsed.ok.length) {
                        response.infoLog += `☑[method_unmapped=text_file] ${listName} lists no filenames, so there is nothing to import - add one filename per line\n`;
                        listedRels = [];
                    } else {
                        listedRels = fetchListedSidecars(parsed.ok, listName, importedSet);
                        // Names an earlier pass already embedded and removed are not a shortfall, so they count out of the total rather than reading as failures.
                        const spent = parsed.ok.filter((rel) => importedSet.has(rel) && !listedRels.includes(rel)).length;
                        const wanted = parsed.ok.length - spent;
                        response.infoLog += `☑[method_unmapped=text_file] Read ${parsed.ok.length} filename${parsed.ok.length === 1 ? '' : 's'} from ${listName}, fetched ${listedRels.length} of the ${wanted} still to import${spent ? ` (${spent} already embedded and removed)` : ''}\n`;
                    }
                }
            }
        }

        // The mapped route had nothing to say for itself, which is the one case where naming the directory matters MOST: it is the only route that can end up
        // reading a node-local mirror while looking exactly like a healthy run. Sidecars found there import, compare and delete perfectly well - against the
        // wrong copy of the library. So every route now prints its source, and the two unmapped ones above have already printed theirs.
        // ...and it says so when it does not KNOW. Node type comes from otherArguments.configVars, which only the classic worker supplies - a caller that
        // passes less (the flow shim passes no configVars at all) leaves an unmapped node indistinguishable from a mapped one, and the mapped assumption
        // then points every read and every delete at the mirror. Naming both the directory and the missing configuration turns that into one visible line.
        if (!isUnmappedNode) response.infoLog += `☑Reading sidecars from ${workLibDir()}${otherArguments?.configVars ? '' : ' (node type unknown - Tdarr passed no node configuration for this run)'}\n`;
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
                response.infoLog += `☑[only_languages=${String(inputs.only_languages ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}] Skipping ${f.rel} - ${f.lang} is not in the list\n`;
                return false;
            })
            // An mp4-family target carries no font attachments at all, so importing a styled-subtitle bundle there would embed the subtitle and strand
            // its fonts - and import_remove_sidecar would then delete the only copy that has them. Leave the bundle untouched on disk instead
            // (dropping it from `found` also keeps it out of the deletion pass below); remux the file to mkv and run import again to restore it.
            .filter((f) => {
                if (!f.bundle || !isMp4) return true;
                response.infoLog += `☒Cannot import ${f.rel} - an ${dstContainer} target carries no font attachments, keeping the styled-subtitle bundle on disk\n`;
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
            // remove_imagesubs=export writes ".<video>.<lang>.mks" for VobSub/DVB and waits on an external OCR pass, so warning about it every run, forever,
            // would be noise. Our own bundles are dot-prefixed too, but they parse and never reach this line.
            // A hidden TEXT sidecar named after THIS video is the exception: that is the OCR coming back, it is importable now, so a name that still fails to
            // parse is a genuine mistake (a bad language token, a lost s<index>) and saying nothing would strand the work the user just did.
            if (relBase.startsWith('.') && !(TEXT_EXTS.includes(relExt) && relBase.slice(1).startsWith(`${videoBase}.`))) continue;
            if (TEXT_EXTS.includes(relExt) || relExt === BUNDLE_EXT) response.infoLog += `☒Not a recognised sidecar name, skipping: ${rel}\n`;
        }
        // This pass only ever ADDS subtitles to the file - it never deletes a sidecar. import_remove_sidecar acts in the post-processing branch
        // above, once the transcode has been accepted; unlinking here would destroy the sidecars of a run the user then rejects.
        const embeddedSubs = streams.filter((s) => (s.codec_type || '').toLowerCase() === 'subtitle');
        const hasFontAttachment = streams.some((s) => (s.codec_type || '').toLowerCase() === 'attachment' && isFontAttachment(s));
        // Duplicates the file already carries, removed here as well as on extract - they are a property of the file, not of a workflow. Every output index
        // below counts SURVIVING subtitle streams, since -map 0 minus these drops is what the muxer actually sees; using the unfiltered list would silently
        // retag or land tracks one slot off for every stream removed.
        const dupes = dedupeStreams ? dedupeEmbeddedSubs(embeddedSubs) : { dropIdx: [], retag: null, log: '' };
        response.infoLog += dupes.log;
        const keptSubs = embeddedSubs.filter((s) => !dupes.dropIdx.includes(s.index));

        // Nothing to import does not mean nothing to do: the file's OWN duplicate subtitle streams are a property of the file, not of the sidecars, so
        // they are still removed. Reaching the mux below requires a sidecar, and this is the one route to it that has none - a library with no sidecars at
        // all, or a round trip that has already finished and cleaned up after itself, would otherwise never have its duplicates collapsed.
        if (!found.length) {
            if (!dupes.dropIdx.length) { response.infoLog += '☑No subtitle sidecars found to import\n'; return response; }
            let dropOnly = ' -map 0';
            for (const idx of dupes.dropIdx) dropOnly += ` -map -0:${idx}`;
            dropOnly += ' -c copy';
            const survivingSubs = embeddedSubs.filter((x) => !dupes.dropIdx.includes(x.index));
            for (const r of dupes.retag || []) {
                const n2i = survivingSubs.findIndex((x) => x.index === r.index);
                if (n2i < 0) continue;
                dropOnly += ` -metadata:s:s:${n2i} "language=${escMeta(isMp4 ? to6392T(r.lang) : normSidecarLang(r.lang))}"`;
                dropOnly += ` -metadata:s:s:${n2i} "title=${escMeta(r.title || '')}"`;
                dropOnly += ` -disposition:s:${n2i} ${r.disp.length ? r.disp.join('+') : '0'}`;
            }
            commitPreset(dropOnly);
            response.infoLog += `☑Expected results: ${summariseAll(streams.filter((x) => !dupes.dropIdx.includes(x.index)))}\n`;
            return response;
        }

        // Import is NON-DESTRUCTIVE: every recognized sidecar not already handled by our own prior pass (marker) is muxed in. We do NOT suppress a
        // sidecar just because an embedded sub shares its lang|title|disposition - metadata can't prove same content, and dropping a distinct track is
        // data loss, whereas a redundant duplicate is not. Genuine duplication is collapsed by CONTENT instead (deduplicate, below).
        // The marker suppresses a re-import only while the file STILL CARRIES that subtitle - the metadata match here, plus the group's own text further
        // down. Suppressing on the marker alone would strand every sidecar of a second round trip: nothing clears the tag, so the extract that stripped the
        // subtitles left it naming them all, and the next import would skip the lot. Either way the decision is logged - "nothing happened" and "nothing
        // needed to happen" look identical from outside.
        // The import muxes each sidecar as -i "${libDir}/${name}"; a " or control char in that real on-disk path would close the quote and inject
        // ffmpeg args (see pathIsPresetSafe), and unlike a name we generate it must match the file byte-for-byte, so it can't be sanitised - skip it
        // instead (a server-native/user file we can't safely reference), never break out.
        const alreadyEmbedded = (f) => importedSet.has(f.rel) && markerConfirmsEmbedded(f, embeddedSubs, hasFontAttachment, isMp4);
        // A sidecar written with extract_remove_stream=false left the track it came from IN the file, so importing it adds a SECOND copy of that subtitle.
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
            response.infoLog += `☒Skipping sidecar with an unsafe filename (contains a quote or control character), cannot import safely: ${f.rel}\n`;
            return false;
        });

        // Group candidates by byte-identical file content (disabled => every file is its own group). A file whose bytes cannot be read - gone since the
        // readdir, or too large to be a subtitle at all - gets a unique key, so it is imported on its own, never silently dropped or merged.
        const contentKey = (f) => sidecarSha1(f.rel) || `unreadable:${f.rel}`;
        const groups = []; const groupHash = new Map();
        if (!dedupeSidecars) { for (const f of candidates) groups.push([f]); }
        else { const byHash = new Map(); for (const f of candidates) { const h = contentKey(f); let g = byHash.get(h); if (!g) { g = []; byHash.set(h, g); groups.push(g); groupHash.set(g, h); } g.push(f); } }

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
            return all && new Map([...all].filter(([idx]) => !dupes.dropIdx.includes(idx)));
        };
        // The marker names what an earlier import muxed; it cannot say whether the file still holds that TEXT, and a sidecar the user edited keeps its name.
        // So a group is only settled once its own bytes are one of the surviving tracks - otherwise an edit made between two passes would be skipped as
        // "already embedded" and silently never reach the file. A bundle is an archive rather than comparable text, and a probe that could not run proves
        // nothing either way, so both fall back to the marker's metadata match. Group-level by construction: every member of a group is byte-identical.
        const contentSettles = (f) => {
            if (f.bundle) return true;
            const eh = survivingTextHashes();
            if (!eh || !eh.size) return true;
            return [...eh.values()].includes(groupHash.get(f.members) || contentKey(f));
        };
        // The marker skip, now that a group has ONE identity. A group is done only when EVERY member is confirmed embedded AND the group's text is really
        // there: a partly-confirmed group still has something to say (its merged title or flags may not be on the track yet), and processing it is harmless
        // because its content is then found already embedded below. Skipping per FILE instead is what let two names for one subtitle take turns retagging the
        // track on alternate passes - which is why the content test is applied HERE, to a group that already has its identity, and never to a bare file.
        const settled = new Set(merged.filter((f) => f.members.every(alreadyEmbedded) && contentSettles(f)));
        for (const f of settled) {
            const names = f.members.length > 1 ? `${f.members.length} copies of it (${f.members.map((m) => m.rel).join(', ')})` : f.rel;
            response.infoLog += `☑Skipping ${names} - already embedded by an earlier pass\n`;
        }
        merged = merged.filter((f) => !settled.has(f));

        // Dedup does not stop at sidecar-vs-sidecar. A sidecar whose TEXT is already one of the embedded tracks is just as much a duplicate, and muxing it
        // leaves the file carrying the same subtitle twice - the state extract_remove_stream=false sets up, since the track stayed behind and the sidecar was
        // written from it. No metadata test can see this: retitling a sidecar changes every visible field while the text is untouched, and two tracks can
        // share a language and title while holding different text. So the content decides (the same surviving-track hashes the marker skip above reads, and
        // the same single ffmpeg pass). The sidecar still counts as consumed: its content is demonstrably in the file, and preserving the information is the
        // test - not which container it ends up living in.
        const embeddedHashes = (dedupeSidecars && merged.some((f) => !f.bundle)) ? survivingTextHashes() : new Map();
        // A bundle is an archive, not comparable text, so it is never matched this way. A null map means the probe could not run: nothing is proven, so
        // every sidecar imports exactly as before - a redundant track can be removed later, a dropped one cannot be recovered.
        const embeddedAt = (f) => {
            if (f.bundle || !embeddedHashes || !embeddedHashes.size) return null;
            const h = groupHash.get(f.members);
            if (!h) return null;
            for (const [idx, eh] of embeddedHashes) if (eh === h) return idx;
            return null;
        };
        // A track that is already in the file needs no mux, so the only open question is its METADATA - and unlike a new track, it has metadata of its own to
        // disagree with. method_import_metadata decides who wins. 'embedded' keeps the track's tags and reports the difference: a sidecar name is frozen at the
        // moment it was written, so an old one carries no token for a flag that did not exist yet, and applying it would STRIP that flag off a track that has
        // it. 'sidecar' makes the filename authoritative, which is what makes renaming a sidecar a way to retune the track already in the file - dispositions
        // included, written as an explicit 0 when the name carries none so a flag removed by renaming actually goes away. Comparison ignores per-stream titles
        // on mp4/mov, where the muxer drops them and a re-probe can never see one.
        const alreadyInFile = []; const toMux = []; let retuneMeta = '';
        for (const f of merged) {
            const at = embeddedAt(f);
            if (at === null) { toMux.push(f); continue; }
            f.embeddedAt = at;
            alreadyInFile.push(f);
            response.infoLog += `☑${streamTag(at)}[deduplicate=${dedupeMode}] ${f.rel} is already in the file byte-for-byte - not importing a second copy\n`;
            const cur = keptSubs.find((s) => s.index === at);
            const curTitle = isMp4 ? (f.title || '') : (cur?.tags?.title || '');
            const curDisp = new Set(Object.keys(cur?.disposition || {}).filter((k) => cur.disposition[k] === 1));
            const sameDisp = curDisp.size === f.disp.length && f.disp.every((k) => curDisp.has(k));
            if (curTitle === (f.title || '') && langKey(resolveLang(cur) || 'und') === langKey(f.lang || 'und') && sameDisp) continue;
            const named = [f.lang, f.title, ...f.disp].filter(Boolean).join(' ');
            if (metadataMode !== 'sidecar') {
                response.infoLog += `☒${streamTag(at)}[method_import_metadata=${metadataMode}] The sidecar name and the embedded track disagree on metadata - keeping the track's own (name: ${named})\n`;
                continue;
            }
            const outIdx = keptSubs.findIndex((s) => s.index === at);   // position among the subtitle streams that survive, which is what -map 0 minus the drops leaves
            retuneMeta += ` -metadata:s:s:${outIdx} "language=${escMeta(isMp4 ? to6392T(f.lang) : normSidecarLang(f.lang))}"`;
            retuneMeta += ` -metadata:s:s:${outIdx} "title=${escMeta(f.title || '')}"`;
            retuneMeta += ` -disposition:s:${outIdx} ${f.disp.length ? f.disp.join('+') : '0'}`;
            response.infoLog += `☐${streamTag(at)}[method_import_metadata=sidecar] Retagging the track already in the file from ${f.rel} (${named || 'no language, title or flags'})\n`;
        }

        // Sidecars that were only ever redundant, with nothing at all to mux alongside them. There is no transcode to wait on here, so the deletion the user
        // asked for happens now rather than in the post-processing pass that normally does it - and it is safe precisely because these files never entered
        // the marker: a sidecar this pass muxed is filtered out upstream by alreadyEmbedded, so anything reaching here had its content in the file BEFORE
        // this flow started, and is therefore in the accepted library copy no matter what the rest of the flow does or how it ends.
        // It requires REACHING the library, which placeViaApi() is exactly the negation of. Without that, workLibDir() is the node-local mirror: under
        // method_unmapped=text_file the sidecars there are the copies just downloaded to compare against, so unlinking them removes this run's own
        // scratch files and reports a deletion that never touched the library. Nor can the usual route stand in - the file API offers upload and download
        // but no delete, and with nothing to mux there is no transcode, no acceptance, and therefore no server-side post-processing pass to clean up
        // afterwards. Nothing can do this job from here, so it says so and leaves the sidecars alone rather than claiming a deletion it did not perform.
        // Both sidecar-cleanup shortcuts below require that the mux branch has nothing to do, so their condition must be the exact negation of its trigger
        // (toMux || retuneMeta || dupes.dropIdx) - a queued embedded-dedup drop is work on the FILE, independent of whether any sidecar still needs importing,
        // and returning here would discard it silently, leaving the duplicate in place with nothing logged.
        if (!toMux.length && !retuneMeta && !dupes.dropIdx.length && alreadyInFile.length && removeSidecarAfterImport && placeViaApi()) {
            const stranded = alreadyInFile.flatMap((f) => f.members.map((m) => m.rel));
            // Forcing twice for the same sidecar is worse than not forcing at all: Tdarr ERRORS a file whose consecutive passes emit identical arguments
            // (its own infinite-transcode-loop guard), so a repeat does not merely waste a remux, it quarantines the video. The marker is the record of
            // what an earlier pass already queued, and it is checked DIRECTLY here rather than through alreadyEmbedded, which cannot confirm a sidecar whose
            // decoded title differs from the track's - a hand-added copy under a name of the user's own choosing is exactly that, and would otherwise
            // re-force on every pass. Nothing is lost by stopping: that earlier pass's marker still names them, so post-processing deletes them when it runs.
            if (!stranded.some((rel) => !importedSet.has(rel))) {
                response.infoLog += '☑[import_remove_sidecar=true] Already queued for removal by an earlier pass - nothing more to do until the post-processing stage runs\n';
                response.infoLog += '☑Nothing to import - every sidecar was already in the file\n';
                return response;
            }
            // The only route left, so it is taken rather than offered. Post-processing runs SERVER-side, where the library is reachable, but it only runs
            // after a transcode is ACCEPTED - so a lossless copy of the whole file is emitted purely to reach that stage. Making this a setting would only
            // work for someone who already knew the trap existed, and by then they have been caught by it: asking for the sidecars to be deleted IS asking
            // for whatever it takes. It cannot repeat - the marker stamped here lists them, so the next pass filters them out through alreadyEmbedded before
            // this branch is reached, whether or not the deletion that follows actually succeeded. One extra pass per file, at most, ever.
            response.infoLog += '☒[import_remove_sidecar=true] Every sidecar is already in the file and this node cannot reach the library to delete them - remuxing losslessly, since only an accepted transcode gives the server a pass in which to do it\n';
            for (const rel of stranded) response.infoLog += `☐[import_remove_sidecar=true] Queued for removal once accepted: ${rel}\n`;
            commitPreset(` -map 0 -c copy -metadata "awk_sub_worker=${encodeMarkerList(stranded)}"`);
            response.infoLog += `☑Expected results: ${summariseAll(streams)}\n`;
            return response;
        }
        if (!toMux.length && !retuneMeta && !dupes.dropIdx.length && alreadyInFile.length && removeSidecarAfterImport) {
            let gone = 0; const removedRels = new Set();
            for (const rel of alreadyInFile.flatMap((f) => f.members.map((m) => m.rel))) {
                try { fs.unlinkSync(path.join(workLibDir(), rel)); gone += 1; removedRels.add(rel); response.infoLog += `☑[import_remove_sidecar=true] Deleted sidecar (its content is already in the file): ${rel}\n`; }
                catch (e) { response.infoLog += `☒[import_remove_sidecar=true] Could not delete sidecar ${rel}: ${e && e.message ? e.message : e}\n`; }
            }
            response.infoLog += deleteSpentSubtitleList('import_remove_sidecar=true', removedRels);   // same cleanup whichever route removed them
            response.infoLog += `☑Nothing to import - every sidecar was already in the file${gone ? `, ${gone} removed from ${workLibDir()}` : ''}\n`;
            return response;
        }

        // A retune is a mux of its own: no new inputs and no new maps, just the metadata of a stream that is already there. It rides the same output as any
        // real import when both are due, so a pass that adds one track and retags another does it in a single remux.
        if (toMux.length || retuneMeta || dupes.dropIdx.length) {
            // Mux one track per group. Extra -i inputs go on the OUTPUT side (main stays input 0). The marker lists EVERY consumed file (all group
            // members) so a re-run never re-imports them and the confirm pass can delete the whole deduplicated set; reQueue only when a delete is due.
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
                meta += ` -metadata:s:s:${outIdx} "language=${escMeta(isMp4 ? to6392T(f.lang) : normSidecarLang(f.lang))}"`;
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
                if (origin) response.infoLog += `☒${streamTag(origin.index)} Importing ${f.rel} as a SECOND copy - the stream it was extracted from is still in the file${embeddedHashes && embeddedHashes.size ? ' and its text differs' : ''}, so both will be present\n`;
                if (f.members.length > 1) response.infoLog += `☑[deduplicate=${dedupeMode}] Deduplicated ${f.members.length} byte-identical sidecars -> ${f.rel} (${f.lang}${flagText})\n`;
                response.infoLog += `☐Import ${f.rel} -> subtitle ${outIdx} (${f.lang}${flagText})${restoreFonts ? ' and its bundled font attachments' : ''}\n`;
            });
            // Consumed = every sidecar this pass accounted for, INCLUDING the ones already in the file. They are not muxed, but their content is provably
            // embedded, so listing them is what lets import_remove_sidecar clear them alongside the rest once the transcode is accepted.
            const consumed = toMux.concat(alreadyInFile).flatMap((f) => f.members.map((m) => m.rel));
            // Carry prior-pass marks forward for every sidecar STILL ON DISK and still confirmed embedded, so it stays in the skip set across incremental
            // passes (otherwise the next pass re-imports it as a duplicate track). Nothing is unlinked in this stage, so such a sidecar stays listed; one
            // the post-processing pass later deletes simply stops being found, and a marker entry naming a file that no longer exists - or one the file no
            // longer carries - is harmless either way, since the entry only counts while the confirmation agrees with it.
            const priorStillPresent = found.filter(alreadyEmbedded).map((f) => f.rel);
            const markList = [...new Set([...consumed, ...priorStillPresent])];
            for (const idx of dupes.dropIdx) extraMaps = ` -map -0:${idx}${extraMaps}`;   // drops first, so the -map 0 they subtract from is still the whole file
            for (const r of dupes.retag || []) {
                const n = keptSubs.findIndex((s) => s.index === r.index);
                if (n < 0) continue;
                meta += ` -metadata:s:s:${n} "language=${escMeta(isMp4 ? to6392T(r.lang) : normSidecarLang(r.lang))}"`;
                meta += ` -metadata:s:s:${n} "title=${escMeta(r.title || '')}"`;
                meta += ` -disposition:s:${n} ${r.disp.length ? r.disp.join('+') : '0'}`;
            }
            let out = `${inputSide} -map 0${extraMaps} -c copy${meta} -metadata "awk_sub_worker=${encodeMarkerList(markList)}"`;
            commitPreset(out);
            const expected = streams.filter((s) => !dupes.dropIdx.includes(s.index)).concat(toMux.map(sidecarToStream));
            response.infoLog += `☑Expected results: ${summariseAll(expected)}\n`;
            return response;
        }

        response.infoLog += importedSet.size ? '☑Sidecars already imported; nothing to do\n' : '☑All matching subtitles already present; nothing to import\n';
        return response;
    } catch (err) {
        failUnexpected(err);
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
