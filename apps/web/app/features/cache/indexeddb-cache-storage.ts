import type { XtreamCacheEntry, XtreamCacheStorage } from 'core';

/**
 * IndexedDB-backed `XtreamCacheStorage`. Survives reloads and tab restarts
 * so the catalog (especially the 19MB+ VOD listing) does not need to be
 * refetched on every page load.
 *
 * Why IndexedDB and not localStorage:
 *   - Xtream VOD payloads regularly exceed the 5MB localStorage quota; the
 *     write would silently fail.
 *   - IndexedDB is async-only, which fits our fire-and-forget storage
 *     contract — synchronous writes were never an option anyway.
 *   - Quotas are typically hundreds of MB, large enough for several big
 *     catalogs.
 *
 * Schema:
 *   - DB:           "iptv-tavern-cache"  (singleton; multiple caches keyed
 *                    by storeName in case we add more later)
 *   - Object store: "xtream-responses"   (out-of-line keys = the cache
 *                    URL string the core layer hands us)
 *   - Value:        `XtreamCacheEntry` (`{ body, expiresAt }`)
 *
 * Failure mode: if the database cannot open (private mode, full quota,
 * Safari with site data disabled, etc.), every method becomes a no-op
 * and the in-memory cache continues to operate. The core fetcher swallows
 * `load()` rejections so the network path is never blocked.
 */
const DB_NAME = 'iptv-tavern-cache';
const DB_VERSION = 1;
const STORE_NAME = 'xtream-responses';

export interface IndexedDBCacheStorageOptions {
  /** Allow tests to inject a fake IDB factory (e.g. `fake-indexeddb`). */
  factory?: IDBFactory;
  /** Override the database name; useful for isolating multi-tenant tests. */
  dbName?: string;
}

/**
 * Construct an IndexedDB-backed cache storage. The constructor opens the
 * database lazily on first use and caches the handle for subsequent calls.
 *
 * Returns a no-op adapter if `indexedDB` is unavailable in this environment
 * (server-side rendering, sandboxed iframe, etc.) — callers do not need
 * to feature-detect.
 */
export function createIndexedDBCacheStorage(
  options: IndexedDBCacheStorageOptions = {}
): XtreamCacheStorage {
  const factory = options.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : null);
  if (!factory) return noopStorage();

  const dbName = options.dbName ?? DB_NAME;

  // Single open promise reused across calls. We resolve to `null` on
  // failure rather than rejecting so every caller can `await` without
  // try/catch.
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const openDb = (): Promise<IDBDatabase | null> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(dbName, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return dbPromise;
  };

  /** Wrap an IDB request in a Promise that resolves to the result. */
  const promisify = <T>(request: IDBRequest<T>): Promise<T | null> =>
    new Promise<T | null>((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });

  return {
    async load() {
      const db = await openDb();
      if (!db) return [];
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const keysReq = store.getAllKeys();
      const valuesReq = store.getAll();
      const [keys, values] = await Promise.all([
        promisify(keysReq),
        promisify(valuesReq),
      ]);
      if (!keys || !values) return [];
      const entries: Array<readonly [string, XtreamCacheEntry]> = [];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const value = values[i] as XtreamCacheEntry | undefined;
        if (typeof key === 'string' && value && typeof value.body === 'string') {
          entries.push([key, value]);
        }
      }
      return entries;
    },

    set(key, entry) {
      // Fire and forget. We do not await so the network path stays sync.
      void (async () => {
        const db = await openDb();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(entry, key);
      })();
    },

    delete(key) {
      void (async () => {
        const db = await openDb();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
      })();
    },

    deleteMatching(predicate) {
      void (async () => {
        const db = await openDb();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const keysReq = store.getAllKeys();
        const keys = await promisify(keysReq);
        if (!keys) return;
        for (const key of keys) {
          if (typeof key === 'string' && predicate(key)) {
            store.delete(key);
          }
        }
      })();
    },

    clear() {
      void (async () => {
        const db = await openDb();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
      })();
    },
  };
}

/**
 * No-op storage used when IndexedDB is unavailable. The fetcher will run
 * exclusively from the in-memory cache, matching pre-persistence behaviour.
 */
function noopStorage(): XtreamCacheStorage {
  return {
    load: () => Promise.resolve([]),
    set: () => undefined,
    delete: () => undefined,
    deleteMatching: () => undefined,
    clear: () => undefined,
  };
}
