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
    /** Set on index stubs when [channels] is empty (lazy group load). */
    val channelCount: Int = 0,
) {
    /** Count for sorting / UI when channels are not loaded yet. */
    fun effectiveChannelCount(): Int =
        if (channels.isNotEmpty()) channels.size else channelCount
}

@Serializable
data class GroupIndexEntry(
    val id: String,
    val name: String,
    val kind: GroupKind,
    val channelCount: Int,
) {
    fun toStub(): ChannelGroup = ChannelGroup(
        id = id,
        name = name,
        kind = kind,
        channels = emptyList(),
        channelCount = channelCount,
    )
}

/**
 * Sort options for the groups sidebar.
 */
enum class GroupSortKey {
    DEFAULT,  // Provider order (as received)
    NAME,     // Alphabetical A-Z
    SIZE,     // Channel count (largest first)
}

enum class GroupSortDir {
    ASC, DESC
}

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
