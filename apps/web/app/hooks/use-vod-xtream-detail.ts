import { useEffect, useState } from 'react';
import {
  fetchVodInfo,
  mergeVodChannelWithXtreamInfo,
  type Source,
  type VodChannel,
} from 'core';
import { _getDefaultXtreamCache } from '../store/catalog-store';

/**
 * For Xtream VOD rows, overlays `get_vod_info` onto the list row so the browse
 * hero can show plot, backdrop, duration, etc. M3U / non-Xtream sources skip the
 * network call and return `base` unchanged.
 */
export function useVodXtreamDetail(
  base: VodChannel | null,
  source: Source
): { channel: VodChannel | null; detailLoading: boolean } {
  const [merged, setMerged] = useState<VodChannel | null>(null);
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
      setDetailLoading(false);
      return;
    }
    const streamId = base.xtreamStreamId;
    if (streamId === undefined) {
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    const fetcher = _getDefaultXtreamCache();
    const credentials = source.credentials;

    void (async () => {
      // Wait for the IndexedDB cache to hydrate before issuing the
      // network call. The grid-enrichment hook documents the same
      // reasoning: without this gate, opening a detail page burns a
      // network request even though the answer is already on disk
      // from a previous visit. With it, every revisit inside the 24h
      // VOD info TTL is served from memory.
      try {
        await fetcher.ready;
      } catch {
        // Hydration failures degrade to in-memory cache; not fatal.
      }
      if (cancelled) return;

      try {
        const info = await fetchVodInfo(credentials, fetcher, streamId);
        if (cancelled) return;
        setMerged(mergeVodChannelWithXtreamInfo(base, info));
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
