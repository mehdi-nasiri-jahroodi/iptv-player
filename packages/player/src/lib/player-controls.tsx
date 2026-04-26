import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pause,
  Play,
  Volume,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { UseShakaPlayerResult } from './use-shaka-player.js';

export interface PlayerControlsProps {
  /** Returned object from `useShakaPlayer` (or the `<Player>` render-prop). */
  api: UseShakaPlayerResult;
  /**
   * When `true` the controls stay visible regardless of pointer activity.
   * Default `false`: visible on hover/focus + first 3s of playback, then
   * fade out while playing.
   */
  alwaysVisible?: boolean;
  /**
   * Idle ms before the controls auto-hide. Defaults to 3000. Has no effect
   * when {@link alwaysVisible} is `true`, while paused, while buffering, or
   * while any control inside the bar has focus.
   */
  idleHideMs?: number;
}

/**
 * Custom Lumina-themed playback controls. Drop-in render-prop child for
 * `<Player>` — the consumer passes the `api` from `useShakaPlayer` (or just
 * spreads the render-prop arg) and we own all the chrome.
 *
 * Why not native HTML5 controls?
 * - They don't theme; we get the browser's grey gradient over Lumina.
 * - Live HLS exposes a useless seek bar; native UI has no concept of "live".
 * - We'll need D-pad (TV) focus handling later — this gives us a single
 *   place to wire that.
 *
 * D-pad / focus model:
 * - Each button is a focusable `<button>` so Norigin can pick it up via
 *   the surrounding `useFocusable` boundary the consumer mounts (e.g. the
 *   `LivePlayerPane` cell). Tab order is left→right inside the bar.
 * - Tracks picker is intentionally NOT here yet — `useShakaPlayer` already
 *   exposes `tracks` / `selectTrack`, and a Phase 4 picker overlay will
 *   render alongside this component.
 */
export function PlayerControls({
  api,
  alwaysVisible = false,
  idleHideMs = 3000,
}: PlayerControlsProps): ReactNode {
  const { media, status, buffering } = api;
  const [pointerActiveAt, setPointerActiveAt] = useState<number>(() => Date.now());
  const [hasFocusInside, setHasFocusInside] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pulse `pointerActiveAt` whenever the user moves the mouse over the
  // wrapping frame, so a quick hover resets the auto-hide timer.
  useEffect(() => {
    if (alwaysVisible) return;
    const frame = containerRef.current?.parentElement;
    if (!frame) return;
    const bump = () => setPointerActiveAt(Date.now());
    frame.addEventListener('pointermove', bump);
    frame.addEventListener('pointerdown', bump);
    return () => {
      frame.removeEventListener('pointermove', bump);
      frame.removeEventListener('pointerdown', bump);
    };
  }, [alwaysVisible]);

  // Re-render once after the idle window elapses so `visible` flips off.
  // We don't need a continuous ticker — pointer/focus events already trigger
  // re-renders, and the only state change is "pointer went idle past the
  // threshold".
  const [, setTick] = useState(0);
  useEffect(() => {
    if (alwaysVisible) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), idleHideMs);
    return () => window.clearTimeout(timer);
  }, [pointerActiveAt, alwaysVisible, idleHideMs]);

  const sinceIdle = Date.now() - pointerActiveAt;
  const visible =
    alwaysVisible
    || media.paused
    || buffering
    || status !== 'playing'
    || hasFocusInside
    || sinceIdle < idleHideMs;

  const togglePlay = () => {
    if (media.paused) api.play();
    else api.pause();
  };

  const toggleMute = () => api.setMuted(!media.muted);

  return (
    <div
      ref={containerRef}
      data-testid="player-controls"
      data-visible={visible}
      // Bottom-anchored bar; pointer-events disabled when invisible so the
      // user can click the video underneath.
      className={[
        'pointer-events-none absolute inset-x-0 bottom-0',
        'bg-gradient-to-t from-black/80 to-transparent',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      onFocusCapture={() => setHasFocusInside(true)}
      onBlurCapture={(e) => {
        // Only flip off when focus has actually left the bar.
        const next = e.relatedTarget as Node | null;
        if (!next || !containerRef.current?.contains(next)) {
          setHasFocusInside(false);
        }
      }}
    >
      <div
        className={[
          'pointer-events-auto flex items-center gap-3 px-3 pb-2 pt-8',
          'text-foreground',
        ].join(' ')}
      >
        <ControlButton
          label={media.paused ? 'Play' : 'Pause'}
          onClick={togglePlay}
          testid="player-controls-play"
        >
          {media.paused ? <Play size={18} /> : <Pause size={18} />}
        </ControlButton>

        <ControlButton
          label={media.muted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
          testid="player-controls-mute"
        >
          {media.muted || media.volume === 0 ? <VolumeX size={18} /> : <Volume size={18} />}
        </ControlButton>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={media.muted ? 0 : media.volume}
          onChange={(e) => api.setVolume(Number(e.target.value))}
          aria-label="Volume"
          data-testid="player-controls-volume"
          className="h-1 w-20 cursor-pointer accent-accent"
        />

        <TimeReadout media={media} />

        {media.seekable ? (
          <input
            type="range"
            min={0}
            max={Number.isFinite(media.duration) ? media.duration : 0}
            step={0.1}
            value={media.currentTime}
            onChange={(e) => api.seek(Number(e.target.value))}
            aria-label="Seek"
            data-testid="player-controls-scrubber"
            className="h-1 flex-1 cursor-pointer accent-accent"
          />
        ) : (
          <div
            className="flex-1 text-center text-xs uppercase tracking-wide text-foreground-muted"
            data-testid="player-controls-live-badge"
          >
            Live
          </div>
        )}

        <ControlButton
          label="Toggle fullscreen"
          onClick={api.toggleFullscreen}
          testid="player-controls-fullscreen"
        >
          <FullscreenIcon />
        </ControlButton>
      </div>
    </div>
  );
}

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testid?: string;
}

function ControlButton({ label, onClick, children, testid }: ControlButtonProps): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-testid={testid}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-md',
        'bg-surface/40 text-foreground hover:bg-surface/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'transition-colors',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * Renders the fullscreen icon, picking minimize when the document is
 * already in fullscreen. Recomputed on every paint via state since the
 * Fullscreen API doesn't dispatch events for *every* change reliably,
 * but does fire `fullscreenchange` on the document.
 */
function FullscreenIcon(): ReactNode {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return fs ? <Minimize2 size={18} /> : <Maximize2 size={18} />;
}

interface TimeReadoutProps {
  media: UseShakaPlayerResult['media'];
}

function TimeReadout({ media }: TimeReadoutProps): ReactNode {
  if (!media.seekable) return null;
  return (
    <div
      className="font-mono text-xs tabular-nums text-foreground-muted"
      data-testid="player-controls-time"
    >
      {formatTime(media.currentTime)} / {formatTime(media.duration)}
    </div>
  );
}

/** Format seconds as `m:ss` (or `h:mm:ss` when the video is over an hour). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
