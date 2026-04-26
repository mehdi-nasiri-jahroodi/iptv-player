import type { ReactNode } from 'react';
import type { VodChannel } from 'core';
import { Button } from './Button';
import { formatVodDuration } from './vod-format';

export type VodBrowseHeroProps = {
  channel: VodChannel | null;
  detailLoading: boolean;
  onPlay: () => void;
  onWatchTrailer?: (url: string) => void;
  /** When false, Play is disabled (e.g. missing stream URL or source). */
  canPlay?: boolean;
  /** Extra controls next to Play (e.g. profile favorite from the host app). */
  trailingActions?: ReactNode;
};

function MetaLine({ channel }: { channel: VodChannel }) {
  const parts: string[] = [];
  if (channel.year) parts.push(String(channel.year));
  if (typeof channel.rating === 'number' && Number.isFinite(channel.rating)) {
    parts.push(`${channel.rating.toFixed(1)} ★`);
  }
  const dur = formatVodDuration(channel.durationSeconds);
  if (dur) parts.push(dur);
  if (parts.length === 0) return null;
  return (
    <p className="text-xs font-medium tracking-wide text-foreground-muted">{parts.join(' · ')}</p>
  );
}

/**
 * VOD detail strip — backdrop/poster, metadata, Play + optional trailing slot.
 * Shared by `apps/web` and future webOS; host supplies favorites / routing.
 */
export function VodBrowseHero({
  channel,
  detailLoading,
  onPlay,
  onWatchTrailer,
  canPlay: canPlayProp,
  trailingActions,
}: VodBrowseHeroProps) {
  if (!channel) {
    return (
      <div
        data-testid="vod-browse-hero-empty"
        className="flex min-h-[200px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-foreground-muted"
      >
        Select a movie from the grid.
      </div>
    );
  }

  const canPlay = canPlayProp ?? Boolean(channel.streamUrl);
  const trailerUrl = channel.trailerUrl?.trim() || null;

  const heroImage = channel.backdropUrl ?? channel.posterUrl ?? channel.logoUrl;

  return (
    <section
      data-testid="vod-browse-hero"
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
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

      <div className="relative z-[1] flex flex-col gap-4 p-4 md:flex-row md:items-stretch md:gap-6 md:p-6">
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

        <div className="flex min-w-0 flex-1 flex-col gap-2">
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
          </div>

          {channel.plot ? (
            <p className="line-clamp-4 text-sm leading-relaxed text-foreground-muted">{channel.plot}</p>
          ) : !detailLoading ? (
            <p className="text-sm text-foreground-muted">No description for this title.</p>
          ) : null}

          {(channel.director || channel.cast) && !detailLoading ? (
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

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              focusKey="VOD_HERO_PLAY"
              disabled={!canPlay}
              aria-label="Watch in fullscreen"
              onClick={() => {
                if (canPlay) onPlay();
              }}
            >
              Watch
            </Button>
            {trailerUrl && onWatchTrailer ? (
              <Button
                variant="ghost"
                size="sm"
                focusKey="VOD_HERO_TRAILER"
                aria-label="Watch trailer"
                className="border border-border bg-background/65 hover:bg-surface-raised"
                onClick={() => onWatchTrailer(trailerUrl)}
              >
                Trailer
              </Button>
            ) : null}
            {trailingActions}
          </div>
        </div>
      </div>
    </section>
  );
}
