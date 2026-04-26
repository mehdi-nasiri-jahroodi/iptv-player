import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CatalogTile } from './CatalogTile';

describe('CatalogTile', () => {
  test('renders title, subtitle, count and icon', () => {
    render(
      <CatalogTile
        focusKey="LIVE"
        title="Live TV"
        subtitle="Linear channels"
        count="128 channels"
        icon={<span data-testid="icon">📺</span>}
      />
    );
    expect(screen.getByText('Live TV')).toBeTruthy();
    expect(screen.getByText('Linear channels')).toBeTruthy();
    expect(screen.getByText('128 channels')).toBeTruthy();
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  test('fires onSelect on click and on Enter key', () => {
    const onSelect = vi.fn();
    render(<CatalogTile focusKey="LIVE" title="Live TV" onSelect={onSelect} />);
    const tile = screen.getByRole('button', { name: /live tv/i });
    fireEvent.click(tile);
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  test('disabled tiles do not fire onSelect and report aria-disabled', () => {
    const onSelect = vi.fn();
    render(
      <CatalogTile focusKey="VOD" title="Movies" disabled onSelect={onSelect} />
    );
    const tile = screen.getByRole('button', { name: /movies/i });
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(tile);
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
