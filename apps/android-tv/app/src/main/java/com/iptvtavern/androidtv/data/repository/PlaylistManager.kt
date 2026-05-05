package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.parseM3uFromStream
import com.iptvtavern.androidtv.domain.xtream.XtreamCache
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
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
 * ## Responsibilities
 *  - Deduplicate concurrent fetches (one network call shared by all VMs)
 *  - Cache-first reads from [PlaylistCacheStore] (parsed, per-kind)
 *  - Fall back to network and persist results for next time
 *  - Emit progress events on [loadEvents] so the UI can show a bar during
 *    the slow fetch path
 *  - Provide per-kind access (Live / VOD / Series) so each Browse screen
 *    only deserializes the slice it actually needs
 *
 * ## Two layers of cache
 *  1. **In-memory** — parsed `Playlist` kept for the active source.
 *     Survives navigation, dies with the process.
 *  2. **On-disk per-kind** — [PlaylistCacheStore], 30-day TTL,
 *     `filesDir/playlist_cache/<sourceId>/{live,vod,series,meta}.json`.
 *     Survives process kill, only invalidated by Refresh button or expiry.
 *
 * ## Two read paths
 *  - **Fast path (full)** — `getPlaylist()` returns the merged `Playlist`
 *    used by HomeViewModel for catalog counts and continue-watching.
 *  - **Fast path (per-kind)** — `getLiveGroups()` etc. for Browse/VOD/
 *    Series screens, which only deserialize their own slice from disk.
 *
 * ## Progress events
 *  [loadEvents] is a hot `SharedFlow<PlaylistLoadEvent>` (multicast). The
 *  overlay UI subscribes to it once at the app root and shows itself when
 *  a `Progress` event arrives, hides on `Success` / `Error` / `CacheHit`.
 *  Cache hits emit `CacheHit` *and not any* `Progress`, so the overlay
 *  stays out of the way on the happy path.
 */
