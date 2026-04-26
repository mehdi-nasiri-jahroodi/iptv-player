import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { parseM3uToPlaylist } from 'core';
import PlayPage from '../../app/pages/play';
import { SourcesStore } from '../../app/features/sources/sources-storage';
import { PlaylistsStore } from '../../app/features/sources/playlists-storage';
import { useCatalogStore } from '../../app/store/catalog-store';
import { useGuideStore } from '../../app/store/guide-store';

// The Player loads Shaka via dynamic import; in jsdom we don't actually
// touch the network, but we mock the loader so the player surface renders
// without pulling shaka-player into the test bundle.
vi.mock('player', async () => {
  const actual = await vi.importActual<typeof import('player')>('player');
  return {
    ...actual,
    Player: ({ src, className }: { src: string | null; className?: string }) => (
      <div data-testid="mock-player" data-src={src ?? ''} className={className} />
    ),
  };
});

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 group-title="News",News One
https://example.com/news1.m3u8
#EXTINF:-1 group-title="Sports",Sports One
https://example.com/sports1.m3u8
`;

beforeEach(() => {
  window.localStorage.clear();
  useCatalogStore.getState().clear();
  useGuideStore.getState().clear();
});

afterEach(() => {
  window.localStorage.clear();
  useCatalogStore.getState().clear();
  useGuideStore.getState().clear();
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

function stubAt(url: string) {
  const Stub = createRoutesStub([
    { path: '/play/:sourceId/:kind/:channelId', Component: PlayPage },
  ]);
  return render(<Stub initialEntries={[url]} />);
}

test('mounts the player frame for a known live channel', async () => {
  await seed();
  // The first channel id from parseM3uToPlaylist is deterministic on the URL.
  // We discover it via the seeded snapshot to keep the test resilient.
  const playlists = new PlaylistsStore();
  const snapshot = await playlists.getForSource('src_1');
  const firstChannelId = snapshot!.groups[0].channels[0].id;

  stubAt(`/play/src_1/live/${firstChannelId}`);

  await waitFor(() => {
    expect(screen.getByTestId('play-frame')).toBeTruthy();
  });
  const mock = screen.getByTestId('mock-player') as HTMLElement;
  expect(mock.dataset.src).toBe('https://example.com/news1.m3u8');
});

test('shows the unknown-kind banner', async () => {
  await seed();
  stubAt('/play/src_1/bogus/anything');

  await waitFor(() => {
    expect(screen.getByTestId('play-unknown-kind')).toBeTruthy();
  });
});

test('shows the missing-source banner when sourceId does not exist', async () => {
  // Seed something else so the sources store is non-empty.
  await seed();
  stubAt('/play/src_does_not_exist/live/whatever');

  await waitFor(() => {
    expect(screen.getByTestId('play-missing-source')).toBeTruthy();
  });
});

test('shows the missing-channel banner when channelId is unknown in this source', async () => {
  await seed();
  stubAt('/play/src_1/live/not_a_channel');

  await waitFor(() => {
    expect(screen.getByTestId('play-missing-channel')).toBeTruthy();
  });
});
