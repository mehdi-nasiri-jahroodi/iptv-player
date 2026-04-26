import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  buildSignedProxyUrl,
  encodeProxyUrl,
  signProxyRequest,
} from '../../src/lib/proxy-signing.js';

/**
 * These tests guarantee byte-parity between the browser-side signer
 * (Web Crypto) and the proxy-side verifier (`node:crypto`). A single
 * regression here breaks every signed URL the user generates.
 */
describe('proxy-signing — Web Crypto / Node parity', () => {
  const SECRET = 'a-very-long-test-secret-at-least-16-chars';
  const UPSTREAM = 'http://myhand.org:8080/live/u/p/12345.m3u8';

  function nodeSign(secret: string, u: string, ua: string | undefined): string {
    return createHmac('sha256', secret)
      .update(`${u}|${ua ?? ''}`)
      .digest('hex');
  }

  it('encodeProxyUrl matches Buffer.from(url, "utf8").toString("base64url")', () => {
    const expected = Buffer.from(UPSTREAM, 'utf8').toString('base64url');
    expect(encodeProxyUrl(UPSTREAM)).toBe(expected);
  });

  it('encodeProxyUrl handles non-ASCII (UTF-8 multibyte) characters', () => {
    const url = 'https://例え.test/مسار/path?q=ñ';
    const expected = Buffer.from(url, 'utf8').toString('base64url');
    expect(encodeProxyUrl(url)).toBe(expected);
  });

  it('signProxyRequest with no UA matches Node hex digest', async () => {
    const u = encodeProxyUrl(UPSTREAM);
    const sig = await signProxyRequest({ secret: SECRET, encodedUrl: u });
    expect(sig).toBe(nodeSign(SECRET, u, undefined));
  });

  it('signProxyRequest with UA matches Node hex digest', async () => {
    const u = encodeProxyUrl(UPSTREAM);
    const ua = 'IPTVSmartersPlayer 3.1';
    const sig = await signProxyRequest({
      secret: SECRET,
      encodedUrl: u,
      userAgent: ua,
    });
    expect(sig).toBe(nodeSign(SECRET, u, ua));
  });

  it('signProxyRequest treats empty UA the same as undefined (canonical "")', async () => {
    const u = encodeProxyUrl(UPSTREAM);
    const undef = await signProxyRequest({ secret: SECRET, encodedUrl: u });
    const empty = await signProxyRequest({
      secret: SECRET,
      encodedUrl: u,
      userAgent: '',
    });
    expect(undef).toBe(empty);
    expect(undef).toBe(nodeSign(SECRET, u, ''));
  });

  it('different secrets produce different signatures', async () => {
    const u = encodeProxyUrl(UPSTREAM);
    const a = await signProxyRequest({ secret: 'secret-a-aaaaaaaaaaaa', encodedUrl: u });
    const b = await signProxyRequest({ secret: 'secret-b-bbbbbbbbbbbb', encodedUrl: u });
    expect(a).not.toBe(b);
  });

  it('different UAs produce different signatures', async () => {
    const u = encodeProxyUrl(UPSTREAM);
    const a = await signProxyRequest({ secret: SECRET, encodedUrl: u, userAgent: 'A' });
    const b = await signProxyRequest({ secret: SECRET, encodedUrl: u, userAgent: 'B' });
    expect(a).not.toBe(b);
  });

  it('hex output is lowercase 64-char SHA-256', async () => {
    const u = encodeProxyUrl(UPSTREAM);
    const sig = await signProxyRequest({ secret: SECRET, encodedUrl: u });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildSignedProxyUrl', () => {
  const SECRET = 'a-very-long-test-secret-at-least-16-chars';
  const UPSTREAM = 'http://myhand.org:8080/live/u/p/12345.m3u8';

  it('produces a URL the proxy can verify (Node-side cross-check)', async () => {
    const out = await buildSignedProxyUrl({
      baseUrl: 'http://localhost:8787',
      secret: SECRET,
      upstreamUrl: UPSTREAM,
    });
    const parsed = new URL(out);
    expect(parsed.origin + parsed.pathname).toBe('http://localhost:8787/stream');
    const u = parsed.searchParams.get('u');
    const sig = parsed.searchParams.get('sig');
    expect(u).toBeTruthy();
    expect(sig).toBeTruthy();
    // Sig over (u, ua=undefined) must match Node createHmac.
    expect(sig).toBe(
      createHmac('sha256', SECRET).update(`${u}|`).digest('hex')
    );
    // u decodes back to the original upstream URL.
    expect(Buffer.from(u as string, 'base64url').toString('utf8')).toBe(UPSTREAM);
  });

  it('strips trailing slash from baseUrl', async () => {
    const out = await buildSignedProxyUrl({
      baseUrl: 'http://localhost:8787//',
      secret: SECRET,
      upstreamUrl: UPSTREAM,
    });
    expect(out.startsWith('http://localhost:8787/stream?')).toBe(true);
  });

  it('includes URL-encoded ua param when userAgent set', async () => {
    const out = await buildSignedProxyUrl({
      baseUrl: 'http://localhost:8787',
      secret: SECRET,
      upstreamUrl: UPSTREAM,
      userAgent: 'IPTV/1.0 (test)',
    });
    const parsed = new URL(out);
    expect(parsed.searchParams.get('ua')).toBe('IPTV/1.0 (test)');
  });

  it('omits ua param when userAgent is undefined', async () => {
    const out = await buildSignedProxyUrl({
      baseUrl: 'http://localhost:8787',
      secret: SECRET,
      upstreamUrl: UPSTREAM,
    });
    const parsed = new URL(out);
    expect(parsed.searchParams.has('ua')).toBe(false);
  });
});
