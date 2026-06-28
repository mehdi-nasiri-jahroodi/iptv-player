package com.iptvtavern.androidtv.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Full-screen empty-state placeholder shown when a browse catalog has no
 * items at all (no groups, no channels) — e.g. a test M3U with only live
 * channels, opened on the Movies or Series tab.
 *
 * Matches [LoadingOverlay]'s styling (Lumina tokens, centered) so the
 * loading → empty → error states feel like one family.
 *
 * Web equivalent: the per-list "Nothing here yet" placeholders.
 */
@Composable
fun EmptyState(
    icon: String,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
) {
    val colors = LuminaTheme.colors
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(48.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = icon,
                fontSize = 56.sp,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = title,
                color = colors.foreground,
                fontSize = 24.sp,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = message,
                color = colors.foregroundMuted,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
