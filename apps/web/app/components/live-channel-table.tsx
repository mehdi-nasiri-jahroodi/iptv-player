import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { Channel, EpgGuide } from 'core';
import type { ReactNode } from 'react';
import { inferStreamQualityHints } from '../lib/live-channel-badges';
import { formatNowNextLine } from '../lib/epg-display';
import { ChannelFavoriteButton } from './favorite-channel-button';

function ChannelLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="size-9 shrink-0 rounded-md bg-surface-raised object-contain"
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
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-raised text-xs font-semibold text-foreground-muted"
    >
      {initial}
    </div>
  );
}

function QualityBadges({ name }: { name: string }) {
  const hints = inferStreamQualityHints(name);
  if (hints.length === 0) {
    return <span className="text-xs text-foreground-muted">—</span>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
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
        'grid cursor-pointer grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,5.5rem)_minmax(0,4rem)_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-left text-sm outline-none transition-colors last:border-b-0',
        selected ? 'border-l-2 border-l-accent bg-accent/10 pl-[10px]' : 'border-l-2 border-l-transparent',
        focused ? 'shadow-focus ring-1 ring-inset ring-accent/35' : 'hover:bg-surface-raised/80',
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
      <span className="truncate text-xs text-foreground-muted">{groupTitle ?? '—'}</span>
      <QualityBadges name={name} />
      <div className="flex items-center gap-1.5 text-xs font-medium text-lum-green-2">
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

  if (channels.length === 0) {
    return (
      <div
        ref={ref}
        className="flex min-h-[160px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-foreground-muted"
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
        role="list"
        data-testid="channel-list"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        <div
          className="grid grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,5.5rem)_minmax(0,4rem)_auto] gap-3 border-b border-border bg-surface-raised/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted"
          aria-hidden
        >
          <span>#</span>
          <span>Channel</span>
          <span>Category</span>
          <span className="text-right">Quality</span>
          <span>Status</span>
          <span className="text-right">Favorite</span>
        </div>
        <div className="max-h-[min(52vh,560px)] overflow-y-auto" role="presentation">
          {channels.map((channel, index) => {
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
    </FocusContext.Provider>
  );
}
