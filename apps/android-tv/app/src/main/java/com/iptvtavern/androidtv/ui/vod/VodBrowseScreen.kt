package com.iptvtavern.androidtv.ui.vod

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
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
import com.iptvtavern.androidtv.domain.parser.VodSortDir
import com.iptvtavern.androidtv.domain.parser.VodSortKey
import com.iptvtavern.androidtv.domain.parser.formatVodDuration
import com.iptvtavern.androidtv.domain.parser.getVodPosterBadge
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
 * VOD Browse screen — poster grid with detail hero.
 *
 * Layout:
 * ┌──────────────────────────────────────────────┐
 * │  [Top Tab Bar]                               │
 * ├────────────┬─────────────────────────────────┤
 * │            │  [Detail Hero - backdrop+info]   │
 * │  Groups    ├─────────────────────────────────┤
 * │  Sidebar   │  [Search] [Sort: ▼]             │
 * │            │  [Poster Grid]                  │
 * │            │   ┌──┐ ┌──┐ ┌──┐ ┌──┐          │
 * │            │   │  │ │  │ │  │ │  │          │
 * │            │   └──┘ └──┘ └──┘ └──┘          │
 * ├────────────┴─────────────────────────────────┤
 * │  🟡 Favorite  🔵 Play  OK Select             │
 * └──────────────────────────────────────────────┘
 */
