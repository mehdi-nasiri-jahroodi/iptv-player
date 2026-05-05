package com.iptvtavern.androidtv.data.repository

/**
 * Stream of events emitted while a playlist is being loaded.
 *
 * Why a sealed class (and not a single suspend function returning `Playlist`)?
 *   - The fetch can take 10–60 seconds on a large Xtream account on
 *     low-end TV hardware (Chromecast). The user needs to *see* what's
 *     happening, not stare at a frozen "Loading…" string.
 *   - Different stages of the load have very different durations
 *     (network vs. JSON parse vs. disk write), so we can't just spin
 *     a generic indicator — we want a real bar.
 *
 * Mapping to web concepts:
 *   - This is essentially an RxJS Observable / async iterator of
 *     progress + final result. Kotlin Flows are the idiomatic
 *     equivalent on Android.
 *
 * Progress is reported as a weighted percentage: each step has a
 * relative weight (see [PlaylistLoadSteps]) reflecting roughly how
 * much wall-clock time it consumes. The bar therefore moves more
 * during the long network fetches and barely twitches during the
 * cheap "build groups" step.
 */
sealed class PlaylistLoadEvent {
    /**
     * Reported at the start of each well-known step so the UI can
     * update a labelled progress bar.
     *
     * @param step          Zero-based index of the current step.
     * @param totalSteps    Total number of steps in the load.
     * @param percent       0..100 weighted progress.
     * @param label         Human-readable description of what's
     *                      happening *now* (e.g. "Fetching movies…").
     */
    data class Progress(
        val step: Int,
        val totalSteps: Int,
        val percent: Int,
        val label: String,
    ) : PlaylistLoadEvent()

    /** Cache hit — no network, no parse work. The UI should not show a bar. */
    data object CacheHit : PlaylistLoadEvent()

    /** Final terminal event on success. */
    data object Success : PlaylistLoadEvent()

    /** Final terminal event on failure (network down, parse failure, etc.). */
    data class Error(val message: String) : PlaylistLoadEvent()
}

/**
 * Definition of the 9 load steps and their relative weights.
 *
 * Weights come from rough timings on a Chromecast (128 MB heap) loading
 * an 85k-channel Xtream account. They sum to 100, which lets us treat
 * accumulated weight as a 0..100 percentage directly.
 *
 * If a step ever stalls noticeably out of proportion to its weight,
 * adjust the numbers here — the rest of the system reads them.
 */
object PlaylistLoadSteps {
    data class Step(val label: String, val weight: Int)

    val ALL: List<Step> = listOf(
        Step("Fetching live channel categories…", 1),
        Step("Fetching live channels…", 10),
        Step("Fetching movie categories…", 1),
        Step("Fetching movies…", 40),
        Step("Fetching series categories…", 1),
        Step("Fetching series…", 10),
        Step("Parsing channels…", 25),
        Step("Organizing groups…", 7),
        Step("Saving to cache…", 5),
    )

    val TOTAL_WEIGHT: Int = ALL.sumOf { it.weight }

    /** Cumulative percentage *after completing* step at `index`. */
    fun percentAfter(index: Int): Int {
        if (index < 0) return 0
        val sumDone = ALL.take(index + 1).sumOf { it.weight }
        return ((sumDone.toLong() * 100) / TOTAL_WEIGHT).toInt().coerceIn(0, 100)
    }
}
