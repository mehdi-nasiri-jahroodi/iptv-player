import { describe, expect, it } from 'vitest';
import { parseM3uToPlaylist } from './m3u';
import {
  channelSchema,
  liveChannelSchema,
  seriesChannelSchema,
  sourceSchema,
  vodChannelSchema,
  xtreamCategoryListSchema,
  xtreamLiveStreamListSchema,
  xtreamPlayerApiSchema,
  xtreamSeriesInfoSchema,
  xtreamShortEpgSchema,
  xtreamVodInfoSchema,
  xtreamVodStreamListSchema,
} from './contracts';
import {
  buildCatchupUrl,
  buildLiveStreamUrl,
  buildPlayerApiUrl,
  buildSeriesEpisodeUrl,
  buildVodStreamUrl,
  categoryNameById,
  decodeXtreamEpgEntry,
  isXtreamAuthSuccessful,
  loadXtreamPlaylist,
  mergeVodChannelWithXtreamInfo,
  toLiveChannel,
  toSeriesChannel,
  toVodChannel,
} from './xtream';
import { validateSource } from './source-validator';
import { core } from './core';

const credentials = {
  host: 'https://provider.example.com:8080',
  username: 'user',
  password: 'pass',
};

describe('core', () => {
  it('should work', () => {
    expect(core()).toEqual('core');
  });
});

describe('Source contract', () => {
  it('parses an m3u_url source', () => {
    const parsed = sourceSchema.parse({
      id: 'src-1',
      label: 'Provider A',
      type: 'm3u_url',
      url: 'https://example.com/list.m3u',
    });
    expect(parsed.type).toBe('m3u_url');
  });

  it('rejects xtream source without credentials', () => {
    expect(() =>
      sourceSchema.parse({ id: 's', label: 'X', type: 'xtream' })
    ).toThrow();
  });
});

describe('Channel discriminated union', () => {
  it('narrows on type=live', () => {
    const live = channelSchema.parse({
      type: 'live',
      id: 'c1',
      name: 'News 24',
      groupTitle: 'News',
      streamUrl: 'https://example.com/live/1.m3u8',
      tvgId: 'news.24',
    });
    expect(live.type).toBe('live');
    if (live.type === 'live') {
      expect(live.tvgId).toBe('news.24');
    }
  });

  it('parses a series with seasons', () => {
    const series = seriesChannelSchema.parse({
      type: 'series',
      id: 'sr1',
      name: 'Show',
      groupTitle: 'Drama',
      seasons: [
        {
          seasonNumber: 1,
          episodes: [
            {
              id: 'e1',
              episodeNumber: 1,
              title: 'Pilot',
              streamUrl: 'https://example.com/series/1.mp4',
            },
          ],
        },
      ],
    });
    expect(series.seasons[0].episodes[0].title).toBe('Pilot');
  });
});

describe('M3U parser', () => {
  it('parses extended attributes including catchup', () => {
    const playlist = parseM3uToPlaylist(
      `#EXTM3U
#EXTINF:-1 tvg-id="news.1" tvg-logo="https://img.example/news.png" group-title="News" catchup="default" catchup-days="7",Daily News
https://streams.example/live/news
#EXTINF:-1 group-title="Sports",Match TV
https://streams.example/live/sports`,
      'source-42'
    );
    expect(playlist.groups).toHaveLength(2);
    expect(playlist.groups[0].kind).toBe('live');
    const news = playlist.groups[0].channels[0];
    expect(news.name).toBe('Daily News');
    if (news.type === 'live') {
      expect(news.catchupMode).toBe('default');
      expect(news.catchupDays).toBe(7);
    }
  });
});

