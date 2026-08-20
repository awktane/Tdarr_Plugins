/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
// #region details() — input form + tooltips
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin curates a file's audio tracks: it decides which to KEEP and at what quality - and which to DROP - by language (keep at
                  surround, keep downmixed to stereo, or delete an unlisted language) and by role (commentary, audio-description, and M&E tracks follow
                  their own keep / stereo / delete setting). It can also downmix surround to 5.1 or stereo, force tracks to a chosen codec, remove
                  duplicate tracks, and apply two-pass EBU R128 loudness normalization. Guard options protect lossless, object-audio (Atmos/DTS:X/AC-4),
                  high-quality, and original-language tracks from destructive changes.\n\n
                  Because it can delete and re-encode audio, set the options deliberately - this can be destructive, especially with incorrectly
                  tagged audio tracks`,
    Version: '4.26.0',
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
                \\nExample:\\nspa,deu
                \\nKeep the Spanish and German dubs, but only in stereo.`,
        },
        {
            name: 'language_surround',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Languages to keep at full quality (surround). These follow downmix_to_six, downmix_to_stereo and codec_force, and are the only tracks
                the guards protect. Blank (default) treats every language as surround.
                \\nOne form is enough - en, eng, or English all match the same language, region variants like en-US included. A track with no language tag
                counts as "und".
                \\nA language in neither this list nor language_stereo is "unlisted" and follows language_unlisted. A language in BOTH lists is treated as
                surround, so this list wins.
                \\nCommentary, descriptive and M&E tracks are secondary whatever their language - they follow downmix_secondary, not these lists.
                \\nWhich tracks a guard can protect: only a genuine track kept at surround. A secondary track never is, and neither is one you have already
                sent to stereo or delete through language_stereo, language_unlisted or downmix_secondary - protecting a track from the very downmix you
                asked for would be nonsense.
                \\nException - dormancy: if NO genuine (non-commentary, non-descriptive) track matches this list or language_stereo, the language settings
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
                \\nCommentary, descriptive and M&E tracks are not covered here - they follow downmix_secondary.`,
        },
        {
            name: 'downmix_secondary',
            type: 'string',
            defaultValue: 'surround',
            inputUI: {
                type: 'dropdown',
                options: ['surround', 'stereo', 'delete'],
            },
            tooltip: `What to do with SECONDARY tracks - commentary, visually impaired (audio description) and M&E. This is a role, not a language: a
                secondary track follows this setting whatever its language, and never language_surround, language_stereo or language_unlisted.
                \\n=====
                \\nActions
                \\n=====
                \\nsurround (default) - leave secondary tracks at their source channels, untouched by the downmix paths. codec_force and method_loudnorm
                still apply.
                \\nstereo - transcode each secondary track of more than 2 channels in place to a stereo codec_stereo track, using the method_stereo_downmix
                matrix.
                \\ndelete - remove secondary tracks, but only where a plain (non-commentary, non-descriptive, non-M&E) track of the SAME language survives,
                and never if it would leave the file with no audio at all. So a file's only track, or a lone audio-description track with no plain track
                in its language, is always kept.
                \\nUnlike the language downmix paths, each surround secondary track is handled in place and independently - one stereo per secondary track,
                preserving all of them. Secondary tracks are never protected by the guards, so stereo always transcodes them.`,
        },
        {
            name: 'downmix_to_six',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'replace', 'add'],
            },
            tooltip: `Create a 5.1 track for a language that has none, built from the best higher-channel track it does have - restricted to
                language_surround's languages if you set that list, and never taken from a secondary (commentary, descriptive) track.
                \\nNothing is created when the language already has a 5.1 track, or has no higher-channel track to build one from.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - create no new 6 channel track.
                \\nreplace - the new codec_surround 6 channel track replaces the higher-channel track it was made from, unless a guard protects that
                source, in which case the 6 channel track is added alongside instead.
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
                (commentary, descriptive) track.
                \\nNothing is created when the language already has a stereo track, or has no higher-channel track to build one from.
                \\n=====
                \\nActions
                \\n=====
                \\ndisabled (default) - create no new 2 channel track.
                \\nreplace - the new codec_stereo track replaces the higher-channel track it was made from, unless that source was itself created by
                downmix_to_six or is protected by a guard, in which case the stereo track is added alongside instead. With the default guards a plain 5.1
                source usually takes that path, since guard_quality scores a 2 channel target below it.
                \\nadd - create the stereo track and keep the higher-channel source as well.`,
        },
        {
            name: 'codec_force',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','6below','2below','all'],
            },
            tooltip: `Transcode EXISTING tracks to codec_surround or codec_stereo according to their channel count. With this off, those two settings only
                ever apply to newly created tracks.
                \\n=====
                \\nActions
                \\n=====
                \\nfalse (default) - leave every existing codec as it is.
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
            tooltip: `Codec for newly created surround tracks. AC3 and EAC3 are limited to 6 channels (5.1) by ffmpeg's native encoders, while Opus carries
                up to 8.`,
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
                \\nNever treated as duplicates: commentary and descriptive tracks, since two different commentaries - cast and crew versus directors - are
                distinct content even when both are titled "Commentary"; and any track whose language folds to "und", because every untagged track shares
                that one key and two untagged tracks of genuinely different languages would otherwise look alike. An und track can neither be removed nor
                be the survivor that removes another.
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
            tooltip: `What to do when a track cannot be written in the target codec because of its channel layout. Left unhandled, ffmpeg aborts the whole
                job on that track.
                \\n=====
                \\nActions (only for a layout with no lossless relabel)
                \\n=====
                \\nkeep (default) - leave the track in its source codec rather than writing it as opus. Nothing fails and no audio is lost; a
                loudnorm-only run simply leaves that one track un-normalized.
                \\ndrop - remove the track entirely, but only where it is codec_force sending it to opus. On the method_loudnorm route the removal would
                come too late, so drop behaves as keep and the track stays un-normalized in its source codec. The last remaining audio track is never
                dropped, falling back to keep, and a stereo or 5.1 that a downmix would derive from the track is still created.
                \\nremix - downmix the track to a codec_stereo stereo, using method_stereo_downmix, with loudness applied when method_loudnorm is active.
                It defers to downmix_to_stereo and the stereo tier (language_stereo, language_unlisted=stereo, downmix_secondary=stereo) when they already
                convert the track, and falls back to keep rather than create a duplicate stereo.
                \\nThis only arises when codec_surround is opus and the track's layout is one libopus cannot encode - 2.1, 4.0, 4.1, 6.0, 7.0 or
                7.1(wide); AC3, EAC3 and AAC accept every layout. It is reached either because codec_force is sending the track to opus, or because
                method_loudnorm has to re-encode a kept track whose own codec ffmpeg cannot encode, such as a DTS core, and it converges to codec_surround.
                \\nA layout that merely needs relabelling (5.0(side) to 5.0, 6.1(back) to 6.1) is ALWAYS relabelled losslessly, whatever this is set to.`,
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
                \\nA track already within about 1 LU of the target is left completely untouched, with no re-encode. A track whose codec this plugin cannot
                encode - a kept DTS core or MP3, say - converges to codec_surround or codec_stereo, respecting each codec's channel ceiling, but only as a
                side effect of a correction genuinely needed, never on a track that is already close enough.
                \\nA track re-encoded in its own codec keeps its source bitrate, so the correction costs nothing beyond the re-encode itself. Only a genuine
                codec change picks a new target rate. If codec_force covers the track, its codec_surround/codec_stereo choice applies here as well: the
                encode is already being spent, so the setting is honoured even where codec_force alone would have declined it as not worth a re-encode.
                \\nIt applies whether or not the track is being downmixed, forced or converted for some other reason this run: an otherwise untouched track
                is measured and corrected on its own, while one already being modified rides on that same re-encode instead of a separate one.
                \\nOn a Matroska container (mkv, webm, mka) a track untouched by anything else this run is stamped with an awk_loudnorm tag once measured,
                and a later run trusts that tag and skips re-measuring while this setting stays the same; changing the setting forces a fresh measurement.
                mp4 and m4a muxers drop custom tags, so there loudnorm re-measures every run - an already-correct track stays a no-op rather than remuxing.`,
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
                \\ndefault (default) - ffmpeg's built-in downmix (-ac 2). The standard, least-surprising fold; its auto-levelling can occasionally sound
                quiet, with dialogue buried.
                \\ndialogue - a Lo/Ro downmix matrix, keeping the centre at -3 dB and dropping the LFE, so dialogue stays clear and the level stays up.
                The cost is a more opinionated fold that shifts the spatial image.
                \\nFalls back to default automatically for unusual layouts such as 2.1 and 3.0.`,
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
                touched, because guard_quality's margin math still runs against that source's near-maximum quality score and will usually keep blocking a
                conversion to any lossy codec unless guard_quality is relaxed as well.`,
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
                \\nCommentary, descriptive and M&E tracks are unaffected: this clears only the LANGUAGE decision, never the role one, so an 'original'
                commentary still follows downmix_secondary.`,
        },
        {
            name: 'guard_quality',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled','strict','disabled'],
            },
            tooltip: `Protect a track from a destructive operation - downmix_to_six or downmix_to_stereo 'replace', codec_force, duplicate removal, and
                method_loudnorm - whenever that operation would reduce the channel count, or a lossy source's predicted quality drop is significant.
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
                \\nBecause a downmix always drops channels, a downmix 'replace' always behaves as 'add' under either enabled or strict. codec_force='all'
                does not override this either - a guarded track is left alone in every force mode.`,
        },
    ],
});
// #endregion

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
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
    // ===== END SHARED: file-failure helpers =====
    // #endregion

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file. Split into labeled sections; each is
    // byte-identical across the plugins named in its header, and a plugin carries only the sections it uses. The section LABEL is the anchor
    // (order is free). Verify any edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // #region SHARED helpers (14 sections: stream codec type … language list match)
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

    // ===== SHARED [audio_clean, clean_and_remux]: language list match =====
    // -=-=-= langListMatch  [audio_clean, clean_and_remux] =-=-=-
    // True when a stream's language matches any entry in a pre-normalised key list (keys = userList.map(langKey), computed once per run). Only these two
    // plugins match a stream language against a user list; stream_ordering/sub_worker use langKey directly (indexOf / Set), so they carry langKey, not this.
    const langListMatch = (streamLang, keys) => keys.includes(langKey(streamLang));
    // ===== END SHARED: language list match =====
    // #endregion

    // audio_clean-local IDENTITY key: like langKey but KEEPS the region/script subtag, so pt-BR and pt-PT are DISTINCT identities
    // (both survive dedup, each gets its own downmix) while eng/en/English/en-US still fold their BASE (eng==en, but en !=
    // en-US). Used ONLY for dedup grouping and the one-downmix-per-language sets; all matching/filtering stays on the folded
    // langKey. Non-language/untagged/malformed tokens fall back to langKey, so 'und' stays 'und' and the dedup exemption holds.
    const langIdentityKey = (x) => {
        let s = String(x || '').trim().toLowerCase().replace(/[_.]/g, '-');
        if (!s) return '';
        if (s.length >= 4 && langNameIndex()[s]) s = langNameIndex()[s];   // spelled-out English name -> its 2-letter code (no region on a spelled-out name)
        try { return String(Intl.getCanonicalLocales(s)[0] || s).toLowerCase(); } catch (e) { return langKey(x); }
    };

    // #region SHARED helpers (3 sections: ffmpeg metadata escaping … title canonicalization)
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
    // The channel labels we recognise/replace for tag_title - 2.0 included so it can be overwritten with Stereo
    const channelTitleLabels = ['7.1', '6.1', '5.1', '5.0', '4.0', '3.1', '3.0', '2.1', '2.0', 'stereo', 'mono'];
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
        // Strip the surrounding quotes by index. /^["']+|["']+$/ is quadratic in an INTERIOR quote run: the ^-anchored branch can only try offset 0, so
        // once a word character leads, ["']+$ re-scans from every offset inside the run, consumes it greedily and gives back a character at a time against
        // a failing $ (60k quote characters measured 5.7 s of blocked worker). Same defect, same reasoning and the same output as the whitespace
        // pre-collapse below - a title is unbounded container metadata, so neither may be left to backtrack.
        let title = (rawTitle || '').trim();
        let qa = 0; let qb = title.length;
        while (qa < qb && (title[qa] === '"' || title[qa] === "'")) qa += 1;
        while (qb > qa && (title[qb - 1] === '"' || title[qb - 1] === "'")) qb -= 1;
        title = title.slice(qa, qb);
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
    // The codecs this plugin can actually EMIT, derived from the bitrate ladder rather than restated, so adding an output codec cannot leave the two
    // disagreeing. Read by loudnorm to decide whether a source codec can simply stay put or has to converge on codec_surround/codec_stereo.
    const ENCODABLE_CODECS = Object.keys(CODEC_TARGET_BPS);
    // Fold the aac_vbr pseudo-codec onto the real aac family for scoring/limit/target lookups (aac_vbr is an encoder choice, not a distinct codec). One local
    // source for every non-shared fold site below; the two inside the shared audio-scoring section keep the idiom inline (byte-identical, so no drift).
    const aacFamily = (codec) => codec === 'aac_vbr' ? 'aac' : codec;
    // Codec family of a STREAM for identity checks ("is this track already the target codec?"): the shared codecAliases prefix fold and nothing else, so
    // aac_latm (AAC in MPEG-TS/LATM, routine in DVR/.ts captures) matches an 'aac' target instead of taking a pointless lossy aac->aac re-encode. Deliberately
    // NOT resolveCodecName: its refinement resolves eac3 to eac3atmos and dts to dtsma/dtshr, names no codec_* target ever uses, causing re-encodes of its own.
    const codecFamilyOf = (stream) => {
        const codec = (stream?.codec_name ?? '').trim().toLowerCase();
        for (const [prefix, replacement] of codecAliases) if (codec.startsWith(prefix)) return replacement;
        return codec;
    };
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
        const tb = targetTable((s.codec_name || '').toLowerCase(), resolveChannels(s));
        return tb > 0 ? `~${tb / 1000} kb/s` : 'unknown bitrate';
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
        if (codec === 'aac' || codec === 'aac_vbr') return ch * 160000;   // 160k/ch (stereo 320k, 5.1 960k, 7.1 1.28M)
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
    // probe reported a source rate, which tells the caller to fall back to resolveBitrate's ladder target as before.
    const sameFormatBitrate = (codec, channels, srcBps = 0) => {
        const src = Number(srcBps) || 0;
        if (src <= 0) return 0;
        return finaliseBitrate(codec, Math.min(src, sameFormatCeiling(codec, channels)));
    };

    // Per-codec audio argument string for an ALREADY-RESOLVED rate, scoped to a specific output stream index (e.g. -b:a:2 instead of -b:a). ffmpeg accepts the
    // stream-qualified forms; we use them so each track gets its own settings when a single command touches several.
    const encoderArgsBps = (codec, idx, bps) => {
        if (bps <= 0) return '';
        if (codec === 'opus')
            return ` -vbr:a:${idx} on -compression_level:a:${idx} 10 -b:a:${idx} ${bps / 1000}k`;
        return ` -b:a:${idx} ${bps / 1000}k`;
    };
    // The same string for a codec CHANGE, where the rate comes from the transcode ladder. srcLossless and srcQuality are forwarded to resolveBitrate
    // (srcLossless skips the source cap for lossless sources; srcQuality gates the guarded source-cap on the force path).
    const encoderArgsIdx = (codec, channels, idx, srcBps = 0, srcLossless = false, srcQuality = Infinity) =>
        encoderArgsBps(codec, idx, resolveBitrate(codec, channels, srcBps, srcLossless, srcQuality));

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
    let _encoderSet;
    let _aacVbrFallbackWarned = false;
    const hasEncoder = (name) => {
        if (_encoderSet === undefined) {
            const cap = otherArguments && otherArguments.__awkCap;
            if (cap && Array.isArray(cap.encoders)) {
                _encoderSet = new Set(cap.encoders);
            } else {
                _encoderSet = new Set();
                try {
                    const { spawnSync } = require('child_process');
                    const r = spawnSync((otherArguments && otherArguments.ffmpegPath) || 'ffmpeg', ['-hide_banner', '-encoders'],
                        { encoding: 'utf8', timeout: ENCODERS_PROBE_TIMEOUT_MS });
                    _encoderSet = parseFfmpegEncoders(r && r.stdout);
                } catch (e) { /* leave empty → native aac fallback, which every build has */ }
            }
        }
        return _encoderSet.has(name);
    };

    // Encoder + rate args + log label for an aac_vbr stereo track, picking the best VBR AAC encoder THIS node has. The low-info test (an already-lean
    // ≤144k stereo source being codec-swapped) selects the leaner tier on each encoder:
    //   • libfdk_aac (Lin/Win)  -> -vbr 4/5                       the efficient default (~128-224 kb/s)
    //   • aac_at    (Mac only)  -> -aac_at_mode vbr -q:a 1/0      Apple AudioToolbox, the platform's best VBR AAC when libfdk is absent
    //   • native aac (any)      -> -b:a 256k CBR                  last-resort floor (-vbr is libfdk-private, so native aac can't VBR)
    // aac_at's top tier runs a little heavier than libfdk -vbr 5 but leaner + faster than native 256k. Warns once per file when not using libfdk.
    // AAC_VBR_LOWINFO_BPS is the single source for the low-info boundary and its predicted rate, shared by aacVbrArgsIdx (picks the level) and guardBlocks
    // (scores the delivered quality) so the two can't drift: at/below it a stereo source emits -vbr 4 (~128k), above it -vbr 5 (~192k).
    const AAC_VBR_LOWINFO_BPS = 144000;
    const aacVbrPredictedBps = (srcBps) => (Number(srcBps) > 0 && Number(srcBps) <= AAC_VBR_LOWINFO_BPS) ? 128000 : 192000;
    const aacVbrArgsIdx = (idx, srcBps = 0, isStereoSrc = false, channels = 2) => {
        const lowInfo = isStereoSrc && Number(srcBps) > 0 && Number(srcBps) <= AAC_VBR_LOWINFO_BPS;
        if (hasEncoder('libfdk_aac')) {
            const vbrLevel = lowInfo ? 4 : 5;
            return { encoder: 'libfdk_aac', args: ` -vbr:a:${idx} ${vbrLevel}`, approxRate: lowInfo ? '~128k' : '~192k', label: `libfdk VBR q${vbrLevel}` };
        }
        if (hasEncoder('aac_at')) {
            if (!_aacVbrFallbackWarned) {
                _aacVbrFallbackWarned = true;
                response.infoLog += `☒[codec_stereo=aac_vbr] no libfdk_aac on this node - using aac_at (AudioToolbox) VBR instead\n`;
            }
            const q = lowInfo ? 1 : 0;
            return {
                encoder: 'aac_at', args: ` -aac_at_mode:a:${idx} vbr -q:a:${idx} ${q}`, approxRate: lowInfo ? '~150k' : '~190k', label: `aac_at VBR q${q}`,
            };
        }
        const bps = resolveBitrate('aac', channels);
        if (!_aacVbrFallbackWarned) {
            _aacVbrFallbackWarned = true;
            response.infoLog += `☒[codec_stereo=aac_vbr] no libfdk_aac or aac_at on this node - using native aac ${bps / 1000}k instead\n`;
        }
        return { encoder: 'aac', args: encoderArgsIdx('aac', channels, idx), approxRate: `${bps / 1000}k`, label: 'native aac' };
    };


    // Resolve whether a source stream is lossless using the shared resolveCodecName resolution (same one audioQuality uses). Stored per-stream
    // as awkLossless to avoid repeating the resolution at emission. Read by guard_lossless (its guardBlocks skip + the "never drop the last
    // lossless copy" dedup rule), by the dedup sort's trustedRate ranking, and as the source-lossless flag that suppresses resolveBitrate's
    // source-bitrate floor on the codec_force / loudnorm encode paths (downmix paths pass no source bitrate, so are unaffected).
    const isLosslessSource = (stream) => codecInfo[resolveCodecName(stream)]?.lossless === true;

    // Resolve whether a source stream carries object-audio metadata (Atmos / DTS:X / MPEG-H / AC-4) that ffmpeg cannot reconstruct on re-encode - keyed off the
    // codecInfo objectAudio flag via the same resolveCodecName resolution. Stored per-stream as awkObjectAudio. Read by guard_object_audio (an
    // independent third guard) and used as a dedup tie-breaker so an object-audio track is preferred over an otherwise-equal plain one.
    const isObjectAudioSource = (stream) => codecInfo[resolveCodecName(stream)]?.objectAudio === true;

    // Parse inputs, in the SAME order as the Inputs array in details() - so a new input lands at the matching offset in both places and the two cannot drift.
    // Every input is type:'string' (there are no type:'boolean' ones, which would be coerced and could not be out-of-set). The 16 dropdowns are validated
    // against their option sets by the table below; the two free-text language lists have no option set, so their tokens go through the language RECOGNISER
    // instead - that check sits further down because its predicate (knownLangToken) is declared below this block. Every check fails the file on a bad value.
    const langStereo = splitList(inputs.language_stereo).map(lang => lang.toLowerCase());
    const langStereoKeys = langStereo.map(langKey);         // normalised comparison keys (folds en/eng/english/en-US and 639-2/B vs /T)
    const langSurround = splitList(inputs.language_surround).map(lang => lang.toLowerCase());
    const langSurroundKeys = langSurround.map(langKey);
    const langUnlisted = String(inputs.language_unlisted).trim();
    const downmixSecondary = String(inputs.downmix_secondary).trim();
    const downmixToSix = String(inputs.downmix_to_six).trim();
    const downmixToStereo = String(inputs.downmix_to_stereo).trim();
    const forceCodec = String(inputs.codec_force).trim();
    const stereoCodec = String(inputs.codec_stereo).trim();
    const surroundCodec = String(inputs.codec_surround).trim();
    const methodDedupRegion = String(inputs.method_dedup_region).trim();
    const methodDeduplicate = String(inputs.method_deduplicate).trim();
    const methodLayoutErr = String(inputs.method_layout_err).trim();
    const methodLoudnorm = String(inputs.method_loudnorm).trim();
    const methodStereoDownmix = String(inputs.method_stereo_downmix).trim();
    const guardLossless = String(inputs.guard_lossless).trim();
    const guardObjectAudio = String(inputs.guard_object_audio).trim();
    const guardOriginal = String(inputs.guard_original).trim();
    const guardQuality = String(inputs.guard_quality).trim();
    // Case-preserving language read for the metadata WRITES on transcoded/appended streams below. resolveLang lowercases (correct for its matching KEYS), but
    // writing that would degrade clean_and_remux's canonical BCP-47 region/script case (pt-BR -> pt-br) and trip a later re-repair remux, so the writes read
    // the stored tag verbatim (ffprobe tag, then mediaInfo), preserving case. audio_clean never NORMALISES a language tag - that is clean_and_remux's job.
    const langForWrite = (s) => (s.tags?.language || '').trim() || (mediaInfoFor(s)?.Language ?? '').trim();
    // Does codec_force's scope cover a track of this shape? ('6below' takes every stereo track plus any surround track up to 6ch; 'all' drops that 6ch bound.)
    // ONE predicate for the two places that consult the setting, because they ask DIFFERENT questions of it: the FORCE CODEC block asks "is a re-encode worth
    // spending on this track?", while loudnorm's leftovers loop - which only runs once a re-encode is already happening for the gain correction - asks "since
    // we are encoding anyway, whose codec applies?". A second hand-copied scope test is exactly how those two would drift apart.
    const forceCovers = (isStereo, channels) => forceCodec === 'all'
        || (forceCodec === '6below' && (isStereo || channels <= 6))
        || (forceCodec === '2below' && isStereo);
    // Stereo (2ch) encode tokens for the configured stereoCodec, folding the aac_vbr (per-node VBR via aacVbrArgsIdx) vs fixed-bitrate branch otherwise
    // duplicated at every 2ch downmix/remix emit site. Returns the -c:a fragment (encoder + bitrate/quality args), the codec name + rate string + label for the
    // log line, and the output-summary record; each caller keeps its own -map prefix, log verb/suffix and outputAudioOverride/appendedAudio target inline.
    const stereoEnc = (idx) => {
        if (stereoCodec === 'aac_vbr') {
            const { encoder, args, approxRate, label } = aacVbrArgsIdx(idx);
            return { frag: `${encoder}${args}`, logCodec: 'aac', rate: approxRate, label, record: { codec: 'aac', channels: 2, bps: 0, approxRate } };
        }
        const bps = resolveBitrate(stereoCodec, 2);
        return {
            frag: `${audioEncoder(stereoCodec)}${encoderArgsIdx(stereoCodec, 2, idx)}`, logCodec: stereoCodec, rate: `${bps / 1000} kb/s`, label: '',
            record: { codec: stereoCodec, channels: 2, bps },
        };
    };

    // [inputName, parsedValue, validOptions] - checked top-down, failing on the first bad value, and the message always echoes the value that was tested.
    const dropdownChecks = [
        ['language_unlisted',     langUnlisted,         ['surround', 'stereo', 'delete']],
        ['downmix_secondary',     downmixSecondary,     ['surround', 'stereo', 'delete']],
        ['downmix_to_six',        downmixToSix,         ['disabled', 'replace', 'add']],
        ['downmix_to_stereo',     downmixToStereo,      ['disabled', 'replace', 'add']],
        ['codec_force',           forceCodec,           ['false', '6below', '2below', 'all']],
        ['codec_stereo',          stereoCodec,          ['aac', 'aac_vbr', 'ac3', 'eac3', 'opus']],
        ['codec_surround',        surroundCodec,        ['aac', 'ac3', 'eac3', 'opus']],
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
    for (const [name, value, opts] of dropdownChecks)
        if (!opts.includes(value)) failFile(`[${name}=${value}] invalid value, check your settings`);

    // Both free-text language lists are checked through this because dormancy is NOT a typo net - it only fires when NOTHING matches EITHER list, so a typo in
    // one list while the other still matches leaves that language "unlisted", where language_unlisted=stereo downmixes it and language_unlisted=delete removes
    // it. A rejected token fails the file. clean_and_remux runs the same check on its own lists, through its langName wrapper rather than this predicate.
    // #region SHARED helpers (2 sections: language token recognition … language token failure)
    // ===== SHARED [audio_clean, stream_ordering, sub_worker]: language token recognition =====
    // -=-=-= knownLangToken  [audio_clean, stream_ordering, sub_worker] =-=-=-
    // Is an already-folded langKey a recognised language token: any real language in any form (langKey folds en/eng/English/en-US/pt-BR to one base code), or
    // a valid special/private code - und (undetermined), mul (multiple), zxx (no linguistic content), mis (uncoded) and the qaa-qtz private-use range. Those
    // specials are load-bearing rather than laxness: stream language tags carry them, so a list has to be able to name them. Why an unrecognised token STOPS
    // the file is per-plugin and stays above this section, since it depends on what that plugin's input scopes; the message itself is failLangToken.
    const knownLangToken = (key) => key === 'und' || key === 'mul' || key === 'zxx' || key === 'mis' || /^q[a-t][a-z]$/.test(key) || !!langDisplayName(key);
    // ===== END SHARED: language token recognition =====
    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker]: language token failure =====
    // -=-=-= failLangToken  [audio_clean, clean_and_remux, stream_ordering, sub_worker] =-=-=-
    // The failFile message echoes the offending token capped at 200 chars, with control characters collapsed to a space: free text is unbounded and Tdarr
    // persists the whole error message, and a raw newline in the echo would split the line into a continuation carrying no ☐/☑/☒ status symbol.
    const failLangToken = (name, token) => failFile(`[${name}=${String(token ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}] not a recognised language`
        + ' - use an ISO-639 code (en/eng/fre), an English name (English), a BCP-47 tag (pt-BR), or a special code (und/mul/zxx/mis/qaa-qtz)');
    // ===== END SHARED: language token failure =====
    // #endregion
    for(let i = 0; i < langStereoKeys.length; i++)
        if(!knownLangToken(langStereoKeys[i])) failLangToken('language_stereo', langStereo[i]);
    for(let i = 0; i < langSurroundKeys.length; i++)
        if(!knownLangToken(langSurroundKeys[i])) failLangToken('language_surround', langSurround[i]);

    let extraArguments = '';
    let workDone = '';       // "this changed" lines (transcode/add/remix/normalize/remove).
    let skipDone = '';       // "this DIDN'T change, and why" lines (guard blocks, ceiling/missing-data skips). Both buffers are always logged.
    let convert = false;

    // The one condition three separate features have to give up on - resolveChannels found nothing usable in ffprobe, mediaInfo OR the channel layout. One
    // builder so the diagnosis reads the same whichever setting hit it first; only the [input=value] tag and the consequence clause differ per caller.
    const noChannelCountSkip = (index, tag, tail) =>
        `☒${streamTag(index)}[${tag}] Skipping - no channel count in ffprobe, mediaInfo, or channel layout; ${tail}\n`;
    const NO_CHANNEL_COUNT_CODEC = "can't safely choose a target codec or verify its channel limit";

    // Ordered before the no-audio check so a non-video reports "not a video", not "no audio streams".
    if (file.fileMedium !== 'video') return skip('☑File is not a video\n');

    let audioStreams = file.ffProbeData.streams.filter(stream => codecTypeOf(stream) === 'audio');
    if (audioStreams.length === 0) return skip('☑Video file has no audio streams to manage\n');

    // One guard around all the per-file work (the input summary, dedup, index mapping, the transcode loop, and the output-summary / preset build): a
    // deliberate failFile abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the file too — annotated and carrying the full infoLog —
    // not a silent skip. The summary walk is inside it because it reads both probes for every stream, so it is real work that can throw.
    // (Earlier input validation and the not-a-video / no-audio pre-flight checks run before this and fail-or-skip on their own.)
    try {
        // Input summary — the streams exactly as they arrived, before any audio work.
        response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

        // A secondary track is any commentary, visually-impaired/descriptive, music-and-effects (clean_effects) or karaoke track — the shared classifiers cover
        // the disposition flags and the title keywords. A distinct M&E (dialogue-free) or karaoke mix must never be deduped away as a duplicate of the main
        // mix. Lyrics/songs are subtitle-only, so they never apply to an audio stream. Secondary is a ROLE: it follows downmix_secondary whatever its language.
        const isSecondaryTrack = (stream) => isCommentary(stream) || isDescriptive(stream)
            || hasDisposition(stream, 'clean_effects') || hasDisposition(stream, 'karaoke');

        // Dormancy - see the language_surround tooltip for the full rationale. This boolean is the gate: true only when a genuine (non-secondary) track sits
        // in a language the user asked for (language_surround or language_stereo). Secondary tracks never count toward presence - they follow
        // downmix_secondary, not the lists.
        const hasWantedLang = (langSurroundKeys.length > 0 || langStereoKeys.length > 0)
            && audioStreams.some(s => !isSecondaryTrack(s) && (langListMatch(resolveLang(s) || 'und', langSurroundKeys)
                || langListMatch(resolveLang(s) || 'und', langStereoKeys)));

        //Annotate each track with its secondary-role flag, language/dedup keys, tier, quality score, and the lossless/object-audio/matrix-surround flags
        audioStreams = audioStreams.map(stream => {
            const fullLang = resolveLang(stream) || 'und';
            const cleanLang = langKey(fullLang);              // folded MATCH key (en/eng/english/en-US/pt-BR collapse): drives matching, tier, priority
            // Dedup / one-downmix-per-language grouping key. method_dedup_region=distinct keeps the region/script subtag (pt-BR !=
            // pt-PT, en-US != en); the default 'fold' reuses the folded match key so every regional variant collapses to one language.
            const regionKey = methodDedupRegion === 'distinct' ? langIdentityKey(fullLang) : cleanLang;
            // Enrich with mediaInfo bitrate before audioQuality scoring so that formats like DTS-HD MA (which ffprobe can't read a bitrate for in MP4/M4V
            // containers) score and display correctly.
            const enrichedItem = enrichStream(stream);
            const secondary = isSecondaryTrack(stream);
            // The track's TIER - what happens to it: 'surround' (kept at full quality, the only tier eligible for the downmix_to_* paths and the guards),
            // 'stereo' (kept, transcoded in place to stereo) or 'delete' (removed, subject to the delete safety below). Role wins the axis: a secondary track
            // follows downmix_secondary whatever its language. A genuine track follows its language bucket - language_surround, language_stereo, or
            // language_unlisted for a language in neither list. Dormancy pins every genuine track to surround. guard_original keeps an 'original'-flagged
            // track at surround in an unlisted language, which also vetoes deleting it (see guard_original); it clears only the LANGUAGE decision, never the
            // role one, so an 'original' commentary still follows downmix_secondary.
            let tier;
            if (secondary) tier = downmixSecondary;
            else if (langSurroundKeys.includes(cleanLang)) tier = 'surround';    // a language in BOTH lists is surround - this list wins the overlap
            else if (langStereoKeys.includes(cleanLang)) tier = 'stereo';
            else if (!hasWantedLang) tier = 'surround';                          // dormant - nothing the user asked for is present, so keep everything
            else if (guardOriginal === 'enabled' && hasDisposition(stream, 'original')) tier = 'surround';
            else tier = langUnlisted;
            return { ...enrichedItem,
                awkSecondaryTrack: secondary,
                awkTier: tier,
                awkLangKey: cleanLang,
                awkRegionKey: regionKey,
                awkQuality: audioQuality(enrichedItem),
                // Used by codec_force to suppress the source-bitrate floor in resolveBitrate for lossless sources. A lossless bitrate (e.g. 4 Mbps TrueHD)
                // is not a comparable quantity for a perceptual encode and would otherwise pin the output at the codec ceiling for no audible gain.
                awkLossless: isLosslessSource(stream),
                // True when the source has Atmos/DTS:X/MPEG-H/AC-4 object audio ffmpeg can't re-encode - read by guard_object_audio and the dedup tie-break.
                awkObjectAudio: isObjectAudioSource(stream),
                // True when the source is a Dolby Surround EX (matrix-6.1) AC-3 - read only by the dedup tie-break, to keep the EX copy over a plain 5.1 twin.
                // Not object audio (ffmpeg re-encodes the AC-3 fine), so unlike awkObjectAudio it backs no guard.
                awkMatrixSurround: isDdEx(stream)
            };
        });

        // awkLangKey/awkRegionKey are whatever the CONTAINER stored: resolveLang hands back the raw tag, langKey only trims and lowercases it, and an
        // unparseable tag comes straight back out of Intl.getCanonicalLocales' catch verbatim. That is correct for MATCHING (an unrecognised tag on a
        // stream is data, and must keep flowing through language_unlisted), but not for PRINTING: a raw newline splits a status line in two and the
        // continuation carries no ☐/☑/☒, so container text renders as a status line the plugin never wrote, and Tdarr persists the whole infoLog, so an
        // unbounded tag is an unbounded log. Clamp at the echo sites, never in the shared langKey - the key itself is the match/dedup identity and must
        // stay byte-exact. Same expression and same reasoning as summariseStream's tok().
        const langTok = (v) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 64);

        // candidateStreams: the pool for workStreams. A track earns a place when there is genuinely something to do with it - it is a genuine surround track
        // (the only kind eligible for downmix_to_six/downmix_to_stereo), or its tier is 'stereo' (the in-place stereo downmix), or codec_force is set, which
        // must be able to standardize the codec of EVERY track including commentary and unlisted-language ones (e.g. codec_force='all' must touch them all).
        // Anything with nothing to do is dropped from the pool. ('delete'-tier tracks may remain here harmlessly - workStreams filters removedIndices below.)
        let candidateStreams = audioStreams;
        if (forceCodec === 'false')
            candidateStreams = candidateStreams.filter(stream => stream.awkTier === 'stereo'
                || (!stream.awkSecondaryTrack && stream.awkTier === 'surround'));

        // guard_lossless/guard_quality/guard_object_audio block a destructive operation only when it would irreversibly lose detail the destination can't
        // hold (a fully independent set, not a fallback chain - see the tooltips). Protection is earned PER OPERATION: each decision site calls
        // guardBlocks with its own real target codec/channels. Only a genuine tier-'surround' track is protectable (never a secondary, nor one already
        // sent to stereo/delete); a dormant language setting leaves a foreign-only track at 'surround', so it stays protectable. guard_quality decides the
        // channel-drop rule and the margin math: 'strict' protects on ANY predicted score drop, 'enabled' (default) only when the drop EXCEEDS
        // QUALITY_MARGIN. Comparable swaps pass (640k eac3 -> 640k ac3 = 5pt; 1509k DTS 5.1 -> 640k ac3 = 7pt); flattening a premium master is kept
        // (Atmos -> ac3 = 8pt, DTS-HD -> ac3 = 10pt). QUALITY_MARGIN = 7 is the DTS(91)-vs-ac3(84) base-score gap, so DTS core -> ac3 sits exactly at the
        // margin on the pass side (a drop must STRICTLY exceed it to protect) - preserving the force-DTS-to-ac3 behaviour.
        const QUALITY_MARGIN = 7;
        const guardBlocks = (stream, targetCodec, targetChannels, srcChannels) => {
            if (stream.awkSecondaryTrack || stream.awkTier !== 'surround') return false;
            if (guardLossless === 'enabled' && stream.awkLossless) return true;         // lossless detail can't survive any lossy re-encode
            if (guardObjectAudio === 'enabled' && stream.awkObjectAudio) return true;   // Atmos/DTS:X/MPEG-H/AC-4 object layer has no ffmpeg encoder
            if (guardQuality === 'disabled') return false;
            if (Number(targetChannels) < Number(srcChannels)) return true;       // the operation drops channels
            const family = aacFamily(targetCodec);      // aac_vbr scores as the aac family
            // Predict the bitrate the same-channel force branch actually emits, then score it. aac_vbr emits libfdk VBR (see aacVbrPredictedBps /
            // aacVbrArgsIdx), NOT resolveBitrate's CBR target — predict the VBR rate directly for aac_vbr or the guard would overstate the delivered quality.
            const srcBps = Number(stream.bit_rate) || 0;
            const predBps = targetCodec === 'aac_vbr'
                ? aacVbrPredictedBps(srcBps)
                : resolveBitrate(family, targetChannels, srcBps, false, stream.awkQuality);
            const predQuality = audioQuality({ codec_name: family, channels: targetChannels, bit_rate: predBps });
            const margin = guardQuality === 'strict' ? 0 : QUALITY_MARGIN;
            return predQuality < stream.awkQuality - margin;                 // target scores below the source by more than the tier's margin → detail lost
        };

        // Duplicate removal keeps `survivor` and drops `removed`. Block only when the drop loses detail the survivor can't hold. Separate from
        // guardBlocks: dedupe compares against an existing survivor (not a predicted transcode) and must check the survivor's losslessness. No
        // quality clause on purpose — the dedupe sort is measured-bitrate-first, so a survivor can carry a LOWER awkQuality than the removed track;
        // a quality clause would wrongly block those drops. The channel-count check protects the higher-channel duplicate under BOTH quality tiers
        // ('enabled' and 'strict'), so 'strict' is genuinely ⊇ 'enabled' (its documented "most protective" role) even on a channel-dropping dedup.
        // Returns the guard that blocked the drop as an `input=value` token (falsy '' when nothing blocks), so the call site can name the setting
        // the user actually has to change instead of listing all three - one definition, so the clause and the message it produces cannot drift.
        const dedupeGuardBlock = (removed, survivor) => {
            if (removed.awkTier !== 'surround') return '';   // a track already headed for stereo/delete is deduped freely (the dedup loop skips secondaries)
            // dropping the last lossless copy
            if (guardLossless === 'enabled' && removed.awkLossless && !survivor.awkLossless) return `guard_lossless=${guardLossless}`;
            // dropping the last object-audio (Atmos/DTS:X) copy
            if (guardObjectAudio === 'enabled' && removed.awkObjectAudio && !survivor.awkObjectAudio) return `guard_object_audio=${guardObjectAudio}`;
            // survivor has fewer channels (enabled AND strict)
            if (guardQuality !== 'disabled' && removed.channels > survivor.channels) return `guard_quality=${guardQuality}`;
            return '';
        };

        // Identify lower-quality duplicates among MAIN tracks only - secondary (commentary/descriptive) tracks are never deduplicated, so two different
        // commentaries are always both kept. Within each group only the highest-quality stream survives; the "-error" variants abort instead of removing
        // (grouping is identical). Grouping key by mode:
        //   'channel'/'channel-error' - (lang, exact channel count): one track per distinct count survives (a 7.1, a 5.1 and a 2.0 all kept).
        //   'multi-stereo'/'multi-stereo-error' - (lang, surround-vs-stereo role): one best surround plus one best stereo per language.
        //       Exceptions, active only while the matching downmix option is enabled: downmix_to_six carves the 5-6ch band into its own role and
        //       downmix_to_stereo carves exactly-2ch into its own, so a downmix-created/pre-existing 5.1 or 2.0 is never removed in favour of a 7.1/mono.
        //       Both use the same channel bands as existing6chLangs/existing2chLangs, so dedup cannot disagree with the downmix creation guards - a
        //       disagreement would be an infinite create/remove loop between the two options.
        // Dedup runs across ALL audio streams regardless of the language settings (a duplicate in a non-preferred language is still a duplicate).
        // dedupeGuardBlock keeps a duplicate whose removal would lose detail the survivor can't hold (a last lossless copy, a higher-channel track), and
        // never -errors on it.
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
            // On a quality tie, keep the higher channel count before falling back to index, so multi-stereo dedup collapsing a language's
            // surround variants keeps the 7.1 over a same-quality 5.1 (channel mode already tiers by exact count, so this only bites the broad
            // modes). When channels also tie, prefer an object-audio (Atmos/DTS:X) track over an otherwise-equal plain one so dedup keeps the
            // copy with the object layer. Then a Dolby Surround EX (matrix-6.1) track is kept over a plain 5.1 twin for the same reason: the
            // EX copy carries an extra matrixed rear channel a non-EX decoder folds harmlessly, so keeping it is never worse. Both bumps
            // usually get separated by the score/bitrate first; the tie-breaks only matter when everything above them lands exactly equal.
            const byQuality = [...audioStreams].sort((a, b) =>
                (trustedRate(b) ? 1 : 0) - (trustedRate(a) ? 1 : 0) || b.awkQuality - a.awkQuality || b.channels - a.channels
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
                const ch = resolveChannels(s);
                if (!(ch > 0)) {
                    skipDone += noChannelCountSkip(s.index, `method_deduplicate=${methodDeduplicate}`, "can't tell which tracks it would duplicate");
                    continue;
                }
                let tier;
                if (methodDeduplicateGroupBy === 'channel') {
                    tier = ch;
                } else if (downmixToSix !== 'disabled' && ch > 4 && ch <= 6) {
                    tier = 'six';
                } else if (downmixToStereo !== 'disabled' && ch === 2) {
                    tier = 'stereo2';
                } else {
                    tier = ch > 2 ? 'surround' : 'stereo';
                }
                // Only MAIN tracks reach here (secondaries skipped above), so the region-grouping key + channel-tier
                // fully identifies a duplicate group (region-distinct only when method_dedup_region=distinct).
                const key = `${s.awkRegionKey}|${tier}`;
                if (seen.has(key)) {
                    const kept = seen.get(key);
                    // Show the removed track's bitrate and the kept track's for contrast - duplicates are decided by quality score (largely bitrate-driven),
                    // so this makes the choice transparent. The guard-block, abort and ordinary removal messages are three renderings of the same comparison,
                    // so they share these tokens; only one of the three ever executes per hit. The codec renders through codecDisplayName, so a DTS subtype or
                    // an Atmos layer reads here exactly as it does in the input summary; dd-ex is appended separately because a matrixed rear channel is not a
                    // codec, so without it the EX tiebreak below prints two identical ac3 tokens. It reads the same per-stream flag the sort order does.
                    const rmRate = hasKnownRate(s) ? ` @ ${kbpsToken(s.bit_rate)}` : '';
                    const keptRate = hasKnownRate(kept) ? ` @ ${kbpsToken(kept.bit_rate)}` : '';
                    const rmEx = s.awkMatrixSurround ? ' dd-ex' : '';
                    const keptEx = kept.awkMatrixSurround ? ' dd-ex' : '';
                    // A guard-blocked duplicate SURVIVES (documented in the method_deduplicate tooltip) - but say so, or a user with two obvious duplicates
                    // watches dedup do nothing and cannot tell an exemption from a bug. Same reasoning as the und and no-channel-count exemptions above, and
                    // it also has to precede the -error abort: a duplicate a guard is protecting is not a duplicate the user is being asked to resolve.
                    const guardBlock = dedupeGuardBlock(s, kept);
                    if (guardBlock) {
                        skipDone += `☒${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}][${guardBlock}] Keeping duplicate `
                            + `${codecDisplayName(s)}${rmEx} ${s.channels}ch ${langTok(s.awkRegionKey)}${rmRate} - removing it would lose detail stream `
                            + `${kept.index} (${codecDisplayName(kept)}${keptEx} ${kept.channels}ch${keptRate}) can't hold\n`;
                        continue;
                    }
                    if (methodDeduplicateErrorMode) {
                        failFile(`${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}] Duplicate audio track (${codecDisplayName(s)}${rmEx} `
                            + `${s.channels}ch ${langTok(s.awkRegionKey)}${rmRate}) alongside stream ${kept.index} `
                            + `(${codecDisplayName(kept)}${keptEx}${keptRate})`
                            + ` - aborting; tag/remove tracks manually and requeue, or switch method_deduplicate to a non-error mode`);
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
                    workDone += `☐${streamTag(s.index)}[method_deduplicate=${methodDeduplicate}] Removing duplicate (${why}: ${codecDisplayName(s)}${rmEx}`
                        + ` ${s.channels}ch ${langTok(s.awkRegionKey)}${rmRate}) - keeping stream ${kept.index} (${codecDisplayName(kept)}${keptEx} `
                        + `${kept.channels}ch${keptRate})\n`;
                } else
                    seen.set(key, s);
            }
        }

        // libopus only accepts its RFC-mapping layouts and HARD-ERRORS on the rest, failing the whole job; ffmpeg's DEFAULT layout for 3ch
        // (2.1) and 4ch (4.0) is also rejected. AC3/EAC3/AAC accept every layout, so this only guards the force-to-opus path. OK set + relabels
        // verified via `anullsrc=channel_layout=X -c:a libopus` on jellyfin-ffmpeg (see the ffmpeg-codec-ranges memory).
        const OPUS_OK_LAYOUTS = new Set(['mono', 'stereo', '3.0', 'quad', '5.0', '5.1', '5.1(side)', '6.1', '7.1']);
        const opusAcceptsLayout = (channels, layoutStr) => {
            const lay = (layoutStr || '').toLowerCase().trim();
            if (lay) return OPUS_OK_LAYOUTS.has(lay);
            // No explicit layout → ffmpeg assigns the default for the count; those are OK for every count EXCEPT 3 (2.1) and 4 (4.0).
            return channels >= 1 && channels <= 8 && channels !== 3 && channels !== 4;
        };
        // Layouts that map LOSSLESSLY to an opus-accepted layout at the SAME channel count by pure relabel (side↔back position equivalence) - emitted via
        // channelmap (a permutation matrix, never a mix). A layout not listed here has no lossless relabel, so it falls to method_layout_err (keep/drop/remix).
        const OPUS_RELABEL = {
            '5.0(side)': { layout: '5.0', map: 'FL-FL|FR-FR|FC-FC|SL-BL|SR-BR' },
            '6.1(back)': { layout: '6.1', map: 'FL-FL|FR-FR|FC-FC|LFE-LFE|BL-SL|BR-SR|BC-BC' },
            'quad(side)': { layout: 'quad', map: 'FL-FL|FR-FR|SL-BL|SR-BR' },
        };
        // Surviving audio COUNT (streams not in removedIndices), read at call time so it reflects dedup + pre-pass removals - backs the never-drop-last guard.
        const countSurvivingAudio = () => file.ffProbeData.streams.filter(a => codecTypeOf(a) === 'audio' && !removedIndices.has(a.index)).length;

        // ====== TIER DELETES ======
        // language_unlisted=delete / downmix_secondary=delete. Runs before the layout-drop pre-pass (no double-drop) and before existing*Langs below (a
        // deleted track must not leave a stale "already exists" entry that suppresses a downmix backfill). The two deletes carry DIFFERENT safety nets,
        // because they fail differently:
        //   language_unlisted=delete removes a whole unwanted language, so it must NOT require another track of that language to survive - that rule would
        //     make the option inert (an unwanted dub is normally its language's only track). Safety: dormancy (hasWantedLang) + the never-empty floor.
        //   downmix_secondary=delete removes an EXTRA, so it keeps the fall-back rule: only when a plain track of the SAME language survives - a lone
        //     audio-description track, or the only track of its language, is kept.
        // Both are floored by countSurvivingAudio() > 1: no delete may ever leave the file with no audio. The channel clause is dropped when no probe
        // measured a count - enrichStream's fallback lands `undefined` for exactly those streams, and an unguarded interpolation renders "undefinedch".
        const delToken = (s) => `${codecDisplayName(s)}${s.channels > 0 ? ` ${s.channels}ch` : ''} ${langTok(s.awkLangKey)}`;
        // Language deletes resolve FIRST, so the plain-language fall-back set the role deletes read below reflects what actually survives them.
        for (const s of audioStreams) {
            if (s.awkTier !== 'delete' || s.awkSecondaryTrack || removedIndices.has(s.index)) continue;
            if (countSurvivingAudio() <= 1) {
                skipDone += `☒${streamTag(s.index)}[language_unlisted=delete] Not removing ${delToken(s)} - it is the last audio track\n`;
                continue;
            }
            removedIndices.add(s.index);
            workDone += `☐${streamTag(s.index)}[language_unlisted=delete] Removing ${delToken(s)} - not in language_surround or language_stereo\n`;
        }
        const plainLangsSurviving = new Set(audioStreams.filter(s => !s.awkSecondaryTrack && !removedIndices.has(s.index)).map(s => s.awkLangKey));
        for (const s of audioStreams) {
            if (s.awkTier !== 'delete' || !s.awkSecondaryTrack || removedIndices.has(s.index)) continue;
            if (!plainLangsSurviving.has(s.awkLangKey)) {
                skipDone += `☒${streamTag(s.index)}[downmix_secondary=delete] Not removing ${delToken(s)} - no plain `
                    + `${langTok(s.awkLangKey)} track survives to fall back on\n`;
                continue;
            }
            if (countSurvivingAudio() <= 1) {
                skipDone += `☒${streamTag(s.index)}[downmix_secondary=delete] Not removing ${delToken(s)} - it is the last audio track\n`;
                continue;
            }
            removedIndices.add(s.index);
            workDone += `☐${streamTag(s.index)}[downmix_secondary=delete] Removing secondary ${delToken(s)}\n`;
        }

        // A source the layout-drop pre-pass removes may have been the SOLE source a downmix would have derived a track from - dropping it must not
        // silently lose that derivative. Each such dropped source is recorded here and its stereo/5.1 derivative is created after the main loop, but
        // only when the language didn't otherwise get one (so a redundant dropped source adds nothing). See the post-loop derivative pass below.
        const layoutDroppedDeriveSources = [];

        // method_layout_err=drop must remove streams BEFORE outputAudioIdxMap / the -map removal are built below - a mid-loop removal
        // would break the OTHER forced tracks' -c:a:N numbering. Pre-scan for a surround track codec_force would send to opus with a
        // libopus-incompatible layout that NO downmix will convert to stereo, and remove it (never the last audio track). keep/remix stay in
        // the loop; this mirrors the loop's surround shouldForce for exactly the drop subset. (The loudnorm-only convergence-to-opus path
        // can't drop here - it only knows a track needs re-encoding after measuring, past this point - so there 'drop' falls back to 'keep'.)
        if (methodLayoutErr === 'drop' && forceCodec !== 'false' && surroundCodec === 'opus') {
            for (const s of audioStreams) {
                if (removedIndices.has(s.index)) continue;
                const ch = resolveChannels(s);
                const lay = (s.channel_layout || '').toLowerCase().trim();
                if (ch <= 2 || ch > 8) continue;                                             // stereo→codec_stereo; >8 blocked (targetMaxCh)
                if ((s.codec_name || '').toLowerCase() === 'opus') continue;                 // already opus
                // guard_lossless/guard_quality/guard_object_audio — mirrors the force-site guard (surroundCodec is opus)
                if (guardBlocks(s, surroundCodec, ch, ch)) continue;
                if (!(forceCodec === 'all' || (forceCodec === '6below' && ch <= 6))) continue;   // surround shouldForce (mirrors the loop)
                if (opusAcceptsLayout(ch, lay)) continue;
                if (OPUS_RELABEL[lay]) continue;                                             // losslessly relabelable → the loop transcodes it, never drop
                // A downmix that will process this track keeps it out of the drop pile — whether it converts in place (replace, unguarded) or
                // flips to 'add' (guarded: source kept + a derivative added), the track SURVIVES, so defer the drop to the loop; only a track NO
                // downmix touches is truly dropped. Must NOT gate this on guardBlocks: a guarded replace flips to 'add', which keeps the source
                // — dropping it here would delete it before that add runs (a data-loss regression). surround tier: downmix_to_stereo=replace
                // (any >2ch) or downmix_to_six=replace (>6ch → 5.1); stereo tier: the in-place downmix. The per-language one-shot
                // (created2chLangs/six) is dynamic and can't be predicted here; a pre-empted downmix lands the track in the loop keep fallback.
                const stereoPath = s.awkTier === 'stereo';                                   // the in-place stereo downmix converts it anyway
                const surroundPath = !s.awkSecondaryTrack && s.awkTier === 'surround';   // only a genuine surround track reaches downmix_to_*
                if (stereoPath || (surroundPath && (downmixToStereo === 'replace' || (ch > 6 && downmixToSix === 'replace')))) continue;
                if (countSurvivingAudio() <= 1) continue;                                    // never drop the last audio track
                removedIndices.add(s.index);
                // this IS a change (removal)
                workDone += `☒${streamTag(s.index)}[method_layout_err=${methodLayoutErr}] Dropping - libopus can't encode a `
                    + `${s.channel_layout || `${ch}ch`} layout\n`;
                // Remember a dropped source a downmix ('add' mode) would derive from, so its stereo/5.1 still gets created even though the source itself is
                // gone (see the post-loop pass below). 'replace' modes already deferred above (they convert the source in place), so only 'add' reaches here.
                // Only a genuine surround track derives: a 'stereo'-tier track is converted in place, never derived from.
                if (surroundPath && (downmixToStereo !== 'disabled' || (ch > 6 && downmixToSix !== 'disabled')))
                    layoutDroppedDeriveSources.push(s);
            }
        }

        // Now that dedup + the layout-drop pre-pass have finalised removedIndices, snapshot which languages still have a primary stereo / 5.1-6ch track among
        // the SURVIVORS, so downmix_to_stereo/downmix_to_six only create one for a language that genuinely lacks it (a removed track can't leave a stale
        // entry). Keyed by awkRegionKey - the IDENTITY key dedup grouped on, region-distinct only under method_dedup_region=distinct, never the folded match
        // key. Channels 2 = stereo; >4 && <=6 = any 5-6ch primary (5.0/5.1, and the rare 4.1, also 5 channels) but not 4.0 (4ch) or 7.1 (8ch).
        const survivingPrimaryAudio = audioStreams.filter(s => !removedIndices.has(s.index) && !s.awkSecondaryTrack && s.awkTier === 'surround');
        const existing2chLangs = new Set(survivingPrimaryAudio.filter(s => s.channels === 2).map(s => s.awkRegionKey));
        const existing6chLangs = new Set(survivingPrimaryAudio.filter(s => s.channels > 4 && s.channels <= 6).map(s => s.awkRegionKey));

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

        // aac_vbr is treated as the aac family for codec-identity checks — ffprobe always reports codec_name 'aac' regardless of which encoder produced the
        // track, so comparing against 'aac_vbr' directly would never match and would needlessly re-encode existing AAC tracks. The stream side of the same
        // comparison folds through codecFamilyOf (alias-only) so a container-spelling variant such as aac_latm also reads as its real family.
        const stereoCodecFamily = aacFamily(stereoCodec);
        // noCodecWorkNeeded: true when a track has landed in a codec_force-affected tier AND is already in that tier's target codec, so there is nothing
        // left to do and it can be excluded from workStreams (the .filter below keeps only the streams this returns false for). The surround shortcuts must
        // only fire for a genuine surround-tier track: a 'stereo'-tier track (language_stereo, language_unlisted=stereo, or downmix_secondary=stereo) always
        // needs the in-place stereo downmix, so a stereo-tier surround source already in surroundCodec must NOT be treated as done here - it has to stay in
        // workStreams to reach that downmix regardless of downmix_to_* / codec.
        const noCodecWorkNeeded = (stream) => {
            if(stream.channels > 6 && stream.awkTier === 'surround' && (downmixToSix === 'disabled') && (downmixToStereo === 'disabled')
                    && (forceCodec === 'all' && (codecFamilyOf(stream) === surroundCodec)))
                return true;
            else if(stream.channels > 2 && stream.channels <= 6 && stream.awkTier === 'surround' && (downmixToStereo === 'disabled')
                    && (['all','6below'].includes(forceCodec) && (codecFamilyOf(stream) === surroundCodec)))
                return true;
            if((stream.channels <= 2) && ['all','6below','2below'].includes(forceCodec) && (codecFamilyOf(stream) === stereoCodecFamily))
                return true;
            return false;
        };

        // workStreams: surviving candidates that still need codec work (downmix or force codec).
        let workStreams = candidateStreams
            .filter(s => !removedIndices.has(s.index))
            .filter(s => !noCodecWorkNeeded(s));

        workStreams.sort((a, b) => {
            // language priority: the languages the user most wants (language_surround), in the order they listed them. awkLangKey is the normalised key
            // and langSurroundKeys the normalised user list, so en/eng/english all rank together. A stereo-tier or unlisted language ranks last.
            // The unlisted sentinel is the list LENGTH (past every real 0..length-1 index), so it can't collide with a real index on a huge free-text list -
            // matching stream_ordering's getLangRank.
            const aLang = langSurroundKeys.indexOf(a.awkLangKey);
            const bLang = langSurroundKeys.indexOf(b.awkLangKey);

            const aRank = aLang === -1 ? langSurroundKeys.length : aLang;
            const bRank = bLang === -1 ? langSurroundKeys.length : bLang;
            if (aRank !== bRank) return aRank - bRank;

            // a full-quality genuine track outranks anything demoted to stereo or any secondary (commentary/descriptive/M&E) track
            const aRole = (a.awkSecondaryTrack || a.awkTier !== 'surround') ? 1 : 0;
            const bRole = (b.awkSecondaryTrack || b.awkTier !== 'surround') ? 1 : 0;
            if (aRole !== bRole) return aRole - bRole;

            if (a.channels !== b.channels)
                return b.channels - a.channels;

            const aQuality = a.awkQuality;
            const bQuality = b.awkQuality;
            if(aQuality !== bQuality) return bQuality - aQuality;

            return a.index - b.index;
        });

        if (workStreams.length === 0 && removedIndices.size === 0 && methodLoudnorm === 'disabled') {
            // Flush both buffers like every other exit - skipDone is routinely non-empty here (a guard that blocked the only candidate is exactly the
            // "why did nothing happen" diagnostic), and throwing it away leaves the user with a bare "no changes" line and no reason.
            response.infoLog += workDone;
            response.infoLog += skipDone;
            return skip('☑No audio tracks require changes\n');
        }

        // Seed extraArguments with removal exclusions before any codec args.
        if (removedIndices.size > 0) {
            for (const idx of removedIndices)
                extraArguments += ` -map -0:${idx}`;
            convert = true;
        }

        // New streams added via -map are numbered after all surviving original audio streams.
        let newStreamOutputIdx = totalOutputAudioBeforeNew;

        // Create at most one 6ch and one 2ch downmix per language, sourced from that language's best (first, highest-channel/quality) track.
        const created6chLangs = new Set();
        const created2chLangs = new Set();
        // "This language already has one" - pre-existing on the file (existing*Langs) OR created earlier this run by a downmix or a remix (created*Langs).
        // ONE definition each, because every site that creates a 6ch or a stereo has to ask the same question: a second same-language track would be a
        // duplicate that dedup only collapses on the NEXT queue pass, or never if dedup is disabled. Both sets are read at call time, so a registration made
        // later in the loop is visible to every later caller.
        const hasSixForLang = (k) => existing6chLangs.has(k) || created6chLangs.has(k);
        const hasStereoForLang = (k) => existing2chLangs.has(k) || created2chLangs.has(k);

        // Tracks which OUTPUT audio indices have already received a -c:a:N assignment so we don't emit conflicting codec directives for the same stream.
        const modifiedAudioIdx = new Set();

        // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset). outputAudioOverride: outputAudioIdx -> {codec,
        // channels, bps} for in-place transcodes/downmixes. appendedAudio: streams added via -map 0:a:N (downmix 'add'), appended after all originals.
        const outputAudioOverride = new Map();
        const appendedAudio = [];

        // Title for a new or replaced track, in the canonical form clean_and_remux's tag_title converges on - so a later pass finds nothing to rewrite (no
        // extra remux). Base first, roles LAST: "5.1 - Commentary" downmixed reads "5.1 -> 2.0 - Commentary"; untitled becomes the bare target label; a
        // rich custom title keeps its arrow-appended form ("Dolby TrueHD 7.1 -> 2.0"). The raw arrow title is assembled first (unchanged if it already
        // ends in the target label, so no "... 2.0 -> 2.0"), then canonicalAudioTitle applies the shared ownership/role rules - titleTagsFor and
        // channelLabel are shared too, so both plugins always agree.
        const buildTitle = (srcStream, targetLabel) => {
            const origTitle = (srcStream.tags?.title || mediaInfoFor(srcStream)?.Title || '').trim();
            const escapedLabel = targetLabel.replace(/\./g, '\\.');
            const raw = !origTitle ? targetLabel
                : new RegExp(`(?:^|[^0-9.])${escapedLabel}$`).test(origTitle) ? origTitle
                : `${origTitle} -> ${targetLabel}`;
            const m = targetLabel.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
            const bareLabel = channelLabel(m ? (+m[1] + +m[2] + (+m[3] || 0)) : 0, false);
            return canonicalAudioTitle(cleanStreamTitle(raw), bareLabel, titleTagsFor(srcStream));
        };

        // Lo/Ro stereo downmix matrices, keyed by EXACT layout, never channel count: several standard layouts share a count but order their channels
        // differently (6ch can be 5.1, 5.1(side), 6.0, 6.0(front), hexagonal), and a count-based matrix would silently mis-route - dropping the wrong
        // channel as "LFE", panning a back-center where a surround belongs - audio that sounds wrong with no error. The matrix is built from speaker roles
        // (gains + rationale at SPEAKER_GAINS below); a layout without a verified channel list returns null and the caller falls back to ffmpeg's safe
        // -ac 2. Channel lists verified against ffmpeg-utils "Channel Layout" docs; array position is the pan filter's cN index.
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
        };

        // Per-speaker contribution to the L and R downmix outputs - the standard Lo/Ro gains, matching what Blu-ray players, AV receivers and streaming
        // services do. FL/FR pass at full scale (peak 1.0); FC folds in at -3 dB (0.707) into both sides so dialogue stays clear; back/side/wide fold at -3 dB
        // into their own side; any centered channel (FC, BC) splits equally to both; LFE contributes nothing (dropping it avoids mud). That -3 dB attenuation
        // on center/surround is what provides the clipping headroom.
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
        };

        // Build a Lo/Ro pan=stereo matrix string for a known canonical layout, or null if the layout contributes no surround/center content (pure FL/FR or
        // FL/FR/LFE) where -ac 2 is already correct. Gains per SPEAKER_GAINS; a global sum-normalization is deliberately NOT used - it produces output
        // 6-8 dB quieter than the source on typical content.
        const buildPanMatrix = (channelList) => {
            const termsL = [];
            const termsR = [];
            let peakL = 0;
            let peakR = 0;
            let hasNonFront = false; // any channel beyond FL/FR/LFE that needs explicit panning

            channelList.forEach((spk) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return; // unknown speaker name — skip (shouldn't happen for canonical layouts)
                if (spk !== 'FL' && spk !== 'FR' && spk !== 'LFE') hasNonFront = true;
                if (spk === 'FL') peakL = 1.0;
                if (spk === 'FR') peakR = 1.0;
            });

            // Defensive: every canonical layout carries a centre or surround channel, so this never fires today - it keeps the matrix safe if a pure
            // FL/FR(/LFE) layout is ever added to CANON_LAYOUTS, where plain -ac 2 is the right answer anyway.
            if (!hasNonFront) return null;
            // Defensive likewise: a layout missing a front channel leaves peakL/peakR at 0 and would make the gain normalisation below divide by zero. Every
            // canonical layout leads with FL,FR, so this only guards a future non-FL/FR-leading addition to CANON_LAYOUTS.
            if (peakL <= 0 || peakR <= 0) return null;

            channelList.forEach((spk, i) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return;
                // Divide by peakL/peakR (always 1.0 — set from FL/FR) so coefficients are emitted
                // as-authored. Floor to 3 decimals (truncate, not round) for deterministic output.
                if (g.L > 0) termsL.push(`${(Math.floor((g.L / peakL) * 1000) / 1000).toFixed(3)}*c${i}`);
                if (g.R > 0) termsR.push(`${(Math.floor((g.R / peakR) * 1000) / 1000).toFixed(3)}*c${i}`);
            });

            return `pan=stereo|FL=${termsL.join('+')}|FR=${termsR.join('+')}`;
        };

        // Resolve a source stream to its canonical layout key, then to a verified pan matrix (or null). We normalize the ffmpeg channel_layout string
        // (lowercased, trimmed). If the file reports no layout or an unrecognized one, we return null so the caller uses ffmpeg's safe -ac 2 downmix.
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

        // ===== LOUDNORM =====
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

        // Synchronous analysis-only ffmpeg spawn measuring one stream's EBU R128 loudness. Returns { stats } (input_i/input_tp/input_lra/input_thresh/
        // target_offset) or { error } - every failure is reported, never thrown, so the caller decides how to fail the file. The loudnorm JSON logs at
        // AV_LOG_INFO, so -loglevel must stay at or above that (-nostats silences only the unrelated progress line). Args-array form only, never a shell
        // string. The JSON is NOT the last thing on stderr: real ffmpeg (5.1+) prints it during filter teardown, then a muxing-overhead line and a
        // "size=N/A ..." trailer - so take the LAST flat {...} block ANYWHERE in stderr, never one anchored to end-of-string (last-match also skips a
        // track title carrying literal braces, emitted before the summary). The timeout is a kill-switch for a WEDGED pass, but this pass costs
        // O(duration) - it decodes the track end to end - so a flat ceiling cannot be right: measured ~11x realtime idle but ~3.4x with six analyses
        // running, and a node normally runs several workers, so budget three wall-seconds per second of audio (~10x loaded headroom). That matters
        // because tripping it FAILS THE FILE - a ceiling a long legitimate track can reach quarantines the video. The floor keeps a short track sane and
        // absorbs spawn latency; the cap bounds a hang and a corrupt header declaring a nonsense duration; an unreadable duration falls back to the CAP -
        // work of unknown length must never be killed early. LOUDNORM_ANALYSIS_MAX_BYTES is load-bearing: spawnSync's default maxBuffer is 1 MB and the
        // JSON rides stderr behind unbounded output, so an overflow truncates it away and reads as "could not find loudnorm measurement JSON".
        const LOUDNORM_ANALYSIS_MIN_TIMEOUT_MS = 10 * 60 * 1000;
        const LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS = 4 * 60 * 60 * 1000;
        const LOUDNORM_ANALYSIS_MS_PER_AUDIO_SEC = 3000;
        const loudnormAnalysisDurationSec = Number(file.ffProbeData.format?.duration) || 0;
        const loudnormAnalysisTimeoutMs = loudnormAnalysisDurationSec > 0
            ? Math.min(LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS,
                Math.max(LOUDNORM_ANALYSIS_MIN_TIMEOUT_MS, Math.round(loudnormAnalysisDurationSec * LOUDNORM_ANALYSIS_MS_PER_AUDIO_SEC)))
            : LOUDNORM_ANALYSIS_MAX_TIMEOUT_MS;
        const LOUDNORM_ANALYSIS_MAX_BYTES = 64 * 1024 * 1024;
        const measureLoudness = (srcAudioIdx, preFilter, preset) => {
            const { spawnSync } = require('child_process');
            const analysisFilter = `${preFilter ? `${preFilter},` : ''}loudnorm=I=${preset.I}:LRA=${preset.LRA}:TP=${preset.TP}:print_format=json`;
            const args = ['-nostats', '-hide_banner', '-i', file.file, '-map', `0:a:${srcAudioIdx}`, '-af', analysisFilter, '-f', 'null', '-'];
            const result = spawnSync((otherArguments && otherArguments.ffmpegPath) || 'ffmpeg', args,
                { timeout: loudnormAnalysisTimeoutMs, maxBuffer: LOUDNORM_ANALYSIS_MAX_BYTES, encoding: 'utf-8' });
            // A tripped `timeout` sets BOTH error (code ETIMEDOUT) and signal (SIGTERM), and error is tested first - so the timeout must be named HERE or it
            // reports as a failure to launch, which is the opposite of what happened. The bare signal branch below is then only an external kill (an OOM
            // killer, an operator), which is worth telling apart from a timeout because the remedies differ.
            if (result.error && result.error.code === 'ETIMEDOUT')
                return { error: `ffmpeg exceeded the ${Math.round(loudnormAnalysisTimeoutMs / 60000)} min analysis timeout for this file's duration` };
            if (result.error) return { error: `could not start ffmpeg (${result.error.message})` };
            if (result.signal) return { error: `ffmpeg was killed from outside (signal ${result.signal})` };
            if (result.status !== 0) return { error: `ffmpeg exited with status ${result.status}` };
            const jsonBlocks = String(result.stderr || '').match(/\{[^{}]*\}/g);
            // Keep the LAST block that parses AND carries input_i (the brace-bearing-title case is why - see above).
            let stats = null;
            for (const block of (jsonBlocks || [])) {
                try { const parsed = JSON.parse(block); if (parsed && 'input_i' in parsed) stats = parsed; } catch (e) { /* not the JSON block */ }
            }
            if (!stats) return { error: 'could not find loudnorm measurement JSON in ffmpeg output' };
            return { stats };
        };

        // Measure, then decide the correction filter comma-chained onto preFilter, or return unchanged (changed:false) when already within
        // LOUDNORM_TOLERANCE_LU of target. `measured` gates the awk_loudnorm cache stamp: the track-cap branch also returns changed:false WITHOUT
        // measuring, and stamping that would cache a claim nothing ever checked. measured_thresh has NO uppercase alias (unlike measured_I/_LRA/_TP) -
        // keep it exactly lowercase. Pass-1's JSON field names (input_i/input_lra/input_tp/target_offset) are NOT pass-2's filter option names
        // (measured_I/measured_LRA/measured_TP/offset) - same numbers, different names per side. The per-file analysis cap exists because each pass is a
        // synchronous full-duration spawn - a crafted file declaring many audio tracks could tie up a worker for hours; past the cap the rest are left at
        // source loudness with one warning, for a later queue pass.
        const LOUDNORM_MAX_TRACKS = 24;
        let loudnormMeasureCount = 0;
        let loudnormCapWarned = false;
        const buildLoudnormFilter = (streamIndex, srcAudioIdx, preFilter, preset) => {
            if (loudnormMeasureCount >= LOUDNORM_MAX_TRACKS) {
                if (!loudnormCapWarned) {
                    response.infoLog += `☒[method_loudnorm=${methodLoudnorm}] More than ${LOUDNORM_MAX_TRACKS} audio tracks to normalize - measuring `
                        + `the first ${LOUDNORM_MAX_TRACKS}, leaving the rest at source loudness (a later pass can normalize them)\n`;
                    loudnormCapWarned = true;
                }
                return { filter: preFilter, changed: false, measured: false };
            }
            loudnormMeasureCount++;
            const analysis = measureLoudness(srcAudioIdx, preFilter, preset);
            if (analysis.error)
                failFile(`${streamTag(streamIndex)}[method_loudnorm=${methodLoudnorm}] loudnorm analysis pass failed (${analysis.error}) - if this file `
                    + `has known corruption, try clean_and_remux's recover_bad_timestamps/recover_bad_data first; if the codec itself is unsupported, `
                    + `that won't help`);
            const { stats } = analysis;
            // A digitally-silent track measures input_i="-inf" (and target_offset="inf"); Number("-inf") is NaN (JS parses "Infinity", not "inf"), which would
            // defeat the tolerance test AND then bake a literal measured_I=-inf into the correction filter that the real pass-2 transcode rejects ("out of
            // range [-99 - 0]"). Silence can't be loudness-normalized anyway, so treat any non-finite measured integrated loudness as within-tolerance (skip).
            if (!Number.isFinite(Number(stats.input_i)) || Math.abs(Number(stats.input_i) - preset.I) <= LOUDNORM_TOLERANCE_LU)
                return { filter: preFilter, changed: false, measured: true };
            const corrected = `loudnorm=I=${preset.I}:LRA=${preset.LRA}:TP=${preset.TP}:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}`
                + `:measured_TP=${stats.input_tp}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
            return { filter: preFilter ? `${preFilter},${corrected}` : corrected, changed: true, measured: true };
        };

        // Caching tag, stamped wherever this run measured the track: the leftovers loop below AND every re-encode a correction rode along on (downmix,
        // codec_force, remix) - the ride-along sites measure and correct in the same command, so their output is at target just as surely, and skipping
        // their stamp would cost a whole extra queue pass (re-measure, find within tolerance, remux the file to write nothing but this tag). Trusting the
        // correction is measured-sound: across nine source/preset/downmix combinations (incl. +37.7 dB and -7.5 dB corrections) the two-pass output landed
        // at most 0.240 LU from target, a 4x margin inside LOUDNORM_TOLERANCE_LU. Written "<preset>-<plugin version>" but matched on the preset portion
        // ONLY (the version is forensic, reserved for distinguishing a cache written by a known-buggy version). Matroska uppercases custom tag names on
        // write, so read-back goes through getTagCI.
        const readLoudnormTag = (stream) => getTagCI(stream.tags || {}, 'awk_loudnorm').trim();
        const loudnormTagMatchesPreset = (stream) => readLoudnormTag(stream).split('-')[0] === methodLoudnorm;
        const loudnormTagValue = () => `${methodLoudnorm}-${details().Version}`;
        // Only Matroska persists arbitrary per-stream tags through a -c copy remux; the mov/mp4/m4a muxers silently DROP a custom awk_loudnorm tag.
        // On those containers the cache stamp would vanish and be re-applied every reprocess - and for an already-within-tolerance track that stamp
        // is the ONLY change, so it would remux the file on every single pass forever (a non-idempotent loop). So the stamp is emitted only when it
        // will actually survive; on other containers a within-tolerance track is left a true no-op (re-measured next run, but never remuxed). A
        // track that genuinely needs correction still re-encodes once regardless of container, then measures within tolerance next run.
        const loudnormTagPersists = ['mkv', 'webm', 'mka'].includes(String(file.container).toLowerCase());
        const loudnormStampArg = (idx) => (loudnormTagPersists ? ` -metadata:s:a:${idx} "awk_loudnorm=${loudnormTagValue()}"` : '');
        // A loudnorm correction that RIDES ALONG on a re-encode some other setting fired (a downmix, a codec_force, a remix) has no line of its own - it is
        // chained into that operation's own filter and command. These two render its share of that line so the eight ride-along sites can't drift: the tag
        // stacks onto whatever tag the operation already carries, so the user can see that the settings combined, and the stamp caches the measurement so the
        // next pass doesn't re-measure a track this one already normalized. Gated separately - `changed` is "a correction was applied" (nothing to announce
        // when the track was already at target), `measured` is "an analysis actually ran" (see buildLoudnormFilter's track cap).
        const loudnormRideTag = (changed) => (changed ? `[method_loudnorm=${methodLoudnorm}]` : '');
        const loudnormRideStamp = (idx, measured) => (measured ? loudnormStampArg(idx) : '');
        const langMetaArg = (idx, lang) => (lang ? ` -metadata:s:a:${idx} "language=${escMeta(lang)}"` : '');
        // ===== END LOUDNORM =====

        // Channel/filter snippet for a new or replaced stereo track. No guard check here: every call site either already passed guardBlocks or is a
        // brand-new appended derivative (an unconditional lossy re-encode by construction), so loudnorm rides on whichever guarantee applies. The
        // no-verified-pan-matrix fallback must be an explicit filter (aformat=channel_layouts=stereo, verified equivalent to -ac 2) rather than bare -ac
        // when loudnorm is active, so the downmix chains BEFORE loudnorm's filter - ffmpeg applies an implicit -ac AFTER an explicit -filter:a, which
        // would measure/correct the wrong, pre-downmix signal. Returns { arg, measured, changed }: `measured` gates the awk_loudnorm stamp, `changed`
        // the ride-along log tag. Callers that don't run loudnorm read both false.
        const stereoArg = (idx, srcStream) => {
            const matrix = (methodStereoDownmix === 'dialogue') ? downmixMatrix(srcStream) : null;
            if (methodLoudnorm === 'disabled')
                return { arg: matrix ? ` -filter:a:${idx} "${matrix}"` : ` -ac:a:${idx} 2`, measured: false, changed: false };
            const preFilter = matrix || 'aformat=channel_layouts=stereo';
            const srcAudioIdx = inputAudioIdxMap.get(srcStream.index);
            const { filter, changed, measured } = buildLoudnormFilter(srcStream.index, srcAudioIdx, preFilter, LOUDNORM_PRESETS[methodLoudnorm]);
            return { arg: ` -filter:a:${idx} "${filter}"`, measured, changed };
        };

        // 6ch (5.1) channel/filter snippet for a new or replaced 5.1 track, mirroring stereoArg for the surround case: a bare -ac 6 when loudnorm is off, else
        // an explicit aformat=channel_layouts=5.1 (verified equivalent to -ac 6) chained BEFORE loudnorm's analysis/correction so it measures the post-downmix
        // signal - the same -ac ordering trap stereoArg documents. Shared by append6ch and the in-place downmix_to_six 'replace' branch so the two can't drift.
        const sixArg = (idx, srcStream) => {
            if (methodLoudnorm === 'disabled') return { arg: ` -ac:a:${idx} 6`, measured: false, changed: false };
            const { filter, changed, measured } = buildLoudnormFilter(srcStream.index, inputAudioIdxMap.get(srcStream.index),
                'aformat=channel_layouts=5.1', LOUDNORM_PRESETS[methodLoudnorm]);
            return { arg: ` -filter:a:${idx} "${filter}"`, measured, changed };
        };

        // Emit an APPENDED downmix track - a brand-new output stream derived from the ORIGINAL input audio via -map 0:a:N, whether or not that source stream
        // survives in the output: encoder+bitrate+loudnorm, the -c:a/filter/title/-metadata emit, the appendedAudio record, created*Langs registration, and the
        // newStreamOutputIdx/convert bookkeeping. Shared by the downmix_to_six/_stereo 'add' branches AND the layout-drop derivatives so the four append sites
        // can't drift. srcCodecStr is the source's display codec at each site; logSuffix carries the layout-drop "(source dropped ...)" note. An appended track
        // is an unconditional lossy re-encode, so loudnorm always rides it (no guardBlocks - see the callers).
        const append6ch = (srcStream, srcAudioIdx, srcCodecStr, srcRateStr, regionKeyVal, logSuffix) => {
            const newTitle = escMeta(buildTitle(srcStream, '5.1'));
            const dstBitArg = encoderArgsIdx(surroundCodec, 6, newStreamOutputIdx);
            const dstBitStr = resolveBitrate(surroundCodec, 6);
            const six = sixArg(newStreamOutputIdx, srcStream);
            workDone += `☐${streamTag(srcStream.index)}[downmix_to_six=${downmixToSix}]${loudnormRideTag(six.changed)} Adding ${surroundCodec} 6ch @ `
                + `${dstBitStr / 1000} kb/s from ${srcCodecStr} ${srcStream.channels}ch @ ${srcRateStr}${logSuffix}\n`;
            extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${audioEncoder(surroundCodec)}${dstBitArg}${six.arg}`
                + `${loudnormRideStamp(newStreamOutputIdx, six.measured)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
            extraArguments += langMetaArg(newStreamOutputIdx, langForWrite(srcStream));
            newStreamOutputIdx++;
            appendedAudio.push({ srcStream, codec: surroundCodec, channels: 6, bps: dstBitStr });
            created6chLangs.add(regionKeyVal);
            convert = true;
        };
        const append2ch = (srcStream, srcAudioIdx, srcCodecStr, srcRateStr, regionKeyVal, logSuffix) => {
            const newTitle = escMeta(buildTitle(srcStream, '2.0'));
            const enc = stereoEnc(newStreamOutputIdx);
            const two = stereoArg(newStreamOutputIdx, srcStream);
            workDone += `☐${streamTag(srcStream.index)}[downmix_to_stereo=${downmixToStereo}]${loudnormRideTag(two.changed)} Adding ${enc.logCodec} `
                + `stereo @ ${enc.rate}${enc.label ? ` (${enc.label})` : ''} from ${srcCodecStr} ${srcStream.channels}ch @ ${srcRateStr}${logSuffix}\n`;
            extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${enc.frag}${two.arg}`
                + `${loudnormRideStamp(newStreamOutputIdx, two.measured)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
            extraArguments += langMetaArg(newStreamOutputIdx, langForWrite(srcStream));
            newStreamOutputIdx++;
            appendedAudio.push({ srcStream, ...enc.record });
            created2chLangs.add(regionKeyVal);
            convert = true;
        };

        // The IN-PLACE twin of append2ch: replace this track with a stereo instead of adding one beside it. Four branches reach it (stereo tier,
        // downmix_to_stereo 'replace', the codec_force opus remix, the loudnorm-leftovers remix) - four copies 300 lines apart would drift. registerLang
        // claims the language's stereo slot (created2chLangs): every caller passes it for a GENUINE track, none for a secondary one - a commentary must
        // never occupy the main-language slot, and an unclaimed slot costs the language's surround master at the post-loop consumers (a guard_original
        // track flattened to stereo beside the copy already made from its sibling). Each caller keeps its own workDone line and terminal flag: codec_force
        // sets `forced`, which funnels into convert further down, so setting convert here would change what that branch means.
        const replace2ch = (srcStream, idx, enc, two, registerLang) => {
            extraArguments += ` -c:a:${idx} ${enc.frag}${two.arg}${loudnormRideStamp(idx, two.measured)}`
                + ` -metadata:s:a:${idx} "title=${escMeta(buildTitle(srcStream, '2.0'))}"`;
            extraArguments += langMetaArg(idx, langForWrite(srcStream));
            modifiedAudioIdx.add(idx);
            outputAudioOverride.set(idx, enc.record);
            if (registerLang) created2chLangs.add(registerLang);
        };

        for (let i = 0; i < workStreams.length; i++) {
            const ffstream = workStreams[i];
            const ffstreamCodec = (ffstream.codec_name || '').trim().toLowerCase();
            const ffstreamChannels = resolveChannels(ffstream);
            const writeLang = langForWrite(ffstream);
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
            // Each such surround track is transcoded in place independently — one stereo per track, preserving all of them. ONLY tier 'stereo' converts: a
            // secondary track left at downmix_secondary=surround falls through untouched here (codec_force/method_loudnorm may still act on it further down).
            // guard_lossless/guard_quality/guard_object_audio never protect a secondary or a non-surround-tier track (guardBlocks short-circuits false for
            // them), so there is no guarded-source case here: the stereo tier always transcodes in place.
            if (ffstream.awkTier === 'stereo' && ffstreamChannels > 2 && !modifiedAudioIdx.has(outputAudioIdx)) {
                // Downmix changes channel count, so the source bitrate isn't a comparable floor - stereoEnc uses the 2ch target (aac_vbr: no low-info tier).
                const enc = stereoEnc(outputAudioIdx);
                // Thread the setting that actually put this track on the stereo tier, so the log names the input the user would go change.
                const tierTag = ffstream.awkSecondaryTrack ? `downmix_secondary=${downmixSecondary}`
                    : (langStereoKeys.includes(ffstream.awkLangKey) ? 'language_stereo' : `language_unlisted=${langUnlisted}`);
                const two = stereoArg(outputAudioIdx, ffstream);
                workDone += `☐${streamTag(ffstream.index)}[${tierTag}]${loudnormRideTag(two.changed)} Transcoding ${ffstreamCodec} ${ffstreamChannels}ch `
                    + `@ ${srcRateStr} → ${enc.logCodec} stereo @ ${enc.rate} (${enc.label ? `${enc.label}, ` : ''}`
                    + `${ffstream.awkSecondaryTrack ? 'secondary' : 'stereo tier'})\n`;
                replace2ch(ffstream, outputAudioIdx, enc, two, ffstream.awkSecondaryTrack ? '' : ffstreamRegionKey);
                convert = true;
            }
            } else {
            // ====== DOWNMIX TO 6 CHANNELS ======
            // One 6ch per language, from its best >6ch source. A guarded source (guardBlocks) is never replaced in place, so 'replace' becomes 'add' for it.
            if (downmixToSix !== 'disabled' && ffstreamChannels > 6 && !hasSixForLang(ffstreamRegionKey)) {
                const newTitle = escMeta(buildTitle(ffstream, '5.1'));
                const sixMode = (downmixToSix === 'replace' && guardBlocks(ffstream, surroundCodec, 6, ffstreamChannels)) ? 'add' : downmixToSix;

                if (sixMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    const dstBitArg = encoderArgsIdx(surroundCodec, 6, outputAudioIdx);
                    const dstBitStr = resolveBitrate(surroundCodec, 6);
                    // guardBlocks already passed for sixMode==='replace' (loudnorm rides on that guarantee - see stereoArg above); sixArg builds the
                    // -ac 6 / aformat=channel_layouts=5.1 snippet.
                    const six = sixArg(outputAudioIdx, ffstream);
                    workDone += `☐${streamTag(ffstream.index)}[downmix_to_six=${downmixToSix}]${loudnormRideTag(six.changed)} Transcoding `
                        + `${ffstreamCodec} ${ffstreamChannels}ch @ ${srcRateStr} → ${surroundCodec} 6ch @ ${dstBitStr / 1000} kb/s\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${audioEncoder(surroundCodec)}${dstBitArg}${six.arg}`
                        + `${loudnormRideStamp(outputAudioIdx, six.measured)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    extraArguments += langMetaArg(outputAudioIdx, writeLang);
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: surroundCodec, channels: 6, bps: dstBitStr });
                    created6chLangs.add(ffstreamRegionKey);
                    convert = true;
                } else if (sixMode === 'add') {
                    append6ch(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamRegionKey, '');
                }
            }

            // ====== DOWNMIX TO 2 CHANNELS ======
            // One stereo track per language, from its best >2ch source, only when the language has no primary stereo already. A guarded source (guardBlocks):
            // 'replace' becomes 'add'. When 'replace' is requested but downmix_to_six already consumed this same source in place (single >6ch source,
            // both downmixes enabled), the in-place slot is taken, so we fall back to ADDING a stereo from the original input. The user enabled
            // downmix_to_stereo expecting a 2.0 in the output, so a lone 7.1 with both downmixes on yields a 5.1 and a 2.0 rather than silently dropping
            // the stereo.
            if (downmixToStereo !== 'disabled' && ffstreamChannels > 2 && !hasStereoForLang(ffstreamRegionKey)) {
                const twoMode = (downmixToStereo === 'replace' && guardBlocks(ffstream, stereoCodec, 2, ffstreamChannels)) ? 'add' : downmixToStereo;

                if (twoMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    // Downmix source is surround; its bitrate describes N channels not 2, so stereoEnc uses the 2ch target (as in the stereo tier above).
                    const enc = stereoEnc(outputAudioIdx);
                    const two = stereoArg(outputAudioIdx, ffstream);
                    workDone += `☐${streamTag(ffstream.index)}[downmix_to_stereo=${downmixToStereo}]${loudnormRideTag(two.changed)} Transcoding `
                        + `${ffstreamCodec} ${ffstreamChannels}ch @ ${srcRateStr} → ${enc.logCodec} stereo @ ${enc.rate}`
                        + `${enc.label ? ` (${enc.label})` : ''}\n`;
                    replace2ch(ffstream, outputAudioIdx, enc, two, ffstreamRegionKey);
                    convert = true;
                } else if (twoMode === 'add' || (twoMode === 'replace' && modifiedAudioIdx.has(outputAudioIdx))) {
                    append2ch(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamRegionKey, '');
                }
                }
            }

            // ====== FORCE CODEC ======
            // Skip a track guard_lossless/guard_quality/guard_object_audio protects — guardBlocks: a lossless source, or a quality-tier target that
            // scores lower. codec_force never overrides guard protection, in any mode including 'all', so a guarded track is left in its source codec.
            // Also skip when the source has more channels than the target codec supports (ac3/eac3 max 6ch, opus/aac max 8ch) to avoid an ffmpeg encode
            // failure. Channel count is resolved from ffprobe, then mediaInfo, then a channel-layout string (resolveChannels): a track no source can
            // measure is left untouched rather than guessed, since a wrong count could route it to a codec that can't hold its real channels and fail.
            const forceChannels = (forceCodec !== 'false' && !modifiedAudioIdx.has(outputAudioIdx)) ? ffstreamChannels : -1;
            if (forceChannels === 0)
                skipDone += noChannelCountSkip(ffstream.index, `codec_force=${forceCodec}`, NO_CHANNEL_COUNT_CODEC);
            if (forceChannels > 0) {
                const isStereo = forceChannels <= 2;
                const targetCodec = isStereo ? stereoCodec : surroundCodec;
                // aac_vbr is only valid for stereo; identity checks compare against the aac family, the stream side folded through codecFamilyOf (see
                // stereoCodecFamily above). The logs below keep the RAW codec name so the track is still identifiable.
                const targetCodecFamily = aacFamily(targetCodec);

                // Family equality ends it here: a rate-control-only change (an aac track under codec_stereo=aac_vbr) is not worth a lossy
                // generation on its own. That is a judgement about SPENDING an encode, though, not about which codec is wanted - so when
                // loudnorm re-encodes the track anyway, the leftovers loop revisits the setting and does honour it. See the codec choice there.
                if (codecFamilyOf(ffstream) !== targetCodecFamily) {
                    const shouldForce = forceCovers(isStereo, forceChannels);

                    const targetMaxCh = codecMaxCh(targetCodec);

                    if (shouldForce && forceChannels > targetMaxCh) {
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Not forcing ${targetCodecFamily} - ${ffstreamCodec} `
                            + `${forceChannels}ch @ ${srcRateStr} exceeds the ${targetMaxCh}ch limit for ${targetCodecFamily}; enable downmix_to_six to `
                            + `create a 5.1 from it first\n`;
                    } else if (shouldForce && guardBlocks(ffstream, targetCodec, forceChannels, forceChannels)) {
                        // Guarded: forcing this codec would irreversibly lose detail the target can't hold - see the FORCE CODEC note above.
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Not forcing ${targetCodecFamily} - would lose detail vs `
                            + `${codecDisplayName(ffstream)} ${forceChannels}ch @ ${srcRateStr} (guard_lossless=${guardLossless}, `
                            + `guard_quality=${guardQuality}, guard_object_audio=${guardObjectAudio}); left as ${ffstreamCodec}\n`;
                    } else if (shouldForce) {
                        // Guard the force-to-opus path against libopus-incompatible layouts (method_layout_err). Only opus is affected - AC3/EAC3/AAC
                        // take any layout. `forced` gates the run's convert flag so a keep/defer makes no change (and doesn't cause a needless re-run).
                        const srcLayout = (ffstream.channel_layout || '').toLowerCase().trim();
                        const opusBad = targetCodec === 'opus' && forceChannels > 2 && !opusAcceptsLayout(forceChannels, srcLayout);
                        const relabel = opusBad ? OPUS_RELABEL[srcLayout] : null;
                        const layoutName = srcLayout || `${forceChannels}ch`;
                        // remix→stereo defers when the language already has a stereo (hasStereoForLang, which is where the duplicate rule is explained);
                        // fall back to keep.
                        const remixDefer = opusBad && !relabel && methodLayoutErr === 'remix'
                            && hasStereoForLang(ffstreamRegionKey);
                        let forced = false;

                        if (opusBad && !relabel && (methodLayoutErr === 'keep' || methodLayoutErr === 'drop' || remixDefer)) {
                            // No lossless relabel exists (relabelable layouts fall through to the transcode branch below in every
                            // mode). keep; a remix that deferred to an existing stereo; or a drop the pre-pass couldn't apply - leave
                            // the source codec. Real drops already happened in the pre-pass (before the index map); a drop reaches here
                            // only when the pre-pass couldn't remove it: the last audio track, or a downmix it expected to convert this
                            // track was pre-empted (per-language slot already filled). Report the actual reason, not a fixed one.
                            let why;
                            if (remixDefer) why = ' (a stereo already exists for this language)';
                            else if (methodLayoutErr === 'drop') why = countSurvivingAudio() <= 1 ? ' (kept - it is the last audio track)'
                                : ' (kept - no downmix converted it to an opus-safe layout)';
                            else why = ', enable a downmix option or set method_layout_err to drop/remix';
                            skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Not forcing opus - libopus can't encode a `
                                + `${layoutName} layout; left as ${ffstreamCodec}${why}\n`;
                        } else if (opusBad && methodLayoutErr === 'remix' && !relabel) {
                            // remix→stereo: downmix in place to a codec_stereo track (NOT opus) so it stays stereo-codec-consistent and idempotent (a stereo
                            // opus would be re-forced to codec_stereo next run). Mirrors the in-place stereo tier; the 2ch table target (surround source
                            // bitrate isn't a comparable floor).
                            const enc = stereoEnc(outputAudioIdx);
                            const two = stereoArg(outputAudioIdx, ffstream);
                            workDone += `☐${streamTag(ffstream.index)}[method_layout_err=${methodLayoutErr}]${loudnormRideTag(two.changed)} Remixing `
                                + `${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} (${layoutName}, opus-incompatible) → ${enc.logCodec} stereo @ `
                                + `${enc.rate}${enc.label ? ` (${enc.label})` : ''}\n`;
                            // registers the remix-created stereo so a later same-language downmix / remix defers to it
                            replace2ch(ffstream, outputAudioIdx, enc, two, ffstream.awkSecondaryTrack ? '' : ffstreamRegionKey);
                            forced = true;
                        } else if (targetCodec === 'aac_vbr') {
                            // aac_vbr stereo force: aacVbrArgsIdx picks this node's best VBR AAC encoder, at its leaner tier for a low-bitrate source.
                            // srcBitrate is meaningful here — this is a codec swap at the same channel count.
                            const { encoder, args, approxRate, label } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true, forceChannels);
                            // No pre-filter (same channel count, no relabel) - measure the source directly. guardBlocks for this force already
                            // passed above (loudnorm rides on that guarantee - see stereoArg).
                            let aacVbrFilter = '';
                            let aacVbrLoud = { measured: false, changed: false };
                            if (methodLoudnorm !== 'disabled') {
                                const { filter, changed, measured } = buildLoudnormFilter(ffstream.index, srcAudioIdx, '', LOUDNORM_PRESETS[methodLoudnorm]);
                                if (filter) aacVbrFilter = ` -filter:a:${outputAudioIdx} "${filter}"`;
                                aacVbrLoud = { measured, changed };
                            }
                            workDone += `☐${streamTag(ffstream.index)}[codec_force=${forceCodec}]${loudnormRideTag(aacVbrLoud.changed)} Transcoding `
                                + `${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → aac ${forceChannels}ch @ ${approxRate} (${label})\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}${aacVbrFilter}`
                                + `${loudnormRideStamp(outputAudioIdx, aacVbrLoud.measured)}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: forceChannels, bps: 0, approxRate });
                            forced = true;
                        } else {
                            // Same channel count, codec swap - optionally a LOSSLESS opus relabel (5.0(side)→5.0 via channelmap, keeps all channels).
                            // resolveBitrate caps the target at the source bitrate when the target codec scores >= the source (guard via awkQuality);
                            // lossless skips the cap; a high-bitrate lossy source is bounded by the codec ceiling.
                            const relabelFilter = relabel ? `channelmap=map=${relabel.map}:channel_layout=${relabel.layout}` : '';
                            const note = relabel ? ` (relabel ${layoutName}→${relabel.layout})` : '';
                            // guardBlocks for this force already passed above (loudnorm rides on that guarantee - see stereoArg). The relabel filter
                            // (if any) is the pre-filter loudnorm's measurement must be chained after, so the analysis reflects the actual
                            // post-relabel signal - though a lossless channelmap relabel doesn't change loudness, keeping the chain order consistent.
                            let layoutFilter = '';
                            let layoutLoud = { measured: false, changed: false };
                            if (methodLoudnorm !== 'disabled') {
                                const { filter, changed, measured } = buildLoudnormFilter(ffstream.index, srcAudioIdx, relabelFilter,
                                    LOUDNORM_PRESETS[methodLoudnorm]);
                                if (filter) layoutFilter = ` -filter:a:${outputAudioIdx} "${filter}"`;
                                layoutLoud = { measured, changed };
                            } else if (relabelFilter) {
                                layoutFilter = ` -filter:a:${outputAudioIdx} "${relabelFilter}"`;
                            }
                            const dstBitArg = encoderArgsIdx(targetCodec, forceChannels, outputAudioIdx, srcBitrate, ffstream.awkLossless,
                                ffstream.awkQuality);
                            const dstBitStr = resolveBitrate(targetCodec, forceChannels, srcBitrate, ffstream.awkLossless, ffstream.awkQuality);
                            workDone += `☐${streamTag(ffstream.index)}[codec_force=${forceCodec}]${loudnormRideTag(layoutLoud.changed)} Transcoding `
                                + `${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → ${targetCodec} ${forceChannels}ch @ `
                                + `${dstBitStr / 1000} kb/s${note}\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${audioEncoder(targetCodec)}${dstBitArg}${layoutFilter}`
                                + `${loudnormRideStamp(outputAudioIdx, layoutLoud.measured)}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: targetCodec, channels: forceChannels, bps: dstBitStr });
                            forced = true;
                        }
                        if (forced) convert = true;
                    }
                }
            }
        }

        // ===== LAYOUT-DROP DOWNMIX DERIVATIVES =====
        // A source the layout-drop pre-pass removed (un-writable opus surround, method_layout_err=drop) may have been the sole source its language's
        // downmix would have derived from. The source is correctly gone, but the derivative the user configured must still be created - from the ORIGINAL
        // input stream via -map 0:a:N, appended like any downmix add. Only create it when the language didn't otherwise get one this run (created*Langs)
        // or already have one among survivors (existing*Langs), so a redundant dropped source produces nothing. Mirrors the downmix add branches (title,
        // codec, loudnorm via stereoArg / the 5.1 filter). These new tracks are opus-safe (stereo -> codec_stereo; a -ac 6 downmix yields a 5.1 layout).
        for (const s of layoutDroppedDeriveSources) {
            const regionKey = s.awkRegionKey;
            const srcAudioIdx = inputAudioIdxMap.get(s.index);
            if (srcAudioIdx === undefined) continue;
            const srcRateStr = srcRateToken(s);
            const srcCodec = (s.codec_name || 'unknown').trim().toLowerCase();
            // 5.1 derivative from a >6ch source (downmix_to_six), when the language still lacks one.
            if (s.channels > 6 && downmixToSix !== 'disabled' && !hasSixForLang(regionKey)) {
                append6ch(s, srcAudioIdx, srcCodec, srcRateStr, regionKey, " (source dropped - libopus can't encode its layout)");
            }
            // Stereo derivative (downmix_to_stereo), when the language still lacks one.
            if (downmixToStereo !== 'disabled' && !hasStereoForLang(regionKey)) {
                append2ch(s, srcAudioIdx, srcCodec, srcRateStr, regionKey, " (source dropped - libopus can't encode its layout)");
            }
        }
        // ===== END LAYOUT-DROP DOWNMIX DERIVATIVES =====

        // ===== LOUDNORM: untouched tracks =====
        // Tracks none of the downmix/force/remix sites above touched at all (the common case - already the right codec/channels, nothing else needed). Runs
        // over EVERY kept audio stream directly (not workStreams/candidateStreams, which exist for codec_force/the stereo tier's own narrower eligibility and
        // would silently exclude secondary/commentary tracks under default settings) - guard_lossless/guard_quality/guard_object_audio are the only scope gate.
        // A track ALSO being modified by one of the sites above rides on that same re-encode instead (each site's own stereoArg/layoutFilter/inline block calls
        // buildLoudnormFilter at its own emit point); this loop only handles the leftovers.
        if (methodLoudnorm !== 'disabled') {
            const preset = LOUDNORM_PRESETS[methodLoudnorm];
            for (const ffstream of audioStreams) {
                if (removedIndices.has(ffstream.index)) continue;
                const outputAudioIdx = outputAudioIdxMap.get(ffstream.index);
                const srcAudioIdx = inputAudioIdxMap.get(ffstream.index);
                if (outputAudioIdx === undefined || srcAudioIdx === undefined || modifiedAudioIdx.has(outputAudioIdx)) continue;

                const channels = resolveChannels(ffstream);
                if (channels <= 0) {
                    skipDone += noChannelCountSkip(ffstream.index, `method_loudnorm=${methodLoudnorm}`, NO_CHANNEL_COUNT_CODEC);
                    continue;
                }
                const ffstreamCodec = (ffstream.codec_name || '').trim().toLowerCase();
                const isStereo = channels <= 2;
                // WHICH codec this re-encode lands on. Two candidates, in preference order: keepCodec - the codec the track already has, whenever this
                // plugin can encode it (what codec_force=false means, and the only option for a source outside our encodable domain: a kept DTS core,
                // an MP3); configuredCodec - codec_stereo/codec_surround, when codec_force's scope covers this track (the FORCE CODEC block may have
                // declined it as not worth a lossy generation on its own, but the generation is already being spent on the gain correction - this is
                // what makes codec_stereo=aac_vbr reach a track already aac). A guard-protected or over-channel-limit target falls back to the other
                // candidate rather than cancelling the pass, so enabling codec_force can never silently switch loudnorm off.
                const configuredCodec = isStereo ? stereoCodec : surroundCodec;
                const keepCodec = ENCODABLE_CODECS.includes(ffstreamCodec) ? ffstreamCodec : configuredCodec;
                const codecMaxChFor = (c) => codecMaxCh(aacFamily(c));
                const reachable = (c) => channels <= codecMaxChFor(c) && !guardBlocks(ffstream, c, channels, channels);
                const wantCodec = forceCovers(isStereo, channels) ? configuredCodec : keepCodec;
                const targetCodec = reachable(wantCodec) ? wantCodec : (reachable(keepCodec) ? keepCodec : null);
                if (targetCodec === null) {
                    // Both candidates are out of reach; report against keepCodec, the one the track would otherwise have stayed in.
                    if (channels > codecMaxChFor(keepCodec))
                        skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Skipping - ${ffstreamCodec} ${channels}ch exceeds the `
                            + `${codecMaxChFor(keepCodec)}ch limit for ${aacFamily(keepCodec)}\n`;
                    else
                        skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Not normalizing - would lose detail vs `
                            + `${codecDisplayName(ffstream)} ${channels}ch (guard_lossless=${guardLossless}, guard_quality=${guardQuality}, `
                            + `guard_object_audio=${guardObjectAudio}); left as ${ffstreamCodec}\n`;
                    continue;
                }
                const targetFamily = aacFamily(targetCodec);

                // Cache check: this stream isn't being touched by anything else this run, so if it already carries a tag matching the CURRENT preset,
                // its content hasn't changed since we last measured/corrected it against this exact target - trust it and skip the measurement
                // subprocess entirely. A stale tag from a DIFFERENT preset (or no tag at all) falls through to a fresh measurement below.
                if (loudnormTagMatchesPreset(ffstream)) continue;

                // Converging a non-opus source to opus (ffstreamCodec isn't opus-encodable, so targetCodec fell through to codec_surround=opus): if libopus
                // encode this track's layout, a bare -c:a opus would abort the whole ffmpeg job. Relabel losslessly when possible (chained before loudnorm);
                // otherwise defer to method_layout_err. 'remix' downmixes to codec_stereo (+ loudnorm) in place, unless a stereo already exists for this
                // language (remixDefer, through the same hasStereoForLang predicate the codec_force path uses); 'keep' - and 'drop', which can't remove a track
                // once the audio index maps are built (the codec_force path drops such a track in the pre-pass) - leave it in its source codec, un-normalized.
                let loudnormRelabel = '';
                if (targetFamily === 'opus' && channels > 2 && ffstreamCodec !== 'opus') {
                    const lay = (ffstream.channel_layout || '').toLowerCase().trim();
                    if (!opusAcceptsLayout(channels, lay)) {
                        const relabel = OPUS_RELABEL[lay];
                        const remixDefer = !relabel && methodLayoutErr === 'remix'
                            && hasStereoForLang(ffstream.awkRegionKey);
                        if (relabel) {
                            // lossless relabel to an opus-safe layout, chained ahead of loudnorm
                            loudnormRelabel = `channelmap=map=${relabel.map}:channel_layout=${relabel.layout}`;
                        } else if (methodLayoutErr === 'remix' && !remixDefer) {
                            // MEASURE FIRST, then decide. The gain correction is the only mandate this loop has - with method_loudnorm=disabled it never runs
                            // at all and the track keeps its source codec and channels - so a track already within LOUDNORM_TOLERANCE_LU (or one the analysis
                            // cap left unmeasured) must not be flattened from surround to stereo for nothing. Every other exit of this loop already bails on
                            // !changed; this is the one that used to commit before looking. Contrast the codec_force remix, which is correct to fire
                            // unconditionally: there the codec change IS the requested operation and loudnorm merely rides along.
                            const two = stereoArg(outputAudioIdx, ffstream);
                            if (!two.changed) {
                                if (loudnormTagPersists && two.measured) {
                                    workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Stamping awk_loudnorm=${methodLoudnorm} `
                                        + `(already within tolerance) - future runs skip re-measuring while loudnorm stays "${methodLoudnorm}"\n`;
                                    extraArguments += loudnormStampArg(outputAudioIdx);
                                    convert = true;
                                }
                                continue;
                            }
                            const enc = stereoEnc(outputAudioIdx);
                            workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Normalizing ${ffstreamCodec} ${channels}ch → `
                                + `${enc.logCodec} stereo @ ${enc.rate} (${enc.label ? `${enc.label}; ` : ''}remixed - libopus can't encode a `
                                + `${lay || `${channels}ch`} layout)\n`;
                            // registers the remix-created stereo so a later same-language downmix / remix defers to it
                            replace2ch(ffstream, outputAudioIdx, enc, two, ffstream.awkSecondaryTrack ? '' : ffstream.awkRegionKey);
                            convert = true;
                            continue;
                        } else {
                            const why = remixDefer ? 'a stereo already exists for this language' : `method_layout_err=${methodLayoutErr}`;
                            skipDone += `☒${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Not normalizing - libopus can't encode a `
                                + `${lay || `${channels}ch`} layout; left as ${ffstreamCodec} (${why})\n`;
                            continue;
                        }
                    }
                }

                const srcBitrate = Number(ffstream.bit_rate || 0);
                const { filter, changed, measured } = buildLoudnormFilter(ffstream.index, srcAudioIdx, loudnormRelabel, preset);
                if (!changed) {
                    // Already within tolerance. On a tag-persisting container, stamp it (a metadata-only remux) so a FUTURE run can skip re-measuring while
                    // the preset stays the same. On a container that would drop the tag, do NOTHING (a true no-op) - stamping there would just remux every
                    // reprocess forever without ever caching (see loudnormTagPersists above). A track the analysis cap left unmeasured also lands here with
                    // changed:false, and must NOT be stamped: the cache would claim a loudness nothing ever read, and every future run would trust it and
                    // skip the track for good. It is simply left at source loudness, as the cap warning says, for a later pass to pick up.
                    if (loudnormTagPersists && measured) {
                        workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Stamping awk_loudnorm=${methodLoudnorm} (already `
                            + `within tolerance) - future runs skip re-measuring while loudnorm stays "${methodLoudnorm}"\n`;
                        extraArguments += loudnormStampArg(outputAudioIdx);
                        convert = true;
                    }
                    continue;
                }

                if (targetCodec === 'aac_vbr') {
                    const { encoder, args, approxRate, label } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true, channels);
                    workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Normalizing ${ffstreamCodec} ${channels}ch → aac `
                        + `${channels}ch @ ${approxRate} (${label})\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args} -filter:a:${outputAudioIdx} "${filter}"${loudnormStampArg(outputAudioIdx)}`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels, bps: 0, approxRate });
                } else {
                    // Format in == format out (the plain loudnorm case, and codec_force aimed at the codec the track already uses): match the source rate
                    // rather than re-deriving a ladder target, which would re-encode a 192k mono aac at the 160k aac ceiling and build in a loss nobody
                    // asked for. Only a genuine codec change takes resolveBitrate's transcode target. An unmeasurable source rate falls back to it too.
                    const sameFormat = targetFamily === codecFamilyOf(ffstream);
                    const matchedBps = sameFormat ? sameFormatBitrate(targetFamily, channels, srcBitrate) : 0;
                    const dstBitStr = matchedBps || resolveBitrate(targetCodec, channels, srcBitrate, ffstream.awkLossless, ffstream.awkQuality);
                    const dstBitArg = encoderArgsBps(targetCodec, outputAudioIdx, dstBitStr);
                    const srcRateStr = srcRateToken(ffstream);
                    const note = sameFormat ? (matchedBps ? ' (source rate matched)' : '') : ` (converged from ${ffstreamCodec})`;
                    workDone += `☐${streamTag(ffstream.index)}[method_loudnorm=${methodLoudnorm}] Normalizing ${ffstreamCodec} ${channels}ch @ ${srcRateStr} → `
                        + `${targetCodec} ${channels}ch @ ${dstBitStr / 1000} kb/s${note}\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${audioEncoder(targetCodec)}${dstBitArg} -filter:a:${outputAudioIdx} "${filter}"`
                        + `${loudnormStampArg(outputAudioIdx)}`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: targetCodec, channels, bps: dstBitStr });
                }
                convert = true;
            }
        }
        // ===== END LOUDNORM: untouched tracks =====


        // Build the predicted output stream summary for the closing log line. Audio streams keep their original codec unless an in-place override was
        // recorded; removed duplicates are dropped; newly created downmix tracks are appended (matching ffmpeg's -map 0 then -map 0:a:N ordering). All
        // streams are enriched with resolveStreamBitrate before summariseStream, matching the input summary line - so untouched tracks (e.g. a copied stereo
        // track) show their bitrate correctly. A re-encoded track is summarised through summariseStream's output descriptor, which prints an aac_vbr
        // override's approximate rate (~192k) and drops the source-only markers a fresh encode cannot carry.
        const buildOutputSummary = () => {
            const tokens = [];
            for (const s of file.ffProbeData.streams) {
                const enriched = enrichStream(s);
                if (codecTypeOf(s) === 'audio') {
                    if (removedIndices.has(s.index)) continue;
                    const ov = outputAudioOverride.get(outputAudioIdxMap.get(s.index));
                    if (ov) {
                        // One path for every override: summariseStream builds the output token from the encode's own codec/channels/rate, so a VBR
                        // override's approximate rate ('~192k', carried in approxRate) prints through the same builder as a fixed-bitrate one.
                        tokens.push(summariseStream(enriched, { codec: ov.codec, channels: ov.channels, bps: ov.bps, rate: ov.approxRate }));
                    } else {
                        tokens.push(summariseStream(enriched));
                    }
                } else
                    tokens.push(summariseStream(enriched));
            }
            for (const a of appendedAudio) {
                tokens.push(summariseStream(a.srcStream, { codec: a.codec, channels: a.channels, bps: a.bps, rate: a.approxRate }));
            }
            return tokens.join('');
        };

        if (convert === true) {
            // Dispositions (default flag) are intentionally untouched: ffmpeg copies the source disposition onto mapped/transcoded outputs, so a
            // downmix from a default-flagged source also carries default - two default tracks, acceptable (near-identical content, players cope);
            // reassigning default is outside this plugin's scope. mp4/mov muxers drop a custom GLOBAL tag (clean_and_remux's awk_recovered) on a -c copy
            // remux unless told to keep it, which would re-trigger recovery next pass - preserve it. (Per-stream custom tags like awk_loudnorm are NOT
            // rescued by this flag, verified against the real mov muxer - why loudnorm caches on Matroska only; see loudnormTagPersists.)
            const mp4KeepTags = isMp4Family(file.container) ? ' -movflags use_metadata_tags' : '';
            // The -strict level this mp4/mov -c copy remux needs (see mp4StrictArg): Dolby Vision's dvcC/dvvC boxes, or a TrueHD track the mp4 muxer refuses
            // without it. The second list is what this run actually COPIES - a track removedIndices drops, or an in-place transcode replaces (recorded in
            // outputAudioOverride, keyed by output audio index), is left out, so a TrueHD track on its way out never asks for a flag the output cannot need.
            const copiedStreams = file.ffProbeData.streams
                .filter((s) => !removedIndices.has(s.index) && !outputAudioOverride.has(outputAudioIdxMap.get(s.index)));
            const strictArg = mp4StrictArg(file.container, file.ffProbeData.streams, copiedStreams);
            response.preset += `<io>-map 0 -c copy${extraArguments}${strictArg}${globalOutputOpt}${mp4KeepTags}`;
            response.infoLog += workDone;
            response.infoLog += skipDone;
            response.infoLog += `☑Expected results: ${buildOutputSummary()}\n`;
            response.processFile = true;
        } else {
            response.infoLog += workDone;
            response.infoLog += skipDone;
            response.infoLog += `☑Audio already has the correct formats available\n`;
            response.processFile = false;
        }
        return response;
    } catch (err) {
        failUnexpected(err);   // AwkFailFile → rethrow unchanged; anything else → annotate + fail the file with the full infoLog
    }
};
module.exports.details = details;
module.exports.plugin = plugin;
