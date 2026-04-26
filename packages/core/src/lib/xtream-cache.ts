import type { XtreamFetcher } from './xtream';
import type { XtreamAction } from './contracts';

/**
 * Per-action TTL configuration (milliseconds). All values are bounded so a
 * misconfigured `Infinity` cannot pin stale data forever.
 *
 * The defaults match each action's real-world change frequency:
 *   - categories almost never change                 → 1 hour
 *   - stream listings change a few times per day     → 10 minutes
 *   - per-item info (vod_info, series_info) is large → 24 hours
 *   - EPG (short EPG, simple data table) is now/next → 0 (never cache)
 */
export type XtreamCacheTTLs = Partial<Record<XtreamAction, number>>;

export const DEFAULT_XTREAM_CACHE_TTLS: Required<XtreamCacheTTLs> = {
  get_live_categories: 60 * 60 * 1000,
  get_vod_categories: 60 * 60 * 1000,
  get_series_categories: 60 * 60 * 1000,
  get_live_streams: 10 * 60 * 1000,
  get_vod_streams: 10 * 60 * 1000,
  get_series: 10 * 60 * 1000,
  get_vod_info: 24 * 60 * 60 * 1000,
  get_series_info: 24 * 60 * 60 * 1000,
  // EPG must always be fresh — caching now/next breaks the feature.
  get_short_epg: 0,
  get_simple_data_table: 0,
};

/** Internal entry kept in the cache table. */
interface CacheEntry {
  expiresAt: number;
  body: string;
}

export type XtreamCacheEntry = CacheEntry;

/**
 * Pluggable persistence layer. Lets a host app keep cache entries across
 * page reloads (e.g. via IndexedDB) without dragging the storage backend
 * into `core`.
 *
 * Mutations are fire-and-forget by design — the in-memory map is always
 * the source of truth for synchronous reads. The storage adapter just
 * mirrors writes asynchronously and replays surviving entries on
 * startup via {@link XtreamCacheStorage.load}.
 *
 * Adapters MUST tolerate concurrent calls; we do not serialise writes.
 * Adapters SHOULD swallow their own errors — a failing storage layer
 * must never break the network path.
 */
export interface XtreamCacheStorage {
  /** Resolve to every persisted entry. Expired entries may be returned;
   *  the cache filters them on hydration. */
  load(): Promise<Iterable<readonly [string, CacheEntry]>>;
  /** Persist (or overwrite) one entry. Fire-and-forget. */
  set(key: string, entry: CacheEntry): void;
  /** Drop one entry. Fire-and-forget. */
  delete(key: string): void;
  /** Drop every entry whose key matches `predicate`. */
  deleteMatching(predicate: (key: string) => boolean): void;
  /** Drop every entry. */
  clear(): void;
}

/**
 * Read-only stats for diagnostics & tests. Not part of the wire schema.
 */
export interface XtreamCacheStats {
  size: number;
  hits: number;
  misses: number;
  bypasses: number;
  inflight: number;
}

export interface CachingXtreamFetcher extends XtreamFetcher {
  /** Drop the cached entry for one fully-built URL (after normalization). */
  invalidate(url: string): void;
  /** Drop every cached entry for the host/username pair embedded in `url`. */
  invalidateSource(url: string): void;
  /** Drop every cached entry. */
  clear(): void;
  /** Snapshot of the current counters. */
  stats(): XtreamCacheStats;
  /** Resolves once the optional persistent storage layer has hydrated.
   *  Always resolves immediately when no storage adapter was provided. */
  ready: Promise<void>;
}

export interface CachingXtreamFetcherOptions {
  ttls?: XtreamCacheTTLs;
  /** Inject a clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Optional persistence layer. See {@link XtreamCacheStorage}. */
  storage?: XtreamCacheStorage;
}

/**
 * Wrap an underlying `XtreamFetcher` with a per-action TTL cache and in-flight
 * request deduplication.
 *
 * Why wrap the fetcher rather than annotate `loadXtreamPlaylist`? The fetcher
 * is the single seam every Xtream HTTP call already passes through; wrapping
 * it keeps `core` pure and lets each platform pick its own cache backend
 * without touching the catalog code.
 *
 * Cache semantics:
 *   - Key = the request URL with `password` stripped. Username is kept because
 *     it identifies the account / catalog; multiple Xtream sources with the
 *     same host and different users must NOT share entries.
 *   - TTL is looked up by the `action` query param. Unknown / missing actions
 *     (e.g. the auth probe with no `action`) are NEVER cached — fresh auth is
 *     more important than the savings.
 *   - Concurrent identical requests share a single in-flight promise so a
 *     burst (e.g. categories + streams + info during catalog load) collapses
 *     to one network round-trip per (url, action).
 *   - Errors are not cached; a failing request never poisons the table.
 */
