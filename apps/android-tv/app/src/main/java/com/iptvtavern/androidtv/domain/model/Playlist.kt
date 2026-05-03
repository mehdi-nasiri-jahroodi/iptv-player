package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.Serializable

/**
 * Catalog — channels grouped by category.
 *
 * Aligned with `contracts.ts#channelGroupSchema` and `playlistSchema`.
 */

@Serializable
enum class GroupKind {
    live, vod, series, mixed
}

@Serializable
data class ChannelGroup(
    val id: String,
    val name: String,
    val kind: GroupKind = GroupKind.mixed,
    val channels: List<Channel> = emptyList(),
)

/**
 * Playlist — a parsed snapshot of a source's channels, grouped by category.
 *
 * `fetchedAt` is an ISO-8601 datetime string (same as Zod's `z.string().datetime()`).
 */
@Serializable
data class Playlist(
    val sourceId: String,
    val groups: List<ChannelGroup> = emptyList(),
    val fetchedAt: String,
)
