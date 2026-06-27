package com.iptvtavern.androidtv.playback

import android.app.ActivityManager
import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.extractor.ts.TsExtractor
import com.iptvtavern.androidtv.BuildConfig
import com.iptvtavern.androidtv.domain.model.PlayerBufferMode

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
        bufferMode: PlayerBufferMode = PlayerBufferMode.balanced,
    ): ExoPlayer {
        val ua = userAgent?.trim()?.takeIf { it.isNotEmpty() }
            ?: "Lumina/${BuildConfig.VERSION_NAME} (Android TV)"

        // Exceed flags: these let ExoPlayer force-select a HW decoder for
        // streams whose declared profile/level is above what the decoder
        // officially supports (common for IPTV VOD: HEVC L5.1, H.264 High L5.1).
        //
        // The decoder usually CAN play these — the level is a conservative
        // upper bound — it just needs to be told to try. Without these flags,
        // the HW decoder engages half-way and drops every frame → audio but
        // no video.
        //
        // These used to crash on Chromecast HD because memory ran out
        // mid-decode. That is now handled by largeHeap + a capped LoadControl
        // (see loadControlFor) + the debloated device, so forcing the decoder
        // is safe again.
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
            .setLoadControl(loadControlFor(bufferMode))
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

    /**
     * Translate the user's Buffer Mode setting into a [DefaultLoadControl].
     *
     * The default ExoPlayer buffer targets up to ~50s of media, which on a
     * 128 MB-heap device (Chromecast HD) consumes tens of MB and contributes
     * to the heap pressure that crashes MediaCodec mid-playback. Smaller
     * buffers trade network resilience for memory safety.
     *
     * - aggressive: smallest buffer → lowest memory, may rebuffer on bad networks
     * - balanced: middle ground (default)
     * - conservative: largest buffer → smoothest on flaky streams, most memory
     */
    private fun loadControlFor(mode: PlayerBufferMode): LoadControl {
        val durations = when (mode) {
            PlayerBufferMode.aggressive ->
                BufferDurations(minMs = 10_000, maxMs = 20_000, playbackMs = 1_000, rebufferMs = 2_000)
            PlayerBufferMode.balanced ->
                BufferDurations(minMs = 15_000, maxMs = 30_000, playbackMs = 1_500, rebufferMs = 3_000)
            PlayerBufferMode.conservative ->
                BufferDurations(minMs = 30_000, maxMs = 50_000, playbackMs = 2_500, rebufferMs = 5_000)
        }
        return DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                durations.minMs,
                durations.maxMs,
                durations.playbackMs,
                durations.rebufferMs,
            )
            .build()
    }

    private data class BufferDurations(
        val minMs: Int,
        val maxMs: Int,
        val playbackMs: Int,
        val rebufferMs: Int,
    )
}
