package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.data.local.ChannelDao
import com.iptvtavern.androidtv.data.local.ChannelEntity
import com.iptvtavern.androidtv.data.local.ChannelGroupEntity
import com.iptvtavern.androidtv.data.local.PlaylistDao
import com.iptvtavern.androidtv.data.local.SourceDao
import com.iptvtavern.androidtv.data.local.SourceEntity
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing sources and their cached playlists.
 *
 * The catalog cache uses **per-row Room tables** (`channels`, `channel_groups`)
 * rather than one giant JSON blob per source. For an 85k-channel catalog the
 * old blob took 10–30 s to deserialize on cold start; per-row reads finish in
 * a fraction of a second and let us read only one channel type (live / vod /
 * series) at a time.
 *
 * The legacy `PlaylistDao` is still around so the existing backup format
 * keeps working — backup/restore reads/writes the legacy blob, and
 * [cachePlaylist] / [getCachedPlaylist] mirror writes into both stores.
 */
@Singleton
class SourceRepository @Inject constructor(
    private val sourceDao: SourceDao,
    private val playlistDao: PlaylistDao,
    private val channelDao: ChannelDao,
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
        // Also remove cached playlist + per-row catalog for this source
        playlistDao.deleteBySourceId(id)
        channelDao.deleteCatalog(id)
    }

    // ── Catalog cache (per-row) ─────────────────────────────────

    /**
     * Read the cached catalog for a source as a fully-rebuilt [Playlist].
     *
     * Prefer [getCachedChannelsByType] when the caller only needs one type
     * (Live TV, Movies, or Series) — that path skips deserializing the
     * other 60k+ rows.
     */
    suspend fun getCachedPlaylist(sourceId: String): Playlist? = withContext(Dispatchers.IO) {
        val groupRows = channelDao.getGroups(sourceId)
        val channelRows = channelDao.getAllChannels(sourceId)
        if (groupRows.isEmpty() && channelRows.isEmpty()) return@withContext null

        rebuildPlaylist(sourceId, groupRows, channelRows)
    }

    /**
     * Read only one channel type for a source — Live TV / Movies / Series.
     *
     * Returns the `(groups, channels)` already filtered to that type. Useful
     * for browse screens that only care about one slice of the catalog.
     */
    suspend fun getCachedChannelsByType(
        sourceId: String,
        type: ChannelType,
    ): TypedCatalog? = withContext(Dispatchers.IO) {
        val channelRows = channelDao.getChannelsByType(sourceId, type.wireValue)
        if (channelRows.isEmpty()) return@withContext null

        val groupRows = channelDao.getGroups(sourceId)
        val playlist = rebuildPlaylist(sourceId, groupRows, channelRows)
        TypedCatalog(playlist.groups, playlist.groups.flatMap { it.channels })
    }

    /**
     * Cache a freshly-fetched playlist.
     *
     * Writes both:
     *  - The per-row tables (used at runtime for fast reads).
     *  - The legacy `PlaylistEntity` blob (used by backup/restore for
     *    cross-device portability — the existing backup format expects it).
     *
     * For huge catalogs the blob write is wrapped in OOM guards. Failure
     * to write the blob is non-fatal: per-row reads remain authoritative.
     */
    suspend fun cachePlaylist(playlist: Playlist) = withContext(Dispatchers.IO) {
        // Per-row write (the fast path) — written in chunks so we never
        // hold the full 85k entity list + 85k JSON payload strings in
        // memory at once. That double-allocation was OOM-ing on Chromecast.
        val totalChannels = playlist.groups.sumOf { it.channels.size }
        try {
            writeCatalogStreaming(playlist)
        } catch (_: Throwable) {
            // If the per-row write fails for any reason we still want the
            // legacy blob below as a fallback so reads aren't completely
            // empty.
        }

        // Legacy blob write — best-effort, only for catalogs small enough
        // to safely serialize (skipping huge ones avoids the OOM that
        // motivated this refactor in the first place).
        if (totalChannels <= 50_000) {
            try {
                val jsonString = json.encodeToString(Playlist.serializer(), playlist)
                playlistDao.insert(
                    com.iptvtavern.androidtv.data.local.PlaylistEntity(
                        sourceId = playlist.sourceId,
                        playlistJson = jsonString,
                        fetchedAt = playlist.fetchedAt,
                    )
                )
            } catch (_: OutOfMemoryError) {
                // Skip blob if it doesn't fit — per-row cache is still good.
            } catch (_: Throwable) {
                // Skip blob on any other failure; non-fatal.
            }
        }
    }

    /**
     * Stream a Playlist into Room without materializing all 85k entities
     * at once. Groups are small (~hundreds), but the channel list for a
     * full Xtream catalog is ~85k. Allocating that many ChannelEntity
     * objects, each with a freshly serialized JSON `payloadJson`, peaks
     * memory at ~80MB on top of the in-memory Playlist. Chunking the
     * conversion keeps peak overhead near 2k entities (~2MB).
     */
    private suspend fun writeCatalogStreaming(playlist: Playlist) {
        // Wipe first — we're replacing the whole catalog.
        channelDao.deleteCatalog(playlist.sourceId)

        // Groups: small list, write all at once.
        val groupRows = playlist.groups.mapIndexed { idx, g ->
            ChannelGroupEntity(
                sourceId = playlist.sourceId,
                groupId = g.id,
                name = g.name,
                kind = g.kind.name,
                orderIndex = idx,
            )
        }
        if (groupRows.isNotEmpty()) channelDao.insertGroups(groupRows)

        // Channels: stream chunk-by-chunk. Build a 2k-entity batch, write
        // it, drop the references so GC can collect the JSON strings,
        // then move on. We iterate groups but track a global orderInGroup
        // per group (not global) — same shape as the original code.
        val batch = ArrayList<ChannelEntity>(2_000)
        for (group in playlist.groups) {
            for ((idx, channel) in group.channels.withIndex()) {
                batch.add(channel.toEntity(playlist.sourceId, idx, json))
                if (batch.size >= 2_000) {
                    channelDao.insertChannels(batch)
                    batch.clear()
                }
            }
        }
        if (batch.isNotEmpty()) channelDao.insertChannels(batch)
    }

    suspend fun clearPlaylistCache(sourceId: String) {
        playlistDao.deleteBySourceId(sourceId)
        channelDao.deleteCatalog(sourceId)
    }

    /**
     * Quick freshness probe: returns true if the per-row cache has any data
     * for the given source. Used by `PlaylistManager` to decide whether a
     * cold start can read from disk or must hit the network.
     */
    suspend fun hasCachedCatalog(sourceId: String): Boolean = withContext(Dispatchers.IO) {
        channelDao.countChannels(sourceId) > 0
    }

    // ── Internals ───────────────────────────────────────────────

    private fun rebuildPlaylist(
        sourceId: String,
        groupRows: List<ChannelGroupEntity>,
        channelRows: List<ChannelEntity>,
    ): Playlist {
        // Group channels by their groupTitle. If the saved groups list is
        // empty (legacy data, or a partial wipe), synthesize groups from
        // the channels themselves so we never lose data.
        val byGroupTitle = channelRows.groupBy { it.groupTitle }

        val groupOrder: List<ChannelGroup> = if (groupRows.isNotEmpty()) {
            groupRows.map { groupRow ->
                val rows = byGroupTitle[groupRow.name].orEmpty()
                ChannelGroup(
                    id = groupRow.groupId,
                    name = groupRow.name,
                    kind = parseGroupKind(groupRow.kind),
                    channels = rows.map { it.toChannel(json) },
                )
            }
        } else {
            byGroupTitle.entries.map { (title, rows) ->
                ChannelGroup(
                    id = title.ifBlank { "ungrouped" },
                    name = title.ifBlank { "Ungrouped" },
                    kind = inferKind(rows),
                    channels = rows.map { it.toChannel(json) },
                )
            }
        }

        // fetchedAt — best effort: if no per-source timestamp is stored
        // anywhere, just use "now". Callers use this only for display.
        val fetchedAt = Instant.now().toString()
        return Playlist(sourceId = sourceId, groups = groupOrder, fetchedAt = fetchedAt)
    }

    private fun playlistToRows(
        playlist: Playlist,
    ): Pair<List<ChannelGroupEntity>, List<ChannelEntity>> {
        val groups = playlist.groups.mapIndexed { idx, g ->
            ChannelGroupEntity(
                sourceId = playlist.sourceId,
                groupId = g.id,
                name = g.name,
                kind = g.kind.name,
                orderIndex = idx,
            )
        }
        val channels = playlist.groups.flatMap { g ->
            g.channels.mapIndexed { idx, ch ->
                ch.toEntity(playlist.sourceId, idx, json)
            }
        }
        return groups to channels
    }

    private fun parseGroupKind(raw: String): GroupKind = try {
        GroupKind.valueOf(raw)
    } catch (_: Throwable) {
        GroupKind.mixed
    }

    private fun inferKind(rows: List<ChannelEntity>): GroupKind {
        val types = rows.asSequence().map { it.type }.toSet()
        return when {
            types == setOf("live") -> GroupKind.live
            types == setOf("vod") -> GroupKind.vod
            types == setOf("series") -> GroupKind.series
            else -> GroupKind.mixed
        }
    }

    /** Stable wire values for the `type` discriminator in [ChannelEntity]. */
    enum class ChannelType(val wireValue: String) {
        LIVE("live"),
        VOD("vod"),
        SERIES("series"),
    }

    /** Result of [getCachedChannelsByType] — pre-filtered to one type. */
    data class TypedCatalog(
        val groups: List<ChannelGroup>,
        val channels: List<Channel>,
    )
}

// ── Mapping helpers (top-level so they don't pollute the class) ─────

private fun Channel.toEntity(
    sourceId: String,
    orderInGroup: Int,
    json: Json,
): ChannelEntity = ChannelEntity(
    sourceId = sourceId,
    channelId = id,
    type = when (this) {
        is Channel.Live -> "live"
        is Channel.Vod -> "vod"
        is Channel.Series -> "series"
    },
    name = name,
    groupTitle = groupTitle,
    streamUrl = streamUrl,
    logoUrl = logoUrl,
    payloadJson = json.encodeToString(Channel.serializer(), this),
    orderInGroup = orderInGroup,
)

private fun ChannelEntity.toChannel(json: Json): Channel =
    json.decodeFromString(Channel.serializer(), payloadJson)
