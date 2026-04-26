import { describe, expect, test } from 'vitest';
import {
  isHlsManifestContentType,
  rewriteHlsManifest,
} from '../src/manifest.js';
import { signProxyRequest } from '../src/hmac.js';

const SECRET = 'test-secret-for-unit-tests-1234';
const PROXY_BASE = 'http://proxy.local:8787';

describe('isHlsManifestContentType', () => {
  test('matches the four canonical m3u8 content types', () => {
    expect(isHlsManifestContentType('application/vnd.apple.mpegurl')).toBe(
      true
    );
    expect(isHlsManifestContentType('application/x-mpegurl')).toBe(true);
    expect(isHlsManifestContentType('audio/mpegurl')).toBe(true);
    expect(isHlsManifestContentType('audio/x-mpegurl')).toBe(true);
  });

  test('strips charset suffix and is case-insensitive', () => {
    expect(
      isHlsManifestContentType('Application/X-Mpegurl; charset=utf-8')
    ).toBe(true);
  });

  test('returns false for non-HLS content types', () => {
    expect(isHlsManifestContentType('video/mp2t')).toBe(false);
    expect(isHlsManifestContentType('application/dash+xml')).toBe(false);
    expect(isHlsManifestContentType(null)).toBe(false);
    expect(isHlsManifestContentType(undefined)).toBe(false);
    expect(isHlsManifestContentType('')).toBe(false);
  });
});

