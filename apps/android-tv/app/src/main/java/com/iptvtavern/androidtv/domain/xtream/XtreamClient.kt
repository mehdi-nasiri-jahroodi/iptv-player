package com.iptvtavern.androidtv.domain.xtream

import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SeriesEpisode
import com.iptvtavern.androidtv.domain.model.SeriesSeason
import com.iptvtavern.androidtv.domain.model.XtreamCredentials
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant

/**
 * Xtream Codes API client — Kotlin port of `packages/core/src/lib/xtream.ts`.
 *
 * Uses HttpURLConnection for network requests (no OkHttp yet).
 * All network calls run on Dispatchers.IO.
 *
 * ## Key differences from web
 * - No CORS / proxy concerns — direct HTTP
 * - No Zod validation — we use Kotlinx Serialization with ignoreUnknownKeys
 * - Credential safety: never log passwords
 */
object XtreamClient {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    // ── URL builders ─────────────────────────────────────────────

    fun buildPlayerApiUrl(
        credentials: XtreamCredentials,
        action: String? = null,
        params: Map<String, String> = emptyMap(),
    ): String {
        val c = sanitize(credentials)
        val base = "${c.host}/player_api.php"
        val queryParts = mutableListOf(
            "username=${enc(c.username)}",
            "password=${enc(c.password)}",
        )
        if (action != null) queryParts.add("action=$action")
        for ((k, v) in params) queryParts.add("$k=${enc(v)}")
        return "$base?${queryParts.joinToString("&")}"
    }

    fun buildLiveStreamUrl(
        credentials: XtreamCredentials,
        streamId: Int,
        extension: String = "m3u8",
    ): String {
        val c = sanitize(credentials)
        return "${c.host}/live/${enc(c.username)}/${enc(c.password)}/$streamId.$extension"
    }

    fun buildVodStreamUrl(
        credentials: XtreamCredentials,
        streamId: Int,
        containerExtension: String,
    ): String {
        val c = sanitize(credentials)
        return "${c.host}/movie/${enc(c.username)}/${enc(c.password)}/$streamId.$containerExtension"
    }

    fun buildSeriesEpisodeUrl(
        credentials: XtreamCredentials,
        episodeId: String,
        containerExtension: String,
    ): String {
        val c = sanitize(credentials)
        return "${c.host}/series/${enc(c.username)}/${enc(c.password)}/$episodeId.$containerExtension"
    }

    // ── Auth probe ───────────────────────────────────────────────

    suspend fun fetchPlayerApi(credentials: XtreamCredentials): XtreamPlayerApi {
        val url = buildPlayerApiUrl(credentials)
        val text = fetchText(url)
        return json.decodeFromString<XtreamPlayerApi>(text)
    }

    fun isAuthSuccessful(payload: XtreamPlayerApi): Boolean {
        val auth = payload.userInfo?.auth
        if (auth is JsonPrimitive) {
            if (auth.intOrNull == 1) return true
            if (auth.contentOrNull == "1") return true
        }
        return false
    }

    // ── Catalog fetchers ─────────────────────────────────────────

    suspend fun fetchLiveCategories(credentials: XtreamCredentials): List<XtreamCategory> {
        val url = buildPlayerApiUrl(credentials, "get_live_categories")
        return json.decodeFromString(fetchText(url))
    }

    suspend fun fetchLiveStreams(credentials: XtreamCredentials): List<XtreamLiveStream> {
        val url = buildPlayerApiUrl(credentials, "get_live_streams")
        return json.decodeFromString(fetchText(url))
    }

    suspend fun fetchVodCategories(credentials: XtreamCredentials): List<XtreamCategory> {
        val url = buildPlayerApiUrl(credentials, "get_vod_categories")
        return json.decodeFromString(fetchText(url))
    }

    suspend fun fetchVodStreams(credentials: XtreamCredentials): List<XtreamVodStream> {
        val url = buildPlayerApiUrl(credentials, "get_vod_streams")
        return json.decodeFromString(fetchText(url))
    }

    suspend fun fetchSeriesCategories(credentials: XtreamCredentials): List<XtreamCategory> {
        val url = buildPlayerApiUrl(credentials, "get_series_categories")
        return json.decodeFromString(fetchText(url))
    }

