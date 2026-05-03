package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.WatchedDao
import com.iptvtavern.androidtv.data.local.WatchedEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for tracking watched progress on VOD and series episodes.
 *
 * Web parallel: this is like a Zustand "watched" store slice that persists
 * to IndexedDB. Each video gets a row with its position and completion status.
 */
@Singleton
class WatchedRepository @Inject constructor(
    private val watchedDao: WatchedDao,
) {
    companion object {
        /** Consider a video "completed" if ≥90% was watched. */
        private const val COMPLETION_THRESHOLD = 0.90
    }

    /**
     * Save playback progress. Automatically marks completed if ≥90%.
     */
    suspend fun saveProgress(
        channelId: String,
        sourceId: String,
        positionMs: Long,
        durationMs: Long,
        parentSeriesId: String? = null,
    ) {
        val completed = durationMs > 0 && positionMs.toDouble() / durationMs >= COMPLETION_THRESHOLD
        watchedDao.upsert(
            WatchedEntity(
                channelId = channelId,
                sourceId = sourceId,
                parentSeriesId = parentSeriesId,
                positionMs = positionMs,
                durationMs = durationMs,
                completed = completed,
                lastWatchedAt = System.currentTimeMillis(),
            )
        )
    }

    /** Mark an item as fully completed (e.g., user watched to the end). */
    suspend fun markCompleted(channelId: String, sourceId: String, parentSeriesId: String? = null) {
        val existing = watchedDao.getByChannelId(channelId)
        watchedDao.upsert(
            (existing ?: WatchedEntity(channelId = channelId, sourceId = sourceId, parentSeriesId = parentSeriesId))
                .copy(completed = true, lastWatchedAt = System.currentTimeMillis())
        )
    }

    /** Get saved position for resuming playback. Returns 0 if nothing saved or if completed. */
    suspend fun getResumePosition(channelId: String): Long {
        val entity = watchedDao.getByChannelId(channelId) ?: return 0
        // If completed, start from beginning on re-watch
        return if (entity.completed) 0 else entity.positionMs
    }

    /** Check if a specific item has been completed. */
    suspend fun isCompleted(channelId: String): Boolean {
        return watchedDao.getByChannelId(channelId)?.completed == true
    }

    /** Get all completed episode IDs for a series. */
    suspend fun getCompletedEpisodeIds(seriesId: String): List<String> {
        return watchedDao.getCompletedEpisodeIds(seriesId)
    }

    /** Reactive flow of watched entries for a series (for UI indicators). */
    fun observeWatchedForSeries(seriesId: String): Flow<List<WatchedEntity>> {
        return watchedDao.observeBySeriesId(seriesId)
    }

    /** Get recent items with progress for "Continue Watching" rail. */
    suspend fun getRecentInProgress(sourceId: String, limit: Int = 10): List<WatchedEntity> {
        return watchedDao.getRecentInProgress(sourceId, limit)
    }
}
