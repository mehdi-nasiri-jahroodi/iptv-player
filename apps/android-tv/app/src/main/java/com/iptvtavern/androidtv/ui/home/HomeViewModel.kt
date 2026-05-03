package com.iptvtavern.androidtv.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.EpgRepository
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.data.repository.WatchedRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.EpgParser
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.parser.validateSource
import com.iptvtavern.androidtv.domain.parser.SourceValidationResult
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

/**
 * Home screen state — catalog counts, active source, and continue-watching channels.
 *
 * Similar to the web's home.tsx which shows CatalogTiles with counts
 * and a source switcher.
 */
data class HomeUiState(
    val isLoading: Boolean = true,
    val activeSource: Source? = null,
    val sources: List<Source> = emptyList(),
    val liveCount: Int = 0,
    val vodCount: Int = 0,
    val seriesCount: Int = 0,
    val recentChannels: List<Channel> = emptyList(),
    /** Items with playback progress (VOD/episodes not yet completed). */
    val continueWatchingItems: List<ContinueWatchingItem> = emptyList(),
    val error: String? = null,
    /** EPG spotlight: favorite live channels with what's on now. */
    val epgSpotlight: List<EpgSpotlightItem> = emptyList(),
)

/**
 * A VOD or series episode with its saved playback progress.
 */
data class ContinueWatchingItem(
    val channel: Channel,
    val positionMs: Long,
    val durationMs: Long,
    /** 0.0–1.0 progress fraction. */
    val progress: Float,
)

data class EpgSpotlightItem(
    val channel: Channel.Live,
    val nowTitle: String?,
    val nextTitle: String?,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val epgRepository: EpgRepository,
    private val watchedRepository: WatchedRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var currentPlaylist: Playlist? = null

    init {
        viewModelScope.launch {
            // Combine sources + activeSourceId to react to changes
            combine(
                sourceRepository.sources,
                settingsDataStore.activeSourceId,
            ) { sources, activeId ->
                Pair(sources, activeId)
            }.collect { (sources, activeId) ->
                // Auto-select first source if none active
                val effectiveId = activeId ?: sources.firstOrNull()?.id
                val activeSource = sources.find { it.id == effectiveId }

                // Persist auto-selection
                if (activeId == null && effectiveId != null) {
                    settingsDataStore.setActiveSourceId(effectiveId)
                }

                _uiState.value = _uiState.value.copy(
                    sources = sources,
                    activeSource = activeSource,
                )

                if (activeSource != null) {
                    loadCatalog(activeSource)
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        liveCount = 0,
                        vodCount = 0,
                        seriesCount = 0,
                    )
                }
            }
        }
    }

    private suspend fun loadCatalog(source: Source) {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)

        // For M3U sources, try the whole-playlist Room cache first.
        // For Xtream sources, skip it — per-action caching in XtreamCache
        // handles freshness with TTLs and avoids the OOM from serializing
        // huge playlists into a single JSON blob.
        if (source.type != SourceType.XTREAM) {
            val cached = sourceRepository.getCachedPlaylist(source.id)
            if (cached != null) {
                applyPlaylist(cached)
                return
            }
        }

        // Fetch and parse
        try {
            val playlist = fetchAndParsePlaylist(source)
                if (playlist != null) {
                    // Only cache M3U playlists in Room — Xtream uses per-action cache
                    if (source.type != SourceType.XTREAM) {
                        try {
                            sourceRepository.cachePlaylist(playlist)
                        } catch (_: Exception) {
                            // Cache write can fail for very large playlists
                        }
                    }
                    applyPlaylist(playlist)

                    // Load EPG spotlight in background
                    viewModelScope.launch {
                        loadEpgSpotlight(source)
                    }
            } else {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load channels from source.",
                )
            }
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = e.message ?: "Failed to load catalog.",
            )
        }
    }

    private suspend fun fetchAndParsePlaylist(source: Source): Playlist? {
        return when (source.type) {
            SourceType.XTREAM -> {
                val creds = source.credentials ?: return null
                XtreamClient.loadXtreamPlaylist(creds, source.id, xtreamCache)
            }
            SourceType.M3U_URL, SourceType.M3U_FILE -> {
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
    }

    private suspend fun applyPlaylist(playlist: Playlist) {
        currentPlaylist = playlist

        var live = 0
        var vod = 0
        var series = 0
        for (group in playlist.groups) {
            for (channel in group.channels) {
                when (channel) {
                    is Channel.Live -> live++
                    is Channel.Vod -> vod++
                    is Channel.Series -> series++
                }
            }
        }

        // Build recent channels from profile
        val profile = profileRepository.getDefaultProfile()
        val allChannels = playlist.groups.flatMap { it.channels }
        val channelMap = allChannels.associateBy { it.id }
        val recents = profile.recents.take(5).mapNotNull { channelMap[it] }
            .distinctBy { it.id }

        // Build "Continue Watching" from watched progress
        val sourceId = _uiState.value.activeSource?.id
        val continueItems = if (sourceId != null) {
            val watched = watchedRepository.getRecentInProgress(sourceId, 10)
            watched.mapNotNull { w ->
                // For series episodes, resolve to the series channel
                val channel = if (w.parentSeriesId != null) {
                    channelMap[w.parentSeriesId]
                } else {
                    channelMap[w.channelId]
                }
                if (channel == null) return@mapNotNull null
                val progress = if (w.durationMs > 0) {
                    (w.positionMs.toFloat() / w.durationMs).coerceIn(0f, 1f)
                } else 0f
                ContinueWatchingItem(
                    channel = channel,
                    positionMs = w.positionMs,
                    durationMs = w.durationMs,
                    progress = progress,
                )
            }.distinctBy { it.channel.id } // dedupe series that have multiple in-progress episodes
        } else emptyList()

        _uiState.value = _uiState.value.copy(
            isLoading = false,
            liveCount = live,
            vodCount = vod,
            seriesCount = series,
            recentChannels = recents,
            continueWatchingItems = continueItems,
            error = null,
        )
    }

    fun switchSource(sourceId: String) {
        viewModelScope.launch {
            settingsDataStore.setActiveSourceId(sourceId)
        }
    }

    fun refreshCatalog() {
        val source = _uiState.value.activeSource ?: return
        viewModelScope.launch {
            if (source.type == SourceType.XTREAM && source.credentials != null) {
                xtreamCache.invalidateSource(source.credentials)
            } else {
                sourceRepository.clearPlaylistCache(source.id)
            }
            loadCatalog(source)
        }
    }

    /**
     * Load EPG data and build a spotlight of favorite live channels
     * showing what's currently on.
     */
    private suspend fun loadEpgSpotlight(source: Source) {
        epgRepository.loadForSource(source)
        val guide = epgRepository.guide ?: return
        val playlist = currentPlaylist ?: return
        val profile = profileRepository.getDefaultProfile()
        val favSet = profile.favorites.toSet()

        val liveChannels = playlist.groups.flatMap { it.channels }
            .filterIsInstance<Channel.Live>()
            .filter { it.id in favSet && it.tvgId != null }
            .take(8) // limit spotlight items

        val items = liveChannels.mapNotNull { ch ->
            val programs = guide.programsByChannelId[ch.tvgId] ?: return@mapNotNull null
            val nowNext = EpgParser.getNowAndNextProgram(programs)
            if (nowNext.current == null && nowNext.next == null) return@mapNotNull null
            EpgSpotlightItem(
                channel = ch,
                nowTitle = nowNext.current?.title,
                nextTitle = nowNext.next?.title,
            )
        }

        _uiState.value = _uiState.value.copy(epgSpotlight = items)
    }
}
