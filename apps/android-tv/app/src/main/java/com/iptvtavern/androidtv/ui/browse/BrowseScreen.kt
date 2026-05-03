package com.iptvtavern.androidtv.ui.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.parser.inferStreamQualityHints
import com.iptvtavern.androidtv.ui.onboarding.TvTextField
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Browse screen — shows channels by group for a specific kind (live/vod/series).
 *
 * Layout: left sidebar with groups + main area with channel list.
 * D-pad: Left/Right between sidebar and channel list; Up/Down within each.
 *
 * Web equivalent: `apps/web/app/components/browse-view.tsx`
 */
@Composable
fun BrowseScreen(
    kind: String,
    viewModel: BrowseViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    val title = when (kind) {
        "live" -> "Live TV"
        "vod" -> "Movies"
        "series" -> "Series"
        else -> "Browse"
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

    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        // Left sidebar — group list
        GroupsSidebar(
            groups = uiState.groups,
            selectedIndex = uiState.selectedGroupIndex,
            onGroupSelected = viewModel::selectGroup,
            modifier = Modifier
                .width(220.dp)
                .fillMaxHeight(),
        )

        // Main area — search + channel list
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(16.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = title,
                    color = colors.foreground,
                    fontSize = 24.sp,
                )
                Text(
                    text = "${uiState.channels.size} channels",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Search bar
            TvTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::updateSearch,
                placeholder = "Search channels…",
                imeAction = ImeAction.Search,
                modifier = Modifier.padding(bottom = 12.dp),
            )

            // Channel list
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                contentPadding = PaddingValues(bottom = 32.dp),
            ) {
                items(uiState.channels, key = { it.id }) { channel ->
                    ChannelRow(
                        channel = channel,
                        isFavorite = channel.id in uiState.favorites,
                        onSelect = {
                            viewModel.addRecent(channel.id)
                            // Phase 7: navigate to player
                        },
                        onToggleFavorite = { viewModel.toggleFavorite(channel.id) },
                    )
                }
            }
        }
    }
}

/**
 * Left sidebar showing category groups.
 * The selected group is highlighted. D-pad Up/Down navigates groups.
 */
@Composable
private fun GroupsSidebar(
    groups: List<ChannelGroup>,
    selectedIndex: Int,
    onGroupSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors

    LazyColumn(
        modifier = modifier
            .background(colors.surface)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        itemsIndexed(groups, key = { _, g -> g.id }) { index, group ->
            val isSelected = index == selectedIndex
            var isFocused by remember { mutableStateOf(false) }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        when {
                            isFocused -> colors.accent
                            isSelected -> colors.surfaceRaised
                            else -> colors.surface
                        }
                    )
                    .padding(horizontal = 12.dp, vertical = 10.dp)
                    .onFocusChanged {
                        isFocused = it.isFocused
                        // Select group on focus (like web sidebar)
                        if (it.isFocused && index != selectedIndex) {
                            onGroupSelected(index)
                        }
                    }
                    .onKeyEvent { event ->
                        if (event.type == KeyEventType.KeyDown &&
                            (event.key == Key.DirectionCenter || event.key == Key.Enter)
                        ) {
                            onGroupSelected(index)
                            true
                        } else false
                    }
                    .focusable(),
            ) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = group.name,
                        color = when {
                            isFocused -> colors.accentForeground
                            else -> colors.foreground
                        },
                        fontSize = 14.sp,
                        maxLines = 1,
                    )
                    Text(
                        text = "${group.channels.size}",
                        color = when {
                            isFocused -> colors.accentForeground
                            else -> colors.foregroundMuted
                        },
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

/**
 * A single channel row — shows logo, name, quality badge, and favorite indicator.
 *
 * D-pad: Enter/Select plays the channel. Long-press or a heart key toggles favorite.
 * For now, we use a secondary key press to toggle favorites (Phase 6 keeps it simple).
 */
@Composable
private fun ChannelRow(
    channel: Channel,
    isFavorite: Boolean,
    onSelect: () -> Unit,
    onToggleFavorite: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val qualityBadges = remember(channel.name) { inferStreamQualityHints(channel.name) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (isFocused) colors.surfaceRaised else colors.surface)
            .border(
                width = if (isFocused) 2.dp else 0.dp,
                color = if (isFocused) colors.accent else colors.surface,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.key) {
                        Key.DirectionCenter, Key.Enter -> {
                            onSelect()
                            true
                        }
                        // F key toggles favorite (same as web)
                        Key.F -> {
                            onToggleFavorite()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .focusable(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Channel logo
        if (channel.logoUrl != null) {
            AsyncImage(
                model = channel.logoUrl,
                contentDescription = channel.name,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(4.dp)),
                contentScale = ContentScale.Fit,
            )
        } else {
            // Placeholder with initials
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(colors.backgroundSubtle),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = channel.name.take(2).uppercase(),
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                )
            }
        }

        // Channel name
        Text(
            text = channel.name,
            color = colors.foreground,
            fontSize = 16.sp,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )

        // Quality badges
        for (badge in qualityBadges) {
            Text(
                text = badge,
                color = colors.accentForeground,
                fontSize = 10.sp,
                modifier = Modifier
                    .background(colors.accent, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }

        // Favorite indicator
        if (isFavorite) {
            Text(
                text = "★",
                color = colors.accent,
                fontSize = 18.sp,
            )
        }
    }
}
