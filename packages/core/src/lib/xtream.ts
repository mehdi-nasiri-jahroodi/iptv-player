import {
  channelGroupSchema,
  liveChannelSchema,
  playlistSchema,
  seriesChannelSchema,
  vodChannelSchema,
  xtreamCategoryListSchema,
  xtreamLiveStreamListSchema,
  xtreamPlayerApiSchema,
  xtreamSeriesInfoSchema,
  xtreamSeriesListSchema,
  xtreamShortEpgSchema,
  xtreamVodInfoSchema,
  xtreamVodStreamListSchema,
  type Channel,
  type ChannelGroup,
  type EpgProgram,
  type LiveChannel,
  type Playlist,
  type SeriesChannel,
  type SeriesEpisode,
  type SeriesSeason,
  type VodChannel,
  type XtreamAction,
  type XtreamCategory,
  type XtreamCredentials,
  type XtreamLiveStream,
  type XtreamPlayerApi,
  type XtreamSeries,
  type XtreamSeriesInfo,
  type XtreamShortEpgEntry,
  type XtreamVodInfo,
  type XtreamVodStream,
} from './contracts';

// ---------------------------------------------------------------------------
// Wire-level fetcher
// ---------------------------------------------------------------------------

export type XtreamFetcher = (url: string) => Promise<{ text(): Promise<string> }>;

interface XtreamRequestOptions {
  /** Optional query-string params (e.g. category_id, stream_id, vod_id, series_id). */
  params?: Record<string, string | number | undefined>;
}

/**
 * Build the player_api.php URL for an Xtream action.
 * Public so that callers can inspect/log the URL before issuing the request.
 */
