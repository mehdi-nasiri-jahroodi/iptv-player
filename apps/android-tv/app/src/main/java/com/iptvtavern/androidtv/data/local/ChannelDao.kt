package com.iptvtavern.androidtv.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

/**
 * DAO for the per-row catalog cache.
 *
 * Reads are typed: `getChannelsByType("live")` only loads live entries
 * for fast cold start of the Live TV browser. The whole-source read is
 * available too via `getAllChannels(sourceId)`.
 *
 * Writes happen in batches inside a transaction so a 60k-movie insert
 * doesn't fire 60k disk syncs.
 */
@Dao
interface ChannelDao {
    // ── Channels ──────────────────────────────────────────────

    @Query(
        "SELECT * FROM channels WHERE sourceId = :sourceId AND type = :type " +
            "ORDER BY groupTitle, orderInGroup"
    )
    suspend fun getChannelsByType(sourceId: String, type: String): List<ChannelEntity>

    @Query(
        "SELECT * FROM channels WHERE sourceId = :sourceId " +
            "ORDER BY groupTitle, orderInGroup"
    )
    suspend fun getAllChannels(sourceId: String): List<ChannelEntity>

    @Query("SELECT COUNT(*) FROM channels WHERE sourceId = :sourceId")
    suspend fun countChannels(sourceId: String): Int

    @Query("SELECT COUNT(*) FROM channels WHERE sourceId = :sourceId AND type = :type")
    suspend fun countChannelsByType(sourceId: String, type: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChannels(channels: List<ChannelEntity>)

    @Query("DELETE FROM channels WHERE sourceId = :sourceId")
    suspend fun deleteChannelsBySource(sourceId: String)

    @Query("DELETE FROM channels")
    suspend fun deleteAllChannels()

    // ── Groups ────────────────────────────────────────────────

    @Query(
        "SELECT * FROM channel_groups WHERE sourceId = :sourceId " +
            "ORDER BY orderIndex"
    )
    suspend fun getGroups(sourceId: String): List<ChannelGroupEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGroups(groups: List<ChannelGroupEntity>)

    @Query("DELETE FROM channel_groups WHERE sourceId = :sourceId")
    suspend fun deleteGroupsBySource(sourceId: String)

    @Query("DELETE FROM channel_groups")
    suspend fun deleteAllGroups()

    // ── Combined operations ───────────────────────────────────

    /**
     * Replace the entire cached catalog for a source atomically.
     * Wrapped in @Transaction so partial writes can't leave the cache
     * in an inconsistent state.
     */
    @Transaction
    suspend fun replaceCatalog(
        sourceId: String,
        groups: List<ChannelGroupEntity>,
        channels: List<ChannelEntity>,
    ) {
        deleteChannelsBySource(sourceId)
        deleteGroupsBySource(sourceId)
        // Insert in chunks to keep memory pressure reasonable for huge catalogs.
        if (groups.isNotEmpty()) insertGroups(groups)
        if (channels.isNotEmpty()) {
            channels.chunked(2_000).forEach { insertChannels(it) }
        }
    }

    @Transaction
    suspend fun deleteCatalog(sourceId: String) {
        deleteChannelsBySource(sourceId)
        deleteGroupsBySource(sourceId)
    }

    /** Cache freshness probe — used to decide whether to skip a network refetch. */
    @Query("SELECT MAX(orderInGroup) FROM channels WHERE sourceId = :sourceId")
    suspend fun anyForSource(sourceId: String): Int?
}
