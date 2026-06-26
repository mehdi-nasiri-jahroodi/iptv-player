package com.iptvtavern.androidtv.ui.browse

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupSortKey
import com.iptvtavern.androidtv.domain.model.GroupSortDir
import com.iptvtavern.androidtv.domain.parser.EpgParser
import com.iptvtavern.androidtv.domain.parser.inferStreamQualityHints
import com.iptvtavern.androidtv.ui.common.LoadingOverlay
import com.iptvtavern.androidtv.ui.navigation.LocalNavBarFocusRequester
import com.iptvtavern.androidtv.ui.onboarding.TvSearchButton
import com.iptvtavern.androidtv.ui.onboarding.TvTextField
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Browse screen — shows channels by group with inline mini player.
 *
 * Layout:
 * ┌──────────────────────────────────────────────┐
 * │  [Top Tab Bar - from TopTabNavigation]       │
 * ├────────────┬─────────────────────────────────┤
 * │            │  [Mini Player]  [Channel Info]  │
 * │  Groups    ├─────────────────────────────────┤
 * │  Sidebar   │  [Search Bar]                   │
 * │            │  [Channel Table]                │
 * │            │   # | Channel | Cat | Qual | ★  │
 * │            │  ...                            │
 * ├────────────┴─────────────────────────────────┤
 * │  🟡 Yellow: Favorite  │  Enter: Play         │
 * └──────────────────────────────────────────────┘
 *
 * Web equivalent: `apps/web/app/components/browse-view.tsx`
 */
