package com.iptvtavern.androidtv.domain.parser

import com.iptvtavern.androidtv.domain.model.EpgGuide
import com.iptvtavern.androidtv.domain.model.EpgProgram
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.regex.Pattern

/**
 * XMLTV parser + EPG helpers.
 *
 * Port of `packages/core/src/lib/epg.ts`.
 *
 * Web equivalent: `parseXmltvToGuide`, `getNowAndNextProgram`,
 * `flatProgramsInWindow`, `parseXmltvDatetimeToIso`.
 */
object EpgParser {

    // ── XMLTV datetime → ISO-8601 ──────────────────────────────────

    /**
     * Parse XMLTV `start`/`stop` values like `20250503140000 +0200`
     * into an ISO-8601 instant string (`2025-05-03T12:00:00Z`).
     *
     * XMLTV format: `YYYYMMDDHHmmss` optionally followed by a space
     * and `Z`, `z`, or numeric offset `±HHMM` / `±HH:MM`.
     */
    fun parseXmltvDatetimeToIso(value: String): String {
        val raw = value.trim()
        val compact = raw.take(14)
        if (compact.length < 14 || !compact.all { it.isDigit() }) {
            return EPOCH_ISO
        }

        val y = compact.substring(0, 4)
        val mo = compact.substring(4, 6)
        val d = compact.substring(6, 8)
        val h = compact.substring(8, 10)
        val mi = compact.substring(10, 12)
        val sec = compact.substring(12, 14)
        val tail = raw.drop(14).trim()

        val offsetSuffix = when {
            tail.isEmpty() -> "Z"
            tail.equals("Z", ignoreCase = true) -> "Z"
            OFFSET_4_PATTERN.matches(tail) -> {
                // +0200 → +02:00
                "${tail[0]}${tail.substring(1, 3)}:${tail.substring(3, 5)}"
            }
            OFFSET_COLON_PATTERN.matches(tail) -> tail
            else -> "Z"
        }

        val localWall = "$y-$mo-${d}T$h:$mi:$sec"
        val instant = if (offsetSuffix == "Z") "${localWall}Z" else "$localWall$offsetSuffix"

        return try {
            // Parse and re-format as UTC ISO (same as TS: new Date(instant).toISOString())
            OffsetDateTime.parse(instant, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                .toInstant()
                .toString()
        } catch (_: DateTimeParseException) {
            EPOCH_ISO
        }
    }

    // ── Sorting ────────────────────────────────────────────────────

    /** Sort programmes by ascending start time. Returns a new list. */
    fun sortEpgPrograms(programs: List<EpgProgram>): List<EpgProgram> {
        return programs.sortedBy { parseInstant(it.start) }
    }

    /** Sort every channel bucket in a guide. */
    fun normalizeEpgGuide(guide: EpgGuide): EpgGuide {
        return EpgGuide(
            programsByChannelId = guide.programsByChannelId.mapValues { (_, progs) ->
                sortEpgPrograms(progs)
            }
        )
    }

    // ── Now / Next ─────────────────────────────────────────────────

    data class NowNext(
        val current: EpgProgram? = null,
        val next: EpgProgram? = null,
    )

    /**
     * Given a single channel's programmes (any order), return the programme
     * airing at [nowMs] and the following one.
     */
    fun getNowAndNextProgram(
        programs: List<EpgProgram>?,
        nowMs: Long = System.currentTimeMillis(),
    ): NowNext {
        if (programs.isNullOrEmpty()) return NowNext()

        val sorted = sortEpgPrograms(programs)
        var current: EpgProgram? = null
        var idx = -1

        for (i in sorted.indices) {
            val p = sorted[i]
            val s = parseInstant(p.start)
            val e = parseInstant(p.end)
            if (nowMs >= s && nowMs < e) {
                current = p
                idx = i
                break
            }
        }

        val next: EpgProgram? = if (idx >= 0) {
            sorted.getOrNull(idx + 1)
        } else {
            sorted.firstOrNull { parseInstant(it.start) > nowMs }
        }

        return NowNext(current = current, next = next)
    }

    // ── Flat window query (for schedule grid) ──────────────────────

    data class FlatEpgRow(
        val channelId: String,
        val channelName: String,
        val program: EpgProgram,
    )

    /**
     * All programmes overlapping `[windowStartMs, windowEndMs)`, sorted by start,
     * with a display name per EPG channel id (usually equals M3U `tvg-id`).
     */
    fun flatProgramsInWindow(
        guide: EpgGuide,
        channelNamesByTvgId: Map<String, String>,
        windowStartMs: Long,
        windowEndMs: Long,
    ): List<FlatEpgRow> {
        val rows = mutableListOf<FlatEpgRow>()
        for ((channelId, programs) in guide.programsByChannelId) {
            val channelName = channelNamesByTvgId[channelId] ?: channelId
            for (p in programs) {
                val s = parseInstant(p.start)
                val e = parseInstant(p.end)
                if (e > windowStartMs && s < windowEndMs) {
                    rows.add(FlatEpgRow(channelId, channelName, p))
                }
            }
        }
        rows.sortBy { parseInstant(it.program.start) }
        return rows
    }

    // ── XMLTV XML → EpgGuide ───────────────────────────────────────

    /**
     * Parse raw XMLTV XML into an [EpgGuide].
     *
     * Uses regex (like the TS version) to avoid pulling a full XML parser
     * dependency. Handles `<programme>` elements with `channel`, `start`,
     * `stop` attributes and `<title>`, `<desc>` child elements.
     */
    fun parseXmltvToGuide(xml: String): EpgGuide {
        val programsByChannelId = mutableMapOf<String, MutableList<EpgProgram>>()

        val matcher = PROGRAMME_PATTERN.matcher(xml)
        while (matcher.find()) {
            val attrs = matcher.group(1) ?: continue
            val body = matcher.group(2) ?: continue

            val channelId = extractAttr(attrs, "channel") ?: continue
            val startRaw = extractAttr(attrs, "start") ?: continue
            val endRaw = extractAttr(attrs, "stop") ?: continue
            val title = decodeXmlEntities(extractTag(body, "title") ?: "")
            val description = decodeXmlEntities(extractTag(body, "desc") ?: "")

            if (channelId.isBlank() || title.isBlank()) continue

            val program = EpgProgram(
                channelId = channelId.trim(),
                title = title.trim(),
                start = parseXmltvDatetimeToIso(startRaw),
                end = parseXmltvDatetimeToIso(endRaw),
                description = description.ifBlank { null },
            )
            programsByChannelId.getOrPut(program.channelId) { mutableListOf() }.add(program)
        }

        return normalizeEpgGuide(
            EpgGuide(programsByChannelId = programsByChannelId)
        )
    }

    // ── Private helpers ────────────────────────────────────────────

    private const val EPOCH_ISO = "1970-01-01T00:00:00Z"

    private val OFFSET_4_PATTERN = Regex("""^[+-]\d{4}$""")
    private val OFFSET_COLON_PATTERN = Regex("""^[+-]\d{2}:\d{2}$""")

    private val PROGRAMME_PATTERN: Pattern = Pattern.compile(
        """<(?:tv:)?programme\b([^>]*)>([\s\S]*?)</(?:tv:)?programme>""",
        Pattern.CASE_INSENSITIVE,
    )

    private fun parseInstant(iso: String): Long {
        return try {
            Instant.parse(iso).toEpochMilli()
        } catch (_: DateTimeParseException) {
            0L
        }
    }

    private fun extractAttr(attrs: String, name: String): String? {
        // Try double-quoted then single-quoted
        val dq = Regex("""\b$name="([^"]+)"""").find(attrs)?.groupValues?.get(1)
        if (dq != null) return dq.trim()
        val sq = Regex("""\b$name='([^']+)'""").find(attrs)?.groupValues?.get(1)
        return sq?.trim()
    }

    private fun extractTag(body: String, tagName: String): String? {
        val pattern = Regex(
            """<(?:tv:)?$tagName[^>]*>([\s\S]*?)</(?:tv:)?$tagName>""",
            RegexOption.IGNORE_CASE,
        )
        return pattern.find(body)?.groupValues?.get(1)?.trim()
    }

    private fun decodeXmlEntities(text: String): String {
        return text
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
    }
}
