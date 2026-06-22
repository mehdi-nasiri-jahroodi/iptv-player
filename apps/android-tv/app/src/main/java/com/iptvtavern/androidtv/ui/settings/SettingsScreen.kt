package com.iptvtavern.androidtv.ui.settings

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.BuildConfig
import com.iptvtavern.androidtv.domain.model.AppTheme
import com.iptvtavern.androidtv.domain.model.PlayerBufferMode
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToAddSource: () -> Unit,
    onNavigateToEditSource: (String) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    BackHandler(onBack = onNavigateBack)

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        // Header
        item {
            Text(
                text = "Settings",
                color = colors.foreground,
                fontSize = 28.sp,
            )
        }

        // About + Profile side-by-side
        item {
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Max),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // About
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    SettingsSection(title = "About", fillHeight = true) {
                        SettingsRow(label = "Version", value = BuildConfig.VERSION_NAME)
                    }
                }
                // Profile
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    SettingsSection(title = "Profile", fillHeight = true) {
                        if (uiState.isEditingName) {
                            ProfileNameEditor(
                                currentName = uiState.profileName,
                                onSave = { viewModel.saveProfileName(it) },
                                onCancel = { viewModel.cancelEditingName() },
                            )
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                SettingsRow(label = "Name", value = uiState.profileName)
                                Spacer(modifier = Modifier.width(16.dp))
                                FocusableButton(
                                    text = "Edit",
                                    onClick = { viewModel.startEditingName() },
                                    variant = ButtonVariant.Secondary,
                                    size = ButtonSize.Small,
                                )
                            }
                        }
                    }
                }
            }
        }

        // Appearance + Player side-by-side
        item {
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Max),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    SettingsSection(title = "Appearance", fillHeight = true) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(text = "Theme", color = colors.foregroundMuted, fontSize = 14.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                AppTheme.entries.forEach { theme ->
                                    val isSelected = uiState.theme == theme
                                    FocusableButton(
                                        text = theme.name.replaceFirstChar { it.uppercase() },
                                        onClick = { viewModel.setTheme(theme) },
                                        variant = if (isSelected) ButtonVariant.Primary else ButtonVariant.Secondary,
                                        size = ButtonSize.Small,
                                    )
                                }
                            }
                        }
                    }
                }
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    SettingsSection(title = "Player", fillHeight = true) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(text = "Buffer Mode", color = colors.foregroundMuted, fontSize = 14.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PlayerBufferMode.entries.forEach { mode ->
                                    val isSelected = uiState.playerBufferMode == mode
                                    FocusableButton(
                                        text = mode.name.replaceFirstChar { it.uppercase() },
                                        onClick = { viewModel.setPlayerBufferMode(mode) },
                                        variant = if (isSelected) ButtonVariant.Primary else ButtonVariant.Secondary,
                                        size = ButtonSize.Small,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Sources section
        item {
            SettingsSection(title = "Sources") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (uiState.sources.isEmpty()) {
                        Text(
                            text = "No sources added yet",
                            color = colors.foregroundMuted,
                            fontSize = 14.sp,
                        )
                    } else {
                        uiState.sources.forEach { source ->
                            SourceRow(
                                source = source,
                                onEdit = { onNavigateToEditSource(source.id) },
                                onDelete = { viewModel.deleteSource(source.id) },
                            )
                        }
                    }
                    FocusableButton(
                        text = "+ Add Source",
                        onClick = onNavigateToAddSource,
                    )
                }
            }
        }

        // Backup / Restore section
        item {
            BackupRestoreSection(viewModel = viewModel, uiState = uiState)
        }
    }
}

// ── Backup / Restore ───────────────────────────────────────────