@Composable
fun BrowseScreen(
    kind: String,
    onNavigateToPlayer: (channelId: String) -> Unit = {},
    viewModel: BrowseViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()

    // ViewModel (and ExoPlayer) survive tab switches via Nav saveState — pause
    // when Live TV is not the visible tab so audio does not bleed into Movies/etc.
    LifecycleResumeEffect(Unit) {
        onPauseOrDispose {
            viewModel.pauseMiniPlayer()
        }
    }

    // FocusRequester for the channel table — sidebar OK press jumps here.
    // Attached to the first item in the LazyColumn so focus lands on an
    // actual channel row, not the search bar above it.
    val channelTableFocusRequester = remember { FocusRequester() }
    val miniPlayerFocusRequester = remember { FocusRequester() }
    val sidebarFocusRequester = remember { FocusRequester() }
    val channelFocusRequester = remember { FocusRequester() }
    var lastFocusedChannelIndex by remember { mutableStateOf(0) }
    val listState = rememberLazyListState()

    // Track navigation to fullscreen player so we can restore focus on return.
    var wentToPlayer by remember { mutableStateOf(false) }
    LaunchedEffect(wentToPlayer) {
        if (wentToPlayer && uiState.playingChannel != null) {
            wentToPlayer = false
            // Point lastFocusedChannelIndex to the playing channel so
            // channelFocusRequester is attached to the correct row.
            val playingIndex = uiState.channels.indexOfFirst { it.id == uiState.playingChannel?.id }
            if (playingIndex >= 0) {
                lastFocusedChannelIndex = playingIndex
            }
            // Resume mini player now that fullscreen player has released audio focus.
            viewModel.resumeMiniPlayer()
            delay(150)
            try { channelFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    // On first render, steer focus to first channel row (not toolbar/header).
    var initialFocusDone by remember { mutableStateOf(false) }
    LaunchedEffect(uiState.channels.isNotEmpty()) {
        if (uiState.channels.isNotEmpty() && !initialFocusDone) {
            delay(100)
            initialFocusDone = true
            delay(50)
            try { channelTableFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

    // Track whether we've started a group filter — prevents the
    // LaunchedEffect from stealing focus on initial composition.
    var hasStartedFiltering by remember { mutableStateOf(false) }
    if (uiState.isFilteringGroup) {
        hasStartedFiltering = true
        lastFocusedChannelIndex = 0
    }

    // After group filtering finishes, scroll to top and focus first channel row.
    LaunchedEffect(uiState.isFilteringGroup) {
        if (!uiState.isFilteringGroup && hasStartedFiltering && uiState.channels.isNotEmpty()) {
            hasStartedFiltering = false
            listState.scrollToItem(0)
            // Group-sort changes keep focus on the sort button.
            if (!uiState.suppressGridFocus) {
                delay(100)
                try { channelTableFocusRequester.requestFocus() } catch (_: Throwable) {}
            }
            viewModel.clearSuppressGridFocus()
        }
    }

    if (uiState.isLoading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.background),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "Loading channels…",
                color = colors.foregroundMuted,
                fontSize = 18.sp,
            )
        }
        return
    }

    if (uiState.error != null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.background)
                .padding(32.dp),
        ) {
            Text(
                text = uiState.error!!,
                color = colors.danger,
                fontSize = 18.sp,
            )
        }
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        // Main content area
        Row(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            // Left sidebar — group list
            GroupsSidebar(
                groups = uiState.filteredGroups,
                selectedIndex = uiState.selectedGroupIndex,
                onGroupSelected = viewModel::selectGroup,
                isReordering = uiState.isReorderingGroups,
                onToggleReorder = viewModel::toggleReorderMode,
                onMoveGroup = viewModel::moveGroup,
                groupSearchQuery = uiState.groupSearchQuery,
                onGroupSearchChanged = viewModel::updateGroupSearch,
                groupSortKey = uiState.groupSortKey,
                onGroupSortKeyChanged = viewModel::setGroupSortKey,
                groupSortDir = uiState.groupSortDir,
                onGroupSortDirChanged = viewModel::setGroupSortDir,
                onJumpToChannelTable = {
                    scope.launch {
                        delay(100)
                        try { channelTableFocusRequester.requestFocus() } catch (_: Throwable) {}
                    }
                },
                selectedGroupFocusRequester = sidebarFocusRequester,
                modifier = Modifier
                    .width(200.dp)
                    .fillMaxHeight(),
            )

            // Right area — search + mini player + channel table
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = 8.dp, end = 16.dp, top = 8.dp),
            ) {
                // Search bar — above mini player so D-pad down goes
                // straight to the channel table without hitting the keyboard
                TvSearchButton(
                    value = uiState.searchQuery,
                    onValueChange = viewModel::updateSearch,
                    placeholder = when (kind) {
                        "live" -> "Search channels…"
                        "vod" -> "Search movies…"
                        "series" -> "Search series…"
                        else -> "Search…"
                    },
                    imeAction = ImeAction.Search,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )

                // Mini player row
                if (uiState.playingChannel != null) {
                    MiniPlayerRow(
                        channel = uiState.playingChannel!!,
                        player = viewModel.getMiniPlayer(),
                        onGoFullScreen = {
                            val id = uiState.playingChannel!!.id
                            viewModel.stopMiniPlayer()
                            wentToPlayer = true
                            onNavigateToPlayer(id)
                        },
                        onNavigateDown = {
                            try { channelFocusRequester.requestFocus() } catch (_: Throwable) {}
                        },
                        onNavigateLeft = {
                            try { sidebarFocusRequester.requestFocus() } catch (_: Throwable) {}
                        },
                        modifier = Modifier.focusRequester(miniPlayerFocusRequester),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Channel count
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    val selectedGroup = uiState.filteredGroups.getOrNull(uiState.selectedGroupIndex)
                    val channelCountLabel = when {
                        uiState.channels.isNotEmpty() -> "${uiState.channels.size} channels"
                        selectedGroup != null && selectedGroup.effectiveChannelCount() > 0 ->
                            "${selectedGroup.effectiveChannelCount()} channels"
                        else -> "0 channels"
                    }
                    Text(
                        text = channelCountLabel,
                        color = colors.foregroundMuted,
                        fontSize = 12.sp,
                    )
                }

                // Channel table
                Box(modifier = Modifier.weight(1f)) {
                    LazyColumn(
                        state = listState,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                        contentPadding = PaddingValues(bottom = 48.dp),
                    ) {
                        itemsIndexed(uiState.channels, key = { _, ch -> ch.id }) { index, channel ->
                            val tvgId = (channel as? Channel.Live)?.tvgId
                            val nowNext = tvgId?.let { uiState.nowNextByTvgId[it] }
                        ChannelTableRow(
                            index = index + 1,
                            channel = channel,
                            isFavorite = channel.id in uiState.favorites,
                            isPlaying = channel.id == uiState.playingChannel?.id,
                            nowNext = nowNext,
                        onSelect = {
                            viewModel.playInMiniPlayer(channel)
                            // Point to the next channel so Down from
                            // mini-player shows a visible focus change.
                            lastFocusedChannelIndex = (index + 1).coerceAtMost(uiState.channels.lastIndex)
                            scope.launch {
                                delay(100)
                                try { miniPlayerFocusRequester.requestFocus() } catch (_: Throwable) {}
                            }
                        },
                            onToggleFavorite = { viewModel.toggleFavorite(channel.id) },
                            onGoFullScreen = {
                                viewModel.playInMiniPlayer(channel)
                                viewModel.pauseMiniPlayer()
                                wentToPlayer = true
                                onNavigateToPlayer(channel.id)
                            },
                            onNavigateLeft = {
                                try { sidebarFocusRequester.requestFocus() } catch (_: Throwable) {}
                            },
                            onFocused = { lastFocusedChannelIndex = index },
                            modifier = when {
                                index == 0 && lastFocusedChannelIndex == 0 ->
                                    Modifier
                                        .focusRequester(channelTableFocusRequester)
                                        .focusRequester(channelFocusRequester)
                                index == 0 -> Modifier.focusRequester(channelTableFocusRequester)
                                index == lastFocusedChannelIndex -> Modifier.focusRequester(channelFocusRequester)
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
        BottomGuidelineBar(isReordering = uiState.isReorderingGroups)
    }

    // Opaque overlay to hide initial focus jump
    if (!initialFocusDone && uiState.channels.isNotEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().background(colors.background),
            contentAlignment = Alignment.Center,
        ) {
            Text("Loading channels…", color = colors.foregroundMuted, fontSize = 18.sp)
        }
    }
    } // end outer Box
}

// ── Mini Player ─────────────────────────────────────────────────────

/**
 * Inline mini player with channel info. Plays the selected channel
 * while the user continues browsing the channel list.
 *
 * Press Enter/Select on the mini player to go full-screen.
 */
@Composable
private fun MiniPlayerRow(
    channel: Channel,
    player: ExoPlayer,
    onGoFullScreen: () -> Unit,
    onNavigateDown: () -> Unit = {},
    onNavigateLeft: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(colors.surface)
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) colors.accent else colors.border,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.key) {
                        Key.DirectionCenter, Key.Enter -> {
                            onGoFullScreen()
                            true
                        }
                        Key.DirectionDown -> {
                            onNavigateDown()
                            true
                        }
                        Key.DirectionLeft -> {
                            onNavigateLeft()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .focusable(),
    ) {
        // Player view
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = false
                }
            },
            modifier = Modifier
                .aspectRatio(16f / 9f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp)),
        )

        // Channel info
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                // Live badge
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(Color(0xFF22C55E), CircleShape),
                    )
                    Text(
                        text = "LIVE",
                        color = Color(0xFF22C55E),
                        fontSize = 11.sp,
                    )
                    // Quality badges
                    val badges = remember(channel.name) { inferStreamQualityHints(channel.name) }
                    for (badge in badges) {
                        Text(
                            text = badge,
                            color = colors.accentForeground,
                            fontSize = 10.sp,
                            modifier = Modifier
                                .background(colors.accent, RoundedCornerShape(3.dp))
                                .padding(horizontal = 4.dp, vertical = 1.dp),
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = channel.name,
                    color = colors.foreground,
                    fontSize = 16.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = channel.groupTitle,
                    color = colors.foregroundMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }
            // Fullscreen button
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .background(Color(0xFF2563EB), CircleShape),
                )
                Text(
                    text = "⛶",
                    color = colors.foreground,
                    fontSize = 20.sp,
                )
            }
        }
    }
}

