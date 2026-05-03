package com.iptvtavern.androidtv.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.model.XtreamAccountSnapshot
import com.iptvtavern.androidtv.domain.model.XtreamCredentials

/**
 * Room entity for persisting sources.
 *
 * Room requires flat fields (no nested objects in columns), so we store
 * XtreamCredentials and XtreamAccountSnapshot as individual columns.
 * The `toDomain()` / `fromDomain()` methods convert between this entity
 * and the domain `Source` model.
 *
 * Think of this like a database row — similar to how you'd flatten a
 * nested object for an IndexedDB or SQL table on the web.
 */
@Entity(tableName = "sources")
data class SourceEntity(
    @PrimaryKey val id: String,
    val label: String,
    val type: String,           // "m3u_url" | "m3u_file" | "xtream"
    val url: String? = null,
    val epgUrl: String? = null,
    val userAgent: String? = null,
    // Xtream credentials (flattened)
    val credHost: String? = null,
    val credUsername: String? = null,
    val credPassword: String? = null,
    // Xtream account snapshot (flattened)
    val acctExpDate: String? = null,
    val acctCreatedAt: String? = null,
    val acctStatus: String? = null,
    val acctIsTrial: String? = null,
    val acctUsername: String? = null,
    val acctActiveConnections: String? = null,
    val acctMaxConnections: String? = null,
) {
    fun toDomain(): Source = Source(
        id = id,
        label = label,
        type = when (type) {
            "m3u_url" -> SourceType.M3U_URL
            "m3u_file" -> SourceType.M3U_FILE
            "xtream" -> SourceType.XTREAM
            else -> SourceType.M3U_URL
        },
        url = url,
        credentials = if (credHost != null && credUsername != null && credPassword != null) {
            XtreamCredentials(host = credHost, username = credUsername, password = credPassword)
        } else null,
        epgUrl = epgUrl,
        userAgent = userAgent,
        xtreamAccount = if (acctExpDate != null || acctStatus != null || acctMaxConnections != null) {
            XtreamAccountSnapshot(
                expDate = acctExpDate,
                createdAt = acctCreatedAt,
                status = acctStatus,
                isTrial = acctIsTrial,
                username = acctUsername,
                activeConnections = acctActiveConnections,
                maxConnections = acctMaxConnections,
            )
        } else null,
    )

    companion object {
        fun fromDomain(source: Source): SourceEntity = SourceEntity(
            id = source.id,
            label = source.label,
            type = when (source.type) {
                SourceType.M3U_URL -> "m3u_url"
                SourceType.M3U_FILE -> "m3u_file"
                SourceType.XTREAM -> "xtream"
            },
            url = source.url,
            epgUrl = source.epgUrl,
            userAgent = source.userAgent,
            credHost = source.credentials?.host,
            credUsername = source.credentials?.username,
            credPassword = source.credentials?.password,
            acctExpDate = source.xtreamAccount?.expDate,
            acctCreatedAt = source.xtreamAccount?.createdAt,
            acctStatus = source.xtreamAccount?.status,
            acctIsTrial = source.xtreamAccount?.isTrial,
            acctUsername = source.xtreamAccount?.username,
            acctActiveConnections = source.xtreamAccount?.activeConnections,
            acctMaxConnections = source.xtreamAccount?.maxConnections,
        )
    }
}
