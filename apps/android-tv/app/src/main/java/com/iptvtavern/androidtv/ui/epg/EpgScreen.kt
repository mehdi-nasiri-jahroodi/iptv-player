package com.iptvtavern.androidtv.ui.epg

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.iptvtavern.androidtv.domain.model.EpgProgram
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * EPG Schedule screen — today + tomorrow program grid.
 *
 * Layout: vertical list of channels. Each channel row shows the channel
 * name/logo on the left, and a horizontal scrollable timeline of programs
 * on the right. "On air" programs are highlighted.
 *
 * D-pad: Up/Down between channels, Left/Right to scroll programs.
 *
 * Web equivalent: `apps/web/app/pages/epg.tsx`.
 */
@Composable
fun EpgScreen(
    viewModel: EpgViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val colors = LuminaTheme.colors
    val channelListState = rememberLazyListState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(horizontal = 24.dp, vertical = 16.dp),
    ) {
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Loading EPG…",
                        color = colors.foregroundMuted,
                        fontSize = 16.sp,
                    )
                }
            }
            uiState.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "EPG",
                            color = colors.foreground,
                            fontSize = 20.sp,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = uiState.error ?: "",
                            color = colors.danger,
                            fontSize = 14.sp,
                        )
                    }
                }
            }
            else -> {
                Column {
                    // Header
                    Text(
                        text = "Program Guide",
                        color = colors.foreground,
                        fontSize = 22.sp,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${uiState.channels.size} channels with EPG data",
                        color = colors.foregroundMuted,
                        fontSize = 12.sp,
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    // Channel list
                    LazyColumn(
                        state = channelListState,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        itemsIndexed(
                            uiState.channels,
                            key = { _, row -> row.tvgId },
                        ) { index, channelRow ->
                            EpgChannelRowView(
                                channelRow = channelRow,
                                nowMs = uiState.nowMs,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Channel Row ────────────────────────────────────────────────────

@Composable
private fun EpgChannelRowView(
    channelRow: EpgChannelRow,
    nowMs: Long,
) {
    val colors = LuminaTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(colors.surface),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Channel info (fixed width left column)
        Row(
            modifier = Modifier
                .width(180.dp)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (channelRow.logoUrl != null) {
                AsyncImage(
                    model = channelRow.logoUrl,
                    contentDescription = channelRow.channelName,
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(4.dp)),
                    contentScale = ContentScale.Fit,
                )
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text(
                text = channelRow.channelName,
                color = colors.foreground,
                fontSize = 13.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }

        // Programs timeline (scrollable horizontally)
        LazyRow(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            contentPadding = PaddingValues(end = 8.dp),
        ) {
            items(channelRow.programs, key = { "${it.channelId}-${it.start}" }) { program ->
                ProgramCell(
                    program = program,
                    nowMs = nowMs,
                )
            }
        }
    }
}

// ── Program Cell ───────────────────────────────────────────────────

@Composable
private fun ProgramCell(
    program: EpgProgram,
    nowMs: Long,
) {
    val colors = LuminaTheme.colors
    var isFocused by remember { mutableStateOf(false) }

    val startMs = remember(program.start) { parseInstantMs(program.start) }
    val endMs = remember(program.end) { parseInstantMs(program.end) }
    val isOnAir = nowMs in startMs until endMs

    // Width proportional to duration (1 hour = 200dp, clamped)
    val durationMinutes = ((endMs - startMs) / 60_000).coerceAtLeast(1).toInt()
    val widthDp = (durationMinutes * 200 / 60).coerceIn(80, 600).dp

    val bgColor = when {
        isOnAir && isFocused -> colors.accent
        isOnAir -> colors.accent.copy(alpha = 0.25f)
        isFocused -> colors.surfaceRaised
        else -> colors.backgroundSubtle
    }

    val borderColor = when {
        isFocused -> colors.accent
        isOnAir -> colors.accent.copy(alpha = 0.5f)
        else -> Color.Transparent
    }

    Column(
        modifier = Modifier
            .width(widthDp)
            .fillMaxHeight()
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .border(
                width = if (isFocused || isOnAir) 2.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(4.dp),
            )
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable(),
        verticalArrangement = Arrangement.Center,
    ) {
        // Time range
        Text(
            text = "${formatTime(startMs)} – ${formatTime(endMs)}",
            color = if (isOnAir && isFocused) colors.accentForeground
                    else if (isOnAir) colors.accent
                    else colors.foregroundMuted,
            fontSize = 10.sp,
        )
        // Title
        Text(
            text = program.title,
            color = if (isOnAir && isFocused) colors.accentForeground else colors.foreground,
            fontSize = 13.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        // On Air badge
        if (isOnAir) {
            Text(
                text = "ON AIR",
                color = if (isFocused) colors.accentForeground else Color(0xFF22C55E),
                fontSize = 9.sp,
            )
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────

private fun parseInstantMs(iso: String): Long {
    return try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: Exception) {
        0L
    }
}

private val timeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())

private fun formatTime(epochMs: Long): String {
    return try {
        timeFormatter.format(Instant.ofEpochMilli(epochMs))
    } catch (_: Exception) {
        "--:--"
    }
}
