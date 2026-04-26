import { describe, expect, it } from 'vitest';
import type { VodChannel } from 'core';
import { getVodPosterBadgeSegments } from './vod-poster-meta';

function ch(partial: Partial<VodChannel>): VodChannel {
  return {
    type: 'vod',
    id: 'id',
    name: 'N',
    groupTitle: 'G',
    streamUrl: 'https://example.com/x.mp4',
    ...partial,
  } as VodChannel;
}

describe('getVodPosterBadgeSegments', () => {
  it('joins year, rating, and duration with middots in one segment', () => {
    const badges = getVodPosterBadgeSegments(
      ch({ year: 2025, rating: 6.8, durationSeconds: 6180 })
    );
    expect(badges).toEqual([{ key: 'meta', label: '2025 · 6.8 ★ · 1h 43m' }]);
  });

  it('omits missing fields from the line', () => {
    expect(getVodPosterBadgeSegments(ch({ year: 2019 })).map((b) => b.label)).toEqual(['2019']);
    expect(getVodPosterBadgeSegments(ch({ rating: 7 })).map((b) => b.label)).toEqual(['7.0 ★']);
  });
});
