import { describe, expect, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { XtreamCacheEntry } from 'core';
import { createIndexedDBCacheStorage } from '../../../app/features/cache/indexeddb-cache-storage';

/**
 * `fake-indexeddb` ships an in-memory implementation of the W3C IndexedDB
 * API. Each test gets a fresh `IDBFactory` so writes don't leak between
 * cases, and we use a unique `dbName` per test for extra isolation.
 */
function freshFactory(): IDBFactory {
  return new IDBFactory();
}

/** Wait one microtask tick so fire-and-forget IDB writes can complete. */
async function flush() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('createIndexedDBCacheStorage', () => {
  test('persists writes and replays them on the next load()', async () => {
    const factory = freshFactory();
    const dbName = `cache-test-${Math.random()}`;

    const a = createIndexedDBCacheStorage({ factory, dbName });
    a.set('https://example.com/a', { body: 'A', expiresAt: 9_999_999_999_999 });
    a.set('https://example.com/b', { body: 'B', expiresAt: 9_999_999_999_999 });
    await flush();

    // Re-open through a fresh adapter pointing at the same DB.
    const b = createIndexedDBCacheStorage({ factory, dbName });
    const entries = [...(await b.load())] as Array<readonly [string, XtreamCacheEntry]>;
    const map = new Map(entries);
    expect(map.get('https://example.com/a')?.body).toBe('A');
    expect(map.get('https://example.com/b')?.body).toBe('B');
  });

  test('delete() removes the persisted entry', async () => {
    const factory = freshFactory();
    const dbName = `cache-test-${Math.random()}`;

    const adapter = createIndexedDBCacheStorage({ factory, dbName });
    adapter.set('k1', { body: 'v1', expiresAt: 9_999_999_999_999 });
    adapter.set('k2', { body: 'v2', expiresAt: 9_999_999_999_999 });
    await flush();

    adapter.delete('k1');
    await flush();

    const next = createIndexedDBCacheStorage({ factory, dbName });
    const map = new Map(await next.load());
    expect(map.has('k1')).toBe(false);
    expect(map.get('k2')?.body).toBe('v2');
  });

  test('deleteMatching() drops only keys the predicate accepts', async () => {
    const factory = freshFactory();
    const dbName = `cache-test-${Math.random()}`;

    const adapter = createIndexedDBCacheStorage({ factory, dbName });
    adapter.set('user-a/categories', { body: 'A1', expiresAt: 9_999_999_999_999 });
    adapter.set('user-a/streams', { body: 'A2', expiresAt: 9_999_999_999_999 });
    adapter.set('user-b/categories', { body: 'B1', expiresAt: 9_999_999_999_999 });
    await flush();

    adapter.deleteMatching((key) => key.startsWith('user-a/'));
    await flush();

    const next = createIndexedDBCacheStorage({ factory, dbName });
    const map = new Map(await next.load());
    expect(map.has('user-a/categories')).toBe(false);
    expect(map.has('user-a/streams')).toBe(false);
    expect(map.get('user-b/categories')?.body).toBe('B1');
  });

  test('clear() empties the store', async () => {
    const factory = freshFactory();
    const dbName = `cache-test-${Math.random()}`;

    const adapter = createIndexedDBCacheStorage({ factory, dbName });
    adapter.set('k', { body: 'v', expiresAt: 9_999_999_999_999 });
    await flush();
    adapter.clear();
    await flush();

    const next = createIndexedDBCacheStorage({ factory, dbName });
    expect([...(await next.load())]).toHaveLength(0);
  });

  test('returns a no-op adapter when no IDB factory is available', async () => {
    // Pretend `indexedDB` is missing by passing a falsy factory override.
    // The default-arg branch handles `typeof indexedDB === "undefined"`;
    // we mimic that by passing `undefined as unknown as IDBFactory`.
    const adapter = createIndexedDBCacheStorage({
      factory: undefined as unknown as IDBFactory,
    });
    expect([...(await adapter.load())]).toEqual([]);
    // Should not throw.
    adapter.set('k', { body: 'v', expiresAt: 0 });
    adapter.delete('k');
    adapter.deleteMatching(() => true);
    adapter.clear();
  });
});
