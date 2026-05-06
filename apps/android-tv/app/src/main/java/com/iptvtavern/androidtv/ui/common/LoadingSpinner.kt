package com.iptvtavern.androidtv.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Full-area overlay with a centered "Loading…" label over a
 * semi-transparent background. Place this in a Box on top of
 * the content that is loading.
 */
@Composable
fun LoadingOverlay(modifier: Modifier = Modifier) {
    val colors = LuminaTheme.colors
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background.copy(alpha = 0.6f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Loading…",
            color = colors.foregroundMuted,
            fontSize = 16.sp,
        )
    }
}
