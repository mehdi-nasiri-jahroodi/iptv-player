package com.iptvtavern.androidtv.ui.browse

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.EpgRepository
import com.iptvtavern.androidtv.data.repository.PlaylistManager
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.GroupSortKey
import com.iptvtavern.androidtv.domain.model.GroupSortDir
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.PlayerBufferMode
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import com.iptvtavern.androidtv.domain.parser.EpgParser
import com.iptvtavern.androidtv.playback.ExoPlayerFactory
import com.iptvtavern.androidtv.playback.LivePlaybackSession
import com.iptvtavern.androidtv.ui.common.sortGroups
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
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
    /** Brief loading flag while the channel list is being rebuilt after a group switch. */
    val isFilteringGroup: Boolean = false,
    /** When true, skip stealing focus to the grid after a group filter ends — used by group-sort changes so focus stays on the sort button. */
    val suppressGridFocus: Boolean = false,
    /** Sort order for the groups sidebar. */
    val groupSortKey: GroupSortKey = GroupSortKey.DEFAULT,
    val groupSortDir: GroupSortDir = GroupSortDir.ASC,
)

@HiltViewModel
class BrowseViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val sourceRepository: SourceRepository,
    private val playlistManager: PlaylistManager,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val epgRepository: EpgRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BrowseUiState())
    val uiState: StateFlow<BrowseUiState> = _uiState.asStateFlow()

    private var catalogGroups: List<ChannelGroup> = emptyList()
    private var loadedGroupChannels: List<Channel> = emptyList()
    /** Cached source ID so we can persist group order per-source. */
    private var currentSourceId: String? = null
    private var activeSource: Source? = null
    /** Custom group order loaded from DataStore (null = use playlist order). */
    private var customGroupOrder: List<String>? = null

    /**
     * Single ExoPlayer instance for the mini player, created lazily on first use
     * and released when the ViewModel is cleared (i.e. when the screen leaves the back stack).
     *
     * Why here and not in the composable:
     * - A player created with `remember {}` is re-created every time MiniPlayerRow
     *   re-enters composition (e.g. after a recomposition or config change).
     * - The ViewModel outlives recomposition, so the player survives D-pad navigation
     *   and screen re-draws without being torn down and rebuilt.
     */
    private var _miniPlayer: ExoPlayer? = null
    private val miniLivePlayback = LivePlaybackSession()
    private var miniPlayerListenerAttached = false

    /** User's Buffer Mode setting, read once at construction for the mini player's LoadControl. */
    private val bufferMode: PlayerBufferMode = runBlocking {
        settingsDataStore.settings.first().playerBufferMode
    }

    /** Returns the shared mini-player, creating it on first call. */
    fun getMiniPlayer(): ExoPlayer =
        _miniPlayer ?: ExoPlayerFactory.create(
            context = appContext,
            userAgent = activeSource?.userAgent,
            bufferMode = bufferMode,
        )
            .also { player ->
                _miniPlayer = player
                if (!miniPlayerListenerAttached) {
                    miniPlayerListenerAttached = true
                    player.addListener(
                        object : Player.Listener {
                            override fun onPlaybackStateChanged(playbackState: Int) {
                                if (playbackState == Player.STATE_READY) {
                                    miniLivePlayback.nextIfAvBroken(player)?.let { url ->
                                        player.setMediaItem(MediaItem.fromUri(url))
                                        player.prepare()
                                        player.playWhenReady = true
                                    }
                                }
                            }

                            override fun onPlayerError(error: PlaybackException) {
                                miniLivePlayback.nextOnError()?.let { url ->
                                    player.setMediaItem(MediaItem.fromUri(url))
                                    player.prepare()
                                    player.playWhenReady = true
                                }
                            }
                        },
                    )
                }
            }

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

            // Per-kind read: only deserializes the `live.json` slice from
            // the on-disk cache. Skips parsing the 60k-90k movies+series
            // entries we'd otherwise filter out anyway. Big win on cold
            // start: ~9k items vs ~85k.
            // Lazy index: categories only until the user picks a group.
            val liveStubs = playlistManager.getLiveGroupStubs()

            if (liveStubs == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Could not load channels.",
                )
                return@launch
            }

            val playlistGroups = liveStubs.filter { it.effectiveChannelCount() > 0 }

            val profile = profileRepository.getDefaultProfile()
            val favSet = profile.favorites.toSet()

            catalogGroups = playlistGroups
            currentSourceId = source.id
            activeSource = source

            customGroupOrder = settingsDataStore.getGroupOrder(source.id)

            val displayGroups = buildDisplayGroups(playlistGroups, favSet)

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

            // Load EPG in background (non-blocking)
            viewModelScope.launch {
                epgRepository.loadForSource(source)
                refreshNowNext()
            }
        }
    }

    private suspend fun buildDisplayGroups(
        groups: List<ChannelGroup>,
        favorites: Set<String>,
    ): List<ChannelGroup> {
        val result = mutableListOf<ChannelGroup>()

        val favChannels = favorites.mapNotNull { id ->
            playlistManager.findChannelById(id)
        }.filterIsInstance<Channel.Live>()
        if (favChannels.isNotEmpty()) {
            result.add(
                ChannelGroup(
                    id = "__favorites__",
                    name = "Favorites",
                    kind = GroupKind.mixed,
                    channels = favChannels,
                    channelCount = favChannels.size,
                )
            )
        }

        // "All Channels" virtual group is intentionally omitted — it
        // forces a flatten of every channel into a single huge list,
        // which is slow to render and not useful when groups already
        // organize the catalog.

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

        // Stop streaming the previous group's channel when the user actually
        // switches groups. The mini player reopens only when they pick a
        // channel from the new group — leaving it running would stream a
        // channel that's no longer in view, which is confusing.
        val newGroupId = groups[index].id
        val currentGroupId = groups.getOrNull(_uiState.value.selectedGroupIndex)?.id
        if (newGroupId != currentGroupId) {
            stopMiniPlayer()
            _uiState.value = _uiState.value.copy(playingChannel = null)
        }

        // Show spinner immediately, filter off main thread.
        _uiState.value = _uiState.value.copy(
            selectedGroupIndex = index,
            isFilteringGroup = true,
        )
        viewModelScope.launch {
            val group = groups[index]
            val query = _uiState.value.searchQuery
            val channels = channelsForGroup(group)
            loadedGroupChannels = channels
            val filtered = withContext(Dispatchers.Default) {
                filterChannels(channels, query)
            }
            delay(150)
            _uiState.value = _uiState.value.copy(
                channels = filtered,
                isFilteringGroup = false,
            )
        }
    }

    private suspend fun channelsForGroup(group: ChannelGroup): List<Channel> {
        if (group.id == "__favorites__" || group.channels.isNotEmpty()) {
            return group.channels
        }
        return playlistManager.loadLiveGroup(group.id)?.channels.orEmpty()
    }

    fun updateSearch(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        val filtered = filterChannels(loadedGroupChannels, query)
        _uiState.value = _uiState.value.copy(channels = filtered)
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
     * keeps focus on the sort button: it sets [BrowseUiState.suppressGridFocus]
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

    private fun filterChannels(channels: List<Channel>, query: String): List<Channel> {
        val filtered = if (query.isBlank()) channels
        else {
            val lower = query.lowercase()
            channels.filter { it.name.lowercase().contains(lower) }
        }
        return filtered.distinctBy { it.id }
    }

    fun toggleFavorite(channelId: String) {
        viewModelScope.launch {
            profileRepository.toggleFavorite(channelId)

            val current = _uiState.value.favorites.toMutableSet()
            if (channelId in current) current.remove(channelId) else current.add(channelId)

            // Rebuilding display groups can prepend/remove the __favorites__
            // virtual group, shifting every real group by one index. Track the
            // selection by id (same approach as recomputeFilteredGroups) so the
            // visible channel list doesn't jump to a different group.
            val state = _uiState.value
            val previouslySelectedId = state.filteredGroups
                .getOrNull(state.selectedGroupIndex)?.id

            val displayGroups = buildDisplayGroups(catalogGroups, current)
            val groupQuery = state.groupSearchQuery
            val filtered = if (groupQuery.isBlank()) {
                displayGroups
            } else {
                val lower = groupQuery.lowercase()
                displayGroups.filter {
                    it.id.startsWith("__") || it.name.lowercase().contains(lower)
                }
            }

            val newIndex = filtered.indexOfFirst { it.id == previouslySelectedId }

            if (newIndex >= 0) {
                // Same group stays selected — keep its channels, no reload/flicker.
                _uiState.value = state.copy(
                    favorites = current,
                    groups = displayGroups,
                    filteredGroups = filtered,
                    selectedGroupIndex = newIndex,
                )
            } else {
                // Selected group vanished (e.g. left the Favorites group by
                // removing its last channel) — fall back to the first group.
                _uiState.value = state.copy(
                    favorites = current,
                    groups = displayGroups,
                    filteredGroups = filtered,
                    selectedGroupIndex = 0,
                    channels = emptyList(),
                )
                selectGroup(0)
            }
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
        val url = miniLivePlayback.begin(channel, activeSource)
        getMiniPlayer().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
        viewModelScope.launch {
            profileRepository.addRecent(channel)
        }
    }

    /**
     * Pause the mini player without clearing the playing channel.
     * Use when navigating to fullscreen — the mini player row should remain
     * visible when the user returns, ready to resume.
     */
    fun pauseMiniPlayer() {
        _miniPlayer?.playWhenReady = false
    }

    /**
     * Resume the mini player after returning from fullscreen.
     * Re-prepares the player if it was stopped (clearMediaItems was called).
     * No-op if no channel is loaded.
     */
    fun resumeMiniPlayer() {
        val channel = _uiState.value.playingChannel ?: return
        val player = _miniPlayer ?: return
        if (player.mediaItemCount == 0) {
            val url = miniLivePlayback.begin(channel, activeSource)
            player.apply {
                setMediaItem(MediaItem.fromUri(url))
                prepare()
                playWhenReady = true
            }
        } else {
            player.playWhenReady = true
        }
    }

    /** Stop the mini player — call before navigating away.
     *  Releases decoder resources but keeps channel reference
     *  so mini player can resume on return from full-screen.
     */
    fun stopMiniPlayer() {
        _miniPlayer?.apply {
            stop()
            clearMediaItems()
        }
    }

    override fun onCleared() {
        super.onCleared()
        _miniPlayer?.release()
        _miniPlayer = null
    }

    // ── Group reorder ───────────────────────────────────────────

    /** Toggle group reorder mode. */
    fun toggleReorderMode() {
        val state = _uiState.value
        if (state.isReorderingGroups) {
            // Exiting → persist the edited order and turn reorder off.
            _uiState.value = state.copy(isReorderingGroups = false)
            saveGroupOrder()
        } else {
            // Entering → reset the sidebar to the full, custom-ordered list
            // (clear any search filter and force DEFAULT sort). Reordering only
            // makes sense on the canonical custom order; a size/name sort would
            // be immediately overridden on the next recompute, hiding the edits.
            val canonical = state.groups
            val selId = state.filteredGroups.getOrNull(state.selectedGroupIndex)?.id
            val newIdx = selId
                ?.let { id -> canonical.indexOfFirst { it.id == id } }
                ?.takeIf { it >= 0 }
                ?: state.selectedGroupIndex
            _uiState.value = state.copy(
                isReorderingGroups = true,
                groupSearchQuery = "",
                groupSortKey = GroupSortKey.DEFAULT,
                groupSortDir = GroupSortDir.ASC,
                filteredGroups = canonical,
                selectedGroupIndex = newIdx,
            )
        }
    }

    /**
     * Move the currently selected group up or down.
     * Only real groups can be moved — virtual groups (__favorites__) are
     * pinned and cannot be reordered.
     *
     * @param direction -1 = move up, +1 = move down
     */
    fun moveGroup(direction: Int) {
        val state = _uiState.value
        if (!state.isReorderingGroups) return

        // Swap in the DISPLAYED list (filteredGroups) — this is what the sidebar
        // renders, so the move is immediately visible. Previously this swapped
        // the canonical `groups` list which the sidebar never shows, making every
        // reorder invisible until the screen was reloaded.
        val displayed = state.filteredGroups.toMutableList()
        val idx = state.selectedGroupIndex

        // Virtual groups (id starts with "__") are pinned at the top.
        val pinnedCount = displayed.count { it.id.startsWith("__") }
        if (idx < pinnedCount) return

        val targetIdx = idx + direction
        if (targetIdx < pinnedCount || targetIdx >= displayed.size) return

        java.util.Collections.swap(displayed, idx, targetIdx)

        // Keep canonical `groups` in sync when the sidebar shows the full list
        // (no search filter), so a later re-sort/filter won't discard the edit.
        val syncedGroups =
            if (state.groupSearchQuery.isBlank()) displayed.toList() else state.groups

        _uiState.value = state.copy(
            filteredGroups = displayed,
            groups = syncedGroups,
            selectedGroupIndex = targetIdx,
        )
    }

    private fun saveGroupOrder() {
        val sourceId = currentSourceId ?: return
        // Persist the DISPLAYED (edited) order, skipping virtual groups.
        val realGroupIds = _uiState.value.filteredGroups
            .filter { !it.id.startsWith("__") }
            .map { it.id }

        // Also update the in-memory cache so future buildDisplayGroups calls use it
        customGroupOrder = realGroupIds

        viewModelScope.launch {
            settingsDataStore.setGroupOrder(sourceId, realGroupIds)
        }
    }
}
