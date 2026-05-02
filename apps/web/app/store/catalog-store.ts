import { create } from 'zustand';
import {
  buildPlayerApiUrl,
  createCachingXtreamFetcher,
  loadXtreamPlaylist,
  type CachingXtreamFetcher,
  type Channel,
  type ChannelGroup,
  type Playlist,
  type Source,
  type XtreamFetcher,
} from 'core';
import { buildSignedProxyUrl } from 'player';
import { PlaylistsStore } from '../features/sources/playlists-storage';
import { createIndexedDBCacheStorage } from '../features/cache/indexeddb-cache-storage';
import { useSettingsStore, hasStreamProxy } from './settings-store';

/**
 * catalogStore — the active source's parsed playlist plus browse-time state
 * (current group, search query). Lives in `apps/web/app/store/` so the slice
 * can be re-used by future routes (`/play/:id`, `/dev/play-test`) without
 * pulling presentation logic from `pages/`.
 *
 * Loading strategy per source type:
 *   - `m3u_url`, `m3u_file` → read the persisted snapshot from `PlaylistsStore`
 *     (seeded when a source is added from Settings). M3U file imports
 *     have no other source of truth; URL imports treat the snapshot as a cache.
 *   - `xtream` → live `loadXtreamPlaylist(...)` call against the panel; the
 *     credentials live on the `Source` so we never persist signed stream URLs.
 *
 * Browse model: the catalog exposes one bucket of groups per `ChannelKind`
 * (`live`, `vod`, `series`). The Phase 2 home screen launches into a per-kind
 * page (`/browse/:kind`); each page reads its own bucket and tracks one
 * `activeGroupId` per kind so navigating between kinds restores the user's
 * previous group selection.
 */

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ChannelKind = 'live' | 'vod' | 'series';
export const CHANNEL_KINDS: ChannelKind[] = ['live', 'vod', 'series'];

export type GroupsByKind = Record<ChannelKind, ChannelGroup[]>;
export type ActiveGroupByKind = Record<ChannelKind, string | null>;

const EMPTY_GROUPS_BY_KIND: GroupsByKind = { live: [], vod: [], series: [] };
const EMPTY_ACTIVE_GROUP: ActiveGroupByKind = { live: null, vod: null, series: null };

export interface CatalogState {
  /** Current source the catalog is loaded for; null until `loadForSource` runs. */
  sourceId: string | null;
  status: CatalogStatus;
  error: string | null;
  /** Full parsed playlist (all kinds: live + vod + series). */
  playlist: Playlist | null;
  /** Groups bucketed by `ChannelKind` (mixed-kind groups land in `live`). */
  groupsByKind: GroupsByKind;
  /** Currently selected group id per kind (defaults to the first of each kind). */
  activeGroupByKind: ActiveGroupByKind;
  /** Free-text filter; matched case-insensitively against `Channel.name`. */
  searchQuery: string;

  // ---- actions ---------------------------------------------------------------
  loadForSource(
    source: Source,
    options?: LoadForSourceOptions,
    deps?: CatalogStoreDeps
  ): Promise<void>;
  setActiveGroup(kind: ChannelKind, groupId: string): void;
  setSearch(query: string): void;
  clear(): void;
}

/** Per-call options for {@link CatalogState.loadForSource}. */
export interface LoadForSourceOptions {
  /**
   * When `true`, bypass the Xtream cache for this load and re-issue every API
   * request against the panel. Used by the Refresh button so users can force
   * a fresh catalog after editing channels in their provider's dashboard.
   * No-op for M3U sources (they read from the on-disk Playlist snapshot).
   */
  force?: boolean;
}

/**
 * Injectable side-effect deps. Tests pass an in-memory `PlaylistsStore` and a
 * mock `XtreamFetcher`; production calls fall back to live browser fetch and
 * the localStorage-backed snapshot store.
 *
 * `xtreamFetcher` is consumed as-is; if you want test calls to share the
 * production TTL cache you must inject the wrapped fetcher yourself. The
 * default production fetcher (used when no override is passed) IS wrapped
 * with `createCachingXtreamFetcher` so repeat catalog loads in the same tab
 * collapse to one network round-trip per Xtream action.
 */
export interface CatalogStoreDeps {
  playlistsStore?: PlaylistsStore;
  xtreamFetcher?: XtreamFetcher;
}

function rawXtreamFetcher(url: string): Promise<{ text(): Promise<string> }> {
  // If a stream proxy is configured, route every Xtream API call through it.
  // This bypasses CORS and mixed-content blocks when the panel is HTTP-only
  // and the page is served over HTTPS (e.g. GitHub Pages).
  const settings = useSettingsStore.getState();
  if (hasStreamProxy(settings) && settings.streamProxy) {
    const { baseUrl, secret, userAgent } = settings.streamProxy;
    return buildSignedProxyUrl({ baseUrl, secret, upstreamUrl: url, userAgent })
      .then((signed) => fetch(signed, { redirect: 'follow' }))
      .then((r) => ({ text: () => r.text() }));
  }
  return fetch(url, { redirect: 'follow' }).then((r) => ({ text: () => r.text() }));
}

/**
 * Module-singleton caching fetcher. One cache per tab — survives navigations
 * between Home and `/browse/:kind` AND survives page reloads via
 * IndexedDB persistence. The TTLs in `xtream-cache.ts` keep the on-disk
 * snapshot from going stale; manual refresh via `RefreshSourceButton`
 * still wipes the affected source's entries.
 *
 * In environments without IndexedDB (SSR, sandboxed iframes, private
 * mode in some browsers) the storage adapter degrades to a no-op and the
 * cache behaves like the previous in-memory-only version.
 */
