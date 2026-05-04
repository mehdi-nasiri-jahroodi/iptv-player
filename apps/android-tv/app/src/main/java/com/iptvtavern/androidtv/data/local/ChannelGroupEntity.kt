package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.Index

/**
 * Per-group row in the cached catalog.
 *
 * Stored separately from channels so we can list group names without
 * loading every channel. The `orderIndex` preserves playlist ordering.
 *
 * Channels reference their group by `groupTitle` (string match) — this
 * matches how the M3U/Xtream parsers already shape data.
 */
@Entity(
    tableName = "channel_groups",
    primaryKeys = ["sourceId", "groupId"],
    indices = [Index(value = ["sourceId"])],
)
data class ChannelGroupEntity(
    val sourceId: String,
    val groupId: String,
    val name: String,
    /** "live" | "vod" | "series" | "mixed" — matches GroupKind enum. */
    val kind: String,
    val orderIndex: Int,
)
