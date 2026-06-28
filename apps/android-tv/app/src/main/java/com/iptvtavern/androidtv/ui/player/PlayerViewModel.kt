package com.iptvtavern.androidtv.ui.player

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.EpgRepository
import com.iptvtavern.androidtv.data.repository.PlaylistManager
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.data.repository.WatchedRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.PlayerBufferMode
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.EpgParser
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import com.iptvtavern.androidtv.playback.ExoPlayerFactory
import com.iptvtavern.androidtv.playback.LivePlaybackSession
import com.iptvtavern.androidtv.playback.PipController
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

/**
 * Track info exposed to the UI for the track picker.
 */
data class TrackInfo(
    val index: Int,
    val groupIndex: Int,
    val trackType: Int, // C.TRACK_TYPE_AUDIO or C.TRACK_TYPE_TEXT
    val label: String,
    val language: String?,
    val isSelected: Boolean,
)

/**
 * Player UI state.
 *
 * Think of this like the web's playerStore + useShakaPlayer hook state combined.
 */
data class PlayerUiState(
    val isLoading: Boolean = true,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val channelName: String = "",
    val channelLogoUrl: String? = null,
    val error: String? = null,
    val errorDetails: String? = null,
    /** True when the controls overlay is visible. */
    val showOverlay: Boolean = true,
    /** Available audio tracks. */
    val audioTracks: List<TrackInfo> = emptyList(),
    /** Available subtitle tracks. */
    val subtitleTracks: List<TrackInfo> = emptyList(),
    /** Current channel index in the flat channel list (for zapping). */
    val channelIndex: Int = -1,
    val totalChannels: Int = 0,
    /** True if this is a VOD/seekable stream (not live). */
    val isVod: Boolean = false,
    /** True only when playing a series episode (drives prev/next episode buttons). */
    val isSeriesEpisode: Boolean = false,
    /** Current playback position in ms (VOD). */
    val positionMs: Long = 0,
    /** Total duration in ms (VOD). */
    val durationMs: Long = 0,
    /** EPG: currently airing program title. */
    val epgNowTitle: String? = null,
    /** EPG: next program title. */
    val epgNextTitle: String? = null,
)

/** Matches series episode IDs: "xtream:series:<num>:ep:<episodeId>" */
private val SERIES_EPISODE_PATTERN = Regex("^(xtream:series:\\d+):ep:(.+)$")

private enum class PlayerContentKind { Live, Vod, SeriesEpisode }

private fun inferPlayerContentKind(channelId: String): PlayerContentKind = when {
    SERIES_EPISODE_PATTERN.matches(channelId) -> PlayerContentKind.SeriesEpisode
    channelId.contains(":vod:") || channelId.startsWith("vod:") -> PlayerContentKind.Vod
    else -> PlayerContentKind.Live
}

