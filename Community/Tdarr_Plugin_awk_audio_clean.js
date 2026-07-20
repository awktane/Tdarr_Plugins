/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_awk_audio_clean',
    Stage: 'Pre-processing',
    Name: 'Clean up the audio streams based on language, channels, and quality',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: `This plugin curates a file's audio tracks: it decides which to KEEP and at what quality - and which to DROP - by language (keep at surround, keep downmixed to stereo, or delete an unlisted language) and by role (commentary, audio-description, and M&E tracks follow their own keep / stereo / delete setting). It can also downmix surround to 5.1 or stereo, force tracks to a chosen codec, remove duplicate tracks, and apply two-pass EBU R128 loudness normalization. Guard options protect lossless, object-audio (Atmos/DTS:X), high-quality, and original-language tracks from destructive changes.\n\n
                  Because it can delete and re-encode audio, set the options deliberately - this can be destructive, especially with incorrectly tagged audio tracks`,
    Version: '3.999.21',
    Tags: 'pre-processing,ffmpeg,audio_only,configurable',
    Inputs: [
        {
            name: 'language_stereo',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Languages to keep, but downmixed to stereo - a dub you want available without spending the space on its surround. Each surround track in one of these languages is transcoded in place to a single stereo codec_stereo track (using the method_stereo_downmix matrix); a track already at 2 channels or fewer is left alone.
                \\nBlank (default) means no language is forced to stereo. Same matching rules as language_surround - one form is enough, und/mul/zxx/mis are matched literally.
                \\nThese tracks are never protected by guard_lossless/guard_quality/guard_object_audio, so the downmix always happens.
                \\nA language in BOTH this list and language_surround is treated as surround.
                \\nExample:\\n
                    spa,deu\\n
                    Keep the Spanish and German dubs, but only in stereo`,
        },
        {
            name: 'language_surround',
            type: 'string',
            defaultValue: '',
            inputUI: { type: 'text' },
            tooltip: `Languages to keep at full quality (surround). These follow downmix_to_six, downmix_to_stereo and codec_force, and are protected by guard_lossless/guard_quality/guard_object_audio. If blank then every language is treated as surround.
                \\nStreams with no language tag are treated as though their language is "und".
                \\nOne form is enough - en, eng, or English all match the same language (including region variants like en-US), so you don't need to list every variant.
                \\nA language in neither language_surround nor language_stereo is "unlisted" and follows language_unlisted. A language listed in BOTH lists is treated as surround (this list wins).
                \\nException - dormancy: if NO genuine (non-commentary, non-descriptive) track matches language_surround or language_stereo, the language settings go dormant and every genuine track is kept at surround, with language_unlisted=delete suppressed - so a foreign-language-only file (e.g. Japanese-only when the lists say English) keeps all of its audio instead of losing it.
                \\nException - guard_original, when enabled, keeps an 'original'-disposition track (a foreign film's original-language audio) at surround even in an unlisted language, and vetoes deleting it. See guard_original.
                \\nCommentary, descriptive and M&E tracks are secondary regardless of language - they follow downmix_secondary, not these lists.
                \\nExample:\\n
                    eng,fra,jpn\\n
                    English, French, and Japanese. The special codes und (undefined), mul (multiple), zxx (no linguistic content) and mis (no language code) are matched literally.
                \\nExample:\\n
                    eng,und\\n
                    English and undefined`,
        },
        {
            name: 'language_unlisted',
            type: 'string',
            defaultValue: 'surround',
            inputUI: {
                type: 'dropdown',
                options: ['surround', 'stereo', 'delete'],
            },
            tooltip: `What to do with a genuine track whose language is in NEITHER language_surround nor language_stereo. Only applies when at least one track DOES match one of those lists - otherwise dormancy keeps everything at surround (see language_surround).
                \\nCommentary/descriptive/M&E tracks are not covered here - they follow downmix_secondary.
                \\n=====
                \\nActions
                \\n=====
                \\nIf surround - (Default) an unlisted language is kept at full quality, exactly as if it were in language_surround. Nothing is lost; use this until you trust your lists.
                \\nIf stereo   - an unlisted language is kept but downmixed to stereo, exactly as if it were in language_stereo.
                \\nIf delete   - an unlisted language is removed from the file. A track is only removed when a plain (non-commentary/descriptive/M&E) track of the SAME language survives, and never if it would leave the file with no audio at all. guard_original vetoes the delete for an 'original'-flagged track.`,
        },
        {
            name: 'downmix_secondary',
            type: 'string',
            defaultValue: 'surround',
            inputUI: {
                type: 'dropdown',
                options: ['surround', 'stereo', 'delete'],
            },
            tooltip: `What to do with SECONDARY tracks - commentary, visual impaired (audio description) and M&E tracks. This is a role, not a language: a secondary track follows this setting whatever its language, and never language_surround/language_stereo/language_unlisted.
                \\nUnlike the language downmix paths, each surround secondary track is handled in place and independently - one stereo per secondary track, preserving all of them. Secondary tracks are never protected by guard_lossless/guard_quality/guard_object_audio, so stereo always transcodes them.
                \\n=====
                \\nActions
                \\n=====
                \\nIf surround - (Default) secondary tracks are left at their source channels, untouched by the downmix paths (codec_force and method_loudnorm still apply).
                \\nIf stereo   - each secondary track with more than 2 channels is transcoded in place to a stereo codec_stereo track (using the method_stereo_downmix matrix).
                \\nIf delete   - secondary tracks are removed. Safety: a track is only removed when a plain (non-commentary/descriptive/M&E) track of the SAME language survives, and never if it would leave the file with no audio at all - so the only track of a file, or a lone audio-description track with no plain track in its language, is always kept.`,
        },
        {
            name: 'downmix_to_six',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'replace', 'true'],
            },
            tooltip: `Specify if we should downmix a 5.1 track if one doesn't already exist from the best quality higher channel track for that language (from language_surround if specified) that is not a secondary track (commentary, descriptive, etc).
                \\nIf a 5.1 track for the same language already exists or if no higher channel track exists then no new 6 channel track is created.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - no new 6 channel track is created from higher channel surround channel
                \\nIf replace - a new codec_surround 6 channel track replaces the higher channel track used to create it unless protected by guard_lossless/guard_quality/guard_object_audio.
                \\nIf true    - a new codec_surround 6 channel track will be created from the higher channel track and both will be kept`,
        },
        {
            name: 'downmix_to_stereo',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false', 'replace', 'true'],
            },
            tooltip: `Specify if we should downmix a 2 channel track if one doesn't already exist from the best quality higher channel track for that language that is not a secondary track (commentary, descriptive, etc). If no higher channel track exists no work is done.
                \\nIf a stereo track for the same language already exists or if no higher channel track exists then no new stereo channel track is created.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false   - no new 2 channel track is created from surround channel
                \\nIf replace - a new 2 channel track with codec codec_stereo replaces the higher channel track used to create it unless it was created by downmix_to_six.
                \\nIf true    - a new 2 channel track with codec_stereo will be created from a higher channel track and both will be kept`,
        },
        {
            name: 'codec_force',
            type: 'string',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: ['false','6below','2below','all'],
            },
            tooltip: `Transcode all tracks to the codecs specified in codec_surround and codec_stereo depending on their channel count. Note streams with more channels than supported by the codec will not be transcoded.
                \\n=====
                \\nActions
                \\n=====
                \\nIf false  - Codecs will be left as is and those two settings will only apply to new tracks
                \\nIf 2below - Streams with two or fewer channels will be transcoded to codec_stereo (unless protected by guard_lossless/guard_quality/guard_object_audio). Anything above that will be left in its original codec.
                \\nIf 6below - Streams with six or fewer channels will be transcoded to codec_surround (unless protected by guard_lossless/guard_quality/guard_object_audio). Tracks with two or fewer channel will be converted to codec_stereo.
                \\nIf all   - Like 6below but also transcodes surround tracks above six channels, each subject to its codec's channel limit (ac3/eac3 6ch, aac/opus 8ch). guard_lossless/guard_quality/guard_object_audio still apply in every mode - a track they protect is left in its source codec; 'all' differs from 6below only by the channel-count threshold.`,
        },
        {
            name: 'codec_stereo',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','aac_vbr','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created stereo tracks. AAC and Opus are the most compatible choices for modern media servers and clients. EAC3 is useful for Dolby branding on compatible devices. AC3 is the most broadly compatible legacy choice.
                \\naac_vbr uses libfdk_aac in VBR mode (-vbr 5, ~192-224 kb/s) for higher quality than native AAC CBR. Falls back to -vbr 4 (~128-144 kb/s) when codec_force is converting an existing stereo track whose bitrate is at or below 144 kb/s, matching the lower-information source.
                \\nlibfdk_aac ships in the Linux/Windows builds but not the Mac one; on a node whose ffmpeg lacks it, aac_vbr automatically uses Apple's aac_at (AudioToolbox) VBR on Mac, or native aac 256 kb/s on any other build without it, so the file still processes.
                \\nExisting AAC tracks are never re-encoded when aac_vbr is selected — the AAC family check prevents a generational loss for no gain.`,
        },
        {
            name: 'codec_surround',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac','ac3','eac3','opus'],
            },
            tooltip: `Specify codec for newly created surround tracks. Note that both AC3 and EAC3 are limited to 6 channels (5.1) by ffmpeg's native encoders. Opus supports up to 8 channels.`,
        },
        {
            name: 'method_dedup_region',
            type: 'string',
            defaultValue: 'fold',
            inputUI: {
                type: 'dropdown',
                options: ['fold', 'distinct'],
            },
            tooltip: `How a region/script-qualified language tag (pt-BR, pt-PT, en-US, zh-Hans) is grouped for deduplication and the one-downmix-per-language sets. Only matters when two tracks share a base language but differ by region or script; a plain tag (eng, en) is unaffected.
                \\n=====
                \\nActions
                \\n=====
                \\nIf fold (default) - a base language and all its regional variants are ONE language: en and en-US collapse, and pt-BR + pt-PT are the same Portuguese - so a duplicate is removed and only one downmix is created. Best for most libraries, where a region tag is cosmetic.
                \\nIf distinct       - each region/script variant is its own language: pt-BR and pt-PT both survive dedup (different dubs) and each gets its own downmix, and en-US stays separate from en. Choose this only if you deliberately keep multiple regional dubs of one language.`,
        },
        {
            name: 'method_deduplicate',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'multi-stereo', 'multi-stereo-error', 'channel', 'channel-error'],
            },
            tooltip: `If enabled then duplicate audio tracks (same language, same broad role) are reduced down to the highest quality option(s). Any stream newly created by downmix_to_six or downmix_to_stereo is always kept and is never collapsed against a different channel count it was created alongside (see below).
                \\nCommentary and descriptive (visually-impaired) tracks are never treated as duplicates of each other - every such track is always kept, since two different commentaries (e.g. cast & crew vs directors) are distinct content even when both are titled "Commentary".
                \\nThe "-error" variants use identical grouping/duplicate-detection logic to their non-error counterpart, but instead of deleting the lower quality duplicate(s) they abort the plugin run entirely (no streams are removed, no other changes in this run are applied) so the file can be inspected and tagged manually before being requeued.
                \\n=====
                \\nActions
                \\n=====
                \\nIf disabled            - no streams are removed for being duplicates. Every track is left exactly as found.
                \\nIf multi-stereo        - one track per language is kept for each of two broad roles: "surround" (more than 2 channels) and "stereo" (2 or fewer channels). The highest quality track in each role wins; the rest in that role are removed.
                       \\nException: if downmix_to_six is enabled, the 5.1/5.0 band (5-6 channels) is kept as its own separate role rather than folded into "surround" - so a downmix-created 6 channel track is never compared against, and removed in favour of, a higher channel track like a 7.1.
                       \\nException: if downmix_to_stereo is enabled, exactly 2 channel tracks are kept as their own separate role rather than folded into "stereo" - so a downmix-created 2.0 track is never compared against, and removed in favour of, a mono track.
                       \\nThese exceptions only apply while the matching downmix option is enabled, matching what that option would have created or kept anyway.
                \\nIf multi-stereo-error  - same grouping as multi-stereo, but on finding a duplicate the plugin aborts (processing fails, file sent to error queue) instead of deleting anything.
                \\nIf channel             - one track per language is kept for each distinct channel count (2.0, 5.1, 7.1, etc are each their own group). The highest quality track in each channel count wins; the rest sharing that exact channel count are removed.
                \\nIf channel-error       - same grouping as channel, but on finding a duplicate the plugin aborts (processing fails, file sent to error queue) instead of deleting anything.
                \\nExample: 
                    A file has these tracks with the same language: 7.1 aac, 5.1 truehd, 2.0 ac3, 2.0 mp3
                \\nIf channel      - keeps 7.1 aac, 5.1 truehd, and the better of the two 2.0 tracks (2.0 ac3). The 7.1 and 5.1 are different channel counts so both survive.
                \\nIf multi-stereo - keeps 5.1 truehd (better quality than 7.1 aac, both are "surround") and 2.0 ac3 (better than 2.0 mp3, both are "stereo"). The 7.1 aac is removed - but with guard_quality=enabled the higher-channel 7.1 is kept alongside the 5.1, since the guard blocks a removal that drops channels the survivor lacks.
                \\nIf channel-error or multi-stereo-error - aborts the run if it finds duplicates as per the categories above; no streams are removed and no other changes from this run are applied.`,
        },
        {
            name: 'method_layout_err',
            type: 'string',
            defaultValue: 'keep',
            inputUI: {
                type: 'dropdown',
                options: ['keep','drop','remix'],
            },
            tooltip: `What to do when a track can't be written in the target codec because of its channel layout. This happens only when codec_surround is opus and a track's layout is one libopus can't encode (e.g. 2.1, 4.0, 4.1, 6.0, 7.0, 7.1(wide)) - reached either because codec_force is sending that track to opus, or because method_loudnorm has to re-encode a kept track whose own codec ffmpeg can't encode (e.g. a DTS core) and it converges to codec_surround. Left unhandled, ffmpeg aborts the whole job on that track. A layout that just needs relabeling (5.0(side) -> 5.0, 6.1(back) -> 6.1) is ALWAYS relabeled losslessly regardless of this setting. AC3/EAC3/AAC accept every layout, so this only matters when codec_surround is opus.
                \\n=====
                \\nActions (only for a layout with no lossless relabel)
                \\n=====
                \\nIf keep  - the track is left in its source codec (not written as opus). Safe default: nothing fails and no audio is lost; a loudnorm-only run just leaves that one track un-normalized.
                \\nIf drop  - the track is removed entirely. The last remaining audio track is never dropped (falls back to keep). A stereo/5.1 a downmix would derive from that track is still created.
                \\nIf remix - the track is downmixed to a codec_stereo stereo (using method_stereo_downmix), with loudness applied when method_loudnorm is active. Defers to downmix_to_stereo / the stereo tier (language_stereo, language_unlisted=stereo, downmix_secondary=stereo) when they already convert the track, and falls back to keep rather than create a duplicate stereo.`,
        },
        {
            name: 'method_loudnorm',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled', 'tv', 'cinema', 'quiet_room'],
            },
            tooltip: `Two-pass measured loudness normalization (EBU R128 / ffmpeg's loudnorm filter) for every kept audio track guard_lossless/guard_quality/guard_object_audio don't protect.
                \\naudio_clean spawns ffmpeg itself for an audio-only analysis pass per track, then applies the real measured correction - no other plugin
                or flow ordering is involved (NOT the same as running a separate 2-pass loudnorm plugin - this is self-contained in one invocation).
                \\nA track already within about 1 LU of the preset target is left completely untouched (no re-encode). A track whose current codec isn't
                one this plugin can encode (e.g. a kept DTS-core or MP3 track) converges to codec_surround/codec_stereo, respecting each codec's
                channel-count ceiling, but only as a side effect of a correction that's actually needed - it never touches a track that's already close
                enough, regardless of codec.
                \\nApplies whether or not the track is also being downmixed/forced/converted for another reason this run - a track that's untouched
                otherwise is measured and corrected on its own; a track already being modified rides on that same re-encode instead of a separate one.
                \\nOn a Matroska container (mkv/webm/mka) a track untouched by anything else this run is stamped with an awk_loudnorm tag once measured
                (corrected or already close) - a later run trusts that tag and skips re-measuring while this setting stays the same. Changing this
                setting invalidates the tag (fresh measurement). mp4/m4a muxers drop custom tags, so on those containers loudnorm re-measures each
                run instead of caching (an already-correct track stays a no-op there rather than remuxing).
                \\n=====
                \\nActions
                \\n=====
                \\nLRA is the loudness range - the spread between the quiet and loud parts. A higher LRA preserves more dynamics; a lower LRA compresses them: cinema (15) keeps the most, tv (11) is in the middle, quiet_room (6) is the most compressed. The correction is baked into the re-encode (not a per-playback toggle).
                \\nIf disabled   - no loudness measurement or correction; every other audio_clean option is unaffected.
                \\nIf tv         - -16 LUFS integrated, LRA 11, true peak -1.5 dBTP. General home viewing, matches typical streaming-platform loudness.
                \\nIf cinema     - -23 LUFS integrated, LRA 15, true peak -1.0 dBTP. EBU R128 broadcast standard, preserves the most theatrical dynamic range.
                \\nIf quiet_room - -16 LUFS integrated, LRA 6, true peak -1.5 dBTP. The most compressed of the three - great for late-night or shared-space listening (loud scenes don't spike and quiet dialogue stays audible without riding the volume), for small or limited speakers (laptop/phone/TV/soundbar) that can't reproduce a wide dynamic range anyway, and for noisy rooms. The trade-off: it discards the track's original theatrical dynamics, so prefer tv/cinema on a capable system in a quiet room.`,
        },
        {
            name: 'method_stereo_downmix',
            type: 'string',
            defaultValue: 'default',
            inputUI: {
                type: 'dropdown',
                options: ['dialogue','default'],
            },
            tooltip: `Method used when creating stereo (2.0) tracks from surround sources.
                \\n=====
                \\nActions
                \\n=====
                \\nIf default (default) - ffmpeg's built-in downmix (-ac 2). The standard, least-surprising fold; auto leveling can occasionally sound quiet with buried dialogue.
                \\nIf dialogue - applies a Lo/Ro downmix matrix (center kept at -3 dB, LFE dropped) so dialogue stays clear and the level stays up, at the cost of a more opinionated fold that shifts the spatial image.
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
            tooltip: `Protect a track from a destructive operation (downmix_to_six / downmix_to_stereo 'replace', codec_force, duplicate removal, and method_loudnorm)
                whenever its SOURCE is lossless (TrueHD, DTS-HD MA, FLAC, PCM, etc.) - independent of guard_quality and guard_object_audio, so disabling
                quality-based protection never accidentally exposes a lossless master too; you have to turn this off on purpose. A guarded downmix 'replace'
                becomes 'add' (the source is kept and the downmix is added alongside); a guarded codec_force/method_loudnorm is skipped (left in its source
                codec); a guarded duplicate is kept instead of removed. Only a genuine track kept at surround is protected: secondary (commentary/descriptive/
                M&E) tracks never are, and neither is a track you already sent to stereo or delete via language_stereo/language_unlisted/downmix_secondary -
                protecting a track from the very downmix you asked for would be nonsense. See language_surround.
                \\nNote: disabling this alone does not guarantee a lossless source gets touched - guard_quality's own quality-margin math still runs
                using that source's (near-maximum) quality score, and in practice will usually still block a conversion to any lossy codec unless
                guard_quality is ALSO relaxed. The three guards (guard_quality, this, guard_object_audio) are fully independent, not a fallback chain.
                \\n=====
                \\nActions
                \\n=====
                \\nIf enabled  - (Default) Protect lossless sources from every operation above.
                \\nIf disabled - No lossless-specific protection; guard_quality (if enabled) still evaluates every operation on its own terms.`,
        },
        {
            name: 'guard_object_audio',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled','disabled'],
            },
            tooltip: `Protect a track from a destructive operation (downmix_to_six / downmix_to_stereo 'replace', codec_force, duplicate removal, and
                method_loudnorm) whenever it carries OBJECT AUDIO (Dolby Atmos on E-AC-3, DTS:X, or MPEG-H) - independent of guard_lossless and
                guard_quality. ffmpeg has no encoder for these object-audio layers, so ANY re-encode permanently flattens the track to its plain
                channel bed, silently discarding the height/object information - the same irreversible loss guard_lossless prevents for lossless
                masters, but for LOSSY object-audio carriers that guard_lossless doesn't cover (Atmos on E-AC-3 and DTS:X on DTS core/HR are lossy).
                Atmos/DTS:X on a lossless carrier (TrueHD, DTS-HD MA) is already covered by guard_lossless. A guarded downmix 'replace' becomes 'add';
                a guarded codec_force/method_loudnorm is skipped; a guarded duplicate is kept. Only a genuine track kept at surround is protected: secondary
                tracks never are, and neither is a track already sent to stereo or delete. See language_surround.
                \\nNote: object-audio detection is best-effort - Atmos on E-AC-3 is reliable, but DTS:X relies on a MediaInfo field its own maintainers
                note is incomplete for an undocumented format, so a real DTS:X track may occasionally not be recognized (it never false-positives). A
                recognized object-audio track is also PREFERRED over an otherwise-equal plain track when method_deduplicate picks which to keep.
                \\n=====
                \\nActions
                \\n=====
                \\nIf enabled  - (Default) Protect object-audio tracks from every operation above.
                \\nIf disabled - No object-audio-specific protection; the other two guards (if enabled) still evaluate every operation on their own terms.`,
        },
        {
            name: 'guard_original',
            type: 'string',
            defaultValue: 'disabled',
            inputUI: {
                type: 'dropdown',
                options: ['disabled','enabled'],
            },
            tooltip: `Protect a foreign film's ORIGINAL-language track from being downmixed or deleted just because its language is in neither language_surround
                nor language_stereo. A track carrying the ffmpeg 'original' disposition (or an "original" title) whose language is unlisted normally follows
                language_unlisted - so it can be downmixed to stereo, or removed outright, along with every other unlisted language. When enabled, such a track
                is instead kept at surround exactly as if its language WERE in language_surround - the same treatment a listed language gets, no more. That also
                vetoes language_unlisted=delete for it: an original track is never the one you meant to throw away.
                \\nOnly affects an 'original' track in an UNLISTED language while a wanted language is also present (e.g. a Japanese 5.1 original beside an
                English dub with language_surround=eng); an original already in a listed language, or a foreign-only file whose language settings are dormant,
                is already kept at surround and unchanged. The track must be identifiable as original (the 'original' flag or an "original" title) - an untagged
                foreign track has no signal to key off, so nothing here can rescue it. Commentary/descriptive/M&E tracks are unaffected: this clears only the
                LANGUAGE decision, never the role one, so an 'original' commentary still follows downmix_secondary. See language_surround.
                \\n=====
                \\nActions
                \\n=====
                \\nIf enabled  - Keep an unlisted-language original track at surround, and never delete it.
                \\nIf disabled - (Default) The original track follows normal unlisted-language handling - language_unlisted may downmix or delete it.`,
        },
        {
            name: 'guard_quality',
            type: 'string',
            defaultValue: 'enabled',
            inputUI: {
                type: 'dropdown',
                options: ['enabled','strict','disabled'],
            },
            tooltip: `Protect a track from a destructive operation (downmix_to_six / downmix_to_stereo 'replace', codec_force, duplicate removal, and method_loudnorm)
                whenever the operation reduces channel count OR a lossy source's predicted quality drop is significant - independent of guard_lossless
                and guard_object_audio below. Protection is earned PER OPERATION against that operation's real target codec/channels - not a single "best track" flag.
                A guarded downmix 'replace' becomes 'add'; a guarded codec_force/method_loudnorm is skipped; a guarded duplicate is kept instead of removed.
                codec_force='all' does not override this - a guarded track is left alone in every force mode. Only a genuine track kept at surround is
                protected: secondary tracks never are, and neither is a track already sent to stereo or delete. See language_surround.
                \\n=====
                \\nActions
                \\n=====
                \\nIf enabled  - (Default) Protect when the operation reduces channel count, or a lossy source's predicted quality drop is more than ~7
                points. A comparable-codec swap such as 640k E-AC-3 to 640k AC3 (or a full-rate 1.5 Mbps DTS 5.1 to 640k AC3) is allowed through, while
                flattening a Dolby Atmos or DTS-HD source to 640k AC3 is kept. Allows AC3 to EAC3 at equal quality.
                \\nIf strict   - Like enabled, but a lossy source is protected on ANY predicted drop, however small (the most protective tier) - use it
                to keep a track even for a marginal quality difference. It protects the same ~1.5 Mbps DTS 5.1 forced to 640k AC3 that enabled would
                let through. Because a downmix always drops channels, a downmix 'replace' always behaves as 'add' under either enabled or strict.
                \\nIf disabled - No channel-count or quality-margin protection; guard_lossless (if enabled) still protects lossless sources on its own.`,
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
        container: `.${file.container}`,
        FFmpegMode: true,
        infoLog: '',
    };

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

    // =====================================================================
    // SHARED CODE — duplicated verbatim because Tdarr loads each plugin as one self-contained file.
    // Split into labeled sections; each is byte-identical across the plugins named in its header, and a
    // plugin carries only the sections it uses. The section LABEL is the anchor (order is free). Verify any
    // edit with awk-shared-block-check. User-tunable tables (dispositionTypes, codecInfo) lead their section.
    // =====================================================================

    // ===== SHARED [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean]: role/disposition classifiers =====
    // -=-=-= dispositionTypes  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Classifiers group the real ffmpeg disposition flags into the roles the pipeline sorts and tags by. dispositionTypes is keyed by the ffmpeg
    // disposition; each entry declares the valid stream types (streams), the keywords that also indicate it (each keyword lives on one flag so
    // title->flag promotion stays unambiguous), and the canonical title string (tag, null when never written). hasDisposition gates on codec_type,
    // matching keywords whole-token via matchesKeyword. Read by summariseStream, the stream-ordering sort keys, audio_clean's secondary-track
    // detection, and clean_and_remux's title/flag tagging. Shared verbatim across all five awk plugins.
    const dispositionTypes = {
        comment:          { streams:['audio','subtitle'],         keywords: ['commentary'],                                            tag: 'Commentary'  },
        visual_impaired:  { streams:['audio'],                    keywords: ['descriptive','dvs','audio description'],                 tag: 'Descriptive' },
        descriptions:     { streams:['subtitle'],                 keywords: ['descriptive','dvs'],                                     tag: 'Descriptive' },
        hearing_impaired: { streams:['subtitle'],                 keywords: ['sdh','hearing impaired','hard of hearing','hoh','deaf'], tag: 'SDH'         },
        captions:         { streams:['subtitle'],                 keywords: ['caption','captions','cc'],                               tag: 'SDH'         },
        lyrics:           { streams:['subtitle'],                 keywords: ['songs','lyrics'],                                        tag: 'Lyrics'      },
        forced:           { streams:['subtitle'],                 keywords: ['forced'],                                                tag: 'Forced'      },
        dub:              { streams:['audio'],                    keywords: ['dub','dubbed'],                                          tag: 'Dub'         },
        original:         { streams:['audio'],                    keywords: ['original'],                                              tag: 'Original'    },
        clean_effects:    { streams:['audio'],                    keywords: ['music and effects','m&e'],                               tag: null          },
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
    const isDescriptive = (s) => hasDisposition(s, 'visual_impaired') || hasDisposition(s, 'descriptions');
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
        ['pcm_',   'pcm'],
        ['dsd',    'dsd'],       // DSD / SACD (1-bit): fold dsd_lsbf/dsd_msbf(_planar) to one lossless key
        ['mp4als', 'als'],       // MPEG-4 ALS: fold the mp4-wrapped spelling to the 'als' codecInfo key (a bare 'als' resolves directly)
        ['adpcm',  'adpcm'],
        ['wmavoice', 'wmavoice'],   // WMA Voice: low-bitrate SPEECH codec, not music-grade WMA - keep distinct so the wmav prefix below doesn't score it as full WMA
        ['wmav',   'wma'],
        ['atrac',  'atrac'],
        ['mpegh',  'mpegh3d'],   // ffmpeg reports MPEG-H 3D Audio as mpegh_3d_audio; map it to the codecInfo key so it scores + gets object-audio protection
        ['aac_latm', 'aac'],     // AAC in MPEG-TS/LATM (broadcast/DVR .ts captures) reports codec_name aac_latm; fold to aac so it scores + displays as AAC, not an unknown codec
    ];
    // -=-=-= resolveCodecName  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Applies the alias prefixes, maps dca->dts, then refines DTS into its HD MA / HR / Express subtype (further into the
    // _x variant when DTS:X is detected) and eac3 into eac3atmos. Used for scoring by audioQuality (audio_clean, stream_ordering)
    // and isLosslessSource (audio_clean), and by summariseStream (all five) purely for accurate display labeling - a plugin
    // that doesn't score audio still benefits from showing "eac3atmos"/"dtsx" instead of a bare "eac3"/"dts" in its logs.
    // codec_long_name for DTS in MP4/M4V is "DCA (DTS Coherent Acoustics)" (no subtype keyword), so longName alone can't
    // tell the subtypes apart there; we also check the stream profile ("DTS-HD MA"/"HRA"/"Express") and fall back to
    // mediaInfo's Format_Commercial_IfAny ("DTS-HD Master Audio"), which decodes the substream header. Atmos comes from
    // longName or the commercial name only - an editable title tag does not imply a real Atmos substream.
    // DTS:X detection is best-effort: MediaInfo exposes it via Format_AdditionalFeatures containing "XLL X" (vs plain
    // "XLL" for MA without X), but MediaInfo's own maintainers note this is incomplete for an undocumented format -
    // expect a real DTS:X track to sometimes still classify as the plain (non-X) subtype, never the reverse (this only
    // fires on an actual reported value, never on absence of one, so it can't produce a false positive).
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
                if (/\bxll x\b/.test(additionalFeatures))
                    codec = DTS_X_VARIANT[codec];
            }
        } else if (codec === 'eac3' && (longName.includes('atmos') || commercial.includes('atmos')))
            codec = 'eac3atmos';

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
        eac3atmos: 'eac3-atmos', mpegh3d: 'mpeg-h',
    };
    const codecDisplayName = (stream) => CODEC_DISPLAY[resolveCodecName(stream)] || (stream.codec_name || 'unknown').trim().toLowerCase();
    // ===== END SHARED: codec name resolution =====
    // ===== SHARED [audio_clean, stream_ordering, sub_worker, video_clean]: mp4-family container =====
    // -=-=-= isMp4Family  [audio_clean, stream_ordering, sub_worker, video_clean] =-=-=-
    // The mp4/mov container family whose -c copy needs `-movflags use_metadata_tags` to keep sibling plugins' GLOBAL awk_* markers through the remux (dropping one re-triggers
    // work upstream). One source so the four writers can't drift on the set (video_clean's video-only hvc1 gate is deliberately mp4/m4v/mov WITHOUT m4a and stays separate).
    const isMp4Family = (container) => ['mp4', 'm4v', 'mov', 'm4a'].includes(String(container || '').toLowerCase());
    // ===== END SHARED: mp4-family container =====
    // ===== SHARED [audio_clean, clean_and_remux, sub_worker, video_clean]: case-insensitive tag lookup =====
    // -=-=-= getTagCI  [audio_clean, clean_and_remux, sub_worker, video_clean] =-=-=-
    // Look up a tag value case-insensitively - matroska UPPER-CASES tag keys on write, so a plugin reading its sibling's awk_* marker gets an uppercased key back. Returns the
    // raw value (or '' if absent); callers trim/decode as needed. One source so the four plugins that read each other's markers can't drift on the lookup convention.
    const getTagCI = (tags, name) => { const hit = Object.keys(tags || {}).find((k) => k.toLowerCase() === name); return hit === undefined ? '' : String(tags[hit] ?? ''); };
    // ===== END SHARED: case-insensitive tag lookup =====

    // ===== SHARED [audio_clean, stream_ordering]: audio codec scoring =====
    // -=-=-= codecInfo  [audio_clean, stream_ordering] =-=-=-
    // Codec quality weights + bitrate thresholds for picking the best track (audioQuality). Three row shapes, each field one job:
    //   lossless: { score }                                    - already perfect; audioQuality returns score directly.
    //   encodable (aac/opus/ac3/eac3): { score, minimum }      - SCORING thresholds come from the CODEC_TARGET_BPS ladder (see scoreThresholds); no
    //       `transparent` here, and `minimum` is kept ONLY as the transcode floor read by resolveBitrate (audio_clean).
    //   source-lossy (everything else): { score, transparent } - `transparent` is the 2-CHANNEL baseline; scoreThresholds scales it by (ch/2)^0.65 and
    //       derives minimum as MIN_RATIO of transparent. Some formats here aren't ffmpeg-encodable (e.g. ac4).
    // objectAudio: true marks a codec whose stream carries object-audio metadata (Atmos/DTS:X/MPEG-H) that ffmpeg cannot
    // re-encode - read only by audio_clean's guard_object_audio, never by the score/threshold math below. AC-4 is deliberately NOT flagged: it spans plain stereo to Atmos and
    // no ffprobe field distinguishes the immersive (IMS) variant the way eac3->eac3atmos does, and it isn't ffmpeg-encodable anyway (so the guard could only ever block a drop).
    const codecInfo = {
        // Lossless
        pcm:         { score: 100, lossless: true },
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
        mlp:         { score: 99,  lossless: true },

        // Dolby family
        truehd:      { score: 99,  lossless: true },
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
        ac4:         { score: 90,  transparent: 188000 },
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
        adpcm:       { score: 60,  transparent: 256000 },
        cook:        { score: 58,  transparent: 128000 }
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
    // Channel-count-aware scoring thresholds (bps) for a codec: transparent (0 penalty) and minimum (max penalty). Encodable codecs (aac/opus/ac3/eac3)
    // read the real per-channel CODEC_TARGET_BPS ladder - so scoring-transparent IS the encode target and the two can't drift. Every other codec scales
    // its 2-channel codecInfo.transparent baseline by (ch/2)^0.65. minimum is a uniform MIN_RATIO fraction of transparent for every codec, so no
    // hand-tuned floor can land on top of a standard reduced-rate mode (e.g. half-rate DTS @768k).
    const MIN_RATIO = 0.4;
    const CHANNEL_SCALE_EXPONENT = 0.65;   // perceptual quality-vs-channel-count curve exponent: transparent scales by (ch/2)^this - shared by scoreThresholds and (in audio_clean) resolveBitrate so the two cannot drift
    const scoreThresholds = (codec, channels) => {
        const family = codec === 'aac_vbr' ? 'aac' : codec;
        const tbl = CODEC_TARGET_BPS[family];
        let transparent;
        if (tbl) {
            const cap = (family === 'ac3' || family === 'eac3') ? 6 : 8;
            transparent = tbl[Math.min(Math.max(1, Number(channels) || 1), cap)] ?? tbl[cap];
        } else {
            transparent = (codecInfo[codec]?.transparent ?? 320000) * Math.pow(Math.max(2, Number(channels) || 2) / 2, CHANNEL_SCALE_EXPONENT);
        }
        return { minimum: transparent * MIN_RATIO, transparent };
    };
    // -=-=-= audioQuality  [audio_clean, stream_ordering] =-=-=-
    // Scores a stream's quality (codec + bitrate vs transparent bitrate) to identify the "best" track. Declared after response so infoLog is available.
    const audioQuality = (stream) => {
        const codec = resolveCodecName(stream);

        //Check if we can't identify the codec. If we can't then notify once per codec
        if(!(codec in codecInfo) && !unknownCodecs.has(codec)) {
            unknownCodecs.add(codec);
            response.infoLog += `☒${streamTag(stream.index)} Unknown audio codec "${codec}", using generic quality weighting\n`;
        }

        //This is a pretty weak way to score an unknown codec
        const info = codecInfo[codec] ?? { score: 70 };
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

        //Score the track against its channel-count-aware thresholds
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
    // Embedded-font filename extensions + a font-mimetype test, shared by summariseStream's [attach:...] token and clean_and_remux's attachmentKind font classification.
    const FONT_EXTS = ['ttf', 'otf', 'ttc', 'otc', 'pfb', 'pfa', 'woff', 'woff2', 'eot'];
    const isFontMime = (mime) => /font|truetype|opentype|sfnt/.test(mime);
    // -=-=-= HDR_TRANSFERS  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // The HDR transfer curves: ffmpeg's two HDR color_trc enums (smpte2084 = PQ, arib-std-b67 = HLG) plus the MediaInfo spellings (pq, hlg).
    // The single source for every HDR-curve test: summariseStream's vHdr token below, and video_clean's isHdr / dvNoBaseLayer / tonemap-setparams gate.
    const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67', 'pq', 'hlg'];
    // -=-=-= summariseStream  [audio_clean, clean_and_remux, stream_ordering, sub_worker, video_clean] =-=-=-
    // Per type: video codec + resolution/10bit/hdr (+/cover for cover-art/still images); data & attachment codec only. Audio & subtitle append /default, then their role markers.
    // Audio role markers: /commentary|/description then /dub|/original. Subtitle: /forced then /commentary|/description|/sdh|/lyrics.
    // /default and /forced read the REAL disposition flag only — a title keyword must not flip a selection flag (as forced already did).
    // The role markers mirror the sorting logic (flag OR title keyword, via the shared classifiers) so every plugin's summary lines up.
    // subrip is shown as srt to match the friendlier name used when this pipeline converts subtitles. Audio uses codecDisplayName so a DTS subtype
    // or object-audio layer the container codec_name hides (dts-hd-ma, eac3-atmos, dts-express-x) shows in the token. Shared verbatim across all five.
    const summariseStream = (s) => {
        const type = (s.codec_type || '').trim().toLowerCase();
        let codec = (s.codec_name || 'unknown').trim().toLowerCase();
        if (codec === 'subrip') codec = 'srt';
        const langRaw = resolveLang(s) || 'und';
        const lang = langRaw !== 'und' ? langRaw : '';
        const def = s.disposition?.default === 1 ? '/default' : '';
        if (type === 'video') {
            const vmi = mediaInfoFor(s);
            const vHeight = Number(s.height || vmi?.Height || 0);
            const vTenbit = is10Bit(s, vmi);
            const vXfer = (s.color_transfer || vmi?.transfer_characteristics || '').toLowerCase().trim();
            const vHdr = HDR_TRANSFERS.includes(vXfer) || !!String(vmi?.HDR_Format || '').trim();
            // HDR sub-type marker, shown in place of 'hdr'. Dolby Vision is detected self-contained here (video_clean carries summariseStream but not
            // isDolbyVisionVideo): a dvhe/dvh1/dvav/dva1/dav1 fourcc, a mediaInfo HDR_Format naming Dolby Vision, or a DOVI record - also surfacing
            // Profile-5 DV whose non-standard transfer sets no hdr flag. HDR10+ is stream-visible only via mediaInfo (ffprobe carries 2094-40 per-frame, which
            // Tdarr doesn't probe), so it degrades to plain 'hdr' when mediaInfo is absent.
            const vHdrFmt = String(vmi?.HDR_Format || vmi?.HDR_Format_Compatibility || '').toLowerCase();
            const vSide = Array.isArray(s.side_data_list) ? s.side_data_list : [];
            const vDv = /^(dvhe|dvh1|dvav|dva1|dav1)$/.test((s.codec_tag_string || '').toLowerCase().trim()) || vHdrFmt.includes('dolby vision')
                || vSide.some((sd) => /dovi configuration record|dolby vision/i.test(String(sd?.side_data_type || '')));
            const vHdrTok = vDv ? 'dv' : (/2094-40|hdr10\+|hdr10 plus/.test(vHdrFmt) ? 'hdr10+' : (vHdr ? 'hdr' : ''));
            const vParts = [codec, vHeight > 0 ? `${vHeight}p` : '', vTenbit ? '10bit' : '', vHdrTok].filter(Boolean).join(' ');
            return `[video:${vParts}${isCoverArt(s) ? '/cover' : ''}]`;
        }
        if (type === 'audio') {
            const ch = s.channels ? `${s.channels}ch` : '';
            const bitrate = Number(s.bit_rate || 0);
            const rate = bitrate > 0 ? `${Math.round(bitrate / 1000)}k` : '';
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : '');
            const prov = hasDisposition(s, 'dub') ? '/dub' : (hasDisposition(s, 'original') ? '/original' : '');
            return `[audio:${[lang, ch, codecDisplayName(s), rate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
        }
        if (type === 'subtitle') {
            const role = isCommentary(s) ? '/commentary' : (isDescriptive(s) ? '/description' : (isSdh(s) ? '/sdh' : (isLyrics(s) ? '/lyrics' : '')));
            const forced = s.disposition?.forced === 1 ? '/forced' : '';
            return `[sub:${[lang, codec].filter(Boolean).join(' ')}${def}${forced}${role}]`;
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
            return `[attach:${label}]`;
        }
        if (type === 'data') {
            // Prefer a meaningful codec_name; when it's absent/generic, surface the mimetype SUBTYPE (text/html -> html) so a removed data stream is legible.
            const dmime = (s.tags?.mimetype || '').trim().toLowerCase();
            const dsub = dmime.includes('/') ? dmime.slice(dmime.indexOf('/') + 1).replace(/^x-/, '') : '';
            return `[data:${(codec === 'unknown' || codec === 'none') && dsub ? dsub : codec}]`;
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
    const langNameIndex = (() => {
        let idx = null;
        return () => {
            if (idx) return idx;
            idx = {};
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

    // ===== SHARED [clean_and_remux, audio_clean, sub_worker, stream_ordering]: dolby vision detection =====
    // -=-=-= isDolbyVisionVideo  [clean_and_remux, audio_clean, sub_worker, stream_ordering] =-=-=-
    // True when a video stream carries Dolby Vision, both-probe: a dvhe/dvh1/dvav/dva1/dav1 fourcc, a mediaInfo HDR_Format naming Dolby Vision, or an ffprobe DOVI configuration
    // record / dolby-vision side_data. The four -c copy plugins use it to add `-strict unofficial` to an mp4/mov remux so ffmpeg's mov muxer keeps the dvcC/dvvC configuration
    // boxes - a plain copy drops them, demoting DV to plain HEVC (verified on a real sample). Pass the stream's paired mediaInfo (mediaInfoFor(stream)); a single-probe false
    // negative would silently lose the boxes. video_clean re-encodes DV via its own path, so it does not carry this helper.
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

    // ===== SHARED [audio_clean, clean_and_remux]: language list match =====
    // -=-=-= langListMatch  [audio_clean, clean_and_remux] =-=-=-
    // True when a stream's language matches any entry in a pre-normalised key list (keys = userList.map(langKey), computed once per run). Only these two plugins match a
    // stream language against a user list; stream_ordering/sub_worker use langKey directly (indexOf / Set), so they carry langKey but not this helper.
    const langListMatch = (streamLang, keys) => keys.includes(langKey(streamLang));
    // ===== END SHARED: language list match =====

    // audio_clean-local IDENTITY key: like langKey but KEEPS the region/script subtag, so pt-BR and pt-PT are DISTINCT identities (both survive dedup, each gets its own
    // downmix) while eng/en/English/en-US still fold their BASE (eng==en, but en != en-US). Used ONLY for dedup grouping and the one-downmix-per-language sets; all
    // matching/filtering stays on the folded langKey. Non-language/untagged/malformed tokens fall back to langKey, so 'und' stays 'und' and the dedup exemption holds.
    const langIdentityKey = (x) => {
        let s = String(x || '').trim().toLowerCase().replace(/[_.]/g, '-');
        if (!s) return '';
        if (s.length >= 4 && langNameIndex()[s]) s = langNameIndex()[s];   // spelled-out English name -> its 2-letter code (no region on a spelled-out name)
        try { return String(Intl.getCanonicalLocales(s)[0] || s).toLowerCase(); } catch (e) { return langKey(x); }
    };

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

    // ===== SHARED [audio_clean, video_clean]: ffmpeg encoder probe =====
    // -=-=-= parseFfmpegEncoders  [audio_clean, video_clean] =-=-=-
    // Parse `ffmpeg -hide_banner -encoders` stdout into a Set of encoder names. Each encoder row is "<6 flag chars> <name>  <description>" (e.g.
    // " V....D hevc_nvenc  NVIDIA NVENC hevc encoder"); the leading [A-Z.]{6} flag block + whitespace gate the name capture so the banner/header/blank lines are
    // skipped. Shared by video_clean's per-node capability probe (queryCapabilities) and audio_clean's aac_vbr availability check (hasEncoder) so the row-parse
    // regex cannot drift between them; the spawn itself stays at each call site (their surrounding capability objects differ).
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
    // The canonical audio-title machinery both plugins share, so audio_clean's downmix titles come out already in clean_and_remux's tag_title form and a
    // later clean_and_remux pass has nothing to reorder (no wasted remux). Canonical form: "<channel/downmix base> - <role tags>", base first and any
    // disposition roles LAST (e.g. "5.1 -> 2.0 - Commentary"). canonicalAudioTitle is the entry point; the rest are its building blocks.
    // -=-=-= channel-label vocab: channelTitleLabels / bareChannelRegex / downmixChannelRegex  [audio_clean, clean_and_remux] =-=-=-
    //The channel labels we recognise/replace for tag_title - include 2.0 to allow us to overwrite that with stereo
    const channelTitleLabels = ['7.1', '6.1', '5.1', '5.0', '4.0', '3.1', '3.0', '2.1', '2.0', 'stereo', 'mono'];
    const channelLabelAlternation = channelTitleLabels.map(l => l.replace(/\./g, '\\.')).join('|');
    //A bare channel title (the whole title is just a channel label) - we own these and may derive/overwrite them.
    const bareChannelRegex = new RegExp(`^(${channelLabelAlternation})$`, 'i');
    //A downmix/channel-derived base produced elsewhere (e.g. audio_clean "5.1 -> 2.0"): a bare channel label on BOTH sides of the "->". Requiring the left side
    //to also be a channel label keeps a rich custom title that merely ends in "-> <channel>" (e.g. "Dolby Digital Plus / 7.1 / 48 kHz / 1024 kbps -> 2.0",
    //which audio_clean builds by appending the downmix arrow to the source title) classified as custom - so it is left alone, not stripped and rewritten.
    const downmixChannelRegex = new RegExp(`^(${channelLabelAlternation})\\s*->\\s*(${channelLabelAlternation})$`, 'i');
    // -=-=-= channelLabel  [audio_clean, clean_and_remux] =-=-=-
    // Map a channel count to our short label, honouring an LFE for the 3/4-channel ambiguity (3.1 vs 4.0, 2.1 vs 3.0). Callers resolve the count (ffprobe,
    // mediaInfo, or layout via resolveChannels) and pass whether the layout string carries an LFE; a target-only caller (audio_clean naming a downmix
    // result) passes the target count with hasLfe=false.
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
    //Clean up titles - remove surrounding whitespace/quotes (no reason for them), and dedupe repeated segments ("Stereo / Stereo" -> "Stereo").
    //Busy-title removal (>3 periods) is applied by callers AFTER tagging, not here - roles are captured into flags before an over-dotted title clears.
    function cleanStreamTitle(rawTitle) {
        let title = (rawTitle || '').trim().replace(/^["']+|["']+$/g, '');
        if (title) {
            const parts = title.split(/\s*(?:\/|\||-|•)\s*/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
            if (parts.length === 1) return parts[0];
            // When all parts are the same word (case-insensitive), deduplicate to the first occurrence.
            // "First part wins" is intentional: preserves the leading segment's casing (e.g. "Stereo / stereo"→"Stereo", "ENGLISH - English"→"ENGLISH").
            if (parts.length > 1 && parts.every(p => p.toLowerCase() === parts[0].toLowerCase()))
                return parts[0];
        }
        return title;
    }
    // -=-=-= dispKeysFor / titleTagsFor  [audio_clean, clean_and_remux] =-=-=-
    // dispKeysFor: the dispositions valid on a stream type. titleTagsFor: the deduped canonical tag strings a stream matches (real flag OR title keyword, via
    // hasDisposition), excluding untagged flags like default/cover-art. Both derive from the shared dispositionTypes table (single source of truth).
    const dispKeysFor = (type) => Object.keys(dispositionTypes).filter(k => dispositionTypes[k].streams.includes(type));
    const titleTagsFor = (s) => [...new Set(dispKeysFor((s.codec_type || '').trim().toLowerCase())
        .filter(k => dispositionTypes[k].tag && hasDisposition(s, k)).map(k => dispositionTypes[k].tag))];
    // -=-=-= stripWords / stripDispositionWords  [audio_clean, clean_and_remux] =-=-=-
    // Single-word keywords stripped when recovering the channel/base portion of a title (multi-word
    // keywords like "hearing impaired" can't appear as a lone channel token, so they are skipped).
    const stripWords = new Set(Object.values(dispositionTypes).flatMap(d => d.keywords).filter(w => !w.includes(' ')));
    // Drop disposition keywords and stray separators from a title, leaving the channel/downmix base.
    // Splits on whitespace, keeps the "->" downmix arrow, drops lone separators and any keyword token.
    const stripDispositionWords = (title) => (title || '')
        .split(/\s+/)
        .filter(tok => !['-', '/', '|', '•'].includes(tok)
            && !stripWords.has(tok.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase()))
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

    // Bail out gracefully on missing/partial probe data, rather than an uncaught TypeError on the first file.ffProbeData.streams access below.
    if (!file.ffProbeData || !Array.isArray(file.ffProbeData.streams))
        failFile('No ffProbe stream data available for this file - the plugin cannot process it');

    // AC3 valid CBR presets in bps. ffmpeg rounds an AC3 request to the NEAREST of these (can round DOWN); resolveBitrate snaps UP to a preset itself so the
    // emitted rate is never below target and the log matches what ffmpeg produces. EAC3/AAC/Opus honour arbitrary rates (verified) and are NOT snapped.
    const ac3Presets = [32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000,
                        160000, 192000, 224000, 256000, 320000, 384000, 448000, 512000, 576000, 640000];

    // Per-codec channel-count ceiling of ffmpeg's native encoders (ac3/eac3 cap at 6ch, aac/opus at 8ch). One source for the codec_force targetMaxCh limit, the targetTable
    // bitrate-ladder cap, and loudnorm's channel ceiling below, so those can't drift; aac_vbr folds to aac (anything that isn't ac3/eac3 is 8).
    const codecMaxCh = (codec) => (codec === 'ac3' || codec === 'eac3') ? 6 : 8;
    // Fold the aac_vbr pseudo-codec onto the real aac family for scoring/limit/target lookups (aac_vbr is only an encoder choice, not a distinct codec). One local source for
    // the six non-shared fold sites below; the two inside the shared audio-scoring section keep the idiom inline (byte-identical across carriers, so they can't drift).
    const aacFamily = (codec) => codec === 'aac_vbr' ? 'aac' : codec;
    // Transcode target bitrate (bps) for a codec + channel count, from the shared CODEC_TARGET_BPS table (aac_vbr shares aac's targets; ac3/eac3 cap at 6ch).
    // For these encodable codecs the ladder IS the scoring transparent point (scoreThresholds reads the same table), and it serves as the FLOOR for a
    // transcode - the actual target is max(thisTable, source). AC3/EAC3 CBR fixed-preset: mono 192k, stereo 224k, 3ch 320k, 4ch 384k, 5ch 448k, 6ch 640k
    // (640k is the Blu-ray 5.1 standard and the AC3/EAC3 codec ceiling).
    const targetTable = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        const family = aacFamily(codec);
        const tbl = CODEC_TARGET_BPS[family];
        if (!tbl) return 0;
        const cap = codecMaxCh(family);
        return tbl[Math.min(ch, cap)] ?? tbl[cap];
    };

    // Per-codec ceiling (bps) so a lossless or very-high-bitrate source (e.g. TrueHD ~4 Mbps) can't drag the transcode target absurdly high. AC3/EAC3 cap
    // at their hard 640k limit; AAC/Opus cap generously per channel - well above transparent for any real content, but bounded.
    const codecCeiling = (codec, channels) => {
        const ch = Math.max(1, Number(channels) || 1);
        // AC3/EAC3 cap at their hard 640k codec limit; AAC and Opus scale per channel. These only ever apply to tracks at or below each codec's channel
        // maximum (the force/downmix paths block higher counts before encoding), but the per-channel form stays correct regardless of channel count.
        // Opus's ceiling (128k/ch) is deliberately half of ffmpeg's hard libopus limit (256k/ch) so a resolved Opus target can never be rejected by the
        // encoder. AAC 160k/ch is generous but bounded. Limits verified on Linux/Windows/Mac jellyfin-ffmpeg 7.1.4: ac3 clamps at exactly 640k; eac3 clamps
        // at 6144k (640k is our efficient near-transparent 5.1 target); native aac clamps ~185-208k/ch; libopus hard-ERRORS above 256k/ch (so 128k/ch is safe).
        if (codec === 'ac3' || codec === 'eac3') return 640000;
        if (codec === 'aac' || codec === 'aac_vbr') return ch * 160000;   // 160k/ch (stereo 320k, 5.1 960k, 7.1 1.28M)
        if (codec === 'opus') return ch * 128000;   // 128k/ch — half of libopus's 256k/ch hard maximum
        return 0;
    };

    // Resolve the final target bitrate (bps) for a transcode. Baseline is the per-channel table target (the FLOOR). A known lossy source pulls the target
    // DOWN toward its own bitrate when the target codec is at least as good as the source AT the source's bitrate (guard: audioQuality(target) >= srcQuality):
    // we cap at the source rate rather than inflate to the floor, because the codec-efficiency gain preserves quality at equal bitrate and extra bits above
    // source only re-encode detail a lossy source already discarded. The guard defaults OFF (srcQuality = Infinity) so only the codec_force same-channel path
    // opts in; downmix callers pass no srcBps and stay on the floor, and lossless sources skip the branch (their bitrate isn't a comparable perceptual quantity
    // - a 4 Mbps TrueHD into eac3 should target the floor, not its own rate). A pathological sub-minimum source is floored at the codec's channel-scaled
    // minimum. When the guard fails (target less efficient), a higher-than-floor lossy source still raises the target. Result is
    // clamped to the codec ceiling, then for AC3 ONLY snapped UP to the nearest valid preset: ffmpeg rounds an AC3 request to the NEAREST preset (can round
    // down), so we round up ourselves to guarantee the emitted rate is never below target and the log matches what ffmpeg produces; eac3/aac/opus honour
    // arbitrary rates (verified) and are emitted as-is.
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
        bps = Math.min(bps, codecCeiling(codec, channels));
        if (codec === 'ac3')
            bps = ac3Presets.find(p => p >= bps) ?? ac3Presets[ac3Presets.length - 1];   // AC3 only: coarse fixed table, round UP so we never land below target
        else
            bps = Math.round(bps / 1000) * 1000;   // eac3/aac/opus honour arbitrary rates - emit the exact value, rounded to whole kbps
        return bps;
    };

    // Per-codec audio argument string scoped to a specific output stream index (e.g. -b:a:2 instead of -b:a). ffmpeg accepts the stream-qualified forms; we use
    // them so each track gets its own settings when a single command touches several. srcLossless and srcQuality
    // are forwarded to resolveBitrate (srcLossless skips the source cap for lossless sources; srcQuality gates the guarded source-cap on the force path).
    const encoderArgsIdx = (codec, channels, idx, srcBps = 0, srcLossless = false, srcQuality = Infinity) => {
        const bps = resolveBitrate(codec, channels, srcBps, srcLossless, srcQuality);
        if (bps <= 0) return '';
        if (codec === 'opus')
            return ` -vbr:a:${idx} on -compression_level:a:${idx} 10 -b:a:${idx} ${bps / 1000}k`;
        return ` -b:a:${idx} ${bps / 1000}k`;
    };

    // ffmpeg's -c:a encoder TOKEN for a resolved audio codec name. Only opus differs from its own name: the encoder is libopus — ffmpeg's native `opus`
    // encoder is flagged experimental and aborts the whole job with "encoder 'opus' is experimental" unless `-strict -2` is added, so a bare `-c:a opus`
    // never works on jellyfin-ffmpeg. aac/ac3/eac3 names equal their encoder names; aac_vbr resolves its own encoder (libfdk_aac/aac_at/native aac) in
    // aacVbrArgsIdx and never reaches here. Apply this at every `-c:a:N <token>` emit site (the log lines keep the friendly codec name).
    const audioEncoder = (codec) => (codec === 'opus' ? 'libopus' : codec);

    // aac_vbr's preferred encoder is libfdk_aac (Linux/Windows jellyfin builds) but that is absent on the Mac build (--disable-libfdk-aac) and some custom builds.
    // Because plugin inputs are library-wide, a mixed fleet can't pin codec_stereo per node, so we resolve THIS node's AAC encoders at runtime (mirrors
    // video_clean's encoder probing): read an injected encoder list if the harness supplies one, else parse `ffmpeg -encoders` once into a Set. Memoized - the
    // probe runs at most once per file and only when aacVbrArgsIdx is actually reached (no aac_vbr emission → no probe). A failed/undeterminable probe yields an
    // empty set, so we degrade to native aac (which every build has) rather than emit an encoder that would hard-fail the file.
    // Kill-switch for a wedged `ffmpeg -encoders` probe: the query is near-instant, so this only fires if the spawned process hangs (never in normal use).
    const ENCODER_PROBE_TIMEOUT_MS = 20000;
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
                    const r = spawnSync((otherArguments && otherArguments.ffmpegPath) || 'ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: ENCODER_PROBE_TIMEOUT_MS });
                    _encoderSet = parseFfmpegEncoders(r && r.stdout);
                } catch (e) { /* leave empty → native aac fallback, which every build has */ }
            }
        }
        return _encoderSet.has(name);
    };

    // Emit the encoder, rate args, and a log label for an aac_vbr stereo track scoped to output index idx, picking the best VBR AAC encoder THIS node has. The
    // low-info test (an already-lean ≤144k stereo source being codec-swapped) selects the leaner VBR tier on every encoder, mirroring libfdk's -vbr 4 vs -vbr 5:
    //   • libfdk_aac (Lin/Win)  -> -vbr 4/5                         the efficient default (~128-224 kb/s)
    //   • aac_at    (Mac only)  -> -aac_at_mode vbr -q:a 1/0        Apple AudioToolbox, the platform's best VBR AAC when libfdk is absent
    //   • native aac (any)      -> -b:a 256k CBR                    last-resort floor via encoderArgsIdx (-vbr is libfdk-private, so native aac can't VBR here)
    // aac_at's top tier (q:a 0) runs a little heavier than libfdk -vbr 5 but is leaner + faster than native 256k; erring high keeps the fallback no worse than the
    // source warranted. isStereoSrc should be true only for codec_force codec-swap paths where the source is already 2ch. Warns once per file when not using libfdk.
    // Single source for the aac_vbr low-info boundary and its predicted delivered rate, shared by aacVbrArgsIdx (picks the VBR level) and guardBlocks (scores the
    // delivered quality) so the two can't drift: a stereo source at/below this bitrate emits libfdk -vbr 4 (~128k), above it -vbr 5 (~192k).
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
            return { encoder: 'aac_at', args: ` -aac_at_mode:a:${idx} vbr -q:a:${idx} ${q}`, approxRate: lowInfo ? '~150k' : '~190k', label: `aac_at VBR q${q}` };
        }
        const bps = resolveBitrate('aac', channels);
        if (!_aacVbrFallbackWarned) {
            _aacVbrFallbackWarned = true;
            response.infoLog += `☒[codec_stereo=aac_vbr] no libfdk_aac or aac_at on this node - using native aac ${bps / 1000}k instead\n`;
        }
        return { encoder: 'aac', args: encoderArgsIdx('aac', channels, idx), approxRate: `${bps / 1000}k`, label: 'native aac' };
    };

    // Stereo (2ch) encode tokens for the configured stereoCodec, folding the aac_vbr (per-node VBR via aacVbrArgsIdx) vs fixed-bitrate branch otherwise duplicated at
    // every 2ch downmix/remix emit site. Returns the -c:a fragment (encoder + bitrate/quality args), the codec name + rate string + label for the log line, and the
    // output-summary record. Each caller keeps its own -map prefix, log verb/suffix, and outputAudioOverride.set()/appendedAudio.push() target inline.
    const stereoEnc = (idx) => {
        if (stereoCodec === 'aac_vbr') {
            const { encoder, args, approxRate, label } = aacVbrArgsIdx(idx);
            return { frag: `${encoder}${args}`, logCodec: 'aac', rate: approxRate, label, record: { codec: 'aac', channels: 2, bps: 0, approxRate } };
        }
        const bps = resolveBitrate(stereoCodec, 2);
        return { frag: `${audioEncoder(stereoCodec)}${encoderArgsIdx(stereoCodec, 2, idx)}`, logCodec: stereoCodec, rate: `${bps / 1000} kb/s`, label: '', record: { codec: stereoCodec, channels: 2, bps } };
    };

    // Resolve whether a source stream is lossless using the shared resolveCodecName resolution (same one audioQuality uses). Stored per-stream as isTdarrLossless to avoid repeating
    // the resolution at emission. Read by guard_lossless (its guardBlocks skip + the "never drop the last lossless copy" dedup rule), by the dedup sort's trustedRate ranking, and as
    // the source-lossless flag that suppresses resolveBitrate's source-bitrate floor on the codec_force / loudnorm encode paths (downmix paths pass no source bitrate, so are unaffected).
    const isLosslessSource = (stream) => codecInfo[resolveCodecName(stream)]?.lossless === true;

    // Resolve whether a source stream carries object-audio metadata (Atmos / DTS:X / MPEG-H) that ffmpeg cannot reconstruct on re-encode - keyed off the
    // codecInfo objectAudio flag via the same resolveCodecName resolution. Stored per-stream as isTdarrObjectAudio. Read by guard_object_audio (an
    // independent third guard) and used as a dedup tie-breaker so an object-audio track is preferred over an otherwise-equal plain one.
    const isObjectAudioSource = (stream) => codecInfo[resolveCodecName(stream)]?.objectAudio === true;

    // Parse + validate inputs. Order here mirrors the Inputs array in details() so the two never drift. Only type:'string' dropdowns are validated here -
    // the two free-text inputs (language_surround, language_stereo) have no fixed option set, and there are no type:'boolean' inputs. Every checked value
    // fails the file on an out-of-set value.
    const langSurround = String(inputs.language_surround).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const langSurroundKeys = langSurround.map(langKey);     // normalised comparison keys (folds en/eng/english/en-US and 639-2/B vs /T)
    const langStereo = String(inputs.language_stereo).toLowerCase().split(',').map(lang => lang.trim()).filter(lang => lang !== '');
    const langStereoKeys = langStereo.map(langKey);
    const langUnlisted = String(inputs.language_unlisted).trim();
    // Case-preserving language read for the metadata WRITES on transcoded/appended streams below. resolveLang lowercases (correct for its matching KEYS), but writing
    // that would degrade clean_and_remux's canonical BCP-47 region/script case (pt-BR -> pt-br) and trip a later re-repair remux, so the writes read the stored tag
    // verbatim (ffprobe tag, then mediaInfo), preserving case. audio_clean never NORMALISES a language tag - that is clean_and_remux's job.
    const langForWrite = (s) => (s.tags?.language || '').trim() || (mediaInfoFor(s)?.Language ?? '').trim();
    const downmixToSix = String(inputs.downmix_to_six).trim();
    const downmixToStereo = String(inputs.downmix_to_stereo).trim();
    const downmixSecondary = String(inputs.downmix_secondary).trim();
    const surroundCodec = String(inputs.codec_surround).trim();
    const stereoCodec = String(inputs.codec_stereo).trim();
    const forceCodec = String(inputs.codec_force).trim();
    const removeDuplicatesBy = String(inputs.method_deduplicate).trim();
    const regionDedup = String(inputs.method_dedup_region).trim();
    const stereoDownmix = String(inputs.method_stereo_downmix).trim();
    const methodLayoutErr = String(inputs.method_layout_err).trim();
    const loudnorm = String(inputs.method_loudnorm).trim();
    const guardQuality = String(inputs.guard_quality).trim();
    const guardLossless = String(inputs.guard_lossless).trim();
    const guardObjectAudio = String(inputs.guard_object_audio).trim();
    const guardOriginal = String(inputs.guard_original).trim();

    if(!['surround','stereo','delete'].includes(langUnlisted))
        failFile(`[language_unlisted=${langUnlisted}] invalid value, check your settings`);
    if(!['false','replace','true'].includes(downmixToSix))
        failFile(`[downmix_to_six=${downmixToSix}] invalid value, check your settings`);
    if(!['false','replace','true'].includes(downmixToStereo))
        failFile(`[downmix_to_stereo=${downmixToStereo}] invalid value, check your settings`);
    if(!['surround','stereo','delete'].includes(downmixSecondary))
        failFile(`[downmix_secondary=${downmixSecondary}] invalid value, check your settings`);
    if(!['ac3','eac3','aac','opus'].includes(surroundCodec))
        failFile(`[codec_surround=${surroundCodec}] invalid value, check your settings`);
    if(!['ac3','eac3','aac','aac_vbr','opus'].includes(stereoCodec))
        failFile(`[codec_stereo=${stereoCodec}] invalid value, check your settings`);
    if(!['false','6below','2below','all'].includes(forceCodec))
        failFile(`[codec_force=${forceCodec}] invalid value, check your settings`);
    if(!['disabled','multi-stereo','multi-stereo-error','channel','channel-error'].includes(removeDuplicatesBy))
        failFile(`[method_deduplicate=${removeDuplicatesBy}] invalid value, check your settings`);
    if(!['fold','distinct'].includes(regionDedup))
        failFile(`[method_dedup_region=${regionDedup}] invalid value, check your settings`);
    if(!['default','dialogue'].includes(stereoDownmix))
        failFile(`[method_stereo_downmix=${stereoDownmix}] invalid value, check your settings`);
    if(!['keep','drop','remix'].includes(methodLayoutErr))
        failFile(`[method_layout_err=${methodLayoutErr}] invalid value, check your settings`);
    if(!['disabled','tv','cinema','quiet_room'].includes(loudnorm))
        failFile(`[method_loudnorm=${loudnorm}] invalid value, check your settings`);
    if(!['enabled','strict','disabled'].includes(guardQuality))
        failFile(`[guard_quality=${guardQuality}] invalid value, check your settings`);
    if(!['enabled','disabled'].includes(guardLossless))
        failFile(`[guard_lossless=${guardLossless}] invalid value, check your settings`);
    if(!['enabled','disabled'].includes(guardObjectAudio))
        failFile(`[guard_object_audio=${guardObjectAudio}] invalid value, check your settings`);
    if(!['enabled','disabled'].includes(guardOriginal))
        failFile(`[guard_original=${guardOriginal}] invalid value, check your settings`);

    let extraArguments = '';
    let workDone = '';       // "this changed" lines (transcode/add/remix/normalize/remove).
    let skipDone = '';       // "this DIDN'T change, and why" lines (guard blocks, ceiling/missing-data skips). Both buffers are always logged.
    let convert = false;

    // Check if file is a video. If it isn't then exit plugin (before the no-audio check, so a non-video reports "not a video", not "no audio streams").
    if (file.fileMedium !== 'video') {
        response.infoLog += '☑File is not a video\n';
        response.processFile = false;
        return response;
    }

    //We really only care about the audio streams
    let audioStreams = file.ffProbeData.streams.filter(stream => (stream?.codec_type ?? '').trim().toLowerCase() === 'audio');
    if (audioStreams.length === 0) {
        response.infoLog += '☑Video file has no audio streams to manage\n';
        return response;
    }

    // Input summary — the streams exactly as they arrived, before any audio work.
    response.infoLog += `☐Input streams: ${file.ffProbeData.streams.map(s => summariseStream(enrichStream(s))).join('')}\n`;

    // One guard around all the per-file work (dedup, index mapping, the transcode loop, and the output-summary / preset build): a deliberate failFile
    // abort (AwkFailFile) rethrows unchanged, and any UNEXPECTED error fails the file too — annotated and carrying the full infoLog — not a silent skip.
    // (Earlier input validation and the not-a-video / no-audio pre-flight checks run before this and fail-or-skip on their own.)
    try {

        // A secondary track is any commentary, visually-impaired/descriptive, or music-and-effects (clean_effects) track — the shared classifiers cover the
        // disposition flags and the title keywords. A distinct M&E (dialogue-free) mix must never be deduped away as a duplicate of the main mix. Lyrics/songs
        // are subtitle-only, so they never apply to an audio stream. Secondary is a ROLE: such a track follows downmix_secondary whatever its language.
        const isSecondaryTrack = (stream) => isCommentary(stream) || isDescriptive(stream) || hasDisposition(stream, 'clean_effects') || hasDisposition(stream, 'karaoke');

        // Dormancy - see the language_surround tooltip for the full rationale. This boolean is the gate: true only when a genuine (non-secondary) track sits
        // in a language the user asked for (language_surround or language_stereo). Secondary tracks never count toward presence - they follow
        // downmix_secondary, not the lists.
        const hasWantedLang = (langSurroundKeys.length > 0 || langStereoKeys.length > 0)
            && audioStreams.some(s => !isSecondaryTrack(s) && (langListMatch(resolveLang(s) || 'und', langSurroundKeys)
                || langListMatch(resolveLang(s) || 'und', langStereoKeys)));

        //Add secondary track flag, the cleaned language and the resolved tier to each track
        audioStreams = audioStreams.map(stream => {
            const fullLang = resolveLang(stream) || 'und';
            const cleanLang = langKey(fullLang);              // folded MATCH key (en/eng/english/en-US/pt-BR all collapse): drives language matching, tier, priority
            // Dedup / one-downmix-per-language grouping key. method_dedup_region=distinct keeps the region/script subtag (pt-BR != pt-PT, en-US != en); the default 'fold'
            // reuses the folded match key so every regional variant collapses to one language.
            const regionKey = regionDedup === 'distinct' ? langIdentityKey(fullLang) : cleanLang;
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
                isTdarrSecondaryTrack: secondary,
                isTdarrTier: tier,
                isTdarrCleanLang: cleanLang,
                isTdarrRegionKey: regionKey,
                isTdarrQuality: audioQuality(enrichedItem),
                // Used by codec_force to suppress the source-bitrate floor in resolveBitrate for lossless sources. A lossless bitrate (e.g. 4 Mbps TrueHD) is not a
                // comparable quantity for a perceptual encode and would otherwise pin the output at the codec ceiling for no audible gain.
                isTdarrLossless: isLosslessSource(stream),
                // True when the source carries Atmos/DTS:X/MPEG-H object audio ffmpeg can't re-encode - read by guard_object_audio and the dedup tie-break.
                isTdarrObjectAudio: isObjectAudioSource(stream)
            };
        });

        // candidateStreams: the pool for workStreams. A track earns a place when there is genuinely something to do with it - it is a genuine surround track
        // (the only kind eligible for downmix_to_six/downmix_to_stereo), or its tier is 'stereo' (the in-place stereo downmix), or codec_force is set, which
        // must be able to standardize the codec of EVERY track including commentary and unlisted-language ones (e.g. codec_force='all' must touch them all).
        // Anything with nothing to do is dropped from the pool. ('delete'-tier tracks may remain here harmlessly - workStreams filters streamsToRemove below.)
        let candidateStreams = audioStreams;
        if (forceCodec === 'false')
            candidateStreams = candidateStreams.filter(stream => stream.isTdarrTier === 'stereo'
                || (!stream.isTdarrSecondaryTrack && stream.isTdarrTier === 'surround'));

        // guard_lossless/guard_quality/guard_object_audio block a destructive operation on a track only when it would irreversibly lose detail the destination
        // can't hold; see those three tooltips for the full independence rationale (a fully independent set, not a fallback chain). Code-specific facts:
        // protection is earned PER OPERATION — each decision site calls guardBlocks with its own real target codec/channels, not a single "best" track flag.
        // Only a genuine tier-'surround' track is protectable (a secondary track never is, nor one already sent to stereo/delete); a dormant language setting
        // leaves a foreign-only track at 'surround', so it stays protectable. guard_quality alone decides the channel-drop rule and the quality-margin math
        // below: 'strict' protects on ANY predicted score drop, 'enabled' (default) only when the drop EXCEEDS QUALITY_MARGIN. Comparable-codec swaps pass
        // (640k eac3 → 640k ac3 = 5pt; 1509k DTS 5.1 → 640k ac3 = 7pt); flattening a premium master is kept (Atmos → ac3 = 8pt, DTS-HD → ac3 = 10pt).
        // QUALITY_MARGIN = 7 is the DTS(91)-vs-ac3(84) base-score gap, so a DTS core → ac3 sits exactly at the margin on the pass side (a drop must STRICTLY
        // exceed the margin to protect) - preserving the force-DTS-to-ac3 behaviour.
        const QUALITY_MARGIN = 7;
        const guardBlocks = (stream, targetCodec, targetChannels, srcChannels) => {
            if (stream.isTdarrSecondaryTrack || stream.isTdarrTier !== 'surround') return false;
            if (guardLossless === 'enabled' && stream.isTdarrLossless) return true;         // lossless detail can't survive any lossy re-encode
            if (guardObjectAudio === 'enabled' && stream.isTdarrObjectAudio) return true;   // Atmos/DTS:X/MPEG-H object layer has no ffmpeg encoder
            if (guardQuality === 'disabled') return false;
            if (Number(targetChannels) < Number(srcChannels)) return true;       // the operation drops channels
            const family = aacFamily(targetCodec);      // aac_vbr scores as the aac family
            // Predict the bitrate the same-channel force branch actually emits, then score it. aac_vbr emits libfdk VBR (see aacVbrPredictedBps / aacVbrArgsIdx), NOT
            // resolveBitrate's CBR target — predict the VBR rate directly for aac_vbr or the guard would overstate the delivered quality.
            const srcBps = Number(stream.bit_rate) || 0;
            const predBps = targetCodec === 'aac_vbr'
                ? aacVbrPredictedBps(srcBps)
                : resolveBitrate(family, targetChannels, srcBps, false, stream.isTdarrQuality);
            const predQuality = audioQuality({ codec_name: family, channels: targetChannels, bit_rate: predBps });
            const margin = guardQuality === 'strict' ? 0 : QUALITY_MARGIN;
            return predQuality < stream.isTdarrQuality - margin;                 // target scores below the source by more than the tier's margin → detail lost
        };

        // Duplicate removal keeps `survivor` and drops `removed`. Block only when the drop loses detail the survivor can't hold. Separate from guardBlocks: dedupe
        // compares against an existing survivor (not a predicted transcode) and must check the survivor's losslessness. No quality clause on purpose — the dedupe
        // sort is measured-bitrate-first, so a survivor can carry a LOWER isTdarrQuality than the removed track; a quality clause would wrongly block those drops.
        // The channel-count check protects the higher-channel duplicate under BOTH quality tiers ('enabled' and 'strict'), so 'strict' is genuinely ⊇ 'enabled'
        // (its documented "most protective" role) - there is no tier where 'strict' is less protective than 'enabled' for a channel-dropping dedup.
        const dedupeGuardBlocks = (removed, survivor) => {
            if (removed.isTdarrTier !== 'surround') return false;   // a track already headed for stereo/delete is deduped freely (secondary tracks never reach here - skipped in the loop)
            if (guardLossless === 'enabled' && removed.isTdarrLossless && !survivor.isTdarrLossless) return true;   // dropping the last lossless copy
            if (guardObjectAudio === 'enabled' && removed.isTdarrObjectAudio && !survivor.isTdarrObjectAudio) return true;   // dropping the last object-audio (Atmos/DTS:X) copy
            if (guardQuality !== 'disabled' && removed.channels > survivor.channels) return true;     // survivor has fewer channels (enabled AND strict)
            return false;
        };

        // existing2chLangs / existing6chLangs (languages that already have a primary stereo / 5.1-6ch track, so downmix_to_* only creates one when a
        // language lacks it) are computed AFTER dedup and the layout-drop pre-pass below, off the surviving (not-in-streamsToRemove) streams - so a track
        // those two removals take can't leave a stale "already exists" entry that wrongly suppresses a downmix backfill.

        // Identify lower-quality duplicates among MAIN tracks only. Within each group keep only the highest quality stream; the rest are marked for removal
        // ('multi-stereo'/'channel') or, for the "-error" variants, abort the plugin immediately (no streams removed, no other changes applied). Commentary/
        // descriptive (secondary) tracks are exempt - never deduplicated (see the loop's early-continue), so two different commentaries are always both kept.
        // The "-error" suffix only changes what happens on a hit, never the grouping. Grouping key by mode:
        //   'channel'/'channel-error' - (lang, exact channel count): one track per distinct channel count survives (a 7.1, a 5.1 and
        //     a 2.0 of the same language are all kept).
        //   'multi-stereo'/'multi-stereo-error' - (lang, broad surround-vs-stereo role): collapses every surround variant of a
        //     language to a single best surround plus a single best stereo.
        //       Exception: when downmix_to_six is enabled the 5-6ch band is carved into its own role (not folded into "surround") so a
        //       downmix-created/pre-existing 5.1/5.0 is never removed in favour of a 7.1.
        //       Exception: when downmix_to_stereo is enabled exactly-2ch tracks are carved into their own role (not folded into "stereo") so a
        //       downmix-created/pre-existing 2.0 is never removed in favour of a mono.
        //       Both exceptions only apply while the matching downmix option is enabled and use the same channel bands as existing6chLangs/
        //       existing2chLangs, so dedup can't disagree with and re-trigger the downmix creation guards - a disagreement would create an
        //       infinite create/remove loop between the two options.
        // Note: dedup runs across ALL audio streams regardless of the language settings (those govern each track's tier, not what's a
        // genuine duplicate - a duplicate in a non-preferred language is still a duplicate). guard_lossless/guard_quality/guard_object_audio (dedupeGuardBlocks) keep a duplicate whose removal
        // would lose detail the survivor can't hold (a last lossless copy, or a higher-channel track under quality) instead of removing it, and never -errors on it.
        const removeDuplicatesErrorMode = removeDuplicatesBy === 'multi-stereo-error' || removeDuplicatesBy === 'channel-error';
        const removeDuplicatesGroupBy = removeDuplicatesErrorMode ? removeDuplicatesBy.replace(/-error$/, '') : removeDuplicatesBy;
        const streamsToRemove = new Set();
        if (removeDuplicatesGroupBy === 'channel' || removeDuplicatesGroupBy === 'multi-stereo') {
            const seen = new Map();
            // A measured bitrate beats a bitrate-less duplicate of the same tier: audioQuality can only ESTIMATE a track with no reported bitrate (optimistically,
            // from the codec's per-channel target), so it must not win the "which duplicate to keep" decision over a track whose bitrate we actually measured. Both
            // probes are already consulted (resolveStreamBitrate above), so bit_rate === 0 here means genuinely unknown, not just "ffprobe couldn't read it".
            const hasKnownRate = (s) => Number(s.bit_rate || 0) > 0;
            // A lossless track's score is a codec fact (a fixed codecInfo.score), not the optimistic estimate audioQuality gives a bitrate-less LOSSY codec -
            // so it's trustworthy for ranking even with no reported bitrate. Group known-rate OR lossless tracks above estimate-only (bitrate-less lossy) ones,
            // so a lossless master whose bitrate neither probe reports is never sorted below a lossy duplicate and picked for removal (a silent-master-loss bug
            // when guard_lossless is disabled). hasKnownRate still gates the rate DISPLAY below (a lossless track with no bitrate simply shows no "@ N kb/s").
            const trustedRate = (s) => hasKnownRate(s) || s.isTdarrLossless;
            // On a quality tie, keep the higher channel count before falling back to index, so multi-stereo dedup collapsing a language's surround variants keeps
            // the 7.1 over a same-quality 5.1 (channel mode already tiers by exact count, so this only bites the broad modes). When channels also tie, prefer an
            // object-audio (Atmos/DTS:X) track over an otherwise-equal plain one so dedup keeps the copy with the object layer (the codecInfo score bump usually
            // separates them before this fires; the tie-break only matters when their scores land exactly equal).
            const byQuality = [...audioStreams].sort((a, b) =>
                (trustedRate(b) ? 1 : 0) - (trustedRate(a) ? 1 : 0) || b.isTdarrQuality - a.isTdarrQuality || b.channels - a.channels
                || (b.isTdarrObjectAudio ? 1 : 0) - (a.isTdarrObjectAudio ? 1 : 0) || a.index - b.index);
            for (const s of byQuality) {
                // Commentary/descriptive (secondary) tracks are never deduplicated: two different commentaries (e.g. cast & crew vs directors, often BOTH
                // just titled "Commentary") are distinct content the grouping can't tell apart, so keep every one; only MAIN tracks are deduplicated.
                if (s.isTdarrSecondaryTrack) continue;
                // An untagged (und) track is never deduplicated: langKey folds every untagged track to 'und', so two untagged tracks of DIFFERENT real languages would
                // collide on und|tier and the lower-scored one would be silently dropped - the only copy of a language lost. Language can't prove same content (mirrors the
                // secondary exemption above). clean_and_remux's language_fill_mode vets untagged audio when it runs first, but audio_clean is independently runnable, so guard here too.
                if (s.isTdarrCleanLang === 'und') continue;
                let tier;
                if (removeDuplicatesGroupBy === 'channel') {
                    tier = s.channels;
                } else if (downmixToSix !== 'false' && s.channels > 4 && s.channels <= 6) {
                    tier = 'six';
                } else if (downmixToStereo !== 'false' && s.channels === 2) {
                    tier = 'stereo2';
                } else {
                    tier = s.channels > 2 ? 'surround' : 'stereo';
                }
                // Only MAIN tracks reach here (secondaries skipped above), so the region-grouping key + channel-tier fully identifies a duplicate group (region-distinct only when method_dedup_region=distinct).
                const key = `${s.isTdarrRegionKey}|${tier}`;
                if (seen.has(key)) {
                    const kept = seen.get(key);
                    if (dedupeGuardBlocks(s, kept)) continue;
                    if (removeDuplicatesErrorMode) {
                        const rmRate = hasKnownRate(s) ? ` @ ${Math.round(Number(s.bit_rate) / 1000)} kb/s` : '';
                        const keptRate = hasKnownRate(kept) ? ` @ ${Math.round(Number(kept.bit_rate) / 1000)} kb/s` : '';
                        failFile(`${streamTag(s.index)}[method_deduplicate=${removeDuplicatesBy}] Duplicate audio track (${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrRegionKey}${rmRate}) alongside stream ${kept.index} (${kept.codec_name || 'unknown'}${keptRate}) - aborting; tag/remove tracks manually and requeue, or switch method_deduplicate to a non-error mode`);
                    }
                    streamsToRemove.add(s.index);
                    // Show the removed track's bitrate and the kept track's for contrast — duplicates are
                    // decided by quality score (largely bitrate-driven), so this makes the choice transparent.
                    const rmRate = hasKnownRate(s) ? ` @ ${Math.round(Number(s.bit_rate) / 1000)} kb/s` : '';
                    const keptRate = hasKnownRate(kept) ? ` @ ${Math.round(Number(kept.bit_rate) / 1000)} kb/s` : '';
                    workDone += `☐${streamTag(s.index)}[method_deduplicate=${removeDuplicatesBy}] Removing duplicate (lower quality ${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrRegionKey}${rmRate}) - keeping stream ${kept.index} (${kept.codec_name || 'unknown'}${keptRate})\n`;
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
        // Layouts that map LOSSLESSLY to an opus-accepted layout at the SAME channel count by pure relabel (side↔back position equivalence)
        // - emitted via channelmap (a permutation matrix, never a mix). Anything not here remixes down to stereo.
        const OPUS_RELABEL = {
            '5.0(side)': { layout: '5.0', map: 'FL-FL|FR-FR|FC-FC|SL-BL|SR-BR' },
            '6.1(back)': { layout: '6.1', map: 'FL-FL|FR-FR|FC-FC|LFE-LFE|BL-SL|BR-SR|BC-BC' },
        };
        // Audio streams still present (not in streamsToRemove), read at call time so it reflects dedup + pre-pass removals - backs the never-drop-last-track guard.
        const countSurvivingAudio = () => file.ffProbeData.streams.filter(a => (a?.codec_type || '').toLowerCase() === 'audio' && !streamsToRemove.has(a.index)).length;

        // ====== TIER DELETES ======
        // language_unlisted=delete / downmix_secondary=delete. Runs before the layout-drop pre-pass (so an already-deleted track isn't dropped twice) and before
        // existing2chLangs/existing6chLangs below (so a deleted track can't leave a stale "already exists" entry that suppresses a downmix backfill).
        // The two deletes carry DIFFERENT safety nets, because they fail differently:
        //   language_unlisted=delete removes a whole unwanted language, so it must NOT require another track of that language to survive - that rule would make
        //     the option inert, since an unwanted dub is normally the only track of its language. Its safety is dormancy (hasWantedLang) + the never-empty floor.
        //   downmix_secondary=delete removes an EXTRA, so it keeps the fall-back rule: only remove it when a plain (non-secondary) track of the SAME language
        //     survives to fall back on - a lone audio-description track, or the only track of its language, is kept.
        // Both are floored by countSurvivingAudio() > 1: no delete may ever leave the file with no audio at all.
        const delToken = (s) => `${s.codec_name || 'unknown'} ${s.channels}ch ${s.isTdarrCleanLang}`;
        // Language deletes resolve FIRST, so the plain-language fall-back set the role deletes read below reflects what actually survives them.
        for (const s of audioStreams) {
            if (s.isTdarrTier !== 'delete' || s.isTdarrSecondaryTrack || streamsToRemove.has(s.index)) continue;
            if (countSurvivingAudio() <= 1) {
                skipDone += `☒${streamTag(s.index)}[language_unlisted=delete] Not removing ${delToken(s)} - it is the last audio track\n`;
                continue;
            }
            streamsToRemove.add(s.index);
            workDone += `☐${streamTag(s.index)}[language_unlisted=delete] Removing ${delToken(s)} - not in language_surround or language_stereo\n`;
        }
        const plainLangsSurviving = new Set(audioStreams.filter(s => !s.isTdarrSecondaryTrack && !streamsToRemove.has(s.index)).map(s => s.isTdarrCleanLang));
        for (const s of audioStreams) {
            if (s.isTdarrTier !== 'delete' || !s.isTdarrSecondaryTrack || streamsToRemove.has(s.index)) continue;
            if (!plainLangsSurviving.has(s.isTdarrCleanLang)) {
                skipDone += `☒${streamTag(s.index)}[downmix_secondary=delete] Not removing ${delToken(s)} - no plain ${s.isTdarrCleanLang} track survives to fall back on\n`;
                continue;
            }
            if (countSurvivingAudio() <= 1) {
                skipDone += `☒${streamTag(s.index)}[downmix_secondary=delete] Not removing ${delToken(s)} - it is the last audio track\n`;
                continue;
            }
            streamsToRemove.add(s.index);
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
                if (streamsToRemove.has(s.index)) continue;
                const ch = resolveChannels(s);
                const lay = (s.channel_layout || '').toLowerCase().trim();
                if (ch <= 2 || ch > 8) continue;                                             // stereo→codec_stereo; >8 blocked (targetMaxCh)
                if ((s.codec_name || '').toLowerCase() === 'opus') continue;                 // already opus
                if (guardBlocks(s, surroundCodec, ch, ch)) continue;   // guard_lossless/guard_quality/guard_object_audio — mirrors the force-site guard (surroundCodec is opus)
                if (!(forceCodec === 'all' || (forceCodec === '6below' && ch <= 6))) continue;   // surround shouldForce (mirrors the loop)
                if (opusAcceptsLayout(ch, lay)) continue;
                if (OPUS_RELABEL[lay]) continue;                                             // losslessly relabelable → the loop transcodes it, never drop
                // A downmix that will process this track keeps it out of the drop pile — whether it converts in place (replace, unguarded) or flips to 'add'
                // (guarded: source kept + a derivative added), the track SURVIVES, so defer the drop to the loop; only a track NO downmix touches is truly dropped.
                // Must NOT gate this on guardBlocks: a guarded replace flips to 'add', which keeps the source — dropping it here would delete it before that add runs
                // (a data-loss regression). surround tier: downmix_to_stereo=replace (any >2ch) or downmix_to_six=replace (>6ch → 5.1); stereo tier: the in-place downmix.
                // The per-language one-shot (created2chLangs/six) is dynamic and can't be predicted here; a pre-empted downmix lands the track in the loop keep fallback.
                const stereoPath = s.isTdarrTier === 'stereo';                                   // the in-place stereo downmix converts it anyway
                const surroundPath = !s.isTdarrSecondaryTrack && s.isTdarrTier === 'surround';   // only a genuine surround track reaches downmix_to_*
                if (stereoPath || (surroundPath && (downmixToStereo === 'replace' || (ch > 6 && downmixToSix === 'replace')))) continue;
                if (countSurvivingAudio() <= 1) continue;                                    // never drop the last audio track
                streamsToRemove.add(s.index);
                workDone += `☒${streamTag(s.index)}[method_layout_err=${methodLayoutErr}] Dropping - libopus can't encode a ${s.channel_layout || `${ch}ch`} layout\n`;   // this IS a change (removal)
                // Remember a dropped source a downmix (add/'true' mode) would derive from, so its stereo/5.1 still gets created even though the source
                // itself is gone (see the post-loop pass below). 'replace' modes already deferred above (they convert the source in place), so only the
                // 'true'/add cases reach here. Only a genuine surround track derives: a 'stereo'-tier track is converted in place, never derived from.
                if (surroundPath && (downmixToStereo !== 'false' || (ch > 6 && downmixToSix !== 'false')))
                    layoutDroppedDeriveSources.push(s);
            }
        }

        // Now that dedup + the layout-drop pre-pass have finalised streamsToRemove, snapshot which languages still have a primary stereo / 5.1-6ch track
        // among the SURVIVORS, so downmix_to_stereo/downmix_to_six only create one for a language that genuinely lacks it (a removed track can't leave a
        // stale entry). isTdarrRegionKey (the same key dedup grouped on - region-distinct only when method_dedup_region=distinct) matches created2chLangs/ffstreamLangKey. Channels 2 = stereo;
        // >4 && <=6 = any 5-6 channel primary (5.0/5.1, and the rare 4.1 which is also 5 channels) without catching 4.0 (4ch) or 7.1 (8ch).
        const survivingPrimaryAudio = audioStreams.filter(s => !streamsToRemove.has(s.index) && !s.isTdarrSecondaryTrack && s.isTdarrTier === 'surround');
        const existing2chLangs = new Set(survivingPrimaryAudio.filter(s => s.channels === 2).map(s => s.isTdarrRegionKey));
        const existing6chLangs = new Set(survivingPrimaryAudio.filter(s => s.channels > 4 && s.channels <= 6).map(s => s.isTdarrRegionKey));

        // inputAudioIdxMap: 0-based audio-type index within the INPUT file (for -map 0:a:N).
        // outputAudioIdxMap: 0-based audio-type index within the OUTPUT (for -c:a:N and -metadata:s:a:N).
        // These differ when removeDuplicatesBy removes streams, since -map 0:a:N always references input.
        const inputAudioIdxMap = new Map();
        const outputAudioIdxMap = new Map();
        let inputAudioCounter = 0;
        let totalOutputAudioBeforeNew = 0;
        for (const stream of file.ffProbeData.streams) {
            if ((stream?.codec_type || '').trim().toLowerCase() === 'audio') {
                inputAudioIdxMap.set(stream.index, inputAudioCounter++);
                if (!streamsToRemove.has(stream.index))
                    outputAudioIdxMap.set(stream.index, totalOutputAudioBeforeNew++);
            }
        }

        // Exclude tracks that need no codec work: alreadyTargetCodec flags a track already in its tier's forced codec; the filter below drops it.
        // aac_vbr is treated as the aac family for codec-identity checks — ffprobe always reports codec_name 'aac' regardless of which encoder produced the
        // track, so comparing against 'aac_vbr' directly would never match and would needlessly re-encode existing AAC tracks.
        const stereoCodecFamily = aacFamily(stereoCodec);
        // alreadyTargetCodec: true when a track has landed in a codec_force-affected tier AND is already in that tier's target codec, so there is nothing
        // left to do and it can be excluded from workStreams (the .filter below keeps only the streams this returns false for). The surround shortcuts must
        // only fire for a genuine surround-tier track: a 'stereo'-tier track (language_stereo, language_unlisted=stereo, or downmix_secondary=stereo) always
        // needs the in-place stereo downmix, so a stereo-tier surround source already in surroundCodec must NOT be treated as done here - it has to stay in
        // workStreams to reach that downmix regardless of downmix_to_* / codec.
        const alreadyTargetCodec = (stream) => {
            //8 channel
            if(stream.channels > 6 && stream.isTdarrTier === 'surround' && (downmixToSix === 'false') && (downmixToStereo === 'false') && (forceCodec === 'all' && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
                return true;
            //3-6 channel
            else if(stream.channels > 2 && stream.channels <= 6 && stream.isTdarrTier === 'surround' && (downmixToStereo === 'false') && (['all','6below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === surroundCodec)))
                return true;
            if((stream.channels <= 2) && ['all','6below','2below'].includes(forceCodec) && ((stream?.codec_name ?? '').trim().toLowerCase() === stereoCodecFamily))
                return true;
            return false;
        };

        // workStreams: surviving candidates that still need codec work (downmix or force codec).
        let workStreams = candidateStreams
            .filter(s => !streamsToRemove.has(s.index))
            .filter(s => !alreadyTargetCodec(s));

        workStreams.sort((a, b) => {
            // language priority: the languages the user most wants (language_surround), in the order they listed them. isTdarrCleanLang is the normalised key
            // and langSurroundKeys the normalised user list, so en/eng/english all rank together. A stereo-tier or unlisted language ranks last.
            // The unlisted sentinel is the list LENGTH (past every real 0..length-1 index), so it can't collide with a real index on a huge free-text list -
            // matching stream_ordering's getLangRank.
            const aLang = langSurroundKeys.indexOf(a.isTdarrCleanLang);
            const bLang = langSurroundKeys.indexOf(b.isTdarrCleanLang);

            const aRank = aLang === -1 ? langSurroundKeys.length : aLang;
            const bRank = bLang === -1 ? langSurroundKeys.length : bLang;
            if (aRank !== bRank) return aRank - bRank;

            // a full-quality genuine track outranks anything demoted to stereo or any secondary (commentary/descriptive/M&E) track
            const aRole = (a.isTdarrSecondaryTrack || a.isTdarrTier !== 'surround') ? 1 : 0;
            const bRole = (b.isTdarrSecondaryTrack || b.isTdarrTier !== 'surround') ? 1 : 0;
            if (aRole !== bRole) return aRole - bRole;

            // channel ordering
            if (a.channels !== b.channels)
                return b.channels - a.channels;

            const aQuality = a.isTdarrQuality;
            const bQuality = b.isTdarrQuality;
            if(aQuality !== bQuality) return bQuality - aQuality;

            return a.index - b.index;
        });

        if (workStreams.length === 0 && streamsToRemove.size === 0 && loudnorm === 'disabled') {
            response.infoLog += '☑No audio tracks require changes\n';
            return response;
        }

        // Seed extraArguments with removal exclusions before any codec args.
        if (streamsToRemove.size > 0) {
            for (const idx of streamsToRemove)
                extraArguments += ` -map -0:${idx}`;
            convert = true;
        }

        // New streams added via -map are numbered after all surviving original audio streams.
        let newStreamOutputIdx = totalOutputAudioBeforeNew;

        // Create at most one 6ch and one 2ch downmix per language, sourced from that language's best (first, highest-channel/quality) track.
        const created6chLangs = new Set();
        const created2chLangs = new Set();

        // Tracks which input audio indices have already received a -c:a:N assignment so we don't emit conflicting codec directives for the same stream.
        const modifiedAudioIdx = new Set();

        // Predicted-output tracking for the closing summary line (does not affect the ffmpeg preset).
        // outputAudioOverride: outputAudioIdx -> {codec, channels, bps} for in-place transcodes/downmixes.
        // appendedAudio: streams added via -map 0:a:N (downmix 'true'/add), appended after all originals.
        const outputAudioOverride = new Map();
        const appendedAudio = [];

        // Build the title for a new or replaced track, in the canonical form clean_and_remux's tag_title converges on - so a subsequent clean_and_remux pass
        // finds nothing to rewrite and the file settles without an extra remux. The channel/downmix base comes first and any disposition roles go LAST: a
        // source "5.1 - Commentary" downmixed to stereo becomes "5.1 -> 2.0 - Commentary"; a bare "5.1" becomes "5.1 -> 2.0"; an untitled track becomes just
        // the target label (e.g. "Stereo"); and a rich custom title clean_and_remux wouldn't own keeps its arrow-appended form ("Dolby TrueHD 7.1 -> 2.0").
        // The raw arrow title is assembled first (source + "-> label", or the label alone when untitled; unchanged if it already ends in the target label, so
        // no "... 2.0 -> 2.0"), then canonicalAudioTitle applies clean_and_remux's exact ownership/role rules. Roles come from the source flags via the shared
        // titleTagsFor, and the target's bare label (e.g. "2.0" -> "Stereo") from the shared channelLabel, so both plugins always agree.
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

        // Lo/Ro stereo downmix matrices, generated from each source layout's exact channel order.
        // WHY layout-keyed and not channel-count-keyed: several standard layouts share a channel count but order their channels differently (e.g. 6 channels
        // can be 5.1, 5.1(side), 6.0, 6.0(front), or hexagonal). A count-based matrix would silently mis-route - dropping the wrong channel as "LFE" or
        // panning a back-center where a surround belongs - producing audio that sounds wrong without any error. So we resolve the EXACT layout to its
        // canonical channel list and build the matrix from speaker roles. Any layout without a verified channel list returns null and the caller falls back
        // to ffmpeg's safe -ac 2 downmix.
        // Downmix rules (standard Lo/Ro): FL/FR kept at full scale (peak 1.0); FC at -3 dB (0.707) into both so dialogue stays clear; LFE dropped (avoids
        // mud); back/side/wide at -3 dB to their own side; any centered channel (FC, BC) split equally to both sides. The -3 dB attenuation on
        // center/surround provides the clipping headroom, matching the industry-standard Lo/Ro downmix used by Blu-ray players, AV receivers, and streaming
        // services.
        // Canonical ffmpeg channel lists per layout (verified against ffmpeg-utils "Channel Layout" docs). Position in the array is the cN index used by
        // the pan filter.
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

        // Per-speaker contribution to the L and R downmix outputs. Centered channels (FC, BC) contribute equally to both; left-side channels contribute only to L,
        // right-side only to R; LFE contributes nothing. Values are the standard Lo/Ro gains.
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
        // FL/FR/LFE) where -ac 2 is already correct. FL/FR kept at full scale (peak 1.0); center/surround fold in at standard Lo/Ro gains (-3 dB for
        // FC/BC/surrounds, LFE dropped). The -3 dB attenuation provides the clipping headroom - a global sum-normalization is not used because it produces
        // output 6-8 dB quieter than the source on typical content.
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

            // No surround/center to fold in (e.g. 2.1 = FL FR LFE, or stereo) — let -ac 2 handle it.
            if (!hasNonFront) return null;
            // Defensive: a layout missing a front channel leaves peakL/peakR at 0 and would make the gain normalisation below divide by zero. Every canonical
            // layout leads with FL,FR so this never triggers today - it just keeps the matrix safe if a non-FL/FR-leading layout is ever added to CANON_LAYOUTS.
            if (peakL <= 0 || peakR <= 0) return null;

            channelList.forEach((spk, i) => {
                const g = SPEAKER_GAINS[spk];
                if (!g) return;
                // Divide by peakL/peakR (always 1.0 — set from FL/FR) so coefficients are emitted as-authored.
                // Floor to 3 decimals (truncate, not round) for deterministic output.
                if (g.L > 0) termsL.push(`${(Math.floor((g.L / peakL) * 1000) / 1000).toFixed(3)}*c${i}`);
                if (g.R > 0) termsR.push(`${(Math.floor((g.R / peakR) * 1000) / 1000).toFixed(3)}*c${i}`);
            });

            return `pan=stereo|FL=${termsL.join('+')}|FR=${termsR.join('+')}`;
        };

        // Resolve a source stream to its canonical layout key, then to a verified pan matrix (or null). We normalize the ffmpeg channel_layout string (lowercased,
        // trimmed). If the file reports no layout or an unrecognized one, we return null so the caller uses ffmpeg's safe -ac 2 downmix.
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
        // Two-pass measured EBU R128 loudness correction, entirely self-contained within this plugin's own invocation - no cross-plugin/cross-run
        // state, no HTTP calls to Tdarr's API. audio_clean spawns ffmpeg itself (as do video_clean's encoder probe and this plugin's own aac_vbr encoder probe) to run
        // an analysis-only pass, then builds the real measured correction filter from its output. otherArguments.ffmpegPath is already available to
        // classic plugins; several official Community/*.js plugins already call child_process.exec/execSync (including two that shell out to ffmpeg
        // directly), and Tdarr loads classic plugins as ordinary, unsandboxed Node modules - so this needed no new capability from Tdarr itself.
        const LOUDNORM_PRESETS = {
            tv:         { I: -16, LRA: 11, TP: -1.5 },
            cinema:     { I: -23, LRA: 15, TP: -1.0 },
            quiet_room: { I: -16, LRA: 6,  TP: -1.5 },
        };
        const LOUDNORM_TOLERANCE_LU = 1;

        // Run ffmpeg as a synchronous child process to measure one audio stream's loudness (analysis-only, audio-only, no output written). Returns
        // { stats } with the measured EBU R128 JSON fields (input_i/input_tp/input_lra/input_thresh/target_offset), or { error } on any failure - a
        // missing binary, non-zero exit, timeout, or unparseable output are all reported here rather than thrown, so the caller decides how to fail
        // the file. ffmpeg's loudnorm filter logs its print_format=json summary at AV_LOG_INFO, so -loglevel must stay at or above that - only
        // -nostats (which silences the unrelated periodic progress line, not the loudnorm summary) is passed. Args-array form only, never a
        // shell-interpolated string, so a file path can never break out into a second command.
        // The JSON is NOT the last thing on stderr: real ffmpeg (5.1+, every platform) prints the loudnorm summary during
        // filter teardown, then two more AV_LOG_INFO lines - "[out#0/null ...] muxing overhead: unknown" and a final
        // "size=N/A time=... speed=..." trailer (neither suppressible without also losing the JSON). So we take the LAST
        // flat {...} block anywhere in stderr, not one anchored to end-of-string; last-match also skips a track title that
        // contains literal braces (e.g. a "{weird}" title) since ffmpeg emits that BEFORE the loudnorm summary.
        const measureLoudness = (srcAudioIdx, preFilter, preset) => {
            const { spawnSync } = require('child_process');
            const analysisFilter = `${preFilter ? `${preFilter},` : ''}loudnorm=I=${preset.I}:LRA=${preset.LRA}:TP=${preset.TP}:print_format=json`;
            const args = ['-nostats', '-hide_banner', '-i', file.file, '-map', `0:a:${srcAudioIdx}`, '-af', analysisFilter, '-f', 'null', '-'];
            const result = spawnSync((otherArguments && otherArguments.ffmpegPath) || 'ffmpeg', args, { timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' });
            if (result.error) return { error: `could not start ffmpeg (${result.error.message})` };
            if (result.signal) return { error: `ffmpeg was killed (signal ${result.signal}, likely a timeout)` };
            if (result.status !== 0) return { error: `ffmpeg exited with status ${result.status}` };
            const jsonBlocks = String(result.stderr || '').match(/\{[^{}]*\}/g);
            // Take the LAST block that actually parses AND carries the loudnorm field, so a brace-bearing title can't shadow it.
            let stats = null;
            for (const block of (jsonBlocks || [])) {
                try { const parsed = JSON.parse(block); if (parsed && 'input_i' in parsed) stats = parsed; } catch (e) { /* not the JSON block */ }
            }
            if (!stats) return { error: 'could not find loudnorm measurement JSON in ffmpeg output' };
            return { stats };
        };

        // Measure, then decide the correction filter comma-chained onto preFilter, or return unchanged (changed:false) when already within
        // LOUDNORM_TOLERANCE_LU of the preset target. measured_thresh has NO uppercase alias (unlike measured_I/measured_LRA/measured_TP, which
        // accept either case) - keep it exactly lowercase. Pass-1's JSON field names (input_i/input_lra/input_tp/target_offset) are NOT the same
        // strings as pass-2's filter option names (measured_I/measured_LRA/measured_TP/offset) - same numbers, different names on each side.
        // Cap the loudnorm analysis passes per file: each is a synchronous full-duration ffmpeg spawn, so a pathological/crafted file declaring a huge number
        // of audio tracks could otherwise tie up a worker for hours (the per-spawn 10-min timeout never fires - each pass finishes well under it). A real file
        // has a handful of audio tracks, so this bound is invisible in practice; past it the remaining tracks are left at source loudness with a single warning
        // rather than measured, and a later queue pass can normalize them.
        const LOUDNORM_MAX_TRACKS = 24;
        let loudnormMeasureCount = 0;
        let loudnormCapWarned = false;
        const buildLoudnormFilter = (streamIndex, srcAudioIdx, preFilter, preset) => {
            if (loudnormMeasureCount >= LOUDNORM_MAX_TRACKS) {
                if (!loudnormCapWarned) {
                    response.infoLog += `☒[method_loudnorm=${loudnorm}] More than ${LOUDNORM_MAX_TRACKS} audio tracks to normalize - measuring the first ${LOUDNORM_MAX_TRACKS}, leaving the rest at source loudness (a later pass can normalize them)\n`;
                    loudnormCapWarned = true;
                }
                return { filter: preFilter, changed: false };
            }
            loudnormMeasureCount++;
            const analysis = measureLoudness(srcAudioIdx, preFilter, preset);
            if (analysis.error)
                failFile(`${streamTag(streamIndex)}[method_loudnorm=${loudnorm}] loudnorm analysis pass failed (${analysis.error}) - if this file has known corruption, try clean_and_remux's recover_bad_timestamps/recover_bad_data first; if the codec itself is unsupported, that won't help`);
            const { stats } = analysis;
            // A digitally-silent track measures input_i="-inf" (and target_offset="inf"); Number("-inf") is NaN (JS parses
            // "Infinity", not "inf"), which would defeat the tolerance test AND then bake a literal measured_I=-inf into the
            // correction filter that the real pass-2 transcode rejects ("out of range [-99 - 0]"). Silence can't be
            // loudness-normalized anyway, so treat any non-finite measured integrated loudness as within-tolerance (skip).
            if (!Number.isFinite(Number(stats.input_i)) || Math.abs(Number(stats.input_i) - preset.I) <= LOUDNORM_TOLERANCE_LU)
                return { filter: preFilter, changed: false };
            const corrected = `loudnorm=I=${preset.I}:LRA=${preset.LRA}:TP=${preset.TP}:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}:measured_TP=${stats.input_tp}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
            return { filter: preFilter ? `${preFilter},${corrected}` : corrected, changed: true };
        };

        // Caching tag for the untouched-track path only (a track untouched by anything else this run - the only case where "nothing about this
        // stream changed since we last checked it" is actually guaranteed). Written as "<preset>-<plugin version>" but matched on the preset portion
        // ONLY - the version rides along unused today, reserved in case a future fix must distinguish a cache written by a known-buggy version.
        // Matroska uppercases unrecognized custom tag names on write (confirmed against the real ffmpeg binary), so read-back must be case-insensitive:
        // readLoudnormTag goes through the shared getTagCI helper.
        const readLoudnormTag = (stream) => getTagCI(stream.tags || {}, 'awk_loudnorm').trim();
        const loudnormTagMatchesPreset = (stream) => readLoudnormTag(stream).split('-')[0] === loudnorm;
        const loudnormTagValue = () => `${loudnorm}-${details().Version}`;
        // Only Matroska persists arbitrary per-stream tags through a -c copy remux; the mov/mp4/m4a muxers silently DROP a
        // custom awk_loudnorm tag. On those containers the cache stamp would vanish and be re-applied every reprocess - and
        // for an already-within-tolerance track that stamp is the ONLY change, so it would remux the file on every single
        // pass forever (a non-idempotent loop). So the stamp is emitted only when it will actually survive; on other
        // containers a within-tolerance track is left a true no-op (re-measured next run, but never remuxed). A track that
        // genuinely needs correction still re-encodes once regardless of container, then measures within tolerance next run.
        const loudnormTagPersists = ['mkv', 'webm', 'mka'].includes(String(file.container).toLowerCase());
        const loudnormStampArg = (idx) => (loudnormTagPersists ? ` -metadata:s:a:${idx} "awk_loudnorm=${loudnormTagValue()}"` : '');
        const langMetaArg = (idx, lang) => (lang ? ` -metadata:s:a:${idx} "language=${escMeta(lang)}"` : '');
        // ===== END LOUDNORM =====

        // Channel/filter snippet for a new or replaced stereo track. When loudnorm is enabled, every call site here has already either passed its
        // own guardBlocks check (an in-place replace/secondary/remix-defer reaches this helper only after that), or is a brand-new appended
        // derivative (downmix 'add'/'true') that's an unconditional lossy re-encode by construction - so no additional guard_lossless/guard_quality/guard_object_audio check is
        // needed here either way; loudnorm rides on whichever of those two guarantees already applies. The no-verified-pan-matrix fallback must be
        // an explicit filter (aformat=channel_layouts=stereo, verified equivalent to -ac 2 - see the loudnorm section) rather than bare -ac when
        // loudnorm is active, so the downmix can be comma-chained BEFORE loudnorm's analysis/correction filter instead of ffmpeg silently applying
        // the implicit -ac conversion AFTER an explicit -filter:a (which would measure/correct the wrong, pre-downmix signal).
        const stereoArg = (idx, srcStream) => {
            const matrix = (stereoDownmix === 'dialogue') ? downmixMatrix(srcStream) : null;
            if (loudnorm === 'disabled')
                return matrix ? ` -filter:a:${idx} "${matrix}"` : ` -ac:a:${idx} 2`;
            const preFilter = matrix || 'aformat=channel_layouts=stereo';
            const srcAudioIdx = inputAudioIdxMap.get(srcStream.index);
            const { filter } = buildLoudnormFilter(srcStream.index, srcAudioIdx, preFilter, LOUDNORM_PRESETS[loudnorm]);
            return ` -filter:a:${idx} "${filter}"`;
        };

        // 6ch (5.1) channel/filter snippet for a new or replaced 5.1 track, mirroring stereoArg for the surround case: a bare -ac 6 when loudnorm is off,
        // else an explicit aformat=channel_layouts=5.1 (verified equivalent to -ac 6) chained BEFORE loudnorm's analysis/correction so it measures the
        // post-downmix signal (a bare -ac would apply its implicit conversion AFTER an explicit -filter:a). Shared by append6ch and the in-place
        // downmix_to_six 'replace' branch so the two can't drift.
        const sixArg = (idx, srcStream) => {
            if (loudnorm === 'disabled') return ` -ac:a:${idx} 6`;
            const { filter } = buildLoudnormFilter(srcStream.index, inputAudioIdxMap.get(srcStream.index), 'aformat=channel_layouts=5.1', LOUDNORM_PRESETS[loudnorm]);
            return ` -filter:a:${idx} "${filter}"`;
        };

        // Emit an APPENDED downmix track (a brand-new stream via -map 0:a:N; the source survives elsewhere): encoder+bitrate+loudnorm, the -c:a/filter/title/-metadata
        // emit, the appendedAudio record, created*Langs registration, and the newStreamOutputIdx/convert bookkeeping. Shared by the downmix_to_six/_stereo 'add' branches
        // AND the layout-drop derivatives so the four append sites can't drift. srcCodecStr is the source's display codec at each site; logSuffix carries the layout-drop
        // "(source dropped ...)" note. An appended track is an unconditional lossy re-encode, so loudnorm always rides it (no guardBlocks - see the callers).
        const append6ch = (srcStream, srcAudioIdx, srcCodecStr, srcRateStr, langKeyVal, logSuffix) => {
            const newTitle = escMeta(buildTitle(srcStream, '5.1'));
            const dstBitArg = encoderArgsIdx(surroundCodec, 6, newStreamOutputIdx);
            const dstBitStr = resolveBitrate(surroundCodec, 6);
            const sixFilter = sixArg(newStreamOutputIdx, srcStream);
            workDone += `☐${streamTag(srcStream.index)}[downmix_to_six=${downmixToSix}] Adding ${surroundCodec} 6ch @ ${dstBitStr / 1000} kb/s from ${srcCodecStr} ${srcStream.channels}ch @ ${srcRateStr}${logSuffix}\n`;
            extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${audioEncoder(surroundCodec)}${dstBitArg}${sixFilter} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
            const wl = langForWrite(srcStream);
            extraArguments += langMetaArg(newStreamOutputIdx, wl);
            newStreamOutputIdx++;
            appendedAudio.push({ srcStream, codec: surroundCodec, channels: 6, bps: dstBitStr });
            created6chLangs.add(langKeyVal);
            convert = true;
        };
        const append2ch = (srcStream, srcAudioIdx, srcCodecStr, srcRateStr, langKeyVal, logSuffix) => {
            const newTitle = escMeta(buildTitle(srcStream, '2.0'));
            const e = stereoEnc(newStreamOutputIdx);
            workDone += `☐${streamTag(srcStream.index)}[downmix_to_stereo=${downmixToStereo}] Adding ${e.logCodec} stereo @ ${e.rate}${e.label ? ` (${e.label})` : ''} from ${srcCodecStr} ${srcStream.channels}ch @ ${srcRateStr}${logSuffix}\n`;
            extraArguments += ` -map 0:a:${srcAudioIdx} -c:a:${newStreamOutputIdx} ${e.frag}${stereoArg(newStreamOutputIdx, srcStream)} -metadata:s:a:${newStreamOutputIdx} "title=${newTitle}"`;
            const wl = langForWrite(srcStream);
            extraArguments += langMetaArg(newStreamOutputIdx, wl);
            newStreamOutputIdx++;
            appendedAudio.push({ srcStream, ...e.record });
            created2chLangs.add(langKeyVal);
            convert = true;
        };

        for (let i = 0; i < workStreams.length; i++) {
            const ffstream = workStreams[i];
            const ffstreamCodec = (ffstream.codec_name || '').toLowerCase();
            const streamLang = langForWrite(ffstream);
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

            const ffstreamLangKey = ffstream.isTdarrRegionKey;

            // Human-readable source bitrate for the operation log. Falls back to the known target bitrate for our own output codecs (common for
            // freshly-transcoded tracks where the muxer omits per-stream bitrate), or 'unknown bitrate' otherwise.
            const srcBitrate = Number(ffstream.bit_rate || 0);
            const srcRateStr = srcBitrate > 0
                ? `${Math.round(srcBitrate / 1000)} kb/s`
                : (() => {
                    const tb = targetTable(ffstreamCodec, ffstream.channels);
                    return tb > 0 ? `~${tb / 1000} kb/s` : 'unknown bitrate';
                })();

            // A secondary track (commentary, VI, M&E) and any track demoted to the stereo tier take the in-place stereo path, and never trigger the surround
            // downmix (downmix_to_six/two) - only a genuine tier-'surround' track reaches those.
            if (ffstream.isTdarrSecondaryTrack || ffstream.isTdarrTier !== 'surround') {
            // ---- STEREO TIER: DOWNMIX IN PLACE ----
            // Each such surround track is transcoded in place independently — one stereo per track, preserving all of them. ONLY tier 'stereo' converts: a
            // secondary track left at downmix_secondary=surround falls through untouched here (codec_force/method_loudnorm may still act on it further down).
            // guard_lossless/guard_quality/guard_object_audio never protect a secondary or a non-surround-tier track (guardBlocks short-circuits false for
            // them), so there is no guarded-source case here: the stereo tier always transcodes in place.
            if (ffstream.isTdarrTier === 'stereo' && ffstream.channels > 2 && !modifiedAudioIdx.has(outputAudioIdx)) {
                const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                // Downmix changes channel count, so the source bitrate isn't a comparable floor - stereoEnc uses the 2ch table target (aac_vbr uses plain VBR 5).
                const e = stereoEnc(outputAudioIdx);
                // Thread the setting that actually put this track on the stereo tier, so the log names the input the user would go change.
                const tierTag = ffstream.isTdarrSecondaryTrack ? `downmix_secondary=${downmixSecondary}`
                    : (langStereoKeys.includes(ffstream.isTdarrCleanLang) ? 'language_stereo' : `language_unlisted=${langUnlisted}`);
                workDone += `☐${streamTag(ffstream.index)}[${tierTag}] Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${e.logCodec} stereo @ ${e.rate} (${e.label ? `${e.label}, ` : ''}${ffstream.isTdarrSecondaryTrack ? 'secondary' : 'stereo tier'})\n`;
                extraArguments += ` -c:a:${outputAudioIdx} ${e.frag}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                extraArguments += langMetaArg(outputAudioIdx, streamLang);
                modifiedAudioIdx.add(outputAudioIdx);
                outputAudioOverride.set(outputAudioIdx, e.record);
                convert = true;
            }
            } else {
            // ====== DOWNMIX TO 6 CHANNELS ======
            // One 6ch per language, from its best >6ch source. A guarded source (guardBlocks) is never replaced in place, so 'replace' becomes 'add' for it.
            if (downmixToSix !== 'false' && ffstream.channels > 6 && !created6chLangs.has(ffstreamLangKey)
                && !existing6chLangs.has(ffstreamLangKey)) {
                const newTitle = escMeta(buildTitle(ffstream, '5.1'));
                const sixMode = (downmixToSix === 'replace' && guardBlocks(ffstream, surroundCodec, 6, ffstream.channels)) ? 'true' : downmixToSix;

                if (sixMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    const dstBitArg = encoderArgsIdx(surroundCodec, 6, outputAudioIdx);
                    const dstBitStr = resolveBitrate(surroundCodec, 6);
                    // guardBlocks already passed for sixMode==='replace' (loudnorm rides on that guarantee - see stereoArg above); sixArg builds the
                    // -ac 6 / aformat=channel_layouts=5.1 snippet.
                    const sixFilter = sixArg(outputAudioIdx, ffstream);
                    workDone += `☐${streamTag(ffstream.index)}[downmix_to_six=${downmixToSix}] Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${surroundCodec} 6ch @ ${dstBitStr / 1000} kb/s\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${audioEncoder(surroundCodec)}${dstBitArg}${sixFilter} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    extraArguments += langMetaArg(outputAudioIdx, streamLang);
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: surroundCodec, channels: 6, bps: dstBitStr });
                    created6chLangs.add(ffstreamLangKey);
                    convert = true;
                } else if (sixMode === 'true') {
                    append6ch(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamLangKey, '');
                }
            }

            // ====== DOWNMIX TO 2 CHANNELS ======
            // One stereo track per language, from its best >2ch source, only when the language has no primary stereo already. A guarded source (guardBlocks):
            // 'replace' becomes 'add'. When 'replace' is requested but downmix_to_six already consumed this same source in place (single >6ch source,
            // both downmixes enabled), the in-place slot is taken, so we fall back to ADDING a stereo from the original input. The user enabled
            // downmix_to_stereo expecting a 2.0 in the output, so a lone 7.1 with both downmixes on yields a 5.1 and a 2.0 rather than silently dropping
            // the stereo.
            if (downmixToStereo !== 'false' && ffstream.channels > 2 && !created2chLangs.has(ffstreamLangKey) && !existing2chLangs.has(ffstreamLangKey)) {
                const twoMode = (downmixToStereo === 'replace' && guardBlocks(ffstream, stereoCodec, 2, ffstream.channels)) ? 'true' : downmixToStereo;

                if (twoMode === 'replace' && !modifiedAudioIdx.has(outputAudioIdx)) {
                    const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                    // Downmix source is surround; its bitrate describes N channels not 2, so stereoEnc uses the 2ch table target (aac_vbr uses plain VBR 5).
                    const e = stereoEnc(outputAudioIdx);
                    workDone += `☐${streamTag(ffstream.index)}[downmix_to_stereo=${downmixToStereo}] Transcoding ${ffstreamCodec} ${ffstream.channels}ch @ ${srcRateStr} → ${e.logCodec} stereo @ ${e.rate}${e.label ? ` (${e.label})` : ''}\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${e.frag}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                    extraArguments += langMetaArg(outputAudioIdx, streamLang);
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, e.record);
                    created2chLangs.add(ffstreamLangKey);
                    convert = true;
                } else if (twoMode === 'true' || (twoMode === 'replace' && modifiedAudioIdx.has(outputAudioIdx))) {
                    append2ch(ffstream, srcAudioIdx, ffstreamCodec, srcRateStr, ffstreamLangKey, '');
                }
                }
            }

            // ====== FORCE CODEC ======
            // Skip a track guard_lossless/guard_quality/guard_object_audio protects — guardBlocks: a lossless source, or a quality-tier target that scores lower. codec_force never
            // overrides guard protection, in any mode including 'all', so a guarded track is left in its source codec. Also skip when the source has more channels than the target codec
            // supports (ac3/eac3 max 6ch, opus/aac max 8ch) to avoid an ffmpeg
            // encode failure. Channel count is resolved from ffprobe, then mediaInfo, then a channel-layout string (resolveChannels): a track no source can
            // measure is left untouched rather than guessed, since a wrong count could route it to a codec that can't hold its real channels and fail.
            const forceChannels = (forceCodec !== 'false' && !modifiedAudioIdx.has(outputAudioIdx)) ? resolveChannels(ffstream) : -1;
            if (forceChannels === 0)
                skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Skipping - no channel count in ffprobe, mediaInfo, or channel layout; can't safely choose a target codec or verify its channel limit\n`;
            if (forceChannels > 0) {
                const isStereo = forceChannels <= 2;
                const targetCodec = isStereo ? stereoCodec : surroundCodec;
                // aac_vbr is only valid for stereo; for family-identity checks compare against 'aac'.
                const targetCodecFamily = aacFamily(targetCodec);

                if (ffstreamCodec !== targetCodecFamily) {
                    const shouldForce =
                        forceCodec === 'all' ||
                        (forceCodec === '6below' && !isStereo && forceChannels <= 6) ||
                        (forceCodec === '6below' && isStereo) ||
                        (forceCodec === '2below' && isStereo);

                    const targetMaxCh = codecMaxCh(targetCodec);

                    if (shouldForce && forceChannels > targetMaxCh) {
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Not forcing ${targetCodecFamily} - ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} exceeds the ${targetMaxCh}ch limit for ${targetCodecFamily}; enable downmix_to_six to create a 5.1 from it first\n`;
                    } else if (shouldForce && guardBlocks(ffstream, targetCodec, forceChannels, forceChannels)) {
                        // guard_lossless/guard_quality/guard_object_audio: forcing this codec would irreversibly lose detail the target can't hold (lossless source, or quality tier scores it lower). Leave it.
                        skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Not forcing ${targetCodecFamily} - would lose detail vs ${codecDisplayName(ffstream)} ${forceChannels}ch @ ${srcRateStr} (guard_lossless=${guardLossless}, guard_quality=${guardQuality}, guard_object_audio=${guardObjectAudio}); left as ${ffstreamCodec}\n`;
                    } else if (shouldForce) {
                        // Guard the force-to-opus path against libopus-incompatible layouts (method_layout_err). Only opus is affected - AC3/EAC3/AAC
                        // take any layout. `forced` gates the run's convert flag so a keep/defer makes no change (and doesn't cause a needless re-run).
                        const srcLayout = (ffstream.channel_layout || '').toLowerCase().trim();
                        const opusBad = targetCodec === 'opus' && forceChannels > 2 && !opusAcceptsLayout(forceChannels, srcLayout);
                        const relabel = opusBad ? OPUS_RELABEL[srcLayout] : null;
                        const layoutName = srcLayout || `${forceChannels}ch`;
                        // remix→stereo defers when a stereo already exists for this language - pre-existing (existing2chLangs) OR created earlier this run
                        // by a downmix or a prior remix (created2chLangs). A second one would be a same-language duplicate stereo that dedup only collapses on
                        // the NEXT run (non-idempotent), or persists if dedup is disabled. Fall back to keep.
                        const remixDefer = opusBad && !relabel && methodLayoutErr === 'remix'
                            && (existing2chLangs.has(ffstreamLangKey) || created2chLangs.has(ffstreamLangKey));
                        let forced = false;

                        if (opusBad && !relabel && (methodLayoutErr === 'keep' || methodLayoutErr === 'drop' || remixDefer)) {
                            // No lossless relabel exists (relabelable layouts fall through to the transcode branch below in every mode). keep; a remix that
                            // deferred to an existing stereo; or a drop the pre-pass couldn't apply - leave the source codec. Real drops already happened in the
                            // pre-pass (before the index map); a drop reaches here only when the pre-pass couldn't remove it: the last audio track, or a downmix
                            // it expected to convert this track was pre-empted (per-language slot already filled). Report the actual reason, not a fixed one.
                            let why;
                            if (remixDefer) why = ' (a stereo already exists for this language)';
                            else if (methodLayoutErr === 'drop') why = countSurvivingAudio() <= 1 ? ' (kept - it is the last audio track)' : ' (kept - no downmix converted it to an opus-safe layout)';
                            else why = ', enable a downmix option or set method_layout_err to drop/remix';
                            skipDone += `☒${streamTag(ffstream.index)}[codec_force=${forceCodec}] Not forcing opus - libopus can't encode a ${layoutName} layout; left as ${ffstreamCodec}${why}\n`;
                        } else if (opusBad && methodLayoutErr === 'remix' && !relabel) {
                            // remix→stereo: downmix in place to a codec_stereo track (NOT opus) so it stays stereo-codec-consistent and idempotent (a stereo
                            // opus would be re-forced to codec_stereo next run). Mirrors the in-place stereo tier; the 2ch table target (surround source
                            // bitrate isn't a comparable floor).
                            const newTitle = escMeta(buildTitle(ffstream, '2.0'));
                            const e = stereoEnc(outputAudioIdx);
                            workDone += `☐${streamTag(ffstream.index)}[method_layout_err=${methodLayoutErr}] Remixing ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} (${layoutName}, opus-incompatible) → ${e.logCodec} stereo @ ${e.rate}${e.label ? ` (${e.label})` : ''}\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${e.frag}${stereoArg(outputAudioIdx, ffstream)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, e.record);
                            created2chLangs.add(ffstreamLangKey);   // register the remix-created stereo so a later same-language downmix / remix defers to it
                            forced = true;
                        } else if (targetCodec === 'aac_vbr') {
                            // aac_vbr stereo force: use VBR 4 for low-bitrate sources, VBR 5 otherwise.
                            // srcBitrate is meaningful here — this is a codec-swap, same channel count.
                            const { encoder, args, approxRate, label } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true, forceChannels);
                            // No pre-filter (same channel count, no relabel) - measure the source directly. guardBlocks for this force already
                            // passed above (loudnorm rides on that guarantee - see stereoArg).
                            let aacVbrFilter = '';
                            if (loudnorm !== 'disabled') {
                                const { filter } = buildLoudnormFilter(ffstream.index, srcAudioIdx, '', LOUDNORM_PRESETS[loudnorm]);
                                if (filter) aacVbrFilter = ` -filter:a:${outputAudioIdx} "${filter}"`;
                            }
                            workDone += `☐${streamTag(ffstream.index)}[codec_force=${forceCodec}] Transcoding ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → aac stereo @ ${approxRate} (${label})\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args}${aacVbrFilter}`;
                            modifiedAudioIdx.add(outputAudioIdx);
                            outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels: forceChannels, bps: 0, approxRate });
                            forced = true;
                        } else {
                            // Same channel count, codec swap - optionally a LOSSLESS opus relabel (5.0(side)→5.0 via channelmap, keeps all channels).
                            // resolveBitrate caps the target at the source bitrate when the target codec scores >= the source (guard via isTdarrQuality);
                            // lossless skips the cap; a high-bitrate lossy source is bounded by the codec ceiling.
                            const relabelFilter = relabel ? `channelmap=map=${relabel.map}:channel_layout=${relabel.layout}` : '';
                            const note = relabel ? ` (relabel ${layoutName}→${relabel.layout})` : '';
                            // guardBlocks for this force already passed above (loudnorm rides on that guarantee - see stereoArg). The relabel filter
                            // (if any) is the pre-filter loudnorm's measurement must be chained after, so the analysis reflects the actual
                            // post-relabel signal - though a lossless channelmap relabel doesn't change loudness, keeping the chain order consistent.
                            let layoutFilter = '';
                            if (loudnorm !== 'disabled') {
                                const { filter } = buildLoudnormFilter(ffstream.index, srcAudioIdx, relabelFilter, LOUDNORM_PRESETS[loudnorm]);
                                if (filter) layoutFilter = ` -filter:a:${outputAudioIdx} "${filter}"`;
                            } else if (relabelFilter) {
                                layoutFilter = ` -filter:a:${outputAudioIdx} "${relabelFilter}"`;
                            }
                            const dstBitArg = encoderArgsIdx(targetCodec, forceChannels, outputAudioIdx, srcBitrate, ffstream.isTdarrLossless, ffstream.isTdarrQuality);
                            const dstBitStr = resolveBitrate(targetCodec, forceChannels, srcBitrate, ffstream.isTdarrLossless, ffstream.isTdarrQuality);
                            workDone += `☐${streamTag(ffstream.index)}[codec_force=${forceCodec}] Transcoding ${ffstreamCodec} ${forceChannels}ch @ ${srcRateStr} → ${targetCodec} ${forceChannels}ch @ ${dstBitStr / 1000} kb/s${note}\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${audioEncoder(targetCodec)}${dstBitArg}${layoutFilter}`;
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
            const lang = s.isTdarrRegionKey;
            const srcAudioIdx = inputAudioIdxMap.get(s.index);
            if (srcAudioIdx === undefined) continue;
            const srcBitrate = Number(s.bit_rate || 0);
            const srcRateStr = srcBitrate > 0 ? `${Math.round(srcBitrate / 1000)} kb/s` : 'unknown bitrate';
            const srcCodec = (s.codec_name || 'unknown').trim().toLowerCase();
            // 5.1 derivative from a >6ch source (downmix_to_six), when the language still lacks one.
            if (s.channels > 6 && downmixToSix !== 'false' && !created6chLangs.has(lang) && !existing6chLangs.has(lang)) {
                append6ch(s, srcAudioIdx, srcCodec, srcRateStr, lang, " (source dropped - libopus can't encode its layout)");
            }
            // Stereo derivative (downmix_to_stereo), when the language still lacks one.
            if (downmixToStereo !== 'false' && !created2chLangs.has(lang) && !existing2chLangs.has(lang)) {
                append2ch(s, srcAudioIdx, srcCodec, srcRateStr, lang, " (source dropped - libopus can't encode its layout)");
            }
        }
        // ===== END LAYOUT-DROP DOWNMIX DERIVATIVES =====

        // ===== LOUDNORM: untouched tracks =====
        // Tracks none of the downmix/force/remix sites above touched at all (the common case - already the right codec/channels, nothing else needed). Runs over
        // EVERY kept audio stream directly (not workStreams/candidateStreams, which exist for codec_force/the stereo tier's own narrower
        // eligibility and would silently exclude secondary/commentary tracks under default settings) - guard_lossless/guard_quality/guard_object_audio are the only scope gate.
        // A track ALSO being modified by one of the sites above rides on that same re-encode instead (each site's own stereoArg/layoutFilter/
        // inline block calls buildLoudnormFilter directly at its own emit point); this loop only handles the leftovers.
        if (loudnorm !== 'disabled') {
            const preset = LOUDNORM_PRESETS[loudnorm];
            for (const stream of audioStreams) {
                if (streamsToRemove.has(stream.index)) continue;
                const outputAudioIdx = outputAudioIdxMap.get(stream.index);
                const srcAudioIdx = inputAudioIdxMap.get(stream.index);
                if (outputAudioIdx === undefined || srcAudioIdx === undefined || modifiedAudioIdx.has(outputAudioIdx)) continue;

                const channels = resolveChannels(stream);
                if (channels <= 0) {
                    skipDone += `☒${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Skipping - no channel count in ffprobe, mediaInfo, or channel layout; can't safely choose a target codec or verify its channel limit\n`;
                    continue;
                }
                const rawCodec = (stream.codec_name || '').trim().toLowerCase();
                const isStereo = channels <= 2;
                // Keep the current codec if it's already one this plugin can encode - never force convergence to codec_surround/codec_stereo just
                // because they differ from what's already there (that is codec_force's job). Only converge when the current codec is genuinely
                // outside this plugin's encodable domain (e.g. a kept DTS-core or MP3 track).
                const configuredCodec = isStereo ? stereoCodec : surroundCodec;
                const targetCodec = ['ac3', 'eac3', 'aac', 'opus'].includes(rawCodec) ? rawCodec : configuredCodec;
                const targetFamily = aacFamily(targetCodec);
                const maxCh = codecMaxCh(targetFamily);
                if (channels > maxCh) {
                    skipDone += `☒${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Skipping - ${rawCodec} ${channels}ch exceeds the ${maxCh}ch limit for ${targetFamily}\n`;
                    continue;
                }
                if (guardBlocks(stream, targetCodec, channels, channels)) {
                    skipDone += `☒${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Not normalizing - would lose detail vs ${codecDisplayName(stream)} ${channels}ch (guard_lossless=${guardLossless}, guard_quality=${guardQuality}, guard_object_audio=${guardObjectAudio}); left as ${rawCodec}\n`;
                    continue;
                }

                // Cache check: this stream isn't being touched by anything else this run, so if it already carries a
                // tag matching the CURRENT preset, its content hasn't changed since we last measured/corrected it against this
                // exact target - trust it and skip the measurement subprocess entirely. A stale tag from a DIFFERENT preset (or
                // no tag at all) falls through to a fresh measurement below.
                if (loudnormTagMatchesPreset(stream)) continue;

                // Converging a non-opus source to opus (rawCodec isn't opus-encodable, so targetCodec fell through to codec_surround=opus): if libopus
                // can't encode this track's layout, a bare -c:a opus would abort the whole ffmpeg job. Relabel losslessly when possible (chained before
                // loudnorm); otherwise defer to method_layout_err. 'remix' downmixes to codec_stereo (+ loudnorm) in place; 'keep' - and 'drop', which
                // can't remove a track once the audio index maps are built (the codec_force path drops such a track in the pre-pass) - leave it in its
                // source codec, un-normalized. AC3/EAC3/AAC accept every layout, so this only fires when codec_surround is opus.
                let loudnormRelabel = '';
                if (targetFamily === 'opus' && channels > 2 && rawCodec !== 'opus') {
                    const lay = (stream.channel_layout || '').toLowerCase().trim();
                    if (!opusAcceptsLayout(channels, lay)) {
                        const relabel = OPUS_RELABEL[lay];
                        if (relabel) {
                            loudnormRelabel = `channelmap=map=${relabel.map}:channel_layout=${relabel.layout}`;   // lossless relabel to an opus-safe layout, chained ahead of loudnorm
                        } else if (methodLayoutErr === 'remix') {
                            const newTitle = escMeta(buildTitle(stream, '2.0'));
                            const sLang = langForWrite(stream);
                            const e = stereoEnc(outputAudioIdx);
                            workDone += `☐${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Normalizing ${rawCodec} ${channels}ch → ${e.logCodec} stereo @ ${e.rate} (${e.label ? `${e.label}; ` : ''}remixed - libopus can't encode a ${lay || `${channels}ch`} layout)\n`;
                            extraArguments += ` -c:a:${outputAudioIdx} ${e.frag}${stereoArg(outputAudioIdx, stream)}${loudnormStampArg(outputAudioIdx)} -metadata:s:a:${outputAudioIdx} "title=${newTitle}"`;
                            extraArguments += langMetaArg(outputAudioIdx, sLang);
                            outputAudioOverride.set(outputAudioIdx, e.record);
                            modifiedAudioIdx.add(outputAudioIdx);
                            convert = true;
                            continue;
                        } else {
                            skipDone += `☒${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Not normalizing - libopus can't encode a ${lay || `${channels}ch`} layout; left as ${rawCodec} (method_layout_err=${methodLayoutErr})\n`;
                            continue;
                        }
                    }
                }

                const srcBitrate = Number(stream.bit_rate || 0);
                const { filter, changed } = buildLoudnormFilter(stream.index, srcAudioIdx, loudnormRelabel, preset);
                if (!changed) {
                    // Already within tolerance. On a tag-persisting container, stamp it (a metadata-only remux) so a FUTURE run
                    // can skip re-measuring while the preset stays the same. On a container that would drop the tag, do NOTHING
                    // (a true no-op) - stamping there would just remux every reprocess forever without ever caching (see
                    // loudnormTagPersists above).
                    if (loudnormTagPersists) {
                        workDone += `☐${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Stamping awk_loudnorm=${loudnorm} (already within tolerance) - future runs skip re-measuring while loudnorm stays "${loudnorm}"\n`;
                        extraArguments += loudnormStampArg(outputAudioIdx);
                        convert = true;
                    }
                    continue;
                }

                if (targetCodec === 'aac_vbr') {
                    const { encoder, args, approxRate, label } = aacVbrArgsIdx(outputAudioIdx, srcBitrate, true, channels);
                    workDone += `☐${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Normalizing ${rawCodec} ${channels}ch → aac stereo @ ${approxRate} (${label})\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${encoder}${args} -filter:a:${outputAudioIdx} "${filter}"${loudnormStampArg(outputAudioIdx)}`;
                    modifiedAudioIdx.add(outputAudioIdx);
                    outputAudioOverride.set(outputAudioIdx, { codec: 'aac', channels, bps: 0, approxRate });
                } else {
                    const dstBitArg = encoderArgsIdx(targetCodec, channels, outputAudioIdx, srcBitrate, stream.isTdarrLossless, stream.isTdarrQuality);
                    const dstBitStr = resolveBitrate(targetCodec, channels, srcBitrate, stream.isTdarrLossless, stream.isTdarrQuality);
                    const srcRateStr = srcBitrate > 0 ? `${Math.round(srcBitrate / 1000)} kb/s` : 'unknown bitrate';
                    const note = targetCodec !== rawCodec ? ` (converged from ${rawCodec})` : '';
                    workDone += `☐${streamTag(stream.index)}[method_loudnorm=${loudnorm}] Normalizing ${rawCodec} ${channels}ch @ ${srcRateStr} → ${targetCodec} ${channels}ch @ ${dstBitStr / 1000} kb/s${note}\n`;
                    extraArguments += ` -c:a:${outputAudioIdx} ${audioEncoder(targetCodec)}${dstBitArg} -filter:a:${outputAudioIdx} "${filter}"${loudnormStampArg(outputAudioIdx)}`;
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
        // track) show their bitrate correctly. aac_vbr overrides carry approxRate instead of a fixed bps; summariseStream receives the approxRate string
        // pre-formatted as the bit_rate field so the bracket token shows e.g. ~192k.
        const buildOutputSummary = () => {
            const tokens = [];
            // Build an audio token for a VBR override/append, where the rate is an approximate string (e.g. '~192k') rather than a number summariseStream can
            // format. Only the rate diverges from summariseStream: the disposition suffix (default, then commentary/description, then dub/original) mirrors it
            // exactly - read off the original source stream (an override preserves its disposition; an appended downmix inherits it from source) - so the output
            // token carries the same markers as the input summary.
            const vbrAudioToken = (srcStream, channels, codec, approxRate) => {
                const lang = resolveLang(srcStream);
                const langStr = (lang && lang !== 'und') ? lang : '';
                const def = srcStream.disposition?.default === 1 ? '/default' : '';
                const role = isCommentary(srcStream) ? '/commentary' : (isDescriptive(srcStream) ? '/description' : '');
                const prov = hasDisposition(srcStream, 'dub') ? '/dub' : (hasDisposition(srcStream, 'original') ? '/original' : '');
                return `[audio:${[langStr, `${channels}ch`, codec, approxRate].filter(Boolean).join(' ')}${def}${role}${prov}]`;
            };
            for (const s of file.ffProbeData.streams) {
                const enriched = enrichStream(s);
                if ((s?.codec_type || '').trim().toLowerCase() === 'audio') {
                    if (streamsToRemove.has(s.index)) continue;
                    const ov = outputAudioOverride.get(outputAudioIdxMap.get(s.index));
                    if (ov) {
                        // approxRate carries the VBR display string (e.g. '~192k'); bps===0 flags this. summariseStream reads bit_rate numerically, so VBR
                        // overrides build the token via vbrAudioToken to show the tilde-prefixed approximate rate instead.
                        if (ov.approxRate) {
                            tokens.push(vbrAudioToken(s, ov.channels, ov.codec, ov.approxRate));
                        } else {
                            tokens.push(summariseStream({ ...enriched, codec_name: ov.codec, channels: ov.channels, bit_rate: ov.bps }));
                        }
                    } else {
                        tokens.push(summariseStream(enriched));
                    }
                } else
                    tokens.push(summariseStream(enriched));
            }
            for (const a of appendedAudio) {
                if (a.approxRate) {
                    tokens.push(vbrAudioToken(a.srcStream, a.channels, a.codec, a.approxRate));
                } else {
                    tokens.push(summariseStream({ ...a.srcStream, codec_name: a.codec, channels: a.channels, bit_rate: a.bps }));
                }
            }
            return tokens.join('');
        };

        // Convert file if convert variable is set to true.
        if (convert === true) {
            // Dispositions (default flag) are intentionally left untouched. ffmpeg copies the source stream's disposition onto mapped/transcoded outputs, so
            // a downmix_to_stereo track created from a default-flagged surround source also carries the default flag - two tracks marked default. This is
            // acceptable: the tracks are near-identical content at different channel counts and most players handle multiple default flags without issue.
            // Removing or reassigning the default flag is a separate concern outside this plugin's scope.
            // mp4/mov muxers drop a custom GLOBAL metadata tag (e.g. clean_and_remux's awk_recovered, set upstream) on a -c copy remux unless told to keep it,
            // which would re-trigger recovery on the next pass. Preserve it. (Per-stream custom tags like awk_loudnorm are NOT rescued by this flag - verified
            // against the real mov muxer - which is why loudnorm caches on Matroska only; see loudnormTagPersists.)
            const mp4KeepTags = isMp4Family(file.container) ? ' -movflags use_metadata_tags' : '';
            // Preserve Dolby Vision's dvcC/dvvC boxes on this mp4/mov -c copy remux (see dvStrictMp4Arg) - a plain copy of a DV HEVC/AV1 stream drops them.
            const dvStrictArg = dvStrictMp4Arg(file.container, file.ffProbeData.streams);
            response.preset += `,-map 0 -c copy${extraArguments}${dvStrictArg}${globalOutputOpt}${mp4KeepTags}`;
            // workDone (what changed) and skipDone (why something DIDN'T change - guard blocks, ceiling/missing-data
            // skips, the diagnostic negative-space) are both always logged.
            response.infoLog += workDone;
            response.infoLog += skipDone;
            response.infoLog += `☑Expected results: ${buildOutputSummary()}\n`;
            response.processFile = true;
        } else {
            if (workDone) response.infoLog += workDone;
            if (skipDone) response.infoLog += skipDone;
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
