package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.Index

/**
 * Per-channel row in the cached catalog.
 *
 * This replaces the previous "one giant JSON blob per source" approach.
 * For an 85k-channel catalog, that blob took 10-30 seconds to deserialize
 * on cold start. With one row per channel, SQLite reads are millisecond-fast
 * and we only have to JSON-parse the small per-channel `payloadJson` (which
 * holds type-specific extras like `posterUrl`, `seasons`, etc).
 *
 * The composite primary key `(sourceId, channelId)` lets the same channel
 * id exist across multiple sources without collision.
 *
 * Indexes:
 *  - `(sourceId, type)` lets Live TV / Movies / Series each read only their
 *    own slice of the catalog instead of scanning all 85k rows.
 *  - `(sourceId, groupTitle)` speeds up reads "give me all channels in
 *    group X" if we ever do that lookup pattern.
 */
@Entity(
    tableName = "channels",
    primaryKeys = ["sourceId", "channelId"],
    indices = [
        Index(value = ["sourceId", "type"]),
        Index(value = ["sourceId", "groupTitle"]),
    ],
)
data class ChannelEntity(
    val sourceId: String,
    val channelId: String,
    /** Discriminator: "live" | "vod" | "series" — matches Channel sealed class. */
    val type: String,
    val name: String,
    val groupTitle: String,
    val streamUrl: String,
    val logoUrl: String?,
    /**
     * JSON of the *full* Channel object. We could split every field into
     * its own column, but most fields are type-specific (posterUrl exists
     * only on Vod/Series, tvgId only on Live, seasons only on Series).
     * Keeping the original Channel JSON here means deserialization gives
     * us the exact domain type back — no manual mapping needed.
     *
     * For an individual channel this is small (a few KB even for series
     * with hundreds of episodes). Parsing 9k of these is microseconds-each.
     */
    val payloadJson: String,
    /**
     * Sort order within the group, captured at write time so we can
     * preserve playlist ordering when reading back.
     */
    val orderInGroup: Int,
)
