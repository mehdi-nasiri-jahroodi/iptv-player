package com.iptvtavern.androidtv.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.EpgRepository
import com.iptvtavern.androidtv.data.repository.PlaylistManager
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.data.repository.WatchedRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelSnapshot
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.parser.EpgParser
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Home screen state — catalog counts, active source, and continue-watching channels.
 *
 * Home never loads full catalog slices. Counts come from `meta.json`; recents
 * and continue-watching use stored display snapshots / watched metadata.
 */
data class HomeUiState(
    val isLoading: Boolean = true,
    val activeSource: Source? = null,
    val sources: List<Source> = emptyList(),
    val liveCount: Int = 0,
    val vodCount: Int = 0,
    val seriesCount: Int = 0,
    val recentChannels: List<ChannelSnapshot> = emptyList(),
    /** Items with playback progress (VOD/episodes not yet completed). */
    val continueWatchingItems: List<ContinueWatchingItem> = emptyList(),
    val error: String? = null,
    /** EPG spotlight: favorite live channels with what's on now. */
    val epgSpotlight: List<EpgSpotlightItem> = emptyList(),
)

/**
 * A VOD or series episode with its saved playback progress.
 * Display fields are persisted — no catalog lookup on Home.
 */
data class ContinueWatchingItem(
    val channelId: String,
    val name: String,
    val imageUrl: String?,
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
    private val epgRepository: EpgRepository,
    private val watchedRepository: WatchedRepository,
    private val playlistManager: PlaylistManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                sourceRepository.sources,
                settingsDataStore.activeSourceId,
            ) { sources, activeId ->
                Pair(sources, activeId)
            }.collect { (sources, activeId) ->
                val matchedSource = activeId?.let { id -> sources.find { it.id == id } }
                val activeSource = matchedSource ?: sources.firstOrNull()

                if (activeSource != null && activeSource.id != activeId) {
                    settingsDataStore.setActiveSourceId(activeSource.id)
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

        try {
            val meta = playlistManager.ensureCatalogMeta()
            if (meta == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load channels from source.",
                )
                return
            }

            applyCatalogMeta(meta)

            val profile = profileRepository.getDefaultProfile()
            if (profile.favorites.isNotEmpty()) {
                viewModelScope.launch { loadEpgSpotlight(source) }
            }
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = e.message ?: "Failed to load catalog.",
            )
        }
    }

    private suspend fun applyCatalogMeta(meta: com.iptvtavern.androidtv.data.repository.PlaylistCacheStore.CatalogMeta) {
        val profile = profileRepository.getDefaultProfile()
        val recents = profile.recentSnapshots.take(5)

        val sourceId = _uiState.value.activeSource?.id
        val continueItems = if (sourceId != null) {
            val watched = watchedRepository.getRecentInProgress(sourceId, 10)
            watched.mapNotNull { w ->
                val progress = if (w.durationMs > 0) {
                    (w.positionMs.toFloat() / w.durationMs).coerceIn(0f, 1f)
                } else 0f
                val name = w.channelName.ifBlank { w.channelId }
                ContinueWatchingItem(
                    channelId = w.channelId,
                    name = name,
                    imageUrl = w.imageUrl,
                    positionMs = w.positionMs,
                    durationMs = w.durationMs,
                    progress = progress,
                )
            }.distinctBy { it.channelId }
        } else emptyList()

        _uiState.value = _uiState.value.copy(
            isLoading = false,
            liveCount = meta.liveCount,
            vodCount = meta.vodCount,
            seriesCount = meta.seriesCount,
            recentChannels = recents,
            continueWatchingItems = continueItems,
            error = null,
        )
    }

    fun switchSource(sourceId: String) {
        viewModelScope.launch {
            playlistManager.invalidateMemoryCache()
            settingsDataStore.setActiveSourceId(sourceId)
        }
    }

    fun refreshCatalog() {
        val source = _uiState.value.activeSource ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                playlistManager.invalidateMemoryCache()
                val ok = playlistManager.refreshPlaylist()
                if (!ok) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Refresh failed. Check your connection and try again.",
                    )
                    return@launch
                }

                val meta = playlistManager.getCatalogMeta()
                if (meta == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Refresh failed. Could not read updated catalog.",
                    )
                    return@launch
                }

                applyCatalogMeta(meta)
                if (profileRepository.getDefaultProfile().favorites.isNotEmpty()) {
                    viewModelScope.launch { loadEpgSpotlight(source) }
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Refresh failed.",
                )
            }
        }
    }

    /**
     * Load EPG and build spotlight — loads only the live slice for favorite channels.
     */
    private suspend fun loadEpgSpotlight(source: Source) {
        epgRepository.loadForSource(source)
        val guide = epgRepository.guide ?: return
        val liveGroups = playlistManager.getLiveGroups() ?: return
        val profile = profileRepository.getDefaultProfile()
        val favSet = profile.favorites.toSet()

        val liveChannels = liveGroups.flatMap { it.channels }
            .filterIsInstance<Channel.Live>()
            .filter { it.id in favSet && it.tvgId != null }
            .take(8)

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
