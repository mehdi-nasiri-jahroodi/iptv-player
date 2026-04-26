import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Tv } from 'lucide-react';
import type { Channel, Source } from 'core';
import {
  Button,
  ChannelList,
  FocusableItem,
  Stack,
  TextField,
  type ChannelListItem,
} from 'ui';
import {
  selectChannelCount,
  useCatalogStore,
  type CatalogState,
  type ChannelKind,
} from '../store/catalog-store';
import { hasStreamProxy, useSettingsStore } from '../store/settings-store';
import { catalogOrderKey, recentKey, useProfileStore } from '../store/profile-store';
import { useGuideStore } from '../store/guide-store';
import { useMinuteClock } from '../hooks/use-minute-clock';
import { formatNowNextLine, parseRecentKey } from '../lib/epg-display';
import { streamProxyForPlayback } from '../lib/playback-stream-proxy';
import { ChannelFavoriteButton } from './favorite-channel-button';
import { LiveBrowseHero } from './live-browse-hero';
import { LiveChannelTable } from './live-channel-table';
import { RefreshSourceButton } from './refresh-source-button';

const EMPTY_GROUP_ORDER: string[] = [];

type CatalogGroup = CatalogState['groupsByKind'][ChannelKind][number];

type GroupsSidebarProps = {
  groups: CatalogState['groupsByKind'][ChannelKind];
  reorderMode: boolean;
  onToggleReorderMode: (next: boolean) => void;
  onCommitGroupOrder: (orderedIds: string[]) => void;
  activeGroupId: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  className?: string;
};

/**
 * Per-kind browser shared by `/browse/live`, `/browse/vod`, `/browse/series`.
 *
 * Reads its slice of the catalog (`groupsByKind[kind]`, `activeGroupByKind[kind]`)
 * and renders a left sidebar of groups + a search field + a channel list. The
 * selected channel is held locally; lifting it into the store waits until the
 * player route lands and needs cross-route access to "currently playing".
 *
 * The component does NOT trigger `loadForSource` — the parent page is
 * responsible for ensuring the catalog is loaded for the active source. This
 * keeps the kind page decoupled from `SourcesStore`.
 */
