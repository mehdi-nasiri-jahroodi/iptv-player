import {
  parseM3uToPlaylist,
  validateSource,
  type Source,
  type SourceValidationResult,
} from 'core';
import { buildSignedProxyUrl } from 'player';
import type { StreamProxyConfig } from '../../store/settings-store';
import { SourcesStore } from './sources-storage';
import { PlaylistsStore } from './playlists-storage';

type FetchLike = (input: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

async function browserFetch(input: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }> {
  const res = await fetch(input, { redirect: 'follow' });
  return { ok: res.ok, status: res.status, text: () => res.text() };
}

function makeProxyFetcher(baseUrl: string, secret: string, userAgent?: string): FetchLike {
  return async (input: string) => {
    const signed = await buildSignedProxyUrl({ baseUrl, secret, upstreamUrl: input, userAgent });
    const res = await fetch(signed, { redirect: 'follow' });
    return { ok: res.ok, status: res.status, text: () => res.text() };
  };
}

/** Browser fetch for Xtream/M3U validation — uses stream proxy when configured (HTTPS → HTTP, CORS). */
export function createWebSourceFetchLike(streamProxy: StreamProxyConfig | null): FetchLike {
  const proxyReady =
    streamProxy !== null &&
    streamProxy.baseUrl.length > 0 &&
    streamProxy.secret.length >= 16;
  return proxyReady
    ? makeProxyFetcher(streamProxy.baseUrl, streamProxy.secret, streamProxy.userAgent)
    : browserFetch;
}

/**
 * Validates a candidate source, persists it on success, and stores M3U snapshots when applicable.
 */
export async function validatePersistAndSnapshotSource(
  candidate: Source,
  options: {
    streamProxy: StreamProxyConfig | null;
    rawM3uText?: string;
  }
): Promise<SourceValidationResult> {
  const fetcher = createWebSourceFetchLike(options.streamProxy);
  const result = await validateSource(candidate, {
    fetcher,
    rawM3uText: options.rawM3uText,
  });
  if (!result.ok) return result;

  const sourcesStore = new SourcesStore();
  await sourcesStore.addSource(result.source);

  if (result.source.type === 'm3u_file' && options.rawM3uText) {
    const playlist = parseM3uToPlaylist(options.rawM3uText, result.source.id);
    await new PlaylistsStore().setForSource(result.source.id, playlist);
  } else if (result.source.type === 'm3u_url') {
    try {
      const res = await browserFetch(result.source.url ?? '');
      if (res.ok) {
        const playlist = parseM3uToPlaylist(await res.text(), result.source.id);
        await new PlaylistsStore().setForSource(result.source.id, playlist);
      }
    } catch {
      // best-effort
    }
  }

  return result;
}
