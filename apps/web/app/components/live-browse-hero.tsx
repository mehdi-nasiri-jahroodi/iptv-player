import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Channel, EpgGuide } from 'core';
import {
  Player,
  PlayerControls,
  PlayerErrorOverlay,
  type ShakaError,
  type StreamProxyOption,
  type UseShakaPlayerResult,
} from 'player';
import { Button, Carousel } from 'ui';
import { formatNowNextLine } from '../lib/epg-display';
import { inferStreamQualityHints } from '../lib/live-channel-badges';

/** Match {@link PlayerControls} default so title strip hides with the bar. */
const CHROME_IDLE_MS = 3000;

function LiveHeroMetadataOverlay({
  api,
  shellRef,
  channel,
  qualityHints,
  nowNext,
}: {
  api: UseShakaPlayerResult;
  shellRef: RefObject<HTMLElement | null>;
  channel: Channel;
  qualityHints: string[];
  nowNext: string | null;
}) {
  const { media, status, buffering } = api;
  const [pointerActiveAt, setPointerActiveAt] = useState(() => Date.now());
  const [focusActiveAt, setFocusActiveAt] = useState(0);
  const [, setTick] = useState(0);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setPointerActiveAt(Date.now());
    lastPointer.current = null;
  }, [channel.id]);

  useEffect(() => {
    const lastActivity = Math.max(pointerActiveAt, focusActiveAt);
    const elapsed = Date.now() - lastActivity;
    const remaining = Math.max(0, CHROME_IDLE_MS - elapsed);
    const timer = window.setTimeout(() => setTick((n) => n + 1), remaining);
    return () => window.clearTimeout(timer);
  }, [pointerActiveAt, focusActiveAt]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const bump = () => setPointerActiveAt(Date.now());
    const bumpFocus = () => setFocusActiveAt(Date.now());

    const onMove = (e: MouseEvent) => {
      if (!shell.contains(e.target as Node)) return;
      const lp = lastPointer.current;
      if (!lp || Math.abs(e.clientX - lp.x) > 2 || Math.abs(e.clientY - lp.y) > 2) {
        lastPointer.current = { x: e.clientX, y: e.clientY };
        bump();
      }
    };

    const onFocusIn = () => bumpFocus();
    const onEnter = () => bump();
    const onLeave = () => setPointerActiveAt(Date.now() - CHROME_IDLE_MS);

    shell.addEventListener('mousemove', onMove, true);
    shell.addEventListener('focusin', onFocusIn, true);
    shell.addEventListener('mouseenter', onEnter);
    shell.addEventListener('mouseleave', onLeave);
    return () => {
      shell.removeEventListener('mousemove', onMove, true);
      shell.removeEventListener('focusin', onFocusIn, true);
      shell.removeEventListener('mouseenter', onEnter);
      shell.removeEventListener('mouseleave', onLeave);
    };
  }, [shellRef]);

  const sinceIdle = Date.now() - Math.max(pointerActiveAt, focusActiveAt);
  const visible =
    media.paused || buffering || status !== 'playing' || sinceIdle < CHROME_IDLE_MS;

  return (
    <div
      className={[
        'pointer-events-none absolute inset-x-0 top-0 z-[9] max-h-[48%] bg-gradient-to-b from-black/82 via-black/45 to-transparent px-4 pb-16 pt-3 transition-opacity duration-200 md:px-5 md:pt-4',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      aria-hidden={!visible}
    >
      <div className="max-w-3xl space-y-2 drop-shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-lum-green-2/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
            Live
          </span>
          {qualityHints.map((q) => (
            <span
              key={q}
              className={
                q === '4K'
                  ? 'rounded-full bg-lum-saffron-2/25 px-2 py-0.5 text-[10px] font-semibold text-lum-saffron-2'
                  : 'rounded-full bg-accent/25 px-2 py-0.5 text-[10px] font-semibold text-accent'
              }
            >
              {q}
            </span>
          ))}
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{channel.name}</h2>
        {'groupTitle' in channel && channel.groupTitle ? (
          <p className="text-sm text-foreground-muted">{channel.groupTitle}</p>
        ) : null}
        {nowNext ? <p className="line-clamp-2 text-sm text-foreground/90">{nowNext}</p> : null}
      </div>
    </div>
  );
}

function RecentChannelCard({
  channel,
  selected,
  onPick,
}: {
  channel: Channel;
  selected: boolean;
  onPick: () => void;
}) {
  const logoUrl = 'logoUrl' in channel ? channel.logoUrl : undefined;
  const initial = channel.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      focusKey={`RECENT_${channel.id}`}
      onClick={onPick}
      className={[
        'h-auto min-h-0 w-[7.25rem] shrink-0 flex-col items-stretch justify-start gap-1.5 rounded-lg',
        'border border-border px-2 py-1.5 text-left shadow-sm',
        selected
          ? 'border-2 border-accent bg-accent/100'
          : 'border-2 border-transparent bg-surface-raised hover:border-accent/40',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="size-11 shrink-0 rounded-md bg-surface-raised object-contain p-0.5"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        ) : (
          <div
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/15 text-sm font-semibold text-accent"
          >
            {initial}
          </div>
        )}
        <span className="line-clamp-2 min-w-0 flex-1 text-[11px] font-medium leading-tight text-foreground">
          {channel.name}
        </span>
      </div>
    </Button>
  );
}

