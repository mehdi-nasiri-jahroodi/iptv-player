package com.iptvtavern.androidtv.domain.parser

/**
 * Quality badge heuristics — Kotlin port of `apps/web/app/lib/live-channel-badges.ts`.
 *
 * Infers stream quality from channel names. Providers often embed
 * resolution hints like "4K", "FHD", "HD" in the channel title.
 */

private val REGEX_4K = Regex("""\b(4k|uhd|2160p)\b""", RegexOption.IGNORE_CASE)
private val REGEX_FHD = Regex("""\b1080p\b|\bfhd\b|full\s*hd""", RegexOption.IGNORE_CASE)
private val REGEX_720P = Regex("""\b720p\b""", RegexOption.IGNORE_CASE)
private val REGEX_HD = Regex("""\bhd\b""", RegexOption.IGNORE_CASE)

/**
 * Returns quality hints inferred from the channel name.
 * Example: "BBC One 4K" → listOf("4K")
 */
fun inferStreamQualityHints(channelName: String): List<String> {
    return when {
        REGEX_4K.containsMatchIn(channelName) -> listOf("4K")
        REGEX_FHD.containsMatchIn(channelName) -> listOf("1080p")
        REGEX_720P.containsMatchIn(channelName) -> listOf("720p")
        REGEX_HD.containsMatchIn(channelName) -> listOf("HD")
        else -> emptyList()
    }
}

/**
 * Numeric quality rank for sorting (higher = better).
 * 5 = 4K, 4 = 1080p, 3 = 720p, 2 = HD, 0 = unknown.
 */
fun streamQualityRank(channelName: String): Int {
    val hints = inferStreamQualityHints(channelName)
    return when {
        "4K" in hints -> 5
        "1080p" in hints -> 4
        "720p" in hints -> 3
        "HD" in hints -> 2
        else -> 0
    }
}
