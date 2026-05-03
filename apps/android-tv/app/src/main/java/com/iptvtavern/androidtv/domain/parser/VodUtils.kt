package com.iptvtavern.androidtv.domain.parser

import com.iptvtavern.androidtv.domain.model.Channel

/**
 * VOD utility functions — format duration, sort, poster badge text.
 *
 * Ported from:
 * - `packages/ui/src/lib/vod-format.ts` (formatVodDuration)
 * - `apps/web/app/lib/vod-sort.ts` (sorting)
 * - `packages/ui/src/lib/vod-poster-meta.ts` (badge segments)
 */

// ── Duration formatting ─────────────────────────────────────────

/**
 * Format VOD duration in seconds to a human-readable string.
 * Examples: `90` → "1h 30m", `600` → "10 min"
 */
fun formatVodDuration(seconds: Int?): String? {
    if (seconds == null || seconds <= 0) return null
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m} min"
}

// ── Poster badge ────────────────────────────────────────────────

/**
 * Build a badge string for a VOD poster tile.
 * Example: "2025 · 6.8 ★ · 1h 43m"
 */
fun getVodPosterBadge(channel: Channel.Vod): String? {
    val parts = mutableListOf<String>()
    channel.year?.let { parts.add("$it") }
    channel.rating?.let { r ->
        if (r > 0) parts.add("${"%.1f".format(r)} ★")
    }
    formatVodDuration(channel.durationSeconds)?.let { parts.add(it) }
    return parts.joinToString(" · ").takeIf { it.isNotBlank() }
}

// ── Sorting ─────────────────────────────────────────────────────

/**
 * Sort key options for VOD browsing.
 * Matches web's `VodSortKey` type.
 */
enum class VodSortKey {
    DEFAULT,
    NAME,
    YEAR,
    RATING,
    DURATION,
    DIRECTOR,
    ADDED,
}

enum class VodSortDir {
    ASC,
    DESC,
}

/**
 * Sort a list of VOD channels by the given key and direction.
 *
 * Ported from `apps/web/app/lib/vod-sort.ts`.
 * - `DEFAULT` preserves playlist order.
 * - Numeric sorts push missing/non-finite values last regardless of direction.
 * - All sorts use name as secondary tiebreaker.
 */
fun sortVodChannels(
    channels: List<Channel.Vod>,
    key: VodSortKey,
    direction: VodSortDir = VodSortDir.ASC,
): List<Channel.Vod> {
    if (key == VodSortKey.DEFAULT) return channels

    val dir = if (direction == VodSortDir.ASC) 1 else -1

    return channels.sortedWith(Comparator { a, b ->
        val cmp = when (key) {
            VodSortKey.NAME ->
                a.name.compareTo(b.name, ignoreCase = true) * dir

            VodSortKey.YEAR ->
                compareNullableInt(a.year, b.year, dir)

            VodSortKey.RATING ->
                compareNullableDouble(a.rating, b.rating, dir)

            VodSortKey.DURATION ->
                compareNullableInt(a.durationSeconds, b.durationSeconds, dir)

            VodSortKey.DIRECTOR ->
                compareNullableString(a.director, b.director, dir)

            VodSortKey.ADDED ->
                compareNullableInt(a.xtreamAddedAtSec, b.xtreamAddedAtSec, dir)

            VodSortKey.DEFAULT -> 0 // unreachable
        }
        // Tiebreaker: name ascending
        if (cmp != 0) cmp else a.name.compareTo(b.name, ignoreCase = true)
    })
}

/** Compare nullable ints — nulls sort last regardless of direction. */
private fun compareNullableInt(a: Int?, b: Int?, dir: Int): Int {
    if (a == null && b == null) return 0
    if (a == null) return 1  // a goes last
    if (b == null) return -1 // b goes last
    return a.compareTo(b) * dir
}

/** Compare nullable doubles — nulls sort last regardless of direction. */
private fun compareNullableDouble(a: Double?, b: Double?, dir: Int): Int {
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return a.compareTo(b) * dir
}

/** Compare nullable strings — nulls/blanks sort last regardless of direction. */
private fun compareNullableString(a: String?, b: String?, dir: Int): Int {
    val aBlank = a.isNullOrBlank()
    val bBlank = b.isNullOrBlank()
    if (aBlank && bBlank) return 0
    if (aBlank) return 1
    if (bBlank) return -1
    return a!!.compareTo(b!!, ignoreCase = true) * dir
}
