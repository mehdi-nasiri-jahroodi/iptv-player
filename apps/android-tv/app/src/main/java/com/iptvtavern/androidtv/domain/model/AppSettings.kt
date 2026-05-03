package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.Serializable

/**
 * App-level settings.
 *
 * Aligned with `contracts.ts#appSettingsSchema`.
 * Persisted via DataStore (key-value), not Room.
 *
 * Web equivalent: Zustand settings store backed by localStorage.
 * Android equivalent: DataStore Preferences.
 */

@Serializable
enum class AppTheme {
    light, dark, system
}

@Serializable
enum class PlayerBufferMode {
    balanced, aggressive, conservative
}

@Serializable
data class AppSettings(
    val theme: AppTheme = AppTheme.system,
    val playerBufferMode: PlayerBufferMode = PlayerBufferMode.balanced,
    val autoPlay: Boolean = false,
)
