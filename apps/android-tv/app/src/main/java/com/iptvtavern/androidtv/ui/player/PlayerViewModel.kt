package com.iptvtavern.androidtv.ui.player

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
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
)

@HiltViewModel
class PlayerViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    /**
     * The ExoPlayer instance. Exposed so the Composable can attach
     * an AndroidView to it. The ViewModel owns the lifecycle.
     */
    val player: ExoPlayer = ExoPlayer.Builder(appContext)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .setUsage(C.USAGE_MEDIA)
                .build(),
            /* handleAudioFocus = */ true,
        )
        .build()

    /** Flat list of all live channels for channel zapping. */
    private var channelList: List<Channel> = emptyList()
    private var currentChannelId: String? = null

    init {
        // Set up player listener
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                _uiState.value = _uiState.value.copy(
                    isLoading = playbackState == Player.STATE_BUFFERING,
                    isBuffering = playbackState == Player.STATE_BUFFERING,
                    isPlaying = playbackState == Player.STATE_READY && player.playWhenReady,
                )
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _uiState.value = _uiState.value.copy(isPlaying = isPlaying)
            }

            override fun onPlayerError(error: PlaybackException) {
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

        // Load the channel from nav args
        val channelId = savedStateHandle.get<String>("channelId")
        if (channelId != null) {
            loadChannel(channelId)
        }
    }

    private fun loadChannel(channelId: String) {
        viewModelScope.launch {
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

            val playlist = loadPlaylist(source)
            if (playlist == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Playlist not loaded. Go back and try again.",
                )
                return@launch
            }

            // Build flat channel list for zapping
            channelList = playlist.groups.flatMap { it.channels }
            val index = channelList.indexOfFirst { it.id == channelId }

            if (index == -1) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Channel not found.",
                )
                return@launch
            }

            // Track as recent
            profileRepository.addRecent(channelId)

            playChannel(index)
        }
    }

    /**
     * Load playlist for the given source — uses cached data when available.
     * For M3U: Room whole-playlist cache.
     * For Xtream: per-action cache via XtreamCache (responses are cached,
     * but the Playlist object is rebuilt from cached API responses).
     */
    private suspend fun loadPlaylist(source: Source): Playlist? {
        return try {
            when (source.type) {
                SourceType.XTREAM -> {
                    val creds = source.credentials ?: return null
                    XtreamClient.loadXtreamPlaylist(creds, source.id, xtreamCache)
                }
                SourceType.M3U_URL, SourceType.M3U_FILE -> {
                    // Try Room cache first
                    sourceRepository.getCachedPlaylist(source.id)?.let { return it }
                    val url = source.url ?: return null
                    withContext(Dispatchers.IO) {
                        val connection = URL(url).openConnection() as HttpURLConnection
                        connection.connectTimeout = 15_000
                        connection.readTimeout = 30_000
                        source.userAgent?.let { connection.setRequestProperty("User-Agent", it) }
                        try {
                            val text = connection.inputStream.bufferedReader().use { it.readText() }
                            parseM3uToPlaylist(text, source.id)
                        } finally {
                            connection.disconnect()
                        }
                    }
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun playChannel(index: Int) {
        val channel = channelList.getOrNull(index) ?: return
        currentChannelId = channel.id

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
        )

        val mediaItem = MediaItem.fromUri(channel.streamUrl)
        player.setMediaItem(mediaItem)
        player.prepare()
        player.playWhenReady = true
    }

    // ── Channel zapping ──────────────────────────────────────────

    fun channelUp() {
        val current = _uiState.value.channelIndex
        if (channelList.isEmpty()) return
        val next = if (current + 1 >= channelList.size) 0 else current + 1
        viewModelScope.launch {
            profileRepository.addRecent(channelList[next].id)
        }
        playChannel(next)
    }

    fun channelDown() {
        val current = _uiState.value.channelIndex
        if (channelList.isEmpty()) return
        val prev = if (current - 1 < 0) channelList.size - 1 else current - 1
        viewModelScope.launch {
            profileRepository.addRecent(channelList[prev].id)
        }
        playChannel(prev)
    }

    // ── Playback controls ────────────────────────────────────────

    fun togglePlayPause() {
        player.playWhenReady = !player.playWhenReady
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
    }

    fun hideOverlay() {
        if (_uiState.value.error == null) {
            _uiState.value = _uiState.value.copy(showOverlay = false)
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
            appendLine("IPTV Tavern — Player Diagnostics")
            appendLine("Channel: ${state.channelName}")
            appendLine("Index: ${state.channelIndex + 1} / ${state.totalChannels}")
            if (state.error != null) appendLine("Error: ${state.error}")
            if (state.errorDetails != null) appendLine(state.errorDetails)
        }
    }

    override fun onCleared() {
        super.onCleared()
        player.release()
    }
}
