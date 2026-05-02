/**
 * Format Xtream `user_info` date fields for UI. Panels often use Unix seconds
 * as strings; some use other formats — we best-effort parse.
 */
export function formatXtreamPanelDate(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const asNum = Number(t);
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
    return new Date(asNum * 1000).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
  return t;
}
