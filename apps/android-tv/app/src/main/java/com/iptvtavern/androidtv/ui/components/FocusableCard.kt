package com.iptvtavern.androidtv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * A focusable card with visible focus indicator for TV D-pad navigation.
 *
 * When focused:
 * - Shows a 3dp accent-colored border
 * - Scales up to 1.05x (subtle zoom effect visible from 10ft)
 *
 * This is similar to using `useFocusable()` from Norigin Spatial Navigation
 * in the web app — it manages focus state and renders a visual indicator.
 *
 * @param modifier  Additional modifiers applied to the outer Box.
 * @param focusedBorderColor  Border color when focused. Defaults to accent.
 * @param onClick  Called when user presses Select/Enter on this card.
 * @param content  Content rendered inside the card.
 */
@Composable
fun FocusableCard(
    modifier: Modifier = Modifier,
    focusedBorderColor: Color? = null,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val colors = LuminaTheme.colors
    val borderColor = focusedBorderColor ?: colors.accent
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.05f else 1f,
        label = "focusScale",
    )

    Box(
        modifier = modifier
            .scale(scale)
            .then(
                if (isFocused) {
                    Modifier.border(3.dp, borderColor, RoundedCornerShape(8.dp))
                } else {
                    Modifier.border(3.dp, Color.Transparent, RoundedCornerShape(8.dp))
                }
            )
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .padding(4.dp),
    ) {
        content()
    }
}
