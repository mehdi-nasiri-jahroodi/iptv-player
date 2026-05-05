package com.iptvtavern.androidtv.data.repository

import android.content.Context
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
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
 * Per-kind on-disk cache of *parsed* playlists.
 *
 * ## Why this exists
 * `XtreamCache` already stores raw HTTP JSON from the provider.
 * But on cold start we still pay the painful step:
 *
 *   1. Read 30–80 MB of JSON text from disk
 *   2. `Json.decodeFromString` to thousands of Xtream DTOs
 *   3. Map each DTO → our domain `Channel` model
 *   4. Group by category to build `ChannelGroup`s
 *
 * On a Chromecast that's 3–8 seconds of CPU. Doing it once and
 * persisting the *result* skips all of that on subsequent launches.
 *
 * ## Why split per kind
 * The Live page only needs `Channel.Live`. The Movies page only needs
 * `Channel.Vod`. Loading the entire 85k-channel playlist when the user
 * just wants the Live tab wastes both time and the Chromecast's tiny
 * 128 MB heap. With per-kind files, each Browse screen reads only its
 * slice (e.g. ~9k live channels instead of 85k).
 *
 * ## Layout
 * ```
 * filesDir/
 *   playlist_cache/
 *     <sourceId>/
 *       meta.json     // savedAt, version, hasLive/Vod/Series
 *       live.json     // List<ChannelGroup> with only Channel.Live
 *       vod.json      // List<ChannelGroup> with only Channel.Vod
 *       series.json   // List<ChannelGroup> with only Channel.Series
 * ```
 *
 * Using `filesDir` (not `cacheDir`) so the OS can't wipe the cache
 * under storage pressure. The user controls freshness via the Home
 * screen's Refresh button + the [TTL_MS] expiry.
 *
 * ## Schema versioning
 * If we change the `Channel` data class shape (rename a field, add a
 * required field, etc.) old cached files will fail to deserialize.
 * Bump [CACHE_VERSION] when that happens — old caches are silently
 * discarded and the next load re-fetches.
 */
