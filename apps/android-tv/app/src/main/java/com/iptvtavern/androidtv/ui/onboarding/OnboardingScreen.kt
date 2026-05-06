package com.iptvtavern.androidtv.ui.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.ui.draw.clip
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.domain.model.SourceType
import com.iptvtavern.androidtv.ui.settings.FocusableButton
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * First-run onboarding wizard.
 *
 * Steps:
 * 1. Responsibility notice — legal acknowledgement (same text as web)
 * 2. Add source — M3U URL input with validation
 * 3. Profile name — set display name
 * 4. Done — navigate to Home
 *
 * Web equivalent: `responsibility-notice.tsx` + `first-run-wizard.tsx`
 */
@Composable
fun OnboardingScreen(
    onFinished: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // When step reaches DONE, trigger navigation
    LaunchedEffect(uiState.step) {
        if (uiState.step == OnboardingStep.DONE) {
            onFinished()
        }
    }

    when (uiState.step) {
        OnboardingStep.RESPONSIBILITY -> ResponsibilityStep(
            onAccept = viewModel::acknowledgeResponsibility,
        )
        OnboardingStep.ADD_SOURCE -> AddSourceStep(
            uiState = uiState,
            onSourceTypeChange = viewModel::setSourceType,
            onUrlChange = viewModel::updateSourceUrl,
            onLabelChange = viewModel::updateSourceLabel,
            onXtreamHostChange = viewModel::updateXtreamHost,
            onXtreamUsernameChange = viewModel::updateXtreamUsername,
            onXtreamPasswordChange = viewModel::updateXtreamPassword,
            onSubmit = viewModel::validateAndAddSource,
            onSkip = viewModel::skipSource,
        )
        OnboardingStep.PROFILE_NAME -> ProfileNameStep(
            profileName = uiState.profileName,
            onNameChange = viewModel::updateProfileName,
            onFinish = viewModel::saveProfileAndFinish,
        )
        OnboardingStep.DONE -> {
            // Handled by LaunchedEffect above
        }
    }
}

// ── Step 1: Responsibility Notice ───────────────────────────────────────

@Composable
private fun ResponsibilityStep(onAccept: () -> Unit) {
    val colors = LuminaTheme.colors

    WizardFrame(
        stepLabel = "Before you stream",
        stepNumber = null,
    ) {
        Text(
            text = "You are responsible for the content you access. " +
                "This app does not host channels or playlists. " +
                "Only stream content you have the right to view.",
            color = colors.foreground,
            fontSize = 18.sp,
            lineHeight = 28.sp,
            modifier = Modifier.padding(bottom = 32.dp),
        )

        FocusableButton(
            text = "I understand",
            onClick = onAccept,
        )
    }
}

// ── Step 2: Add Source ──────────────────────────────────────────────────

