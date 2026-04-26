import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { LAYOUT_CONTENT_CLASS } from '../lib/layout-shell';
import { cycleTheme, getThemePref } from './auto-theme';
import { BrowseNavToolbar } from './browse-nav-toolbar';

function ThemeToggle() {
  const [pref, setPref] = useState<'light' | 'dark' | 'auto'>('auto');
  useEffect(() => {
    setPref(getThemePref());
    const onStorage = () => setPref(getThemePref());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const label = pref === 'auto' ? 'Theme: auto' : pref === 'dark' ? 'Theme: dark' : 'Theme: light';
  return (
    <button
      type="button"
      onClick={() => {
        cycleTheme();
        setPref(getThemePref());
      }}
      className="rounded-md border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
    >
      {label}
    </button>
  );
}

const navPill = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors ${
    isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'
  }`;

export function AppNav() {
  return (
    <nav className="shrink-0 border-b border-border bg-surface">
      <div
        className={`${LAYOUT_CONTENT_CLASS} flex flex-wrap items-center gap-y-2 py-3 text-sm font-medium`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1 sm:gap-x-2">
          <NavLink to="/" end className={navPill}>
            Home
          </NavLink>
          <NavLink to="/browse/live" className={navPill}>
            Live TV
          </NavLink>
          <NavLink to="/browse/vod" className={navPill}>
            Movies
          </NavLink>
          <NavLink to="/browse/series" className={navPill}>
            Series
          </NavLink>
        </div>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 sm:ml-auto sm:gap-x-2">
          <NavLink to="/add-source" end className={navPill}>
            Add source
          </NavLink>
          <NavLink to="/epg" end className={navPill}>
            Guide
          </NavLink>
          <NavLink to="/settings" end className={navPill}>
            Settings
          </NavLink>
          {import.meta.env.DEV ? (
            <>
              <NavLink to="/dev/design-tokens" end className={navPill}>
                Token lab
              </NavLink>
              <NavLink to="/dev/play-test" end className={navPill}>
                Shaka test
              </NavLink>
            </>
          ) : null}
          <BrowseNavToolbar />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
