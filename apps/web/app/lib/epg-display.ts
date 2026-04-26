import type { Channel, EpgGuide, Playlist } from 'core';
import { getNowAndNextProgram } from 'core';

export type LiveChannel = Extract<Channel, { type: 'live' }>;

export function flatLiveChannels(playlist: Playlist | null): LiveChannel[] {
  if (!playlist) return [];
  const out: LiveChannel[] = [];
  for (const g of playlist.groups) {
    for (const c of g.channels) {
      if (c.type === 'live') out.push(c);
    }
  }
  return out;
}

/** First `tvg-id` wins when duplicates exist in the playlist. */
export function liveTvgIdToDisplayName(playlist: Playlist | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const ch of flatLiveChannels(playlist)) {
    if (ch.tvgId && !m.has(ch.tvgId)) {
      m.set(ch.tvgId, ch.name);
    }
  }
  return m;
}

export function formatNowNextLine(
  guide: EpgGuide | null,
  tvgId: string | undefined,
  nowMs: number
): string | null {
  if (!guide || !tvgId) return null;
  const programs = guide.programsByChannelId[tvgId];
  const { current, next } = getNowAndNextProgram(programs, nowMs);
  if (!current && !next) return null;
  const parts: string[] = [];
  if (current) parts.push(`Now: ${current.title}`);
  if (next) parts.push(`Next: ${next.title}`);
  return parts.join(' · ');
}

export function parseRecentKey(
  key: string
): { sourceId: string; kind: string; channelId: string } | null {
  const parts = key.split('::');
  if (parts.length !== 3) return null;
  return { sourceId: parts[0], kind: parts[1], channelId: parts[2] };
}

export function parseFavoriteKey(key: string): { sourceId: string; channelId: string } | null {
  const parts = key.split('::');
  if (parts.length !== 2) return null;
  return { sourceId: parts[0], channelId: parts[1] };
}

/**
 * Pick up to `max` live channels that have `tvgId` (for EPG join), prioritising
 * recents then favorites for the active source, then the rest of the catalog.
 */
export function pickPreviewLiveChannels(
  playlist: Playlist | null,
  sourceId: string,
  recents: readonly string[],
  favorites: readonly string[],
  max = 8
): LiveChannel[] {
  const live = flatLiveChannels(playlist);
  const byId = new Map(live.map((c) => [c.id, c]));
  const ordered: LiveChannel[] = [];
  const seen = new Set<string>();

  const pushIfEligible = (ch: LiveChannel | undefined) => {
    if (!ch || !ch.tvgId || seen.has(ch.id)) return;
    ordered.push(ch);
    seen.add(ch.id);
  };

  for (const key of recents) {
    const p = parseRecentKey(key);
    if (!p || p.sourceId !== sourceId || p.kind !== 'live') continue;
    pushIfEligible(byId.get(p.channelId) as LiveChannel | undefined);
    if (ordered.length >= max) return ordered;
  }
  for (const key of favorites) {
    const p = parseFavoriteKey(key);
    if (!p || p.sourceId !== sourceId) continue;
    pushIfEligible(byId.get(p.channelId) as LiveChannel | undefined);
    if (ordered.length >= max) return ordered;
  }
  for (const ch of live) {
    pushIfEligible(ch);
    if (ordered.length >= max) return ordered;
  }
  return ordered;
}
