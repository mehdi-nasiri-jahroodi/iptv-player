import { LocalStorageAdapter, type Source, type StorageAdapter } from 'core';

/**
 * localStorage layout for the sources slice. Persisted shape is intentionally
 * tiny and stable so future migrations stay manageable.
 */
export type SourcesState = {
  sources: Source[];
  activeSourceId: string | null;
};

const STORAGE_KEY = 'iptv.sources.v1';

const EMPTY: SourcesState = { sources: [], activeSourceId: null };

export class SourcesStore {
  constructor(private readonly storage: StorageAdapter = new LocalStorageAdapter()) {}

  async read(): Promise<SourcesState> {
    return (await this.storage.get<SourcesState>(STORAGE_KEY)) ?? EMPTY;
  }

  async addSource(source: Source): Promise<SourcesState> {
    const current = await this.read();
    const next: SourcesState = {
      sources: [...current.sources.filter((s) => s.id !== source.id), source],
      // First source becomes active automatically; otherwise keep the existing pick.
      activeSourceId: current.activeSourceId ?? source.id,
    };
    await this.storage.set(STORAGE_KEY, next);
    return next;
  }

  async setActiveSource(sourceId: string): Promise<SourcesState> {
    const current = await this.read();
    if (!current.sources.some((s) => s.id === sourceId)) {
      throw new Error(`Cannot activate unknown source: ${sourceId}`);
    }
    const next: SourcesState = { ...current, activeSourceId: sourceId };
    await this.storage.set(STORAGE_KEY, next);
    return next;
  }
}

/**
 * Generate a stable-ish id for a freshly-created source. crypto.randomUUID()
 * is available in every browser we support; the fallback covers SSR / tests.
 */
export function newSourceId(): string {
  if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }
  }
  return `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
