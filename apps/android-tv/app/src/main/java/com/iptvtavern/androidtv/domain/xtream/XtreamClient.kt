package com.iptvtavern.androidtv.domain.xtream

import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.SeriesEpisode
import com.iptvtavern.androidtv.domain.model.SeriesSeason
import com.iptvtavern.androidtv.domain.model.SubtitleTrack
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

    suspend fun fetchVodInfo(credentials: XtreamCredentials, vodId: Int): XtreamVodInfo {
        val url = buildPlayerApiUrl(credentials, "get_vod_info", mapOf("vod_id" to "$vodId"))
        return json.decodeFromString(fetchText(url))
    }

    /**
     * Fetch VOD info with caching. Uses XtreamCache's 24h TTL for `get_vod_info`.
     */
    suspend fun fetchVodInfoCached(
        credentials: XtreamCredentials,
        vodId: Int,
        cache: XtreamCache?,
    ): XtreamVodInfo = withContext(Dispatchers.IO) {
        val url = buildPlayerApiUrl(credentials, "get_vod_info", mapOf("vod_id" to "$vodId"))
        val text = if (cache != null) {
            cache.fetchCached(url, credentials)
        } else {
            fetchTextRaw(url)
        }
        json.decodeFromString(text)
    }

    /**
     * Fetch series info with caching. Uses XtreamCache's 24h TTL for `get_series_info`.
     */
    suspend fun fetchSeriesInfoCached(
        credentials: XtreamCredentials,
        seriesId: Int,
        cache: XtreamCache?,
    ): XtreamSeriesInfo = withContext(Dispatchers.IO) {
        val url = buildPlayerApiUrl(credentials, "get_series_info", mapOf("series_id" to "$seriesId"))
        val text = if (cache != null) {
            cache.fetchCached(url, credentials)
        } else {
            fetchTextRaw(url)
        }
        json.decodeFromString(text)
    }

    /**
     * Merge a base Series channel with detailed info from `get_series_info`.
     * Builds full season/episode structure with stream URLs.
     * Port of web's `mergeSeriesChannelWithXtreamInfo` in xtream.ts.
     */
    fun mergeSeriesChannelWithXtreamInfo(
        credentials: XtreamCredentials,
        base: Channel.Series,
        detail: XtreamSeriesInfo,
    ): Channel.Series {
        val info = detail.info

        // Build seasons with episodes from the episodes map
        val seasons = (detail.episodes ?: emptyMap()).entries
            .sortedBy { it.key.toIntOrNull() ?: 0 }
            .map { (seasonKey, episodes) ->
                val seasonNum = seasonKey.toIntOrNull() ?: 0
                // Find matching season metadata
                val seasonMeta = detail.seasons?.find {
                    jsonElementToInt(it.seasonNumber) == seasonNum
                }
                SeriesSeason(
                    seasonNumber = seasonNum,
                    name = seasonMeta?.name,
                    episodes = episodes.mapNotNull { ep ->
                        val epNum = jsonElementToInt(ep.episodeNum) ?: return@mapNotNull null
                        val ext = ep.containerExtension ?: "ts"
                        val streamUrl = buildSeriesEpisodeUrl(credentials, ep.id, ext)
                        // Collect subtitles from both root-level and info-level
                        val subtitles = buildList {
                            ep.subtitles?.forEach { sub ->
                                val url = sub.url?.takeIf { it.isNotBlank() } ?: return@forEach
                                add(SubtitleTrack(url = url, language = sub.language, label = sub.label))
                            }
                            ep.info?.subtitles?.forEach { sub ->
                                val url = sub.url?.takeIf { it.isNotBlank() } ?: return@forEach
                                add(SubtitleTrack(url = url, language = sub.language, label = sub.label))
                            }
                        }.takeIf { it.isNotEmpty() }
                        SeriesEpisode(
                            id = ep.id,
                            episodeNumber = epNum,
                            title = ep.title,
                            streamUrl = streamUrl,
                            containerExtension = ext,
                            durationSeconds = jsonElementToInt(ep.info?.durationSecs),
                            plot = ep.info?.plot?.takeIf { it.isNotBlank() },
                            xtreamEpisodeId = ep.id,
                            subtitles = subtitles,
                        )
                    },
                )
            }

        val yearFromDate = info?.releaseDate?.take(4)?.toIntOrNull()
        val backdropUrl = info?.backdropPath?.firstOrNull()
            ?.takeIf { it.isNotBlank() }
            ?.let { asUrl(it) }
        val rating = info?.rating?.toDoubleOrNull()

        return base.copy(
            plot = info?.plot?.takeIf { it.isNotBlank() } ?: base.plot,
            cast = info?.cast?.takeIf { it.isNotBlank() } ?: base.cast,
            director = info?.director?.takeIf { it.isNotBlank() } ?: base.director,
            genre = info?.genre?.takeIf { it.isNotBlank() } ?: base.genre,
            rating = rating ?: base.rating,
            releaseYear = yearFromDate ?: base.releaseYear,
            backdropUrl = backdropUrl ?: base.backdropUrl,
            seasons = seasons.ifEmpty { base.seasons },
        )
    }

    // ── Wire → Domain mappers ────────────────────────────────────

    fun toLiveChannel(
        credentials: XtreamCredentials,
        raw: XtreamLiveStream,
        categoryMap: Map<String, String>,
    ): Channel.Live? {
        val streamId = jsonElementToInt(raw.streamId) ?: return null
        val tvArchive = jsonElementToInt(raw.tvArchive)
        val direct = asUrl(raw.directSource)
        return Channel.Live(
            id = "xtream:live:$streamId",
            name = raw.name,
            groupTitle = categoryMap[raw.categoryId] ?: "Ungrouped",
            streamUrl = direct ?: buildLiveStreamUrl(credentials, streamId, extension = "ts"),
            logoUrl = asUrl(raw.streamIcon),
            tvgId = raw.epgChannelId?.takeIf { it.isNotBlank() },
            catchupDays = if (tvArchive != null && tvArchive > 0) tvArchive else null,
            xtreamStreamId = streamId,
            directSourceUrl = direct,
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

    /**
     * Merge a base VodChannel with detailed info from `get_vod_info`.
     *
     * Ported from web's `mergeVodChannelWithXtreamInfo` in
     * `packages/core/src/lib/xtream.ts`.
     *
     * The base channel comes from the catalog listing (has name, group,
     * streamUrl, basic fields). The info response fills in plot, cast,
     * director, trailer, backdrop, better rating, duration, etc.
     */
    fun mergeVodChannelWithXtreamInfo(
        base: Channel.Vod,
        info: XtreamVodInfo,
    ): Channel.Vod {
        val data = info.info ?: return base

        val rating = jsonElementToDouble(data.rating5based) ?: base.rating
        val durationSecs = jsonElementToInt(data.durationSecs) ?: base.durationSeconds
        val yearFromDate = data.releasedate
            ?.take(4)
            ?.toIntOrNull()
        val trailerUrl = normalizeYoutubeTrailerUrl(data.youtubeTrailer)
        val backdropUrl = data.backdropPath?.firstOrNull()
            ?.takeIf { it.isNotBlank() }
            ?.let { asUrl(it) }

        return base.copy(
            plot = data.plot?.takeIf { it.isNotBlank() } ?: base.plot,
            cast = data.cast?.takeIf { it.isNotBlank() } ?: base.cast,
            director = data.director?.takeIf { it.isNotBlank() } ?: base.director,
            genre = data.genre?.takeIf { it.isNotBlank() } ?: base.genre,
            trailerUrl = trailerUrl ?: base.trailerUrl,
            rating = rating,
            year = yearFromDate ?: base.year,
            durationSeconds = durationSecs,
            posterUrl = asUrl(data.movieImage) ?: base.posterUrl,
            backdropUrl = backdropUrl ?: base.backdropUrl,
        )
    }

    /**
     * Normalize YouTube trailer URLs.
     * Handles: full URLs, short URLs, just video IDs.
     */
    private fun normalizeYoutubeTrailerUrl(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        if (trimmed.startsWith("http")) return trimmed
        // Looks like a bare video ID (11 chars, alphanumeric)
        if (trimmed.length == 11 && trimmed.all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
            return "https://www.youtube.com/watch?v=$trimmed"
        }
        return null
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
     * @param onStepDone Optional callback invoked each time a discrete load
     *              step completes. Step indices match `PlaylistLoadSteps.ALL`:
     *              0 live cats, 1 live streams, 2 vod cats, 3 vod streams,
     *              4 series cats, 5 series, 6 parsing, 7 grouping.
     *              Step 8 (saving to cache) happens in PlaylistManager after
     *              this function returns. Callback is invoked from coroutine
     *              context — keep it cheap and thread-safe.
     */
    suspend fun loadXtreamPlaylist(
        credentials: XtreamCredentials,
        sourceId: String,
        cache: XtreamCache? = null,
        onStepDone: ((stepIndex: Int) -> Unit)? = null,
    ): Playlist = withContext(Dispatchers.IO) {
        // Helper: fetch text through cache or directly
        suspend fun cachedFetch(url: String): String {
            return cache?.fetchCached(url, credentials) ?: fetchText(url)
        }

        // The 6 endpoints run in parallel for speed (network-bound), but each
        // reports its own completion to the progress callback as it finishes.
        // Out-of-order completions are fine — the percentage is computed from
        // weighted step sums, so the bar still moves monotonically as long as
        // each step fires at most once.
        val liveCatsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_live_categories"))
            json.decodeFromString<List<XtreamCategory>>(text).also { onStepDone?.invoke(0) }
        }
        val liveStreamsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_live_streams"))
            json.decodeFromString<List<XtreamLiveStream>>(text).also { onStepDone?.invoke(1) }
        }
        val vodCatsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_vod_categories"))
            json.decodeFromString<List<XtreamCategory>>(text).also { onStepDone?.invoke(2) }
        }
        val vodStreamsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_vod_streams"))
            json.decodeFromString<List<XtreamVodStream>>(text).also { onStepDone?.invoke(3) }
        }
        val seriesCatsDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_series_categories"))
            json.decodeFromString<List<XtreamCategory>>(text).also { onStepDone?.invoke(4) }
        }
        val seriesListDeferred = async {
            val text = cachedFetch(buildPlayerApiUrl(credentials, "get_series"))
            json.decodeFromString<List<XtreamSeries>>(text).also { onStepDone?.invoke(5) }
        }

        val liveCategories = liveCatsDeferred.await()
        val liveStreams = liveStreamsDeferred.await()
        val vodCategories = vodCatsDeferred.await()
        val vodStreams = vodStreamsDeferred.await()
        val seriesCategories = seriesCatsDeferred.await()
        val seriesList = seriesListDeferred.await()

        // Step 6 — parse domain models from raw DTOs
        val liveCatMap = categoryMap(liveCategories)
        val vodCatMap = categoryMap(vodCategories)
        val seriesCatMap = categoryMap(seriesCategories)
        onStepDone?.invoke(6)

        // Step 7 — organize into groups by category (id-keyed — names can repeat)
        val groups = mutableListOf<ChannelGroup>()
        groups.addAll(
            buildGroupsByCategoryId(
                kindPrefix = "live",
                kind = GroupKind.live,
                categories = liveCategories,
                items = liveStreams.mapNotNull { raw ->
                    toLiveChannel(credentials, raw, liveCatMap)?.let { raw.categoryId to it }
                },
                sourceId = sourceId,
            ),
        )
        groups.addAll(
            buildGroupsByCategoryId(
                kindPrefix = "vod",
                kind = GroupKind.vod,
                categories = vodCategories,
                items = vodStreams.mapNotNull { raw ->
                    toVodChannel(credentials, raw, vodCatMap)?.let { raw.categoryId to it }
                },
                sourceId = sourceId,
            ),
        )
        groups.addAll(
            buildGroupsByCategoryId(
                kindPrefix = "series",
                kind = GroupKind.series,
                categories = seriesCategories,
                items = seriesList.mapNotNull { raw ->
                    toSeriesChannel(raw, seriesCatMap)?.let { raw.categoryId to it }
                },
                sourceId = sourceId,
            ),
        )
        onStepDone?.invoke(7)

        Playlist(
            sourceId = sourceId,
            groups = groups,
            fetchedAt = Instant.now().toString(),
        )
    }

    // ── Helpers ──────────────────────────────────────────────────

    /**
     * Build groups keyed by Xtream [category_id], not display name.
     * Providers often repeat category names; slugifying names produced duplicate
     * group ids and crashed Compose lazy lists.
     */
    private fun buildGroupsByCategoryId(
        kindPrefix: String,
        kind: GroupKind,
        categories: List<XtreamCategory>,
        items: List<Pair<String?, Channel>>,
        sourceId: String,
    ): List<ChannelGroup> {
        val byCatId = mutableMapOf<String, MutableList<Channel>>()
        for ((catId, channel) in items) {
            val key = catId?.takeIf { it.isNotBlank() } ?: UNGROUPED_KEY
            byCatId.getOrPut(key) { mutableListOf() }.add(channel)
        }

        val ordered = mutableListOf<ChannelGroup>()
        val seenIds = mutableSetOf<String>()

        for (cat in categories) {
            val catId = cat.categoryId?.takeIf { it.isNotBlank() } ?: continue
            val list = byCatId[catId] ?: continue
            if (list.isEmpty()) continue
            val groupId = "$sourceId:$kindPrefix:$catId"
            if (!seenIds.add(groupId)) continue
            ordered.add(
                ChannelGroup(
                    id = groupId,
                    name = cat.categoryName,
                    kind = kind,
                    channels = list,
                ),
            )
        }

        byCatId[UNGROUPED_KEY]?.takeIf { it.isNotEmpty() }?.let { list ->
            val groupId = "$sourceId:$kindPrefix:ungrouped"
            if (seenIds.add(groupId)) {
                ordered.add(
                    ChannelGroup(
                        id = groupId,
                        name = "Ungrouped",
                        kind = kind,
                        channels = list,
                    ),
                )
            }
        }

        // Channels whose category_id is missing from the categories list
        for ((catId, list) in byCatId) {
            if (catId == UNGROUPED_KEY || list.isEmpty()) continue
            val groupId = "$sourceId:$kindPrefix:$catId"
            if (seenIds.add(groupId)) {
                ordered.add(
                    ChannelGroup(
                        id = groupId,
                        name = list.first().groupTitle,
                        kind = kind,
                        channels = list,
                    ),
                )
            }
        }

        return ordered
    }

    private const val UNGROUPED_KEY = "__ungrouped__"

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
