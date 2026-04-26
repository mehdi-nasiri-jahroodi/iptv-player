import { describe, expect, test, vi } from 'vitest';
import {
  createCachingXtreamFetcher,
  DEFAULT_XTREAM_CACHE_TTLS,
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
