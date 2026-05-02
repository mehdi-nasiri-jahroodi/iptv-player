import type { ShakaError } from './use-shaka-player.js';

/**
 * Human-friendly description of a Shaka playback error.
 *
 * Maps the underlying numeric Shaka error code (`shaka.util.Error.Code`) to:
 *   - `headline`: a short user-facing sentence — the only thing most users
 *     will ever read.
 *   - `hint`: actionable next step (retry, check provider, etc.). May be
 *     `null` when no useful action exists.
 *   - `code`, `codeName`, `category`, `url`, `httpStatus`: structured
 *     details for the optional "Show diagnostics" panel and the
 *     "Copy diagnostics" button.
 *   - `raw`: the original `ShakaError` object so consumers can re-render
 *     or copy it verbatim.
 */
/** Options for {@link describeShakaError}. */
export interface DescribeShakaErrorOptions {
  /**
   * When `false`, HTTP_ERROR (1002) hints mention configuring the stream proxy
   * for CORS-blocked HLS. Omit or `true` when a proxy is already configured.
   */
  streamProxyConfigured?: boolean;
}

export interface ShakaErrorDescription {
  headline: string;
  hint: string | null;
  code: number | null;
  codeName: string | null;
  category: number | null;
  /** The URL Shaka was trying to fetch when it failed (network errors). */
  url: string | null;
  /** HTTP status code if the failure was an HTTP response (network errors). */
  httpStatus: number | null;
  raw: ShakaError;
}

/**
 * Convert a raw `ShakaError` into a `ShakaErrorDescription` suitable for
 * display in a player overlay.
 *
 * Why a dedicated mapping table? Shaka's error messages are designed for
 * library users, not viewers — "HTTP_ERROR" tells a developer everything
 * but tells a viewer nothing. We translate the most common codes to
 * sentences that suggest what's wrong and what to do.
 *
 * Unknown codes fall back to the generic message + the raw code so the
 * user still has SOMETHING actionable, and the diagnostics panel still
 * has the original code and data for support tickets.
 */
export function describeShakaError(
  error: ShakaError,
  options?: DescribeShakaErrorOptions
): ShakaErrorDescription {
  const code = typeof error.code === 'number' ? error.code : null;
  const codeName = code !== null ? SHAKA_ERROR_CODE_NAMES[code] ?? null : null;
  const category = typeof error.category === 'number' ? error.category : null;
  const { url, httpStatus } = extractNetworkDetails(error.data);

  const friendly = code !== null ? FRIENDLY_BY_CODE[code] : undefined;
  if (friendly) {
    let hint: string | null = friendly.hint;
    if (code === 1002) {
      if (httpStatus === 403) {
        hint =
          'The provider rejected this stream (HTTP 403). Common causes: too many simultaneous streams on your account (close other devices and wait 30-90 seconds), the provider blocks browser playback for this channel, or your subscription expired. Retry usually works for the concurrent-stream case.';
      } else if (httpStatus === 401) {
        hint =
          'Provider authentication failed (HTTP 401). Your subscription may have expired or the credentials in this source are wrong. Re-check the source in Sources.';
      } else if (httpStatus === 404) {
        hint =
          'The provider returned 404 — this channel URL no longer exists. Refresh the source playlist (Refresh button on Browse) to get the latest channel list.';
      } else if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
        hint =
          'The provider is having upstream issues (HTTP ' + httpStatus + '). Wait a moment and retry. If multiple channels show this, the panel itself is down.';
      } else if (options?.streamProxyConfigured === false) {
        hint =
          'This stream could not be loaded. Check your network and provider. If the issue persists, the browser may be blocking cross-origin requests (CORS) — you can optionally configure a stream proxy in Sources → Stream proxy to work around this.';
      }
    }
    return {
      headline: friendly.headline,
      hint,
      code,
      codeName,
      category,
      url,
      httpStatus,
      raw: error,
    };
  }

  // Generic fallback — pick a category-level headline if we have one,
  // otherwise reuse the original Shaka message.
  const categoryFallback = category !== null ? CATEGORY_HEADLINES[category] : undefined;
  return {
    headline: categoryFallback ?? error.message ?? 'Playback failed.',
    hint: 'Tap Retry to try again. If the problem persists, check the source in your provider dashboard.',
    code,
    codeName,
    category,
    url,
    httpStatus,
    raw: error,
  };
}

/**
 * Render the description as a single multi-line plain-text block, suitable
 * for the "Copy diagnostics" clipboard payload. Credentials are not
 * stripped here — callers must redact `url` themselves before passing it
 * in if it embeds username/password.
 */
