package com.iptvtavern.androidtv.data.repository

import android.util.Log
import com.iptvtavern.androidtv.domain.model.EpgGuide
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.EpgParser
import com.iptvtavern.androidtv.domain.parser.extractUrlTvg
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory EPG guide store.
 *
 * Equivalent of `apps/web/app/store/guide-store.ts`.
 *
 * Fetches the XMLTV URL from the active source, parses it via [EpgParser],
 * and exposes the result as a [StateFlow]. Android has no CORS issues, so
 * this is simpler than the web version.
 */
@Singleton
class EpgRepository @Inject constructor() {

    companion object {
        private const val TAG = "EpgRepository"
    }

    enum class Status { IDLE, LOADING, READY, ERROR }

    data class EpgState(
        val sourceId: String? = null,
        val guide: EpgGuide? = null,
        val status: Status = Status.IDLE,
        val error: String? = null,
        val epgUrl: String? = null,
    )

    private val _state = MutableStateFlow(EpgState())
    val state: StateFlow<EpgState> = _state.asStateFlow()

    /** Current guide (convenience accessor). */
    val guide: EpgGuide? get() = _state.value.guide

    /**
     * Fetch and parse EPG for the given source.
     *
     * EPG URL resolution order:
     * 1. [Source.epgUrl] — set manually or extracted from `url-tvg` during validation
     * 2. [deriveEpgUrl] — derived lazily (Xtream endpoint, or M3U header fetch)
     *
     * If no URL is found, clears any existing guide.
     * Skips if already loaded for the same source.
     */
    suspend fun loadForSource(source: Source) {
        val epgUrl = source.epgUrl?.trim()?.takeIf { it.isNotEmpty() }
            ?: deriveEpgUrl(source)

        if (epgUrl == null) {
            Log.d(TAG, "No EPG URL for source '${source.label}' (type=${source.type})")
            _state.value = EpgState(sourceId = source.id)
            return
        }

        Log.d(TAG, "Loading EPG from: $epgUrl")

        // Already loaded for this source?
        val prev = _state.value
        if (prev.sourceId == source.id && prev.status == Status.READY && prev.guide != null) {
            return
        }

        _state.value = EpgState(sourceId = source.id, status = Status.LOADING, epgUrl = epgUrl)

        try {
            val xml = fetchXmltvText(epgUrl, source.userAgent)
            // Check if source changed while we were fetching
            if (_state.value.sourceId != source.id) return

            Log.d(TAG, "EPG XML received: ${xml.length} chars")
            val guide = withContext(Dispatchers.Default) {
                EpgParser.parseXmltvToGuide(xml)
            }
            if (_state.value.sourceId != source.id) return

            Log.d(TAG, "EPG parsed: ${guide.programsByChannelId.size} channels")
            _state.value = EpgState(
                sourceId = source.id,
                guide = guide,
                status = Status.READY,
                epgUrl = epgUrl,
            )
        } catch (e: Exception) {
            Log.e(TAG, "EPG fetch failed: ${e.message}", e)
            if (_state.value.sourceId != source.id) return
            _state.value = EpgState(
                sourceId = source.id,
                status = Status.ERROR,
                error = "${e.message ?: "Failed to load EPG"} [$epgUrl]",
                epgUrl = epgUrl,
            )
        }
    }

    /** Force reload (ignores "already loaded" check). */
    suspend fun reload(source: Source) {
        _state.value = EpgState(sourceId = source.id, status = Status.IDLE)
        loadForSource(source)
    }

    fun clear() {
        _state.value = EpgState()
    }

    /**
     * Derive the EPG URL when the source has no explicit [Source.epgUrl].
     *
     * - **Xtream**: well-known `{host}/xmltv.php?username=...&password=...`
     * - **M3U URL**: fetches just the `#EXTM3U` header line (first ~2KB via
     *   HTTP Range) to extract the `url-tvg` attribute. Lightweight — doesn't
     *   download the full playlist. Works for sources saved before `url-tvg`
     *   auto-extraction was added to validation.
     *
     * Called lazily from [loadForSource] — no cost until the user opens the Guide.
     */
    private suspend fun deriveEpgUrl(source: Source): String? {
        return when (source.type) {
            SourceType.XTREAM -> source.credentials?.let {
                XtreamClient.buildXmltvUrl(it)
            }
            SourceType.M3U_URL -> fetchM3uUrlTvg(source)
            else -> null
        }
    }

    /**
     * Fetch just the first line(s) of the M3U file to extract `url-tvg`.
     * Uses HTTP Range header to minimize data transfer (~2KB instead of full file).
     */
    private suspend fun fetchM3uUrlTvg(source: Source): String? {
        val urlString = source.url ?: return null
        return try {
            withContext(Dispatchers.IO) {
                val conn = URL(urlString).openConnection() as HttpURLConnection
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                conn.instanceFollowRedirects = true
                source.userAgent?.let { conn.setRequestProperty("User-Agent", it) }
                conn.setRequestProperty("Range", "bytes=0-2047")

                try {
                    val status = conn.responseCode
                    if (status !in 200..299 && status != 206) {
                        Log.d(TAG, "M3U header fetch returned HTTP $status")
                        return@withContext null
                    }

                    val stream = if (conn.contentEncoding?.equals("gzip", ignoreCase = true) == true) {
                        GZIPInputStream(conn.inputStream)
                    } else {
                        conn.inputStream
                    }
                    val header = stream.bufferedReader().use { it.readLine() }
                    val urlTvg = extractUrlTvg(header ?: "")
                    if (urlTvg != null) {
                        Log.d(TAG, "Found url-tvg in M3U header: $urlTvg")
                    } else {
                        Log.d(TAG, "M3U header has no url-tvg attribute")
                    }
                    urlTvg
                } finally {
                    conn.disconnect()
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "M3U url-tvg fetch failed: ${e.message}")
            null
        }
    }

    private suspend fun fetchXmltvText(url: String, userAgent: String?): String = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 60_000 // EPG files can be large
        connection.instanceFollowRedirects = true
        // Some IPTV panels reject requests without a User-Agent
        userAgent?.let { connection.setRequestProperty("User-Agent", it) }
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IOException("EPG HTTP $status")
            }
            // Handle gzip — many XMLTV servers serve compressed
            val stream = if (connection.contentEncoding?.equals("gzip", ignoreCase = true) == true) {
                GZIPInputStream(connection.inputStream)
            } else {
                connection.inputStream
            }
            stream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