@Composable
private fun BackupRestoreSection(
    viewModel: SettingsViewModel,
    uiState: SettingsUiState,
) {
    val colors = LuminaTheme.colors
    val context = LocalContext.current

    // SAF: create file for export
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val status = uiState.backupStatus
        if (status is BackupStatus.ExportReady) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { stream ->
                    stream.write(status.json.toByteArray(Charsets.UTF_8))
                }
                viewModel.clearBackupStatus()
            } catch (e: Exception) {
                // Export write failed — status will show error on next recompose
            }
        }
    }

    // SAF: pick file for import
    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val jsonText = context.contentResolver.openInputStream(uri)
                ?.bufferedReader()?.readText() ?: return@rememberLauncherForActivityResult
            viewModel.importBackup(jsonText)
        } catch (e: Exception) {
            // Read failed
        }
    }

    // When export is ready, trigger the SAF file picker
    val backupStatus = uiState.backupStatus
    if (backupStatus is BackupStatus.ExportReady) {
        val stamp = Instant.now().toString()
            .replace(":", "-").replace(".", "-").take(19)
        val filename = "iptv-tavern-backup-$stamp.json"
        androidx.compose.runtime.LaunchedEffect(backupStatus) {
            exportLauncher.launch(filename)
        }
    }

    SettingsSection(title = "Backup & Restore") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "Export or import your sources, playlists, and profile. " +
                    "Backups are compatible with the web app.",
                color = colors.foregroundMuted,
                fontSize = 13.sp,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FocusableButton(
                    text = "Export Backup",
                    onClick = { viewModel.exportBackup() },
                    size = ButtonSize.Small,
                )
                FocusableButton(
                    text = "Import Backup",
                    onClick = { importLauncher.launch(arrayOf("application/json", "*/*")) },
                    variant = ButtonVariant.Secondary,
                    size = ButtonSize.Small,
                )
            }

            // Status messages
            when (backupStatus) {
                is BackupStatus.Exporting -> Text(
                    text = "Preparing export...",
                    color = colors.foregroundMuted,
                    fontSize = 13.sp,
                )
                is BackupStatus.Importing -> Text(
                    text = "Importing backup...",
                    color = colors.foregroundMuted,
                    fontSize = 13.sp,
                )
                is BackupStatus.ImportSuccess -> {
                    Text(
                        text = "Imported ${backupStatus.sourcesCount} source(s) successfully. Restart the app to see changes.",
                        color = colors.accent,
                        fontSize = 13.sp,
                    )
                }
                is BackupStatus.Error -> {
                    Text(
                        text = backupStatus.message,
                        color = colors.danger,
                        fontSize = 13.sp,
                    )
                    FocusableButton(
                        text = "Dismiss",
                        onClick = { viewModel.clearBackupStatus() },
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                    )
                }
                else -> {} // Idle, ExportReady handled above
            }
        }
    }
}

// ── Profile name editor ────────────────────────────────────────

@Composable
private fun ProfileNameEditor(
    currentName: String,
    onSave: (String) -> Unit,
    onCancel: () -> Unit,
) {
    val colors = LuminaTheme.colors
    var text by remember { mutableStateOf(currentName) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = text,
            onValueChange = { text = it },
            singleLine = true,
            textStyle = TextStyle(
                color = colors.foreground,
                fontSize = 16.sp,
            ),
            cursorBrush = SolidColor(colors.accent),
            modifier = Modifier
                .weight(1f)
                .background(colors.background, RoundedCornerShape(8.dp))
                .border(2.dp, colors.accent, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
        )
        FocusableButton(
            text = "Save",
            onClick = { onSave(text) },
            size = ButtonSize.Small,
        )
        FocusableButton(
            text = "Cancel",
            onClick = onCancel,
            variant = ButtonVariant.Secondary,
            size = ButtonSize.Small,
        )
    }
}

// ── Reusable settings components ───────────────────────────────

@Composable
private fun SettingsSection(
    title: String,
    fillHeight: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = LuminaTheme.colors
    var hasFocus by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            color = if (hasFocus) colors.accent else colors.foregroundMuted,
            fontSize = 18.sp,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (fillHeight) Modifier.fillMaxHeight() else Modifier)
                .onFocusChanged { hasFocus = it.hasFocus }
                .background(colors.surface, RoundedCornerShape(8.dp))
                .border(
                    width = if (hasFocus) 2.dp else 0.dp,
                    color = if (hasFocus) colors.accent else colors.surface,
                    shape = RoundedCornerShape(8.dp),
                )
                .padding(16.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsRow(label: String, value: String) {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, color = colors.foregroundMuted, fontSize = 16.sp)
        Text(text = value, color = colors.foreground, fontSize = 16.sp)
    }
}

