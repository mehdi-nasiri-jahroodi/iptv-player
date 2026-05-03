package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Source — the user's input: an M3U URL, an M3U file, or Xtream credentials.
 *
 * Aligned with `packages/core/schemas/Source.schema.json` and
 * `contracts.ts#sourceSchema`.
 *
 * Web equivalent: Zustand source store entry.
 * Android equivalent: Room entity persisted in the `sources` table.
 */

@Serializable
enum class SourceType {
    @SerialName("m3u_url") M3U_URL,
    @SerialName("m3u_file") M3U_FILE,
    @SerialName("xtream") XTREAM,
}

@Serializable
data class XtreamCredentials(
    val host: String,
    val username: String,
    val password: String,
)

/**
 * Snapshot of Xtream `user_info` after a successful login probe.
 * Optional fields — panels vary widely in what they return.
 */
@Serializable
data class XtreamAccountSnapshot(
    val expDate: String? = null,
    val createdAt: String? = null,
    val status: String? = null,
    val isTrial: String? = null,
    val username: String? = null,
    val activeConnections: String? = null,
    val maxConnections: String? = null,
)

@Serializable
data class Source(
    val id: String,
    val label: String,
    val type: SourceType,
    val url: String? = null,
    val credentials: XtreamCredentials? = null,
    val epgUrl: String? = null,
    val userAgent: String? = null,
    val xtreamAccount: XtreamAccountSnapshot? = null,
)
