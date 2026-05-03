package com.iptvtavern.androidtv

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp

/**
 * Application class annotated with @HiltAndroidApp.
 *
 * This is required for Hilt — it generates the DI component graph at
 * compile time. Think of it like wrapping your entire React app with
 * all the necessary Context Providers.
 *
 * Declared in AndroidManifest.xml as `android:name=".IptvTavernApp"`.
 */
@HiltAndroidApp
class IptvTavernApp : Application() {
    override fun onCreate() {
        super.onCreate()

        // Install a safety net for Compose's ContentInViewNode scroll crash.
        // This is a known issue in Compose Foundation's LazyVerticalGrid on TV
        // where focus-driven scroll animations can crash if items recompose
        // mid-animation. Rather than crashing the app, we log and continue.
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val isComposeScrollCrash = throwable.stackTraceToString().let { trace ->
                trace.contains("ContentInViewNode") ||
                    trace.contains("DefaultScrollableState\$scrollScope")
            }
            if (isComposeScrollCrash) {
                Log.e("IptvTavernApp", "Suppressed Compose scroll crash", throwable)
            } else {
                defaultHandler?.uncaughtException(thread, throwable)
            }
        }
    }
}