// ── Channel Table Row ───────────────────────────────────────────────

/**
 * Enhanced channel table row matching the web's live-channel-table.
 *
 * Columns: # | Logo+Name+Group | Category | Quality | Status | ★
 *
 * Remote color buttons:
 * - Yellow (KEYCODE_PROG_YELLOW / KEYCODE_Y): toggle favorite
 *
 * Enter/Select: play channel in mini player
 */
@Composable
private fun ChannelTableRow(
    index: Int,
    channel: Channel,
    isFavorite: Boolean,
    isPlaying: Boolean,
    nowNext: EpgParser.NowNext?,
    onSelect: () -> Unit,
    onToggleFavorite: () -> Unit,
    onGoFullScreen: () -> Unit,
    onNavigateLeft: () -> Unit = {},
    onFocused: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val qualityBadges = remember(channel.name) { inferStreamQualityHints(channel.name) }

    val bgColor = when {
        isPlaying -> colors.accent.copy(alpha = 0.15f)
        isFocused -> colors.surfaceRaised
        else -> colors.surface
    }

    val borderColor = when {
        isPlaying -> colors.accent
        isFocused -> colors.accent
        else -> Color.Transparent
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .border(
                width = if (isFocused || isPlaying) 2.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(6.dp),
            )
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .onFocusChanged {
                isFocused = it.isFocused
                if (it.isFocused) onFocused()
            }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when {
                        event.key == Key.DirectionLeft -> {
                            onNavigateLeft()
                            true
                        }
                        event.key == Key.DirectionCenter || event.key == Key.Enter -> {
                            onSelect()
                            true
                        }
                        // Yellow button on remote = toggle favorite
                        event.key == Key(android.view.KeyEvent.KEYCODE_PROG_YELLOW.toLong()) ||
                        event.key == Key.F -> {
                            onToggleFavorite()
                            true
                        }
                        // Blue button on remote = full screen
                        event.key == Key(android.view.KeyEvent.KEYCODE_PROG_BLUE.toLong()) ||
                        event.key == Key.B -> {
                            onGoFullScreen()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .focusable(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // # Index
        Text(
            text = "$index",
            color = colors.foregroundMuted,
            fontSize = 12.sp,
            modifier = Modifier.width(32.dp),
        )

        // Channel logo
        if (channel.logoUrl != null) {
            AsyncImage(
                model = channel.logoUrl,
                contentDescription = channel.name,
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(4.dp)),
                contentScale = ContentScale.Fit,
            )
        } else {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(colors.backgroundSubtle),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = channel.name.take(2).uppercase(),
                    color = colors.foregroundMuted,
                    fontSize = 12.sp,
                )
            }
        }

        Spacer(modifier = Modifier.width(10.dp))

        // Name + subtitle (group)
        Column(
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = channel.name,
                color = colors.foreground,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = channel.groupTitle,
                color = colors.foregroundMuted,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            // Now/Next EPG info
            if (nowNext?.current != null) {
                Text(
                    text = "▶ ${nowNext.current.title}" +
                        (nowNext.next?.let { " │ Next: ${it.title}" } ?: ""),
                    color = colors.accent,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // Category
        Text(
            text = channel.groupTitle,
            color = colors.foregroundMuted,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(100.dp),
        )

        // Quality badges
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.width(80.dp),
        ) {
            for (badge in qualityBadges) {
                val badgeColor = if (badge == "4K") Color(0xFFEAB308) else colors.accent
                Text(
                    text = badge,
                    color = colors.accentForeground,
                    fontSize = 9.sp,
                    modifier = Modifier
                        .background(badgeColor, RoundedCornerShape(3.dp))
                        .padding(horizontal = 4.dp, vertical = 1.dp),
                )
            }
        }

        // Status (live dot)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.width(56.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(Color(0xFF22C55E), CircleShape),
            )
            Text(
                text = "LIVE",
                color = Color(0xFF22C55E),
                fontSize = 10.sp,
            )
        }

        // Favorite
        Text(
            text = if (isFavorite) "★" else "☆",
            color = if (isFavorite) colors.danger else colors.foregroundMuted,
            fontSize = 18.sp,
            modifier = Modifier.width(28.dp),
        )
    }
}

