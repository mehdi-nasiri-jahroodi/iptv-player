import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Channel, Source } from 'core';
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
import { useSeriesEpisodeStreamUrl } from '../hooks/use-series-episode-stream-url';

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
 *  3. For live/vod: look up the channel in `groupsByKind[kind]` and use
 *     `channel.streamUrl` directly.
 *  4. For series: the episode `channelId` is `xtream:series:{id}:s…:e…:{epId}`.
 *     The catalog is loaded with `includeSeriesDetail: false` so episodes are
 *     not in the store.  `useSeriesEpisodeStreamUrl` fetches `get_series_info`
 *     once (TTL-cached 24 h) and derives the stream URL from the raw episode id
 *     and container extension — no store mutation required.
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

  // Live / VOD: channel lookup by id.
  const channel: Channel | null = useMemo(() => {
    if (kind === 'series') return null; // handled separately below
    if (!groups) return null;
    for (const group of groups) {
      const found = group.channels.find((c) => c.id === channelId);
      if (found) return found;
    }
    return null;
  }, [kind, groups, channelId]);

  // Series: find the listing-only series row (no episodes) to show name/group.
  const seriesChannel = useMemo(() => {
    if (kind !== 'series' || !groups) return null;
    for (const group of groups) {
      for (const ch of group.channels) {
        if (
          ch.type === 'series' &&
          ch.xtreamSeriesId !== undefined &&
          channelId.startsWith(`xtream:series:${ch.xtreamSeriesId}:`)
        ) {
          return ch;
        }
      }
    }
    return null;
  }, [kind, groups, channelId]);

  // Series: fetch the episode stream URL on demand (TTL-cached get_series_info).
  const { streamUrl: seriesStreamUrl, loading: seriesLoading } =
    useSeriesEpisodeStreamUrl(
      kind === 'series' ? channelId : '',
      kind === 'series' ? source : null
    );

  const [error, setError] = useState<ShakaError | null>(null);
  useEffect(() => {
    setError(null);
  }, [channelId]);

  const streamProxyConfig = useSettingsStore((s) => s.streamProxy);
  const streamProxyConfigured = useSettingsStore((s) => hasStreamProxy(s));
  const playbackProxy = useMemo(
    () => streamProxyForPlayback(streamProxyConfig, source ?? undefined),
    [streamProxyConfig, source]
  );

  const streamUrl: string | null = (() => {
    if (kind === 'series') return seriesStreamUrl ?? null;
    if (channel && 'streamUrl' in channel) return channel.streamUrl;
    return null;
  })();

  // Parse a human-readable episode label from the episode id.
  // Format: xtream:series:{seriesId}:s{season}:e{ep}:{rawId}
  const episodeLabel = useMemo(() => {
    const m = channelId.match(/^xtream:series:\d+:s(\d+):e(\d+):/);
    if (!m) return null;
    return `S${m[1]} · E${m[2]}`;
  }, [channelId]);

  const pushRecent = useProfileStore((s) => s.pushRecent);
  const addRecentIfMissing = useProfileStore((s) => s.addRecentIfMissing);
  const recentPushedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!source || !kind || !streamUrl) return;
    const itemId = kind === 'series' ? channelId : channel?.id;
    if (!itemId) return;
    const key = recentKey(source.id, kind, itemId);
    if (recentPushedRef.current === key) return;
    recentPushedRef.current = key;
    // Live Continue watching is a stable list of channels the user picks; never
    // reorder on re-watch (matches inline live behaviour). VOD/series keep
    // most-recent-first ordering since "what did I watch last night" is the
    // expected mental model for movies and episodes.
    if (kind === 'live') {
      addRecentIfMissing(key);
    } else {
      pushRecent(key);
    }
  }, [source, channel, kind, channelId, streamUrl, pushRecent, addRecentIfMissing]);

  // Status banner state — kept minimal so the player remains the focal point.
  const banner = (() => {
    if (!kind) return { kind: 'unknown' } as const;
    if (source === undefined) return { kind: 'loading-source' } as const;
    if (source === null) return { kind: 'missing-source' } as const;
    if (status === 'loading' && !channel && kind !== 'series')
      return { kind: 'loading-catalog' } as const;
    if (status === 'error') return { kind: 'catalog-error' } as const;
    if (kind === 'series' && seriesLoading) return { kind: 'loading-episode' } as const;
    if (kind === 'series' && seriesStreamUrl === undefined)
      return { kind: 'missing-channel' } as const;
    if (!channel && kind !== 'series') return { kind: 'missing-channel' } as const;
    if (!streamUrl) return { kind: 'no-stream' } as const;
    return { kind: 'ready' } as const;
  })();

  const headerTitle = (() => {
    if (kind === 'series') {
      const name = seriesChannel?.name ?? 'Series';
      return episodeLabel ? `${name} · ${episodeLabel}` : name;
    }
    return channel?.name ?? 'Loading…';
  })();

  const headerSub =
    kind === 'series'
      ? (seriesChannel?.groupTitle ?? '\u00a0')
      : (channel?.groupTitle ?? '\u00a0');

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-black text-foreground"
      data-testid="play-page"
    >
      <header className="flex items-center justify-between gap-3 px-6 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{headerTitle}</div>
          <div className="truncate text-xs text-foreground-muted">{headerSub}</div>
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
          banner.kind === 'loading-catalog' ||
          banner.kind === 'loading-episode' ? (
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
                  {kind === 'vod' || kind === 'series' ? (
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