    suspend fun fetchSeries(credentials: XtreamCredentials): List<XtreamSeries> {
        val url = buildPlayerApiUrl(credentials, "get_series")
        return json.decodeFromString(fetchText(url))
    }

    suspend fun fetchSeriesInfo(credentials: XtreamCredentials, seriesId: Int): XtreamSeriesInfo {
        val url = buildPlayerApiUrl(credentials, "get_series_info", mapOf("series_id" to "$seriesId"))
        return json.decodeFromString(fetchText(url))
    }

    // ── Wire → Domain mappers ────────────────────────────────────

    fun toLiveChannel(
        credentials: XtreamCredentials,
        raw: XtreamLiveStream,
        categoryMap: Map<String, String>,
    ): Channel.Live? {
        val streamId = jsonElementToInt(raw.streamId) ?: return null
        val tvArchive = jsonElementToInt(raw.tvArchive)
        return Channel.Live(
            id = "xtream:live:$streamId",
            name = raw.name,
            groupTitle = categoryMap[raw.categoryId] ?: "Ungrouped",
            streamUrl = buildLiveStreamUrl(credentials, streamId),
            logoUrl = asUrl(raw.streamIcon),
            tvgId = raw.epgChannelId?.takeIf { it.isNotBlank() },
            catchupDays = if (tvArchive != null && tvArchive > 0) tvArchive else null,
            xtreamStreamId = streamId,
        )
    }

    fun toVodChannel(
        credentials: XtreamCredentials,
        raw: XtreamVodStream,
        categoryMap: Map<String, String>,
    ): Channel.Vod? {
        val streamId = jsonElementToInt(raw.streamId) ?: return null
        val ext = raw.containerExtension ?: "mp4"
        return Channel.Vod(
            id = "xtream:vod:$streamId",
            name = raw.name,
            groupTitle = categoryMap[raw.categoryId] ?: "Ungrouped",
            streamUrl = buildVodStreamUrl(credentials, streamId, ext),
            logoUrl = asUrl(raw.streamIcon),
            posterUrl = asUrl(raw.streamIcon),
            rating = jsonElementToDouble(raw.rating5based),
            year = raw.year?.toIntOrNull(),
            genre = raw.genre?.takeIf { it.isNotBlank() },
            containerExtension = ext,
            xtreamStreamId = streamId,
        )
    }

    fun toSeriesChannel(
        raw: XtreamSeries,
        categoryMap: Map<String, String>,
    ): Channel.Series? {
        val seriesId = jsonElementToInt(raw.seriesId) ?: return null
        return Channel.Series(
            id = "xtream:series:$seriesId",
            name = raw.name,
            groupTitle = categoryMap[raw.categoryId] ?: "Ungrouped",
            logoUrl = asUrl(raw.cover),
            posterUrl = asUrl(raw.cover),
            plot = raw.plot,
            cast = raw.cast,
            director = raw.director,
            genre = raw.genre,
            xtreamSeriesId = seriesId,
        )
    }

    // ── High-level playlist loader ───────────────────────────────

