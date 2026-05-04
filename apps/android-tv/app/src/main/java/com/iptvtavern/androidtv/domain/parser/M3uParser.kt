package com.iptvtavern.androidtv.domain.parser

import com.iptvtavern.androidtv.domain.model.CatchupMode
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupKind
import com.iptvtavern.androidtv.domain.model.Playlist
import java.io.BufferedReader
import java.time.Instant

/**
 * M3U playlist parser — Kotlin port of `packages/core/src/lib/m3u.ts`.
 *
 * Parses extended M3U text into the domain [Playlist] model. Only produces
 * [Channel.Live] entries — VOD and Series detection is handled upstream by
 * Xtream catalog mappers (Phase 8).
 *
 * ## M3U format overview (for web devs)
 *
 * M3U is a plain-text playlist format. An extended M3U file looks like:
 * ```
 * #EXTM3U
 * #EXTINF:-1 tvg-id="CNN" tvg-logo="https://..." group-title="News",CNN HD
 * http://stream.example.com/cnn
 * #EXTINF:-1 group-title="Sports",ESPN
 * http://stream.example.com/espn
 * ```
 *
 * Each channel is two lines: an `#EXTINF` metadata line followed by the
 * stream URL. The `-1` after `#EXTINF:` is the duration (-1 = live stream).
 * Quoted key="value" pairs carry metadata like group, logo, and EPG ID.
 */

/**
 * Intermediate representation of a parsed `#EXTINF` line.
 * Think of this like a "partial props object" before constructing the Channel.
 */
private data class ExtInfMeta(
    val name: String,
    val groupTitle: String,
    val logoUrl: String?,
    val tvgId: String?,
    val catchupDays: Int?,
    val catchupMode: CatchupMode?,
    val catchupSource: String?,
)

