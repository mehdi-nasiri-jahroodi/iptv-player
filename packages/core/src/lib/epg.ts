import { epgGuideSchema, epgProgramSchema, type EpgGuide } from './contracts';

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseXmltvDate(value: string): string {
  const compact = value.trim().slice(0, 14);
  const year = compact.slice(0, 4);
  const month = compact.slice(4, 6);
  const day = compact.slice(6, 8);
  const hour = compact.slice(8, 10);
  const minute = compact.slice(10, 12);
  const second = compact.slice(12, 14);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export function parseXmltvToGuide(xml: string): EpgGuide {
  const programsByChannelId: Record<string, Array<ReturnType<typeof epgProgramSchema.parse>>> = {};
  const programmePattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  let programmeMatch = programmePattern.exec(xml);

  while (programmeMatch) {
    const attrs = programmeMatch[1];
    const body = programmeMatch[2];

    const channelId = /channel="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const startRaw = /start="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const endRaw = /stop="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const title = decodeXmlEntities(/<title[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1]?.trim() ?? '');
    const description = decodeXmlEntities(/<desc[^>]*>([\s\S]*?)<\/desc>/.exec(body)?.[1]?.trim() ?? '');

    if (channelId && startRaw && endRaw && title) {
      const parsed = epgProgramSchema.parse({
        channelId,
        title,
        start: parseXmltvDate(startRaw),
        end: parseXmltvDate(endRaw),
        description: description || undefined,
      });
      const bucket = programsByChannelId[channelId] ?? [];
      bucket.push(parsed);
      programsByChannelId[channelId] = bucket;
    }

    programmeMatch = programmePattern.exec(xml);
  }

  return epgGuideSchema.parse({ programsByChannelId });
}

