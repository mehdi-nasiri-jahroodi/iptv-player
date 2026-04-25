import type { ReactNode } from 'react';
import { useFocusable, type UseFocusableConfig } from '@noriginmedia/norigin-spatial-navigation';

export type FocusableItemProps = Omit<UseFocusableConfig<object>, 'focusKey'> & {
  focusKey: string;
  className?: string;
  children?: ReactNode;
};

/**
 * Base focusable region for TV / keyboard spatial navigation.
 * Requires `init()` from `@noriginmedia/norigin-spatial-navigation` (see web app root).
 */
export function FocusableItem({
  focusKey,
  className = '',
  children,
  ...rest
}: FocusableItemProps) {
  const { ref, focused } = useFocusable<object>({
    ...rest,
    focusKey,
  });

  return (
    <div
      ref={ref}
      data-focused={focused ? 'true' : 'false'}
      className={`rounded-md outline-none transition-shadow ${focused ? 'shadow-focus ring-2 ring-accent/40' : ''} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