private val ATTR_PATTERN = Regex("""([\w-]+)="([^"]*)"""")

private val VALID_CATCHUP_MODES = setOf("default", "append", "shift", "flussonic", "xtream")

/**
 * Parse the `#EXTINF:` line into structured metadata.
 *
 * Example input:
 *   `#EXTINF:-1 tvg-id="CNN" tvg-logo="https://logo.png" group-title="News",CNN HD`
 */
private fun parseExtInf(line: String): ExtInfMeta {
    // Extract all key="value" attribute pairs
    val attrs = mutableMapOf<String, String>()
    for (match in ATTR_PATTERN.findAll(line)) {
        attrs[match.groupValues[1].lowercase()] = match.groupValues[2]
    }

    // Channel name is everything after the last comma
    val name = if (',' in line) {
        line.substringAfter(',').trim()
    } else {
        "Untitled channel"
    }

    // Catchup mode from `catchup` or `tvg-rec` attribute
    val catchupRaw = (attrs["catchup"] ?: attrs["tvg-rec"])?.trim()?.lowercase()
    val catchupMode = if (catchupRaw != null && catchupRaw in VALID_CATCHUP_MODES) {
        CatchupMode.valueOf(catchupRaw.uppercase())
    } else null

    // Catchup days — must be a positive integer
    val catchupDaysRaw = attrs["catchup-days"]?.trim()
    val catchupDays = if (catchupDaysRaw != null && catchupDaysRaw.matches(Regex("""\d+"""))) {
        catchupDaysRaw.toIntOrNull()
    } else null

    return ExtInfMeta(
        name = name,
        groupTitle = attrs["group-title"]?.trim()?.ifEmpty { null } ?: "Ungrouped",
        logoUrl = attrs["tvg-logo"]?.trim()?.ifEmpty { null },
        tvgId = attrs["tvg-id"]?.trim()?.ifEmpty { null },
        catchupMode = catchupMode,
        catchupDays = catchupDays,
        catchupSource = attrs["catchup-source"]?.trim()?.ifEmpty { null },
    )
}

/**
 * Parse raw M3U text into a [Playlist].
 *
 * @param input     Raw M3U file content (the full text string).
 * @param sourceId  ID of the [Source] this playlist belongs to.
 * @param fetchedAt ISO-8601 timestamp. Defaults to now.
 * @return A [Playlist] with channels grouped by `group-title`.
 */
fun parseM3uToPlaylist(
    input: String,
    sourceId: String,
    fetchedAt: String = Instant.now().toString(),
): Playlist {
    val lines = input
        .lineSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .toList()

    // LinkedHashMap preserves insertion order (groups appear in file order)
    val groups = LinkedHashMap<String, MutableList<Channel.Live>>()

    var currentExtInf: ExtInfMeta? = null
    var channelIndex = 0

    for (line in lines) {
        if (line.startsWith("#EXTINF:")) {
            currentExtInf = parseExtInf(line)
            continue
        }
        // Skip any other directives (#EXTM3U, #EXTVLCOPT, etc.)
        if (line.startsWith("#")) {
            continue
        }
        // This line is a URL — pair it with the previous #EXTINF
        val meta = currentExtInf ?: continue

        val channel = Channel.Live(
            id = "$sourceId:$channelIndex",
            name = meta.name,
            groupTitle = meta.groupTitle,
            streamUrl = line,
            logoUrl = meta.logoUrl,
            tvgId = meta.tvgId,
            catchupDays = meta.catchupDays,
            catchupMode = meta.catchupMode,
            catchupSource = meta.catchupSource,
        )
        channelIndex++

        groups.getOrPut(channel.groupTitle) { mutableListOf() }.add(channel)
        currentExtInf = null
    }

    val channelGroups = groups.map { (name, channels) ->
        ChannelGroup(
            id = name.lowercase().replace(Regex("""\s+"""), "-"),
            name = name,
            kind = GroupKind.live,
            channels = channels,
        )
    }

    return Playlist(
        sourceId = sourceId,
        groups = channelGroups,
        fetchedAt = fetchedAt,
    )
}

/**
 * Streaming M3U parser — reads line-by-line from a [BufferedReader] without
 * loading the entire file into memory. Essential for large catalogs (85k+
 * channels / 50-100MB files) on memory-constrained devices like Chromecast.
 *
 * Produces the same result as [parseM3uToPlaylist] but with O(result) memory
 * instead of O(input + result).
 */
fun parseM3uFromStream(
    reader: BufferedReader,
    sourceId: String,
    fetchedAt: String = Instant.now().toString(),
): Playlist {
    val groups = LinkedHashMap<String, MutableList<Channel.Live>>()
    var currentExtInf: ExtInfMeta? = null
    var channelIndex = 0

    reader.useLines { lines ->
        for (rawLine in lines) {
            val line = rawLine.trim()
            if (line.isEmpty()) continue

            if (line.startsWith("#EXTINF:")) {
                currentExtInf = parseExtInf(line)
                continue
            }
            if (line.startsWith("#")) continue

            val meta = currentExtInf ?: continue

            val channel = Channel.Live(
                id = "$sourceId:$channelIndex",
                name = meta.name,
                groupTitle = meta.groupTitle,
                streamUrl = line,
                logoUrl = meta.logoUrl,
                tvgId = meta.tvgId,
                catchupDays = meta.catchupDays,
                catchupMode = meta.catchupMode,
                catchupSource = meta.catchupSource,
            )
            channelIndex++

            groups.getOrPut(channel.groupTitle) { mutableListOf() }.add(channel)
            currentExtInf = null
        }
    }

    val channelGroups = groups.map { (name, channels) ->
        ChannelGroup(
            id = name.lowercase().replace(Regex("""\s+"""), "-"),
            name = name,
            kind = GroupKind.live,
            channels = channels,
        )
    }

    return Playlist(
        sourceId = sourceId,
        groups = channelGroups,
        fetchedAt = fetchedAt,
    )
}