@OptIn(ExperimentalSerializationApi::class)
@Singleton
class PlaylistCacheStore @Inject constructor(
    @ApplicationContext private val appContext: Context,
) {
    companion object {
        private const val DIR_NAME = "playlist_cache"

        /** Bump when [Channel] / [ChannelGroup] / [Playlist] shape changes. */
        private const val CACHE_VERSION: Int = 1

        /** 30-day TTL — matches XtreamCache. */
        const val TTL_MS: Long = 30L * 24 * 60 * 60 * 1000

        private const val META_FILE = "meta.json"
        private const val LIVE_FILE = "live.json"
        private const val VOD_FILE = "vod.json"
        private const val SERIES_FILE = "series.json"
    }

    @Serializable
    private data class Meta(
        val savedAt: Long,
        val version: Int,
        val sourceId: String,
        val fetchedAt: String,
        val hasLive: Boolean,
        val hasVod: Boolean,
        val hasSeries: Boolean,
    )

    /**
     * `kotlinx.serialization` JSON instance. `ignoreUnknownKeys` so a
     * field added to a model in a future build doesn't blow up reading
     * an older cache; we only fail-discard on `CACHE_VERSION` mismatch
     * or actual deserialization errors.
     */
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    private fun rootDir(): File =
        File(appContext.filesDir, DIR_NAME).also { it.mkdirs() }

    private fun sourceDir(sourceId: String): File =
        File(rootDir(), sourceId).also { it.mkdirs() }

    // ── Public API ───────────────────────────────────────────────

    /**
     * True iff a non-stale, version-matching cache exists for the source.
     * Cheap — only reads the small `meta.json`, not the channel files.
     */
    suspend fun isFresh(sourceId: String): Boolean = withContext(Dispatchers.IO) {
        val meta = readMeta(sourceId) ?: return@withContext false
        if (meta.version != CACHE_VERSION) return@withContext false
        val now = System.currentTimeMillis()
        now < meta.savedAt + TTL_MS
    }

    /** Read the live-channels slice. Returns `null` on miss / corrupt / stale. */
    suspend fun readLive(sourceId: String): List<ChannelGroup>? =
        readSlice(sourceId, LIVE_FILE)

    /** Read the VOD slice. */
    suspend fun readVod(sourceId: String): List<ChannelGroup>? =
        readSlice(sourceId, VOD_FILE)

    /** Read the series slice. */
    suspend fun readSeries(sourceId: String): List<ChannelGroup>? =
        readSlice(sourceId, SERIES_FILE)

    /**
     * Read all three slices and reassemble a full `Playlist`.
     * Used by HomeViewModel for catalog counts + recents.
     *
     * Returns `null` if the cache is missing/stale/corrupt.
     */
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
            // Any partial corruption → treat the whole cache as bad and
            // let the caller fall through to a network refetch.
            invalidate(sourceId)
            null
        }
    }

    /**
     * Persist a full playlist as 3 per-kind files + meta.
     *
     * Splitting happens here rather than at the call site because the
     * caller (PlaylistManager) shouldn't know about file layout.
     *
     * Writes are *not* atomic across the 3 files — if the process is
     * killed mid-write the meta won't exist yet (we write it last) so
     * the next read sees a missing/stale cache and refetches. That's
     * the correct failure mode for a TV player.
     */
    suspend fun writePlaylist(playlist: Playlist) = withContext(Dispatchers.IO) {
        val dir = sourceDir(playlist.sourceId)

        // Split groups by the *kind* of channel they contain. A group
        // can technically be mixed (parsed from a free-form M3U), so
        // we filter the channel list per kind and only keep groups
        // that still have at least one matching channel.
        val liveGroups = filterGroupsByKind<Channel.Live>(playlist.groups)
        val vodGroups = filterGroupsByKind<Channel.Vod>(playlist.groups)
        val seriesGroups = filterGroupsByKind<Channel.Series>(playlist.groups)

        // Write the three slice files first. If any fails, the meta
        // file won't be written and the next read treats the cache as
        // missing. Catch per-file so a partial write doesn't take the
        // whole save down — but if any failed, don't write meta either.
        var allOk = true
        try {
            writeJsonFile(File(dir, LIVE_FILE), liveGroups)
            writeJsonFile(File(dir, VOD_FILE), vodGroups)
            writeJsonFile(File(dir, SERIES_FILE), seriesGroups)
        } catch (_: Throwable) {
            allOk = false
        }

        if (allOk) {
            val meta = Meta(
                savedAt = System.currentTimeMillis(),
                version = CACHE_VERSION,
                sourceId = playlist.sourceId,
                fetchedAt = playlist.fetchedAt,
                hasLive = liveGroups.isNotEmpty(),
                hasVod = vodGroups.isNotEmpty(),
                hasSeries = seriesGroups.isNotEmpty(),
            )
            try {
                writeJsonFile(File(dir, META_FILE), meta)
            } catch (_: Throwable) {
                // Meta failed → wipe the orphan slice files so we
                // don't read them next time and incorrectly assume
                // they're current.
                invalidate(playlist.sourceId)
            }
        }
    }

    /** Delete the cache for a single source. */
    suspend fun invalidate(sourceId: String) = withContext(Dispatchers.IO) {
        val dir = sourceDir(sourceId)
        dir.listFiles()?.forEach { it.delete() }
    }

    /** Delete every cached source. */
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

    private fun readMeta(sourceId: String): Meta? {
        val f = File(sourceDir(sourceId), META_FILE)
        if (!f.exists()) return null
        return try {
            // Meta is tiny — readText is fine here.
            json.decodeFromString(Meta.serializer(), f.readText())
        } catch (_: Throwable) {
            null
        }
    }

    private suspend fun readSlice(sourceId: String, filename: String): List<ChannelGroup>? =
        withContext(Dispatchers.IO) {
            if (!isFresh(sourceId)) return@withContext null
            val f = File(sourceDir(sourceId), filename)
            if (!f.exists()) return@withContext null
            try {
                // Stream-decode: avoids allocating a 24 MB+ String for the
                // whole file. Critical on Chromecast (128 MB heap) where
                // `f.readText()` for vod.json would OOM during cold start.
                BufferedInputStream(FileInputStream(f)).use { input ->
                    json.decodeFromStream(
                        kotlinx.serialization.builtins.ListSerializer(ChannelGroup.serializer()),
                        input,
                    )
                }
            } catch (_: Throwable) {
                // Corrupt — bin the whole source so we don't keep returning
                // empty lists and wonder why everything is broken.
                invalidate(sourceId)
                null
            }
        }

    private fun writeJsonFile(file: File, groups: List<ChannelGroup>) {
        // Write to a temp file then rename — guards against half-written
        // files if the process is killed mid-write.
        //
        // Stream-encode: builds the JSON directly into the file's
        // OutputStream instead of materializing a giant String first.
        // For a 24 MB vod.json, the String approach allocates ~50 MB
        // (UTF-16 char buffer + StringBuilder doubling) which OOMs on
        // Chromecast. Streaming keeps peak overhead to a few KB.
        val tmp = File(file.parentFile, file.name + ".tmp")
        BufferedOutputStream(FileOutputStream(tmp)).use { output ->
            json.encodeToStream(
                kotlinx.serialization.builtins.ListSerializer(ChannelGroup.serializer()),
                groups,
                output,
            )
        }
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    private fun writeJsonFile(file: File, meta: Meta) {
        // Meta is tiny — String round-trip is fine.
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(json.encodeToString(Meta.serializer(), meta))
        if (file.exists()) file.delete()
        tmp.renameTo(file)
    }

    /**
     * Reduce groups to only those containing at least one channel of
     * the requested concrete subtype, dropping non-matching channels.
     *
     * `inline reified` is the Kotlin idiom for "pass a type at runtime
     * without reflection". Equivalent to passing `Channel.Live::class`
     * but simpler at the call site.
     *
     * The kind override on the resulting group makes a downstream
     * consumer's life easier — if a group ends up with only Live
     * channels we tag it as `live` regardless of what the parser
     * originally inferred.
     */
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
