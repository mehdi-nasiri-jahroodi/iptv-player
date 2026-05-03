package com.iptvtavern.androidtv.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Reusable placeholder screen for routes that aren't built yet.
 * Shows a title + subtitle centered on a Lumina background.
 */
@Composable
fun PlaceholderScreen(
    title: String,
    subtitle: String,
    onBack: (() -> Unit)? = null,
) {
    val colors = LuminaTheme.colors

    if (onBack != null) {
        BackHandler(onBack = onBack)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(32.dp),
        ) {
            Text(
                text = title,
                color = colors.accent,
                fontSize = 28.sp,
            )
            Text(
                text = subtitle,
                color = colors.foregroundMuted,
                fontSize = 16.sp,
            )
        }
    }
}
