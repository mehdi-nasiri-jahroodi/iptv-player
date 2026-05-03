package com.iptvtavern.androidtv.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iptvtavern.androidtv.data.backup.BackupService
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.repository.ProfileRepository
import com.iptvtavern.androidtv.data.repository.SourceRepository
import com.iptvtavern.androidtv.domain.model.AppTheme
import com.iptvtavern.androidtv.domain.model.PlayerBufferMode
import com.iptvtavern.androidtv.domain.model.Source
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val sources: List<Source> = emptyList(),
    val profileName: String = "User",
    val theme: AppTheme = AppTheme.system,
    val playerBufferMode: PlayerBufferMode = PlayerBufferMode.balanced,
    val autoPlay: Boolean = false,
    val isEditingName: Boolean = false,
    val backupStatus: BackupStatus = BackupStatus.Idle,
)

sealed class BackupStatus {
    data object Idle : BackupStatus()
    data object Exporting : BackupStatus()
    data class ExportReady(val json: String) : BackupStatus()
    data object Importing : BackupStatus()
    data class ImportSuccess(val sourcesCount: Int) : BackupStatus()
    data class Error(val message: String) : BackupStatus()
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val sourceRepository: SourceRepository,
    private val profileRepository: ProfileRepository,
    private val settingsDataStore: SettingsDataStore,
    private val backupService: BackupService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            sourceRepository.sources.collect { sources ->
                _uiState.value = _uiState.value.copy(sources = sources)
            }
        }
        viewModelScope.launch {
            val profile = profileRepository.getDefaultProfile()
            _uiState.value = _uiState.value.copy(profileName = profile.name)
        }
        viewModelScope.launch {
            settingsDataStore.settings.collect { settings ->
                _uiState.value = _uiState.value.copy(
                    theme = settings.theme,
                    playerBufferMode = settings.playerBufferMode,
                    autoPlay = settings.autoPlay,
                )
            }
        }
    }

    fun deleteSource(id: String) {
        viewModelScope.launch {
            sourceRepository.delete(id)
        }
    }

    fun setTheme(theme: AppTheme) {
        viewModelScope.launch { settingsDataStore.updateTheme(theme) }
    }

    fun setPlayerBufferMode(mode: PlayerBufferMode) {
        viewModelScope.launch { settingsDataStore.updatePlayerBufferMode(mode) }
    }

    fun setAutoPlay(enabled: Boolean) {
        viewModelScope.launch { settingsDataStore.updateAutoPlay(enabled) }
    }

    fun startEditingName() {
        _uiState.value = _uiState.value.copy(isEditingName = true)
    }

    fun saveProfileName(name: String) {
        val trimmed = name.trim().ifEmpty { "User" }
        viewModelScope.launch {
            profileRepository.updateName(trimmed)
            _uiState.value = _uiState.value.copy(
                profileName = trimmed,
                isEditingName = false,
            )
        }
    }

    fun cancelEditingName() {
        _uiState.value = _uiState.value.copy(isEditingName = false)
    }

    // ── Backup / Restore ───────────────────────────────────────

    fun exportBackup() {
        _uiState.value = _uiState.value.copy(backupStatus = BackupStatus.Exporting)
        viewModelScope.launch {
            try {
                val json = backupService.exportToJson()
                _uiState.value = _uiState.value.copy(
                    backupStatus = BackupStatus.ExportReady(json),
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    backupStatus = BackupStatus.Error("Export failed: ${e.message}"),
                )
            }
        }
    }

    fun importBackup(jsonText: String) {
        _uiState.value = _uiState.value.copy(backupStatus = BackupStatus.Importing)
        viewModelScope.launch {
            val result = backupService.importFromJson(jsonText)
            _uiState.value = _uiState.value.copy(
                backupStatus = when (result) {
                    is BackupService.ImportResult.Success ->
                        BackupStatus.ImportSuccess(result.sourcesCount)
                    is BackupService.ImportResult.Error ->
                        BackupStatus.Error(result.message)
                },
            )
        }
    }

    fun clearBackupStatus() {
        _uiState.value = _uiState.value.copy(backupStatus = BackupStatus.Idle)
    }
}
