package com.iptvtavern.androidtv.domain.catchup

import com.iptvtavern.androidtv.domain.model.CatchupMode
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.EpgProgram
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.EpgParser
import com.iptvtavern.androidtv.domain.xtream.XtreamClient

/**
 * Builds a catchup / time-shift stream URL for a past [EpgProgram] on a
 * catchup-capable live channel.
 *
 * Resolution order:
 *
 * 1. **Xtream source + `XTREAM` mode** → [XtreamClient.buildCatchupUrl]
 *    (panel `timeshift` path).
 * 2. **`catchupSource` template present** → substitute the de-facto M3U
 *    tokens (`${start}`, `${end}`, `${duration}`, `${timestamp}`,
 *    `${stream}`, `${channel}`), case-insensitive. This is what most
 *    panels that ship a `catchup-source` attribute expect.
 * 3. **Mode fallback** (no template):
 *    - `default` / `append` → `streamUrl?start=<sec>&duration=<sec>`
 *    - `shift` / `flussonic` → `streamUrl?timeshift_abs=<startSec>`
 *
 * Returns null when catchup can't be built (e.g. missing stream id,
 * unparseable program times, or `XTREAM` mode without credentials).
 */
object CatchupUrlBuilder {

    fun build(channel: Channel.Live, source: Source?, program: EpgProgram): String? {
        val mode = channel.catchupMode ?: return null

        val startMs = EpgParser.parseInstantToMs(program.start)
        val endMs = EpgParser.parseInstantToMs(program.end)
        if (startMs <= 0L || endMs <= startMs) return null
        val durationSec = ((endMs - startMs) / 1000L).toInt().coerceAtLeast(1)

        if (source?.type == SourceType.XTREAM && mode == CatchupMode.XTREAM) {
            val creds = source.credentials ?: return null
            val streamId = channel.xtreamStreamId ?: return null
            val durationMinutes = ((durationSec + 59) / 60).coerceAtLeast(1)
            return XtreamClient.buildCatchupUrl(creds, streamId, startMs, durationMinutes)
        }

        val template = channel.catchupSource?.takeIf { it.isNotBlank() }
        if (template != null) {
            return substituteTemplate(template, channel, startMs, endMs, durationSec)
        }

        val startSec = startMs / 1000L
        val separator = if ('?' in channel.streamUrl) '&' else '?'
        return when (mode) {
            CatchupMode.DEFAULT, CatchupMode.APPEND ->
                "${channel.streamUrl}${separator}start=$startSec&duration=$durationSec"
            CatchupMode.SHIFT, CatchupMode.FLUSSONIC ->
                "${channel.streamUrl}${separator}timeshift_abs=$startSec"
            CatchupMode.XTREAM -> null
        }
    }

    private fun substituteTemplate(
        template: String,
        channel: Channel.Live,
        startMs: Long,
        endMs: Long,
        durationSec: Int,
    ): String {
        val startSec = startMs / 1000L
        val endSec = endMs / 1000L
        return template
            .replace("\${start}", startSec.toString(), ignoreCase = true)
            .replace("\${timestamp}", startSec.toString(), ignoreCase = true)
            .replace("\${S}", startSec.toString(), ignoreCase = true)
            .replace("\${end}", endSec.toString(), ignoreCase = true)
            .replace("\${duration}", durationSec.toString(), ignoreCase = true)
            .replace("\${stream}", channel.streamUrl, ignoreCase = true)
            .replace("\${channel}", channel.id, ignoreCase = true)
    }
}
