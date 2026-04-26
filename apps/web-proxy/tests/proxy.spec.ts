import { describe, expect, test, vi } from 'vitest';
import { createProxyApp } from '../src/index.js';
import { signProxyRequest } from '../src/hmac.js';

const SECRET = 'test-secret-for-unit-tests-1234';

const encodeUrl = (url: string) =>
  Buffer.from(url, 'utf8').toString('base64url');

interface BuildAppOptions {
  fetchImpl?: typeof fetch;
  defaultUserAgent?: string;
}

const buildApp = (opts: BuildAppOptions = {}) =>
  createProxyApp({
    secret: SECRET,
    defaultUserAgent: opts.defaultUserAgent ?? 'TestUA/1.0',
    fetchImpl: opts.fetchImpl,
  });

describe('proxy /healthz', () => {
  test('responds 200 ok', async () => {
    const res = await buildApp().request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  test('includes CORS allow-origin so the web app can read the body', async () => {
    // The web app fetches /healthz from a different origin (web dev
    // server vs. the proxy). Without this header the browser surfaces
    // the response as a CORS failure even though the server returned
    // 200, breaking the Settings "Test connection" button.
    const res = await buildApp().request('/healthz');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('responds 204 to OPTIONS preflight on /healthz', async () => {
    const res = await buildApp().request('/healthz', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('proxy /stream — auth', () => {
  test('returns 400 when u or sig is missing', async () => {
    const app = buildApp();
    const res = await app.request('/stream');
    expect(res.status).toBe(400);
  });

  test('returns 403 on bad signature', async () => {
    const app = buildApp();
    const u = encodeUrl('http://example.com/x.m3u8');
    const res = await app.request(`/stream?u=${u}&sig=deadbeef`);
    expect(res.status).toBe(403);
  });

  test('returns 403 when sig matches u but ua was tampered with', async () => {
    const upstreamUrl = 'http://example.com/x.m3u8';
    const u = encodeUrl(upstreamUrl);
    // Sign with one UA, then attempt the request with a different UA in the
    // query — signature must include the UA so this must fail.
    const sig = signProxyRequest(SECRET, u, 'OriginalUA');
    const res = await buildApp().request(
      `/stream?u=${u}&ua=${encodeURIComponent('TamperedUA')}&sig=${sig}`
    );
    expect(res.status).toBe(403);
  });

  test('rejects invalid base64url payload even when sig matches', async () => {
    const u = '!!! not base64 !!!';
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await buildApp().request(`/stream?u=${u}&sig=${sig}`);
    expect(res.status).toBe(400);
  });

  test('rejects non-http(s) schemes', async () => {
    const u = encodeUrl('file:///etc/passwd');
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await buildApp().request(`/stream?u=${u}&sig=${sig}`);
    expect(res.status).toBe(400);
  });
});

describe('proxy /stream — happy path', () => {
  test('forwards upstream body, status, and content-type with permissive CORS', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      })
    );
    const app = buildApp({ fetchImpl });
    const url = 'http://example.com/live/x.m3u8';
    const u = encodeUrl(url);
    const sig = signProxyRequest(SECRET, u, undefined);

    const res = await app.request(`/stream?u=${u}&sig=${sig}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('#EXTM3U\n#EXT-X-VERSION:3\n');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.apple.mpegurl'
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = fetchImpl.mock.calls[0]?.[0];
    expect(calledUrl).toBe(url);
  });

  test('forges the default User-Agent when none is supplied', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(''));
    const app = buildApp({
      fetchImpl,
      defaultUserAgent: 'IPTVSmartersPlayer 3.1',
    });
    const u = encodeUrl('http://example.com/x.m3u8');
    const sig = signProxyRequest(SECRET, u, undefined);

    await app.request(`/stream?u=${u}&sig=${sig}`);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['user-agent']).toBe('IPTVSmartersPlayer 3.1');
  });

  test('forges the per-request User-Agent when supplied via ua query', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(''));
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://example.com/x.m3u8');
    const ua = 'Lavf/58.76.100';
    const sig = signProxyRequest(SECRET, u, ua);

    await app.request(
      `/stream?u=${u}&ua=${encodeURIComponent(ua)}&sig=${sig}`
    );

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['user-agent']).toBe(ua);
  });

  test('forwards Range request header to upstream', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response('partial', {
          status: 206,
          headers: { 'content-range': 'bytes 0-99/1000' },
        })
    );
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://example.com/seg.ts');
    const sig = signProxyRequest(SECRET, u, undefined);

    const res = await app.request(`/stream?u=${u}&sig=${sig}`, {
      headers: { range: 'bytes=0-99' },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-99/1000');
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['range']).toBe('bytes=0-99');
  });

  test('strips upstream cache + cookie headers and overrides cache-control', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response('body', {
          headers: {
            'cache-control': 'public, max-age=3600',
            'set-cookie': 'session=evil; HttpOnly',
            'content-type': 'video/mp2t',
          },
        })
    );
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://example.com/seg.ts');
    const sig = signProxyRequest(SECRET, u, undefined);

    const res = await app.request(`/stream?u=${u}&sig=${sig}`);

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('content-type')).toBe('video/mp2t');
  });

  test('returns 502 when the upstream fetch throws', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://example.com/x.m3u8');
    const sig = signProxyRequest(SECRET, u, undefined);

    const res = await app.request(`/stream?u=${u}&sig=${sig}`);
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/ECONNREFUSED/);
  });

  test('OPTIONS preflight returns 204 with permissive CORS headers', async () => {
    const res = await buildApp().request('/stream', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers') ?? '').toContain(
      'range'
    );
  });
});

describe('proxy /stream — manifest rewriting', () => {
  test('rewrites HLS manifest URIs through the proxy when content-type is m3u8', async () => {
    const upstreamManifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXTINF:10.0,',
      '/hlsr/abc/seg_190.ts',
    ].join('\n');
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const res = new Response(upstreamManifest, {
        status: 200,
        headers: { 'content-type': 'application/x-mpegurl' },
      });
      // Simulate the upstream having redirected from origin → CDN; the rewriter
      // must resolve segment URIs against `response.url`, not the request URL.
      Object.defineProperty(res, 'url', {
        value: 'http://cdn.example.com:2095/live/x.m3u8',
      });
      return res;
    });
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://origin.example.com/live/x.m3u8');
    const sig = signProxyRequest(SECRET, u, undefined);

    const res = await app.request(
      `http://proxy.local:8787/stream?u=${u}&sig=${sig}`
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('#EXTM3U');
    expect(body).not.toContain('/hlsr/abc/seg_190.ts\n');
    // The rewritten line must point at our proxy host (derived from request).
    const rewritten = body
      .split('\n')
      .find((l) => l.startsWith('http://proxy.local:8787/stream?'));
    expect(rewritten).toBeTruthy();
    // And it must encode the absolute upstream URL based on the CDN host
    // (the redirect target), not the original origin.
    const decodedU = Buffer.from(
      new URL(rewritten as string).searchParams.get('u') as string,
      'base64url'
    ).toString('utf8');
    expect(decodedU).toBe('http://cdn.example.com:2095/hlsr/abc/seg_190.ts');
  });

  test('does not rewrite non-manifest content types (segment passes through)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response('binary segment data', {
        status: 200,
        headers: { 'content-type': 'video/mp2t' },
      });
    });
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://example.com/seg.ts');
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await app.request(`/stream?u=${u}&sig=${sig}`);
    expect(await res.text()).toBe('binary segment data');
  });

  test('honours x-forwarded-proto + x-forwarded-host when deriving proxy base', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response('#EXTM3U\n/seg.ts', {
          status: 200,
          headers: { 'content-type': 'application/x-mpegurl' },
        })
    );
    const app = buildApp({ fetchImpl });
    const u = encodeUrl('http://example.com/live/x.m3u8');
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await app.request(`/stream?u=${u}&sig=${sig}`, {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'abcd.ngrok-free.app',
      },
    });
    const body = await res.text();
    expect(body).toContain('https://abcd.ngrok-free.app/stream?');
  });
});

describe('signProxyRequest', () => {
  test('produces stable hex output of length 64 (SHA-256)', () => {
    const sig = signProxyRequest(SECRET, 'abc', 'ua');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test('depends on the UA', () => {
    const a = signProxyRequest(SECRET, 'abc', 'one');
    const b = signProxyRequest(SECRET, 'abc', 'two');
    expect(a).not.toBe(b);
  });

  test('treats undefined UA as empty string', () => {
    const a = signProxyRequest(SECRET, 'abc', undefined);
    const b = signProxyRequest(SECRET, 'abc', '');
    expect(a).toBe(b);
  });
});
