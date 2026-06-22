package com.iptvtavern.androidtv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.iptvtavern.androidtv.ui.common.PlaylistLoadOverlay
import com.iptvtavern.androidtv.ui.common.rememberStalledFlag
import com.iptvtavern.androidtv.ui.navigation.AppNavHost
import com.iptvtavern.androidtv.ui.navigation.Routes
import com.iptvtavern.androidtv.ui.navigation.TAB_ITEMS
import com.iptvtavern.androidtv.ui.navigation.TopTabNavigation
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Main (and only) Activity for the Android TV app.
 *
 * In Android, an Activity is roughly equivalent to a "page" or "route"
 * in a React SPA — it's the entry point the OS launches. We use a
 * single Activity and let Compose Navigation handle screen changes.
 *
 * `ComponentActivity` is the modern base class that supports Compose.
 * `setContent {}` is like `ReactDOM.createRoot(el).render(<App />)`.
 *
 * `@AndroidEntryPoint` tells Hilt to inject dependencies into this Activity
 * and any ViewModels obtained via `hiltViewModel()`.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LuminaTheme {
                AppRoot()
            }
        }
    }
}

/**
 * Root composable — determines whether to show onboarding or the main app.
 *
 * Checks if any sources exist. If not, starts at onboarding.
 * Once onboarding is complete (or sources exist), shows the top tab bar + NavHost.
 */
@Composable
fun AppRoot(
    viewModel: AppRootViewModel = hiltViewModel(),
) {
    val hasCompletedSetup by viewModel.hasCompletedSetup.collectAsState()
    val overlayState by viewModel.overlayState.collectAsState()
    val colors = LuminaTheme.colors

    // Show a blank screen while we check the database
    if (hasCompletedSetup == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.background)
        )
        return
    }

    val navController = rememberNavController()
    val startDestination = if (hasCompletedSetup == true) Routes.HOME else Routes.ONBOARDING

    // Track which tab is selected
    var selectedTabIndex by rememberSaveable { mutableIntStateOf(0) }

    // Determine if top tabs should be visible (not during onboarding, player, or add-source)
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route
    val showTabs = currentRoute != null &&
        currentRoute != Routes.ONBOARDING &&
        currentRoute != Routes.PLAY &&
        currentRoute != Routes.ADD_SOURCE &&
        currentRoute != Routes.EDIT_SOURCE

    // Wrap the entire navigation tree in a Box so the overlay can render
    // on top regardless of which screen is active. The overlay itself
    // handles its own visibility (animated fade in/out from
    // [PlaylistLoadOverlay]).
    Box(modifier = Modifier.fillMaxSize()) {
        if (showTabs) {
            TopTabNavigation(
                selectedIndex = selectedTabIndex,
                onItemSelected = { index, route ->
                    selectedTabIndex = index
                    navController.navigate(route) {
                        popUpTo(navController.graph.startDestinationId) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
            ) {
                AppNavHost(
                    navController = navController,
                    startDestination = startDestination,
                )
            }
        } else {
            AppNavHost(
                navController = navController,
                startDestination = startDestination,
            )
        }

        // Indeterminate fallback if no progress event arrives for a while
        // (e.g. a single endpoint takes 20+ seconds on a 60k catalog).
        val stalled = rememberStalledFlag(
            percent = overlayState.percent,
            label = overlayState.label,
            active = overlayState.visible,
        )
        PlaylistLoadOverlay(
            visible = overlayState.visible,
            percent = overlayState.percent,
            label = overlayState.label,
            indeterminate = stalled,
        )
    }
}
