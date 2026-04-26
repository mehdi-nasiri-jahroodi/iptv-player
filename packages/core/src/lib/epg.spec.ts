import { describe, expect, it } from 'vitest';
import {
  flatProgramsInWindow,
  getNowAndNextProgram,
  parseXmltvDatetimeToIso,
  parseXmltvToGuide,
} from './epg';
import type { EpgGuide } from './contracts';

describe('parseXmltvDatetimeToIso', () => {
  it('treats bare 14 digits as UTC wall time', () => {
    const iso = parseXmltvDatetimeToIso('20250426120000');
    expect(iso).toMatch(/^2025-04-26T12:00:00\.000Z$/);
  });

  it('applies positive numeric offset', () => {
    const iso = parseXmltvDatetimeToIso('20250426140000 +0200');
    expect(iso).toMatch(/^2025-04-26T12:00:00\.000Z$/);
  });

  it('applies Z suffix', () => {
    const iso = parseXmltvDatetimeToIso('20250426120000 Z');
    expect(iso).toMatch(/^2025-04-26T12:00:00\.000Z$/);
  });
});

describe('parseXmltvToGuide', () => {
  it('parses tv-prefixed programme elements', () => {
    const xml = `<?xml version="1.0"?>
<tv>
  <programme channel="ch1" start="20250115120000 +0000" stop="20250115130000 +0000">
    <title lang="en">Midday news</title>
  </programme>
</tv>`;
    const guide = parseXmltvToGuide(xml);
    expect(guide.programsByChannelId.ch1?.length).toBe(1);
    expect(guide.programsByChannelId.ch1?.[0].title).toBe('Midday news');
  });
});

describe('getNowAndNextProgram', () => {
  const programs = [
    {
      channelId: 'c',
      title: 'A',
      start: '2025-01-01T10:00:00.000Z',
      end: '2025-01-01T11:00:00.000Z',
    },
    {
      channelId: 'c',
      title: 'B',
      start: '2025-01-01T11:00:00.000Z',
      end: '2025-01-01T12:00:00.000Z',
    },
  ] as const;

  it('returns current and next when inside first slot', () => {
    const t = new Date('2025-01-01T10:30:00.000Z').getTime();
    const { current, next } = getNowAndNextProgram([...programs], t);
    expect(current?.title).toBe('A');
    expect(next?.title).toBe('B');
  });

  it('returns next only in a gap', () => {
    const t = new Date('2025-01-01T10:30:01.000Z').getTime();
    const shifted = [
      { ...programs[0], end: '2025-01-01T10:30:00.000Z' },
      programs[1],
    ];
    const { current, next } = getNowAndNextProgram(shifted, t);
    expect(current).toBeNull();
    expect(next?.title).toBe('B');
  });
});

describe('flatProgramsInWindow', () => {
  it('filters and sorts by start', () => {
    const guide: EpgGuide = {
      programsByChannelId: {
        a: [
          {
            channelId: 'a',
            title: 'Late',
            start: '2025-06-02T22:00:00.000Z',
            end: '2025-06-02T23:00:00.000Z',
          },
          {
            channelId: 'a',
            title: 'Early',
            start: '2025-06-02T06:00:00.000Z',
            end: '2025-06-02T07:00:00.000Z',
          },
        ],
        b: [
          {
            channelId: 'b',
            title: 'Mid',
            start: '2025-06-02T12:00:00.000Z',
            end: '2025-06-02T13:00:00.000Z',
          },
        ],
      },
    };
    const start = new Date('2025-06-02T00:00:00.000Z').getTime();
    const end = new Date('2025-06-03T00:00:00.000Z').getTime();
    const rows = flatProgramsInWindow(
      guide,
      new Map([
        ['a', 'Alpha'],
        ['b', 'Beta'],
      ]),
      start,
      end
    );
    expect(rows.map((r) => r.program.title)).toEqual(['Early', 'Mid', 'Late']);
    expect(rows[1].channelName).toBe('Beta');
  });
});
