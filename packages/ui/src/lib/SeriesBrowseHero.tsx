import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { SeriesChannel, SeriesEpisode } from 'core';
import { Button } from './Button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MetaLine({ channel }: { channel: SeriesChannel }) {
  const parts: string[] = [];
  if (channel.releaseYear) parts.push(String(channel.releaseYear));
  if (typeof channel.rating === 'number' && Number.isFinite(channel.rating)) {
    parts.push(`${channel.rating.toFixed(1)} ★`);
  }
  const seasonCount = channel.seasons.length;
  const episodeCount = channel.seasons.reduce((s, se) => s + se.episodes.length, 0);
  if (seasonCount > 0) {
    parts.push(
      seasonCount === 1
        ? `${episodeCount} episode${episodeCount !== 1 ? 's' : ''}`
        : `${seasonCount} seasons`
    );
  }
  if (parts.length === 0) return null;
  return (
    <p className="text-xs font-medium tracking-wide text-foreground-muted">{parts.join(' · ')}</p>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SeriesBrowseHeroProps = {
  channel: SeriesChannel | null;
  /** True while `get_series_info` is in-flight (Xtream sources only). */
  detailLoading?: boolean;
  /** Set of episode ids that appear in recents → shows watched marker. */
  watchedEpisodeIds?: ReadonlySet<string>;
  onPlayEpisode: (episode: SeriesEpisode) => void;
  /** Extra controls (e.g. favorites button) rendered next to the title. */
  trailingActions?: ReactNode;
};

/**
 * Series detail hero — backdrop/poster, metadata, season tabs + episode list.
 * Shared by `apps/web` and future webOS; host supplies routing + favorites.
 *
 * Season tabs auto-select the first season on mount / series change.
 * Clicking an episode row calls `onPlayEpisode`.
 */
export function SeriesBrowseHero({
  channel,
  detailLoading,
  watchedEpisodeIds,
  onPlayEpisode,
  trailingActions,
}: SeriesBrowseHeroProps) {
  if (!channel) {
    return (
      <div
        data-testid="series-browse-hero-empty"
        className="flex min-h-[240px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-foreground-muted"
      >
        Select a series from the grid.
      </div>
    );
  }

  return <SeriesHeroInner channel={channel} detailLoading={detailLoading} watchedEpisodeIds={watchedEpisodeIds} onPlayEpisode={onPlayEpisode} trailingActions={trailingActions} />;
}

// Separate inner component so hooks run unconditionally (channel is guaranteed non-null here).
function SeriesHeroInner({
  channel,
  detailLoading,
  watchedEpisodeIds,
  onPlayEpisode,
  trailingActions,
}: {
  channel: SeriesChannel;
  detailLoading?: boolean;
  watchedEpisodeIds?: ReadonlySet<string>;
  onPlayEpisode: (episode: SeriesEpisode) => void;
  trailingActions?: ReactNode;
}) {
  const sortedSeasons = useMemo(
    () => [...channel.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber),
    [channel.seasons]
  );

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Reset / initialise when the series changes.
  useEffect(() => {
    setSelectedSeason(sortedSeasons[0]?.seasonNumber ?? null);
  }, [channel.id, sortedSeasons]);

  // Clamp if the selected season disappears (shouldn't happen in practice).
  useEffect(() => {
    if (selectedSeason !== null && !sortedSeasons.some((s) => s.seasonNumber === selectedSeason)) {
      setSelectedSeason(sortedSeasons[0]?.seasonNumber ?? null);
    }
  }, [sortedSeasons, selectedSeason]);

  const activeSeason = useMemo(
    () => sortedSeasons.find((s) => s.seasonNumber === selectedSeason) ?? null,
    [sortedSeasons, selectedSeason]
  );

  const heroImage = channel.backdropUrl ?? channel.posterUrl ?? channel.logoUrl;

  return (
    <section
      data-testid="series-browse-hero"
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      {/* Backdrop */}
      {heroImage ? (
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt=""
            className="size-full object-cover opacity-60 dark:opacity-50"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/72 to-background/28" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/15 via-surface to-surface-raised" />
      )}

      <div className="relative z-[1] flex flex-col gap-4 p-4 md:flex-row md:items-start md:gap-6 md:p-6">
        {/* Poster thumbnail */}
        <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-md md:mx-0 md:w-44">
          {channel.posterUrl || channel.logoUrl ? (
            <img
              src={channel.posterUrl ?? channel.logoUrl}
              alt=""
              className="aspect-[2/3] size-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center bg-accent/10 text-2xl font-semibold text-foreground-muted">
              {channel.name.trim().charAt(0).toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {channel.name}
              </h2>
              <MetaLine channel={channel} />
              {channel.genre ? (
                <p className="mt-1 text-xs text-accent">{channel.genre}</p>
              ) : null}
            </div>
            {detailLoading ? (
              <span className="shrink-0 text-xs text-foreground-muted">Loading details…</span>
            ) : null}
            {trailingActions}
          </div>

          {/* Plot */}
          {channel.plot ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-foreground-muted">{channel.plot}</p>
          ) : null}

          {/* Cast / director */}
          {(channel.director || channel.cast) ? (
            <dl className="grid gap-1 text-xs text-foreground-muted">
              {channel.director ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium text-foreground/80">Director</dt>
                  <dd className="min-w-0">{channel.director}</dd>
                </div>
              ) : null}
              {channel.cast ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium text-foreground/80">Cast</dt>
                  <dd className="line-clamp-2 min-w-0">{channel.cast}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {/* Season tabs */}
          {sortedSeasons.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sortedSeasons.map((season) => {
                const active = season.seasonNumber === selectedSeason;
                return (
                  <button
                    key={season.seasonNumber}
                    type="button"
                    onClick={() => setSelectedSeason(season.seasonNumber)}
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                      active
                        ? 'border-accent bg-accent text-background'
                        : 'border-border bg-background/65 text-foreground-muted hover:border-accent/60 hover:text-foreground',
                    ].join(' ')}
                    aria-pressed={active}
                  >
                    {season.name?.trim() || `S${season.seasonNumber}`}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Episode list */}
          {activeSeason ? (
            activeSeason.episodes.length > 0 ? (
              <div
                data-testid="series-hero-episodes"
                className="scrollbar-slim max-h-52 space-y-1.5 overflow-y-auto pr-1"
              >
                {activeSeason.episodes.map((ep) => {
                  const watched = watchedEpisodeIds?.has(ep.id) ?? false;
                  return (
                    <div
                      key={ep.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface/70 px-3 py-2 backdrop-blur-sm"
                    >
                      {/* Episode number */}
                      <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-foreground-muted">
                        {ep.episodeNumber}
                      </span>

                      {/* Title + plot + watched */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{ep.title}</p>
                        {ep.plot ? (
                          <p className="line-clamp-1 text-xs text-foreground-muted">{ep.plot}</p>
                        ) : null}
                        {watched ? (
                          <p className="text-[10px] font-medium text-accent">Watched</p>
                        ) : null}
                      </div>

                      {/* Duration */}
                      {ep.durationSeconds && ep.durationSeconds > 0 ? (
                        <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
                          {formatEpDuration(ep.durationSeconds)}
                        </span>
                      ) : null}

                      {/* Play */}
                      <Button
                        variant="ghost"
                        size="sm"
                        focusKey={`SERIES_HERO_EP_${ep.id}`}
                        className="shrink-0 border border-border bg-background/65 hover:bg-surface-raised"
                        onClick={() => onPlayEpisode(ep)}
                        aria-label={`Play episode ${ep.episodeNumber}: ${ep.title}`}
                      >
                        Play
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-foreground-muted">No episodes in this season.</p>
            )
          ) : sortedSeasons.length === 0 ? (
            <p className="text-xs text-foreground-muted">
              {detailLoading ? 'Loading episodes…' : 'No season data available for this series.'}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function formatEpDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