@Composable
fun VodBrowseScreen(
    onNavigateToPlayer: (channelId: String) -> Unit = {},
    viewModel: VodBrowseViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val gridFocusRequester = remember { FocusRequester() }
    val sidebarFocusRequester = remember { FocusRequester() }
    val navBarFocusRequester = LocalNavBarFocusRequester.current

    // Track the last focused poster index so we can restore focus after modal close.
    var lastFocusedPosterIndex by remember { mutableStateOf(0) }
    val posterFocusRequester = remember { FocusRequester() }
    val gridState = rememberLazyGridState()

    // Detail modal state
    var showDetailModal by remember { mutableStateOf(false) }
    val modalWatchFocusRequester = remember { FocusRequester() }

    // Dismiss detail modal and return focus to the poster
    fun dismissModal() {
        showDetailModal = false
        scope.launch {
            delay(100)
            try { posterFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    // BackHandler: close modal first, then default back behavior
    BackHandler(enabled = showDetailModal) {
        dismissModal()
    }

    // On first render, steer focus to the first poster.
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

    // After group filtering finishes, scroll to top and focus first item.
    LaunchedEffect(uiState.isFilteringGroup) {
        if (!uiState.isFilteringGroup && hasStartedFiltering && uiState.channels.isNotEmpty()) {
            hasStartedFiltering = false
            gridState.scrollToItem(0)
            delay(100)
            try { gridFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    // Focus the Watch button when modal appears
    LaunchedEffect(showDetailModal) {
        if (showDetailModal) {
            delay(150)
            try { modalWatchFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    if (uiState.isLoading) {
        Box(
            modifier = Modifier.fillMaxSize().background(colors.background),
            contentAlignment = Alignment.Center,
        ) {
            Text("Loading movies…", color = colors.foregroundMuted, fontSize = 18.sp)
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
            VodGroupsSidebar(
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

            // Right area — toolbar + grid (no hero)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = 8.dp, end = 16.dp, top = 8.dp),
            ) {
                // Toolbar: search + sort
                VodToolbar(
                    searchQuery = uiState.searchQuery,
                    onSearchChanged = viewModel::updateSearch,
                    sortKey = uiState.sortKey,
                    onSortKeyChanged = viewModel::setSortKey,
                    sortDir = uiState.sortDir,
                    onSortDirChanged = viewModel::setSortDir,
                    channelCount = uiState.channels.size,
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Poster grid — now gets full vertical space
                Box(modifier = Modifier.weight(1f)) {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 120.dp),
                        state = gridState,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 48.dp),
                    ) {
                        itemsIndexed(uiState.channels, key = { _, ch -> ch.id }) { index, channel ->
                            VodPosterTile(
                                channel = channel,
                                isSelected = channel.id == uiState.selectedChannel?.id,
                                isFavorite = channel.id in uiState.favorites,
                                onSelect = {
                                    viewModel.highlightChannel(channel)
                                    lastFocusedPosterIndex = index
                                    showDetailModal = true
                                },
                                onPlay = { onNavigateToPlayer(channel.id) },
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
        VodBottomBar()
    }

    // Opaque overlay that hides the initial focus jump
    if (!initialFocusDone && uiState.channels.isNotEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().background(colors.background),
            contentAlignment = Alignment.Center,
        ) {
            Text("Loading movies…", color = colors.foregroundMuted, fontSize = 18.sp)
        }
    }

    // Detail modal overlay
    AnimatedVisibility(
        visible = showDetailModal && uiState.detailChannel != null,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        VodDetailModal(
            channel = uiState.detailChannel,
            isLoading = uiState.detailLoading,
            isFavorite = uiState.detailChannel?.id?.let { it in uiState.favorites } == true,
            onPlay = {
                uiState.detailChannel?.let { onNavigateToPlayer(it.id) }
            },
            onPlayTrailer = {
                uiState.detailChannel?.trailerUrl?.let { url ->
                    // TODO: open trailer URL
                }
            },
            onToggleFavorite = {
                uiState.detailChannel?.let { viewModel.toggleFavorite(it.id) }
            },
            onDismiss = ::dismissModal,
            watchButtonFocusRequester = modalWatchFocusRequester,
        )
    }
    } // end outer Box
}

// ── Detail Modal ────────────────────────────────────────────────

/**
 * Full-screen modal overlay with movie details.
 * Shown when user presses OK on a poster tile.
 * Back button dismisses and returns focus to the grid.
 */
@Composable
private fun VodDetailModal(
    channel: Channel.Vod?,
    isLoading: Boolean,
    isFavorite: Boolean,
    onPlay: () -> Unit,
    onPlayTrailer: () -> Unit,
    onToggleFavorite: () -> Unit,
    onDismiss: () -> Unit,
    watchButtonFocusRequester: FocusRequester = remember { FocusRequester() },
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
                .fillMaxWidth(0.8f)
                .fillMaxHeight(0.75f)
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

            // Right: info + actions
            Column(
                modifier = Modifier.weight(1f).fillMaxHeight(),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(
                        text = channel.name,
                        color = colors.foreground,
                        fontSize = 24.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Meta line: year · rating · duration
                    val metaParts = mutableListOf<String>()
                    channel.year?.let { metaParts.add("$it") }
                    channel.rating?.let { r ->
                        if (r > 0) metaParts.add("${"%.1f".format(r)} ★")
                    }
                    formatVodDuration(channel.durationSeconds)?.let { metaParts.add(it) }
                    if (metaParts.isNotEmpty()) {
                        Text(
                            text = metaParts.joinToString(" · "),
                            color = colors.foregroundMuted,
                            fontSize = 14.sp,
                        )
                    }

                    channel.genre?.let { g ->
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = g,
                            color = colors.foregroundMuted,
                            fontSize = 13.sp,
                            maxLines = 1,
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Plot
                    channel.plot?.let { p ->
                        Text(
                            text = p,
                            color = colors.foregroundMuted,
                            fontSize = 14.sp,
                            maxLines = 6,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Director / Cast
                    channel.director?.let { d ->
                        Text(
                            text = "Director: $d",
                            color = colors.foregroundMuted,
                            fontSize = 12.sp,
                            maxLines = 1,
                        )
                    }
                    channel.cast?.let { c ->
                        Text(
                            text = "Cast: $c",
                            color = colors.foregroundMuted,
                            fontSize = 12.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    if (isFavorite) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "★ Favorite",
                            color = colors.danger,
                            fontSize = 13.sp,
                        )
                    }

                    if (isLoading) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Loading details…",
                            color = colors.foregroundMuted,
                            fontSize = 12.sp,
                        )
                    }
                }

                // Action buttons at bottom
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FocusableButton(
                        text = "▶ Watch",
                        onClick = onPlay,
                        variant = ButtonVariant.Primary,
                        size = ButtonSize.Small,
                        modifier = Modifier.focusRequester(watchButtonFocusRequester),
                    )

                    if (channel.trailerUrl != null) {
                        FocusableButton(
                            text = "Trailer",
                            onClick = onPlayTrailer,
                            variant = ButtonVariant.Secondary,
                            size = ButtonSize.Small,
                        )
                    }

                    FocusableButton(
                        text = if (isFavorite) "★ Unfavorite" else "☆ Favorite",
                        onClick = onToggleFavorite,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
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
private fun VodToolbar(
    searchQuery: String,
    onSearchChanged: (String) -> Unit,
    sortKey: VodSortKey,
    onSortKeyChanged: (VodSortKey) -> Unit,
    sortDir: VodSortDir,
    onSortDirChanged: (VodSortDir) -> Unit,
    channelCount: Int,
) {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Search
        TvSearchButton(
            value = searchQuery,
            onValueChange = onSearchChanged,
            placeholder = "Search movies…",
            imeAction = ImeAction.Search,
            modifier = Modifier.weight(1f),
        )

        // Sort key selector (cycles through options with Enter)
        val sortLabel = when (sortKey) {
            VodSortKey.DEFAULT -> "Default"
            VodSortKey.NAME -> "Name"
            VodSortKey.YEAR -> "Year"
            VodSortKey.RATING -> "Rating"
            VodSortKey.DURATION -> "Duration"
            VodSortKey.DIRECTOR -> "Director"
            VodSortKey.ADDED -> "Added"
        }
        val dirArrow = if (sortDir == VodSortDir.ASC) "↑" else "↓"

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
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .onFocusChanged { sortFocused = it.isFocused }
                .onKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown) {
                        when (event.key) {
                            Key.DirectionCenter, Key.Enter -> {
                                // Cycle sort key
                                val keys = VodSortKey.entries
                                val next = keys[(sortKey.ordinal + 1) % keys.size]
                                onSortKeyChanged(next)
                                true
                            }
                            Key.DirectionLeft, Key.DirectionRight -> {
                                // Toggle direction
                                val next = if (sortDir == VodSortDir.ASC) VodSortDir.DESC else VodSortDir.ASC
                                onSortDirChanged(next)
                                true
                            }
                            // Up/Down NOT intercepted — let focus move to
                            // hero/header (Up) or grid (Down) naturally.
                            else -> false
                        }
                    } else false
                }
                .focusable(),
        ) {
            Text(
                text = "Sort: $sortLabel $dirArrow",
                color = if (sortFocused) colors.accentForeground else colors.foreground,
                fontSize = 13.sp,
            )
        }

        // Count
        Text(
            text = "$channelCount movies",
            color = colors.foregroundMuted,
            fontSize = 12.sp,
        )
    }
}

// ── Poster Tile ─────────────────────────────────────────────────

@Composable
private fun VodPosterTile(
    channel: Channel.Vod,
    isSelected: Boolean,
    isFavorite: Boolean,
    onSelect: () -> Unit,
    onPlay: () -> Unit,
    onToggleFavorite: () -> Unit,
    onFocused: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val badge = remember(channel) { getVodPosterBadge(channel) }

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
                        // Blue = play
                        event.key == Key(android.view.KeyEvent.KEYCODE_PROG_BLUE.toLong()) ||
                        event.key == Key.B -> {
                            onPlay()
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

        // Bottom gradient + info
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
            // Badge
            badge?.let { b ->
                Text(
                    text = b,
                    color = Color(0xCCFFFFFF),
                    fontSize = 10.sp,
                    maxLines = 1,
                )
            }
            // Title
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
private fun VodGroupsSidebar(
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
                            // Cycle: DEFAULT → NAME/ASC → NAME/DESC → SIZE/ASC → SIZE/DESC → DEFAULT
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
private fun VodBottomBar() {
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
        // Blue = Play
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(modifier = Modifier.size(14.dp).background(Color(0xFF2563EB), CircleShape))
            Text("Play", color = colors.foreground, fontSize = 12.sp)
        }
        // OK = Select / Show details
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
