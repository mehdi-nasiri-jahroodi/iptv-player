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
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      className={`min-h-screen bg-background text-foreground ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
