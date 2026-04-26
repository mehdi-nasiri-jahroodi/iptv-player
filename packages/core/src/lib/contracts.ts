import { z } from 'zod/v3';

// ---------------------------------------------------------------------------
// Source — the user's input (M3U URL, M3U file, or Xtream credentials)
// ---------------------------------------------------------------------------

export const sourceTypeSchema = z.enum(['m3u_url', 'm3u_file', 'xtream']);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const xtreamCredentialsSchema = z.object({
  host: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type XtreamCredentials = z.infer<typeof xtreamCredentialsSchema>;

export const sourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: sourceTypeSchema,
    url: z.string().url().optional(),
    credentials: xtreamCredentialsSchema.optional(),
    epgUrl: z.string().url().optional(),
    /**
     * Optional User-Agent forwarded to the stream proxy for this source only.
     * When unset, proxy playback uses the global UA from Settings (if any).
     */
    userAgent: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'm3u_url' && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'm3u_url sources require url',
      });
    }
    if (value.type === 'xtream' && !value.credentials) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentials'],
        message: 'xtream sources require credentials',
      });
    }
  });
export type Source = z.infer<typeof sourceSchema>;

// ---------------------------------------------------------------------------
// Channel — discriminated union: live | vod | series
//
// M3U playlists and Xtream catalogs mix live channels, VOD movies, and
// multi-episode series. Each variant has different metadata, so the union is
// keyed on `type` and TypeScript narrows automatically (see docs/architecture.md
// "Channel domain model — discriminated union").
// ---------------------------------------------------------------------------

const channelBaseShape = {
  id: z.string().min(1),
  name: z.string().min(1),
  groupTitle: z.string().min(1),
  streamUrl: z.string().url(),
  logoUrl: z.string().url().optional(),
} as const;

/** Live TV channel (M3U live entries and Xtream get_live_streams). */
export const liveChannelSchema = z.object({
  type: z.literal('live'),
  ...channelBaseShape,
  // EPG correlation key. M3U: tvg-id attribute. Xtream: epg_channel_id field.
  tvgId: z.string().min(1).optional(),
  // Catchup / time-shift metadata (Xtream tv_archive + M3U tvg-rec / catchup).
  catchupDays: z.number().int().nonnegative().optional(),
  catchupMode: z.enum(['default', 'append', 'shift', 'flussonic', 'xtream']).optional(),
  catchupSource: z.string().optional(),
  // Stable identifier used to construct stream URLs at playback time
  // (Xtream stream_id; not used for plain M3U).
  xtreamStreamId: z.number().int().optional(),
});
export type LiveChannel = z.infer<typeof liveChannelSchema>;

/** Video on demand entry (a single movie). */
export const vodChannelSchema = z.object({
  type: z.literal('vod'),
  ...channelBaseShape,
  durationSeconds: z.number().int().nonnegative().optional(),
  year: z.number().int().optional(),
  rating: z.number().nonnegative().optional(),
  plot: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  genre: z.string().optional(),
  containerExtension: z.string().optional(),
  posterUrl: z.string().url().optional(),
  backdropUrl: z.string().url().optional(),
  xtreamStreamId: z.number().int().optional(),
});
export type VodChannel = z.infer<typeof vodChannelSchema>;

/** TV series with seasons and episodes. */
export const seriesEpisodeSchema = z.object({
  id: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  title: z.string().min(1),
  streamUrl: z.string().url(),
  containerExtension: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  plot: z.string().optional(),
  xtreamEpisodeId: z.string().optional(),
});
export type SeriesEpisode = z.infer<typeof seriesEpisodeSchema>;

export const seriesSeasonSchema = z.object({
  seasonNumber: z.number().int().nonnegative(),
  name: z.string().optional(),
  episodes: z.array(seriesEpisodeSchema),
});
export type SeriesSeason = z.infer<typeof seriesSeasonSchema>;

export const seriesChannelSchema = z.object({
  type: z.literal('series'),
  id: z.string().min(1),
  name: z.string().min(1),
  groupTitle: z.string().min(1),
  logoUrl: z.string().url().optional(),
  posterUrl: z.string().url().optional(),
  backdropUrl: z.string().url().optional(),
  plot: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  genre: z.string().optional(),
  releaseYear: z.number().int().optional(),
  rating: z.number().nonnegative().optional(),
  seasons: z.array(seriesSeasonSchema),
  xtreamSeriesId: z.number().int().optional(),
});
export type SeriesChannel = z.infer<typeof seriesChannelSchema>;

export const channelSchema = z.discriminatedUnion('type', [
  liveChannelSchema,
  vodChannelSchema,
  seriesChannelSchema,
]);
export type Channel = z.infer<typeof channelSchema>;

// ---------------------------------------------------------------------------
// Catalog — channels grouped by category
// ---------------------------------------------------------------------------

