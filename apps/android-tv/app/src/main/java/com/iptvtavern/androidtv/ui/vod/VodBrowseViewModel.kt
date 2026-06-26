package com.iptvtavern.androidtv.ui.vod

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.PlaylistManager
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.GroupSortKey
import com.iptvtavern.androidtv.domain.model.GroupSortDir
import com.iptvtavern.androidtv.ui.common.sortGroups
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.VodSortDir
import com.iptvtavern.androidtv.domain.parser.VodSortKey
import com.iptvtavern.androidtv.domain.parser.sortVodChannels
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * UI state for the VOD browse screen.
 *
 * Categories load from a lightweight index; channel lists load when the
 * user selects a group (lazy per category).
 */
data class VodUiState(
    val isLoading: Boolean = true,
    val groups: List<ChannelGroup> = emptyList(),
    val filteredGroups: List<ChannelGroup> = emptyList(),
    val selectedGroupIndex: Int = 0,
    val channels: List<Channel.Vod> = emptyList(),
    val searchQuery: String = "",
    val groupSearchQuery: String = "",
    val favorites: Set<String> = emptySet(),
    val error: String? = null,
    val selectedChannel: Channel.Vod? = null,
    val detailChannel: Channel.Vod? = null,
    val detailLoading: Boolean = false,
    val sortKey: VodSortKey = VodSortKey.DEFAULT,
    val sortDir: VodSortDir = VodSortDir.ASC,
    val groupSortKey: GroupSortKey = GroupSortKey.DEFAULT,
    val groupSortDir: GroupSortDir = GroupSortDir.ASC,
    val isFilteringGroup: Boolean = false,
    /** When true, skip stealing focus to the grid after a group filter ends — used by group-sort changes so focus stays on the sort button. */
    val suppressGridFocus: Boolean = false,
)

@HiltViewModel
class VodBrowseViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val playlistManager: PlaylistManager,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VodUiState())
    val uiState: StateFlow<VodUiState> = _uiState.asStateFlow()

    private var catalogGroups: List<ChannelGroup> = emptyList()
    private var loadedGroupChannels: List<Channel.Vod> = emptyList()
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

            val stubs = playlistManager.getVodGroupStubs()
            if (stubs == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load movies.",
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
            playlistManager.findChannelById(id) as? Channel.Vod
        }
        if (favChannels.isNotEmpty()) {
            result.add(
                ChannelGroup(
                    id = "__favorites__",
                    name = "Favorites",
                    kind = GroupKind.vod,
                    channels = favChannels,
                    channelCount = favChannels.size,
                )
            )
        }

        result.addAll(groups)
        return result
    }

    fun selectGroup(index: Int) {
        val groups = _uiState.value.filteredGroups
        if (index !in groups.indices) return

        _uiState.value = _uiState.value.copy(
            selectedGroupIndex = index,
            isFilteringGroup = true,
        )
        viewModelScope.launch {
            val group = groups[index]
            val vodChannels = withContext(Dispatchers.Default) {
                channelsForGroup(group)
            }
            loadedGroupChannels = vodChannels
            val filtered = withContext(Dispatchers.Default) {
                filterAndSort(vodChannels)
            }
            delay(150)
            _uiState.value = _uiState.value.copy(
                channels = filtered,
                selectedChannel = null,
                detailChannel = null,
                isFilteringGroup = false,
            )
        }
    }

    private suspend fun channelsForGroup(group: ChannelGroup): List<Channel.Vod> {
        if (group.id == "__favorites__") {
            return group.channels.filterIsInstance<Channel.Vod>()
        }
        if (group.channels.isNotEmpty()) {
            return group.channels.filterIsInstance<Channel.Vod>()
        }
        return playlistManager.loadVodGroup(group.id)
            ?.channels
            ?.filterIsInstance<Channel.Vod>()
            .orEmpty()
    }

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
     * keeps focus on the sort button: it sets [VodUiState.suppressGridFocus] so
     * the screen's filter-end effect skips the grid focus steal.
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

    fun setSortKey(key: VodSortKey) {
        _uiState.value = _uiState.value.copy(sortKey = key)
        recomputeChannels()
    }

    fun setSortDir(dir: VodSortDir) {
        _uiState.value = _uiState.value.copy(sortDir = dir)
        recomputeChannels()
    }

    private fun recomputeChannels() {
        val filtered = filterAndSort(loadedGroupChannels)
        _uiState.value = _uiState.value.copy(channels = filtered)
    }

    private fun filterAndSort(channels: List<Channel.Vod>): List<Channel.Vod> {
        val state = _uiState.value
        val filtered = if (state.searchQuery.isBlank()) {
            channels
        } else {
            val lower = state.searchQuery.lowercase()
            channels.filter { it.name.lowercase().contains(lower) }
        }
        return sortVodChannels(filtered, state.sortKey, state.sortDir)
            .distinctBy { it.id }
    }

    fun highlightChannel(channel: Channel.Vod) {
        _uiState.value = _uiState.value.copy(
            selectedChannel = channel,
            detailChannel = channel,
            detailLoading = false,
        )

        val source = activeSource ?: return
        if (source.type != SourceType.XTREAM) return
        val creds = source.credentials ?: return
        val xtreamId = channel.xtreamStreamId ?: return

        detailFetchJob?.cancel()
        detailFetchJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(detailLoading = true)
            try {
                val info = XtreamClient.fetchVodInfoCached(creds, xtreamId, xtreamCache)
                val enriched = XtreamClient.mergeVodChannelWithXtreamInfo(channel, info)
                if (_uiState.value.selectedChannel?.id == channel.id) {
                    _uiState.value = _uiState.value.copy(
                        detailChannel = enriched,
                        detailLoading = false,
                    )
                }
            } catch (_: Exception) {
                if (_uiState.value.selectedChannel?.id == channel.id) {
                    _uiState.value = _uiState.value.copy(detailLoading = false)
                }
            }
        }
    }

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
                    val vodChannels = withContext(Dispatchers.Default) {
                        channelsForGroup(favGroup)
                    }
                    loadedGroupChannels = vodChannels
                    val refreshed = withContext(Dispatchers.Default) {
                        filterAndSort(vodChannels)
                    }
                    _uiState.value = _uiState.value.copy(channels = refreshed)
                }
            }
        }
    }
}