export function formatShakaErrorForClipboard(desc: ShakaErrorDescription): string {
  const lines: string[] = [];
  lines.push(`Playback error: ${desc.headline}`);
  if (desc.hint) lines.push(`Hint: ${desc.hint}`);
  if (desc.code !== null) {
    const codeLabel = desc.codeName ? `${desc.code} (${desc.codeName})` : String(desc.code);
    lines.push(`Code: ${codeLabel}`);
  }
  if (desc.category !== null) lines.push(`Category: ${desc.category}`);
  if (desc.httpStatus !== null) lines.push(`HTTP status: ${desc.httpStatus}`);
  if (desc.url) lines.push(`URL: ${desc.url}`);
  if (desc.raw.message && desc.raw.message !== desc.headline) {
    lines.push(`Shaka message: ${desc.raw.message}`);
  }
  if (desc.raw.data !== undefined) {
    try {
      lines.push(`Data: ${JSON.stringify(desc.raw.data)}`);
    } catch {
      lines.push(`Data: <unserialisable>`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal lookup tables
// ---------------------------------------------------------------------------

/**
 * Shaka error code → human sentence + actionable hint. Codes are the
 * numeric values from `shaka.util.Error.Code` (see Shaka docs); we keep
 * the table in `core` rather than depending on the runtime enum so this
 * helper is fully type-safe and testable without loading Shaka.
 */
const FRIENDLY_BY_CODE: Record<number, { headline: string; hint: string | null }> = {
  // ---- Network category (1xxx) ----
  1000: {
    headline: 'The stream URL has an invalid scheme.',
    hint: 'The provider gave us a URL we cannot play. Refresh the catalog or contact your provider.',
  },
  1001: {
    headline: 'The provider returned an HTTP error.',
    hint: 'The stream may be offline or your subscription may not include this channel. Try again or pick another stream.',
  },
  1002: {
    headline: 'The stream is unreachable.',
    hint: 'Your network blocked the request, or the provider is offline. Check your connection and try again.',
  },
  1003: {
    headline: 'The stream timed out.',
    hint: 'The provider took too long to respond. Try again in a moment.',
  },
  1004: {
    headline: 'The stream URL is malformed.',
    hint: 'Refresh the catalog. If the problem persists, the provider sent an invalid playlist.',
  },
  1005: {
    headline: 'A request filter rejected the stream.',
    hint: 'This usually means a configured CORS proxy or auth header is wrong.',
  },
  1006: {
    headline: 'A response filter rejected the stream.',
    hint: 'The provider sent something the player could not validate.',
  },
  1007: {
    headline: 'The stream URL is malformed.',
    hint: 'Refresh the catalog and try again.',
  },

  // ---- Media category (3xxx) ----
  3016: {
    headline: 'The video element reported a playback error.',
    hint: 'This usually means the codec or container is not supported in this browser. Try a different browser, or pick another stream.',
  },
  3017: {
    headline: 'Browser storage quota was exceeded.',
    hint: 'Close other tabs or clear browser data, then retry.',
  },
  3022: {
    headline: 'The streaming engine could not start.',
    hint: 'Tap Retry. If it keeps failing, the stream format may not be supported.',
  },

  // ---- Manifest / parser (4xxx) ----
  4001: {
    headline: 'The player could not detect the stream format.',
    hint: 'The provider returned an unrecognised manifest. Tap Retry, then refresh the catalog.',
  },
  4002: {
    headline: 'The DASH manifest is invalid XML.',
    hint: 'The provider sent a corrupted manifest. Tap Retry, or pick another stream.',
  },
  4003: {
    headline: 'The DASH manifest has no init data.',
    hint: 'The stream cannot start. Pick another channel or contact your provider.',
  },
  4032: {
    headline: 'The HLS playlist is missing required headers.',
    hint: 'The provider sent a malformed HLS playlist. Tap Retry, or pick another stream.',
  },
  4034: {
    headline: 'The HLS playlist references an unknown variable.',
    hint: 'The provider sent an HLS playlist this player does not understand. Pick another stream.',
  },
  4036: {
    headline: 'The player could not detect the stream codec.',
    hint: 'This stream uses an unsupported codec. Pick another stream.',
  },
};

/** Generic per-category headline used when the code is unknown. */
const CATEGORY_HEADLINES: Record<number, string> = {
  1: 'The stream is unreachable.',
  2: 'Could not load text/subtitle track.',
  3: 'Playback failed.',
  4: 'The stream manifest could not be parsed.',
  5: 'A streaming engine error occurred.',
  6: 'Digital rights management (DRM) failed.',
  7: 'Player is in an unexpected state.',
  8: 'Casting failed.',
  9: 'Storage error.',
};

/**
 * Stable code→symbol mapping. Mirrors the table in `use-shaka-player.ts`
 * but lives here so consumers can render the codeName even when we don't
 * have a friendly translation.
 */
const SHAKA_ERROR_CODE_NAMES: Record<number, string> = {
  // Network category (1xxx)
  1000: 'UNSUPPORTED_SCHEME',
  1001: 'BAD_HTTP_STATUS',
  1002: 'HTTP_ERROR',
  1003: 'TIMEOUT',
  1004: 'MALFORMED_DATA_URI',
  1005: 'REQUEST_FILTER_ERROR',
  1006: 'RESPONSE_FILTER_ERROR',
  1007: 'MALFORMED_TEST_URI',
  // Media (3xxx)
  3016: 'VIDEO_ERROR',
  3017: 'QUOTA_EXCEEDED_ERROR',
  3022: 'STREAMING_ENGINE_STARTUP_INVALID_STATE',
  // Manifest / parser (4xxx)
  4001: 'UNABLE_TO_GUESS_MANIFEST_TYPE',
  4002: 'DASH_INVALID_XML',
  4003: 'DASH_NO_INIT_DATA',
  4032: 'HLS_PLAYLIST_HEADER_MISSING',
  4034: 'HLS_VARIABLE_NOT_FOUND',
  4036: 'HLS_COULD_NOT_GUESS_CODECS',
};

/**
 * Pull `url` and `httpStatus` out of `shaka.util.Error.data` for
 * network-category errors. Shaka stuffs `[url, httpStatus, body, ...]`
 * into the data tuple; manifest errors may have other shapes.
 */
function extractNetworkDetails(data: unknown): { url: string | null; httpStatus: number | null } {
  if (!Array.isArray(data) || data.length === 0) return { url: null, httpStatus: null };
  const [first, second] = data;
  const url = typeof first === 'string' && /^https?:/.test(first) ? first : null;
  const httpStatus = typeof second === 'number' && Number.isFinite(second) && second > 0 ? second : null;
  return { url, httpStatus };
}
