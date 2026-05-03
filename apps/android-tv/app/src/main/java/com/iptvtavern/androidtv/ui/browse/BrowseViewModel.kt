package com.iptvtavern.androidtv.ui.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import dagger.hilt.android.lifecycle.HiltViewModel
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
)

@HiltViewModel
class BrowseViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BrowseUiState())
    val uiState: StateFlow<BrowseUiState> = _uiState.asStateFlow()

    private var allGroups: List<ChannelGroup> = emptyList()
    private var allChannels: List<Channel> = emptyList()

    init {
        loadCatalog()
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
            val playlist = sourceRepository.getCachedPlaylist(source.id)
                ?: fetchPlaylist(source)

            if (playlist == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load channels.",
                )
                return@launch
            }

            // Cache if fresh
            if (sourceRepository.getCachedPlaylist(source.id) == null) {
                sourceRepository.cachePlaylist(playlist)
            }

            // Load favorites
            val profile = profileRepository.getDefaultProfile()
            val favSet = profile.favorites.toSet()

            allGroups = playlist.groups
            allChannels = playlist.groups.flatMap { it.channels }

            // Build groups list with a "Favorites" virtual group at top
            val displayGroups = buildDisplayGroups(playlist.groups, favSet)

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                groups = displayGroups,
                selectedGroupIndex = 0,
                channels = displayGroups.firstOrNull()?.channels.orEmpty(),
                favorites = favSet,
                error = null,
            )
        }
    }

    private suspend fun fetchPlaylist(source: com.iptvtavern.androidtv.domain.model.Source): Playlist? {
        val url = source.url ?: return null
        return try {
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

        // "All" virtual group
        result.add(
            ChannelGroup(
                id = "__all__",
                name = "All Channels",
                kind = GroupKind.mixed,
                channels = allChannels,
            )
        )

        result.addAll(groups)
        return result
    }

    fun selectGroup(index: Int) {
        val groups = _uiState.value.groups
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
        val groups = _uiState.value.groups
        val groupIndex = _uiState.value.selectedGroupIndex
        if (groupIndex in groups.indices) {
            val filtered = filterChannels(groups[groupIndex].channels, query)
            _uiState.value = _uiState.value.copy(channels = filtered)
        }
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
            val groupIndex = _uiState.value.selectedGroupIndex.coerceIn(displayGroups.indices)
            val query = _uiState.value.searchQuery
            val filtered = filterChannels(displayGroups[groupIndex].channels, query)

            _uiState.value = _uiState.value.copy(
                favorites = current,
                groups = displayGroups,
                selectedGroupIndex = groupIndex,
                channels = filtered,
            )
        }
    }

    fun addRecent(channelId: String) {
        viewModelScope.launch {
            profileRepository.addRecent(channelId)
        }
    }
}