@Singleton
class PlaylistManager @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val cacheStore: PlaylistCacheStore,
) {
    private val mutex = Mutex()

    /**
     * Background scope for fire-and-forget cache writes. Persisting an
     * 85k-channel catalog can take seconds and allocate ~80 MB; doing
     * it inline blocks the UI and risks OOM by stacking the parsed
     * Playlist + entity list + JSON strings in memory simultaneously.
     */
    private val cacheScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * In-memory cache of the parsed Playlist for the active source.
     * The *real* fast path: once the Playlist is in memory (either
     * freshly fetched or hydrated from disk on cold start), every
     * ViewModel gets it instantly without re-deserializing.
     */
    @Volatile
    private var memoryCache: Pair<String, Playlist>? = null

    /** In-flight fetch dedup: sourceId → deferred result. */
    private var inFlight: Pair<String, CompletableDeferred<Playlist?>>? = null

    /**
     * Multicast stream of load events. We use `extraBufferCapacity = 16`
     * so emissions never suspend the producer (progress events are
     * fire-and-forget — losing one is acceptable but blocking the fetch
     * is not).
     *
     * `replay = 1` lets a late subscriber (e.g. the overlay attaching
     * after a screen rotation) immediately see the latest event.
     */
    private val _loadEvents = MutableSharedFlow<PlaylistLoadEvent>(
        replay = 1,
        extraBufferCapacity = 16,
    )
    val loadEvents: Flow<PlaylistLoadEvent> = _loadEvents.asSharedFlow()

    // ── Public read paths ────────────────────────────────────────

    /**
     * Get the full playlist for the active source.
     * Cache-first; falls back to network and emits progress events.
     */
    suspend fun getPlaylist(): Playlist? {
        val source = activeSource() ?: return null

        // 1. In-memory hit
        memoryCache?.let { (id, pl) -> if (id == source.id) return pl }

        // 2. On-disk parsed cache (PlaylistCacheStore)
        cacheStore.readPlaylist(source.id)?.let { pl ->
            memoryCache = source.id to pl
            _loadEvents.tryEmit(PlaylistLoadEvent.CacheHit)
            return pl
        }

        // 3. Network fetch with dedup + progress
        return runFetch(source.id)
    }

    /**
     * Get only the live-channel groups for the active source.
     * Reads only the `live.json` slice on cold start — much faster than
     * deserializing the whole catalog when the user just opened Live.
     */
    suspend fun getLiveGroups(): List<ChannelGroup>? =
        getKindGroups(KindRead.Live)

    /** VOD slice — see [getLiveGroups]. */
    suspend fun getVodGroups(): List<ChannelGroup>? =
        getKindGroups(KindRead.Vod)

    /** Series slice — see [getLiveGroups]. */
    suspend fun getSeriesGroups(): List<ChannelGroup>? =
        getKindGroups(KindRead.Series)

    /**
     * Force refresh: clears every cache layer (memory, disk, XtreamCache
     * raw responses) and re-fetches from network. Called from the Home
     * screen Refresh button.
     */
    suspend fun refreshPlaylist(): Playlist? {
        val source = activeSource() ?: return null

        memoryCache = null
        cacheStore.invalidate(source.id)
        if (source.type == SourceType.XTREAM) {
            source.credentials?.let { xtreamCache.invalidateSource(it) }
        }
        sourceRepository.clearPlaylistCache(source.id)

        return runFetch(source.id)
    }

    /**
     * Drop the in-memory cache when the active source changes (so the
     * next read doesn't return stale data from a different source).
     */
    fun invalidateMemoryCache() {
        memoryCache = null
    }

    // ── Internal ─────────────────────────────────────────────────

    private enum class KindRead { Live, Vod, Series }

    /**
     * Per-kind read path:
     *  1. Try memory cache, filter by kind.
     *  2. Try the matching slice file on disk.
     *  3. Otherwise trigger a full network fetch (via [runFetch]) and
     *     filter the result.
     *
     * The network path always loads everything — providers don't expose
     * per-kind endpoints in a way we can cleanly split. The on-disk
     * cache is what makes subsequent reads cheap.
     */
    private suspend fun getKindGroups(kind: KindRead): List<ChannelGroup>? {
        val source = activeSource() ?: return null

        // 1. In-memory: filter by kind
        memoryCache?.let { (id, pl) ->
            if (id == source.id) return filterFromPlaylist(pl, kind).dedupGroups()
        }

        // 2. On-disk per-kind read — only deserializes the relevant file
        val sliceReader: suspend (String) -> List<ChannelGroup>? = when (kind) {
            KindRead.Live -> cacheStore::readLive
            KindRead.Vod -> cacheStore::readVod
            KindRead.Series -> cacheStore::readSeries
        }
        val slice = sliceReader(source.id)
        if (slice != null) {
            _loadEvents.tryEmit(PlaylistLoadEvent.CacheHit)
            return slice.dedupGroups()
        }

        // 3. Fall through to a full fetch — populates memory cache for
        //    subsequent calls (other tabs the user might open).
        val full = runFetch(source.id) ?: return null
        return filterFromPlaylist(full, kind).dedupGroups()
    }

    /**
     * Drop groups whose `id` collides with one we've already kept.
     *
     * Some Xtream providers return the same category twice (different
     * casing, or genuinely duplicated rows). Compose's `LazyColumn`
     * crashes hard with `IllegalArgumentException: Key "..." was already
     * used` if any two items share a key, so we dedupe at the data
     * boundary rather than asking every screen to remember.
     */
    private fun List<ChannelGroup>.dedupGroups(): List<ChannelGroup> =
        distinctBy { it.id }

    private fun filterFromPlaylist(pl: Playlist, kind: KindRead): List<ChannelGroup> {
        return pl.groups.mapNotNull { g ->
            val filtered = when (kind) {
                KindRead.Live -> g.channels.filterIsInstance<com.iptvtavern.androidtv.domain.model.Channel.Live>()
                KindRead.Vod -> g.channels.filterIsInstance<com.iptvtavern.androidtv.domain.model.Channel.Vod>()
                KindRead.Series -> g.channels.filterIsInstance<com.iptvtavern.androidtv.domain.model.Channel.Series>()
            }
            if (filtered.isEmpty()) null else g.copy(channels = filtered)
        }
    }

    private suspend fun activeSource(): com.iptvtavern.androidtv.domain.model.Source? {
        val activeId = settingsDataStore.activeSourceId.first()
        val sources = sourceRepository.sources.first()
        return sources.find { it.id == activeId } ?: sources.firstOrNull()
    }

    /**
     * Coordinated network fetch:
     *  - Dedups concurrent callers via `inFlight`
     *  - Emits Progress events as steps complete (XtreamClient callback)
     *  - Persists the result to PlaylistCacheStore for next cold start
     *  - Emits Success or Error terminal event
     */
    private suspend fun runFetch(sourceId: String): Playlist? {
        // Dedup
        val existing = mutex.withLock {
            inFlight?.takeIf { it.first == sourceId }?.second
        }
        if (existing != null) return existing.await()

        val deferred = CompletableDeferred<Playlist?>()
        mutex.withLock { inFlight = sourceId to deferred }

        try {
            val source = activeSource() ?: run {
                deferred.complete(null)
                _loadEvents.tryEmit(PlaylistLoadEvent.Error("No active source"))
                return null
            }

            // Emit step 0 immediately so the overlay appears as soon as
            // we commit to a network fetch — otherwise the UI sees no
            // event for several seconds while the first response loads.
            emitStep(0)

            val playlist: Playlist? = try {
                when (source.type) {
                    SourceType.XTREAM -> {
                        val creds = source.credentials ?: return null
                        XtreamClient.loadXtreamPlaylist(
                            credentials = creds,
                            sourceId = source.id,
                            cache = xtreamCache,
                            onStepDone = { stepIndex ->
                                // stepIndex 0..7 from XtreamClient; we
                                // emit AFTER step completes, so the next
                                // label shown is for the *upcoming* step.
                                val nextStep = (stepIndex + 1).coerceAtMost(
                                    PlaylistLoadSteps.ALL.lastIndex
                                )
                                emitStep(nextStep, percentOverride = PlaylistLoadSteps.percentAfter(stepIndex))
                            },
                        )
                    }
                    SourceType.M3U_URL, SourceType.M3U_FILE -> {
                        // M3U has no granular steps — emit "fetching" then
                        // jump to "parsing" once the response arrives.
                        val url = source.url ?: return null
                        emitStep(1) // "Fetching live channels…" — closest label
                        withContext(Dispatchers.IO) {
                            val conn = URL(url).openConnection() as HttpURLConnection
                            conn.connectTimeout = 15_000
                            conn.readTimeout = 30_000
                            source.userAgent?.let { conn.setRequestProperty("User-Agent", it) }
                            try {
                                conn.inputStream.bufferedReader().use { reader ->
                                    val pl = parseM3uFromStream(reader, source.id)
                                    emitStep(7, percentOverride = PlaylistLoadSteps.percentAfter(6))
                                    pl
                                }
                            } finally {
                                conn.disconnect()
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                deferred.complete(null)
                _loadEvents.tryEmit(PlaylistLoadEvent.Error(e.message ?: "Failed to load catalog"))
                return null
            }

            if (playlist != null) {
                // Promote to memory cache before announcing success — readers
                // collecting Success will immediately call getPlaylist()
                // again and we want them to hit memory.
                memoryCache = source.id to playlist

                // Step 8: persist to per-kind cache. Fire-and-forget so the
                // bar can drop and the UI becomes interactive immediately.
                emitStep(8, percentOverride = PlaylistLoadSteps.percentAfter(7))
                cacheScope.launch {
                    try {
                        cacheStore.writePlaylist(playlist)
                    } catch (_: Throwable) { /* best-effort */ }
                    // Also keep the legacy Room cache for M3U so existing
                    // SourceRepository paths still work. Xtream skips Room
                    // (the read-back path OOMs on Chromecast).
                    if (source.type != SourceType.XTREAM) {
                        try { sourceRepository.cachePlaylist(playlist) } catch (_: Throwable) { }
                    }
                }

                _loadEvents.tryEmit(PlaylistLoadEvent.Success)
                deferred.complete(playlist)
                return playlist
            }

            deferred.complete(null)
            _loadEvents.tryEmit(PlaylistLoadEvent.Error("Empty response"))
            return null
        } finally {
            mutex.withLock {
                if (inFlight?.first == sourceId) inFlight = null
            }
        }
    }

    /**
     * Emit a Progress event for the given step index. The percentage
     * normally reflects "completion of the step before this one"; pass
     * [percentOverride] when you want explicit control (e.g. for the
     * weighted-sum-after-X-completed semantics from PlaylistLoadSteps).
     */
    private fun emitStep(stepIndex: Int, percentOverride: Int? = null) {
        val safe = stepIndex.coerceIn(0, PlaylistLoadSteps.ALL.lastIndex)
        val step = PlaylistLoadSteps.ALL[safe]
        _loadEvents.tryEmit(
            PlaylistLoadEvent.Progress(
                step = safe,
                totalSteps = PlaylistLoadSteps.ALL.size,
                percent = percentOverride ?: PlaylistLoadSteps.percentAfter(safe - 1),
                label = step.label,
            )
        )
    }
}
