import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

/**
 * Large landing-page tile used to launch into a sub-section of the catalog
 * (Live TV, Movies, Series, …). Headless w.r.t. domain types — the icon is
 * passed as a `ReactNode` and the count is a free-form string so the same
 * primitive works for source-kind tiles, group tiles, and (later) source tiles.
 */
export type CatalogTileProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect' | 'title'> & {
  /** Stable focus key (used by Norigin spatial navigation). */
  focusKey: string;
  title: string;
  subtitle?: ReactNode;
  /** Optional pill rendered under the subtitle ("128 channels", "Empty", …). */
  count?: ReactNode;
  /** Big icon shown on the left; aria-hidden is set automatically. */
  icon?: ReactNode;
  /** Visual marker for "this is the active surface". */
  selected?: boolean;
  /** Disabled tiles do not focus or fire `onSelect`. */
  disabled?: boolean;
  onSelect?: () => void;
};

/**
 * Focus-aware launcher tile.
 *
 * Renders as a `<div role="button">` (not `<button>`) so the children layout
 * cleanly without fighting native button defaults. Enter / Space synthesise
 * a "select" callback for D-pad navigation.
 */
export const CatalogTile = forwardRef<HTMLDivElement, CatalogTileProps>(function CatalogTile(
  {
    focusKey,
    title,
    subtitle,
    count,
    icon,
    selected = false,
    disabled = false,
    onSelect,
    className = '',
    ...rest
  },
  forwardedRef
) {
  const { ref, focused } = useFocusable<object>({
    focusKey,
    focusable: !disabled,
    onEnterPress: () => {
      if (!disabled) onSelect?.();
    },
  });

  const setRef = (node: HTMLDivElement | null) => {
    (ref as { current: HTMLDivElement | null }).current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) {
      (forwardedRef as { current: HTMLDivElement | null }).current = node;
    }
  };

  return (
    <div
      ref={setRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      data-focused={focused ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      onClick={() => {
        if (!disabled) onSelect?.();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.();
        }
      }}
      className={[
        'group relative flex min-h-[140px] flex-col justify-between gap-4 rounded-xl border bg-surface p-5 text-left outline-none transition-all',
        'hover:bg-surface-raised',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer',
        selected ? 'border-accent' : 'border-border',
        focused
          ? 'shadow-focus ring-2 ring-accent/50 -translate-y-0.5'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon ? (
        <div
          aria-hidden
          className="flex size-12 items-center justify-center rounded-lg bg-surface-raised text-accent"
        >
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold text-foreground">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-sm text-foreground-muted">{subtitle}</div>
        ) : null}
        {count ? (
          <div className="mt-2 inline-flex rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-foreground-muted">
            {count}
          </div>
        ) : null}
      </div>
    </div>
  );
});
