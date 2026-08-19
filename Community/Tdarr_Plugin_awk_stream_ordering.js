/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio -> Subtitles -> Attachments -> Data. Audio sorts by language, then
        main/descriptive/commentary role, then preferred codec, channels and quality - audio_first can lift whichever track the file flags original, default
        or descriptive above language, for foreign films. Subtitles sort forced-first, then by language and role - subtitle_first can lift the track flagged
        default, SDH or descriptive. The first audio track is marked the sole default. Can also strip junk metadata tags (remove_junk_tags:
        encoder/provenance, or the fuller descriptive set - rides the reorder remux, so no extra pass) and front-load the mp4 moov atom for instant remote
        playback (method_mp4_faststart - rides the reorder remux when one is already happening, otherwise forces one extra lossless remux the first time
        it's needed).\n\nBecause it runs last it also checks the finished file's duration against the library original, and FAILS (rather than accepts) a file
        that has come out more than 1% SHORT, or that reports no duration at all where the original had one - the signature of an out-of-memory-killed or
        unfinalised encode from an earlier stage. A longer output is accepted. This check is always on and has no setting.\n`,
    Version: '4.21.3',
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
                foreign film leads with its original audio rather than a dub. Falls back to normal ordering when no track is flagged original.
                \\ndefault_tagged: promote the track already flagged default (the ffmpeg 'default' disposition), so the source's chosen audio stays first.
                Where several tracks carry the flag - a source track and a downmix that inherited it, say - the highest-priority one by normal ordering
                leads. Falls back to normal ordering when no track is flagged default.
                \\ndescriptive_tagged: promote the descriptive (audio-description) track above language. Falls back to normal ordering when there is no
                descriptive track.
                \\nWhichever you pick, the first sorted track becomes the sole default - so descriptive_tagged makes the audio description your default
                audio.`,
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
                dtsexpress or eac3atmos to name a specific variant.
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
                options: ['disabled', 'encoder', 'descriptive'],
            },
            tooltip: `Strip junk metadata tags the file carries, both container-global and per-stream, riding this plugin's reorder remux so no extra pass
                is needed. Only tags actually present are cleared, so a file without them is untouched.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default): leave all tags.
                \\nencoder: remove only encoder and muxer provenance nobody reads - encoded_by, and the per-stream encoder tag (a leftover
                "Lavc.../HandBrake" string). Safe on any library.
                \\ndescriptive: also remove descriptive movie and TV metadata and iTunes/app flags - genre, date, description, synopsis, show, network,
                season/episode, media_type, artist, album, composer, copyright, keywords, compilation, sort-order keys and the like.
                \\nAlways kept, whichever you pick: title and comment, stream language tags, per-track bitrate statistics (BPS), the container-level encoder
                tag, and the creation date.
                \\nRunning last is what lets this clear the per-stream encoder tag a video or audio re-encode leaves behind, which a first-in-stack plugin
                could only catch a pass later.
                \\nBefore choosing descriptive: a media server set to read local or in-file metadata DOES read some mp4 descriptive tags - genre, date,
                description, show and so on. That means Plex with local media assets enabled, and Jellyfin or Emby with an nfo or in-file metadata reader.
                Use it only if you do not rely on in-file metadata.`,
        },
        {
            name: 'method_mp4_faststart',
            type: 'string',
            defaultValue: 'force',
            inputUI: {
                type: 'dropdown',
                options: ['force', 'strip'],
            },
            tooltip: `mp4 and mov only: where the moov atom, the file's index, sits. At the FRONT, players start and seek instantly on progressive download
                and remote direct-play; at the end, they have to fetch the tail first. mkv is unaffected.
                \\n=====
                \\nActions
                \\n=====
                \\nforce (default): front-load the moov atom. It rides this plugin's normal reorder remux where there is reordering to do, and otherwise
                forces ONE extra lossless -c copy remux the first time a file is not already front-loaded (detected without decoding). An already-fronted
                file is left untouched, so this settles after one pass and never loops.
                \\nstrip: actively REMOVE faststart - it does not simply leave the file alone. Any remux this plugin performs, whether for reordering,
                disposition normalisation or remove_junk_tags, writes the moov atom at the END, the mov muxer's default. So an mp4 that arrived
                front-loaded comes out back-loaded, and no later pass can restore it. Only pick this if you never stream this library remotely.`,
        },
    ],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    const fs = require('fs');
    // True if the mp4 already has moov before mdat (front-loaded), so method_mp4_faststart needn't remux it. Reads only top-level box headers (a few
    // 16-byte reads, seeking by box size) - no ffmpeg spawn, no full-file read. otherArguments.__awkMoovFront overrides for the harness (which has
    // no real file on disk). Fail-safe: any read/parse anomaly returns true (treat as fronted -> skip) so we never loop on a file we can't inspect.
    const moovBeforeMdat = (filePath, otherArgs) => {
        const inj = otherArgs?.__awkMoovFront;
        if (inj !== undefined) return inj === true;
        let fd;
        try {
            fd = fs.openSync(filePath, 'r');
            // A top-level box header is 4-byte size + 4-byte FourCC; when size === 1 the real size follows as a 64-bit largesize at offset 8. So every read
            // must cover the largesize too: BOX_READ_BYTES must stay >= BOX_HEADER_BYTES + 8 or the readBigUInt64BE below runs off the buffer on a >4GB mdat.
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: '',
        handBrakeMode: false,
        FFmpegMode: true,
        container: `.${file.container}`,
        infoLog: '',
    };

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

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

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
    const roleTextCache = new WeakMap();
    const roleTextLower = (s) => {
        if (roleTextCache.has(s)) return roleTextCache.get(s);
        const mi = mediaInfoFor(s);
        const text = [s.tags?.title, s.tags?.description, s.tags?.handler_name, mi?.Title, mi?.Description].filter(Boolean).join(' ').trim().toLowerCase();
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
        als:         { score: 100, lossless: true },   // MPEG-4 ALS (ffprobe 'als'; the mp4-wrapped 'mp4als' folds here via codecAlias) — lossless, so guard_lossless must protect it
        dsd:         { score: 100, lossless: true },   // DSD / SACD 1-bit (ffprobe dsd_lsbf/dsd_msbf[_planar], folded via codecAlias) — lossless, so guard_lossless must protect it
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
        amr_nb:      { score: 32,  transparent:  12200 },  // AMR narrowband, top mode - every .3gp phone recording
        ra_144:      { score: 30,  transparent:   8000 },  // RealAudio 1.0 (14.4) - fixed 8 kbps, the oldest of the family
        truespeech:  { score: 30,  transparent:   9600 },  // DSP Group TrueSpeech, very old
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
    // Scores a stream's quality (codec + bitrate vs transparent bitrate) to identify the "best" track. Declared after response so infoLog is available.
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
    // NOT memoised (unlike roleTextLower's WeakMap): the scan measures ~20 microseconds per file against a transcode measured in minutes.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === s.index);
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

    // Fail the file cleanly on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // Value checks. The two free-text inputs (order_language/order_codec) have no fixed option set; the six dropdowns each do, and are checked here as
    // [inputName, valueToTest, validOptions], top-down, failing on the first bad value. remove_junk_tags and method_mp4_faststart are case-normalized ONCE
    // here and the use sites below read those same constants, so the value that gets validated is provably the value that gets executed; the other four test
    // the raw input. The failFile message always shows the RAW inputs[name].
    const junkTagsMode = String(inputs.remove_junk_tags || 'disabled').toLowerCase();
    const methodFaststart = String(inputs.method_mp4_faststart || 'force').toLowerCase().trim();
    const dropdownChecks = [
        ['audio_first',          inputs.audio_first,                                             ['disabled', 'original_tagged', 'default_tagged', 'descriptive_tagged']],
        ['order_channel',        inputs.order_channel,                                           ['descending', 'descending <=6', 'descending <=8', 'ascending', 'disabled']],
        ['order_quality',        inputs.order_quality,                                           ['descending', 'descending <=1024k', 'ascending', 'disabled']],
        ['subtitle_first',       inputs.subtitle_first,                                          ['disabled', 'default_tagged', 'sdh_tagged', 'descriptive_tagged']],
        ['remove_junk_tags',     junkTagsMode,                                                    ['disabled', 'encoder', 'descriptive']],
        ['method_mp4_faststart', methodFaststart,                                                ['force', 'strip']],
    ];
    for (const [name, value, opts] of dropdownChecks)
        if (!opts.includes(value)) failFile(`[${name}=${inputs[name]}] invalid value, check your settings`);
    // order_language has no option set, but it still holds LANGUAGES, so a token that is not one FAILS the file. A typo does not announce itself here: an
    // unmatched entry simply scores as "not listed" and the tracks the user meant to promote stay wherever they were, which reads exactly like the ordering
    // rules not working. order_codec is genuinely open (codec names come and go, and an unknown one is inert rather than misleading), so it stays unchecked.
    // The und/mul/zxx/mis/qaa-qtz allowance matches every other language input - 'und' is a real ordering target, since untagged tracks sort somewhere too.
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: language token recognition =====
    // -=-=-= knownLangToken  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // Is an already-folded langKey a recognised language token: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to one base code), or
    // a valid special/private code - und (undetermined), mul (multiple), zxx (no linguistic content), mis (uncoded) and the qaa-qtz private-use range. Those
    // specials are load-bearing rather than laxness: stream language tags carry them, so a list has to be able to name them. Why an unrecognised token STOPS
    // the file is per-plugin and stays above this section, since it depends on what that plugin's input scopes; the message itself is failLangToken.
    const knownLangToken = (key) => key === 'und' || key === 'mul' || key === 'zxx' || key === 'mis' || /^q[a-t][a-z]$/.test(key) || !!langDisplayName(key);
    // ===== END SHARED: language token recognition =====
    const orderLangTokens = splitList(inputs.order_language);
    for (const tok of orderLangTokens)
        if (!knownLangToken(langKey(tok))) failLangToken('order_language', tok);

    // One guard around all the reordering work below: a deliberate failFile abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the
    // file too — annotated and carrying the full infoLog — instead of silently skipping. (Input validation runs above this, failing via failFile too.)
    try {
        // ====== TRUNCATION CHECK ======
        // An encode that is OOM-killed, or that dies with the output file never finalised, can still leave a file ffmpeg exits 0 on and Tdarr accepts - the
        // library then quietly keeps a video that stops a few minutes in. This plugin is designed to run LAST, so it is the one that sees the finished article,
        // and the check sits ahead of everything else here BECAUSE the ordinary outcome is `skip` a few hundred lines down: on the final cycle the streams are
        // usually already in order, and a check placed beside the reordering work would be dead in exactly the case it exists for.
        //
        // Compared against otherArguments.originalLibraryFile, which is the file as it entered the library rather than the previous stage's output, and which
        // Tdarr scans in full - ffProbeData and mediaInfo alike. Signals are tried in order and the first that resolves on BOTH sides decides, so a container
        // that stores one but not the other cannot make a healthy file look broken. FRAME COUNT is deliberately not among them: video_clean's interlace repair
        // emits bwdif=mode=send_field, which DOUBLES the frame count at field rate, so a frame comparison reports a 2x change on a perfectly good file. Wall
        // time survives that operation untouched. Container duration comes last and only when the audio track count is unchanged, since it is the maximum
        // across all streams - audio_clean dropping a commentary track longer than the video legitimately shrinks it - and Matroska frequently stores no
        // per-stream duration on the ffprobe side, which is why mediaInfo leads.
        const durVideoStream = (obj) => (obj?.ffProbeData?.streams || []).find(s => codecTypeOf(s) === 'video' && !isCoverArt(s));
        const durAudioCount = (obj) => (obj?.ffProbeData?.streams || []).filter(s => codecTypeOf(s) === 'audio').length;
        // Every DURATION_SIGNALS row must answer with a real duration or 0 - 0 IS the "no signal" sentinel the oldAny/newAny/verdict accumulation below
        // reads by truthiness, and the failFile at the end of that accumulation turns "the old side had one and the new side has none" into a
        // quarantine. A row that returns something else (a NaN, a negative, an already-coerced value) breaks the guard silently.
        const durPositive = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
        const DURATION_SIGNALS = [
            // The join must require @type 'Video' as well as the StreamOrder match: MPEG-TS gives its video track the two-part StreamOrder "0-0"
            // (Number() -> NaN, so it never matches) while its MENU track reports a bare "0", and without the type test the guard silently compares a
            // menu/chapter track's duration instead of the video's.
            { name: 'the mediaInfo video-track duration',
                read: (o) => { const v = durVideoStream(o); if (!v) return 0;
                    return durPositive(((o?.mediaInfo?.track || []).find(t => t['@type'] === 'Video'
                        && Number(t.StreamOrder) === v.index) || {}).Duration); } },
            { name: 'the ffprobe video-stream duration', read: (o) => durPositive(durVideoStream(o)?.duration) },
            { name: 'the container duration', read: (o) => durPositive(o?.ffProbeData?.format?.duration), needsSameAudio: true },
        ];
        // Tolerance is 1% SHORT, fixed, with no input to relax it: a user hitting a false positive would have no recourse but removing the plugin, so the
        // headroom is deliberately double the 0.5% the long-standing community duration-check plugin defaults to. A dead encode is short by far more.
        // Deliberately one-sided. An output LONGER than its source cannot have been truncated or OOM-killed, and it is a state healthy files reach: both
        // leading signals are PTS-derived, so an MPEG-TS/AVI capture with a timestamp discontinuity under-reports its own length, and clean_and_remux's
        // recover_* remux (-fflags +genpts+ignidx) exists to repair exactly those - after which the file reports its TRUE, longer duration. This plugin runs
        // last, so it is the stage that sees that pair. Failing it would quarantine a correctly repaired file and send the user hunting an OOM kill that
        // never happened. An over-length alarm, if ever wanted, needs its own branch and its own wording - none of the text below is true of it.
        const DURATION_TOLERANCE_PCT = 1;
        const originalFile = otherArguments?.originalLibraryFile;
        if (originalFile?.ffProbeData) {
            const sameAudio = durAudioCount(originalFile) === durAudioCount(file);
            const newVideo = durVideoStream(file);
            // Carries its own trailing separator, so an audio-only file (or one whose only video stream is cover art - durVideoStream excludes those) does not
            // leave a bare space sitting directly after the ☒ status symbol.
            const durTag = newVideo ? `${streamTag(newVideo.index)} ` : '';
            let verdict = null;
            let oldAny = 0;
            let newAny = 0;
            for (const sig of DURATION_SIGNALS) {
                if (sig.needsSameAudio && !sameAudio) continue;
                const o = sig.read(originalFile);
                const n = sig.read(file);
                if (!oldAny) oldAny = o;
                if (!newAny) newAny = n;
                if (!verdict && o && n) verdict = { name: sig.name, old: o, now: n };
            }
            if (verdict) {
                const pct = (verdict.now / verdict.old) * 100;
                if (pct < 100 - DURATION_TOLERANCE_PCT)
                    failFile(`${durTag}output duration ${verdict.now.toFixed(1)} s is ${pct.toFixed(1)}% of the original ${verdict.old.toFixed(1)} s`
                        + ` - the transcode did not run to completion`
                        + `\n☒${durTag}the file has been failed rather than accepted; check this node's log for an out-of-memory kill`
                        + `\n☒${durTag}(compared using ${verdict.name})`);
            } else if (oldAny && !newAny) {
                // A severely truncated or unfinalised output is precisely the file most likely to probe with no duration at all, so treating "no duration" as
                // "nothing to compare" would silence the guard on exactly what it hunts. Reaching here means NO signal resolved on the new side while at least
                // one did on the old, so it cannot fire merely because a container stores one signal and not another.
                failFile(`${durTag}the output reports no duration at all while the original had ${oldAny.toFixed(1)} s - that is what a truncated or`
                    + ` unfinalised transcode looks like`
                    + `\n☒${durTag}the file has been failed rather than accepted; check this node's log for an out-of-memory kill`);
            }
        }

        // Input summary — the streams exactly as they arrived, before re-ordering.
        response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

        const streamOrder = { video: 0, audio: 1, subtitle: 2 , attachment: 3, data: 4};
        const UNKNOWN_TYPE_ORDER = 99;   // a codec_type not in streamOrder (video/audio/subtitle/attachment/data) sorts last
        const audioFirst = inputs.audio_first;       // 'disabled' (baseline) | 'original_tagged' | 'default_tagged' | 'descriptive_tagged'
        const subtitleFirst = inputs.subtitle_first; // 'disabled' (baseline) | 'default_tagged' | 'sdh_tagged' | 'descriptive_tagged'
        const preferredLangKeys = orderLangTokens.map(langKey);   // normalised: en/eng/english/en-US and 639-2/B vs /T all rank together (langKey lowercases)
        const codecFirstList = splitList(inputs.order_codec).map(c => c.toLowerCase());   // canon codec names are lowercase, so the list must be too

        // Parse an order mode ('descending' | 'descending <=N' | 'ascending' | 'disabled') into {enabled, dir, cap}. The '<=N' suffix caps descending: a stream
        // whose cap-metric exceeds N is demoted below every at/under-cap stream. A trailing 'k' (order_quality's bitrate cap) means N is in kbps -> bps. Parsed
        // ONCE here, not per-comparison, because the comparator below runs O(n log n) times.
        const parseOrderMode = (mode) => {
            if (mode === 'disabled') return { enabled: false };
            const m = /^descending\s*<=\s*(\d+)(k?)$/.exec(mode);
            if (m) return { enabled: true, dir: 'descending', cap: Number(m[1]) * (m[2] === 'k' ? 1000 : 1) };
            return { enabled: true, dir: mode === 'ascending' ? 'ascending' : 'descending', cap: Infinity };
        };
        const channelOrder = parseOrderMode(inputs.order_channel);
        const qualityOrder = parseOrderMode(inputs.order_quality);
        // Union-of-caps demotion: a track over EITHER the channel cap OR the quality cap sorts below the under-all-caps tracks in its own language/role/codec
        // tier, so the fully-serveable track leads - e.g. a 5.1 under the <=6 channel cap but over the <=1024k quality cap is still demoted, not kept above a
        // stereo. Only a 'descending <=N' mode caps (plain descending/ascending/disabled -> Infinity). Channel caps by channel count, quality by capBitrate.
        const chanCap = (channelOrder.enabled && channelOrder.dir === 'descending') ? channelOrder.cap : Infinity;
        const qualCap = (qualityOrder.enabled && qualityOrder.dir === 'descending') ? qualityOrder.cap : Infinity;
        const overCap = (s) => s.channels > chanCap || s.capBitrate > qualCap;

        const getLangRank = (lang) => {
            const idx = preferredLangKeys.indexOf(langKey(lang));
            // The "not listed" sentinel must exceed every real index; a bare 999 would collide on a >999-entry order_language list (unbounded free text).
            return idx === -1 ? preferredLangKeys.length : idx;
        };

        // Audio ordering below audio_first, shared by the sort AND the winning-default pre-pass: language -> role -> order_codec -> the union cap partition
        // (over EITHER cap -> tail) -> channel (direction) -> quality (direction). Returns 0 when every key ties. The cap ONLY partitions; within each
        // partition channel/quality keep their requested direction, so a 'descending <=N' list stays fully descending - it just shifts which track leads.
        const compareAudioKeys = (a, b) => {
            const aRank = a.langRank;
            const bRank = b.langRank;
            if (aRank !== bRank) return aRank - bRank;
            //A commentary stream could be descriptive but it would still be a commentary
            const aRole = a.commentary ? 2 : (a.descriptive ? 1 : 0);
            const bRole = b.commentary ? 2 : (b.descriptive ? 1 : 0);
            if (aRole !== bRole) return aRole - bRole;
            //order_codec tier — preferred codecs form one group above the rest; this only promotes the group, each still ordered by channel/quality below.
            if (codecFirstList.length > 0 && a.codecMatch !== b.codecMatch) return a.codecMatch ? -1 : 1;
            //Union cap partition: an over-EITHER-cap track is demoted to the tail of its tier.
            if (chanCap < Infinity || qualCap < Infinity) {
                const aOver = overCap(a), bOver = overCap(b);
                if (aOver !== bOver) return aOver ? 1 : -1;
            }
            //Channel (skipped when disabled): the cap already partitioned above, so this is a plain direction sort by channel count.
            if (channelOrder.enabled && a.channels !== b.channels)
                return channelOrder.dir === 'ascending' ? a.channels - b.channels : b.channels - a.channels;
            //Quality (skipped when disabled): orders by the audioQuality score in the requested direction.
            if (qualityOrder.enabled && a.audioQuality !== b.audioQuality)
                return qualityOrder.dir === 'ascending' ? a.audioQuality - b.audioQuality : b.audioQuality - a.audioQuality;
            return 0;
        };

        // remove_junk_tags: strip encoder/muxer-provenance (+ optional descriptive) tags on the reorder remux. 'encoder' = pure provenance (global encoded_by;
        // per-stream encoder/encoded_by); 'descriptive' (superset) also drops iTunes/movie-TV container tags. Always kept: title/comment, awk_* markers
        // (idempotency), creation_time, the mkv BPS/statistics family (mediaInfo's per-track bitrate source), the functional per-stream tags, and the GLOBAL
        // 'encoder' tag (muxer-managed: every mux re-stamps it, so stripping would loop). Per-stream 'encoder' - including the Lavc tag an upstream re-encode
        // stamps - is NOT re-added on a -c copy, so running last clears it in the SAME remux (a first-in-stack plugin could only catch it a pass later).
        const JUNK_ENCODER_GLOBAL = new Set(['encoded_by']);
        const JUNK_DESCRIPTIVE = new Set(['compilation', 'gapless_playback', 'hd_video', 'purchase_date', 'sort_name', 'sort_album', 'sort_album_artist',
            'sort_artist', 'sort_composer', 'sort_show', 'genre', 'date', 'description', 'synopsis', 'show', 'episode_id', 'network', 'episode_sort',
            'season_number', 'media_type', 'artist', 'album', 'album_artist', 'composer', 'grouping', 'lyrics', 'copyright', 'keywords']);
        const JUNK_PERSTREAM = new Set(['encoded_by', 'encoder']);   // only encoder-tier keys are safe per-stream (descriptive ones are functional, kept)
        const junkGlobalStrip = (lowerKey) => junkTagsMode !== 'disabled'
            && (JUNK_ENCODER_GLOBAL.has(lowerKey) || (junkTagsMode === 'descriptive' && JUNK_DESCRIPTIVE.has(lowerKey)));
        // Per-stream encoder/encoded_by clears for the stream at OUTPUT index outIdx - the post-sort position -metadata:s:<index> targets, not the source
        // ffprobe index. Present-only, so a clean stream adds nothing and never forces a mux on its own. escMeta guards the probe-derived key.
        const streamJunkClears = (ffstream, outIdx) => {
            if (junkTagsMode === 'disabled') return '';
            let meta = '';
            for (const k of Object.keys(ffstream.tags || {}))
                if (JUNK_PERSTREAM.has(k.toLowerCase())) meta += ` -metadata:s:${outIdx} "${escMeta(k)}="`;
            return meta;
        };

        const streams = [];
        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
            const ffstream = file.ffProbeData.streams[i];
            // Enrich with the both-probe bitrate and channel count before audioQuality/summariseStream (see resolveStreamBitrate/resolveChannels above).
            const enrichedStream = enrichStream(ffstream);
            const streamLang = resolveLang(ffstream) || 'und';

            const streamType = codecTypeOf(ffstream);
            // Resolve the canonical codec once (resolveCodecName does a probe-join + string work); order_codec membership can't change between list entries.
            const canon = streamType === 'audio' ? resolveCodecName(enrichedStream) : '';

            streams.push({
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
                forced: hasDisposition(ffstream, 'forced'),   // flag OR title keyword - a "Forced"/"Foreign Parts Only" title counts where the flag isn't set
                // Only score audio, and only when order_quality actually reads the score: scoring video/subtitle/data would spam bogus "unknown audio codec" /
                // "no bitrate reported" notices, and with order_quality=disabled the score is dead - scoring anyway warns about values the sort ignores.
                audioQuality: (streamType === 'audio' && qualityOrder.enabled) ? audioQuality(enrichedStream) : 0,
                // Does this audio stream's canonical codec match order_codec? Family-prefix: "dts" catches dtsma/dtshr/dtsexpress, "eac3" catches eac3atmos.
                codecMatch: canon !== '' && codecFirstList.some(c => canon.startsWith(c)),
                default: ffstream?.disposition?.default === 1,
                original: hasDisposition(ffstream, 'original'),   // for audio_first='original_tagged': promote the original-language track above language

                // Role classification via the shared classifiers (single source of truth — keeps the sort and the summary line in agreement).
                commentary: isCommentary(ffstream),
                descriptive: isDescriptive(ffstream),
                sdh: isSdh(ffstream),
                lyrics: isLyrics(ffstream),

                // Cover art/poster/thumbnail sort last: cover-art dispositions (any codec) or a still-image codec - mirrors clean_and_remux image removal.
                coverArt: isCoverArt(ffstream),
            });
        }

        // audio_first='default_tagged': only ONE audio track can remain default (the normalisation below marks the first sorted audio the sole
        // default). So promote the SINGLE default track that WINS the normal ordering, not every default flag - then the emitted order
        // already matches the post-normalisation state and is a fixpoint. Promoting every default would lead with a lower-priority
        // default on pass 1, then re-sort it once its default is stripped (a wasteful extra reorder remux before it settles). undefined
        // when no track is flagged default, so audio_first='default_tagged' then falls through to normal ordering. Identity-compared below.
        const winningDefault = audioFirst === 'default_tagged'
            ? streams.filter(s => s.type === 'audio' && s.default).sort((a, b) => compareAudioKeys(a, b) || a.index - b.index)[0]
            : undefined;

        // Per-type comparators (pure: read only a/b and the closed-over read-only audioFirst/subtitleFirst/winningDefault/compareAudioKeys). Each
        // returns 0 on a full tie, so the sort dispatcher below falls through to source-index order. Video: cover art / posters / thumbnails sort last.
        const compareVideoStreams = (a, b) => (a.coverArt !== b.coverArt) ? (a.coverArt ? 1 : -1) : 0;
        // Audio: audio_first promotes ONE track above every audio key (including language). Only one value is active, so at most one
        // clause fires; each is a no-op when no track qualifies, falling through to the normal ordering. original_tagged: keeps a foreign
        // film's original audio first (and default), not a dub. default_tagged: keeps the source's flagged-default audio first - promoting
        // only the WINNING default (winningDefault) so the result is idempotent. descriptive_tagged: lifts the audio-description track first
        // (and, via normalisation, makes it the default). Then language, role, order_codec, union cap, channel + quality via compareAudioKeys.
        const compareAudioStreams = (a, b) => {
            if (audioFirst === 'original_tagged' && a.original !== b.original)
                return a.original ? -1 : 1;
            if (audioFirst === 'default_tagged') {
                const aWin = a === winningDefault, bWin = b === winningDefault;
                if (aWin !== bWin) return aWin ? -1 : 1;
            }
            if (audioFirst === 'descriptive_tagged' && a.descriptive !== b.descriptive)
                return a.descriptive ? -1 : 1;
            return compareAudioKeys(a, b);
        };
        // Subtitle: forced first, then language priority, then subtitle_first lifts the default/SDH/descriptive subtitle to the top of THEIR language,
        // then the normal role order (normal, lyrics/songs, SDH, descriptive, commentary).
        const compareSubtitleStreams = (a, b) => {
            if (a.forced !== b.forced)
                return a.forced ? -1 : 1;
            const aRank = a.langRank;
            const bRank = b.langRank;
            if (aRank !== bRank)
                return aRank - bRank;
            if (subtitleFirst === 'default_tagged' && a.default !== b.default)
                return a.default ? -1 : 1;
            else if (subtitleFirst === 'sdh_tagged' && a.sdh !== b.sdh)
                return a.sdh ? -1 : 1;
            else if (subtitleFirst === 'descriptive_tagged' && a.descriptive !== b.descriptive)
                return a.descriptive ? -1 : 1;
            const aRole = a.commentary ? 4 : (a.descriptive ? 3 : (a.sdh ? 2 : (a.lyrics ? 1 : 0)));
            const bRole = b.commentary ? 4 : (b.descriptive ? 3 : (b.sdh ? 2 : (b.lyrics ? 1 : 0)));
            if (aRole !== bRole)
                return aRole - bRole;
            return 0;
        };

        //Sort the streams: stream-type precedence, then the per-type comparator, then source-index order as the final tie-break.
        streams.sort((a, b) => {
            const aOrder = streamOrder[a.type] ?? UNKNOWN_TYPE_ORDER;
            const bOrder = streamOrder[b.type] ?? UNKNOWN_TYPE_ORDER;

            if (aOrder !== bOrder)
                return aOrder - bOrder;

            let cmp = 0;
            if (a.type === 'video') cmp = compareVideoStreams(a, b);
            else if (a.type === 'audio') cmp = compareAudioStreams(a, b);
            else if (a.type === 'subtitle') cmp = compareSubtitleStreams(a, b);
            if (cmp !== 0) return cmp;

            //Attachments and data get no comparator - their relative order doesn't matter
            return a.index - b.index;
        });

        //Set orderChanged if the sort moved a stream, and build the map; also normalise the audio default flag so exactly one audio track — the first in sorted
        //order — is default, matching what the ordering rules chose. Additive +default/-default preserves forced/commentary/etc; subtitle/video untouched.
        let ffmpegMap = '';
        let dispositionArgs = '';
        let junkArgs = '';
        let junkLog = '';
        let orderChanged = false;
        let audioIndex = -1;

        for (let i = 0; i < streams.length; i++) {
            ffmpegMap += ` -map 0:${streams[i].index}`;
            // Compare against each stream's ORIGINAL array position, not its absolute ffprobe index, so a file already in the desired order but with
            // non-contiguous indices (e.g. 0,1,3 after an upstream drop) isn't remuxed pointlessly. -map still uses the absolute index above.
            if (streams[i].origPos !== i) orderChanged = true;

            // remove_junk_tags (per-stream): clear this stream's encoder tags, keyed on its OUTPUT index i (see streamJunkClears).
            const streamJunk = streamJunkClears(streams[i].stream, i);
            if (streamJunk) {
                junkArgs += streamJunk;
                junkLog += `☐${streamTag(streams[i].index)}[remove_junk_tags=${junkTagsMode}] Remove encoder tag(s) from ${streams[i].type} stream\n`;
            }

            if (streams[i].type === 'audio') {
                audioIndex++;
                const wantDefault = audioIndex === 0;
                if (wantDefault && !streams[i].default)
                    dispositionArgs += ` -disposition:a:${audioIndex} +default`;
                else if (!wantDefault && streams[i].default)
                    dispositionArgs += ` -disposition:a:${audioIndex} -default`;
                // Reflect the normalized flag in the Expected results summary (summariseStream reads disposition.default);
                // shallow-clone so the source probe object is untouched.
                if (streams[i].default !== wantDefault)
                    streams[i].stream = { ...streams[i].stream, disposition: { ...streams[i].stream.disposition, default: wantDefault ? 1 : 0 } };
            }
        }

        // Describe the reorder itself. It is this plugin's headline change and the only one that leaves no other trace in the log: a pure reorder emits no
        // ☐ line at all today, so the log runs straight from the input summary to Expected results and the user has to diff the two token lists to see that
        // anything happened. The two causes are reported separately because they answer different questions and a user acts on them differently - regrouping
        // is the fixed video → audio → subtitle → attachment → data precedence that no setting changes, while a within-group sort is what the order_* and
        // audio_first/subtitle_first settings decide. Both lines stay BARE of an [input=value] tag: regrouping has no setting behind it, and a within-group
        // sort is the combined verdict of the whole order_* precedence chain, so naming any one of them would be a guess (see the infoLog contract).
        const originalOrder = streams.slice().sort((a, b) => a.origPos - b.origPos);
        const typeSeq = (arr) => arr.map((s) => s.type).join(',');
        const regrouped = typeSeq(originalOrder) !== typeSeq(streams);
        const sortedWithin = [];   // "<n> <type>" per type group whose members changed order among themselves
        for (const t of new Set(streams.map((s) => s.type))) {
            const positions = streams.filter((s) => s.type === t).map((s) => s.origPos);
            if (!positions.every((p, i) => i === 0 || positions[i - 1] < p)) sortedWithin.push(`${positions.length} ${t}`);
        }

        // remove_junk_tags (global): clear the provenance / descriptive container tags present, matched case-insensitively. escMeta guards the key.
        if (junkTagsMode !== 'disabled')
            for (const k of Object.keys(file.ffProbeData.format?.tags || {})) {
                const lk = k.toLowerCase();
                if (lk === 'title' || lk === 'comment' || lk === 'creation_time' || lk.startsWith('awk_')) continue;
                if (junkGlobalStrip(lk)) {
                    junkArgs += ` -metadata "${escMeta(k)}="`;
                    junkLog += `☐[remove_junk_tags=${junkTagsMode}] Remove ${k} tag from file\n`;
                }
            }

        // method_mp4_faststart: front-load the mp4 moov atom. A plain ride-along isn't enough (we skip when order is already correct), so force a one-time
        // remux when faststart is on, the output is an mp4-family container, and moovBeforeMdat (fail-safe, see its definition above) reports it isn't fronted
        // yet - so this settles after one pass and never loops.
        const isMp4 = isMp4Family(file.container);
        const faststartOn = methodFaststart === 'force';
        const needsFront = faststartOn && isMp4 && !moovBeforeMdat(file.file, otherArguments);

        if (!orderChanged && dispositionArgs === '' && !needsFront && junkArgs === '') return skip('☑Streams already in desired order\n');

        response.processFile = true;
        response.reQueueAfter = true;
        if (regrouped)
            response.infoLog += '☐Regrouping streams into video → audio → subtitle → attachment → data order\n';
        if (sortedWithin.length) {
            const list = sortedWithin.length > 1
                ? `${sortedWithin.slice(0, -1).join(', ')} and ${sortedWithin[sortedWithin.length - 1]}`
                : sortedWithin[0];
            response.infoLog += `☐Sorting the ${list} streams within their group${sortedWithin.length > 1 ? 's' : ''}\n`;
        }
        // Logged whenever the moov actually moves, not only when faststart is the sole reason for the pass: +faststart rides every remux this plugin emits
        // (see mp4MovflagsArg below), so a reorder or a disposition fix front-loads the file just as surely, and a ☐ line marks a change about to be made.
        if (needsFront)
            response.infoLog += `☐[method_mp4_faststart=${methodFaststart}] Front-load the mp4 moov atom on this remux\n`;
        // mp4/mov muxers drop a custom GLOBAL metadata tag (e.g. clean_and_remux's awk_recovered, set upstream) on a -c copy remux unless told to keep it,
        // which would re-trigger recovery on the next pass. Preserve it on the mov family, and append +faststart when method_mp4_faststart is on.
        const mp4MovflagsArg = isMp4 ? ` -movflags use_metadata_tags${faststartOn ? '+faststart' : ''}` : '';
        // The -strict level this mp4/mov -c copy remux needs (see mp4StrictArg): Dolby Vision's dvcC/dvvC boxes, or a TrueHD track the mp4 muxer refuses
        // without it. Pass the RAW ffprobe streams (the local `streams` array above is rebuilt for ordering and lacks codec_tag_string / side_data_list, the
        // DV signals); this plugin only reorders, so every stream is copied and the copied-subset argument stays at its default.
        const strictArg = mp4StrictArg(file.container, file.ffProbeData.streams);
        response.preset = `<io>${ffmpegMap} -c copy${dispositionArgs}${junkArgs}${strictArg}${globalOutputOpt}${mp4MovflagsArg}`;
        if (dispositionArgs !== '')
            response.infoLog += '☐Set the first audio track as the sole default\n';
        response.infoLog += junkLog;
        response.infoLog += `☑Expected results: ${streams.map(s => summariseStream(s.stream)).join('')}\n`;

        return response;
    } catch (err) {
        failUnexpected(err);   // AwkFailFile → rethrow unchanged; anything else → annotate + fail the file with the full infoLog
    }
};

module.exports.details = details;
module.exports.plugin = plugin;
