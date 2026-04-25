import { NavLink } from 'react-router';

export function AppNav() {
  return (
    <nav className="border-b border-border bg-surface px-4 py-3">
      <div className="mx-auto flex max-w-5xl gap-4 text-sm font-medium">
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
          to="/about"
          end
          className={({ isActive }) =>
            `rounded-md px-2 py-1 ${isActive ? 'bg-accent text-accent-foreground' : 'text-foreground-muted hover:text-foreground'}`
          }
        >
          About
        </NavLink>
      </div>
    </nav>
  );
}
