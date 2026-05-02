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

  /** Replace persisted sources (import / restore). Overwrites previous data. */
  async writeState(next: SourcesState): Promise<void> {
    await this.storage.set(STORAGE_KEY, {
      sources: [...next.sources],
      activeSourceId: next.activeSourceId,
    });
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

  /**
   * Remove a source. If it was the active source, the next remaining source
   * becomes active (or `null` if none remain). Callers are responsible for
   * clearing related per-source artefacts (playlist snapshots, Xtream cache).
   */
  async removeSource(sourceId: string): Promise<SourcesState> {
    const current = await this.read();
    const filtered = current.sources.filter((s) => s.id !== sourceId);
    const wasActive = current.activeSourceId === sourceId;
    const nextActive = wasActive ? (filtered[0]?.id ?? null) : current.activeSourceId;
    const next: SourcesState = { sources: filtered, activeSourceId: nextActive };
    await this.storage.set(STORAGE_KEY, next);
    return next;
  }

  /**
   * Update fields of an existing source (label, url, credentials, etc.).
   * Throws if the source id does not exist.
   */
  async updateSource(sourceId: string, patch: Partial<Omit<Source, 'id'>>): Promise<SourcesState> {
    const current = await this.read();
    const idx = current.sources.findIndex((s) => s.id === sourceId);
    if (idx === -1) {
      throw new Error(`Cannot update unknown source: ${sourceId}`);
    }
    const updated = { ...current.sources[idx], ...patch } as Source;
    const next: SourcesState = {
      ...current,
      sources: current.sources.map((s, i) => (i === idx ? updated : s)),
    };
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
