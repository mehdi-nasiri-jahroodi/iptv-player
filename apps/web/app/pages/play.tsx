import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Channel, SeriesChannel, SeriesEpisode, Source } from 'core';
import {
  Player,
  PlayerControls,
  PlayerErrorOverlay,
  PlayerSubtitlePicker,
  type ShakaError,
} from 'player';
import { Button } from 'ui';
import { SourcesStore } from '../features/sources/sources-storage';
import { streamProxyForPlayback } from '../lib/playback-stream-proxy';
import {
  CHANNEL_KINDS,
  useCatalogStore,
  type ChannelKind,
} from '../store/catalog-store';
import { hasStreamProxy, useSettingsStore } from '../store/settings-store';
import { recentKey, useProfileStore } from '../store/profile-store';

function isChannelKind(value: string | undefined): value is ChannelKind {
  return value !== undefined && (CHANNEL_KINDS as string[]).includes(value);
}

/**
 * `/play/:sourceId/:kind/:channelId` — fullscreen playback.
 *
 * Flow:
 *  1. Resolve the source from `SourcesStore` (deep links survive a reload).
 *  2. Ensure the catalog is loaded for that source (reuses `loadForSource`,
 *     so the Xtream cache is hit on repeat visits).
 *  3. Look up the channel inside the matching `groupsByKind[kind]` bucket.
 *  4. Mount `<Player>` against `channel.streamUrl`. Series channels do not
 *     carry a `streamUrl` (an episode pick is required) — the page renders
 *     a "no stream available" message until the seasons UI lands in Phase 4.
 */
