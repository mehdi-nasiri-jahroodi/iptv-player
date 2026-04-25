import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useId, type ReactNode } from 'react';

export type TabItem<TValue extends string> = {
  value: TValue;
  label: ReactNode;
  /** Hidden from rendering when true. Useful for gating tabs by feature flag. */
  hidden?: boolean;
};

export type TabsProps<TValue extends string> = {
  items: readonly TabItem<TValue>[];
  value: TValue;
  onChange: (next: TValue) => void;
  /**
   * Stable focus key prefix; each tab trigger derives `${focusKeyPrefix}-${value}`
   * so spatial navigation can target individual tabs by string id.
   */
  focusKeyPrefix?: string;
  /** Optional ARIA label for the tablist (recommended for accessibility). */
  ariaLabel?: string;
  className?: string;
};

/**
 * Headless tab strip — purely presentational triggers; consumers render the
 * matching panel themselves based on `value`. Each trigger is wrapped in
 * `useFocusable` so D-pad navigation moves between tabs naturally.
 */
export function Tabs<TValue extends string>({
  items,
  value,
  onChange,
  focusKeyPrefix,
  ariaLabel,
  className = '',
}: TabsProps<TValue>) {
  const fallbackPrefix = useId();
  const prefix = focusKeyPrefix ?? `tabs-${fallbackPrefix}`;
  const visible = items.filter((it) => !it.hidden);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex gap-1 rounded-md border border-border bg-surface p-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {visible.map((item) => (
        <TabTrigger
          key={item.value}
          item={item}
          active={item.value === value}
          focusKey={`${prefix}-${item.value}`}
          onSelect={() => onChange(item.value)}
        />
      ))}
    </div>
  );
}

function TabTrigger<TValue extends string>({
  item,
  active,
  focusKey,
  onSelect,
}: {
  item: TabItem<TValue>;
  active: boolean;
  focusKey: string;
  onSelect: () => void;
}) {
  const { ref, focused } = useFocusable<object>({
    focusKey,
    onEnterPress: onSelect,
  });

  return (
    <button
      ref={ref as never}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-focused={focused ? 'true' : 'false'}
      onClick={onSelect}
      className={[
        'rounded px-3 py-1.5 text-sm font-medium outline-none transition-shadow',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground-muted hover:text-foreground',
        focused ? 'shadow-focus ring-2 ring-accent/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {item.label}
    </button>
  );
}
