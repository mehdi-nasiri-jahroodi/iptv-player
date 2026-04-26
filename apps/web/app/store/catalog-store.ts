import { create } from 'zustand';
import {
  loadXtreamPlaylist,
  type Channel,
  type ChannelGroup,
  type Playlist,
  type Source,
  type XtreamFetcher,
} from 'core';
import { PlaylistsStore } from '../features/sources/playlists-storage';

/**
 * catalogStore — the active source's parsed playlist plus browse-time state
 * (current group, search query). Lives in `apps/web/app/store/` so the slice
 * can be re-used by future routes (`/play/:id`, `/dev/play-test`) without
 * pulling presentation logic from `pages/`.
 *
 * Loading strategy per source type:
 *   - `m3u_url`, `m3u_file` → read the persisted snapshot from `PlaylistsStore`
 *     (seeded by `add-source.tsx` when validation succeeds). M3U file imports
 *     have no other source of truth; URL imports treat the snapshot as a cache.
 *   - `xtream` → live `loadXtreamPlaylist(...)` call against the panel; the
 *     credentials live on the `Source` so we never persist signed stream URLs.
 *
 * Browse scope (Phase 2): only `live` channels are exposed to the UI even
 * when the catalog also contains `vod` / `series`. The store keeps the full
 * playlist so VOD/Series surfaces (Phase 4) can read it without a refetch.
 */

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CatalogState {
  /** Current source the catalog is loaded for; null until `loadForSource` runs. */
  sourceId: string | null;
  status: CatalogStatus;
  error: string | null;
  /** Full parsed playlist (all kinds: live + vod + series). */
  playlist: Playlist | null;
  /** Live-only groups for Phase 2 browse. */
  liveGroups: ChannelGroup[];
  /** Currently selected group id (defaults to the first live group). */
  activeGroupId: string | null;
  /** Free-text filter; matched case-insensitively against `Channel.name`. */
  searchQuery: string;

  // ---- actions ---------------------------------------------------------------
  loadForSource(source: Source, deps?: CatalogStoreDeps): Promise<void>;
  setActiveGroup(groupId: string): void;
  setSearch(query: string): void;
  clear(): void;
}

/**
 * Injectable side-effect deps. Tests pass an in-memory `PlaylistsStore` and a
 * mock `XtreamFetcher`; production calls fall back to live browser fetch and
 * the localStorage-backed snapshot store.
 */
export interface CatalogStoreDeps {
  playlistsStore?: PlaylistsStore;
  xtreamFetcher?: XtreamFetcher;
}

function defaultXtreamFetcher(url: string): Promise<{ text(): Promise<string> }> {
  return fetch(url, { redirect: 'follow' }).then((r) => ({ text: () => r.text() }));
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  sourceId: null,
  status: 'idle',
  error: null,
  playlist: null,
  liveGroups: [],
  activeGroupId: null,
  searchQuery: '',

  async loadForSource(source, deps = {}) {
    set({
      sourceId: source.id,
      status: 'loading',
      error: null,
    });

    const playlistsStore = deps.playlistsStore ?? new PlaylistsStore();
    const xtreamFetcher = deps.xtreamFetcher ?? defaultXtreamFetcher;

    try {
      let playlist: Playlist | null = null;

      if (source.type === 'xtream') {
        if (!source.credentials) {
          throw new Error('Xtream source is missing credentials.');
        }
        playlist = await loadXtreamPlaylist(source.credentials, xtreamFetcher, {
          sourceId: source.id,
          // Skip per-series detail fanout on first load; the series surface in
          // Phase 4 will lazy-load info on demand.
          includeSeriesDetail: false,
        });
      } else {
        // m3u_url / m3u_file — read snapshot persisted at add-source time.
        playlist = await playlistsStore.getForSource(source.id);
        if (!playlist) {
          throw new Error(
            'No cached playlist for this source. Re-add it to refresh the snapshot.'
          );
        }
      }

      const liveGroups = playlist.groups.filter((g) => g.kind === 'live');
      const activeGroupId = liveGroups[0]?.id ?? null;

      set({
        status: 'ready',
        playlist,
        liveGroups,
        activeGroupId,
        searchQuery: '',
        error: null,
      });
    } catch (error) {
      // If a newer load already replaced this source, swallow the stale error.
      if (get().sourceId !== source.id) return;
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to load catalog.',
      });
    }
  },

  setActiveGroup(groupId) {
    if (!get().liveGroups.some((g) => g.id === groupId)) return;
    set({ activeGroupId: groupId });
  },

  setSearch(query) {
    set({ searchQuery: query });
  },

  clear() {
    set({
      sourceId: null,
      status: 'idle',
      error: null,
      playlist: null,
      liveGroups: [],
      activeGroupId: null,
      searchQuery: '',
    });
  },
}));

// ---------------------------------------------------------------------------
// Selectors — keep derived data off the store body so re-renders stay tight.
// ---------------------------------------------------------------------------

/** Live channels in the active group (or empty when no group is active). */
export function selectActiveGroupChannels(state: CatalogState): Channel[] {
  if (!state.activeGroupId) return [];
  const group = state.liveGroups.find((g) => g.id === state.activeGroupId);
  return group?.channels ?? [];
}

/** Active-group channels filtered by `searchQuery` (case-insensitive substring). */
export function selectVisibleChannels(state: CatalogState): Channel[] {
  const channels = selectActiveGroupChannels(state);
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) return channels;
  return channels.filter((c) => c.name.toLowerCase().includes(q));
}
