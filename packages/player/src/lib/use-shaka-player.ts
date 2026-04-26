import { useCallback, useEffect, useRef, useState } from 'react';
import type shaka from 'shaka-player';
import { loadShakaModule } from './load-shaka.js';
import { buildSignedProxyUrl } from './proxy-signing.js';

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
  /** Variant only — pixel width of the video stream, when known. */
  width?: number;
  /** Variant only — pixel height of the video stream, when known. */
  height?: number;
  /** Variant only — frame rate in fps, when known. */
  frameRate?: number;
  /** Variant only — codec string (`avc1.640028`, `mp4a.40.2`, …). */
  codecs?: string;
}

/** Public shape of an error surfaced by the hook. */
export interface ShakaError {
  /** Stable code if Shaka provided one (`shaka.util.Error.Code`). */
  code?: number;
  /** Numeric `shaka.util.Error.Category` if available. */
  category?: number;
  /**
   * Numeric `shaka.util.Error.Severity` if Shaka provided it.
   * `1` = RECOVERABLE (segment retried, playback continues).
   * `2` = CRITICAL (player gives up).
   */
  severity?: number;
  message: string;
  /** Free-form details Shaka attaches (URL, HTTP status, etc.). */
  data?: unknown;
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
   * Defaults to `true`. On a cold page load there is often **no** user gesture,
   * so the hook retries on `canplay` and, on `NotAllowedError`, sets
   * `video.muted = true` and tries again. Pair with `<video muted>` (or the
   * `Player` `muted` prop) for inline previews if you want autoplay without a
   * flash of blocked playback.
   */
  autoPlay?: boolean;
  /**
   * Route every MANIFEST and SEGMENT request through a user-run web proxy
   * (see `apps/web-proxy`). When set, every outbound playback URL is
   * rewritten to `${baseUrl}/stream?u=...&sig=...` with an HMAC-SHA256
   * signature computed over the canonical `${u}|${ua ?? ''}` string.
   *
   * Used to bypass browser CORS on commercial Xtream HLS streams. Native
   * targets (Android TV, webOS) do not need this.
   *
   * The hook keeps the original `streamUrl` as-is when this option is
   * absent or null. URLs whose origin already matches `baseUrl` are
   * passed through untouched (the proxy already rewrote a manifest's
   * segment URIs to point at itself, no need to double-wrap).
   */
  streamProxy?: StreamProxyOption | null;
}

/**
 * Stream-proxy configuration accepted by {@link useShakaPlayer}.
 *
 * Lives in `packages/player` (not `core`) because it pairs with the
 * Shaka request filter; the web app reads its `streamProxy` slice from
 * its settings store and passes it through to the hook.
 */
export interface StreamProxyOption {
  /** Base URL of the proxy, e.g. `http://localhost:8787`. No trailing slash required. */
  baseUrl: string;
  /** Shared HMAC secret matching the proxy `PROXY_SECRET`. */
  secret: string;
  /** Optional User-Agent override; falls back to the proxy default. */
  userAgent?: string;
}

/**
 * Live-updating snapshot of `<video>` element state, surfaced for use by
 * custom control overlays. Updated via direct `addEventListener` on the
 * media element; `useShakaPlayer` keeps this in sync with React state on
 * `play`, `pause`, `timeupdate`, `durationchange`, `volumechange`, and
 * `seeking` / `seeked`.
 */
export interface ShakaMedia {
  paused: boolean;
  currentTime: number;
  /** `Infinity` for live, `NaN` while metadata loads, finite seconds for VOD. */
  duration: number;
  /** `true` when the stream advertises a finite seek window (VOD/series). */
  seekable: boolean;
  volume: number;
  muted: boolean;
}

