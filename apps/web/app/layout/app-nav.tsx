import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { cycleTheme, getThemePref } from './auto-theme';

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
      className="ml-auto rounded-md border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
    >
      {label}
    </button>
  );
}

export function AppNav() {
  return (
    <nav className="border-b border-border bg-surface px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-4 text-sm font-medium">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/add-source"
          end
          className={({ isActive }) =>
            `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
          }
        >
          Add source
        </NavLink>
        <NavLink
          to="/epg"
          end
          className={({ isActive }) =>
            `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
          }
        >
          Guide
        </NavLink>
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
          }
        >
          Settings
        </NavLink>
        {import.meta.env.DEV ? (
          <>
            <NavLink
              to="/dev/design-tokens"
              end
              className={({ isActive }) =>
                `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
              }
            >
              Token lab
            </NavLink>
            <NavLink
              to="/dev/play-test"
              end
              className={({ isActive }) =>
                `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
              }
            >
              Shaka test
            </NavLink>
          </>
        ) : null}
        <ThemeToggle />
      </div>
    </nav>
  );
}