export const channelGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // A catalog kind so the UI can render Live / VOD / Series in separate sections
  // even when a provider returns them under similarly named groups.
  kind: z.enum(['live', 'vod', 'series', 'mixed']).default('mixed'),
  channels: z.array(channelSchema),
});
export type ChannelGroup = z.infer<typeof channelGroupSchema>;

export const playlistSchema = z.object({
  sourceId: z.string().min(1),
  groups: z.array(channelGroupSchema),
  fetchedAt: z.string().datetime(),
});
export type Playlist = z.infer<typeof playlistSchema>;

// ---------------------------------------------------------------------------
// EPG (XMLTV-derived; provider-agnostic)
// ---------------------------------------------------------------------------

export const epgProgramSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  description: z.string().optional(),
});
export type EpgProgram = z.infer<typeof epgProgramSchema>;

export const epgGuideSchema = z.object({
  programsByChannelId: z.record(z.array(epgProgramSchema)),
});
export type EpgGuide = z.infer<typeof epgGuideSchema>;

// ---------------------------------------------------------------------------
// App-level settings + profile
// ---------------------------------------------------------------------------

export const appThemeSchema = z.enum(['light', 'dark', 'system']);
export const playerBufferModeSchema = z.enum(['balanced', 'aggressive', 'conservative']);

