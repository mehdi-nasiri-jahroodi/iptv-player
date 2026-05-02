import {
  fetchXtreamPlayerApi,
  isXtreamAuthSuccessful,
  userInfoToXtreamAccountSnapshot,
  type Source,
  type XtreamAccountSnapshot,
} from 'core';
import type { StreamProxyConfig } from '../../store/settings-store';
import { createWebSourceFetchLike } from './persist-validated-source';

/**
 * Calls the Xtream login probe and maps `user_info` into {@link XtreamAccountSnapshot}.
 * Uses the same fetch path as add-source (optional stream proxy).
 */
export async function probeXtreamAccountSnapshot(
  source: Source,
  streamProxy: StreamProxyConfig | null
): Promise<
  | { ok: true; snapshot: XtreamAccountSnapshot }
  | { ok: false; code: 'not_xtream' | 'auth_failed' | 'no_details' | 'error'; message: string }
> {
  if (source.type !== 'xtream' || !source.credentials) {
    return { ok: false, code: 'not_xtream', message: 'Not an Xtream source.' };
  }
  const fetchLike = createWebSourceFetchLike(streamProxy);
  const xtreamFetcher = async (url: string) => {
    const r = await fetchLike(url);
    return { text: () => r.text() };
  };
  try {
    const payload = await fetchXtreamPlayerApi(source.credentials, xtreamFetcher);
    if (!isXtreamAuthSuccessful(payload)) {
      return { ok: false, code: 'auth_failed', message: 'Panel rejected credentials (auth=0).' };
    }
    const snapshot = userInfoToXtreamAccountSnapshot(payload.user_info);
    if (!snapshot) {
      return {
        ok: false,
        code: 'no_details',
        message: 'Panel returned no subscription fields (expiry, status, connections).',
      };
    }
    return { ok: true, snapshot };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed.';
    return { ok: false, code: 'error', message };
  }
}
