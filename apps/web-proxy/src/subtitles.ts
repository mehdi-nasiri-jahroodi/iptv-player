/**
 * Subtitle extraction endpoints for the web proxy.
 *
 * Xtream panels serve VOD/series as MKV containers with embedded subtitle
 * tracks. Browsers cannot read MKV-embedded subtitles (only native players
 * like ExoPlayer can). This module uses ffprobe/ffmpeg on the host machine
 * to enumerate and extract subtitle tracks as WebVTT.
 *
 * Architecture:
 *   GET /subtitles         — ffprobe the upstream URL, return JSON track list,
 *                            AND kick off background batch extraction of all
 *                            extractable tracks (single ffmpeg process, one
 *                            HTTP download of the MKV).
 *   GET /subtitles/extract — serve a single track's WebVTT from cache. If the
 *                            background job hasn't finished yet, waits for it
 *                            (long-poll, up to 120s).
 *
 * Both require the same HMAC signature as /stream.
 * Privacy: upstream URLs are passed to ffprobe/ffmpeg as process arguments
 * (never logged). No URLs, UAs, or IPs are written to logs.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { verifyProxySignature } from './hmac.js';

/** A single subtitle track discovered by ffprobe. */
export interface SubtitleTrackInfo {
  index: number;
  language: string;
  label: string;
  codec: string;
  extractable: boolean;
}

/** Codecs that ffmpeg can convert to WebVTT. Bitmap subs (PGS, DVB) cannot. */
const TEXT_SUB_CODECS = new Set([
  'subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'srt',
]);

const DECODE_BASE64URL = (input: string): string | null => {
  try {
    const buf = Buffer.from(input, 'base64url');
    const text = buf.toString('utf8');
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'accept',
  'access-control-max-age': '600',
} as const;

function validateRequest(
  secret: string,
  u: string,
  sig: string,
  ua: string | undefined,
  log: (event: string, detail?: Record<string, unknown>) => void
): { url: string } | { error: Response } {
  if (!u || !sig) {
    return { error: new Response('missing u or sig', { status: 400 }) };
  }
  if (!verifyProxySignature(secret, u, ua, sig)) {
    log('sig.invalid');
    return { error: new Response('forbidden', { status: 403 }) };
  }
  const upstreamUrl = DECODE_BASE64URL(u);
  if (!upstreamUrl) {
    return { error: new Response('invalid u', { status: 400 }) };
  }
  let parsed: URL;
  try {
    parsed = new URL(upstreamUrl);
  } catch {
    return { error: new Response('invalid u', { status: 400 }) };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: new Response('invalid scheme', { status: 400 }) };
  }
  return { url: upstreamUrl };
}

// ---------------------------------------------------------------------------
// ffprobe
// ---------------------------------------------------------------------------

interface ProbeResult {
  tracks: SubtitleTrackInfo[];
  /** Duration in seconds, or null if unavailable. */
  duration: number | null;
}

function probeSubtitles(
  upstreamUrl: string,
  userAgent: string
): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 's',
        '-show_format',
        '-user_agent', userAgent,
        '-i', upstreamUrl,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 256 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`ffprobe: ${err.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ''}`));
          return;
        }
        try {
          const data = JSON.parse(stdout) as {
            streams?: Array<{
              index?: number;
              codec_name?: string;
              tags?: { language?: string; title?: string };
            }>;
            format?: { duration?: string };
          };
          const tracks: SubtitleTrackInfo[] = (data.streams ?? []).map((s) => {
            const codec = s.codec_name ?? 'unknown';
            return {
              index: s.index ?? 0,
              language: s.tags?.language ?? 'und',
              label: s.tags?.title ?? s.tags?.language ?? 'Unknown',
              codec,
              extractable: TEXT_SUB_CODECS.has(codec),
            };
          });
          const dur = parseFloat(data.format?.duration ?? '');
          resolve({
            tracks,
            duration: Number.isFinite(dur) ? dur : null,
          });
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Batch extraction cache
// ---------------------------------------------------------------------------

interface ExtractionJob {
  /** Resolves when ALL tracks are extracted (or the job failed). */
  promise: Promise<void>;
  /** Track index → WebVTT Buffer (populated as extraction completes). */
  tracks: Map<number, Buffer>;
  /** Non-null if the job failed. */
  error: string | null;
  /** Timestamp when the job was created (for cache eviction). */
  createdAt: number;
}

/** In-memory cache keyed by upstream URL. */
const extractionCache = new Map<string, ExtractionJob>();

/** Evict cache entries older than 1 hour. */
const CACHE_TTL_MS = 60 * 60 * 1000;

function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, job] of extractionCache) {
    if (now - job.createdAt > CACHE_TTL_MS) {
      extractionCache.delete(key);
    }
  }
}

/**
 * Start a background batch extraction of all extractable subtitle tracks.
 * One ffmpeg process, one HTTP download, all tracks extracted to temp files,
 * then read into memory.
 */
