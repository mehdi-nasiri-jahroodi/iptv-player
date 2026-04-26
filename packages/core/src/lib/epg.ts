import { epgGuideSchema, epgProgramSchema, type EpgGuide, type EpgProgram } from './contracts';

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Parse XMLTV `start` / `stop` values into an ISO-8601 instant string suitable
 * for `Date` and for Zod `z.string().datetime()`.
 *
 * XMLTV format: `YYYYMMDDHHmmss` followed optionally by a space and
 * `Z`, `z`, or a numeric offset `±HHMM` / `±HH:MM` (see XMLTV DTD).
 */
export function parseXmltvDatetimeToIso(value: string): string {
  const raw = value.trim();
  const compact = raw.slice(0, 14);
  if (compact.length < 14 || !/^\d{14}$/.test(compact)) {
    return new Date(0).toISOString();
  }
  const y = compact.slice(0, 4);
  const mo = compact.slice(4, 6);
  const d = compact.slice(6, 8);
  const h = compact.slice(8, 10);
  const mi = compact.slice(10, 12);
  const sec = compact.slice(12, 14);
  const tail = raw.slice(14).trim();
  let offsetSuffix = 'Z';
  if (tail) {
    if (tail === 'Z' || tail === 'z') {
      offsetSuffix = 'Z';
    } else if (/^[+-]\d{4}$/.test(tail)) {
      const sign = tail[0];
      const oh = tail.slice(1, 3);
      const om = tail.slice(3, 5);
      offsetSuffix = `${sign}${oh}:${om}`;
    } else if (/^[+-]\d{2}:\d{2}$/.test(tail)) {
      offsetSuffix = tail;
    }
  }
  const localWall = `${y}-${mo}-${d}T${h}:${mi}:${sec}`;
  const instant =
    offsetSuffix === 'Z' ? `${localWall}Z` : `${localWall}${offsetSuffix}`;
  const parsed = new Date(instant);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function parseInstant(iso: string): number {
  return new Date(iso).getTime();
}

/** Sort programmes by ascending start time (mutates copy only). */
export function sortEpgPrograms(programs: EpgProgram[]): EpgProgram[] {
  return [...programs].sort((a, b) => parseInstant(a.start) - parseInstant(b.start));
}

/** Sort every channel bucket in a guide (improves now/next and grid queries). */
export function normalizeEpgGuide(guide: EpgGuide): EpgGuide {
  const programsByChannelId: Record<string, EpgProgram[]> = {};
  for (const [channelId, programs] of Object.entries(guide.programsByChannelId)) {
    programsByChannelId[channelId] = sortEpgPrograms(programs);
  }
  return { programsByChannelId };
}

export type NowNext = { current: EpgProgram | null; next: EpgProgram | null };

/**
 * Given a single channel's programmes (any order), return the programme airing
 * at `nowMs` and the following one on the same channel.
 */
export function getNowAndNextProgram(
  programs: EpgProgram[] | undefined,
  nowMs: number = Date.now()
): NowNext {
  if (!programs?.length) {
    return { current: null, next: null };
  }
  const sorted = sortEpgPrograms(programs);
  let current: EpgProgram | null = null;
  let idx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const s = parseInstant(p.start);
    const e = parseInstant(p.end);
    if (nowMs >= s && nowMs < e) {
      current = p;
      idx = i;
      break;
    }
  }
  let next: EpgProgram | null = null;
  if (idx >= 0) {
    next = sorted[idx + 1] ?? null;
  } else {
    for (const p of sorted) {
      if (parseInstant(p.start) > nowMs) {
        next = p;
        break;
      }
    }
  }
  return { current, next };
}

export type FlatEpgRow = {
  channelId: string;
  channelName: string;
  program: EpgProgram;
};

/**
 * All programmes overlapping `[windowStartMs, windowEndMs)`, sorted by start,
 * with a display name per EPG channel id (usually equals M3U `tvg-id`).
 */
export function flatProgramsInWindow(
  guide: EpgGuide,
  channelNamesByTvgId: Map<string, string>,
  windowStartMs: number,
  windowEndMs: number
): FlatEpgRow[] {
  const rows: FlatEpgRow[] = [];
  for (const [channelId, programs] of Object.entries(guide.programsByChannelId)) {
    const channelName = channelNamesByTvgId.get(channelId) ?? channelId;
    for (const p of programs) {
      const s = parseInstant(p.start);
      const e = parseInstant(p.end);
      if (e > windowStartMs && s < windowEndMs) {
        rows.push({ channelId, channelName, program: p });
      }
    }
  }
  rows.sort((a, b) => parseInstant(a.program.start) - parseInstant(b.program.start));
  return rows;
}

export function parseXmltvToGuide(xml: string): EpgGuide {
  const programsByChannelId: Record<string, EpgProgram[]> = {};
  const programmePattern =
    /<(?:tv:)?programme\b([^>]*)>([\s\S]*?)<\/(?:tv:)?programme>/gi;
  let programmeMatch = programmePattern.exec(xml);

  while (programmeMatch) {
    const attrs = programmeMatch[1];
    const body = programmeMatch[2];

    const channelId =
      /\bchannel="([^"]+)"/.exec(attrs)?.[1]?.trim() ??
      /\bchannel='([^']+)'/.exec(attrs)?.[1]?.trim() ??
      '';
    const startRaw =
      /\bstart="([^"]+)"/.exec(attrs)?.[1]?.trim() ??
      /\bstart='([^']+)'/.exec(attrs)?.[1]?.trim() ??
      '';
    const endRaw =
      /\bstop="([^"]+)"/.exec(attrs)?.[1]?.trim() ??
      /\bstop='([^']+)'/.exec(attrs)?.[1]?.trim() ??
      '';
    const titleMatch =
      /<(?:tv:)?title[^>]*>([\s\S]*?)<\/(?:tv:)?title>/i.exec(body)?.[1]?.trim() ?? '';
    const title = decodeXmlEntities(titleMatch);
    const descMatch =
      /<(?:tv:)?desc[^>]*>([\s\S]*?)<\/(?:tv:)?desc>/i.exec(body)?.[1]?.trim() ?? '';
    const description = decodeXmlEntities(descMatch);

    if (channelId && startRaw && endRaw && title) {
      const parsed = epgProgramSchema.parse({
        channelId,
        title,
        start: parseXmltvDatetimeToIso(startRaw),
        end: parseXmltvDatetimeToIso(endRaw),
        description: description || undefined,
      });
      const bucket = programsByChannelId[channelId] ?? [];
      bucket.push(parsed);
      programsByChannelId[channelId] = bucket;
    }

    programmeMatch = programmePattern.exec(xml);
  }

  return normalizeEpgGuide(epgGuideSchema.parse({ programsByChannelId }));
}
