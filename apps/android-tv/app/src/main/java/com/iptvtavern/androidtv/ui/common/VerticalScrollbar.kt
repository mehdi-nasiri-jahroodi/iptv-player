package com.iptvtavern.androidtv.ui.common

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import kotlin.math.roundToInt

/**
 * Thin vertical scroll indicator for any [LazyListState]-backed list. The thumb
 * size reflects how much of the content is visible and its position reflects
 * scroll progress. Renders nothing while the content fits the viewport.
 *
 * Uses the list's real layout viewport (not a guessed size), so the thumb is
 * sized and positioned accurately. Shared by the series/VOD modal and the Home
 * screen. Place it as an overlay aligned to the end edge inside a [Box].
 */
@Composable
fun VerticalScrollbar(
    listState: LazyListState,
    modifier: Modifier = Modifier,
    width: Dp = 4.dp,
) {
    val colors = LuminaTheme.colors
    val info = listState.layoutInfo
    val visible = info.visibleItemsInfo
    val total = info.totalItemsCount
    if (total == 0 || visible.isEmpty()) return

    val viewportPx = (info.viewportEndOffset - info.viewportStartOffset).coerceAtLeast(1)
    // Items vary in height, so estimate total content size from the first
    // visible item — accurate enough for an indicator.
    val itemPx = visible.first().size.coerceAtLeast(1)
    val totalPx = (total * itemPx).coerceAtLeast(viewportPx)
    if (totalPx <= viewportPx) return

    val thumbFraction = (viewportPx.toFloat() / totalPx.toFloat()).coerceIn(0.05f, 1f)
    val first = visible.first()
    val scrolledPx = (first.index * itemPx - first.offset).coerceAtLeast(0)
    val maxScrollPx = (totalPx - viewportPx).coerceAtLeast(1)
    val scrollFraction = (scrolledPx.toFloat() / maxScrollPx.toFloat()).coerceIn(0f, 1f)

    var trackPx by remember { mutableIntStateOf(0) }

    Box(
        modifier
            .width(width)
            .onSizeChanged { trackPx = it.height }
            .clip(RoundedCornerShape(width / 2))
            .background(colors.surfaceRaised.copy(alpha = 0.3f)),
    ) {
        val usable = (trackPx - trackPx * thumbFraction).coerceAtLeast(0f)
        val thumbOffsetPx = (scrollFraction * usable).roundToInt()
        Box(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(thumbFraction)
                .offset { IntOffset(0, thumbOffsetPx) }
                .clip(RoundedCornerShape(width / 2))
                .background(colors.accent.copy(alpha = 0.7f)),
        )
    }
}

/**
 * [ScrollState]-backed variant for `verticalScroll` columns. Uses the exact
 * scroll range (no item-size estimation), so the thumb is stable and accurate
 * for screens with variable-height content like Home. Place as a sibling of the
 * scrollable column with `fillMaxHeight` so the track measures the viewport.
 */
@Composable
fun VerticalScrollbar(
    scrollState: ScrollState,
    modifier: Modifier = Modifier,
    width: Dp = 4.dp,
) {
    val colors = LuminaTheme.colors
    var trackPx by remember { mutableIntStateOf(0) }
    // Read in composable scope so scroll changes recompose and the thumb moves.
    val maxOffset = scrollState.maxValue
    val value = scrollState.value

    Box(
        modifier
            .width(width)
            .onSizeChanged { trackPx = it.height }
            .clip(RoundedCornerShape(width / 2))
            .background(colors.surfaceRaised.copy(alpha = 0.3f)),
    ) {
        if (maxOffset > 0 && trackPx > 0) {
            // Content height = viewport (trackPx) + max scrollable offset.
            val thumbFraction = (trackPx.toFloat() / (trackPx + maxOffset))
                .coerceIn(0.05f, 1f)
            val usable = (trackPx - trackPx * thumbFraction).coerceAtLeast(0f)
            val scrollFraction = value.toFloat() / maxOffset
            val thumbOffsetPx = (scrollFraction * usable).roundToInt()
            Box(
                Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(thumbFraction)
                    .offset { IntOffset(0, thumbOffsetPx) }
                    .clip(RoundedCornerShape(width / 2))
                    .background(colors.accent.copy(alpha = 0.7f)),
            )
        }
    }
}
