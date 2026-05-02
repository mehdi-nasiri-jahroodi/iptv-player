import { useEffect, useState } from 'react';
import {
  buildSeriesEpisodeUrl,
  fetchSeriesInfo,
  type Source,
  type SubtitleTrack,
} from 'core';
import { _getDefaultXtreamCache } from '../store/catalog-store';

/**
 * Resolves a series episode stream URL from an episode id of the form
 * `xtream:series:{seriesId}:s{season}:e{ep}:{xtreamEpisodeId}`.
 *
 * Used by `/play` when the catalog was loaded with `includeSeriesDetail: false`
 * (the default) so the episode's `streamUrl` was never stored in the catalog.
 * Fires a single `get_series_info` call (TTL-cached for 24 h) and extracts the
 * episode's `container_extension` to build the correct stream URL.
 *
 * Returns `null` while loading, `undefined` on any error, or the resolved URL.
 * Also returns any subtitle tracks found on the episode.
 */
export function useSeriesEpisodeStreamUrl(
  episodeChannelId: string,
  source: Source | null | undefined
): {
  streamUrl: string | null | undefined;
  subtitles: SubtitleTrack[] | undefined;
  loading: boolean;
} {
  const [streamUrl, setStreamUrl] = useState<string | null | undefined>(null);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[] | undefined>(
    undefined
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStreamUrl(null);
    setSubtitles(undefined);
    setLoading(false);
  }, [episodeChannelId, source?.id]);

  useEffect(() => {
    if (!source || source.type !== 'xtream' || !source.credentials) {
      setStreamUrl(undefined); // non-Xtream: can't resolve
      return;
    }

    // Parse xtream:series:{seriesId}:s{season}:e{ep}:{xtreamEpisodeId}
    const match = episodeChannelId.match(
      /^xtream:series:(\d+):s\d+:e\d+:(.+)$/
    );
    if (!match) {
      setStreamUrl(undefined);
      return;
    }
    const seriesId = Number(match[1]);
    const rawEpisodeId = match[2];

    let cancelled = false;
    setLoading(true);

    const fetcher = _getDefaultXtreamCache();
    const credentials = source.credentials;

    void (async () => {
      try {
        await fetcher.ready;
      } catch {
        // degraded to in-memory cache; not fatal
      }
      if (cancelled) return;

      try {
        const info = await fetchSeriesInfo(credentials, fetcher, seriesId);
        if (cancelled) return;

        // Find the episode by its raw Xtream id across all seasons.
        let ext = 'mp4';
        let epSubs: SubtitleTrack[] | undefined;
        for (const episodeList of Object.values(info.episodes ?? {})) {
          const ep = episodeList.find((e) => String(e.id) === rawEpisodeId);
          if (ep) {
            ext = ep.container_extension ?? 'mp4';
            // Extract subtitles from root-level or info-level.
            const rawSubs =
              (ep as { subtitles?: unknown[] }).subtitles ??
              ep.info?.subtitles;
            if (Array.isArray(rawSubs)) {
              epSubs = rawSubs
                .filter(
                  (
                    s
                  ): s is {
                    url: string;
                    language?: string;
                    label?: string;
                  } =>
                    typeof (s as { url?: unknown })?.url === 'string' &&
                    (s as { url: string }).url.length > 0
                )
                .map((s) => ({
                  url: s.url,
                  ...(s.language ? { language: s.language } : {}),
                  ...(s.label ? { label: s.label } : {}),
                }));
            }
            break;
          }
        }

        const url = buildSeriesEpisodeUrl(credentials, rawEpisodeId, ext);
        if (!cancelled) {
          setStreamUrl(url);
          setSubtitles(
            epSubs && epSubs.length > 0 ? epSubs : undefined
          );
        }
      } catch {
        if (!cancelled) setStreamUrl(undefined);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [episodeChannelId, source]);

  return { streamUrl, subtitles, loading };
}