function startBatchExtraction(
  upstreamUrl: string,
  extractableTracks: SubtitleTrackInfo[],
  userAgent: string,
  log: (event: string, detail?: Record<string, unknown>) => void
): ExtractionJob {
  const existing = extractionCache.get(upstreamUrl);
  if (existing) return existing;

  evictStaleEntries();

  const trackMap = new Map<number, Buffer>();
  const job: ExtractionJob = {
    promise: Promise.resolve(),
    tracks: trackMap,
    error: null,
    createdAt: Date.now(),
  };

  job.promise = (async () => {
    let tempDir: string | null = null;
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'iptv-subs-'));

      // Build ffmpeg args: one -map + output per extractable track.
      const args: string[] = [
        '-v', 'error',
        '-user_agent', userAgent,
        '-i', upstreamUrl,
      ];
      for (const t of extractableTracks) {
        args.push(
          '-map', `0:${t.index}`,
          '-c:s', 'webvtt',
          '-f', 'webvtt',
          join(tempDir, `track_${t.index}.vtt`)
        );
      }

      const startedAt = Date.now();
      await new Promise<void>((resolve, reject) => {
        execFile('ffmpeg', args, { timeout: 180_000 }, (err, _stdout, stderr) => {
          if (err) {
            const msg = stderr ? stderr.slice(0, 200) : '';
            reject(new Error(`ffmpeg: ${err.message}${msg ? ` — ${msg}` : ''}`));
          } else {
            resolve();
          }
        });
      });

      // Read all extracted files into memory.
      for (const t of extractableTracks) {
        try {
          const buf = await readFile(join(tempDir, `track_${t.index}.vtt`));
          trackMap.set(t.index, buf);
        } catch {
          // Individual track failed — skip it.
        }
      }

      log('subtitles.batch-extract', {
        trackCount: trackMap.size,
        totalBytes: [...trackMap.values()].reduce((s, b) => s + b.byteLength, 0),
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      job.error = err instanceof Error ? err.message : 'unknown';
      log('subtitles.batch-extract.failed', { error: job.error });
    } finally {
      // Clean up temp files.
      if (tempDir) {
        rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  })();

  extractionCache.set(upstreamUrl, job);
  return job;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerSubtitleRoutes(
  app: Hono,
  config: {
    secret: string;
    defaultUserAgent: string;
    log: (event: string, detail?: Record<string, unknown>) => void;
  }
): void {
  const { secret, defaultUserAgent, log } = config;

  app.options('/subtitles', () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  });
  app.options('/subtitles/extract', () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  });

  // -----------------------------------------------------------------------
  // GET /subtitles — enumerate tracks via ffprobe + start batch extraction
  // -----------------------------------------------------------------------
  app.get('/subtitles', async (c) => {
    const u = c.req.query('u') ?? '';
    const sig = c.req.query('sig') ?? '';
    const ua = c.req.query('ua');

    const validated = validateRequest(secret, u, sig, ua, log);
    if ('error' in validated) return validated.error;

    const userAgent = ua && ua.length > 0 ? ua : defaultUserAgent;

    try {
      const startedAt = Date.now();
      const { tracks, duration } = await probeSubtitles(validated.url, userAgent);
      log('subtitles.probe', {
        trackCount: tracks.length,
        duration,
        durationMs: Date.now() - startedAt,
      });

      // Kick off background batch extraction for all extractable tracks.
      const extractable = tracks.filter((t) => t.extractable);
      if (extractable.length > 0) {
        startBatchExtraction(validated.url, extractable, userAgent, log);
      }

      // Response includes tracks + duration (for transcode seekbar).
      return new Response(JSON.stringify({ tracks, duration }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=3600',
        },
      });
    } catch (err) {
      log('subtitles.probe.failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      return c.text('ffprobe failed', 502);
    }
  });

  // -----------------------------------------------------------------------
  // GET /subtitles/extract — serve a single track from batch cache
  // -----------------------------------------------------------------------
  app.get('/subtitles/extract', async (c) => {
    const u = c.req.query('u') ?? '';
    const sig = c.req.query('sig') ?? '';
    const ua = c.req.query('ua');
    const trackStr = c.req.query('track') ?? '';

    const validated = validateRequest(secret, u, sig, ua, log);
    if ('error' in validated) return validated.error;

    const trackIndex = Number(trackStr);
    if (!Number.isFinite(trackIndex) || trackIndex < 0) {
      return c.text('invalid track index', 400);
    }

    const job = extractionCache.get(validated.url);
    if (!job) {
      // No batch job — caller should hit /subtitles first.
      return c.text('no extraction job found — call /subtitles first', 404);
    }

    // Wait for the batch job to complete (up to 120s).
    await job.promise;

    if (job.error) {
      return c.text('extraction failed', 502);
    }

    const vtt = job.tracks.get(trackIndex);
    if (!vtt) {
      return c.text('track not found in extraction results', 404);
    }

    return new Response(vtt, {
      status: 200,
      headers: {
        'content-type': 'text/vtt; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=86400',
      },
    });
  });
}
