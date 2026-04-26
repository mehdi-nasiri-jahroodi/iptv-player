import { type HTMLAttributes, type ReactNode } from 'react';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { ChannelCard, type ChannelCardProps } from './ChannelCard';

/**
 * Minimal shape needed to render a row in `ChannelList`. Kept structural so
 * the list can render any future channel kind (live, vod, series tile) by
 * mapping into this shape — `packages/ui` never imports `Channel` from `core`.
 */
export type ChannelListItem = Pick<
  ChannelCardProps,
  'focusKey' | 'name' | 'groupTitle' | 'logoUrl' | 'nowPlaying' | 'selected'
> & {
  /** Stable id used for the React `key` and the focus-key fallback. */
  id: string;
};

export type ChannelListProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * Stable focus boundary key — pages should pass `"CHANNEL_LIST"` to match
   * the focus-region map in `apps/web/AGENTS.md` and the navigation diagram
   * in `docs/web-app-plan.md § 7`.
   */
  focusKey?: string;
  items: ChannelListItem[];
  /** Selected channel id (drives the `selected` styling on cards). */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Rendered when `items` is empty. Defaults to a muted message. */
  empty?: ReactNode;
};

/**
 * Vertically scrolling, focus-aware channel list.
 *
 * Wraps the children in a Norigin `FocusContext` so the boundary owns the
 * "last focused child" memory — when the user navigates away and comes back,
 * focus restores to the same row. Each row is a `ChannelCard`, which itself
 * is a `useFocusable` leaf node.
 *
 * Virtualization (planned for Phase 4) will swap the inner mapping for a
 * windowed renderer; the public API stays stable.
 */
export function ChannelList({
  focusKey = 'CHANNEL_LIST',
  items,
  selectedId,
  onSelect,
  empty,
  className = '',
  ...rest
}: ChannelListProps) {
  const { ref, focusKey: resolvedKey } = useFocusable<object>({
    focusKey,
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    trackChildren: true,
  });

  if (items.length === 0) {
    return (
      <div
        ref={ref}
        className={`flex min-h-[120px] items-center justify-center text-sm text-foreground-muted ${className}`.trim()}
        data-testid="channel-list-empty"
        {...rest}
      >
        {empty ?? 'No channels in this group.'}
      </div>
    );
  }

  return (
    <FocusContext.Provider value={resolvedKey}>
      <div
        ref={ref}
        role="list"
        className={`flex flex-col gap-2 ${className}`.trim()}
        data-testid="channel-list"
        {...rest}
      >
        {items.map((item) => (
          <div role="listitem" key={item.id}>
            <ChannelCard
              focusKey={item.focusKey ?? `channel:${item.id}`}
              name={item.name}
              groupTitle={item.groupTitle}
              logoUrl={item.logoUrl}
              nowPlaying={item.nowPlaying}
              selected={selectedId === item.id || Boolean(item.selected)}
              onSelect={() => onSelect?.(item.id)}
            />
          </div>
        ))}
      </div>
    </FocusContext.Provider>
  );
}
