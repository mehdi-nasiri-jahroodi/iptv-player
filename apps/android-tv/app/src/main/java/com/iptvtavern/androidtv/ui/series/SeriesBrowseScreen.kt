package com.iptvtavern.androidtv.ui.series

import android.widget.Toast
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
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
import com.iptvtavern.androidtv.ui.common.EmptyState
import com.iptvtavern.androidtv.ui.common.rememberOkLongPress
import com.iptvtavern.androidtv.ui.navigation.LocalNavBarFocusRequester
import com.iptvtavern.androidtv.ui.onboarding.TvSearchButton
import com.iptvtavern.androidtv.ui.settings.ButtonSize
import com.iptvtavern.androidtv.ui.settings.ButtonVariant
import com.iptvtavern.androidtv.ui.settings.FocusableButton
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import kotlin.math.roundToInt
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
            // Group-sort changes keep focus on the sort button.
            if (!uiState.suppressGridFocus) {
                // Retry focus from frame zero — a fixed delay left a window
                // where the old focused poster was disposed but the new one
                // hadn't received focus yet, so Compose restored focus upward
                // and the Home tab briefly lit up.
                for (attempt in 0 until 10) {
                    try {
                        gridFocusRequester.requestFocus()
                        break
                    } catch (_: Throwable) {
                        delay(30)
                    }
                }
            }
            viewModel.clearSuppressGridFocus()
        }
    }

    // Focus the first season tab when modal appears
    LaunchedEffect(showDetailModal) {
        if (!showDetailModal) return@LaunchedEffect
        // The modal content lives inside AnimatedVisibility, so the focus
        // target may not be composed/laid out on the first frame. Retry until
        // focus lands on it — otherwise focus stays on the grid behind the
        // overlay (the reported "focus stays below the modal" bug).
        repeat(10) {
            try {
                modalFocusRequester.requestFocus()
                return@LaunchedEffect
            } catch (_: Throwable) {
                delay(60)
            }
        }
    }

    // At modal-open time the channel is still a stub with no seasons, so the
    // effect above focuses the fallback button. Once enrichment finishes and
    // the season list arrives, move focus to the Episodes button (which then
    // owns modalFocusRequester).
    val seasonsAvailable = showDetailModal &&
        uiState.detailChannel?.seasons?.isNotEmpty() == true
    LaunchedEffect(seasonsAvailable) {
        if (!seasonsAvailable) return@LaunchedEffect
        repeat(10) {
            try {
                modalFocusRequester.requestFocus()
                return@LaunchedEffect
            } catch (_: Throwable) {
                delay(60)
            }
        }
    }

    if (uiState.isLoading) {
        LoadingOverlay(label = "Loading series")
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

    if (uiState.filteredGroups.isEmpty() && uiState.groupSearchQuery.isBlank()) {
        EmptyState(
            icon = "🎞️",
            title = "No series",
            message = "This source has no series. Try switching sources, or add a " +
                "source that includes a series catalog.",
        )
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
                disabled = uiState.isFilteringGroup || uiState.isLoading,
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

    // Loading overlay to hide the initial focus jump — same look as the main
    // page loader so the experience is consistent whether the catalog is
    // coming from disk (first load) or from the cached ViewModel (tab return).
    if (!initialFocusDone && uiState.channels.isNotEmpty()) {
        LoadingOverlay(label = "Loading series")
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
            watchedEpisodeIds = uiState.watchedEpisodeIds,
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
    watchedEpisodeIds: Set<String>,
    onPlayEpisode: (SeriesEpisode) -> Unit,
    onToggleFavorite: () -> Unit,
    onDismiss: () -> Unit,
    modalFocusRequester: FocusRequester = remember { FocusRequester() },
) {
    val colors = LuminaTheme.colors
    if (channel == null) return

    // Two modes: Details (poster + info text) and Episodes (poster + the
    // season/episode accordion). The modal opens in Details; the Episodes
    // button switches to the accordion to give it the full modal height.
    var showEpisodesView by remember { mutableStateOf(false) }

    // Accordion state — hoisted so it survives switching between modes.
    var expandedSeasonIndex by remember { mutableStateOf<Int?>(null) }
    val headerFocusRequesters = remember(seasons.size) {
        List(seasons.size) { FocusRequester() }
    }
    val scope = rememberCoroutineScope()

    fun collapseToHeader(seasonIdx: Int) {
        expandedSeasonIndex = null
        val target = headerFocusRequesters.getOrNull(seasonIdx) ?: return
        scope.launch {
            delay(50)
            try {
                target.requestFocus()
            } catch (_: Throwable) {
            }
        }
    }

    // Entering Episodes mode: focus the first season header so the user can
    // navigate immediately.
    LaunchedEffect(showEpisodesView) {
        if (!showEpisodesView || headerFocusRequesters.isEmpty()) return@LaunchedEffect
        repeat(10) {
            try {
                headerFocusRequesters[0].requestFocus()
                return@LaunchedEffect
            } catch (_: Throwable) {
                delay(60)
            }
        }
    }

    // Focus-trap state: track which action button holds focus so we can block
    // D-pad moves that would escape the modal to the grid behind the overlay.
    var focusedActionIndex by remember { mutableStateOf(0) }
    val hasSeasons = seasons.isNotEmpty()
    // Reserve the Episodes slot as soon as the modal opens — even before
    // enrichment finishes — so the layout is stable and the button doesn't
    // "pop in". While seasons are still loading, the slot renders a disabled
    // spinner button (LoadingEpisodesButton) instead of the toggle.
    val showEpisodesSlot = hasSeasons || isLoading
    // [Episodes/loading][Favorite][Close] when the slot is present, else [Favorite][Close].
    val lastActionIndex = if (showEpisodesSlot) 2 else 1

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
                if (showEpisodesView && hasSeasons) {
                    // ── Episodes mode: only the season/episode accordion ──
                    val listState = rememberLazyListState()
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                    ) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(top = 4.dp, end = 12.dp)
                                .onPreviewKeyEvent { event ->
                                    // Block Right so focus can't escape to the grid
                                    // behind the overlay. Left reaches the focused
                                    // item: an episode collapses its accordion, a
                                    // header just consumes it. (Preview dispatches
                                    // parent→child, so this runs first.)
                                    if (event.type == KeyEventType.KeyDown &&
                                        event.key == Key.DirectionRight
                                    ) {
                                        true
                                    } else false
                                },
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                            contentPadding = PaddingValues(vertical = 4.dp),
                        ) {
                            val listScope = this
                            seasons.forEachIndexed { seasonIndex, season ->
                                listScope.item(key = "season-$seasonIndex") {
                                    SeasonAccordionHeader(
                                        season = season,
                                        isExpanded = expandedSeasonIndex == seasonIndex,
                                        isTopHeader = seasonIndex == 0,
                                        focusRequester = headerFocusRequesters.getOrNull(seasonIndex),
                                        onFocusGained = {
                                            // Collapse the previously open season when the
                                            // user moves focus to a different header.
                                            val open = expandedSeasonIndex
                                            if (open != null && open != seasonIndex) {
                                                expandedSeasonIndex = null
                                            }
                                        },
                                        onToggle = {
                                            // Single-open accordion: toggle this season and
                                            // close any other that was open.
                                            expandedSeasonIndex =
                                                if (expandedSeasonIndex == seasonIndex) null else seasonIndex
                                        },
                                    )
                                }
                                if (expandedSeasonIndex == seasonIndex) {
                                    listScope.itemsIndexed(
                                        season.episodes,
                                        key = { _, ep -> "s$seasonIndex-${ep.id}" },
                                    ) { _, episode ->
                                        EpisodeRow(
                                            episode = episode,
                                            isWatched = "${channel.id}:ep:${episode.id}" in watchedEpisodeIds,
                                            onPlay = { onPlayEpisode(episode) },
                                            onCollapse = { collapseToHeader(seasonIndex) },
                                        )
                                    }
                                }
                            }
                        }
                        // Scroll indicator — only draws when content overflows.
                        SeriesModalScrollbar(
                            listState = listState,
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .fillMaxHeight()
                                .padding(end = 2.dp),
                        )
                    }
                } else {
                    // ── Details mode: info text only (no accordion) ──
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
                    if (hasSeasons) {
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

                    // Push the action buttons to the bottom.
                    Spacer(modifier = Modifier.weight(1f))
                }

                // ── Bottom actions (both modes) ──
                Row(
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .onPreviewKeyEvent { event ->
                            // Trap focus: nothing is below the actions, and the
                            // grid sits behind the overlay. Block Down entirely
                            // plus Left/Right at the row edges.
                            if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                            when (event.key) {
                                Key.DirectionDown -> true
                                // Details mode: nothing focusable above. Episodes
                                // mode: Up climbs into the accordion.
                                Key.DirectionUp -> !showEpisodesView
                                Key.DirectionLeft -> focusedActionIndex == 0
                                Key.DirectionRight -> focusedActionIndex == lastActionIndex
                                else -> false
                            }
                        },
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Episodes/Details toggle — first button; owns the modal
                    // entry focus when the series has seasons. While seasons
                    // are still loading, a non-clickable spinner button holds
                    // the same slot so the layout doesn't jump.
                    if (showEpisodesSlot) {
                        if (hasSeasons) {
                            FocusableButton(
                                text = if (showEpisodesView) "◀ Details" else "Episodes ▶",
                                onClick = { showEpisodesView = !showEpisodesView },
                                variant = ButtonVariant.Primary,
                                size = ButtonSize.Small,
                                modifier = Modifier.focusRequester(modalFocusRequester),
                                onFocus = { f -> if (f) focusedActionIndex = 0 },
                            )
                        } else {
                            LoadingEpisodesButton(
                                modifier = Modifier.focusRequester(modalFocusRequester),
                                onFocusGained = { focusedActionIndex = 0 },
                            )
                        }
                    }

                    FocusableButton(
                        text = if (isFavorite) "★ Unfavorite" else "☆ Favorite",
                        onClick = onToggleFavorite,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                        modifier = if (!showEpisodesSlot) Modifier.focusRequester(modalFocusRequester) else Modifier,
                        onFocus = { f -> if (f) focusedActionIndex = if (showEpisodesSlot) 1 else 0 },
                    )

                    FocusableButton(
                        text = "Close",
                        onClick = onDismiss,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                        onFocus = { f -> if (f) focusedActionIndex = lastActionIndex },
                    )
                }
            }
        }
    }
}

