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

/** Higher = better inferred tier (for sorting). */
export function streamQualityRank(channelName: string): number {
  const hints = inferStreamQualityHints(channelName);
  if (hints.includes('4K')) return 5;
  if (hints.some((h) => h === '1080p')) return 4;
  if (hints.includes('720p')) return 3;
  if (hints.includes('HD')) return 2;
  return 0;
}
