package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.PlaylistDao
import com.iptvtavern.androidtv.data.local.PlaylistEntity
import com.iptvtavern.androidtv.data.local.SourceDao
import com.iptvtavern.androidtv.data.local.SourceEntity
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing sources and their cached playlists.
 *
 * This is the single entry point for source CRUD — the ViewModel talks
 * to this, never directly to the DAO. Similar to how a Zustand store
 * action encapsulates state updates.
 *
 * @Inject tells Hilt to provide SourceDao and PlaylistDao automatically.
 * @Singleton ensures one instance for the whole app lifetime.
 */
@Singleton
class SourceRepository @Inject constructor(
    private val sourceDao: SourceDao,
    private val playlistDao: PlaylistDao,
    private val json: Json,
) {
    /** Reactive stream of all sources — emits whenever the table changes. */
    val sources: Flow<List<Source>> = sourceDao.getAll().map { entities ->
        entities.map { it.toDomain() }
    }

    suspend fun getById(id: String): Source? =
        sourceDao.getById(id)?.toDomain()

    suspend fun add(source: Source) {
        sourceDao.insert(SourceEntity.fromDomain(source))
    }

    suspend fun update(source: Source) {
        sourceDao.update(SourceEntity.fromDomain(source))
    }

    suspend fun delete(id: String) {
        sourceDao.deleteById(id)
        // Also remove cached playlist for this source
        playlistDao.deleteBySourceId(id)
    }

    // ── Playlist cache ──────────────────────────────────────────

    suspend fun getCachedPlaylist(sourceId: String): Playlist? {
        val entity = playlistDao.getBySourceId(sourceId) ?: return null
        return try {
            json.decodeFromString<Playlist>(entity.playlistJson)
        } catch (_: Exception) {
            // If the cached JSON is corrupted, treat as cache miss
            null
        }
    }

    suspend fun cachePlaylist(playlist: Playlist) {
        playlistDao.insert(
            PlaylistEntity(
                sourceId = playlist.sourceId,
                playlistJson = json.encodeToString(playlist),
                fetchedAt = playlist.fetchedAt,
            )
        )
    }

    suspend fun clearPlaylistCache(sourceId: String) {
        playlistDao.deleteBySourceId(sourceId)
    }
}
