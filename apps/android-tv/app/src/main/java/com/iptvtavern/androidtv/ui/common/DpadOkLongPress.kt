package com.iptvtavern.androidtv.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Long-press threshold for the OK/Enter key, in milliseconds. */
private const val OK_LONG_PRESS_MS = 400L

/**
 * Returns a key-event handler that distinguishes a short OK/Enter press
 * (select) from a long press (favorite), for D-pad remotes that have no
 * colored buttons.
 *
 * - Short press (tap)  -> [onShortClick]
 * - Long press (hold)  -> [onLongClick]
 *
 * The handler consumes only OK/Enter events (returns true for them) and
 * returns false for every other key, so callers can keep handling D-pad
 * directions in their own [androidx.compose.ui.input.key.onKeyEvent].
 *
 * Why a manual timer instead of Modifier.combinedClickable: keyboard/DPAD
 * long-press support in clickable modifiers is inconsistent across Compose
 * for TV; tracking KeyDown/KeyUp directly is reliable on every remote.
 */
@Composable
fun rememberOkLongPress(
    onShortClick: () -> Unit,
    onLongClick: () -> Unit,
): (key: Key, type: KeyEventType) -> Boolean {
    val pressJob = remember { mutableStateOf<Job?>(null) }
    val longFired = remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val shortClick by rememberUpdatedState(onShortClick)
    val longClick by rememberUpdatedState(onLongClick)

    return { key, type ->
        val isOk = key == Key.DirectionCenter || key == Key.Enter
        when {
            type == KeyEventType.KeyDown && isOk -> {
                // Only the initial press starts the timer; auto-repeated
                // KeyDown events (held key) are ignored until KeyUp resets.
                if (pressJob.value == null) {
                    longFired.value = false
                    pressJob.value = scope.launch {
                        delay(OK_LONG_PRESS_MS)
                        longFired.value = true
                        longClick()
                    }
                }
                true
            }

            type == KeyEventType.KeyUp && isOk -> {
                pressJob.value?.cancel()
                pressJob.value = null
                if (!longFired.value) shortClick()
                longFired.value = false
                true
            }

            else -> false
        }
    }
}
