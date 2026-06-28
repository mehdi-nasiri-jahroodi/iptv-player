package com.iptvtavern.androidtv.playback

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Log
import android.util.Rational
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bridges Activity-side Picture-in-Picture + Home-press signals to Compose
 * and the player ViewModel.
 *
 * `onUserLeaveHint()` and `onPictureInPictureModeChanged()` live on
 * [Activity], which has no direct line to a Composable or a ViewModel.
 * This holder is the shared state between those worlds:
 *
 *  - [PlayerScreen] arms [playerActive] while a stream is showing.
 *  - `MainActivity.onUserLeaveHint()` reads [playerActive] to decide
 *    whether a Home press should pause the stream (it always should
 *    while the player is up — PiP is now opt-in via the overlay button,
 *    not automatic).
 *  - The overlay's "PiP" button calls [enterPictureInPicture].
 *  - `MainActivity` writes [isInPictureInPicture] when the OS transitions
 *    in/out of PiP; [PlayerScreen] observes it to hide its overlay so
 *    only video shows in the floating window.
 *
 * `@Singleton` → one instance for the whole app lifetime (Hilt
 * `SingletonComponent`), so Activity recreation (prevented via
 * `configChanges`) and ViewModel teardown cannot desync the two sides.
 */
@Singleton
class PipController @Inject constructor() {

    private val _isInPictureInPicture = MutableStateFlow(false)

    /** True while the Activity is rendered inside the PiP window. Observe in Compose. */
    val isInPictureInPicture: StateFlow<Boolean> = _isInPictureInPicture.asStateFlow()

    /**
     * Armed by [PlayerScreen] while a stream is showing. Read by
     * `MainActivity.onUserLeaveHint()` so a Home press while watching
     * pauses the stream (PiP is opt-in via the button, so plain Home no
     * longer keeps audio running invisibly).
     *
     * `@Volatile` because it is written from the Compose thread and read
     * on the main (Activity) thread.
     */
    @Volatile
    var playerActive: Boolean = false

    /**
     * One-shot signal emitted when the user leaves the player via Home
     * (without entering PiP). `PlayerViewModel` collects this and pauses
     * the stream so audio never plays invisibly in the background.
     *
     * `extraBufferCapacity = 1` + `tryEmit` means a pause request is never
     * dropped even if it arrives between collector subscriptions.
     */
    private val _pauseRequests = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val pauseRequests: SharedFlow<Unit> = _pauseRequests.asSharedFlow()

    /** Called by `MainActivity.onPictureInPictureModeChanged()`. */
    fun setInPictureInPicture(value: Boolean) {
        _isInPictureInPicture.value = value
    }

    /**
     * Enter PiP explicitly. Called from the overlay's "PiP" button.
     * No-op below API 26 or on devices that don't support PiP.
     */
    fun enterPictureInPicture(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            // 16:9 matches virtually all live TV; fixed ratio keeps the
            // PiP window predictable without reading ExoPlayer's video
            // size (which may be unknown until the first frame renders).
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            activity.enterPictureInPictureMode(params)
        } catch (e: IllegalStateException) {
            // Some Android TV devices do not support PiP at all.
            Log.w(TAG, "Picture-in-Picture not supported on this device", e)
        }
    }

    /** Called by `MainActivity.onUserLeaveHint()` while the player is active. */
    fun requestPause() {
        _pauseRequests.tryEmit(Unit)
    }

    private companion object {
        const val TAG = "PipController"
    }
}