/** Return shape of {@link useShakaPlayer}. */
export interface UseShakaPlayerResult {
  status: ShakaStatus;
  buffering: boolean;
  /**
   * Critical playback error — Shaka has stopped trying. Renders the big
   * `<PlayerErrorOverlay>` chrome.
   */
  error: ShakaError | null;
  /**
   * Most recent **recoverable** error reported by Shaka (segment 403/404,
   * transient network blip). Playback is still going; this is a heads-up
   * for telemetry / a tiny UI indicator. Auto-clears the next time the
   * `<video>` element fires `playing`, on `streamUrl` change, on `retry()`,
   * and on `destroy()`. Never call `onError` for recoverable errors.
   */
  recoverableError: ShakaError | null;
  tracks: ShakaTrack[];
  /**
   * `true` when Shaka's adaptive bitrate algorithm is currently picking the
   * variant. Flips to `false` the moment the user manually selects a
   * specific variant via {@link selectTrack}; flip back via
   * {@link setAbrEnabled}.
   */
  abrEnabled: boolean;
  media: ShakaMedia;
  /**
   * Switch to a track previously returned in `tracks`. For variant tracks
   * this also disables ABR — the user explicitly asked for this quality, so
   * Shaka should not switch under them. Use {@link setAbrEnabled} to
   * re-enable adaptive switching.
   */
  selectTrack(track: ShakaTrack): void;
  /** Turn off subtitles / closed captions (Shaka `selectTextTrack(null)`). */
  clearTextTrack(): void;
  /**
   * Toggle Shaka's adaptive bitrate algorithm. Disabling sticks the player
   * on the currently selected variant; enabling lets Shaka switch based on
   * its bandwidth estimate.
   */
  setAbrEnabled(enabled: boolean): void;
  /** Re-load the current `streamUrl`. No-op if `streamUrl` is `null`. */
  retry(): void;
  /** Destroy the underlying Shaka instance. Safe to call multiple times. */
  destroy(): Promise<void>;
  /** Resume playback. Best-effort; rejection swallowed (autoplay policy). */
  play(): void;
  pause(): void;
  /** Seek to absolute seconds; clamped to `[0, duration]` when finite. */
  seek(seconds: number): void;
  /** Volume in `[0, 1]`. */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Toggle browser fullscreen on the `<video>` element's parent. */
  toggleFullscreen(): void;
}

const DEFAULT_MEDIA: ShakaMedia = {
  paused: true,
  currentTime: 0,
  duration: Number.NaN,
  seekable: false,
  volume: 1,
  muted: false,
};

function isNotAllowedError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'NotAllowedError'
  );
}

/**
 * Best-effort autoplay after Shaka `load()` resolves — the first `play()` can
 * fail (autoplay policy, media not ready yet). Retries once on `canplay`, and
 * unmutes path: on policy block, set muted and try again.
 */
