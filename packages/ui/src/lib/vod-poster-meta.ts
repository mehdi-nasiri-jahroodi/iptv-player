import type { VodChannel } from 'core';
import { formatVodDuration } from './vod-format';

export type VodPosterBadgeSegment = { key: string; label: string };

/**
 * One line for the poster: present fields joined with middots, e.g. `2025 · 6.8 ★ · 1h 43m`.
 * Returns at most one segment so the grid can render a single pill on the artwork.
 */
export function getVodPosterBadgeSegments(channel: VodChannel): VodPosterBadgeSegment[] {
  const parts: string[] = [];
  if (typeof channel.year === 'number' && Number.isFinite(channel.year)) {
    parts.push(String(Math.trunc(channel.year)));
  }
  if (typeof channel.rating === 'number' && Number.isFinite(channel.rating)) {
    parts.push(`${channel.rating.toFixed(1)} ★`);
  }
  const dur = formatVodDuration(channel.durationSeconds);
  if (dur) parts.push(dur);
  if (parts.length === 0) return [];
  return [{ key: 'meta', label: parts.join(' · ') }];
}
