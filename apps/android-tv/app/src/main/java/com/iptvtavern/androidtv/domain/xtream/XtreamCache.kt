package com.iptvtavern.androidtv.domain.xtream

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.net.URL
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Caching layer for Xtream API responses — Kotlin port of the web's
 * `createCachingXtreamFetcher` from `packages/core/src/lib/xtream-cache.ts`.
 *
 * Stores cached responses as **files on disk** (not Room) to avoid
 * SQLite CursorWindow size limits — Xtream stream lists can be 10MB+.
 *
 * ## How it works
 * 1. Each Xtream API call is keyed by URL (password stripped, params sorted).
 * 2. Responses are stored as files in the app's cache directory with a
 *    companion `.meta` JSON file holding timestamps and TTL.
 * 3. In-flight requests are deduplicated: concurrent coroutines requesting
 *    the same endpoint share one network call.
 * 4. `invalidateSource()` clears all cache entries for a given account.
 *
 * ## TTLs (Android TV)
 * All cached responses live for 30 days. The Home screen has a manual
 * Refresh button that calls `invalidateSource()` to force fresh fetches.
 * This trades data freshness for fast cold starts — appropriate for a
 * lean-back player where channel lists rarely change.
 *
 * Web app uses shorter TTLs because it has no equivalent refresh affordance.
 */
