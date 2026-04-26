import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
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
  // Track focus inside the bar by timestamp instead of a sticky boolean.
  // Reason: a clicked control (e.g. the Fullscreen button) keeps DOM focus
  // until something else takes it. With a boolean we'd treat that as
  // "user is interacting" forever and never hide the bar. Treating focus
  // like pointer activity — counted only when *recent* — lets D-pad/TV
  // users keep the bar open while navigating (each arrow keydown bumps
  // this) but lets a click-then-idle case fade out normally.
  const [focusActiveAt, setFocusActiveAt] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Re-render once after the idle window elapses so `visible` flips off.
  // We don't need a continuous ticker — pointer/focus events already trigger
  // re-renders, and the only state change is "pointer went idle past the
  // threshold".
  const [, setTick] = useState(0);
  useEffect(() => {
    if (alwaysVisible) return;
    const lastActivity = Math.max(pointerActiveAt, focusActiveAt);
    const elapsed = Date.now() - lastActivity;
    const remaining = Math.max(0, idleHideMs - elapsed);
    const timer = window.setTimeout(() => setTick((n) => n + 1), remaining);
    return () => window.clearTimeout(timer);
  }, [pointerActiveAt, focusActiveAt, alwaysVisible, idleHideMs]);

  const bump = () => setPointerActiveAt(Date.now());
  const bumpFocus = () => setFocusActiveAt(Date.now());

  // Track last cursor coords so we only treat a `mousemove` as "activity"
  // when the cursor actually moved. Browsers (esp. on fullscreen enter,
  // and on some macOS configurations with trackpad jitter) fire
  // `mousemove` even when the user is holding still, which would keep the
  // bar visible forever. We require a >2px delta to count.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const handleMouseMove = (e: ReactMouseEvent) => {
    const last = lastPointer.current;
    if (!last || Math.abs(e.clientX - last.x) > 2 || Math.abs(e.clientY - last.y) > 2) {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      bump();
    }
  };

  const sinceIdle = Date.now() - Math.max(pointerActiveAt, focusActiveAt);
  const visible =
    alwaysVisible
    || media.paused
    || buffering
    || status !== 'playing'
    || sinceIdle < idleHideMs;

  const togglePlay = () => {
    if (media.paused) api.play();
    else api.pause();
  };

  const toggleMute = () => api.setMuted(!media.muted);

  return (
    // Full-frame overlay sits on top of the <video>. We listen to mouse
    // events here directly so we don't have to chase ancestor refs (which
    // get stale across fullscreen enter/exit, HMR, and re-parenting). The
    // overlay is `pointer-events-none` so clicks pass through to the
    // video, but mousemove still fires while the cursor is over it
    // because pointer-events doesn't gate `mousemove` listeners on the
    // element itself \u2014 wait, it actually does. So instead, we keep
    // `pointer-events-auto` on the overlay BUT forward clicks via
    // onClick to api.play/pause when the user clicks empty space (i.e.
    // not on a child control).
    <div
      ref={containerRef}
      data-testid="player-controls"
      data-visible={visible}
      className="absolute inset-0"
      style={{ cursor: visible ? 'default' : 'none' }}
      onMouseMove={handleMouseMove}
      onMouseEnter={bump}
      onMouseLeave={() => {
        // Force the timer to re-evaluate so the bar fades right away
        // when the cursor leaves the player.
        setPointerActiveAt(Date.now() - idleHideMs);
      }}
      onClick={(e) => {
        // Click on empty area (not a button / range) toggles play. Lets
        // the user resume from anywhere in the frame.
        if (e.target === e.currentTarget) togglePlay();
      }}
      onFocusCapture={bumpFocus}
      onKeyDownCapture={bumpFocus}
    >
      {/* The bar itself \u2014 absolute child of the overlay so it can fade
          independently and only the bottom strip catches pointer events
          on the controls. */}
      <div
        className={[
          'absolute inset-x-0 bottom-0',
          'bg-gradient-to-t from-black/80 to-transparent',
          'transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0',
          // When hidden, take the bar out of the click path so the empty-
          // area click handler above can still toggle play.
          visible ? '' : 'pointer-events-none',
        ].join(' ')}
      >
      <div
        className={[
          'pointer-events-auto flex w-full items-center gap-3 px-3 pb-2 pt-8',
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
            className="ml-auto text-xs font-semibold uppercase tracking-wider text-danger"
            data-testid="player-controls-live-badge"
          >
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger align-middle" />
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
