import {
  LocalStorageAdapter,
  parseM3uToPlaylist,
  type Playlist,
  type StorageAdapter,
} from 'core';

/**
 * Persisted playlist snapshots, keyed by source id.
 *
 * Why snapshots? `Source` is the user's input (URL, file label, credentials).
 * `Playlist` is the parsed catalog. For M3U file sources we have no way to
 * re-fetch — the original file is gone after upload — so we must persist the
 * parsed playlist itself. For M3U URL sources we cache the last good parse so
 * the browse view renders instantly without re-fetching on every visit.
 *
 * Xtream sources are NOT cached here; the catalog store fetches them live
 * because the data is large, frequently changing, and credential-bound (the
 * stream URLs in a `Playlist` snapshot would embed username/password — see
 * docs/architecture.md "stream URLs are constructed at playback time").
 */
export type PlaylistsState = {
  /** sourceId → most recent Playlist snapshot. */
  bySourceId: Record<string, Playlist>;
};

const STORAGE_KEY = 'iptv.playlists.v1';
const EMPTY: PlaylistsState = { bySourceId: {} };

export class PlaylistsStore {
  constructor(private readonly storage: StorageAdapter = new LocalStorageAdapter()) {}

  async read(): Promise<PlaylistsState> {
    return (await this.storage.get<PlaylistsState>(STORAGE_KEY)) ?? EMPTY;
  }

  /** Replace all playlist snapshots (import / restore). Overwrites previous data. */
  async writeState(next: PlaylistsState): Promise<void> {
    await this.storage.set(STORAGE_KEY, {
      bySourceId: { ...next.bySourceId },
    });
  }

  async getForSource(sourceId: string): Promise<Playlist | null> {
    const state = await this.read();
    return state.bySourceId[sourceId] ?? null;
  }

  async setForSource(sourceId: string, playlist: Playlist): Promise<void> {
    const current = await this.read();
    const next: PlaylistsState = {
      bySourceId: { ...current.bySourceId, [sourceId]: playlist },
    };
    await this.storage.set(STORAGE_KEY, next);
  }

  async removeForSource(sourceId: string): Promise<void> {
    const current = await this.read();
    if (!(sourceId in current.bySourceId)) return;
    const { [sourceId]: _removed, ...rest } = current.bySourceId;
    void _removed;
    await this.storage.set(STORAGE_KEY, { bySourceId: rest });
  }
}

/**
 * Convenience: parse raw M3U text into a `Playlist`. Re-exported here so
 * pages that already import the storage layer don't need a second import
 * from `core` just to seed a snapshot.
 */
export function buildM3uPlaylist(rawText: string, sourceId: string): Playlist {
  return parseM3uToPlaylist(rawText, sourceId);
}