describe('rewriteHlsManifest', () => {
  test('rewrites bare relative segment URIs to signed proxy URLs', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:9.9,',
      '/hlsr/abc/833633_190.ts',
      '#EXTINF:10.0,',
      '/hlsr/abc/833633_191.ts',
    ].join('\n');

    const out = rewriteHlsManifest({
      body,
      effectiveUrl: 'http://cdn.example.com:2095/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: undefined,
    });

    // Tags untouched
    expect(out).toContain('#EXTM3U');
    expect(out).toContain('#EXT-X-VERSION:3');
    expect(out).toContain('#EXTINF:9.9,');

    // Bare URIs replaced with absolute proxy URLs
    expect(out).not.toContain('/hlsr/abc/833633_190.ts\n');
    expect(out).not.toContain('/hlsr/abc/833633_191.ts');

    // Each rewritten URI must be a /stream URL with u + sig
    const streamLines = out
      .split('\n')
      .filter((l) => l.startsWith(`${PROXY_BASE}/stream?`));
    expect(streamLines).toHaveLength(2);
    for (const line of streamLines) {
      const params = new URL(line).searchParams;
      expect(params.get('u')).toBeTruthy();
      expect(params.get('sig')).toMatch(/^[0-9a-f]{64}$/);

      const u = params.get('u');
      const sig = params.get('sig');
      expect(u && sig).toBeTruthy();
      // Sig must verify against the secret + (u, ua=undefined → '')
      const expected = signProxyRequest(SECRET, u as string, undefined);
      expect(sig).toBe(expected);
    }

    // Decode the first one to confirm the absolute upstream URL is correct
    const firstU = new URL(streamLines[0] as string).searchParams.get(
      'u'
    ) as string;
    const decoded = Buffer.from(firstU, 'base64url').toString('utf8');
    expect(decoded).toBe(
      'http://cdn.example.com:2095/hlsr/abc/833633_190.ts'
    );
  });

  test('resolves segment URIs against the post-redirect effective URL, not the original', () => {
    const body = ['#EXTM3U', '/hlsr/seg.ts'].join('\n');
    const out = rewriteHlsManifest({
      body,
      // The fetch was followed from origin → CDN; segments should resolve
      // against the CDN node, otherwise the proxy will request a path on a
      // host that doesn't have it.
      effectiveUrl: 'http://cdn-node.example.com/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: undefined,
    });
    const streamLine = out
      .split('\n')
      .find((l) => l.startsWith(`${PROXY_BASE}/stream?`)) as string;
    const u = new URL(streamLine).searchParams.get('u') as string;
    const decoded = Buffer.from(u, 'base64url').toString('utf8');
    expect(decoded).toBe('http://cdn-node.example.com/hlsr/seg.ts');
  });

  test('rewrites URI="..." inside EXT-X-KEY without breaking the rest of the line', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/k1.bin",IV=0xabcd',
      '/hlsr/seg.ts',
    ].join('\n');

    const out = rewriteHlsManifest({
      body,
      effectiveUrl: 'http://cdn.example.com/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: undefined,
    });

    const keyLine = out
      .split('\n')
      .find((l) => l.startsWith('#EXT-X-KEY:')) as string;
    expect(keyLine).toContain('METHOD=AES-128');
    expect(keyLine).toContain('IV=0xabcd');
    const match = keyLine.match(/URI="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(/^http:\/\/proxy\.local:8787\/stream\?/);
    const u = new URL(match?.[1] as string).searchParams.get('u') as string;
    expect(Buffer.from(u, 'base64url').toString('utf8')).toBe(
      'https://keys.example.com/k1.bin'
    );
  });

  test('rewrites URI="..." inside EXT-X-MAP, EXT-X-MEDIA, EXT-X-I-FRAME-STREAM-INF', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="1024@0"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",NAME="English",URI="aud.m3u8"',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=10000,URI="iframe.m3u8"',
    ].join('\n');

    const out = rewriteHlsManifest({
      body,
      effectiveUrl: 'http://cdn.example.com/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: undefined,
    });

    const lines = out.split('\n');
    for (const tag of [
      '#EXT-X-MAP:',
      '#EXT-X-MEDIA:',
      '#EXT-X-I-FRAME-STREAM-INF:',
    ]) {
      const line = lines.find((l) => l.startsWith(tag)) as string;
      expect(line).toBeTruthy();
      const match = line.match(/URI="([^"]+)"/);
      expect(match?.[1]).toMatch(/^http:\/\/proxy\.local:8787\/stream\?/);
    }
  });

  test('leaves bare-URI lines intact when the URI cannot be resolved', () => {
    const body = ['#EXTM3U', 'data:text/plain,hello'].join('\n');
    const out = rewriteHlsManifest({
      body,
      effectiveUrl: 'http://cdn.example.com/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: undefined,
    });
    expect(out).toContain('data:text/plain,hello');
  });

  test('preserves CRLF line endings when the input uses them', () => {
    const body = '#EXTM3U\r\n#EXTINF:9.9,\r\n/hlsr/seg.ts\r\n';
    const out = rewriteHlsManifest({
      body,
      effectiveUrl: 'http://cdn.example.com/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: undefined,
    });
    expect(out.includes('\r\n')).toBe(true);
  });

  test('embeds the user-agent in the rewritten URL and signature when supplied', () => {
    const body = '#EXTM3U\n/seg.ts';
    const ua = 'Lavf/58.76.100';
    const out = rewriteHlsManifest({
      body,
      effectiveUrl: 'http://cdn.example.com/live/x.m3u8',
      proxyBase: PROXY_BASE,
      secret: SECRET,
      userAgent: ua,
    });
    const streamLine = out
      .split('\n')
      .find((l) => l.startsWith(PROXY_BASE)) as string;
    const params = new URL(streamLine).searchParams;
    expect(params.get('ua')).toBe(ua);
    const u = params.get('u') as string;
    expect(params.get('sig')).toBe(signProxyRequest(SECRET, u, ua));
  });

  test('strips a trailing slash on the proxy base before composing URLs', () => {
    const out = rewriteHlsManifest({
      body: '#EXTM3U\n/seg.ts',
      effectiveUrl: 'http://cdn.example.com/live/x.m3u8',
      proxyBase: 'http://proxy.local:8787/',
      secret: SECRET,
      userAgent: undefined,
    });
    expect(out).toContain('http://proxy.local:8787/stream?');
    expect(out).not.toContain('http://proxy.local:8787//stream?');
  });
});
