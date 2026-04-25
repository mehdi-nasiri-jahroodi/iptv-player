import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  focusKey?: string;
};

/** Multi-line text input — same focus + error model as `TextField`. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid = false, focusKey, className = '', rows = 6, ...rest },
  forwardedRef
) {
  const { ref, focused } = useFocusable<object>({ focusKey });

  const setRef = (node: HTMLTextAreaElement | null) => {
    (ref as { current: HTMLTextAreaElement | null }).current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) {
      (forwardedRef as { current: HTMLTextAreaElement | null }).current = node;
    }
  };

  return (
    <textarea
      ref={setRef}
      rows={rows}
      aria-invalid={invalid || undefined}
      data-focused={focused ? 'true' : 'false'}
      className={[
        'w-full rounded-md border bg-surface p-3 text-sm text-foreground outline-none transition-shadow',
        'placeholder:text-foreground-muted resize-y',
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