@Composable
private fun AddSourceStep(
    uiState: OnboardingUiState,
    onSourceTypeChange: (SourceType) -> Unit,
    onUrlChange: (String) -> Unit,
    onLabelChange: (String) -> Unit,
    onXtreamHostChange: (String) -> Unit,
    onXtreamUsernameChange: (String) -> Unit,
    onXtreamPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSkip: () -> Unit,
) {
    val colors = LuminaTheme.colors

    WizardFrame(
        stepLabel = "Step 1 of 2",
        stepNumber = null,
    ) {
        Text(
            text = "Add your first source",
            color = colors.foreground,
            fontSize = 22.sp,
            modifier = Modifier.padding(bottom = 16.dp),
        )

        // Source type selector
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 20.dp),
        ) {
            FocusableButton(
                text = "M3U URL",
                onClick = { onSourceTypeChange(SourceType.M3U_URL) },
                modifier = if (uiState.sourceType == SourceType.M3U_URL) {
                    Modifier.background(colors.accent, RoundedCornerShape(8.dp))
                } else Modifier,
            )
            FocusableButton(
                text = "Xtream Codes",
                onClick = { onSourceTypeChange(SourceType.XTREAM) },
                modifier = if (uiState.sourceType == SourceType.XTREAM) {
                    Modifier.background(colors.accent, RoundedCornerShape(8.dp))
                } else Modifier,
            )
        }

        // Label (shared)
        Text(
            text = "Label",
            color = colors.foregroundMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        TvTextField(
            value = uiState.sourceLabel,
            onValueChange = onLabelChange,
            placeholder = if (uiState.sourceType == SourceType.XTREAM) "My IPTV" else "My Source",
            modifier = Modifier.padding(bottom = 16.dp),
        )

        when (uiState.sourceType) {
            SourceType.M3U_URL, SourceType.M3U_FILE -> {
                Text(
                    text = "M3U Playlist URL",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                TvTextField(
                    value = uiState.sourceUrl,
                    onValueChange = onUrlChange,
                    placeholder = "https://example.com/playlist.m3u",
                    imeAction = ImeAction.Done,
                    onImeAction = onSubmit,
                )
            }
            SourceType.XTREAM -> {
                Text(
                    text = "Server URL",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                TvTextField(
                    value = uiState.xtreamHost,
                    onValueChange = onXtreamHostChange,
                    placeholder = "http://example.com:8080",
                    modifier = Modifier.padding(bottom = 16.dp),
                )

                Text(
                    text = "Username",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                TvTextField(
                    value = uiState.xtreamUsername,
                    onValueChange = onXtreamUsernameChange,
                    placeholder = "username",
                    modifier = Modifier.padding(bottom = 16.dp),
                )

                Text(
                    text = "Password",
                    color = colors.foregroundMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                TvTextField(
                    value = uiState.xtreamPassword,
                    onValueChange = onXtreamPasswordChange,
                    placeholder = "password",
                    imeAction = ImeAction.Done,
                    onImeAction = onSubmit,
                )
            }
        }

        // Validation error
        if (uiState.validationError != null) {
            Text(
                text = uiState.validationError,
                color = colors.danger,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        // Loading indicator
        if (uiState.isValidating) {
            Text(
                text = if (uiState.sourceType == SourceType.XTREAM) "Authenticating…" else "Validating source…",
                color = colors.foregroundMuted,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            FocusableButton(
                text = "Add & Continue",
                onClick = onSubmit,
            )
            FocusableButton(
                text = "Skip for now",
                onClick = onSkip,
            )
        }
    }
}

// ── Step 3: Profile Name ────────────────────────────────────────────────

@Composable
private fun ProfileNameStep(
    profileName: String,
    onNameChange: (String) -> Unit,
    onFinish: () -> Unit,
) {
    val colors = LuminaTheme.colors

    WizardFrame(
        stepLabel = "Step 2 of 2",
        stepNumber = null,
    ) {
        Text(
            text = "What should we call you?",
            color = colors.foreground,
            fontSize = 22.sp,
            modifier = Modifier.padding(bottom = 24.dp),
        )

        TvTextField(
            value = profileName,
            onValueChange = onNameChange,
            placeholder = "User",
            imeAction = ImeAction.Done,
            onImeAction = onFinish,
        )

        Spacer(modifier = Modifier.height(24.dp))

        FocusableButton(
            text = "Let's go!",
            onClick = onFinish,
        )
    }
}

// ── Shared components ───────────────────────────────────────────────────

/**
 * Centered wizard frame with a step label and content area.
 */
@Composable
private fun WizardFrame(
    stepLabel: String,
    stepNumber: Int?,
    content: @Composable () -> Unit,
) {
    val colors = LuminaTheme.colors

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
            Text(
                text = stepLabel,
                color = colors.accent,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 16.dp),
            )
            content()
        }
    }
}

/**
 * Text input field styled for TV (large text, visible focus border).
 *
 * On Android TV, text input opens the on-screen keyboard when the field
 * is focused and the user presses Select/Enter. This is different from
 * web where the keyboard is always available.
 */
@Composable
fun TvTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "",
    modifier: Modifier = Modifier,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        textStyle = TextStyle(
            color = colors.foreground,
            fontSize = 18.sp,
        ),
        cursorBrush = SolidColor(colors.accent),
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = imeAction),
        keyboardActions = KeyboardActions(
            onDone = { onImeAction?.invoke() },
            onNext = { onImeAction?.invoke() },
        ),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.backgroundSubtle, RoundedCornerShape(8.dp))
                    .border(
                        width = 2.dp,
                        color = if (isFocused) colors.accent else colors.border,
                        shape = RoundedCornerShape(8.dp),
                    )
                    .padding(horizontal = 16.dp, vertical = 14.dp),
            ) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        color = colors.foregroundMuted,
                        fontSize = 18.sp,
                    )
                }
                innerTextField()
            }
        },
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
    )
}

