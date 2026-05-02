/** Monorepo version injected by Vite `define` in `vite.config.mts`. */
export function getAppVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__.length > 0) {
    return __APP_VERSION__;
  }
  return 'dev';
}

declare const __APP_VERSION__: string | undefined;