export function PlayPage() {
  const params = useParams<{
    sourceId: string;
    kind: string;
    channelId: string;
  }>();
  const navigate = useNavigate();
  const kind = isChannelKind(params.kind) ? params.kind : null;
  const sourceId = params.sourceId ?? '';
  const channelId = params.channelId ?? '';

  // Resolve the source — `undefined` while loading, `null` if not found.
  const [source, setSource] = useState<Source | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void new SourcesStore().read().then((state) => {
      if (cancelled) return;
      setSource(state.sources.find((s) => s.id === sourceId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const loadForSource = useCatalogStore((s) => s.loadForSource);
  const catalogSourceId = useCatalogStore((s) => s.sourceId);
  const status = useCatalogStore((s) => s.status);
  const groups = useCatalogStore((s) =>
    kind ? s.groupsByKind[kind] : null
  );

  // Trigger the catalog load once the source resolves and isn't already loaded.
  useEffect(() => {
    if (!source) return;
    if (catalogSourceId === source.id) return;
    void loadForSource(source);
  }, [source, catalogSourceId, loadForSource]);

  const channel: Channel | null = useMemo(() => {
    if (!groups) return null;
    for (const group of groups) {
      const found = group.channels.find((c) => c.id === channelId);
      if (found) return found;
    }
    return null;
  }, [groups, channelId]);

  const seriesEpisodeMatch = useMemo(() => {
    if (kind !== 'series' || !groups) return null;
    for (const group of groups) {
      for (const ch of group.channels) {
        if (ch.type !== 'series') continue;
        for (const season of ch.seasons) {
          const ep = season.episodes.find((e) => e.id === channelId);
          if (ep) return { series: ch as SeriesChannel, episode: ep as SeriesEpisode };
        }
      }
    }
    return null;
  }, [kind, groups, channelId]);

  const [error, setError] = useState<ShakaError | null>(null);
  useEffect(() => {
    setError(null);
  }, [channel?.id]);

  const streamProxyConfig = useSettingsStore((s) => s.streamProxy);
  const streamProxyConfigured = useSettingsStore((s) => hasStreamProxy(s));
  const playbackProxy = useMemo(
    () => streamProxyForPlayback(streamProxyConfig, source ?? undefined),
    [streamProxyConfig, source]
  );

  const streamUrl = (() => {
    if (channel && 'streamUrl' in channel) return channel.streamUrl;
    if (kind === 'series') return seriesEpisodeMatch?.episode.streamUrl ?? null;
    return null;
  })();

  const pushRecent = useProfileStore((s) => s.pushRecent);
  const recentPushedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!source || !kind || !streamUrl) return;
    const itemId = kind === 'series' ? (seriesEpisodeMatch?.episode.id ?? channel?.id) : channel?.id;
    if (!itemId) return;
    const key = recentKey(source.id, kind, itemId);
    if (recentPushedRef.current === key) return;
    recentPushedRef.current = key;
    pushRecent(key);
  }, [source, channel, kind, streamUrl, seriesEpisodeMatch, pushRecent]);

  // Status banner state — kept minimal so the player remains the focal point.
  const banner = (() => {
    if (!kind) return { kind: 'unknown' } as const;
    if (source === undefined) return { kind: 'loading-source' } as const;
    if (source === null) return { kind: 'missing-source' } as const;
    if (status === 'loading' && !channel)
      return { kind: 'loading-catalog' } as const;
    if (status === 'error') return { kind: 'catalog-error' } as const;
    if (!channel && !(kind === 'series' && seriesEpisodeMatch))
      return { kind: 'missing-channel' } as const;
    if (!streamUrl) return { kind: 'no-stream' } as const;
    return { kind: 'ready' } as const;
  })();

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-black text-foreground"
      data-testid="play-page"
    >
      <header className="flex items-center justify-between gap-3 px-6 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {seriesEpisodeMatch
              ? `${seriesEpisodeMatch.series.name} · E${seriesEpisodeMatch.episode.episodeNumber} ${seriesEpisodeMatch.episode.title}`
              : (channel?.name ?? 'Loading…')}
          </div>
          <div className="truncate text-xs text-foreground-muted">
            {seriesEpisodeMatch?.series.groupTitle ?? channel?.groupTitle ?? '\u00a0'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          focusKey="PLAY_BACK"
          onClick={() => {
            if (kind) {
              if (kind === 'vod' && channel?.id) {
                void navigate(
                  `/browse/${kind}?selected=${encodeURIComponent(channel.id)}`
                );
              } else {
                void navigate(`/browse/${kind}`);
              }
            } else {
              void navigate('/');
            }
          }}
        >
          Back
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        {banner.kind === 'unknown' ? (
          <Banner testid="play-unknown-kind">
            "{params.kind}" is not a known catalog section.
          </Banner>
        ) : banner.kind === 'loading-source' ||
          banner.kind === 'loading-catalog' ? (
          <Banner testid="play-loading">Loading…</Banner>
        ) : banner.kind === 'missing-source' ? (
          <Banner testid="play-missing-source">
            That source no longer exists. Add it again to play this channel.
          </Banner>
        ) : banner.kind === 'catalog-error' ? (
          <Banner testid="play-catalog-error">
            Failed to load the catalog for this source.
          </Banner>
        ) : banner.kind === 'missing-channel' ? (
          <Banner testid="play-missing-channel">
            Channel not found in this source.
          </Banner>
        ) : banner.kind === 'no-stream' ? (
          <Banner testid="play-no-stream">
            This item has no playable stream.
          </Banner>
        ) : (
          <div
            className="relative aspect-video w-full max-w-6xl overflow-hidden rounded-md bg-black"
            data-testid="play-frame"
          >
            <Player
              src={streamUrl}
              onError={setError}
              streamProxy={playbackProxy}
              className="h-full w-full"
            >
              {(api) => (
                <>
                  {kind === 'vod' ? (
                    <PlayerSubtitlePicker
                      api={api}
                      className="absolute right-3 top-3 md:right-4 md:top-4"
                    />
                  ) : null}
                  <PlayerControls api={api} />
                  {error ? (
                    <PlayerErrorOverlay
                      error={error}
                      streamProxyConfigured={streamProxyConfigured}
                      onRetry={() => api.retry()}
                      onDismiss={() => setError(null)}
                    />
                  ) : null}
                </>
              )}
            </Player>
          </div>
        )}
      </main>
    </div>
  );
}

function Banner({
  testid,
  children,
}: {
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-foreground-muted"
    >
      {children}
    </div>
  );
}

export default PlayPage;
