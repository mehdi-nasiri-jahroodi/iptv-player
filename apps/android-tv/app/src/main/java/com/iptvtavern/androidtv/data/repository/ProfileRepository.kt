package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.ProfileDao
import com.iptvtavern.androidtv.data.local.ProfileEntity
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.UserProfile
import com.iptvtavern.androidtv.domain.model.toSnapshot
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

    /** Store a channel snapshot so Home can show recents without catalog I/O. */
    suspend fun addRecent(channel: Channel) {
        val snapshot = channel.toSnapshot()
        val profile = getDefaultProfile()
        val updatedSnapshots = listOf(snapshot) +
            profile.recentSnapshots.filter { it.id != snapshot.id }
        val updatedRecents = listOf(snapshot.id) +
            profile.recents.filter { it != snapshot.id }
        createOrUpdate(
            profile.copy(
                recentSnapshots = updatedSnapshots.take(MAX_RECENTS),
                recents = updatedRecents.take(MAX_RECENTS),
            )
        )
    }

    /** Legacy ID-only path — keeps recents list in sync without display metadata. */
    suspend fun addRecent(channelId: String) {
        val profile = getDefaultProfile()
        val updated = listOf(channelId) + profile.recents.filter { it != channelId }
        createOrUpdate(profile.copy(recents = updated.take(MAX_RECENTS)))
    }
}
