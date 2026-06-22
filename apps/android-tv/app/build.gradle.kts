import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
}

// Load local.properties (never committed — holds secrets)
val localProps = Properties().also { props ->
    val file = rootProject.file("local.properties")
    if (file.exists()) props.load(file.inputStream())
}

android {
    namespace = "com.iptvtavern.androidtv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.iptvtavern.androidtv"
        minSdk = 21
        targetSdk = 35
        versionCode = 7
        versionName = "0.1.6"

        // Inject secrets as BuildConfig fields — readable in Kotlin, not in git
        buildConfigField("String", "TELEGRAM_BOT_TOKEN", "\"${localProps["TELEGRAM_BOT_TOKEN"] ?: ""}\"")
        buildConfigField("String", "TELEGRAM_CHAT_ID", "\"${localProps["TELEGRAM_CHAT_ID"] ?: ""}\"")

        // Room schema export for migration tracking
        ksp {
            arg("room.schemaLocation", "$projectDir/schemas")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // Compose BOM — single version for all Compose artifacts
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    // Compose for TV
    implementation("androidx.tv:tv-foundation:1.0.0-alpha11")
    implementation("androidx.tv:tv-material:1.0.0")

    // Core Compose (versions managed by BOM)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime")

    // Activity + Lifecycle
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    // Core AndroidX
    implementation("androidx.core:core-ktx:1.15.0")

    // Leanback (for launcher integration)
    implementation("androidx.leanback:leanback:1.0.0")

    // Kotlinx Serialization — JSON parsing aligned with Zod schemas in packages/core
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Room — structured persistence (sources, playlists, profiles)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    // DataStore — lightweight key-value persistence (AppSettings)
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Hilt — dependency injection
    implementation("com.google.dagger:hilt-android:2.51.1")
    ksp("com.google.dagger:hilt-compiler:2.51.1")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // Navigation — Compose Navigation for screen routing (like React Router)
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // Coil — Compose-native image loading (channel logos, posters)
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Media3 / ExoPlayer — video playback
    val media3Version = "1.5.0"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")
    // MP2 / AC3 / EAC3 — common on IPTV live feeds (e.g. IRIB); not in Android MediaCodec.
    implementation("org.jellyfin.media3:media3-ffmpeg-decoder:1.5.0+1")

    // Compose Material Icons (for sidebar icons)
    implementation("androidx.compose.material:material-icons-extended")

    // Debug tooling
    debugImplementation("androidx.compose.ui:ui-tooling")
}
