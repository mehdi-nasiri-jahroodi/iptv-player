package com.iptvtavern.androidtv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.iptvtavern.androidtv.playback.PipController
import com.iptvtavern.androidtv.ui.common.PlaylistLoadOverlay
import com.iptvtavern.androidtv.ui.common.rememberStalledFlag
import com.iptvtavern.androidtv.ui.navigation.AppNavHost
import com.iptvtavern.androidtv.ui.navigation.Routes
import com.iptvtavern.androidtv.ui.navigation.TAB_ITEMS
import com.iptvtavern.androidtv.ui.navigation.TopTabNavigation
import com.iptvtavern.androidtv.ui.theme.LuminaTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

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

    @Inject
    lateinit var pipController: PipController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LuminaTheme {
                AppRoot()
            }
        }
    }

    /**
     * Called by the OS when the user leaves the Activity via a system
     * gesture — i.e. the **Home** button (not Back). This is the only
     * hook where we can intercept Home.
     *
     * PiP is now opt-in (overlay button), so plain Home should NOT leave
     * audio playing invisibly. While the player is active we emit a pause
     * request that `PlayerViewModel` collects to stop playback. On any
     * other screen [PipController.playerActive] is false → normal behavior.
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (pipController.playerActive) {
            pipController.requestPause()
        }
    }

    // The Boolean overload is deprecated in API 33 in favor of the
    // PictureInPictureModeChangedInfo variant, but the Boolean form still
    // fires on every API level (including 33+). We keep it because PiP
    // itself starts at API 26, well below the new signature's API 33 floor.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode)
        pipController.setInPictureInPicture(isInPictureInPictureMode)
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

    // One-shot: focus the Home tab when the app first opens so the user
    // sees a focus indicator without pressing a key first.
    var initialTabFocusDone by remember { mutableStateOf(false) }

    // Determine if top tabs should be visible (not during onboarding, player, or add-source)
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route
    val showTabs = currentRoute != null &&
        currentRoute != Routes.ONBOARDING &&
        currentRoute != Routes.PLAY &&
        currentRoute != Routes.ADD_SOURCE &&
        currentRoute != Routes.EDIT_SOURCE

    // Keep selectedTabIndex in sync with the actual route. The tab index is
    // otherwise only ever set by onItemSelected, so after a Back/pop or any
    // nav not initiated by tapping a tab, the highlight (and the
    // navBarFocusRequester target) would drift from reality.
    LaunchedEffect(currentRoute) {
        val matched = TAB_ITEMS.indexOfFirst { it.route == currentRoute }
        if (matched >= 0 && matched != selectedTabIndex) {
            selectedTabIndex = matched
        }
    }

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
                    if (route == Routes.HOME) {
                        // Home is the graph root — pop back to it cleanly.
                        // The bottom-nav saveState/restoreState pattern was
                        // mis-restoring a saved leaf tab when returning to
                        // Home (landing on Live instead of Home). popBackStack
                        // to the always-present root entry avoids that entirely.
                        navController.popBackStack(Routes.HOME, inclusive = false)
                    } else if (currentRoute != route) {
                        navController.navigate(route) {
                            popUpTo(navController.graph.startDestinationId) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                },
                requestInitialFocus = !initialTabFocusDone,
                onInitialFocusDone = { initialTabFocusDone = true },
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