export function createCachingXtreamFetcher(
  inner: XtreamFetcher,
  options: CachingXtreamFetcherOptions = {}
): CachingXtreamFetcher {
  const ttls: Required<XtreamCacheTTLs> = {
    ...DEFAULT_XTREAM_CACHE_TTLS,
    ...(options.ttls ?? {}),
  };
  const now = options.now ?? Date.now;
  const storage = options.storage;

  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<{ text(): Promise<string> }>>();
  let hits = 0;
  let misses = 0;
  let bypasses = 0;

  // Hydrate from persistent storage in the background. We deliberately
  // don't block the fetcher on this — the first few requests may miss
  // the cache and refetch, which is acceptable. Once `ready` resolves
  // every later request benefits from the persisted entries.
  const ready: Promise<void> = storage
    ? (async () => {
        try {
          const entries = await storage.load();
          for (const [key, entry] of entries) {
            // Skip already-expired entries so they don't waste memory; the
            // adapter is free to clean them up too.
            if (entry.expiresAt > now()) cache.set(key, entry);
            else storage.delete(key);
          }
        } catch {
          // Storage failures must not break the network path.
        }
      })()
    : Promise.resolve();

  const wrapped = ((url: string) => {
    const key = cacheKey(url);
    const action = readAction(url);
    const ttl = action ? ttls[action] ?? 0 : 0;

    if (ttl <= 0) {
      bypasses += 1;
      // No TTL → call the underlying fetcher every time. Don't even
      // de-duplicate, since the auth probe wants to surface fresh failures.
      return inner(url);
    }

    const fresh = cache.get(key);
    if (fresh && fresh.expiresAt > now()) {
      hits += 1;
      return Promise.resolve(makeBodyResponse(fresh.body));
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    misses += 1;
    const promise = (async () => {
      try {
        const response = await inner(url);
        // Materialise the body so subsequent cache hits can replay it.
        const body = await response.text();
        const entry: CacheEntry = { body, expiresAt: now() + ttl };
        cache.set(key, entry);
        storage?.set(key, entry);
        return makeBodyResponse(body);
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }) as CachingXtreamFetcher;

  wrapped.invalidate = (url) => {
    const key = cacheKey(url);
    cache.delete(key);
    storage?.delete(key);
  };
  wrapped.invalidateSource = (url) => {
    const target = sourceIdentity(url);
    if (!target) return;
    for (const key of [...cache.keys()]) {
      const id = sourceIdentity(key);
      if (id && id === target) cache.delete(key);
    }
    storage?.deleteMatching((key) => {
      const id = sourceIdentity(key);
      return Boolean(id && id === target);
    });
  };
  wrapped.clear = () => {
    cache.clear();
    storage?.clear();
  };
  wrapped.stats = () => ({
    size: cache.size,
    hits,
    misses,
    bypasses,
    inflight: inflight.size,
  });
  wrapped.ready = ready;

  return wrapped;
}

/**
 * `XtreamFetcher.text()` returns a fresh string each time the wire response is
 * read. Cached responses must obey the same shape; we reuse the captured body
 * rather than the original `Response` so the cached entry is replayable.
 */
function makeBodyResponse(body: string): { text(): Promise<string> } {
  return { text: () => Promise.resolve(body) };
}

/** Strip the `password` query param from a URL so it never lands in cache keys. */
function cacheKey(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('password');
    // Sort the remaining params for stable keys regardless of source ordering.
    u.searchParams.sort();
    return u.toString();
  } catch {
    // Not a parseable URL — fall back to the raw string. Better an exact-match
    // cache than a thrown TypeError that takes the catalog load down with it.
    return url;
  }
}

/** Build a stable identity for "this Xtream account" (host + path + username). */
function sourceIdentity(url: string): string | null {
  try {
    const u = new URL(url);
    const username = u.searchParams.get('username') ?? '';
    return `${u.origin}${u.pathname}#${username}`;
  } catch {
    return null;
  }
}

function readAction(url: string): XtreamAction | null {
  try {
    const value = new URL(url).searchParams.get('action');
    return (value as XtreamAction | null) ?? null;
  } catch {
    return null;
  }
}
