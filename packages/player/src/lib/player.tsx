import { useRef } from 'react';
import {
  useShakaPlayer,
  type ExternalTextTrack,
  type ShakaError,
  type ShakaTrack,
  type ShakaStatus,
  type StreamProxyOption,
  type UseShakaPlayerResult,
} from './use-shaka-player.js';

export interface PlayerProps {
  /** HLS / DASH / progressive URL to play. `null` shows an idle player. */
  src: string | null;
  /**
   * Forwarded to the `<video>` element. Consumer styles the frame; we own
   * the element itself so the Shaka instance can attach.
   */
  className?: string;
  /** Fired on every error transition. */
  onError?: (error: ShakaError) => void;
  /**
   * Fired whenever the playback status changes. Useful for surfacing a
   * loading spinner in the parent without re-deriving from props.
   */
  onStatusChange?: (status: ShakaStatus) => void;
  /** Default `true`. Disable when the parent wants explicit Play UI. */
  autoPlay?: boolean;
  /** Standard HTML attributes the parent may want to forward. */
  controls?: boolean;
  muted?: boolean;
  poster?: string;
  /**
   * Route MANIFEST + SEGMENT requests through a user-run web proxy.
   * See {@link useShakaPlayer}'s `streamProxy` option for the full
   * contract; the web app passes this from its settings store.
   */
  streamProxy?: StreamProxyOption | null;
  /**
   * External subtitle tracks to sideload (SRT/VTT files from the Xtream
   * `get_vod_info` or `get_series_info` response). Forwarded to
   * `useShakaPlayer`'s `externalTextTracks` option.
   */
  externalTextTracks?: ExternalTextTrack[];
  /**
   * Override duration for transcoded streams (from ffprobe).
   * See {@link useShakaPlayer}'s `knownDuration` option.
   */
  knownDuration?: number | null;
  /**
   * Custom seek handler for transcoded streams.
   * See {@link useShakaPlayer}'s `onSeekOverride` option.
   */
  onSeekOverride?: (seconds: number) => void;
  /** Render-prop hook for custom overlay (loading, error, track picker). */
  children?: (api: UseShakaPlayerResult) => React.ReactNode;
}

/**
 * Headless video player. Owns the `<video>` element + the Shaka instance.
 *
 * No chrome, no styling beyond `width: 100%` (so the consumer can fit it
 * into any flex/grid cell). Pass `children` as a render-prop to draw
 * overlays bound to playback state.
 */
export function Player(props: PlayerProps) {
  const {
    src,
    className,
    onError,
    onStatusChange,
    autoPlay = true,
    controls = false,
    muted = false,
    poster,
    streamProxy = null,
    externalTextTracks,
    knownDuration,
    onSeekOverride,
    children,
  } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const api = useShakaPlayer(videoRef, src, { onError, autoPlay, streamProxy, externalTextTracks, knownDuration, onSeekOverride });

  // Surface status changes via callback if requested.
  if (onStatusChange) {
    // Capture in a ref to fire only on transition; using a tiny inline
    // memo via `useEffect` would also work, but keeping this leaf-light.
    statusReporter(api.status, onStatusChange);
  }

  return (
    // `relative` so absolutely-positioned overlays in `children` (the
    // PlayerControls bar, error banner, etc.) anchor to the player frame
    // itself \u2014 not to whatever ancestor happens to have `position: relative`.
    // Without this the bar would render below the video and span the wrong
    // width because `absolute inset-x-0 bottom-0` walks up the DOM until it
    // finds a positioned container.
    <div
      className={`relative ${className ?? ''}`.trim()}
      data-player-status={api.status}
    >
      <video
        ref={videoRef}
        controls={controls}
        muted={muted}
        poster={poster}
        playsInline
        className="w-full h-full bg-black"
      />
      {children?.(api)}
    </div>
  );
}

const lastStatusByCallback = new WeakMap<
  (s: ShakaStatus) => void,
  ShakaStatus
>();
function statusReporter(
  status: ShakaStatus,
  cb: (s: ShakaStatus) => void
): void {
  if (lastStatusByCallback.get(cb) !== status) {
    lastStatusByCallback.set(cb, status);
    cb(status);
  }
}

export type { ShakaError, ShakaTrack, ShakaStatus, UseShakaPlayerResult };
