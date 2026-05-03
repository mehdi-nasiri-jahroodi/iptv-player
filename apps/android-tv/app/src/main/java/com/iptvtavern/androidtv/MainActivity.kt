package com.iptvtavern.androidtv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.lazy.LazyColumn
import androidx.tv.material3.Text
import com.iptvtavern.androidtv.ui.theme.LuminaTheme

/**
 * Main (and only) Activity for the Android TV app.
 *
 * In Android, an Activity is roughly equivalent to a "page" or "route"
 * in a React SPA — it's the entry point the OS launches. We use a
 * single Activity and let Compose Navigation handle screen changes
 * (added in Phase 4).
 *
 * `ComponentActivity` is the modern base class that supports Compose.
 * `setContent {}` is like `ReactDOM.createRoot(el).render(<App />)`.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LuminaTheme {
                AppShell()
            }
        }
    }
}

/**
 * Temporary placeholder screen — replaced in Phase 4 with real navigation.
 *
 * TvLazyColumn is the TV-optimized equivalent of LazyColumn (think of it
 * like a virtualized list — similar to react-window). It handles D-pad
 * focus management automatically.
 */
@Composable
fun AppShell() {
    val colors = LuminaTheme.colors

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
        contentAlignment = Alignment.Center,
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Text(
                    text = "IPTV Tavern",
                    color = colors.accent,
                    fontSize = 32.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 48.dp),
                )
            }
            item {
                Text(
                    text = "Android TV",
                    color = colors.foreground,
                    fontSize = 20.sp,
                    textAlign = TextAlign.Center,
                )
            }
            item {
                Text(
                    text = "Phase 1 — Project scaffold complete",
                    color = colors.foregroundMuted,
                    fontSize = 16.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = 48.dp),
                )
            }
        }
    }
}
