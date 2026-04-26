import { useCallback, useEffect, useRef, useState } from 'react';
import type shaka from 'shaka-player';
import { loadShakaModule } from './load-shaka.js';

/** Lifecycle state surfaced to the UI. */
export type ShakaStatus = 'idle' | 'loading' | 'playing' | 'error';

/** Track descriptor (subset of Shaka's `Track` we expose to consumers). */
export interface ShakaTrack {
  /** Shaka track id. Pass back to {@link UseShakaPlayerResult.selectTrack}. */
  id: number;
  type: 'variant' | 'text';
  language: string;
  label?: string;
  active: boolean;
  /** Variant only — kbps; text tracks omit this. */
  bandwidth?: number;
}

/** Public shape of an error surfaced by the hook. */
export interface ShakaError {
  /** Stable code if Shaka provided one (`shaka.util.Error.Code`). */
  code?: number;
  message: string;
  /** Original error object (kept for diagnostics; do NOT log credentials). */
  cause?: unknown;
}

/** Options accepted by {@link useShakaPlayer}. */
export interface UseShakaPlayerOptions {
  /**
   * Called every time the hook surfaces a new error (load failure, runtime
   * playback error, track switch failure). Called with the same object that
   * lands in the returned `error` state.
   */
  onError?: (error: ShakaError) => void;
  /**
   * If `true`, the hook calls `video.play()` after a successful load.
   * Defaults to `true` because the consumer always loads after a deliberate
   * user gesture (channel select), which satisfies the autoplay policy.
   */
  autoPlay?: boolean;
}

/** Return shape of {@link useShakaPlayer}. */
export interface UseShakaPlayerResult {
  status: ShakaStatus;
  buffering: boolean;
  error: ShakaError | null;
  tracks: ShakaTrack[];
  /** Switch to a track previously returned in `tracks`. */
  selectTrack(track: ShakaTrack): void;
  /** Re-load the current `streamUrl`. No-op if `streamUrl` is `null`. */
  retry(): void;
  /** Destroy the underlying Shaka instance. Safe to call multiple times. */
  destroy(): Promise<void>;
}

/**
 * Manages a single `shaka.Player` instance attached to `videoRef.current`.
 *
 * - Loads `streamUrl` whenever it changes; tears down on unmount.
 * - Surfaces tracks, buffering, and errors as React state.
 * - Lazy-imports Shaka so SSR / non-playback routes do not pay the bundle.
 *
 * The component owns the `<video>` element and passes a ref. We never
 * create or style the element ourselves.
 */
