package com.iptvtavern.androidtv.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Source
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for the Settings screen.
 *
 * In web terms, this is like a Zustand store slice that manages the
 * settings UI state. The ViewModel survives configuration changes
 * (screen rotation, etc.) — similar to how Zustand persists state
 * across re-renders.
 *
 * `viewModelScope` is a coroutine scope tied to the ViewModel lifecycle.
 * It automatically cancels when the ViewModel is destroyed (like cleaning
 * up a useEffect subscription).
 */
data class SettingsUiState(
    val sources: List<Source> = emptyList(),
    val profileName: String = "User",
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        // Collect sources reactively — like subscribing to a Zustand store
        viewModelScope.launch {
            sourceRepository.sources.collect { sources ->
                _uiState.value = _uiState.value.copy(sources = sources)
            }
        }
        // Load profile name
        viewModelScope.launch {
            val profile = profileRepository.getDefaultProfile()
            _uiState.value = _uiState.value.copy(profileName = profile.name)
        }
    }

    fun deleteSource(id: String) {
        viewModelScope.launch {
            sourceRepository.delete(id)
        }
    }
}
