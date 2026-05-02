/**
 * Audio transcoding endpoint for the web proxy.
 *
 * Most Xtream panel movies use EAC3/AC3/DTS audio in MKV containers.
 * Browsers cannot decode these codecs. This endpoint uses ffmpeg to:
 *   - Copy the video stream (no re-encode — zero quality loss, near-zero CPU)
 *   - Transcode audio to AAC stereo (widely supported in all browsers)
 *   - Output fragmented MP4 (fMP4) which browsers can play natively
 *
 * The output is streamed — playback starts within ~1-2s.
 *
 * Seeking: the `start` query param (seconds) tells ffmpeg to `-ss` seek
 * into the input before transcoding. The client rebuilds the URL on seek.
 *
 * Endpoint:
 *   GET /transcode  — stream the upstream MKV as fMP4
 *   HEAD /transcode — return headers only (Shaka probing)
 *
 * Requires the same HMAC signature as /stream.
 * Privacy: upstream URLs are passed to ffmpeg as process arguments (never logged).
 */

import { execFile, spawn } from 'node:child_process';
import { Hono } from 'hono';
import { verifyProxySignature } from './hmac.js';

const DECODE_BASE64URL = (input: string): string | null => {
  try {
    const buf = Buffer.from(input, 'base64url');
    const text = buf.toString('utf8');
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
};

/** Validate common params; returns upstream URL or error Response. */
function validateTranscodeRequest(
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

/**
 * Probe the upstream file's duration with ffprobe.
 * Returns duration in seconds, or null if unavailable.
 */
function probeDuration(
  upstreamUrl: string,
  userAgent: string
): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        '-user_agent', userAgent,
        '-i', upstreamUrl,
      ],
      { timeout: 15_000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const d = parseFloat(stdout.trim());
        resolve(Number.isFinite(d) ? d : null);
      }
    );
  });
}

/** In-memory cache for probed durations (keyed by upstream URL). */
const durationCache = new Map<string, number>();

export function registerTranscodeRoutes(
  app: Hono,
  config: {
    secret: string;
    defaultUserAgent: string;
    log: (event: string, detail?: Record<string, unknown>) => void;
  }
): void {
  const { secret, defaultUserAgent, log } = config;

  // CORS preflight
  app.options('/transcode', () => {
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

  // -----------------------------------------------------------------------
  // HEAD /transcode — instant response for Shaka probing. Duration is
  // probed lazily in the background; the client reads it from the GET
  // response headers or via a separate HEAD after playback starts.
  // -----------------------------------------------------------------------
  app.on('HEAD', '/transcode', async (c) => {
    const u = c.req.query('u') ?? '';
    const sig = c.req.query('sig') ?? '';
    const ua = c.req.query('ua');

    const validated = validateTranscodeRequest(secret, u, sig, ua, log);
    if ('error' in validated) return validated.error;

    const userAgent = ua && ua.length > 0 ? ua : defaultUserAgent;

    // Return immediately. Kick off a background duration probe if not cached.
    const duration = durationCache.get(validated.url) ?? null;
    if (duration === null) {
      void probeDuration(validated.url, userAgent).then((d) => {
        if (d !== null) durationCache.set(validated.url, d);
      });
    }

    const headers: Record<string, string> = {
      'content-type': 'video/mp4',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-type, x-content-duration, accept-ranges',
      'cache-control': 'no-store',
      'accept-ranges': 'none',
    };
    if (duration !== null) {
      headers['x-content-duration'] = String(duration);
    }

    return new Response(null, { status: 200, headers });
  });

  // -----------------------------------------------------------------------
  // GET /transcode — stream upstream MKV as fMP4 (video copy + AAC audio)
  // -----------------------------------------------------------------------
  app.get('/transcode', async (c) => {
    const u = c.req.query('u') ?? '';
    const sig = c.req.query('sig') ?? '';
    const ua = c.req.query('ua');
    const startStr = c.req.query('start');

    const validated = validateTranscodeRequest(secret, u, sig, ua, log);
    if ('error' in validated) return validated.error;

    const userAgent = ua && ua.length > 0 ? ua : defaultUserAgent;

    // Optional seek start time (seconds).
    const startSeconds = startStr ? parseFloat(startStr) : 0;
    const seekOffset =
      Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;

    const startedAt = Date.now();
    log('transcode.start', { seekOffset });

    // Build ffmpeg args.
    const args: string[] = ['-v', 'error', '-user_agent', userAgent];

    // -ss before -i = input seeking (fast, keyframe-accurate).
    if (seekOffset > 0) {
      args.push('-ss', String(seekOffset));
    }

    args.push(
      '-i', validated.url,
      '-map', '0:v:0',
      '-c:v', 'copy',
      '-map', '0:a:0',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    );

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrChunks: Buffer[] = [];
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      if (stderrChunks.reduce((s, b) => s + b.byteLength, 0) > 4096) {
        stderrChunks = stderrChunks.slice(-2);
      }
    });

    ffmpeg.on('close', (code) => {
      const durationMs = Date.now() - startedAt;
      if (code !== 0 && code !== null) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').slice(0, 200);
        log('transcode.failed', { code, durationMs, stderr });
      } else {
        log('transcode.done', { durationMs });
      }
    });

    const readable = new ReadableStream({
      start(controller) {
        let closed = false;
        const safeClose = () => {
          if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } }
        };
        const safeError = (err: unknown) => {
          if (!closed) { closed = true; try { controller.error(err); } catch { /* already closed */ } }
        };
        ffmpeg.stdout.on('data', (chunk: Buffer) => {
          if (!closed) {
            try { controller.enqueue(new Uint8Array(chunk)); } catch { safeClose(); ffmpeg.kill('SIGTERM'); }
          }
        });
        ffmpeg.stdout.on('end', safeClose);
        ffmpeg.stdout.on('error', safeError);
        ffmpeg.on('error', safeError);
      },
      cancel() {
        ffmpeg.kill('SIGTERM');
      },
    });

    // Probe duration (cached) so we can advertise it in the response.
    let duration = durationCache.get(validated.url) ?? null;
    if (duration === null) {
      // Don't block — start streaming and probe in background for next time.
      void probeDuration(validated.url, userAgent).then((d) => {
        if (d !== null) durationCache.set(validated.url, d);
      });
    }

    const headers: Record<string, string> = {
      'content-type': 'video/mp4',
      'access-control-allow-origin': '*',
      'access-control-expose-headers':
        'content-type, x-content-duration, accept-ranges',
      'cache-control': 'no-store',
      'accept-ranges': 'none',
    };
    if (duration !== null) {
      headers['x-content-duration'] = String(
        seekOffset > 0 ? duration - seekOffset : duration
      );
    }

    return new Response(readable, { status: 200, headers });
  });
}
