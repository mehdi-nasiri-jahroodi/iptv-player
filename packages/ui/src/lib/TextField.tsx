import { forwardRef, type InputHTMLAttributes } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Visual error state — renders a danger-colored border. */
  invalid?: boolean;
  /** Stable focus key for spatial navigation. */
  focusKey?: string;
};

/**
 * Single-line text input. Headless on purpose: pair with `FormField` for label,
 * hint, and error rendering. Focus state is driven by Norigin so D-pad
 * navigation reaches it and the visual ring matches the rest of the app.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { invalid = false, focusKey, className = '', onFocus, ...rest },
  forwardedRef
) {
  const { ref, focused } = useFocusable<object>({ focusKey });

  const setRef = (node: HTMLInputElement | null) => {
    (ref as { current: HTMLInputElement | null }).current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) {
      (forwardedRef as { current: HTMLInputElement | null }).current = node;
    }
  };

  return (
    <input
      ref={setRef}
      aria-invalid={invalid || undefined}
      data-focused={focused ? 'true' : 'false'}
      onFocus={onFocus}
      className={[
        'h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none transition-shadow',
        'placeholder:text-foreground-muted',
        invalid ? 'border-danger' : 'border-border',
        focused ? 'shadow-focus ring-2 ring-accent/40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
});
