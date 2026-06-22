package com.iptvtavern.androidtv.ui.series

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupSortKey
import com.iptvtavern.androidtv.domain.model.GroupSortDir
import com.iptvtavern.androidtv.domain.model.SeriesEpisode
import com.iptvtavern.androidtv.domain.model.SeriesSeason
import com.iptvtavern.androidtv.ui.common.LoadingOverlay
import com.iptvtavern.androidtv.ui.navigation.LocalNavBarFocusRequester
import com.iptvtavern.androidtv.ui.onboarding.TvSearchButton
import com.iptvtavern.androidtv.ui.settings.ButtonSize
import com.iptvtavern.androidtv.ui.settings.ButtonVariant
import com.iptvtavern.androidtv.ui.settings.FocusableButton
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Series Browse screen — poster grid + detail hero with season tabs & episode list.
 *
 * Layout:
 * ┌──────────────────────────────────────────────┐
 * │  [Top Tab Bar]                               │
 * ├────────────┬─────────────────────────────────┤
 * │            │  [Detail Hero - backdrop+info]   │
 * │  Groups    │  [S1] [S2] [S3]  ← season tabs  │
 * │  Sidebar   │  Episode 1 — 45m                │
 * │            │  Episode 2 — 42m  ← episode list │
 * │            ├─────────────────────────────────┤
 * │            │  [Search]                        │
 * │            │  [Poster Grid]                  │
 * ├────────────┴─────────────────────────────────┤
 * │  🟡 Favorite  🔵 Play Episode  OK Select      │
 * └──────────────────────────────────────────────┘
 */
