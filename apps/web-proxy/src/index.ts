import { Hono } from 'hono';
import { verifyProxySignature } from './hmac.js';
import { isHlsManifestContentType, rewriteHlsManifest } from './manifest.js';
import { registerSubtitleRoutes } from './subtitles.js';
import { registerTranscodeRoutes } from './transcode.js';

export interface ProxyAppConfig {
  /** HMAC shared secret. Must match the secret configured in the web app. */
  secret: string;
  /** Default `User-Agent` sent upstream when the request does not specify one.
   *  Many Xtream panels reject browser UAs; pretend to be a TV client. */
  defaultUserAgent: string;
  /** Optional injected fetcher for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Optional logger; defaults to no-op so production runs are quiet. */
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

const DECODE_BASE64URL = (input: string): string | null => {
  try {
    // Buffer.from accepts base64url since Node 16.
    const buf = Buffer.from(input, 'base64url');
    const text = buf.toString('utf8');
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
};

/**
 * Headers we strip from the *upstream response* before relaying it to the
 * browser. The cache-related ones are intentionally cleared because we never
 * want HLS manifests / segments cached at intermediaries — staleness breaks
 * live playback. The CORS-related ones from upstream are dropped so we can
 * inject our own permissive set without conflict.
 */
const DROP_RESPONSE_HEADERS = new Set([
  'cache-control',
  'pragma',
  'expires',
  'access-control-allow-origin',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-allow-credentials',
  'set-cookie',
  'connection',
  'transfer-encoding',
]);

/**
 * Builds the Hono app. Exposed as a factory so tests can construct an isolated
 * instance with a stub fetcher and known secret without touching env or
 * starting an HTTP server.
 */
export function createProxyApp(config: ProxyAppConfig): Hono {
  const log = config.log ?? (() => undefined);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  // Module-instance gauge of currently in-flight upstream requests. Only the
  // count is ever exposed via logs; we never associate it with a URL, UA, or
  // client IP. Used to test whether 4xx bursts correlate with high concurrency
  // (e.g. panel-enforced concurrent-stream limits).
  let inFlight = 0;

  const app = new Hono();

  // /healthz is fetched cross-origin by the web app's "Test connection"
  // button. We must include the same CORS allow-origin header here, or
  // the browser blocks the response even though the proxy returned 200.
  // Also handles preflight for cases where the client adds custom
  // headers (none today, but this keeps the surface symmetrical with
  // /stream and avoids future surprises).
  app.options('/healthz', () => {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-max-age': '600',
      },
    });
  });
  app.get('/healthz', (c) => {
    c.header('access-control-allow-origin', '*');
    c.header('cache-control', 'no-store');
    return c.text('ok');
  });

  // CORS preflight for /stream — Shaka may issue a preflight on Range requests
  // even though they're "simple"; respond permissively and quickly.
  app.options('/stream', () => {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'range, accept, accept-encoding',
        'access-control-max-age': '600',
      },
    });
  });

  app.on(['GET', 'HEAD'], '/stream', async (c) => {
    const u = c.req.query('u') ?? '';
    const sig = c.req.query('sig') ?? '';
    const ua = c.req.query('ua');

    if (!u || !sig) {
      return c.text('missing u or sig', 400);
    }

    if (!verifyProxySignature(config.secret, u, ua, sig)) {
      log('sig.invalid');
      return c.text('forbidden', 403);
    }

    const upstreamUrl = DECODE_BASE64URL(u);
    if (!upstreamUrl) {
      return c.text('invalid u', 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(upstreamUrl);
    } catch {
      return c.text('invalid u', 400);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return c.text('invalid scheme', 400);
    }

    const upstreamHeaders: Record<string, string> = {
      'user-agent': ua && ua.length > 0 ? ua : config.defaultUserAgent,
      accept: '*/*',
    };
    const range = c.req.header('range');
    if (range) upstreamHeaders['range'] = range;

    let upstreamResponse: Response;
    const startedAt = Date.now();
    // Concurrency gauge: track upstream requests currently in flight. Logged
    // only as a count (no URLs/UAs/IPs), to help diagnose whether bursts of
    // 4xx correlate with concurrent-stream limits enforced by the panel.
    inFlight += 1;
    const inFlightAtStart = inFlight;
    log('fetch.start', { inFlight: inFlightAtStart });
    try {
      upstreamResponse = await fetchImpl(upstreamUrl, {
        method: c.req.method,
        headers: upstreamHeaders,
        redirect: 'follow',
      });
    } catch (err) {
      inFlight -= 1;
      log('fetch.failed', {
        status: 'network-error',
        durationMs: Date.now() - startedAt,
        inFlight,
        error: err instanceof Error ? err.name : 'unknown',
      });
      return c.text(
        `upstream fetch failed: ${err instanceof Error ? err.message : 'unknown'}`,
        502
      );
    }
    inFlight -= 1;

    const durationMs = Date.now() - startedAt;
    const upstreamStatus = upstreamResponse.status;

    // For error responses (>= 400) capture extra non-sensitive diagnostics.
    // We deliberately avoid logging the upstream URL, UA, or client IP per the
    // proxy's privacy contract. What is safe and useful for triage:
    //   - status code + duration (slow vs. fast rejection)
    //   - server / via / x-powered-by headers (which panel software / CDN)
    //   - content-type + content-length (HTML error page vs. m3u8)
    //   - first 256 chars of the response body when it is text/* (panels
    //     often return plain-text reasons like "stream limit exceeded")
    if (upstreamStatus >= 400) {
      const upstreamHdr = upstreamResponse.headers;
      const detail: Record<string, unknown> = {
        status: upstreamStatus,
        durationMs,
        inFlightAtStart,
        inFlightNow: inFlight,
        server: upstreamHdr.get('server') ?? null,
        via: upstreamHdr.get('via') ?? null,
        contentType: upstreamHdr.get('content-type') ?? null,
        contentLength: upstreamHdr.get('content-length') ?? null,
      };
      const ct = upstreamHdr.get('content-type') ?? '';
      if (/^text\/|application\/(json|xml)/i.test(ct)) {
        // Clone so we don't consume the body before relaying it. Cap at
        // 256 chars to avoid log spam from large HTML error pages and to
        // ensure we don't accidentally capture sensitive identifiers
        // sometimes embedded in panel error pages.
        try {
          const cloned = upstreamResponse.clone();
          const text = await cloned.text();
          detail.bodySnippet = text.slice(0, 256).replace(/\s+/g, ' ').trim();
        } catch {
          detail.bodySnippet = '(unreadable)';
        }
      }
      log('fetch.error', detail);
    } else {
      log('fetch.ok', { status: upstreamStatus, durationMs, inFlightAtStart, inFlightNow: inFlight });
    }

    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set('access-control-allow-origin', '*');
    responseHeaders.set(
      'access-control-expose-headers',
      'content-length, content-range, accept-ranges, content-type'
    );
    responseHeaders.set('cache-control', 'no-store');

    // If the upstream returned an HLS manifest, rewrite every URI inside it
    // so the HLS client (Shaka, hls.js, …) fetches sub-playlists / segments /
    // encryption keys back through us. Without this, segments fail with 404
    // because their relative paths resolve against `${proxyBase}/...` instead
    // of the real upstream host. We cap the body at MAX_MANIFEST_BYTES to
    // avoid memory blowup on misbehaving upstreams; segments are streamed
    // unmodified through the `else` branch.
    const contentType = upstreamResponse.headers.get('content-type');
    if (
      upstreamResponse.body !== null &&
      upstreamResponse.ok &&
      isHlsManifestContentType(contentType)
    ) {
      const raw = await upstreamResponse.arrayBuffer();
      if (raw.byteLength > MAX_MANIFEST_BYTES) {
        log('manifest.too_large', { bytes: raw.byteLength });
        return c.text('upstream manifest too large', 502);
      }
      const text = new TextDecoder('utf-8').decode(raw);
      const rewritten = rewriteHlsManifest({
        body: text,
        effectiveUrl: upstreamResponse.url || upstreamUrl,
        proxyBase: deriveProxyBase(c.req.raw),
        secret: config.secret,
        userAgent: ua && ua.length > 0 ? ua : undefined,
      });
      const rewrittenBytes = new TextEncoder().encode(rewritten);
      responseHeaders.set('content-length', String(rewrittenBytes.byteLength));
      return new Response(rewrittenBytes, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  });

  // Subtitle discovery + extraction (ffprobe / ffmpeg on the host).
  registerSubtitleRoutes(app, { secret: config.secret, defaultUserAgent: config.defaultUserAgent, log });

  // Audio transcoding: remux MKV as fMP4 with video copy + AAC audio.
  registerTranscodeRoutes(app, { secret: config.secret, defaultUserAgent: config.defaultUserAgent, log });

  return app;
}

/** Hard cap on manifest size we'll buffer before refusing. 1 MiB is generous;
 *  most HLS manifests are well under 10 KiB. Segments are not buffered. */
const MAX_MANIFEST_BYTES = 1024 * 1024;

/**
 * Reconstruct the proxy's externally-reachable base URL from the incoming
 * request. We honour `X-Forwarded-Proto` / `X-Forwarded-Host` so that a
 * deployment behind ngrok or a reverse proxy still emits correct rewritten
 * URLs. Fallback is the request's own URL.
 */
function deriveProxyBase(req: Request): string {
  const url = new URL(req.url);
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  const proto = forwardedProto?.split(',')[0]?.trim() || url.protocol.replace(/:$/, '');
  const host = forwardedHost?.split(',')[0]?.trim() || url.host;
  return `${proto}://${host}`;
}
