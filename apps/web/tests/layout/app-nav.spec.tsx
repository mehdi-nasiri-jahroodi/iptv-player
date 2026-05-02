import { createRoutesStub } from 'react-router';
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AppNav } from '../../app/layout/app-nav';

test('AppNav keeps the clock in the centered slot between left and right clusters', () => {
  const Stub = createRoutesStub([{ path: '/', Component: AppNav }]);
  render(<Stub initialEntries={['/']} />);

  const bar = screen.getByTestId('app-nav-bar');
  const slot = screen.getByTestId('app-nav-datetime-slot');
  const clock = screen.getByTestId('app-nav-datetime');

  expect(bar.contains(slot)).toBe(true);
  expect(slot.contains(clock)).toBe(true);
  expect(slot.className).toContain('left-1/2');
  expect(slot.className).toContain('-translate-x-1/2');
  expect(screen.getByRole('link', { name: 'Settings' })).toBeDefined();
});
