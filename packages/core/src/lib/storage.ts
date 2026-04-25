export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Minimal subset of `Storage` we use; lets `core` stay DOM-lib-free while
 * still working with `window.localStorage` in the browser.
 */
type SimpleStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Browser localStorage-backed adapter. Falls back to in-memory when
 * `window.localStorage` is unavailable (SSR, private mode quirks).
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly fallback = new InMemoryStorageAdapter();

  private get backing(): SimpleStorage | null {
    if (typeof globalThis === 'undefined') return null;
    const candidate = (globalThis as { localStorage?: SimpleStorage }).localStorage;
    return candidate ?? null;
  }

  async get<T>(key: string): Promise<T | null> {
    const store = this.backing;
    if (!store) return this.fallback.get<T>(key);
    const raw = store.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const store = this.backing;
    if (!store) {
      await this.fallback.set(key, value);
      return;
    }
    store.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    const store = this.backing;
    if (!store) {
      await this.fallback.remove(key);
      return;
    }
    store.removeItem(key);
  }
}

