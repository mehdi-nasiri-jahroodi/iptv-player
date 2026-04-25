import {
  channelGroupSchema,
  liveChannelSchema,
  playlistSchema,
  type LiveChannel,
  type Playlist,
} from './contracts';

type ExtInfMeta = {
  name: string;
  groupTitle?: string;
  logoUrl?: string;
  tvgId?: string;
  catchupDays?: number;
  catchupMode?: LiveChannel['catchupMode'];
  catchupSource?: string;
};

const M3U_CATCHUP_MODES = new Set<NonNullable<LiveChannel['catchupMode']>>([
  'default',
  'append',
  'shift',
  'flussonic',
  'xtream',
]);

function parseExtInf(line: string): ExtInfMeta {
  const attrs: Record<string, string> = {};
  const attrPattern = /([\w-]+)="([^"]*)"/g;
  let match = attrPattern.exec(line);
  while (match) {
    attrs[match[1].toLowerCase()] = match[2];
    match = attrPattern.exec(line);
  }

  const name = line.includes(',') ? line.slice(line.indexOf(',') + 1).trim() : 'Untitled channel';

  // Catchup attributes (`tvg-rec`, `catchup`, `catchup-source`, `catchup-days`)
  // are part of the de-facto extended-M3U spec used by IPTV panels.
  const catchupRaw = (attrs['catchup'] ?? attrs['tvg-rec'])?.trim().toLowerCase();
  const catchupMode = catchupRaw && M3U_CATCHUP_MODES.has(catchupRaw as never)
    ? (catchupRaw as LiveChannel['catchupMode'])
    : undefined;
  const catchupDaysRaw = attrs['catchup-days']?.trim();
  const catchupDays = catchupDaysRaw && /^\d+$/.test(catchupDaysRaw)
    ? Number(catchupDaysRaw)
    : undefined;

  return {
    name,
    groupTitle: attrs['group-title']?.trim() || 'Ungrouped',
    logoUrl: attrs['tvg-logo']?.trim() || undefined,
    tvgId: attrs['tvg-id']?.trim() || undefined,
    catchupMode,
    catchupDays,
    catchupSource: attrs['catchup-source']?.trim() || undefined,
  };
}

export function parseM3uToPlaylist(input: string, sourceId: string, fetchedAt = new Date()): Playlist {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const groups = new Map<string, LiveChannel[]>();

  let currentExtInf: ExtInfMeta | null = null;
  let channelIndex = 0;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      currentExtInf = parseExtInf(line);
      continue;
    }
    if (line.startsWith('#')) {
      continue;
    }
    if (!currentExtInf) {
      continue;
    }

    // Plain M3U entries are treated as `live` channels. VOD/Series detection
    // (path heuristics or extension sniffing) is a separate concern handled
    // upstream by Xtream catalog mappers — see `xtream.ts#toVodChannel`,
    // `toSeriesChannel`. See docs/architecture.md for the rationale.
    const channel = liveChannelSchema.parse({
      type: 'live',
      id: `${sourceId}:${channelIndex}`,
      name: currentExtInf.name,
      groupTitle: currentExtInf.groupTitle ?? 'Ungrouped',
      streamUrl: line,
      logoUrl: currentExtInf.logoUrl,
      tvgId: currentExtInf.tvgId,
      catchupDays: currentExtInf.catchupDays,
      catchupMode: currentExtInf.catchupMode,
      catchupSource: currentExtInf.catchupSource,
    });
    channelIndex += 1;

    const group = groups.get(channel.groupTitle) ?? [];
    group.push(channel);
    groups.set(channel.groupTitle, group);
    currentExtInf = null;
  }

  const grouped = [...groups.entries()].map(([name, channels]) =>
    channelGroupSchema.parse({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      kind: 'live',
      channels,
    })
  );

  return playlistSchema.parse({
    sourceId,
    groups: grouped,
    fetchedAt: fetchedAt.toISOString(),
  });
}
