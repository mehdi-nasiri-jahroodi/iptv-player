import { useEffect, useState } from 'react';

const STORAGE_KEY = 'iptv.theme';
type ThemePref = 'light' | 'dark' | 'auto';

function applyTheme(pref: ThemePref): void {
  const html = document.documentElement;
  if (pref === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.classList.toggle('dark', prefersDark);
  } else {
    html.classList.toggle('dark', pref === 'dark');
  }
}

function readPref(): ThemePref {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  } catch {
    /* ignore */
  }
  return 'auto';
}

/**
 * Syncs `<html class="dark">` with the user's saved preference (`light` /
 * `dark` / `auto`). In `auto` we follow `prefers-color-scheme` and live OS
 * changes. Palette + semantic CSS variables in `packages/config` flip on
 * `.dark`. Exposes a `window`-level `__setTheme` so `<AppNav>` can drive it
 * without a full state library.
 */
export function AutoTheme() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const pref = readPref();
    applyTheme(pref);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMqChange = () => {
      if (readPref() === 'auto') applyTheme('auto');
    };
    mq.addEventListener('change', onMqChange);

    // Tiny global hook so `AppNav` can flip the theme without prop drilling
    // or a store. Re-renders this component too so consumers can subscribe.
    (window as unknown as { __setTheme?: (p: ThemePref) => void }).__setTheme = (next) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      applyTheme(next);
      setTick((n) => n + 1);
    };

    return () => {
      mq.removeEventListener('change', onMqChange);
      delete (window as unknown as { __setTheme?: (p: ThemePref) => void }).__setTheme;
    };
  }, []);

  return null;
}

/** Read current theme preference safely from any component (client only). */
export function getThemePref(): ThemePref {
  if (typeof window === 'undefined') return 'auto';
  return readPref();
}

/** Cycle through auto → light → dark → auto. */
export function cycleTheme(): void {
  if (typeof window === 'undefined') return;
  const order: ThemePref[] = ['auto', 'light', 'dark'];
  const current = readPref();
  const next = order[(order.indexOf(current) + 1) % order.length];
  const setter = (window as unknown as { __setTheme?: (p: ThemePref) => void }).__setTheme;
  setter?.(next);
}
