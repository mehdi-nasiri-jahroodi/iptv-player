import type { HTMLAttributes, ReactNode } from 'react';

export function Stack({
  gap = 4,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  gap?: 2 | 3 | 4 | 6 | 8;
  children?: ReactNode;
}) {
  const gapClass = { 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 6: 'gap-6', 8: 'gap-8' }[gap];
  return (
    <div className={`flex flex-col ${gapClass} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function AppScreen({
  className = '',
  /** When false, fills the main viewport segment and does not scroll at this root (use internal panes). */
  scrollPage = true,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode; scrollPage?: boolean }) {
  return (
    <div
      className={[
        'flex min-h-0 flex-1 flex-col bg-background text-foreground',
        scrollPage ? 'scrollbar-slim overflow-y-auto' : 'overflow-hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