@HiltViewModel
class PlayerViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val epgRepository: EpgRepository,
    private val watchedRepository: WatchedRepository,
    private val playlistManager: PlaylistManager,
    val pipController: PipController,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    /**
     * The ExoPlayer instance. Exposed so the Composable can attach
     * an AndroidView to it. The ViewModel owns the lifecycle.
     *
     * Buffer mode is read once from settings at construction so the
     * user's "Buffer Mode" preference (Settings → Player) is applied to
     * the player's LoadControl. runBlocking is acceptable here: it is a
     * one-time read of a small DataStore file at ViewModel creation.
     */
    private val bufferMode: PlayerBufferMode = runBlocking {
        settingsDataStore.settings.first().playerBufferMode
    }

    val player: ExoPlayer = ExoPlayerFactory.create(
        context = appContext,
        bufferMode = bufferMode,
    )

    /** Flat list of all live channels for channel zapping. */
    private var channelList: List<Channel> = emptyList()
    private var currentChannelId: String? = null
    /** Previous channel index for "jump back" (Green button). */
    private var previousChannelIndex: Int = -1
    /** Active source — stream URLs and User-Agent for playback. */
    private var activeSource: Source? = null
    /** Active source ID — needed for persisting watched progress. */
    private var activeSourceId: String? = null
    /** If currently playing a series episode, the parent series channel ID. */
    private var currentSeriesId: String? = null
    private val livePlayback = LivePlaybackSession()
    private var loadChannelJob: Job? = null

    init {
        // Set up player listener
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                val isBuffering = playbackState == Player.STATE_BUFFERING
                _uiState.value = _uiState.value.copy(
                    isBuffering = isBuffering,
                    isPlaying = playbackState == Player.STATE_READY && player.playWhenReady,
                )
                if (playbackState == Player.STATE_READY) {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                    if (!_uiState.value.isVod) {
                        livePlayback.nextIfAvBroken(player)?.let { url ->
                            loadStreamUrl(url)
                            return
                        }
                    }
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _uiState.value = _uiState.value.copy(isPlaying = isPlaying)
            }

            override fun onPlayerError(error: PlaybackException) {
                if (!_uiState.value.isVod) {
                    livePlayback.nextOnError()?.let { url ->
                        _uiState.value = _uiState.value.copy(error = null, errorDetails = null)
                        loadStreamUrl(url)
                        return
                    }
                }
                val details = buildString {
                    appendLine("Error code: ${error.errorCode}")
                    appendLine("Error name: ${describeErrorCode(error.errorCode)}")
                    error.cause?.let { appendLine("Cause: ${it.message}") }
                }
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = describePlayerError(error),
                    errorDetails = details,
                    showOverlay = true,
                )
            }

            override fun onTracksChanged(tracks: Tracks) {
                updateTrackInfo(tracks)
            }
        })

        // Pause when the user leaves the player via Home (PiP is opt-in via
        // the overlay button, so a plain Home must not keep audio running
        // invisibly). Emitted by PipController from onUserLeaveHint().
        viewModelScope.launch {
            pipController.pauseRequests.collect {
                if (player.playWhenReady) {
                    player.playWhenReady = false
                    saveCurrentProgress()
                }
            }
        }

        // Load the channel from nav args
        val channelId = savedStateHandle.get<String>("channelId")
        if (channelId != null) {
            loadChannel(channelId)
        }
    }

    private fun loadChannel(channelId: String) {
        loadChannelJob?.cancel()
        loadChannelJob = viewModelScope.launch {
            val contentKind = inferPlayerContentKind(channelId)
            val isVodContent = contentKind != PlayerContentKind.Live

            _uiState.value = _uiState.value.copy(
                isLoading = true,
                isVod = isVodContent,
                isSeriesEpisode = contentKind == PlayerContentKind.SeriesEpisode,
                error = null,
                errorDetails = null,
                channelIndex = if (isVodContent) 0 else -1,
                totalChannels = if (isVodContent) 1 else 0,
                epgNowTitle = null,
                epgNextTitle = null,
                showOverlay = true,
            )

            val activeId = settingsDataStore.activeSourceId.first()
            val sources = sourceRepository.sources.first()
            val source = sources.find { it.id == activeId } ?: sources.firstOrNull()

            if (source == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "No source configured.",
                )
                return@launch
            }

            activeSource = source
            activeSourceId = source.id

            when (contentKind) {
                PlayerContentKind.SeriesEpisode -> {
                    val epMatch = SERIES_EPISODE_PATTERN.matchEntire(channelId)!!
                    handleSeriesEpisode(epMatch, channelId, source)
                }
                PlayerContentKind.Vod -> {
                    val channel = playlistManager.findChannelById(channelId)
                    if (channel == null) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = "Channel not found.",
                        )
                        return@launch
                    }
                    applyChannelMetadata(channel, isVod = true)
                    channelList = listOf(channel)
                    profileRepository.addRecent(channel)
                    currentSeriesId = null
                    playChannel(0)
                }
                PlayerContentKind.Live -> {
                    // Fast path: one group from cache (browse already loaded it).
                    val channel = playlistManager.findChannelById(channelId)
                    if (channel == null) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = "Channel not found.",
                        )
                        return@launch
                    }

                    applyChannelMetadata(channel, isVod = false)
                    profileRepository.addRecent(channel)
                    currentSeriesId = null

                    // Start playback immediately; expand channel list for zapping in background.
                    channelList = listOf(channel)
                    playChannel(0)

                    launch {
                        val liveGroups = playlistManager.getLiveGroups() ?: return@launch
                        val fullList = liveGroups.flatMap { it.channels }
                        val liveIndex = fullList.indexOfFirst { it.id == channelId }
                        if (liveIndex < 0) return@launch
                        channelList = fullList
                        _uiState.value = _uiState.value.copy(
                            channelIndex = liveIndex,
                            totalChannels = fullList.size,
                        )
                    }
                }
            }
        }
    }

    /** Overlay channel name/logo as soon as the channel row is resolved. */
    private fun applyChannelMetadata(channel: Channel, isVod: Boolean) {
        _uiState.value = _uiState.value.copy(
            channelName = channel.name,
            channelLogoUrl = channel.logoUrl,
            isVod = isVod,
        )
        if (channel is Channel.Live && channel.tvgId != null) {
            val guide = epgRepository.guide
            if (guide != null) {
                val programs = guide.programsByChannelId[channel.tvgId]
                val nowNext = EpgParser.getNowAndNextProgram(programs)
                _uiState.value = _uiState.value.copy(
                    epgNowTitle = nowNext.current?.title,
                    epgNextTitle = nowNext.next?.title,
                )
            }
        }
    }

    /**
     * Handle series episode playback.
     * The channelId format is "xtream:series:<seriesId>:ep:<episodeId>".
     * We find the series, fetch its info for episode details, and play the episode.
     */
    private suspend fun handleSeriesEpisode(
        match: MatchResult,
        channelId: String,
        source: Source,
    ) {
        _uiState.value = _uiState.value.copy(isVod = true, isLoading = true)

        val seriesChannelId = match.groupValues[1] // "xtream:series:<num>"
        val episodeId = match.groupValues[2]

        val seriesChannel = playlistManager.findChannelById(seriesChannelId)
            as? Channel.Series

        if (seriesChannel == null) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = "Series not found.",
            )
            return
        }

        // Fetch series info to get episode stream URLs
        val creds = source.credentials
        val xtreamId = seriesChannel.xtreamSeriesId
        if (creds == null || xtreamId == null) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = "Series info unavailable.",
            )
            return
        }

        try {
            val info = XtreamClient.fetchSeriesInfoCached(creds, xtreamId, xtreamCache)
            val enriched = XtreamClient.mergeSeriesChannelWithXtreamInfo(creds, seriesChannel, info)

            // Find the episode
            val episode = enriched.seasons
                .flatMap { it.episodes }
                .find { it.id == episodeId }

            if (episode == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Episode not found.",
                )
                return
            }

            // Build an episode list for zapping between episodes
            val allEpisodes = enriched.seasons.flatMap { season ->
                season.episodes.map { ep ->
                    Channel.Vod(
                        id = "${seriesChannelId}:ep:${ep.id}",
                        name = "${enriched.name} — ${ep.title}",
                        groupTitle = enriched.groupTitle,
                        streamUrl = ep.streamUrl,
                        logoUrl = enriched.logoUrl,
                        posterUrl = enriched.posterUrl,
                        durationSeconds = ep.durationSeconds,
                        plot = ep.plot,
                        containerExtension = ep.containerExtension,
                        subtitles = ep.subtitles,
                    )
                }
            }

            channelList = allEpisodes
            val index = channelList.indexOfFirst { it.id == channelId }
            if (index == -1) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Episode not found in list.",
                )
                return
            }

            profileRepository.addRecent(seriesChannel)
            currentSeriesId = seriesChannelId
            playChannel(index)
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = "Failed to load series info: ${e.message}",
            )
        }
    }

    private fun playChannel(index: Int) {
        val channel = channelList.getOrNull(index) ?: return

        // Save progress for the item we're leaving (before switching)
        saveCurrentProgress()

        // Track previous channel for "jump back"
        val currentIdx = _uiState.value.channelIndex
        if (currentIdx >= 0 && currentIdx != index) {
            previousChannelIndex = currentIdx
        }

        currentChannelId = channel.id
        val isVod = channel is Channel.Vod

        _uiState.value = _uiState.value.copy(
            isLoading = true,
            error = null,
            errorDetails = null,
            channelName = channel.name,
            channelLogoUrl = channel.logoUrl,
            channelIndex = index,
            totalChannels = channelList.size,
            showOverlay = true,
            audioTracks = emptyList(),
            subtitleTracks = emptyList(),
            isVod = isVod,
            positionMs = 0,
            durationMs = 0,
            epgNowTitle = null,
            epgNextTitle = null,
        )

        // Look up EPG now/next for live channels
        if (channel is Channel.Live && channel.tvgId != null) {
            val guide = epgRepository.guide
            if (guide != null) {
                val programs = guide.programsByChannelId[channel.tvgId]
                val nowNext = EpgParser.getNowAndNextProgram(programs)
                _uiState.value = _uiState.value.copy(
                    epgNowTitle = nowNext.current?.title,
                    epgNextTitle = nowNext.next?.title,
                )
            }
        }

        val playbackUrl = if (channel is Channel.Live) {
            livePlayback.begin(channel, activeSource)
        } else {
            livePlayback.reset()
            channel.streamUrl
        }
        loadStreamUrl(playbackUrl)

        // Resume from saved position for VOD/episodes
        if (isVod) {
            viewModelScope.launch {
                val resumePos = watchedRepository.getResumePosition(channel.id)
                if (resumePos > 0) {
                    player.seekTo(resumePos)
                }
            }
        }
    }

    private fun loadStreamUrl(url: String) {
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.playWhenReady = true
    }

    // ── Channel zapping ──────────────────────────────────────────

    /**
     * Save playback progress for the currently playing item.
     * Called when switching channels, pausing, or leaving the player.
     */
    private fun saveCurrentProgress() {
        val id = currentChannelId ?: return
        val srcId = activeSourceId ?: return
        val channel = channelList.find { it.id == id } ?: return
        if (channel !is Channel.Vod) return
        val pos = player.currentPosition
        val dur = player.duration.coerceAtLeast(0)
        if (pos <= 0 && dur <= 0) return
        val imageUrl = channel.posterUrl ?: channel.logoUrl
        viewModelScope.launch {
            watchedRepository.saveProgress(
                channelId = id,
                sourceId = srcId,
                positionMs = pos,
                durationMs = dur,
                parentSeriesId = currentSeriesId,
                channelName = channel.name,
                imageUrl = imageUrl,
            )
        }
    }

    fun channelUp() {
        val current = _uiState.value.channelIndex
        if (channelList.isEmpty()) return
        val next = if (current + 1 >= channelList.size) 0 else current + 1
        viewModelScope.launch {
            profileRepository.addRecent(channelList[next])
        }
        playChannel(next)
    }

    fun channelDown() {
        val current = _uiState.value.channelIndex
        if (channelList.isEmpty()) return
        val prev = if (current - 1 < 0) channelList.size - 1 else current - 1
        viewModelScope.launch {
            profileRepository.addRecent(channelList[prev])
        }
        playChannel(prev)
    }

    // ── Series episode navigation (bounded, no wrap) ─────────────

    /** Jump to the next episode of the current series. No-op past the last one. */
    fun playNextEpisode() {
        if (!_uiState.value.isSeriesEpisode) return
        val current = _uiState.value.channelIndex
        val next = current + 1
        if (next >= channelList.size) return
        viewModelScope.launch {
            profileRepository.addRecent(channelList[next])
        }
        playChannel(next)
    }

    /** Jump to the previous episode of the current series. No-op before the first one. */
    fun playPrevEpisode() {
        if (!_uiState.value.isSeriesEpisode) return
        val current = _uiState.value.channelIndex
        val prev = current - 1
        if (prev < 0) return
        viewModelScope.launch {
            profileRepository.addRecent(channelList[prev])
        }
        playChannel(prev)
    }

    /** Jump back to the previously watched channel (Green button). */
    fun previousChannel() {
        if (previousChannelIndex < 0 || channelList.isEmpty()) return
        if (previousChannelIndex >= channelList.size) return
        viewModelScope.launch {
            profileRepository.addRecent(channelList[previousChannelIndex])
        }
        playChannel(previousChannelIndex)
    }

    // ── Playback controls ────────────────────────────────────────

    fun togglePlayPause() {
        player.playWhenReady = !player.playWhenReady
        // Save progress when pausing
        if (!player.playWhenReady) {
            saveCurrentProgress()
        }
    }

    fun retry() {
        _uiState.value = _uiState.value.copy(error = null, errorDetails = null)
        player.prepare()
        player.playWhenReady = true
    }

    fun toggleOverlay() {
        _uiState.value = _uiState.value.copy(
            showOverlay = !_uiState.value.showOverlay,
        )
    }

    fun showOverlay() {
        _uiState.value = _uiState.value.copy(showOverlay = true)
        updatePositionIfVod()
    }

    fun hideOverlay() {
        if (_uiState.value.error == null) {
            _uiState.value = _uiState.value.copy(showOverlay = false)
        }
    }

    // ── Seeking (VOD) ────────────────────────────────────────────

    /** Seek forward by 10 seconds. */
    fun seekForward() {
        val pos = player.currentPosition
        val dur = player.duration
        if (dur > 0) {
            player.seekTo(minOf(pos + 10_000, dur))
            updatePositionIfVod()
        }
    }

    /** Seek backward by 10 seconds. */
    fun seekBackward() {
        val pos = player.currentPosition
        player.seekTo(maxOf(pos - 10_000, 0))
        updatePositionIfVod()
    }

    /** Seek forward by 2 minutes — for skipping intros, credits, or slow stretches. */
    fun seekForwardLong() {
        val pos = player.currentPosition
        val dur = player.duration
        if (dur > 0) {
            player.seekTo(minOf(pos + 120_000, dur))
            updatePositionIfVod()
        }
    }

    /** Seek backward by 2 minutes — for rewatching a scene or skipping an outro. */
    fun seekBackwardLong() {
        val pos = player.currentPosition
        player.seekTo(maxOf(pos - 120_000, 0))
        updatePositionIfVod()
    }

    /** Update position/duration state for the scrubber display. */
    fun updatePositionIfVod() {
        if (_uiState.value.isVod) {
            _uiState.value = _uiState.value.copy(
                positionMs = player.currentPosition,
                durationMs = player.duration.coerceAtLeast(0),
            )
        }
    }

    // ── Track selection ──────────────────────────────────────────

    fun selectAudioTrack(groupIndex: Int, trackIndex: Int) {
        val params = player.trackSelectionParameters.buildUpon()
        val group = player.currentTracks.groups.getOrNull(groupIndex) ?: return
        params.setOverrideForType(
            TrackSelectionOverride(group.mediaTrackGroup, listOf(trackIndex))
        )
        player.trackSelectionParameters = params.build()
    }

    fun selectSubtitleTrack(groupIndex: Int, trackIndex: Int) {
        val params = player.trackSelectionParameters.buildUpon()
        val group = player.currentTracks.groups.getOrNull(groupIndex) ?: return
        params.setOverrideForType(
            TrackSelectionOverride(group.mediaTrackGroup, listOf(trackIndex))
        )
        player.trackSelectionParameters = params.build()
    }

    fun disableSubtitles() {
        val params = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        player.trackSelectionParameters = params
    }

    private fun updateTrackInfo(tracks: Tracks) {
        val audioTracks = mutableListOf<TrackInfo>()
        val subtitleTracks = mutableListOf<TrackInfo>()

        for ((groupIndex, group) in tracks.groups.withIndex()) {
            for (trackIndex in 0 until group.length) {
                val format = group.getTrackFormat(trackIndex)
                val isSelected = group.isTrackSelected(trackIndex)

                when (group.type) {
                    C.TRACK_TYPE_AUDIO -> {
                        val label = format.label
                            ?: format.language?.uppercase()
                            ?: "Audio ${audioTracks.size + 1}"
                        audioTracks.add(
                            TrackInfo(
                                index = trackIndex,
                                groupIndex = groupIndex,
                                trackType = C.TRACK_TYPE_AUDIO,
                                label = label,
                                language = format.language,
                                isSelected = isSelected,
                            )
                        )
                    }
                    C.TRACK_TYPE_TEXT -> {
                        val label = format.label
                            ?: format.language?.uppercase()
                            ?: "Subtitle ${subtitleTracks.size + 1}"
                        subtitleTracks.add(
                            TrackInfo(
                                index = trackIndex,
                                groupIndex = groupIndex,
                                trackType = C.TRACK_TYPE_TEXT,
                                label = label,
                                language = format.language,
                                isSelected = isSelected,
                            )
                        )
                    }
                }
            }
        }

        _uiState.value = _uiState.value.copy(
            audioTracks = audioTracks,
            subtitleTracks = subtitleTracks,
        )
    }

    // ── Error descriptions ───────────────────────────────────────

    /**
     * Human-readable error message — equivalent to web's `describeShakaError`.
     */
    private fun describePlayerError(error: PlaybackException): String {
        return when (error.errorCode) {
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ->
                "Network connection failed. Check your internet connection."
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
                "Connection timed out. The stream may be unavailable."
            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
                "Stream returned an error (HTTP ${error.cause?.message ?: "error"}). The URL may be invalid or expired."
            PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND ->
                "Stream not found. The URL may have changed."
            PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED ->
                "Cleartext (HTTP) traffic is not permitted. Use HTTPS or check network security config."
            PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
            PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED ->
                "Could not parse the stream. The format may be unsupported."
            PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ->
                "Could not initialize the video decoder. This device may not support the stream format."
            PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED ->
                "Audio playback failed. Try another channel."
            else ->
                "Playback error: ${describeErrorCode(error.errorCode)}"
        }
    }

    private fun describeErrorCode(code: Int): String = when (code) {
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED -> "NETWORK_CONNECTION_FAILED"
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "NETWORK_TIMEOUT"
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "BAD_HTTP_STATUS"
        PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND -> "FILE_NOT_FOUND"
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED -> "CONTAINER_MALFORMED"
        PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED -> "MANIFEST_MALFORMED"
        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED -> "DECODER_INIT_FAILED"
        PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED -> "AUDIO_INIT_FAILED"
        else -> "ERROR_$code"
    }

    // ── Diagnostics for clipboard ────────────────────────────────

    fun getDiagnosticsText(): String {
        val state = _uiState.value
        return buildString {
            appendLine("Lumina — Player Diagnostics")
            appendLine("Channel: ${state.channelName}")
            appendLine("Index: ${state.channelIndex + 1} / ${state.totalChannels}")
            if (state.error != null) appendLine("Error: ${state.error}")
            if (state.errorDetails != null) appendLine(state.errorDetails)
        }
    }

    override fun onCleared() {
        super.onCleared()
        saveCurrentProgress()
        player.release()
    }
}
