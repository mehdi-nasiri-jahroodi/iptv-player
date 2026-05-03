package com.iptvtavern.androidtv.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.model.UserProfile
import com.iptvtavern.androidtv.domain.parser.SourceValidationResult
import com.iptvtavern.androidtv.domain.parser.validateSource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * Onboarding wizard steps — state machine for the first-run flow.
 */
enum class OnboardingStep {
    /** Legal responsibility acknowledgement. */
    RESPONSIBILITY,
    /** Add first source (URL input). */
    ADD_SOURCE,
    /** Set profile name. */
    PROFILE_NAME,
    /** Success — ready to use. */
    DONE,
}

data class OnboardingUiState(
    val step: OnboardingStep = OnboardingStep.RESPONSIBILITY,
    val sourceUrl: String = "",
    val sourceLabel: String = "",
    val profileName: String = "",
    val isValidating: Boolean = false,
    val validationError: String? = null,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    fun acknowledgeResponsibility() {
        _uiState.value = _uiState.value.copy(step = OnboardingStep.ADD_SOURCE)
    }

    fun updateSourceUrl(url: String) {
        _uiState.value = _uiState.value.copy(
            sourceUrl = url,
            validationError = null,
        )
    }

    fun updateSourceLabel(label: String) {
        _uiState.value = _uiState.value.copy(sourceLabel = label)
    }

    fun updateProfileName(name: String) {
        _uiState.value = _uiState.value.copy(profileName = name)
    }

    fun validateAndAddSource() {
        val state = _uiState.value
        val url = state.sourceUrl.trim()
        val label = state.sourceLabel.trim().ifEmpty { "My Source" }

        if (url.isEmpty()) {
            _uiState.value = state.copy(validationError = "Please enter a URL")
            return
        }

        _uiState.value = state.copy(isValidating = true, validationError = null)

        viewModelScope.launch {
            val source = Source(
                id = UUID.randomUUID().toString(),
                label = label,
                type = SourceType.M3U_URL,
                url = url,
            )

            when (val result = validateSource(source)) {
                is SourceValidationResult.Success -> {
                    sourceRepository.add(result.source)
                    _uiState.value = _uiState.value.copy(
                        isValidating = false,
                        step = OnboardingStep.PROFILE_NAME,
                    )
                }
                is SourceValidationResult.Failure -> {
                    _uiState.value = _uiState.value.copy(
                        isValidating = false,
                        validationError = result.message,
                    )
                }
            }
        }
    }

    fun skipSource() {
        _uiState.value = _uiState.value.copy(step = OnboardingStep.PROFILE_NAME)
    }

    fun saveProfileAndFinish() {
        val name = _uiState.value.profileName.trim().ifEmpty { "User" }

        viewModelScope.launch {
            profileRepository.createOrUpdate(
                UserProfile(
                    id = ProfileRepository.DEFAULT_PROFILE_ID,
                    name = name,
                )
            )
            _uiState.value = _uiState.value.copy(step = OnboardingStep.DONE)
        }
    }
}
