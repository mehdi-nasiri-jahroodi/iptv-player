package com.iptvtavern.androidtv

import android.app.Application
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
class IptvTavernApp : Application()