describe('Xtream wire schemas', () => {
  it('accepts auth as string or number', () => {
    const a = xtreamPlayerApiSchema.parse({ user_info: { auth: 1 } });
    const b = xtreamPlayerApiSchema.parse({ user_info: { auth: '1' } });
    expect(isXtreamAuthSuccessful(a)).toBe(true);
    expect(isXtreamAuthSuccessful(b)).toBe(true);
    expect(
      isXtreamAuthSuccessful(xtreamPlayerApiSchema.parse({ user_info: { auth: 0 } }))
    ).toBe(false);
  });

  it('parses a category list with mixed string/number ids', () => {
    const cats = xtreamCategoryListSchema.parse([
      { category_id: '1', category_name: 'Sports' },
      { category_id: 2, category_name: 'News' },
    ]);
    expect(cats).toHaveLength(2);
  });

  it('parses a live stream list with extra panel-specific fields', () => {
    const list = xtreamLiveStreamListSchema.parse([
      {
        stream_id: 1234,
        name: 'Channel 1',
        stream_icon: 'https://logo.example/1.png',
        epg_channel_id: 'ch1',
        category_id: '1',
        tv_archive: 1,
        tv_archive_duration: '7',
        custom_panel_field: 'kept-by-passthrough',
      },
    ]);
    expect(list[0].stream_id).toBe(1234);
  });

  it('parses a vod stream list', () => {
    const list = xtreamVodStreamListSchema.parse([
      {
        stream_id: '5',
        name: 'Movie',
        container_extension: 'mkv',
        category_id: '10',
      },
    ]);
    expect(list[0].name).toBe('Movie');
  });

  it('parses series info with episode map', () => {
    const info = xtreamSeriesInfoSchema.parse({
      info: { name: 'Show', plot: 'A plot' },
      seasons: [{ season_number: 1, name: 'Season 1' }],
      episodes: {
        '1': [
          {
            id: 99,
            episode_num: 1,
            title: 'Pilot',
            container_extension: 'mp4',
            info: { duration_secs: 1800 },
          },
        ],
      },
    });
    expect(info.episodes?.['1']?.[0].title).toBe('Pilot');
  });

  it('parses short EPG envelope', () => {
    const epg = xtreamShortEpgSchema.parse({
      epg_listings: [
        {
          // base64("Hello")
          title: 'SGVsbG8=',
          start: '2026-01-01 10:00:00',
          end: '2026-01-01 11:00:00',
        },
      ],
    });
    expect(epg.epg_listings).toHaveLength(1);
  });
});

describe('Xtream URL builders', () => {
  it('builds a player_api URL with action and params', () => {
    const url = buildPlayerApiUrl(credentials, 'get_short_epg', { stream_id: 7, limit: 5 });
    expect(url).toContain('/player_api.php');
    expect(url).toContain('username=user');
    expect(url).toContain('password=pass');
    expect(url).toContain('action=get_short_epg');
    expect(url).toContain('stream_id=7');
    expect(url).toContain('limit=5');
  });

  it('builds live, vod, series, and catchup URLs', () => {
    expect(buildLiveStreamUrl(credentials, 42)).toBe(
      'https://provider.example.com:8080/live/user/pass/42.m3u8'
    );
    expect(buildVodStreamUrl(credentials, 11, 'mkv')).toBe(
      'https://provider.example.com:8080/movie/user/pass/11.mkv'
    );
    expect(buildSeriesEpisodeUrl(credentials, 'ep-9', 'mp4')).toBe(
      'https://provider.example.com:8080/series/user/pass/ep-9.mp4'
    );

    const start = new Date(Date.UTC(2026, 0, 2, 13, 30));
    expect(buildCatchupUrl(credentials, 7, start, 60)).toBe(
      'https://provider.example.com:8080/timeshift/user/pass/60/2026-01-02:13-30/7.ts'
    );
    const phpStyle = buildCatchupUrl(credentials, 7, start, 60, 'timeshift_php');
    expect(phpStyle).toContain('/streaming/timeshift.php');
    expect(phpStyle).toContain('start=2026-01-02%3A13-30');
  });

  it('strips trailing slash from host', () => {
    const url = buildLiveStreamUrl({ ...credentials, host: 'https://provider.example.com:8080/' }, 1);
    expect(url).toBe('https://provider.example.com:8080/live/user/pass/1.m3u8');
  });

  it('sanitizes leading/trailing whitespace and zero-width chars in credentials', () => {
    // Real-world bug: a stored host like ' http://example.com:8080' (leading
    // space) sails through `z.string().url()` validation and ends up in the
    // built stream URL, which Shaka rejects with UNSUPPORTED_SCHEME (1000).
    expect(
      buildLiveStreamUrl(
        { host: ' https://provider.example.com:8080 ', username: ' user ', password: '\tpass\n' },
        42
      )
    ).toBe('https://provider.example.com:8080/live/user/pass/42.m3u8');

    // Zero-width space + BOM survive String.prototype.trim and must also be
    // scrubbed.
    expect(
      buildLiveStreamUrl(
        {
          host: '\u200Bhttps://provider.example.com:8080\uFEFF',
          username: 'user',
          password: 'pass',
        },
        42
      )
    ).toBe('https://provider.example.com:8080/live/user/pass/42.m3u8');
  });
});

