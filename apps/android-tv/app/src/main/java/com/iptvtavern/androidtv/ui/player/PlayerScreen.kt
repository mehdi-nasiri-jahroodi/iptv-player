package com.iptvtavern.androidtv.ui.player

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.iptvtavern.androidtv.ui.settings.FocusableButton
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import kotlinx.coroutines.delay

/**
 * Fullscreen player screen — Media3/ExoPlayer with D-pad controls.
 *
 * Controls overlay appears on any D-pad press and auto-hides after 5s.
 * Channel zapping via Up/Down keys. Back returns to browse.
 *
 * Web equivalent: `apps/web/app/pages/play.tsx` + `packages/player/`
 */
@Composable
fun PlayerScreen(
    onNavigateBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val focusRequester = remember { FocusRequester() }

    BackHandler(onBack = onNavigateBack)

    // Auto-hide overlay after 5 seconds
    LaunchedEffect(uiState.showOverlay, uiState.error) {
        if (uiState.showOverlay && uiState.error == null) {
            delay(5000)
            viewModel.hideOverlay()
        }
    }

    // Request focus on the root so key events are captured
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.key) {
                        Key.DirectionUp -> {
                            if (uiState.showOverlay) {
                                viewModel.channelUp()
                            } else {
                                viewModel.showOverlay()
                            }
                            true
                        }
                        Key.DirectionDown -> {
                            if (uiState.showOverlay) {
                                viewModel.channelDown()
                            } else {
                                viewModel.showOverlay()
                            }
                            true
                        }
                        Key.DirectionCenter, Key.Enter -> {
                            if (uiState.error != null) {
                                viewModel.retry()
                            } else if (uiState.showOverlay) {
                                viewModel.togglePlayPause()
                            } else {
                                viewModel.showOverlay()
                            }
                            true
                        }
                        Key.DirectionLeft, Key.DirectionRight -> {
                            viewModel.showOverlay()
                            true
                        }
                        Key.MediaPlayPause -> {
                            viewModel.togglePlayPause()
                            true
                        }
                        Key.ChannelUp -> {
                            viewModel.channelUp()
                            true
                        }
                        Key.ChannelDown -> {
                            viewModel.channelDown()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .focusable(),
    ) {
        // Video surface
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = viewModel.player
                    useController = false // We draw our own overlay
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Loading indicator
        if (uiState.isLoading || uiState.isBuffering) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Loading…",
                    color = Color.White,
                    fontSize = 20.sp,
                )
            }
        }

        // Error overlay
        if (uiState.error != null) {
            ErrorOverlay(
                error = uiState.error!!,
                errorDetails = uiState.errorDetails,
                onRetry = viewModel::retry,
                onCopyDiagnostics = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(
                        ClipData.newPlainText("IPTV Diagnostics", viewModel.getDiagnosticsText())
                    )
                },
                onBack = onNavigateBack,
            )
        }

        // Controls overlay
        AnimatedVisibility(
            visible = uiState.showOverlay && uiState.error == null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            ControlsOverlay(
                uiState = uiState,
                onPlayPause = viewModel::togglePlayPause,
                onChannelUp = viewModel::channelUp,
                onChannelDown = viewModel::channelDown,
                onSelectAudioTrack = viewModel::selectAudioTrack,
                onSelectSubtitleTrack = viewModel::selectSubtitleTrack,
                onDisableSubtitles = viewModel::disableSubtitles,
            )
        }
    }
}

/**
 * Controls overlay — channel info at top, playback controls at bottom.
 * Auto-hides after 5s inactivity (managed by the parent).
 */
