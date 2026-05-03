package com.iptvtavern.androidtv.data.repository

import com.iptvtavern.androidtv.domain.model.EpgGuide
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.parser.EpgParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory EPG guide store.
 *
 * Equivalent of `apps/web/app/store/guide-store.ts`.
 *
 * Fetches the XMLTV URL from the active source, parses it via [EpgParser],
 * and exposes the result as a [StateFlow]. Android has no CORS issues, so
 * this is simpler than the web version.
 */
@Singleton
class EpgRepository @Inject constructor() {

    enum class Status { IDLE, LOADING, READY, ERROR }

    data class EpgState(
        val sourceId: String? = null,
        val guide: EpgGuide? = null,
        val status: Status = Status.IDLE,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(EpgState())
    val state: StateFlow<EpgState> = _state.asStateFlow()

    /** Current guide (convenience accessor). */
    val guide: EpgGuide? get() = _state.value.guide

    /**
     * Fetch and parse EPG for the given source.
     * If the source has no [Source.epgUrl], clears any existing guide.
     * Skips if already loaded for the same source + URL.
     */
    suspend fun loadForSource(source: Source) {
        val epgUrl = source.epgUrl?.trim()?.takeIf { it.isNotEmpty() }

        if (epgUrl == null) {
            _state.value = EpgState(sourceId = source.id)
            return
        }

        // Already loaded for this source?
        val prev = _state.value
        if (prev.sourceId == source.id && prev.status == Status.READY && prev.guide != null) {
            return
        }

        _state.value = EpgState(sourceId = source.id, status = Status.LOADING)

        try {
            val xml = fetchXmltvText(epgUrl)
            // Check if source changed while we were fetching
            if (_state.value.sourceId != source.id) return

            val guide = withContext(Dispatchers.Default) {
                EpgParser.parseXmltvToGuide(xml)
            }
            if (_state.value.sourceId != source.id) return

            _state.value = EpgState(
                sourceId = source.id,
                guide = guide,
                status = Status.READY,
            )
        } catch (e: Exception) {
            if (_state.value.sourceId != source.id) return
            _state.value = EpgState(
                sourceId = source.id,
                status = Status.ERROR,
                error = e.message ?: "Failed to load EPG",
            )
        }
    }

    /** Force reload (ignores "already loaded" check). */
    suspend fun reload(source: Source) {
        _state.value = EpgState(sourceId = source.id, status = Status.IDLE)
        loadForSource(source)
    }

    fun clear() {
        _state.value = EpgState()
    }

    private suspend fun fetchXmltvText(url: String): String = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 60_000 // EPG files can be large
        connection.instanceFollowRedirects = true
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IOException("EPG HTTP $status")
            }
            // Handle gzip — many XMLTV servers serve compressed
            val stream = if (connection.contentEncoding?.equals("gzip", ignoreCase = true) == true) {
                java.util.zip.GZIPInputStream(connection.inputStream)
            } else {
                connection.inputStream
            }
            stream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