export function useShakaPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  streamUrl: string | null,
  options: UseShakaPlayerOptions = {}
): UseShakaPlayerResult {
  const { onError, autoPlay = true } = options;
  const playerRef = useRef<shaka.Player | null>(null);
  const reloadTokenRef = useRef(0);

  const [status, setStatus] = useState<ShakaStatus>('idle');
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<ShakaError | null>(null);
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);

  // Keep onError stable inside the load effect without re-running it on every
  // render of the consumer.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reportError = useCallback((err: ShakaError) => {
    setStatus('error');
    setError(err);
    onErrorRef.current?.(err);
  }, []);

  const refreshTracks = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      setTracks([]);
      return;
    }
    const variants = player.getVariantTracks().map(
      (t): ShakaTrack => ({
        id: t.id,
        type: 'variant',
        language: t.language ?? '',
        label: t.label ?? undefined,
        active: t.active,
        bandwidth:
          typeof t.bandwidth === 'number'
            ? Math.round(t.bandwidth / 1000)
            : undefined,
      })
    );
    const texts = player.getTextTracks().map(
      (t): ShakaTrack => ({
        id: t.id,
        type: 'text',
        language: t.language ?? '',
        label: t.label ?? undefined,
        active: t.active,
      })
    );
    setTracks([...variants, ...texts]);
  }, []);

  const destroy = useCallback(async () => {
    const player = playerRef.current;
    playerRef.current = null;
    if (!player) return;
    try {
      await player.destroy();
    } catch {
      // Shaka's destroy is best-effort; never throw out of cleanup.
    }
  }, []);

  // Single effect for "load this url, tear down on unmount/change".
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) {
      setStatus('idle');
      setTracks([]);
      setError(null);
      return;
    }

    let cancelled = false;
    // Bump on every reload so retry() can supersede an in-flight load.
    const token = ++reloadTokenRef.current;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const shakaNs = await loadShakaModule();
        if (cancelled || token !== reloadTokenRef.current) return;
        if (!shakaNs.Player.isBrowserSupported()) {
          reportError({ message: 'Browser is not supported by Shaka Player' });
          return;
        }
        // Tear down any previous instance before binding a new one.
        await destroy();
        const player = new shakaNs.Player(video);
        playerRef.current = player;

        const onShakaError = (event: shaka.util.Error | Event) => {
          // Shaka dispatches its own `Error` event objects; their `detail`
          // field is the actual `shaka.util.Error`.
          const detail = (event as { detail?: shaka.util.Error }).detail;
          const err = detail ?? (event as shaka.util.Error);
          reportError({
            code: err?.code,
            message: `Playback error (${err?.code ?? 'unknown'})`,
            cause: err,
          });
        };
        const onBuffering = (event: Event) => {
          const buf = (event as { buffering?: boolean }).buffering;
          setBuffering(Boolean(buf));
        };
        const onTracksChanged = () => refreshTracks();
        const onAdaptation = () => refreshTracks();

        player.addEventListener('error', onShakaError as EventListener);
        player.addEventListener('buffering', onBuffering);
        player.addEventListener('trackschanged', onTracksChanged);
        player.addEventListener('adaptation', onAdaptation);

        await player.load(streamUrl);
        if (cancelled || token !== reloadTokenRef.current) return;

        refreshTracks();
        setStatus('playing');
        if (autoPlay) {
          // .play() returns a Promise that may reject under autoplay policy.
          // We swallow the rejection — the parent should expose a Play button
          // when autoplay is blocked.
          video.play().catch(() => undefined);
        }
      } catch (cause) {
        if (cancelled || token !== reloadTokenRef.current) return;
        reportError({
          message: cause instanceof Error ? cause.message : 'Failed to load',
          cause,
        });
      }
    })();

    return () => {
      cancelled = true;
      void destroy();
    };
  }, [videoRef, streamUrl, autoPlay, destroy, refreshTracks, reportError]);

  const selectTrack = useCallback((track: ShakaTrack) => {
    const player = playerRef.current;
    if (!player) return;
    if (track.type === 'variant') {
      const variant = player
        .getVariantTracks()
        .find((t) => t.id === track.id);
      if (variant) player.selectVariantTrack(variant, /*clearBuffer*/ true);
    } else {
      const text = player.getTextTracks().find((t) => t.id === track.id);
      if (text) player.selectTextTrack(text);
    }
  }, []);

  const retry = useCallback(() => {
    if (!streamUrl) return;
    // Bumping the token causes the next render's effect to start fresh;
    // we trigger that by re-setting status, which is a benign state update.
    reloadTokenRef.current++;
    setStatus('loading');
    setError(null);
    // Force the load effect to re-run by toggling a ref-tracked dependency.
    // Easiest: dispatch a microtask that calls the same load body. We do this
    // by re-issuing a load via a synthetic re-mount: since `streamUrl` is
    // the dep, and we don't want the consumer to recreate its <video> ref,
    // we just call player.load() directly here.
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video) return;
    void player
      .load(streamUrl)
      .then(() => {
        refreshTracks();
        setStatus('playing');
      })
      .catch((cause) => {
        reportError({
          message: cause instanceof Error ? cause.message : 'Failed to load',
          cause,
        });
      });
  }, [streamUrl, videoRef, refreshTracks, reportError]);

  return { status, buffering, error, tracks, selectTrack, retry, destroy };
}
