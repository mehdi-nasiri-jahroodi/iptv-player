import { describe, expect, it } from 'vitest';
import type { VodChannel } from 'core';
import {
  collectVodGenreOptions,
  splitGenreTags,
  vodChannelMatchesGenreFilter,
} from './vod-genre-filter';

function vod(genre?: string): VodChannel {
  return {
    type: 'vod',
    id: 'x',
    name: 'N',
    groupTitle: 'G',
    streamUrl: 'https://example.com/m.mp4',
    genre,
  } as VodChannel;
}

describe('splitGenreTags', () => {
  it('splits common separators', () => {
    expect(splitGenreTags('Action / Drama, Sci-Fi')).toEqual(['Action', 'Drama', 'Sci-Fi']);
  });
});

describe('collectVodGenreOptions', () => {
  it('dedupes and sorts', () => {
    const opts = collectVodGenreOptions([
      vod('Action'),
      vod('Drama'),
      vod('Action'),
    ]);
    expect(opts).toEqual(['Action', 'Drama']);
  });
});

describe('vodChannelMatchesGenreFilter', () => {
  it('matches case-insensitively on any tag', () => {
    expect(vodChannelMatchesGenreFilter(vod('Action / Drama'), 'action')).toBe(true);
    expect(vodChannelMatchesGenreFilter(vod('Action / Drama'), 'comedy')).toBe(false);
  });

  it('empty filter matches all', () => {
    expect(vodChannelMatchesGenreFilter(vod(undefined), '')).toBe(true);
  });
});
