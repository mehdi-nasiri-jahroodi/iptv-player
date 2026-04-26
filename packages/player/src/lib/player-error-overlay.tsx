import { useState, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Copy, RotateCw } from 'lucide-react';
import {
  describeShakaError,
  formatShakaErrorForClipboard,
  type DescribeShakaErrorOptions,
} from './describe-error.js';
import type { ShakaError } from './use-shaka-player.js';

export interface PlayerErrorOverlayProps {
  /** The error to render. */
  error: ShakaError;
  /** Called when the user clicks Retry. */
  onRetry: () => void;
  /** Called when the user dismisses the overlay (clears the error). Optional;
   *  consumers that don't track error state separately can omit this. */
  onDismiss?: () => void;
  /** Compact variant fits inside the inline LivePlayerPane (no headline icon,
   *  smaller paddings). The full variant is used in fullscreen `/play`. */
  compact?: boolean;
  /** Test hook so callers can override the clipboard write (jsdom). */
  writeToClipboard?: (text: string) => Promise<void>;
  /**
   * When `false`, Shaka HTTP_ERROR (1002) hints suggest enabling the stream
   * proxy. Omit or `true` when the user already configured a proxy.
   */
  streamProxyConfigured?: DescribeShakaErrorOptions['streamProxyConfigured'];
}

/**
 * User-facing playback error chrome.
 *
 * - Translates Shaka error codes to one-line headlines + actionable hints
 *   via `describeShakaError`.
 * - Hides the technical detail (code, category, URL, raw data) behind a
 *   "Show details" toggle so the default view stays calm.
 * - Provides Retry and "Copy diagnostics" actions; the latter writes a
 *   redacted multi-line summary suitable for support tickets.
 *
 * The component is fully headless w.r.t. focus management — the consumer
 * mounts a `useFocusable` boundary outside if D-pad navigation matters.
 */
export function PlayerErrorOverlay({
  error,
  onRetry,
  onDismiss,
  compact = false,
  writeToClipboard,
  streamProxyConfigured,
}: PlayerErrorOverlayProps): ReactNode {
  const desc = describeShakaError(error, { streamProxyConfigured });
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = formatShakaErrorForClipboard(desc);
    try {
      const writer = writeToClipboard
        ?? ((value: string) => navigator.clipboard.writeText(value));
      await writer(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write blocked (no permission, jsdom, etc.) — silently
      // ignore; the user can still read the details inline.
    }
  };

  const handleRetry = () => {
    onDismiss?.();
    onRetry();
  };

  return (
    <div
      role="alert"
      data-testid="player-error-overlay"
      data-compact={compact}
      className={[
        'absolute z-10 flex flex-col gap-2 rounded-md border border-danger/40 bg-background/95 text-foreground shadow-lg backdrop-blur',
        compact
          ? 'inset-x-2 bottom-2 max-h-[80%] overflow-auto px-3 py-2 text-xs'
          : 'inset-1/2 -translate-x-1/2 -translate-y-1/2 max-w-md p-4 text-sm',
      ].join(' ')}
      style={
        compact
          ? undefined
          : { left: '50%', top: '50%', position: 'absolute' }
      }
    >
      <div className="flex items-start gap-2">
        {!compact ? (
          <AlertCircle
            size={20}
            className="mt-0.5 shrink-0 text-danger"
            aria-hidden="true"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div
            className="font-medium text-danger"
            data-testid="player-error-headline"
          >
            {desc.headline}
          </div>
          {desc.hint ? (
            <div
              className={[
                'text-foreground-muted',
                compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs',
              ].join(' ')}
              data-testid="player-error-hint"
            >
              {desc.hint}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleRetry}
          data-testid="player-error-retry"
          className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-accent hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCw size={14} aria-hidden="true" />
          Retry
        </button>
        <button
          type="button"
          onClick={handleCopy}
          data-testid="player-error-copy"
          aria-live="polite"
          className="inline-flex items-center gap-1 rounded-md bg-surface/40 px-2 py-1 text-foreground-muted hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Copy size={14} aria-hidden="true" />
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          data-testid="player-error-toggle-details"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground-muted hover:bg-surface/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {showDetails ? (
            <>
              <ChevronUp size={14} aria-hidden="true" />
              Hide details
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden="true" />
              Show details
            </>
          )}
        </button>
      </div>

      {showDetails ? (
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border/60 bg-surface/30 p-2 font-mono text-[11px] text-foreground-muted"
          data-testid="player-error-details"
        >
          {desc.code !== null ? (
            <Detail label="Code">
              {desc.code}
              {desc.codeName ? ` (${desc.codeName})` : ''}
            </Detail>
          ) : null}
          {desc.category !== null ? (
            <Detail label="Category">{desc.category}</Detail>
          ) : null}
          {desc.httpStatus !== null ? (
            <Detail label="HTTP">{desc.httpStatus}</Detail>
          ) : null}
          {desc.url ? (
            <Detail label="URL">
              <span className="break-all">{desc.url}</span>
            </Detail>
          ) : null}
          {desc.raw.message && desc.raw.message !== desc.headline ? (
            <Detail label="Shaka">{desc.raw.message}</Detail>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

interface DetailProps {
  label: string;
  children: ReactNode;
}

function Detail({ label, children }: DetailProps): ReactNode {
  return (
    <>
      <dt className="text-foreground/80">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
