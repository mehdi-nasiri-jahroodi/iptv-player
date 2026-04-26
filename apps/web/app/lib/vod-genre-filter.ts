import type { VodChannel } from 'core';

/** Split provider genre strings ("Action / Drama", "Action, Sci-Fi") into tags. */
export function splitGenreTags(genre: string | undefined): string[] {
  if (!genre?.trim()) return [];
  return genre
    .split(/[,;/|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Distinct genre tags across channels, sorted A–Z for dropdowns. */
export function collectVodGenreOptions(channels: readonly VodChannel[]): string[] {
  const set = new Set<string>();
  for (const ch of channels) {
    for (const tag of splitGenreTags(ch.genre)) {
      set.add(tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function vodChannelMatchesGenreFilter(ch: VodChannel, filter: string): boolean {
  const q = filter.trim();
  if (!q) return true;
  return splitGenreTags(ch.genre).some((t) => t.toLowerCase() === q.toLowerCase());
}
