import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import Home from '../../app/pages/home';
import { SourcesStore } from '../../app/features/sources/sources-storage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
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

test('lists saved sources and marks the active one', async () => {
  const store = new SourcesStore();
  await store.addSource({
    id: 'src_1',
    label: 'Test M3U',
    type: 'm3u_url',
    url: 'https://example.com/playlist.m3u',
  });

  const ReactRouterStub = createRoutesStub([{ path: '/', Component: Home }]);

  render(<ReactRouterStub />);

  await waitFor(() => {
    expect(screen.getByTestId('home-source-list')).toBeTruthy();
  });
  expect(screen.getByText('Test M3U')).toBeTruthy();
  expect(screen.getByText(/M3U URL · active/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /add another source/i })).toBeTruthy();
});