// ── Groups Sidebar ──────────────────────────────────────────────────

@Composable
private fun GroupsSidebar(
    groups: List<ChannelGroup>,
    selectedIndex: Int,
    onGroupSelected: (Int) -> Unit,
    isReordering: Boolean,
    onToggleReorder: () -> Unit,
    onMoveGroup: (direction: Int) -> Unit,
    groupSearchQuery: String,
    onGroupSearchChanged: (String) -> Unit,
    groupSortKey: GroupSortKey,
    onGroupSortKeyChanged: (GroupSortKey) -> Unit,
    groupSortDir: GroupSortDir,
    onGroupSortDirChanged: (GroupSortDir) -> Unit,
    onJumpToChannelTable: () -> Unit,
    selectedGroupFocusRequester: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    val navBarFocusRequester = LocalNavBarFocusRequester.current
    // Keep the selected group visible. Keying on the sort params (in addition to
    // the selection) guarantees this re-runs on every sort change — even when the
    // selection stays on group 0 — so the new order is shown from the top.
    val groupListState = rememberLazyListState()
    LaunchedEffect(selectedIndex, groupSortKey, groupSortDir) {
        if (selectedIndex in groups.indices) groupListState.scrollToItem(selectedIndex)
    }
    // Focus requesters so D-pad Left cycles between the group search field and
    // the group sort button (instead of escaping to the nav bar from both).
    val groupSearchFr = remember { FocusRequester() }
    val groupSortFr = remember { FocusRequester() }

    Column(modifier = modifier.background(colors.surface)) {
        // Group search + sort
        Row(
            modifier = Modifier.padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvSearchButton(
                value = groupSearchQuery,
                onValueChange = onGroupSearchChanged,
                placeholder = "Filter groups…",
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(groupSearchFr)
                    .onPreviewKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft) {
                            try { groupSortFr.requestFocus() } catch (_: Throwable) {}
                            true
                        } else false
                    },
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
                    .focusRequester(groupSortFr)
                    .onPreviewKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft) {
                            try { groupSearchFr.requestFocus() } catch (_: Throwable) {}
                            true
                        } else false
                    }
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

        // Reorder mode indicator
        if (isReordering) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFDC2626).copy(alpha = 0.15f))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    text = "↕ Reorder mode — D-pad to move, Red to confirm",
                    color = Color(0xFFDC2626),
                    fontSize = 11.sp,
                    maxLines = 2,
                )
            }
        }

        LazyColumn(
            state = groupListState,
            modifier = Modifier
                .weight(1f)
                .padding(6.dp)
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft) {
                        try { navBarFocusRequester.requestFocus() } catch (_: Throwable) {}
                        true
                    } else false
                },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            itemsIndexed(groups, key = { _, g -> g.id }) { index, group ->
                val isSelected = index == selectedIndex
                var isFocused by remember { mutableStateOf(false) }
                val isFavGroup = group.id == "__favorites__"
                val isVirtual = group.id.startsWith("__")

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            when {
                                isReordering && isSelected -> colors.accent.copy(alpha = 0.3f)
                                isFocused -> colors.accent
                                isSelected -> colors.surfaceRaised
                                else -> colors.surface
                            }
                        )
                        .then(
                            if (isReordering && isSelected && !isVirtual) {
                                Modifier.border(2.dp, Color(0xFFDC2626), RoundedCornerShape(6.dp))
                            } else if (isSelected && !isFocused) {
                                // Loaded-group marker: shows which group's
                                // content is currently displayed on the right
                                // side, even when focus has moved elsewhere
                                // in the sidebar.
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
                            // Lazy load: do NOT auto-select on focus.
                            // The right-side channel list only updates when
                            // the user presses OK/Enter. This prevents the
                            // table from constantly rebuilding while the
                            // user is just browsing the sidebar with D-pad.
                        }
                        .onKeyEvent { event ->
                            if (event.type == KeyEventType.KeyDown) {
                                when {
                                    // Red button = toggle reorder mode
                                    event.key == Key(android.view.KeyEvent.KEYCODE_PROG_RED.toLong()) ||
                                    event.key == Key.R -> {
                                        onToggleReorder()
                                        true
                                    }
                                    // In reorder mode, intercept Up/Down to move groups
                                    isReordering && !isVirtual && event.key == Key.DirectionUp -> {
                                        onMoveGroup(-1)
                                        true
                                    }
                                    isReordering && !isVirtual && event.key == Key.DirectionDown -> {
                                        onMoveGroup(1)
                                        true
                                    }
                                    // Enter/Select = select group and jump to channel table
                                    event.key == Key.DirectionCenter || event.key == Key.Enter -> {
                                        if (isReordering) {
                                            onToggleReorder() // confirm and exit
                                        } else {
                                            onGroupSelected(index)
                                            onJumpToChannelTable()
                                        }
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
                            // Reorder handle for non-virtual groups
                            if (isReordering && !isVirtual) {
                                Text(
                                    text = "≡",
                                    color = if (isSelected) Color(0xFFDC2626) else colors.foregroundMuted,
                                    fontSize = 16.sp,
                                )
                            }
                            if (isFavGroup) {
                                Text(
                                    text = "♥",
                                    color = if (isFocused) colors.accentForeground else colors.danger,
                                    fontSize = 14.sp,
                                )
                            }
                            Text(
                                text = group.name,
                                color = when {
                                    isFocused -> colors.accentForeground
                                    else -> colors.foreground
                                },
                                fontSize = 13.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            text = "${group.effectiveChannelCount()}",
                            color = when {
                                isFocused -> colors.accentForeground
                                else -> colors.foregroundMuted
                            },
                            fontSize = 11.sp,
                        )
                    }
                }
            }
        }
    }
}

