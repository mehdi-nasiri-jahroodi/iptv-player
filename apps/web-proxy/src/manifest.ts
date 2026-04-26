import { signProxyRequest } from './hmac.js';

const HLS_CONTENT_TYPES = new Set([
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]);

/** Tag lines that carry a URI inside a `URI="..."` attribute. */
const URI_QUOTED_TAGS = [
  '#EXT-X-KEY',
  '#EXT-X-MAP',
  '#EXT-X-MEDIA',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-SESSION-DATA',
  '#EXT-X-PART',
  '#EXT-X-PRELOAD-HINT',
  '#EXT-X-RENDITION-REPORT',
];

/** True when `contentType` indicates a manifest we know how to rewrite. */
export function isHlsManifestContentType(
  contentType: string | null | undefined
): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0]?.trim().toLowerCase();
  return base !== undefined && HLS_CONTENT_TYPES.has(base);
}

export interface RewriteHlsManifestParams {
  /** Raw manifest body (utf-8 decoded). */
  body: string;
  /** The effective URL the manifest was *fetched from* — i.e. `response.url`,
   *  which already accounts for any 30x redirects the upstream issued. All
   *  relative URIs in the manifest resolve against this. */
  effectiveUrl: string;
  /** The proxy's own externally-reachable base, e.g. `http://localhost:8787`
   *  or `https://abcd.ngrok-free.app`. Derived from the incoming request's
   *  Host + scheme by the caller. Trailing slash optional. */
  proxyBase: string;
  /** Shared HMAC secret. */
  secret: string;
  /** Optional User-Agent that should accompany every rewritten URL so the
   *  panel sees the same UA on segments that it saw on the manifest. */
  userAgent: string | undefined;
}

/**
 * Rewrites every URI inside an HLS manifest so that Shaka (or any other HLS
 * client) fetches segments, sub-playlists, encryption keys, and init segments
 * back through *us*.
 *
 * Why this is necessary: a proxied manifest's segment URIs are typically
 * relative paths like `/hlsr/.../833633_190.ts`. The HLS client resolves them
 * against the manifest URL it was given — which, post-proxy, is the proxy's
 * own URL. So the client would request `${proxyBase}/hlsr/...` and get a 404
 * because the proxy only serves `/stream`. Rewriting fixes that by replacing
 * each URI with a fully-qualified, signed `${proxyBase}/stream?u=...&sig=...`.
 *
 * Lines we touch:
 *  - Bare URI lines (segments).
 *  - The `URI="..."` attribute inside known tag lines (KEY, MAP, MEDIA, etc.).
 *
 * Lines we leave alone:
 *  - Empty lines and comments.
 *  - `#EXTINF`, `#EXT-X-VERSION`, and other tag lines without URIs.
 *  - URIs we can't resolve (data:, relative without a base, malformed).
 */
export function rewriteHlsManifest({
  body,
  effectiveUrl,
  proxyBase,
  secret,
  userAgent,
}: RewriteHlsManifestParams): string {
  const base = proxyBase.endsWith('/') ? proxyBase.slice(0, -1) : proxyBase;
  const proxyFor = (uri: string): string | null => {
    let absolute: URL;
    try {
      absolute = new URL(uri, effectiveUrl);
    } catch {
      return null;
    }
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      return null;
    }
    const u = Buffer.from(absolute.toString(), 'utf8').toString('base64url');
    const sig = signProxyRequest(secret, u, userAgent);
    const params = new URLSearchParams({ u, sig });
    if (userAgent && userAgent.length > 0) {
      params.set('ua', userAgent);
    }
    return `${base}/stream?${params.toString()}`;
  };

  // Preserve original line endings (LF vs CRLF) by splitting on /\r?\n/ and
  // re-joining with the same character we found between the first two lines.
  // Fallback to LF if there's only one line.
  const lineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);

  const rewritten = lines.map((line) => {
    if (line.length === 0) return line;
    if (line.startsWith('#')) {
      return rewriteTagLine(line, proxyFor);
    }
    // Bare URI line.
    const replacement = proxyFor(line);
    return replacement ?? line;
  });

  return rewritten.join(lineEnding);
}

function rewriteTagLine(
  line: string,
  proxyFor: (uri: string) => string | null
): string {
  const colon = line.indexOf(':');
  if (colon === -1) return line;
  const tag = line.slice(0, colon);
  if (!URI_QUOTED_TAGS.includes(tag)) return line;

  // Replace URI="..." substring(s). Tag attributes are comma-separated,
  // values may be quoted strings (containing commas) or unquoted tokens.
  // We only need to touch URI="..." so a localised replace is enough.
  return line.replace(
    /\bURI="([^"]*)"/g,
    (whole, uri: string) => {
      const replacement = proxyFor(uri);
      return replacement === null ? whole : `URI="${replacement}"`;
    }
  );
}
