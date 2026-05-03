package com.iptvtavern.androidtv.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic color roles mapped from packages/config/tokens/iptv-semantic-colors.json.
 *
 * These are the only colors you should use in composables — never reference
 * raw Material default palette colors or arbitrary hex values.
 *
 * Access via: LuminaTheme.colors.background, LuminaTheme.colors.accent, etc.
 */
@Immutable
data class LuminaColors(
    val background: Color,
    val backgroundSubtle: Color,
    val foreground: Color,
    val foregroundMuted: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val accent: Color,
    val accentForeground: Color,
    val border: Color,
    val borderStrong: Color,
    val danger: Color,
    val dangerForeground: Color,
)

/**
 * Light color scheme — semantic roles → light palette refs.
 *
 * Mappings from iptv-semantic-colors.json "light" branch:
 *   background.DEFAULT   → light.neutral.5
 *   background.subtle    → light.neutral.4
 *   foreground.DEFAULT   → light.neutral.1
 *   foreground.muted     → light.neutral.3
 *   surface.DEFAULT      → light.neutral.5
 *   surface.raised       → light.neutral.4
 *   accent.DEFAULT       → light.turquoise.3
 *   accent.foreground    → light.neutral.5
 *   border.DEFAULT       → light.neutral.4
 *   border.strong        → light.neutral.3
 *   danger.DEFAULT       → light.red.1
 *   danger.foreground    → light.neutral.5
 */
val LightLuminaColors = LuminaColors(
    background = LuminaPalette.LumNeutral5Light,
    backgroundSubtle = LuminaPalette.LumNeutral4Light,
    foreground = LuminaPalette.LumNeutral1Light,
    foregroundMuted = LuminaPalette.LumNeutral3Light,
    surface = LuminaPalette.LumNeutral5Light,
    surfaceRaised = LuminaPalette.LumNeutral4Light,
    accent = LuminaPalette.LumTurquoise3Light,
    accentForeground = LuminaPalette.LumNeutral5Light,
    border = LuminaPalette.LumNeutral4Light,
    borderStrong = LuminaPalette.LumNeutral3Light,
    danger = LuminaPalette.LumRed1Light,
    dangerForeground = LuminaPalette.LumNeutral5Light,
)

/**
 * Dark color scheme — semantic roles → dark palette refs.
 *
 * Mappings from iptv-semantic-colors.json "dark" branch:
 *   background.DEFAULT   → dark.neutral.5
 *   background.subtle    → dark.neutral.4
 *   foreground.DEFAULT   → dark.neutral.1
 *   foreground.muted     → dark.neutral.3
 *   surface.DEFAULT      → dark.ebony.5
 *   surface.raised       → dark.ebony.4
 *   accent.DEFAULT       → dark.turquoise.2
 *   accent.foreground    → dark.neutral.5
 *   border.DEFAULT       → dark.ebony.4
 *   border.strong        → dark.neutral.3
 *   danger.DEFAULT       → dark.red.1
 *   danger.foreground    → dark.neutral.5
 */
val DarkLuminaColors = LuminaColors(
    background = LuminaPalette.LumNeutral5Dark,
    backgroundSubtle = LuminaPalette.LumNeutral4Dark,
    foreground = LuminaPalette.LumNeutral1Dark,
    foregroundMuted = LuminaPalette.LumNeutral3Dark,
    surface = LuminaPalette.LumEbony5Dark,
    surfaceRaised = LuminaPalette.LumEbony4Dark,
    accent = LuminaPalette.LumTurquoise2Dark,
    accentForeground = LuminaPalette.LumNeutral5Dark,
    border = LuminaPalette.LumEbony4Dark,
    borderStrong = LuminaPalette.LumNeutral3Dark,
    danger = LuminaPalette.LumRed1Dark,
    dangerForeground = LuminaPalette.LumNeutral5Dark,
)

/** CompositionLocal so any composable can read LuminaTheme.colors */
val LocalLuminaColors = staticCompositionLocalOf { DarkLuminaColors }
