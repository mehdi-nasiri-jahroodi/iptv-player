package com.iptvtavern.androidtv.ui.browse

import androidx.compose.runtime.Composable
import com.iptvtavern.androidtv.ui.components.PlaceholderScreen

/**
 * Browse screen — shows channels by group for a specific kind (live/vod/series).
 *
 * Full implementation in Phase 6 (live), Phase 9 (vod), Phase 11 (series).
 * For now: shows a placeholder with the kind.
 */
@Composable
fun BrowseScreen(kind: String) {
    val title = when (kind) {
        "live" -> "Live TV"
        "vod" -> "Movies"
        "series" -> "Series"
        else -> "Browse"
    }
    PlaceholderScreen(
        title = title,
        subtitle = "Channel browser coming in Phase 6",
    )
}
