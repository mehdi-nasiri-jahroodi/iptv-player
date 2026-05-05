package com.iptvtavern.androidtv.ui.series

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.PlaylistManager
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.data.repository.WatchedRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SeriesEpisode
import com.iptvtavern.androidtv.domain.model.SeriesSeason
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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
 * UI state for the Series browse screen.
 *
 * Two-level browsing:
 * 1. Category sidebar + poster grid (like VOD)
 * 2. On selecting a series → detail hero with season tabs + episode list
 */
data class SeriesUiState(
    val isLoading: Boolean = true,
    val groups: List<ChannelGroup> = emptyList(),
    val filteredGroups: List<ChannelGroup> = emptyList(),
    val selectedGroupIndex: Int = 0,
    /** Series entries for the selected group, filtered by search. */
    val channels: List<Channel.Series> = emptyList(),
    val searchQuery: String = "",
    val groupSearchQuery: String = "",
    val favorites: Set<String> = emptySet(),
    val error: String? = null,
    /** Currently highlighted series in the poster grid. */
    val selectedChannel: Channel.Series? = null,
    /** Enriched version after Xtream get_series_info fetch (has seasons/episodes). */
    val detailChannel: Channel.Series? = null,
    val detailLoading: Boolean = false,
    /** Currently selected season tab index. */
    val selectedSeasonIndex: Int = 0,
    /** Episodes for the selected season. */
    val episodes: List<SeriesEpisode> = emptyList(),
    /** Set of episode IDs that have been watched (completed). */
    val watchedEpisodeIds: Set<String> = emptySet(),
)