    /**
     * Load the full Xtream catalog — live + vod + series categories and streams.
     * Similar to web's `loadXtreamPlaylist`.
     *
     * @param cache Optional XtreamCache for per-action response caching with TTLs.
     *              When provided, API responses are cached in Room and reused
     *              within their TTL window — preventing provider rate-limit bans.
     */
    suspend fun loadXtreamPlaylist(
        credentials: XtreamCredentials,
        sourceId: String,
        cache: XtreamCache? = null,
    ): Playlist = withContext(Dispatchers.IO) {
        // Helper: fetch text through cache or directly
        suspend fun cachedFetch(url: String): String {
            return cache?.fetchCached(url, credentials) ?: fetchText(url)
        }

        // Fetch all 6 endpoints in parallel
        val liveCatsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_live_categories"))
            json.decodeFromString<List<XtreamCategory>>(text)
        }
        val liveStreamsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_live_streams"))
            json.decodeFromString<List<XtreamLiveStream>>(text)
        }
        val vodCatsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_vod_categories"))
            json.decodeFromString<List<XtreamCategory>>(text)
        }
        val vodStreamsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_vod_streams"))
            json.decodeFromString<List<XtreamVodStream>>(text)
        }
        val seriesCatsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_series_categories"))
            json.decodeFromString<List<XtreamCategory>>(text)
        }
        val seriesListDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_series"))
            json.decodeFromString<List<XtreamSeries>>(text)
        }

        val liveCategories = liveCatsDeferred.await()
        val liveStreams = liveStreamsDeferred.await()
        val vodCategories = vodCatsDeferred.await()
        val vodStreams = vodStreamsDeferred.await()
        val seriesCategories = seriesCatsDeferred.await()
        val seriesList = seriesListDeferred.await()

        val liveCatMap = categoryMap(liveCategories)
        val vodCatMap = categoryMap(vodCategories)
        val seriesCatMap = categoryMap(seriesCategories)

        val liveChannels = liveStreams.mapNotNull { toLiveChannel(credentials, it, liveCatMap) }
        val vodChannels = vodStreams.mapNotNull { toVodChannel(credentials, it, vodCatMap) }
        val seriesChannels = seriesList.mapNotNull { toSeriesChannel(it, seriesCatMap) }

        val groups = mutableListOf<ChannelGroup>()
        groups.addAll(buildGroups("live", GroupKind.live, liveCategories, liveChannels, sourceId))
        groups.addAll(buildGroups("vod", GroupKind.vod, vodCategories, vodChannels, sourceId))
        groups.addAll(buildGroups("series", GroupKind.series, seriesCategories, seriesChannels, sourceId))

        Playlist(
            sourceId = sourceId,
            groups = groups,
            fetchedAt = Instant.now().toString(),
        )
    }

    // ── Helpers ──────────────────────────────────────────────────

    private fun buildGroups(
        kindPrefix: String,
        kind: GroupKind,
        categories: List<XtreamCategory>,
        channels: List<Channel>,
        sourceId: String,
    ): List<ChannelGroup> {
        val byGroup = mutableMapOf<String, MutableList<Channel>>()
        for (ch in channels) {
            byGroup.getOrPut(ch.groupTitle) { mutableListOf() }.add(ch)
        }

        val ordered = mutableListOf<ChannelGroup>()
        val seen = mutableSetOf<String>()

        // Preserve category order from provider
        for (cat in categories) {
            val list = byGroup[cat.categoryName]
            if (list != null && list.isNotEmpty()) {
                ordered.add(ChannelGroup(
                    id = "$sourceId:$kindPrefix:${slugify(cat.categoryName)}",
                    name = cat.categoryName,
                    kind = kind,
                    channels = list,
                ))
                seen.add(cat.categoryName)
            }
        }
        // Append ungrouped
        for ((name, list) in byGroup) {
            if (name !in seen) {
                ordered.add(ChannelGroup(
                    id = "$sourceId:$kindPrefix:${slugify(name)}",
                    name = name,
                    kind = kind,
                    channels = list,
                ))
            }
        }
        return ordered
    }

    private fun categoryMap(categories: List<XtreamCategory>): Map<String, String> {
        return categories.associate { (it.categoryId ?: "") to it.categoryName }
    }

    private suspend fun fetchText(urlString: String): String = fetchTextRaw(urlString)

    /** Public raw fetch — used by XtreamCache for network calls. */
    suspend fun fetchTextRaw(urlString: String): String = withContext(Dispatchers.IO) {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IOException("HTTP $status from Xtream API")
            }
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun sanitize(c: XtreamCredentials): XtreamCredentials {
        return XtreamCredentials(
            host = c.host.trimEnd('/').trim(),
            username = c.username.trim(),
            password = c.password.trim(),
        )
    }

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun slugify(value: String): String {
        return value.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')
            .ifEmpty { "group" }
    }

    private fun asUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val trimmed = value.trim()
        return try {
            URL(trimmed) // validates
            trimmed
        } catch (_: Exception) {
            null
        }
    }

    private fun jsonElementToInt(element: kotlinx.serialization.json.JsonElement?): Int? {
        if (element == null || element !is JsonPrimitive) return null
        return element.intOrNull ?: element.contentOrNull?.toIntOrNull()
    }

    private fun jsonElementToDouble(element: kotlinx.serialization.json.JsonElement?): Double? {
        if (element == null || element !is JsonPrimitive) return null
        return element.doubleOrNull ?: element.contentOrNull?.toDoubleOrNull()
    }
}