@Composable
fun SeriesBrowseScreen(
    onNavigateToPlayer: (channelId: String) -> Unit = {},
    viewModel: SeriesBrowseViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val gridFocusRequester = remember { FocusRequester() }
    val sidebarFocusRequester = remember { FocusRequester() }
    val navBarFocusRequester = LocalNavBarFocusRequester.current
    var lastFocusedPosterIndex by remember { mutableStateOf(0) }
    val posterFocusRequester = remember { FocusRequester() }
    val gridState = rememberLazyGridState()

    // Detail modal state
    var showDetailModal by remember { mutableStateOf(false) }
    val modalFocusRequester = remember { FocusRequester() }

    fun dismissModal() {
        showDetailModal = false
        scope.launch {
            delay(100)
            try { posterFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    BackHandler(enabled = showDetailModal) {
        dismissModal()
    }

    // On first render, steer focus to first poster.
    var initialFocusDone by remember { mutableStateOf(false) }
    LaunchedEffect(uiState.channels.isNotEmpty()) {
        if (uiState.channels.isNotEmpty() && !initialFocusDone) {
            delay(100)
            initialFocusDone = true
            delay(50)
            try { gridFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    var hasStartedFiltering by remember { mutableStateOf(false) }
    if (uiState.isFilteringGroup) {
        hasStartedFiltering = true
        lastFocusedPosterIndex = 0
    }

    LaunchedEffect(uiState.isFilteringGroup) {
        if (!uiState.isFilteringGroup && hasStartedFiltering && uiState.channels.isNotEmpty()) {
            hasStartedFiltering = false
            gridState.scrollToItem(0)
            delay(100)
            try { gridFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    // Focus the first season tab when modal appears
    LaunchedEffect(showDetailModal) {
        if (showDetailModal) {
            delay(150)
            try { modalFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    if (uiState.isLoading) {
        Box(
            modifier = Modifier.fillMaxSize().background(colors.background),
            contentAlignment = Alignment.Center,
        ) {
            Text("Loading series…", color = colors.foregroundMuted, fontSize = 18.sp)
        }
        return
    }

    if (uiState.error != null) {
        Box(
            modifier = Modifier.fillMaxSize().background(colors.background).padding(32.dp),
        ) {
            Text(uiState.error!!, color = colors.danger, fontSize = 18.sp)
        }
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
    Column(
        modifier = Modifier.fillMaxSize().background(colors.background),
    ) {
        Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
            // Left sidebar — category groups
            SeriesGroupsSidebar(
                groups = uiState.filteredGroups,
                selectedIndex = uiState.selectedGroupIndex,
                onGroupSelected = viewModel::selectGroup,
                groupSearchQuery = uiState.groupSearchQuery,
                onGroupSearchChanged = viewModel::updateGroupSearch,
                groupSortKey = uiState.groupSortKey,
                onGroupSortKeyChanged = viewModel::setGroupSortKey,
                groupSortDir = uiState.groupSortDir,
                onGroupSortDirChanged = viewModel::setGroupSortDir,
                onJumpToGrid = {
                    scope.launch {
                        delay(100)
                        try { gridFocusRequester.requestFocus() } catch (_: Throwable) {}
                    }
                },
                selectedGroupFocusRequester = sidebarFocusRequester,
                modifier = Modifier.width(200.dp).fillMaxHeight(),
            )

            // Right area — search + grid (no hero)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = 8.dp, end = 16.dp, top = 8.dp),
            ) {
                // Search toolbar
                SeriesToolbar(
                    searchQuery = uiState.searchQuery,
                    onSearchChanged = viewModel::updateSearch,
                    channelCount = uiState.channels.size,
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Poster grid — full vertical space
                Box(modifier = Modifier.weight(1f)) {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 120.dp),
                        state = gridState,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 48.dp),
                    ) {
                        itemsIndexed(uiState.channels, key = { _, ch -> ch.id }) { index, channel ->
                            SeriesPosterTile(
                                channel = channel,
                                isSelected = channel.id == uiState.selectedChannel?.id,
                                isFavorite = channel.id in uiState.favorites,
                                onSelect = {
                                    viewModel.highlightChannel(channel)
                                    lastFocusedPosterIndex = index
                                    showDetailModal = true
                                },
                                onToggleFavorite = { viewModel.toggleFavorite(channel.id) },
                                onFocused = { lastFocusedPosterIndex = index },
                                modifier = when {
                                    index == 0 && lastFocusedPosterIndex == 0 ->
                                        Modifier
                                            .focusRequester(gridFocusRequester)
                                            .focusRequester(posterFocusRequester)
                                    index == 0 -> Modifier.focusRequester(gridFocusRequester)
                                    index == lastFocusedPosterIndex -> Modifier.focusRequester(posterFocusRequester)
                                    else -> Modifier
                                },
                            )
                        }
                    }

                    if (uiState.isFilteringGroup) {
                        LoadingOverlay()
                    }
                }
            }
        }

        // Bottom guideline bar
        SeriesBottomBar()
    }

    // Opaque overlay to hide initial focus jump
    if (!initialFocusDone && uiState.channels.isNotEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().background(colors.background),
            contentAlignment = Alignment.Center,
        ) {
            Text("Loading series…", color = colors.foregroundMuted, fontSize = 18.sp)
        }
    }

    // Detail modal overlay
    AnimatedVisibility(
        visible = showDetailModal && uiState.detailChannel != null,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        SeriesDetailModal(
            channel = uiState.detailChannel,
            isLoading = uiState.detailLoading,
            isFavorite = uiState.detailChannel?.id?.let { it in uiState.favorites } == true,
            seasons = uiState.detailChannel?.seasons.orEmpty(),
            selectedSeasonIndex = uiState.selectedSeasonIndex,
            episodes = uiState.episodes,
            watchedEpisodeIds = uiState.watchedEpisodeIds,
            onSelectSeason = viewModel::selectSeason,
            onPlayEpisode = { episode ->
                val seriesId = uiState.detailChannel?.id ?: return@SeriesDetailModal
                onNavigateToPlayer("${seriesId}:ep:${episode.id}")
            },
            onToggleFavorite = {
                uiState.detailChannel?.let { viewModel.toggleFavorite(it.id) }
            },
            onDismiss = ::dismissModal,
            modalFocusRequester = modalFocusRequester,
        )
    }
    } // end outer Box
}

// ── Detail Modal with Season Tabs + Episode List ────────────────

/**
 * Full-screen modal overlay with series details, season tabs, and episode list.
 * Shown when user presses OK on a poster tile.
 * Back button dismisses and returns focus to the grid.
 */
@Composable
private fun SeriesDetailModal(
    channel: Channel.Series?,
    isLoading: Boolean,
    isFavorite: Boolean,
    seasons: List<SeriesSeason>,
    selectedSeasonIndex: Int,
    episodes: List<SeriesEpisode>,
    watchedEpisodeIds: Set<String>,
    onSelectSeason: (Int) -> Unit,
    onPlayEpisode: (SeriesEpisode) -> Unit,
    onToggleFavorite: () -> Unit,
    onDismiss: () -> Unit,
    modalFocusRequester: FocusRequester = remember { FocusRequester() },
) {
    val colors = LuminaTheme.colors
    if (channel == null) return

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xEE000000)),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .fillMaxHeight(0.85f)
                .clip(RoundedCornerShape(16.dp))
                .background(colors.surface)
                .padding(24.dp),
        ) {
            // Left: poster
            AsyncImage(
                model = channel.posterUrl ?: channel.logoUrl,
                contentDescription = channel.name,
                modifier = Modifier
                    .fillMaxHeight()
                    .aspectRatio(2f / 3f)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop,
            )

            Spacer(modifier = Modifier.width(24.dp))

            // Right: info + seasons + episodes
            Column(
                modifier = Modifier.weight(1f).fillMaxHeight(),
            ) {
                // Title + meta
                Text(
                    text = channel.name,
                    color = colors.foreground,
                    fontSize = 24.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                val metaParts = mutableListOf<String>()
                channel.releaseYear?.let { metaParts.add("$it") }
                channel.rating?.let { r ->
                    if (r > 0) metaParts.add("${"%.1f".format(r)} ★")
                }
                if (seasons.isNotEmpty()) {
                    metaParts.add("${seasons.size} season${if (seasons.size != 1) "s" else ""}")
                }
                if (metaParts.isNotEmpty()) {
                    Text(
                        text = metaParts.joinToString(" · "),
                        color = colors.foregroundMuted,
                        fontSize = 14.sp,
                    )
                }

                channel.genre?.let { g ->
                    Text(text = g, color = colors.foregroundMuted, fontSize = 13.sp, maxLines = 1)
                }

                Spacer(modifier = Modifier.height(8.dp))

                channel.plot?.let { p ->
                    Text(
                        text = p,
                        color = colors.foregroundMuted,
                        fontSize = 13.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                if (isFavorite) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = "★ Favorite", color = colors.danger, fontSize = 13.sp)
                }

                if (isLoading) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = "Loading details…", color = colors.foregroundMuted, fontSize = 12.sp)
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Season tabs
                if (seasons.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        seasons.forEachIndexed { index, season ->
                            var isFocused by remember { mutableStateOf(false) }
                            val isSelected = index == selectedSeasonIndex
                            val label = season.name ?: "Season ${season.seasonNumber}"

                            Box(
                                modifier = Modifier
                                    .then(
                                        if (index == 0) Modifier.focusRequester(modalFocusRequester) else Modifier
                                    )
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(
                                        when {
                                            isFocused -> colors.accent
                                            isSelected -> colors.surfaceRaised
                                            else -> Color.Transparent
                                        }
                                    )
                                    .border(
                                        width = if (isSelected && !isFocused) 1.dp else 0.dp,
                                        color = if (isSelected && !isFocused) colors.border else Color.Transparent,
                                        shape = RoundedCornerShape(6.dp),
                                    )
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                                    .onFocusChanged {
                                        isFocused = it.isFocused
                                        if (it.isFocused) onSelectSeason(index)
                                    }
                                    .focusable(),
                            ) {
                                Text(
                                    text = label,
                                    color = when {
                                        isFocused -> colors.accentForeground
                                        isSelected -> colors.foreground
                                        else -> colors.foregroundMuted
                                    },
                                    fontSize = 13.sp,
                                )
                            }
                        }
                    }

                    // Episode list
                    if (episodes.isNotEmpty()) {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .padding(top = 4.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                            contentPadding = PaddingValues(vertical = 4.dp),
                        ) {
                            itemsIndexed(episodes, key = { _, ep -> ep.id }) { _, episode ->
                                var isFocused by remember { mutableStateOf(false) }
                                val isWatched = "${channel.id}:ep:${episode.id}" in watchedEpisodeIds
                                val durationText = episode.durationSeconds?.let { secs ->
                                    val mins = secs / 60
                                    if (mins > 0) "${mins}m" else null
                                }

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (isFocused) colors.accent else Color.Transparent)
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                        .onFocusChanged { isFocused = it.isFocused }
                                        .onKeyEvent { event ->
                                            if (event.type == KeyEventType.KeyDown &&
                                                (event.key == Key.DirectionCenter ||
                                                    event.key == Key.Enter ||
                                                    event.key == Key(android.view.KeyEvent.KEYCODE_PROG_BLUE.toLong()) ||
                                                    event.key == Key.B)
                                            ) {
                                                onPlayEpisode(episode)
                                                true
                                            } else false
                                        }
                                        .focusable(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = "E${episode.episodeNumber}",
                                            color = if (isFocused) colors.accentForeground else colors.foregroundMuted,
                                            fontSize = 12.sp,
                                        )
                                        if (isWatched) {
                                            Text(
                                                text = "✓",
                                                color = if (isFocused) colors.accentForeground else colors.accent,
                                                fontSize = 12.sp,
                                            )
                                        }
                                        Text(
                                            text = episode.title,
                                            color = if (isFocused) colors.accentForeground else colors.foreground,
                                            fontSize = 13.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    durationText?.let {
                                        Text(
                                            text = it,
                                            color = if (isFocused) colors.accentForeground else colors.foregroundMuted,
                                            fontSize = 12.sp,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.weight(if (seasons.isEmpty() || episodes.isEmpty()) 1f else 0.01f))

                // Bottom actions
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    // If no season tabs, put focus requester on the favorite button
                    val favModifier = if (seasons.isEmpty()) Modifier.focusRequester(modalFocusRequester) else Modifier

                    FocusableButton(
                        text = if (isFavorite) "★ Unfavorite" else "☆ Favorite",
                        onClick = onToggleFavorite,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                        modifier = favModifier,
                    )

                    FocusableButton(
                        text = "Close",
                        onClick = onDismiss,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                    )
                }
            }
        }
    }
}

// ── Toolbar ─────────────────────────────────────────────────────

@Composable
private fun SeriesToolbar(
    searchQuery: String,
    onSearchChanged: (String) -> Unit,
    channelCount: Int,
) {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TvSearchButton(
            value = searchQuery,
            onValueChange = onSearchChanged,
            placeholder = "Search series…",
            imeAction = ImeAction.Search,
            modifier = Modifier.weight(1f),
        )

        Text(
            text = "$channelCount series",
            color = colors.foregroundMuted,
            fontSize = 12.sp,
        )
    }
}

// ── Poster Tile ─────────────────────────────────────────────────

@Composable
private fun SeriesPosterTile(
    channel: Channel.Series,
    isSelected: Boolean,
    isFavorite: Boolean,
    onSelect: () -> Unit,
    onToggleFavorite: () -> Unit,
    onFocused: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    val borderColor = when {
        isSelected -> colors.accent
        isFocused -> colors.accent
        else -> Color.Transparent
    }

    Box(
        modifier = modifier
            .aspectRatio(2f / 3f)
            .clip(RoundedCornerShape(8.dp))
            .border(
                width = if (isFocused || isSelected) 3.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged {
                isFocused = it.isFocused
                if (it.isFocused) onFocused()
            }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when {
                        event.key == Key.DirectionCenter || event.key == Key.Enter -> {
                            onSelect()
                            true
                        }
                        // Yellow = favorite
                        event.key == Key(android.view.KeyEvent.KEYCODE_PROG_YELLOW.toLong()) ||
                        event.key == Key.F -> {
                            onToggleFavorite()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .focusable(),
    ) {
        // Poster image
        AsyncImage(
            model = channel.posterUrl ?: channel.logoUrl,
            contentDescription = channel.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )

        // Bottom gradient + title
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color(0xDD000000)),
                    )
                )
                .padding(horizontal = 8.dp, vertical = 6.dp),
        ) {
            // Season count badge
            channel.seasons.takeIf { it.isNotEmpty() }?.let {
                Text(
                    text = "${it.size}S",
                    color = Color(0xCCFFFFFF),
                    fontSize = 10.sp,
                )
            }
            Text(
                text = channel.name,
                color = Color.White,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // Favorite star
        if (isFavorite) {
            Text(
                text = "★",
                color = colors.danger,
                fontSize = 16.sp,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp),
            )
        }
    }
}

// ── Groups Sidebar ──────────────────────────────────────────────

@Composable
private fun SeriesGroupsSidebar(
    groups: List<ChannelGroup>,
    selectedIndex: Int,
    onGroupSelected: (Int) -> Unit,
    groupSearchQuery: String,
    onGroupSearchChanged: (String) -> Unit,
    groupSortKey: GroupSortKey,
    onGroupSortKeyChanged: (GroupSortKey) -> Unit,
    groupSortDir: GroupSortDir,
    onGroupSortDirChanged: (GroupSortDir) -> Unit,
    onJumpToGrid: () -> Unit,
    selectedGroupFocusRequester: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    val navBarFocusRequester = LocalNavBarFocusRequester.current

    Column(modifier = modifier
        .background(colors.surface)
        .onPreviewKeyEvent { event ->
            if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft) {
                try { navBarFocusRequester.requestFocus() } catch (_: Throwable) {}
                true
            } else false
        },
    ) {
        // Group search + sort
        Row(
            modifier = Modifier.padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvSearchButton(
                value = groupSearchQuery,
                onValueChange = onGroupSearchChanged,
                placeholder = "Filter categories…",
                modifier = Modifier.weight(1f),
            )

            // Sort button — Enter cycles: Default → A-Z↑ → A-Z↓ → Size↑ → Size↓ → Default
            val sortLabel = when (groupSortKey) {
                GroupSortKey.DEFAULT -> "Default"
                GroupSortKey.NAME -> if (groupSortDir == GroupSortDir.ASC) "A-Z ↑" else "A-Z ↓"
                GroupSortKey.SIZE -> if (groupSortDir == GroupSortDir.ASC) "Size ↑" else "Size ↓"
            }
            var sortFocused by remember { mutableStateOf(false) }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (sortFocused) colors.accent else colors.surface)
                    .border(
                        width = if (sortFocused) 2.dp else 1.dp,
                        color = if (sortFocused) colors.accent else colors.border,
                        shape = RoundedCornerShape(6.dp),
                    )
                    .padding(horizontal = 8.dp, vertical = 8.dp)
                    .onFocusChanged { sortFocused = it.isFocused }
                    .onKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown &&
                            (event.key == Key.DirectionCenter || event.key == Key.Enter)
                        ) {
                            when {
                                groupSortKey == GroupSortKey.DEFAULT -> {
                                    onGroupSortKeyChanged(GroupSortKey.NAME)
                                    onGroupSortDirChanged(GroupSortDir.ASC)
                                }
                                groupSortKey == GroupSortKey.NAME && groupSortDir == GroupSortDir.ASC -> {
                                    onGroupSortDirChanged(GroupSortDir.DESC)
                                }
                                groupSortKey == GroupSortKey.NAME && groupSortDir == GroupSortDir.DESC -> {
                                    onGroupSortKeyChanged(GroupSortKey.SIZE)
                                    onGroupSortDirChanged(GroupSortDir.ASC)
                                }
                                groupSortKey == GroupSortKey.SIZE && groupSortDir == GroupSortDir.ASC -> {
                                    onGroupSortDirChanged(GroupSortDir.DESC)
                                }
                                else -> {
                                    onGroupSortKeyChanged(GroupSortKey.DEFAULT)
                                    onGroupSortDirChanged(GroupSortDir.ASC)
                                }
                            }
                            true
                        } else false
                    }
                    .focusable(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = sortLabel,
                    color = if (sortFocused) colors.foreground else colors.foregroundMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }
        }

        LazyColumn(
            modifier = Modifier.weight(1f).padding(6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            itemsIndexed(groups, key = { _, g -> g.id }) { index, group ->
                val isSelected = index == selectedIndex
                var isFocused by remember { mutableStateOf(false) }
                val isFavGroup = group.id == "__favorites__"

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            when {
                                isFocused -> colors.accent
                                isSelected -> colors.surfaceRaised
                                else -> colors.surface
                            }
                        )
                        .then(
                            if (isSelected && !isFocused) {
                                // Loaded-group marker — see BrowseScreen for details.
                                Modifier.border(2.dp, colors.accent, RoundedCornerShape(6.dp))
                            } else Modifier
                        )
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                        .then(
                            if (isSelected) Modifier.focusRequester(selectedGroupFocusRequester)
                            else Modifier
                        )
                        .onFocusChanged {
                            isFocused = it.isFocused
                            // Lazy load: only update grid on OK/Enter.
                        }
                        .onKeyEvent { event ->
                            if (event.type == KeyEventType.KeyDown) {
                                when (event.key) {
                                    Key.DirectionCenter, Key.Enter -> {
                                        onGroupSelected(index)
                                        onJumpToGrid()
                                        true
                                    }
                                    Key.DirectionRight -> {
                                        onJumpToGrid()
                                        true
                                    }
                                    else -> false
                                }
                            } else false
                        }
                        .focusable(),
                ) {
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (isFavGroup) {
                                Text(
                                    text = "♥",
                                    color = if (isFocused) colors.accentForeground else colors.danger,
                                    fontSize = 14.sp,
                                )
                            }
                            Text(
                                text = group.name,
                                color = if (isFocused) colors.accentForeground else colors.foreground,
                                fontSize = 13.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            text = "${group.effectiveChannelCount()}",
                            color = if (isFocused) colors.accentForeground else colors.foregroundMuted,
                            fontSize = 11.sp,
                        )
                    }
                }
            }
        }
    }
}

// ── Bottom Bar ──────────────────────────────────────────────────

@Composable
private fun SeriesBottomBar() {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(horizontal = 24.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Yellow = Favorite
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(modifier = Modifier.size(14.dp).background(Color(0xFFEAB308), CircleShape))
            Text("Favorite", color = colors.foreground, fontSize = 12.sp)
        }
        // Blue = Play Episode
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(modifier = Modifier.size(14.dp).background(Color(0xFF2563EB), CircleShape))
            Text("Play Episode", color = colors.foreground, fontSize = 12.sp)
        }
        // OK = Select
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "OK",
                color = colors.accentForeground,
                fontSize = 10.sp,
                modifier = Modifier
                    .background(colors.accent, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
            Text("Select", color = colors.foreground, fontSize = 12.sp)
        }
    }
}