@HiltViewModel
class SeriesBrowseViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val playlistManager: PlaylistManager,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val watchedRepository: WatchedRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SeriesUiState())
    val uiState: StateFlow<SeriesUiState> = _uiState.asStateFlow()

    private var allGroups: List<ChannelGroup> = emptyList()
    private var allSeriesChannels: List<Channel.Series> = emptyList()
    private var activeSource: Source? = null
    private var detailFetchJob: Job? = null

    init {
        loadCatalog()
    }

    private fun loadCatalog() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

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

            // Per-kind read: only loads `series.json` from disk on cold start.
            val seriesGroups = playlistManager.getSeriesGroups()
            if (seriesGroups == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load series.",
                )
                return@launch
            }

            allSeriesChannels = seriesGroups.flatMap { it.channels }.filterIsInstance<Channel.Series>()
            allGroups = seriesGroups

            val profile = profileRepository.getDefaultProfile()
            val favSet = profile.favorites.toSet()
            val displayGroups = buildDisplayGroups(seriesGroups, favSet)

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                groups = displayGroups,
                filteredGroups = displayGroups,
                selectedGroupIndex = 0,
                channels = displayGroups.firstOrNull()
                    ?.channels
                    ?.filterIsInstance<Channel.Series>()
                    .orEmpty(),
                favorites = favSet,
                error = null,
            )
        }
    }

    private fun buildDisplayGroups(
        groups: List<ChannelGroup>,
        favorites: Set<String>,
    ): List<ChannelGroup> {
        val result = mutableListOf<ChannelGroup>()

        // Favorites virtual group
        val favChannels = allSeriesChannels.filter { it.id in favorites }
        if (favChannels.isNotEmpty()) {
            result.add(
                ChannelGroup(
                    id = "__favorites__",
                    name = "Favorites",
                    kind = GroupKind.series,
                    channels = favChannels,
                )
            )
        }

        // "All Series" virtual group intentionally omitted — flattening
        // every series into one list is slow on low-RAM TV devices and
        // not useful when groups already organize the catalog.

        result.addAll(groups)
        return result
    }

    // ── Group selection ─────────────────────────────────────────

    fun selectGroup(index: Int) {
        val groups = _uiState.value.filteredGroups
        if (index !in groups.indices) return
        val group = groups[index]
        val seriesChannels = group.channels.filterIsInstance<Channel.Series>()
        val filtered = filterChannels(seriesChannels)

        _uiState.value = _uiState.value.copy(
            selectedGroupIndex = index,
            channels = filtered,
            selectedChannel = null,
            detailChannel = null,
            selectedSeasonIndex = 0,
            episodes = emptyList(),
        )
    }

    // ── Search ──────────────────────────────────────────────────

    fun updateSearch(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        recomputeChannels()
    }

    fun updateGroupSearch(query: String) {
        val allDisplayGroups = _uiState.value.groups
        val filtered = if (query.isBlank()) {
            allDisplayGroups
        } else {
            val lower = query.lowercase()
            allDisplayGroups.filter {
                it.id.startsWith("__") || it.name.lowercase().contains(lower)
            }
        }
        _uiState.value = _uiState.value.copy(
            groupSearchQuery = query,
            filteredGroups = filtered,
            selectedGroupIndex = 0,
            channels = filtered.firstOrNull()
                ?.channels
                ?.filterIsInstance<Channel.Series>()
                ?.let { filterChannels(it) }
                .orEmpty(),
        )
    }

    private fun recomputeChannels() {
        val state = _uiState.value
        val groups = state.filteredGroups
        val groupIndex = state.selectedGroupIndex
        if (groupIndex !in groups.indices) return
        val seriesChannels = groups[groupIndex].channels.filterIsInstance<Channel.Series>()
        val filtered = filterChannels(seriesChannels)
        _uiState.value = state.copy(channels = filtered)
    }

    private fun filterChannels(channels: List<Channel.Series>): List<Channel.Series> {
        val query = _uiState.value.searchQuery
        val filtered = if (query.isBlank()) {
            channels
        } else {
            val lower = query.lowercase()
            channels.filter { it.name.lowercase().contains(lower) }
        }
        return filtered.distinctBy { it.id }
    }

    // ── Detail hero selection ───────────────────────────────────

    /**
     * Called when a poster tile is highlighted (focused).
     * Sets the selected channel and kicks off Xtream detail enrichment
     * to fetch seasons/episodes.
     */
    fun highlightChannel(channel: Channel.Series) {
        _uiState.value = _uiState.value.copy(
            selectedChannel = channel,
            detailChannel = channel, // show base data immediately
            detailLoading = false,
            selectedSeasonIndex = 0,
            episodes = channel.seasons.firstOrNull()?.episodes.orEmpty(),
            watchedEpisodeIds = emptySet(),
        )

        // Fetch watched episode IDs for this series
        viewModelScope.launch {
            val watchedIds = watchedRepository.getCompletedEpisodeIds(channel.id).toSet()
            if (_uiState.value.selectedChannel?.id == channel.id) {
                _uiState.value = _uiState.value.copy(watchedEpisodeIds = watchedIds)
            }
        }

        // Fetch Xtream detail for seasons/episodes
        val source = activeSource ?: return
        if (source.type != SourceType.XTREAM) return
        val creds = source.credentials ?: return
        val xtreamId = channel.xtreamSeriesId ?: return

        detailFetchJob?.cancel()
        detailFetchJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(detailLoading = true)
            try {
                val info = XtreamClient.fetchSeriesInfoCached(creds, xtreamId, xtreamCache)
                val enriched = XtreamClient.mergeSeriesChannelWithXtreamInfo(creds, channel, info)
                // Only update if this is still the selected channel
                if (_uiState.value.selectedChannel?.id == channel.id) {
                    _uiState.value = _uiState.value.copy(
                        detailChannel = enriched,
                        detailLoading = false,
                        selectedSeasonIndex = 0,
                        episodes = enriched.seasons.firstOrNull()?.episodes.orEmpty(),
                    )
                }
            } catch (_: Exception) {
                if (_uiState.value.selectedChannel?.id == channel.id) {
                    _uiState.value = _uiState.value.copy(detailLoading = false)
                }
            }
        }
    }

    // ── Season selection ────────────────────────────────────────

    fun selectSeason(index: Int) {
        val detail = _uiState.value.detailChannel ?: return
        if (index !in detail.seasons.indices) return
        _uiState.value = _uiState.value.copy(
            selectedSeasonIndex = index,
            episodes = detail.seasons[index].episodes,
        )
    }

    // ── Favorites ───────────────────────────────────────────────

    fun toggleFavorite(channelId: String) {
        viewModelScope.launch {
            profileRepository.toggleFavorite(channelId)
            val current = _uiState.value.favorites.toMutableSet()
            if (channelId in current) current.remove(channelId) else current.add(channelId)

            val displayGroups = buildDisplayGroups(allGroups, current)
            val groupQuery = _uiState.value.groupSearchQuery
            val filtered = if (groupQuery.isBlank()) {
                displayGroups
            } else {
                val lower = groupQuery.lowercase()
                displayGroups.filter {
                    it.id.startsWith("__") || it.name.lowercase().contains(lower)
                }
            }
            val groupIndex = _uiState.value.selectedGroupIndex.coerceIn(filtered.indices)
            val channels = filtered[groupIndex].channels
                .filterIsInstance<Channel.Series>()
                .let { filterChannels(it) }

            _uiState.value = _uiState.value.copy(
                favorites = current,
                groups = displayGroups,
                filteredGroups = filtered,
                selectedGroupIndex = groupIndex,
                channels = channels,
            )
        }
    }
}
