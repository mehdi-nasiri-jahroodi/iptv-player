import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { parseM3uToPlaylist } from 'core';
import Home from '../../app/pages/home';
import { SourcesStore } from '../../app/features/sources/sources-storage';
import { PlaylistsStore } from '../../app/features/sources/playlists-storage';
import { useCatalogStore } from '../../app/store/catalog-store';

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="news.example" tvg-logo="https://example.com/news.png" group-title="News",News One
https://example.com/news1.m3u8
#EXTINF:-1 tvg-id="sports.example" group-title="Sports",Sports One
https://example.com/sports1.m3u8
#EXTINF:-1 tvg-id="sports.example2" group-title="Sports",Sports Two
https://example.com/sports2.m3u8
`;

beforeEach(() => {
  window.localStorage.clear();
  // Catalog store is module-singleton; reset between tests so each renders fresh.
  useCatalogStore.getState().clear();
});

afterEach(() => {
  window.localStorage.clear();
  useCatalogStore.getState().clear();
});

test('renders empty state when no sources are stored', async () => {
  const ReactRouterStub = createRoutesStub([{ path: '/', Component: Home }]);

  render(<ReactRouterStub />);

  await waitFor(() => {
    expect(screen.getByTestId('home-empty')).toBeTruthy();
  });
  expect(
    screen.getByRole('heading', { name: /no sources yet/i })
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: /add a source/i })).toBeTruthy();
});

test('renders the browse view with groups + channels for the active source', async () => {
  // Seed an m3u source plus a parsed playlist snapshot so the catalog store
  // can render without going to the network.
  const sources = new SourcesStore();
  await sources.addSource({
    id: 'src_1',
    label: 'Test M3U',
    type: 'm3u_url',
    url: 'https://example.com/playlist.m3u',
  });
  const playlists = new PlaylistsStore();
  await playlists.setForSource('src_1', parseM3uToPlaylist(SAMPLE_M3U, 'src_1'));

  const ReactRouterStub = createRoutesStub([{ path: '/', Component: Home }]);
  render(<ReactRouterStub />);

  // The browse layout becomes visible once the catalog store finishes loading.
  await waitFor(() => {
    expect(screen.getByTestId('home-browse')).toBeTruthy();
    expect(screen.getByTestId('groups-sidebar')).toBeTruthy();
    expect(screen.getByTestId('channel-list')).toBeTruthy();
  });

  expect(screen.getByText('Browsing Test M3U')).toBeTruthy();
  // Group sidebar shows both M3U groups.
  expect(screen.getByRole('button', { name: /News\s+1/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Sports\s+2/ })).toBeTruthy();
  // First group is active by default → its channel renders in the list.
  expect(screen.getByText('News One')).toBeTruthy();
});

test('shows a catalog error when no playlist snapshot exists', async () => {
  const sources = new SourcesStore();
  await sources.addSource({
    id: 'src_orphan',
    label: 'Orphan',
    type: 'm3u_url',
    url: 'https://example.com/orphan.m3u',
  });

  const ReactRouterStub = createRoutesStub([{ path: '/', Component: Home }]);
  render(<ReactRouterStub />);

  await waitFor(() => {
    expect(screen.getByTestId('catalog-error')).toBeTruthy();
  });
});
