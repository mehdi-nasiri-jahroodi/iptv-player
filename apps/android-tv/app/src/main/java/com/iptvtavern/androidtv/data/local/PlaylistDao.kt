package com.iptvtavern.androidtv.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlists WHERE sourceId = :sourceId")
    suspend fun getBySourceId(sourceId: String): PlaylistEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(playlist: PlaylistEntity)

    @Query("DELETE FROM playlists WHERE sourceId = :sourceId")
    suspend fun deleteBySourceId(sourceId: String)

    @Query("DELETE FROM playlists")
    suspend fun deleteAll()
}
