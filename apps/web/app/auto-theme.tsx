import { useEffect } from 'react';

/**
 * Syncs `<html class="dark">` with `prefers-color-scheme: dark` and live OS changes.
 * Palette + semantic CSS variables in `packages/config` already flip on `.dark`.
 */
export function AutoTheme() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      document.documentElement.classList.toggle('dark', mq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return null;
}
