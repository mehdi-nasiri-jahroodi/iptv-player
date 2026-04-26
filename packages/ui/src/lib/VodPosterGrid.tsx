import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { VodChannel } from 'core';
import { getVodPosterBadgeSegments } from './vod-poster-meta';

function VodPosterTile({
  channel,
  selected,
  onSelect,
  onHighlight,
}: {
  channel: VodChannel;
  selected: boolean;
  onSelect: (id: string) => void;
  onHighlight: (id: string) => void;
}) {
  const { ref, focused } = useFocusable<object>({
    focusKey: `VOD_POSTER_${channel.id}`,
    onEnterPress: () => onSelect(channel.id),
    onFocus: () => onHighlight(channel.id),
  });

  const art = channel.posterUrl ?? channel.logoUrl;
  const initial = channel.name.trim().charAt(0).toUpperCase() || '?';
  const badgeSegments = getVodPosterBadgeSegments(channel);
  const posterMetaLine = badgeSegments[0]?.label ?? null;

  return (
    <div role="listitem" className="min-w-0">
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        data-focused={focused ? 'true' : 'false'}
        data-selected={selected ? 'true' : 'false'}
        aria-pressed={selected}
        aria-label={`${channel.name}. Press Enter to show details.`}
        onClick={() => onSelect(channel.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(channel.id);
          }
        }}
        className={[
          'group relative w-full cursor-pointer overflow-hidden rounded-lg border text-left outline-none transition-shadow',
          selected
            ? 'border-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
            : 'border-border bg-surface',
          focused ? 'shadow-focus ring-2 ring-accent/40' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-surface-raised">
          {art ? (
            <img
              src={art}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-accent/15 text-3xl font-semibold text-foreground-muted">
              {initial}
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/60 to-transparent px-2 pb-2 pt-11">
          {posterMetaLine ? (
            <div className="mb-1.5">
              <span className="inline-flex max-w-full rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-semibold leading-tight text-foreground shadow-sm backdrop-blur-sm">
                <span className="truncate">{posterMetaLine}</span>
              </span>
            </div>
          ) : null}
          <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground drop-shadow-sm">
            {channel.name}
          </p>
        </div>
      </div>
    </div>
  );
}

export type VodPosterGridProps = {
  channels: VodChannel[];
  selectedId: string | null;
  onHighlight: (id: string) => void;
  /** Invoked on tile click / Enter / Space — selects the title (e.g. host updates a detail hero). */
  onSelect: (id: string) => void;
  empty?: string;
};

/**
 * Spatially navigable poster grid for VOD movies (2:3 tiles).
 */
export function VodPosterGrid({
  channels,
  selectedId,
  onHighlight,
  onSelect,
  empty = 'No titles in this category.',
}: VodPosterGridProps) {
  const { ref, focusKey } = useFocusable<object>({
    focusKey: 'VOD_POSTER_GRID',
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    trackChildren: true,
  });

  if (channels.length === 0) {
    return (
      <div
        ref={ref}
        data-testid="vod-poster-grid-empty"
        className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border bg-surface/50 px-4 text-sm text-foreground-muted"
      >
        {empty}
      </div>
    );
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={ref}
        role="list"
        data-testid="vod-poster-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        {channels.map((ch) => (
          <VodPosterTile
            key={ch.id}
            channel={ch}
            selected={selectedId === ch.id}
            onSelect={onSelect}
            onHighlight={onHighlight}
          />
        ))}
      </div>
    </FocusContext.Provider>
  );
}
