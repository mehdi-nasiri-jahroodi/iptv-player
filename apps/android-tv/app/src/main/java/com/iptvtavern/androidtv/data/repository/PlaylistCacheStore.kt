package com.iptvtavern.androidtv.data.repository

import android.content.Context
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupIndexEntry
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import kotlinx.serialization.json.encodeToStream
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Per-kind on-disk cache of parsed playlists, split into **group index +
 * per-group channel files** so Browse screens can show categories without
 * deserializing an entire 25 MB `vod.json`.
 *
 * ## Layout (v3)
 * ```
 * filesDir/playlist_cache/<sourceId>/
 *   meta.json
 *   live-index.json           // List<GroupIndexEntry>
 *   live-channel-index.json   // channelId → groupId
 *   vod-index.json
 *   vod-channel-index.json
 *   series-index.json
 *   series-channel-index.json
 *   groups/
 *     live__<groupId>.json    // full ChannelGroup for one category
 *     vod__<groupId>.json
 *     series__<groupId>.json
 * ```
 */
@OptIn(ExperimentalSerializationApi::class)
@Singleton
class PlaylistCacheStore @Inject constructor(
    @ApplicationContext private val appContext: Context,
) {
    enum class CatalogKind {
        LIVE, VOD, SERIES;

        fun indexFileName(): String = when (this) {
            LIVE -> "live-index.json"
            VOD -> "vod-index.json"
            SERIES -> "series-index.json"
        }

        fun channelIndexFileName(): String = when (this) {
            LIVE -> "live-channel-index.json"
            VOD -> "vod-channel-index.json"
            SERIES -> "series-channel-index.json"
        }

        fun filePrefix(): String = when (this) {
            LIVE -> "live"
            VOD -> "vod"
            SERIES -> "series"
        }
    }

    companion object {
        private const val DIR_NAME = "playlist_cache"
        private const val GROUPS_DIR = "groups"

        /** Bump when cache layout or model shape changes. */
        private const val CACHE_VERSION: Int = 4

        const val TTL_MS: Long = 30L * 24 * 60 * 60 * 1000

        private const val META_FILE = "meta.json"
    }

    @Serializable
    data class CatalogMeta(
        val savedAt: Long,
        val version: Int,
        val sourceId: String,
        val fetchedAt: String,
        val hasLive: Boolean,
        val hasVod: Boolean,
        val hasSeries: Boolean,
        val liveCount: Int = 0,
        val vodCount: Int = 0,
        val seriesCount: Int = 0,
    )

    suspend fun readCatalogMeta(sourceId: String): CatalogMeta? = withContext(Dispatchers.IO) {
        if (!isFresh(sourceId)) return@withContext null
        readMeta(sourceId)
    }

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    private val groupListSerializer =
        kotlinx.serialization.builtins.ListSerializer(ChannelGroup.serializer())
    private val indexListSerializer =
        kotlinx.serialization.builtins.ListSerializer(GroupIndexEntry.serializer())
    private val channelMapSerializer =
        MapSerializer(String.serializer(), String.serializer())

    private fun rootDir(): File =
        File(appContext.filesDir, DIR_NAME).also { it.mkdirs() }

    private fun sourceDir(sourceId: String): File =
        File(rootDir(), sourceId).also { it.mkdirs() }

    private fun groupsDir(sourceId: String): File =
        File(sourceDir(sourceId), GROUPS_DIR).also { it.mkdirs() }

    // ── Public API ───────────────────────────────────────────────

    suspend fun isFresh(sourceId: String): Boolean = withContext(Dispatchers.IO) {
        val meta = readMeta(sourceId) ?: return@withContext false
        if (meta.version != CACHE_VERSION) return@withContext false
        System.currentTimeMillis() < meta.savedAt + TTL_MS
    }

    /** Category list only — no channel deserialization. */
    suspend fun readGroupIndex(
        sourceId: String,
        kind: CatalogKind,
    ): List<GroupIndexEntry>? = withContext(Dispatchers.IO) {
        if (!isFresh(sourceId)) return@withContext null
        val f = File(sourceDir(sourceId), kind.indexFileName())
        if (!f.exists()) return@withContext null
        try {
            BufferedInputStream(FileInputStream(f)).use { input ->
                json.decodeFromStream(indexListSerializer, input)
            }
        } catch (_: Throwable) {
            invalidate(sourceId)
            null
        }
    }

    /** Resolve which group file contains a channel (Player / favorites). */
    suspend fun lookupGroupId(
        sourceId: String,
        kind: CatalogKind,
        channelId: String,
    ): String? = withContext(Dispatchers.IO) {
        if (!isFresh(sourceId)) return@withContext null
        val f = File(sourceDir(sourceId), kind.channelIndexFileName())
        if (!f.exists()) return@withContext null
        try {
            val map = json.decodeFromString(channelMapSerializer, f.readText())
            map[channelId]
        } catch (_: Throwable) {
            null
        }
    }

    /** Load one category's channels. */
    suspend fun readGroup(
        sourceId: String,
        kind: CatalogKind,
        groupId: String,
    ): ChannelGroup? = withContext(Dispatchers.IO) {
        if (!isFresh(sourceId)) return@withContext null
        val f = groupFile(sourceId, kind, groupId)
        if (!f.exists()) return@withContext null
        decodeGroupFile(f)
    }

    /** Load every group for a kind (Player zapping, legacy paths). */
    suspend fun readAllGroups(
        sourceId: String,
        kind: CatalogKind,
    ): List<ChannelGroup>? = withContext(Dispatchers.IO) {
        val index = readGroupIndex(sourceId, kind) ?: return@withContext null
        val loaded = index.mapNotNull { readGroup(sourceId, kind, it.id) }
        if (loaded.isEmpty() && index.isNotEmpty()) null else loaded
    }

    suspend fun readLive(sourceId: String): List<ChannelGroup>? =
        readAllGroups(sourceId, CatalogKind.LIVE)

    suspend fun readVod(sourceId: String): List<ChannelGroup>? =
        readAllGroups(sourceId, CatalogKind.VOD)

    suspend fun readSeries(sourceId: String): List<ChannelGroup>? =
        readAllGroups(sourceId, CatalogKind.SERIES)

    suspend fun readPlaylist(sourceId: String): Playlist? = withContext(Dispatchers.IO) {
        if (!isFresh(sourceId)) return@withContext null
        val meta = readMeta(sourceId) ?: return@withContext null
        try {
            val live = if (meta.hasLive) readLive(sourceId).orEmpty() else emptyList()
            val vod = if (meta.hasVod) readVod(sourceId).orEmpty() else emptyList()
            val series = if (meta.hasSeries) readSeries(sourceId).orEmpty() else emptyList()
            Playlist(
                sourceId = meta.sourceId,
                groups = live + vod + series,
                fetchedAt = meta.fetchedAt,
            )
        } catch (_: Throwable) {
            invalidate(sourceId)
            null
        }
    }

    suspend fun writePlaylist(playlist: Playlist) = withContext(Dispatchers.IO) {
        val dir = sourceDir(playlist.sourceId)
        val liveGroups = filterGroupsByKind<Channel.Live>(playlist.groups)
        val vodGroups = filterGroupsByKind<Channel.Vod>(playlist.groups)
        val seriesGroups = filterGroupsByKind<Channel.Series>(playlist.groups)

        // Wipe stale v2 monolithic files and previous group files.
        dir.listFiles()?.forEach { entry ->
            if (entry.name != META_FILE && entry.isFile) entry.delete()
        }
        groupsDir(playlist.sourceId).listFiles()?.forEach { it.delete() }

        var allOk = true
        try {
            allOk = writeKindCache(playlist.sourceId, CatalogKind.LIVE, liveGroups) && allOk
            allOk = writeKindCache(playlist.sourceId, CatalogKind.VOD, vodGroups) && allOk
            allOk = writeKindCache(playlist.sourceId, CatalogKind.SERIES, seriesGroups) && allOk
        } catch (_: Throwable) {
            allOk = false
        }

        if (allOk) {
            val meta = CatalogMeta(
                savedAt = System.currentTimeMillis(),
                version = CACHE_VERSION,
                sourceId = playlist.sourceId,
                fetchedAt = playlist.fetchedAt,
                hasLive = liveGroups.isNotEmpty(),
                hasVod = vodGroups.isNotEmpty(),
                hasSeries = seriesGroups.isNotEmpty(),
                liveCount = liveGroups.sumOf { it.channels.size },
                vodCount = vodGroups.sumOf { it.channels.size },
                seriesCount = seriesGroups.sumOf { it.channels.size },
            )
            try {
                writeMetaFile(File(dir, META_FILE), meta)
            } catch (_: Throwable) {
                invalidate(playlist.sourceId)
            }
        }
    }

    suspend fun invalidate(sourceId: String) = withContext(Dispatchers.IO) {
        val dir = sourceDir(sourceId)
        dir.listFiles()?.forEach { it.delete() }
    }

    suspend fun clear() = withContext(Dispatchers.IO) {
        rootDir().listFiles()?.forEach { entry ->
            if (entry.isDirectory) {
                entry.listFiles()?.forEach { it.delete() }
                entry.delete()
            } else {
                entry.delete()
            }
        }
    }

    // ── Internal ─────────────────────────────────────────────────

    private fun readMeta(sourceId: String): CatalogMeta? {
        val f = File(sourceDir(sourceId), META_FILE)
        if (!f.exists()) return null
        return try {
            json.decodeFromString(CatalogMeta.serializer(), f.readText())
        } catch (_: Throwable) {
            null
        }
    }

    private fun groupFile(sourceId: String, kind: CatalogKind, groupId: String): File =
        File(groupsDir(sourceId), "${kind.filePrefix()}__${safeFileName(groupId)}.json")

    private fun safeFileName(id: String): String =
        id.replace(Regex("[^a-zA-Z0-9._-]"), "_").take(120)

    private fun writeKindCache(
        sourceId: String,
        kind: CatalogKind,
        groups: List<ChannelGroup>,
    ): Boolean {
        if (groups.isEmpty()) return true
        val dir = sourceDir(sourceId)
        val index = groups.map { g ->
            GroupIndexEntry(
                id = g.id,
                name = g.name,
                kind = g.kind,
                channelCount = g.channels.size,
            )
        }.distinctBy { it.id }
        val channelIndex = mutableMapOf<String, String>()
        for (group in groups) {
            for (channel in group.channels) {
                channelIndex[channel.id] = group.id
            }
            val withCount = group.copy(channelCount = group.channels.size)
            writeGroupFile(groupFile(sourceId, kind, group.id), withCount)
        }
        writeIndexFile(File(dir, kind.indexFileName()), index)
        writeChannelIndexFile(File(dir, kind.channelIndexFileName()), channelIndex)
        return true
    }

    private fun writeGroupListFile(file: File, groups: List<ChannelGroup>) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        BufferedOutputStream(FileOutputStream(tmp)).use { output ->
            json.encodeToStream(groupListSerializer, groups, output)
        }
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    private fun writeGroupFile(file: File, group: ChannelGroup) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        BufferedOutputStream(FileOutputStream(tmp)).use { output ->
            json.encodeToStream(ChannelGroup.serializer(), group, output)
        }
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    /**
     * v3 group files were briefly written as a one-element JSON array; accept both
     * shapes so an existing on-device cache works after the write fix.
     */
    private fun decodeGroupFile(file: File): ChannelGroup? {
        return try {
            BufferedInputStream(FileInputStream(file)).use { input ->
                json.decodeFromStream(ChannelGroup.serializer(), input)
            }
        } catch (_: Throwable) {
            try {
                BufferedInputStream(FileInputStream(file)).use { input ->
                    json.decodeFromStream(groupListSerializer, input).firstOrNull()
                }
            } catch (_: Throwable) {
                null
            }
        }
    }

    private fun writeIndexFile(file: File, index: List<GroupIndexEntry>) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        BufferedOutputStream(FileOutputStream(tmp)).use { output ->
            json.encodeToStream(indexListSerializer, index, output)
        }
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    private fun writeChannelIndexFile(file: File, channelIndex: Map<String, String>) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(json.encodeToString(channelMapSerializer, channelIndex))
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    private fun writeMetaFile(file: File, meta: CatalogMeta) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(json.encodeToString(CatalogMeta.serializer(), meta))
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    private inline fun <reified T : Channel> filterGroupsByKind(
        groups: List<ChannelGroup>,
    ): List<ChannelGroup> {
        val targetKind = when (T::class) {
            Channel.Live::class -> GroupKind.live
            Channel.Vod::class -> GroupKind.vod
            Channel.Series::class -> GroupKind.series
            else -> GroupKind.mixed
        }
        return groups.mapNotNull { g ->
            val filtered = g.channels.filterIsInstance<T>()
            if (filtered.isEmpty()) null
            else g.copy(channels = filtered, kind = targetKind)
        }
    }
}