export const appSettingsSchema = z.object({
  theme: appThemeSchema,
  playerBufferMode: playerBufferModeSchema,
  autoPlay: z.boolean().default(false),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  favorites: z.array(z.string()),
  recents: z.array(z.string()),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

// ===========================================================================
// Xtream Codes wire types
//
// Xtream panels expose ~20 endpoints via a single URL pattern:
//   {host}/player_api.php?username=...&password=...&action={ACTION}
//
// All schemas use `.passthrough()` because providers add custom fields and we
// don't want to drop them silently. Numbers are often returned as strings —
// the helpers in `xtream.ts` coerce when constructing domain `Channel` values.
// ===========================================================================

/** Xtream returns auth as 0/1 number or "0"/"1" string depending on the panel. */
export const xtreamAuthFlagSchema = z.union([z.literal(0), z.literal(1), z.string()]);

export const xtreamUserInfoSchema = z
  .object({
    auth: xtreamAuthFlagSchema,
    status: z.string().optional(),
    active_cons: z.string().optional(),
    max_connections: z.string().optional(),
    exp_date: z.string().optional(),
    is_trial: z.string().optional(),
    created_at: z.string().optional(),
    allowed_output_formats: z.array(z.string()).optional(),
  })
  .passthrough();
export type XtreamUserInfo = z.infer<typeof xtreamUserInfoSchema>;

export const xtreamServerInfoSchema = z
  .object({
    url: z.string().optional(),
    port: z.string().optional(),
    https_port: z.string().optional(),
    server_protocol: z.string().optional(),
    timezone: z.string().optional(),
    timestamp_now: z.number().optional(),
    time_now: z.string().optional(),
  })
  .passthrough();
export type XtreamServerInfo = z.infer<typeof xtreamServerInfoSchema>;

/** Login probe response (player_api.php with no `action`). */
export const xtreamPlayerApiSchema = z.object({
  user_info: xtreamUserInfoSchema.optional(),
  server_info: xtreamServerInfoSchema.optional(),
});
export type XtreamPlayerApi = z.infer<typeof xtreamPlayerApiSchema>;

/** Categories endpoint shape (live, vod, series share the same shape). */
export const xtreamCategorySchema = z
  .object({
    category_id: z.union([z.string(), z.number()]),
    category_name: z.string(),
    parent_id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type XtreamCategory = z.infer<typeof xtreamCategorySchema>;
export const xtreamCategoryListSchema = z.array(xtreamCategorySchema);

/** Live stream from `get_live_streams`. */
export const xtreamLiveStreamSchema = z
  .object({
    stream_id: z.union([z.string(), z.number()]),
    name: z.string(),
    stream_icon: z.string().nullish(),
    epg_channel_id: z.string().nullish(),
    category_id: z.union([z.string(), z.number()]).nullish(),
    // Catchup metadata (recent panels)
    tv_archive: z.union([z.string(), z.number()]).nullish(),
    tv_archive_duration: z.union([z.string(), z.number()]).nullish(),
    direct_source: z.string().nullish(),
    stream_type: z.string().nullish(),
    custom_sid: z.string().nullish(),
  })
  .passthrough();
export type XtreamLiveStream = z.infer<typeof xtreamLiveStreamSchema>;
export const xtreamLiveStreamListSchema = z.array(xtreamLiveStreamSchema);

/** VOD stream from `get_vod_streams`. */
export const xtreamVodStreamSchema = z
  .object({
    stream_id: z.union([z.string(), z.number()]),
    name: z.string(),
    stream_icon: z.string().nullish(),
    rating: z.union([z.string(), z.number()]).nullish(),
    rating_5based: z.union([z.string(), z.number()]).nullish(),
    container_extension: z.string().nullish(),
    category_id: z.union([z.string(), z.number()]).nullish(),
    added: z.string().nullish(),
    custom_sid: z.string().nullish(),
    direct_source: z.string().nullish(),
  })
  .passthrough();
export type XtreamVodStream = z.infer<typeof xtreamVodStreamSchema>;
export const xtreamVodStreamListSchema = z.array(xtreamVodStreamSchema);

/** Detailed VOD info from `get_vod_info&vod_id=N`. */
export const xtreamVodInfoSchema = z
  .object({
    info: z
      .object({
        movie_image: z.string().optional(),
        backdrop_path: z.array(z.string()).optional(),
        plot: z.string().optional(),
        cast: z.string().optional(),
        director: z.string().optional(),
        genre: z.string().optional(),
        releasedate: z.string().optional(),
        rating: z.union([z.string(), z.number()]).optional(),
        duration_secs: z.union([z.string(), z.number()]).optional(),
        duration: z.string().optional(),
      })
      .passthrough()
      .optional(),
    movie_data: z
      .object({
        stream_id: z.union([z.string(), z.number()]),
        name: z.string(),
        container_extension: z.string().optional(),
        category_id: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type XtreamVodInfo = z.infer<typeof xtreamVodInfoSchema>;

/** Series listing from `get_series`. */
export const xtreamSeriesSchema = z
  .object({
    series_id: z.union([z.string(), z.number()]),
    name: z.string(),
    cover: z.string().nullish(),
    plot: z.string().nullish(),
    cast: z.string().nullish(),
    director: z.string().nullish(),
    genre: z.string().nullish(),
    releaseDate: z.string().nullish(),
    rating: z.union([z.string(), z.number()]).nullish(),
    category_id: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();
export type XtreamSeries = z.infer<typeof xtreamSeriesSchema>;
export const xtreamSeriesListSchema = z.array(xtreamSeriesSchema);

/** Series detail from `get_series_info&series_id=N`. */
export const xtreamEpisodeSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    episode_num: z.union([z.string(), z.number()]),
    title: z.string(),
    container_extension: z.string().optional(),
    info: z
      .object({
        plot: z.string().optional(),
        duration_secs: z.union([z.string(), z.number()]).optional(),
        movie_image: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type XtreamEpisode = z.infer<typeof xtreamEpisodeSchema>;

export const xtreamSeasonInfoSchema = z
  .object({
    season_number: z.union([z.string(), z.number()]),
    name: z.string().optional(),
    cover: z.string().optional(),
  })
  .passthrough();

export const xtreamSeriesInfoSchema = z
  .object({
    info: z
      .object({
        name: z.string().optional(),
        cover: z.string().optional(),
        plot: z.string().optional(),
        cast: z.string().optional(),
        director: z.string().optional(),
        genre: z.string().optional(),
        releaseDate: z.string().optional(),
        rating: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    seasons: z.array(xtreamSeasonInfoSchema).optional(),
    // Episodes keyed by season number as a string ("1", "2", ...).
    episodes: z.record(z.array(xtreamEpisodeSchema)).optional(),
  })
  .passthrough();
export type XtreamSeriesInfo = z.infer<typeof xtreamSeriesInfoSchema>;

/**
 * Short EPG entry from `get_short_epg&stream_id=N`.
 * IMPORTANT: title and description are base64-encoded by Xtream — decode
 * before persisting (see `xtream.ts#decodeXtreamEpgEntry`).
 */
export const xtreamShortEpgEntrySchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    epg_id: z.union([z.string(), z.number()]).optional(),
    title: z.string(),
    lang: z.string().optional(),
    start: z.string(),
    end: z.string(),
    description: z.string().optional(),
    channel_id: z.string().optional(),
    start_timestamp: z.union([z.string(), z.number()]).optional(),
    stop_timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type XtreamShortEpgEntry = z.infer<typeof xtreamShortEpgEntrySchema>;

export const xtreamShortEpgSchema = z.object({
  epg_listings: z.array(xtreamShortEpgEntrySchema),
});
export type XtreamShortEpg = z.infer<typeof xtreamShortEpgSchema>;

/** Action enum for type-safe dispatch from `xtreamRequest`. */
export const xtreamActionSchema = z.enum([
  'get_live_categories',
  'get_live_streams',
  'get_vod_categories',
  'get_vod_streams',
  'get_vod_info',
  'get_series_categories',
  'get_series',
  'get_series_info',
  'get_short_epg',
  'get_simple_data_table',
]);
export type XtreamAction = z.infer<typeof xtreamActionSchema>;
