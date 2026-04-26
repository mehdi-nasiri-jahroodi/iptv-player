import { useCallback, useEffect, useRef, useState } from 'react';
import type shaka from 'shaka-player';
import { AppScreen, Button, Stack } from 'ui';
import { loadShakaModule } from 'player';

/** Public HLS demo (Mux); used only to verify Shaka wiring — not app content. */
export const PLAY_TEST_HLS_URL =
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

type PlayPhase = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Dev-only smoke test: Shaka loads and plays one hardcoded HLS manifest.
 * Playback starts only after an explicit button click (user gesture + no autoplay).
 */
export default function PlayTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<shaka.Player | null>(null);
  const [phase, setPhase] = useState<PlayPhase>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  const tearDownPlayer = useCallback(async () => {
    const p = playerRef.current;
    playerRef.current = null;
    if (p) {
      await p.destroy();
    }
    const v = videoRef.current;
    if (v) {
      v.removeAttribute('src');
      v.load();
    }
  }, []);

  useEffect(() => {
    return () => {
      void tearDownPlayer();
    };
  }, [tearDownPlayer]);

  const handlePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setErrorText(null);
    setPhase('loading');
    await tearDownPlayer();

    try {
      const shaka = await loadShakaModule();

      if (!shaka.Player.isBrowserSupported()) {
        setPhase('error');
        setErrorText('This browser is not supported by Shaka Player.');
        return;
      }

      const player = new shaka.Player(video);
      playerRef.current = player;

      await player.load(PLAY_TEST_HLS_URL);
      setPhase('playing');
    } catch (err: unknown) {
      setPhase('error');
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' &&
              err !== null &&
              'message' in err &&
              typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : typeof err === 'string'
              ? err
              : 'Playback failed';
      setErrorText(message);
      await tearDownPlayer();
    }
  }, [tearDownPlayer]);

  return (
    <AppScreen>
      <Stack className="mx-auto max-w-3xl p-6" gap={4}>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Shaka smoke test
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Loads Shaka on demand and plays a fixed HLS URL after you press play.
            Phase 1 exit check for web playback.
          </p>
        </header>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <video
            ref={videoRef}
            className="aspect-video w-full bg-background"
            controls
            playsInline
            data-testid="play-test-video"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => void handlePlay()}
            loading={phase === 'loading'}
            disabled={phase === 'loading'}
            focusKey="PLAY_TEST_START"
          >
            {phase === 'playing' ? 'Reload test stream' : 'Play test stream'}
          </Button>
          {phase === 'playing' ? (
            <span className="text-sm text-foreground-muted">Manifest loaded.</span>
          ) : null}
        </div>

        {errorText ? (
          <p className="text-sm text-danger" role="alert" data-testid="play-test-error">
            {errorText}
          </p>
        ) : null}

        <p className="break-all text-xs text-foreground-muted">
          URL: {PLAY_TEST_HLS_URL}
        </p>
      </Stack>
    </AppScreen>
  );
}