describe('Xtream → domain mappers', () => {
  const cats = xtreamCategoryListSchema.parse([
    { category_id: '1', category_name: 'News' },
    { category_id: '2', category_name: 'Movies' },
  ]);
  const catMap = categoryNameById(cats);

  it('maps a live stream to a LiveChannel', () => {
    const raw = xtreamLiveStreamListSchema.parse([
      {
        stream_id: 100,
        name: 'News HD',
        stream_icon: 'https://logo.example/news.png',
        epg_channel_id: 'news.hd',
        category_id: '1',
        tv_archive: 3,
      },
    ])[0];
    const channel = toLiveChannel(credentials, raw, catMap);
    expect(liveChannelSchema.parse(channel).id).toBe('xtream:live:100');
    expect(channel.groupTitle).toBe('News');
    expect(channel.catchupMode).toBe('xtream');
    expect(channel.catchupDays).toBe(3);
    expect(channel.streamUrl).toContain('/live/user/pass/100.m3u8');
  });

  // Regression: real Xtream panels return `null` for unset optional string
  // fields (custom_sid, epg_channel_id, stream_icon, …). Earlier `.optional()`
  // schemas crashed catalog loads with "Expected string, received null".
  it('accepts null on optional string fields and drops invalid logo URLs', () => {
    const raw = xtreamLiveStreamListSchema.parse([
      {
        stream_id: 101,
        name: 'Channel With Nulls',
        stream_icon: null,
        epg_channel_id: null,
        custom_sid: null,
        direct_source: null,
        stream_type: null,
        category_id: null,
        tv_archive: null,
        tv_archive_duration: null,
      },
      {
        stream_id: 102,
        name: 'Channel With Relative Logo',
        stream_icon: '/relative/logo.png',
      },
    ]);
    expect(raw[0].custom_sid).toBeNull();
    const a = toLiveChannel(credentials, raw[0], catMap);
    expect(a.logoUrl).toBeUndefined();
    expect(a.tvgId).toBeUndefined();
    expect(a.catchupMode).toBeUndefined();
    expect(a.groupTitle).toBe('Ungrouped');
    const b = toLiveChannel(credentials, raw[1], catMap);
    // Relative paths are not valid `z.string().url()`; coerce to undefined.
    expect(b.logoUrl).toBeUndefined();
  });

  it('maps a vod stream to a VodChannel with container extension', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '200',
        name: 'Some Movie',
        container_extension: 'mkv',
        category_id: '2',
        rating: '7.5',
      },
    ])[0];
    const channel = toVodChannel(credentials, raw, catMap);
    expect(vodChannelSchema.parse(channel).id).toBe('xtream:vod:200');
    expect(channel.groupTitle).toBe('Movies');
    expect(channel.containerExtension).toBe('mkv');
    expect(channel.streamUrl).toContain('/movie/user/pass/200.mkv');
    expect(channel.rating).toBe(7.5);
  });

  it('maps Xtream VOD added timestamp and prefers rating_5based over rating', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '202',
        name: 'Dated Movie',
        container_extension: 'mp4',
        category_id: '2',
        rating: '10',
        rating_5based: '4.5',
        added: '1714147200',
      },
    ])[0];
    const channel = toVodChannel(credentials, raw, catMap);
    expect(channel.xtreamAddedAtSec).toBe(1714147200);
    expect(channel.rating).toBe(4.5);
  });

  it('maps genre, year, and duration from Xtream VOD stream row when present', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '203',
        name: 'Tagged (2024)',
        container_extension: 'mp4',
        category_id: '2',
        genre: 'Action, Sci-Fi',
        year: '2024',
        duration_secs: '6200',
      },
    ])[0];
    const channel = toVodChannel(credentials, raw, catMap);
    expect(channel.genre).toBe('Action, Sci-Fi');
    expect(channel.year).toBe(2024);
    expect(channel.durationSeconds).toBe(6200);
  });

  it('derives year from VOD title when stream row has no year field', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '204',
        name: 'Legacy Title (2019)',
        container_extension: 'mp4',
        category_id: '2',
      },
    ])[0];
    const channel = toVodChannel(credentials, raw, catMap);
    expect(channel.year).toBe(2019);
  });

  it('derives year from trailing calendar year in VOD title', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '205',
        name: 'Multi | Roommates 2026',
        container_extension: 'mp4',
        category_id: '2',
      },
    ])[0];
    const channel = toVodChannel(credentials, raw, catMap);
    expect(channel.year).toBe(2026);
  });

  it('maps VOD duration from human-readable stream duration when secs missing', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '206',
        name: 'Runtime Movie',
        container_extension: 'mp4',
        category_id: '2',
        duration: '1h 47m',
      },
    ])[0];
    const channel = toVodChannel(credentials, raw, catMap);
    expect(channel.durationSeconds).toBe(3600 + 47 * 60);
  });

  it('merges Xtream vod_info into an existing VodChannel', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '201',
        name: 'Merged Movie',
        container_extension: 'mp4',
        category_id: '2',
      },
    ])[0];
    const base = toVodChannel(credentials, raw, catMap);
    const detail = xtreamVodInfoSchema.parse({
      info: {
        plot: 'A spy thriller.',
        cast: 'Actor A, Actor B',
        director: 'Director X',
        genre: 'Action',
        releasedate: '2019-03-15',
        rating: '8.2',
        duration_secs: 5400,
        youtube_trailer: 'dQw4w9WgXcQ',
        movie_image: 'https://img.example/poster.jpg',
        backdrop_path: ['https://img.example/backdrop.jpg'],
      },
    });
    const merged = mergeVodChannelWithXtreamInfo(base, detail);
    expect(merged.streamUrl).toBe(base.streamUrl);
    expect(merged.plot).toBe('A spy thriller.');
    expect(merged.cast).toBe('Actor A, Actor B');
    expect(merged.year).toBe(2019);
    expect(merged.durationSeconds).toBe(5400);
    expect(merged.trailerUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(merged.posterUrl).toBe('https://img.example/poster.jpg');
    expect(merged.backdropUrl).toBe('https://img.example/backdrop.jpg');
  });

  it('prefers rating_5based from vod_info when both ratings exist', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '207',
        name: 'Rated Movie',
        container_extension: 'mp4',
        category_id: '2',
        rating: '9.0',
        rating_5based: '3.0',
      },
    ])[0];
    const base = toVodChannel(credentials, raw, catMap);
    const detail = xtreamVodInfoSchema.parse({
      info: {
        rating: '6.8',
        rating_5based: '4.1',
        duration_secs: 120,
      },
    });
    const merged = mergeVodChannelWithXtreamInfo(base, detail);
    expect(merged.rating).toBe(4.1);
  });

  it('merges duration from vod_info text when duration_secs missing', () => {
    const raw = xtreamVodStreamListSchema.parse([
      {
        stream_id: '208',
        name: 'Text Runtime',
        container_extension: 'mp4',
        category_id: '2',
      },
    ])[0];
    const base = toVodChannel(credentials, raw, catMap);
    const detail = xtreamVodInfoSchema.parse({
      info: {
        duration: '90 min',
      },
    });
    const merged = mergeVodChannelWithXtreamInfo(base, detail);
    expect(merged.durationSeconds).toBe(5400);
  });

  it('maps a series listing + info into a SeriesChannel', () => {
    const listing = {
      series_id: 300,
      name: 'My Show',
      cover: 'https://img.example/show.jpg',
      plot: 'A plot',
      category_id: '2',
    };
    const info = xtreamSeriesInfoSchema.parse({
      info: { name: 'My Show', plot: 'A plot' },
      seasons: [{ season_number: 1, name: 'Season 1' }],
      episodes: {
        '1': [
          { id: 9001, episode_num: 1, title: 'Pilot', container_extension: 'mp4' },
          { id: 9002, episode_num: 2, title: 'Second', container_extension: 'mp4' },
        ],
        '2': [
          { id: 9101, episode_num: 1, title: 'S2E1', container_extension: 'mp4' },
        ],
      },
    });
    const series = toSeriesChannel(credentials, listing as never, info, catMap);
    expect(seriesChannelSchema.parse(series).id).toBe('xtream:series:300');
    expect(series.seasons).toHaveLength(2);
    expect(series.seasons[0].episodes).toHaveLength(2);
    expect(series.seasons[0].episodes[0].streamUrl).toContain('/series/user/pass/9001.mp4');
  });
});

