package com.iptvtavern.androidtv.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.iptvtavern.androidtv.domain.model.AppSettings
import com.iptvtavern.androidtv.domain.model.AppTheme
import com.iptvtavern.androidtv.domain.model.PlayerBufferMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * DataStore-backed persistence for AppSettings.
 *
 * DataStore is Android's replacement for SharedPreferences — it's like
 * a typed, async version of localStorage. Unlike Room (which is for
 * structured/relational data), DataStore is ideal for simple key-value
 * settings.
 *
 * The `preferencesDataStore` delegate creates a single DataStore instance
 * tied to the given name. The file lives at:
 *   /data/data/com.iptvtavern.androidtv/files/datastore/app_settings.preferences_pb
 */

// Extension property — creates the DataStore instance on the Context.
// This is a top-level declaration (like a module-level variable in JS).
val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "app_settings"
)

class SettingsDataStore(private val dataStore: DataStore<Preferences>) {

    private companion object {
        val THEME = stringPreferencesKey("theme")
        val PLAYER_BUFFER_MODE = stringPreferencesKey("player_buffer_mode")
        val AUTO_PLAY = booleanPreferencesKey("auto_play")
    }

    /**
     * Reactive stream of AppSettings — emits whenever any setting changes.
     * Similar to a Zustand store subscription.
     */
    val settings: Flow<AppSettings> = dataStore.data.map { prefs ->
        AppSettings(
            theme = prefs[THEME]?.let { parseTheme(it) } ?: AppTheme.system,
            playerBufferMode = prefs[PLAYER_BUFFER_MODE]?.let { parseBufferMode(it) }
                ?: PlayerBufferMode.balanced,
            autoPlay = prefs[AUTO_PLAY] ?: false,
        )
    }

    suspend fun updateTheme(theme: AppTheme) {
        dataStore.edit { prefs -> prefs[THEME] = theme.name }
    }

    suspend fun updatePlayerBufferMode(mode: PlayerBufferMode) {
        dataStore.edit { prefs -> prefs[PLAYER_BUFFER_MODE] = mode.name }
    }

    suspend fun updateAutoPlay(autoPlay: Boolean) {
        dataStore.edit { prefs -> prefs[AUTO_PLAY] = autoPlay }
    }

    private fun parseTheme(value: String): AppTheme = try {
        AppTheme.valueOf(value)
    } catch (_: IllegalArgumentException) {
        AppTheme.system
    }

    private fun parseBufferMode(value: String): PlayerBufferMode = try {
        PlayerBufferMode.valueOf(value)
    } catch (_: IllegalArgumentException) {
        PlayerBufferMode.balanced
    }
}
