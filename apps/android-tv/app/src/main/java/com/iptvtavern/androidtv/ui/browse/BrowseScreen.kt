package com.iptvtavern.androidtv.ui.browse

import android.widget.Toast
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
import androidx.compose.ui.platform.LocalContext
import com.iptvtavern.androidtv.ui.common.rememberOkLongPress
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
import com.iptvtavern.androidtv.ui.settings.ButtonSize
import com.iptvtavern.androidtv.ui.settings.ButtonVariant
import com.iptvtavern.androidtv.ui.settings.FocusableButton
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
                // Retry focus from frame zero instead of a fixed delay. A fixed
                // delay left a window where the old focused row was already
                // disposed but the new row hadn't received focus yet — Compose
                // restored focus upward and the Home tab briefly lit up. Grabbing
                // focus as soon as the new row is composed closes that window.
                for (attempt in 0 until 10) {
                    try {
                        channelTableFocusRequester.requestFocus()
                        break
                    } catch (_: Throwable) {
                        delay(30)
                    }
                }
            }
            viewModel.clearSuppressGridFocus()
        }
    }

    if (uiState.isLoading) {
        LoadingOverlay(label = "Loading channels")
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
                disabled = uiState.isFilteringGroup || uiState.isLoading,
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
                        isFavorite = uiState.playingChannel!!.id in uiState.favorites,
                        onToggleFavorite = {
                            viewModel.toggleFavorite(uiState.playingChannel!!.id)
                        },
                        rowFocusRequester = miniPlayerFocusRequester,
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
        BottomGuidelineBar()
    }

    // Loading overlay to hide the initial focus jump — same look as the main
    // page loader so the experience is consistent whether the catalog is
    // coming from disk (first load) or from the cached ViewModel (tab return).
    if (!initialFocusDone && uiState.channels.isNotEmpty()) {
        LoadingOverlay(label = "Loading channels")
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
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    rowFocusRequester: FocusRequester,
    onGoFullScreen: () -> Unit,
    onNavigateDown: () -> Unit = {},
    onNavigateLeft: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val favoriteButtonFocusRequester = remember { FocusRequester() }

    Row(
        modifier = modifier
            .focusRequester(rowFocusRequester)
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
                        Key.DirectionRight -> {
                            try { favoriteButtonFocusRequester.requestFocus() } catch (_: Throwable) {}
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
            // Action row: fullscreen hint (left) + favorite toggle (right)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                // Fullscreen hint
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(15.dp)
                            .background(Color(0xFF2563EB), CircleShape),
                    )
                    Text(
                        text = "⛶",
                        color = colors.foreground,
                        fontSize = 20.sp,
                    )
                }
                // Favorite toggle — Left returns focus to the mini player row
                Box(
                    modifier = Modifier.onKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft) {
                            try { rowFocusRequester.requestFocus() } catch (_: Throwable) {}
                            true
                        } else false
                    },
                ) {
                    FocusableButton(
                        text = if (isFavorite) "★ Unfavorite" else "☆ Favorite",
                        onClick = onToggleFavorite,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                        modifier = Modifier.focusRequester(favoriteButtonFocusRequester),
                    )
                }
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
 * D-pad:
 * - OK (tap)   : play channel in mini player
 * - OK (hold)  : toggle favorite
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
    onNavigateLeft: () -> Unit = {},
    onFocused: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val qualityBadges = remember(channel.name) { inferStreamQualityHints(channel.name) }
    // OK tap = play in mini player; OK hold = toggle favorite (no colored buttons).
    val context = LocalContext.current
    val onOk = rememberOkLongPress(
        onShortClick = onSelect,
        onLongClick = {
            onToggleFavorite()
            Toast.makeText(
                context,
                if (isFavorite) "Removed from favorites" else "Added to favorites",
                Toast.LENGTH_SHORT,
            ).show()
        },
    )

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
                when {
                    event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft -> {
                        onNavigateLeft()
                        true
                    }
                    // OK tap (play in mini player) / OK hold (favorite)
                    else -> onOk(event.key, event.type)
                }
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
    disabled: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    val context = LocalContext.current
    val navBarFocusRequester = LocalNavBarFocusRequester.current
    // Keep the selected group visible. Keying on the sort params (in addition to
    // the selection) guarantees this re-runs on every sort change — even when the
    // selection stays on group 0 — so the new order is shown from the top.
    val groupListState = rememberLazyListState()
    LaunchedEffect(selectedIndex, groupSortKey, groupSortDir) {
        // Skip auto-scroll while reordering: scrolling to the moved group on
        // every swap pins it in the viewport and makes the swap look like focus
        // navigation instead of a visible position change.
        if (!isReordering && selectedIndex in groups.indices) {
            groupListState.scrollToItem(selectedIndex)
        }
    }
    // During reorder, keep the active group on screen ONLY when it reaches the
    // viewport edges — so it never vanishes at the top/bottom — while leaving
    // middle swaps unscrolled (so the movement stays visible, not pinned).
    LaunchedEffect(isReordering, selectedIndex) {
        if (!isReordering) return@LaunchedEffect
        val visible = groupListState.layoutInfo.visibleItemsInfo
        if (visible.isEmpty()) return@LaunchedEffect
        val first = visible.first().index
        val last = visible.last().index
        when {
            selectedIndex < first -> groupListState.scrollToItem(selectedIndex)
            selectedIndex > last -> groupListState.scrollToItem(
                (selectedIndex - (last - first - 1)).coerceAtLeast(0),
            )
        }
    }
    // Focus requesters so D-pad Left cycles between the group search field and
    // the group sort button (instead of escaping to the nav bar from both).
    val groupSearchFr = remember { FocusRequester() }
    val groupSortFr = remember { FocusRequester() }

    // When reorder mode turns on, jump focus to the selected group so the
    // user can move it with Up/Down immediately. We focus ONCE on entry only:
    // after that, focus follows the row by its stable key as it swaps position
    // (re-requesting focus on every move would trigger bringIntoView and scroll
    // the viewport, masking the swap).
    LaunchedEffect(isReordering) {
        if (isReordering) {
            try { selectedGroupFocusRequester.requestFocus() } catch (_: Throwable) {}
        }
    }

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
                    .background(if (sortFocused && !disabled) colors.accent else colors.surface)
                    .border(
                        width = if (sortFocused && !disabled) 2.dp else 1.dp,
                        color = if (sortFocused && !disabled) colors.accent else colors.border,
                        shape = RoundedCornerShape(6.dp),
                    )
                    .padding(horizontal = 8.dp, vertical = 8.dp)
                    .onFocusChanged { sortFocused = it.isFocused }
                    .onKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown &&
                            (event.key == Key.DirectionCenter || event.key == Key.Enter)
                        ) {
                            // Sorting is disabled during reorder: a re-sort would
                            // discard the manual edits (the sidebar list is rebuilt
                            // from the canonical order). Exit reorder first.
                            // Also disabled while content is loading to prevent
                            // queueing overlapping recomputes by mashing the button.
                            if (isReordering || disabled) return@onKeyEvent true
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
                    color = when {
                        disabled -> colors.foregroundMuted
                        sortFocused -> colors.foreground
                        else -> colors.foregroundMuted
                    },
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }

            // Reorder button — toggles group reorder mode (was the Red button).
            var reorderFocused by remember { mutableStateOf(false) }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(
                        when {
                            isReordering -> Color(0xFFDC2626)
                            reorderFocused -> colors.accent
                            else -> colors.surface
                        }
                    )
                    .border(
                        width = if (reorderFocused || isReordering) 2.dp else 1.dp,
                        color = when {
                            isReordering -> Color(0xFFDC2626)
                            reorderFocused -> colors.accent
                            else -> colors.border
                        },
                        shape = RoundedCornerShape(6.dp),
                    )
                    .padding(horizontal = 8.dp, vertical = 8.dp)
                    .onFocusChanged { reorderFocused = it.isFocused }
                    .onKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown &&
                            (event.key == Key.DirectionCenter || event.key == Key.Enter)
                        ) {
                            val exiting = isReordering
                            onToggleReorder()
                            if (exiting) {
                                Toast.makeText(context, "Group order saved", Toast.LENGTH_SHORT).show()
                            }
                            true
                        } else false
                    }
                    .focusable(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (isReordering) "✓" else "↕",
                    color = if (reorderFocused || isReordering) colors.foreground else colors.foregroundMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }
        }

        // Reorder mode indicator — compact single line so it takes minimal
        // vertical space and never visually crowds the group list below it.
        if (isReordering) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFDC2626))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    text = "↑/↓ move · OK to confirm",
                    color = colors.accentForeground,
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }
        }

        LazyColumn(
            state = groupListState,
            modifier = Modifier
                .weight(1f)
                .padding(6.dp)
                .onPreviewKeyEvent { event ->
                    // Preview phase: runs BEFORE focus traversal, so we can
                    // intercept Up/Down to MOVE the selected group instead of
                    // letting the focus system navigate between rows.
                    if (event.type == KeyEventType.KeyDown) {
                        when {
                            event.key == Key.DirectionLeft -> {
                                try { navBarFocusRequester.requestFocus() } catch (_: Throwable) {}
                                true
                            }
                            // Reorder mode: Up/Down moves the selected group.
                            isReordering && event.key == Key.DirectionUp -> {
                                onMoveGroup(-1)
                                true
                            }
                            isReordering && event.key == Key.DirectionDown -> {
                                onMoveGroup(1)
                                true
                            }
                            else -> false
                        }
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
                                isReordering && isSelected -> Color(0xFFDC2626)
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
                                    // Enter/Select = select group (or confirm reorder)
                                    event.key == Key.DirectionCenter || event.key == Key.Enter -> {
                                        if (isReordering) {
                                            onToggleReorder() // confirm and exit
                                            Toast.makeText(context, "Group order saved", Toast.LENGTH_SHORT).show()
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
                                    color = if (isSelected) colors.accentForeground else colors.foregroundMuted,
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
                                    isReordering && isSelected -> colors.accentForeground
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
                                isReordering && isSelected -> colors.accentForeground
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
 * Bottom bar showing D-pad hints (standard TV lean-back UX).
 * Colored-button hints were removed because colored remote keys are not
 * delivered on most modern devices (Chromecast/Google TV, etc.); the
 * favorite action is now a long-press of OK.
 */
@Composable
private fun BottomGuidelineBar() {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(horizontal = 24.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // OK (tap) = play in mini player
        ButtonHint(
            color = colors.accent,
            label = "Play in mini player",
            symbol = "OK",
        )
        // OK (hold) = toggle favorite
        ButtonHint(
            color = colors.accent,
            label = "Favorite",
            symbol = "hold OK",
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
