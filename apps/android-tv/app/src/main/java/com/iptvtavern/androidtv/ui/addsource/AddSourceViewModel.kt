package com.iptvtavern.androidtv.ui.addsource

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.model.XtreamAccountSnapshot
import com.iptvtavern.androidtv.domain.model.XtreamCredentials
import com.iptvtavern.androidtv.domain.parser.SourceValidationResult
import com.iptvtavern.androidtv.domain.parser.validateSource
import com.iptvtavern.androidtv.domain.xtream.XtreamClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * UI state for the Add/Edit Source form.
 *
 * Supports both M3U URL and Xtream Codes source types.
 */
data class AddSourceUiState(
    val editingSourceId: String? = null,
    val sourceType: SourceType = SourceType.M3U_URL,
    val label: String = "",
    // M3U fields
    val url: String = "",
    val epgUrl: String = "",
    val userAgent: String = "",
    // Xtream fields
    val xtreamHost: String = "",
    val xtreamUsername: String = "",
    val xtreamPassword: String = "",
    // Status
    val isValidating: Boolean = false,
    val validationError: String? = null,
    val savedSuccessfully: Boolean = false,
    val isLoaded: Boolean = false,
    /** Xtream account info shown after successful auth probe. */
    val xtreamAccountInfo: String? = null,
)

@HiltViewModel
class AddSourceViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AddSourceUiState())
    val uiState: StateFlow<AddSourceUiState> = _uiState.asStateFlow()

    init {
        val sourceId = savedStateHandle.get<String>("sourceId")
        if (sourceId != null) {
            loadExistingSource(sourceId)
        } else {
            _uiState.value = _uiState.value.copy(isLoaded = true)
        }
    }

    private fun loadExistingSource(sourceId: String) {
        viewModelScope.launch {
            val source = sourceRepository.getById(sourceId)
            if (source != null) {
                _uiState.value = _uiState.value.copy(
                    editingSourceId = source.id,
                    sourceType = source.type,
                    label = source.label,
                    url = source.url.orEmpty(),
                    epgUrl = source.epgUrl.orEmpty(),
                    userAgent = source.userAgent.orEmpty(),
                    xtreamHost = source.credentials?.host.orEmpty(),
                    xtreamUsername = source.credentials?.username.orEmpty(),
                    xtreamPassword = source.credentials?.password.orEmpty(),
                    isLoaded = true,
                )
            } else {
                _uiState.value = _uiState.value.copy(isLoaded = true)
            }
        }
    }

    fun setSourceType(type: SourceType) {
        _uiState.value = _uiState.value.copy(
            sourceType = type,
            validationError = null,
            xtreamAccountInfo = null,
        )
    }

    fun updateLabel(value: String) {
        _uiState.value = _uiState.value.copy(label = value, validationError = null)
    }

    fun updateUrl(value: String) {
        _uiState.value = _uiState.value.copy(url = value, validationError = null)
    }

    fun updateEpgUrl(value: String) {
        _uiState.value = _uiState.value.copy(epgUrl = value)
    }

    fun updateUserAgent(value: String) {
        _uiState.value = _uiState.value.copy(userAgent = value)
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

    fun validateAndSave() {
        when (_uiState.value.sourceType) {
            SourceType.M3U_URL -> validateAndSaveM3u()
            SourceType.XTREAM -> validateAndSaveXtream()
            SourceType.M3U_FILE -> {} // Not implemented yet
        }
    }

    private fun validateAndSaveM3u() {
        val state = _uiState.value
        val url = state.url.trim()
        val label = state.label.trim().ifEmpty { "My Source" }

        if (url.isEmpty()) {
            _uiState.value = state.copy(validationError = "Please enter a URL")
            return
        }

        _uiState.value = state.copy(isValidating = true, validationError = null)

        viewModelScope.launch {
            val sourceId = state.editingSourceId ?: UUID.randomUUID().toString()
            val source = Source(
                id = sourceId,
                label = label,
                type = SourceType.M3U_URL,
                url = url,
                epgUrl = state.epgUrl.trim().ifEmpty { null },
                userAgent = state.userAgent.trim().ifEmpty { null },
            )

            when (val result = validateSource(source)) {
                is SourceValidationResult.Success -> {
                    if (state.editingSourceId != null) {
                        sourceRepository.update(result.source)
                    } else {
                        sourceRepository.add(result.source)
                    }
                    _uiState.value = _uiState.value.copy(
                        isValidating = false,
                        savedSuccessfully = true,
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

    private fun validateAndSaveXtream() {
        val state = _uiState.value
        val host = state.xtreamHost.trim()
        val username = state.xtreamUsername.trim()
        val password = state.xtreamPassword.trim()
        val label = state.label.trim().ifEmpty { "$username@${host.substringAfter("://")}" }

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

        _uiState.value = state.copy(isValidating = true, validationError = null, xtreamAccountInfo = null)

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

                // Build account snapshot
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

                val accountInfo = buildString {
                    append("Status: ${snapshot.status ?: "active"}")
                    snapshot.expDate?.let { append(" | Expires: $it") }
                    snapshot.maxConnections?.let { append(" | Max: $it connections") }
                }

                val sourceId = state.editingSourceId ?: UUID.randomUUID().toString()
                val source = Source(
                    id = sourceId,
                    label = label,
                    type = SourceType.XTREAM,
                    credentials = credentials,
                    xtreamAccount = snapshot,
                    epgUrl = state.epgUrl.trim().ifEmpty { null },
                )

                if (state.editingSourceId != null) {
                    sourceRepository.update(source)
                } else {
                    sourceRepository.add(source)
                }

                _uiState.value = _uiState.value.copy(
                    isValidating = false,
                    savedSuccessfully = true,
                    xtreamAccountInfo = accountInfo,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isValidating = false,
                    validationError = "Could not connect to server: ${e.message ?: "unknown error"}",
                )
            }
        }
    }
}
