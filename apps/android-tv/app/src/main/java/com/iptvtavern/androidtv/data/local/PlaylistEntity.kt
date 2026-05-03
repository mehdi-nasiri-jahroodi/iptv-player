package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room entity for caching parsed playlists as serialized JSON.
 *
 * Rather than normalizing the full playlist (groups → channels → episodes)
 * into many Room tables, we store the serialized JSON blob. This keeps
 * Phase 2 simple — the playlist is a cache, not a primary data source.
 *
 * `fetchedAt` is ISO-8601 for cache-freshness checks.
 */
@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val sourceId: String,
    /** Serialized JSON of the Playlist domain model. */
    val playlistJson: String,
    val fetchedAt: String,
)
