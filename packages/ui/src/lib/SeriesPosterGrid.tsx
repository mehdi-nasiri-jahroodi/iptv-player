import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { SeriesChannel } from 'core';

function SeriesPosterTile({
  channel,
  selected,
  onSelect,
  onHighlight,
  watched,
}: {
  channel: SeriesChannel;
  selected: boolean;
  onSelect: (id: string) => void;
  onHighlight: (id: string) => void;
  /** True when at least one episode has been watched (recents). */
  watched: boolean;
}) {
  const { ref, focused } = useFocusable<object>({
    focusKey: `SERIES_POSTER_${channel.id}`,
    onEnterPress: () => onSelect(channel.id),
    onFocus: () => onHighlight(channel.id),
  });

  const art = channel.posterUrl ?? channel.logoUrl;
  const initial = channel.name.trim().charAt(0).toUpperCase() || '?';

  const episodeCount = channel.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
  const seasonCount = channel.seasons.length;
  const badgeLabel =
    seasonCount > 0
      ? seasonCount === 1
        ? `${episodeCount} ep`
        : `${seasonCount} S`
      : null;

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

        {/* watched indicator strip */}
        {watched ? (
          <div
            aria-label="Partially watched"
            className="absolute inset-x-0 bottom-0 h-[3px] bg-accent"
          />
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/60 to-transparent px-2 pb-2 pt-11">
          {badgeLabel ? (
            <div className="mb-1.5">
              <span className="inline-flex max-w-full rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-semibold leading-tight text-foreground shadow-sm backdrop-blur-sm">
                <span className="truncate">{badgeLabel}</span>
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

export type SeriesPosterGridProps = {
  channels: SeriesChannel[];
  selectedId: string | null;
  /** Set of series ids that have at least one watched episode (from recents). */
  watchedSeriesIds?: ReadonlySet<string>;
  onHighlight: (id: string) => void;
  onSelect: (id: string) => void;
  empty?: string;
};

/**
 * Spatially navigable poster grid for TV series (2:3 tiles).
 * Mirrors `VodPosterGrid`; tile shows season/episode count badge + watched strip.
 */
export function SeriesPosterGrid({
  channels,
  selectedId,
  watchedSeriesIds,
  onHighlight,
  onSelect,
  empty = 'No series in this category.',
}: SeriesPosterGridProps) {
  const { ref, focusKey } = useFocusable<object>({
    focusKey: 'SERIES_POSTER_GRID',
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    trackChildren: true,
  });

  if (channels.length === 0) {
    return (
      <div
        ref={ref}
        data-testid="series-poster-grid-empty"
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
        data-testid="series-poster-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        {channels.map((ch) => (
          <SeriesPosterTile
            key={ch.id}
            channel={ch}
            selected={selectedId === ch.id}
            watched={watchedSeriesIds?.has(ch.id) ?? false}
            onSelect={onSelect}
            onHighlight={onHighlight}
          />
        ))}
      </div>
    </FocusContext.Provider>
  );
}
