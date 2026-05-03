package com.iptvtavern.androidtv.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.model.UserProfile
import com.iptvtavern.androidtv.domain.model.XtreamAccountSnapshot
import com.iptvtavern.androidtv.domain.model.XtreamCredentials
import com.iptvtavern.androidtv.domain.parser.SourceValidationResult
import com.iptvtavern.androidtv.domain.parser.validateSource
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
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
    /** Add first source (URL or Xtream credentials). */
    ADD_SOURCE,
    /** Set profile name. */
    PROFILE_NAME,
    /** Success — ready to use. */
    DONE,
}

data class OnboardingUiState(
    val step: OnboardingStep = OnboardingStep.RESPONSIBILITY,
    val sourceType: SourceType = SourceType.M3U_URL,
    // M3U fields
    val sourceUrl: String = "",
    val sourceLabel: String = "",
    // Xtream fields
    val xtreamHost: String = "",
    val xtreamUsername: String = "",
    val xtreamPassword: String = "",
    // Profile
    val profileName: String = "",
    // Status
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

    fun setSourceType(type: SourceType) {
        _uiState.value = _uiState.value.copy(
            sourceType = type,
            validationError = null,
        )
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

    fun updateXtreamHost(value: String) {
        _uiState.value = _uiState.value.copy(xtreamHost = value, validationError = null)
    }

    fun updateXtreamUsername(value: String) {
        _uiState.value = _uiState.value.copy(xtreamUsername = value, validationError = null)
    }

    fun updateXtreamPassword(value: String) {
        _uiState.value = _uiState.value.copy(xtreamPassword = value, validationError = null)
    }

    fun updateProfileName(name: String) {
        _uiState.value = _uiState.value.copy(profileName = name)
    }

    fun validateAndAddSource() {
        when (_uiState.value.sourceType) {
            SourceType.M3U_URL -> validateAndAddM3u()
            SourceType.XTREAM -> validateAndAddXtream()
            SourceType.M3U_FILE -> {} // Not implemented
        }
    }

    private fun validateAndAddM3u() {
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

    private fun validateAndAddXtream() {
        val state = _uiState.value
        val host = state.xtreamHost.trim()
        val username = state.xtreamUsername.trim()
        val password = state.xtreamPassword.trim()
        val label = state.sourceLabel.trim().ifEmpty { "$username@${host.substringAfter("://")}" }

        if (host.isEmpty()) {
            _uiState.value = state.copy(validationError = "Please enter a server URL")
            return
        }
        if (username.isEmpty()) {
            _uiState.value = state.copy(validationError = "Please enter a username")
            return
        }
        if (password.isEmpty()) {
            _uiState.value = state.copy(validationError = "Please enter a password")
            return
        }

        _uiState.value = state.copy(isValidating = true, validationError = null)

        viewModelScope.launch {
            val credentials = XtreamCredentials(
                host = host,
                username = username,
                password = password,
            )

            try {
                val playerApi = XtreamClient.fetchPlayerApi(credentials)

                if (!XtreamClient.isAuthSuccessful(playerApi)) {
                    _uiState.value = _uiState.value.copy(
                        isValidating = false,
                        validationError = "Authentication failed. Check your credentials.",
                    )
                    return@launch
                }

                val userInfo = playerApi.userInfo
                val snapshot = XtreamAccountSnapshot(
                    expDate = userInfo?.expDate,
                    createdAt = userInfo?.createdAt,
                    status = userInfo?.status,
                    isTrial = userInfo?.isTrial,
                    username = userInfo?.username,
                    activeConnections = userInfo?.activeCons,
                    maxConnections = userInfo?.maxConnections,
                )

                val source = Source(
                    id = UUID.randomUUID().toString(),
                    label = label,
                    type = SourceType.XTREAM,
                    credentials = credentials,
                    xtreamAccount = snapshot,
                )

                sourceRepository.add(source)
                _uiState.value = _uiState.value.copy(
                    isValidating = false,
                    step = OnboardingStep.PROFILE_NAME,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isValidating = false,
                    validationError = "Could not connect to server: ${e.message ?: "unknown error"}",
                )
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
