package com.iptvtavern.androidtv.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Full-area loading overlay for the grid/list region.
 *
 * - Dark semi-transparent scrim over the whole host Box → clearly signals
 *   "content is loading" without hiding what's behind it.
 * - Centered pill with a large animated spinner + "Loading" label → easy
 *   to see from across the room.
 *
 * The scrim is **not** `clickable` and **not** `focusable`, so D-pad focus
 * and pointer events still reach the grid items behind it — the user can
 * keep navigating the (stale) grid while the new group's content loads.
 */
@Composable
fun LoadingOverlay(modifier: Modifier = Modifier, label: String = "Loading") {
    val colors = LuminaTheme.colors
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f)),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .background(
                    color = colors.surface,
                    shape = RoundedCornerShape(12.dp),
                )
                .border(
                    width = 1.dp,
                    color = colors.border,
                    shape = RoundedCornerShape(12.dp),
                )
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                strokeWidth = 3.dp,
                color = colors.accent,
            )
            Text(
                text = label,
                color = colors.foreground,
                fontSize = 16.sp,
            )
        }
    }
}
