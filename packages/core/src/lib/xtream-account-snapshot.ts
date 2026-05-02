import type { XtreamAccountSnapshot } from './contracts';

/** Normalise Xtream `user_info` scalars (strings or numbers) for persistence. */
export function pickXtreamSnapshotStr(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/**
 * Map Xtream `user_info` (login probe) into our persisted snapshot shape.
 * Returns `undefined` when there is nothing to store.
 */
export function userInfoToXtreamAccountSnapshot(userInfo: unknown): XtreamAccountSnapshot | undefined {
  if (!userInfo || typeof userInfo !== 'object') return undefined;
  const ui = userInfo as Record<string, unknown>;
  const snapshot: XtreamAccountSnapshot = {
    expDate: pickXtreamSnapshotStr(ui.exp_date),
    createdAt: pickXtreamSnapshotStr(ui.created_at),
    status: pickXtreamSnapshotStr(ui.status),
    isTrial: pickXtreamSnapshotStr(ui.is_trial),
    username: pickXtreamSnapshotStr(ui.username),
    activeConnections: pickXtreamSnapshotStr(ui.active_cons),
    maxConnections: pickXtreamSnapshotStr(ui.max_connections),
  };
  const hasAny = Object.values(snapshot).some((v) => v !== undefined && String(v).length > 0);
  return hasAny ? snapshot : undefined;
}
