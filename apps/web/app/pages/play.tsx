import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Channel, Source, SubtitleTrack } from 'core';
import {
  Player,
  PlayerControls,
  PlayerErrorOverlay,
  PlayerSubtitlePicker,
  type ExternalTextTrack,
  type ShakaError,
  type UseShakaPlayerResult,
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
import { useVodXtreamDetail } from '../hooks/use-vod-xtream-detail';
import {
  useEmbeddedSubtitles,
  type EmbeddedSubtitleTrack,
} from '../hooks/use-embedded-subtitles';
import { useTranscodeUrl } from '../hooks/use-transcode-url';

function isChannelKind(value: string | undefined): value is ChannelKind {
  return value !== undefined && (CHANNEL_KINDS as string[]).includes(value);
}

function isDirectFileUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const p = new URL(url).pathname.toLowerCase();
    return !p.endsWith('.m3u8') && !p.endsWith('.m3u');
  } catch { return false; }
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
  const { streamUrl: seriesStreamUrl, subtitles: seriesSubtitles, loading: seriesLoading } =
    useSeriesEpisodeStreamUrl(
      kind === 'series' ? channelId : '',
      kind === 'series' ? source : null
    );

  // VOD: fetch get_vod_info to get subtitles (and enrich metadata). The hook
  // is a no-op for non-Xtream sources or non-VOD kinds.
  const vodBase = kind === 'vod' && channel?.type === 'vod' ? channel : null;
  const { channel: vodDetail } = useVodXtreamDetail(
    vodBase,
    source ?? ({ type: 'unknown' } as Source)
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

  // Discover embedded subtitle tracks via ffprobe on the proxy host.
  // Also returns the file duration (for the transcode fallback seekbar).
  // Tracks are enumerated but NOT extracted yet — extraction is on-demand.
  const { tracks: embeddedTracks, extractTrack, duration: probedDuration } =
    useEmbeddedSubtitles(
      kind === 'vod' || kind === 'series' ? streamUrl : null,
      playbackProxy
    );

  // Audio transcode toggle: by default play through /stream (normal, with
  // seeking). User can flip to /transcode when audio is missing (EAC3/AC3/DTS
  // in MKV). Transcoded playback has no seeking but gains AAC audio.
  const [transcodeEnabled, setTranscodeEnabled] = useState(false);
  // Reset transcode toggle when switching content.
  useEffect(() => { setTranscodeEnabled(false); }, [streamUrl]);

  const {
    effectiveUrl,
    effectiveProxy,
    isTranscoding,
  } = useTranscodeUrl(
    streamUrl,
    playbackProxy,
    kind,
    probedDuration,
    transcodeEnabled
  );

  const playerUrl = effectiveUrl;

  // Xtream API subtitle fallback (currently always empty — API has no subtitle
  // field, but kept for forward compat).
  const externalTextTracks: ExternalTextTrack[] | undefined = useMemo(() => {
    let subs: SubtitleTrack[] | undefined;
    if (kind === 'vod' && vodDetail?.type === 'vod') {
      subs = vodDetail.subtitles;
    } else if (kind === 'series') {
      subs = seriesSubtitles;
    }
    if (!subs || subs.length === 0) return undefined;
    return subs.map((s) => ({
      url: s.url,
      language: s.language ?? 'und',
      label: s.label,
      mimeType: s.mimeType,
    }));
  }, [kind, vodDetail, seriesSubtitles]);

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
         ) : isTranscoding && playerUrl ? (
          <div
            className="relative aspect-video w-full max-w-6xl overflow-hidden rounded-md bg-black"
            data-testid="play-frame"
          >
            {/* Transcoded playback: bypass Shaka entirely. Use native <video>
                so we avoid Shaka's HEAD probe (which Cloudflare tunnels reject).
                No seeking — the fMP4 stream is linear. */}
            <video
              src={playerUrl}
              autoPlay
              playsInline
              className="h-full w-full bg-black"
            />
            {/* Minimal controls overlay for transcode mode */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/70 px-4 py-2 backdrop-blur-sm">
              <span className="text-xs text-foreground-muted">
                Audio fix active — no seeking
              </span>
              <TranscodeToggle
                enabled={transcodeEnabled}
                onToggle={setTranscodeEnabled}
              />
            </div>
          </div>
        ) : (
          <div
            className="relative aspect-video w-full max-w-6xl overflow-hidden rounded-md bg-black"
            data-testid="play-frame"
          >
            <Player
              src={playerUrl}
              onError={setError}
              streamProxy={effectiveProxy}
              externalTextTracks={externalTextTracks}
              className="h-full w-full"
            >
              {(api) => (
                <>
                  <PlayerControls
                    api={api}
                    trailing={
                      (kind === 'vod' || kind === 'series') ? (
                        <div className="pointer-events-auto flex items-center gap-2">
                          {embeddedTracks.length > 0 ? (
                            <EmbeddedSubtitlePicker
                              api={api}
                              tracks={embeddedTracks}
                              extractTrack={extractTrack}
                            />
                          ) : (
                            <PlayerSubtitlePicker api={api} />
                          )}
                          {playbackProxy && isDirectFileUrl(streamUrl) && (
                            <TranscodeToggle
                              enabled={transcodeEnabled}
                              onToggle={setTranscodeEnabled}
                            />
                          )}
                        </div>
                      ) : undefined
                    }
                  />
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

/**
 * On-demand subtitle picker for MKV-embedded tracks discovered via ffprobe.
 * Only extracts the selected track (via ffmpeg on the proxy) when the user
 * picks it — avoids spawning 26 concurrent ffmpeg processes.
 */
function EmbeddedSubtitlePicker({
  tracks,
  extractTrack,
  className = '',
}: {
  api: UseShakaPlayerResult;
  tracks: EmbeddedSubtitleTrack[];
  extractTrack: (trackIndex: number) => Promise<string | null>;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLLabelElement>(null);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;

      // Find the video element by walking up to the player frame.
      const video = containerRef.current
        ?.closest('[data-testid="play-frame"]')
        ?.querySelector('video') as HTMLVideoElement | null;

      if (!value) {
        setActiveIndex(null);
        // Disable all embedded subtitle tracks.
        if (video) {
          for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'hidden';
          }
        }
        return;
      }

      const trackIndex = Number(value);
      const track = tracks.find((t) => t.index === trackIndex);
      if (!track) return;

      setLoading(true);
      setActiveIndex(trackIndex);

      try {
        const extractUrl = await extractTrack(trackIndex);
        if (!extractUrl || !video) {
          setActiveIndex(null);
          return;
        }

        // Fetch the VTT content and create a blob URL.
        const res = await fetch(extractUrl);
        if (!res.ok) {
          setActiveIndex(null);
          return;
        }
        const vttBlob = await res.blob();
        const blobUrl = URL.createObjectURL(vttBlob);

        // Remove any previously added embedded subtitle tracks.
        video.querySelectorAll('track[data-embedded-sub]').forEach((el) => {
          URL.revokeObjectURL((el as HTMLTrackElement).src);
          el.remove();
        });

        const trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = track.label;
        trackEl.srclang = track.language;
        trackEl.src = blobUrl;
        trackEl.dataset.embeddedSub = 'true';
        trackEl.default = true;
        video.appendChild(trackEl);

        // Activate only this track.
        for (let i = 0; i < video.textTracks.length; i++) {
          const tt = video.textTracks[i];
          if (tt.label === track.label && tt.language === track.language) {
            tt.mode = 'showing';
          } else {
            tt.mode = 'hidden';
          }
        }
      } catch {
        setActiveIndex(null);
      } finally {
        setLoading(false);
      }
    },
    [tracks, extractTrack]
  );

  if (tracks.length === 0) return null;

  return (
    <label
      ref={containerRef}
      className={[
        'pointer-events-auto z-[15] flex min-w-0 items-center gap-2',
        'text-xs text-foreground',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <select
        aria-label="Subtitles"
        data-testid="player-embedded-subtitle-picker"
        className="max-w-[min(100%,10rem)] cursor-pointer rounded border border-border bg-surface/80 px-1.5 py-0.5 text-xs text-foreground outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-accent"
        value={activeIndex !== null ? String(activeIndex) : ''}
        onChange={(e) => void handleChange(e)}
        disabled={loading}
      >
        <option value="">{loading ? 'Loading…' : 'Subtitles'}</option>
        {tracks.map((t) => (
          <option key={t.index} value={String(t.index)}>
            {t.label || t.language}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Toggle button for audio transcoding. Shows in the player controls for
 * direct-file VOD/series when the proxy is configured. Off by default
 * (normal playback with seeking). Turning it on switches to /transcode
 * (AAC audio, but no seeking).
 */
function TranscodeToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={enabled ? 'Disable audio fix' : 'Enable audio fix'}
      title={
        enabled
          ? 'Audio fix active (no seeking). Click to use normal playback.'
          : 'No audio? Click to fix (loses seeking).'
      }
      data-testid="transcode-toggle"
      className={[
        'rounded border px-1.5 py-0.5 text-xs outline-none backdrop-blur-sm',
        'focus-visible:ring-2 focus-visible:ring-accent',
        enabled
          ? 'border-accent bg-accent/20 text-accent'
          : 'border-border bg-surface/80 text-foreground-muted',
      ].join(' ')}
      onClick={() => onToggle(!enabled)}
    >
      {enabled ? 'AAC' : 'Fix audio'}
    </button>
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
