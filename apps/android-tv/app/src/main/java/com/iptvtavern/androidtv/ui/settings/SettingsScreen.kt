package com.iptvtavern.androidtv.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Settings screen.
 *
 * Shows three sections:
 * 1. About — app version
 * 2. Profile — user name
 * 3. Sources — list of added sources with add/edit/delete
 *
 * Full settings (theme, player prefs, backup) come in Phase 12.
 */
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

        // About section
        item {
            SettingsSection(title = "About") {
                SettingsRow(label = "Version", value = "0.1.0")
            }
        }

        // Profile section
        item {
            SettingsSection(title = "Profile") {
                SettingsRow(label = "Name", value = uiState.profileName)
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
                    }
                }
            }
        }

        // Source list
        items(uiState.sources, key = { it.id }) { source ->
            SourceRow(
                source = source,
                onEdit = { onNavigateToEditSource(source.id) },
                onDelete = { viewModel.deleteSource(source.id) },
            )
        }

        // Add source button
        item {
            FocusableButton(
                text = "+ Add Source",
                onClick = onNavigateToAddSource,
            )
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    val colors = LuminaTheme.colors

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            color = colors.accent,
            fontSize = 18.sp,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.surface, RoundedCornerShape(8.dp))
                .padding(16.dp),
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

/**
 * A source row with Edit and Delete actions.
 *
 * The row itself is focusable and shows source info. Edit and Delete
 * buttons appear inline — both are D-pad navigable.
 */
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
        }

        // Action buttons
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FocusableButton(
                text = "Edit",
                onClick = onEdit,
            )
            FocusableButton(
                text = "Delete",
                onClick = onDelete,
            )
        }
    }
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

    val bgColor = when {
        isFocused -> colors.accent
        variant == ButtonVariant.Primary -> colors.accent
        else -> colors.surface
    }
    val borderColor = when {
        isFocused -> colors.accentForeground
        variant == ButtonVariant.Primary -> colors.accent
        else -> colors.border
    }
    val textColor = when {
        isFocused -> colors.accentForeground
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
                width = 2.dp,
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
