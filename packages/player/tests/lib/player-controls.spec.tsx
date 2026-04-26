import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  PlayerControls,
  formatTime,
  type UseShakaPlayerResult,
} from '../../src/index.js';

/**
 * Build a stub `UseShakaPlayerResult`. The controls only read `media`,
 * `status`, `buffering` and call action methods, so we wire those out
 * with `vi.fn` and let the rest be no-ops.
 */
function buildApi(
  overrides: Partial<UseShakaPlayerResult> = {},
  mediaOverrides: Partial<UseShakaPlayerResult['media']> = {}
): UseShakaPlayerResult {
  const media: UseShakaPlayerResult['media'] = {
    paused: false,
    currentTime: 0,
    duration: Number.NaN,
    seekable: false,
    volume: 1,
    muted: false,
    ...mediaOverrides,
  };
  return {
    status: 'playing',
    buffering: false,
    error: null,
    recoverableError: null,
    tracks: [],
    abrEnabled: true,
    media,
    selectTrack: vi.fn(),
    clearTextTrack: vi.fn(),
    setAbrEnabled: vi.fn(),
    retry: vi.fn(),
    destroy: vi.fn(async () => undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    toggleFullscreen: vi.fn(),
    ...overrides,
  };
}

describe('formatTime', () => {
  test('formats seconds as m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3661)).toBe('1:01:01');
  });

  test('coerces non-finite / negative values', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
  });
});

describe('<PlayerControls>', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('renders Pause when playing and toggles to play() on click', () => {
    const api = buildApi({}, { paused: false });
    render(<PlayerControls api={api} alwaysVisible />);
    const btn = screen.getByTestId('player-controls-play');
    expect(btn.getAttribute('aria-label')).toBe('Pause');
    fireEvent.click(btn);
    expect(api.pause).toHaveBeenCalledTimes(1);
    expect(api.play).not.toHaveBeenCalled();
  });

  test('renders Play when paused and triggers play() on click', () => {
    const api = buildApi({}, { paused: true });
    render(<PlayerControls api={api} alwaysVisible />);
    const btn = screen.getByTestId('player-controls-play');
    expect(btn.getAttribute('aria-label')).toBe('Play');
    fireEvent.click(btn);
    expect(api.play).toHaveBeenCalledTimes(1);
  });

  test('mute button toggles via setMuted with the inverse of current state', () => {
    const api = buildApi({}, { muted: false });
    render(<PlayerControls api={api} alwaysVisible />);
    fireEvent.click(screen.getByTestId('player-controls-mute'));
    expect(api.setMuted).toHaveBeenCalledWith(true);
  });

  test('volume slider forwards value to setVolume', () => {
    const api = buildApi({}, { volume: 1 });
    render(<PlayerControls api={api} alwaysVisible />);
    const slider = screen.getByTestId('player-controls-volume') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(api.setVolume).toHaveBeenCalledWith(0.5);
  });

  test('shows Live badge instead of scrubber when stream is not seekable', () => {
    const api = buildApi({}, { seekable: false, duration: Number.POSITIVE_INFINITY });
    render(<PlayerControls api={api} alwaysVisible />);
    expect(screen.getByTestId('player-controls-live-badge')).toBeTruthy();
    expect(screen.queryByTestId('player-controls-scrubber')).toBeNull();
    expect(screen.queryByTestId('player-controls-time')).toBeNull();
  });

  test('shows scrubber + time readout for seekable VOD content', () => {
    const api = buildApi(
      {},
      { seekable: true, currentTime: 42, duration: 120 }
    );
    render(<PlayerControls api={api} alwaysVisible />);
    expect(screen.queryByTestId('player-controls-live-badge')).toBeNull();
    const scrubber = screen.getByTestId('player-controls-scrubber') as HTMLInputElement;
    expect(scrubber.max).toBe('120');
    fireEvent.change(scrubber, { target: { value: '60' } });
    expect(api.seek).toHaveBeenCalledWith(60);
    expect(screen.getByTestId('player-controls-time').textContent).toBe('0:42 / 2:00');
  });

  test('fullscreen button calls toggleFullscreen', () => {
    const api = buildApi();
    render(<PlayerControls api={api} alwaysVisible />);
    fireEvent.click(screen.getByTestId('player-controls-fullscreen'));
    expect(api.toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  test('auto-hides after idle period when playing', async () => {
    vi.useFakeTimers();
    const api = buildApi({ status: 'playing' }, { paused: false });
    render(<PlayerControls api={api} idleHideMs={3000} />);
    const root = screen.getByTestId('player-controls');
    expect(root.getAttribute('data-visible')).toBe('true');
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });
    expect(root.getAttribute('data-visible')).toBe('false');
    vi.useRealTimers();
  });

  test('stays visible while paused even after idle window', async () => {
    vi.useFakeTimers();
    const api = buildApi({ status: 'playing' }, { paused: true });
    render(<PlayerControls api={api} idleHideMs={3000} />);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.getByTestId('player-controls').getAttribute('data-visible')
    ).toBe('true');
    vi.useRealTimers();
  });
});
