package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.PlaylistDao
import com.iptvtavern.androidtv.data.local.PlaylistEntity
import com.iptvtavern.androidtv.data.local.SourceDao
import com.iptvtavern.androidtv.data.local.SourceEntity
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
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

    suspend fun getCachedPlaylist(sourceId: String): Playlist? = withContext(Dispatchers.IO) {
        val entity = playlistDao.getBySourceId(sourceId) ?: return@withContext null
        try {
            json.decodeFromString<Playlist>(entity.playlistJson)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun cachePlaylist(playlist: Playlist) {
        // Serialize on IO thread to avoid OOM on main thread.
        // Skip caching entirely for very large playlists (>10k channels)
        // to prevent 100MB+ JSON blobs that crash the app.
        val totalChannels = playlist.groups.sumOf { it.channels.size }
        if (totalChannels > 10_000) return

        withContext(Dispatchers.IO) {
            val jsonString = json.encodeToString(playlist)
            playlistDao.insert(
                PlaylistEntity(
                    sourceId = playlist.sourceId,
                    playlistJson = jsonString,
                    fetchedAt = playlist.fetchedAt,
                )
            )
        }
    }

    suspend fun clearPlaylistCache(sourceId: String) {
        playlistDao.deleteBySourceId(sourceId)
    }
}