function scheduleAutoplayAfterLoad(
  video: HTMLVideoElement,
  autoPlay: boolean,
  isStale: () => boolean,
  signal: AbortSignal
): void {
  if (!autoPlay) return;

  const tryPlay = () => {
    if (isStale()) return;
    void video.play().catch((err: unknown) => {
      if (isStale()) return;
      if (isNotAllowedError(err) && !video.muted) {
        video.muted = true;
        void video.play().catch(() => undefined);
      }
    });
  };

  tryPlay();
  const onCanPlay = () => {
    if (isStale()) return;
    if (autoPlay && video.paused) tryPlay();
  };
  video.addEventListener('canplay', onCanPlay, { once: true, signal });
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
  const { onError, autoPlay = true, streamProxy = null } = options;
  const playerRef = useRef<shaka.Player | null>(null);
  const reloadTokenRef = useRef(0);

  // Keep the latest streamProxy in a ref so the filter installed once at load
  // time always reads the current secret/baseUrl. Re-installing the filter
  // on every settings tweak would force a full Shaka teardown; reading
  // through a ref lets the user fix a typo without re-loading the channel.
  const streamProxyRef = useRef<StreamProxyOption | null>(streamProxy);
  useEffect(() => {
    streamProxyRef.current = streamProxy;
  }, [streamProxy]);

  const [status, setStatus] = useState<ShakaStatus>('idle');
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<ShakaError | null>(null);
  const [recoverableError, setRecoverableError] = useState<ShakaError | null>(
    null
  );
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);
  const [abrEnabled, setAbrEnabledState] = useState<boolean>(true);
  const [media, setMedia] = useState<ShakaMedia>(DEFAULT_MEDIA);

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

  /**
   * Surface a recoverable Shaka error without touching `error` / `status` /
   * `onError`. Used for segment-level failures (HTTP 403/404 on a single
   * .ts/.m4s, transient network blips) that Shaka retries internally — the
   * stream keeps playing, so the big error chrome would be misleading.
   */
  const reportRecoverable = useCallback((err: ShakaError) => {
    setRecoverableError(err);
  }, []);

  /**
   * Translate any thrown / event-dispatched value into a `ShakaError`.
   *
   * `shaka.util.Error` is NOT a real `Error` subclass — it has `code`,
   * `category`, `data` (URL / HTTP status / details), `severity`, but no
   * `.message`. Falling through to `'Failed to load'` for those was hiding
   * the real reason (CORS, 403, unsupported manifest, …).
   */
  const toShakaError = useCallback((value: unknown): ShakaError => {
    if (value && typeof value === 'object') {
      const v = value as {
        code?: number;
        category?: number;
        severity?: number;
        data?: unknown;
        message?: unknown;
      };
      if (typeof v.code === 'number') {
        const name = SHAKA_ERROR_CODE_NAMES[v.code];
        const dataSummary = summarizeShakaErrorData(v.data);
        const parts = [
          `Playback error ${v.code}${name ? ` \u2014 ${name}` : ''}`,
        ];
        if (dataSummary) parts.push(dataSummary);
        return {
          code: v.code,
          category: v.category,
          severity: typeof v.severity === 'number' ? v.severity : undefined,
          data: v.data,
          message: parts.join(' \u2014 '),
          cause: value,
        };
      }
      if (typeof v.message === 'string') {
        return { message: v.message, cause: value };
      }
    }
    if (value instanceof Error) {
      return { message: value.message || 'Failed to load', cause: value };
    }
    return { message: 'Failed to load', cause: value };
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
        width: typeof t.width === 'number' ? t.width : undefined,
        height: typeof t.height === 'number' ? t.height : undefined,
        frameRate:
          typeof t.frameRate === 'number' ? t.frameRate : undefined,
        // Shaka exposes split codecs as `videoCodec`/`audioCodec` and a
        // joint `codecs`; prefer the joint string for display.
        codecs:
          typeof (t as { codecs?: unknown }).codecs === 'string'
            ? (t as { codecs: string }).codecs
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
      setRecoverableError(null);
      return;
    }

    const autoplayAbort = new AbortController();
    let cancelled = false;
    // Bump on every reload so retry() can supersede an in-flight load.
    const token = ++reloadTokenRef.current;
    setStatus('loading');
    setError(null);
    setRecoverableError(null);

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

        // Configure for the typical IPTV / Xtream live HLS stream:
        // - Most providers ship single-variant manifests with NO BANDWIDTH
        //   declaration, so Shaka's default ABR estimate of 500 kbps causes
        //   it to under-allocate buffer + render late. Seeding 8 Mbps gives
        //   it room for 1080p without affecting real ABR streams (the first
        //   real measurement overrides the seed).
        // - bufferingGoal 30s (default 10s) absorbs the segment-level 403/404
        //   blips this category of stream is famous for without restalling.
        // - rebufferingGoal 4s (default 2s) waits for a healthier prefill
        //   before resuming, which empirically reduces the "play / stall /
        //   play" oscillation on flaky upstream.
        try {
          (player as { configure?: (c: unknown) => void }).configure?.({
            abr: {
              defaultBandwidthEstimate: 8_000_000,
            },
            streaming: {
              bufferingGoal: 30,
              rebufferingGoal: 4,
              // Keep ~30s behind the live edge so brief network blips
              // don't drop us out of the seek window. Default 30s; we
              // pin explicitly so a Shaka upgrade can't quietly change
              // playback feel.
              bufferBehind: 30,
              // IPTV manifests sometimes advertise broken text streams; do
              // not fail the whole asset when one subtitle rendition errors.
              ignoreTextStreamFailures: true,
            },
          });
        } catch {
          // Older Shaka builds may reject unknown keys; ignore — defaults
          // still produce a working player, just less tuned.
        }

        // Install the stream-proxy request filter (if configured) BEFORE
        // calling player.load(). Shaka runs registered filters on every
        // outbound request including the initial manifest fetch, so the
        // user-supplied `streamUrl` is rewritten transparently.
        //
        // The filter is installed unconditionally — it reads the current
        // proxy config through `streamProxyRef`, which lets the user
        // change settings without re-mounting the player. When no proxy
        // is configured the filter is a no-op.
        const networking = player.getNetworkingEngine();
        const REQUEST_TYPE = shakaNs.net?.NetworkingEngine?.RequestType;
        if (networking && REQUEST_TYPE) {
          networking.registerRequestFilter(async (type, request) => {
            // Only rewrite playback traffic. License/timing/app requests
            // (DRM, time sync, custom payloads) are left alone.
            if (
              type !== REQUEST_TYPE.MANIFEST &&
              type !== REQUEST_TYPE.SEGMENT
            ) {
              return;
            }
            const proxy = streamProxyRef.current;
            if (!proxy || !proxy.baseUrl || !proxy.secret) return;
            // Rewrite each candidate URI in place. Shaka's `request.uris`
            // is mutable; we replace each entry with its signed proxy
            // URL. URLs already pointing at the proxy (e.g. segments in
            // a manifest the proxy itself just rewrote) are left alone
            // to avoid double-signing.
            const proxyOrigin = safeOrigin(proxy.baseUrl);
            for (let i = 0; i < request.uris.length; i += 1) {
              const original = request.uris[i];
              const upstream = safeOrigin(original);
              // Skip non-http(s) and already-proxied URLs.
              if (!upstream) continue;
              if (proxyOrigin && upstream === proxyOrigin) continue;
              request.uris[i] = await buildSignedProxyUrl({
                baseUrl: proxy.baseUrl,
                secret: proxy.secret,
                upstreamUrl: original,
                userAgent: proxy.userAgent,
              });
            }
          });
        }

        const onShakaError = (event: shaka.util.Error | Event) => {
          // Shaka dispatches its own `Error` event objects; their `detail`
          // field is the actual `shaka.util.Error`.
          const detail = (event as { detail?: shaka.util.Error }).detail;
          const err = detail ?? event;
          const shakaError = toShakaError(err);
          // Severity 1 = RECOVERABLE (Shaka retried; playback continues),
          // 2 = CRITICAL (Shaka gave up). The Severity enum lives at
          // `shaka.util.Error.Severity` and may be missing on some builds /
          // mocks — when absent, fall back to the safe assumption that the
          // error is critical.
          const severity = shakaError.severity;
          if (severity === 1) {
            reportRecoverable(shakaError);
          } else {
            reportError(shakaError);
          }
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
        // Reset ABR snapshot to "on" on each fresh load. The user's last
        // manual selection from the previous channel should not silently
        // pin the new channel to a non-existent variant id.
        setAbrEnabledState(true);
        // DEV-only diagnostic: dump the variant table so a developer can
        // see exactly what Shaka is being offered for any given channel.
        // This is the cheapest way to answer "does this stream actually
        // expose multiple bitrates?" without pulling Shaka's debug build.
        // Skipped under vitest (`import.meta.env.MODE === 'test'`) to keep
        // test output readable.
        if (import.meta.env?.DEV && import.meta.env?.MODE !== 'test') {
          try {
            const raw = player.getVariantTracks();
             
            console.groupCollapsed(
              `[useShakaPlayer] variants for ${streamUrl} (${raw.length})`
            );
             
            console.table(
              raw.map((t) => ({
                id: t.id,
                active: t.active,
                width: (t as { width?: number }).width ?? null,
                height: (t as { height?: number }).height ?? null,
                fps: (t as { frameRate?: number }).frameRate ?? null,
                kbps:
                  typeof t.bandwidth === 'number'
                    ? Math.round(t.bandwidth / 1000)
                    : null,
                lang: t.language ?? '',
                codecs:
                  (t as { codecs?: string }).codecs ??
                  `${(t as { videoCodec?: string }).videoCodec ?? '?'}/${(t as { audioCodec?: string }).audioCodec ?? '?'}`,
              }))
            );
             
            console.groupEnd();
          } catch {
            // Diagnostic only — never let logging break playback.
          }
        }
        setStatus('playing');
        scheduleAutoplayAfterLoad(
          video,
          autoPlay,
          () => cancelled || token !== reloadTokenRef.current,
          autoplayAbort.signal
        );
      } catch (cause) {
        if (cancelled || token !== reloadTokenRef.current) return;
        reportError(toShakaError(cause));
      }
    })();

    return () => {
      cancelled = true;
      autoplayAbort.abort();
      void destroy();
    };
  }, [videoRef, streamUrl, autoPlay, destroy, refreshTracks, reportError, toShakaError]);

  const selectTrack = useCallback((track: ShakaTrack) => {
    const player = playerRef.current;
    if (!player) return;
    if (track.type === 'variant') {
      const variant = player
        .getVariantTracks()
        .find((t) => t.id === track.id);
      if (variant) {
        // Manual variant pick = "stick to this quality". If we left ABR on
        // it would immediately switch back based on its bandwidth estimate
        // and the menu would feel broken. Re-enable via setAbrEnabled.
        try {
          (player as { configure?: (c: unknown) => void }).configure?.({
            abr: { enabled: false },
          });
          setAbrEnabledState(false);
        } catch {
          // Older Shaka builds may not accept this shape; the explicit
          // selectVariantTrack call below is still the source of truth.
        }
        player.selectVariantTrack(variant, /*clearBuffer*/ true);
        // Reflect the new active variant immediately — Shaka will fire
        // `adaptation` later, but the menu should highlight the pick now.
        refreshTracks();
      }
    } else {
      const text = player.getTextTracks().find((t) => t.id === track.id);
      if (text) player.selectTextTrack(text);
    }
  }, [refreshTracks]);

  const clearTextTrack = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      (
        player as { selectTextTrack: (t: null) => void }
      ).selectTextTrack(null);
    } catch {
      // Best-effort — older Shaka typings differ; playback continues.
    }
    refreshTracks();
  }, [refreshTracks]);

  const setAbrEnabled = useCallback((enabled: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      (player as { configure?: (c: unknown) => void }).configure?.({
        abr: { enabled },
      });
    } catch {
      // Best-effort; older builds without configure() are pre-v3 and we
      // do not target them.
    }
    setAbrEnabledState(enabled);
  }, []);

  const retry = useCallback(() => {
    if (!streamUrl) return;
    // Bumping the token causes the next render's effect to start fresh;
    // we trigger that by re-setting status, which is a benign state update.
    reloadTokenRef.current++;
    setStatus('loading');
    setError(null);
    setRecoverableError(null);
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
        const v = videoRef.current;
        if (!v || !autoPlay) return;
        void v.play().catch((err: unknown) => {
          if (isNotAllowedError(err) && !v.muted) {
            v.muted = true;
            void v.play().catch(() => undefined);
          }
        });
      })
      .catch((cause) => {
        reportError(toShakaError(cause));
      });
  }, [streamUrl, videoRef, refreshTracks, reportError, toShakaError, autoPlay]);

  // ---------------------------------------------------------------------------
  // Media-element state subscription (drives custom control overlays).
  //
  // We mirror a small slice of the `<video>` element's state into React so
  // controls can render reactively without polling. The events we listen to
  // cover everything the overlay needs without firing more than necessary
  // (`timeupdate` is intentionally throttled by the browser to ~4Hz).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      // `seekable` length 0 means live HLS / pre-metadata; otherwise the
      // stream advertises a window we can scrub through.
      const seekable = video.seekable && video.seekable.length > 0
        && Number.isFinite(video.duration);
      setMedia({
        paused: video.paused,
        currentTime: video.currentTime,
        duration: video.duration,
        seekable: Boolean(seekable),
        volume: video.volume,
        muted: video.muted,
      });
    };

    const events: (keyof HTMLMediaElementEventMap)[] = [
      'play', 'pause', 'timeupdate', 'durationchange',
      'volumechange', 'seeking', 'seeked', 'loadedmetadata', 'emptied',
    ];
    for (const ev of events) video.addEventListener(ev, sync);
    sync();
    return () => {
      for (const ev of events) video.removeEventListener(ev, sync);
    };
  }, [videoRef]);

  // Clear the recoverable error indicator the moment Shaka resumes playback.
  // The browser fires `playing` after a stall has been resolved, which is
  // the cleanest signal that the underlying transient (segment 403, network
  // blip) has been worked around. Critical errors do not fire `playing`.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => setRecoverableError(null);
    video.addEventListener('playing', onPlaying);
    return () => video.removeEventListener('playing', onPlaying);
  }, [videoRef]);

  // ---------------------------------------------------------------------------
  // Imperative actions for control overlays. These are thin wrappers around
  // the `<video>` element; we expose them from the hook so the overlay does
  // not need its own ref to the same element.
  // ---------------------------------------------------------------------------
  const play = useCallback(() => {
    videoRef.current?.play().catch(() => undefined);
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration;
    const clamped = Number.isFinite(dur)
      ? Math.max(0, Math.min(seconds, dur))
      : Math.max(0, seconds);
    video.currentTime = clamped;
  }, [videoRef]);

  const setVolume = useCallback((volume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, volume));
    // Setting volume above 0 implicitly unmutes — matches the native
    // <video> control behaviour and prevents the slider feeling broken.
    if (volume > 0 && video.muted) video.muted = false;
  }, [videoRef]);

  const setMuted = useCallback((muted: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Prefer the parent (so overlays + video go fullscreen together);
    // fall back to the element if we don't have one (shouldn't happen).
    const target: Element = video.parentElement ?? video;
    const doc = video.ownerDocument as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const el = target as Element & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const inFullscreen = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    if (inFullscreen) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  }, [videoRef]);

  return {
    status,
    buffering,
    error,
    recoverableError,
    tracks,
    abrEnabled,
    media,
    selectTrack,
    clearTextTrack,
    setAbrEnabled,
    retry,
    destroy,
    play,
    pause,
    seek,
    setVolume,
    setMuted,
    toggleFullscreen,
  };
}

