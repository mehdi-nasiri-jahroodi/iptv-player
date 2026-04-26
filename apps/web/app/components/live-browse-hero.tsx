import { useEffect, useMemo, useState } from 'react';
import type { Channel, EpgGuide } from 'core';
import { Info, Play } from 'lucide-react';
import { Player, PlayerControls, PlayerErrorOverlay, type ShakaError, type StreamProxyOption } from 'player';
import { Button } from 'ui';
import { formatNowNextLine } from '../lib/epg-display';
import { inferStreamQualityHints } from '../lib/live-channel-badges';
import { ChannelFavoriteButton } from './favorite-channel-button';

export function LiveBrowseHero({
  channel,
  sourceId,
  playbackProxy,
  streamProxyConfigured,
  recentChannels,
  onSelectRecent,
  onNavigatePlay,
  onNavigateFullscreen,
  onNavigateGuide,
  guide,
  guideReady,
  nowMs,
}: {
  channel: Channel | null;
  sourceId: string | null;
  playbackProxy: StreamProxyOption | null;
  streamProxyConfigured: boolean;
  recentChannels: Channel[];
  onSelectRecent: (c: Channel) => void;
  onNavigatePlay: () => void;
  onNavigateFullscreen: () => void;
  onNavigateGuide: () => void;
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
            className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-2xl"
            style={{ backgroundImage: `url(${logoUrl})` }}
            aria-hidden
          />
        ) : (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/30 via-background to-surface"
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
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
              Preview and controls appear here. Use Watch now for fullscreen playback.
            </p>
          </div>
        ) : null}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-background/95 via-background/70 to-transparent px-5 pb-5 pt-24 backdrop-blur-[2px]"
          aria-hidden={!channel}
        >
          <div className="pointer-events-auto max-w-3xl space-y-3">
            {channel ? (
              <>
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
                <h2 className="text-2xl font-bold tracking-tight text-foreground drop-shadow-sm md:text-3xl">
                  {channel.name}
                </h2>
                {'groupTitle' in channel && channel.groupTitle ? (
                  <p className="text-sm text-foreground-muted">{channel.groupTitle}</p>
                ) : null}
                {nowNext ? (
                  <p className="line-clamp-2 text-sm text-foreground/90">{nowNext}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[4] flex flex-col gap-4 border-t border-border bg-surface/90 px-5 py-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="md"
            focusKey="LIVE_HERO_WATCH"
            disabled={!channel || !sourceId || !streamUrl}
            className="gap-2"
            onClick={onNavigatePlay}
          >
            <Play className="size-4 shrink-0" aria-hidden />
            Watch now
          </Button>
          <Button
            variant="ghost"
            size="md"
            focusKey="LIVE_PLAYER_FULLSCREEN"
            disabled={!channel || !sourceId}
            onClick={onNavigateFullscreen}
          >
            Fullscreen
          </Button>
          {channel && sourceId ? (
            <ChannelFavoriteButton
              sourceId={sourceId}
              channelId={channel.id}
              focusKey="LIVE_HERO_FAVORITE"
            />
          ) : null}
          <Button
            variant="ghost"
            size="md"
            focusKey="LIVE_HERO_GUIDE"
            className="gap-2"
            onClick={onNavigateGuide}
          >
            <Info className="size-4 shrink-0" aria-hidden />
            Guide
          </Button>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-raised/40 px-3 py-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            Recently viewed
          </div>
          {recentChannels.length === 0 ? (
            <p className="text-xs text-foreground-muted">No recent channels yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recentChannels.map((recentChannel) => (
                <Button
                  key={recentChannel.id}
                  variant={channel?.id === recentChannel.id ? 'primary' : 'ghost'}
                  size="sm"
                  focusKey={`RECENT_${recentChannel.id}`}
                  onClick={() => {
                    onSelectRecent(recentChannel);
                  }}
                >
                  {recentChannel.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
