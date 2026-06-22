package com.iptvtavern.androidtv.ui.navigation

import android.net.Uri

/**
 * Route constants for Compose Navigation.
 *
 * Similar to the route strings in React Router / Remix. Each screen
 * in the app maps to one of these routes.
 */
object Routes {
    const val HOME = "home"
    /** Separate routes so saveState/restoreState works per tab (live vs movies vs series). */
    const val BROWSE_LIVE = "browse/live"
    const val BROWSE_VOD = "browse/vod"
    const val BROWSE_SERIES = "browse/series"
    const val PLAY = "play/{channelId}"
    const val SETTINGS = "settings"
    const val ADD_SOURCE = "add-source"
    const val EDIT_SOURCE = "edit-source/{sourceId}"
    const val ONBOARDING = "onboarding"
    const val EPG = "epg"

    /** Build a browse route for a specific kind (live, vod, series). */
    fun browse(kind: String): String = when (kind) {
        "vod" -> BROWSE_VOD
        "series" -> BROWSE_SERIES
        else -> BROWSE_LIVE
    }

    /** Build a play route for a specific channel. */
    fun play(channelId: String) = "play/${Uri.encode(channelId)}"

    /** Build an edit-source route for a specific source ID. */
    fun editSource(sourceId: String) = "edit-source/${Uri.encode(sourceId)}"
}