// ── Loading Episodes Button (modal slot placeholder) ──────────

/**
 * Placeholder for the Episodes slot in [SeriesDetailModal] while seasons are
 * still being fetched from the Xtream API. Mirrors the FocusableButton shape
 * (padding, border, focus ring) so the action row layout doesn't jump when
 * enrichment finishes and the real toggle button takes over.
 *
 * Focusable so it can own [modalFocusRequester] (keeping the modal's focus
 * trap intact), but Enter/OK is a no-op — there's nothing to expand yet.
 */
@Composable
private fun LoadingEpisodesButton(
    modifier: Modifier = Modifier,
    onFocusGained: () -> Unit = {},
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    Row(
        modifier = modifier
            .background(
                color = if (isFocused) colors.surfaceRaised else colors.surface,
                shape = RoundedCornerShape(8.dp),
            )
            .border(
                width = if (isFocused) 3.dp else 2.dp,
                color = if (isFocused) colors.accent else colors.border,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .onFocusChanged {
                isFocused = it.isFocused
                if (it.isFocused) onFocusGained()
            }
            // Consume Enter/OK so the focus trap logic stays consistent —
            // clicking does nothing while loading.
            .onKeyEvent { event ->
                event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
            }
            .focusable(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(14.dp),
            strokeWidth = 2.dp,
            color = colors.accent,
        )
        Text(
            text = "Loading episodes…",
            color = if (isFocused) colors.foreground else colors.foregroundMuted,
            fontSize = 13.sp,
        )
    }
}

// ── Season Accordion Header ────────────────────────────────────

/**
 * A single season row in the detail-modal accordion. Focusable; pressing OK
 * toggles expansion. The caller controls single-open behavior via [onToggle]
 * and collapses the previous season on focus change via [onFocusGained].
 */
@Composable
private fun SeasonAccordionHeader(
    season: SeriesSeason,
    isExpanded: Boolean,
    isTopHeader: Boolean,
    focusRequester: FocusRequester?,
    onFocusGained: () -> Unit,
    onToggle: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val label = season.name ?: "Season ${season.seasonNumber}"
    val episodeCount = season.episodes.size

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(
                when {
                    isFocused -> colors.accent
                    isExpanded -> colors.surfaceRaised
                    else -> Color.Transparent
                },
            )
            .border(
                width = if (isExpanded && !isFocused) 1.dp else 0.dp,
                color = if (isExpanded && !isFocused) colors.border else Color.Transparent,
                shape = RoundedCornerShape(6.dp),
            )
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .onFocusChanged {
                isFocused = it.isFocused
                if (it.isFocused) onFocusGained()
            }
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    // OK / Enter toggles the accordion open or closed.
                    Key.DirectionCenter, Key.Enter -> {
                        onToggle()
                        true
                    }
                    // Topmost header: block Up so focus can't escape the modal
                    // to the non-focusable title/plot above.
                    Key.DirectionUp -> isTopHeader
                    // No horizontal target at a header — consume Left so focus
                    // can't escape to the grid behind the overlay.
                    Key.DirectionLeft -> true
                    else -> false
                }
            }
            .focusable(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = if (isExpanded) "▼" else "▶",
            color = if (isFocused) colors.accentForeground else colors.foregroundMuted,
            fontSize = 12.sp,
        )
        Text(
            text = label,
            color = if (isFocused) colors.accentForeground else colors.foreground,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = "$episodeCount ep",
            color = if (isFocused) colors.accentForeground else colors.foregroundMuted,
            fontSize = 12.sp,
        )
    }
}

