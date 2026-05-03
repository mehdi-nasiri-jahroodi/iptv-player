package com.iptvtavern.androidtv.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * DAO for the `sources` table.
 *
 * DAOs are Room's equivalent of a repository pattern at the database level —
 * they define the SQL operations as suspend functions (coroutines) or Flow
 * (reactive streams, similar to Zustand subscriptions or RxJS observables).
 */
@Dao
interface SourceDao {
    @Query("SELECT * FROM sources")
    fun getAll(): Flow<List<SourceEntity>>

    @Query("SELECT * FROM sources WHERE id = :id")
    suspend fun getById(id: String): SourceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(source: SourceEntity)

    @Update
    suspend fun update(source: SourceEntity)

    @Delete
    suspend fun delete(source: SourceEntity)

    @Query("DELETE FROM sources WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM sources")
    suspend fun getAllOnce(): List<SourceEntity>

    @Query("DELETE FROM sources")
    suspend fun deleteAll()
}
