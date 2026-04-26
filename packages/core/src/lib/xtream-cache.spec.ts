import { describe, expect, test, vi } from 'vitest';
import {
  createCachingXtreamFetcher,
  DEFAULT_XTREAM_CACHE_TTLS,
  type XtreamCacheEntry,
  type XtreamCacheStorage,
} from './xtream-cache';
import type { XtreamFetcher } from './xtream';

const HOST = 'https://example.com/player_api.php';
const url = (params: Record<string, string>) => {
  const u = new URL(HOST);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

function bodyOf(text: string) {
  return { text: () => Promise.resolve(text) };
}

describe('createCachingXtreamFetcher', () => {
  test('returns the inner fetcher result on miss and the cached one on hit', async () => {
    const inner = vi.fn<XtreamFetcher>().mockImplementation((u) =>
      Promise.resolve(bodyOf(`payload-for-${new URL(u).searchParams.get('action')}`))
    );
    const cached = createCachingXtreamFetcher(inner);

    const target = url({
      username: 'u',
      password: 'p',
      action: 'get_live_categories',
    });
    const a = await (await cached(target)).text();
    const b = await (await cached(target)).text();
    expect(a).toBe('payload-for-get_live_categories');
    expect(b).toBe('payload-for-get_live_categories');
    expect(inner).toHaveBeenCalledTimes(1);

    const stats = cached.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  test('expires entries after the configured TTL elapses', async () => {
    let nowMs = 1_000_000;
    const inner = vi.fn<XtreamFetcher>(async () => bodyOf('payload'));
    const cached = createCachingXtreamFetcher(inner, {
      ttls: { get_live_categories: 5_000 },
      now: () => nowMs,
    });
    const target = url({ username: 'u', password: 'p', action: 'get_live_categories' });

    await cached(target);
    await cached(target);
    expect(inner).toHaveBeenCalledTimes(1);

    nowMs += 5_001;
    await cached(target);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test('keeps the password OUT of the cache key but uses the username', async () => {
    const inner = vi.fn<XtreamFetcher>(async () => bodyOf('payload'));
    const cached = createCachingXtreamFetcher(inner);

    // Same user, different password → same key (one network round-trip).
    await cached(url({ username: 'u', password: 'p1', action: 'get_live_categories' }));
    await cached(url({ username: 'u', password: 'p2', action: 'get_live_categories' }));
    expect(inner).toHaveBeenCalledTimes(1);

    // Different user → different key.
    await cached(url({ username: 'other', password: 'p1', action: 'get_live_categories' }));
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test('never caches actions whose TTL is 0 (e.g. get_short_epg)', async () => {
    const inner = vi.fn<XtreamFetcher>(async () => bodyOf('epg'));
    const cached = createCachingXtreamFetcher(inner);
    const target = url({
      username: 'u',
      password: 'p',
      action: 'get_short_epg',
      stream_id: '100',
    });
    expect(DEFAULT_XTREAM_CACHE_TTLS.get_short_epg).toBe(0);

    await cached(target);
    await cached(target);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(cached.stats().bypasses).toBe(2);
    expect(cached.stats().size).toBe(0);
  });

  test('never caches the auth probe (no `action` query param)', async () => {
    const inner = vi.fn<XtreamFetcher>(async () => bodyOf('{"auth":1}'));
    const cached = createCachingXtreamFetcher(inner);
    const target = url({ username: 'u', password: 'p' });

    await cached(target);
    await cached(target);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test('deduplicates concurrent identical requests', async () => {
    let resolveInner: (value: { text: () => Promise<string> }) => void = () => {
      throw new Error('resolveInner used before assignment');
    };
    const inner = vi.fn<XtreamFetcher>(
      () =>
        new Promise<{ text(): Promise<string> }>((resolve) => {
          resolveInner = resolve;
        })
    );
    const cached = createCachingXtreamFetcher(inner);
    const target = url({ username: 'u', password: 'p', action: 'get_live_streams' });

    const a = cached(target);
    const b = cached(target);
    expect(inner).toHaveBeenCalledTimes(1);

    resolveInner(bodyOf('payload'));
    expect(await (await a).text()).toBe('payload');
    expect(await (await b).text()).toBe('payload');
  });

  test('invalidate(url) drops a single entry; invalidateSource(url) drops all entries for that account', async () => {
    const inner = vi.fn<XtreamFetcher>(async (u) =>
      bodyOf(`payload-${new URL(u).searchParams.get('action')}`)
    );
    const cached = createCachingXtreamFetcher(inner);

    const cats = url({ username: 'u', password: 'p', action: 'get_live_categories' });
    const streams = url({ username: 'u', password: 'p', action: 'get_live_streams' });
    const otherUser = url({ username: 'other', password: 'p', action: 'get_live_categories' });

    await cached(cats);
    await cached(streams);
    await cached(otherUser);
    expect(cached.stats().size).toBe(3);

    cached.invalidate(cats);
    expect(cached.stats().size).toBe(2);

    cached.invalidateSource(streams); // drops user="u" entries only
    expect(cached.stats().size).toBe(1);
  });

  test('does not cache failed responses', async () => {
    let calls = 0;
    const inner = vi.fn<XtreamFetcher>(async () => {
      calls += 1;
      if (calls === 1) throw new Error('network');
      return bodyOf('ok');
    });
    const cached = createCachingXtreamFetcher(inner);
    const target = url({ username: 'u', password: 'p', action: 'get_live_categories' });

    await expect(cached(target)).rejects.toThrow('network');
    expect(cached.stats().size).toBe(0);

    expect(await (await cached(target)).text()).toBe('ok');
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Persistent storage hook
// ---------------------------------------------------------------------------

/** Tiny in-memory adapter used to drive the storage tests. */
function memoryStorage(seed: ReadonlyArray<readonly [string, XtreamCacheEntry]> = []): XtreamCacheStorage & {
  readonly map: Map<string, XtreamCacheEntry>;
  loadCalls: number;
} {
  const map = new Map<string, XtreamCacheEntry>(seed);
  const adapter = {
    map,
    loadCalls: 0,
    load: vi.fn(async () => {
      adapter.loadCalls += 1;
      return [...map.entries()];
    }),
    set: vi.fn((key: string, entry: XtreamCacheEntry) => {
      map.set(key, entry);
    }),
    delete: vi.fn((key: string) => {
      map.delete(key);
    }),
    deleteMatching: vi.fn((predicate: (key: string) => boolean) => {
      for (const key of [...map.keys()]) {
        if (predicate(key)) map.delete(key);
      }
    }),
    clear: vi.fn(() => {
      map.clear();
    }),
  };
  return adapter;
}

describe('createCachingXtreamFetcher with storage', () => {
  test('hydrates from storage so a hit can be served without calling inner', async () => {
    const target = url({ username: 'u', password: 'p', action: 'get_live_categories' });
    // Compute the same key the cache uses (password stripped, params sorted).
    const persistedKey = (() => {
      const u2 = new URL(target);
      u2.searchParams.delete('password');
      u2.searchParams.sort();
      return u2.toString();
    })();
    const storage = memoryStorage([
      [persistedKey, { body: 'persisted', expiresAt: Date.now() + 60_000 }],
    ]);

    const inner = vi.fn<XtreamFetcher>().mockImplementation(() =>
      Promise.resolve(bodyOf('fresh'))
    );
    const cached = createCachingXtreamFetcher(inner, { storage });
    await cached.ready;

    const response = await cached(target);
    expect(await response.text()).toBe('persisted');
    expect(inner).not.toHaveBeenCalled();
    expect(cached.stats().hits).toBe(1);
  });

  test('skips and removes expired entries on hydration', async () => {
    const target = url({ username: 'u', password: 'p', action: 'get_live_categories' });
    const persistedKey = (() => {
      const u2 = new URL(target);
      u2.searchParams.delete('password');
      u2.searchParams.sort();
      return u2.toString();
    })();
    const storage = memoryStorage([
      [persistedKey, { body: 'stale', expiresAt: Date.now() - 1 }],
    ]);

    const inner = vi.fn<XtreamFetcher>().mockImplementation(() =>
      Promise.resolve(bodyOf('fresh'))
    );
    const cached = createCachingXtreamFetcher(inner, { storage });
    await cached.ready;

    expect(storage.delete).toHaveBeenCalledWith(persistedKey);

    const response = await cached(target);
    expect(await response.text()).toBe('fresh');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test('mirrors writes to storage on cache miss', async () => {
    const storage = memoryStorage();
    const inner = vi.fn<XtreamFetcher>().mockImplementation(() =>
      Promise.resolve(bodyOf('fresh'))
    );
    const cached = createCachingXtreamFetcher(inner, { storage });
    await cached.ready;

    const target = url({ username: 'u', password: 'p', action: 'get_live_categories' });
    await cached(target);

    expect(storage.set).toHaveBeenCalledTimes(1);
    const setCall = (storage.set as ReturnType<typeof vi.fn>).mock.calls[0] as [string, XtreamCacheEntry];
    const [key, entry] = setCall;
    expect(typeof key).toBe('string');
    expect(entry.body).toBe('fresh');
    expect(entry.expiresAt).toBeGreaterThan(Date.now());
  });

  test('mirrors invalidate / invalidateSource / clear to storage', async () => {
    const storage = memoryStorage();
    const inner = vi.fn<XtreamFetcher>().mockImplementation(() =>
      Promise.resolve(bodyOf('payload'))
    );
    const cached = createCachingXtreamFetcher(inner, { storage });
    await cached.ready;

    const cats = url({ username: 'u', password: 'p', action: 'get_live_categories' });
    const streams = url({ username: 'u', password: 'p', action: 'get_live_streams' });
    const otherUser = url({ username: 'v', password: 'p', action: 'get_live_categories' });
    await cached(cats);
    await cached(streams);
    await cached(otherUser);

    cached.invalidate(cats);
    expect(storage.delete).toHaveBeenCalled();

    cached.invalidateSource(streams);
    expect(storage.deleteMatching).toHaveBeenCalled();

    cached.clear();
    expect(storage.clear).toHaveBeenCalled();
  });

  test('storage failures do not break the network path', async () => {
    const storage: XtreamCacheStorage = {
      load: vi.fn(async () => {
        throw new Error('idb unavailable');
      }),
      set: vi.fn(),
      delete: vi.fn(),
      deleteMatching: vi.fn(),
      clear: vi.fn(),
    };
    const inner = vi.fn<XtreamFetcher>().mockImplementation(() =>
      Promise.resolve(bodyOf('fresh'))
    );
    const cached = createCachingXtreamFetcher(inner, { storage });
    await cached.ready;

    const target = url({ username: 'u', password: 'p', action: 'get_live_categories' });
    const response = await cached(target);
    expect(await response.text()).toBe('fresh');
  });
});
