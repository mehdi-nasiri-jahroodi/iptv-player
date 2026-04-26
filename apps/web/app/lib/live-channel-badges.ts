/**
 * Heuristic quality hints from provider channel titles (no structured codec field in v1).
 */
export function inferStreamQualityHints(channelName: string): string[] {
  const n = channelName.toLowerCase();
  if (/\b(4k|uhd|2160p)\b/.test(n)) return ['4K'];
  if (/\b1080p\b|\bfhd\b|full\s*hd/.test(n)) return ['1080p'];
  if (/\b720p\b/.test(n)) return ['720p'];
  if (/\bhd\b/.test(n)) return ['HD'];
  return [];
}