const defaultCachingXtreamFetcher: CachingXtreamFetcher =
  createCachingXtreamFetcher(rawXtreamFetcher, {
    storage: createIndexedDBCacheStorage(),
  });

/** Exposed for tests + a future "clear cache" diagnostics action. */
export function _getDefaultXtreamCache(): CachingXtreamFetcher {
  return defaultCachingXtreamFetcher;
}

function isCachingFetcher(
  fetcher: XtreamFetcher
): fetcher is CachingXtreamFetcher {
  return (
    typeof (fetcher as Partial<CachingXtreamFetcher>).invalidateSource ===
    'function'
  );
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  sourceId: null,
  status: 'idle',
  error: null,
  playlist: null,
  groupsByKind: EMPTY_GROUPS_BY_KIND,
  activeGroupByKind: EMPTY_ACTIVE_GROUP,
  searchQuery: '',

  async loadForSource(source, options = {}, deps = {}) {
    set({
      sourceId: source.id,
      status: 'loading',
      error: null,
    });

    const playlistsStore = deps.playlistsStore ?? new PlaylistsStore();
    const xtreamFetcher = deps.xtreamFetcher ?? defaultCachingXtreamFetcher;

    // `force: true` bypasses the Xtream cache for this load. M3U sources are
    // unaffected (they read from a persisted snapshot, no HTTP).
    if (options.force && source.type === 'xtream' && source.credentials) {
      const cache = isCachingFetcher(xtreamFetcher) ? xtreamFetcher : null;
      if (cache) {
        cache.invalidateSource(buildPlayerApiUrl(source.credentials));
      }
    }

    try {
      let playlist: Playlist | null = null;

      if (source.type === 'xtream') {
        if (!source.credentials) {
          throw new Error('Xtream source is missing credentials.');
        }
        // Wait for the persistent cache to hydrate from IndexedDB before
        // we start any network requests, otherwise a reload races the
        // hydration and refetches everything before the on-disk
        // entries land in memory. `ready` resolves immediately when the
        // fetcher has no storage adapter (e.g. tests).
        if (isCachingFetcher(xtreamFetcher)) {
          await xtreamFetcher.ready;
        }
        playlist = await loadXtreamPlaylist(source.credentials, xtreamFetcher, {
          sourceId: source.id,
          // Skip per-series detail fanout on first load; the series surface in
          // Phase 4 will lazy-load info on demand.
          includeSeriesDetail: false,
        });
      } else {
        // m3u_url / m3u_file — read snapshot persisted when the source was added.
        playlist = await playlistsStore.getForSource(source.id);
        if (!playlist) {
          throw new Error(
            'No cached playlist for this source. Re-add it to refresh the snapshot.'
          );
        }
      }

      const groupsByKind = bucketGroupsByKind(playlist.groups);
      // Preserve the active group selection for each kind if the previously
      // active group still exists in the freshly loaded playlist — this keeps
      // the user's place when the same source is reloaded (e.g. back-navigation).
      const prevActive = get().activeGroupByKind;
      const activeGroupByKind: ActiveGroupByKind = {
        live: groupsByKind.live.some((g) => g.id === prevActive.live)
          ? prevActive.live
          : (groupsByKind.live[0]?.id ?? null),
        vod: groupsByKind.vod.some((g) => g.id === prevActive.vod)
          ? prevActive.vod
          : (groupsByKind.vod[0]?.id ?? null),
        series: groupsByKind.series.some((g) => g.id === prevActive.series)
          ? prevActive.series
          : (groupsByKind.series[0]?.id ?? null),
      };

      set({
        status: 'ready',
        playlist,
        groupsByKind,
        activeGroupByKind,
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

  setActiveGroup(kind, groupId) {
    const { groupsByKind, activeGroupByKind } = get();
    if (!groupsByKind[kind].some((g) => g.id === groupId)) return;
    set({
      activeGroupByKind: { ...activeGroupByKind, [kind]: groupId },
    });
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
      groupsByKind: EMPTY_GROUPS_BY_KIND,
      activeGroupByKind: EMPTY_ACTIVE_GROUP,
      searchQuery: '',
    });
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bucket a playlist's groups by their `kind`. Mixed-kind groups (rare, but
 * possible from M3U sources without explicit metadata) are surfaced under
 * `live` so they remain reachable from the existing live browser.
 */
export function bucketGroupsByKind(groups: ChannelGroup[]): GroupsByKind {
  const out: GroupsByKind = { live: [], vod: [], series: [] };
  for (const g of groups) {
    if (g.kind === 'vod' || g.kind === 'series' || g.kind === 'live') {
      out[g.kind].push(g);
    } else {
      // 'mixed' or unexpected kinds → live bucket so they aren't dropped.
      out.live.push(g);
    }
  }
  return out;
}

/** Total channel count across all groups of the given kind. */
export function selectChannelCount(state: CatalogState, kind: ChannelKind): number {
  let total = 0;
  for (const g of state.groupsByKind[kind]) total += g.channels.length;
  return total;
}

/** Channels in the active group of `kind` (or empty when no group is active). */
export function selectActiveGroupChannels(
  state: CatalogState,
  kind: ChannelKind
): Channel[] {
  const activeId = state.activeGroupByKind[kind];
  if (!activeId) return [];
  const group = state.groupsByKind[kind].find((g) => g.id === activeId);
  return group?.channels ?? [];
}

/** Active-group channels filtered by `searchQuery` (case-insensitive substring). */
export function selectVisibleChannels(
  state: CatalogState,
  kind: ChannelKind
): Channel[] {
  const channels = selectActiveGroupChannels(state, kind);
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) return channels;
  return channels.filter((c) => c.name.toLowerCase().includes(q));
}
