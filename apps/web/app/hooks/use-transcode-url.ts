import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildSignedTranscodeUrl,
  encodeProxyUrl,
  signProxyRequest,
  type StreamProxyOption,
} from 'player';

function isDirectFile(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return !pathname.endsWith('.m3u8') && !pathname.endsWith('.m3u');
  } catch {
    return false;
  }
}

export interface UseTranscodeUrlResult {
  effectiveUrl: string | null;
  effectiveProxy: StreamProxyOption | null;
  isTranscoding: boolean;
  knownDuration: number | null;
  buildSeekUrl: ((startSeconds: number) => Promise<string>) | null;
}

/**
 * When `enabled` is true AND the stream is a direct file (MKV etc.) AND the
 * proxy is configured, build a `/transcode` URL (video passthrough + AAC audio).
 *
 * When `enabled` is false (default), passes through the original URL and proxy
 * so `/stream` is used (normal playback with seeking).
 */
export function useTranscodeUrl(
  streamUrl: string | null,
  streamProxy: StreamProxyOption | null,
  kind: 'live' | 'vod' | 'series' | null,
  probedDuration?: number | null,
  enabled?: boolean
): UseTranscodeUrlResult {
  const [transcodeUrl, setTranscodeUrl] = useState<string | null>(null);

  const shouldTranscode =
    enabled === true &&
    streamUrl !== null &&
    streamProxy !== null &&
    (kind === 'vod' || kind === 'series') &&
    isDirectFile(streamUrl);

  useEffect(() => {
    setTranscodeUrl(null);
    if (!shouldTranscode || !streamUrl || !streamProxy) return;

    let cancelled = false;
    void buildSignedTranscodeUrl({
      baseUrl: streamProxy.baseUrl,
      secret: streamProxy.secret,
      upstreamUrl: streamUrl,
      userAgent: streamProxy.userAgent,
    }).then((url) => {
      if (!cancelled) setTranscodeUrl(url);
    });

    return () => { cancelled = true; };
  }, [shouldTranscode, streamUrl, streamProxy]);

  const proxyRef = useRef(streamProxy);
  proxyRef.current = streamProxy;
  const urlRef = useRef(streamUrl);
  urlRef.current = streamUrl;

  const buildSeekUrl = useCallback(
    async (startSeconds: number): Promise<string> => {
      const proxy = proxyRef.current;
      const upstream = urlRef.current;
      if (!proxy || !upstream) throw new Error('no proxy configured');
      const u = encodeProxyUrl(upstream);
      const sig = await signProxyRequest({
        secret: proxy.secret,
        encodedUrl: u,
        userAgent: proxy.userAgent,
      });
      const base = proxy.baseUrl.replace(/\/+$/, '');
      const ua = proxy.userAgent
        ? `&ua=${encodeURIComponent(proxy.userAgent)}`
        : '';
      return `${base}/transcode?u=${u}${ua}&sig=${sig}&start=${startSeconds}`;
    },
    []
  );

  if (shouldTranscode) {
    return {
      effectiveUrl: transcodeUrl,
      effectiveProxy: null,
      isTranscoding: true,
      knownDuration: probedDuration ?? null,
      buildSeekUrl,
    };
  }

  return {
    effectiveUrl: streamUrl,
    effectiveProxy: streamProxy,
    isTranscoding: false,
    knownDuration: null,
    buildSeekUrl: null,
  };
}
