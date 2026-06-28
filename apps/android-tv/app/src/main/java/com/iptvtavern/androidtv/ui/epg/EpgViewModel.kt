package com.iptvtavern.androidtv.ui.epg

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.EpgRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Channel
import com.iptvtavern.androidtv.domain.model.EpgProgram
import com.iptvtavern.androidtv.domain.parser.EpgParser
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject

/**
 * EPG Schedule screen state.
 *
 * Web equivalent: `apps/web/app/pages/epg.tsx` + `guide-store.ts`.
 */
data class EpgUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    /** Channels that have EPG data, ordered by name. */
    val channels: List<EpgChannelRow> = emptyList(),
    /** Currently selected channel index (for D-pad focus tracking). */
    val selectedChannelIndex: Int = 0,
    /** Current time in ms — ticks every minute. */
    val nowMs: Long = System.currentTimeMillis(),
    /** EPG guide status from the repository. */
    val guideStatus: EpgRepository.Status = EpgRepository.Status.IDLE,
)

/**
 * One row in the EPG grid: a channel + its programs for today + tomorrow.
 */
data class EpgChannelRow(
    val tvgId: String,
    val channelName: String,
    val logoUrl: String?,
    /** Programs sorted by start time, filtered to today+tomorrow window. */
    val programs: List<EpgProgram>,
)

@HiltViewModel
class EpgViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val epgRepository: EpgRepository,
    private val settingsDataStore: SettingsDataStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EpgUiState())
    val uiState: StateFlow<EpgUiState> = _uiState.asStateFlow()

    init {
        loadEpg()
        startMinuteClock()
    }

    private fun loadEpg() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            // Get active source
            val activeId = settingsDataStore.activeSourceId.first()
            val sources = sourceRepository.sources.first()
            val source = sources.find { it.id == activeId } ?: sources.firstOrNull()

            if (source == null) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "No source configured.",
                )
                return@launch
            }

            // Ensure EPG is loaded
            epgRepository.loadForSource(source)

            // Observe EPG state
            val epgState = epgRepository.state.value
            if (epgState.status == EpgRepository.Status.ERROR) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = epgState.error ?: "EPG load failed",
                    guideStatus = epgState.status,
                )
                return@launch
            }

            val guide = epgState.guide
            if (guide == null || guide.programsByChannelId.isEmpty()) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = if (epgState.epgUrl.isNullOrBlank()) "No EPG URL configured for this source." else "No EPG data available.",
                    guideStatus = epgState.status,
                )
                return@launch
            }

            // Build channel name map from the cached playlist
            val playlist = sourceRepository.getCachedPlaylist(source.id)
            val channelNameMap = mutableMapOf<String, String>()
            val channelLogoMap = mutableMapOf<String, String>()
            if (playlist != null) {
                for (group in playlist.groups) {
                    for (ch in group.channels) {
                        val tvgId = (ch as? Channel.Live)?.tvgId ?: continue
                        channelNameMap[tvgId] = ch.name
                        ch.logoUrl?.let { channelLogoMap[tvgId] = it }
                    }
                }
            }

            // Build the today+tomorrow window
            val zone = ZoneId.systemDefault()
            val today = LocalDate.now(zone)
            val windowStart = today.atStartOfDay(zone).toInstant().toEpochMilli()
            val windowEnd = today.plusDays(2).atStartOfDay(zone).toInstant().toEpochMilli()

            // Build rows
            val rows = guide.programsByChannelId.entries
                .filter { (channelId, _) ->
                    // Only channels that have programs in our window
                    true
                }
                .map { (channelId, programs) ->
                    val windowPrograms = programs.filter { p ->
                        val s = parseInstant(p.start)
                        val e = parseInstant(p.end)
                        e > windowStart && s < windowEnd
                    }
                    EpgChannelRow(
                        tvgId = channelId,
                        channelName = channelNameMap[channelId] ?: channelId,
                        logoUrl = channelLogoMap[channelId],
                        programs = windowPrograms,
                    )
                }
                .filter { it.programs.isNotEmpty() }
                .sortedBy { it.channelName.lowercase() }

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                channels = rows,
                error = null,
                guideStatus = EpgRepository.Status.READY,
                nowMs = System.currentTimeMillis(),
            )
        }
    }

    private fun startMinuteClock() {
        viewModelScope.launch {
            while (true) {
                delay(60_000)
                _uiState.value = _uiState.value.copy(nowMs = System.currentTimeMillis())
            }
        }
    }

    fun selectChannel(index: Int) {
        _uiState.value = _uiState.value.copy(selectedChannelIndex = index)
    }

    private fun parseInstant(iso: String): Long {
        return try {
            Instant.parse(iso).toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }
}
