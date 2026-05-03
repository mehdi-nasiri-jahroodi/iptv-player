package com.iptvtavern.androidtv.ui.addsource

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.domain.parser.SourceValidationResult
import com.iptvtavern.androidtv.domain.parser.validateSource
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
 * Think of this like a React form's state object — all inputs and
 * feedback live here, and the ViewModel is the "reducer" that updates it.
 */
data class AddSourceUiState(
    /** Non-null when editing an existing source. */
    val editingSourceId: String? = null,
    val label: String = "",
    val url: String = "",
    val epgUrl: String = "",
    val userAgent: String = "",
    val isValidating: Boolean = false,
    val validationError: String? = null,
    /** Set to true after a successful save — signals the screen to navigate back. */
    val savedSuccessfully: Boolean = false,
    /** True when the form has loaded an existing source for editing. */
    val isLoaded: Boolean = false,
)

@HiltViewModel
class AddSourceViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AddSourceUiState())
    val uiState: StateFlow<AddSourceUiState> = _uiState.asStateFlow()

    init {
        // Check if a sourceId was passed via navigation (edit mode).
        // SavedStateHandle automatically gets nav arguments — like
        // reading `useParams()` in React Router.
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
                    label = source.label,
                    url = source.url.orEmpty(),
                    epgUrl = source.epgUrl.orEmpty(),
                    userAgent = source.userAgent.orEmpty(),
                    isLoaded = true,
                )
            } else {
                // Source not found — treat as new
                _uiState.value = _uiState.value.copy(isLoaded = true)
            }
        }
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

    /**
     * Validate the source URL and save on success.
     *
     * Flow: validate URL → parse M3U → persist Source + cache Playlist → signal done.
     */
    fun validateAndSave() {
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
}
