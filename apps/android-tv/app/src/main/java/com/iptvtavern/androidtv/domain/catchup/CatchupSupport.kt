package com.iptvtavern.androidtv.domain.catchup

import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.EpgProgram
import com.iptvtavern.androidtv.domain.parser.EpgParser

/**
 * Catchup capability + EPG-window helpers.
 *
 * A live channel is catchup-capable when it declares a [CatchupMode] AND
 * either a `catchupSource` template OR `catchupDays > 0`. Xtream channels
 * get `XTREAM` mode + `tv_archive` days from the panel; M3U channels get
 * mode + days/template from `#EXTINF` attributes.
 */
object CatchupSupport {

    fun isSupported(channel: Channel?): Boolean {
        val live = channel as? Channel.Live ?: return false
        if (live.catchupMode == null) return false
        if (!live.catchupSource.isNullOrBlank()) return true
        return (live.catchupDays ?: 0) > 0
    }

    /**
     * Earliest epoch-ms the user can scrub back to for [channel]
     * (= now − `catchupDays`, clamped to ≥ 0). When `catchupDays` is null
     * but a `catchupSource` template is present, defaults to 24h.
     */
    fun windowStartMs(channel: Channel.Live, nowMs: Long = System.currentTimeMillis()): Long {
        val days = channel.catchupDays ?: if (!channel.catchupSource.isNullOrBlank()) 1 else 0
        val lookbackMs = days.coerceAtLeast(0) * 24L * 60L * 60L * 1000L
        return (nowMs - lookbackMs).coerceAtLeast(0L)
    }

    /**
     * Programs already started (past + currently airing) within the catchup
     * window for [tvgId], newest first. The currently-airing program is
     * included so the user can restart it from the beginning.
     */
    fun playablePrograms(
        programs: List<EpgProgram>?,
        tvgId: String?,
        windowStartMs: Long,
        nowMs: Long = System.currentTimeMillis(),
    ): List<EpgProgram> {
        if (programs.isNullOrEmpty() || tvgId == null) return emptyList()
        return programs
            .filter { p ->
                val s = EpgParser.parseInstantToMs(p.start)
                s >= windowStartMs && s <= nowMs
            }
            .sortedByDescending { EpgParser.parseInstantToMs(it.start) }
    }
}
