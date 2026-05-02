import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stable focus key for spatial navigation (defaults to a generated one). */
  focusKey?: string;
  /** When true, render as a non-clickable busy state with an inline indicator. */
  loading?: boolean;
  children?: ReactNode;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50',
  secondary:
    'border border-border bg-background text-foreground hover:bg-surface-raised disabled:opacity-50',
  ghost:
    'bg-transparent text-foreground hover:bg-surface-raised disabled:opacity-50',
  danger:
    'bg-danger text-danger-foreground hover:opacity-90 disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

/**
 * Focus-aware button primitive.
 *
 * Wraps Norigin's `useFocusable` so D-pad / arrow-key navigation works without
 * extra wiring. Visual focus uses the shared `shadow-focus` token from the
 * Tailwind preset; consumers should not override the focus ring.
 *
 * Variants: **primary** (accent fill), **secondary** (border + background), **ghost** (text-only), **danger**.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    focusKey,
    loading = false,
    disabled,
    className = '',
    children,
    onClick,
    type = 'button',
    ...rest
  },
  forwardedRef
) {
  const { ref, focused } = useFocusable<object>({
    focusKey,
    onEnterPress: () => {
      if (!disabled && !loading && onClick) {
        // Synthesise a click for spatial navigation Enter presses.
        (forwardedRef as { current: HTMLButtonElement | null } | null)?.current?.click() ??
          (ref.current as HTMLButtonElement | null)?.click();
      }
    },
  });

  const setRef = (node: HTMLButtonElement | null) => {
    (ref as { current: HTMLButtonElement | null }).current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) {
      (forwardedRef as { current: HTMLButtonElement | null }).current = node;
    }
  };

  return (
    <button
      ref={setRef}
      type={type}
      disabled={disabled || loading}
      data-focused={focused ? 'true' : 'false'}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-medium outline-none transition-shadow',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        focused ? 'shadow-focus ring-2 ring-accent/40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <span aria-hidden className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
});
