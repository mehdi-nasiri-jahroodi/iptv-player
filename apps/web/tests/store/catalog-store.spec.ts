import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createCachingXtreamFetcher,
  InMemoryStorageAdapter,
  parseM3uToPlaylist,
  type Source,
} from 'core';
import {
  selectChannelCount,
  useCatalogStore,
} from '../../app/store/catalog-store';
import { PlaylistsStore } from '../../app/features/sources/playlists-storage';

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 group-title="News",News One
https://example.com/news1.m3u8
#EXTINF:-1 group-title="News",News Two
https://example.com/news2.m3u8
#EXTINF:-1 group-title="Sports",Sports One
https://example.com/sports1.m3u8
`;

const M3U_SOURCE: Source = {
  id: 'src_m3u',
  label: 'Local M3U',
  type: 'm3u_url',
  url: 'https://example.com/playlist.m3u',
};

beforeEach(() => {
  useCatalogStore.getState().clear();
});

afterEach(() => {
  useCatalogStore.getState().clear();
});

describe('catalogStore — m3u sources', () => {
  test('loads from the snapshot store, buckets groups by kind, and primes active groups', async () => {
    const storage = new InMemoryStorageAdapter();
    const playlistsStore = new PlaylistsStore(storage);
    await playlistsStore.setForSource(
      'src_m3u',
      parseM3uToPlaylist(SAMPLE_M3U, 'src_m3u')
    );

    await useCatalogStore
      .getState()
      .loadForSource(M3U_SOURCE, {}, { playlistsStore });

    const state = useCatalogStore.getState();
    expect(state.status).toBe('ready');
    expect(state.sourceId).toBe('src_m3u');
    expect(state.groupsByKind.live).toHaveLength(2);
    expect(state.groupsByKind.vod).toHaveLength(0);
    expect(state.groupsByKind.series).toHaveLength(0);
    expect(state.activeGroupByKind.live).not.toBeNull();
    expect(state.activeGroupByKind.vod).toBeNull();
    expect(selectChannelCount(state, 'live')).toBe(3);
    expect(state.error).toBeNull();
  });

  test('reports an error when no snapshot exists', async () => {
    const storage = new InMemoryStorageAdapter();
    const playlistsStore = new PlaylistsStore(storage);

    await useCatalogStore
      .getState()
      .loadForSource(M3U_SOURCE, {}, { playlistsStore });

    const state = useCatalogStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatch(/No cached playlist/i);
  });

  test('setSearch and setActiveGroup(kind, id) update the right slice', async () => {
    const storage = new InMemoryStorageAdapter();
    const playlistsStore = new PlaylistsStore(storage);
    await playlistsStore.setForSource(
      'src_m3u',
      parseM3uToPlaylist(SAMPLE_M3U, 'src_m3u')
    );

    await useCatalogStore
      .getState()
      .loadForSource(M3U_SOURCE, {}, { playlistsStore });

    const liveGroups = useCatalogStore.getState().groupsByKind.live;
    const sportsGroup = liveGroups.find((g) => g.name === 'Sports');
    if (!sportsGroup) throw new Error('expected a "Sports" group in the seeded playlist');

    useCatalogStore.getState().setActiveGroup('live', sportsGroup.id);
    expect(useCatalogStore.getState().activeGroupByKind.live).toBe(sportsGroup.id);
    // Other kinds are untouched.
    expect(useCatalogStore.getState().activeGroupByKind.vod).toBeNull();

    useCatalogStore.getState().setSearch('news');
    expect(useCatalogStore.getState().searchQuery).toBe('news');
  });
});

describe('catalogStore — xtream sources', () => {
  test('errors when credentials are missing', async () => {
    const xtreamSource: Source = {
      id: 'src_xt',
      label: 'Xtream',
      type: 'xtream',
      // @ts-expect-error — exercising defensive guard; schema would normally reject.
      credentials: undefined,
    };

    await useCatalogStore.getState().loadForSource(xtreamSource);

    const state = useCatalogStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatch(/credentials/i);
  });

  test('uses the injected xtreamFetcher and parses a minimal catalog', async () => {
    const xtreamFetcher = vi.fn(async (url: string) => {
      const u = new URL(url);
      const action = u.searchParams.get('action');
      const body = (() => {
        switch (action) {
          case 'get_live_categories':
            return JSON.stringify([
              { category_id: '1', category_name: 'News' },
            ]);
          case 'get_live_streams':
            return JSON.stringify([
              {
                stream_id: 100,
                name: 'Channel 1',
                category_id: '1',
                stream_icon: 'https://example.com/c1.png',
                // Real Xtream panels send null for unset optional strings —
                // exercise that path here too so the schema fix stays alive.
                custom_sid: null,
              },
            ]);
          case 'get_vod_categories':
          case 'get_series_categories':
            return JSON.stringify([]);
          case 'get_vod_streams':
          case 'get_series':
            return JSON.stringify([]);
          default:
            return JSON.stringify({});
        }
      })();
      return { text: async () => body };
    });

    const xtreamSource: Source = {
      id: 'src_xt',
      label: 'Xtream',
      type: 'xtream',
      credentials: {
        host: 'https://example.com',
        username: 'u',
        password: 'p',
      },
    };

    await useCatalogStore
      .getState()
      .loadForSource(xtreamSource, {}, { xtreamFetcher });

    const state = useCatalogStore.getState();
    expect(state.status).toBe('ready');
    expect(state.groupsByKind.live).toHaveLength(1);
    expect(state.groupsByKind.live[0].name).toBe('News');
    expect(state.groupsByKind.live[0].channels).toHaveLength(1);
  });

  test('force: true invalidates the matching account in a CachingXtreamFetcher before reloading', async () => {
    // Build a real caching wrapper around a counted fetcher so we can prove
    // that the second load issues fresh requests (no cache hits).
    const inner = vi.fn(async (u: string) => {
      const action = new URL(u).searchParams.get('action');
      const body = (() => {
        switch (action) {
          case 'get_live_categories':
            return JSON.stringify([{ category_id: '1', category_name: 'News' }]);
          case 'get_live_streams':
            return JSON.stringify([
              { stream_id: 100, name: 'Channel 1', category_id: '1' },
            ]);
          default:
            return JSON.stringify([]);
        }
      })();
      return { text: async () => body };
    });
    const xtreamFetcher = createCachingXtreamFetcher(inner);

    const xtreamSource: Source = {
      id: 'src_xt',
      label: 'Xtream',
      type: 'xtream',
      credentials: {
        host: 'https://example.com',
        username: 'u',
        password: 'p',
      },
    };

    // First load — every action misses, then populates the cache.
    await useCatalogStore
      .getState()
      .loadForSource(xtreamSource, {}, { xtreamFetcher });
    const callsAfterFirst = inner.mock.calls.length;

    // Second load WITHOUT force — every cacheable action returns from the
    // cache, so the inner fetcher count stays put.
    await useCatalogStore
      .getState()
      .loadForSource(xtreamSource, {}, { xtreamFetcher });
    expect(inner.mock.calls.length).toBe(callsAfterFirst);

    // Third load WITH force — the matching account's entries get evicted
    // before the load, so every action goes back to the network.
    await useCatalogStore
      .getState()
      .loadForSource(xtreamSource, { force: true }, { xtreamFetcher });
    expect(inner.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
