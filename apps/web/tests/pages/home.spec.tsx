import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { parseM3uToPlaylist } from 'core';
import Home from '../../app/pages/home';
import { SourcesStore } from '../../app/features/sources/sources-storage';
import { PlaylistsStore } from '../../app/features/sources/playlists-storage';
import { useCatalogStore } from '../../app/store/catalog-store';
import { useGuideStore } from '../../app/store/guide-store';

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
  // Catalog store is a module-singleton; reset between tests so each renders fresh.
  useCatalogStore.getState().clear();
  useGuideStore.getState().clear();
});

afterEach(() => {
  window.localStorage.clear();
  useCatalogStore.getState().clear();
  useGuideStore.getState().clear();
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

test('renders the tile launcher with channel counts for the active source', async () => {
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

  // The launcher becomes visible once the catalog store finishes loading.
  await waitFor(() => {
    expect(screen.getByTestId('home-launcher')).toBeTruthy();
    expect(screen.getByTestId('catalog-tiles')).toBeTruthy();
  });

  expect(screen.getByText(/browsing Test M3U/i)).toBeTruthy();

  // Three tiles, one per kind.
  const liveTile = screen.getByRole('button', { name: /live tv/i });
  const moviesTile = screen.getByRole('button', { name: /movies/i });
  const seriesTile = screen.getByRole('button', { name: /series/i });

  // The seeded playlist has 3 live channels and no VOD/series.
  expect(liveTile.textContent).toMatch(/3 channels/);
  expect(liveTile.getAttribute('aria-disabled')).toBe('false');
  expect(moviesTile.textContent).toMatch(/no movies/i);
  expect(moviesTile.getAttribute('aria-disabled')).toBe('true');
  expect(seriesTile.getAttribute('aria-disabled')).toBe('true');
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