/**
 * Best-effort origin extraction for URL gating in the proxy request
 * filter. Returns `null` for non-http(s) schemes or unparseable inputs
 * — both of which should bypass proxy rewriting (data: URIs in
 * manifests, blob: URLs Shaka may emit for MSE source buffers).
 */
function safeOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Friendly names for the most common `shaka.util.Error.Code` values users
 * actually see in the wild. We don't ship the full table — Shaka has
 * hundreds — but covering the realistic IPTV failure modes makes the
 * inline error overlay actionable instead of showing a bare number.
 *
 * Keep in sync with shaka-player's Error.Code enum if you bump versions.
 */
const SHAKA_ERROR_CODE_NAMES: Record<number, string> = {
  // Network category (1xxx)
  1000: 'UNSUPPORTED_SCHEME',
  1001: 'BAD_HTTP_STATUS',
  1002: 'HTTP_ERROR',
  1003: 'TIMEOUT',
  1004: 'MALFORMED_DATA_URI',
  1005: 'REQUEST_FILTER_ERROR',
  1006: 'RESPONSE_FILTER_ERROR',
  1007: 'MALFORMED_TEST_URI',
  // Manifest / parser (4xxx)
  4001: 'UNABLE_TO_GUESS_MANIFEST_TYPE',
  4002: 'DASH_INVALID_XML',
  4003: 'DASH_NO_INIT_DATA',
  4032: 'HLS_PLAYLIST_HEADER_MISSING',
  4034: 'HLS_VARIABLE_NOT_FOUND',
  4036: 'HLS_COULD_NOT_GUESS_CODECS',
  // Media (3xxx)
  3016: 'VIDEO_ERROR',
  3017: 'QUOTA_EXCEEDED_ERROR',
  // Streaming (3xxx)
  3022: 'STREAMING_ENGINE_STARTUP_INVALID_STATE',
};

/**
 * Pull the bits out of `shaka.util.Error.data` that are useful in an
 * error overlay. Shaka stuffs a tuple `[url, status, body]` into network
 * errors, while manifest errors might just have a code or a string.
 */
function summarizeShakaErrorData(data: unknown): string | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const [first, second] = data;
  if (typeof first === 'string' && /^https?:/.test(first)) {
    // Network error: [url, status, ...]
    if (typeof second === 'number') return `HTTP ${second} \u2014 ${first}`;
    return first;
  }
  // Fall back to a JSON-ish summary for anything else.
  try {
    return JSON.stringify(data).slice(0, 240);
  } catch {
    return null;
  }
}
