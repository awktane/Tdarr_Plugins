/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_stream_ordering',
    Stage: 'Pre-processing',
    Name: 'Re-order streams video, audio, subtitle, then anything else',
    Type: 'Any',
    Operation: 'Transcode',
    Description: `Reorders streams into a clean layout: Video -> Audio (by language, then main/descriptive/commentary, then channels and quality) -> Subtitles (forced first, by language, then normal/songs/sdh/descriptive/commentary) -> Attachments -> Data. Also marks the first audio track as the sole default.\n`,
    Version: '2.0.0',
    Tags: 'pre-processing,ffmpeg,stream-order',
    Inputs: [
        {
            name: 'preferred_languages',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Comma separated language priority list (e.g. eng,jpn,und). Listed languages sort first; blank (the default) skips language ordering.
                 \\nLanguages not in the list are not reordered by language - they sort by the other keys (role/channel/quality) and keep their original order.
                 \\nThis list should include both two character and three character codes as this will successfully catch values like en, eng, en-US, en_US, and en.US.
                 \\nIf two character is provided in the list then languages formatted like en-US will be treated as en
                 \\nExample: (channel_order descending and preferred_languages eng,jpn)\\n
                 A file containing ger 2.0,fre 2.0,eng 2.0,jpn 2.0,eng 5.1,jpn 5.1 would be reordered eng 5.1,eng 2.0,jpn 5.1,jpn 2.0,ger 2.0,fre 2.0`,
        },
        {
            name: 'channel_order',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'ascending', 'disabled'],
            },
            tooltip: `Audio channel ordering preference - streams are ordered by channel then rating of codec/bitrate. Generally descending is recommended.
                \\nExample:\\n
                    ascending: 2.0,5.1
                \\nExample:\\n
                    descending: 5.1,2.0
                \\nSet to disabled to skip channel ordering entirely. If both channel_order and quality_order are disabled, audio is not reordered by channels or quality (language/role/codec_first still apply).`
        },
        {
            name: 'quality_order',
            type: 'string',
            defaultValue: 'descending',
            inputUI: {
                type: 'dropdown',
                options: ['descending', 'ascending', 'disabled'],
            },
            tooltip: `Audio quality ordering preference - streams are ordered by channel then rating of codec/bitrate. Generally descending is recommended.
                \\nExample:\\n
                    ascending: 128k,640k
                \\nExample:\\n
                    descending: 640k,128k
                \\nSet to disabled to skip quality ordering entirely. If both channel_order and quality_order are disabled, audio is not reordered by channels or quality (language/role/codec_first still apply).`
        },
        {
            name: 'sdh_first',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: ['false', 'true'],
            },
            tooltip: 'Should SDH tracks be put at the top? (Subtitles for the Deaf and Hard-of-Hearing)',
        },
        {
            name: 'codec_first',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Comma separated list of preferred audio codecs (e.g. eac3,aac). Blank to disable.
                \\nMatching streams are grouped above non-matching ones within their language; each group is still ordered by channel_order then quality_order. List order is a membership set, not a ranking. Sits below role, above channels/quality.
                \\nFamily-prefix match on the canonical codec: dts matches DTS-HD MA/HR/Express, eac3 includes Atmos. Use dtsma/dtshr/dtsexpress/eac3atmos for a specific variant.`,
        },
        {
            name: 'temp_on_network',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'dropdown',
                options: ['true', 'false'],
            },
            tooltip: `Is the temp folder on the network? Enabling this adds stops ffmpeg from flushing the buffer quite as often. (-flush_packets 0)
                 \\nGenerally speaking this has very little effect if the files are local instead and therefore it's enabled by default.`,
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
        FFmpegMode: true,
        container: `.${file.container}`,
        infoLog: '',
    };

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file.
    // Split into labeled sections; each is byte-identical across the plugins named in its header, and a
    // plugin carries only the sections it uses. The section LABEL is the anchor (order is free). Verify any
    // edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all three awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description'], tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','deaf'],         tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced'],                                tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                              tag: 'Original'    },
        default:          { streams:['audio','subtitle','video'], keywords: ['default'],                               tag: null          },
        attached_pic:     { streams:['video'],                    keywords: [],                                        tag: null          },
        still_image:      { streams:['video'],                    keywords: [],                                        tag: null          },
        timed_thumbnails: { streams:['video'],                    keywords: [],                                        tag: null          },
    };
    // -=-=-= roleTextLower  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
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
    // -=-=-= matchesKeyword  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Whole-token keyword matcher: a keyword matches only when not flanked by a letter/digit, so '[sdh]', 'eng-sdh', and 'sdh.' match while
    // 'deafening'/'aboriginal' do not. An internal space matches any run of non-alphanumerics ('hearing impaired' == 'hearing_impaired'). Keywords are
    // regex-escaped; the 'u' flag enables \p{L}/\p{N}. text must already be lowercased.
    const matchesKeyword = (text, keywords) => {
        if (!keywords.length) return false;
        const pattern = keywords
            .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^\\p{L}\\p{N}]+'))
            .join('|');
        return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u').test(text);
    };
    // -=-=-= hasDisposition  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    const hasDisposition = (s, key) => {
        const entry = dispositionTypes[key];
        if (!entry) return false;
        if (!entry.streams.includes((s.codec_type || '').trim().toLowerCase())) return false;
        return s.disposition?.[key] === 1 || matchesKeyword(roleTextLower(s), entry.keywords);
    };
    // -=-=-= role classifiers: isCommentary / isDescriptive / isSdh / isLyrics  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    const isCommentary  = (s) => hasDisposition(s, 'comment');
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions');
    const isSdh         = (s) => hasDisposition(s, 'hearing_impaired') || hasDisposition(s, 'captions');
    const isLyrics      = (s) => hasDisposition(s, 'lyrics');
    // ===== END SHARED: role/disposition classifiers =====

    // ===== SHARED [audio_clean, stream_ordering]: audio codec scoring =====
    // -=-=-= codecInfo  [audio_clean, stream_ordering] =-=-=-
    //Codec quality weights so we can pick the best track. Some of these formats aren't supported by ffmpeg yet (e.g. ac4).
    const codecInfo = {
        // Lossless
        pcm:        { score: 100, lossless: true },
        flac:       { score: 100, lossless: true },
        alac:       { score: 100, lossless: true },
        wavpack:    { score: 100, lossless: true },
        ape:        { score: 100, lossless: true },
        tak:        { score: 100, lossless: true },
        tta:        { score: 100, lossless: true },
        mlp:        { score: 99,  lossless: true },

        // Dolby family
        truehd:     { score: 99,  lossless: true },
        dtsma:      { score: 98,  lossless: true },
        dtshr:      { score: 94,  minimum: 1000000, transparent: 3000000 },
        dts:        { score: 91,  minimum: 768000,  transparent: 1509000 },
        eac3atmos:  { score: 92,  minimum: 256000,  transparent: 768000 },
        dtsexpress: { score: 80,  minimum: 128000,  transparent: 384000 },
        
        // Modern multichannel codecs
        ac4:        { score: 90,  minimum: 128000,  transparent: 384000 },
        eac3:       { score: 89,  minimum: 192000,  transparent: 640000 },
        mpegh3d:    { score: 89,  minimum: 192000,  transparent: 512000 },

        // Modern general-purpose codecs
        opus:       { score: 89,  minimum: 64000,   transparent: 192000 },
        aac:        { score: 87,  minimum: 96000,   transparent: 256000 },
        vorbis:     { score: 86,  minimum: 128000,  transparent: 256000 },

        // Legacy but still excellent
        ac3:        { score: 84,  minimum: 192000,  transparent: 640000 },
        atrac:      { score: 83,  minimum: 96000,   transparent: 192000 },
        wma:        { score: 82,  minimum: 96000,   transparent: 192000 },
        mpc:        { score: 82,  minimum: 128000,  transparent: 220000 },

        // Older codecs
        mp3:        { score: 78,  minimum: 128000,  transparent: 320000 },
        mp2:        { score: 73,  minimum: 128000,  transparent: 256000 },
        adpcm:      { score: 60,  minimum: 128000,  transparent: 256000 },
        cook:       { score: 58,  minimum: 64000,   transparent: 128000 }
    };
    // -=-=-= codecAliases / unknownCodecs  [audio_clean, stream_ordering] =-=-=-
    // Prefix → canonical codec key (e.g. wmav1 → wma).
    const codecAliases = [
        ['pcm_',   'pcm'],
        ['adpcm',  'adpcm'],
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
    ];
    const unknownCodecs = new Set();

    // -=-=-= resolveCodecName  [audio_clean, stream_ordering] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype and eac3 into eac3atmos. Shared by audioQuality
    // and losslessSource. codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" (no subtype keyword), so longName alone can't tell the
    // subtypes apart there; we also check the stream profile ("DTS-HD MA"/"HRA"/"Express") and fall back to mediaInfo's Format_Commercial_IfAny
    // ("DTS-HD Master Audio"), which decodes the substream header. Atmos comes from longName or the commercial name only - an editable title tag does
    // not imply a real Atmos substream.
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
        const commercial = (mediaInfoFor(stream)?.Format_Commercial_IfAny || '').toLowerCase();
        if (codec === 'dts') {
            if      (longName.includes('master')          || profile.includes('hd ma')  || commercial.includes('master'))
                codec = 'dtsma';
            else if (longName.includes('high resolution') || profile.includes('hra')    || commercial.includes('high resolution'))
                codec = 'dtshr';
            else if (longName.includes('express')         || profile.includes('express')|| commercial.includes('express'))
                codec = 'dtsexpress';
        } else if (codec === 'eac3' && (longName.includes('atmos') || commercial.includes('atmos')))
            codec = 'eac3atmos';

        return codec;
    };

    // -=-=-= CODEC_TARGET_BPS  [audio_clean, stream_ordering] =-=-=-
    // Per-channel target bitrate (bps) for our encodable output codecs (ac3/eac3 cap at 6ch in ffmpeg). Single source for BOTH the bitrate-less quality
    // estimate in audioQuality and audio_clean's transcode targetTable, so a target change can't make the predicted score disagree with the bitrate used.
    const CODEC_TARGET_BPS = {
        aac:  { 1: 128000, 2: 256000, 3: 320000, 4: 384000, 5: 448000, 6: 512000, 7: 576000, 8: 640000 },
        opus: { 1: 128000, 2: 192000, 3: 256000, 4: 320000, 5: 320000, 6: 384000, 7: 448000, 8: 448000 },
        ac3:  { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
        eac3: { 1: 192000, 2: 224000, 3: 320000, 4: 384000, 5: 448000, 6: 640000 },
    };
    // -=-=-= audioQuality  [audio_clean, stream_ordering] =-=-=-
    // Scores a stream's quality (codec + bitrate vs transparent bitrate) to identify the "best" track. Declared after response so infoLog is available.
    const audioQuality = (stream) => {
        const codec = resolveCodecName(stream);

        //Check if we can't identify the codec. If we can't then notify once per codec
        if(!(codec in codecInfo) && !unknownCodecs.has(codec)) {
            unknownCodecs.add(codec);
            response.infoLog += `☒Stream ${stream.index}: Unknown audio codec "${codec}", using generic quality weighting.\n`;
        }

        //This is a pretty weak way to score an unknown codec
        const info = codecInfo[codec] ?? { score: 70, minimum: 128000, transparent: 320000 };

        //Get the variables ready for scoring
        const bitrate = Number(stream.bit_rate || 0);
        const channelScale = Math.pow((Math.max(2, Number(stream?.channels ?? 2))) / 2, 0.65);
        const minimum = info.minimum * channelScale;
        const transparent = info.transparent * channelScale;
        const maxPenalty = 18;
        let penalty = maxPenalty;

        // Lossless codecs are already "perfect"
        if (info.lossless)
            return info.score;

        // No stream-level bitrate reported (freshly-transcoded tracks routinely omit it). For codecs we know how to encode (aac, opus, ac3, eac3) we
        // estimate quality from the bitrate we'd target for this channel count instead of a blind midpoint. For source codecs that normally carry a
        // bitrate (dts, ac3 from disc, etc.) we log once and use the midpoint.
        if (bitrate <= 0) {
            const ch = Math.max(1, Number(stream?.channels ?? 2));
            const tbl = CODEC_TARGET_BPS[codec];
            if (tbl) {
                // ac3/eac3 top out at 6ch in ffmpeg, so cap the channel count so the estimate and its min/transparent thresholds scale together -
                // otherwise a 7.1 source scores below a 5.1 of the same codec (estBps pins at the 6ch target while the thresholds keep climbing).
                const capCh = Math.min(ch, codec === 'ac3' || codec === 'eac3' ? 6 : 8);
                const scale = Math.pow(Math.max(2, capCh) / 2, 0.65);
                const estBps = tbl[capCh] ?? 0;
                const estPenalty = estBps > info.minimum * scale
                    ? (estBps >= info.transparent * scale ? 0 : maxPenalty * (1 - ((estBps - info.minimum * scale) / ((info.transparent - info.minimum) * scale))))
                    : maxPenalty;
                return info.score - estPenalty;
            }
            response.infoLog += `☒Stream ${stream.index}: No bitrate reported for ${codec}, assuming nominal quality.\n`;
            return info.score - (maxPenalty / 2);
        }

        //Score the track
        if (bitrate > minimum) {
            if (bitrate >= transparent)
                penalty = 0;
            else
                penalty = maxPenalty * (1 - ((bitrate - minimum) / (transparent - minimum)));
        }

        return info.score - penalty;
    }
    // ===== END SHARED: audio codec scoring =====

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering]: stream / language / preset helpers =====
    // -=-=-= mediaInfoFor  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Find the mediaInfo track corresponding to an ffprobe stream (matched by StreamOrder === ffprobe index); undefined when absent. The single join point
    // between the two probes - resolveStreamBitrate/resolveChannels/resolveLang and the per-plugin language/loop sites all go through it.
    const mediaInfoFor = (s) => (file?.mediaInfo?.track || []).find(t => Number(t.StreamOrder) === s.index);
    // -=-=-= resolveLang  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Resolve a stream's language: ffprobe tags.language, then mediaInfo Language (files often tag one probe but not the other), trimmed + lowercased. Empty
    // when neither reports it; callers wanting a placeholder use `resolveLang(s) || 'und'`.
    const resolveLang = (s) => (s.tags?.language ?? (mediaInfoFor(s)?.Language ?? '')).trim().toLowerCase();
    // -=-=-= resolveStreamBitrate  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
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

    // -=-=-= resolveChannels (+ channelsFromLayout helper)  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Resolve an audio stream's channel count, ffprobe first then fallbacks (mirrors resolveStreamBitrate): mediaInfo Channels, then a channel-layout string
    // from ffprobe channel_layout or mediaInfo ChannelLayout/ChannelPositions - "5.1(side)" -> 6, "stereo" -> 2, "FL+FR+LFE" -> 3. Returns 0 only when no
    // source reports it, so channel-dependent logic (scoring, dedup, downmix, labelling, force_codec) stays correct for tracks whose ffprobe entry omits it.
    const channelsFromLayout = (layout) => {
        const s = String(layout || '').toLowerCase().trim();
        if (!s) return 0;
        if (s === 'mono') return 1;
        if (s === 'stereo' || s === 'downmix') return 2;
        if (s === 'quad') return 4;
        const m = s.match(/(\d+)\.(\d+)/);                          // "5.1", "7.1(side)", "2.1" -> full channels + LFE
        if (m) return Number(m[1]) + Number(m[2]);
        const tokens = s.split(/[+\s,]+/).filter(Boolean);          // "FL+FR+FC+LFE+BL+BR" / "L R C LFE Ls Rs" -> count positions
        return tokens.length > 1 ? tokens.length : 0;
    };
    const resolveChannels = (ffstream) => {
        const ff = Number(ffstream.channels || 0);
        if (ff > 0) return ff;
        const ffmedia = mediaInfoFor(ffstream);
        const mi = Number(ffmedia?.Channels || 0);
        if (mi > 0) return mi;
        return channelsFromLayout(ffstream.channel_layout || ffmedia?.ChannelLayout || ffmedia?.ChannelPositions);
    };

    // -=-=-= enrichStream  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Enrich a stream with both-probe bitrate + channels before summariseStream/audioQuality/scoring, so ffprobe-unreadable values (e.g. DTS-HD MA
    // bitrate in MP4) fall back to mediaInfo. Every summary and scoring call site uses this so logged tokens and the scoring path enrich identically.
    const enrichStream = (s) => ({ ...s, bit_rate: resolveStreamBitrate(s) || s.bit_rate, channels: resolveChannels(s) || s.channels });
    // -=-=-= summariseStream  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Shows: video codec; audio lang/channels/codec/bitrate(+role); subtitle lang/codec(+forced/role); data and attachment codec. Role/forced
    // detection mirrors the sorting logic (disposition flags first, then title keywords, via the shared classifiers) so every plugin's summary lines
    // up. subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Shared verbatim across all three.
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = resolveLang(s) || 'und';
        const lang = langRaw !== 'und' ? langRaw : '';
        if (type === 'video')
            return `[video:${codec}]`;
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            return `[audio:${[lang, ch, codec, rate].filter(Boolean).join(' ')}${role}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = s.disposition?.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${forced}${role}]`;
        }
        if (type === 'attachment')
            return `[attach:${codec}]`;
        if (type === 'data')
            return `[data:${codec}]`;
        return `[${type || 'unknown'}:${codec}]`;
    };

    // -=-=-= shortLang  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Short language code: strip any region/variant suffix so 'en-US', 'en_US', 'en.US' all compare as 'en'.
    const shortLang = (l) => l.replace(/[-_.].*$/, '');

    // -=-=-= networkDataOpt  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    //This is the only option I found that consistently made a difference. Not a huge difference but nonetheless...
    const networkDataOpt = (String(inputs.temp_on_network) === 'true' ? ' -flush_packets 0' : '');
    // -=-=-= globalOutputOpt  [audio_clean, clean_and_remux, stream_ordering] =-=-=-
    // Output-side ffmpeg options applied to every run (the place to add any universal muxer/output flag). Currently just the muxer packet-buffer ceiling for
    // ffmpeg's "Too many packets buffered" interleave error - chiefly a transcode concern (audio_clean) plus clean_and_remux's recovery of mis-interleaved
    // files; mostly vestigial on modern ffmpeg (7.x auto-sizes the queue) but cheap insurance.
    const globalOutputOpt = ' -max_muxing_queue_size 9999';
    // ===== END SHARED: stream / language / preset helpers =====

    // ===== SHARED [clean_and_remux, stream_ordering]: image / cover-art codecs =====
    // -=-=-= IMAGE_CODECS / isCoverArt  [clean_and_remux, stream_ordering] =-=-=-
    // Still-image / cover-art codecs. clean_and_remux drops these video/attachment streams; stream_ordering sorts such video streams last.
    const IMAGE_CODECS = ['mjpeg', 'mjpegb', 'png', 'apng', 'gif', 'bmp', 'webp', 'tiff'];
    // A stream is cover art / a still image when its codec is an image codec OR it carries a cover-art disposition (attached_pic/still_image/timed_thumbnails).
    const isCoverArt = (s) => IMAGE_CODECS.includes((s.codec_name || '').trim().toLowerCase())
        || hasDisposition(s, 'attached_pic') || hasDisposition(s, 'still_image') || hasDisposition(s, 'timed_thumbnails');
    // ===== END SHARED: image / cover-art codecs =====

    // Bail out gracefully on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams)) {
        response.infoLog += '☒No ffProbe stream data available for this file.\n';
        response.processFile = false;
        return response;
    }

    if(!['descending', 'ascending', 'disabled'].includes(inputs.channel_order)) {
        response.infoLog += '☒channel_order has not been configured, please configure required options.\n';
        response.processFile = false;
        return response;
    }
    if(!['descending', 'ascending', 'disabled'].includes(inputs.quality_order)) {
        response.infoLog += '☒quality_order has not been configured, please configure required options.\n';
        response.processFile = false;
        return response;
    }

    // Input summary — the streams exactly as they arrived, before re-ordering.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

    // VIDEO -> AUDIO -> SUBTITLE -> ATTACHMENT -> DATA -> OTHER?
    const streamOrder = { video: 0, audio: 1, subtitle: 2 , attachment: 3, data: 4};
    const preferredLanguages = (inputs.preferred_languages || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
    const sdhFirst = String(inputs.sdh_first) === 'true';
    const codecFirstList = (inputs.codec_first || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);

    const getLangRank = (lang, shortlang) => {
        let idx = preferredLanguages.indexOf(lang);
        if (idx === -1) idx = preferredLanguages.indexOf(shortlang);
        return idx === -1 ? 999 : idx;
    };

    const streams = [];
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
        const ffstream = file.ffProbeData.streams[i];
        // Enrich with mediaInfo bitrate before audioQuality/summariseStream: ffprobe can't read e.g. DTS-HD MA's bitrate in MP4/M4V, so those
        // formats are scored/displayed from the more accurate mediaInfo value.
        const enrichedStream = enrichStream(ffstream);
        const streamLang = resolveLang(ffstream) || 'und';
        const streamLangShort = shortLang(streamLang);
                
        const streamType = (ffstream.codec_type || '').trim().toLowerCase();
        // Resolve the canonical codec once (resolveCodecName does a probe-join + string work); codec_first membership can't change between list entries.
        const canon = streamType === 'audio' ? resolveCodecName(enrichedStream) : '';

        streams.push({
            index: ffstream.index,
            origPos: i,
            stream: enrichedStream,
            type: streamType,
            lang: streamLang,
            shortlang: streamLangShort,
            channels: enrichedStream.channels || 0,
            forced: ffstream?.disposition?.forced === 1,
            // Only score audio: scoring video/subtitle/data would spam bogus "unknown codec"/"invalid bitrate" notices, and quality is only used to sort audio.
            audioquality: streamType === 'audio' ? audioQuality(enrichedStream) : 0,
            // Does this audio stream's canonical codec match codec_first? Family-prefix match: "dts" catches dtsma/dtshr/dtsexpress, "eac3" catches eac3atmos.
            codecmatch: canon !== '' && codecFirstList.some(c => canon.startsWith(c)),
            default: ffstream?.disposition?.default === 1,

            // Role classification via the shared classifiers (single source of truth — keeps the sort and the summary line in agreement).
            commentary: isCommentary(ffstream),
            descriptive: isDescriptive(ffstream),
            sdh: isSdh(ffstream),
            lyrics: isLyrics(ffstream),

            // Cover art/poster/thumbnail sort last: ffmpeg cover-art dispositions (any codec) or a still-image codec - mirrors clean_and_remux image removal.
            coverArt: isCoverArt(ffstream),
        });
    }

    //Sort the streams
    streams.sort((a, b) => {
        //Stream Type
        const aOrder = streamOrder[a.type] ?? 99;
        const bOrder = streamOrder[b.type] ?? 99;

        if (aOrder !== bOrder)
            return aOrder - bOrder;

        //Video (but cover art / posters / thumbnails go last)
        if (a.type === 'video') {
            if (a.coverArt !== b.coverArt)
                return a.coverArt ? 1 : -1;
        //Audio
        } else if(a.type === 'audio') {
            //Language priority first. A track in a non-preferred language should not sort above one in a preferred language.
            const aRank = getLangRank(a.lang, a.shortlang);
            const bRank = getLangRank(b.lang, b.shortlang);
            if (aRank !== bRank)
                return aRank - bRank;

            //A commentary stream could be descriptive but it would still be a commentary
            const aRole = a.commentary ? 2 : (a.descriptive ? 1 : 0);
            const bRole = b.commentary ? 2 : (b.descriptive ? 1 : 0);
            if (aRole !== bRole)
                return aRole - bRole;

            //codec_first tier — preferred codecs form one group above the rest, each still ordered by channel/quality below; this only promotes the group.
            if (codecFirstList.length > 0 && (a.codecmatch !== b.codecmatch))
                return a.codecmatch ? -1 : 1;

            //Channel ordering (skipped when disabled)
            if (inputs.channel_order !== 'disabled' && a.channels !== b.channels)
                return (inputs.channel_order === 'descending' ? b.channels - a.channels : a.channels - b.channels);

            //Quality (skipped when disabled)
            if (inputs.quality_order !== 'disabled' && a.audioquality !== b.audioquality)
                return (inputs.quality_order === 'descending' ? b.audioquality - a.audioquality : a.audioquality - b.audioquality);
        //Subtitles
        } else if (a.type === 'subtitle') {
            //Forced always first
            if (a.forced !== b.forced)
                return a.forced ? -1 : 1;

            //Override
            if(sdhFirst && (a.sdh !== b.sdh))
                return a.sdh ? -1 : 1;

            //Language
            const aRank = getLangRank(a.lang, a.shortlang);
            const bRank = getLangRank(b.lang, b.shortlang);

            if (aRank !== bRank)
                return aRank - bRank;

            //Normal, lyrics/songs, SDH, descriptive, commentary - sdhFirst flag overrides SDH position above
            const aRole = a.commentary ? 4 : (a.descriptive ? 3 : (a.sdh ? 2 : (a.lyrics ? 1 : 0)));
            const bRole = b.commentary ? 4 : (b.descriptive ? 3 : (b.sdh ? 2 : (b.lyrics ? 1 : 0)));
            if (aRole !== bRole)
                return aRole - bRole;
        }

        //Next would be attachments and data but the order of these aren't important
        return a.index - b.index;
    });

    //Check if order changed and build the map; also normalise the audio default flag so exactly one audio track — the first in sorted order — is default,
    //matching what our ordering rules chose. Additive +default/-default preserves forced/commentary/etc; subtitle/video untouched.
    let ffmpegMap = '';
    let dispositionArgs = '';
    let changed = false;
    let audioIndex = -1;

    for (let i = 0; i < streams.length; i++) {
        ffmpegMap += ` -map 0:${streams[i].index}`;
        // Compare against each stream's ORIGINAL array position, not its absolute ffprobe index, so a file already in the desired order but with
        // non-contiguous indices (e.g. 0,1,3 after an upstream drop) isn't remuxed pointlessly. -map still uses the absolute index above.
        if (streams[i].origPos !== i) changed = true;

        if (streams[i].type === 'audio') {
            audioIndex++;
            if (audioIndex === 0 && !streams[i].default)
                dispositionArgs += ` -disposition:a:${audioIndex} +default`;
            else if (audioIndex > 0 && streams[i].default)
                dispositionArgs += ` -disposition:a:${audioIndex} -default`;
        }
    }

    if (!changed && dispositionArgs === '') {
        response.infoLog += '☑Streams already in desired order.\n';
        return response;
    }

    response.processFile = true;
    response.reQueueAfter = true;
    response.preset = `,${ffmpegMap} -c copy${dispositionArgs}${globalOutputOpt}${networkDataOpt}`;
    if (dispositionArgs !== '')
        response.infoLog += '☐Set the first audio track as the sole default.\n';
    response.infoLog += `☑Expected results: ${streams.map(s => summariseStream(s.stream)).join('')}\n`;

    return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