@Composable
private fun ControlsOverlay(
    uiState: PlayerUiState,
    onPlayPause: () -> Unit,
    onChannelUp: () -> Unit,
    onChannelDown: () -> Unit,
    onSelectAudioTrack: (groupIndex: Int, trackIndex: Int) -> Unit,
    onSelectSubtitleTrack: (groupIndex: Int, trackIndex: Int) -> Unit,
    onDisableSubtitles: () -> Unit,
) {
    val colors = LuminaTheme.colors

    Box(modifier = Modifier.fillMaxSize()) {
        // Top: channel info bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xCC000000))
                .padding(horizontal = 24.dp, vertical = 16.dp)
                .align(Alignment.TopCenter),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Channel logo
            if (uiState.channelLogoUrl != null) {
                AsyncImage(
                    model = uiState.channelLogoUrl,
                    contentDescription = uiState.channelName,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(4.dp)),
                    contentScale = ContentScale.Fit,
                )
                Spacer(modifier = Modifier.width(16.dp))
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = uiState.channelName,
                    color = Color.White,
                    fontSize = 22.sp,
                )
                Text(
                    text = "Channel ${uiState.channelIndex + 1} / ${uiState.totalChannels}",
                    color = Color(0xAAFFFFFF),
                    fontSize = 14.sp,
                )
            }

            // Live badge
            Text(
                text = "LIVE",
                color = Color.White,
                fontSize = 12.sp,
                modifier = Modifier
                    .background(Color(0xFFE53935), RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }

        // Bottom: controls bar
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xCC000000))
                .padding(horizontal = 24.dp, vertical = 16.dp)
                .align(Alignment.BottomCenter),
        ) {
            // Playback controls row
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FocusableButton(
                    text = if (uiState.isPlaying) "⏸ Pause" else "▶ Play",
                    onClick = onPlayPause,
                )
                FocusableButton(
                    text = "▲ Ch+",
                    onClick = onChannelUp,
                )
                FocusableButton(
                    text = "▼ Ch−",
                    onClick = onChannelDown,
                )
            }

            // Track pickers (only if tracks available)
            if (uiState.audioTracks.size > 1) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Audio",
                    color = Color(0xAAFFFFFF),
                    fontSize = 12.sp,
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(uiState.audioTracks) { track ->
                        TrackButton(
                            label = track.label,
                            isSelected = track.isSelected,
                            onClick = { onSelectAudioTrack(track.groupIndex, track.index) },
                        )
                    }
                }
            }

            if (uiState.subtitleTracks.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Subtitles",
                    color = Color(0xAAFFFFFF),
                    fontSize = 12.sp,
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        TrackButton(
                            label = "Off",
                            isSelected = uiState.subtitleTracks.none { it.isSelected },
                            onClick = onDisableSubtitles,
                        )
                    }
                    items(uiState.subtitleTracks) { track ->
                        TrackButton(
                            label = track.label,
                            isSelected = track.isSelected,
                            onClick = { onSelectSubtitleTrack(track.groupIndex, track.index) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackButton(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .background(
                color = when {
                    isSelected -> Color(0xFF1E88E5)
                    isFocused -> Color(0xFF424242)
                    else -> Color(0xFF212121)
                },
                shape = RoundedCornerShape(6.dp),
            )
            .border(
                width = if (isFocused) 2.dp else 0.dp,
                color = if (isFocused) Color.White else Color.Transparent,
                shape = RoundedCornerShape(6.dp),
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
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
            text = label,
            color = Color.White,
            fontSize = 13.sp,
        )
    }
}

/**
 * Error overlay — shown when playback fails.
 * Retry + Copy diagnostics + Back actions.
 */
@Composable
private fun ErrorOverlay(
    error: String,
    errorDetails: String?,
    onRetry: () -> Unit,
    onCopyDiagnostics: () -> Unit,
    onBack: () -> Unit,
) {
    var showDetails by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xEE000000)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .padding(48.dp)
                .background(Color(0xFF1A1A1A), RoundedCornerShape(16.dp))
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Playback Error",
                color = Color(0xFFE53935),
                fontSize = 22.sp,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = error,
                color = Color.White,
                fontSize = 16.sp,
            )

            if (errorDetails != null && showDetails) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = errorDetails,
                    color = Color(0xAAFFFFFF),
                    fontSize = 12.sp,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                FocusableButton(text = "Retry", onClick = onRetry)
                if (errorDetails != null) {
                    FocusableButton(
                        text = if (showDetails) "Hide Details" else "Show Details",
                        onClick = { showDetails = !showDetails },
                    )
                }
                FocusableButton(text = "Copy Diagnostics", onClick = onCopyDiagnostics)
                FocusableButton(text = "Go Back", onClick = onBack)
            }
        }
    }
}