describe('Xtream EPG decoding', () => {
  it('base64-decodes title and description and normalises dates', () => {
    // base64("Morning News") and base64("Top stories of the day")
    const program = decodeXtreamEpgEntry('xtream:live:1', {
      title: 'TW9ybmluZyBOZXdz',
      description: 'VG9wIHN0b3JpZXMgb2YgdGhlIGRheQ==',
      start: '2026-01-01 09:00:00',
      end: '2026-01-01 10:00:00',
      start_timestamp: '1767258000',
      stop_timestamp: '1767261600',
    });
    expect(program.title).toBe('Morning News');
    expect(program.description).toBe('Top stories of the day');
    expect(program.start).toBe(new Date(1767258000 * 1000).toISOString());
    expect(program.end).toBe(new Date(1767261600 * 1000).toISOString());
  });

  it('falls back to date string when no timestamp is provided', () => {
    const program = decodeXtreamEpgEntry('xtream:live:1', {
      title: 'SGVsbG8=',
      start: '2026-06-15 12:00:00',
      end: '2026-06-15 13:00:00',
    });
    expect(program.start).toBe(new Date('2026-06-15T12:00:00Z').toISOString());
  });
});

// ---------------------------------------------------------------------------
// Mock Xtream HTTP layer used by both `loadXtreamPlaylist` and the validator.
// ---------------------------------------------------------------------------

