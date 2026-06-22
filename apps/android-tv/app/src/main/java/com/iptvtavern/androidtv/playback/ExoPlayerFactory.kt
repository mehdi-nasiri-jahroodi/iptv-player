package com.iptvtavern.androidtv.playback

import android.app.ActivityManager
import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.extractor.ts.TsExtractor
import com.iptvtavern.androidtv.BuildConfig

/**
 * Shared ExoPlayer setup for live mini player and fullscreen player.
 *
 * - **FFmpeg extension** (Jellyfin build): MP2 / AC3 / EAC3 common on IPTV feeds
 * - **MPEG-TS extractors** tuned for IPTV (IRIB-style streams)
 * - Source **User-Agent** on HTTP requests
 */
object ExoPlayerFactory {

    fun create(
        context: Context,
        userAgent: String? = null,
    ): ExoPlayer {
        val ua = userAgent?.trim()?.takeIf { it.isNotEmpty() }
            ?: "Lumina/${BuildConfig.VERSION_NAME} (Android TV)"

        val trackSelector = DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setExceedRendererCapabilitiesIfNecessary(true)
                    .setExceedVideoConstraintsIfNecessary(true)
                    .setExceedAudioConstraintsIfNecessary(true)
                    .build(),
            )
        }

        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(ua)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
            .setAllowCrossProtocolRedirects(true)

        val dataSourceFactory = DefaultDataSource.Factory(context, httpFactory)

        val isLowRam = (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
            .isLowRamDevice
        val extractorsFactory = DefaultExtractorsFactory()
            .setTsExtractorTimestampSearchBytes(
                if (isLowRam) {
                    TsExtractor.TS_PACKET_SIZE * 1_800
                } else {
                    TsExtractor.DEFAULT_TIMESTAMP_SEARCH_BYTES
                },
            )
            .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES)
            .setConstantBitrateSeekingEnabled(true)
            .setConstantBitrateSeekingAlwaysEnabled(true)

        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory, extractorsFactory)

        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)

        return ExoPlayer.Builder(context)
            .setRenderersFactory(renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .setTrackSelector(trackSelector)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .build()
            .also { it.installAutoAudioTrackSelection() }
    }
}
