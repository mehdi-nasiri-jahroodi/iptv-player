import { describe, expect, it } from 'vitest';
import type { VodChannel } from 'core';
import { sortVodChannels } from './vod-sort';

function vod(partial: Partial<VodChannel> & Pick<VodChannel, 'id' | 'name'>): VodChannel {
  return {
    type: 'vod',
    groupTitle: 'G',
    streamUrl: 'https://example.com/m.mp4',
    ...partial,
  } as VodChannel;
}

describe('sortVodChannels', () => {
  it('keeps order for default', () => {
    const rows = [vod({ id: '1', name: 'B' }), vod({ id: '2', name: 'A' })];
    expect(sortVodChannels(rows, 'default', 'asc').map((c) => c.id)).toEqual(['1', '2']);
  });

  it('sorts by name asc/desc', () => {
    const rows = [vod({ id: '1', name: 'Zebra' }), vod({ id: '2', name: 'apple' })];
    expect(sortVodChannels(rows, 'name', 'asc').map((c) => c.name)).toEqual(['apple', 'Zebra']);
    expect(sortVodChannels(rows, 'name', 'desc').map((c) => c.name)).toEqual(['Zebra', 'apple']);
  });

  it('sorts by year with missing last', () => {
    const rows = [
      vod({ id: '1', name: 'A', year: 2020 }),
      vod({ id: '2', name: 'B', year: 2010 }),
      vod({ id: '3', name: 'C' }),
    ];
    expect(sortVodChannels(rows, 'year', 'asc').map((c) => c.id)).toEqual(['2', '1', '3']);
    expect(sortVodChannels(rows, 'year', 'desc').map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by rating then name', () => {
    const rows = [
      vod({ id: '1', name: 'B', rating: 5 }),
      vod({ id: '2', name: 'A', rating: 5 }),
      vod({ id: '3', name: 'C', rating: 8 }),
    ];
    expect(sortVodChannels(rows, 'rating', 'desc').map((c) => c.id)).toEqual(['3', '2', '1']);
  });

  it('sorts by duration desc (longest first)', () => {
    const rows = [
      vod({ id: '1', name: 'A', durationSeconds: 100 }),
      vod({ id: '2', name: 'B', durationSeconds: 500 }),
      vod({ id: '3', name: 'C' }),
    ];
    expect(sortVodChannels(rows, 'duration', 'desc').map((c) => c.id)).toEqual(['2', '1', '3']);
  });

  it('same-year sort tie-breaks by date added (desc = newer first)', () => {
    const rows = [
      vod({ id: '1', name: 'A', year: 2024, xtreamAddedAtSec: 100 }),
      vod({ id: '2', name: 'B', year: 2024, xtreamAddedAtSec: 200 }),
    ];
    expect(sortVodChannels(rows, 'year', 'desc').map((c) => c.id)).toEqual(['2', '1']);
    expect(sortVodChannels(rows, 'year', 'asc').map((c) => c.id)).toEqual(['1', '2']);
  });
});
