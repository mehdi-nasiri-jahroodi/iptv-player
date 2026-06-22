package com.iptvtavern.androidtv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.iptvtavern.androidtv.domain.model.ChannelSnapshot
import com.iptvtavern.androidtv.ui.settings.FocusableButton
import com.iptvtavern.androidtv.ui.settings.ButtonSize
import com.iptvtavern.androidtv.ui.settings.ButtonVariant
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Home screen — the launcher / dashboard.
 *
 * Shows catalog tiles (Live TV, Movies, Series) with channel counts,
 * active source indicator, and a "Continue watching" rail of recent channels.
 *
 * Web equivalent: `apps/web/app/pages/home.tsx`
 */
@Composable
fun HomeScreen(
    onNavigateToBrowse: (kind: String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToPlayer: (channelId: String) -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(32.dp)
            .onKeyEvent { event ->
                // Green button = refresh catalog
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key(android.view.KeyEvent.KEYCODE_PROG_GREEN.toLong()) ||
                     event.key == Key.G)
                ) {
                    viewModel.refreshCatalog()
                    true
                } else false
            },
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        // Header with source indicator
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Home",
                color = colors.foreground,
                fontSize = 28.sp,
            )

            // Active source badge + refresh button
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (uiState.activeSource != null) {
                    FocusableButton(
                        text = "↻ Refresh",
                        onClick = viewModel::refreshCatalog,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                    )
                    Text(
                        text = uiState.activeSource!!.label,
                        color = colors.accent,
                        fontSize = 13.sp,
                        modifier = Modifier
                            .background(colors.surface, RoundedCornerShape(8.dp))
                            .border(1.dp, colors.border, RoundedCornerShape(8.dp))
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }

        // Loading / error states
        if (uiState.isLoading) {
            Text(
                text = "Loading catalog…",
                color = colors.foregroundMuted,
                fontSize = 16.sp,
            )
        } else if (uiState.error != null) {
            Text(
                text = uiState.error!!,
                color = colors.danger,
                fontSize = 16.sp,
            )
            FocusableButton(
                text = "Retry",
                onClick = viewModel::refreshCatalog,
            )
        } else if (uiState.activeSource == null) {
            // No sources — nudge to settings
            Text(
                text = "No sources configured",
                color = colors.foregroundMuted,
                fontSize = 18.sp,
            )
            FocusableButton(
                text = "Add Source",
                onClick = onNavigateToSettings,
            )
        } else {
            // Source switcher (only if multiple sources)
            if (uiState.sources.size > 1) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.sources, key = { it.id }) { source ->
                        val isActive = source.id == uiState.activeSource?.id
                        FocusableButton(
                            text = source.label,
                            onClick = { viewModel.switchSource(source.id) },
                            modifier = if (isActive) {
                                Modifier.border(2.dp, colors.accent, RoundedCornerShape(8.dp))
                            } else Modifier,
                        )
                    }
                }
            }

            // Catalog tiles row
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                CatalogTile(
                    title = "Live TV",
                    count = uiState.liveCount,
                    onClick = { onNavigateToBrowse("live") },
                    modifier = Modifier.weight(1f),
                )
                CatalogTile(
                    title = "Movies",
                    count = uiState.vodCount,
                    onClick = { onNavigateToBrowse("vod") },
                    modifier = Modifier.weight(1f),
                )
                CatalogTile(
                    title = "Series",
                    count = uiState.seriesCount,
                    onClick = { onNavigateToBrowse("series") },
                    modifier = Modifier.weight(1f),
                )
            }

            // Continue watching rail (items with playback progress)
            if (uiState.continueWatchingItems.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Continue Watching",
                    color = colors.foreground,
                    fontSize = 18.sp,
                )
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(end = 32.dp),
                ) {
                    items(uiState.continueWatchingItems, key = { "cw_${it.channelId}" }) { item ->
                        ContinueWatchingCard(
                            item = item,
                            onClick = { onNavigateToPlayer(item.channelId) },
                        )
                    }
                }
            }

            // Recent channels rail
            if (uiState.recentChannels.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Recently Watched",
                    color = colors.foreground,
                    fontSize = 18.sp,
                )
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(end = 32.dp),
                ) {
                    items(uiState.recentChannels, key = { it.id }) { snapshot ->
                        RecentChannelCard(
                            snapshot = snapshot,
                            onClick = { onNavigateToPlayer(snapshot.id) },
                        )
                    }
                }
            }
            
            if (uiState.continueWatchingItems.isEmpty() && uiState.recentChannels.isEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Continue Watching",
                    color = colors.foregroundMuted,
                    fontSize = 18.sp,
                )
                Text(
                    text = "Your recent channels will appear here",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                )
            }

            // EPG Spotlight — what's on now (favorite channels)
            if (uiState.epgSpotlight.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Now on Your Favorites",
                    color = colors.foreground,
                    fontSize = 18.sp,
                )
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(end = 32.dp),
                ) {
                    items(uiState.epgSpotlight, key = { it.channel.id }) { item ->
                        EpgSpotlightCard(
                            item = item,
                            onClick = { onNavigateToPlayer(item.channel.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CatalogTile(
    title: String,
    count: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .height(120.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isFocused) colors.surfaceRaised else colors.surface)
            .border(
                width = if (isFocused) 3.dp else 1.dp,
                color = if (isFocused) colors.accent else colors.border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(16.dp),
        ) {
            Text(
                text = title,
                color = if (isFocused) colors.accent else colors.foreground,
                fontSize = 22.sp,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = if (count > 0) "$count channels" else "—",
                color = colors.foregroundMuted,
                fontSize = 14.sp,
            )
        }
    }
}

/**
 * A card showing a VOD/series with a progress bar indicating how far
 * the user has watched.
 */
@Composable
private fun ContinueWatchingCard(
    item: ContinueWatchingItem,
    onClick: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val posterUrl = item.imageUrl

    Column(
        modifier = Modifier
            .width(140.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isFocused) colors.surfaceRaised else colors.surface)
            .border(
                width = if (isFocused) 3.dp else 1.dp,
                color = if (isFocused) colors.accent else colors.border,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .focusable(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Poster / logo
        if (posterUrl != null) {
            AsyncImage(
                model = posterUrl,
                contentDescription = item.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp),
                contentScale = ContentScale.Crop,
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp)
                    .background(colors.backgroundSubtle),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = item.name.take(2).uppercase(),
                    color = colors.foregroundMuted,
                    fontSize = 20.sp,
                )
            }
        }

        // Progress bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(colors.border),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(item.progress)
                    .height(3.dp)
                    .background(colors.accent),
            )
        }

        Text(
            text = item.name,
            color = colors.foreground,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
        )
    }
}

