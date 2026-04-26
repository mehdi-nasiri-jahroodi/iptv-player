import type { VodChannel } from 'core';

/** Fields we can sort VOD rows by (missing values sort last). */
export type VodSortKey =
  | 'default'
  | 'name'
  | 'year'
  | 'rating'
  | 'duration'
  | 'director'
  | 'added';

export type VodSortDir = 'asc' | 'desc';

/**
 * Stable sort for the VOD poster grid. `default` keeps playlist order.
 * Missing numeric / string fields are ordered last for both directions.
 */
export function sortVodChannels(
  channels: readonly VodChannel[],
  key: VodSortKey,
  dir: VodSortDir
): VodChannel[] {
  if (key === 'default') return [...channels];

  const sign = dir === 'asc' ? 1 : -1;
  const out = [...channels];

  out.sort((a, b) => {
    let primary = 0;

    const cmpNum = (ax?: number, bx?: number) => {
      const aOk = ax !== undefined && Number.isFinite(ax);
      const bOk = bx !== undefined && Number.isFinite(bx);
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return sign * ((ax as number) - (bx as number));
    };

    switch (key) {
      case 'name':
        primary = sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
      case 'year': {
        const ay =
          a.year !== undefined && Number.isFinite(a.year) ? Math.trunc(a.year) : undefined;
        const by =
          b.year !== undefined && Number.isFinite(b.year) ? Math.trunc(b.year) : undefined;
        primary = cmpNum(ay, by);
        // Same calendar year: newest-added first when descending, oldest-added first when ascending.
        if (primary === 0) {
          primary = cmpNum(a.xtreamAddedAtSec, b.xtreamAddedAtSec);
        }
        break;
      }
      case 'rating':
        primary = cmpNum(a.rating, b.rating);
        break;
      case 'duration':
        primary = cmpNum(a.durationSeconds, b.durationSeconds);
        break;
      case 'added':
        primary = cmpNum(a.xtreamAddedAtSec, b.xtreamAddedAtSec);
        break;
      case 'director': {
        const da = (a.director ?? '').trim();
        const db = (b.director ?? '').trim();
        if (!da && !db) primary = 0;
        else if (!da) primary = 1;
        else if (!db) primary = -1;
        else primary = sign * da.localeCompare(db, undefined, { sensitivity: 'base' });
        break;
      }
      default:
        primary = 0;
    }

    if (primary !== 0) return primary;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return out;
}
