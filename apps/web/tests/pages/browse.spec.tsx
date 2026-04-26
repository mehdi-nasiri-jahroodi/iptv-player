import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { parseM3uToPlaylist } from 'core';
import BrowseKindPage from '../../app/pages/browse/$kind';
import { SourcesStore } from '../../app/features/sources/sources-storage';
import { PlaylistsStore } from '../../app/features/sources/playlists-storage';
import { useCatalogStore } from '../../app/store/catalog-store';

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 group-title="News",News One
https://example.com/news1.m3u8
#EXTINF:-1 group-title="Sports",Sports One
https://example.com/sports1.m3u8
`;

beforeEach(() => {
  window.localStorage.clear();
  useCatalogStore.getState().clear();
});

afterEach(() => {
  window.localStorage.clear();
  useCatalogStore.getState().clear();
});

async function seed() {
  const sources = new SourcesStore();
  await sources.addSource({
    id: 'src_1',
    label: 'Test M3U',
    type: 'm3u_url',
    url: 'https://example.com/playlist.m3u',
  });
  const playlists = new PlaylistsStore();
  await playlists.setForSource('src_1', parseM3uToPlaylist(SAMPLE_M3U, 'src_1'));
}

function stubAt(path: string, url: string) {
  const Stub = createRoutesStub([
    { path: '/browse/:kind', Component: BrowseKindPage },
  ]);
  return render(<Stub initialEntries={[url]} />);
}

test('renders the live browse view for /browse/live', async () => {
  await seed();
  stubAt('/browse/:kind', '/browse/live');

  await waitFor(() => {
    expect(screen.getByTestId('browse-view-live')).toBeTruthy();
    expect(screen.getByTestId('groups-sidebar')).toBeTruthy();
    expect(screen.getByTestId('channel-list')).toBeTruthy();
  });

  expect(screen.getByRole('heading', { name: /live tv/i })).toBeTruthy();
  expect(screen.getByText('News One')).toBeTruthy();
});

test('mounts the inline live player pane (idle until a channel is picked)', async () => {
  await seed();
  stubAt('/browse/:kind', '/browse/live');

  await waitFor(() => {
    expect(screen.getByTestId('live-player')).toBeTruthy();
  });
  // No channel picked yet \u2014 the idle hint is shown and Fullscreen is disabled.
  expect(screen.getByTestId('live-player-idle')).toBeTruthy();
  const fullscreen = screen.getByRole('button', { name: /fullscreen/i });
  expect((fullscreen as HTMLButtonElement).disabled).toBe(true);
});

test('does NOT mount the inline player pane on /browse/vod', async () => {
  await seed();
  stubAt('/browse/:kind', '/browse/vod');

  await waitFor(() => {
    // VOD page short-circuits to the empty hint with this seed; the live
    // player pane must never appear on a non-live kind.
    expect(screen.queryByTestId('live-player')).toBeNull();
  });
});

test('shows the empty hint for a kind with no content', async () => {
  await seed();
  stubAt('/browse/:kind', '/browse/vod');

  await waitFor(() => {
    expect(screen.getByTestId('browse-empty')).toBeTruthy();
  });
  expect(screen.getByTestId('browse-empty').textContent).toMatch(/no movies/i);
});

test('rejects an unknown kind in the URL', async () => {
  await seed();
  stubAt('/browse/:kind', '/browse/bogus');

  await waitFor(() => {
    expect(screen.getByTestId('browse-unknown-kind')).toBeTruthy();
  });
});

test('prompts for a source when none is active', async () => {
  // No sources seeded.
  stubAt('/browse/:kind', '/browse/live');

  await waitFor(() => {
    expect(screen.getByTestId('browse-no-source')).toBeTruthy();
  });
});
