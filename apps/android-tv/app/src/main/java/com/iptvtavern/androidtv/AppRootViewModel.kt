package com.iptvtavern.androidtv

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.repository.SourceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Root-level ViewModel that determines if onboarding is needed.
 *
 * Checks if any sources exist in the database. If yes, setup is complete
 * and we go straight to Home. If no, we start onboarding.
 *
 * The `null` initial state means "still loading" — the UI shows a blank
 * screen while we query the database (typically < 100ms).
 */
@HiltViewModel
class AppRootViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
) : ViewModel() {

    private val _hasCompletedSetup = MutableStateFlow<Boolean?>(null)
    val hasCompletedSetup: StateFlow<Boolean?> = _hasCompletedSetup.asStateFlow()

    init {
        viewModelScope.launch {
            val sources = sourceRepository.sources.first()
            _hasCompletedSetup.value = sources.isNotEmpty()
        }
    }
}
