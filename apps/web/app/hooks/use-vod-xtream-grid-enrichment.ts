import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchVodInfo,
  mergeVodChannelWithXtreamInfo,
  type Source,
  type VodChannel,
} from 'core';
import { _getDefaultXtreamCache } from '../store/catalog-store';

/** Cap per category so browse stays responsive; cache makes revisits cheap. */
const MAX_ENRICH = 72;
const CONCURRENCY = 4;

/**
 * For Xtream VOD, prefetches `get_vod_info` for the current filtered rows (batched)
 * so poster badges and sort keys match the detail hero (rating, year, runtime).
 * Non-Xtream sources no-op (empty map).
 */
export function useVodXtreamGridEnrichment(
  rows: readonly VodChannel[],
  source: Source,
  enabled: boolean
): Readonly<Record<string, VodChannel>> {
  const [byId, setById] = useState<Record<string, VodChannel>>({});
  const rowsRef = useRef(rows);
  const sourceRef = useRef(source);
  rowsRef.current = rows;
  sourceRef.current = source;

  const rowKey = useMemo(() => {
    if (!enabled || source.type !== 'xtream') return '';
    return rows.map((c) => c.id).join('\u0001');
  }, [enabled, rows, source.type]);

  useEffect(() => {
    if (!rowKey) {
      setById({});
      return;
    }

    const src = sourceRef.current;
    if (src.type !== 'xtream' || !src.credentials) {
      setById({});
      return;
    }

    let cancelled = false;
    setById({});

    const credentials = src.credentials;
    const fetcher = _getDefaultXtreamCache();
    const targets = rowsRef.current
      .filter((c) => c.xtreamStreamId !== undefined)
      .slice(0, MAX_ENRICH);

    void (async () => {
      // CRITICAL: wait for the IndexedDB cache to hydrate before issuing
      // any get_vod_info calls. Without this, every fresh page load fires
      // a 72-request burst even though the answers are already on disk
      // from the previous visit — which is exactly how we tripped the
      // provider's HTTP 461 rate limit. Once `ready` resolves, every
      // request inside the 24h TTL window is served from memory and
      // never touches the panel.
      try {
        await fetcher.ready;
      } catch {
        // Hydration failures degrade to in-memory cache; not fatal.
      }
      if (cancelled) return;

      for (let i = 0; i < targets.length && !cancelled; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (ch) => {
            if (cancelled) return;
            try {
              const info = await fetchVodInfo(credentials, fetcher, ch.xtreamStreamId!);
              if (cancelled) return;
              const merged = mergeVodChannelWithXtreamInfo(ch, info);
              if (cancelled) return;
              setById((prev) => ({ ...prev, [ch.id]: merged }));
            } catch {
              /* panel errors are ignored per title */
            }
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rowKey]);

  return byId;
}
