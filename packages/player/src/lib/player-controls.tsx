import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  Pause,
  Play,
  Volume,
  VolumeX,
  Maximize2,
  Minimize2,
  Settings,
} from 'lucide-react';
import type { ShakaTrack, UseShakaPlayerResult } from './use-shaka-player.js';

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
  /**
   * Optional trailing content rendered at the end of the controls bar
   * (before fullscreen). Follows the same auto-hide behaviour as the
   * built-in controls.
   */
  trailing?: ReactNode;
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
 * - Audio / text tracks: **Tracks** opens a popover listing Shaka variants
 *   and captions; each row calls `selectTrack`.
 */
export function PlayerControls({
  api,
  alwaysVisible = false,
  idleHideMs = 3000,
  trailing,
}: PlayerControlsProps): ReactNode {
  const { media, status, buffering, tracks, selectTrack, clearTextTrack, abrEnabled, setAbrEnabled } =
    api;
  const [tracksMenuOpen, setTracksMenuOpen] = useState(false);
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

  const hasTrackChoices = tracks.length > 0;
  const variants = tracks.filter((t) => t.type === 'variant');
  const texts = tracks.filter((t) => t.type === 'text');

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
      className="absolute inset-0 z-10"
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

        {hasTrackChoices ? (
          <div className="relative shrink-0">
            <ControlButton
              label="Quality, audio and subtitles"
              onClick={() => setTracksMenuOpen((o) => !o)}
              testid="player-controls-tracks-toggle"
            >
              <Settings size={18} />
            </ControlButton>
            {tracksMenuOpen ? (
              <TracksMenu
                variants={variants}
                texts={texts}
                abrEnabled={abrEnabled}
                onPick={(t) => {
                  selectTrack(t);
                  setTracksMenuOpen(false);
                }}
                onClearText={() => {
                  clearTextTrack();
                  setTracksMenuOpen(false);
                }}
                onPickAuto={() => {
                  setAbrEnabled(true);
                  setTracksMenuOpen(false);
                }}
                onClose={() => setTracksMenuOpen(false)}
              />
            ) : null}
          </div>
        ) : null}

        {trailing}

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

function TracksMenu({
  variants,
  texts,
  abrEnabled,
  onPick,
  onClearText,
  onPickAuto,
  onClose,
}: {
  variants: ShakaTrack[];
  texts: ShakaTrack[];
  abrEnabled: boolean;
  onPick: (t: ShakaTrack) => void;
  onClearText: () => void;
  onPickAuto: () => void;
  onClose: () => void;
}): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const el = panelRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  // Split variants into "has a video resolution" vs "audio-only". HLS
  // typically packs each (video × audio) combination as a single variant,
  // so the same row is doing double duty as a quality picker AND a
  // language picker. We surface video first because that's the user
  // intent 99% of the time ("why does this look soft?").
  const videoVariants = variants.filter(
    (t) => typeof t.height === 'number' && t.height > 0
  );
  const audioOnly = variants.filter(
    (t) => !(typeof t.height === 'number' && t.height > 0)
  );

  const variantRow = (t: ShakaTrack, i: number) => {
    const primary = formatVariantPrimary(t);
    const secondary = formatVariantSecondary(t);
    // ABR-enabled + this row is the one Shaka currently picked = "auto"
    // is highlighted, so the active-row indicator should be muted to
    // avoid two checkmarks.
    const showActiveDot = t.active && !abrEnabled;
    return (
      <button
        key={`${t.type}-${t.id}-${i}`}
        type="button"
        onClick={() => onPick(t)}
        data-testid={`player-controls-track-${t.type}-${t.id}`}
        className={[
          'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
          showActiveDot
            ? 'bg-accent/20 font-medium text-foreground'
            : 'text-foreground-muted hover:bg-surface/80 hover:text-foreground',
        ].join(' ')}
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="text-foreground">{primary}</span>
          {secondary ? (
            <span className="ml-1 text-foreground-muted">· {secondary}</span>
          ) : null}
        </span>
        {showActiveDot ? (
          <span className="shrink-0 text-foreground-muted" aria-hidden>
            ●
          </span>
        ) : null}
      </button>
    );
  };

  const textRow = (t: ShakaTrack, i: number) => {
    const label =
      (t.label && t.label.trim()) ||
      (t.language && t.language.trim()) ||
      'Captions';
    return (
      <button
        key={`text-${t.id}-${i}`}
        type="button"
        onClick={() => onPick(t)}
        data-testid={`player-controls-track-text-${t.id}`}
        className={[
          'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
          t.active
            ? 'bg-accent/20 font-medium text-foreground'
            : 'text-foreground-muted hover:bg-surface/80 hover:text-foreground',
        ].join(' ')}
      >
        <span className="min-w-0 truncate">{label}</span>
        {t.active ? (
          <span className="shrink-0 text-foreground-muted" aria-hidden>
            ●
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Tracks"
      data-testid="player-controls-tracks-menu"
      className="absolute bottom-full right-0 z-20 mb-2 max-h-72 min-w-[240px] overflow-y-auto rounded-md border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      {videoVariants.length > 0 ? (
        <>
          <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            Video quality
          </div>
          <button
            type="button"
            onClick={onPickAuto}
            data-testid="player-controls-track-auto"
            className={[
              'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
              abrEnabled
                ? 'bg-accent/20 font-medium text-foreground'
                : 'text-foreground-muted hover:bg-surface/80 hover:text-foreground',
            ].join(' ')}
          >
            <span className="min-w-0 truncate">
              Auto
              <span className="ml-1 text-foreground-muted">· adaptive</span>
            </span>
            {abrEnabled ? (
              <span className="shrink-0 text-foreground-muted" aria-hidden>
                ●
              </span>
            ) : null}
          </button>
          {videoVariants.map((t, i) => variantRow(t, i))}
        </>
      ) : null}

      {audioOnly.length > 0 ? (
        <>
          <div
            className={[
              'px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted',
              videoVariants.length > 0 ? 'mt-1 border-t border-border/60' : '',
            ].join(' ')}
          >
            Audio
          </div>
          {audioOnly.map((t, i) => variantRow(t, i + 1000))}
        </>
      ) : null}

      {texts.length > 0 ? (
        <>
          <div className="mt-1 border-t border-border/60 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            Subtitles
          </div>
          <button
            type="button"
            onClick={() => onClearText()}
            data-testid="player-controls-track-text-off"
            className={[
              'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
              !texts.some((t) => t.active)
                ? 'bg-accent/20 font-medium text-foreground'
                : 'text-foreground-muted hover:bg-surface/80 hover:text-foreground',
            ].join(' ')}
          >
            <span className="min-w-0 truncate">Off</span>
            {!texts.some((t) => t.active) ? (
              <span className="shrink-0 text-foreground-muted" aria-hidden>
                ●
              </span>
            ) : null}
          </button>
          {texts.map((t, i) => textRow(t, i))}
        </>
      ) : null}
    </div>
  );
}

/**
 * Build the prominent left-column label for a variant row. Resolution
 * wins when present (`1080p`, `720p60`); otherwise we fall back to the
 * provider's label, then language, then a generic "Audio" tag.
 */
function formatVariantPrimary(t: ShakaTrack): string {
  if (typeof t.height === 'number' && t.height > 0) {
    const fps =
      typeof t.frameRate === 'number' && t.frameRate > 30
        ? Math.round(t.frameRate).toString()
        : '';
    return `${t.height}p${fps}`;
  }
  if (t.label && t.label.trim()) return t.label.trim();
  if (t.language && t.language.trim()) return t.language.trim();
  return 'Audio';
}

/**
 * Right-column muted detail: language + bandwidth, deduped against the
 * primary so we never render `1080p · 1080p · 5000 kbps`.
 */
function formatVariantSecondary(t: ShakaTrack): string {
  const parts: string[] = [];
  if (t.language && t.language.trim()) parts.push(t.language.trim());
  if (typeof t.bandwidth === 'number') parts.push(`${t.bandwidth} kbps`);
  return parts.join(' · ');
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