interface MockResponses {
  player_api?: unknown;
  get_live_categories?: unknown;
  get_live_streams?: unknown;
  get_vod_categories?: unknown;
  get_vod_streams?: unknown;
  get_series_categories?: unknown;
  get_series?: unknown;
  /** Keyed by series_id (string). */
  get_series_info?: Record<string, unknown>;
  /** If set, all calls reject with this error. */
  fail?: Error;
  /** If set, return non-JSON text body. */
  rawText?: string;
}

function makeMockFetcher(responses: MockResponses) {
  return async (url: string) => {
    if (responses.fail) throw responses.fail;
    const u = new URL(url);
    const action = u.searchParams.get('action');
    let body: unknown;
    if (!action) {
      body = responses.player_api ?? { user_info: { auth: 1 } };
    } else if (action === 'get_series_info') {
      const sid = u.searchParams.get('series_id') ?? '';
      body = responses.get_series_info?.[sid] ?? { seasons: [], episodes: {} };
    } else {
      body = (responses as Record<string, unknown>)[action] ?? [];
    }
    const text = responses.rawText ?? JSON.stringify(body);
    return { ok: true, status: 200, text: async () => text };
  };
}

describe('loadXtreamPlaylist', () => {
  it('assembles live + vod + series groups with correct kinds', async () => {
    const fetcher = makeMockFetcher({
      get_live_categories: [
        { category_id: '1', category_name: 'News' },
        { category_id: '2', category_name: 'Sports' },
      ],
      get_live_streams: [
        { stream_id: 10, name: 'News HD', category_id: '1', tv_archive: 3 },
        { stream_id: 11, name: 'Sport 1', category_id: '2' },
      ],
      get_vod_categories: [{ category_id: '20', category_name: 'Movies' }],
      get_vod_streams: [
        { stream_id: 100, name: 'Film A', container_extension: 'mkv', category_id: '20' },
      ],
      get_series_categories: [{ category_id: '30', category_name: 'Drama' }],
      get_series: [{ series_id: 500, name: 'Show A', category_id: '30' }],
    });

    const playlist = await loadXtreamPlaylist(credentials, fetcher, {
      sourceId: 'src-1',
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    expect(playlist.sourceId).toBe('src-1');
    expect(playlist.fetchedAt).toBe('2026-01-01T00:00:00.000Z');

    const kinds = playlist.groups.map((g) => g.kind);
    expect(kinds).toEqual(['live', 'live', 'vod', 'series']);

    const news = playlist.groups.find((g) => g.name === 'News');
    expect(news?.channels).toHaveLength(1);
    expect(news?.channels[0].type).toBe('live');

    const movies = playlist.groups.find((g) => g.name === 'Movies');
    const movie = movies?.channels[0];
    expect(movie?.type).toBe('vod');
    if (movie?.type === 'vod') {
      expect(movie.streamUrl).toContain('/movie/user/pass/100.mkv');
    }

    const drama = playlist.groups.find((g) => g.name === 'Drama');
    const show = drama?.channels[0];
    expect(show?.type).toBe('series');
    if (show?.type === 'series') {
      // Without `includeSeriesDetail`, seasons are empty (lazy-load later).
      expect(show.seasons).toEqual([]);
    }
  });

  it('expands series detail when includeSeriesDetail=true', async () => {
    const fetcher = makeMockFetcher({
      get_live_categories: [],
      get_live_streams: [],
      get_vod_categories: [],
      get_vod_streams: [],
      get_series_categories: [{ category_id: '1', category_name: 'Drama' }],
      get_series: [
        { series_id: 1, name: 'A', category_id: '1' },
        { series_id: 2, name: 'B', category_id: '1' },
      ],
      get_series_info: {
        '1': {
          seasons: [{ season_number: 1, name: 'S1' }],
          episodes: { '1': [{ id: 11, episode_num: 1, title: 'A-S1E1', container_extension: 'mp4' }] },
        },
        '2': {
          seasons: [{ season_number: 1 }],
          episodes: { '1': [{ id: 21, episode_num: 1, title: 'B-S1E1', container_extension: 'mp4' }] },
        },
      },
    });

    const playlist = await loadXtreamPlaylist(credentials, fetcher, {
      sourceId: 'src',
      includeSeriesDetail: true,
    });

    const drama = playlist.groups.find((g) => g.name === 'Drama');
    expect(drama).toBeDefined();
    expect(drama?.channels).toHaveLength(2);
    for (const ch of drama?.channels ?? []) {
      expect(ch.type).toBe('series');
      if (ch.type === 'series') {
        expect(ch.seasons[0].episodes).toHaveLength(1);
      }
    }
  });

  it('preserves provider category order', async () => {
    const fetcher = makeMockFetcher({
      get_live_categories: [
        { category_id: 'a', category_name: 'Zulu' },
        { category_id: 'b', category_name: 'Alpha' },
      ],
      get_live_streams: [
        { stream_id: 1, name: 'one', category_id: 'a' },
        { stream_id: 2, name: 'two', category_id: 'b' },
      ],
      get_vod_categories: [],
      get_vod_streams: [],
      get_series_categories: [],
      get_series: [],
    });
    const playlist = await loadXtreamPlaylist(credentials, fetcher, { sourceId: 's' });
    expect(playlist.groups.map((g) => g.name)).toEqual(['Zulu', 'Alpha']);
  });
});

describe('validateSource — Xtream', () => {
  const xtreamSource = {
    id: 's',
    label: 'Provider',
    type: 'xtream' as const,
    credentials,
  };

  it('returns ok when auth=1', async () => {
    const fetcher = makeMockFetcher({ player_api: { user_info: { auth: 1 } } });
    const result = await validateSource(xtreamSource, { fetcher });
    expect(result.ok).toBe(true);
  });

  it('returns auth_failed when auth=0', async () => {
    const fetcher = makeMockFetcher({ player_api: { user_info: { auth: 0 } } });
    const result = await validateSource(xtreamSource, { fetcher });
    expect(result).toMatchObject({ ok: false, code: 'auth_failed' });
  });

  it('returns unexpected_payload when body is not JSON', async () => {
    const fetcher = makeMockFetcher({ rawText: '<html>blocked</html>' });
    const result = await validateSource(xtreamSource, { fetcher });
    expect(result).toMatchObject({ ok: false, code: 'unexpected_payload' });
  });

  it('returns unexpected_payload when JSON does not match schema', async () => {
    const bad = makeMockFetcher({ player_api: { user_info: { auth: { nested: true } } } });
    const result = await validateSource(xtreamSource, { fetcher: bad });
    expect(result).toMatchObject({ ok: false, code: 'unexpected_payload' });
  });

  it('returns unreachable when fetcher rejects', async () => {
    const fetcher = makeMockFetcher({ fail: new Error('ECONNREFUSED 1.2.3.4:8080') });
    const result = await validateSource(xtreamSource, { fetcher });
    expect(result).toMatchObject({ ok: false, code: 'unreachable' });
  });

  it('returns cors_blocked when fetcher rejects with CORS message', async () => {
    const fetcher = makeMockFetcher({ fail: new Error('Blocked by CORS policy') });
    const result = await validateSource(xtreamSource, { fetcher });
    expect(result).toMatchObject({ ok: false, code: 'cors_blocked' });
  });
});
