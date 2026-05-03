package com.iptvtavern.androidtv.ui.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.EpgRepository
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import com.iptvtavern.androidtv.domain.parser.EpgParser
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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
 * UI state for the Live TV browse screen.
 *
 * Similar to the web's catalog-store: groups, filtered channels, search.
 */
data class BrowseUiState(
    val isLoading: Boolean = true,
    val groups: List<ChannelGroup> = emptyList(),
    val selectedGroupIndex: Int = 0,
    val channels: List<Channel> = emptyList(),
    val searchQuery: String = "",
    val favorites: Set<String> = emptySet(),
    val error: String? = null,
    /** Channel currently playing in the mini player (null = no mini player). */
    val playingChannel: Channel? = null,
    /** True when the user is reordering groups (Red button toggle). */
    val isReorderingGroups: Boolean = false,
    /** Search/filter query for the groups sidebar. */
    val groupSearchQuery: String = "",
    /** Groups filtered by groupSearchQuery (used for display). */
    val filteredGroups: List<ChannelGroup> = emptyList(),
    /** Now/next EPG data keyed by tvgId (for live channels). */
    val nowNextByTvgId: Map<String, EpgParser.NowNext> = emptyMap(),
)

@HiltViewModel
class BrowseViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val epgRepository: EpgRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BrowseUiState())
    val uiState: StateFlow<BrowseUiState> = _uiState.asStateFlow()

    private var allGroups: List<ChannelGroup> = emptyList()
    private var allChannels: List<Channel> = emptyList()
    /** Cached source ID so we can persist group order per-source. */
    private var currentSourceId: String? = null
    /** Custom group order loaded from DataStore (null = use playlist order). */
    private var customGroupOrder: List<String>? = null

    init {
        loadCatalog()
        startMinuteClock()
    }

    private fun loadCatalog() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            // Get active source
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

            // Get playlist (cached or fetch)
            // Xtream sources use per-action cache (XtreamCache), not whole-playlist Room cache
            val playlist = if (source.type != SourceType.XTREAM) {
                sourceRepository.getCachedPlaylist(source.id) ?: fetchPlaylist(source)
            } else {
                fetchPlaylist(source)
            }

            if (playlist == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load channels.",
                )
                return@launch
            }

            // Cache M3U playlists in Room; Xtream uses per-action cache
            if (source.type != SourceType.XTREAM && sourceRepository.getCachedPlaylist(source.id) == null) {
                try {
                    sourceRepository.cachePlaylist(playlist)
                } catch (_: Exception) {
                    // Cache write can fail for very large playlists
                }
            }

            // Load favorites
            val profile = profileRepository.getDefaultProfile()
            val favSet = profile.favorites.toSet()

            allGroups = playlist.groups
            allChannels = playlist.groups.flatMap { it.channels }
            currentSourceId = source.id

            // Load persisted custom group order for this source
            customGroupOrder = settingsDataStore.getGroupOrder(source.id)

            // Build groups list with a "Favorites" virtual group at top
            val displayGroups = buildDisplayGroups(playlist.groups, favSet)

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                groups = displayGroups,
                filteredGroups = displayGroups,
                selectedGroupIndex = 0,
                channels = displayGroups.firstOrNull()?.channels.orEmpty(),
                favorites = favSet,
                error = null,
            )

            // Load EPG in background (non-blocking)
            viewModelScope.launch {
                epgRepository.loadForSource(source)
                refreshNowNext()
            }
        }
    }

    private suspend fun fetchPlaylist(source: com.iptvtavern.androidtv.domain.model.Source): Playlist? {
        return try {
            when (source.type) {
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
        } catch (_: Exception) {
            null
        }
    }

    private fun buildDisplayGroups(
        groups: List<ChannelGroup>,
        favorites: Set<String>,
    ): List<ChannelGroup> {
        val result = mutableListOf<ChannelGroup>()

        // Favorites virtual group — always pinned at top
        val favChannels = allChannels.filter { it.id in favorites }
        if (favChannels.isNotEmpty()) {
            result.add(
                ChannelGroup(
                    id = "__favorites__",
                    name = "Favorites",
                    kind = GroupKind.mixed,
                    channels = favChannels,
                )
            )
        }

        // "All" virtual group — always second
        result.add(
            ChannelGroup(
                id = "__all__",
                name = "All Channels",
                kind = GroupKind.mixed,
                channels = allChannels,
            )
        )

        // Apply custom order if available, otherwise use playlist order
        val orderedGroups = customGroupOrder?.let { order ->
            val byId = groups.associateBy { it.id }
            val ordered = order.mapNotNull { byId[it] }
            // Append any new groups not in the saved order (added after last save)
            val seen = order.toSet()
            val remaining = groups.filter { it.id !in seen }
            ordered + remaining
        } ?: groups

        result.addAll(orderedGroups)
        return result
    }

    // ── EPG: now/next + minute clock ────────────────────────────────

    /**
     * Refresh the now/next map from the current guide.
     * Builds a map of tvgId → NowNext for all live channels that have tvgId.
     */
    private fun refreshNowNext() {
        val guide = epgRepository.guide ?: return
        val nowMs = System.currentTimeMillis()
        val map = mutableMapOf<String, EpgParser.NowNext>()
        for ((channelId, programs) in guide.programsByChannelId) {
            map[channelId] = EpgParser.getNowAndNextProgram(programs, nowMs)
        }
        _uiState.value = _uiState.value.copy(nowNextByTvgId = map)
    }

    /**
     * Tick every 60 seconds to update now/next (like web's useMinuteClock).
     */
    private fun startMinuteClock() {
        viewModelScope.launch {
            while (true) {
                delay(60_000)
                refreshNowNext()
            }
        }
    }

    fun selectGroup(index: Int) {
        val groups = _uiState.value.filteredGroups
        if (index !in groups.indices) return

        val group = groups[index]
        val query = _uiState.value.searchQuery
        val filtered = filterChannels(group.channels, query)

        _uiState.value = _uiState.value.copy(
            selectedGroupIndex = index,
            channels = filtered,
        )
    }

    fun updateSearch(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        val groups = _uiState.value.filteredGroups
        val groupIndex = _uiState.value.selectedGroupIndex
        if (groupIndex in groups.indices) {
            val filtered = filterChannels(groups[groupIndex].channels, query)
            _uiState.value = _uiState.value.copy(channels = filtered)
        }
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
            channels = filtered.firstOrNull()?.channels.orEmpty(),
        )
    }

    private fun filterChannels(channels: List<Channel>, query: String): List<Channel> {
        if (query.isBlank()) return channels
        val lower = query.lowercase()
        return channels.filter { it.name.lowercase().contains(lower) }
    }

    fun toggleFavorite(channelId: String) {
        viewModelScope.launch {
            profileRepository.toggleFavorite(channelId)

            // Update local state
            val current = _uiState.value.favorites.toMutableSet()
            if (channelId in current) current.remove(channelId) else current.add(channelId)

            // Rebuild groups with updated favorites
            val displayGroups = buildDisplayGroups(allGroups, current)
            // Re-apply group search filter
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
            val query = _uiState.value.searchQuery
            val channelFiltered = filterChannels(filtered[groupIndex].channels, query)

            _uiState.value = _uiState.value.copy(
                favorites = current,
                groups = displayGroups,
                filteredGroups = filtered,
                selectedGroupIndex = groupIndex,
                channels = channelFiltered,
            )
        }
    }

    fun addRecent(channelId: String) {
        viewModelScope.launch {
            profileRepository.addRecent(channelId)
        }
    }

    /** Set channel to play in the inline mini player. */
    fun playInMiniPlayer(channel: Channel) {
        _uiState.value = _uiState.value.copy(playingChannel = channel)
        viewModelScope.launch {
            profileRepository.addRecent(channel.id)
        }
    }

    /** Stop the mini player — call before navigating away. */
    fun stopMiniPlayer() {
        _uiState.value = _uiState.value.copy(playingChannel = null)
    }

    // ── Group reorder ───────────────────────────────────────────

    /** Toggle reorder mode (Red button). */
    fun toggleReorderMode() {
        val wasReordering = _uiState.value.isReorderingGroups
        _uiState.value = _uiState.value.copy(isReorderingGroups = !wasReordering)

        // When exiting reorder mode, persist the current order
        if (wasReordering) {
            saveGroupOrder()
        }
    }

    /**
     * Move the currently selected group up or down.
     * Only real groups can be moved — virtual groups (__favorites__, __all__)
     * are pinned and cannot be reordered.
     *
     * @param direction -1 = move up, +1 = move down
     */
    fun moveGroup(direction: Int) {
        val state = _uiState.value
        if (!state.isReorderingGroups) return

        val groups = state.groups.toMutableList()
        val idx = state.selectedGroupIndex

        // Count virtual groups at top (they're pinned)
        val pinnedCount = groups.count { it.id.startsWith("__") }

        // Can't move virtual groups
        if (idx < pinnedCount) return

        val targetIdx = idx + direction
        // Can't move outside the real-group range
        if (targetIdx < pinnedCount || targetIdx >= groups.size) return

        // Swap
        val temp = groups[idx]
        groups[idx] = groups[targetIdx]
        groups[targetIdx] = temp

        _uiState.value = state.copy(
            groups = groups,
            selectedGroupIndex = targetIdx,
        )
    }

    private fun saveGroupOrder() {
        val sourceId = currentSourceId ?: return
        // Extract only real group IDs (skip virtual groups)
        val realGroupIds = _uiState.value.groups
            .filter { !it.id.startsWith("__") }
            .map { it.id }

        // Also update the in-memory cache so future buildDisplayGroups calls use it
        customGroupOrder = realGroupIds

        viewModelScope.launch {
            settingsDataStore.setGroupOrder(sourceId, realGroupIds)
        }
    }
}
