package com.iptvtavern.androidtv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Home screen — the launcher / dashboard.
 *
 * Shows catalog tiles (Live TV, Movies, Series) with channel counts
 * and a "Continue watching" rail. Full implementation in Phase 6.
 *
 * For now: shows the three catalog tiles as focusable cards.
 */
@Composable
fun HomeScreen(
    onNavigateToBrowse: (kind: String) -> Unit,
    onNavigateToSettings: () -> Unit,
) {
    val colors = LuminaTheme.colors

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = "Home",
            color = colors.foreground,
            fontSize = 28.sp,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Catalog tiles row
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CatalogTile(
                title = "Live TV",
                subtitle = "Channels",
                onClick = { onNavigateToBrowse("live") },
                modifier = Modifier.weight(1f),
            )
            CatalogTile(
                title = "Movies",
                subtitle = "VOD",
                onClick = { onNavigateToBrowse("vod") },
                modifier = Modifier.weight(1f),
            )
            CatalogTile(
                title = "Series",
                subtitle = "TV Shows",
                onClick = { onNavigateToBrowse("series") },
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Continue watching placeholder
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
}

@Composable
private fun CatalogTile(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    val bgColor = if (isFocused) colors.surfaceRaised else colors.surface
    val borderColor = if (isFocused) colors.accent else colors.border

    Box(
        modifier = modifier
            .height(120.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .then(
                if (isFocused) {
                    Modifier
                        .clip(RoundedCornerShape(12.dp))
                } else Modifier
            )
            .padding(2.dp)
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
                text = subtitle,
                color = colors.foregroundMuted,
                fontSize = 14.sp,
            )
        }
    }
}
