import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { useShakaPlayer } from '../../src/lib/use-shaka-player.js';

/**
 * Lightweight Shaka mock. We expose just enough of the surface that
 * `useShakaPlayer` calls on it: `Player` constructor, event listeners,
 * load/destroy, isBrowserSupported, getVariantTracks/getTextTracks,
 * selectVariantTrack/selectTextTrack, polyfill.installAll.
 */
type Listener = (event: unknown) => void;

interface MockPlayer {
  load: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  getVariantTracks: ReturnType<typeof vi.fn>;
  getTextTracks: ReturnType<typeof vi.fn>;
  selectVariantTrack: ReturnType<typeof vi.fn>;
  selectTextTrack: ReturnType<typeof vi.fn>;
  getNetworkingEngine: ReturnType<typeof vi.fn>;
  /** Test-only helper. */
  _emit: (event: string, payload?: unknown) => void;
}

const players: MockPlayer[] = [];

function makeMockPlayer(): MockPlayer {
  const listeners = new Map<string, Set<Listener>>();
  const player: MockPlayer = {
    load: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    addEventListener: vi.fn((event: string, fn: Listener) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: Listener) => {
      listeners.get(event)?.delete(fn);
    }),
    getVariantTracks: vi.fn(() => [
      {
        id: 1,
        language: 'en',
        label: '720p',
        active: true,
        bandwidth: 2_500_000,
      },
      {
        id: 2,
        language: 'en',
        label: '1080p',
        active: false,
        bandwidth: 5_000_000,
      },
    ]),
    getTextTracks: vi.fn(() => []),
    selectVariantTrack: vi.fn(),
    selectTextTrack: vi.fn(),
    // The proxy request filter installs through this. Returning a
    // minimal stub keeps the existing tests black-box: when no
    // `streamProxy` option is passed the filter is a no-op anyway.
    getNetworkingEngine: vi.fn(() => ({
      registerRequestFilter: vi.fn(),
      unregisterRequestFilter: vi.fn(),
    })),
    _emit(event, payload) {
      for (const fn of listeners.get(event) ?? []) fn(payload);
    },
  };
  return player;
}

vi.mock('../../src/lib/load-shaka.js', () => ({
  loadShakaModule: vi.fn(async () => {
    function PlayerCtor(this: MockPlayer) {
      const p = makeMockPlayer();
      players.push(p);
      Object.assign(this, p);
    }
    (PlayerCtor as unknown as { isBrowserSupported: () => boolean }).isBrowserSupported =
      () => true;
    return {
      Player: PlayerCtor as unknown as { new (video: HTMLVideoElement): MockPlayer },
      polyfill: { installAll: vi.fn() },
    };
  }),
}));

