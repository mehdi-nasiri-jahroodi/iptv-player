package com.iptvtavern.androidtv.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.iptvtavern.androidtv.ui.addsource.AddSourceScreen
import com.iptvtavern.androidtv.ui.browse.BrowseScreen
import com.iptvtavern.androidtv.ui.home.HomeScreen
import com.iptvtavern.androidtv.ui.onboarding.OnboardingScreen
import com.iptvtavern.androidtv.ui.player.PlayerScreen
import com.iptvtavern.androidtv.ui.settings.SettingsScreen
import com.iptvtavern.androidtv.ui.vod.VodBrowseScreen

/**
 * App-level NavHost — the "router" for the Android TV app.
 *
 * Like React Router's `<Routes>` / `<Route>` tree, this defines which
 * composable renders for each route string. The [navController] is
 * equivalent to `useNavigate()` — call `navController.navigate("route")`
 * to change screens.
 */
@Composable
fun AppNavHost(
    navController: NavHostController,
    startDestination: String,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                onNavigateToBrowse = { kind -> navController.navigate(Routes.browse(kind)) },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                onNavigateToPlayer = { channelId ->
                    navController.navigate(Routes.play(channelId))
                },
            )
        }

        composable(
            route = Routes.BROWSE,
            arguments = listOf(navArgument("kind") { type = NavType.StringType }),
        ) { backStackEntry ->
            val kind = backStackEntry.arguments?.getString("kind") ?: "live"
            when (kind) {
                "vod" -> VodBrowseScreen(
                    onNavigateToPlayer = { channelId ->
                        navController.navigate(Routes.play(channelId))
                    },
                )
                else -> BrowseScreen(
                    kind = kind,
                    onNavigateToPlayer = { channelId ->
                        navController.navigate(Routes.play(channelId))
                    },
                )
            }
        }

        composable(
            route = Routes.PLAY,
            arguments = listOf(navArgument("channelId") { type = NavType.StringType }),
        ) {
            PlayerScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToAddSource = { navController.navigate(Routes.ADD_SOURCE) },
                onNavigateToEditSource = { sourceId ->
                    navController.navigate(Routes.editSource(sourceId))
                },
            )
        }

        composable(Routes.ADD_SOURCE) {
            AddSourceScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.EDIT_SOURCE,
            arguments = listOf(navArgument("sourceId") { type = NavType.StringType }),
        ) {
            AddSourceScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(Routes.ONBOARDING) {
            OnboardingScreen(
                onFinished = {
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.ONBOARDING) { inclusive = true }
                    }
                },
            )
        }
    }
}
