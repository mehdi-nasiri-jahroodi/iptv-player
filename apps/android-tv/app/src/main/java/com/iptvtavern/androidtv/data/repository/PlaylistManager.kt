package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uFromStream
import com.iptvtavern.androidtv.domain.parser.parseM3uToPlaylist
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single shared coordinator for playlist loading.
 *
 * All ViewModels call `getPlaylist()` instead of fetching independently.
 * If a fetch is already in progress for the active source, callers wait
 * for that same result (like React's SWR deduplication).
 *
 * Flow:
 * 1. Check Room cache → return immediately if found.
 * 2. Check if another caller is already fetching → wait for that result.
 * 3. Otherwise, start a network fetch, cache the result, and return it.
 */
@Singleton
class PlaylistManager @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
) {
    private val mutex = Mutex()

    /**
     * Background scope for fire-and-forget cache writes. Persisting an 85k
     * channel catalog to Room can take 5–10s and allocate ~80MB; doing it
     * inline blocks the UI and risks OOM by stacking parsed-Playlist +
     * entity-list + JSON-strings in memory at the same time. Running it on
     * a SupervisorJob means a write failure can't cancel the rest of the app.
     */
    private val cacheScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * In-memory cache of the parsed Playlist for the active source.
     * This is the *real* fast path: once the Playlist object is in memory
     * (either freshly fetched or hydrated from Room on cold start), every
     * ViewModel gets it instantly without re-deserializing 100MB+ of JSON.
     *
     * For 85k+ channel catalogs, deserializing from Room takes 10-30s;
     * keeping the parsed object in memory is the only acceptable solution.
     */
    @Volatile
    private var memoryCache: Pair<String, Playlist>? = null

    /** In-flight fetch dedup: sourceId → deferred result. */
    private var inFlight: Pair<String, CompletableDeferred<Playlist?>>? = null

    /**
     * Get the playlist for the active source.
     * - Returns in-memory parsed object instantly if available.
     * - Falls back to Room cache (cold start), then network.
     * - Deduplicates concurrent fetches — only one network call at a time.
     */
    suspend fun getPlaylist(): Playlist? {
        val activeId = settingsDataStore.activeSourceId.first()
        val sources = sourceRepository.sources.first()
        val source = sources.find { it.id == activeId } ?: sources.firstOrNull()
            ?: return null

        // 1. In-memory cache — instant, no work
        memoryCache?.let { (id, pl) -> if (id == source.id) return pl }

        // 2. Room cache — cold start path for M3U sources only.
        //    Xtream sources skip Room: they already have XtreamCache
        //    (per-action HTTP response files with TTLs). Reading 85k
        //    ChannelEntity rows back from Room + deserializing each
        //    payloadJson OOMs the 128MB Chromecast heap.
        if (source.type != SourceType.XTREAM) {
            sourceRepository.getCachedPlaylist(source.id)?.let { pl ->
                memoryCache = source.id to pl
                return pl
            }
        }

        // 3. Check for in-flight fetch — dedup concurrent callers
        val existing = mutex.withLock {
            inFlight?.takeIf { it.first == source.id }?.second
        }
        if (existing != null) {
            return existing.await()
        }

        // 4. Start a new fetch
        val deferred = CompletableDeferred<Playlist?>()
        mutex.withLock { inFlight = source.id to deferred }

        try {
            val playlist = when (source.type) {
                SourceType.XTREAM -> {
                    val creds = source.credentials ?: return null
                    XtreamClient.loadXtreamPlaylist(creds, source.id, xtreamCache)
                }
                SourceType.M3U_URL, SourceType.M3U_FILE -> {
                    val url = source.url ?: return null
                    withContext(Dispatchers.IO) {
                        val conn = URL(url).openConnection() as HttpURLConnection
                        conn.connectTimeout = 15_000
                        conn.readTimeout = 30_000
                        source.userAgent?.let { conn.setRequestProperty("User-Agent", it) }
                        try {
                            // Stream-parse line-by-line to avoid OOM on large
                            // catalogs (85k+ channels = 50-100MB M3U files).
                            // Previous readText() approach was crashing Chromecast.
                            conn.inputStream.bufferedReader().use { reader ->
                                parseM3uFromStream(reader, source.id)
                            }
                        } finally {
                            conn.disconnect()
                        }
                    }
                }
            }

            // Promote to memory cache immediately so other callers skip Room
            if (playlist != null) {
                memoryCache = source.id to playlist
                // Persist M3U sources to Room so next cold start skips
                // the network. Xtream sources rely on XtreamCache instead
                // — writing 85k entities to Room wastes time and the
                // read-back OOMs 128MB devices.
                if (source.type != SourceType.XTREAM) {
                    cacheScope.launch {
                        try { sourceRepository.cachePlaylist(playlist) } catch (_: Throwable) { }
                    }
                }
            }

            deferred.complete(playlist)
            return playlist
        } catch (e: Exception) {
            deferred.complete(null)
            return null
        } finally {
            mutex.withLock {
                if (inFlight?.first == source.id) {
                    inFlight = null
                }
            }
        }
    }

    /**
     * Force refresh — clears all caches (memory + Room) and fetches fresh.
     * Called from the Home screen refresh button.
     */
    suspend fun refreshPlaylist(): Playlist? {
        val activeId = settingsDataStore.activeSourceId.first()
        val sources = sourceRepository.sources.first()
        val source = sources.find { it.id == activeId } ?: sources.firstOrNull()
            ?: return null

        // Clear all caches
        memoryCache = null
        sourceRepository.clearPlaylistCache(source.id)
        if (source.type == SourceType.XTREAM) {
            source.credentials?.let { xtreamCache.invalidateSource(it) }
        }

        return getPlaylist()
    }

    /**
     * Drop the memory cache when the active source changes (so the next
     * getPlaylist() call doesn't return stale data from a different source).
     */
    fun invalidateMemoryCache() {
        memoryCache = null
    }
}
