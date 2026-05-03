package com.iptvtavern.androidtv.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Top tab navigation bar for the Android TV app.
 *
 * Replaces the left sidebar to give more horizontal space for the
 * groups sidebar + channel table layout. Like YouTube TV or Plex,
 * the tabs sit at the top and the user D-pads up to reach them.
 *
 * Web equivalent: `apps/web/app/layout/app-nav.tsx`
 */

data class TabItem(
    val label: String,
    val icon: ImageVector,
    val route: String,
)

val TAB_ITEMS = listOf(
    TabItem("Home", Icons.Filled.Home, Routes.HOME),
    TabItem("Live TV", Icons.Filled.LiveTv, Routes.browse("live")),
    TabItem("Movies", Icons.Filled.Movie, Routes.browse("vod")),
    TabItem("Series", Icons.Filled.VideoLibrary, Routes.browse("series")),
    TabItem("Guide", Icons.Filled.Schedule, Routes.EPG),
    TabItem("Settings", Icons.Filled.Settings, Routes.SETTINGS),
)

@Composable
fun TopTabNavigation(
    selectedIndex: Int,
    onItemSelected: (index: Int, route: String) -> Unit,
    content: @Composable () -> Unit,
) {
    val colors = LuminaTheme.colors

    Column(modifier = Modifier.fillMaxSize()) {
        // Tab bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .background(colors.surface)
                .padding(horizontal = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // App brand
            Text(
                text = "Lumina",
                color = colors.accent,
                fontSize = 16.sp,
                modifier = Modifier.padding(end = 24.dp),
            )

            TAB_ITEMS.forEachIndexed { index, item ->
                TabNavItem(
                    item = item,
                    isSelected = index == selectedIndex,
                    onSelect = { onItemSelected(index, item.route) },
                )
            }

            // Push date/time to the right
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f))

            // Date & time
            val currentTime = rememberUpdatingTime()
            Text(
                text = currentTime,
                color = colors.foregroundMuted,
                fontSize = 14.sp,
            )
        }

        // Main content area
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(colors.background),
        ) {
            content()
        }
    }
}

@Composable
private fun TabNavItem(
    item: TabItem,
    isSelected: Boolean,
    onSelect: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    val bgColor = when {
        isSelected && isFocused -> colors.accent
        isSelected -> colors.accent.copy(alpha = 0.2f)
        isFocused -> colors.surfaceRaised
        else -> Color.Transparent
    }

    val textColor = when {
        isSelected && isFocused -> colors.accentForeground
        isSelected -> colors.accent
        isFocused -> colors.foreground
        else -> colors.foregroundMuted
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .background(bgColor, RoundedCornerShape(8.dp))
            .then(
                if (isFocused) Modifier.border(2.dp, colors.accent, RoundedCornerShape(8.dp))
                else Modifier
            )
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onSelect()
                    true
                } else false
            }
            .focusable(),
    ) {
        Icon(
            imageVector = item.icon,
            contentDescription = item.label,
            tint = textColor,
            modifier = Modifier.height(20.dp),
        )
        Text(
            text = item.label,
            color = textColor,
            fontSize = 14.sp,
        )
    }
}

/**
 * Returns a formatted date/time string that updates every minute.
 * Format: "Mon, Jan 5 · 3:42 PM" (no year).
 */
@Composable
private fun rememberUpdatingTime(): String {
    var time by remember {
        mutableStateOf(formatCurrentTime())
    }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(30_000L) // update every 30s
            time = formatCurrentTime()
        }
    }
    return time
}

private fun formatCurrentTime(): String {
    val now = java.time.LocalDateTime.now()
    val formatter = java.time.format.DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a")
    return now.format(formatter)
}