function LiveRecentStrip({
  recentChannels,
  currentChannelId,
  onPick,
}: {
  recentChannels: Channel[];
  currentChannelId: string | null | undefined;
  onPick: (c: Channel) => void;
}) {
  if (recentChannels.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-2 md:px-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
        Continue watching
      </p>
      <Carousel
        ariaLabel="Recently viewed channels"
        prevFocusKey="CONTINUE_CAROUSEL_PREV"
        nextFocusKey="CONTINUE_CAROUSEL_NEXT"
        gapClassName="gap-2"
        edgePaddingClassName="pl-8 pr-8"
      >
        {recentChannels.map((ch) => (
          <RecentChannelCard
            key={ch.id}
            channel={ch}
            selected={currentChannelId === ch.id}
            onPick={() => onPick(ch)}
          />
        ))}
      </Carousel>
    </div>
  );
}

export function LiveBrowseHero({
  channel,
  playbackProxy,
  streamProxyConfigured,
  recentChannels,
  onSelectRecent,
  guide,
  guideReady,
  nowMs,
}: {
  channel: Channel | null;
  playbackProxy: StreamProxyOption | null;
  streamProxyConfigured: boolean;
  recentChannels: Channel[];
  onSelectRecent: (c: Channel) => void;
  guide: EpgGuide | null;
  guideReady: boolean;
  nowMs: number;
}) {
  const streamUrl =
    channel && 'streamUrl' in channel ? channel.streamUrl : null;
  const [error, setError] = useState<ShakaError | null>(null);

  useEffect(() => {
    setError(null);
  }, [streamUrl]);

  const nowNext =
    channel?.type === 'live' && guideReady
      ? formatNowNextLine(guide, channel.tvgId, nowMs)
      : null;

  const qualityHints = useMemo(
    () => (channel ? inferStreamQualityHints(channel.name) : []),
    [channel]
  );

  const logoUrl = channel && 'logoUrl' in channel ? channel.logoUrl : undefined;
  const playerShellRef = useRef<HTMLDivElement>(null);

  return (
    <section
      aria-label="Channel preview"
      className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
      data-testid="live-browse-hero"
    >
      <div
        ref={playerShellRef}
        className="relative aspect-[21/9] min-h-[160px] max-h-[min(36vh,380px)] w-full shrink-0 bg-black md:aspect-[2.35/1]"
        data-testid="live-player"
      >
        {logoUrl ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 scale-110 bg-cover bg-center opacity-25 blur-2xl"
            style={{ backgroundImage: `url(${logoUrl})` }}
            aria-hidden
          />
        ) : (
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-accent/30 via-background to-surface"
            aria-hidden
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-black/50 to-transparent"
          aria-hidden
        />
        <Player
          src={streamUrl}
          onError={setError}
          streamProxy={playbackProxy}
          className="relative z-[1] h-full w-full"
        >
          {(api) => (
            <>
              {streamUrl ? <PlayerControls api={api} /> : null}
              {streamUrl && channel ? (
                <LiveHeroMetadataOverlay
                  api={api}
                  shellRef={playerShellRef}
                  channel={channel}
                  qualityHints={qualityHints}
                  nowNext={nowNext}
                />
              ) : null}
              {error ? (
                <PlayerErrorOverlay
                  error={error}
                  compact
                  streamProxyConfigured={streamProxyConfigured}
                  onRetry={() => api.retry()}
                  onDismiss={() => setError(null)}
                />
              ) : null}
            </>
          )}
        </Player>
        {!streamUrl ? (
          <div
            className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 px-6 text-center"
            data-testid="live-player-idle"
          >
            <p className="text-sm font-medium text-foreground">Pick a channel below</p>
            <p className="max-w-sm text-xs text-foreground-muted">
              Preview plays here. Use the bar at the bottom for volume and fullscreen, or open the
              channel list.
            </p>
          </div>
        ) : null}
      </div>

      <LiveRecentStrip
        recentChannels={recentChannels}
        currentChannelId={channel?.id}
        onPick={onSelectRecent}
      />
    </section>
  );
}
