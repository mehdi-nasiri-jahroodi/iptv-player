import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../app/app';

test('renders home shell', async () => {
  const ReactRouterStub = createRoutesStub([
    {
      path: '/',
      Component: App,
    },
  ]);

  render(<ReactRouterStub />);

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /Lumina-IPTV — web/i })).toBeTruthy();
  });
  expect(screen.getByText('Focus target A')).toBeTruthy();
});
