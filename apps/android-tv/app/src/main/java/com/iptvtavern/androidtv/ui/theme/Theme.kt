package com.iptvtavern.androidtv.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.tv.material3.MaterialTheme

/**
 * IPTV Tavern theme for Android TV — wraps Compose for TV's MaterialTheme
 * and provides Lumina semantic colors via [LocalLuminaColors].
 *
 * Usage:
 * ```
 * LuminaTheme {
 *     val bg = LuminaTheme.colors.background
 *     // ...
 * }
 * ```
 *
 * Think of this like your Tailwind theme provider in React — it wraps
 * the whole app and every composable can read the current colors.
 */
@Composable
fun LuminaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val luminaColors = if (darkTheme) DarkLuminaColors else LightLuminaColors

    CompositionLocalProvider(LocalLuminaColors provides luminaColors) {
        // MaterialTheme gives us baseline typography, shapes, and ripple.
        // We override colors via our own Lumina system, not MaterialTheme's colorScheme.
        MaterialTheme {
            content()
        }
    }
}

/**
 * Convenience accessor — similar to how you'd do `useTheme()` in React.
 *
 * ```kotlin
 * @Composable
 * fun MyCard() {
 *     val colors = LuminaTheme.colors
 *     Box(Modifier.background(colors.surface)) { ... }
 * }
 * ```
 */
object LuminaTheme {
    val colors: LuminaColors
        @Composable
        @ReadOnlyComposable
        get() = LocalLuminaColors.current
}
