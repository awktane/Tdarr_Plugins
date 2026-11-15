/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin curates a file's audio tracks: it decides which to KEEP and at what quality - and which to DROP - by language (keep at
                  surround, keep downmixed to stereo, or delete an unlisted language) and by role (commentary, audio-description, M&E and karaoke tracks
                  follow their own keep / stereo / delete setting). It can also downmix surround to 5.1 or stereo, force tracks to a chosen codec, remove
                  duplicate tracks, and apply two-pass EBU R128 loudness normalization. Guard options protect lossless, object-audio (Atmos/DTS:X/AC-4),
                  high-quality, and original-language tracks from destructive changes.\n\n
                  Stack order: clean_and_remux first; video_clean / audio_clean / sub_worker in any order (sub_worker before video_clean when the video carries
                  closed captions); stream_ordering last.\n\n
                  Because it can delete and re-encode audio, set the options deliberately - this can be destructive, especially with incorrectly
                  tagged audio tracks`,
    Version: '4.999.97',
    Tags: 'pre-processing,ffmpeg,audio_only,configurable',
    Inputs: [
        {
            name: 'language_stereo',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Languages to keep, but downmixed to stereo - a dub you want available without spending the space on its surround. Each surround track
                in one of these languages is transcoded in place to a single stereo codec_stereo track, using the method_stereo_downmix matrix; a track
                already at 2 channels or fewer is left alone.
                \\nBlank (default) forces no language to stereo. Matching works exactly as in language_surround - one form is enough, and und/mul/zxx/mis
                match literally.
                \\nThese tracks are never protected by the guards, so the downmix always happens. A language in BOTH this list and language_surround is
                treated as surround.
                \\nWith method_deduplicate on, such a track is judged as the stereo it becomes, so one stereo of the language survives: one whose bitrate
                is known outranks the fold, which has none, and an -error mode aborts before any encode.
                \\nExample:\\nspa,deu
                \\nKeep the Spanish and German dubs, but only in stereo.`,
        },
        {
            name: 'language_surround',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Languages to keep at full quality (surround). These follow downmix_to_six, downmix_to_stereo and codec_force. Blank (default) names
                no language. With language_stereo blank too, every language stays at surround. Once language_stereo names the language of a main (not
                secondary) track in the file, every language neither list names is unlisted and follows language_unlisted instead - still surround at its
                default, but downmixed or removed if that is set to stereo or delete.
                \\nOne form is enough - en, eng, or English all match the same language, region variants like en-US included, and Norwegian (no, nor)
                matches Bokmål (nb, nob) and Nynorsk (nn, nno). A track with no language tag counts as "und".
                \\nA language in neither this list nor language_stereo is "unlisted" and follows language_unlisted. A language in BOTH lists is treated as
                surround, so this list wins.
                \\nCommentary, descriptive, M&E and karaoke tracks are secondary whatever their language - they follow downmix_secondary, not these lists.
                \\nWhich tracks a guard can protect: only a genuine track kept at surround. A secondary track never is, and neither is one you have already
                sent to stereo or delete through language_stereo, language_unlisted or downmix_secondary - protecting a track from the very downmix you
                asked for would be nonsense.
                \\nException - dormancy: if NO genuine (non-secondary) track matches this list or language_stereo, the language settings
                go dormant, every genuine track is kept at surround, and language_unlisted=delete is suppressed. So a foreign-language-only file, Japanese
                only when the lists say English, keeps all its audio instead of losing it.
                \\nException - guard_original, when enabled, keeps an 'original'-disposition track at surround even in an unlisted language, and vetoes
                deleting it.
                \\nExample:\\neng,fra,jpn
                \\nEnglish, French and Japanese. The special codes und (undefined), mul (multiple), zxx (no linguistic content) and mis (no language code)
                match literally, so list them to keep those tracks.`,
        },
        {
            name: 'language_unlisted',
            type: 'string',
            defaultValue: 'surround',
            inputUI: {
                type: 'dropdown',
                options: ['surround', 'stereo', 'delete'],
            },
            tooltip: `What to do with a genuine track whose language is in NEITHER language_surround nor language_stereo. Only applies once at least one
                track DOES match one of those lists - otherwise dormancy keeps everything at surround (see language_surround).
                \\n=====
                \\nActions
                \\n=====
                \\nsurround (default) - keep an unlisted language at full quality, exactly as if it were in language_surround. Nothing is lost; use this
                until you trust your lists.
                \\nstereo - keep an unlisted language but downmix it to stereo, exactly as if it were in language_stereo.
                \\ndelete - remove an unlisted language from the file. There is no same-language safety net here: a plain track of that language is NOT
                required to survive, that rule belonging to downmix_secondary=delete. The only protections are dormancy, and the never-empty floor that
                keeps the last audio track; guard_original additionally vetoes the delete for an 'original'-flagged track.
                \\nCommentary, descriptive, M&E and karaoke tracks are not covered here - they follow downmix_secondary.`,
        },
        {
            name: 'codec_force',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled','2below','6below','all'],
            },
            tooltip: `Transcode EXISTING tracks to codec_surround or codec_stereo according to their channel count. With this off, an existing track keeps its
                codec unless another operation re-encodes it anyway - a stereo fold (language_stereo, language_unlisted=stereo, downmix_secondary=stereo), a
                downmix replace, a method_layout_err remix, or a method_loudnorm correction of a codec this plugin cannot write - which then uses those two
                settings.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - leave every existing codec as it is.
                \\n2below - transcode streams of two or fewer channels to codec_stereo. Anything above that keeps its original codec.
                \\n6below - transcode streams of six or fewer channels to codec_surround, and those of two or fewer to codec_stereo.
                \\nall - as 6below, but also transcodes surround tracks above six channels, each subject to its codec's own channel ceiling (ac3/eac3 6ch,
                aac/opus 8ch).
                \\nA guard-protected track is left in its source codec in every mode, 'all' included. A stream carrying more channels than the target codec
                can hold is not transcoded.
                \\nA track already in the target codec is left alone, so switching codec_stereo between aac and aac_vbr changes nothing on its own - that is
                a rate-control change, not worth a lossy re-encode. It does apply if method_loudnorm re-encodes the track anyway.`,
        },
        {
            name: 'codec_stereo',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','aac_vbr','ac3','eac3','opus'],
            },
            tooltip: `Codec for newly created stereo tracks. AAC and Opus are the most compatible choices for modern media servers and clients, EAC3 is
                useful for Dolby branding on compatible devices, and AC3 is the most broadly compatible legacy choice.
                \\naac_vbr uses libfdk_aac in VBR mode (-vbr 5, roughly 192-224 kb/s), better quality than native AAC CBR. It drops to -vbr 4 (roughly
                128-144 kb/s) when codec_force or method_loudnorm re-encodes an existing stereo track already at or below 144 kb/s, matching the
                lower-information source.
                \\nlibfdk_aac ships in the Linux and Windows builds but not the Mac one. On a node whose ffmpeg lacks it, aac_vbr falls back to Apple's
                aac_at (AudioToolbox) VBR on Mac, or to native aac at 256 kb/s on any other build, so the file still processes either way.
                \\ncodec_force never re-encodes an existing AAC track just to reach aac_vbr, since that would spend a generation of quality for no gain.
                method_loudnorm may still re-encode it when a loudness correction is genuinely needed.`,
        },
        {
            name: 'codec_surround',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','ac3','eac3','opus'],
            },
            tooltip: `Codec for newly created surround tracks, and for an existing one codec_force converts or another operation re-encodes anyway (see
                codec_force). AC3 and EAC3 are limited to 6 channels (5.1) by ffmpeg's native encoders, while Opus carries up to 8.`,
        },
        {
            name: 'downmix_secondary',
            type: 'string',
            defaultValue: 'surround',
            inputUI: {
                type: 'dropdown',
                options: ['surround', 'stereo', 'delete'],
            },
            tooltip: `What to do with SECONDARY tracks - commentary, visually impaired (audio description), M&E and karaoke. This is a role, not a language:
                a secondary track follows this setting whatever its language, and never language_surround, language_stereo or language_unlisted.
                \\n=====
                \\nActions
                \\n=====
                \\nsurround (default) - leave secondary tracks at their source channels, untouched by the downmix paths. codec_force and method_loudnorm
                still apply.
                \\nstereo - transcode each secondary track of more than 2 channels in place to a stereo codec_stereo track, using the method_stereo_downmix
                matrix.
                \\ndelete - remove secondary tracks, but only where a plain (non-commentary, non-descriptive, non-M&E, non-karaoke) track of the SAME
                language survives, and never if it would leave the file with no audio at all. So a file's only track, or a lone audio-description track
                with no plain track in its language, is always kept.
                \\nUnlike downmix_to_six and downmix_to_stereo, which make one track per language, each surround secondary track is handled in place and
                independently - one stereo per secondary track, preserving all of them, since method_deduplicate never removes a secondary track. Secondary
                tracks are never protected by the guards, so stereo always transcodes them.`,
        },
        {
            name: 'downmix_to_six',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'replace', 'add'],
            },
            tooltip: `Create a 5.1 track for a language that has none, built from the best higher-channel track it does have. The source is always a
                genuine track kept at surround - one in language_surround, or an unlisted one while language_unlisted=surround (the default) - and never
                a secondary (commentary, descriptive, M&E, karaoke) track.
                \\nNothing is created when the language already has a 5.1 track, or has no higher-channel track to build one from.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - create no new 6 channel track.
                \\nreplace - the new codec_surround 6 channel track replaces the higher-channel track it was made from, unless a guard protects that
                source, in which case the 6 channel track is added alongside instead. A downmix always drops channels, so under guard_quality=enabled
                (the default) or strict every source is protected and replace acts as add; with guard_quality=disabled, guard_lossless and
                guard_object_audio still protect a lossless or object-audio source.
                \\nadd - create the 6 channel track and keep the higher-channel source as well.`,
        },
        {
            name: 'downmix_to_stereo',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'replace', 'add'],
            },
            tooltip: `Create a stereo track for a language that has none, built from the best higher-channel track it does have, never from a secondary
                (commentary, descriptive, M&E, karaoke) track.
                \\nNothing is created when the language already has a stereo track, or has no higher-channel track to build one from.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - create no new 2 channel track.
                \\nreplace - the new codec_stereo track replaces the higher-channel track it was made from, unless that source was itself created by
                downmix_to_six or is protected by a guard, in which case the stereo track is added alongside instead. A downmix always drops channels, so
                under guard_quality=enabled (the default) or strict every source is protected and replace acts as add; with guard_quality=disabled,
                guard_lossless and guard_object_audio still protect a lossless or object-audio source.
                \\nadd - create the stereo track and keep the higher-channel source as well.`,
        },
        {
            name: 'method_dedup_region',
            type: 'string',
            defaultValue: 'fold',
            inputUI: {
                type: 'dropdown',
                options: ['fold', 'distinct'],
            },
            tooltip: `How a region- or script-qualified language tag (pt-BR, pt-PT, en-US, zh-Hans) is grouped for deduplication and for the
                one-downmix-per-language sets. It only matters when two tracks share a base language but differ by region or script; a plain tag such as
                eng or en is unaffected.
                \\n=====
                \\nActions
                \\n=====
                \\nfold (default) - a base language and all its regional variants are ONE language: en and en-US collapse, and pt-BR and pt-PT are the
                same Portuguese. So a duplicate is removed and only one downmix is created. Best for most libraries, where a region tag is cosmetic.
                \\ndistinct - each region or script variant is its own language: pt-BR and pt-PT both survive dedup as different dubs and each gets its own
                downmix, and en-US stays separate from en. Choose this only if you deliberately keep multiple regional dubs of one language.`,
        },
        {
            name: 'method_deduplicate',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'multi-stereo', 'multi-stereo-error', 'channel', 'channel-error'],
            },
            tooltip: `Reduce duplicate audio tracks - same language, same broad role - down to the highest quality option(s).
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - remove nothing for being a duplicate. Every track is left exactly as found.
                \\nmulti-stereo - keep one track per language for each of two broad roles: "surround" (more than 2 channels) and "stereo" (2 or fewer). The
                highest quality track in each role wins and the rest of that role are removed.
                \\nchannel - keep one track per language for each distinct channel count, so 2.0, 5.1 and 7.1 are each their own group. The highest quality
                track in each count wins and the rest sharing that exact count are removed.
                \\nmulti-stereo-error - same grouping as multi-stereo, but on finding a duplicate it aborts the run and sends the file to the error queue
                instead of deleting anything.
                \\nchannel-error - same grouping as channel, aborting in the same way.
                \\nAn abort removes no streams and applies no other change from that run, so you can inspect and tag the file by hand before requeueing it.
                \\nExample:\\nOne file, same language throughout: 7.1 aac, 5.1 truehd, 2.0 ac3, 2.0 mp3
                \\nchannel keeps the 7.1 aac, the 5.1 truehd and the better of the two stereos (2.0 ac3) - the 7.1 and 5.1 are different channel counts, so
                both survive.
                \\nmulti-stereo keeps the 5.1 truehd, better quality than the 7.1 aac and both counting as "surround", plus the 2.0 ac3. The 7.1 aac
                survives too under the default guard_quality=enabled, which blocks a removal that would drop channels the survivor lacks; with
                guard_quality=disabled it is removed.
                \\nNever treated as duplicates: secondary tracks - commentary, descriptive, M&E and karaoke - since two different commentaries, cast and
                crew versus directors, are distinct content even when both are titled "Commentary", and an M&E or karaoke mix is not a copy of the main
                track either; and any track whose language folds to "und", because every untagged track shares
                that one key and two untagged tracks of genuinely different languages would otherwise look alike. An und track can neither be removed nor
                be the survivor that removes another.
                \\nA surround track the stereo tier (language_stereo, language_unlisted=stereo) folds to stereo in the same run is judged as the
                codec_stereo stereo it becomes, before it is transcoded. It has no measured bitrate, so a stereo of its language whose bitrate is known
                outranks it, and an -error mode aborts before any encode.
                \\nA stream newly created by downmix_to_six or downmix_to_stereo is always kept. While downmix_to_six is enabled the 5.1/5.0 band (5-6
                channels) forms its own role rather than folding into "surround", so a downmix-created 6 channel track is never dropped in favour of a
                7.1; while downmix_to_stereo is enabled, exactly-2-channel tracks likewise form their own role rather than folding into "stereo", so a
                downmix-created 2.0 is never dropped in favour of a mono track.`,
        },
        {
            name: 'method_layout_err',
            type: 'string',
            defaultValue: 'keep',
            inputUI: {
                type: 'dropdown',
                options: ['keep','drop','remix'],
            },
            tooltip: `What to do when a track cannot be written correctly in the target codec because of its channel layout. Left unhandled, ffmpeg aborts
                the whole job on that track, or writes a 5.0 or 6.1 with its speakers moved.
                \\n=====
                \\nActions (only for a layout with no lossless relabel)
                \\n=====
                \\nkeep (default) - leave the track in its source codec rather than writing it as opus. Nothing fails and no audio is lost; a
                loudnorm-only run simply leaves that one track un-normalized.
                \\ndrop - remove the track entirely, but only where it is codec_force sending it to opus. On the method_loudnorm route the removal would
                come too late, so drop behaves as keep and the track stays un-normalized in its source codec. The last remaining audio track - and the
                last main one, where the rest are commentary or descriptive audio - is never dropped, falling back to keep, and a stereo or 5.1 that a
                downmix would derive from the track is still created.
                \\nremix - downmix the track to a codec_stereo stereo, using method_stereo_downmix, with loudness applied when method_loudnorm is active.
                It defers to downmix_to_stereo and the stereo tier (language_stereo, language_unlisted=stereo, downmix_secondary=stereo) when they already
                convert the track, and falls back to keep rather than create a duplicate stereo. A track guard_quality protects keeps its channels: the
                stereo is added beside it, and the track stays in its source codec.
                \\nThis only arises when a track is to be written as opus and its layout is one libopus cannot encode, such as 2.1, 3.1, 4.0, 4.1,
                5.0(side), 6.0, 6.1(back), 7.0 or 7.1(wide), or one it writes with the speakers moved, 5.0 and 6.1 (the centre lands on a surround); AAC
                keeps every one of these layouts, and AC3 and EAC3 take those of up to 6 channels but write 6.0 as 5 channels,
                which guard_quality counts as a channel drop. It is reached because codec_force is sending the track to opus, because method_loudnorm has
                to re-encode a kept track whose own codec ffmpeg cannot encode, such as a DTS core, and it converges to codec_surround=opus, or because
                method_loudnorm would re-encode a track that is already opus back into opus. Such a track is always left as it is, un-normalized, whatever
                this is set to.
                \\nA layout that merely needs relabelling (quad(side) to quad) is ALWAYS relabelled losslessly, whatever this is set to.`,
        },
        {
            name: 'method_loudnorm',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'tv', 'cinema', 'quiet_room'],
            },
            tooltip: `Two-pass measured loudness normalization (EBU R128, ffmpeg's loudnorm filter) for every kept audio track the guards do not protect.
                audio_clean runs its own analysis pass per track and applies the measured correction in the same invocation, so no second flow step is
                needed.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - no loudness measurement or correction. Every other audio_clean option is unaffected.
                \\ntv - -16 LUFS integrated, LRA 11, true peak -1.5 dBTP. General home viewing, matching typical streaming-platform loudness.
                \\ncinema - -23 LUFS integrated, LRA 15, true peak -1.0 dBTP. The EBU R128 broadcast standard, preserving the most theatrical dynamic range.
                \\nquiet_room - -16 LUFS integrated, LRA 6, true peak -1.5 dBTP. The most compressed of the three: best for late-night or shared-space
                listening, small speakers (laptop, phone, soundbar) and noisy rooms. It costs the track's original theatrical dynamics, so prefer tv or
                cinema on a capable system.
                \\nLRA is the loudness range, the spread between the quiet and loud parts: a higher LRA preserves more dynamics, a lower one compresses
                them. The correction is baked into the re-encode, not a per-playback toggle.
                \\nA track already within about 1 LU of the target is left completely untouched, with no re-encode, and keeps its loudness range: quiet_room
                evens out the range only on a track it corrects for loudness. A track whose codec this plugin cannot encode - a kept DTS core or MP3, say -
                converges to codec_surround or codec_stereo, respecting each codec's channel ceiling, but only as a side effect of a correction genuinely
                needed, never on a track that is already close enough.
                \\nA track re-encoded in its own codec keeps its source bitrate, so the correction costs nothing beyond the re-encode itself. Only a genuine
                codec change picks a new target rate. If codec_force covers the track, its codec_surround/codec_stereo choice applies here as well: the
                encode is already being spent, so the setting is honoured even where codec_force alone would have declined it as not worth a re-encode.
                \\nIt applies whether or not the track is being downmixed, forced or converted for some other reason this run: an otherwise untouched track
                is measured and corrected on its own, while one already being modified rides on that same re-encode instead of a separate one.
                \\nWhen loudnorm has to compress a track to reach the target (its range is wider than the preset's, or the gain would push its peaks past
                the true-peak limit), the correction is measured once more before it is applied - a second full pass, two to two and a half times as long
                as the first. A correction that would widen the loudness range is not applied. One that lands off target is followed by a level trim onto
                it - measured once more when the trim needs a limiter - and is not applied if it still misses the target by more than 1 LU. A correction
                not applied leaves the track at its loudness.
                \\nOn a Matroska container (mkv, webm, mka) a track untouched by anything else this run is stamped with an awk_loudnorm tag once it is
                corrected, found already on target or has its correction left out, and a later run trusts that tag and skips re-measuring while this
                setting stays the same; changing the setting forces a fresh measurement.
                The stamp records the track's codec and channel count (and, for a track left as it was, a fingerprint of its opening audio), so a track
                another tool has since converted, downmixed or changed is measured again; another tool's same-codec, same-channel re-encode of a track
                this plugin re-encoded is not noticed. The mp4-family muxers (mp4, m4v, m4a, mov) drop custom tags, so there loudnorm re-measures on every
                stack cycle - each later plugin that changes the file sends it round the stack again - while an already-correct track stays a no-op rather
                than remuxing.`,
        },
        {
            name: 'method_stereo_downmix',
            type: 'string',
            defaultValue: 'default',
            inputUI: {
                type: 'dropdown',
                options: ['default','dialogue'],
            },
            tooltip: `How a stereo (2.0) track is folded down from a surround source.
                \\n=====
                \\nActions
                \\n=====
                \\ndefault (default) - ffmpeg's built-in downmix matrix, the one -ac 2 uses. The standard, least-surprising fold.
                \\ndialogue - a Lo/Ro downmix matrix, keeping the centre at -3 dB and dropping the LFE, so dialogue stays clear. The cost is a more
                opinionated fold that shifts the spatial image.
                \\nFalls back to default automatically for unusual layouts such as 2.1 and 3.0. Either fold ends in a peak limiter at -2 dBFS, so a hot
                surround mix cannot clip on the way down; it acts only on the peaks, costing under 1 LU of loudness on the hottest mixes.`,
        },
        {
            name: 'guard_lossless',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled','disabled'],
            },
            tooltip: `Protect a track whose SOURCE is lossless (TrueHD, DTS-HD MA, FLAC, PCM and the like) from a destructive operation: downmix_to_six or
                downmix_to_stereo 'replace', codec_force, duplicate removal, and method_loudnorm.
                \\n=====
                \\nActions
                \\n=====
                \\nenabled (default) - protect lossless sources from every operation above.
                \\ndisabled - no lossless-specific protection. guard_quality, if enabled, still evaluates every operation on its own terms.
                \\nWhen a guard fires, a downmix 'replace' becomes 'add', so the source is kept and the downmix added alongside; a codec_force or
                method_loudnorm re-encode is skipped and the track left in its source codec; and a duplicate is kept rather than removed. Only a genuine
                track kept at surround is eligible - see language_surround.
                \\nThe three guards are fully independent, not a fallback chain, so relaxing quality-based protection never quietly exposes a lossless
                master; you have to turn this off deliberately. The reverse holds too: disabling THIS alone does not guarantee a lossless source gets
                touched, because guard_quality's margin math still runs against that source's near-maximum quality score and keeps blocking a conversion to
                any lossy codec unless guard_quality is relaxed as well.`,
        },
        {
            name: 'guard_object_audio',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled','disabled'],
            },
            tooltip: `Protect a track carrying OBJECT AUDIO - Dolby Atmos on E-AC-3 or TrueHD, DTS:X, MPEG-H, or AC-4 - from a destructive operation:
                downmix_to_six or downmix_to_stereo 'replace', codec_force, duplicate removal, and method_loudnorm.
                \\n=====
                \\nActions
                \\n=====
                \\nenabled (default) - protect object-audio tracks from every operation above.
                \\ndisabled - no object-audio-specific protection. The other two guards, if enabled, still evaluate every operation on their own terms.
                \\nffmpeg has no encoder for these object layers, so ANY re-encode permanently flattens the track to its plain channel bed and silently
                discards the height and object information. That is the same irreversible loss guard_lossless prevents for lossless masters, but for the
                LOSSY carriers guard_lossless does not cover - Atmos on E-AC-3, and DTS:X on a DTS core or HR. Atmos and DTS:X on a lossless carrier
                (TrueHD, DTS-HD MA) are already covered by guard_lossless.
                \\nAs with the other guards, one that fires turns a downmix 'replace' into 'add', skips a codec_force or method_loudnorm re-encode, and
                keeps a duplicate; only a genuine track kept at surround is eligible (see language_surround).
                \\nDetection is best-effort. Atmos on E-AC-3 is reliable, but DTS:X relies on a MediaInfo field its own maintainers describe as incomplete
                for an undocumented format, so a real DTS:X track may occasionally go unrecognised. It never false-positives.
                \\nAC-4 is protected WHOLESALE, because no probe separates its immersive variants (IMS, AJOC) from plain channel-based AC-4. Since ffmpeg
                has no AC-4 encoder, protecting a channel-based one costs nothing - the track simply stays AC-4 - while leaving an immersive one
                unprotected would flatten it to stereo.
                \\nA recognised object-audio track is also PREFERRED over an otherwise-equal plain track when method_deduplicate picks a survivor. That
                preference belongs to dedup's own ranking, so it applies whether this guard is enabled or disabled.`,
        },
        {
            name: 'guard_original',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled','enabled'],
            },
            tooltip: `Protect a foreign film's ORIGINAL-language track from being downmixed or deleted merely because its language is in neither
                language_surround nor language_stereo.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - the original track follows normal unlisted-language handling, so language_unlisted may downmix or delete it.
                \\nenabled - keep an unlisted-language original track at surround, exactly as if its language WERE in language_surround, and never delete
                it. That also vetoes language_unlisted=delete for it: an original track is never the one you meant to throw away.
                \\nThe track has to be identifiable as original - the ffmpeg 'original' disposition flag, or an "original" title. An untagged foreign track
                carries no signal to key off, so nothing here can rescue it.
                \\nIt only bites on an unlisted-language original while a wanted language is also present, such as a Japanese 5.1 original beside an English
                dub with language_surround=eng. An original already in a listed language, or a foreign-only file whose language settings are dormant, is
                kept at surround anyway and is unchanged by this.
                \\nCommentary, descriptive, M&E and karaoke tracks are unaffected: this clears only the LANGUAGE decision, never the role one, so an
                'original' commentary still follows downmix_secondary.`,
        },
        {
            name: 'guard_quality',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled','strict','disabled'],
            },
            tooltip: `Protect a track from a destructive operation - downmix_to_six or downmix_to_stereo 'replace', codec_force, duplicate removal,
                method_loudnorm, and a method_layout_err remix - whenever that operation would reduce the channel count, or a lossy source's predicted
                quality drop is significant.
                \\n=====
                \\nActions
                \\n=====
                \\nenabled (default) - protect when the operation reduces channel count, or a lossy source's predicted quality drop is more than about 7
                points. A comparable-codec swap such as 640k E-AC-3 to 640k AC3, or a full-rate 1.5 Mbps DTS 5.1 to 640k AC3, is allowed through, while
                flattening a Dolby Atmos or DTS-HD source to 640k AC3 is blocked. AC3 to EAC3 at equal quality is allowed.
                \\nstrict - as enabled, but a lossy source is protected on ANY predicted drop however small. The most protective tier: it also blocks the
                1.5 Mbps DTS 5.1 to 640k AC3 that enabled lets through.
                \\ndisabled - no channel-count or quality-margin protection. guard_lossless, if enabled, still protects lossless sources on its own.
                \\nProtection is earned PER OPERATION, judged against that operation's real target codec and channel count, rather than being a single
                "best track" flag. As with the other guards, one that fires turns a downmix 'replace' into 'add', skips a codec_force or method_loudnorm
                re-encode, and keeps a duplicate; only a genuine track kept at surround is eligible (see language_surround).
                \\nBecause a downmix always drops channels, a downmix 'replace' always behaves as 'add' under either enabled or strict, and so does a
                method_layout_err remix: its stereo is added beside the track, which keeps its channels and source codec. codec_force='all' does not
                override this either - a guarded track is left alone in every force mode.`,
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

    // #region SHARED helpers (25 sections: stream codec type … mp4 strict compliance arg)
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
    // classifier, sort key, summary token and title tagger reads, so the lists can never drift; isCoverArt alone reads its three cover-art flags raw (see
    // there). The roles also carry the words European releases title such tracks with, unflagged: commentary, audio description and SDH in German, French,
    // Spanish, Portuguese, Italian, Dutch, Polish and the Nordic languages; forced in all of those but the Nordic ones, which have no standard forced label;
    // dub in all but German, Dutch and Finnish; original in German, French, Italian, Dutch and Polish (Polish in either word order), and in Spanish and
    // Portuguese through the bare 'original'. Plurals, inflected forms and the one-word compounds release labels use (Kommentare, forçados, kuulovammaisille,
    // Audiokommentar) are included - compounds have no end, so these are the standard labels, not every word. Each is a whole-token match, so only a word
    // that means nothing else in a track title belongs here: VO, OV and UT stay out, and French, Italian, Dutch and Polish carry 'original' as the phrase,
    // since their lone word also names an original soundtrack (bande originale, oryginalna ścieżka dźwiękowa). Every one is pinned by the harness.
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
                                'hörselskadade', 'hørehæmmede', 'hørselshemmede', 'kuulovammaiset', 'kuulovammaisille'],        tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced','foreign', 'forcé', 'forcés', 'forzados', 'erzwungen', 'forçadas',
                                'forçada', 'forçados', 'forzati', 'geforceerd', 'geforceerde', 'wymuszone', 'wymuszony'],       tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed', 'dubbing', 'doublage', 'doblaje', 'doblado', 'dublado', 'dublagem',
                                'doppiaggio', 'doppiato', 'dubbad', 'dubbet'],                                                  tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original', 'originalton', 'o-ton', 'originalfassung', 'version originale',
                                'versione originale', 'originele versie', 'wersja oryginalna', 'oryginalna wersja'],            tag: 'Original'    },
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
    // -=-=-= mp4TagPlanLog (+ TAG_KEY_LOG_MAX) [all five] =-=-=-
    const TAG_KEY_LOG_MAX = 40;   // several keys share one line, and a key is a name rather than free text, so each echo is kept short
    // What the plan costs, as log lines: the native tags the flag rewrites, the custom keys a flagless mux leaves behind, and each cover mp4CoversLost
    // names (same `kept` argument). The rewrite is said on every mux that keeps a marker: nothing else names it, so a library recovered into mp4 lost
    // its readable tags in silence, and the marker is permanent.
    const mp4TagPlanLog = (plan, container, kept = []) => {
        const c = String(container || '').toLowerCase();
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
    // data stream, Matroska carrying the chapters natively. The fourcc list stays closed: every other data track is left to the plugin's data rule (the other
    // four copy it; clean_and_remux removes it), and a 'tx3g' track no chapter reference names is demuxed as a mov_text subtitle, not as data. The demuxer is
    // read from format_name, never the extension. Tdarr probes without -show_chapters, so chapters are known from mediaInfo's Menu tracks or from the track's
    // own nb_frames, the chapter count ffmpeg reads (equal at 1, 3, 4, 7 and 20 chapters), which still answers when mediaInfo did not scan the file; a
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
    // tmcd (mov) - each written from its video's mp4VideoTimecode, never from a source track. A copied tmcd (mov) is kept, and listed so, whatever its timecode
    // or reference (fmtprobe create:tmcd-copied) - bar a zero-duration one whose sample sits first in the file, which the mov demuxer drops on the next read
    // and no probe tells from one that survives.
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
    // One line per video stream movLosesDvBox flags in a write into `container`, '' when it flags none, on the pass that writes it; `act` names a write
    // that is not a remux. `streams` is the list the output maps, each written stream as the caller reads it. clean_and_remux's move to mp4 or mkv is
    // advised only where it helps. A stream whose only Dolby Vision signal is its fourcc has no box to lose, so its line says that instead, and a dvhe one
    // reads honestly once moved (hvc1 in mp4, no fourcc in Matroska). A record no copy keeps (dvRecordSurvivesCopy) is lost by any remux, so its line
    // is dvCopyLossLine's.
    const movDvLossLine = (container, streams, act = 'remux') => streams.filter((s) => movLosesDvBox(container, s)).map((s) => {
        const tag = String(s.codec_tag_string || '').toLowerCase().trim();
        if (!isDolbyVisionVideo({ ...s, codec_tag_string: '' }, mediaInfoFor(s))) {
            return `☒${streamTag(s.index)} The video is tagged ${tag} but holds no Dolby Vision box${tag === 'dvhe' ? ' - run clean_and_remux first to move the'
                + ' file to mp4 or mkv, which drops the stale tag' : ''}\n`;
        }
        return `☒${streamTag(s.index)} Dolby Vision is lost in this ${act} - ${dvRecordSurvivesCopy(s) ? 'ffmpeg cannot write its box into a .mov; run'
            + ' clean_and_remux first to move the file to mp4 or mkv' : 'its record does not match the video\'s colour, so no ffmpeg copy keeps it'}\n`;
    }).join('');
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
    // placeholder use `resolveLang(s) || 'und'`. mediaInfo's is read through mediaInfoText: a tag of whitespace and control characters (a tab) reads as
    // none in ffprobe and reaches mediainfo.js as a base64 object, and read raw it threw and failed the file on every requeue.
    const resolveLang = (s) => { const t = (s.tags?.language || '').trim(); return (t || mediaInfoText(mediaInfoFor(s)?.Language)).trim().toLowerCase(); };
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
        // Rows of another kind: the table holds Norwegian only as the macrolanguage nor, not its two written forms, so Bokmål and Nynorsk (nob and nno, which
        // land 0x7fff) are written as nor - the language kept, the written form lost, and a .mov holds the two as one language. Every other language the muxer
        // drops still reads back with none: the table holds Swedish and Irish only as Mac codes ffmpeg spells sve and iri, which no plugin reads as a language.
        nob: 'nor', nno: 'nor' });
    // -=-=-= MOV_LANG_STORED  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // Every code the mov muxer's table holds: written into a .mov, these 97 read back as written and every other code reads back with no language - a census
    // of all 17,576 lower-case three-letter codes (and ENG, Eng, und and en, none stored) on jellyfin-ffmpeg 7.1.4, 2026-11-15. Swedish and Irish are there
    // only as the Mac codes sve and iri, so swe, gle, hrv, srp and fil, among others, land 0x7fff; MOV_LANG respells the ones the table holds another way.
    const MOV_LANG_STORED = new Set(['alb', 'amh', 'ara', 'arm', 'asm', 'aym', 'aze', 'baq', 'bel', 'ben', 'bul', 'bur', 'cat', 'ces', 'chi', 'dan', 'dut',
        'dzo', 'eng', 'epo', 'est', 'fin', 'fra', 'geo', 'ger', 'gre', 'grn', 'guj', 'heb', 'hin', 'hun', 'ice', 'ind', 'iri', 'ita', 'jav', 'jpn', 'kan',
        'kas', 'kaz', 'khm', 'kin', 'kir', 'kor', 'kur', 'lao', 'lat', 'lav', 'lit', 'mac', 'mal', 'mar', 'may', 'mlg', 'mlt', 'mol', 'mon', 'nep', 'nor',
        'nya', 'ori', 'orm', 'per', 'pol', 'por', 'pus', 'que', 'ron', 'run', 'rus', 'san', 'sin', 'slk', 'slv', 'smi', 'snd', 'som', 'spa', 'sve', 'swa',
        'tam', 'tat', 'tel', 'tgk', 'tgl', 'tha', 'tib', 'tir', 'tuk', 'tur', 'uig', 'ukr', 'urd', 'uzb', 'vie', 'wel', 'yid']);
    // -=-=-= movLangRespellArgs (+ movLangRespelled, movLangDropped, movLangRespellLog)  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The language writes a remux into .mov owes the tracks it copies or re-encodes: a .mov another tool wrote can hold a spelling the table lacks
    // (AVFoundation stores deu and nld), which the copy would lose, so each such language goes back in MOV_LANG's spelling and nothing else is touched (a
    // census of 400 spellings on jellyfin-ffmpeg 7.1.4: the muxer drops every key and stores every value). Matched by the language itself - the output stream
    // specifier m:language:<code> - so no output index is needed; a track whose language a run writes itself gets the same spelling (movLangCode).
    const movLangRespelled = (container, streams) => (container !== 'mov' ? [] : [...new Set(streams.map((s) => getTagCI(s?.tags, 'language')))]
        .filter((l) => MOV_LANG[l]));
    const movLangRespellArgs = (container, streams) => movLangRespelled(container, streams)
        .map((l) => ` -metadata:s:m:language:${l} language=${MOV_LANG[l]}`).join('');
    // The languages among `streams` a .mov write loses outright: a code the table stores under none (MOV_LANG_STORED), which the next pass reads as no
    // language (movLangReadBack); und already reads as none.
    const movLangDropped = (container, streams) => (container !== 'mov' ? [] : [...new Set(streams.map((s) => getTagCI(s?.tags, 'language')))]
        .filter((l) => String(l || '').trim() && String(l).toLowerCase() !== 'und' && !MOV_LANG_STORED.has(MOV_LANG[l] || l)));
    // One line per language the args respell among `streams`, the ones the output holds, so a language change the next pass reads is said; Bokmål and
    // Nynorsk (nob, nno) say that they merge. A language the .mov loses (movLangDropped) gets the same line, as written with no language.
    const movLangRespellLog = (container, streams) => movLangRespelled(container, streams).map((l) => `☐Writing ${l} as ${MOV_LANG[l]} - a .mov stores no`
        + ` ${l}${MOV_LANG[l] === 'nor' ? ', so Bokmål and Nynorsk both become Norwegian and can no longer be told apart' : ''}\n`).join('')
        + movLangDropped(container, streams).map((l) => `☒Writing ${logSafe(l)} as no language - a .mov stores no ${logSafe(l)}\n`).join('');
    // -=-=-= movLangReadBack  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // Stream s as the next pass reads its language after a .mov write, for an Expected results line: in MOV_LANG's spelling, or as und where the table
    // stores the code under none (MOV_LANG_STORED) - und, not no tag, so the source's own mediaInfo language does not stand in for it.
    const movLangReadBack = (container, s) => {
        const l = getTagCI(s?.tags, 'language');
        const back = container !== 'mov' || !l ? l : MOV_LANG_STORED.has(MOV_LANG[l] || l) ? MOV_LANG[l] || l : 'und';
        return back === l ? s : { ...s, tags: { ...(s.tags || {}), language: back } };
    };
    // ===== END SHARED: mov language table =====

    // ===== SHARED [audio_clean, sub_worker]: mov language remap =====
    // -=-=-= to6392T  [audio_clean, sub_worker] =-=-=-
    // Fold a language token to a lowercase 3-letter ISO 639-2/T code: langKey folds spelled names and 639-2/B onto the 2-letter key, which ISO639_1_TO_2 maps
    // to /T; an already-3-letter code (eng, fil, und) or an unmappable token is left as-is. Used where a 3-letter code is required - sub_worker's mp4-family
    // sidecar import (mdhd stores only /T) and the mov remap below - and it is the fold MOV_LANG expects. Mirrors clean_and_remux's toCanonicalTag
    // threeLetter(false).
    const to6392T = (lang) => { const key = langKey(lang); if (!key || key.length !== 2) return lang; return ISO639_1_TO_2[key] || lang; };
    // -=-=-= movLangCode  [audio_clean, sub_worker] =-=-=-
    // A language a run writes into a .mov: folded to /T, then to the spelling the mov table stores (MOV_LANG) - audio_clean on an audio language write,
    // sub_worker on a subtitle language write.
    const movLangCode = (lang) => { const t = to6392T(lang); return MOV_LANG[t] || t; };
    // ===== END SHARED: mov language remap =====

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
    // when it runs first. A fourcc-only signal (a dvhe .mov whose box is gone) counts too, as the stream still reads as Dolby Vision; movDvLossLine says
    // it holds no box. Cover art is never the subject.
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

    // #region SHARED helpers (1 section: ffmpeg path)
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: ffmpeg path =====
    // -=-=-= ffmpegPathOf [all five] =-=-=-
    // The node's ffmpeg: Tdarr hands a classic plugin otherArguments.ffmpegPath, and the bare name - a PATH lookup - stands in when it supplied none. Every
    // ffmpeg spawn in the five plugins resolves the binary here, so a change to how it is found reaches all of them at once.
    const ffmpegPathOf = (otherArgs) => String(otherArgs?.ffmpegPath || 'ffmpeg');
    // ===== END SHARED: ffmpeg path =====
    // #endregion

    // #region SHARED helpers (7 sections: ffmpeg metadata escaping … track title write)
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

    // ===== SHARED [audio_clean, video_clean]: statistics tag clearing =====
    // -=-=-= STATS_TAG_RE / staleStatsArgs / staleStatsNote  [audio_clean, video_clean] =-=-=-
    // mkvmerge's per-track statistics (and mkvpropedit's recount) describe the bytes of THAT track. ffmpeg copies a mapped stream's tags onto its output, so a
    // stream this plugin RE-ENCODES would carry the source's figures - a 0.91 Mbps encode advertised to Plex/Jellyfin/MediaInfo as 48 Mbps (measured) - and
    // MediaInfo's bitrate on mkv IS that tag (or, for the one track left without tags, the file size minus the others'). So the encode itself clears them:
    // the Matroska muxer drops a key set to empty, and ffmpeg rewrites DURATION, which stays. A copied stream keeps them, since they are true of it. Only keys
    // the source carries are emitted, spelled as it spells them (a -<lang> suffix included), so a stream without statistics changes nothing, and the pattern
    // admits only [A-Za-z0-9_-], so no key can break the preset's quoting.
    const STATS_TAG_RE = new RegExp('^(BPS|NUMBER_OF_FRAMES|NUMBER_OF_BYTES|_STATISTICS_TAGS|_STATISTICS_WRITING_APP|_STATISTICS_WRITING_DATE_UTC)'
        + '(-[A-Za-z0-9_]+)?$', 'i');
    const staleStatsArgs = (spec, srcStream) => Object.keys((srcStream && srcStream.tags) || {}).filter((k) => STATS_TAG_RE.test(k))
        .map((k) => ` -metadata:s:${spec} "${k}="`).join('');
    // The one line for a file whose re-encoded streams lost their statistics. None when they were mkvpropedit's own: Tdarr's "Run mkvpropedit on files before
    // running plugins" is then on and recounts them on every scan. Until they are recounted MediaInfo shows nothing for a cleared audio or subtitle track and
    // estimates a cleared video track from the file bytes left over (measured +57% / -12% against the packet sum, with and without 16 font attachments).
    const staleStatsNote = (srcStreams) => {
        const cleared = srcStreams.filter((s) => staleStatsArgs('x', s) !== '');
        const writer = (s) => {
            const k = Object.keys(s.tags || {}).find((x) => /^_STATISTICS_WRITING_APP(-[A-Za-z0-9_]+)?$/i.test(x));
            return k ? s.tags[k] : '';
        };
        if (!cleared.length || cleared.some((s) => /^mkvpropedit/i.test(String(writer(s))))) return '';
        const n = cleared.length;
        return `☒Cleared the copied bitrate/size statistics on ${n} re-encoded stream${n === 1 ? '' : 's'} - until they are recounted`
            + ' MediaInfo shows no bitrate for a cleared audio or subtitle track and estimates a cleared video track\'s from the leftover file bytes; Tdarr\'s'
            + ' "Run mkvpropedit on files before running plugins" (Options, Worker Behavior) recounts them on every scan\n';
    };
    // ===== END SHARED: statistics tag clearing =====

    // ===== SHARED [audio_clean, video_clean]: ffmpeg encoder probe =====
    // -=-=-= parseFfmpegEncoders  [audio_clean, video_clean] =-=-=-
    // Parse `ffmpeg -hide_banner -encoders` stdout into a Set of encoder names. Each encoder row is "<6 flag chars> <name> <description>" (e.g. " V....D
    // hevc_nvenc NVIDIA NVENC hevc encoder"); the leading [A-Z.]{6} flag block + whitespace gate the name capture so the banner/header/blank lines are
    // skipped. Shared by video_clean's per-node capability probe (queryCapabilities) and audio_clean's aac_vbr availability check (hasEncoder) so the
    // row-parse regex cannot drift between them; the spawn itself stays at each call site (their surrounding capability objects differ).
    const parseFfmpegEncoders = (stdout) => {
        const set = new Set();
        for (const line of String(stdout || '').split('\n')) {
            const m = line.match(/^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/);   // "<6 flag chars> <name>  <desc>"
            if (m) set.add(m[1]);
        }
        return set;
    };
    // ===== END SHARED: ffmpeg encoder probe =====

    // ===== SHARED [audio_clean, clean_and_remux]: title canonicalization =====
    // Canonical audio-title machinery, shared so audio_clean's downmix titles come out already in clean_and_remux's tag_title form (no wasted remux).
    // Canonical form: "<channel/downmix base> - <role tags>", roles LAST ("5.1 -> 2.0 - Commentary"). canonicalAudioTitle is the entry point.
    // -=-=-= channel-label vocab: channelTitleLabels / bareChannelRegex / downmixChannelRegex  [audio_clean, clean_and_remux] =-=-=-
    // The channel labels we recognise/replace for tag_title - 2.0 included so it can be overwritten with Stereo. Every ffprobe standard or named
    // layout label clean_and_remux's layoutLabel can write is listed (the 7.0 / 6.0 / 4.1 / 8.0 and height layouts included), so a title it wrote
    // stays OWNED: its role suffix is normalised and a downmix base built on it is recognised. A label it counts from a verbose listing (5.0.4,
    // 2.0.2), or falls back to when a listing does not add up (16.0, 9.1), may not be listed, and then reads as a custom title on the next pass.
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
    // A matroska track's one name where a per-track TITLE SimpleTag (titleTagKey) sits beside its Name, else '' - the Name being what is left of
    // mediaInfo's Title (mediaInfoOwnTitleParts) when no tag form is it (tagForms), the one place it shows where the tag is in its place. An
    // output that keeps one title - any remux of a tag in the Name's place (titleTagInNamePlace), else a write into another container or a
    // sidecar - writes it as the Name, so that name keeps both values' roles (rolesNamed): the Name alone when the tag gives none the Name lacks,
    // since players and media servers show the Name; else the two joined as mediaInfo joins them, 'Name / TITLE', or else 'TITLE / Name',
    // whichever reads exactly their roles together - a keyword can form across the join ('Main Audio / Description Commentary' reads 'audio
    // description'); else the Name, the roles only the tag gives lost (titleTagFate). Measured: read as the tag, 'Director Commentary' beside
    // 'German' was written over with 'German'; read as the Name alone, 'English' beside 'Director Commentary' made the commentary the default
    // audio. A line break in the Name comes back from mediaInfo's Title as ' / ' (mediaInfoFill), and the name is written so - a stated residual.
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
        // The one bracket rule, matched by type with a stack: `pairs` holds each [opener, closer] that pair, `lone` every bracket nothing pairs - a closer
        // that does not match the opener on top or comes with none open, and an opener left open. The role-phrase grouping reads the pairs and a cut's edge
        // cleanup the lone ones, so the two always agree on what is paired.
        const bracketScan = (s) => {
            const pairs = []; const lone = new Set(); const open = [];
            for (let i = 0; i < s.length; i += 1) {
                const kind = '([{)]}'.indexOf(s[i]);
                if (kind >= 0 && kind < 3) open.push(i);
                else if (kind >= 3 && open.length && s[open[open.length - 1]] === '([{'[kind - 3]) pairs.push([open.pop(), i]);
                else if (kind >= 3) lone.add(i);
            }
            open.forEach((i) => lone.add(i));
            return { pairs, lone };
        };
        let cut = '';
        for (const ch of t) { if (!fits(cut + ch)) break; cut += ch; }
        const within = (spans) => spans.filter(([, b]) => b <= cut.length).length;
        const base = unitsOf(new Set());
        const plain = untrail(within(base) ? t.slice(0, base[within(base) - 1][1]) : cut);
        if (reads(plain)) return plain;
        // Each role's first phrase over `spans`, each unit kept after its `seps`, as NFC and as written: in `grouped` with the bracket group around it when the
        // whole group fits, in `bare` alone. Both forms, as a keyword stored decomposed reads only as NFC: where a precomposed copy came later, the first
        // phrase alone read one role fewer as written, every candidate failed and the plain cut lost a role ('... forc' + U+0301 + ' then ... Hard of Hearing
        // ... Forced' lost /sdh; measured).
        const rolePhraseUnits = (spans, seps) => {
            const grouped = new Set(); const bare = new Set();
            for (const [r, form] of [[1, (x) => x.normalize('NFC')], [0, (x) => x]]) {
                // Each unit in this form, lowercased, and where it starts in their join, which the role keywords and the bracket pairs are found in.
                const lower = spans.map(([a, b]) => form(t.slice(a, b)).toLowerCase());
                const at = []; let joined = '';
                lower.forEach((w, i) => { joined += seps[i]; at.push(joined.length); joined += w; });
                const { pairs } = bracketScan(joined);
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
            return { grouped, bare };
        };
        const EDGE_PUNCT = /[^\p{L}\p{N}()[\]{}]/u;
        // The role-keeping cut over `spans`, or '' when none reads as the name does within the bytes; `held` gets the words its role phrases lie in.
        const keepRoles = (spans, held) => {
            // The text each unit is kept after: a space after a word, its own separator after a part.
            const seps = spans.map(([a], i) => (i ? t.slice(spans[i - 1][1], a) : '')).map((g) => (/\s/.test(g) ? ' ' : g));
            const { grouped, bare } = rolePhraseUnits(spans, seps);
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
                const { lone } = bracketScan(name);
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
    // #endregion

    // Bail out gracefully on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // AC3 valid CBR presets in bps. ffmpeg rounds an AC3 request to the NEAREST of these (can round DOWN); resolveBitrate snaps UP to a preset itself so the
    // emitted rate is never below target and the log matches what ffmpeg produces. EAC3/AAC/Opus honour arbitrary rates (verified) and are NOT snapped.
    const ac3Presets = [32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000,
                        160000, 192000, 224000, 256000, 320000, 384000, 448000, 512000, 576000, 640000];
    // The closing rule for EVERY rate this plugin emits, so the two bitrate functions cannot end differently: ac3 snaps UP to a preset (coarse fixed table,
    // never land below target), everything else honours an arbitrary rate and is rounded to whole kbps. Both callers apply their own ceiling first.
    const finaliseBitrate = (codec, bps) => (codec === 'ac3'
        ? (ac3Presets.find(p => p >= bps) ?? ac3Presets[ac3Presets.length - 1])
        : Math.round(bps / 1000) * 1000);

    // Per-codec channel-count ceiling of ffmpeg's native encoders (ac3/eac3 cap at 6ch, aac/opus at 8ch). One source for the codec_force targetMaxCh limit, the
    // targetTable bitrate-ladder cap, and loudnorm's channel ceiling below, so those can't drift; aac_vbr folds to aac (anything that isn't ac3/eac3 is 8).
    const codecMaxCh = (codec) => (codec === 'ac3' || codec === 'eac3') ? 6 : 8;
    // Fold the aac_vbr pseudo-codec onto the real aac family for scoring/limit/target lookups (aac_vbr is an encoder choice, not a distinct codec). One local
    // source for every non-shared fold site below; the two inside the shared audio-scoring section keep the idiom inline (byte-identical, so no drift).
    const aacFamily = (codec) => codec === 'aac_vbr' ? 'aac' : codec;
    // Codec family of a STREAM for identity checks ("is this track already the target codec?"): the shared alias fold (foldCodecAlias) and nothing else, so
    // aac_latm (AAC in MPEG-TS/LATM, routine in DVR/.ts captures) matches an 'aac' target instead of taking a pointless lossy aac->aac re-encode. Deliberately
    // NOT resolveCodecName: its refinement resolves eac3 to eac3atmos and dts to dtsma/dtshr, names no codec_* target ever uses, causing re-encodes of its own.
    const codecFamilyOf = (stream) => foldCodecAlias(codecNameOf(stream));
    // The "N kb/s" rate token every operation log renders a bitrate with. Single source of truth for units and rounding: a user reads several of these lines
    // side by side in one run's infoLog (a dedup removal beside a transcode beside a loudnorm pass), so the same track's rate must not render differently
    // on different lines. Callers add their own surrounding text, the " @ " separator - but NOT the no-bitrate-known fallback, which is srcRateToken below.
    const kbpsToken = (bps) => `${Math.round(Number(bps) / 1000)} kb/s`;
    // Transcode target bitrate (bps) for a codec + channel count, from the shared CODEC_TARGET_BPS table (aac_vbr shares aac's targets; ac3/eac3 cap at 6ch).
    // For these encodable codecs the ladder IS the scoring transparent point (scoreThresholds reads the same table), and the FLOOR resolveBitrate starts from -
    // a higher-bitrate lossy source raises the target above it; the guarded same-channel paths (codec_force, loudnorm) can cap BELOW it (see resolveBitrate).
    // AC3/EAC3 CBR fixed-preset: mono 192k, stereo 224k, 3ch 320k, 4ch 384k, 5ch 448k, 6ch 640k (640k is the Blu-ray 5.1 standard and the AC3/EAC3 ceiling).
    const targetTable = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        const family = aacFamily(codec);
        const tbl = CODEC_TARGET_BPS[family];
        if (!tbl) return 0;
        const cap = codecMaxCh(family);
        return tbl[Math.min(ch, cap)] ?? tbl[cap];
    };

    // The source rate for an operation log, including what to print when no probe reported one. Falls back to the ladder value as an ESTIMATE (marked
    // '~'), which is the common case for a track audio_clean itself produced - the muxer omits per-stream bitrate on a fresh transcode - and only says
    // 'unknown bitrate' for a codec the ladder does not cover. One helper because these lines are read side by side: the same unmeasured track must not
    // read '~640 kb/s' on a force line and 'unknown bitrate' on a loudnorm line. (The dedup lines are deliberately different: they drop the ' @ N kb/s'
    // clause entirely rather than render a fallback, see hasKnownRate.)
    const srcRateToken = (s) => {
        const b = Number(s.bit_rate || 0);
        if (b > 0) return kbpsToken(b);
        // codecFamilyOf, not the raw codec_name: the ladder is keyed by family, so a container spelling (aac_latm in a broadcast .ts) would miss it and
        // print 'unknown bitrate' for a track whose family the ladder covers perfectly well. The displayed CODEC name stays raw at the call sites.
        const tb = targetTable(codecFamilyOf(s), resolveChannels(s));
        return tb > 0 ? `~${kbpsToken(tb)}` : 'unknown bitrate';
    };

    // Per-codec ceiling (bps) so a lossless or very-high-bitrate source (e.g. TrueHD ~4 Mbps) can't drag the transcode target absurdly high. AC3/EAC3 cap
    // at their hard 640k limit; AAC/Opus cap generously per channel - well above transparent for any real content, but bounded.
    const codecCeiling = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        // These only ever apply to tracks at or below each codec's channel maximum (the force/downmix paths block higher counts before encoding), but the
        // per-channel form stays correct regardless of channel count. Opus's ceiling (128k/ch) is deliberately half of ffmpeg's hard libopus limit (256k/ch)
        // so a resolved Opus target can never be rejected by the encoder. AAC 160k/ch is generous but bounded. Limits verified on Linux/Windows/Mac
        // jellyfin-ffmpeg 7.1.4: ac3 clamps at exactly 640k; eac3 clamps at 6144k (640k is our efficient near-transparent 5.1 target); native aac clamps
        // ~185-208k/ch; libopus hard-ERRORS above 256k/ch (so 128k/ch is safe).
        if (codec === 'ac3' || codec === 'eac3') return 640000;
        if (aacFamily(codec) === 'aac') return ch * 160000;   // 160k/ch (stereo 320k, 5.1 960k, 7.1 1.28M)
        if (codec === 'opus') return ch * 128000;   // 128k/ch (stereo 256k, 5.1 768k)
        return 0;
    };

    // Resolve the final target bitrate (bps) for a transcode. Baseline is the per-channel table target (the FLOOR). A known lossy source pulls the target
    // DOWN toward its own bitrate when the target codec is at least as good as the source AT the source's bitrate (guard: audioQuality(target) >= srcQuality):
    // we cap at the source rate rather than inflate to the floor, because the codec-efficiency gain preserves quality at equal bitrate and extra bits above
    // source only re-encode detail a lossy source already discarded. The guard defaults OFF (srcQuality = Infinity) so only the same-channel codec_force and
    // loudnorm opt in; downmix callers pass no srcBps and stay on the floor, and lossless sources skip it (their bitrate isn't a comparable perceptual quantity
    // - a 4 Mbps TrueHD into eac3 should target the floor, not its own rate). A pathological sub-minimum source is floored at the codec's channel-scaled
    // minimum. When the guard fails (target less efficient), a higher-than-floor lossy source still raises the target. Result is clamped to the codec ceiling,
    // then for AC3 ONLY snapped UP to a valid preset (see ac3Presets); eac3/aac/opus honour arbitrary rates and are emitted as-is.
    const resolveBitrate = (codec, channels, srcBps = 0, srcLossless = false, srcQuality = Infinity) => {
        const floor = targetTable(codec, channels);
        if (floor <= 0) return 0;
        const src = Number(srcBps) || 0;
        let bps = floor;
        if (src > 0 && !srcLossless) {
            const family = aacFamily(codec);
            const targetQuality = audioQuality({ codec_name: family, channels, bit_rate: src });
            if (targetQuality >= srcQuality) {
                // Guard passed: target codec scores >= the source at the source bitrate. Track the source exactly (no pad), floored at the perceptual minimum.
                const chScale = Math.pow(Math.max(2, Number(channels) || 1) / 2, CHANNEL_SCALE_EXPONENT);
                const targetMin = (codecInfo[family]?.minimum || 0) * chScale;
                bps = Math.max(src, targetMin);
                // This can emit BELOW the table floor. Safe: audioQuality's bitrate-less branch assumes an encodable track is at its transparent target, and a
                // re-scan reads the real rate back - eac3/ac3 are CBR and always report bit_rate; aac/opus recover via resolveStreamBitrate (mediaInfo
                // StreamSize/Duration). That branch only fires on a stream with NO recoverable bitrate (synthetic), never a real re-scanned transcode.
            } else if (src > floor) {
                bps = src;   // guard failed (target less efficient than source): keep the source floor so a high-bitrate lossy source isn't needlessly degraded
            }
        }
        return finaliseBitrate(codec, Math.min(bps, codecCeiling(codec, channels)));
    };

    // The highest rate a re-encode may actually ASK each encoder for. Distinct from codecCeiling, which bounds a CONVERGENCE target (a foreign source landing
    // on one of our codecs) well below what the encoder would accept; this is the encoder's own limit, and applies where the rate we want is simply the
    // source's. Verified on jellyfin-ffmpeg 7.1.4 (Linux/Windows/Mac): ac3 clamps at exactly 640k, eac3 at 6144k, native aac silently clamps around
    // 185-208k/ch - but libopus HARD-ERRORS above 256k/ch, so for opus this is a real limit that aborts the job rather than a courtesy clamp.
    const encoderLimit = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        if (codec === 'ac3') return 640000;
        if (codec === 'eac3') return 6144000;
        if (codec === 'opus') return ch * 256000;   // libopus errors above this - never exceed it
        return ch * 208000;                         // aac: the top of native aac's own clamp range (exceeding it is graceful, but pointless)
    };

    // How far above the transparent point a matched source rate may sit before we stop believing it. A source ALREADY carrying more than this in the codec we
    // are re-encoding it to is either an unusual mastering choice or - far more likely - a misread: resolveStreamBitrate falls back to StreamSize/Duration,
    // which reports the whole container's bytes when mediaInfo gives no per-track size. Clamping there costs nothing real, since twice transparent is already
    // well past the point extra bits buy audible quality; leaving it unclamped would size a file off a bogus number. It should almost never fire.
    const SAME_FORMAT_TRANSPARENT_MULTIPLE = 2;
    // The two bounds a matched source rate answers to, and NEITHER subsumes the other: the sanity multiple above binds for aac 5.1+, opus and eac3, while the
    // encoder's own limit binds for mono/stereo aac (208k/ch) and ac3 (640k). targetTable is the transparent point here - for the four encodable codecs it and
    // scoreThresholds read the same CODEC_TARGET_BPS ladder, so the encode target and the scored transparent point cannot drift apart.
    const sameFormatCeiling = (codec, channels) =>
        Math.min(encoderLimit(codec, channels), SAME_FORMAT_TRANSPARENT_MULTIPLE * targetTable(codec, channels));

    // Target bitrate for a re-encode whose OUTPUT FORMAT EQUALS ITS INPUT FORMAT - same codec family, same channel count. That happens whenever a track is
    // re-encoded for a reason OTHER than changing its codec (loudnorm's gain correction, or codec_force aimed at the codec the track already uses). Nothing
    // about the format is changing, so deriving a fresh ladder target can only build in a loss (below source) or waste (above it): match the source instead.
    // Bounded by sameFormatCeiling, then snapped up to a valid ac3 preset - a no-op for an ac3 source, whose rate is already one of them. Returns 0 when no
    // probe reported a source rate, which tells the caller to use resolveBitrate's ladder target.
    const sameFormatBitrate = (codec, channels, srcBps = 0) => {
        const src = Number(srcBps) || 0;
        if (src <= 0) return 0;
        return finaliseBitrate(codec, Math.min(src, sameFormatCeiling(codec, channels)));
    };

    // Per-codec audio argument string for an ALREADY-RESOLVED rate, scoped to a specific output stream index (e.g. -b:a:2 instead of -b:a). ffmpeg accepts the
    // stream-qualified forms; we use them so each track gets its own settings when a single command touches several.
    const OPUS_COMPRESSION_LEVEL = 10;
    const encoderArgsBps = (codec, idx, bps) => {
        if (bps <= 0) return '';
        // libopus is VBR-capable and its complexity knob tops out at 10 - best quality per bit, and pinned rather than left to the build default,
        // which is not the same on every jellyfin-ffmpeg platform. Both are encode-time cost only; neither changes the container or the bitrate.
        if (codec === 'opus')
            return ` -vbr:a:${idx} on -compression_level:a:${idx} ${OPUS_COMPRESSION_LEVEL} -b:a:${idx} ${bps / 1000}k`;
        return ` -b:a:${idx} ${bps / 1000}k`;
    };
    // ffmpeg's -c:a encoder TOKEN for a resolved audio codec name. Only opus differs from its own name: the encoder is libopus — ffmpeg's native `opus`
    // encoder is flagged experimental and aborts the whole job with "encoder 'opus' is experimental" unless `-strict -2` is added, so a bare `-c:a opus`
    // never works on jellyfin-ffmpeg. aac/ac3/eac3 names equal their encoder names; aac_vbr resolves its own encoder (libfdk_aac/aac_at/native aac) in
    // aacVbrArgsIdx and never reaches here. Apply this at every `-c:a:N <token>` emit site (the log lines keep the friendly codec name).
    const audioEncoder = (codec) => (codec === 'opus' ? 'libopus' : codec);

    // aac_vbr's preferred encoder is libfdk_aac (Linux/Windows jellyfin builds) but that is absent on the Mac build (--disable-libfdk-aac) and some custom
    // builds. Because plugin inputs are library-wide, a mixed fleet can't pin codec_stereo per node, so we resolve THIS node's AAC encoders at runtime (mirrors
    // video_clean's encoder probing): read an injected encoder list if the harness supplies one, else parse `ffmpeg -encoders` once into a Set. Memoized - the
    // probe runs at most once per file and only when aacVbrArgsIdx is actually reached (no aac_vbr emission → no probe). A failed/undeterminable probe yields
    // an empty set, so we degrade to native aac (which every build has) rather than emit an encoder that would hard-fail the file. Kill-switch for a wedged
    // `ffmpeg -encoders` probe: the query is near-instant, so this only fires if the spawned process hangs (never in normal use).
    const ENCODERS_PROBE_TIMEOUT_MS = 20000;
    let encoderSet;
    let aacVbrFallbackWarned = false;
    const { spawnSync } = require('child_process');   // the one spawn binding every probe below shares
    const hasEncoder = (name) => {
        if (encoderSet === undefined) {
            const cap = otherArguments && otherArguments.__awkCap;
            if (cap && Array.isArray(cap.encoders)) {
                encoderSet = new Set(cap.encoders);
            } else {
                encoderSet = new Set();
                try {
                    const r = spawnSync(ffmpegPathOf(otherArguments), ['-hide_banner', '-encoders'],
                        { encoding: 'utf8', timeout: ENCODERS_PROBE_TIMEOUT_MS, killSignal: 'SIGKILL' });
                    encoderSet = parseFfmpegEncoders(r && r.stdout);
                } catch (e) { /* leave empty → native aac fallback, which every build has */ }
            }
        }
        return encoderSet.has(name);
    };

    // Encoder + rate args + log label for an aac_vbr stereo track, picking the best VBR AAC encoder THIS node has. The low-info test (an already-lean
    // ≤144k stereo source being codec-swapped) selects the leaner tier on each encoder:
    //   • libfdk_aac (Lin/Win)  -> -vbr 4/5                       the efficient default (~128-224 kb/s)
    //   • aac_at    (Mac only)  -> -aac_at_mode vbr -q:a 1/0      Apple AudioToolbox, the platform's best VBR AAC when libfdk is absent
    //   • native aac (any)      -> -b:a 256k CBR                  last-resort floor (-vbr is libfdk-private, so native aac can't VBR)
    // aac_at's top tier runs a little heavier than libfdk -vbr 5 but leaner + faster than native 256k. Warns once per file when not using libfdk.
    // AAC_VBR_LOWINFO_BPS is the single source for the low-info boundary and its predicted rate, shared by aacVbrArgsIdx (picks the level) and guardBlocks
    // (scores the delivered quality) so the two can't drift: at/below it a stereo source emits -vbr 4 (~128k), above it -vbr 5 (~192k). That is the libfdk
    // tier: the aac_at and native fallbacks emit their own rates (aac_at ~150k/~190k, native the CBR ladder), which guardBlocks does not track.
    const AAC_VBR_LOWINFO_BPS = 144000;
    const aacVbrPredictedBps = (srcBps) => (Number(srcBps) > 0 && Number(srcBps) <= AAC_VBR_LOWINFO_BPS) ? 128000 : 192000;
    const aacVbrArgsIdx = (idx, srcBps = 0, isStereoSrc = false, channels = 2) => {
        const lowInfo = isStereoSrc && Number(srcBps) > 0 && Number(srcBps) <= AAC_VBR_LOWINFO_BPS;
        if (hasEncoder('libfdk_aac')) {
            const vbrLevel = lowInfo ? 4 : 5;
            const approxRate = `~${aacVbrPredictedBps(lowInfo ? AAC_VBR_LOWINFO_BPS : Infinity) / 1000}k`;   // one source with guardBlocks' prediction
            return { encoder: 'libfdk_aac', args: ` -vbr:a:${idx} ${vbrLevel}`, approxRate, label: `libfdk VBR q${vbrLevel}` };
        }
        // Both fallbacks warn at most once per file: the encoder is a node fact, so a per-track line would repeat it for every stereo track on the run.
        const warnFallbackOnce = (msg) => {
            if (aacVbrFallbackWarned) return;
            aacVbrFallbackWarned = true;
            response.infoLog += `☒[codec_stereo=aac_vbr] ${msg}\n`;
        };
        if (hasEncoder('aac_at')) {
            warnFallbackOnce('no libfdk_aac on this node - using aac_at (AudioToolbox) VBR instead');
            const q = lowInfo ? 1 : 0;
            return {
                encoder: 'aac_at', args: ` -aac_at_mode:a:${idx} vbr -q:a:${idx} ${q}`, approxRate: lowInfo ? '~150k' : '~190k', label: `aac_at VBR q${q}`,
            };
        }
        const bps = resolveBitrate('aac', channels);
        warnFallbackOnce(`no libfdk_aac or aac_at on this node - using native aac ${bps / 1000}k instead`);
        return { encoder: 'aac', args: encoderArgsBps('aac', idx, bps), approxRate: `${bps / 1000}k`, label: 'native aac' };
    };


    // #region SHARED helpers (3 sections: special language code … language token failure)
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

    // Parse inputs, in the SAME order as the Inputs array in details() - so a new input lands at the matching offset in both places and the two cannot drift.
    // Every input is type:'string' (there are no type:'boolean' ones, which would be coerced and could not be out-of-set). The 16 dropdowns are validated
    // against their option sets by the table below; the two free-text language lists have no option set, so their tokens go through the language RECOGNISER
    // instead, right after the table. Every check fails the file on a bad value.
    const langStereo = splitList(inputs.language_stereo);
    const langStereoKeys = langStereo.map(langMatchKey);    // normalised comparison keys (folds en/eng/english/en-US, 639-2/B vs /T, nb/nn -> no)
    const langSurround = splitList(inputs.language_surround);
    const langSurroundKeys = langSurround.map(langMatchKey);
    const langUnlisted = ddValue(inputs.language_unlisted, 'surround');
    const codecForce = ddValue(inputs.codec_force, 'disabled');
    const codecStereo = ddValue(inputs.codec_stereo, 'aac');
    const codecSurround = ddValue(inputs.codec_surround, 'aac');
    const downmixSecondary = ddValue(inputs.downmix_secondary, 'surround');
    const downmixToSix = ddValue(inputs.downmix_to_six, 'disabled');
    const downmixToStereo = ddValue(inputs.downmix_to_stereo, 'disabled');
    const methodDedupRegion = ddValue(inputs.method_dedup_region, 'fold');
    const methodDeduplicate = ddValue(inputs.method_deduplicate, 'disabled');
    const methodLayoutErr = ddValue(inputs.method_layout_err, 'keep');
    const methodLoudnorm = ddValue(inputs.method_loudnorm, 'disabled');
    const methodStereoDownmix = ddValue(inputs.method_stereo_downmix, 'default');
    const guardLossless = ddValue(inputs.guard_lossless, 'enabled');
    const guardObjectAudio = ddValue(inputs.guard_object_audio, 'enabled');
    const guardOriginal = ddValue(inputs.guard_original, 'disabled');
    const guardQuality = ddValue(inputs.guard_quality, 'enabled');

    // [inputName, parsedValue, validOptions] - checked top-down, failing on the first bad value, and the message always echoes the value that was tested.
    const dropdownChecks = [
        ['language_unlisted',     langUnlisted,         ['surround', 'stereo', 'delete']],
        ['codec_force',           codecForce,           ['disabled', '2below', '6below', 'all']],
        ['codec_stereo',          codecStereo,          ['aac', 'aac_vbr', 'ac3', 'eac3', 'opus']],
        ['codec_surround',        codecSurround,        ['aac', 'ac3', 'eac3', 'opus']],
        ['downmix_secondary',     downmixSecondary,     ['surround', 'stereo', 'delete']],
        ['downmix_to_six',        downmixToSix,         ['disabled', 'replace', 'add']],
        ['downmix_to_stereo',     downmixToStereo,      ['disabled', 'replace', 'add']],
        ['method_dedup_region',   methodDedupRegion,    ['fold', 'distinct']],
        ['method_deduplicate',    methodDeduplicate,    ['disabled', 'multi-stereo', 'multi-stereo-error', 'channel', 'channel-error']],
        ['method_layout_err',     methodLayoutErr,      ['keep', 'drop', 'remix']],
        ['method_loudnorm',       methodLoudnorm,       ['disabled', 'tv', 'cinema', 'quiet_room']],
        ['method_stereo_downmix', methodStereoDownmix,  ['default', 'dialogue']],
        ['guard_lossless',        guardLossless,        ['enabled', 'disabled']],
        ['guard_object_audio',    guardObjectAudio,     ['enabled', 'disabled']],
        ['guard_original',        guardOriginal,        ['disabled', 'enabled']],
        ['guard_quality',         guardQuality,         ['enabled', 'strict', 'disabled']],
    ];
    checkDropdowns(dropdownChecks);

    // Both free-text language lists are checked against knownLangToken because dormancy is NOT a typo net - it only fires when NOTHING matches EITHER list, so
    // a typo in one list while the other still matches leaves that language "unlisted", where language_unlisted=stereo downmixes it and
    // language_unlisted=delete removes it. A rejected token fails the file. clean_and_remux runs the same check on its own lists, through its langName wrapper
    // rather than this predicate.
    checkLangLists([['language_stereo', langStereo], ['language_surround', langSurround]]);

    // The container this plugin writes, derived the same way in every other plugin that needs it. This plugin never changes the container, so it is always
    // the source's - but every membership test must see it normalised: a Tdarr container string of 'MKV' misses a bare includes() and silently takes the
    // marker-hostile branch. The response.container default above deliberately keeps the RAW value: that string becomes the output file's extension, and
    // lowercasing it there would rename the file rather than answer a question about it.
    const dstContainer = String(file.container || '').toLowerCase().trim();
    // Does codec_force's scope cover a track of this shape? ('6below' takes every stereo track plus any surround track up to 6ch; 'all' drops that 6ch bound.)
    // ONE predicate for every place that consults the setting, because they ask DIFFERENT questions of it: the FORCE CODEC block asks "is a re-encode worth
    // spending on this track?", while loudnorm's leftovers loop - which only runs once a re-encode is already happening for the gain correction - asks "since
    // we are encoding anyway, whose codec applies?". A second hand-copied scope test is exactly how those two would drift apart.
    const forceReaches = (isStereo, channels) => codecForce === 'all'
        || (codecForce === '6below' && (isStereo || channels <= 6))
        || (codecForce === '2below' && isStereo);
    // ====== CONTAINER AUDIO WALLS ======
    // Every new or re-encoded track is written back into the source's own container, and some muxers refuse a codec outright - at header write, so the whole
    // run fails on every requeue with nothing but ffmpeg's message. Measured on jellyfin 7.1.4 by encoding each target into each container (every accepted
    // cell reads back as the right codec). mkv, mp4 and mka take all four, and .m4v/.m4a are written through the mp4 muxer (outputMuxerArg), so in the
    // designed stack - clean_and_remux first - none of these is ever met; only a standalone run, or one ordered before it, reaches them. A refused codec is
    // out of reach wherever a track's target is chosen: the downmix, codec_force or remix that would need it stands down for that track with its own line,
    // and loudnorm falls back to the track's own codec. Two fail otherwise, measured beside the video each natively holds: .mxf holds PCM alone (ffmpeg
    // inserts pcm_rechunk, which refuses every other codec, exit 234), and .wtv refuses opus (exit 255) and writes aac that decodes with errors - from the
    // native encoder, from aac_at and from a copy alike. awk-ffmpeg-test's muxmatrix re-measures every cell (AUDIO_WRITEBACK_REFUSES mirrors this).
    const AUDIO_CONTAINER_REFUSES = {
        webm: ['aac', 'ac3', 'eac3'], ogg: ['aac', 'ac3', 'eac3'], ogv: ['aac', 'ac3', 'eac3'],
        mpg: ['aac', 'eac3', 'opus'], mpeg: ['aac', 'eac3', 'opus'], vob: ['aac', 'eac3', 'opus'],
        flv: ['ac3', 'eac3', 'opus'], '3gp': ['ac3', 'eac3', 'opus'], '3g2': ['ac3', 'eac3', 'opus'],
        mov: ['opus'], avi: ['opus'], divx: ['opus'], wmv: ['opus'], asf: ['opus'],
        wtv: ['aac', 'opus'], mxf: ['aac', 'ac3', 'eac3', 'opus'],
    };
    const containerRefusesAudio = (codec) => Object.prototype.hasOwnProperty.call(AUDIO_CONTAINER_REFUSES, dstContainer)
        && AUDIO_CONTAINER_REFUSES[dstContainer].includes(aacFamily(codec));
    // The words every wall line shares: what this container refuses, and the ways out - a codec it holds, where one is left (.mxf holds none of them).
    const wallText = (codec) => `a .${dstContainer} file cannot hold ${aacFamily(codec)} audio`;
    const wallRemedy = (setting) => {
        const held = ['aac', 'ac3', 'eac3', 'opus'].filter((c) => !containerRefusesAudio(c));
        return `${held.length ? `set ${setting} to ${held.join(' or ')}, or ` : ''}remux it to mkv or mp4 first (clean_and_remux does that)`;
    };
    let walledOps = 0;   // tracks a wall stood an operation down for, so a run left with nothing to write says why rather than claiming all was well
    // ====== END CONTAINER AUDIO WALLS ======

    let extraArguments = '';
    let workDone = '';       // "this changed" lines (transcode/add/remix/normalize/remove).
    let skipDone = '';       // "this DIDN'T change, and why" lines (guard blocks, ceiling/missing-data skips). Both buffers are always logged.
    let convert = false;
    // The buffers exist so the log reads in two blocks rather than interleaved per stream, but failFile/failUnexpected build the quarantine message from
    // response.infoLog ALONE - so a terminal that THROWS has to flush them itself, or the error-queue entry loses the whole record of what the run had
    // decided, on the one path where the user has least else to go on. Every throwing terminal goes through failWithBuffers or the catch at the end. The
    // header is conditional because a pre-check that aborts before any stream work has nothing to introduce.
    const flushBuffers = () => {
        if (workDone || skipDone) response.infoLog += '☒Run stopped here - the decisions it had made up to this point follow\n';
        response.infoLog += workDone + skipDone; workDone = ''; skipDone = '';
    };
    const failWithBuffers = (msg) => { flushBuffers(); failFile(msg); };

    // The one condition three separate features have to give up on - resolveChannels found nothing usable in ffprobe, mediaInfo OR the channel layout. One
    // builder so the diagnosis reads the same whichever setting hit it first; only the [input=value] tag and the consequence clause differ per caller.
    const noChannelCountSkip = (index, tag, tail) =>
        `☒${streamTag(index)}[${tag}] Skipping - no channel count in ffprobe, mediaInfo, or channel layout; ${tail}\n`;
    const NO_CHANNEL_COUNT_CODEC = "can't safely choose a target codec or verify its channel limit";

    // Which audio-medium containers this plugin will work in. mka is Matroska and m4a is mp4-family - the two muxers it already writes on every video file, so
    // neither needs a muxability model of its own - and both hold several audio streams of an arbitrary codec, which downmix add and method_deduplicate need.
    // Every other audio container is effectively single-stream (mp3/flac/wav/ogg), where a downmix add or a force-codec has nowhere to land.
    const AUDIO_MEDIUM_CONTAINERS = ['mka', 'm4a'];

    // Ordered before the no-audio check so a file this plugin will not touch reports WHY in the most specific terms available - "not a video" or the container
    // it cannot work in, never "no audio streams", which would read as a property of the file rather than of this plugin's reach. 'other' (subtitle-only,
    // stills, and anything ffprobe failed to read) and the unscanned '' both take the not-a-video skip: neither promises an audio stream worth managing.
    if (file.fileMedium !== 'video' && !(file.fileMedium === 'audio' && AUDIO_MEDIUM_CONTAINERS.includes(dstContainer))) {
        if (file.fileMedium === 'audio')
            return skip(`☑[${dstContainer || 'none'}] Audio-only file in a container this plugin cannot work in - only `
                + `${AUDIO_MEDIUM_CONTAINERS.join('/')} hold several audio streams of any codec\n`);
        return skip('☑File is not a video\n');
    }
    // An audio-medium .mka with cover art is left alone, as stream_ordering leaves it (mkaCarriesCoverArt says why).
    if (file.fileMedium === 'audio' && mkaCarriesCoverArt(dstContainer, file.ffProbeData.streams)) {
        return skip(mkaCoverArtSkipLine);
    }

    if (outputMuxerArg(dstContainer) === null) return skip(noMuxerSkipLine(dstContainer));   // an extension no muxer writes back (outputMuxerArg)
    const copyRefused = copyRefusedSkipLine(dstContainer, file.ffProbeData?.streams);
    if (copyRefused) return skip(copyRefused);   // a video codec the container refuses even on a copy (CONTAINER_REFUSES_COPY)

    // Only a VIDEO file can reach this: fileMedium 'audio' is assigned on the presence of an audio stream, so an audio-medium file always has one.
    let audioStreams = file.ffProbeData.streams.filter(stream => codecTypeOf(stream) === 'audio');
    if (audioStreams.length === 0) return skip('☑Video file has no audio streams to manage\n');

    // One guard around all the per-file work (the input summary, dedup, index mapping, the transcode loop, and the output-summary / preset build): a
    // deliberate failFile abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the file too — annotated and carrying the full infoLog —
    // not a silent skip. The summary walk is inside it because it reads both probes for every stream, so it is real work that can throw.
    // (Earlier input validation and the not-a-video / no-audio pre-flight checks run before this and fail-or-skip on their own.)
    try {
        // Input summary — the streams exactly as they arrived, before any audio work.
        response.infoLog += `☐Input streams: ${summariseAll(file.ffProbeData.streams)}\n`;
        response.infoLog += trackNamesUnreadLine(file.ffProbeData.streams);

        // audio_clean-local IDENTITY key: like langKey but KEEPS the region/script subtag, so pt-BR and pt-PT are DISTINCT identities
        // (both survive dedup, each gets its own downmix) while eng/en/English/en-US still fold their BASE (eng==en, but en !=
        // en-US). Used ONLY for dedup grouping and the one-downmix-per-language sets; list matching stays on langMatchKey. Non-language/untagged/malformed
        // tokens fall back to langKey, so 'und' stays 'und' and the dedup exemption holds.
        const langIdentityKey = (x) => {
            let s = String(x || '').trim().toLowerCase().replace(/[_.]/g, '-');
            if (!s) return '';
            if (s.length >= 4) { const code = langNameIndex(s); if (code) s = code; }   // a spelled-out English name -> its code (no region on one)
            try { return String(Intl.getCanonicalLocales(s)[0] || s).toLowerCase(); } catch (e) { return langKey(x); }
        };

        // Resolve whether a source stream is lossless using the shared resolveCodecName resolution (same one audioQuality uses). Stored per-stream as
        // awkLossless to avoid repeating the resolution at emission. Read by guard_lossless (its guardBlocks skip + the "never drop the last lossless
        // copy" dedup rule), by the dedup sort's trustedRate ranking, and as the source-lossless flag that suppresses resolveBitrate's source-bitrate
        // floor on the codec_force / loudnorm encode paths - a lossless bitrate (4 Mbps TrueHD) is no comparable quantity for a perceptual encode and
        // would pin the output at the codec ceiling for no audible gain (downmix paths pass no source bitrate, so are unaffected).
        const isLosslessSource = (stream) => codecInfo[resolveCodecName(stream)]?.lossless === true;
        // Resolve whether a source stream carries object-audio metadata (Atmos / DTS:X / MPEG-H / AC-4) that ffmpeg cannot reconstruct on re-encode - keyed
        // off the codecInfo objectAudio flag via the same resolveCodecName resolution. Stored per-stream as awkObjectAudio. Read by guard_object_audio (an
        // independent third guard) and used as a dedup tie-breaker so an object-audio track is preferred over an otherwise-equal plain one.
        const isObjectAudioSource = (stream) => codecInfo[resolveCodecName(stream)]?.objectAudio === true;

        // Dormancy - see the language_surround tooltip for the full rationale. This boolean is the gate: true only when a genuine (non-secondary) track sits
        // in a language the user asked for (language_surround or language_stereo). Secondary tracks never count toward presence - they follow
        // downmix_secondary, not the lists.
        const hasWantedLang = (langSurroundKeys.length > 0 || langStereoKeys.length > 0)
            && audioStreams.some(s => !isSecondaryTrack(s) && (langListMatch(resolveLang(s) || 'und', langSurroundKeys)
                || langListMatch(resolveLang(s) || 'und', langStereoKeys)));

        //Annotate each track with its secondary-role flag, language/dedup keys, tier, quality score, and the lossless/object-audio/matrix-surround flags
        audioStreams = audioStreams.map(stream => {
            const fullLang = resolveLang(stream) || 'und';
            const cleanLang = langKey(fullLang);              // folded key (en/eng/english/en-US/pt-BR collapse): the track's language for dedup and logs
            const matchLang = langMatchKey(fullLang);         // the LIST key (also folds nb/nn into no): tier and priority
            // Dedup / one-downmix-per-language grouping key. method_dedup_region=distinct keeps the region/script subtag (pt-BR !=
            // pt-PT, en-US != en); the default 'fold' reuses the folded langKey so every regional variant collapses to one language.
            const regionKey = methodDedupRegion === 'distinct' ? langIdentityKey(fullLang) : cleanLang;
            // Enrich with mediaInfo bitrate before audioQuality scoring so that formats like DTS-HD MA (which ffprobe can't read a bitrate for in MP4/M4V
            // containers) score and display correctly.
            const enrichedItem = enrichStream(stream);
            // Secondary (the shared isSecondaryTrack) is a ROLE: such a track follows downmix_secondary whatever
            // its language, and a distinct M&E or karaoke mix is never deduped away as a duplicate of the main mix.
            const secondary = isSecondaryTrack(stream);
            // The track's TIER - what happens to it: 'surround' (kept at full quality, the only tier eligible for the downmix_to_* paths and the guards),
            // 'stereo' (kept, transcoded in place to stereo) or 'delete' (removed, subject to the delete safety below). Role wins the axis: a secondary track
            // follows downmix_secondary whatever its language. A genuine track follows its language bucket - language_surround, language_stereo, or
            // language_unlisted for a language in neither list. Dormancy pins every genuine track to surround. guard_original keeps an 'original'-flagged
            // track at surround in an unlisted language, which also vetoes deleting it (see guard_original); it clears only the LANGUAGE decision, never the
            // role one, so an 'original' commentary still follows downmix_secondary.
            let tier;
            if (secondary) tier = downmixSecondary;
            else if (langSurroundKeys.includes(matchLang)) tier = 'surround';    // a language in BOTH lists is surround - this list wins the overlap
            else if (langStereoKeys.includes(matchLang)) tier = 'stereo';
            else if (!hasWantedLang) tier = 'surround';                          // dormant - nothing the user asked for is present, so keep everything
            else if (guardOriginal === 'enabled' && hasDisposition(stream, 'original')) tier = 'surround';
            else tier = langUnlisted;
            return { ...enrichedItem,
                awkSecondaryTrack: secondary,
                awkTier: tier,
                // The folded match and dedup keys. An unrecognised tag passes through langKey (and langIdentityKey) unchanged, so every echo of a key goes
                // through logSafe, and the key itself is never clamped: it is the identity that matching and dedup compare.
                awkLangKey: cleanLang,
                awkMatchKey: matchLang,
                awkRegionKey: regionKey,
                // Channel count as a testable NUMBER, 0 = no probe measured one. Read by the per-stream guards that must tell UNMEASURABLE from small -
                // dedup, codec_force, loudnorm - which is what the 0 sentinel is for. The ambient `.channels` comparisons elsewhere (existing*Langs,
                // noCodecWorkNeeded, the dedup guard block) read the enriched field instead, which stays undefined on an unmeasurable stream and so fails
                // closed: do NOT swap them to awkChannels, whose 0 compares true against `<= 2` and would silently drop the no-channel-count diagnostic.
                // The two SORT comparators (workStreams, dedup byQuality) are the opposite case and read awkChannels: an undefined there yields NaN, which
                // Array.sort treats as a tie, so 8ch = unmeasured = 6ch but 8ch > 6ch - an inconsistent order that could put the 5.1 ahead of the 7.1 as a
                // downmix source. The 0 sentinel sorts an unmeasured track last, a total order.
                awkChannels: resolveChannels(enrichedItem),
                awkQuality: audioQuality(enrichedItem),
                awkLossless: isLosslessSource(stream),
                awkObjectAudio: isObjectAudioSource(stream),
                // Not object audio (ffmpeg re-encodes the AC-3 fine), so unlike awkObjectAudio it backs no guard: only the dedup tie-break reads it, to keep
                // the EX copy over a plain 5.1 twin.
                awkMatrixSurround: isDdEx(stream)
            };
        });

        // guard_lossless/guard_quality/guard_object_audio block a destructive operation only when it would irreversibly lose detail the destination can't
        // hold (a fully independent set, not a fallback chain - see the tooltips). Protection is earned PER OPERATION: each decision site calls guardBlocks
        // with its own real target codec/channels - a layout remix with the 2ch stereo it emits, not the opus it can't. Only a genuine tier-'surround' track
        // is protectable (never a secondary, nor one already sent to stereo/delete); a dormant language setting leaves a foreign-only track at 'surround', so
        // it stays protectable. guard_quality decides the channel-drop rule and the margin math: 'strict' protects on ANY predicted score drop, 'enabled'
        // (default) only when the drop EXCEEDS QUALITY_MARGIN. Comparable swaps pass (640k eac3 -> 640k ac3 = 5pt; 1509k DTS 5.1 -> 640k ac3 = 7pt);
        // flattening a premium master is kept (Atmos -> ac3 = 8pt, DTS-HD -> ac3 = 10pt). QUALITY_MARGIN = 7 is the DTS(91)-vs-ac3(84) base-score gap, so DTS
        // core -> ac3 sits exactly at the margin on the pass side (a drop must STRICTLY exceed it to protect) - preserving the force-DTS-to-ac3 behaviour.
        const QUALITY_MARGIN = 7;
        // The three-guard parenthetical shared by the codec_force and loudnorm "would lose detail" skip lines, defined once so the two cannot word-drift.
        const guardTriple = () => `guard_lossless=${guardLossless}, guard_quality=${guardQuality}, guard_object_audio=${guardObjectAudio}`;
        // The two guards that refuse EVERY lossy re-encode whatever its target: lossless detail survives none, and an Atmos/DTS:X/MPEG-H/AC-4 object layer
        // has no ffmpeg encoder. A track the remix folds is judged by these alone before the fold (remixFoldsTrack).
        const guardRefusesAnyEncode = (stream) => !stream.awkSecondaryTrack && stream.awkTier === 'surround'
            && ((guardLossless === 'enabled' && !!stream.awkLossless) || (guardObjectAudio === 'enabled' && !!stream.awkObjectAudio));
        const guardBlocks = (stream, targetCodec, targetChannels, srcChannels) => {
            if (stream.awkSecondaryTrack || stream.awkTier !== 'surround') return false;
            if (guardRefusesAnyEncode(stream)) return true;
            if (guardQuality === 'disabled') return false;
            if (Number(targetChannels) < Number(srcChannels)) return true;       // the operation drops channels
            const family = aacFamily(targetCodec);      // aac_vbr scores as the aac family
            // Predict the bitrate the same-channel force branch actually emits, then score it. aac_vbr is predicted as libfdk VBR (see aacVbrPredictedBps /
            // aacVbrArgsIdx), NOT resolveBitrate's CBR target, or the guard would overstate the delivered quality; the aac_at and native fallbacks emit their
            // own rates, which this prediction does not track.
            const srcBps = Number(stream.bit_rate) || 0;
            const predBps = targetCodec === 'aac_vbr'
                ? aacVbrPredictedBps(srcBps)
                : resolveBitrate(family, targetChannels, srcBps, false, stream.awkQuality);
            const predQuality = audioQuality({ codec_name: family, channels: targetChannels, bit_rate: predBps });
            const margin = guardQuality === 'strict' ? 0 : QUALITY_MARGIN;
            return predQuality < stream.awkQuality - margin;                 // target scores below the source by more than the tier's margin → detail lost
        };

        // ====== CHANNEL-LAYOUT VERDICTS ======
        // What each encoder makes of a channel layout, measured together on jellyfin-ffmpeg 7.1.4, so one re-measurement edits one place.
        // The layout ac3/eac3 WRITE for a source layout of up to 6 channels (codecMaxCh keeps anything wider away from them unfolded). Both re-matrix a layout
        // they cannot hold to the nearest one they can and exit 0: 6.0, 6.0(front) and hexagonal come out 5.0(side), 3.1.2 comes out 3.1; every other standard
        // layout keeps its count, and a custom channel order is not sent to them at its count (layoutRefusal); aac and libopus write the source's count or
        // refuse (measured on jellyfin-ffmpeg 7.1.4, 2026-11-06). A downmix (DL+DR) comes out mono, so it never reaches them unrenamed (pceRelabel). Read from
        // ffprobe's channel_layout RAW, as opusLayoutFor does. A Map, never an object: the key is the file's own string.
        const AC3_REMATRIXED = new Map([['6.0', { layout: '5.0(side)', channels: 5 }], ['6.0(front)', { layout: '5.0(side)', channels: 5 }],
            ['hexagonal', { layout: '5.0(side)', channels: 5 }], ['3.1.2', { layout: '3.1', channels: 4 }]]);
        const layoutKeyOf = (stream) => String(stream?.channel_layout || '').toLowerCase().trim();
        const ac3Rematrix = (codec, stream) => ((codec === 'ac3' || codec === 'eac3') ? AC3_REMATRIXED.get(layoutKeyOf(stream)) : undefined);
        const encodedChannels = (codec, stream, channels) => ac3Rematrix(codec, stream)?.channels ?? channels;
        // The re-matrix as an explicit filter, so a loudness analysis and its correction measure the mix the encoder writes rather than the source's. Measured
        // on jellyfin-ffmpeg 7.1.4 with uncorrelated noise on each speaker, under tv into ac3 and eac3: corrected on its own channels a 3.1.2 landed 1.26 LU
        // under target and a 6.0 or hexagonal 0.85 LU over; behind this filter all three landed within 0.14 LU, the 3.1.2 with its LFE band-limited as real LFE
        // content is. A full-band LFE still lands about 1 LU under: loudnorm counts a 4-channel input's index-3 LFE as a surround, and ac3/eac3 band-limit it
        // after the measurement. Byte-identical to the encoder's own re-matrix (6.0, 6.0(front), hexagonal and 3.1.2 into ac3 and eac3). '' for every other
        // encode.
        const ac3RematrixFilter = (codec, stream) => (ac3Rematrix(codec, stream) ? `aformat=channel_layouts=${ac3Rematrix(codec, stream).layout}` : '');
        // The log note for an encode that writes fewer channels than its source has ('' otherwise); the layout is always one of AC3_REMATRIXED's keys when it
        // prints. Bare text: each caller puts it in its own parenthetical.
        const ac3FoldNote = (codec, stream, written, channels) => (written < channels
            ? `${codec} holds a ${layoutKeyOf(stream)} layout as ${written} channels` : '');

        // The standard layouts of up to 8 channels native aac refuses (exit 234, 'Unsupported channel layout'), measured on every one on jellyfin-ffmpeg 7.1.4:
        // the height layouts, whose top speakers have no lossless rename, and downmix, which pceRelabel renames to stereo first. Wider layouts never reach aac
        // (codecMaxCh), nor does aac_vbr's stereo-only encode meet these.
        const AAC_REFUSED_LAYOUTS = new Set(['3.1.2', '5.1.2', 'cube']);
        // A channel order outside every standard layout, which ffprobe spells by its speakers ('4 channels (FL+FR+TFL+TFR)'), on a non-aac track: a FLAC or
        // WAV custom channel mask, a .mov chan atom. An aac one is an unlabelled PCE, which pceRelabel names or layoutUnplaceable leaves as it is.
        const customOrder = (stream) => codecFamilyOf(stream) !== 'aac' && /^\d+ channels \(/.test(String(stream?.channel_layout || ''));
        const LAYOUT_LOG_MAX = 60;   // a layout's echo: the longest real one, a 12-channel custom order, runs 54 characters
        // Why `codec` cannot take this track at its own channel count, as the clause a skip line ends on ('' when it can); the track is then left as it is
        // rather than encoded. Native aac refuses AAC_REFUSED_LAYOUTS and every custom order (exit 234 on every requeue). ac3/eac3 take a custom order but
        // re-matrix it to a layout nobody measured - on jellyfin-ffmpeg 7.1.4 '4 channels (FL+FR+TFL+TFR)' came out stereo at -18.20 LUFS and '6 channels
        // (FL+FR+FC+LFE+FLC+FRC)' as 3.1 - so the written count, the loudness and the stamp would all be guesses. A fold to stereo or 5.1 is not affected:
        // swresample folds a custom order by its speakers.
        const layoutRefusal = (codec, stream) => {
            const family = aacFamily(codec);
            const shown = logSafe(String(stream?.channel_layout || '').trim(), LAYOUT_LOG_MAX);
            if (family === 'aac' && (AAC_REFUSED_LAYOUTS.has(layoutKeyOf(stream)) || customOrder(stream))) return `native aac can't encode a ${shown} layout`;
            if ((family === 'ac3' || family === 'eac3') && customOrder(stream)) return `${family} would re-matrix a ${shown} layout to one nobody measured`;
            return '';
        };

        // An aac track with no ffprobe channel_layout carries an AAC program config element (PCE): ffmpeg's native aac writes 3.1, quad(side), 4.1, 5.0(side),
        // 5.1(side), 6.0, hexagonal, 6.1, 7.0, 7.1(wide), octagonal and their (front)/(back)/(wide-side) twins that way, so every ffmpeg aac 5.1 made from
        // ac3/eac3/dts has one. ffmpeg decodes it in the layout's own channel order but unlabelled, and only MediaInfo reads which layout it is. These are
        // Tdarr's mediainfo.js 0.2.0 spellings (ChannelLayout, which carries the element order, then ChannelPositions) of the PCE jellyfin-ffmpeg 7.1.4 writes
        // for each layout, measured 2026-11-06. No entry for 6.0 and hexagonal, which spell alike though their PCEs differ, nor for 6.0(front), which ffmpeg
        // decodes with its two front pairs swapped. Two residuals are accepted. A 5.0(back) written with a forced PCE (-aac_pce 1) spells exactly as the native
        // 5.0(side) one, so it is relabelled side: every channel stays at its index, only the surround pair's label moves, and dropping the row would leave
        // every common 5.0(side) aac unconverted. In a .mov MediaInfo reads the chan atom instead, which ffmpeg writes by channel count alone (5.1(side), 6.0,
        // 6.0(front) and hexagonal all read as 5.1, 3.1 and quad(side) as 4.0), and a .ts gives no positions, so no row can name a PCE there: those tracks take
        // the unplaceable skip, and a stack is unaffected because clean_and_remux writes mkv or mp4 first. A Map, so probe text never reads a prototype member.
        const AAC_PCE_LAYOUTS = new Map([
            ['L R Ls Rs / Front: L R, Side: L R', 'quad(side)'],
            ['L R C LFE / Front: L C R, LFE', '3.1'],
            ['L R C Ls Rs / Front: L C R, Side: L R', '5.0(side)'],
            ['L R C Cb Cb / Front: L C R, Side: C, Back: C', '4.1'],
            ['L R C Cb Lb Rb / Front: L C R, Side: C, Back: L R', '5.1(side)'],
            ['L R C Cb Lb Rb Cb / Front: L C R, Side: C, Back: L C R', '6.1'],   // ffmpeg writes 6.1(back) and 6.1(front) as this same PCE
            ['L R C Ls Rs Lb Rb / Front: L C R, Side: L R, Back: L R', '7.0'],   // and 7.0(front) as this one
            ['L R C Cb ? ? ? ? / Front: L C R, Side: C, Back: 4', '7.1(wide)'],  // and 7.1(wide-side) as this one
            ['L R C Ls Rs Lb Rb Cb / Front: L C R, Side: L R, Back: L C R', 'octagonal'],
        ]);
        // ffprobe names no layout: the key absent (its JSON) or 'unknown' (its flat output).
        const noLayout = (s) => !s.channel_layout || s.channel_layout === 'unknown';
        // An unlabelled PCE decode: an aac track above two channels with no ffprobe layout, or one ffprobe spells as a custom channel order ('6 channels
        // (FL+FR+BL+BR+FLC+FRC)', how jellyfin-ffprobe 7.1.4 reads a front-wide PCE a mainline ffmpeg wrote), which native aac refuses outright (exit 234).
        const unlabelledPce = (s) => codecFamilyOf(s) === 'aac' && s.awkChannels > 2 && (noLayout(s) || /^\d+ channels \(/.test(s.channel_layout));
        // The layout AAC_PCE_LAYOUTS names for an unlabelled PCE; '' for every other track, and for a PCE MediaInfo does not identify (layoutUnplaceable).
        const pceLayoutOf = (s) => {
            if (!unlabelledPce(s)) return '';
            const mi = mediaInfoFor(s);
            return AAC_PCE_LAYOUTS.get(`${mi?.ChannelLayout} / ${mi?.ChannelPositions}`) || '';
        };
        // A non-aac track with no ffprobe layout whose decode no encoder or fold can place: an opus above two channels (mapping family 255, whose channels
        // carry no meaning at all - measured on jellyfin-ffmpeg 7.1.4, a 6ch one to native aac exits 234 'Unsupported channel layout "6 channels"', and a 3ch
        // one to ac3 behind loudnorm comes out with its third channel silent), and any codec at 3 or 7 channels, whose count default puts an LFE where a
        // full-range speaker sits (3 decodes as 2.1, so a 3.0's centre - its dialogue - is taken as LFE, and 7 as 6.1, so a 7.0's back left is): measured on
        // PCM in Matroska, a stereo fold drops that channel, a 5.1 fold puts it on the LFE, and at 3 channels ac3 and native aac write it silent. At 5, 6 and 8
        // channels the default (5.0, 5.1, 7.1) is the common real layout, so those still convert. Matroska keeps no PCM layout at all, so a PCM written from a
        // layout other than its count's default is converted on that default: a 6.0's back centre lands on the LFE that ac3 band-limits away - an accepted
        // upstream residual.
        const noLayoutGuess = (s) => codecFamilyOf(s) !== 'aac' && noLayout(s)
            && (codecFamilyOf(s) === 'opus' ? s.awkChannels > 2 : [3, 7].includes(s.awkChannels));
        // A decode no encoder or fold can place by its layout: a PCE MediaInfo does not identify, a no-layout guess above, and an ambisonic layout, which
        // swresample refuses outright ("Input channel layout 'ambisonic 1' is not supported", exit 234).
        const layoutUnplaceable = (s) => (unlabelledPce(s) && !pceLayoutOf(s)) || noLayoutGuess(s) || /^ambisonic\b/i.test(String(s.channel_layout || ''));
        // The one decode layoutUnplaceable must not stop: an opus with no layout re-encoded to opus in place, which keeps its mapping family 255 (the encode
        // carries -mapping_family 255). Measured on jellyfin-ffmpeg 7.1.4 through loudnorm at 3 to 8 channels, in mkv and mp4: exit 0, every channel at its
        // own index, and the output still reads no layout, so a later pass stops it from the same conversions. libopus's default mapping instead takes the
        // count's Vorbis layout: it moved channels at 5 and 7 (5.0, 6.1) and labelled every count, which a later pass would then convert or fold by.
        const opusInPlace = (s, targetCodec) => aacFamily(targetCodec) === 'opus' && codecFamilyOf(s) === 'opus' && noLayout(s);
        // Every decode of a named PCE that feeds an encoder or a fold starts with this relabel, `filter` chained behind it. Without it the decode takes the
        // channel count's default layout and every encoder and fold places the speakers by that: measured 2026-11-11 on jellyfin-ffmpeg 7.1.4, one tone per
        // speaker, ac3/eac3 put 3.1's centre and LFE and 4.1's LFE and back centre on the surrounds, libopus takes 4.1, 7.0, 7.1(wide) and octagonal as
        // layouts it accepts (octagonal's back left lands on the LFE), and a stereo or 5.1 fold of 7.0 or octagonal loses the back left. channelmap
        // renames without mixing: measured 2026-11-06 on every AAC_PCE_LAYOUTS layout, an aac encode behind it writes back a byte-identical
        // AudioSpecificConfig with every channel's content at its position. Rejected: -ac N relabels to the count's default, which moves or loses a speaker
        // on 3.1, quad(side), 4.1, 6.0, hexagonal, 7.0, 7.1(wide) and octagonal (a 6.0 back centre becomes an LFE the encoder band-limits away), and
        // -ch_layout behind the correction's aresample remixes from that default (quad(side) loses a side channel).
        // A QuickTime Lt/Rt track (a .mov PCM 'downmix', DL+DR) is renamed stereo the same way: native aac and libopus refuse 'downmix' (exit 234), and
        // ac3, eac3 and aac_at write it mono. Measured on jellyfin-ffmpeg 7.1.4 with a different tone on each side: behind the rename every one of them
        // writes stereo with DL on FL and DR on FR, nothing mixed.
        const pceRelabel = (s, filter = '') => {
            const lay = pceLayoutOf(s) || (layoutKeyOf(s) === 'downmix' ? 'stereo' : '');
            return lay ? `channelmap=channel_layout=${lay}${filter ? `,${filter}` : ''}` : filter;
        };
        // A decode layoutUnplaceable stops is left as it is by every operation that would decode it, with this line, which says what the probes read: a
        // guessed layout re-encodes cleanly but puts channels on the wrong speakers. MediaInfo is named only for aac, the one codec it can name a PCE for.
        const unplaceableSkip = (s, tag, what) => {
            // ffprobe's own count, which the enriched stream's has replaced with the both-probe one (enrichStream)
            const probed = Number(file.ffProbeData.streams.find((x) => x.index === s.index)?.channels) > 0;
            const read = probed ? `channel_layout "${logSafe(String(s.channel_layout || '').trim() || 'none', LAYOUT_LOG_MAX)}"` : 'no channel count';
            const positions = mediaInfoFor(s)?.ChannelPositions;
            const mi = codecFamilyOf(s) !== 'aac' ? '' : ` and MediaInfo ${positions ? `"${logSafe(positions, LAYOUT_LOG_MAX)}"` : 'no channel positions'}`;
            return `☒${streamTag(s.index)}[${tag}] ${what} - ffprobe reads ${read}${mi}, which ${mi ? 'match' : 'matches'} no layout its `
                + `${s.awkChannels} channels can be placed by, so none is guessed; left as ${codecNameOf(s) || 'unknown'} ${s.awkChannels}ch\n`;
        };

        // The layouts libopus writes with every speaker in place. It HARD-ERRORS on a layout outside its RFC mappings, failing the whole job (2.1, 4.0,
        // 5.0(side), 6.1(back) and quad(side) among them; re-verified 2026-10-12 via `anullsrc=channel_layout=X -c:a libopus` on jellyfin-ffmpeg 7.1.4), and it
        // encodes 5.0 and 6.1 with speakers moved: measured 2026-11-11 on 7.1.4 with one tone per speaker, decoded by ffmpeg and by libopus itself, a 5.0
        // comes back with FC heard in BR, BL in FC and BR in BL, and a 6.1 with FC heard in BC, BC in SL and SL in FC, while 3.0, quad, 5.1, 5.1(side) and 7.1
        // come back in place. So 5.0 and 6.1 are treated as refused. Rejected: a channelmap that pre-permutes them to cancel the move (it would move them
        // silently the day ffmpeg fixes the mapping), and padding them to 5.1 / 7.1 (it changes the channel count that titles, dedup and encodedChannels read).
        // ac3/eac3 encode every standard layout libopus refuses, a few with fewer channels (encodedChannels), and native aac keeps the count bar the layouts
        // it refuses; a layout either cannot take at its count never reaches it (layoutRefusal, pceRelabel, layoutUnplaceable) - so this guards only the paths
        // that encode opus.
        const OPUS_OK_LAYOUTS = new Set(['mono', 'stereo', '3.0', 'quad', '5.1', '5.1(side)', '7.1']);
        const opusAcceptsLayout = (channels, layoutStr) => {
            const lay = (layoutStr || '').toLowerCase().trim();
            if (lay) return OPUS_OK_LAYOUTS.has(lay);
            // No explicit layout → ffmpeg assigns the count's default: 2.1 and 4.0 are refused and 5.0 and 6.1 moved, so only 1, 2, 6 and 8 channels pass.
            return [1, 2, 6, 8].includes(channels);
        };
        // The reason a log line gives for this wall, from the layout that hits it: libopus moves the speakers of a 5.0 or 6.1 (the defaults a track with no
        // layout takes at 5 and 7 channels) and refuses every other. Phrased 'its <layout> layout', which reads right whatever the layout is called.
        const opusLayoutWhy = (lay, channels) => ((lay ? ['5.0', '6.1'].includes(lay) : [5, 7].includes(channels))
            ? `libopus would move the speakers of its ${lay || `${channels}ch`} layout` : `libopus can't encode its ${lay || `${channels}ch`} layout`);
        // Layouts that map LOSSLESSLY to an opus-accepted layout at the SAME channel count by pure relabel (side↔back position equivalence) - emitted via
        // channelmap (a permutation matrix, never a mix). A layout not listed here has no lossless relabel, so it falls to method_layout_err (keep/drop/remix).
        // 5.0(side) and 6.1(back) are not listed: their relabels lead to 5.0 and 6.1, which libopus moves.
        const OPUS_RELABEL = {
            'quad(side)': { layout: 'quad', map: 'FL-FL|FR-FR|SL-BL|SR-BR' },
        };
        // One place that answers "what does opus make of this layout?": the normalised layout string, whether libopus accepts it, its lossless relabel (null if
        // none) and that relabel's channelmap pre-filter ('' if none). The layout-drop pre-pass, the codec_force opus branch and the loudnorm
        // convergence-to-opus path each ask a different downstream question of the same verdict, so a new OPUS_RELABEL entry or a normalisation change lands in
        // one spot instead of three. It reads ffprobe's channel_layout RAW, never the both-probe resolveChannelLayout: these tables are keyed on libavutil's
        // spellings - the layout ffmpeg itself assigns on decode, which is what libopus sees - while MediaInfo spells the same 5.1(side) "L R C LFE Ls Rs"
        // (Tdarr's mediainfo.js 0.2.0, measured 2026-10-17), which would miss every table and wall off a track libopus accepts. A named PCE reads as the
        // layout its relabel gives the decode (pceLayoutOf), and its relabel filter starts with that one. An absent layout takes opusAcceptsLayout's
        // count-based default, and the count itself comes from resolveChannels.
        const opusLayoutFor = (stream, channels) => {
            const lay = (pceLayoutOf(stream) || stream.channel_layout || '').toLowerCase().trim();
            const relabel = OPUS_RELABEL[lay] || null;
            return { lay, ok: opusAcceptsLayout(channels, lay), relabel,
                relabelFilter: relabel ? pceRelabel(stream, `channelmap=map=${relabel.map}:channel_layout=${relabel.layout}`) : '' };
        };
        // ====== END CHANNEL-LAYOUT VERDICTS ======

        // The 5-6ch and exactly-2ch channel bands, one spelling for dedup's grouping (dedupBand) and the downmix bookkeeping's existing*Langs, which must
        // agree: a disagreement would be an infinite create/remove loop between method_deduplicate and the downmix options. Each site applies them to its own
        // channel field.
        const inSixBand = (ch) => ch > 4 && ch <= 6;
        const inStereoBand = (ch) => ch === 2;

        // The setting that put a track on a non-surround tier, so a log line names the input the user would go and change.
        const tierTagOf = (s) => (s.awkSecondaryTrack ? `downmix_secondary=${downmixSecondary}`
            : (langStereoKeys.includes(s.awkMatchKey) ? 'language_stereo' : `language_unlisted=${langUnlisted}`));
        // A surround the stereo tier folds to a codec_stereo stereo this pass: the STEREO TIER fold arm acts on exactly these, and DEDUPLICATE judges
        // them as the stereo they become. Not one whose codec_stereo the container refuses, nor a decode no layout places (layoutUnplaceable): both are left as
        // they are, each with its own line.
        const stereoTierFolds = (s) => s.awkTier === 'stereo' && s.awkChannels > 2 && !containerRefusesAudio(codecStereo) && !layoutUnplaceable(s);

        // ====== DEDUPLICATE ======
        // Duplicate removal keeps `survivor` and drops `removed`. Block only when the drop loses detail the survivor can't hold. Separate from
        // guardBlocks: dedupe compares against an existing survivor (not a predicted transcode) and must check the survivor's losslessness. No
        // quality clause on purpose — the dedupe sort is measured-bitrate-first, so a survivor can carry a LOWER awkQuality than the removed track;
        // a quality clause would wrongly block those drops. The channel-count check protects the higher-channel duplicate under BOTH quality tiers
        // ('enabled' and 'strict'), so 'strict' is genuinely ⊇ 'enabled' (its documented "most protective" role) even on a channel-dropping dedup.
        // Returns the guard that blocked the drop as an `input=value` token (falsy '' when nothing blocks), so the call site can name the setting
        // the user actually has to change instead of listing all three - one definition, so the clause and the message it produces cannot drift.
        const dedupeGuardBlock = (removed, survivor) => {
            if (removed.awkTier !== 'surround') return '';   // a track already headed for stereo/delete is deduped freely (the dedup loop skips secondaries)
            // A surround-kept track whose survivor is NOT surround can only be a guard_original-pinned 'original' (the sole per-track tier split within a
            // group - every other tier rule is language-wide, identical for group-mates). The survivor is itself headed for delete/stereo and cannot hold
            // the kept-at-surround slot, so removing the original loses the very language guard_original promised to keep. Block it, naming guard_original
            // as the determinate cause (it is the only thing that could have put `removed` above `survivor` in tier).
            if (survivor.awkTier !== 'surround') return `guard_original=${guardOriginal}`;
            if (guardLossless === 'enabled' && removed.awkLossless && !survivor.awkLossless) return `guard_lossless=${guardLossless}`;
            if (guardObjectAudio === 'enabled' && removed.awkObjectAudio && !survivor.awkObjectAudio) return `guard_object_audio=${guardObjectAudio}`;
            // survivor has fewer channels (enabled AND strict)
            if (guardQuality !== 'disabled' && removed.channels > survivor.channels) return `guard_quality=${guardQuality}`;
            return '';
        };

        // Remove lower-quality duplicates among MAIN tracks (secondaries are exempt - see the loop), across ALL audio streams regardless of the language
        // settings: a duplicate in a non-preferred language is still a duplicate. In each group the first stream in byQuality order survives unless
        // dedupeGuardBlock keeps the duplicate; the "-error" modes group identically but abort instead of removing.
        const methodDeduplicateErrorMode = methodDeduplicate === 'multi-stereo-error' || methodDeduplicate === 'channel-error';
        const methodDeduplicateGroupBy = methodDeduplicateErrorMode ? methodDeduplicate.replace(/-error$/, '') : methodDeduplicate;
        const removedIndices = new Set();
        if (methodDeduplicateGroupBy === 'channel' || methodDeduplicateGroupBy === 'multi-stereo') {
            const seen = new Map();
            // A measured bitrate beats a bitrate-less duplicate of the same tier: audioQuality can only ESTIMATE a track with no
            // reported bitrate (optimistically, from the codec's per-channel target), so it must not win the "which duplicate to
            // keep" decision over a track whose bitrate we actually measured. Both probes are already consulted
            // (resolveStreamBitrate above), so bit_rate === 0 here means genuinely unknown, not just "ffprobe couldn't read it".
            const hasKnownRate = (s) => Number(s.bit_rate || 0) > 0;
            // A lossless track's score is a codec fact (a fixed codecInfo.score), not the optimistic estimate audioQuality gives a bitrate-less LOSSY codec -
            // so it's trustworthy for ranking even with no reported bitrate. Group known-rate OR lossless tracks above estimate-only (bitrate-less lossy) ones,
            // so a lossless master whose bitrate neither probe reports is never sorted below a lossy duplicate and picked for removal (a silent-master-loss bug
            // when guard_lossless is disabled). hasKnownRate still gates the rate DISPLAY below (a lossless track with no bitrate simply shows no "@ N kb/s").
            const trustedRate = (s) => hasKnownRate(s) || s.awkLossless;
            // A surround the stereo tier folds this pass (stereoTierFolds) is grouped and ranked as the stereo the next pass reads back: codec_stereo's
            // family at 2 channels, with no measured bitrate and none of the source's lossless, object-audio or Dolby Surround EX flags. So a fold that
            // would duplicate a stereo of its language is removed here instead of encoded, and an -error mode stops the file before any encode. It is scored
            // as a bare stream no probe joins to, so the source's own MediaInfo cannot refine the fold's codec (an eac3 fold of an Atmos track is plain
            // eac3); foldOf keeps the source for the log, foldsBy the setting that folds it.
            const foldCodec = aacFamily(codecStereo);
            const asDeduped = (s) => (stereoTierFolds(s) ? { ...s, codec_name: foldCodec, channels: 2, awkChannels: 2, bit_rate: 0, awkLossless: false,
                awkObjectAudio: false, awkMatrixSurround: false, awkQuality: audioQuality({ codec_name: foldCodec, channels: 2 }), foldOf: s,
                foldsBy: tierTagOf(s) } : s);
            // A track as the guard-block, abort and removal lines show it: three renderings of the same comparison, of which one executes per hit. The rate
            // is shown for contrast, since duplicates are decided by quality score (largely bitrate-driven). The codec renders through codecDisplayName, so
            // a DTS subtype or an Atmos layer reads as in the input summary, and dd-ex is added separately because a matrixed rear channel is not a codec:
            // without it the EX tiebreak prints two identical ac3 tokens. A fold is shown as the source the input summary lists, then the stereo it becomes.
            const dedupTok = (x, withLang) => {
                const t = x.foldOf || x;
                return `${codecDisplayName(t)}${t.awkMatrixSurround ? ' dd-ex' : ''} ${t.channels}ch${withLang ? ` ${logSafe(t.awkRegionKey)}` : ''}`
                    + `${hasKnownRate(t) ? ` @ ${kbpsToken(t.bit_rate)}` : ''}${x.foldOf ? `, folds to ${foldCodec} 2ch: ${x.foldsBy}` : ''}`;
            };
            // On a quality tie, keep the higher channel count before falling back to index, so multi-stereo dedup collapsing a language's
            // surround variants keeps the 7.1 over a same-quality 5.1 (channel mode already tiers by exact count, so this only bites the broad
            // modes). When channels also tie, prefer an object-audio (Atmos/DTS:X) track over an otherwise-equal plain one so dedup keeps the
            // copy with the object layer. Then a Dolby Surround EX (matrix-6.1) track is kept over a plain 5.1 twin for the same reason: the
            // EX copy carries an extra matrixed rear channel a non-EX decoder folds harmlessly, so keeping it is never worse. Both bumps
            // usually get separated by the score/bitrate first; the tie-breaks only matter when everything above them lands exactly equal.
            const byQuality = audioStreams.map(asDeduped).sort((a, b) =>
                (trustedRate(b) ? 1 : 0) - (trustedRate(a) ? 1 : 0) || b.awkQuality - a.awkQuality || b.awkChannels - a.awkChannels
                || (b.awkObjectAudio ? 1 : 0) - (a.awkObjectAudio ? 1 : 0)
                || (b.awkMatrixSurround ? 1 : 0) - (a.awkMatrixSurround ? 1 : 0) || a.index - b.index);
            // Only worth reporting the und exemption below when two or more untagged MAIN tracks are present: a lone untagged track has nothing it could be
            // a duplicate of, so the exemption changes nothing there and a line about it would be noise on a very common file.
            const undMainCount = byQuality.filter((s) => !s.awkSecondaryTrack && s.awkLangKey === 'und').length;
            for (const s of byQuality) {
                // Commentary/descriptive (secondary) tracks are never deduplicated: two different commentaries (e.g. cast & crew vs directors, often BOTH
                // just titled "Commentary") are distinct content the grouping can't tell apart, so keep every one; only MAIN tracks are deduplicated.
                if (s.awkSecondaryTrack) continue;
                // An untagged (und) track is never deduplicated: langKey folds every untagged track to 'und', so two untagged tracks of
                // DIFFERENT real languages would collide on und|tier and the lower-scored one would be silently dropped - the only copy of
                // a language lost. Language can't prove same content (mirrors the secondary exemption above). clean_and_remux's
                // language_fill_mode vets untagged audio when it runs first, but audio_clean is independently runnable, so guard here too. Says so out loud
                // when there is more than one, matching the no-channel-count skip below: without a line, a user looking at two identical untagged tracks sees
                // dedup do nothing at all and has no way to tell an exemption from a bug.
                if (s.awkLangKey === 'und') {
                    if (undMainCount > 1)
                        skipDone += `☒${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}] Skipping - no language tag; every untagged track `
                            + `folds to "und", so duplicates among them can't be told apart (tag them to dedup these)\n`;
                    continue;
                }
                // A track no probe can measure a channel count for is left out of the grouping entirely, the same rule codec_force and method_loudnorm
                // already apply: an unmeasurable count is never guessed. It matters more here than there, because every comparison against it silently
                // reads false - the tier test would file a surround track under 'stereo' and dedupeGuardBlock's channel clause could not intervene, so a
                // real 2.0 track (or the surround master itself) would be deleted as its duplicate. `continue` rather than a seen entry, so it can be
                // neither removed nor the survivor that removes something else.
                const ch = s.awkChannels;
                if (!(ch > 0)) {
                    skipDone += noChannelCountSkip(s.index, `method_deduplicate=${methodDeduplicate}`, "can't tell which tracks it would duplicate");
                    continue;
                }
                // The dedup BAND - which tracks are candidates to be duplicates of each other. Deliberately not `tier`: the per-track tier assigned above is
                // the language/role verdict (surround/stereo/delete) and shares two of its four spellings with this, so one name for both read as one concept.
                // 'channel' groups by exact channel count, so a 7.1, a 5.1 and a 2.0 all survive. 'multi-stereo' keeps one best surround and one best stereo
                // per language, except that while downmix_to_six / downmix_to_stereo is enabled the 5-6ch / exactly-2ch band is a group of its own (inSixBand /
                // inStereoBand), so a 5.1 or 2.0 - pre-existing or downmix-created - is never removed in favour of a 7.1 or mono.
                let dedupBand;
                if (methodDeduplicateGroupBy === 'channel') {
                    dedupBand = ch;
                } else if (downmixToSix !== 'disabled' && inSixBand(ch)) {
                    dedupBand = 'six';
                } else if (downmixToStereo !== 'disabled' && inStereoBand(ch)) {
                    dedupBand = 'stereo2';
                } else {
                    dedupBand = ch > 2 ? 'surround' : 'stereo';
                }
                // Only MAIN tracks reach here (secondaries skipped above), so the region-grouping key + channel
                // band fully identifies a duplicate group (region-distinct only when method_dedup_region=distinct).
                const key = `${s.awkRegionKey}|${dedupBand}`;
                if (seen.has(key)) {
                    const kept = seen.get(key);
                    const rmTok = dedupTok(s, true);
                    const keptTok = dedupTok(kept, false);
                    // A guard-blocked duplicate SURVIVES (documented in the method_deduplicate tooltip) - but say so, or a user with two obvious duplicates
                    // watches dedup do nothing and cannot tell an exemption from a bug. Same reasoning as the und and no-channel-count exemptions above, and
                    // it also has to precede the -error abort: a duplicate a guard is protecting is not a duplicate the user is being asked to resolve.
                    const guardBlock = dedupeGuardBlock(s, kept);
                    if (guardBlock) {
                        skipDone += `☒${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}][${guardBlock}] Keeping duplicate ${rmTok} - removing it `
                            + `would lose detail stream ${kept.index} (${keptTok}) can't hold\n`;
                        continue;
                    }
                    if (methodDeduplicateErrorMode) {
                        failWithBuffers(`${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}] Duplicate audio track (${rmTok}) alongside stream `
                            + `${kept.index} (${keptTok}) - aborting; tag/remove tracks manually and requeue, or switch method_deduplicate to a `
                            + 'non-error mode');
                    }
                    removedIndices.add(s.index);
                    // Name the sort key that actually decided this, walking the same order byQuality does. Quality is only the SECOND key, so a removed
                    // track can outscore its survivor (see dedupeGuardBlock's note) - and a removal decided on channels or a tiebreak explains nothing at
                    // all unless the survivor's channel count is rendered beside its bitrate.
                    let why;
                    if (!trustedRate(s) && trustedRate(kept)) why = 'no measured bitrate';
                    else if (s.awkQuality < kept.awkQuality) why = 'lower quality';
                    else if (s.channels < kept.channels) why = 'fewer channels';
                    else if (!s.awkObjectAudio && kept.awkObjectAudio) why = 'no object audio';
                    else if (!s.awkMatrixSurround && kept.awkMatrixSurround) why = 'no matrixed rear channel';
                    else why = 'equal, keeping the earlier track';
                    if (s.foldOf && !why.startsWith('equal')) why += ' once folded';   // the reason is the fold's, not that of the source the line names
                    workDone += `☐${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}] Removing duplicate (${why}: ${rmTok}) - keeping stream `
                        + `${kept.index} (${keptTok})\n`;
                } else
                    seen.set(key, s);
            }
        }
        // ====== END DEDUPLICATE ======


        // ====== TIER DELETES 1/2: LANGUAGE ======
        // language_unlisted=delete / downmix_secondary=delete. Both run before existing*Langs below (a deleted track must not leave a stale "already exists"
        // entry that suppresses a downmix backfill), but they sit on OPPOSITE sides of the layout-drop pre-pass - see the ordering note above each. The two
        // deletes carry DIFFERENT safety nets, because they fail differently:
        //   language_unlisted=delete removes a whole unwanted language, so it must NOT require another track of that language to survive - that rule would
        //     make the option inert (an unwanted dub is normally its language's only track). Safety: dormancy (hasWantedLang) + the never-empty floor.
        //   downmix_secondary=delete removes an EXTRA, so it keeps the fall-back rule: only when a plain track of the SAME language survives - a lone
        //     audio-description track, or the only track of its language, is kept.
        // Both are floored by countSurvivingAudio() > 1: no delete may ever leave the file with no audio. The channel clause is dropped when no probe
        // measured a count - enrichStream's fallback lands `undefined` for exactly those streams, and an unguarded interpolation renders "undefinedch".
        const delToken = (s) => `${codecDisplayName(s)}${s.channels > 0 ? ` ${s.channels}ch` : ''} ${logSafe(s.awkLangKey)}`;
        // Surviving audio COUNT (streams not in removedIndices), read at call time so it reflects dedup + pre-pass removals - backs the never-drop-last guard.
        const countSurvivingAudio = () => file.ffProbeData.streams.filter(a => codecTypeOf(a) === 'audio' && !removedIndices.has(a.index)).length;
        // Language deletes resolve FIRST, BEFORE the layout-drop pre-pass: a track that is both unlisted and opus-hostile is then reported as the language
        // delete it is, and the pre-pass measures its never-empty floor against the survivors the user actually asked to keep. Reversed, a lone wanted-language
        // track with a hostile layout is dropped and the floor then spares the unlisted one - leaving the file holding only the language the user deleted.
        for (const s of audioStreams) {
            if (s.awkTier !== 'delete' || s.awkSecondaryTrack || removedIndices.has(s.index)) continue;
            if (countSurvivingAudio() <= 1) {
                skipDone += `☒${streamTag(s.index)}[language_unlisted=delete] Not removing ${delToken(s)} - it is the last audio track\n`;
                continue;
            }
            removedIndices.add(s.index);
            workDone += `☐${streamTag(s.index)}[language_unlisted=delete] Removing ${delToken(s)} - not in language_surround or language_stereo\n`;
        }
        // ====== END TIER DELETES 1/2: LANGUAGE ======


        // ====== LAYOUT-DROP PRE-PASS ======
        // A source the layout-drop pre-pass removes may have been the SOLE source a downmix would have derived a track from - dropping it must not
        // silently lose that derivative. Each such dropped source is recorded here and its stereo/5.1 derivative is created after the main loop, but
        // only when the language didn't otherwise get one (so a redundant dropped source adds nothing). See the post-loop derivative pass below.
        const layoutDroppedDeriveSources = [];
        // The drop floor. Never the last audio track; and never a MAIN track that would leave commentary or descriptive audio standing in
        // for it - the last main track in the file, or the last of its language while that language still has a secondary track. Dropping it
        // there loses the programme audio and keeps the track the user ranks lowest; and downmix_secondary=delete, resolved after this pass,
        // can then not remove that secondary either, since it never leaves a language with no audio - so English 6.0 main audio beside an
        // English description set to delete ended as the description alone. A language with no secondary track is dropped as the tooltip
        // says. Why the floor kept each track, recorded here because the loop reports it AFTER the role deletes have changed what is left.
        const dropKeptWhy = new Map();
        const dropFloor = (s) => {
            if (countSurvivingAudio() <= 1) return 'it is the last audio track';
            if (s.awkSecondaryTrack) return '';
            const left = audioStreams.filter((x) => !removedIndices.has(x.index));
            if (left.filter((x) => !x.awkSecondaryTrack).length <= 1) return 'it is the last main audio track';
            const sameLang = left.filter((x) => x.awkLangKey === s.awkLangKey);
            return sameLang.some((x) => x.awkSecondaryTrack) && sameLang.filter((x) => !x.awkSecondaryTrack).length <= 1
                ? `it is the last main ${logSafe(s.awkLangKey)} track, and only commentary or descriptive audio would be left` : '';
        };

        // method_layout_err=drop must remove streams BEFORE outputAudioIdxMap / the -map removal are built below - a mid-loop removal
        // would break the OTHER forced tracks' -c:a:N numbering. Pre-scan for a surround track codec_force would send to opus with a
        // libopus-incompatible layout that NO downmix will convert to stereo, and remove it (never the last audio track). keep/remix stay in
        // the loop; this mirrors the loop's surround shouldForce for exactly the drop subset. (The loudnorm-only convergence-to-opus path
        // can't drop here - it only knows a track needs re-encoding after measuring, past this point - so there 'drop' falls back to 'keep'.)
        // A container that refuses opus leaves codec_force nothing to drop FOR: the force site stands that track down, so dropping it here would lose it.
        if (methodLayoutErr === 'drop' && codecForce !== 'disabled' && codecSurround === 'opus' && !containerRefusesAudio(codecSurround)) {
            for (const s of audioStreams) {
                if (removedIndices.has(s.index)) continue;
                const ch = s.awkChannels;
                if (ch <= 2 || ch > codecMaxCh(codecSurround)) continue;   // stereo→codec_stereo; past the opus ceiling blocked (targetMaxCh)
                if (codecNameOf(s) === 'opus') continue;                 // already opus
                // guard_lossless/guard_quality/guard_object_audio — mirrors the force-site guard (codecSurround is opus)
                if (guardBlocks(s, codecSurround, ch, ch)) continue;
                if (layoutUnplaceable(s)) continue;                       // the force site leaves it as it is (unplaceableSkip)
                if (!forceReaches(false, ch)) continue;   // is this surround track (never stereo here: ch is 3-8) in codec_force's scope?
                const opusLayout = opusLayoutFor(s, ch);
                if (opusLayout.ok) continue;
                if (opusLayout.relabel) continue;                                            // losslessly relabelable → the loop transcodes it, never drop
                // A downmix that will process this track keeps it out of the drop pile — whether it converts in place (replace, unguarded) or
                // flips to 'add' (guarded: source kept + a derivative added), the track SURVIVES, so defer the drop to the loop; only a track NO
                // downmix touches is truly dropped. Must NOT gate this on guardBlocks: a guarded replace flips to 'add', which keeps the source
                // — dropping it here would delete it before that add runs (a data-loss regression). surround tier: downmix_to_stereo=replace
                // (any >2ch) or downmix_to_six=replace (>6ch → 5.1); stereo tier: the in-place downmix. The per-language one-shot
                // (created*Langs) is dynamic and can't be predicted here; a pre-empted downmix lands the track in the loop keep fallback.
                const stereoPath = s.awkTier === 'stereo';                                   // the in-place stereo downmix converts it anyway
                const surroundPath = !s.awkSecondaryTrack && s.awkTier === 'surround';   // only a genuine surround track reaches downmix_to_*
                if (stereoPath || (surroundPath && (downmixToStereo === 'replace' || (ch > 6 && downmixToSix === 'replace')))) continue;
                const floor = dropFloor(s);
                if (floor) { dropKeptWhy.set(s.index, floor); continue; }
                // Dropped, this track is replaced by the downmix derivative below - which a container that refuses its codec (CONTAINER AUDIO WALLS) cannot
                // hold, leaving the language with neither. So it is kept; the pre-pass cannot yet see whether the language has a stereo of its own anyway.
                const walledDerive = surroundPath && ((downmixToStereo !== 'disabled' && containerRefusesAudio(codecStereo)) ? codecStereo
                    : ((ch > 6 && downmixToSix !== 'disabled' && containerRefusesAudio(codecSurround)) ? codecSurround : ''));
                if (walledDerive) {
                    dropKeptWhy.set(s.index, `the downmix meant to replace it needs ${aacFamily(walledDerive)}, which a .${dstContainer} file cannot hold`);
                    continue;
                }
                removedIndices.add(s.index);
                // this IS a queued change (a removal), so it takes the change symbol like every other removal line, not the warning symbol
                workDone += `☐${streamTag(s.index)}[method_layout_err=${methodLayoutErr}] Dropping - ${opusLayoutWhy(opusLayout.lay, ch)}\n`;
                // Remember a dropped source a downmix ('add' mode) would derive from, so its stereo/5.1 still gets created even though the source itself is
                // gone (see the post-loop pass below). 'replace' modes already deferred above (they convert the source in place), so only 'add' reaches here.
                // Only a genuine surround track derives: a 'stereo'-tier track is converted in place, never derived from.
                if (surroundPath && (downmixToStereo !== 'disabled' || (ch > 6 && downmixToSix !== 'disabled')))
                    layoutDroppedDeriveSources.push(s);
            }
        }
        // ====== END LAYOUT-DROP PRE-PASS ======


        // ====== TIER DELETES 2/2: SECONDARY ROLE ======
        // Role deletes resolve LAST, AFTER the layout-drop pre-pass, because their fall-back rule is a promise about what SURVIVES and plainLangsSurviving is a
        // one-shot snapshot: the pre-pass can remove the very plain track that authorises a secondary's deletion, so reading it any earlier deletes the
        // description track on a promise the next block breaks, and the language vanishes from the file entirely. Double-drop safety does NOT rest on this
        // order - every delete loop and the pre-pass alike skip on removedIndices.has(s.index).
        const plainLangsSurviving = new Set(audioStreams.filter(s => !s.awkSecondaryTrack && !removedIndices.has(s.index)).map(s => s.awkLangKey));
        // Which of the four roles made a track secondary, for the removal log: a line saying only "secondary" leaves the user unable to tell WHY a track
        // counted as one, and since the role is never a language the settings pages give them nowhere else to look. Called only where isSecondaryTrack has
        // already matched, so the last branch is karaoke by elimination; first match wins, because a track can carry more than one role.
        const secondaryRole = (stream) => (isCommentary(stream) ? 'commentary'
            : isDescriptive(stream) ? 'audio description'
                : hasDisposition(stream, 'clean_effects') ? 'M&E' : 'karaoke');
        for (const s of audioStreams) {
            if (s.awkTier !== 'delete' || !s.awkSecondaryTrack || removedIndices.has(s.index)) continue;
            if (!plainLangsSurviving.has(s.awkLangKey)) {
                skipDone += `☒${streamTag(s.index)}[downmix_secondary=delete] Not removing ${delToken(s)} - no plain `
                    + `${logSafe(s.awkLangKey)} track survives to fall back on\n`;
                continue;
            }
            if (countSurvivingAudio() <= 1) {
                skipDone += `☒${streamTag(s.index)}[downmix_secondary=delete] Not removing ${delToken(s)} - it is the last audio track\n`;
                continue;
            }
            removedIndices.add(s.index);
            workDone += `☐${streamTag(s.index)}[downmix_secondary=delete] Removing secondary ${delToken(s)} (${secondaryRole(s)})\n`;
        }
        // ====== END TIER DELETES 2/2: SECONDARY ROLE ======


        // ====== WORK STREAM SELECTION ======
        // aac_vbr is treated as the aac family for codec-identity checks — ffprobe always reports codec_name 'aac' regardless of which encoder produced the
        // track, so comparing against 'aac_vbr' directly would never match and would needlessly re-encode existing AAC tracks. The stream side of the same
        // comparison folds through codecFamilyOf (alias-only) so a container-spelling variant such as aac_latm also reads as its real family.
        const codecStereoFamily = aacFamily(codecStereo);
        // noCodecWorkNeeded: true when a track has landed in a codec_force-affected tier AND is already in that tier's target codec, so there is nothing
        // left to do and it can be excluded from workStreams (the .filter below keeps only the streams this returns false for). The surround shortcuts must
        // only fire for a genuine surround-tier track: a 'stereo'-tier track (language_stereo, language_unlisted=stereo, or downmix_secondary=stereo) always
        // needs the in-place stereo downmix, so a stereo-tier surround source already in codecSurround must NOT be treated as done here - it has to stay in
        // workStreams to reach that downmix regardless of downmix_to_* / codec.
        const noCodecWorkNeeded = (stream) => {
            // A surround-tier track is done when no downmix reaches it - downmix_to_six only touches tracks above 6 channels - and it is already in the
            // forced surround codec.
            if (stream.channels > 2 && stream.awkTier === 'surround' && downmixToStereo === 'disabled' && (stream.channels <= 6 || downmixToSix === 'disabled')
                    && forceReaches(stream.channels <= 2, stream.channels) && codecFamilyOf(stream) === codecSurround)
                return true;
            if((stream.channels <= 2) && forceReaches(stream.channels <= 2, stream.channels) && (codecFamilyOf(stream) === codecStereoFamily))
                return true;
            return false;
        };

        // candidateStreams: the pool for workStreams. A track earns a place when there is genuinely something to do with it - it is a genuine surround track
        // (the only kind eligible for downmix_to_six/downmix_to_stereo), or its tier is 'stereo' (the in-place stereo downmix), or codec_force is set, which
        // must be able to standardize the codec of EVERY track including commentary and unlisted-language ones (e.g. codec_force='all' must touch them all).
        // Anything with nothing to do is dropped from the pool ('delete'-tier tracks may remain harmlessly - workStreams filters removedIndices).
        const candidateStreams = codecForce === 'disabled'
            ? audioStreams.filter(stream => stream.awkTier === 'stereo' || (!stream.awkSecondaryTrack && stream.awkTier === 'surround'))
            : audioStreams;
        const workStreams = candidateStreams
            .filter(s => !removedIndices.has(s.index))
            .filter(s => !noCodecWorkNeeded(s));

        workStreams.sort((a, b) => {
            // language priority: the languages the user most wants (language_surround), in the order they listed them. awkMatchKey is the normalised key
            // and langSurroundKeys the normalised user list, so en/eng/english all rank together. A stereo-tier or unlisted language ranks last.
            // The unlisted sentinel is the list LENGTH (past every real 0..length-1 index), so it can't collide with a real index on a huge free-text list -
            // matching stream_ordering's getLangRank.
            const aLang = langSurroundKeys.indexOf(a.awkMatchKey);
            const bLang = langSurroundKeys.indexOf(b.awkMatchKey);

            const aRank = aLang === -1 ? langSurroundKeys.length : aLang;
            const bRank = bLang === -1 ? langSurroundKeys.length : bLang;
            if (aRank !== bRank) return aRank - bRank;

            // a full-quality genuine track outranks anything demoted to stereo or any secondary (commentary/descriptive/M&E) track
            const aRole = (a.awkSecondaryTrack || a.awkTier !== 'surround') ? 1 : 0;
            const bRole = (b.awkSecondaryTrack || b.awkTier !== 'surround') ? 1 : 0;
            if (aRole !== bRole) return aRole - bRole;

            if (a.awkChannels !== b.awkChannels)
                return b.awkChannels - a.awkChannels;

            const aQuality = a.awkQuality;
            const bQuality = b.awkQuality;
            if(aQuality !== bQuality) return bQuality - aQuality;

            return a.index - b.index;
        });

        if (workStreams.length === 0 && removedIndices.size === 0 && methodLoudnorm === 'disabled') {
            // Flush both buffers like every other exit - skipDone is routinely non-empty here (a guard that blocked the only candidate is exactly the
            // "why did nothing happen" diagnostic), and throwing it away leaves the user with a bare "no changes" line and no reason.
            response.infoLog += workDone + skipDone;
            return skip('☑No audio tracks require changes\n');
        }
        // ====== END WORK STREAM SELECTION ======


        // ====== AUDIO INDEX MAPS ======
        // inputAudioIdxMap: 0-based audio-type index within the INPUT file (for -map 0:a:N). outputAudioIdxMap: 0-based audio-type index within the
        // OUTPUT (for -c:a:N and -metadata:s:a:N). They diverge as soon as anything is removed (dedup, the tier deletes, or the layout-drop pre-pass), because
        // -map 0:a:N always references the input.
        const inputAudioIdxMap = new Map();
        const outputAudioIdxMap = new Map();
        let inputAudioCounter = 0;
        let totalOutputAudioBeforeNew = 0;
        for (const stream of file.ffProbeData.streams) {
            if (codecTypeOf(stream) === 'audio') {
                inputAudioIdxMap.set(stream.index, inputAudioCounter++);
                if (!removedIndices.has(stream.index))
                    outputAudioIdxMap.set(stream.index, totalOutputAudioBeforeNew++);
            }
        }
        // Seed extraArguments with removal exclusions before any codec args.
        if (removedIndices.size > 0) {
            for (const idx of removedIndices)
                extraArguments += ` -map -0:${idx}`;
            convert = true;
        }
        // ====== END AUDIO INDEX MAPS ======


        // ====== DOWNMIX BOOKKEEPING ======
        // Now that dedup, the tier deletes and the layout-drop pre-pass have finalised removedIndices, snapshot which languages still have a primary stereo /
        // 5.1-6ch track among the SURVIVORS, so downmix_to_stereo/downmix_to_six only create one for a language that genuinely lacks it (a removed track can't
        // leave a stale entry). Keyed by awkRegionKey - the IDENTITY key dedup grouped on, region-distinct only under method_dedup_region=distinct, never the
        // folded match key. Channels 2 = stereo; >4 && <=6 = any 5-6ch primary (5.0/5.1, and the rare 4.1, also 5 channels) but not 4.0 (4ch) or 7.1 (8ch).
        const survivingPrimaryAudio = audioStreams.filter(s => !removedIndices.has(s.index) && !s.awkSecondaryTrack && s.awkTier === 'surround');
        // A surviving MAIN stereo-tier track is its language's stereo too - a 2.0 already, or the fold the stereo tier makes of it this pass
        // (stereoTierFolds). The two tiers meet in one language only where guard_original holds an 'original' track at surround in a language
        // language_unlisted=stereo sends to stereo; without this a downmix or remix of the original adds a second stereo there, and dedup keeps both for
        // good (dedupeGuardBlock protects the original's copy).
        const mainStereoTier = audioStreams.filter((s) => !removedIndices.has(s.index) && !s.awkSecondaryTrack && s.awkTier === 'stereo'
            && (inStereoBand(s.channels) || stereoTierFolds(s)));
        const existingStereoLangs = new Set([...survivingPrimaryAudio.filter(s => inStereoBand(s.channels)), ...mainStereoTier].map(s => s.awkRegionKey));
        const existingSixLangs = new Set(survivingPrimaryAudio.filter(s => inSixBand(s.channels)).map(s => s.awkRegionKey));

        // New streams added via -map are numbered after all surviving original audio streams.
        let newStreamOutputIdx = totalOutputAudioBeforeNew;

        // Create at most one 6ch and one 2ch downmix per language, sourced from that language's best (first, highest-channel/quality) track.
        const createdSixLangs = new Set();
        const createdStereoLangs = new Set();
        // "This language already has one" - pre-existing on the file (existing*Langs) OR created earlier this run by a downmix or a remix (created*Langs).
        // ONE definition each, because every site that creates a 6ch or a stereo has to ask the same question: a second same-language track would be a
        // duplicate that dedup only collapses on the NEXT queue pass, or never if dedup is disabled. Both sets are read at call time, so a registration made
        // later in the loop is visible to every later caller.
        const hasSixForLang = (k) => existingSixLangs.has(k) || createdSixLangs.has(k);
        const hasStereoForLang = (k) => existingStereoLangs.has(k) || createdStereoLangs.has(k);
        // "This remix must stand down" - ONE spelling of the deferral both remix sites ask about (codec_force, and the loudnorm convergence): no lossless
        // relabel exists, method_layout_err=remix, and the language already has a GENUINE-track stereo, so remixing would only mint a duplicate. Secondary
        // tracks are excluded on the same rule replaceStereo's registerLang states from the other side: the language's stereo slot belongs to main tracks, so a
        // commentary neither claims it nor is blocked by it. Without that exclusion a secondary is deferred forever - secondaries are never deduplicated, so
        // the duplicate this rule avoids can never be collapsed, and downmix_secondary=stereo already makes one stereo per secondary beside the main one.
        // Takes the ffstream rather than a key so both sites read the same fields off the same object.
        const remixDefersToExistingStereo = (s, relabel) => !relabel && methodLayoutErr === 'remix' && !s.awkSecondaryTrack && hasStereoForLang(s.awkRegionKey);
        // Why the method_layout_err=remix fold leaves this track as it is, as the clause a skip line gives ('' when nothing stands it down): a track already
        // opus is never remixed, under any setting; under remix, an existing stereo of the language or a codec_stereo the container refuses stands it down.
        // The one decision remixFoldsTrack folds on and both remix sites' skip lines print, so a new reason cannot be explained as another.
        const remixStandDown = (s, relabel) => {
            if (codecNameOf(s) === 'opus') return 'it is already opus, which is never remixed';
            if (methodLayoutErr !== 'remix') return '';
            if (remixDefersToExistingStereo(s, relabel)) return 'a stereo already exists for this language';
            return containerRefusesAudio(codecStereo) ? `the remix would need codec_stereo=${codecStereo}, and ${wallText(codecStereo)}` : '';
        };
        // "This remix will run" - a track whose opus target its layout walls off (no lossless relabel) and that method_layout_err=remix folds to a codec_stereo
        // stereo, nothing standing it down. Its operation is that fold, so both remix sites let only guardRefusesAnyEncode stop it up front and judge
        // guard_quality against the stereo it emits - never against the opus it can't be.
        const remixFoldsTrack = (s, channels) => {
            if (channels <= 2 || methodLayoutErr !== 'remix') return false;
            const { ok, relabel } = opusLayoutFor(s, channels);
            return !ok && !relabel && !remixStandDown(s, relabel);
        };
        // ====== END DOWNMIX BOOKKEEPING ======

        // ====== OUTPUT TRACKING ======
        // Tracks which OUTPUT audio indices have already received a -c:a:N assignment so we don't emit conflicting codec directives for the same stream.
        const modifiedAudioIdx = new Set();

        // Predicted output for the closing summary line, which the preset build reads too: appendedAudio decides attachLast, and outputAudioOverride takes an
        // in-place transcode out of the copied set mp4StrictArg checks. outputAudioOverride: output audio index -> { codec, channels, bps, approxRate for an
        // aac_vbr encode, and the title when the encode writes one } for an in-place transcode or downmix.
        const outputAudioOverride = new Map();
        // Tracks added by -map 0:a:N (downmix 'add'), appended after every original, each with the title it is written with.
        const appendedAudio = [];
        // The source streams whose re-encoded output this run cleared of their copied statistics (staleStatsArgs), for staleStatsNote's one line.
        const statsCleared = [];
        // ====== END OUTPUT TRACKING ======


        // ====== LOUDNORM ======
        // Two-pass measured EBU R128 loudness correction, entirely self-contained within this plugin's own invocation - no cross-plugin/cross-run state, no
        // HTTP calls to Tdarr's API. audio_clean spawns ffmpeg itself (as do video_clean's encoder probe and this plugin's aac_vbr probe) for an analysis-only
        // pass, then builds the real measured correction filter from its output. This needs no special capability from Tdarr: otherArguments.ffmpegPath is
        // handed to every classic plugin, classic plugins load as ordinary unsandboxed Node modules, and several official Community/*.js plugins already call
        // child_process.exec/execSync themselves (two of them straight to ffmpeg).
        const LOUDNORM_PRESETS = {
            tv:         { I: -16, LRA: 11, TP: -1.5 },
            cinema:     { I: -23, LRA: 15, TP: -1.0 },
            quiet_room: { I: -16, LRA: 6,  TP: -1.5 },
        };
        const LOUDNORM_TOLERANCE_LU = 1;
        // How much wider a corrected track's loudness range may measure before its trial counts it as widened. loudnorm reads LRA off a histogram of 0.1 LU
        // bins, so a pure gain moves the range by about one bin; 0.2 is margin over that. Measured on jellyfin-ffmpeg 7.1.4: linear corrections of +15 and
        // +16 dB on two real tracks moved LRA by 0.0 and -0.1, while the dynamic-mode widenings this exists to catch were +1.8 to +5.5 LU.
        const LOUDNORM_LRA_RESOLUTION_LU = 0.2;
        // A trial runs loudnorm twice in dynamic mode (the correction, then the analysis) where the first pass runs it once: measured on jellyfin-ffmpeg 7.1.4
        // at 2.2 to 2.4 times the first pass's wall time, so its kill-switch is the first pass's budget scaled by this, keeping the same headroom. The
        // check of a limited trim (buildLoudnormFilter) is the same pass with a gain and a limiter added, and takes the same budget.
        const LOUDNORM_TRIAL_TIMEOUT_FACTOR = 2.5;
        // The smallest level trim worth chaining after an accepted trial (dB); below it the correction already sits on target.
        const LOUDNORM_TRIM_MIN_DB = 0.05;
        // How far under the preset's TP an upward trim may lift the peak, and where its limiter holds it (dB). A limiter at TP itself packs the peaks at the
        // ceiling, and the encoders then overshoot it further than they overshoot the untrimmed correction: measured on jellyfin-ffmpeg 7.1.4 on a 45 s clip
        // whose trial landed at -16.95 LUFS / -1.46 dBTP, at TP ac3 224k wrote +0.02 dBTP (untrimmed -0.66) and native aac 256k -0.49 (-0.96); 0.5 dB
        // under, every encoder wrote a lower peak than untrimmed (ac3 224k -0.72, 320k -1.18, aac -1.25, aac_at -1.69).
        const LOUDNORM_TRIM_PEAK_MARGIN_DB = 0.5;
        // Shape of a measured value: minus/digits/dot only, the %.2f form the real binary emits ('-21.75', '0.00', '-70.00'). Tested on String(val).
        const LOUDNORM_MEASURED_SHAPE = /^-?\d+(?:\.\d+)?$/;
        const LOUDNORM_FIELD_LOG_MAX = 40;   // a real measurement is a few characters; anything longer is already the evidence

        // The analysis timeout is a kill-switch for a WEDGED pass, but the pass costs O(duration) - it decodes the track end to end - so a flat ceiling cannot
        // be right: measured ~11x realtime idle but ~3.4x with six analyses running, and a node normally runs several workers, so budget three wall-seconds per
        // second of audio (~10x loaded headroom). Tripping it FAILS THE FILE, so a ceiling a long legitimate track can reach would quarantine the video. The
        // floor keeps a short track sane and absorbs spawn latency; the cap bounds a hang and a corrupt header declaring a nonsense duration; an unreadable
        // duration falls back to the CAP - work of unknown length must never be killed early. A trial's bound is this one scaled by
        // LOUDNORM_TRIAL_TIMEOUT_FACTOR, so a wedged trial on an unreadable duration holds the worker for up to 10 h.
        const LOUDNORM_ANALYSIS_MIN_TIMEOUT_MS = 10 * 60 * 1000;
        const LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS = 4 * 60 * 60 * 1000;
        const LOUDNORM_ANALYSIS_MS_PER_AUDIO_SEC = 3000;
        const loudnormAnalysisDurationSec = Number(file.ffProbeData.format?.duration) || 0;
        const loudnormAnalysisTimeoutMs = loudnormAnalysisDurationSec > 0
            ? Math.min(LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS,
                Math.max(LOUDNORM_ANALYSIS_MIN_TIMEOUT_MS, Math.round(loudnormAnalysisDurationSec * LOUDNORM_ANALYSIS_MS_PER_AUDIO_SEC)))
            : LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS;
        // Load-bearing: spawnSync's default maxBuffer is 1 MB and the loudnorm JSON rides stderr behind unbounded output, so an overflow truncates it away and
        // reads as "could not find loudnorm measurement JSON".
        const LOUDNORM_ANALYSIS_MAX_BYTES = 64 * 1024 * 1024;
        // The stats block in a stretch of analysis stderr: the LAST flat {...} that parses AND carries input_i, from ANYWHERE in it. The JSON is not the last
        // thing there - real ffmpeg (5.1+) prints it during filter teardown, then a muxing-overhead line and a "size=N/A ..." trailer - so a match anchored to
        // the end finds nothing; and taking the last match skips a track title carrying literal braces, which is printed before the summary.
        const loudnormStatsIn = (text) => {
            let stats = null;
            for (const block of (String(text).match(/\{[^{}]*\}/g) || [])) {
                try { const parsed = JSON.parse(block); if (parsed && 'input_i' in parsed) stats = parsed; } catch (e) { /* not the JSON block */ }
            }
            return stats;
        };
        const loudnormAnalysisFilter = (preFilter, preset, instance = 'loudnorm') =>
            `${preFilter ? `${preFilter},` : ''}${instance}=I=${preset.I}:LRA=${preset.LRA}:TP=${preset.TP}:print_format=json`;
        // What prefetchLoudness measured ahead of the leftovers loop, keyed source audio index + pre-filter; measureLoudness serves a request from here
        // before spawning a pass of its own.
        const loudnormPrefetched = new Map();
        const loudnormKey = (srcAudioIdx, preFilter) => `${srcAudioIdx}|${preFilter || ''}`;
        // Synchronous analysis-only ffmpeg spawn measuring one stream's EBU R128 loudness: { stats } (input_i/input_tp/input_lra/input_thresh/target_offset) or
        // { error } - every failure is reported, never thrown, so the caller decides how to fail the file. The loudnorm JSON logs at AV_LOG_INFO, so -loglevel
        // must stay at or above that (-nostats silences only the unrelated progress line). Args-array form only, never a shell string.
        const measureLoudness = (srcAudioIdx, preFilter, preset, timeoutMs = loudnormAnalysisTimeoutMs, pass = 'analysis') => {
            const prefetched = loudnormPrefetched.get(loudnormKey(srcAudioIdx, preFilter));
            if (prefetched) return prefetched;
            const args = ['-nostats', '-hide_banner', '-i', file.file, '-map', `0:a:${srcAudioIdx}`, '-af', loudnormAnalysisFilter(preFilter, preset),
                '-f', 'null', '-'];
            const result = spawnSync(ffmpegPathOf(otherArguments), args,
                { timeout: timeoutMs, maxBuffer: LOUDNORM_ANALYSIS_MAX_BYTES, encoding: 'utf-8', killSignal: 'SIGKILL' });
            // A tripped `timeout` sets BOTH error (code ETIMEDOUT) and signal (the killSignal), and error is tested first - so the timeout must be named
            // HERE or it reports as a failure to launch, which is the opposite of what happened. The bare signal branch below is then only an external kill
            // (an OOM killer, an operator), which is worth telling apart from a timeout because the remedies differ.
            if (result.error && result.error.code === 'ETIMEDOUT')
                return { error: `ffmpeg exceeded the ${Math.round(timeoutMs / 60000)} min ${pass} timeout for this file's duration` };
            if (result.error) return { error: `could not start ffmpeg (${result.error.message})` };
            if (result.signal) return { error: `ffmpeg was killed from outside (signal ${result.signal})` };
            // A codec this build has no decoder for is named, in ffmpeg's own words, so the quarantine says why (jellyfin-ffmpeg 7.1.4 on MPEG-H: '[aist#0:0/
            // mpegh_3d_audio @ 0x...] Decoding requested, but no decoder found for: mpegh_3d_audio', exit 234). Read only from a line of ffmpeg's own, which
            // starts with its bracketed context: a track title the input dump echoes is indented, so it cannot name a codec here.
            if (result.status !== 0) {
                const noDecoder = /^\[[^\]\r\n]*\] Decoding requested, but no decoder found for: (\w+)/m.exec(String(result.stderr || ''));
                return { error: `ffmpeg exited with status ${result.status}${noDecoder ? ` - no decoder found for: ${noDecoder[1]}` : ''}` };
            }
            const stats = loudnormStatsIn(result.stderr || '');
            if (!stats) return { error: 'could not find loudnorm measurement JSON in ffmpeg output' };
            return { stats };
        };

        // Distinct tracks measured by ONE ffmpeg instead of one each: a -map/-af/null output per track, every loudnorm named loudnorm@rN so its block is
        // tied back by name - the outputs print in no stable order. Measured 2026-10-13 on jellyfin 7.1.4 against a real 737 s TrueHD 7.1 + ac3 + eac3 + ac3
        // remux: four tracks took 150-187 s against 299-363 s one by one, from local disk and SMB alike, with byte-identical stats - the outputs decode and
        // filter in parallel and the file is read once. The SAME track measured twice (a 7.1 and its stereo fold) gained nothing (100-143 s against 108-144
        // s), so the downmix / codec_force / remix sites keep one pass each and only the leftovers loop - distinct tracks, all known before it emits - is
        // batched. A batch that fails in any way measures nothing: each track then takes its own pass, which names the culprit. Its kill-switch is the
        // sequential total, one per-track budget each under the same cap. LOUDNORM_BATCH_MAX bounds the parallel filter instances (~217 MB each) to ~1.7 GB.
        const LOUDNORM_BATCH_MAX = 8;
        const prefetchLoudness = (srcAudioIdxs, preset) => {
            for (let at = 0; srcAudioIdxs.length - at >= 2; at += LOUDNORM_BATCH_MAX) {
                const batch = srcAudioIdxs.slice(at, at + LOUDNORM_BATCH_MAX);
                const args = ['-nostats', '-hide_banner', '-i', file.file];
                batch.forEach((idx, k) => args.push('-map', `0:a:${idx}`, '-af', loudnormAnalysisFilter('', preset, `loudnorm@r${k}`), '-f', 'null', '-'));
                const timeout = Math.min(LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS, loudnormAnalysisTimeoutMs * batch.length);
                const result = spawnSync(ffmpegPathOf(otherArguments), args,
                    { timeout, maxBuffer: LOUDNORM_ANALYSIS_MAX_BYTES, encoding: 'utf-8', killSignal: 'SIGKILL' });
                const err = String(result.stderr || '');
                // Each track's stats come only from ITS OWN teardown report: the instance name at the start of a line, the JSON opening on the next. The
                // stream dumps echo every title and global tag at the same INFO level and land between the reports (an output whose track is shorter than
                // loudnorm's ~3 s lookahead dumps at EOF, after a sibling has reported), but a dump indents every value and re-indents after an embedded
                // newline, so no tag can put a marker or a brace at the start of a line. Read any looser way - from the first mention of the name, or the
                // last block after it - a title carrying the marker text and a forged block was taken as a track's stats on jellyfin 7.1.4, passed
                // LOUDNORM_MEASURED_SHAPE, and set a +29 LU correction. \r?\n so a stderr written with CRLF line ends (Windows text mode) still matches.
                const found = batch.map((idx, k) => {
                    let stats = null;
                    for (const m of err.matchAll(new RegExp(`^\\[loudnorm@r${k} @ [^\\]\\r\\n]*\\] *\\r?\\n(\\{[^{}]*\\})`, 'gm'))) {
                        try { const parsed = JSON.parse(m[1]); if (parsed && 'input_i' in parsed) stats = parsed; } catch (e) { /* not the JSON block */ }
                    }
                    return stats;
                });
                const why = result.error ? (result.error.code === 'ETIMEDOUT' ? 'it ran past its timeout' : `ffmpeg could not start (${result.error.message})`)
                    : result.signal ? `ffmpeg was killed (signal ${result.signal})` : result.status !== 0 ? `ffmpeg exited with status ${result.status}`
                        : found.some((s) => !s) ? 'a track reported no loudness' : '';
                if (why) {
                    response.infoLog += `☒[method_loudnorm=${methodLoudnorm}] Measuring ${batch.length} tracks in one pass failed (${why}) - measuring each `
                        + 'on its own instead\n';
                    continue;
                }
                batch.forEach((idx, k) => loudnormPrefetched.set(loudnormKey(idx, ''), { stats: found[k] }));
            }
        };

        // Measure, then decide the correction filter comma-chained onto preFilter, or return unchanged (changed:false) when already within
        // LOUDNORM_TOLERANCE_LU of target or when the correction's trial declines it (declined:true). `measured` gates the awk_loudnorm cache stamp: the
        // track-cap branch and a declined correction also return changed:false WITHOUT it, and stamping the first would cache a claim nothing checked;
        // a decline is stamped only where the caller asks (recordDecline, `recorded`).
        // measured_thresh has NO uppercase alias (unlike measured_I/_LRA/_TP) - keep it exactly lowercase. Pass-1's JSON field names
        // (input_i/input_lra/input_tp/target_offset) are NOT pass-2's filter option names (measured_I/measured_LRA/measured_TP/offset) - same numbers,
        // different names per side. The per-file analysis cap exists because each pass is a synchronous full-duration spawn - a crafted file declaring many
        // audio tracks could tie up a worker for hours; past the cap the rest are left at source loudness with one warning, for a later queue pass. A
        // counted track spends one analysis, a dynamic-mode correction a trial as well (LOUDNORM_TRIAL_TIMEOUT_FACTOR), and a limited trim one more pass of
        // the trial's length: on an M1, a 2 h 5.1 track is about 10 min of analysis and 25 min of trial. Tdarr's Worker Stall Detector (off by default)
        // cancels a plugin phase that outlasts its interval, because plugin work never moves the progress percentage: an interval of 30 min covers one
        // corrected 5.1 track of up to about 100 min, and several corrected tracks add up.
        const LOUDNORM_MAX_TRACKS = 24;
        let loudnormMeasureCount = 0;
        let loudnormCapWarned = false;
        // A sample rate read off either probe, as a plain integer in a real audio range - it is spliced into the filter string, so nothing else passes.
        const sampleRateOf = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 8000 && n <= 768000 ? n : 0; };
        // `recordDecline`: the caller copy-stamps a declined track it leaves as it was (the leftovers, on Matroska), so the decline line says so.
        const buildLoudnormFilter = (streamIndex, srcAudioIdx, preFilter, preset, recordDecline = false) => {
            if (loudnormMeasureCount >= LOUDNORM_MAX_TRACKS) {
                if (!loudnormCapWarned) {
                    response.infoLog += `☒[method_loudnorm=${methodLoudnorm}] More than ${LOUDNORM_MAX_TRACKS} audio tracks to normalize - measuring `
                        + `the first ${LOUDNORM_MAX_TRACKS}, leaving the rest at source loudness (a later pass can normalize them)\n`;
                    loudnormCapWarned = true;
                }
                return { filter: preFilter, changed: false, measured: false };
            }
            loudnormMeasureCount++;
            const failedPass = (pass, error) => failWithBuffers(`${streamTag(streamIndex)}[method_loudnorm=${methodLoudnorm}] loudnorm ${pass} pass failed `
                + `(${error}) - if this file has known corruption, try clean_and_remux's recover_bad_timestamps/recover_bad_data first; if the codec itself is `
                + `unsupported, that won't help`);
            const analysis = measureLoudness(srcAudioIdx, preFilter, preset);
            if (analysis.error) failedPass('analysis', analysis.error);
            const { stats } = analysis;
            // A digitally-silent track measures input_i="-inf" (and target_offset="inf"); Number("-inf") is NaN (JS parses "Infinity", not "inf"), which would
            // defeat the tolerance test AND then bake a literal measured_I=-inf into the correction filter that the real pass-2 transcode rejects ("out of
            // range [-99 - 0]"). Silence can't be loudness-normalized anyway, so treat any non-finite measured integrated loudness as within-tolerance (skip).
            // A track within tolerance is left alone under every preset, never corrected for its range alone: loudnorm's dynamic mode does not reliably narrow
            // it. Measured 2026-11-06 on jellyfin-ffmpeg 7.1.4, it compressed natural wide film (14.0 -> 7.0 LU) but widened 30 of 75 tracks with an 8-16 dB
            // level step (60-600 s, up to +8.5 LU) and most short clips with a quiet opening, and the stamp would then trust the wider result.
            if (!Number.isFinite(Number(stats.input_i)) || Math.abs(Number(stats.input_i) - preset.I) <= LOUDNORM_TOLERANCE_LU)
                return { filter: preFilter, changed: false, measured: true };
            // Past the silent-track skip above, input_i is finite - and a GENUINE loudnorm block's other four fields are finite too (only true silence, which
            // exits above, carries -inf/inf here). So a non-numeric value in one of them means a malformed or metadata-spoofed block: these land RAW in the
            // double-quoted -filter:a value that escMeta never sees and string-argv tokenizes quote-aware, so a " would open new ffmpeg argv (a second output
            // path = arbitrary write) and an <io> would truncate the output side; a missing field bakes a literal 'undefined' the pass-2 transcode rejects with
            // a cryptic error. Validate the SHAPE, not just the coercion: Number() alone calls '', ' ', null, true, [], '0x1f' and '1e1' finite while the RAW
            // value is what gets spliced, so only a digit/dot/minus regex proves the claim; the finite test stays beside it to keep rejecting a digit string
            // too large to be a real measurement. input_i is validated here too - its own non-finite case already returned above as silence.
            for (const [field, val] of [['input_i', stats.input_i], ['input_lra', stats.input_lra], ['input_tp', stats.input_tp],
                ['input_thresh', stats.input_thresh], ['target_offset', stats.target_offset]])
                if (!LOUDNORM_MEASURED_SHAPE.test(String(val)) || !Number.isFinite(Number(val)))
                    failWithBuffers(`${streamTag(streamIndex)}[method_loudnorm=${methodLoudnorm}] malformed loudnorm measurement JSON from the analysis pass `
                        + `(${field}=${logSafe(String(val), LOUDNORM_FIELD_LOG_MAX)}) - the file may be corrupt or carry crafted metadata; leave `
                        + 'method_loudnorm=disabled for it');
            // loudnorm honours linear=true only while the measured LRA fits the target and linear gain keeps the peak under TP; otherwise it falls back to
            // dynamic mode, which OUTPUTS 192 kHz, and the encoder then picks the supported rate nearest that - native aac (and libfdk_aac, which lists the
            // same rates) take 96 kHz, which many TV and hardware decoders refuse. Measured on jellyfin-ffmpeg 7.1.4: a 48 kHz source at measured_LRA 17
            // under tv came out 96000 Hz on aac and 48000 on ac3/eac3/libopus/aac_at, and a 44.1 kHz one moved to 48000 even on ac3. The trailing
            // aresample returns every encoder to the source rate - or to 48 kHz, the video-standard rate, when neither probe reports one - and is a no-op in
            // linear mode.
            const src = file.ffProbeData.streams.find((s) => s.index === streamIndex);
            const srcRate = sampleRateOf(src?.sample_rate) || (src && sampleRateOf(mediaInfoFor(src)?.SamplingRate)) || 48000;
            const correction = `loudnorm=I=${preset.I}:LRA=${preset.LRA}:TP=${preset.TP}:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}`
                + `:measured_TP=${stats.input_tp}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
            // The applied chain, with `trim` (a level trim after the correction) ahead of the trailing aresample.
            const chain = (trim = '') => `${preFilter ? `${preFilter},` : ''}${correction}${trim},aresample=${srcRate}`;
            // loudnorm's own linear-mode test, mirrored exactly: the gain keeps the peak at or under TP, the range fits the preset's LRA, and no measured value
            // sits at loudnorm's unset default (tp 99, thresh -70, lra 0, i 0). Proved on jellyfin-ffmpeg 7.1.4 by running the correction itself and reading
            // its normalization_type on both sides of the TP and LRA edges under all three presets, at each unset default, and at ten pairs whose
            // floating-point sum lands either side of TP: 25 of 25 agree. A linear correction is a pure gain, lands on target and moves the range by at most a
            // bin, so a trial could never decline it, nor a trim move it. (loudnorm also runs linear on an input under 3 s; such a track takes the trial.)
            const [mI, mTp, mLra, mThresh] = [stats.input_i, stats.input_tp, stats.input_lra, stats.input_thresh].map(Number);
            const linear = mTp !== 99 && mThresh !== -70 && mLra !== 0 && mI !== 0 && mTp + (preset.I - mI) <= preset.TP && mLra <= preset.LRA;
            if (linear) return { filter: chain(), changed: true, measured: true };
            // The trial: a dynamic-mode correction measured as the encoder will receive it, before anything is encoded or stamped. Dynamic mode compresses
            // most wide film as intended but widens a long level step or a quiet opening and can miss the target - measured on jellyfin-ffmpeg 7.1.4 under
            // tv, a 180 s 5.1 film track went 14.0 -> 9.4 LU at -16.02 LUFS, while a 45 s clip with a quiet opening went 14.0 -> 17.5 LU and a 300 s
            // stepped track 14.0 -> 19.5 LU at 1.3 LU off target. Cost: one more full-duration pass (LOUDNORM_TRIAL_TIMEOUT_FACTOR; +35 s on that film
            // track, whose first pass took 15 s).
            const passTimeoutMs = Math.round(loudnormAnalysisTimeoutMs * LOUDNORM_TRIAL_TIMEOUT_FACTOR);
            const srcLra = Number(stats.input_lra);
            // A measured chain against the target and the source's range. The range is compared in hundredths, as loudnorm prints it: 14.10 + 0.2 is
            // 14.299999... in floating point, which would call a 14.30 wider. A non-finite reading is off and wider, never accepted.
            const judge = (st) => {
                const [i, lra, tp] = [st.input_i, st.input_lra, st.input_tp].map(Number);
                const miss = Math.abs(i - preset.I);
                return { i, lra, tp, miss, off: !(miss <= LOUDNORM_TOLERANCE_LU),
                    wider: !(Math.round((lra - srcLra) * 100) <= Math.round(LOUDNORM_LRA_RESOLUTION_LU * 100)) };
            };
            const tried = measureLoudness(srcAudioIdx, chain(), preset, passTimeoutMs, 'trial');
            if (tried.error) failedPass('trial', tried.error);
            const t = judge(tried.stats);
            // The trim: a gain of target - trial after the correction. An accepted trial can still sit up to 1 LU off, and the encoder's own drift then
            // pushes it out of tolerance on the next pass (measured: a trial at -16.95 written -17.03 by native aac and aac_at at 256k, corrected a second
            // time on mp4/mov or stamped 1.03 LU off on mkv); and a trial further off than that is not lost, just short (a 128k re-encode of that clip's
            // trial landed at -17.17). Without a limiter the gain is linear: it moves the level exactly and leaves the range alone, so its result is known
            // without measuring it. An upward gain that would lift the peak past LOUDNORM_TRIM_PEAK_MARGIN_DB under TP is followed by a limiter there, since
            // dynamic mode leaves the peak at TP (the -16.95 trial read -1.46 dBTP) and a gain capped at the peak's headroom could not move it. The limiter
            // has a loudness cost of its own, and on dense transients it takes more than the gain adds - measured on jellyfin-ffmpeg 7.1.4 on pink noise
            // bursts, a trial at -16.87 LUFS trimmed +0.87 dB read -16.97, and was written 1.04 LU off by native aac and ac3 where untrimmed it was
            // written -16.94 - so a limited trim is measured once more as it will be applied, the same pass as the trial with a gain and a limiter added.
            // A trial wider than its source gets no trim: a gain cannot narrow it.
            const raw = Number.isFinite(t.i) && !t.wider ? Math.round((preset.I - t.i) * 100) / 100 : 0;
            const trim = Math.abs(raw) < LOUDNORM_TRIM_MIN_DB ? 0 : raw;
            const ceiling = preset.TP - LOUDNORM_TRIM_PEAK_MARGIN_DB;
            const limited = trim > 0 && !(trim <= ceiling - t.tp);
            const trimmed = chain(`,volume=${trim.toFixed(2)}dB${limited ? `,alimiter=limit=${Math.pow(10, ceiling / 20).toFixed(4)}:level=0:latency=1` : ''}`);
            const checked = limited ? measureLoudness(srcAudioIdx, trimmed, preset, passTimeoutMs, 'trim check') : null;
            const c = !trim || checked?.error ? null
                : checked ? judge(checked.stats) : { ...t, i: t.i + trim, miss: Math.abs(t.i + trim - preset.I), off: false };
            // The one decision, on the best measurement there is: the trimmed chain when it lands closer to target than the trial and no wider than the
            // source, else the untrimmed one; applied when that lands within LOUDNORM_TOLERANCE_LU and no wider, else the track keeps its loudness, unstamped,
            // so a container that keeps no stamp declines it again next pass instead of spending another lossy generation on it. A trim check that fails
            // to run leaves the untrimmed chain to decide - the trial already measured it - with a line saying so; a file is never failed over it.
            const best = c && c.miss < t.miss && !c.wider ? { filter: trimmed, r: c } : { filter: chain(), r: t };
            if (checked?.error) {
                skipDone += `☒${streamTag(streamIndex)}[method_loudnorm=${methodLoudnorm}] The level trim after the loudness correction is left out - `
                    + `measuring it failed (${checked.error})\n`;
            }
            if (best.r.off || best.r.wider) {
                const why = !Number.isFinite(t.i) ? 'reads no finite loudness' : [Number.isFinite(t.lra)
                    ? (t.wider ? `widens its loudness range from ${srcLra.toFixed(1)} to ${t.lra.toFixed(1)} LU` : '') : 'reads no finite loudness range',
                t.off ? `lands at ${t.i.toFixed(2)} LUFS against the ${preset.I} LUFS target` : ''].filter(Boolean).join(' and ');
                const after = c && checked ? `, and ${c.wider ? `widens its loudness range to ${c.lra.toFixed(1)} LU` : `at ${c.i.toFixed(2)} LUFS`} `
                    + `trimmed by ${trim > 0 ? '+' : ''}${trim.toFixed(2)} dB` : '';
                // A verdict resting on a trim check that failed to run is not recorded: the next pass weighs it afresh, when the check may run.
                const recorded = recordDecline && !checked?.error;
                skipDone += `☒${streamTag(streamIndex)}[method_loudnorm=${methodLoudnorm}] Not correcting the loudness - a trial of the correction ${why}`
                    + `${after}; its loudness is left as is${recorded ? `, and ${LOUDNORM_TAG} records that verdict - future runs skip re-measuring while `
                        + `loudnorm stays "${methodLoudnorm}"` : ''}\n`;
                return { filter: preFilter, changed: false, measured: false, declined: true, recorded };
            }
            // What is written still differs from target by the limiter's own cost (0.17-0.24 LU on synthetic edge and dense tracks, at most 0.02 on real
            // film) and encoder drift: on the film track above, native aac wrote 0.11 LU louder and 0.5 LU wider than its trial at 256k (0.45 / 1.4 at
            // 128k) and aac_at 0.29 quieter; ac3 stayed within 0.1 LU of its trial on five real tracks and 0.34 on a 16 s clip, eac3 and libopus within
            // 0.05. The worst written result measured was 0.54 LU off (native aac 128k).
            return { filter: best.filter, changed: true, measured: true };
        };

        // Caching tag, stamped wherever this run measured the track: the leftovers loop below AND every re-encode a correction rode along on (downmix,
        // codec_force, remix) - the ride-along sites measure and correct in the same command, so their output is at target just as surely, and skipping
        // their stamp would cost a whole extra queue pass (re-measure, find within tolerance, remux the file to write nothing but this tag). Trusting the
        // correction is measured-sound: a linear correction lands on target; a dynamic one is applied only when its trial, or the trim after it, lands within
        // LOUDNORM_TOLERANCE_LU and no wider than its source (buildLoudnormFilter, which gives what is written its measured residual); and
        // across nine source/preset/downmix combinations (incl. +37.7 dB and -7.5 dB corrections) the two-pass output landed at most 0.240 LU from target.
        // Matroska uppercases custom tag names on write, so read-back goes through getTagCI.
        const LOUDNORM_TAG = 'awk_loudnorm';   // named once: a read and a write that drift apart re-measure every track on every pass
        const readLoudnormTag = (stream) => getTagCI(stream.tags || {}, LOUDNORM_TAG).trim();
        // A stamp's codec field: the codec family ffprobe reads, cut down to the grammar's own characters (production has acelp.kelvin).
        const stampCodec = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'unknown';
        // The stamp grammar; the version is forensic and is never compared:
        //   <preset>[-<version>]                     legacy: always trusted
        //   <preset>-<version>-e.<codec>.<ch>        an encode this plugin made: codec family and the channels the encoder WRITES
        //   <preset>-<version>-c.<codec>.<ch>.<dig>  a track measured and left as it was (on target, or its correction declined); dig = audioDigest, or
        //                                            x when none was read
        const LOUDNORM_STAMP_RE = /^([a-z_]+)(?:-[0-9][0-9.]*(?:-e\.([a-z0-9_]+)\.(\d+)|-c\.([a-z0-9_]+)\.(\d+)\.([0-9a-f]{8}|x))?)?$/;
        // The current preset's stamp on a stream as { kind: 'e' | 'c' | '' (legacy), codec, channels, dig }, or null: no stamp, another preset's, or a value
        // the grammar does not read - each measured like an unstamped track, with no line.
        const loudnormStampOf = (stream) => {
            const m = LOUDNORM_STAMP_RE.exec(readLoudnormTag(stream));
            if (!m || m[1] !== methodLoudnorm) return null;
            if (m[2]) return { kind: 'e', codec: m[2], channels: Number(m[3]), dig: '' };
            if (m[4]) return { kind: 'c', codec: m[4], channels: Number(m[5]), dig: m[6] };
            return { kind: '', codec: '', channels: 0, dig: '' };
        };

        // audioDigest(absIndex): a fingerprint of a track's opening audio, written by the copy stamp and compared by loudnormStampHolds - the first 8 hex of
        // the sha1 of its first packets' MD5s, '' for a track with no packets, null on a failed read. One spawn per track (a multi-track read gave no
        // consistent speed-up), memoised per run; measured 0.04-0.35 s on local disk, 2.06 s for a track starting at 100 s, 0.05-0.25 s a track cold over SMB.
        const AUDIO_DIGEST_PACKETS = 300;
        // Digital silence makes Lavc AAC and libopus frames bit-identical, so a +9.4 LU gain, a loudnorm and a bitrate change all kept the 300-packet digest
        // of a track that opens on silence: an opening with fewer distinct packets than this is read again, over the wider window.
        const AUDIO_DIGEST_MIN_DISTINCT = 32;
        const AUDIO_DIGEST_WIDE_PACKETS = 3000;
        // Per read, and per run: once the run has spent its budget, every further read is a failed one.
        const AUDIO_DIGEST_TIMEOUT_MS = 20000;
        const AUDIO_DIGEST_BUDGET_MS = 60000;
        let audioDigestMs = 0;
        // The packet MD5s of a track's first `packets` packets, or null: field 5 of `-f framemd5 -format_version 1`. At that version neither 7.1.4 nor 9.0.2
        // prints side data; the default version 2 appends it after the hash (of the codecs measured: 9.0.2 on the first line of an ac3, eac3, aac, opus or mp3
        // track, both builds on the last line of an opus or mp3 track), so field 5 is read, never the last field. A synthetic node (__awkCap) answers from
        // __awkCap.audioDigest[<absolute stream index>] - raw framemd5 text, a missing key being a failed read - and never spawns; the slice stands in for
        // -frames:a, so the widening runs on it too. SIGKILL because ffmpeg ignores a SIGTERM once it is running.
        const audioPacketHashes = (absIndex, packets) => {
            const cap = otherArguments && otherArguments.__awkCap;
            let text = null;
            if (cap) {
                const v = (cap.audioDigest || {})[absIndex];
                text = typeof v === 'string' ? v : null;
            } else if (audioDigestMs < AUDIO_DIGEST_BUDGET_MS) {
                const t0 = Date.now();
                try {
                    const r = spawnSync(ffmpegPathOf(otherArguments), ['-v', 'error', '-nostdin', '-i', file.file, '-map', `0:${absIndex}`, '-c', 'copy',
                        '-frames:a', String(packets), '-f', 'framemd5', '-format_version', '1', '-'],
                    { encoding: 'utf8', timeout: AUDIO_DIGEST_TIMEOUT_MS, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' });
                    if (r && !r.error && r.status === 0) text = String(r.stdout || '');
                } catch (e) { /* a failed read */ }
                audioDigestMs += Date.now() - t0;
            }
            if (text === null) return null;
            const hashes = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).slice(0, packets).map((l) => (l.split(',')[5] || '').trim());
            return hashes.every((h) => /^[0-9a-f]{32}$/.test(h)) ? hashes : null;
        };
        const audioDigestMemo = new Map();
        const audioDigest = (absIndex) => {
            if (!audioDigestMemo.has(absIndex)) {
                let hashes = audioPacketHashes(absIndex, AUDIO_DIGEST_PACKETS);
                if (hashes && new Set(hashes).size < AUDIO_DIGEST_MIN_DISTINCT) hashes = audioPacketHashes(absIndex, AUDIO_DIGEST_WIDE_PACKETS);
                audioDigestMemo.set(absIndex, hashes === null ? null
                    : (hashes.length ? require('crypto').createHash('sha1').update(hashes.join('\n')).digest('hex').slice(0, 8) : ''));
            }
            return audioDigestMemo.get(absIndex);
        };

        // The stamps on the library original's audio (otherArguments.originalLibraryFile; none when it is unreadable). A stamp the original carries came from
        // an earlier job, and another tool may have changed the track since; one it does not carry was written earlier in this job and is trusted unread.
        const loudnormOrigStreams = otherArguments?.originalLibraryFile?.ffProbeData?.streams;
        const loudnormOrigStamps = new Set((Array.isArray(loudnormOrigStreams) ? loudnormOrigStreams : [])
            .filter((s) => codecTypeOf(s) === 'audio').map(readLoudnormTag).filter(Boolean));
        // Whether the current preset's stamp still holds. A legacy stamp always holds. An inherited one fails when the track's codec family or channel count
        // is not what it recorded, or, for a copy stamp, when the opening audio's digest differs; a failed read trusts it, because a wrong trust skips one
        // correction while a wrong doubt costs a full analysis (167.8 s for a 95-minute track) on every pass of a node whose read fails. Judged once per
        // stream, so the collect and main loops of the leftovers agree and the line prints once.
        const loudnormVerdicts = new Map();
        const loudnormStampHolds = (stream, st) => {
            if (st.kind === '') return true;
            if (!loudnormVerdicts.has(stream.index)) {
                let why = '';
                if (loudnormOrigStamps.has(readLoudnormTag(stream))) {
                    const codec = stampCodec(codecFamilyOf(stream));
                    if (st.codec !== codec || st.channels !== stream.awkChannels) {
                        why = `was stamped on ${st.codec} ${st.channels}ch, but this track is ${codec} ${stream.awkChannels}ch`;
                    } else if (/^[0-9a-f]{8}$/.test(st.dig)) {
                        const dig = audioDigest(stream.index);
                        if (dig !== null && dig !== st.dig)
                            why = `was stamped on this ${codec} ${stream.awkChannels}ch track, but its opening audio no longer matches`;
                    }
                }
                if (why) {
                    workDone += `☒${streamTag(stream.index)}[method_loudnorm=${methodLoudnorm}] ${LOUDNORM_TAG} ${why} - another tool changed the track `
                        + 'after the stamp, so the stamp is not trusted\n';
                }
                loudnormVerdicts.set(stream.index, !why);
            }
            return loudnormVerdicts.get(stream.index);
        };

        // Only Matroska persists arbitrary per-stream tags through a -c copy remux; the mov/mp4/m4a muxers silently DROP a custom awk_loudnorm tag.
        // On those containers the cache stamp would vanish and be re-applied every reprocess - and for an already-within-tolerance track that stamp
        // is the ONLY change, so it would remux the file on every single pass forever (a non-idempotent loop). So the stamp is emitted only when it
        // will actually survive; on other containers a within-tolerance track is left a true no-op (re-measured on the next stack cycle, but never
        // remuxed). A track that genuinely needs correction re-encodes once regardless of container, then measures within tolerance next run (the trial and
        // the trim, buildLoudnormFilter). There a correction the trial declined is declined again each pass, at the cost of two analyses and no encode.
        // DECLINED: a GLOBAL awk_loudnorm marker, which the mov muxer does keep. It would force -movflags use_metadata_tags on every such file for good
        // (mp4TagPlan), turning its native iTunes tags into mdta keys that taggers and Apple players cannot read and costing its covr cover art - a worse
        // trade than one analysis per eligible track per stack cycle.
        const loudnormTagPersists = isMatroskaFamily(dstContainer);
        // The stamp write, on the one container that keeps it; `ident` is the kind's tail of LOUDNORM_STAMP_RE.
        const loudnormStampArg = (idx, ident) => (loudnormTagPersists
            ? ` -metadata:s:a:${idx} "${LOUDNORM_TAG}=${methodLoudnorm}-${details().Version}-${ident}"` : '');
        // An encode's stamp: the codec family ffprobe will read back (every aac encoder's output is aac, libopus's opus) and the channels the encoder writes -
        // the record's, never the source's.
        const loudnormEncodeStamp = (idx, record) => loudnormStampArg(idx, `e.${stampCodec(aacFamily(record.codec))}.${record.channels}`);
        // A loudnorm correction that RIDES ALONG on a re-encode some other setting fired (a downmix, a codec_force, a remix) has no line of its own - it is
        // chained into that operation's own filter and command. These two render its share of that line so the eight ride-along sites can't drift: the tag
        // stacks onto whatever tag the operation already carries, so the user can see that the settings combined, and the stamp caches the measurement so the
        // next pass doesn't re-measure a track this one already normalized. Gated separately - `changed` is "a correction was applied" (nothing to announce
        // when the track was already at target), `measured` is "an analysis actually ran" (see buildLoudnormFilter's track cap).
        const loudnormRideTag = (changed) => (changed ? `[method_loudnorm=${methodLoudnorm}]` : '');
        // A measured ride-along stamps the encode from its `record`. With no measurement riding along, a track this run RE-ENCODES or DERIVES must not keep a
        // stamp its source carried: ffmpeg copies a mapped stream's tags to its output, so the new audio would claim a measurement nothing made of it, and a
        // later loudnorm run trusts the stamp and skips the track for good, saying nothing. Matroska only - it is the one container that keeps the per-stream
        // tag at all.
        const loudnormRideStamp = (idx, measured, src, record) => (measured ? loudnormEncodeStamp(idx, record)
            : (loudnormTagPersists && readLoudnormTag(src || {}) ? ` -metadata:s:a:${idx} "${LOUDNORM_TAG}="` : ''));
        // The copy stamp, for a track measured and left as it was: recording its codec family, channel count and opening-audio digest. The caller keeps the
        // loudnormTagPersists gate that decides whether it is written at all - the reasoning for it is at the main-path call site.
        const copyStampArg = (stream, idx) => loudnormStampArg(idx,
            `c.${stampCodec(codecFamilyOf(stream))}.${stream.awkChannels}.${audioDigest(stream.index) || 'x'}`);
        // The within-tolerance no-op: no re-encode is needed, but the measurement is still worth caching.
        const stampWithinTolerance = (stream, idx) => {
            workDone += `☐${streamTag(stream.index)}[method_loudnorm=${methodLoudnorm}] Stamping ${LOUDNORM_TAG}=${methodLoudnorm} (already within tolerance)`
                + ` - future runs skip re-measuring while loudnorm stays "${methodLoudnorm}"\n`;
            extraArguments += copyStampArg(stream, idx);
        };
        // ====== END LOUDNORM ======

        // ====== ENCODE ARG BUILDERS ======
        // A re-encoded or derived stream's copied statistics, cleared on Matroska, the one container whose remux keeps them (staleStatsArgs).
        const clearStatsArgs = (idx, src) => {
            if (!isMatroskaFamily(dstContainer)) return '';
            const args = staleStatsArgs(`a:${idx}`, src);
            if (args) statsCleared.push(src);
            return args;
        };
        // Case-preserving language read for the metadata WRITES on transcoded/appended streams. resolveLang lowercases (correct for its matching KEYS), but
        // writing that would degrade clean_and_remux's canonical BCP-47 region/script case (pt-BR -> pt-br) and trip a later re-repair remux, so the writes
        // read the stored tag verbatim (ffprobe tag, then mediaInfo through mediaInfoText, as resolveLang reads it), preserving case; '' writes none
        // (langMetaArg), so langWritten records none. audio_clean never NORMALISES a language tag - that is clean_and_remux's job.
        const langForWrite = (s) => (s.tags?.language || '').trim() || mediaInfoText(mediaInfoFor(s)?.Language).trim();
        const channelsOfLabel = (label) => ({ stereo: 2, mono: 1 })[label.toLowerCase()] ?? label.split('.').reduce((n, d) => n + Number(d), 0);
        // Title for a new or replaced track, in the canonical form clean_and_remux's tag_title converges on - so a later pass finds nothing to rewrite. Base
        // first, roles LAST: "5.1 - Commentary" downmixed reads "5.1 -> 2.0 - Commentary"; untitled becomes the bare target label; a rich custom title keeps
        // its arrow-appended form ("Dolby TrueHD 7.1 -> 2.0"). The raw arrow title is assembled first (unchanged if it already ends in the target label, so no
        // "... 2.0 -> 2.0"), then canonicalAudioTitle applies the shared ownership/role rules - titleTagsFor and channelLabel are shared too, so both plugins
        // always agree. A handler-only channel label naming another channel count is a tool's mixdown default (HandBrake names a 5.1 track "Stereo" unless told
        // otherwise) and says nothing true about the source, so it is no base: the new track is titled as an untitled source's would be ("Stereo", not
        // "Stereo -> 2.0"). A label that fits the source ("5.1" on a 5.1, which tag_title also puts in the handler) stays the base: "5.1 -> 2.0".
        const buildTitle = (srcStream, targetLabel) => {
            // Beside a 'TITLE-<lang>', which the matroska remux keeps, the Name alone: the one name would weld the tag's text into it, the tag kept beside
            // (measured: 'English / Director Commentary -> 2.0' beside the tag 'Director Commentary').
            const named = titleTagKey(srcStream) && !titleTagInNamePlace(srcStream) ? (nameTextOf(srcStream.tags?.title) || mediaTitleFor(srcStream))
                : mediaTitleFor(srcStream);
            const base = stripDispositionWords(named);
            const mixdownDefault = !titleBesideHandler(srcStream) && bareChannelRegex.test(base) && channelsOfLabel(base) !== resolveChannels(srcStream);
            const origTitle = mixdownDefault ? '' : named;
            const escapedLabel = targetLabel.replace(/\./g, '\\.');
            const raw = !origTitle ? targetLabel
                : new RegExp(`(?:^|[^0-9.])${escapedLabel}$`).test(origTitle) ? origTitle
                : `${origTitle} -> ${targetLabel}`;
            const m = targetLabel.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
            const bareLabel = channelLabel(m ? (+m[1] + +m[2] + (+m[3] || 0)) : 0, false);
            return canonicalAudioTitle(cleanStreamTitle(raw), bareLabel, titleTagsFor(srcStream));
        };

        // On a mov output the QuickTime muxer silently drops any language spelling outside its legacy Mac table (deu/nld/de all read back with NO
        // language), so it goes through movLangCode - MOV_LANG in the shared 'mov language table' section has the why. mkv/mp4 keep the resolved
        // value verbatim (audio_clean never normalises a language tag - that is clean_and_remux's job), so escMeta is the only transform there.
        const langWritten = new Map();   // output audio index -> the language langMetaArg writes there, the one the next pass reads (buildOutputSummary)
        const langMetaArg = (idx, lang) => {
            if (!lang) return '';
            const v = dstContainer === 'mov' ? movLangCode(lang) : lang;
            langWritten.set(idx, v);
            return ` -metadata:s:a:${idx} "language=${escMeta(v)}"`;
        };

        // Stereo (2ch) encode tokens for the configured codecStereo, folding the aac_vbr (per-node VBR via aacVbrArgsIdx) vs
        // fixed-bitrate branch otherwise duplicated at every 2ch downmix/remix emit site. Returns the -c:a fragment (encoder
        // + bitrate/quality args), the codec name + rate string + label for the log line, and the output-summary record;
        // each caller keeps its own -map prefix, log verb/suffix and outputAudioOverride/appendedAudio target inline.
        const stereoEnc = (idx) => {
            if (codecStereo === 'aac_vbr') {
                const { encoder, args, approxRate, label } = aacVbrArgsIdx(idx);
                return { frag: `${encoder}${args}`, logCodec: 'aac', rate: approxRate, label, record: { codec: 'aac', channels: 2, bps: 0, approxRate } };
            }
            const bps = resolveBitrate(codecStereo, 2);
            return {
                frag: `${audioEncoder(codecStereo)}${encoderArgsBps(codecStereo, idx, bps)}`, logCodec: codecStereo, rate: kbpsToken(bps), label: '',
                record: { codec: codecStereo, channels: 2, bps },
            };
        };

        // The 5.1 twin of stereoEnc, for codecSurround (always a fixed rate): the -c:a fragment, the log rate and the output-summary record.
        const sixEnc = (idx) => {
            const bps = resolveBitrate(codecSurround, 6);
            return { frag: `${audioEncoder(codecSurround)}${encoderArgsBps(codecSurround, idx, bps)}`, rate: kbpsToken(bps),
                record: { codec: codecSurround, channels: 6, bps } };
        };

        // Lo/Ro stereo downmix matrices, keyed by EXACT layout, never channel count: several standard layouts share a count but order their channels
        // differently (6ch can be 5.1, 5.1(side), 6.0, 6.0(front), hexagonal), and a count-based matrix would silently mis-route - dropping the wrong channel
        // as "LFE", panning a back-center where a surround belongs - audio that sounds wrong with no error. The matrix is built from speaker roles (gains +
        // rationale at SPEAKER_GAINS below); a layout without a verified channel list returns null and the caller takes the plain aformat stereo fold
        // (foldFilter - the matrix -ac 2 uses). Channel lists verified against ffmpeg-utils "Channel Layout" docs; array position is the pan filter's cN index.
        const CANON_LAYOUTS = {
            '3.1':            ['FL', 'FR', 'FC', 'LFE'],
            '4.0':            ['FL', 'FR', 'FC', 'BC'],
            'quad':           ['FL', 'FR', 'BL', 'BR'],
            'quad(side)':     ['FL', 'FR', 'SL', 'SR'],
            '5.0':            ['FL', 'FR', 'FC', 'BL', 'BR'],
            '5.0(side)':      ['FL', 'FR', 'FC', 'SL', 'SR'],
            '5.1':            ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
            '5.1(side)':      ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
            '6.1':            ['FL', 'FR', 'FC', 'LFE', 'BC', 'SL', 'SR'],
            '6.1(back)':      ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'BC'],
            '6.1(front)':     ['FL', 'FR', 'LFE', 'FLC', 'FRC', 'SL', 'SR'],
            '7.1':            ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'],
            '7.1(wide)':      ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'FLC', 'FRC'],
            '7.1(wide-side)': ['FL', 'FR', 'FC', 'LFE', 'FLC', 'FRC', 'SL', 'SR'],
            '3.1.2':          ['FL', 'FR', 'FC', 'LFE', 'TFL', 'TFR'],
            '5.1.2':          ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'TFL', 'TFR'],
            'cube':           ['FL', 'FR', 'BL', 'BR', 'TFL', 'TFR', 'TBL', 'TBR'],
            '7.1.2':          ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR', 'TFL', 'TFR'],
            '5.1.4':          ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'TFL', 'TFR', 'TBL', 'TBR'],
            '7.1.4':          ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR', 'TFL', 'TFR', 'TBL', 'TBR'],
            '7.2.3':          ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR', 'TFL', 'TFR', 'TBC', 'LFE2'],
            '9.1.4':          ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'FLC', 'FRC', 'SL', 'SR', 'TFL', 'TFR', 'TBL', 'TBR'],
        };

        // Per-speaker contribution to the L and R downmix outputs - the standard Lo/Ro gains, matching what Blu-ray players, AV receivers and streaming
        // services do. FL/FR pass at full scale (peak 1.0); FC folds in at -3 dB (0.707) into both sides so dialogue stays clear; back/side/wide and the
        // height speakers fold at -3 dB into their own side; any other centred channel (BC, TBC) splits equally to both; an LFE contributes nothing (dropping
        // it avoids mud). These gains do NOT keep a hot mix under full scale - a fold sums several channels - which is what FOLD_LIMITER is for.
        const SPEAKER_GAINS = {
            FL:  { L: 1.0,   R: 0     },
            FR:  { L: 0,     R: 1.0   },
            FC:  { L: 0.707, R: 0.707 },
            LFE: { L: 0,     R: 0     },
            BL:  { L: 0.707, R: 0     },
            BR:  { L: 0,     R: 0.707 },
            SL:  { L: 0.707, R: 0     },
            SR:  { L: 0,     R: 0.707 },
            FLC: { L: 0.707, R: 0     },
            FRC: { L: 0,     R: 0.707 },
            BC:  { L: 0.5,   R: 0.5   },
            TFL: { L: 0.707, R: 0     },
            TFR: { L: 0,     R: 0.707 },
            TBL: { L: 0.707, R: 0     },
            TBR: { L: 0,     R: 0.707 },
            TBC: { L: 0.5,   R: 0.5   },
            LFE2: { L: 0,    R: 0     },
        };

        // Build a Lo/Ro pan=stereo matrix string for a known canonical layout, or null if the layout contributes no surround/center content (pure FL/FR or
        // FL/FR/LFE) where the plain fold is already correct. Gains per SPEAKER_GAINS; a global sum-normalization is deliberately NOT used - it produces output
        // 6-8 dB quieter than the source on typical content.
        const buildPanMatrix = (channelList) => {
            const termsL = [];
            const termsR = [];
            let hasFL = false;
            let hasFR = false;
            let hasNonFront = false; // any channel beyond FL/FR/LFE that needs explicit panning

            channelList.forEach((spk) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return; // unknown speaker name — skip (shouldn't happen for canonical layouts)
                if (spk !== 'FL' && spk !== 'FR' && spk !== 'LFE') hasNonFront = true;
                if (spk === 'FL') hasFL = true;
                if (spk === 'FR') hasFR = true;
            });

            // Defensive: every canonical layout carries a centre or surround channel, so this never fires today - it keeps the matrix safe if a pure
            // FL/FR(/LFE) layout is ever added to CANON_LAYOUTS, where the plain fold is the right answer anyway.
            if (!hasNonFront) return null;
            // Defensive likewise: a layout missing a front channel has no full-scale side for the matrix to fold onto, so it takes the plain fold. Every
            // canonical layout leads with FL,FR, so this only guards a future non-FL/FR-leading addition to CANON_LAYOUTS.
            if (!hasFL || !hasFR) return null;

            channelList.forEach((spk, i) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return;
                // Coefficients as authored, floored to 3 decimals (truncate, not round) for deterministic output.
                if (g.L > 0) termsL.push(`${(Math.floor(g.L * 1000) / 1000).toFixed(3)}*c${i}`);
                if (g.R > 0) termsR.push(`${(Math.floor(g.R * 1000) / 1000).toFixed(3)}*c${i}`);
            });

            return `pan=stereo|FL=${termsL.join('+')}|FR=${termsR.join('+')}`;
        };

        // Resolve a source stream to its canonical layout key, then to a verified pan matrix (or null). We normalize the ffmpeg channel_layout string
        // (lowercased, trimmed), read raw for the reason opusLayoutFor gives: CANON_LAYOUTS is keyed on libavutil's spellings. If the file reports no
        // layout or an unrecognized one, we return null so the caller takes the plain aformat stereo fold (foldFilter).
        const downmixMatrix = (srcStream) => {
            const layoutFull = (srcStream?.channel_layout || '').toLowerCase().trim();
            if (!layoutFull) return null;
            // ffmpeg layout names are already lowercase-stable (e.g. "5.1(side)"); match directly.
            const channelList = CANON_LAYOUTS[layoutFull];
            if (!channelList) return null;
            // Sanity: the reported channel count should match the canonical list length; if a file lies about
            // its layout vs channel count, fall back to the safe path rather than emit a mismatched matrix.
            if (Number(srcStream?.channels) !== channelList.length) return null;
            return buildPanMatrix(channelList);
        };

        // Every fold sums channels, and on a hot mix that lands above full scale. Measured on jellyfin-ffmpeg 7.1.4 with three hot corpus samples (eac3
        // 5.1.2, DTS-HD 7.1, DTS:X 7.1.4): a stereo fold peaked +2.30/+4.37/+2.85 dBFS, -ac 2 exactly as hot as the dialogue pan, because swresample
        // normalises its matrix only for INTEGER output and every stereo encoder here takes float; the dialogue pan on a 24-bit (s32p) source ran in the
        // integer domain and hard-clipped at 0.00 dBFS instead; and -ac 6 from 7.1 peaked +1.83 dBFS. So every fold runs in float and ends in this limiter:
        // a -2 dBFS ceiling, level=0 (its auto-level would otherwise lift the whole track to that ceiling) and latency=1 (compensates the 5 ms lookahead so
        // A/V sync holds). -2 rather than -1 because of the lossy encoder after it: at -1 dBFS libopus at 192k still decoded +0.66 dBFS on the eac3 mix
        // (54 samples over), while at -2 aac, eac3 and opus all decoded under full scale on all three. The cost is integrated loudness on a peaky mix: 0.0 /
        // 0.9 / 0.9 LU on the three (-1 dBFS cost 0.0 / 0.5 / 0.7). A global sum-normalisation would also stop the clipping, at 6-8 dB of lost level.
        const FOLD_LIMITER = 'alimiter=limit=0.794:level=0:latency=1';
        // swresample's fold has no rule for the top-back speakers (TBL, TBR, TBC) or a second LFE: measured on jellyfin-ffmpeg 7.1.4 with one tone per
        // speaker, its stereo and 5.1 folds of cube, 5.1.4, 7.1.4, 9.1.4 and 7.2.3 drop them silently, while every other standard layout of up to 14
        // channels folds in full. So ahead of that fold a pan sends each into its own side's back speaker (or surround, when there is no back pair) at
        // -3 dB, a top-back centre into both at -6 dB and LFE2 into the LFE, leaving a layout swresample folds in full (measured: every tone kept, to
        // stereo and to 5.1, on all five). The 16- and 24-channel broadcast layouts (hexadecagonal, 22.2) lose more speakers still and are left as they are.
        const TOP_BACK_INTO = { TBL: [['BL', 'SL'], 0.707], TBR: [['BR', 'SR'], 0.707], TBC: [['BL', 'SL'], 0.5, ['BR', 'SR']], LFE2: [['LFE'], 1] };
        const topBackPrefold = (src) => {
            const list = CANON_LAYOUTS[layoutKeyOf(src)];
            if (!list || Number(src?.channels) !== list.length || !list.some((c) => c in TOP_BACK_INTO)) return '';
            const keep = list.filter((c) => !(c in TOP_BACK_INTO));
            const terms = Object.fromEntries(keep.map((c) => [c, [`c${list.indexOf(c)}`]]));
            for (const c of list.filter((x) => x in TOP_BACK_INTO)) {
                const [first, gain, second] = TOP_BACK_INTO[c];
                for (const opts of second ? [first, second] : [first]) {
                    const to = opts.find((t) => keep.includes(t));
                    if (!to) return '';
                    terms[to].push(`${gain.toFixed(3)}*c${list.indexOf(c)}`);
                }
            }
            return `pan=${keep.join('+')}|${keep.map((c) => `${c}=${terms[c].join('+')}`).join('|')}`;
        };
        // A named PCE source is relabelled ahead of the fold (pceRelabel).
        const foldFilter = (src, layout, matrix) => {
            if (matrix) return pceRelabel(src, `aformat=sample_fmts=fltp,${matrix},${FOLD_LIMITER}`);
            const prefold = topBackPrefold(src);
            const pre = prefold ? `,${prefold},aformat=sample_fmts=fltp` : '';
            return pceRelabel(src, `aformat=sample_fmts=fltp${pre}:channel_layouts=${layout},${FOLD_LIMITER}`);
        };

        // Channel/filter snippet for a new or replaced stereo track. No guard check here: every call site either already passed guardBlocks or is a
        // brand-new appended derivative (an unconditional lossy re-encode by construction), so loudnorm rides on whichever guarantee applies. The fold is
        // always an explicit filter (foldFilter - aformat=channel_layouts=stereo is the matrix -ac 2 uses) rather than a bare -ac: ffmpeg applies an implicit
        // -ac AFTER an explicit -filter:a, so neither the limiter nor loudnorm would see the folded signal. Returns { arg, measured, changed, declined }:
        // `measured` gates the awk_loudnorm stamp, `changed` the ride-along log tag, `declined` marks a correction its trial refused (buildLoudnormFilter).
        // Callers that don't run loudnorm read all three false.
        const stereoArg = (idx, srcStream) => {
            const fold = foldFilter(srcStream, 'stereo', (methodStereoDownmix === 'dialogue') ? downmixMatrix(srcStream) : null);
            if (methodLoudnorm === 'disabled') return { arg: ` -filter:a:${idx} "${fold}"`, measured: false, changed: false };
            const srcAudioIdx = inputAudioIdxMap.get(srcStream.index);
            const { filter, changed, measured, declined } = buildLoudnormFilter(srcStream.index, srcAudioIdx, fold, LOUDNORM_PRESETS[methodLoudnorm]);
            return { arg: ` -filter:a:${idx} "${filter}"`, measured, changed, declined };
        };

        // 6ch (5.1) channel/filter snippet for a new or replaced 5.1 track, mirroring stereoArg for the surround case: the explicit 5.1 fold (foldFilter -
        // aformat=channel_layouts=5.1 is the matrix -ac 6 uses) ahead of the limiter and of loudnorm's analysis/correction, for the same -ac ordering trap
        // stereoArg documents. Shared by appendSix and the in-place downmix_to_six 'replace' branch so the two can't drift.
        const sixArg = (idx, srcStream) => {
            const fold = foldFilter(srcStream, '5.1', null);
            if (methodLoudnorm === 'disabled') return { arg: ` -filter:a:${idx} "${fold}"`, measured: false, changed: false };
            const { filter, changed, measured } = buildLoudnormFilter(srcStream.index, inputAudioIdxMap.get(srcStream.index), fold,
                LOUDNORM_PRESETS[methodLoudnorm]);
            return { arg: ` -filter:a:${idx} "${filter}"`, measured, changed };
        };

        // The in-place counterpart of stereoArg/sixArg for a force that keeps the channel count: same { arg, measured, changed } contract, with whatever
        // pre-filter the caller needs chained ahead of the analysis (an opus relabel, a named PCE's own (pceRelabel), or nothing). With loudnorm disabled
        // the pre-filter is still emitted alone - a lossless relabel is the caller's operation, not loudnorm's, and dropping it leaves the layout unfixed.
        const loudnormFilterArg = (idx, srcAudioIdx, streamIndex, preFilter = '') => {
            if (methodLoudnorm === 'disabled')
                return { arg: preFilter ? ` -filter:a:${idx} "${preFilter}"` : '', measured: false, changed: false };
            const { filter, changed, measured } = buildLoudnormFilter(streamIndex, srcAudioIdx, preFilter, LOUDNORM_PRESETS[methodLoudnorm]);
            return { arg: filter ? ` -filter:a:${idx} "${filter}"` : '', measured, changed };
        };

        // An APPENDED downmix track - a brand-new output stream derived from the ORIGINAL input audio via -map 0:a:N, whether or not that source stream
        // survives in the output. Every one is written through this: the -c:a/filter/title/-metadata emit, the appendedAudio record, the language's slot in
        // `createdSet`, and the newStreamOutputIdx/convert bookkeeping, so an appended 5.1 and an appended stereo cannot be written differently.
        const appendTrack = (srcStream, srcAudioIdx, title, enc, arg, createdSet, regionKeyVal) => {
            extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${enc.frag}${arg.arg}`
                + `${loudnormRideStamp(newStreamOutputIdx, arg.measured, srcStream, enc.record)}`
                + `${titleMetaArgs('a', newStreamOutputIdx, title, dstContainer)}`
                + clearStatsArgs(newStreamOutputIdx, srcStream);
            extraArguments += langMetaArg(newStreamOutputIdx, langForWrite(srcStream));
            appendedAudio.push({ srcStream, title, outIdx: newStreamOutputIdx, ...enc.record });
            newStreamOutputIdx++;
            createdSet.add(regionKeyVal);
            convert = true;
        };
        // appendSix and appendStereo build what differs - the title, encoder, fold and log line - for the downmix_to_six/_stereo 'add' branches AND the
        // layout-drop derivatives. srcCodecStr is the source's display codec at each site; logSuffix carries the layout-drop "(source dropped ...)" note. An
        // appended track is an unconditional lossy re-encode, so loudnorm always rides it (no guardBlocks - see the callers). appendStereo also serves a
        // guarded layout remix: `tag` then names the settings behind the add, and `measuredTwo` is the stereoArg that remix already ran to decide whether to
        // add at all.
        const appendSix = (srcStream, srcAudioIdx, srcCodecStr, srcRateStr, regionKeyVal, logSuffix) => {
            const newTitle = buildTitle(srcStream, '5.1');
            const enc = sixEnc(newStreamOutputIdx);
            const six = sixArg(newStreamOutputIdx, srcStream);
            workDone += `☐${streamTag(srcStream.index)}[downmix_to_six=${downmixToSix}]${loudnormRideTag(six.changed)} Adding ${codecSurround} 6ch @ `
                + `${enc.rate} from ${srcCodecStr} ${srcStream.channels}ch @ ${srcRateStr}${logSuffix}\n`;
            appendTrack(srcStream, srcAudioIdx, newTitle, enc, six, createdSixLangs, regionKeyVal);
        };
        const appendStereo = (srcStream, srcAudioIdx, srcCodecStr, srcRateStr, regionKeyVal, logSuffix, { tag, measuredTwo } = {}) => {
            const newTitle = buildTitle(srcStream, '2.0');
            const enc = stereoEnc(newStreamOutputIdx);
            const two = measuredTwo || stereoArg(newStreamOutputIdx, srcStream);
            workDone += `☐${streamTag(srcStream.index)}${tag || `[downmix_to_stereo=${downmixToStereo}]`}${loudnormRideTag(two.changed)} Adding `
                + `${enc.logCodec} stereo @ ${enc.rate}${enc.label ? ` (${enc.label})` : ''} from ${srcCodecStr} ${srcStream.channels}ch @ ${srcRateStr}`
                + `${logSuffix}\n`;
            appendTrack(srcStream, srcAudioIdx, newTitle, enc, two, createdStereoLangs, regionKeyVal);
        };

        // The commit every IN-PLACE re-encode makes: the -c:a:N fragment, the output index marked modified (so the leftovers loop never emits a second
        // -c:a:N for it - ffmpeg honours the last, and the earlier operation would silently vanish) and its predicted output recorded.
        const replaceInPlace = (idx, frag, record) => {
            // The source this output index re-encodes, found here rather than passed in, so every in-place caller clears its statistics.
            const src = file.ffProbeData.streams.find((s) => outputAudioIdxMap.get(s.index) === idx);
            extraArguments += ` -c:a:${idx} ${frag}${src ? clearStatsArgs(idx, src) : ''}`;
            modifiedAudioIdx.add(idx);
            outputAudioOverride.set(idx, record);
        };
        const titleWrittenSrc = new Set();   // sources this run titles itself (an in-place re-encode), which mp4NameCarryArgs leaves alone
        // The IN-PLACE twin of appendTrack: re-encode this track to a `label` ('2.0', '5.1') downmix of itself instead of adding one beside it, claiming the
        // language's slot in `createdSet` when one is given. Every in-place downmix goes through it - the stereo tier, downmix_to_six and downmix_to_stereo
        // 'replace', the codec_force opus remix and the loudnorm-leftovers remix - so none can write its title, language or stamp differently. Each caller
        // keeps its own workDone line and terminal flag: codec_force sets `forced`, which funnels into convert further down, so setting convert here would
        // change what that branch means.
        const replaceDownmix = (srcStream, idx, label, enc, arg, createdSet, registerKey) => {
            const title = buildTitle(srcStream, label);
            titleWrittenSrc.add(srcStream.index);
            replaceInPlace(idx, `${enc.frag}${arg.arg}${loudnormRideStamp(idx, arg.measured, srcStream, enc.record)}`
                + titleMetaArgs('a', idx, title, dstContainer), { ...enc.record, title });
            extraArguments += langMetaArg(idx, langForWrite(srcStream));
            if (createdSet) createdSet.add(registerKey);
        };
        // The stereo case. registerLang claims the language's stereo slot (createdStereoLangs): every caller passes it for a GENUINE track, none for a
        // secondary one - a commentary must never occupy the main-language slot, and an unclaimed slot costs the language's surround master at the post-loop
        // consumers (a guard_original track flattened to stereo beside the copy already made from its sibling).
        const replaceStereo = (srcStream, idx, enc, two, registerLang) =>
            replaceDownmix(srcStream, idx, '2.0', enc, two, registerLang ? createdStereoLangs : null, registerLang);
        // ====== END ENCODE ARG BUILDERS ======


        for (let i = 0; i < workStreams.length; i++) {
            const ffstream = workStreams[i];
            const ffstreamCodec = codecNameOf(ffstream) || 'unknown';
            const ffstreamChannels = ffstream.awkChannels;
            const outputAudioIdx = outputAudioIdxMap.get(ffstream.index);
            const srcAudioIdx = inputAudioIdxMap.get(ffstream.index);

            // Guard: if either index is missing the stream wasn't tracked correctly — skip rather than emitting a broken argument like -c:a:undefined
            // which ffmpeg will reject with a cryptic error.
            if (outputAudioIdx === undefined || srcAudioIdx === undefined) {
                // A should-never-happen internal-tracking defect (not routine diagnostic negative-space): a user-configured op on this
                // stream is silently skipped. Logged via workDone as a real problem.
                workDone += `☒${streamTag(ffstream.index)} Could not resolve audio index mapping, skipping\n`;
                continue;
            }

            const ffstreamRegionKey = ffstream.awkRegionKey;

            const srcBitrate = Number(ffstream.bit_rate || 0);
            const srcRateStr = srcRateToken(ffstream);

            // A secondary track (commentary, VI, M&E) and any track demoted to the stereo tier take the in-place stereo path, and never trigger the surround
            // downmix (downmix_to_six / downmix_to_stereo) - only a genuine tier-'surround' track reaches those.
            if (ffstream.awkSecondaryTrack || ffstream.awkTier !== 'surround') {
                // ====== STEREO TIER: DOWNMIX IN PLACE ======
                // Each such surround track is transcoded in place independently — one stereo per track, preserving every one DEDUPLICATE kept (with
                // method_deduplicate on, a fold that would duplicate a stereo of its language is removed there instead). ONLY tier 'stereo' converts: a
                // secondary track left at downmix_secondary=surround falls through untouched here (codec_force/method_loudnorm may still act on it further
                // down). guard_lossless/guard_quality/guard_object_audio never protect a secondary or a non-surround-tier track (guardBlocks short-circuits
                // false for them), so there is no guarded-source case here: the stereo tier always transcodes in place.
                const tierTag = tierTagOf(ffstream);
                const tierWanted = ffstream.awkTier === 'stereo' && !modifiedAudioIdx.has(outputAudioIdx);
                if (tierWanted && !(ffstreamChannels > 0)) {
                    skipDone += noChannelCountSkip(ffstream.index, tierTag, "can't tell whether it needs the stereo downmix");
                } else if (tierWanted && ffstreamChannels > 2 && containerRefusesAudio(codecStereo)) {
                    skipDone += `☒${streamTag(ffstream.index)}[${tierTag}][codec_stereo=${codecStereo}] Not downmixing to stereo - ${wallText(codecStereo)}; `
                        + `left as ${ffstreamCodec} ${ffstreamChannels}ch - ${wallRemedy('codec_stereo')}\n`;
                    walledOps += 1;
                } else if (tierWanted && ffstreamChannels > 2 && layoutUnplaceable(ffstream)) {
                    skipDone += unplaceableSkip(ffstream, tierTag, 'Not downmixing to stereo');
                } else if (tierWanted && stereoTierFolds(ffstream)) {
                    // Downmix changes channel count, so the source bitrate isn't a comparable floor - stereoEnc uses the 2ch target (aac_vbr: no low-info
                    // tier).
                    const enc = stereoEnc(outputAudioIdx);
                    const two = stereoArg(outputAudioIdx, ffstream);
                    workDone += `☐${streamTag(ffstream.index)}[${tierTag}]${loudnormRideTag(two.changed)} Transcoding ${ffstreamCodec} ${ffstreamChannels}ch `
                        + `@ ${srcRateStr} → ${enc.logCodec} stereo @ ${enc.rate} (${enc.label ? `${enc.label}, ` : ''}`
                        + `${ffstream.awkSecondaryTrack ? 'secondary' : 'stereo tier'})\n`;
                    replaceStereo(ffstream, outputAudioIdx, enc, two, ffstream.awkSecondaryTrack ? '' : ffstreamRegionKey);
                    convert = true;
                }
                // ====== END STEREO TIER: DOWNMIX IN PLACE ======

            } else {
                // ====== DOWNMIX TO 6 CHANNELS ======
                // One 6ch per language, from its best >6ch source. A guarded source (guardBlocks) is never replaced in place, so 'replace' becomes 'add'
                // for it.
                const sixWanted = downmixToSix !== 'disabled' && ffstreamChannels > 6 && !hasSixForLang(ffstreamRegionKey);
                if (sixWanted && containerRefusesAudio(codecSurround)) {
                    skipDone += `☒${streamTag(ffstream.index)}[downmix_to_six=${downmixToSix}][codec_surround=${codecSurround}] Not making a 5.1 - `
                        + `${wallText(codecSurround)}; ${wallRemedy('codec_surround')}\n`;
                    walledOps += 1;
                } else if (sixWanted && layoutUnplaceable(ffstream)) {
                    skipDone += unplaceableSkip(ffstream, `downmix_to_six=${downmixToSix}`, 'Not making a 5.1');
                } else if (sixWanted) {
                    const sixMode = (downmixToSix === 'replace' && guardBlocks(ffstream, codecSurround, 6, ffstreamChannels)) ? 'add' : downmixToSix;

                    if (sixMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                        const enc = sixEnc(outputAudioIdx);
                        // guardBlocks already passed for sixMode==='replace' (loudnorm rides on that guarantee - see stereoArg above); sixArg builds the
                        // 5.1 fold snippet (foldFilter).
                        const six = sixArg(outputAudioIdx, ffstream);
                        workDone += `☐${streamTag(ffstream.index)}[downmix_to_six=${downmixToSix}]${loudnormRideTag(six.changed)} Transcoding `
                            + `${ffstreamCodec} ${ffstreamChannels}ch @ ${srcRateStr} → ${codecSurround} 6ch @ ${enc.rate}\n`;
                        replaceDownmix(ffstream, outputAudioIdx, '5.1', enc, six, createdSixLangs, ffstreamRegionKey);
                        convert = true;
                    } else if (sixMode === 'add') {
                        appendSix(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamRegionKey,
                            downmixToSix === 'replace' ? ` (the source is kept - ${guardTriple()})` : '');
                    }
                }
                // ====== END DOWNMIX TO 6 CHANNELS ======


                // ====== DOWNMIX TO 2 CHANNELS ======
                // One stereo track per language, from its best >2ch source, only when the language has no primary stereo already. A guarded source
                // (guardBlocks): 'replace' becomes 'add'. When 'replace' is requested but downmix_to_six already consumed this same source in place (single
                // >6ch source, both downmixes enabled), the in-place slot is taken, so we fall back to ADDING a stereo from the original input. The user
                // enabled downmix_to_stereo expecting a 2.0 in the output, so a lone 7.1 with both downmixes on yields a 5.1 and a 2.0 rather than silently
                // dropping the stereo.
                const stereoWanted = downmixToStereo !== 'disabled' && ffstreamChannels > 2 && !hasStereoForLang(ffstreamRegionKey);
                if (stereoWanted && containerRefusesAudio(codecStereo)) {
                    skipDone += `☒${streamTag(ffstream.index)}[downmix_to_stereo=${downmixToStereo}][codec_stereo=${codecStereo}] Not making a stereo - `
                        + `${wallText(codecStereo)}; ${wallRemedy('codec_stereo')}\n`;
                    walledOps += 1;
                } else if (stereoWanted && layoutUnplaceable(ffstream)) {
                    skipDone += unplaceableSkip(ffstream, `downmix_to_stereo=${downmixToStereo}`, 'Not making a stereo');
                } else if (stereoWanted) {
                    const stereoMode = (downmixToStereo === 'replace' && guardBlocks(ffstream, codecStereo, 2, ffstreamChannels)) ? 'add' : downmixToStereo;

                    if (stereoMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                        // Downmix source is surround; its bitrate describes N channels not 2, so stereoEnc uses the 2ch target (as in the stereo tier above).
                        const enc = stereoEnc(outputAudioIdx);
                        const two = stereoArg(outputAudioIdx, ffstream);
                        workDone += `☐${streamTag(ffstream.index)}[downmix_to_stereo=${downmixToStereo}]${loudnormRideTag(two.changed)} Transcoding `
                            + `${ffstreamCodec} ${ffstreamChannels}ch @ ${srcRateStr} → ${enc.logCodec} stereo @ ${enc.rate}`
                            + `${enc.label ? ` (${enc.label})` : ''}\n`;
                        replaceStereo(ffstream, outputAudioIdx, enc, two, ffstreamRegionKey);
                        convert = true;
                    } else if (stereoMode === 'add' || (stereoMode === 'replace' && modifiedAudioIdx.has(outputAudioIdx))) {
                        const kept = stereoMode === 'replace' ? ' (downmix_to_six already replaced the source)'
                            : (downmixToStereo === 'replace' ? ` (the source is kept - ${guardTriple()})` : '');
                        appendStereo(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamRegionKey, kept);
                    }
                }

                // ====== END DOWNMIX TO 2 CHANNELS ======
            }

            // ====== FORCE CODEC ======
            // Skip a track guard_lossless/guard_quality/guard_object_audio protects — guardBlocks: a lossless source, or a quality-tier target that
            // scores lower. codec_force never overrides guard protection, in any mode including 'all', so a guarded track is left in its source codec.
            // Also skip when the source has more channels than the target codec supports (ac3/eac3 max 6ch, opus/aac max 8ch) to avoid an ffmpeg encode
            // failure. Channel count is resolved from ffprobe, then mediaInfo, then a channel-layout string (resolveChannels): a track no source can
            // measure is left untouched rather than guessed, since a wrong count could route it to a codec that can't hold its real channels and fail.
            const forceChannels = (codecForce !== 'disabled' && !modifiedAudioIdx.has(outputAudioIdx)) ? ffstreamChannels : -1;
            if (forceChannels === 0)
                skipDone += noChannelCountSkip(ffstream.index, `codec_force=${codecForce}`, NO_CHANNEL_COUNT_CODEC);
            if (forceChannels > 0) {
                const isStereo = forceChannels <= 2;
                const targetCodec = isStereo ? codecStereo : codecSurround;
                // aac_vbr is only valid for stereo; identity checks compare against the aac family, the stream side folded through codecFamilyOf (see
                // codecStereoFamily above). The logs below keep the RAW codec name so the track is still identifiable.
                const targetCodecFamily = aacFamily(targetCodec);

                // Family equality ends it here: a rate-control-only change (an aac track under codec_stereo=aac_vbr) is not worth a lossy
                // generation on its own. That is a judgement about SPENDING an encode, though, not about which codec is wanted - so when
                // loudnorm re-encodes the track anyway, the leftovers loop revisits the setting and does honour it. See the codec choice there.
                if (codecFamilyOf(ffstream) !== targetCodecFamily) {
                    const shouldForce = forceReaches(isStereo, forceChannels);

                    const targetMaxCh = codecMaxCh(targetCodec);
                    const folds = shouldForce && targetCodec === 'opus' && remixFoldsTrack(ffstream, forceChannels);

                    if (shouldForce && forceChannels > targetMaxCh) {
                        // The way past the ceiling is a 5.1 of the language, which downmix_to_six makes from a genuine surround track when none exists; a
                        // secondary or stereo-tier track has none, so its line ends at the limit.
                        const sixWay = (ffstream.awkSecondaryTrack || ffstream.awkTier !== 'surround') ? ''
                            : (hasSixForLang(ffstreamRegionKey) ? "; it is kept beside the language's 5.1"
                                : (downmixToSix === 'disabled' ? '; enable downmix_to_six to create a 5.1 from it first' : ''));
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${codecForce}] Not forcing ${targetCodecFamily} - ${ffstreamCodec} `
                            + `${forceChannels}ch @ ${srcRateStr} exceeds the ${targetMaxCh}ch limit for ${targetCodecFamily}${sixWay}\n`;
                    } else if (shouldForce && containerRefusesAudio(targetCodec)) {
                        const codecSetting = isStereo ? 'codec_stereo' : 'codec_surround';
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${codecForce}][${codecSetting}=${targetCodec}] Not forcing `
                            + `${targetCodecFamily} - ${wallText(targetCodec)}; left as ${ffstreamCodec} - ${wallRemedy(codecSetting)}\n`;
                        walledOps += 1;
                    } else if (shouldForce && (folds ? guardRefusesAnyEncode(ffstream)
                        : guardBlocks(ffstream, targetCodec, encodedChannels(targetCodec, ffstream, forceChannels), forceChannels))) {
                        // Guarded: forcing this codec would irreversibly lose detail the target can't hold - see the FORCE CODEC note above; an ac3/eac3
                        // target that writes fewer channels than the source (encodedChannels) is a channel drop. A track the remix folds faces guard_quality
                        // at the fold instead (remixFoldsTrack).
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${codecForce}] Not forcing ${targetCodecFamily} - would lose detail vs `
                            + `${codecDisplayName(ffstream)} ${forceChannels}ch @ ${srcRateStr} (${guardTriple()}); left as ${ffstreamCodec}\n`;
                    } else if (shouldForce && layoutUnplaceable(ffstream)) {
                        skipDone += unplaceableSkip(ffstream, `codec_force=${codecForce}`, `Not forcing ${targetCodecFamily}`);
                    } else if (shouldForce && layoutRefusal(targetCodec, ffstream)) {
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${codecForce}] Not forcing ${targetCodecFamily} - `
                            + `${layoutRefusal(targetCodec, ffstream)}; left as ${ffstreamCodec}\n`;
                    } else if (shouldForce) {
                        // Guard the force-to-opus path against libopus-incompatible layouts (method_layout_err). Only opus is affected (OPUS_OK_LAYOUTS);
                        // what another codec cannot take at its count was stood down above (layoutRefusal). `forced` gates the run's convert flag so a
                        // keep/defer makes no change (and doesn't cause a needless re-run).
                        const opusLayout = opusLayoutFor(ffstream, forceChannels);
                        const srcLayout = opusLayout.lay;
                        const opusBad = targetCodec === 'opus' && forceChannels > 2 && !opusLayout.ok;
                        const relabel = opusBad ? opusLayout.relabel : null;
                        const layoutName = srcLayout || `${forceChannels}ch`;
                        let forced = false;

                        if (opusBad && !relabel && !folds) {
                            // No lossless relabel exists (relabelable layouts fall through to the transcode branch below in every mode). keep; a remix that
                            // deferred to an existing stereo; or a drop the pre-pass couldn't apply - leave the source codec. Real drops already happened in
                            // the pre-pass (before the index map); a drop reaches here only when the pre-pass's drop floor kept it (see dropFloor /
                            // dropKeptWhy) or a downmix it expected to convert this track was pre-empted (per-language slot already filled). Report the actual
                            // reason, not a fixed one.
                            const standDown = remixStandDown(ffstream, relabel);
                            let why;
                            if (standDown) why = ` (${standDown})`;
                            else if (methodLayoutErr === 'drop') why = dropKeptWhy.has(ffstream.index) ? ` (kept - ${dropKeptWhy.get(ffstream.index)})`
                                : ' (kept - no downmix converted it to an opus-safe layout)';
                            else why = ', enable a downmix option or set method_layout_err to drop/remix';
                            skipDone += `☒${streamTag(ffstream.index)}[codec_force=${codecForce}] Not forcing opus - `
                                + `${opusLayoutWhy(srcLayout, forceChannels)}; left as ${ffstreamCodec}${why}\n`;
                        } else if (folds && guardBlocks(ffstream, codecStereo, 2, forceChannels)) {
                            // The remix drops channels, so it is judged against the stereo it emits, not the opus it can't: a track guard_quality protects
                            // keeps its channels and source codec, and the codec_stereo stereo is ADDED beside it - a downmix 'replace' becoming 'add'. The
                            // added stereo takes the language's stereo slot, so the next run's remix defers to it and the file settles.
                            appendStereo(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamRegionKey,
                                ` (${opusLayoutWhy(srcLayout, forceChannels)}; the source is kept as ${ffstreamCodec})`,
                                { tag: `[method_layout_err=${methodLayoutErr}][guard_quality=${guardQuality}]` });
                            forced = true;
                        } else if (folds) {
                            // remix→stereo: downmix in place to a codec_stereo track (NOT opus) so it stays stereo-codec-consistent and idempotent (a stereo
                            // opus would be re-forced to codec_stereo next run). Mirrors the in-place stereo tier; the 2ch table target (surround source
                            // bitrate isn't a comparable floor).
                            const enc = stereoEnc(outputAudioIdx);
                            const two = stereoArg(outputAudioIdx, ffstream);
                            workDone += `☐${streamTag(ffstream.index)}[method_layout_err=${methodLayoutErr}]${loudnormRideTag(two.changed)} Remixing `
                                + `${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} (${opusLayoutWhy(srcLayout, forceChannels)}) → ${enc.logCodec} stereo @ `
                                + `${enc.rate}${enc.label ? ` (${enc.label})` : ''}\n`;
                            replaceStereo(ffstream, outputAudioIdx, enc, two, ffstream.awkSecondaryTrack ? '' : ffstreamRegionKey);
                            forced = true;
                        } else if (targetCodec === 'aac_vbr') {
                            // aac_vbr stereo force: aacVbrArgsIdx picks this node's best VBR AAC encoder, at its leaner tier for a low-bitrate source.
                            // srcBitrate is meaningful here — this is a codec swap at the same channel count.
                            const { encoder, args, approxRate, label } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true, forceChannels);
                            // Same channel count, so the only pre-filter is a Lt/Rt track's rename to stereo (pceRelabel), without which aac_at writes it
                            // mono. guardBlocks for this force already passed above (loudnorm rides on that guarantee - see stereoArg).
                            const aacVbrLoud = loudnormFilterArg(outputAudioIdx, srcAudioIdx, ffstream.index, pceRelabel(ffstream));
                            const record = { codec: 'aac', channels: forceChannels, bps: 0, approxRate };
                            workDone += `☐${streamTag(ffstream.index)}[codec_force=${codecForce}]${loudnormRideTag(aacVbrLoud.changed)} Transcoding `
                                + `${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → aac ${forceChannels}ch @ ${approxRate} (${label})\n`;
                            replaceInPlace(outputAudioIdx, `${encoder}${args}${aacVbrLoud.arg}`
                                + `${loudnormRideStamp(outputAudioIdx, aacVbrLoud.measured, ffstream, record)}`, record);
                            forced = true;
                        } else {
                            // Same channel count, codec swap - optionally a LOSSLESS opus relabel (quad(side)→quad via channelmap, keeps all channels), else
                            // a named PCE's or a Lt/Rt track's own (pceRelabel), ahead of the re-matrix ac3/eac3 apply (ac3RematrixFilter). resolveBitrate
                            // caps the target at the source bitrate when the target codec scores >= the source (guard via awkQuality); lossless skips the cap;
                            // a high-bitrate lossy source is bounded by the codec ceiling.
                            const relabelFilter = relabel ? opusLayout.relabelFilter : pceRelabel(ffstream, ac3RematrixFilter(targetCodec, ffstream));
                            const note = relabel ? ` (relabel ${layoutName}→${relabel.layout})` : '';
                            // guardBlocks for this force already passed above (loudnorm rides on that guarantee - see stereoArg). The relabel and the
                            // re-matrix are the pre-filter here, so the measurement is of the signal that is actually encoded.
                            const forceLoud = loudnormFilterArg(outputAudioIdx, srcAudioIdx, ffstream.index, relabelFilter);
                            const dstBps = resolveBitrate(targetCodec, forceChannels, srcBitrate, ffstream.awkLossless, ffstream.awkQuality);
                            const dstBitArg = encoderArgsBps(targetCodec, outputAudioIdx, dstBps);
                            // The record holds the channels the encoder writes (encodedChannels), which the log, Expected results and the stamp all read;
                            // the rate stays the source count's, which for an ac3/eac3 fold is above the written count's ladder, never below it.
                            const record = { codec: targetCodec, channels: encodedChannels(targetCodec, ffstream, forceChannels), bps: dstBps };
                            const fold = ac3FoldNote(targetCodec, ffstream, record.channels, forceChannels);
                            workDone += `☐${streamTag(ffstream.index)}[codec_force=${codecForce}]${loudnormRideTag(forceLoud.changed)} Transcoding `
                                + `${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → ${targetCodec} ${record.channels}ch @ `
                                + `${kbpsToken(dstBps)}${note}${fold ? ` (${fold})` : ''}\n`;
                            replaceInPlace(outputAudioIdx, `${audioEncoder(targetCodec)}${dstBitArg}${forceLoud.arg}`
                                + `${loudnormRideStamp(outputAudioIdx, forceLoud.measured, ffstream, record)}`, record);
                            forced = true;
                        }
                        if (forced) convert = true;
                    }
                }
            }
            // ====== END FORCE CODEC ======
        }

        // ====== LAYOUT-DROP DOWNMIX DERIVATIVES ======
        // A source the layout-drop pre-pass removed (un-writable opus surround, method_layout_err=drop) may have been the sole source its language's downmix
        // would have derived from. The source is correctly gone, but the derivative the user configured must still be created - from the ORIGINAL input stream
        // via -map 0:a:N, appended like any downmix add. Only create it when the language didn't otherwise get one this run (created*Langs) or already have one
        // among survivors (existing*Langs), so a redundant dropped source produces nothing. Each derivative goes through appendSix/appendStereo, so its title,
        // codec, fold and loudnorm match the add branches; the new tracks are opus-safe (stereo -> codec_stereo; the 5.1 fold yields a 5.1 layout).
        for (const s of layoutDroppedDeriveSources) {
            const regionKey = s.awkRegionKey;
            const srcAudioIdx = inputAudioIdxMap.get(s.index);
            if (srcAudioIdx === undefined) continue;
            const srcRateStr = srcRateToken(s);
            const srcCodec = codecNameOf(s) || 'unknown';
            const dropped = ` (source dropped - ${opusLayoutWhy(opusLayoutFor(s, s.awkChannels).lay, s.awkChannels)})`;
            if (s.channels > 6 && downmixToSix !== 'disabled' && !hasSixForLang(regionKey)) {
                appendSix(s, srcAudioIdx, srcCodec, srcRateStr, regionKey, dropped);
            }
            if (downmixToStereo !== 'disabled' && !hasStereoForLang(regionKey)) {
                appendStereo(s, srcAudioIdx, srcCodec, srcRateStr, regionKey, dropped);
            }
        }
        // ====== END LAYOUT-DROP DOWNMIX DERIVATIVES ======

        // ====== LOUDNORM: untouched tracks ======
        // Tracks none of the downmix/force/remix sites above touched at all (the common case - already the right codec/channels, nothing else needed). Runs
        // over EVERY kept audio stream directly (not workStreams/candidateStreams, which exist for codec_force/the stereo tier's own narrower eligibility and
        // would silently exclude secondary/commentary tracks under default settings) - guard_lossless/guard_quality/guard_object_audio are the only scope gate.
        // A track ALSO being modified by one of the sites above rides on that same re-encode instead (each site's own stereoArg/sixArg/loudnormFilterArg calls
        // buildLoudnormFilter at its own emit point); this loop only handles the leftovers.
        if (methodLoudnorm !== 'disabled') {
            const preset = LOUDNORM_PRESETS[methodLoudnorm];
            // WHICH codec a leftover's re-encode lands on. Two candidates, in preference order: keepCodec - the codec the track already has, whenever this
            // plugin can encode it (what a track outside codec_force's scope gets - forceReaches false, e.g. codec_force=disabled - and the only option for
            // a source outside our encodable domain: a kept DTS core, an MP3); configuredCodec - codec_stereo/codec_surround, when codec_force's scope
            // covers this track (the FORCE CODEC block may have declined it as not worth a lossy generation on its own, but the generation is already
            // being spent on the gain correction - this is what makes codec_stereo=aac_vbr reach a track already aac). A guard-protected or over-channel-
            // limit target falls back to the other candidate rather than cancelling the pass, so enabling codec_force can never silently switch loudnorm
            // off. The opus layout wall counts as out of reach too: when libopus refuses the layout with no lossless relabel and no remix will run
            // (remixFoldsTrack: method_layout_err keep/drop, a track already opus, a remix standing down for an existing stereo, or codec_stereo walled by
            // the container), an opus target ends in "Not normalizing", so an encodable source codec takes the correction instead (OPUS_OK_LAYOUTS; an ac3/
            // eac3 one that writes fewer channels counts as a channel drop to guard_quality). A layout the target cannot take at its count (layoutRefusal)
            // puts that target out of reach the same way. An opus target the remix folds is judged as that fold: only
            // guardRefusesAnyEncode refuses it here, and guard_quality picks add or replace at the remix. null = neither is in reach.
            const leftoverTarget = (ffstream, channels) => {
                const isStereo = channels <= 2;
                const configuredCodec = isStereo ? codecStereo : codecSurround;
                // Folded like every other identity check (codecFamilyOf), so an aac_latm track keeps AAC.
                const srcFamily = codecFamilyOf(ffstream);
                // A codec this plugin can emit - a key of the bitrate ladder, read from it rather than restated so the two cannot disagree - can stay put.
                const keepCodec = Object.prototype.hasOwnProperty.call(CODEC_TARGET_BPS, srcFamily) ? srcFamily : configuredCodec;
                const folds = remixFoldsTrack(ffstream, channels);
                const reachable = (c) => channels <= codecMaxCh(aacFamily(c)) && !containerRefusesAudio(c)
                    && !(folds && aacFamily(c) === 'opus' ? guardRefusesAnyEncode(ffstream)
                        : guardBlocks(ffstream, c, encodedChannels(aacFamily(c), ffstream, channels), channels)) && !layoutRefusal(c, ffstream);
                const wantCodec = forceReaches(isStereo, channels) ? configuredCodec : keepCodec;
                let targetCodec = reachable(wantCodec) ? wantCodec : (reachable(keepCodec) ? keepCodec : null);
                const opusLayoutBlocked = (c) => {
                    if (aacFamily(c) !== 'opus' || channels <= 2 || opusInPlace(ffstream, c)) return false;
                    const { ok, relabel } = opusLayoutFor(ffstream, channels);
                    return !ok && !relabel && !folds;
                };
                // A decode no layout places stops every target but an opus re-encoded in place (layoutUnplaceable, opusInPlace), so a no-layout opus whose
                // configured target is another codec still takes its correction as opus.
                const unplaceableBlocked = (c) => layoutUnplaceable(ffstream) && !opusInPlace(ffstream, c);
                if (targetCodec !== null && targetCodec !== keepCodec && (opusLayoutBlocked(targetCodec) || unplaceableBlocked(targetCodec))
                    && reachable(keepCodec) && !opusLayoutBlocked(keepCodec) && !unplaceableBlocked(keepCodec)) {
                    targetCodec = keepCodec;
                }
                return { targetCodec, keepCodec, configuredCodec, isStereo, unplaceable: unplaceableBlocked(targetCodec) };
            };
            // COLLECT, then MEASURE, then emit: every leftover whose correction is a bare analysis of its own track goes to prefetchLoudness in one pass
            // before the loop below emits anything, and the loop reads the results back through measureLoudness. The test mirrors the loop's path to its
            // pre-filter-free buildLoudnormFilter call, so a divergence costs a wasted or a missed prefetch, never a wrong measurement; a track the opus
            // layout wall routes through a relabel or a remix, or one ac3/eac3 re-matrix, keeps its own pass, with that pre-filter.
            const leftoverIdxs = [];
            for (const ffstream of audioStreams) {
                const outputAudioIdx = outputAudioIdxMap.get(ffstream.index);
                const srcAudioIdx = inputAudioIdxMap.get(ffstream.index);
                const channels = ffstream.awkChannels;
                if (removedIndices.has(ffstream.index) || outputAudioIdx === undefined || srcAudioIdx === undefined || modifiedAudioIdx.has(outputAudioIdx)
                    || channels <= 0) continue;
                const { targetCodec, unplaceable } = leftoverTarget(ffstream, channels);
                const stamp = loudnormStampOf(ffstream);
                if (stamp && (targetCodec === null || loudnormStampHolds(ffstream, stamp))) continue;
                if (targetCodec === null || unplaceable || ac3RematrixFilter(targetCodec, ffstream) || (aacFamily(targetCodec) === 'opus' && channels > 2
                    && !opusLayoutFor(ffstream, channels).ok && !opusInPlace(ffstream, targetCodec))) continue;
                leftoverIdxs.push(srcAudioIdx);
            }
            prefetchLoudness(leftoverIdxs.slice(0, Math.max(0, LOUDNORM_MAX_TRACKS - loudnormMeasureCount)), preset);
            for (const ffstream of audioStreams) {
                if (removedIndices.has(ffstream.index)) continue;
                const outputAudioIdx = outputAudioIdxMap.get(ffstream.index);
                const srcAudioIdx = inputAudioIdxMap.get(ffstream.index);
                if (outputAudioIdx === undefined || srcAudioIdx === undefined || modifiedAudioIdx.has(outputAudioIdx)) continue;

                const channels = ffstream.awkChannels;
                if (channels <= 0) {
                    skipDone += noChannelCountSkip(ffstream.index, `method_loudnorm=${methodLoudnorm}`, NO_CHANNEL_COUNT_CODEC);
                    continue;
                }
                const ffstreamCodec = codecNameOf(ffstream) || 'unknown';
                const { targetCodec, keepCodec, configuredCodec, isStereo, unplaceable } = leftoverTarget(ffstream, channels);
                // Cache check, ahead of every skip line but the no-channel-count one above (the collect loop tests it in the same place): this stream isn't
                // being touched by anything else this run, so a stamp of the CURRENT preset that still holds (loudnormStampHolds) means its content hasn't
                // changed since we last measured or corrected it against this exact target - trust it, skipping the measurement subprocess. A stamped track
                // no codec can reach is skipped too, silently and with its stamp unread: its skip line would report a change nothing needs. A stamp from a
                // DIFFERENT preset, one that no longer holds, or no stamp at all falls through to a fresh measurement below.
                const stamp = loudnormStampOf(ffstream);
                if (stamp && (targetCodec === null || loudnormStampHolds(ffstream, stamp))) continue;
                if (targetCodec === null) {
                    // Both candidates are out of reach; report against keepCodec, the one the track would otherwise have stayed in.
                    if (channels > codecMaxCh(aacFamily(keepCodec)))
                        skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Skipping - ${ffstreamCodec} ${channels}ch exceeds the `
                            + `${codecMaxCh(aacFamily(keepCodec))}ch limit for ${aacFamily(keepCodec)}\n`;
                    else if (containerRefusesAudio(keepCodec)) {
                        const remedy = keepCodec === configuredCodec ? ` - ${wallRemedy(isStereo ? 'codec_stereo' : 'codec_surround')}` : '';
                        skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Not normalizing - ${wallText(keepCodec)}, the codec it `
                            + `would be re-encoded to; left as ${ffstreamCodec}${remedy}\n`;
                        walledOps += 1;
                    } else if (layoutRefusal(keepCodec, ffstream) && !guardBlocks(ffstream, keepCodec, channels, channels))
                        skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Not normalizing - the re-encode would be to `
                            + `${aacFamily(keepCodec)}, and ${layoutRefusal(keepCodec, ffstream)}; left as ${ffstreamCodec}\n`;
                    else
                        skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Not normalizing - would lose detail vs `
                            + `${codecDisplayName(ffstream)} ${channels}ch (${guardTriple()}); left as ${ffstreamCodec}\n`;
                    continue;
                }
                // A decode no layout places (layoutUnplaceable) is left as it is (unplaceableSkip) before it is measured, as every other operation leaves
                // it: no stamp follows the skip, so an analysis would repeat every pass for nothing. For an aac target it also keeps the job alive:
                // native aac refuses an unlabelled decode (exit 234). An opus with no layout re-encoded to opus in place is the exception (opusInPlace).
                if (unplaceable) {
                    skipDone += unplaceableSkip(ffstream, `method_loudnorm=${methodLoudnorm}`, 'Not normalizing');
                    continue;
                }
                const targetCodecFamily = aacFamily(targetCodec);

                // Any opus target - codec_force's scope put codec_surround=opus here, an unencodable source fell through to it, or the track is already opus:
                // if libopus can't write this track's layout in place (OPUS_OK_LAYOUTS), a bare -c:a libopus would abort the whole ffmpeg job or move its
                // speakers. Relabel losslessly when possible (chained before loudnorm); otherwise defer to method_layout_err. 'remix' downmixes to codec_stereo
                // (+ loudnorm) in place, unless something stands it down (remixStandDown: a GENUINE track already holding this language's stereo - never a
                // secondary's, which is not the language's - or a walled codec_stereo); 'keep' - and 'drop', which can't remove a track once the audio index
                // maps are built (the codec_force path drops such a track in the pre-pass) - leave it in its source codec, un-normalized. A track already opus
                // is never remixed (remixStandDown), so an opus 5.0 or 6.1 is left as it is under every setting. An opus re-encoded in place (opusInPlace), the
                // one decode no layout places that gets here, bypasses the wall: it keeps mapping family 255, which libopus takes at any count.
                let loudnormRelabel = '';
                if (targetCodecFamily === 'opus' && channels > 2 && !opusInPlace(ffstream, targetCodec)) {
                    const { lay, ok, relabel, relabelFilter } = opusLayoutFor(ffstream, channels);
                    if (!ok) {
                        if (relabel) {
                            // lossless relabel to an opus-safe layout, chained ahead of loudnorm
                            loudnormRelabel = relabelFilter;
                        } else if (remixFoldsTrack(ffstream, channels)) {
                            // MEASURE FIRST, then decide: the gain correction is this loop's only mandate (with method_loudnorm=disabled it never runs, and the
                            // track keeps its source codec and channels), so a track already within LOUDNORM_TOLERANCE_LU, or one the analysis cap left
                            // unmeasured, must not be flattened from surround to stereo for nothing. The codec_force remix fires unconditionally because there
                            // the codec change IS the requested operation and loudnorm merely rides along.
                            const guarded = guardBlocks(ffstream, codecStereo, 2, channels);
                            const two = stereoArg(guarded ? newStreamOutputIdx : outputAudioIdx, ffstream);
                            // NO stamp on this exit, unlike every other within-tolerance one: stereoArg measured the stereo FOLD, which this track never
                            // becomes here, so a stamp would claim the surround content is at target when nothing measured it. A fold reads 0.95-3.0 LU quieter
                            // than the track natively (0.12 LU only on pure dialogue; measured on this build), past LOUDNORM_TOLERANCE_LU, so the false claim
                            // lands on exactly the loud tracks loudnorm exists to tame, and the cache check, which trusts a stamp that still holds before any
                            // layout reasoning, would suppress their correction for good once the settings stop routing the track through the remix. The cost
                            // is one analysis spawn per pass, the price a container that cannot persist the tag pays.
                            if (!two.changed) {
                                // A correction its trial declined has said why already (buildLoudnormFilter).
                                if (!two.declined) {
                                    skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] ${two.measured
                                        ? 'Remix not needed - the stereo fold is already within tolerance'
                                        : 'Remix skipped - the per-file analysis cap left the stereo fold unmeasured (a later pass can normalize it)'}`
                                        + `; left as ${ffstreamCodec} ${channels}ch un-normalized\n`;
                                }
                                continue;
                            }
                            // A track guard_quality protects is judged against the stereo the remix emits (see the codec_force remix): its normalized stereo is
                            // ADDED beside it and the track stays un-normalized in its source codec - opus can't take its layout, and a codec this plugin
                            // encodes never gets here (leftoverTarget hands it the correction, or the codec_force remix has already run on it).
                            if (guarded) {
                                appendStereo(ffstream, srcAudioIdx, ffstreamCodec, srcRateToken(ffstream), ffstream.awkRegionKey,
                                    ` (${opusLayoutWhy(lay, channels)}; the source is kept un-normalized as ${ffstreamCodec})`,
                                    { tag: `[method_layout_err=${methodLayoutErr}][guard_quality=${guardQuality}]`, measuredTwo: two });
                                continue;
                            }
                            const enc = stereoEnc(outputAudioIdx);
                            workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Normalizing ${ffstreamCodec} ${channels}ch → `
                                + `${enc.logCodec} stereo @ ${enc.rate} (${enc.label ? `${enc.label}; ` : ''}remixed - ${opusLayoutWhy(lay, channels)})\n`;
                            replaceStereo(ffstream, outputAudioIdx, enc, two, ffstream.awkSecondaryTrack ? '' : ffstream.awkRegionKey);
                            convert = true;
                            continue;
                        } else {
                            const why = remixStandDown(ffstream, relabel) || `method_layout_err=${methodLayoutErr}`;
                            skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Not normalizing - ${opusLayoutWhy(lay, channels)}; `
                                + `left as ${ffstreamCodec} (${why})\n`;
                            continue;
                        }
                    }
                }

                const srcBitrate = Number(ffstream.bit_rate || 0);
                const preFilter = loudnormRelabel || ac3RematrixFilter(targetCodec, ffstream);
                const { filter, changed, measured, recorded } = buildLoudnormFilter(ffstream.index, srcAudioIdx, preFilter, preset, loudnormTagPersists);
                if (!changed) {
                    // Already within tolerance. On a tag-persisting container, stamp it (a metadata-only remux) so a FUTURE run can skip re-measuring while
                    // the preset stays the same. On a container that would drop the tag, do NOTHING (a true no-op) - stamping there would just remux every
                    // reprocess forever without ever caching (see loudnormTagPersists above). A track the analysis cap left unmeasured also lands here with
                    // changed:false, and must NOT be stamped: the cache would claim a loudness nothing ever read, and every future run would trust it and
                    // skip the track for good. It is simply left at source loudness, as the cap warning says, for a later pass to pick up. A correction its
                    // trial declined is stamped the same way, its line saying so (`recorded`): reaching the same verdict again costs an analysis and a trial
                    // on every pass (about 35 min for a 2 h 5.1 track on an M1), and the stamp's preset, codec, channels and digest re-open it when any of
                    // them changes, as they do an on-target track's.
                    if (loudnormTagPersists && measured) {
                        stampWithinTolerance(ffstream, outputAudioIdx);
                        convert = true;
                    } else if (recorded) {
                        extraArguments += copyStampArg(ffstream, outputAudioIdx);
                        convert = true;
                    }
                    continue;
                }
                const pceLayout = pceLayoutOf(ffstream);

                if (targetCodec === 'aac_vbr') {
                    const { encoder, args, approxRate, label } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true, channels);
                    const record = { codec: 'aac', channels, bps: 0, approxRate };
                    workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Normalizing ${ffstreamCodec} ${channels}ch → aac `
                        + `${channels}ch @ ${approxRate} (${label})\n`;
                    replaceInPlace(outputAudioIdx, `${encoder}${args} -filter:a:${outputAudioIdx} "${pceRelabel(ffstream, filter)}"`
                        + `${loudnormEncodeStamp(outputAudioIdx, record)}`, record);
                } else {
                    // Format in == format out (the plain loudnorm case, and codec_force aimed at the codec the track already uses): match the source rate
                    // rather than re-deriving a ladder target, which would re-encode a 192k mono aac at the 160k aac ceiling and build in a loss nobody
                    // asked for. Only a genuine codec change takes resolveBitrate's transcode target. An unmeasurable source rate falls back to it too.
                    const sameFormat = targetCodecFamily === codecFamilyOf(ffstream);
                    const matchedBps = sameFormat ? sameFormatBitrate(targetCodecFamily, channels, srcBitrate) : 0;
                    const dstBps = matchedBps || resolveBitrate(targetCodec, channels, srcBitrate, ffstream.awkLossless, ffstream.awkQuality);
                    // An opus with no layout keeps mapping family 255, so libopus writes its channels back by index (opusInPlace).
                    const dstBitArg = `${encoderArgsBps(targetCodec, outputAudioIdx, dstBps)}`
                        + `${opusInPlace(ffstream, targetCodec) ? ` -mapping_family:a:${outputAudioIdx} 255` : ''}`;
                    const srcRateStr = srcRateToken(ffstream);
                    // The channels the encoder writes (encodedChannels), as at FORCE CODEC: the log, Expected results and the stamp read the record.
                    const record = { codec: targetCodec, channels: encodedChannels(targetCodec, ffstream, channels), bps: dstBps };
                    const notes = [sameFormat ? (matchedBps ? 'source rate matched' : '') : `converged from ${ffstreamCodec}`,
                        pceLayout ? `its PCE read as ${pceLayout} from MediaInfo` : '',
                        ac3FoldNote(targetCodec, ffstream, record.channels, channels)].filter(Boolean);
                    workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Normalizing ${ffstreamCodec} ${channels}ch @ ${srcRateStr} → `
                        + `${targetCodec} ${record.channels}ch @ ${kbpsToken(dstBps)}${notes.length ? ` (${notes.join('; ')})` : ''}\n`;
                    // The PCE or Lt/Rt rename (pceRelabel) goes ahead of the correction, not into its analysis: measured 2026-11-06 on jellyfin-ffmpeg 7.1.4
                    // on every AAC_PCE_LAYOUTS layout, the loudness it measures is unchanged, so the prefetch serves the track. An opus relabel or an ac3
                    // re-matrix is already the filter's start.
                    replaceInPlace(outputAudioIdx, `${audioEncoder(targetCodec)}${dstBitArg} -filter:a:${outputAudioIdx} `
                        + `"${preFilter ? filter : pceRelabel(ffstream, filter)}"${loudnormEncodeStamp(outputAudioIdx, record)}`, record);
                }
                convert = true;
            }
        }
        // ====== END LOUDNORM: untouched tracks ======


        // An ENCODED appended track after the file's attachment streams fails the Matroska mux ('Received a packet for an attachment stream', exit 234,
        // measured on jellyfin 7.1.4 with one font), so attachments are mapped after the appended tracks, and summarised there. They are not audio, so every
        // a:N index holds.
        const attachLast = appendedAudio.length > 0 && isMatroskaFamily(dstContainer)
            && file.ffProbeData.streams.some((s) => codecTypeOf(s) === 'attachment');
        // A track this run titles (buildTitle, recorded with its encode), as the next pass reads it: a title the .mov title box refuses lives in the handler
        // alone, cut there when long (titleReadBack); one written over a matroska Name and the TITLE SimpleTag in its place is the only title left, read as
        // written (built from the track's one name, it lacks a role of the tag's only where no join reads both: trackNameBesideTitleTag). Every other written
        // title reads back with the role words the source already showed and its own, which keep a role the output's flags drop (readBackDispositions:
        // measured, 'Stereo - Original', a downmix of an mkvmerge --webm surround flagged original, read /original on the next pass while Expected results
        // dropped it with the flag).
        const titledAs = (s, title) => {
            if (title === undefined) return s;
            if (!titleBoxTakes(title, dstContainer)) {
                return titleReadBack({ ...s, tags: { ...(s.tags || {}), title, handler_name: handlerNameFor(title, dstContainer) } }, dstContainer);
            }
            return titleTagInNamePlace(s) && trackNameBesideTitleTag(s)
                ? { ...s, readBackRoleFields: readBackFieldsOf(s, getTagCI(s.tags, 'handler_name'), title, dstContainer) }
                : { ...s, readBackRoleFields: [...roleFieldsLower(s), ...roleFieldsOf([title])] };
        };
        // A stream as langMetaArg wrote its language (`lang`, undefined where it wrote none).
        const withLang = (s, lang) => (lang === undefined ? s : { ...s, tags: { ...(s.tags || {}), language: lang } });
        // The predicted output stream summary for the closing log line. Audio streams keep their original codec unless an in-place override was recorded;
        // removed tracks (dedup, tier deletes, layout drops) are dropped; newly created downmix tracks are appended (matching ffmpeg's -map 0 then -map 0:a:N
        // ordering). All streams are enriched with resolveStreamBitrate before summariseStream, matching the input summary line - so untouched tracks (e.g. a
        // copied stereo track) show their bitrate correctly. A re-encoded track is summarised through summariseStream's output descriptor, which prints an
        // aac_vbr override's approximate rate (~192k) and drops the source-only markers a fresh encode cannot carry. The preset build hands it what it maps:
        // leftOut, the source indices the output will not hold, so the summary never promises one; unmapped, the tracks left out of the map, of which one
        // the muxer rebuilds is listed last, with the tracks it creates (mp4CreatedTracks) where it writes them and a kept cover after those (mp4RebuiltLast);
        // coverTracks, the covers the remux copies as tracks (stageMatroskaCovers' asTrack), placed where Matroska reads them back (coverTracksAsRead);
        // keptCovers, the Matroska covers it attaches again from a staged copy, listed after everything else, attachments included - they are attachment
        // streams in the command, so they take no part in ffmpeg's default rule and come after readBackDispositions; carried, a source track as the remux
        // leaves it when this run does not title it; and the preset, whose own -disposition writes decide the flags the output is read back with
        // (readBackDispositions).
        const buildOutputSummary = ({ leftOut, unmapped, keptCovers, coverTracks, carried, preset }) => {
            // { index, stream, out } - the source index lets mp4RebuiltLast find a rebuilt track or a cover, and an appended one has none (-1); out describes
            // a re-encode, which summariseStream builds the token from: the encode's own codec/channels/rate, so a VBR override's approximate rate ('~192k',
            // carried in approxRate) prints through the same builder as a fixed-bitrate one.
            const items = [];
            for (const s of file.ffProbeData.streams) {
                if (leftOut.has(s.index) || (attachLast && codecTypeOf(s) === 'attachment')) continue;
                if (codecTypeOf(s) === 'audio' && removedIndices.has(s.index)) continue;
                const ov = codecTypeOf(s) === 'audio' ? outputAudioOverride.get(outputAudioIdxMap.get(s.index)) : undefined;
                const out = ov && { codec: ov.codec, channels: ov.channels, bps: ov.bps, rate: ov.approxRate };
                const lang = codecTypeOf(s) === 'audio' ? langWritten.get(outputAudioIdxMap.get(s.index)) : undefined;
                items.push({ index: s.index, stream: withLang(titledAs(enrichStream(s), ov?.title), lang), out });
            }
            for (const a of appendedAudio) {
                const out = { codec: a.codec, channels: a.channels, bps: a.bps, rate: a.approxRate };
                items.push({ index: -1, stream: withLang(titledAs(a.srcStream, a.title), langWritten.get(a.outIdx)), out });
            }
            if (attachLast) {
                for (const s of file.ffProbeData.streams.filter((x) => codecTypeOf(x) === 'attachment' && !leftOut.has(x.index))) {
                    items.push({ index: s.index, stream: enrichStream(s) });
                }
            }
            const mappedStreams = file.ffProbeData.streams.filter((s) => !removedIndices.has(s.index) && !unmapped.includes(s));
            const ordered = coverTracksAsRead(mp4RebuiltLast(dstContainer, items, unmapped, mp4CreatedTracks(dstContainer, mappedStreams),
                (s) => ({ index: -1, stream: s })), coverTracks, (t) => t.stream);
            return readBackDispositions(dstContainer, ordered, carriesDisposition(preset), (t) => t.stream, (t, s) => ({ ...t, stream: s }))
                .map((t) => (t.index >= 0 ? { ...t, stream: carried(t.stream) } : t))
                .concat(keptCovers.map((it) => ({ stream: keptCoverStream(it) })))
                .map((t) => summariseStream(movLangReadBack(dstContainer, dvCopyReadBack(dstContainer, t.stream)), t.out)).join('');
        };

        response.infoLog += workDone + skipDone;
        if (convert === true) {
            // Dispositions (default flag) are intentionally untouched: ffmpeg copies the source disposition onto mapped/transcoded outputs, so a downmix from a
            // default-flagged source also carries default - two default tracks, acceptable (near-identical content, players cope). Likewise a removal that
            // takes the default-flagged track can leave no default audio: ffmpeg auto-defaults the first track of a type only when two or more undefaulted ones
            // remain and the command carries no -disposition, so a lone survivor (which every player plays anyway) or a run writing a -disposition (a cover's
            // attached_pic, say) leaves none, and a player then picks by its language preference. Reassigning default is outside this plugin's scope:
            // stream_ordering, designed to run last, gives the sole default to the first main track. An mp4-family output keeps a sibling's GLOBAL awk_* marker
            // (clean_and_remux's awk_recovered, say) only under use_metadata_tags, so mp4TagPlan sets it exactly when one is there; this plugin writes no
            // global tag of its own. (Per-stream custom tags like awk_loudnorm are NOT rescued by the flag, verified against the real mov muxer - why loudnorm
            // caches on Matroska only; see loudnormTagPersists.)
            const tagPlan = mp4TagPlan(dstContainer, file.ffProbeData.format?.tags);
            const uncopyable = mp4UncopyableStreams(dstContainer, file.ffProbeData.streams);
            const staged = stageMatroskaCovers(dstContainer, matroskaCovers(dstContainer, file.ffProbeData.streams), file.file, otherArguments,
                file.ffProbeData.streams);
            // Every stream but a removed audio track, an uncopyable data track or a Matroska cover the remux attaches again or drops (stageMatroskaCovers,
            // which runs only for this remux) reaches the output, mp4 cover art included, the source's tracks in their own order; an appended downmix maps
            // after every one of them (attachLast maps the attachments after it), so the per-type order mp4TimecodeArgs, mp4NameCarryArgs and dvCopyFourccArgs
            // key on holds.
            const mapped = file.ffProbeData.streams.filter((s) => !removedIndices.has(s.index) && !uncopyable.includes(s) && !staged.leaveOut.includes(s));
            // A source track as the remux leaves it when this run does not title it: a name the carry moves into the handler alone reads back as that handler
            // (mp4NameCarryView), from the same mapped list and skip set as the carry.
            const carried = mp4NameCarryView(dstContainer, mapped, titleWrittenSrc);
            // A track this run retitles is no carry's, so a role only the TITLE SimpleTag in its Name's place gave, which its one name lacks, is said here; a
            // 'TITLE-<lang>' beside the Name stays beside the title written.
            const titleTagLost = mapped.filter((s) => titleWrittenSrc.has(s.index) && titleTagInNamePlace(s) && titleTagFate(s).lost.length)
                .map((s) => `☒${streamTag(s.index)} The TITLE`
                + ` tag "${logShown(titleTagText(s))}" beside the track name is dropped with its ${titleTagFate(s).lost.join(' and ')} role`
                + `${titleTagFate(s).lost.length > 1 ? 's' : ''} - no join of the two reads both their roles\n`).join('');
            response.infoLog += mp4UncopyableLog(dstContainer, uncopyable, mapped) + matroskaCoverLog(staged) + mp4TagPlanLog(tagPlan, dstContainer, mapped)
                + mp4TimecodeLog(dstContainer, mapped) + mp4NameCarryLog(dstContainer, mapped, titleWrittenSrc) + titleTagLost
                + dvCopyFourccLog(dstContainer, mapped) + dvCopyLossLine(dstContainer, mapped) + movDvLossLine(dstContainer, mapped)
                + roleLossLine(dstContainer, mapped) + movLangRespellLog(dstContainer, mapped);
            // The streams the output will not hold though no setting removed them: a stream the container cannot copy and the muxer does not rebuild
            // (mp4LostData), a cover it cannot store (mp4CoversLost) and a Matroska cover the remux leaves out of its map (stageMatroskaCovers).
            const leftOut = new Set([...mp4LostData(uncopyable, mapped), ...mp4CoversLost(tagPlan, dstContainer, mapped), ...staged.leaveOut]
                .map((s) => s.index));
            // The -strict level this mp4/mov -c copy remux needs (see mp4StrictArg): Dolby Vision's dvcC/dvvC boxes, or a TrueHD track the mp4 muxer refuses
            // without it. The second list is what this run actually COPIES - a track removedIndices drops, or an in-place transcode replaces (recorded in
            // outputAudioOverride, keyed by output audio index), is left out, so a TrueHD track on its way out never asks for a flag the output cannot need.
            const copiedStreams = file.ffProbeData.streams
                .filter((s) => !removedIndices.has(s.index) && !outputAudioOverride.has(outputAudioIdxMap.get(s.index)));
            const strictArg = mp4StrictArg(dstContainer, file.ffProbeData.streams, copiedStreams);
            const mapDrops = [...uncopyable, ...staged.leaveOut].map((s) => ` -map -0:${s.index}`).join('');
            response.preset += `<io>-map 0${mapDrops}${attachLast ? ' -map -0:t' : ''} -c copy${mp4NameCarryArgs(dstContainer, mapped, titleWrittenSrc)}`
                + `${extraArguments}${movLangRespellArgs(dstContainer, file.ffProbeData.streams)}${attachLast ? ' -map 0:t?' : ''}${strictArg}`
                + `${mp4TimecodeArgs(dstContainer, mapped)}${dvCopyFourccArgs(dstContainer, mapped)}`
                + `${matroskaCoverArgs(staged.kept)}${globalOutputOpt}${mp4MovflagsArg(dstContainer, tagPlan)}${outputMuxerArg(dstContainer)}`;
            response.infoLog += staleStatsNote(statsCleared);
            response.infoLog += `☑Expected results: ${buildOutputSummary({ leftOut, unmapped: uncopyable, keptCovers: staged.kept, coverTracks: staged.asTrack,
                carried, preset: response.preset })}\n`;
            response.processFile = true;
        } else {
            return skip(walledOps ? `☒Nothing written - every change wanted here needs a codec a .${dstContainer} file cannot hold (see above)\n`
                : '☑Audio already has the correct formats available\n');
        }
        return response;
    } catch (err) {
        flushBuffers();        // an unexpected bug must not swallow the diagnostics either - see failWithBuffers above
        failUnexpected(err);
    }
};
module.exports.details = details;
module.exports.plugin = plugin;
