package com.iptvtavern.androidtv.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ProgressIndicatorDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import kotlinx.coroutines.delay

/**
 * Full-screen blocking overlay shown while the catalog is being fetched
 * for the first time, after a manual refresh, or after a 30-day cache
 * expiry.
 *
 * ## Why blocking
 * The user can't sensibly do anything until the catalog loads —
 * channel lists, search, favorites all depend on it. Letting them
 * navigate around an empty UI would be misleading.
 *
 * ## Why no Cancel button
 * On Android TV, **Back** is always the universal "escape" — every
 * remote has it. Adding a visible Cancel button creates a focus
 * target the user has to D-pad to on a screen they're supposed to
 * be passively waiting on. The overlay swallows D-pad clicks (so
 * the underlying screen can't grab focus) but lets Back propagate
 * normally. The cancellation itself is handled by the caller (the
 * coroutine that emitted progress events gets cancelled and
 * cleanup happens via PlaylistManager's `inFlight` finally block).
 *
 * ## Indeterminate fallback
 * If no progress event arrives for [STALL_THRESHOLD_MS], the bar
 * switches to indeterminate so it doesn't appear frozen — useful
 * when a single endpoint (e.g. `get_vod_streams` for a 60k catalog)
 * takes 20+ seconds.
 *
 * @param visible        Whether the overlay should render at all.
 * @param percent        0..100 weighted progress.
 * @param label          Current step label (e.g. "Fetching movies…").
 * @param indeterminate  Forced indeterminate mode (overrides percent).
 */
@Composable
fun PlaylistLoadOverlay(
    visible: Boolean,
    percent: Int,
    label: String,
    indeterminate: Boolean = false,
) {
    val colors = LuminaTheme.colors

    // Fade in/out so a sub-second cache hit (CacheHit emitted before the
    // overlay even shows) doesn't make the screen flicker.
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        // ── Click/focus swallow ─────────────────────────────────────
        // `clickable` with no-op consumes pointer events; on TV this
        // also keeps focus from reaching the underlying screen because
        // the Box itself is a focusable target. Combined with the dim
        // scrim it visually communicates "you can't interact with what's
        // behind me right now".
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.background.copy(alpha = 0.92f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = { /* swallow */ },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.surface)
                    .border(1.dp, colors.surfaceRaised, RoundedCornerShape(12.dp))
                    .padding(horizontal = 32.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.Start,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = "Loading your catalog",
                    color = colors.foreground,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.SemiBold,
                )

                Spacer(Modifier.height(6.dp))

                Text(
                    text = "This runs once every 30 days, or when you press Refresh.",
                    color = colors.foregroundMuted,
                    fontSize = 13.sp,
                )

                Spacer(Modifier.height(20.dp))

                if (indeterminate) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = colors.accent,
                        trackColor = colors.surfaceRaised,
                        strokeCap = ProgressIndicatorDefaults.LinearStrokeCap,
                    )
                } else {
                    LinearProgressIndicator(
                        progress = { (percent.coerceIn(0, 100)) / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = colors.accent,
                        trackColor = colors.surfaceRaised,
                        strokeCap = ProgressIndicatorDefaults.LinearStrokeCap,
                        gapSize = 0.dp,
                        drawStopIndicator = {},
                    )
                }

                Spacer(Modifier.height(14.dp))

                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Text(
                        text = label,
                        color = colors.foreground,
                        fontSize = 14.sp,
                    )
                    if (!indeterminate) {
                        Text(
                            text = "$percent%",
                            color = colors.accent,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.align(Alignment.CenterEnd),
                        )
                    }
                }
            }
        }
    }
}

/** Suggested time after which a still-active load with no progress events should switch to indeterminate. */
const val STALL_THRESHOLD_MS: Long = 8_000

/**
 * Helper composable that owns the "is the bar stalled?" timer so the
 * overlay's parent doesn't need to manage it. Resets the timer every
 * time [percent] or [label] changes (i.e. every progress event).
 */
@Composable
fun rememberStalledFlag(percent: Int, label: String, active: Boolean): Boolean {
    var stalled by remember { mutableStateOf(false) }
    // `LaunchedEffect(key)` — when any of the keys change, the previous
    // coroutine is cancelled and a new one starts. Equivalent to
    // React's `useEffect(() => {...}, [percent, label, active])` plus
    // automatic cleanup.
    LaunchedEffect(percent, label, active) {
        stalled = false
        if (active) {
            delay(STALL_THRESHOLD_MS)
            stalled = true
        }
    }
    return stalled
}

@Suppress("unused") // referenced from preview tooling
private val PreviewBg = Color(0xFF101015)
