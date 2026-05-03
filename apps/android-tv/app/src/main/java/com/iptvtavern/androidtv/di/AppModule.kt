package com.iptvtavern.androidtv.di

import android.content.Context
import androidx.room.Room
import com.iptvtavern.androidtv.data.local.AppDatabase
import com.iptvtavern.androidtv.data.local.PlaylistDao
import com.iptvtavern.androidtv.data.local.ProfileDao
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.local.SourceDao
import com.iptvtavern.androidtv.data.local.WatchedDao
import com.iptvtavern.androidtv.data.local.settingsDataStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import javax.inject.Singleton

/**
 * Hilt module that provides database, DAOs, DataStore, and Json instances.
 *
 * Hilt is Android's recommended DI framework — think of it like a
 * compile-time version of React Context. Instead of passing dependencies
 * through props (or context), you annotate classes with @Inject and Hilt
 * wires everything together at build time.
 *
 * @InstallIn(SingletonComponent) means these instances live for the
 * entire app lifetime (like a top-level React Context provider).
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "iptv_tavern.db",
        )
            // During development, allow destructive migration so schema
            // changes don't crash the app. Replace with proper migrations
            // before release.
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideSourceDao(db: AppDatabase): SourceDao = db.sourceDao()

    @Provides
    fun provideProfileDao(db: AppDatabase): ProfileDao = db.profileDao()

    @Provides
    fun providePlaylistDao(db: AppDatabase): PlaylistDao = db.playlistDao()

    @Provides
    fun provideWatchedDao(db: AppDatabase): WatchedDao = db.watchedDao()

    @Provides
    @Singleton
    fun provideSettingsDataStore(@ApplicationContext context: Context): SettingsDataStore {
        return SettingsDataStore(context.settingsDataStore)
    }

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }
}
