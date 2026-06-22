package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupIndexEntry
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
 * Playlist loading coordinator with **lazy per-group** disk reads.
 *
 * Browse tabs load a lightweight group index first, then fetch one
 * category's channels when the user selects it. Parsed group indexes
 * and recently opened groups are memoized per kind so tab switches do
 * not re-parse large JSON files.
 */
@Singleton
class PlaylistManager @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val settingsDataStore: SettingsDataStore,
    private val xtreamCache: XtreamCache,
    private val cacheStore: PlaylistCacheStore,
) {
    private val mutex = Mutex()
    private val memoLock = Any()

    private val cacheScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private enum class KindRead { Live, Vod, Series }

    private fun KindRead.toCatalogKind(): PlaylistCacheStore.CatalogKind = when (this) {
        KindRead.Live -> PlaylistCacheStore.CatalogKind.LIVE
        KindRead.Vod -> PlaylistCacheStore.CatalogKind.VOD
        KindRead.Series -> PlaylistCacheStore.CatalogKind.SERIES
    }

    private data class GroupCacheKey(
        val sourceId: String,
        val kind: KindRead,
        val groupId: String,
    )

    /** Parsed group indexes per kind (small — safe to keep all three). */
    @Volatile
    private var liveIndexMemo: Pair<String, List<GroupIndexEntry>>? = null
    @Volatile
    private var vodIndexMemo: Pair<String, List<GroupIndexEntry>>? = null
    @Volatile
    private var seriesIndexMemo: Pair<String, List<GroupIndexEntry>>? = null

    /** LRU of recently loaded groups (one category file each). */
    private val groupMemo = object : LinkedHashMap<GroupCacheKey, ChannelGroup>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<GroupCacheKey, ChannelGroup>?): Boolean =
            size > MAX_GROUP_MEMO_ENTRIES
    }

    private var inFlight: Pair<String, CompletableDeferred<Playlist?>>? = null

    private val _loadEvents = MutableSharedFlow<PlaylistLoadEvent>(
        replay = 1,
        extraBufferCapacity = 16,
    )
    val loadEvents: Flow<PlaylistLoadEvent> = _loadEvents.asSharedFlow()

    companion object {
        private const val MAX_GROUP_MEMO_ENTRIES = 24
    }

    // ── Public read paths ────────────────────────────────────────

    suspend fun getCatalogMeta(): PlaylistCacheStore.CatalogMeta? {
        val source = activeSource() ?: return null
        return cacheStore.readCatalogMeta(source.id)
    }

    suspend fun ensureCatalogMeta(): PlaylistCacheStore.CatalogMeta? {
        val source = activeSource() ?: return null
        cacheStore.readCatalogMeta(source.id)?.let { return it }
        if (runFetch(source.id) == null) return null
        return cacheStore.readCatalogMeta(source.id)
    }

    /** Category sidebar — no channel payloads. */
    suspend fun getLiveGroupStubs(): List<ChannelGroup>? = getGroupStubs(KindRead.Live)
    suspend fun getVodGroupStubs(): List<ChannelGroup>? = getGroupStubs(KindRead.Vod)
    suspend fun getSeriesGroupStubs(): List<ChannelGroup>? = getGroupStubs(KindRead.Series)

    suspend fun loadLiveGroup(groupId: String): ChannelGroup? = loadKindGroup(KindRead.Live, groupId)
    suspend fun loadVodGroup(groupId: String): ChannelGroup? = loadKindGroup(KindRead.Vod, groupId)
    suspend fun loadSeriesGroup(groupId: String): ChannelGroup? = loadKindGroup(KindRead.Series, groupId)

    suspend fun findChannelById(channelId: String): Channel? {
        val source = activeSource() ?: return null
        val kind = inferKindFromChannelId(channelId)
        val catalogKind = kind.toCatalogKind()
        val groupId = cacheStore.lookupGroupId(source.id, catalogKind, channelId)
            ?: return findChannelInFullKindLoad(channelId, kind)
        val group = loadKindGroup(kind, groupId) ?: return null
        return group.channels.find { it.id == channelId }
    }

    /** Full kind load — used by Player live zapping. */
    suspend fun getLiveGroups(): List<ChannelGroup>? = getKindGroups(KindRead.Live)
    suspend fun getVodGroups(): List<ChannelGroup>? = getKindGroups(KindRead.Vod)
    suspend fun getSeriesGroups(): List<ChannelGroup>? = getKindGroups(KindRead.Series)

    suspend fun getPlaylist(): Playlist? {
        val source = activeSource() ?: return null
        return cacheStore.readPlaylist(source.id) ?: runFetch(source.id)
    }

    suspend fun refreshPlaylist(): Boolean {
        val source = activeSource() ?: return false
        invalidateMemoryCache()
        cacheStore.invalidate(source.id)
        if (source.type == SourceType.XTREAM) {
            source.credentials?.let { xtreamCache.invalidateSource(it) }
        }
        sourceRepository.clearPlaylistCache(source.id)
        return runFetch(source.id) != null
    }

    fun invalidateMemoryCache() {
        synchronized(memoLock) {
            liveIndexMemo = null
            vodIndexMemo = null
            seriesIndexMemo = null
            groupMemo.clear()
        }
    }

    // ── Internal ─────────────────────────────────────────────────

    private suspend fun getGroupStubs(kind: KindRead): List<ChannelGroup>? {
        val source = activeSource() ?: return null
        ensureKindIndex(source.id, kind)?.let { index ->
            return index.map { it.toStub() }.distinctBy { it.id }
        }
        val full = runFetch(source.id) ?: return null
        ensureKindIndex(source.id, kind)?.let { index ->
            return index.map { it.toStub() }.distinctBy { it.id }
        }
        return filterFromPlaylist(full, kind).map {
            it.copy(channelCount = it.channels.size)
        }
    }

    private suspend fun loadKindGroup(kind: KindRead, groupId: String): ChannelGroup? {
        val source = activeSource() ?: return null
        val key = GroupCacheKey(source.id, kind, groupId)
        synchronized(memoLock) {
            groupMemo[key]?.let { return it }
        }
        cacheStore.readGroup(source.id, kind.toCatalogKind(), groupId)?.let { loaded ->
            synchronized(memoLock) { groupMemo[key] = loaded }
            return loaded
        }
        // Do not trigger a full network fetch for one missing group file — that
        // was causing repeated 60k+ API loads on every category click.
        awaitInFlightFetch(source.id)?.let { playlist ->
            cacheStore.readGroup(source.id, kind.toCatalogKind(), groupId)?.let { loaded ->
                synchronized(memoLock) { groupMemo[key] = loaded }
                return loaded
            }
            filterFromPlaylist(playlist, kind)
                .find { it.id == groupId }
                ?.let { fromMemory ->
                    synchronized(memoLock) { groupMemo[key] = fromMemory }
                    return fromMemory
                }
        }
        return null
    }

    /** If a catalog fetch is in progress, wait for it (e.g. disk write finishing). */
    private suspend fun awaitInFlightFetch(sourceId: String): Playlist? {
        val existing = mutex.withLock {
            inFlight?.takeIf { it.first == sourceId }?.second
        }
        return existing?.await()
    }

    private suspend fun ensureKindIndex(
        sourceId: String,
        kind: KindRead,
    ): List<GroupIndexEntry>? {
        synchronized(memoLock) {
            indexMemoFor(kind)?.let { (id, index) ->
                if (id == sourceId) return index
            }
        }
        val fromDisk = cacheStore.readGroupIndex(sourceId, kind.toCatalogKind())
        if (fromDisk != null) {
            synchronized(memoLock) { setIndexMemo(kind, sourceId to fromDisk) }
            _loadEvents.tryEmit(PlaylistLoadEvent.CacheHit)
        }
        return fromDisk
    }

    private suspend fun getKindGroups(kind: KindRead): List<ChannelGroup>? {
        val source = activeSource() ?: return null
        val reader: suspend (String) -> List<ChannelGroup>? = when (kind) {
            KindRead.Live -> cacheStore::readLive
            KindRead.Vod -> cacheStore::readVod
            KindRead.Series -> cacheStore::readSeries
        }
        reader(source.id)?.let { groups ->
            _loadEvents.tryEmit(PlaylistLoadEvent.CacheHit)
            return groups.dedupGroups()
        }
        val full = runFetch(source.id) ?: return null
        return filterFromPlaylist(full, kind).dedupGroups()
    }

    private suspend fun findChannelInFullKindLoad(
        channelId: String,
        kind: KindRead,
    ): Channel? {
        val groups = getKindGroups(kind) ?: return null
        return groups.flatMap { it.channels }.find { it.id == channelId }
    }

    private fun indexMemoFor(kind: KindRead): Pair<String, List<GroupIndexEntry>>? = when (kind) {
        KindRead.Live -> liveIndexMemo
        KindRead.Vod -> vodIndexMemo
        KindRead.Series -> seriesIndexMemo
    }

    private fun setIndexMemo(kind: KindRead, value: Pair<String, List<GroupIndexEntry>>) {
        when (kind) {
            KindRead.Live -> liveIndexMemo = value
            KindRead.Vod -> vodIndexMemo = value
            KindRead.Series -> seriesIndexMemo = value
        }
    }

    private fun inferKindFromChannelId(channelId: String): KindRead = when {
        channelId.contains(":series:") -> KindRead.Series
        channelId.contains(":vod:") || channelId.startsWith("vod:") -> KindRead.Vod
        else -> KindRead.Live
    }

    private fun List<ChannelGroup>.dedupGroups(): List<ChannelGroup> =
        distinctBy { it.id }

    private fun filterFromPlaylist(pl: Playlist, kind: KindRead): List<ChannelGroup> {
        return pl.groups.mapNotNull { g ->
            val filtered = when (kind) {
                KindRead.Live -> g.channels.filterIsInstance<Channel.Live>()
                KindRead.Vod -> g.channels.filterIsInstance<Channel.Vod>()
                KindRead.Series -> g.channels.filterIsInstance<Channel.Series>()
            }
            if (filtered.isEmpty()) null else g.copy(channels = filtered, channelCount = filtered.size)
        }
    }

    private suspend fun activeSource(): com.iptvtavern.androidtv.domain.model.Source? {
        val activeId = settingsDataStore.activeSourceId.first()
        val sources = sourceRepository.sources.first()
        return sources.find { it.id == activeId } ?: sources.firstOrNull()
    }

    private suspend fun runFetch(sourceId: String): Playlist? {
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
                                val nextStep = (stepIndex + 1).coerceAtMost(
                                    PlaylistLoadSteps.ALL.lastIndex
                                )
                                emitStep(nextStep, percentOverride = PlaylistLoadSteps.percentAfter(stepIndex))
                            },
                        )
                    }
                    SourceType.M3U_URL, SourceType.M3U_FILE -> {
                        val url = source.url ?: return null
                        emitStep(1)
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
                emitStep(8, percentOverride = PlaylistLoadSteps.percentAfter(7))
                // Finish writing indexes + group files before callers read disk.
                // Async writes caused index misses → repeated full fetches.
                try {
                    withContext(Dispatchers.IO) {
                        cacheStore.writePlaylist(playlist)
                    }
                    synchronized(memoLock) {
                        liveIndexMemo = null
                        vodIndexMemo = null
                        seriesIndexMemo = null
                        groupMemo.clear()
                    }
                } catch (_: Throwable) { /* best-effort */ }
                if (source.type != SourceType.XTREAM) {
                    cacheScope.launch {
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
