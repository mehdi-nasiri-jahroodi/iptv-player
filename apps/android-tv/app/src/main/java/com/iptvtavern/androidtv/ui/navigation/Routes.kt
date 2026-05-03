package com.iptvtavern.androidtv.ui.navigation

/**
 * Route constants for Compose Navigation.
 *
 * Similar to the route strings in React Router / Remix. Each screen
 * in the app maps to one of these routes.
 */
object Routes {
    const val HOME = "home"
    const val BROWSE = "browse/{kind}"
    const val PLAY = "play/{channelId}"
    const val SETTINGS = "settings"
    const val ADD_SOURCE = "add-source"
    const val EDIT_SOURCE = "edit-source/{sourceId}"
    const val ONBOARDING = "onboarding"

    /** Build a browse route for a specific kind (live, vod, series). */
    fun browse(kind: String) = "browse/$kind"

    /** Build a play route for a specific channel. */
    fun play(channelId: String) = "play/$channelId"

    /** Build an edit-source route for a specific source ID. */
    fun editSource(sourceId: String) = "edit-source/$sourceId"
}