@Singleton
class XtreamCache @Inject constructor(
    @ApplicationContext private val appContext: Context,
) {
    companion object {
        private const val CACHE_DIR_NAME = "xtream_cache"

        // TTLs in millis — Android TV uses long TTLs because the user
        // has a manual Refresh button on the Home screen. Channel lists
        // change rarely (weekly at most for most providers), so caching
        // for 30 days makes cold starts near-instant. Press Refresh to
        // force a fresh fetch when the provider adds/removes channels.
        private const val THIRTY_DAYS_MS = 30L * 24 * 60 * 60 * 1000
        private val ACTION_TTLS = mapOf(
            "get_live_categories" to THIRTY_DAYS_MS,
            "get_vod_categories" to THIRTY_DAYS_MS,
            "get_series_categories" to THIRTY_DAYS_MS,
            "get_live_streams" to THIRTY_DAYS_MS,
            "get_vod_streams" to THIRTY_DAYS_MS,
            "get_series" to THIRTY_DAYS_MS,
            "get_vod_info" to THIRTY_DAYS_MS,
            "get_series_info" to THIRTY_DAYS_MS,
        )
    }

    @Serializable
    private data class CacheMeta(
        val storedAt: Long,
        val ttlMs: Long,
        val sourceIdentity: String,
    )

    private val json = Json { ignoreUnknownKeys = true }

    /** In-flight dedup: prevents duplicate network calls for the same key. */
    private val inFlight = mutableMapOf<String, kotlinx.coroutines.CompletableDeferred<String>>()
    private val mutex = Mutex()

    private val cacheDir: File
        get() = File(appContext.filesDir, CACHE_DIR_NAME).also { it.mkdirs() }

    // NOTE: We deliberately use `filesDir` and NOT `cacheDir`.
    // - `cacheDir` (/data/data/<pkg>/cache) can be wiped by the OS at any
    //   time under storage pressure, and is also wiped by some launchers'
    //   "Clear cache" affordance — making "fast cold start" unreliable.
    // - `filesDir` (/data/data/<pkg>/files) survives until uninstall or
    //   explicit "Clear data". Since the Home screen exposes a manual
    //   Refresh button, the user is always in control of cache freshness,
    //   so we want maximum persistence.

    /**
     * Fetch a URL with caching. If a fresh cache entry exists, return it.
     * Otherwise fetch from network, cache the response, and return it.
     */
    suspend fun fetchCached(
        url: String,
        credentials: com.iptvtavern.androidtv.domain.model.XtreamCredentials,
    ): String {
        val action = extractAction(url)
        val ttl = ACTION_TTLS[action] ?: 0L

        // Never cache auth probes or EPG
        if (ttl == 0L) {
            return XtreamClient.fetchTextRaw(url)
        }

        val key = buildCacheKey(url)
        val identity = sourceIdentity(credentials)
        val now = System.currentTimeMillis()

        // Check disk cache
        val cached = withContext(Dispatchers.IO) { readFromDisk(key) }
        if (cached != null) {
            val meta = cached.first
            if (now < meta.storedAt + meta.ttlMs) {
                return cached.second
            }
            // Stale — delete
            withContext(Dispatchers.IO) { deleteFromDisk(key) }
        }

        // In-flight dedup
        val existingDeferred = mutex.withLock { inFlight[key] }
        if (existingDeferred != null) {
            return existingDeferred.await()
        }

        val deferred = kotlinx.coroutines.CompletableDeferred<String>()
        mutex.withLock { inFlight[key] = deferred }

        try {
            val text = XtreamClient.fetchTextRaw(url)
            // Store on disk
            withContext(Dispatchers.IO) {
                writeToDisk(key, text, CacheMeta(
                    storedAt = System.currentTimeMillis(),
                    ttlMs = ttl,
                    sourceIdentity = identity,
                ))
            }
            deferred.complete(text)
            return text
        } catch (e: Exception) {
            deferred.completeExceptionally(e)
            throw e
        } finally {
            mutex.withLock { inFlight.remove(key) }
        }
    }

    /** Clear all cached responses for a specific Xtream account. */
    suspend fun invalidateSource(credentials: com.iptvtavern.androidtv.domain.model.XtreamCredentials) {
        val identity = sourceIdentity(credentials)
        withContext(Dispatchers.IO) {
            val dir = cacheDir
            dir.listFiles()?.filter { it.name.endsWith(".meta") }?.forEach { metaFile ->
                try {
                    val meta = json.decodeFromString<CacheMeta>(metaFile.readText())
                    if (meta.sourceIdentity == identity) {
                        val baseName = metaFile.nameWithoutExtension
                        File(dir, "$baseName.json").delete()
                        metaFile.delete()
                    }
                } catch (_: Exception) {
                    metaFile.delete()
                }
            }
        }
    }

    /** Clear all Xtream cache entries. */
    suspend fun clear() {
        withContext(Dispatchers.IO) {
            cacheDir.listFiles()?.forEach { it.delete() }
        }
    }

    // ── Disk I/O ─────────────────────────────────────────────────

    private fun readFromDisk(key: String): Pair<CacheMeta, String>? {
        val hash = hashKey(key)
        val dataFile = File(cacheDir, "$hash.json")
        val metaFile = File(cacheDir, "$hash.meta")
        if (!dataFile.exists() || !metaFile.exists()) return null
        return try {
            val meta = json.decodeFromString<CacheMeta>(metaFile.readText())
            val data = dataFile.readText()
            meta to data
        } catch (_: Exception) {
            dataFile.delete()
            metaFile.delete()
            null
        }
    }

    private fun writeToDisk(key: String, data: String, meta: CacheMeta) {
        val hash = hashKey(key)
        File(cacheDir, "$hash.json").writeText(data)
        File(cacheDir, "$hash.meta").writeText(json.encodeToString(CacheMeta.serializer(), meta))
    }

    private fun deleteFromDisk(key: String) {
        val hash = hashKey(key)
        File(cacheDir, "$hash.json").delete()
        File(cacheDir, "$hash.meta").delete()
    }

    /** SHA-256 hash of the cache key → safe filename. */
    private fun hashKey(key: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    // ── Key building (mirrors web's cacheKey function) ───────────

    private fun buildCacheKey(urlString: String): String {
        val parsed = URL(urlString)
        val params = (parsed.query ?: "")
            .split("&")
            .filter { it.isNotEmpty() }
            .map { part ->
                val eqIdx = part.indexOf('=')
                if (eqIdx >= 0) part.substring(0, eqIdx) to part.substring(eqIdx + 1)
                else part to ""
            }
            .filter { it.first != "password" }
            .sortedBy { it.first }

        val sortedQuery = params.joinToString("&") { "${it.first}=${it.second}" }
        val port = if (parsed.port == -1) "" else ":${parsed.port}"
        return "${parsed.protocol}://${parsed.host}$port${parsed.path}?$sortedQuery"
    }

    private fun extractAction(urlString: String): String? {
        val parsed = URL(urlString)
        return (parsed.query ?: "")
            .split("&")
            .firstOrNull { it.startsWith("action=") }
            ?.substringAfter("action=")
    }

    private fun sourceIdentity(credentials: com.iptvtavern.androidtv.domain.model.XtreamCredentials): String {
        val host = credentials.host.trimEnd('/')
        return "$host#${credentials.username}"
    }
}
