import { useEffect, useState } from 'react';
import {
  fetchSeriesInfo,
  mergeSeriesChannelWithXtreamInfo,
  type SeriesChannel,
  type Source,
} from 'core';
import { _getDefaultXtreamCache } from '../store/catalog-store';

/**
 * For Xtream series rows loaded without `includeSeriesDetail`, fetches
 * `get_series_info` on demand so the browse hero can show seasons, episodes,
 * plot, cast, etc.  M3U / non-Xtream sources skip the network call and return
 * `base` unchanged.
 *
 * Follows the same cache-hydration pattern as `useVodXtreamDetail`:
 * awaits `fetcher.ready` before issuing the network call so revisits within
 * the 24 h TTL are served from IndexedDB instead of hitting the panel.
 */
export function useSeriesXtreamDetail(
  base: SeriesChannel | null,
  source: Source
): { channel: SeriesChannel | null; detailLoading: boolean } {
  const [merged, setMerged] = useState<SeriesChannel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setMerged(null);
  }, [base?.id]);

  useEffect(() => {
    if (!base) {
      setDetailLoading(false);
      return;
    }
    if (source.type !== 'xtream' || !source.credentials) {
      // M3U series already has seasons embedded; return as-is.
      setDetailLoading(false);
      return;
    }
    const seriesId = base.xtreamSeriesId;
    if (seriesId === undefined) {
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    const fetcher = _getDefaultXtreamCache();
    const credentials = source.credentials;

    void (async () => {
      try {
        await fetcher.ready;
      } catch {
        // Hydration failures degrade to in-memory cache; not fatal.
      }
      if (cancelled) return;

      try {
        const info = await fetchSeriesInfo(credentials, fetcher, seriesId);
        if (cancelled) return;
        setMerged(mergeSeriesChannelWithXtreamInfo(base, credentials, info));
      } catch {
        if (cancelled) return;
        setMerged(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, source]);

  return { channel: merged ?? base, detailLoading };
}
