import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  encodeProxyUrl,
  signProxyRequest,
  type StreamProxyOption,
} from 'player';

/**
 * Track info returned by the proxy's `GET /subtitles` endpoint (ffprobe).
 */
export interface EmbeddedSubtitleTrack {
  index: number;
  language: string;
  label: string;
  codec: string;
}

/**
 * Build a signed proxy URL for an arbitrary endpoint.
 */
async function buildSignedUrl(
  proxy: StreamProxyOption,
  endpoint: string,
  upstreamUrl: string,
  extraParams?: string
): Promise<string> {
  const u = encodeProxyUrl(upstreamUrl);
  const sig = await signProxyRequest({
    secret: proxy.secret,
    encodedUrl: u,
    userAgent: proxy.userAgent,
  });
  const base = proxy.baseUrl.replace(/\/+$/, '');
  const ua = proxy.userAgent
    ? `&ua=${encodeURIComponent(proxy.userAgent)}`
    : '';
  const extra = extraParams ? `&${extraParams}` : '';
  return `${base}${endpoint}?u=${u}${ua}&sig=${sig}${extra}`;
}

export interface UseEmbeddedSubtitlesResult {
  /** Discovered extractable subtitle tracks (from ffprobe). Empty while loading. */
  tracks: EmbeddedSubtitleTrack[];
  /** Extract a single track as WebVTT. Returns the URL. Caches results. */
  extractTrack: (trackIndex: number) => Promise<string | null>;
  /** Duration in seconds from ffprobe, or null if unknown. */
  duration: number | null;
}

/**
 * Discover embedded subtitle tracks in an MKV stream via the proxy's
 * ffprobe endpoint. Does NOT eagerly extract — call `extractTrack(index)`
 * on demand when the user selects a subtitle language.
 *
 * Only fires when:
 *  - `streamUrl` is non-null
 *  - `streamProxy` is configured (ffprobe runs on the proxy host)
 *  - The stream URL looks like a direct file (not `.m3u8`)
 */
export function useEmbeddedSubtitles(
  streamUrl: string | null,
  streamProxy: StreamProxyOption | null
): UseEmbeddedSubtitlesResult {
  const [tracks, setTracks] = useState<EmbeddedSubtitleTrack[]>([]);
  const [duration, setDuration] = useState<number | null>(null);

  // Only probe direct-file containers (MKV, MP4, AVI, etc.), not HLS manifests.
  const shouldProbe = useMemo(() => {
    if (!streamUrl || !streamProxy) return false;
    try {
      const pathname = new URL(streamUrl).pathname.toLowerCase();
      if (pathname.endsWith('.m3u8') || pathname.endsWith('.m3u')) return false;
      return true;
    } catch {
      return false;
    }
  }, [streamUrl, streamProxy]);

  useEffect(() => {
    setTracks([]);
    setDuration(null);
    if (!shouldProbe || !streamUrl || !streamProxy) return;

    let cancelled = false;

    void (async () => {
      try {
        const probeUrl = await buildSignedUrl(
          streamProxy,
          '/subtitles',
          streamUrl
        );
        const res = await fetch(probeUrl);
        if (!res.ok || cancelled) return;

        const probeResult: {
          tracks: Array<{
            index: number;
            language: string;
            label: string;
            codec: string;
            extractable: boolean;
          }>;
          duration: number | null;
        } = await res.json();
        if (cancelled) return;

        const extractable = probeResult.tracks
          .filter((t) => t.extractable)
          .map(({ index, language, label, codec }) => ({
            index,
            language,
            label,
            codec,
          }));

        if (!cancelled) {
          setTracks(extractable);
          setDuration(probeResult.duration);
        }
      } catch {
        // Probe failed — no embedded subtitles.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldProbe, streamUrl, streamProxy]);

  // On-demand extraction: build the signed extraction URL when called.
  // The proxy caches extracted VTT for 24h, so repeated calls are cheap.
  const extractTrack = useCallback(
    async (trackIndex: number): Promise<string | null> => {
      if (!streamUrl || !streamProxy) return null;
      try {
        return await buildSignedUrl(
          streamProxy,
          '/subtitles/extract',
          streamUrl,
          `track=${trackIndex}`
        );
      } catch {
        return null;
      }
    },
    [streamUrl, streamProxy]
  );

  return { tracks, extractTrack, duration };
}
