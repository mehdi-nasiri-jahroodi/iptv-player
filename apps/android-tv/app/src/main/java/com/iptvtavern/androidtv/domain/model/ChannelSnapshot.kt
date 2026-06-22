package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.Serializable

/**
 * Lightweight display metadata for a channel — enough for Home rails
 * without loading the full catalog into memory.
 */
@Serializable
data class ChannelSnapshot(
    val id: String,
    val name: String,
    val logoUrl: String? = null,
    val posterUrl: String? = null,
    /** `live`, `vod`, or `series`. */
    val kind: String,
) {
    fun displayImageUrl(): String? = posterUrl ?: logoUrl
}

fun Channel.toSnapshot(): ChannelSnapshot = when (this) {
    is Channel.Live -> ChannelSnapshot(id, name, logoUrl, null, "live")
    is Channel.Vod -> ChannelSnapshot(id, name, logoUrl, posterUrl, "vod")
    is Channel.Series -> ChannelSnapshot(id, name, logoUrl, posterUrl, "series")
}
