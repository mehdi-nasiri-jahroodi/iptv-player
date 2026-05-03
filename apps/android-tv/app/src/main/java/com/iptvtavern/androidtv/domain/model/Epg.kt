package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.Serializable

/**
 * EPG (Electronic Program Guide) models.
 *
 * Aligned with `contracts.ts#epgProgramSchema` and `epgGuideSchema`.
 */

@Serializable
data class EpgProgram(
    val channelId: String,
    val title: String,
    /** ISO-8601 datetime string. */
    val start: String,
    /** ISO-8601 datetime string. */
    val end: String,
    val description: String? = null,
)

/**
 * Full EPG guide — a map of channel IDs to their program lists.
 *
 * In TypeScript: `Record<string, EpgProgram[]>`.
 * In Kotlin: `Map<String, List<EpgProgram>>`.
 */
@Serializable
data class EpgGuide(
    val programsByChannelId: Map<String, List<EpgProgram>> = emptyMap(),
)
