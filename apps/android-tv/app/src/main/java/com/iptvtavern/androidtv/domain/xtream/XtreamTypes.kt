package com.iptvtavern.androidtv.domain.xtream

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Xtream Codes API wire types — Kotlin equivalents of the Zod schemas
 * in `packages/core/src/lib/contracts.ts`.
 *
 * All use `.passthrough()` semantics via @Serializable + ignoreUnknownKeys,
 * so extra fields from panels don't crash deserialization.
 */

// ── Auth probe response ─────────────────────────────────────────

@Serializable
data class XtreamUserInfo(
    val username: String? = null,
    val password: String? = null,
    val auth: JsonElement? = null, // can be Int (1) or String ("1")
    val status: String? = null,
    @SerialName("exp_date") val expDate: String? = null,
    @SerialName("is_trial") val isTrial: String? = null,
    @SerialName("active_cons") val activeCons: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("max_connections") val maxConnections: String? = null,
)

@Serializable
data class XtreamServerInfo(
    val url: String? = null,
    val port: String? = null,
    @SerialName("https_port") val httpsPort: String? = null,
    @SerialName("server_protocol") val serverProtocol: String? = null,
    @SerialName("rtmp_port") val rtmpPort: String? = null,
    val timezone: String? = null,
    @SerialName("timestamp_now") val timestampNow: Long? = null,
    @SerialName("time_now") val timeNow: String? = null,
)

@Serializable
data class XtreamPlayerApi(
    @SerialName("user_info") val userInfo: XtreamUserInfo? = null,
    @SerialName("server_info") val serverInfo: XtreamServerInfo? = null,
)

// ── Categories ──────────────────────────────────────────────────

@Serializable
data class XtreamCategory(
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("category_name") val categoryName: String = "",
    @SerialName("parent_id") val parentId: Int? = null,
)

// ── Live streams ────────────────────────────────────────────────

@Serializable
data class XtreamLiveStream(
    val num: Int? = null,
    val name: String = "",
    @SerialName("stream_type") val streamType: String? = null,
    @SerialName("stream_id") val streamId: JsonElement? = null,
    @SerialName("stream_icon") val streamIcon: String? = null,
    @SerialName("epg_channel_id") val epgChannelId: String? = null,
    val added: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("custom_sid") val customSid: String? = null,
    @SerialName("tv_archive") val tvArchive: JsonElement? = null,
    @SerialName("direct_source") val directSource: String? = null,
    @SerialName("tv_archive_duration") val tvArchiveDuration: JsonElement? = null,
)

// ── VOD streams ─────────────────────────────────────────────────

@Serializable
data class XtreamVodStream(
    val num: Int? = null,
    val name: String = "",
    @SerialName("stream_type") val streamType: String? = null,
    @SerialName("stream_id") val streamId: JsonElement? = null,
    @SerialName("stream_icon") val streamIcon: String? = null,
    val rating: String? = null,
    @SerialName("rating_5based") val rating5based: JsonElement? = null,
    val added: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("container_extension") val containerExtension: String? = null,
    @SerialName("custom_sid") val customSid: String? = null,
    @SerialName("direct_source") val directSource: String? = null,
    val year: String? = null,
    val genre: String? = null,
    val duration: String? = null,
    @SerialName("duration_secs") val durationSecs: JsonElement? = null,
    val releaseDate: String? = null,
    val releasedate: String? = null,
)

// ── VOD info (detail) ───────────────────────────────────────────

@Serializable
data class XtreamVodInfoData(
    val plot: String? = null,
    val cast: String? = null,
    val director: String? = null,
    val genre: String? = null,
    val rating: String? = null,
    @SerialName("rating_5based") val rating5based: JsonElement? = null,
    val duration: String? = null,
    @SerialName("duration_secs") val durationSecs: JsonElement? = null,
    @SerialName("movie_image") val movieImage: String? = null,
    val releasedate: String? = null,
    @SerialName("youtube_trailer") val youtubeTrailer: String? = null,
    @SerialName("backdrop_path") val backdropPath: List<String>? = null,
)

@Serializable
data class XtreamVodInfo(
    val info: XtreamVodInfoData? = null,
    @SerialName("movie_data") val movieData: JsonElement? = null,
)

// ── Series ──────────────────────────────────────────────────────

@Serializable
data class XtreamSeries(
    val num: Int? = null,
    val name: String = "",
    @SerialName("series_id") val seriesId: JsonElement? = null,
    val cover: String? = null,
    val plot: String? = null,
    val cast: String? = null,
    val director: String? = null,
    val genre: String? = null,
    val rating: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("releaseDate") val releaseDate: String? = null,
)

@Serializable
data class XtreamEpisodeInfo(
    @SerialName("duration_secs") val durationSecs: JsonElement? = null,
    val plot: String? = null,
)

@Serializable
data class XtreamEpisode(
    val id: String = "",
    @SerialName("episode_num") val episodeNum: JsonElement? = null,
    val title: String = "",
    @SerialName("container_extension") val containerExtension: String? = null,
    val info: XtreamEpisodeInfo? = null,
)

@Serializable
data class XtreamSeasonMeta(
    @SerialName("season_number") val seasonNumber: JsonElement? = null,
    val name: String? = null,
)

@Serializable
data class XtreamSeriesInfo(
    val info: XtreamSeriesInfoData? = null,
    val seasons: List<XtreamSeasonMeta>? = null,
    // episodes is a map of season number string -> episode list
    val episodes: Map<String, List<XtreamEpisode>>? = null,
)

@Serializable
data class XtreamSeriesInfoData(
    val plot: String? = null,
    val cast: String? = null,
    val director: String? = null,
    val genre: String? = null,
    val rating: String? = null,
    val releaseDate: String? = null,
    @SerialName("backdrop_path") val backdropPath: List<String>? = null,
)
