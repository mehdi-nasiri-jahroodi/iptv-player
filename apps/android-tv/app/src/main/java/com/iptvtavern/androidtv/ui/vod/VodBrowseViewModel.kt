package com.iptvtavern.androidtv.ui.vod

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.VodSortDir
import com.iptvtavern.androidtv.domain.parser.VodSortKey
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.parser.sortVodChannels
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
 * UI state for the VOD browse screen.
 *
 * Similar to BrowseUiState but tailored for poster grid + detail hero.
 */
data class VodUiState(
    val isLoading: Boolean = true,
    val groups: List<ChannelGroup> = emptyList(),
    val filteredGroups: List<ChannelGroup> = emptyList(),
    val selectedGroupIndex: Int = 0,
    /** VOD channels for the selected group, filtered + sorted. */
    val channels: List<Channel.Vod> = emptyList(),
    val searchQuery: String = "",
    val groupSearchQuery: String = "",
    val favorites: Set<String> = emptySet(),
    val error: String? = null,
    /** Currently highlighted channel in the poster grid → shown in hero. */
    val selectedChannel: Channel.Vod? = null,
    /** Enriched version of selectedChannel after Xtream detail fetch. */
    val detailChannel: Channel.Vod? = null,
    val detailLoading: Boolean = false,
    /** Sorting state. */
    val sortKey: VodSortKey = VodSortKey.DEFAULT,
    val sortDir: VodSortDir = VodSortDir.ASC,
)

@HiltViewModel
class VodBrowseViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VodUiState())
    val uiState: StateFlow<VodUiState> = _uiState.asStateFlow()

    private var allGroups: List<ChannelGroup> = emptyList()
    private var allVodChannels: List<Channel.Vod> = emptyList()
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

            val playlist = fetchPlaylist(source)
            if (playlist == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load movies.",
                )
                return@launch
            }

            // Extract only VOD groups and channels
            val vodGroups = playlist.groups.filter { group ->
                group.channels.any { it is Channel.Vod }
            }.map { group ->
                group.copy(channels = group.channels.filterIsInstance<Channel.Vod>())
            }

            allVodChannels = vodGroups.flatMap { it.channels }.filterIsInstance<Channel.Vod>()
            allGroups = vodGroups

            val profile = profileRepository.getDefaultProfile()
            val favSet = profile.favorites.toSet()
            val displayGroups = buildDisplayGroups(vodGroups, favSet)

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                groups = displayGroups,
                filteredGroups = displayGroups,
                selectedGroupIndex = 0,
                channels = displayGroups.firstOrNull()
                    ?.channels
                    ?.filterIsInstance<Channel.Vod>()
                    .orEmpty(),
                favorites = favSet,
                error = null,
            )
        }
    }

    private suspend fun fetchPlaylist(source: Source): Playlist? {
        return try {
            when (source.type) {
                SourceType.XTREAM -> {
                    val creds = source.credentials ?: return null
                    XtreamClient.loadXtreamPlaylist(creds, source.id, xtreamCache)
                }
                SourceType.M3U_URL, SourceType.M3U_FILE -> {
                    sourceRepository.getCachedPlaylist(source.id)
                        ?: run {
                            val url = source.url ?: return null
                            withContext(Dispatchers.IO) {
                                val conn = URL(url).openConnection() as HttpURLConnection
                                conn.connectTimeout = 15_000
                                conn.readTimeout = 30_000
                                source.userAgent?.let { conn.setRequestProperty("User-Agent", it) }
                                try {
                                    val text = conn.inputStream.bufferedReader().use { it.readText() }
                                    parseM3uToPlaylist(text, source.id)
                                } finally {
                                    conn.disconnect()
                                }
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

        // Favorites virtual group
        val favChannels = allVodChannels.filter { it.id in favorites }
        if (favChannels.isNotEmpty()) {
            result.add(
                ChannelGroup(
                    id = "__favorites__",
                    name = "Favorites",
                    kind = GroupKind.vod,
                    channels = favChannels,
                )
            )
        }

        // All movies
        result.add(
            ChannelGroup(
                id = "__all__",
                name = "All Movies",
                kind = GroupKind.vod,
                channels = allVodChannels,
            )
        )

        result.addAll(groups)
        return result
    }

    // ── Group selection ─────────────────────────────────────────

    fun selectGroup(index: Int) {
        val groups = _uiState.value.filteredGroups
        if (index !in groups.indices) return
        val group = groups[index]
        val vodChannels = group.channels.filterIsInstance<Channel.Vod>()
        val filtered = filterAndSort(vodChannels)

        _uiState.value = _uiState.value.copy(
            selectedGroupIndex = index,
            channels = filtered,
            selectedChannel = null,
            detailChannel = null,
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
                ?.filterIsInstance<Channel.Vod>()
                ?.let { filterAndSort(it) }
                .orEmpty(),
        )
    }

    // ── Sorting ─────────────────────────────────────────────────

    fun setSortKey(key: VodSortKey) {
        _uiState.value = _uiState.value.copy(sortKey = key)
        recomputeChannels()
    }

    fun setSortDir(dir: VodSortDir) {
        _uiState.value = _uiState.value.copy(sortDir = dir)
        recomputeChannels()
    }

    private fun recomputeChannels() {
        val state = _uiState.value
        val groups = state.filteredGroups
        val groupIndex = state.selectedGroupIndex
        if (groupIndex !in groups.indices) return
        val vodChannels = groups[groupIndex].channels.filterIsInstance<Channel.Vod>()
        val filtered = filterAndSort(vodChannels)
        _uiState.value = state.copy(channels = filtered)
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

    // ── Detail hero selection ───────────────────────────────────

    /**
     * Called when a poster tile is highlighted (focused).
     * Sets the selected channel for the detail hero and kicks off
     * Xtream detail enrichment if this is an Xtream source.
     */
    fun highlightChannel(channel: Channel.Vod) {
        _uiState.value = _uiState.value.copy(
            selectedChannel = channel,
            detailChannel = channel, // show base data immediately
            detailLoading = false,
        )

        // Fetch Xtream detail if applicable
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
                // Only update if this is still the selected channel
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
                .filterIsInstance<Channel.Vod>()
                .let { filterAndSort(it) }

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