/**
 * A card for a recently watched channel in the Recently Watched rail.
 */
@Composable
private fun RecentChannelCard(
    snapshot: ChannelSnapshot,
    onClick: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val imageUrl = snapshot.displayImageUrl()

    Column(
        modifier = Modifier
            .width(160.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isFocused) colors.surfaceRaised else colors.surface)
            .border(
                width = if (isFocused) 3.dp else 1.dp,
                color = if (isFocused) colors.accent else colors.border,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .focusable(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Logo
        if (imageUrl != null) {
            AsyncImage(
                model = imageUrl,
                contentDescription = snapshot.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
                contentScale = ContentScale.Fit,
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp)
                    .background(colors.backgroundSubtle),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = snapshot.name.take(2).uppercase(),
                    color = colors.foregroundMuted,
                    fontSize = 20.sp,
                )
            }
        }
        Text(
            text = snapshot.name,
            color = colors.foreground,
            fontSize = 13.sp,
            maxLines = 1,
            modifier = Modifier.padding(8.dp),
        )
    }
}

@Composable
private fun EpgSpotlightCard(
    item: EpgSpotlightItem,
    onClick: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .width(220.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isFocused) colors.surfaceRaised else colors.surface)
            .border(
                width = if (isFocused) 3.dp else 0.dp,
                color = if (isFocused) colors.accent else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .focusable()
            .padding(12.dp),
    ) {
        Text(
            text = item.channel.name,
            color = colors.foreground,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (item.nowTitle != null) {
            Text(
                text = "▶ ${item.nowTitle}",
                color = colors.accent,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (item.nextTitle != null) {
            Text(
                text = "Next: ${item.nextTitle}",
                color = colors.foregroundMuted,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
