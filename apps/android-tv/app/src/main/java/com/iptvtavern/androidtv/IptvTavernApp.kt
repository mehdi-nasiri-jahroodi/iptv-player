package com.iptvtavern.androidtv

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class IptvTavernApp : Application() {

    companion object {
        private const val TAG = "IptvTavernApp"
    }

    override fun onCreate() {
        super.onCreate()

        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val isComposeScrollCrash = throwable.stackTraceToString().let { trace ->
                trace.contains("ContentInViewNode") ||
                    trace.contains("DefaultScrollableState\$scrollScope")
            }
            if (isComposeScrollCrash) {
                Log.e(TAG, "Suppressed Compose scroll crash", throwable)
            } else {
                CrashReporter.report(throwable, this@IptvTavernApp)
                defaultHandler?.uncaughtException(thread, throwable)
            }
        }
    }
}
