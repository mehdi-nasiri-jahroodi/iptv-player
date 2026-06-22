package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.iptvtavern.androidtv.domain.model.ChannelSnapshot
import com.iptvtavern.androidtv.domain.model.UserProfile
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Room entity for persisting user profiles.
 *
 * Favorites and recents are stored as comma-separated strings since Room
 * doesn't natively handle List<String> columns. Recent display snapshots
 * are stored as a JSON array string.
 */
@Entity(tableName = "profiles")
data class ProfileEntity(
    @PrimaryKey val id: String,
    val name: String,
    /** Comma-separated channel IDs. */
    val favorites: String = "",
    /** Comma-separated channel IDs (most recent first). */
    val recents: String = "",
    /** JSON array of [ChannelSnapshot] for Home recents rail. */
    val recentSnapshotsJson: String = "[]",
) {
    fun toDomain(): UserProfile {
        val snapshots = try {
            json.decodeFromString<List<ChannelSnapshot>>(recentSnapshotsJson)
        } catch (_: Throwable) {
            emptyList()
        }
        return UserProfile(
            id = id,
            name = name,
            favorites = favorites.split(",").filter { it.isNotBlank() },
            recents = recents.split(",").filter { it.isNotBlank() },
            recentSnapshots = snapshots,
        )
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun fromDomain(profile: UserProfile): ProfileEntity = ProfileEntity(
            id = profile.id,
            name = profile.name,
            favorites = profile.favorites.joinToString(","),
            recents = profile.recents.joinToString(","),
            recentSnapshotsJson = json.encodeToString(profile.recentSnapshots),
        )
    }
}
