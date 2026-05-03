package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Channel — discriminated union: live | vod | series.
 *
 * Aligned with `packages/core/schemas/Channel.schema.json` and
 * `contracts.ts#channelSchema`.
 *
 * In TypeScript this is `z.discriminatedUnion("type", [...])`.
 * In Kotlin we model it as a sealed class with `@SerialName` on each
 * subclass — Kotlinx Serialization uses the "type" field as discriminator,
 * just like Zod uses the "type" field for narrowing.
 */
@Serializable
sealed class Channel {
    abstract val id: String
    abstract val name: String
    abstract val groupTitle: String
    abstract val streamUrl: String
    abstract val logoUrl: String?

    /** Live TV channel — M3U live entries and Xtream get_live_streams. */
    @Serializable
    @SerialName("live")
    data class Live(
        override val id: String,
        override val name: String,
        override val groupTitle: String,
        override val streamUrl: String,
        override val logoUrl: String? = null,
        /** EPG correlation key. M3U: tvg-id. Xtream: epg_channel_id. */
        val tvgId: String? = null,
        val catchupDays: Int? = null,
        val catchupMode: CatchupMode? = null,
        val catchupSource: String? = null,
        val xtreamStreamId: Int? = null,
    ) : Channel()

    /** Video on demand entry (a single movie). */
    @Serializable
    @SerialName("vod")
    data class Vod(
        override val id: String,
        override val name: String,
        override val groupTitle: String,
        override val streamUrl: String,
        override val logoUrl: String? = null,
        val durationSeconds: Int? = null,
        val year: Int? = null,
        val rating: Double? = null,
        val plot: String? = null,
        val cast: String? = null,
        val director: String? = null,
        val genre: String? = null,
        val trailerUrl: String? = null,
        val containerExtension: String? = null,
        val posterUrl: String? = null,
        val backdropUrl: String? = null,
        val xtreamStreamId: Int? = null,
        val xtreamAddedAtSec: Int? = null,
        val subtitles: List<SubtitleTrack>? = null,
    ) : Channel()

    /**
     * Series don't have a direct streamUrl — episodes have their own URLs.
     * We use an empty string as the base streamUrl since it's abstract and required.
     */
    @Serializable
    @SerialName("series")
    data class Series(
        override val id: String,
        override val name: String,
        override val groupTitle: String,
        override val streamUrl: String = "",
        override val logoUrl: String? = null,
        val posterUrl: String? = null,
        val backdropUrl: String? = null,
        val plot: String? = null,
        val cast: String? = null,
        val director: String? = null,
        val genre: String? = null,
        val releaseYear: Int? = null,
        val rating: Double? = null,
        val seasons: List<SeriesSeason> = emptyList(),
        val xtreamSeriesId: Int? = null,
    ) : Channel()
}

@Serializable
enum class CatchupMode {
    @SerialName("default") DEFAULT,
    @SerialName("append") APPEND,
    @SerialName("shift") SHIFT,
    @SerialName("flussonic") FLUSSONIC,
    @SerialName("xtream") XTREAM,
}

/** A single external subtitle track (SRT/VTT URL + language metadata). */
@Serializable
data class SubtitleTrack(
    val url: String,
    val language: String? = null,
    val label: String? = null,
    val mimeType: String? = null,
)

@Serializable
data class SeriesEpisode(
    val id: String,
    val episodeNumber: Int,
    val title: String,
    val streamUrl: String,
    val containerExtension: String? = null,
    val durationSeconds: Int? = null,
    val plot: String? = null,
    val xtreamEpisodeId: String? = null,
    val subtitles: List<SubtitleTrack>? = null,
)

@Serializable
data class SeriesSeason(
    val seasonNumber: Int,
    val name: String? = null,
    val episodes: List<SeriesEpisode> = emptyList(),
)