export function buildPlayerApiUrl(
  credentials: XtreamCredentials,
  action?: XtreamAction,
  params: Record<string, string | number | undefined> = {}
): string {
  const c = sanitizeCredentials(credentials);
  const url = new URL('/player_api.php', c.host);
  url.searchParams.set('username', c.username);
  url.searchParams.set('password', c.password);
  if (action) {
    url.searchParams.set('action', action);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Low-level request: fetch + JSON.parse. Schema validation is the caller's job. */
async function rawRequest(
  credentials: XtreamCredentials,
  action: XtreamAction | undefined,
  fetcher: XtreamFetcher,
  options: XtreamRequestOptions = {}
): Promise<unknown> {
  const url = buildPlayerApiUrl(credentials, action, options.params);
  const response = await fetcher(url);
  const body = await response.text();
  if (!body.trim()) {
    return null;
  }
  return JSON.parse(body) as unknown;
}

// ---------------------------------------------------------------------------
// Auth probe (Phase 1)
// ---------------------------------------------------------------------------

export async function fetchXtreamPlayerApi(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher
): Promise<XtreamPlayerApi> {
  const json = await rawRequest(credentials, undefined, fetcher);
  return xtreamPlayerApiSchema.parse(json);
}

export function isXtreamAuthSuccessful(payload: XtreamPlayerApi): boolean {
  const auth = payload.user_info?.auth;
  if (auth === 1) return true;
  if (typeof auth === 'string') return auth === '1';
  return false;
}

// ---------------------------------------------------------------------------
// Catalog endpoints
// ---------------------------------------------------------------------------

export async function fetchLiveCategories(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher
): Promise<XtreamCategory[]> {
  const json = await rawRequest(credentials, 'get_live_categories', fetcher);
  return xtreamCategoryListSchema.parse(json);
}

export async function fetchLiveStreams(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  options: { categoryId?: string | number } = {}
): Promise<XtreamLiveStream[]> {
  const json = await rawRequest(credentials, 'get_live_streams', fetcher, {
    params: { category_id: options.categoryId },
  });
  return xtreamLiveStreamListSchema.parse(json);
}

export async function fetchVodCategories(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher
): Promise<XtreamCategory[]> {
  const json = await rawRequest(credentials, 'get_vod_categories', fetcher);
  return xtreamCategoryListSchema.parse(json);
}

export async function fetchVodStreams(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  options: { categoryId?: string | number } = {}
): Promise<XtreamVodStream[]> {
  const json = await rawRequest(credentials, 'get_vod_streams', fetcher, {
    params: { category_id: options.categoryId },
  });
  return xtreamVodStreamListSchema.parse(json);
}

export async function fetchVodInfo(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  vodId: string | number
): Promise<XtreamVodInfo> {
  const json = await rawRequest(credentials, 'get_vod_info', fetcher, {
    params: { vod_id: vodId },
  });
  return xtreamVodInfoSchema.parse(json);
}

export async function fetchSeriesCategories(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher
): Promise<XtreamCategory[]> {
  const json = await rawRequest(credentials, 'get_series_categories', fetcher);
  return xtreamCategoryListSchema.parse(json);
}

export async function fetchSeries(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  options: { categoryId?: string | number } = {}
): Promise<XtreamSeries[]> {
  const json = await rawRequest(credentials, 'get_series', fetcher, {
    params: { category_id: options.categoryId },
  });
  return xtreamSeriesListSchema.parse(json);
}

export async function fetchSeriesInfo(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  seriesId: string | number
): Promise<XtreamSeriesInfo> {
  const json = await rawRequest(credentials, 'get_series_info', fetcher, {
    params: { series_id: seriesId },
  });
  return xtreamSeriesInfoSchema.parse(json);
}

export async function fetchShortEpg(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  streamId: string | number,
  limit?: number
): Promise<XtreamShortEpgEntry[]> {
  const json = await rawRequest(credentials, 'get_short_epg', fetcher, {
    params: { stream_id: streamId, limit },
  });
  const parsed = xtreamShortEpgSchema.parse(json);
  return parsed.epg_listings;
}

// ---------------------------------------------------------------------------
// Stream URL builders (constructed client-side, never persisted)
// ---------------------------------------------------------------------------

/**
 * Live stream URL.
 * `extension` is the container the player should request; `m3u8` is the most
 * compatible default for HLS-capable players (Shaka, web).
 */
export function buildLiveStreamUrl(
  credentials: XtreamCredentials,
  streamId: string | number,
  extension: 'm3u8' | 'ts' = 'm3u8'
): string {
  const { host, username, password } = sanitizeCredentials(credentials);
  return `${host}/live/${encodeURIComponent(username)}/${encodeURIComponent(
    password
  )}/${streamId}.${extension}`;
}

/** VOD stream URL — `containerExtension` comes from the VOD catalog entry. */
export function buildVodStreamUrl(
  credentials: XtreamCredentials,
  streamId: string | number,
  containerExtension: string
): string {
  const { host, username, password } = sanitizeCredentials(credentials);
  return `${host}/movie/${encodeURIComponent(username)}/${encodeURIComponent(
    password
  )}/${streamId}.${containerExtension}`;
}

/** Series episode stream URL. */
export function buildSeriesEpisodeUrl(
  credentials: XtreamCredentials,
  episodeId: string | number,
  containerExtension: string
): string {
  const { host, username, password } = sanitizeCredentials(credentials);
  return `${host}/series/${encodeURIComponent(username)}/${encodeURIComponent(
    password
  )}/${episodeId}.${containerExtension}`;
}

/**
 * Catchup / time-shift URL for a live stream.
 *
 * Two URL patterns are widely deployed:
 *  - `timeshift`: `{host}/timeshift/{user}/{pass}/{duration}/{start}/{streamId}.ts`
 *  - `streaming/timeshift.php`: query-param style, accepted by newer panels.
 *
 * `start` must be `YYYY-MM-DD:HH-MM` UTC; `durationMinutes` is an integer.
 */
export function buildCatchupUrl(
  credentials: XtreamCredentials,
  streamId: string | number,
  start: Date,
  durationMinutes: number,
  style: 'timeshift_path' | 'timeshift_php' = 'timeshift_path'
): string {
  const { host, username, password } = sanitizeCredentials(credentials);
  const startStr = formatXtreamCatchupStart(start);
  if (style === 'timeshift_php') {
    const url = new URL('/streaming/timeshift.php', host);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    url.searchParams.set('stream', String(streamId));
    url.searchParams.set('start', startStr);
    url.searchParams.set('duration', String(durationMinutes));
    return url.toString();
  }
  return `${host}/timeshift/${encodeURIComponent(username)}/${encodeURIComponent(
    password
  )}/${durationMinutes}/${startStr}/${streamId}.ts`;
}

function formatXtreamCatchupStart(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}:${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}`;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Sanitize Xtream credential strings before they hit a URL builder.
 *
 * Real-world panels (and the humans who type their details into our
 * AddSource form) ship URLs with stray whitespace, zero-width characters,
 * and trailing slashes. JS's built-in `String.prototype.trim` strips
 * standard ASCII + Unicode whitespace, but not zero-width / BOM / LRM
 * marks — and those *do* survive into Shaka's URL parser, which then
 * rejects the request with `UNSUPPORTED_SCHEME` (code 1000) because it
 * sees a scheme like `" http"` or `"\u200Bhttp"`.
 *
 * The cleanest fix is to scrub at every layer (form input on the way in,
 * URL builders on the way out) so that already-stored bad data is also
 * healed without making the user re-enter their credentials.
 */
const INVISIBLE_CHARS = /[\u200B-\u200F\uFEFF\u00A0]/g;

export function sanitizeCredentialString(value: string): string {
  return value.replace(INVISIBLE_CHARS, '').trim();
}

function sanitizeCredentials(c: XtreamCredentials): XtreamCredentials {
  return {
    host: stripTrailingSlash(sanitizeCredentialString(c.host)),
    username: sanitizeCredentialString(c.username),
    password: sanitizeCredentialString(c.password),
  };
}

// ---------------------------------------------------------------------------
// Wire → domain mappers (Xtream JSON → discriminated `Channel`)
// ---------------------------------------------------------------------------

function categoryNameById(categories: XtreamCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [String(c.category_id), c.category_name]));
}

function asNumber(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asInt(value: string | number | undefined | null): number | undefined {
  const n = asNumber(value);
  return n === undefined ? undefined : Math.trunc(n);
}

/** Xtream `added` on VOD rows: usually epoch seconds, occasionally ms as a huge int. */
function parseXtreamVodAddedTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === 'number' ? String(value) : String(value).trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const sec = n > 1e12 ? Math.round(n / 1000) : Math.round(n);
  if (!Number.isInteger(sec) || sec <= 0) return undefined;
  return sec;
}

/** First 4-digit year in a date string (Xtream `releasedate` / `releaseDate`). */
function parseYearFromReleasedateString(value: string | undefined | null): number | undefined {
  if (!value?.trim()) return undefined;
  const m = value.trim().match(/(19|20)\d{2}/);
  const y = m ? Number(m[0]) : undefined;
  if (y === undefined || !Number.isFinite(y)) return undefined;
  return Math.trunc(y);
}

/** Title suffix like `Movie Name (2025)` or `… Title 2024` — common in provider listings. */
function extractYearFromVodTitle(name: string): number | undefined {
  const trimmed = name.trim();
  const paren = trimmed.match(/\((\d{4})\)\s*$/);
  if (paren) {
    const y = Number(paren[1]);
    if (Number.isFinite(y) && y >= 1870 && y <= 2100) return Math.trunc(y);
  }
  const tail = trimmed.match(/\s((?:19|20)\d{2})$/);
  if (tail) {
    const y = Number(tail[1]);
    if (Number.isFinite(y) && y >= 1870 && y <= 2100) return Math.trunc(y);
  }
  return undefined;
}

/**
 * Parse Xtream `duration` when `duration_secs` is missing (minutes as int, `1h 47m`, `2:21`, …).
 */
function parseVodRuntimeToSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    if (value >= 480) return Math.trunc(value);
    return Math.trunc(value * 60);
  }
  const s0 = String(value).trim().toLowerCase();
  if (!s0) return undefined;

  const hms = s0.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (hms) {
    const hh = Number(hms[1]);
    const mm = Number(hms[2]);
    const ss = Number(hms[3]);
    if ([hh, mm, ss].every((n) => Number.isFinite(n)))
      return Math.trunc(hh * 3600 + mm * 60 + ss);
  }

  const hm = s0.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h <= 23 && m <= 59 && Number.isFinite(h) && Number.isFinite(m))
      return Math.trunc(h * 3600 + m * 60);
  }

  const hx = s0.match(/^(\d+)\s*h(?:\s*(\d+)\s*m?)?$/i);
  if (hx) {
    const h = Number(hx[1]);
    const m = hx[2] ? Number(hx[2]) : 0;
    if (Number.isFinite(h)) return Math.trunc(h * 3600 + (Number.isFinite(m) ? m * 60 : 0));
  }

  const minWord = s0.match(/^(\d+)\s*m(?:\s*(\d+)\s*s)?$/i);
  if (minWord) {
    const mins = Number(minWord[1]);
    const secS = minWord[2] ? Number(minWord[2]) : 0;
    if (Number.isFinite(mins))
      return Math.trunc(mins * 60 + (Number.isFinite(secS) ? secS : 0));
  }

  const minSuffix = s0.match(/^(\d+)\s*(?:min|minutes?)$/);
  if (minSuffix) {
    const n = Number(minSuffix[1]);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n * 60);
  }

  const bare = asInt(s0);
  if (bare !== undefined && bare > 0) {
    if (bare >= 480) return bare;
    return bare * 60;
  }

  return undefined;
}

/**
 * Coerce a raw icon/logo string to a value the strict `Channel.logoUrl` schema
 * (`z.string().url().optional()`) will accept. Xtream panels return null,
 * empty strings, and even relative paths here in the wild — surfacing a
 * Zod parse failure for any of those would crash a whole catalog load.
 */
function asUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    // `URL` accepts absolute URLs only when no base is given — exactly the
    // semantics `z.string().url()` enforces downstream.
    new URL(trimmed);
    return trimmed;
  } catch {
    return undefined;
  }
}

/** Convert one Xtream live stream + category map into a domain `LiveChannel`. */
export function toLiveChannel(
  credentials: XtreamCredentials,
  raw: XtreamLiveStream,
  categories: Map<string, string>
): LiveChannel {
  const streamId = asInt(raw.stream_id);
  if (streamId === undefined) {
    throw new Error(`Xtream live stream missing numeric stream_id: ${JSON.stringify(raw)}`);
  }
  const tvArchive = asInt(raw.tv_archive);
  return liveChannelSchema.parse({
    type: 'live',
    id: `xtream:live:${streamId}`,
    name: raw.name,
    groupTitle: categories.get(String(raw.category_id ?? '')) ?? 'Ungrouped',
    streamUrl: buildLiveStreamUrl(credentials, streamId),
    logoUrl: asUrl(raw.stream_icon),
    tvgId: raw.epg_channel_id || undefined,
    catchupDays: tvArchive && tvArchive > 0 ? tvArchive : undefined,
    catchupMode: tvArchive && tvArchive > 0 ? 'xtream' : undefined,
    xtreamStreamId: streamId,
  });
}

/** Convert one Xtream VOD entry into a domain `VodChannel`. */
export function toVodChannel(
  credentials: XtreamCredentials,
  raw: XtreamVodStream,
  categories: Map<string, string>
): VodChannel {
  const streamId = asInt(raw.stream_id);
  if (streamId === undefined) {
    throw new Error(`Xtream VOD stream missing numeric stream_id: ${JSON.stringify(raw)}`);
  }
  const ext = raw.container_extension ?? 'mp4';
  const releaseStr =
    [raw.releaseDate, raw.releasedate].find((s) => typeof s === 'string' && s.trim().length > 0) ??
    undefined;
  const yearFromStream =
    asInt(raw.year) ??
    parseYearFromReleasedateString(releaseStr) ??
    extractYearFromVodTitle(raw.name);
  const durationFromStream =
    asInt(raw.duration_secs) ?? parseVodRuntimeToSeconds(raw.duration);
  const genreFromStream =
    typeof raw.genre === 'string' && raw.genre.trim() ? raw.genre.trim() : undefined;

  return vodChannelSchema.parse({
    type: 'vod',
    id: `xtream:vod:${streamId}`,
    name: raw.name,
    groupTitle: categories.get(String(raw.category_id ?? '')) ?? 'Ungrouped',
    streamUrl: buildVodStreamUrl(credentials, streamId, ext),
    logoUrl: asUrl(raw.stream_icon),
    posterUrl: asUrl(raw.stream_icon),
    rating: asNumber(raw.rating_5based) ?? asNumber(raw.rating),
    year: yearFromStream,
    durationSeconds: durationFromStream,
    genre: genreFromStream,
    containerExtension: ext,
    xtreamStreamId: streamId,
    xtreamAddedAtSec: parseXtreamVodAddedTimestamp(raw.added),
  });
}

/**
 * Merge `get_vod_info` payload into an existing `VodChannel` from `get_vod_streams`.
 * Keeps `streamUrl` / ids from `base`; fills plot, cast, images, etc. when the
 * panel returns them. Safe to call for any `XtreamVodInfo` shape validated by
 * {@link xtreamVodInfoSchema}.
 */
export function mergeVodChannelWithXtreamInfo(
  base: VodChannel,
  detail: XtreamVodInfo
): VodChannel {
  const info = detail.info;
  const backdropFromPaths = info?.backdrop_path
    ?.map((p) => (typeof p === 'string' ? asUrl(p) : undefined))
    .find(Boolean);
  const movieImage = asUrl(info?.movie_image);
  const released = info?.releasedate?.trim();
  let year = base.year;
  if (released) {
    const m = released.match(/(\d{4})/);
    const y = m ? Number(m[1]) : undefined;
    if (y !== undefined && Number.isFinite(y)) year = y;
  }
  const durationSecs =
    asInt(info?.duration_secs) ?? parseVodRuntimeToSeconds(info?.duration);
  const ratingFromInfo =
    asNumber(info?.rating_5based) ?? asNumber(info?.rating) ?? base.rating;
  return vodChannelSchema.parse({
    ...base,
    plot: info?.plot ?? base.plot,
    cast: info?.cast ?? base.cast,
    director: info?.director ?? base.director,
    genre: info?.genre ?? base.genre,
    rating: ratingFromInfo,
    year,
    durationSeconds: durationSecs ?? base.durationSeconds,
    posterUrl: movieImage ?? base.posterUrl,
    backdropUrl: backdropFromPaths ?? base.backdropUrl,
    logoUrl: base.logoUrl ?? movieImage,
  });
}

/** Convert a series listing entry + its detailed info into a domain `SeriesChannel`. */
export function toSeriesChannel(
  credentials: XtreamCredentials,
  listing: XtreamSeries,
  detail: XtreamSeriesInfo,
  categories: Map<string, string>
): SeriesChannel {
  const seriesId = asInt(listing.series_id);
  if (seriesId === undefined) {
    throw new Error(`Xtream series missing numeric series_id: ${JSON.stringify(listing)}`);
  }
  const seasonsByNumber = new Map<number, SeriesSeason>();

  for (const [seasonKey, episodeList] of Object.entries(detail.episodes ?? {})) {
    const seasonNumber = Number(seasonKey);
    if (!Number.isFinite(seasonNumber)) continue;

    const episodes: SeriesEpisode[] = episodeList.map((ep) => {
      const episodeId = String(ep.id);
      const ext = ep.container_extension ?? 'mp4';
      const episodeNumber = asInt(ep.episode_num) ?? 1;
      return {
        id: `xtream:series:${seriesId}:s${seasonNumber}:e${episodeNumber}:${episodeId}`,
        episodeNumber,
        title: ep.title,
        streamUrl: buildSeriesEpisodeUrl(credentials, episodeId, ext),
        containerExtension: ext,
        durationSeconds: asInt(ep.info?.duration_secs),
        plot: ep.info?.plot,
        xtreamEpisodeId: episodeId,
      };
    });

    const seasonMeta = (detail.seasons ?? []).find(
      (s) => asInt(s.season_number) === seasonNumber
    );

    seasonsByNumber.set(seasonNumber, {
      seasonNumber,
      name: seasonMeta?.name,
      episodes,
    });
  }

  const seasons = [...seasonsByNumber.values()].sort(
    (a, b) => a.seasonNumber - b.seasonNumber
  );

  return seriesChannelSchema.parse({
    type: 'series',
    id: `xtream:series:${seriesId}`,
    name: listing.name,
    groupTitle: categories.get(String(listing.category_id ?? '')) ?? 'Ungrouped',
    logoUrl: asUrl(listing.cover),
    posterUrl: asUrl(listing.cover),
    plot: listing.plot ?? detail.info?.plot,
    cast: listing.cast ?? detail.info?.cast,
    director: listing.director ?? detail.info?.director,
    genre: listing.genre ?? detail.info?.genre,
    rating: asNumber(listing.rating ?? detail.info?.rating),
    seasons,
    xtreamSeriesId: seriesId,
  });
}

// Re-export so callers can build the category map without re-importing helpers
export { categoryNameById };

// ---------------------------------------------------------------------------
// EPG decoding (Xtream get_short_epg returns base64 title/description)
// ---------------------------------------------------------------------------

function base64Decode(value: string): string {
  // Browser
  if (typeof atob === 'function') {
    try {
      const decoded = atob(value);
      // Re-interpret as UTF-8 (atob returns binary string).
      return decodeURIComponent(
        decoded
          .split('')
          .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join('')
      );
    } catch {
      return value;
    }
  }
  // Node
  const globalBuffer = (globalThis as { Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
  if (globalBuffer) {
    try {
      return globalBuffer.from(value, 'base64').toString('utf8');
    } catch {
      return value;
    }
  }
  return value;
}

/** Convert an Xtream short-EPG entry to a normalized `EpgProgram`. */
export function decodeXtreamEpgEntry(
  channelId: string,
  raw: XtreamShortEpgEntry
): EpgProgram {
  const start = parseXtreamEpgDate(raw.start, raw.start_timestamp);
  const end = parseXtreamEpgDate(raw.end, raw.stop_timestamp);
  return {
    channelId,
    title: base64Decode(raw.title),
    description: raw.description ? base64Decode(raw.description) : undefined,
    start,
    end,
  };
}

function parseXtreamEpgDate(value: string, timestamp?: string | number): string {
  // Prefer numeric timestamp when present (seconds since epoch).
  if (timestamp !== undefined && timestamp !== null) {
    const n = typeof timestamp === 'number' ? timestamp : Number(timestamp);
    if (Number.isFinite(n) && n > 0) {
      return new Date(n * 1000).toISOString();
    }
  }
  // Fallback: Xtream usually returns "YYYY-MM-DD HH:MM:SS" in server timezone.
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /[Z+-]\d{2}:?\d{2}$|Z$/.test(isoLike) ? isoLike : `${isoLike}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable Xtream EPG date: ${value}`);
  }
  return parsed.toISOString();
}

// ---------------------------------------------------------------------------
// High-level: assemble a full Playlist from an Xtream account
// ---------------------------------------------------------------------------

export interface LoadXtreamPlaylistOptions {
  sourceId: string;
  /**
   * Whether to expand each series with `get_series_info` (one extra request
   * per series). Disable for first-load latency on large catalogs; the UI can
   * lazy-load season/episode data on demand.
   */
  includeSeriesDetail?: boolean;
  /**
   * Cap concurrent `get_series_info` calls when `includeSeriesDetail` is true
   * to avoid hammering the panel. Default: 4.
   */
  seriesDetailConcurrency?: number;
  /** Optional clock for `fetchedAt`; pass for deterministic tests. */
  now?: () => Date;
}

/**
 * Fetch the full Xtream catalog (live + vod + series) and assemble a
 * domain `Playlist` with one `ChannelGroup` per Xtream category.
 *
 * Categories with the same name across live/vod/series stay separate groups
 * because each has a distinct `kind` — the UI is responsible for stacking or
 * tabbing them as it sees fit.
 */
export async function loadXtreamPlaylist(
  credentials: XtreamCredentials,
  fetcher: XtreamFetcher,
  options: LoadXtreamPlaylistOptions
): Promise<Playlist> {
  const { sourceId, includeSeriesDetail = false, seriesDetailConcurrency = 4 } = options;
  const now = options.now ?? (() => new Date());

  // Run the six catalog endpoints in parallel — they're independent.
  const [
    liveCategories,
    liveStreams,
    vodCategories,
    vodStreams,
    seriesCategories,
    seriesListings,
  ] = await Promise.all([
    fetchLiveCategories(credentials, fetcher),
    fetchLiveStreams(credentials, fetcher),
    fetchVodCategories(credentials, fetcher),
    fetchVodStreams(credentials, fetcher),
    fetchSeriesCategories(credentials, fetcher),
    fetchSeries(credentials, fetcher),
  ]);

  const liveCatMap = categoryNameById(liveCategories);
  const vodCatMap = categoryNameById(vodCategories);
  const seriesCatMap = categoryNameById(seriesCategories);

  const liveChannels: LiveChannel[] = liveStreams.map((s) =>
    toLiveChannel(credentials, s, liveCatMap)
  );
  const vodChannels: VodChannel[] = vodStreams.map((s) =>
    toVodChannel(credentials, s, vodCatMap)
  );

  // Series — optionally fan out to `get_series_info` with bounded concurrency.
  const seriesChannels: SeriesChannel[] = includeSeriesDetail
    ? await mapWithConcurrency(seriesListings, seriesDetailConcurrency, async (listing) => {
        const seriesId = listing.series_id;
        try {
          const detail = await fetchSeriesInfo(credentials, fetcher, seriesId as string | number);
          return toSeriesChannel(credentials, listing, detail, seriesCatMap);
        } catch {
          // Fallback: an empty-seasons series still surfaces metadata.
          return toSeriesChannel(
            credentials,
            listing,
            xtreamSeriesInfoSchema.parse({ seasons: [], episodes: {} }),
            seriesCatMap
          );
        }
      })
    : seriesListings.map((listing) =>
        toSeriesChannel(
          credentials,
          listing,
          xtreamSeriesInfoSchema.parse({ seasons: [], episodes: {} }),
          seriesCatMap
        )
      );

  const groups: ChannelGroup[] = [
    ...buildGroups('live', liveCategories, liveChannels, sourceId),
    ...buildGroups('vod', vodCategories, vodChannels, sourceId),
    ...buildGroups('series', seriesCategories, seriesChannels, sourceId),
  ];

  return playlistSchema.parse({
    sourceId,
    groups,
    fetchedAt: now().toISOString(),
  });
}

function buildGroups(
  kind: 'live' | 'vod' | 'series',
  categories: XtreamCategory[],
  channels: Channel[],
  sourceId: string
): ChannelGroup[] {
  // Index channels by their resolved `groupTitle` (already mapped from
  // category_id by the to* helpers, with 'Ungrouped' as the fallback).
  const byGroup = new Map<string, Channel[]>();
  for (const ch of channels) {
    const list = byGroup.get(ch.groupTitle) ?? [];
    list.push(ch);
    byGroup.set(ch.groupTitle, list);
  }

  // Preserve provider-supplied category order; append 'Ungrouped' last if used.
  const ordered: { name: string; channels: Channel[] }[] = [];
  for (const cat of categories) {
    const list = byGroup.get(cat.category_name);
    if (list && list.length > 0) {
      ordered.push({ name: cat.category_name, channels: list });
      byGroup.delete(cat.category_name);
    }
  }
  for (const [name, list] of byGroup) {
    ordered.push({ name, channels: list });
  }

  return ordered.map(({ name, channels: list }) =>
    channelGroupSchema.parse({
      id: `${sourceId}:${kind}:${slugify(name)}`,
      name,
      kind,
      channels: list,
    })
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
