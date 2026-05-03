package com.iptvtavern.androidtv.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.parser.validateSource
import com.iptvtavern.androidtv.domain.parser.SourceValidationResult
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
    val error: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
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

        // Try cached playlist first
        val cached = sourceRepository.getCachedPlaylist(source.id)
        if (cached != null) {
            applyPlaylist(cached)
            return
        }

        // Fetch and parse
        try {
            val playlist = fetchAndParsePlaylist(source)
            if (playlist != null) {
                sourceRepository.cachePlaylist(playlist)
                applyPlaylist(playlist)
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
        val url = source.url ?: return null
        return withContext(Dispatchers.IO) {
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

        _uiState.value = _uiState.value.copy(
            isLoading = false,
            liveCount = live,
            vodCount = vod,
            seriesCount = series,
            recentChannels = recents,
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
            sourceRepository.clearPlaylistCache(source.id)
            loadCatalog(source)
        }
    }
}