beforeEach(() => {
  players.length = 0;
  // jsdom does not implement HTMLMediaElement.prototype.play; stub it so
  // the auto-play call inside the hook resolves cleanly instead of throwing
  // synchronously and tripping the load-error branch.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

describe('useShakaPlayer', () => {
  test('starts idle when streamUrl is null and never instantiates a player', async () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      // Attach a fake video element so the effect's early-return on
      // missing-ref does not fire spuriously when the user later passes a url.
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, null);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.tracks).toEqual([]);
    expect(players).toHaveLength(0);
  });

  test('loads the stream, surfaces tracks, and reaches `playing`', async () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/live.m3u8', {
        autoPlay: false,
      });
    });

    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('playing');
    });

    expect(players).toHaveLength(1);
    expect(players[0].load).toHaveBeenCalledWith(
      'https://example.com/live.m3u8'
    );
    expect(result.current.tracks).toHaveLength(2);
    expect(result.current.tracks[0]).toMatchObject({
      type: 'variant',
      language: 'en',
      bandwidth: 2500, // converted to kbps
      active: true,
    });
  });

  test('reports a Shaka load error', async () => {
    // Force load() to reject for the next instance.
    const onError = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/bad.m3u8', { onError });
    });

    await waitFor(() => expect(players).toHaveLength(1));
    players[0].load.mockRejectedValueOnce(new Error('manifest 403'));

    // Trigger retry which uses the existing player instance.
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('manifest 403');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'manifest 403' })
    );
  });

  test('recoverable Shaka errors do not surface as fatal', async () => {
    // Severity 1 = RECOVERABLE in shaka.util.Error.Severity. Playback
    // continues; we should NOT show the big overlay or call onError.
    const onError = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/live.m3u8', { onError });
    });

    await waitFor(() => expect(result.current.status).toBe('playing'));

    act(() => {
      players[0]._emit('error', {
        detail: {
          code: 1002,
          category: 1,
          severity: 1,
          data: ['https://cdn.example.com/seg42.ts', 403],
        },
      });
    });

    expect(result.current.status).toBe('playing');
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.recoverableError).not.toBeNull();
    expect(result.current.recoverableError?.code).toBe(1002);
    expect(result.current.recoverableError?.severity).toBe(1);
  });

  test('recoverable error clears when the video resumes playback', async () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return { ref, api: useShakaPlayer(ref, 'https://example.com/live.m3u8') };
    });

    await waitFor(() => expect(result.current.api.status).toBe('playing'));

    act(() => {
      players[0]._emit('error', {
        detail: { code: 1002, category: 1, severity: 1 },
      });
    });
    expect(result.current.api.recoverableError).not.toBeNull();

    act(() => {
      result.current.ref.current?.dispatchEvent(new Event('playing'));
    });

    await waitFor(() => expect(result.current.api.recoverableError).toBeNull());
  });

  test('Shaka errors with no severity field default to fatal', async () => {
    // Defensive: some Shaka builds / mocks omit severity. We must not
    // silently swallow such errors.
    const onError = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/live.m3u8', { onError });
    });

    await waitFor(() => expect(result.current.status).toBe('playing'));

    act(() => {
      players[0]._emit('error', {
        detail: { code: 6001, category: 6 },
      });
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.code).toBe(6001);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('destroys the player on unmount', async () => {
    const { result, unmount } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/live.m3u8');
    });

    await waitFor(() => expect(result.current.status).toBe('playing'));
    expect(players).toHaveLength(1);

    unmount();
    await waitFor(() => expect(players[0].destroy).toHaveBeenCalled());
  });

  test('clearTextTrack calls Shaka selectTextTrack(null)', async () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/movie.m3u8');
    });

    await waitFor(() => expect(result.current.status).toBe('playing'));
    act(() => result.current.clearTextTrack());
    expect(players[0].selectTextTrack).toHaveBeenCalledWith(null);
  });

  test('selectTrack calls Shaka selectVariantTrack with the matching track', async () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(null);
      if (!ref.current) ref.current = document.createElement('video');
      return useShakaPlayer(ref, 'https://example.com/live.m3u8');
    });

    await waitFor(() => expect(result.current.status).toBe('playing'));
    const second = result.current.tracks[1];

    act(() => result.current.selectTrack(second));
    expect(players[0].selectVariantTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
      true
    );
  });

  test('changing streamUrl tears down the previous player and loads the new one', async () => {
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => {
        const ref = useRef<HTMLVideoElement | null>(null);
        if (!ref.current) ref.current = document.createElement('video');
        return useShakaPlayer(ref, url);
      },
      { initialProps: { url: 'https://example.com/a.m3u8' } }
    );

    await waitFor(() => expect(result.current.status).toBe('playing'));
    expect(players).toHaveLength(1);
    const first = players[0];

    rerender({ url: 'https://example.com/b.m3u8' });
    await waitFor(() => expect(players).toHaveLength(2));
    await waitFor(() => expect(first.destroy).toHaveBeenCalled());
    expect(players[1].load).toHaveBeenCalledWith('https://example.com/b.m3u8');
  });
});