// ── Bottom Guideline Bar ────────────────────────────────────────────

/**
 * Bottom bar showing remote button hints — standard TV lean-back UX pattern.
 * Shows which color buttons do what, like real TV apps (EPG, teletext, etc.).
 */
@Composable
private fun BottomGuidelineBar(isReordering: Boolean = false) {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(horizontal = 24.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Red button = Reorder groups
        ButtonHint(
            color = Color(0xFFDC2626), // Red
            label = if (isReordering) "Confirm order" else "Reorder groups",
        )
        // Yellow button = Favorite
        ButtonHint(
            color = Color(0xFFEAB308), // Yellow
            label = "Favorite",
        )
        // Blue button = Full screen (no label needed — obvious from context)
        Box(
            modifier = Modifier
                .size(14.dp)
                .background(Color(0xFF2563EB), CircleShape),
        )
        // Enter = Play
        ButtonHint(
            color = colors.accent,
            label = "Play in mini player",
            symbol = "OK",
        )
    }
}

@Composable
private fun ButtonHint(
    color: Color,
    label: String,
    symbol: String? = null,
) {
    val colors = LuminaTheme.colors

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (symbol != null) {
            Text(
                text = symbol,
                color = colors.accentForeground,
                fontSize = 10.sp,
                modifier = Modifier
                    .background(color, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(14.dp)
                    .background(color, CircleShape),
            )
        }
        Text(
            text = label,
            color = colors.foreground,
            fontSize = 12.sp,
        )
    }
}
