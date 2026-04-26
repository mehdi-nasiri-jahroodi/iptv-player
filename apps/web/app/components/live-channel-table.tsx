import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { Channel, EpgGuide } from 'core';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { inferStreamQualityHints, streamQualityRank } from '../lib/live-channel-badges';
import { formatNowNextLine } from '../lib/epg-display';
import { favoriteKey, useProfileStore } from '../store/profile-store';
import { ChannelFavoriteButton } from './favorite-channel-button';

/** Shared column template: #, channel (flex), capped category, quality, status, favorite. */
const TABLE_GRID_COLS =
  'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,10rem)_9rem_9rem_6.75rem]' as const;

/** Horizontal gap between columns (keep header + body in sync). */
const TABLE_COL_GAP = 'gap-x-4 gap-y-0' as const;

type SortKey = 'index' | 'name' | 'category' | 'quality' | 'status' | 'favorite';

function ChannelLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="size-11 shrink-0 rounded-md bg-surface-raised object-contain p-0.5"
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
      className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-raised text-sm font-semibold text-foreground-muted"
    >
      {initial}
    </div>
  );
}

function QualityBadges({ name }: { name: string }) {
  const hints = inferStreamQualityHints(name);
  if (hints.length === 0) {
    return (
      <span className="block text-center text-xs text-foreground-muted">—</span>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {hints.map((label) => (
        <span
          key={label}
          className={[
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            label === '4K'
              ? 'bg-lum-saffron-2/25 text-lum-saffron-2'
              : 'bg-accent/20 text-accent',
          ].join(' ')}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function SortColumnHeader({
  label,
  column,
  sort,
  onSort,
  align = 'left',
  focusKey,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right' | 'center';
  focusKey: string;
}) {
  const { ref, focused } = useFocusable<object>({
    focusKey,
    onEnterPress: () => onSort(column),
  });

  const active = sort?.key === column;
  const sortLabel =
    active && sort
      ? `${label}, sorted ${sort.dir === 'asc' ? 'ascending' : 'descending'}, press to reverse`
      : `Sort by ${label}`;

  const setRef = (node: HTMLButtonElement | null) => {
    (ref as { current: HTMLButtonElement | null }).current = node;
  };

  const justify =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  const textAlign =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="min-w-0 w-full">
      <button
        ref={setRef}
        type="button"
        data-focused={focused ? 'true' : 'false'}
        onClick={() => onSort(column)}
        className={[
          'flex w-full min-w-0 items-center gap-1 rounded-md py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted outline-none transition-colors',
          justify,
          textAlign,
          focused ? 'shadow-focus ring-1 ring-inset ring-accent/35' : 'hover:bg-surface/80 hover:text-foreground',
        ].join(' ')}
        aria-label={sortLabel}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="inline-flex shrink-0 text-foreground-muted" aria-hidden>
          {active ? (
            sort.dir === 'asc' ? (
              <ChevronUp className="size-3.5 text-accent" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="size-3.5 text-accent" strokeWidth={2.5} />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-45" strokeWidth={2} />
          )}
        </span>
      </button>
    </div>
  );
}

function LiveTableRow({
  index,
  channel,
  selected,
  onSelect,
  sourceId,
  nowPlaying,
}: {
  index: number;
  channel: Channel;
  selected: boolean;
  onSelect: () => void;
  sourceId: string | null;
  nowPlaying: ReactNode | undefined;
}) {
  const { ref, focused } = useFocusable<object>({
    focusKey: `CHANNEL_${channel.id}`,
    onEnterPress: onSelect,
  });

  const name = channel.name;
  const groupTitle = 'groupTitle' in channel ? channel.groupTitle : undefined;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-focused={focused ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          const t = event.target as HTMLElement | null;
          if (t?.closest('[data-live-table-stop-bubble="true"]')) return;
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        `grid ${TABLE_GRID_COLS} ${TABLE_COL_GAP} cursor-pointer items-center border-b border-border px-3 py-2.5 text-left text-sm outline-none transition-colors last:border-b-0`,
        'border-l-4',
        selected
          ? `border-l-accent bg-accent/20 ${focused ? 'shadow-focus ring-2 ring-inset ring-accent/50' : 'ring-1 ring-inset ring-accent/35 hover:bg-accent/25'}`
          : `border-l-transparent ${focused ? 'shadow-focus ring-1 ring-inset ring-accent/35' : 'hover:bg-surface-raised/80'}`,
      ].join(' ')}
    >
      <span className="text-xs tabular-nums text-foreground-muted">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <ChannelLogo logoUrl={'logoUrl' in channel ? channel.logoUrl : undefined} name={name} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground">{name}</div>
          {nowPlaying ? (
            <div className="truncate text-xs text-foreground-muted">{nowPlaying}</div>
          ) : groupTitle ? (
            <div className="truncate text-xs text-foreground-muted">{groupTitle}</div>
          ) : null}
        </div>
      </div>
      <span className="min-w-0 truncate text-xs text-foreground-muted">{groupTitle ?? '—'}</span>
      <QualityBadges name={name} />
      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap text-xs font-medium text-lum-green-2">
        <span className="size-1.5 shrink-0 rounded-full bg-lum-green-2" aria-hidden />
        LIVE
      </div>
      <div
        className="flex justify-end"
        data-live-table-stop-bubble="true"
        onClick={(e) => e.stopPropagation()}
      >
        {sourceId ? (
          <ChannelFavoriteButton
            sourceId={sourceId}
            channelId={channel.id}
            focusKey={`FAV_TABLE_${channel.id}`}
          />
        ) : null}
      </div>
    </div>
  );
}

function compareChannels(
  a: Channel,
  b: Channel,
  sort: { key: SortKey; dir: 'asc' | 'desc' },
  originalIndex: Map<string, number>,
  favRank: (c: Channel) => number,
  catchup: (c: Channel) => number
): number {
  const dir = sort.dir === 'asc' ? 1 : -1;
  let primary = 0;
  switch (sort.key) {
    case 'index':
      primary = (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
      break;
    case 'name':
      primary = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      break;
    case 'category':
      primary = a.groupTitle.localeCompare(b.groupTitle, undefined, { sensitivity: 'base' });
      break;
    case 'quality':
      primary = streamQualityRank(a.name) - streamQualityRank(b.name);
      break;
    case 'status':
      primary = catchup(a) - catchup(b);
      if (primary === 0) {
        primary = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      break;
    case 'favorite':
      primary = favRank(a) - favRank(b);
      break;
    default:
      break;
  }
  if (primary !== 0) return primary * dir;
  return ((originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0)) * dir;
}

export function LiveChannelTable({
  channels,
  selectedId,
  onSelect,
  sourceId,
  guide,
  guideReady,
  nowMs,
  empty,
}: {
  channels: Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  sourceId: string | null;
  guide: EpgGuide | null;
  guideReady: boolean;
  nowMs: number;
  empty?: ReactNode;
}) {
  const { ref, focusKey: resolvedKey } = useFocusable<object>({
    focusKey: 'CHANNEL_LIST',
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    trackChildren: true,
  });

  const favorites = useProfileStore((s) => s.profile.favorites);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  const originalIndex = useMemo(() => {
    const m = new Map<string, number>();
    channels.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [channels]);

  const sortedChannels = useMemo(() => {
    if (!sort) return channels;
    const favRank = (c: Channel) =>
      sourceId && favorites.includes(favoriteKey(sourceId, c.id)) ? 1 : 0;
    const catchup = (c: Channel) => (c.type === 'live' ? (c.catchupDays ?? 0) : 0);
    const list = [...channels];
    list.sort((a, b) => compareChannels(a, b, sort, originalIndex, favRank, catchup));
    return list;
  }, [channels, sort, favorites, sourceId, originalIndex]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) {
        const firstDir: 'asc' | 'desc' =
          key === 'quality' || key === 'favorite' ? 'desc' : 'asc';
        return { key, dir: firstDir };
      }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  if (channels.length === 0) {
    return (
      <div
        ref={ref}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 py-8 text-sm text-foreground-muted"
        data-testid="channel-list"
      >
        <span data-testid="channel-list-empty">{empty ?? 'No channels in this group.'}</span>
      </div>
    );
  }

  return (
    <FocusContext.Provider value={resolvedKey}>
      <div
        ref={ref}
        data-testid="channel-list"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        {/*
          One scrollport so header and rows share the same (scrollbar) width; sticky
          header stays aligned with the grid. Height fills the browse column via flex-1.
        */}
        <div
          className="scrollbar-slim min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          role="presentation"
        >
          <div
            className={`sticky top-0 z-[1] grid ${TABLE_GRID_COLS} ${TABLE_COL_GAP} items-center border-b border-border bg-surface-raised/95 px-3 py-2.5 backdrop-blur-sm supports-[backdrop-filter]:bg-surface-raised/80`}
          >
            <SortColumnHeader
              label="#"
              column="index"
              sort={sort}
              onSort={toggleSort}
              align="left"
              focusKey="LIVE_TABLE_SORT_INDEX"
            />
            <SortColumnHeader
              label="Channel"
              column="name"
              sort={sort}
              onSort={toggleSort}
              focusKey="LIVE_TABLE_SORT_NAME"
            />
            <SortColumnHeader
              label="Category"
              column="category"
              sort={sort}
              onSort={toggleSort}
              focusKey="LIVE_TABLE_SORT_CATEGORY"
            />
            <SortColumnHeader
              label="Quality"
              column="quality"
              sort={sort}
              onSort={toggleSort}
              align="center"
              focusKey="LIVE_TABLE_SORT_QUALITY"
            />
            <SortColumnHeader
              label="Status"
              column="status"
              sort={sort}
              onSort={toggleSort}
              align="center"
              focusKey="LIVE_TABLE_SORT_STATUS"
            />
            <SortColumnHeader
              label="Favorite"
              column="favorite"
              sort={sort}
              onSort={toggleSort}
              align="right"
              focusKey="LIVE_TABLE_SORT_FAVORITE"
            />
          </div>
          <div role="list" className="pb-4">
            {sortedChannels.map((channel, index) => {
              const nowPlaying =
                channel.type === 'live' && guideReady
                  ? formatNowNextLine(guide, channel.tvgId, nowMs)
                  : null;
              return (
                <div role="listitem" key={channel.id}>
                  <LiveTableRow
                    index={index}
                    channel={channel}
                    selected={selectedId === channel.id}
                    onSelect={() => onSelect(channel.id)}
                    sourceId={sourceId}
                    nowPlaying={nowPlaying ?? undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  );
}