@Composable
private fun SourceRow(
    source: Source,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surface, RoundedCornerShape(8.dp))
            .border(
                width = 2.dp,
                color = colors.border,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Source info
        Column(modifier = Modifier.weight(1f)) {
            Text(text = source.label, color = colors.foreground, fontSize = 16.sp)
            Text(
                text = source.type.name.lowercase().replace("_", " "),
                color = colors.foregroundMuted,
                fontSize = 12.sp,
            )
            // Xtream account info
            if (source.type == SourceType.XTREAM && source.xtreamAccount != null) {
                val acct = source.xtreamAccount
                Spacer(modifier = Modifier.height(6.dp))
                acct.status?.let {
                    Text(text = "Status: $it", color = colors.foregroundMuted, fontSize = 13.sp)
                }
                acct.expDate?.let { raw ->
                    val formatted = formatXtreamDate(raw)
                    Text(text = "Expires: $formatted", color = colors.foregroundMuted, fontSize = 13.sp)
                }
                acct.maxConnections?.let { max ->
                    val active = acct.activeConnections ?: "0"
                    Text(
                        text = "Connections: $active / $max",
                        color = colors.foregroundMuted,
                        fontSize = 13.sp,
                    )
                }
            }
        }

        // Action buttons
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FocusableButton(
                text = "Edit",
                onClick = onEdit,
                variant = ButtonVariant.Secondary,
                size = ButtonSize.Small,
            )
            FocusableButton(
                text = "Delete",
                onClick = onDelete,
                variant = ButtonVariant.Secondary,
                size = ButtonSize.Small,
            )
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Format an Xtream expDate string to a readable date.
 * Xtream panels return either a Unix timestamp (seconds) or an ISO date string.
 */
private fun formatXtreamDate(raw: String): String {
    // Try as Unix timestamp (seconds)
    raw.toLongOrNull()?.let { epoch ->
        return try {
            val instant = Instant.ofEpochSecond(epoch)
            val formatter = DateTimeFormatter.ofPattern("MMM d, yyyy")
                .withZone(ZoneId.systemDefault())
            formatter.format(instant)
        } catch (_: Exception) {
            raw
        }
    }
    // Already a readable string — return as-is
    return raw
}

enum class ButtonVariant { Primary, Secondary }
enum class ButtonSize { Normal, Small }

@Composable
fun FocusableButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    size: ButtonSize = ButtonSize.Normal,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    // Focused state must look distinct from unfocused Primary.
    // Unfocused Primary: accent bg, accent border (blends in)
    // Focused (any variant): accentForeground bg, accent border, dark text — inverted look
    // Unfocused Secondary: surface bg, border border, foreground text
    val bgColor = when {
        isFocused -> colors.accentForeground          // bright/white — stands out
        variant == ButtonVariant.Primary -> colors.accent
        else -> colors.surface
    }
    val borderColor = when {
        isFocused -> colors.accent                    // accent ring around bright bg
        variant == ButtonVariant.Primary -> colors.accent
        else -> colors.border
    }
    val textColor = when {
        isFocused -> colors.accent                    // accent text on bright bg
        variant == ButtonVariant.Primary -> colors.accentForeground
        else -> colors.foreground
    }

    val hPad = if (size == ButtonSize.Small) 16.dp else 24.dp
    val vPad = if (size == ButtonSize.Small) 8.dp else 14.dp
    val fontSize = if (size == ButtonSize.Small) 13.sp else 16.sp

    Box(
        modifier = modifier
            .background(
                color = bgColor,
                shape = RoundedCornerShape(8.dp),
            )
            .border(
                width = if (isFocused) 3.dp else 2.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = hPad, vertical = vPad)
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = textColor,
            fontSize = fontSize,
        )
    }
}
