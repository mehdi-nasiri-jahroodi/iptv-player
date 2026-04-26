/**
 * Stream-proxy URL signing using Web Crypto.
 *
 * Produces hex digests byte-identical to the Node-side
 * `createHmac('sha256', secret).update(`${u}|${ua ?? ''}`).digest('hex')`
 * implementation in `apps/web-proxy/src/hmac.ts`. The two MUST stay in
 * lockstep — diverging the canonical string or output encoding breaks
 * every signed URL.
 *
 * URL-safe base64 is used for the `u` parameter so the encoded upstream
 * URL survives query-string transport without further escaping. The
 * canonical signing string is `${u}|${ua ?? ''}` — a literal empty
 * string when no UA override is set, matching the proxy.
 */

/** Browser/Node WebCrypto handle. Defined in every modern runtime. */
function getCrypto(): Crypto {
  // `globalThis.crypto` is available in browsers, Workers, and Node 19+.
  // Tests in node run under jsdom which polyfills it; we never want a
  // build-time fallback that silently produces wrong digests.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error(
      'Web Crypto unavailable; stream-proxy signing requires SubtleCrypto.'
    );
  }
  return c;
}

/** Encode a Uint8Array as base64url (no padding, `-`/`_` alphabet). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  // `btoa` is part of the WHATWG spec; available in jsdom + browsers.
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Encode a Uint8Array as lowercase hex. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    const v = bytes[i];
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}

/**
 * Encode the upstream URL as base64url over UTF-8 bytes.
 *
 * Mirrors `Buffer.from(url, 'utf8').toString('base64url')` on the proxy
 * side. We never persist or log the result — it is a stable opaque
 * token, not a credential, but it does identify the stream URL.
 */
export function encodeProxyUrl(upstreamUrl: string): string {
  const bytes = new TextEncoder().encode(upstreamUrl);
  return toBase64Url(bytes);
}

/**
 * HMAC-SHA256 signature for a proxy request.
 *
 * @param params.secret - shared secret matching the proxy `PROXY_SECRET` env.
 * @param params.encodedUrl - the base64url `u=` token (from {@link encodeProxyUrl}).
 * @param params.userAgent - optional User-Agent override; empty/undefined hash to the same value.
 * @returns lowercase hex digest, identical to what `signProxyRequest` produces in Node.
 */
export async function signProxyRequest(params: {
  secret: string;
  encodedUrl: string;
  userAgent?: string;
}): Promise<string> {
  const { secret, encodedUrl, userAgent } = params;
  const subtle = getCrypto().subtle;
  const keyBytes = new TextEncoder().encode(secret);
  const key = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const message = new TextEncoder().encode(`${encodedUrl}|${userAgent ?? ''}`);
  const sig = await subtle.sign('HMAC', key, message);
  return toHex(new Uint8Array(sig));
}

/**
 * Build a fully-signed proxy URL for a given upstream URL.
 *
 * Drops a trailing slash from `baseUrl` if present so the join is clean.
 * Adds `&ua=<encoded>` when `userAgent` is set; otherwise omits the
 * parameter entirely (the proxy treats absent and empty UA identically
 * in its signing canonicalisation).
 */
export async function buildSignedProxyUrl(params: {
  baseUrl: string;
  secret: string;
  upstreamUrl: string;
  userAgent?: string;
}): Promise<string> {
  const { baseUrl, secret, upstreamUrl, userAgent } = params;
  const u = encodeProxyUrl(upstreamUrl);
  const sig = await signProxyRequest({ secret, encodedUrl: u, userAgent });
  const base = baseUrl.replace(/\/+$/, '');
  const ua = userAgent ? `&ua=${encodeURIComponent(userAgent)}` : '';
  return `${base}/stream?u=${u}${ua}&sig=${sig}`;
}