/**
 * Search button for Android TV browse screens.
 *
 * Shows as a compact, focusable button. When pressed, opens a dialog
 * with a text field so the keyboard doesn't pop up just from D-pad
 * navigation passing through the search area.
 */
@Composable
fun TvSearchButton(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "Search…",
    modifier: Modifier = Modifier,
    imeAction: ImeAction = ImeAction.Search,
) {
    val colors = LuminaTheme.colors
    var showDialog by remember { mutableStateOf(false) }
    var isFocused by remember { mutableStateOf(false) }

    // The button itself — always present, stable in the tree
    val displayText = if (value.isNotEmpty()) "⌕ $value" else "⌕ $placeholder"

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (isFocused) colors.accent else colors.backgroundSubtle)
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) colors.accent else colors.border,
                shape = RoundedCornerShape(6.dp),
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    showDialog = true
                    true
                } else false
            }
            .focusable(),
    ) {
        Text(
            text = displayText,
            color = if (isFocused) colors.accentForeground else colors.foregroundMuted,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }

    // Dialog with actual text input
    if (showDialog) {
        SearchInputDialog(
            value = value,
            onValueChange = onValueChange,
            placeholder = placeholder,
            imeAction = imeAction,
            onDismiss = { showDialog = false },
        )
    }
}

/**
 * Overlay dialog for search input. Renders as a dark overlay with a
 * centered text field that auto-focuses and opens the keyboard.
 */
@Composable
private fun SearchInputDialog(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    imeAction: ImeAction,
    onDismiss: () -> Unit,
) {
    val colors = LuminaTheme.colors
    val focusRequester = remember { FocusRequester() }
    // Local copy so we can update on each keystroke, then commit on dismiss
    var localValue by remember { mutableStateOf(value) }

    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.surface, RoundedCornerShape(12.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = placeholder,
                color = colors.foregroundMuted,
                fontSize = 14.sp,
            )

            BasicTextField(
                value = localValue,
                onValueChange = {
                    localValue = it
                    onValueChange(it)
                },
                textStyle = TextStyle(
                    color = colors.foreground,
                    fontSize = 18.sp,
                ),
                cursorBrush = SolidColor(colors.accent),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = imeAction),
                keyboardActions = KeyboardActions(
                    onSearch = { onDismiss() },
                    onDone = { onDismiss() },
                ),
                decorationBox = { innerTextField ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(colors.backgroundSubtle, RoundedCornerShape(8.dp))
                            .border(2.dp, colors.accent, RoundedCornerShape(8.dp))
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    ) {
                        if (localValue.isEmpty()) {
                            Text(
                                text = "Type to search…",
                                color = colors.foregroundMuted,
                                fontSize = 18.sp,
                            )
                        }
                        innerTextField()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester),
            )

            // Clear button
            if (localValue.isNotEmpty()) {
                var clearFocused by remember { mutableStateOf(false) }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (clearFocused) colors.accent else colors.surfaceRaised)
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .onFocusChanged { clearFocused = it.isFocused }
                        .onKeyEvent { event ->
                            if (event.type == KeyEventType.KeyDown &&
                                (event.key == Key.DirectionCenter || event.key == Key.Enter)
                            ) {
                                localValue = ""
                                onValueChange("")
                                true
                            } else false
                        }
                        .focusable(),
                ) {
                    Text(
                        text = "Clear",
                        color = if (clearFocused) colors.accentForeground else colors.foreground,
                        fontSize = 14.sp,
                    )
                }
            }
        }

        LaunchedEffect(Unit) {
            focusRequester.requestFocus()
        }
    }
}
