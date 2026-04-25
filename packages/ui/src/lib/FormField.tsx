import { useId, type ReactNode } from 'react';

export type FormFieldProps = {
  label: ReactNode;
  /** Helpful hint shown below the control until the user submits. */
  hint?: ReactNode;
  /** Inline error message; takes precedence over `hint` when present. */
  error?: ReactNode;
  /** Mark the field as required (adds an asterisk + aria-required). */
  required?: boolean;
  /**
   * Render-prop style: receives the ids the control should bind to so screen
   * readers correlate label, hint, and error with the input.
   */
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
  className?: string;
};

/**
 * Label + control + hint/error wrapper. Stays headless: callers render the
 * actual `<input>` / `<textarea>` / custom control via the render prop and
 * receive the right ids for accessibility.
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  children,
  className = '',
}: FormFieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children({ inputId, describedBy })}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-foreground-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
