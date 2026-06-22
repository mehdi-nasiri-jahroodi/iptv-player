package com.iptvtavern.androidtv.playback

import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.xtream.XtreamClient

/**
 * Ordered URLs to try for Xtream live playback.
 *
 * Panels differ: some streams only work as `.ts`, others as `.m3u8`, and some
 * expose a panel-specific [Channel.Live.directSourceUrl].
 */
fun livePlaybackCandidates(channel: Channel, source: Source?): List<String> {
    if (channel !is Channel.Live) return listOf(channel.streamUrl)
    if (source?.type != SourceType.XTREAM) return listOf(channel.streamUrl)

    val creds = source.credentials
    val streamId = channel.xtreamStreamId
    if (creds == null || streamId == null) return listOf(channel.streamUrl)

    return buildList {
        channel.directSourceUrl?.trim()?.takeIf { it.isNotEmpty() }?.let { add(it) }
        add(XtreamClient.buildLiveStreamUrl(creds, streamId, extension = "ts"))
        add(XtreamClient.buildLiveStreamUrl(creds, streamId, extension = "m3u8"))
    }.distinct()
}

/** @deprecated Use [LivePlaybackSession.begin] for live retry support. */
fun resolvePlaybackUrl(channel: Channel, source: Source?): String =
    livePlaybackCandidates(channel, source).first()

/**
 * Tries alternate live URLs when the current one has broken A/V (common with
 * split HLS renditions) or fails to open.
 */
class LivePlaybackSession {
    private var candidates: List<String> = emptyList()
    private var index: Int = 0
    private var active: Boolean = false

    fun begin(channel: Channel, source: Source?): String {
        candidates = livePlaybackCandidates(channel, source)
        index = 0
        active = channel is Channel.Live && candidates.size > 1
        return candidates.first()
    }

    fun reset() {
        candidates = emptyList()
        index = 0
        active = false
    }

    /** After READY — return next URL if video/audio is broken. */
    fun nextIfAvBroken(player: ExoPlayer): String? {
        if (!active) return null
        if (!hasBrokenAv(player)) return null
        return advance()
    }

    /** After player error — return next URL if any remain. */
    fun nextOnError(): String? {
        if (!active) return null
        return advance()
    }

    private fun advance(): String? {
        if (index + 1 >= candidates.size) return null
        index++
        return candidates[index]
    }
}

/** Video plays but audio missing, or the opposite (split-track HLS). */
fun hasBrokenAv(player: ExoPlayer): Boolean {
    val tracks = player.currentTracks
    val videoGroups = tracks.groups.filter { it.type == C.TRACK_TYPE_VIDEO && it.length > 0 }
    val audioGroups = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO && it.length > 0 }

    val hasWorkingVideo = videoGroups.any { group ->
        (0 until group.length).any { group.isTrackSelected(it) && group.isTrackSupported(it) }
    }
    val hasWorkingAudio = audioGroups.any { group ->
        (0 until group.length).any { group.isTrackSelected(it) && group.isTrackSupported(it) }
    }

    return when {
        videoGroups.isNotEmpty() && audioGroups.isNotEmpty() ->
            !hasWorkingVideo || !hasWorkingAudio
        videoGroups.isNotEmpty() -> !hasWorkingVideo
        audioGroups.isNotEmpty() -> !hasWorkingAudio
        else -> false
    }
}

fun ExoPlayer.installAutoAudioTrackSelection() {
    addListener(object : Player.Listener {
        override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
            ensureAudioTrackSelected(this@installAutoAudioTrackSelection, tracks)
        }
    })
}

private fun ensureAudioTrackSelected(player: ExoPlayer, tracks: androidx.media3.common.Tracks) {
    val hasVideo = tracks.groups.any { group ->
        group.type == C.TRACK_TYPE_VIDEO &&
            (0 until group.length).any { group.isTrackSelected(it) }
    }
    if (!hasVideo) return

    val hasAudio = tracks.groups.any { group ->
        group.type == C.TRACK_TYPE_AUDIO &&
            (0 until group.length).any { group.isTrackSelected(it) }
    }
    if (hasAudio) return

    for ((groupIndex, group) in tracks.groups.withIndex()) {
        if (group.type != C.TRACK_TYPE_AUDIO) continue
        for (trackIndex in 0 until group.length) {
            if (!group.isTrackSupported(trackIndex)) continue
            val params = player.trackSelectionParameters.buildUpon()
                .setOverrideForType(
                    androidx.media3.common.TrackSelectionOverride(
                        group.mediaTrackGroup,
                        listOf(trackIndex),
                    ),
                )
                .build()
            player.trackSelectionParameters = params
            return
        }
    }
}