export function BrowseView({
  kind,
  activeSource,
  emptyHint,
}: {
  kind: ChannelKind;
  activeSource: Source;
  /** Optional copy shown when this kind has zero groups in the active source. */
  emptyHint?: string;
}) {
  const status = useCatalogStore((s) => s.status);
  const error = useCatalogStore((s) => s.error);
  const groups = useCatalogStore((s) => s.groupsByKind[kind]);
  const activeGroupId = useCatalogStore((s) => s.activeGroupByKind[kind]);
  const setActiveGroup = useCatalogStore((s) => s.setActiveGroup);
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearch = useCatalogStore((s) => s.setSearch);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupReorderMode, setGroupReorderMode] = useState(false);
  const setCatalogGroupOrder = useProfileStore((s) => s.setCatalogGroupOrder);
  const orderKey = useMemo(() => catalogOrderKey(activeSource.id, kind), [activeSource.id, kind]);
  const groupOrder = useProfileStore((s) => s.catalogOrders[orderKey] ?? EMPTY_GROUP_ORDER);

  const orderedGroups = useMemo(() => {
    if (groupOrder.length === 0) return groups;
    const rank = new Map(groupOrder.map((id, index) => [id, index]));
    return [...groups].sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      if (ra === rb) return a.name.localeCompare(b.name);
      return ra - rb;
    });
  }, [groups, groupOrder]);

  const visibleGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return orderedGroups;
    return orderedGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [orderedGroups, groupSearch]);

  useEffect(() => {
    if (groupReorderMode) setGroupSearch('');
  }, [groupReorderMode]);

  // Derive visible channels here (rather than via a Zustand selector) so we
  // don't return a fresh array reference from the store on every render —
  // Zustand v5 uses Object.is by default and would re-render forever.
  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId]
  );
  const visibleChannels: Channel[] = useMemo(() => {
    if (!activeGroup) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeGroup.channels;
    return activeGroup.channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [activeGroup, searchQuery]);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const sourceId = useCatalogStore((s) => s.sourceId);
  const pushRecent = useProfileStore((s) => s.pushRecent);
  const guide = useGuideStore((s) => s.guide);
  const guideReady = useGuideStore((s) => s.status === 'ready');
  const clock = useMinuteClock();
  const navigate = useNavigate();
  const playlist = useCatalogStore((s) => s.playlist);
  const recents = useProfileStore((s) => s.profile.recents);
  const streamProxyConfig = useSettingsStore((s) => s.streamProxy);
  const streamProxyConfigured = useSettingsStore((s) => hasStreamProxy(s));
  const playbackProxy = useMemo(
    () => streamProxyForPlayback(streamProxyConfig, activeSource),
    [streamProxyConfig, activeSource]
  );
  const recentChannels = useMemo(() => {
    if (kind !== 'live' || !sourceId || !playlist) return [];
    const byId = new Map(
      playlist.groups.flatMap((group) => group.channels.map((c) => [c.id, c] as const))
    );
    const picked: Channel[] = [];
    for (const item of recents) {
      const parsed = parseRecentKey(item);
      if (!parsed || parsed.sourceId !== sourceId || parsed.kind !== 'live') continue;
      const found = byId.get(parsed.channelId);
      if (found && !picked.some((p) => p.id === found.id)) {
        picked.push(found);
      }
      if (picked.length >= 8) break;
    }
    return picked;
  }, [kind, sourceId, playlist, recents]);
  const totalLiveChannels = useCatalogStore((s) =>
    kind === 'live' ? selectChannelCount(s, 'live') : 0
  );

  // Reset the selected channel when the kind or active group changes so the
  // selection panel never shows a stale pick from another section.
  useEffect(() => {
    setSelectedChannel(null);
  }, [kind, activeGroupId]);

  useEffect(() => {
    if (!selectedChannel || !sourceId) return;
    if (!('streamUrl' in selectedChannel)) return;
    pushRecent(recentKey(sourceId, kind, selectedChannel.id));
  }, [selectedChannel, sourceId, kind, pushRecent]);

  if (status === 'loading') {
    return (
      <p className="text-sm text-foreground-muted" data-testid="catalog-loading">
        Loading catalog…
      </p>
    );
  }
  if (status === 'error') {
    return <CatalogError error={error} />;
  }
  if (groups.length === 0) {
    return (
      <p className="text-sm text-foreground-muted" data-testid="browse-empty">
        {emptyHint ?? `This source has no ${kind} content.`}
      </p>
    );
  }

  const items: ChannelListItem[] = visibleChannels.map((channel) => {
    const nowPlaying =
      kind === 'live' && guideReady && channel.type === 'live'
        ? formatNowNextLine(guide, channel.tvgId, clock.getTime())
        : undefined;
    return {
      id: channel.id,
      focusKey: `CHANNEL_${channel.id}`,
      name: channel.name,
      groupTitle: channel.groupTitle,
      logoUrl: 'logoUrl' in channel ? channel.logoUrl : undefined,
      nowPlaying: nowPlaying ?? undefined,
      trailing:
        sourceId !== null ? (
          <ChannelFavoriteButton
            sourceId={sourceId}
            channelId={channel.id}
            focusKey={`FAV_LIST_${channel.id}`}
          />
        ) : undefined,
    };
  });

  const isLive = kind === 'live';

  const goPlaySelectedLive = () => {
    if (!selectedChannel || !sourceId || !('streamUrl' in selectedChannel)) return;
    void navigate(
      `/play/${encodeURIComponent(sourceId)}/live/${encodeURIComponent(selectedChannel.id)}`
    );
  };

  const sidebarProps: GroupsSidebarProps = {
    groups: groupReorderMode ? orderedGroups : visibleGroups,
    reorderMode: groupReorderMode,
    onToggleReorderMode: setGroupReorderMode,
    onCommitGroupOrder: (orderedIds) =>
      setCatalogGroupOrder(activeSource.id, kind, orderedIds),
    activeGroupId,
    searchValue: groupSearch,
    onSearchChange: setGroupSearch,
    onSelect: (id) => setActiveGroup(kind, id),
  };

  if (isLive) {
    return (
      <div
        className="flex min-h-0 flex-col gap-0 md:flex-row md:items-stretch"
        data-testid="browse-view-live"
      >
        <LiveCatalogRail {...sidebarProps} />
        <div className="flex min-w-0 flex-1 flex-col gap-5 px-3 py-4 md:px-6">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Channel list
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {activeGroup?.name ?? 'Channels'}{' '}
                <span className="text-accent">({visibleChannels.length})</span>
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                {totalLiveChannels} channels in this source · EPG when configured
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RefreshSourceButton source={activeSource} focusKey="LIVE_TOOLBAR_REFRESH" />
              <Button
                variant="ghost"
                size="sm"
                focusKey="LIVE_TOOLBAR_SETTINGS"
                onClick={() => void navigate('/settings')}
              >
                Settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                focusKey="LIVE_TOOLBAR_HOME"
                onClick={() => void navigate('/')}
              >
                Back to home
              </Button>
            </div>
          </div>

          <LiveBrowseHero
            channel={selectedChannel}
            sourceId={sourceId}
            playbackProxy={playbackProxy}
            streamProxyConfigured={streamProxyConfigured}
            recentChannels={recentChannels}
            onSelectRecent={(next) => setSelectedChannel(next)}
            onNavigatePlay={goPlaySelectedLive}
            onNavigateFullscreen={goPlaySelectedLive}
            onNavigateGuide={() => void navigate('/epg')}
            guide={guide}
            guideReady={guideReady}
            nowMs={clock.getTime()}
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground-muted lg:w-60">
              Category
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:shadow-focus focus:ring-2 focus:ring-accent/30"
                value={activeGroupId ?? ''}
                onChange={(event) => setActiveGroup(kind, event.target.value)}
                aria-label="Jump to category"
              >
                {orderedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.channels.length})
                  </option>
                ))}
              </select>
            </label>
            <TextField
              className="min-w-0 flex-1"
              focusKey={`BROWSE_SEARCH_${kind.toUpperCase()}`}
              aria-label="Search channels"
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channels…"
            />
          </div>

          <LiveChannelTable
            channels={visibleChannels}
            selectedId={selectedChannel?.id ?? null}
            onSelect={(id) => {
              const channel = visibleChannels.find((c) => c.id === id) ?? null;
              setSelectedChannel(channel);
            }}
            sourceId={sourceId}
            guide={guide}
            guideReady={guideReady}
            nowMs={clock.getTime()}
            empty={
              searchQuery.trim()
                ? 'No channels match your search.'
                : 'This group is empty.'
            }
          />
        </div>
      </div>
    );
  }

  return (
    <Stack gap={4} data-testid={`browse-view-${kind}`}>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <GroupsSidebar {...sidebarProps} />
        <Stack gap={3}>
          <TextField
            focusKey={`BROWSE_SEARCH_${kind.toUpperCase()}`}
            aria-label={`Search ${kind} channels`}
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name"
          />
          <ChannelList
            items={items}
            selectedId={selectedChannel?.id ?? null}
            onSelect={(id) => {
              const channel = visibleChannels.find((c) => c.id === id) ?? null;
              setSelectedChannel(channel);
            }}
            empty={
              searchQuery
                ? 'No channels match your search.'
                : 'This group is empty.'
            }
          />
        </Stack>
      </div>
      {selectedChannel && sourceId ? (
        <SelectedChannelPanel channel={selectedChannel} sourceId={sourceId} />
      ) : null}
    </Stack>
  );
}

