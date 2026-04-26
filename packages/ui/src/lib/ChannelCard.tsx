import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

/**
 * Minimal channel-card props. The component is intentionally generic over the
 * channel shape (it never imports `Channel` from `core`) so it can render live
 * channels today and VOD/series tiles in Phase 4 without a schema dependency.
 */
export type ChannelCardProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  /** Stable focus key (typically the channel id). */
  focusKey: string;
  name: string;
  groupTitle?: string;
  logoUrl?: string;
  /** Optional now-playing or program-now title. */
  nowPlaying?: ReactNode;
  /** Optional trailing chrome (e.g. favorite control). */
  trailing?: ReactNode;
  /** Visual marker; e.g. the active-source indicator in a list. */
  selected?: boolean;
  onSelect?: () => void;
};

/**
 * Focus-aware tile rendering one channel.
 *
 * The card is a `<div role="button">` rather than a real `<button>` so the
 * children (logo, multi-line text) layout cleanly without fighting native
 * button styles. Enter / Space synthesise a "select" callback for D-pad use.
 */
export const ChannelCard = forwardRef<HTMLDivElement, ChannelCardProps>(function ChannelCard(
  {
    focusKey,
    name,
    groupTitle,
    logoUrl,
    nowPlaying,
    trailing,
    selected = false,
    onSelect,
    className = '',
    ...rest
  },
  forwardedRef
) {
  const { ref, focused } = useFocusable<object>({
    focusKey,
    onEnterPress: () => onSelect?.(),
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
      tabIndex={0}
      aria-pressed={selected}
      data-focused={focused ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          const t = event.target as HTMLElement | null;
          if (t?.closest('[data-channel-card-stop-bubble="true"]')) return;
          event.preventDefault();
          onSelect?.();
        }
      }}
      className={[
        'flex w-full items-center gap-3 rounded-md border bg-surface p-3 text-left outline-none transition-shadow',
        'hover:bg-surface-raised',
        selected
          ? 'border-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
          : 'border-border',
        focused ? 'shadow-focus ring-2 ring-accent/40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <ChannelLogo logoUrl={logoUrl} name={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        {groupTitle ? (
          <div className="truncate text-xs text-foreground-muted">{groupTitle}</div>
        ) : null}
        {nowPlaying ? (
          <div className="truncate text-xs text-foreground-muted">{nowPlaying}</div>
        ) : null}
      </div>
      {trailing ? (
        <div
          className="shrink-0"
          data-channel-card-stop-bubble="true"
          onClick={(e) => e.stopPropagation()}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
});

function ChannelLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  // Logos come from arbitrary providers and frequently 404; fall back to an
  // initial badge so the row still has a left-anchor visual. (A logo cache
  // with retry/fallback lives in Phase 4.)
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="size-10 shrink-0 rounded bg-surface-raised object-contain"
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded bg-surface-raised text-sm font-semibold text-foreground-muted"
    >
      {initial}
    </div>
  );
}
