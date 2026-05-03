package com.iptvtavern.androidtv.ui.addsource

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.onboarding.TvTextField
import com.iptvtavern.androidtv.ui.settings.FocusableButton
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Full Add / Edit Source form — Phase 5.
 *
 * Supports M3U URL sources with optional EPG URL and User-Agent.
 * File import (Storage Access Framework) is listed in the plan but
 * deferred — URL input covers the primary use case.
 *
 * Web equivalent: `packages/ui/src/lib/SourceForm.tsx`
 */
@Composable
fun AddSourceScreen(
    onNavigateBack: () -> Unit,
    viewModel: AddSourceViewModel = hiltViewModel(),
) {
    val colors = LuminaTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    BackHandler(onBack = onNavigateBack)

    // Navigate back after successful save
    LaunchedEffect(uiState.savedSuccessfully) {
        if (uiState.savedSuccessfully) {
            onNavigateBack()
        }
    }

    // Wait for form to load (matters in edit mode)
    if (!uiState.isLoaded) return

    val isEditing = uiState.editingSourceId != null

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .background(colors.surface, RoundedCornerShape(16.dp))
                .padding(48.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.Start,
        ) {
            // Title
            Text(
                text = if (isEditing) "Edit Source" else "Add Source",
                color = colors.foreground,
                fontSize = 24.sp,
                modifier = Modifier.padding(bottom = 32.dp),
            )

            // Label
            FieldLabel("Label")
            TvTextField(
                value = uiState.label,
                onValueChange = viewModel::updateLabel,
                placeholder = "My Source",
                modifier = Modifier.padding(bottom = 16.dp),
            )

            // URL
            FieldLabel("M3U Playlist URL")
            TvTextField(
                value = uiState.url,
                onValueChange = viewModel::updateUrl,
                placeholder = "https://example.com/playlist.m3u",
                modifier = Modifier.padding(bottom = 16.dp),
            )

            // EPG URL (optional)
            FieldLabel("EPG URL (optional)")
            TvTextField(
                value = uiState.epgUrl,
                onValueChange = viewModel::updateEpgUrl,
                placeholder = "https://example.com/epg.xml",
                modifier = Modifier.padding(bottom = 16.dp),
            )

            // User-Agent (optional)
            FieldLabel("User-Agent (optional)")
            TvTextField(
                value = uiState.userAgent,
                onValueChange = viewModel::updateUserAgent,
                placeholder = "Custom user agent string",
                imeAction = ImeAction.Done,
                onImeAction = viewModel::validateAndSave,
                modifier = Modifier.padding(bottom = 8.dp),
            )

            // Validation error
            if (uiState.validationError != null) {
                Text(
                    text = uiState.validationError!!,
                    color = colors.danger,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            // Loading indicator
            if (uiState.isValidating) {
                Text(
                    text = "Validating source…",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Actions
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                FocusableButton(
                    text = if (isEditing) "Save" else "Add Source",
                    onClick = viewModel::validateAndSave,
                )
                FocusableButton(
                    text = "Cancel",
                    onClick = onNavigateBack,
                )
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    val colors = LuminaTheme.colors
    Text(
        text = text,
        color = colors.foregroundMuted,
        fontSize = 14.sp,
        modifier = Modifier.padding(bottom = 4.dp),
    )
}
