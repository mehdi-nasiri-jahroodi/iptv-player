/**
 * Lazy, browser-only loader for Shaka Player.
 *
 * The compiled bundle pulls `window`/`navigator` at top-level, so it must
 * not be evaluated during SSR. Callers `await loadShakaModule()` from a
 * client effect (or after a user gesture) and receive the initialized
 * `shaka` namespace with polyfills already installed.
 */
export async function loadShakaModule(): Promise<
  typeof import('shaka-player')['default']
> {
  if (typeof window === 'undefined') {
    throw new Error('Shaka Player can only load in the browser');
  }

  const mod = await import('shaka-player');
  const fromDefault = mod.default;
  const fromWindow = (window as unknown as { shaka?: typeof fromDefault })
    .shaka;
  const shaka = fromDefault ?? fromWindow;

  if (!shaka?.polyfill || !shaka.Player) {
    throw new Error('Shaka Player failed to load');
  }

  shaka.polyfill.installAll();
  return shaka;
}
