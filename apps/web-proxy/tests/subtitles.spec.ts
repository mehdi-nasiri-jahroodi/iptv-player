import { describe, expect, test } from 'vitest';
import { createProxyApp } from '../src/index.js';
import { signProxyRequest } from '../src/hmac.js';

const SECRET = 'test-secret-for-unit-tests-1234';

const encodeUrl = (url: string) =>
  Buffer.from(url, 'utf8').toString('base64url');

const buildApp = () =>
  createProxyApp({
    secret: SECRET,
    defaultUserAgent: 'TestUA/1.0',
  });

describe('proxy /subtitles — auth', () => {
  test('returns 400 when u or sig is missing', async () => {
    const res = await buildApp().request('/subtitles');
    expect(res.status).toBe(400);
  });

  test('returns 403 on bad signature', async () => {
    const u = encodeUrl('http://example.com/movie.mkv');
    const res = await buildApp().request(`/subtitles?u=${u}&sig=deadbeef`);
    expect(res.status).toBe(403);
  });

  test('rejects non-http(s) schemes', async () => {
    const u = encodeUrl('file:///etc/passwd');
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await buildApp().request(`/subtitles?u=${u}&sig=${sig}`);
    expect(res.status).toBe(400);
  });

  test('responds 204 to OPTIONS preflight', async () => {
    const res = await buildApp().request('/subtitles', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('proxy /subtitles/extract — auth', () => {
  test('returns 400 when u or sig is missing', async () => {
    const res = await buildApp().request('/subtitles/extract');
    expect(res.status).toBe(400);
  });

  test('returns 403 on bad signature', async () => {
    const u = encodeUrl('http://example.com/movie.mkv');
    const res = await buildApp().request(
      `/subtitles/extract?u=${u}&sig=deadbeef&track=2`
    );
    expect(res.status).toBe(403);
  });

  test('returns 400 for invalid track index', async () => {
    const u = encodeUrl('http://example.com/movie.mkv');
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await buildApp().request(
      `/subtitles/extract?u=${u}&sig=${sig}&track=abc`
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('invalid track index');
  });

  test('returns 400 for negative track index', async () => {
    const u = encodeUrl('http://example.com/movie.mkv');
    const sig = signProxyRequest(SECRET, u, undefined);
    const res = await buildApp().request(
      `/subtitles/extract?u=${u}&sig=${sig}&track=-1`
    );
    expect(res.status).toBe(400);
  });

  test('responds 204 to OPTIONS preflight', async () => {
    const res = await buildApp().request('/subtitles/extract', {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
