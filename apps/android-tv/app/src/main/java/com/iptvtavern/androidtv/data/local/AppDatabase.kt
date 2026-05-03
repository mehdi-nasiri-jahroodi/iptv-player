package com.iptvtavern.androidtv.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

/**
 * Room database for IPTV Tavern.
 *
 * Room is Android's SQLite wrapper — think of it like a typed IndexedDB.
 * The `@Database` annotation tells Room which entities (tables) to create
 * and provides access to DAOs (data access objects).
 *
 * Version 1 = initial schema. If you change entities later, bump the version
 * and add a migration (or use `fallbackToDestructiveMigration()` during dev).
 */
@Database(
    entities = [
        SourceEntity::class,
        ProfileEntity::class,
        PlaylistEntity::class,
        WatchedEntity::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sourceDao(): SourceDao
    abstract fun profileDao(): ProfileDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun watchedDao(): WatchedDao
}
