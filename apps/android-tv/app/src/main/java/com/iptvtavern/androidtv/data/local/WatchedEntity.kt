package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Tracks playback progress for VOD and series episodes.
 *
 * Think of this like a `localStorage` entry per video that remembers
 * where you left off and whether you finished it.
 *
 * @param channelId The channel or episode ID (e.g. "vod:123" or "xtream:series:5:ep:42").
 * @param sourceId The source this belongs to — so clearing a source clears its history.
 * @param parentSeriesId For series episodes, the series channel ID (e.g. "xtream:series:5").
 *                       Null for standalone VOD items.
 * @param positionMs Last playback position in milliseconds.
 * @param durationMs Total duration in milliseconds (0 if unknown).
 * @param completed True when the user watched ≥90% of the content.
 * @param lastWatchedAt Epoch millis of when this was last played.
 */
@Entity(tableName = "watched")
data class WatchedEntity(
    @PrimaryKey val channelId: String,
    val sourceId: String,
    val parentSeriesId: String? = null,
    /** Display title for Continue Watching (no catalog lookup). */
    val channelName: String = "",
    /** Poster or logo URL for Continue Watching. */
    val imageUrl: String? = null,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val completed: Boolean = false,
    val lastWatchedAt: Long = System.currentTimeMillis(),
)
