/**
 * Client-only Shaka bootstrap. Uses a dynamic import so the compiled bundle
 * is not evaluated during SSR and does not pull `window` into the server graph.
 */
export async function loadShakaModule(): Promise<
  typeof import('shaka-player')['default']
> {
  if (typeof window === 'undefined') {
    throw new Error('Shaka Player can only load in the browser');
  }

  const mod = await import('shaka-player');
  const fromDefault = mod.default;
  const fromWindow = (window as unknown as { shaka?: typeof fromDefault }).shaka;
  const shaka = fromDefault ?? fromWindow;

  if (!shaka?.polyfill || !shaka.Player) {
    throw new Error('Shaka Player failed to load');
  }

  shaka.polyfill.installAll();
  return shaka;
}
