import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlayerErrorOverlay } from '../../src/lib/player-error-overlay.js';
import type { ShakaError } from '../../src/lib/use-shaka-player.js';

const httpError: ShakaError = {
  message: 'HTTP_ERROR',
  code: 1002,
  category: 1,
  data: ['http://example.com/stream.m3u8', 0],
};

describe('<PlayerErrorOverlay>', () => {
  test('renders the friendly headline and hint, hides raw details by default', () => {
    render(
      <PlayerErrorOverlay
        error={httpError}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByTestId('player-error-headline').textContent).toBe(
      'The stream is unreachable.'
    );
    expect(screen.getByTestId('player-error-hint')).toBeTruthy();
    expect(screen.queryByTestId('player-error-details')).toBeNull();
  });

  test('toggling "Show details" reveals code, category, and URL', () => {
    render(<PlayerErrorOverlay error={httpError} onRetry={vi.fn()} />);

    const toggle = screen.getByTestId('player-error-toggle-details');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const details = screen.getByTestId('player-error-details');
    const text = details.textContent ?? '';
    expect(text).toContain('1002');
    expect(text).toContain('HTTP_ERROR');
    expect(text).toContain('http://example.com/stream.m3u8');
  });

  test('Retry calls onDismiss before onRetry', () => {
    const calls: string[] = [];
    const onDismiss = vi.fn(() => calls.push('dismiss'));
    const onRetry = vi.fn(() => calls.push('retry'));

    render(
      <PlayerErrorOverlay
        error={httpError}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByTestId('player-error-retry'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['dismiss', 'retry']);
  });

  test('Retry works without an onDismiss prop', () => {
    const onRetry = vi.fn();
    render(<PlayerErrorOverlay error={httpError} onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('player-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('Copy diagnostics writes the formatted summary via the injected writer', async () => {
    const writer = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve()
    );

    render(
      <PlayerErrorOverlay
        error={httpError}
        onRetry={vi.fn()}
        writeToClipboard={writer}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('player-error-copy'));
    });

    expect(writer).toHaveBeenCalledTimes(1);
    const payload = writer.mock.calls[0]?.[0] ?? '';
    expect(payload).toContain('Playback error: The stream is unreachable.');
    expect(payload).toContain('Code: 1002 (HTTP_ERROR)');
    expect(payload).toContain('URL: http://example.com/stream.m3u8');

    expect(screen.getByTestId('player-error-copy').textContent).toContain(
      'Copied'
    );
  });

  test('Copy failure is swallowed and the button label stays unchanged', async () => {
    const writer = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.reject(new Error('blocked'))
    );

    render(
      <PlayerErrorOverlay
        error={httpError}
        onRetry={vi.fn()}
        writeToClipboard={writer}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('player-error-copy'));
    });

    expect(screen.getByTestId('player-error-copy').textContent).toContain(
      'Copy diagnostics'
    );
  });

  test('compact variant exposes a data attribute consumers can target', () => {
    render(
      <PlayerErrorOverlay
        error={httpError}
        onRetry={vi.fn()}
        compact
      />
    );
    expect(
      screen.getByTestId('player-error-overlay').getAttribute('data-compact')
    ).toBe('true');
  });

  test('falls back to Shaka message when code is not in the friendly table', () => {
    render(
      <PlayerErrorOverlay
        error={{ message: 'something obscure happened' }}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByTestId('player-error-headline').textContent).toBe(
      'something obscure happened'
    );
    fireEvent.click(screen.getByTestId('player-error-toggle-details'));
    const details = screen.queryByTestId('player-error-details');
    if (details) {
      expect(details.textContent ?? '').not.toContain('Code');
    }
  });
});
