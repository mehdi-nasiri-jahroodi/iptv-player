package com.iptvtavern.androidtv.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface WatchedDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: WatchedEntity)

    @Query("SELECT * FROM watched WHERE channelId = :channelId")
    suspend fun getByChannelId(channelId: String): WatchedEntity?

    /** All watched entries for a given series (by parentSeriesId). */
    @Query("SELECT * FROM watched WHERE parentSeriesId = :seriesId")
    suspend fun getBySeriesId(seriesId: String): List<WatchedEntity>

    /** Reactive flow of watched entries for a series — drives UI indicators. */
    @Query("SELECT * FROM watched WHERE parentSeriesId = :seriesId")
    fun observeBySeriesId(seriesId: String): Flow<List<WatchedEntity>>

    /** Most recent items with progress (for "Continue Watching" rail on Home). */
    @Query(
        """
        SELECT * FROM watched 
        WHERE sourceId = :sourceId AND (completed = 0 OR parentSeriesId IS NOT NULL)
        ORDER BY lastWatchedAt DESC 
        LIMIT :limit
        """
    )
    suspend fun getRecentInProgress(sourceId: String, limit: Int = 10): List<WatchedEntity>

    /** All completed episode IDs for a series. */
    @Query("SELECT channelId FROM watched WHERE parentSeriesId = :seriesId AND completed = 1")
    suspend fun getCompletedEpisodeIds(seriesId: String): List<String>

    @Query("DELETE FROM watched WHERE sourceId = :sourceId")
    suspend fun deleteBySourceId(sourceId: String)
}