/** Read the channel count for `kind` from the catalog store. */
export function useChannelCountForKind(kind: ChannelKind): number {
  return useCatalogStore((s) => selectChannelCount(s, kind));
}

// ---------------------------------------------------------------------------
// Internal subviews — kept here (not exported) so they aren't reused without
// the surrounding `BrowseView` state machine.
// ---------------------------------------------------------------------------

function groupRowClassName(isDragging: boolean) {
  return [
    'flex items-center gap-2 rounded-md border px-2 py-2 text-sm',
    isDragging ? 'border-accent bg-accent/15 shadow-md' : 'border-border bg-surface-raised',
  ].join(' ');
}

function GroupReorderRowPreview({ group }: { group: CatalogGroup }) {
  return (
    <div className={groupRowClassName(true)}>
      <span className="flex shrink-0 cursor-grabbing rounded border border-border p-1 text-foreground-muted">
        <GripVertical aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground">
        {group.name}
      </span>
      <span className="shrink-0 text-xs text-foreground-muted">{group.channels.length}</span>
    </div>
  );
}

function SortableGroupRow({
  group,
  activeGroupId,
  onSelect,
}: {
  group: CatalogGroup;
  activeGroupId: string | null;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={groupRowClassName(isDragging)}>
      <button
        type="button"
        aria-label={`Drag to reorder ${group.name}`}
        className="flex shrink-0 cursor-grab touch-none rounded border border-border p-1 text-foreground-muted active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
        onClick={() => onSelect(group.id)}
        data-active={group.id === activeGroupId ? 'true' : 'false'}
      >
        {group.name}
      </button>
      <span className="shrink-0 text-xs text-foreground-muted">{group.channels.length}</span>
    </div>
  );
}

