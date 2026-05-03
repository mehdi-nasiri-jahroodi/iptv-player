package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.iptvtavern.androidtv.domain.model.UserProfile

/**
 * Room entity for persisting user profiles.
 *
 * Favorites and recents are stored as comma-separated strings since Room
 * doesn't natively handle List<String> columns. The `toDomain()` /
 * `fromDomain()` converters handle the transformation.
 */
@Entity(tableName = "profiles")
data class ProfileEntity(
    @PrimaryKey val id: String,
    val name: String,
    /** Comma-separated channel IDs. */
    val favorites: String = "",
    /** Comma-separated channel IDs (most recent first). */
    val recents: String = "",
) {
    fun toDomain(): UserProfile = UserProfile(
        id = id,
        name = name,
        favorites = favorites.split(",").filter { it.isNotBlank() },
        recents = recents.split(",").filter { it.isNotBlank() },
    )

    companion object {
        fun fromDomain(profile: UserProfile): ProfileEntity = ProfileEntity(
            id = profile.id,
            name = profile.name,
            favorites = profile.favorites.joinToString(","),
            recents = profile.recents.joinToString(","),
        )
    }
}
