/** Human-readable runtime from catalog `durationSeconds` (e.g. Xtream vod_info). */
export function formatVodDuration(seconds: number | undefined): string | null {
  if (seconds === undefined || seconds <= 0 || !Number.isFinite(seconds)) {
    return null;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}
