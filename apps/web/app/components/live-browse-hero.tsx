import { useEffect, useMemo, useState } from 'react';
import type { Channel, EpgGuide } from 'core';
import { Player, PlayerControls, PlayerErrorOverlay, type ShakaError, type StreamProxyOption } from 'player';
import { Button } from 'ui';
import { formatNowNextLine } from '../lib/epg-display';
import { inferStreamQualityHints } from '../lib/live-channel-badges';

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
      variant={selected ? 'primary' : 'ghost'}
      size="md"
      focusKey={`RECENT_${channel.id}`}
      onClick={onPick}
      className={[
        'h-auto min-h-[5.5rem] w-[10.5rem] shrink-0 flex-col items-stretch justify-start gap-2 rounded-xl',
        'border border-border px-3 py-2.5 text-left shadow-sm',
        selected ? 'ring-2 ring-accent/40' : 'bg-surface-raised hover:border-accent/40',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="size-9 shrink-0 rounded-md bg-surface-raised object-contain"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        ) : (
          <div
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent"
          >
            {initial}
          </div>
        )}
        <span className="line-clamp-3 min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">
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
    <div className="border-t border-border bg-surface px-4 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        Continue watching
      </p>
      <ul
        className="flex list-none gap-3 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
        aria-label="Recently viewed channels"
      >
        {recentChannels.map((ch) => (
          <li key={ch.id} className="shrink-0">
            <RecentChannelCard
              channel={ch}
              selected={currentChannelId === ch.id}
              onPick={() => onPick(ch)}
            />
          </li>
        ))}
      </ul>
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

  return (
    <section
      aria-label="Channel preview"
      className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
      data-testid="live-browse-hero"
    >
      <div
        className="relative aspect-[21/9] min-h-[200px] max-h-[min(42vh,440px)] w-full bg-black md:aspect-[2.35/1]"
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
        {channel && streamUrl ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] max-h-[48%] bg-gradient-to-b from-black/82 via-black/45 to-transparent px-4 pb-16 pt-3 md:px-5 md:pt-4">
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
              <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {channel.name}
              </h2>
              {'groupTitle' in channel && channel.groupTitle ? (
                <p className="text-sm text-foreground-muted">{channel.groupTitle}</p>
              ) : null}
              {nowNext ? (
                <p className="line-clamp-2 text-sm text-foreground/90">{nowNext}</p>
              ) : null}
            </div>
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