// ── Episode Row ────────────────────────────────────────────────

/** A single episode row inside an expanded season. Press OK / Enter to play. */
@Composable
private fun EpisodeRow(
    episode: SeriesEpisode,
    isWatched: Boolean,
    onPlay: () -> Unit,
    onCollapse: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val durationText = episode.durationSeconds?.let { secs ->
        val mins = secs / 60
        if (mins > 0) "${mins}m" else null
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(if (isFocused) colors.accent else Color.Transparent)
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .onFocusChanged { isFocused = it.isFocused }
            .onPreviewKeyEvent { event ->
                // Left closes the accordion and returns focus to the season
                // header. Handled in preview so it runs before the LazyColumn's
                // Left/Right trap consumes the key.
                if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft) {
                    onCollapse()
                    true
                } else {
                    false
                }
            }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onPlay()
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

// ── Modal Scrollbar ────────────────────────────────────────────

/**
 * Thin vertical scroll indicator for the modal's season/episode list. The thumb
 * size reflects how much of the content is visible and its position reflects
 * scroll progress. Renders nothing while the content fits the viewport.
 */
@Composable
private fun SeriesModalScrollbar(
    listState: LazyListState,
    modifier: Modifier = Modifier,
    width: Dp = 4.dp,
) {
    val colors = LuminaTheme.colors
    val info = listState.layoutInfo
    val visible = info.visibleItemsInfo
    val total = info.totalItemsCount
    if (total == 0 || visible.isEmpty()) return

    val viewportPx = (info.viewportEndOffset - info.viewportStartOffset).coerceAtLeast(1)
    // Items vary in height (headers vs episodes), so estimate total content size
    // from the first visible item — accurate enough for an indicator.
    val itemPx = visible.first().size.coerceAtLeast(1)
    val totalPx = (total * itemPx).coerceAtLeast(viewportPx)
    if (totalPx <= viewportPx) return

    val thumbFraction = (viewportPx.toFloat() / totalPx.toFloat()).coerceIn(0.05f, 1f)
    val first = visible.first()
    val scrolledPx = (first.index * itemPx - first.offset).coerceAtLeast(0)
    val maxScrollPx = (totalPx - viewportPx).coerceAtLeast(1)
    val scrollFraction = (scrolledPx.toFloat() / maxScrollPx.toFloat()).coerceIn(0f, 1f)

    var trackPx by remember { mutableIntStateOf(0) }

    Box(
        modifier
            .width(width)
            .onSizeChanged { trackPx = it.height }
            .clip(RoundedCornerShape(width / 2))
            .background(colors.surfaceRaised.copy(alpha = 0.3f)),
    ) {
        val usable = (trackPx - trackPx * thumbFraction).coerceAtLeast(0f)
        val thumbOffsetPx = (scrollFraction * usable).roundToInt()
        Box(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(thumbFraction)
                .offset { IntOffset(0, thumbOffsetPx) }
                .clip(RoundedCornerShape(width / 2))
                .background(colors.accent.copy(alpha = 0.7f)),
        )
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
    // OK tap = open detail; OK hold = toggle favorite (no colored buttons).
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
            .onKeyEvent { event -> onOk(event.key, event.type) }
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
    disabled: Boolean = false,
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
                placeholder = "Filter categories…",
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
                            // Disabled while content is loading: consume the
                            // press so focus stays put, but skip the expensive
                            // recompute to prevent mashing the sort button.
                            if (!disabled) {
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
        }

        LazyColumn(
            state = groupListState,
            modifier = Modifier.weight(1f).padding(6.dp)
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
        // OK (tap) = select
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
        // OK (hold) = favorite
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "hold OK",
                color = colors.accentForeground,
                fontSize = 10.sp,
                modifier = Modifier
                    .background(colors.accent, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
            Text("Favorite", color = colors.foreground, fontSize = 12.sp)
        }
    }
}
