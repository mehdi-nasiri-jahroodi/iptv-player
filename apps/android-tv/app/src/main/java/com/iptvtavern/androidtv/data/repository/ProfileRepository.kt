package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.ProfileDao
import com.iptvtavern.androidtv.data.local.ProfileEntity
import com.iptvtavern.androidtv.domain.model.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing user profiles (favorites, recents).
 *
 * For v1 there is a single "default" profile. Multi-profile support
 * is a post-MVP feature.
 */
@Singleton
class ProfileRepository @Inject constructor(
    private val profileDao: ProfileDao,
) {
    companion object {
        const val DEFAULT_PROFILE_ID = "default"
        private const val MAX_RECENTS = 20
    }

    /** Reactive stream of all profiles. */
    val profiles: Flow<List<UserProfile>> = profileDao.getAll().map { entities ->
        entities.map { it.toDomain() }
    }

    suspend fun getDefaultProfile(): UserProfile {
        return profileDao.getById(DEFAULT_PROFILE_ID)?.toDomain()
            ?: UserProfile(id = DEFAULT_PROFILE_ID, name = "User")
    }

    suspend fun createOrUpdate(profile: UserProfile) {
        profileDao.insert(ProfileEntity.fromDomain(profile))
    }

    suspend fun updateName(name: String) {
        val profile = getDefaultProfile()
        createOrUpdate(profile.copy(name = name))
    }

    // ── Favorites ───────────────────────────────────────────────

    suspend fun toggleFavorite(channelId: String) {
        val profile = getDefaultProfile()
        val updated = if (channelId in profile.favorites) {
            profile.copy(favorites = profile.favorites - channelId)
        } else {
            profile.copy(favorites = profile.favorites + channelId)
        }
        createOrUpdate(updated)
    }

    suspend fun isFavorite(channelId: String): Boolean {
        return channelId in getDefaultProfile().favorites
    }

    // ── Recents ─────────────────────────────────────────────────

    suspend fun addRecent(channelId: String) {
        val profile = getDefaultProfile()
        // Move to front, remove duplicates, cap at MAX_RECENTS
        val updated = listOf(channelId) + profile.recents.filter { it != channelId }
        createOrUpdate(profile.copy(recents = updated.take(MAX_RECENTS)))
    }
}