function GroupsSidebar({
  groups,
  reorderMode,
  onToggleReorderMode,
  onCommitGroupOrder,
  activeGroupId,
  searchValue,
  onSearchChange,
  onSelect,
  className = '',
}: GroupsSidebarProps) {
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const [sortableIds, setSortableIds] = useState<string[]>(groupIds);
  const orderRef = useRef(sortableIds);
  const dragSnapshotRef = useRef<string[] | null>(null);
  const [activeDragGroup, setActiveDragGroup] = useState<CatalogGroup | null>(null);

  useEffect(() => {
    setSortableIds(groupIds);
  }, [groupIds]);

  useEffect(() => {
    orderRef.current = sortableIds;
  }, [sortableIds]);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g] as const)), [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    dragSnapshotRef.current = [...orderRef.current];
    const id = String(event.active.id);
    const g = groupById.get(id);
    setActiveDragGroup(g ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSortableIds((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleDragEnd = (_event: DragEndEvent) => {
    setActiveDragGroup(null);
    dragSnapshotRef.current = null;
    onCommitGroupOrder(orderRef.current);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveDragGroup(null);
    const snap = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    if (snap) setSortableIds(snap);
  };

  const reorderList = (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      {sortableIds.map((id) => {
        const group = groupById.get(id);
        if (!group) return null;
        return (
          <SortableGroupRow
            key={id}
            group={group}
            activeGroupId={activeGroupId}
            onSelect={onSelect}
          />
        );
      })}
    </SortableContext>
  );

  return (
    <nav
      role="navigation"
      aria-label="Channel groups"
      data-testid="groups-sidebar"
      data-reordering={reorderMode ? 'true' : 'false'}
      className={[
        'flex flex-col gap-2 rounded-lg border border-border bg-surface p-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs font-medium text-foreground-muted">Groups</span>
        <Button
          type="button"
          variant={reorderMode ? 'primary' : 'ghost'}
          size="sm"
          focusKey="GROUP_REORDER_TOGGLE"
          data-testid="group-reorder-toggle"
          onClick={() => onToggleReorderMode(!reorderMode)}
        >
          {reorderMode ? 'Done' : 'Reorder'}
        </Button>
      </div>
      {reorderMode ? (
        <p className="px-0.5 text-xs text-foreground-muted">
          Drag the grip to reorder rows in one motion. Turn off Reorder when finished.
        </p>
      ) : null}
      <TextField
        focusKey="GROUP_SEARCH"
        aria-label="Search groups"
        value={searchValue}
        disabled={reorderMode}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Filter groups"
      />
      {groups.length === 0 ? (
        <p className="px-2 py-1 text-xs text-foreground-muted">No groups match your search.</p>
      ) : null}
      {reorderMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {reorderList}
          <DragOverlay dropAnimation={null}>
            {activeDragGroup ? <GroupReorderRowPreview group={activeDragGroup} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        groups.map((group) => {
          const isActive = group.id === activeGroupId;
          return (
            <FocusableItem
              key={group.id}
              focusKey={`GROUP_${group.id}`}
              onEnterPress={() => onSelect(group.id)}
              className={[
                isActive ? 'bg-accent/20' : 'bg-transparent',
                "[&[data-focused='true']]:ring-2 [&[data-focused='true']]:ring-accent [&[data-focused='true']]:bg-accent/25",
              ].join(' ')}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(group.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(group.id);
                  }
                }}
                aria-pressed={isActive}
                data-active={isActive ? 'true' : 'false'}
                className={[
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm outline-none',
                  isActive
                    ? 'border border-accent/50 bg-accent/20 font-semibold text-foreground'
                    : 'border border-transparent text-foreground-muted hover:border-border hover:bg-surface-raised hover:text-foreground',
                ].join(' ')}
              >
                <span className="truncate">{group.name}</span>
                <span className="shrink-0 text-xs text-foreground-muted">{group.channels.length}</span>
              </div>
            </FocusableItem>
          );
        })
      )}
    </nav>
  );
}

function LiveCatalogRail(props: GroupsSidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-border bg-surface/95 md:w-64 md:border-r md:bg-surface/80 md:backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
          <Tv className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Live TV</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <GroupsSidebar
          {...props}
          className="rounded-none border-0 bg-transparent p-0 shadow-none ring-0"
        />
      </div>
      <div className="border-t border-border p-3">
        <NavLink
          to="/epg"
          className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          Guide (EPG)
        </NavLink>
      </div>
    </aside>
  );
}

function CatalogError({ error }: { error: string | null }) {
  return (
    <div
      role="alert"
      data-testid="catalog-error"
      className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {error ?? 'Failed to load catalog.'}
    </div>
  );
}

function SelectedChannelPanel({
  channel,
  sourceId,
}: {
  channel: Channel;
  sourceId: string;
}) {
  const navigate = useNavigate();
  // VOD has a stream URL; series doesn't (we'd need an episode pick first).
  // For Phase 2 we only wire VOD playback; series Play stays disabled until
  // the seasons/episodes UI lands (Phase 4 per docs/web-app-plan.md).
  const streamUrl = 'streamUrl' in channel ? channel.streamUrl : null;
  const canPlay = Boolean(streamUrl && sourceId);
  return (
    <aside
      data-testid="selected-channel"
      className="rounded-md border border-border bg-surface-raised p-3 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            Selected: {channel.name}
          </div>
          {streamUrl ? (
            <div className="mt-1 break-all text-xs text-foreground-muted">
              {streamUrl}
            </div>
          ) : (
            <div className="mt-1 text-xs text-foreground-muted">
              Pick an episode to play (coming in Phase 4).
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ChannelFavoriteButton
            sourceId={sourceId}
            channelId={channel.id}
            focusKey={`FAV_PANEL_${channel.id}`}
          />
          <Button
            variant="primary"
            size="sm"
            focusKey={`PLAY_${channel.id}`}
            disabled={!canPlay}
            onClick={() => {
              if (!canPlay) return;
              void navigate(
                `/play/${encodeURIComponent(sourceId)}/${channel.type}/${encodeURIComponent(channel.id)}`
              );
            }}
          >
            Play
          </Button>
        </div>
      </div>
    </aside>
  );
}
