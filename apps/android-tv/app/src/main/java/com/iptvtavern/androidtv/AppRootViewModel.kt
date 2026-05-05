package com.iptvtavern.androidtv

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.repository.PlaylistLoadEvent
import com.iptvtavern.androidtv.data.repository.PlaylistManager
import com.iptvtavern.androidtv.data.repository.SourceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the global "loading your catalog" overlay.
 *
 * Lives at the app root because the overlay covers everything regardless
 * of which screen the user is currently on.
 */
data class CatalogLoadOverlayState(
    val visible: Boolean = false,
    val percent: Int = 0,
    val label: String = "",
)

/**
 * Root-level ViewModel that determines if onboarding is needed and
 * also funnels [PlaylistManager.loadEvents] into UI state for the
 * blocking overlay.
 */
@HiltViewModel
class AppRootViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val playlistManager: PlaylistManager,
) : ViewModel() {

    private val _hasCompletedSetup = MutableStateFlow<Boolean?>(null)
    val hasCompletedSetup: StateFlow<Boolean?> = _hasCompletedSetup.asStateFlow()

    private val _overlayState = MutableStateFlow(CatalogLoadOverlayState())
    val overlayState: StateFlow<CatalogLoadOverlayState> = _overlayState.asStateFlow()

    init {
        viewModelScope.launch {
            val sources = sourceRepository.sources.first()
            _hasCompletedSetup.value = sources.isNotEmpty()
        }

        // Subscribe once at the app root and translate progress events
        // into overlay state. Cache hits / success / error all dismiss
        // the overlay; only Progress events show it.
        viewModelScope.launch {
            playlistManager.loadEvents.collect { event ->
                _overlayState.value = when (event) {
                    is PlaylistLoadEvent.Progress -> CatalogLoadOverlayState(
                        visible = true,
                        percent = event.percent,
                        label = event.label,
                    )
                    PlaylistLoadEvent.CacheHit,
                    PlaylistLoadEvent.Success,
                    is PlaylistLoadEvent.Error -> _overlayState.value.copy(visible = false)
                }
            }
        }
    }
}
