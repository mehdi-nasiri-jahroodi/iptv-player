package com.iptvtavern.androidtv.ui.navigation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
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
 * Top-level sidebar navigation for the Android TV app.
 *
 * This is the TV equivalent of the web app's top navigation / sidebar.
 * It sits on the left edge and provides four destinations:
 * Live TV, Movies, Series, and Settings.
 *
 * The sidebar uses D-pad Up/Down to navigate items and Right/Select
 * to enter a section. Back button or D-pad Left returns to the sidebar.
 *
 * `rememberSaveable` preserves the selected tab across configuration
 * changes (like React state that survives re-renders).
 */

data class SidebarItem(
    val label: String,
    val icon: ImageVector,
    val route: String,
)

val SIDEBAR_ITEMS = listOf(
    SidebarItem("Live TV", Icons.Filled.LiveTv, Routes.browse("live")),
    SidebarItem("Movies", Icons.Filled.Movie, Routes.browse("vod")),
    SidebarItem("Series", Icons.Filled.VideoLibrary, Routes.browse("series")),
    SidebarItem("Settings", Icons.Filled.Settings, Routes.SETTINGS),
)

@Composable
fun SidebarNavigation(
    selectedIndex: Int,
    onItemSelected: (index: Int, route: String) -> Unit,
    content: @Composable () -> Unit,
) {
    val colors = LuminaTheme.colors

    Row(modifier = Modifier.fillMaxSize()) {
        // Sidebar rail
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .width(72.dp)
                .background(colors.surface)
                .padding(vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // App title at top
            Text(
                text = "TV",
                color = colors.accent,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 16.dp),
            )

            SIDEBAR_ITEMS.forEachIndexed { index, item ->
                SidebarNavItem(
                    item = item,
                    isSelected = index == selectedIndex,
                    onSelect = { onItemSelected(index, item.route) },
                )
            }

            Spacer(modifier = Modifier.weight(1f))
        }

        // Main content area
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .background(colors.background),
        ) {
            content()
        }
    }
}

@Composable
private fun SidebarNavItem(
    item: SidebarItem,
    isSelected: Boolean,
    onSelect: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.1f else 1f,
        label = "sidebarItemScale",
    )

    val iconColor = when {
        isSelected -> colors.accent
        isFocused -> colors.foreground
        else -> colors.foregroundMuted
    }

    val borderColor = when {
        isFocused -> colors.accent
        isSelected -> colors.accent.copy(alpha = 0.4f)
        else -> Color.Transparent
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .scale(scale)
            .border(2.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(8.dp)
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
            tint = iconColor,
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = item.label,
            color = iconColor,
            fontSize = 10.sp,
        )
    }
}
