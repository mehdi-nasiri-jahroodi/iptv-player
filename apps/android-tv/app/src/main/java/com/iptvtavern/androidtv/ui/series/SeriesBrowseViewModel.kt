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
import com.iptvtavern.androidtv.domain.model.GroupSortKey
import com.iptvtavern.androidtv.domain.model.GroupSortDir
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SeriesEpisode
import com.iptvtavern.androidtv.domain.model.SeriesSeason
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import com.iptvtavern.androidtv.ui.common.sortGroups
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
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
    val isFilteringGroup: Boolean = false,
    /** When true, skip stealing focus to the grid after a group filter ends — used by group-sort changes so focus stays on the sort button. */
    val suppressGridFocus: Boolean = false,
    val groupSortKey: GroupSortKey = GroupSortKey.DEFAULT,
    val groupSortDir: GroupSortDir = GroupSortDir.ASC,
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

    private var catalogGroups: List<ChannelGroup> = emptyList()
    private var loadedGroupChannels: List<Channel.Series> = emptyList()
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
            val stubs = playlistManager.getSeriesGroupStubs()
            if (stubs == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load series.",
                )
                return@launch
            }

            catalogGroups = stubs

            val profile = profileRepository.getDefaultProfile()
            val favSet = profile.favorites.toSet()
            val displayGroups = buildDisplayGroups(stubs, favSet)

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                groups = displayGroups,
                filteredGroups = displayGroups,
                selectedGroupIndex = 0,
                channels = emptyList(),
                favorites = favSet,
                error = null,
            )
            if (displayGroups.isNotEmpty()) {
                selectGroup(0)
            }
        }
    }

    private suspend fun buildDisplayGroups(
        groups: List<ChannelGroup>,
        favorites: Set<String>,
    ): List<ChannelGroup> {
        val result = mutableListOf<ChannelGroup>()

        val favChannels = favorites.mapNotNull { id ->
            playlistManager.findChannelById(id) as? Channel.Series
        }
        if (favChannels.isNotEmpty()) {
            result.add(
                ChannelGroup(
                    id = "__favorites__",
                    name = "Favorites",
                    kind = GroupKind.series,
                    channels = favChannels,
                    channelCount = favChannels.size,
                )
            )
        }

        result.addAll(groups)
        return result
    }

    // ── Group selection ─────────────────────────────────────────

    fun selectGroup(index: Int) {
        val groups = _uiState.value.filteredGroups
        if (index !in groups.indices) return

        _uiState.value = _uiState.value.copy(
            selectedGroupIndex = index,
            isFilteringGroup = true,
        )
        viewModelScope.launch {
            val group = groups[index]
            val seriesChannels = withContext(Dispatchers.Default) {
                channelsForGroup(group)
            }
            loadedGroupChannels = seriesChannels
            val filtered = withContext(Dispatchers.Default) {
                filterChannels(seriesChannels)
            }
            delay(150)
            _uiState.value = _uiState.value.copy(
                channels = filtered,
                selectedChannel = null,
                detailChannel = null,
                selectedSeasonIndex = 0,
                episodes = emptyList(),
                isFilteringGroup = false,
            )
        }
    }

    private suspend fun channelsForGroup(group: ChannelGroup): List<Channel.Series> {
        if (group.id == "__favorites__" || group.channels.isNotEmpty()) {
            return group.channels.filterIsInstance<Channel.Series>()
        }
        return playlistManager.loadSeriesGroup(group.id)
            ?.channels
            ?.filterIsInstance<Channel.Series>()
            .orEmpty()
    }

    // ── Search ──────────────────────────────────────────────────

    fun updateSearch(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        recomputeChannels()
    }

    fun updateGroupSearch(query: String) {
        _uiState.value = _uiState.value.copy(groupSearchQuery = query)
        recomputeFilteredGroups()
    }

    fun setGroupSortKey(key: GroupSortKey) {
        _uiState.value = _uiState.value.copy(groupSortKey = key)
        applyGroupSort()
    }

    fun setGroupSortDir(dir: GroupSortDir) {
        _uiState.value = _uiState.value.copy(groupSortDir = dir)
        applyGroupSort()
    }

    /**
     * Re-sort the groups sidebar and jump to the first group of the new order so
     * the new order is immediately visible. Unlike a plain group switch, this
     * keeps focus on the sort button: it sets [SeriesUiState.suppressGridFocus]
     * so the screen's filter-end effect skips the grid focus steal.
     */
    private fun applyGroupSort() {
        val state = _uiState.value
        val allDisplayGroups = state.groups
        val query = state.groupSearchQuery
        val filtered = if (query.isBlank()) {
            allDisplayGroups
        } else {
            val lower = query.lowercase()
            allDisplayGroups.filter {
                it.id.startsWith("__") || it.name.lowercase().contains(lower)
            }
        }
        val sorted = sortGroups(filtered, state.groupSortKey, state.groupSortDir)

        _uiState.value = state.copy(
            filteredGroups = sorted,
            selectedGroupIndex = 0,
            suppressGridFocus = true,
        )
        selectGroup(0)
    }

    fun clearSuppressGridFocus() {
        if (_uiState.value.suppressGridFocus) {
            _uiState.value = _uiState.value.copy(suppressGridFocus = false)
        }
    }

    private fun recomputeFilteredGroups() {
        val state = _uiState.value
        val allDisplayGroups = state.groups
        val query = state.groupSearchQuery

        val filtered = if (query.isBlank()) {
            allDisplayGroups
        } else {
            val lower = query.lowercase()
            allDisplayGroups.filter {
                it.id.startsWith("__") || it.name.lowercase().contains(lower)
            }
        }

        val sorted = sortGroups(filtered, state.groupSortKey, state.groupSortDir)

        // Keep the current selection stable by id so changing sort order (or
        // refining the group filter) doesn't reset the user to group 0 or steal
        // focus to the grid. Only reload when the previously selected group is
        // no longer visible.
        val previouslySelectedId = state.filteredGroups
            .getOrNull(state.selectedGroupIndex)?.id
        val newIndex = sorted.indexOfFirst { it.id == previouslySelectedId }

        if (newIndex >= 0) {
            _uiState.value = state.copy(
                filteredGroups = sorted,
                selectedGroupIndex = newIndex,
            )
        } else {
            _uiState.value = state.copy(
                filteredGroups = sorted,
                selectedGroupIndex = 0,
                channels = emptyList(),
            )
            selectGroup(0)
        }
    }

    private fun recomputeChannels() {
        val filtered = filterChannels(loadedGroupChannels)
        _uiState.value = _uiState.value.copy(channels = filtered)
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

            // Keep the selection stable by group id: adding/removing the first
            // favorite inserts/removes the "Favorites" group at the top, which
            // shifts every index. Matching by id avoids jumping onto the new
            // Favorites group by accident.
            val previouslySelectedId = _uiState.value.filteredGroups
                .getOrNull(_uiState.value.selectedGroupIndex)?.id

            val displayGroups = buildDisplayGroups(catalogGroups, current)
            val groupQuery = _uiState.value.groupSearchQuery
            val filtered = if (groupQuery.isBlank()) {
                displayGroups
            } else {
                val lower = groupQuery.lowercase()
                displayGroups.filter {
                    it.id.startsWith("__") || it.name.lowercase().contains(lower)
                }
            }

            val newIndex = filtered.indexOfFirst { it.id == previouslySelectedId }
                .let { if (it >= 0) it else _uiState.value.selectedGroupIndex.coerceIn(filtered.indices) }

            // Do NOT call selectGroup(): it reloads the whole grid and clears
            // detailChannel, which closes an open detail modal. Only the visible
            // channel set of the Favorites group changes on a toggle, so refresh
            // that list in place while preserving detailChannel.
            _uiState.value = _uiState.value.copy(
                favorites = current,
                groups = displayGroups,
                filteredGroups = filtered,
                selectedGroupIndex = newIndex,
            )

            if (previouslySelectedId == "__favorites__") {
                val favGroup = filtered.getOrNull(newIndex)
                if (favGroup != null) {
                    val seriesChannels = withContext(Dispatchers.Default) {
                        channelsForGroup(favGroup)
                    }
                    loadedGroupChannels = seriesChannels
                    val refreshed = withContext(Dispatchers.Default) {
                        filterChannels(seriesChannels)
                    }
                    _uiState.value = _uiState.value.copy(channels = refreshed)
                }
            }
        }
    }
}
