import { useCallback, useEffect, useMemo, useRef, useState } from 'react';import { useNavigate } from 'react-router';
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
import { Film, GripVertical, Heart, Tv } from 'lucide-react';
import type {
  Channel,
  SeriesChannel,
  SeriesEpisode,
  Source,
  VodChannel,
} from 'core';
import {
  Button,
  ChannelList,
  FocusableItem,
  SeriesBrowseHero,
  SeriesPosterGrid,
  Stack,
  TextField,
  VodBrowseHero,
  VodPosterGrid,
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
import { parseRecentKey } from '../lib/epg-display';
import { streamProxyForPlayback } from '../lib/playback-stream-proxy';
import { sortVodChannels, type VodSortDir, type VodSortKey } from '../lib/vod-sort';
import { ChannelFavoriteButton } from './favorite-channel-button';
import { useVodXtreamDetail } from '../hooks/use-vod-xtream-detail';
import { useSeriesXtreamDetail } from '../hooks/use-series-xtream-detail';
import { LiveBrowseHero } from './live-browse-hero';
import { LiveChannelTable } from './live-channel-table';

const EMPTY_GROUP_ORDER: string[] = [];

/** Virtual sidebar id for the live “Favorites” bucket (not a catalog group). */
const LIVE_FAVORITES_SIDEBAR_ID = '__live_favorites__';
const VOD_FAVORITES_SIDEBAR_ID = '__vod_favorites__';
const SERIES_FAVORITES_SIDEBAR_ID = '__series_favorites__';

type CatalogGroup = CatalogState['groupsByKind'][ChannelKind][number];

/** Most recent live channel for this source that still exists in the catalog (any group). */
function findRecentLiveChannelInCatalog(
  recents: readonly string[],
  sourceId: string,
  groups: CatalogGroup[]
): { channel: Channel; groupId: string } | null {
  for (const key of recents) {
    const p = parseRecentKey(key);
    if (!p || p.sourceId !== sourceId || p.kind !== 'live') continue;
    for (const g of groups) {
      const ch = g.channels.find((c) => c.id === p.channelId && c.type === 'live');
      if (ch) return { channel: ch, groupId: g.id };
    }
  }
  return null;
}

/** Find which group contains the given channel (by reference equality). */
function findGroupForChannel(
  channel: Channel,
  groups: CatalogGroup[]
): string | null {
  for (const g of groups) {
    if (g.channels.some((c) => c.id === channel.id)) {
      return g.id;
    }
  }
  return null;
}

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
  /** Optional pinned “Favorites” row above catalog groups. */
  favoritesPin?: {
    count: number;
    isActive: boolean;
    onSelect: () => void;
  };
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
  preferredChannelId,
  emptyHint,
}: {
  kind: ChannelKind;
  activeSource: Source;
  /** Optional channel id to preselect (used by /play -> Back for VOD). */
  preferredChannelId?: string | null;
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

  const favorites = useProfileStore((s) => s.profile.favorites);
  const [liveFavoritesRail, setLiveFavoritesRail] = useState(false);
  const [vodFavoritesRail, setVodFavoritesRail] = useState(false);
  const [seriesFavoritesRail, setSeriesFavoritesRail] = useState(false);

  useEffect(() => {
    setLiveFavoritesRail(false);
    setVodFavoritesRail(false);
    setSeriesFavoritesRail(false);
  }, [kind, activeSource.id]);

  const sourceId = useCatalogStore((s) => s.sourceId);

  const favoriteLiveChannels = useMemo(() => {
    if (kind !== 'live' || !sourceId) return [];
    const byId = new Map<string, Channel>();
    for (const g of groups) {
      for (const c of g.channels) {
        if (c.type === 'live') byId.set(c.id, c);
      }
    }
    const ordered: Channel[] = [];
    const seen = new Set<string>();
    for (const key of favorites) {
      if (!key.startsWith(`${sourceId}::`)) continue;
      const channelId = key.slice(sourceId.length + 2);
      if (!channelId || seen.has(channelId)) continue;
      const ch = byId.get(channelId);
      if (ch) {
        ordered.push(ch);
        seen.add(channelId);
      }
    }
    return ordered;
  }, [kind, sourceId, groups, favorites]);

  const favoriteVodChannels = useMemo(() => {
    if (kind !== 'vod' || !sourceId) return [];
    const byId = new Map<string, VodChannel>();
    for (const g of groups) {
      for (const c of g.channels) {
        if (c.type === 'vod') byId.set(c.id, c);
      }
    }
    const ordered: VodChannel[] = [];
    const seen = new Set<string>();
    for (const key of favorites) {
      if (!key.startsWith(`${sourceId}::`)) continue;
      const channelId = key.slice(sourceId.length + 2);
      if (!channelId || seen.has(channelId)) continue;
      const ch = byId.get(channelId);
      if (ch) {
        ordered.push(ch);
        seen.add(channelId);
      }
    }
    return ordered;
  }, [kind, sourceId, groups, favorites]);

  const favoriteSeriesChannels = useMemo(() => {
    if (kind !== 'series' || !sourceId) return [] as SeriesChannel[];
    const byId = new Map<string, SeriesChannel>();
    for (const g of groups) {
      for (const c of g.channels) {
        if (c.type === 'series') byId.set(c.id, c);
      }
    }
    const ordered: SeriesChannel[] = [];
    const seen = new Set<string>();
    for (const key of favorites) {
      if (!key.startsWith(`${sourceId}::`)) continue;
      const channelId = key.slice(sourceId.length + 2);
      if (!channelId || seen.has(channelId)) continue;
      const ch = byId.get(channelId);
      if (ch) {
        ordered.push(ch);
        seen.add(channelId);
      }
    }
    return ordered;
  }, [kind, sourceId, groups, favorites]);

  const [vodSortKey, setVodSortKey] = useState<VodSortKey>('default');
  const [vodSortDir, setVodSortDir] = useState<VodSortDir>('asc');

  const onGroupSelect = useCallback(
    (id: string) => {
      if (kind === 'live' && id === LIVE_FAVORITES_SIDEBAR_ID) {
        setLiveFavoritesRail(true);
        setVodFavoritesRail(false);
        setSeriesFavoritesRail(false);
        return;
      }
      if (kind === 'vod' && id === VOD_FAVORITES_SIDEBAR_ID) {
        setVodFavoritesRail(true);
        setLiveFavoritesRail(false);
        setSeriesFavoritesRail(false);
        return;
      }
      if (kind === 'series' && id === SERIES_FAVORITES_SIDEBAR_ID) {
        setSeriesFavoritesRail(true);
        setLiveFavoritesRail(false);
        setVodFavoritesRail(false);
        return;
      }
      setLiveFavoritesRail(false);
      setVodFavoritesRail(false);
      setSeriesFavoritesRail(false);
      if (kind === 'vod') {
        setVodSortKey('default');
        setVodSortDir('asc');
      }
      setActiveGroup(kind, id);
    },
    [kind, setActiveGroup]
  );

  // Derive visible channels here (rather than via a Zustand selector) so we
  // don't return a fresh array reference from the store on every render —
  // Zustand v5 uses Object.is by default and would re-render forever.
  const activeGroup = useMemo((): CatalogGroup | null => {
    if (kind === 'live' && liveFavoritesRail) {
      return {
        id: LIVE_FAVORITES_SIDEBAR_ID,
        name: 'Favorites',
        kind: 'live',
        channels: favoriteLiveChannels,
      };
    }
    if (kind === 'vod' && vodFavoritesRail) {
      return {
        id: VOD_FAVORITES_SIDEBAR_ID,
        name: 'Favorites',
        kind: 'vod',
        channels: favoriteVodChannels,
      };
    }
    if (kind === 'series' && seriesFavoritesRail) {
      return {
        id: SERIES_FAVORITES_SIDEBAR_ID,
        name: 'Favorites',
        kind: 'series',
        channels: favoriteSeriesChannels,
      };
    }
    return groups.find((g) => g.id === activeGroupId) ?? null;
  }, [
    kind,
    liveFavoritesRail,
    vodFavoritesRail,
    seriesFavoritesRail,
    groups,
    activeGroupId,
    favoriteLiveChannels,
    favoriteVodChannels,
    favoriteSeriesChannels,
  ]);
  const visibleChannels: Channel[] = useMemo(() => {
    if (!activeGroup) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeGroup.channels;
    return activeGroup.channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [activeGroup, searchQuery]);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(() => {
    // On mount, if a preferred channel id was passed (e.g. coming back from /play),
    // initialise the selection synchronously from the already-populated store so
    // there is no first-render flash of "Select a movie from the grid".
    // The restore useEffect below still runs to switch the active group if needed.
    if (preferredChannelId && (kind === 'vod' || kind === 'series')) {
      for (const g of groups) {
        const ch = g.channels.find(
          (c) =>
            (kind === 'vod' ? c.type === 'vod' : c.type === 'series') &&
            c.id === preferredChannelId
        );
        if (ch) return ch;
      }
    }
    return null;
  });
  const preferredAppliedRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const addRecentIfMissing = useProfileStore((s) => s.addRecentIfMissing);
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

  useEffect(() => {
    if (!preferredChannelId) setSelectedChannel(null);
    setVodSortKey('default');
    setVodSortDir('asc');
  }, [kind, activeSource.id]);

  useEffect(() => {
    if (kind !== 'vod') return;
    if (!preferredChannelId) return;
    const applyKey = `${activeSource.id}:${preferredChannelId}`;
    if (preferredAppliedRef.current === applyKey) return;
    const targetGroup = groups.find((g) =>
      g.channels.some((c) => c.type === 'vod' && c.id === preferredChannelId)
    );
    if (!targetGroup) return;
    const target = targetGroup.channels.find(
      (c): c is VodChannel => c.type === 'vod' && c.id === preferredChannelId
    );
    if (!target) return;
    if (vodFavoritesRail) setVodFavoritesRail(false);
    if (activeGroupId !== targetGroup.id) {
      setActiveGroup(kind, targetGroup.id);
    }
    setSelectedChannel(target);
    preferredAppliedRef.current = applyKey;
  }, [
    kind,
    preferredChannelId,
    activeSource.id,
    groups,
    activeGroupId,
    vodFavoritesRail,
    setActiveGroup,
  ]);

  // Series: restore preferred selection when coming back from /play.
  useEffect(() => {
    if (kind !== 'series') return;
    if (!preferredChannelId) return;
    const applyKey = `${activeSource.id}:${preferredChannelId}`;
    if (preferredAppliedRef.current === applyKey) return;
    const targetGroup = groups.find((g) =>
      g.channels.some((c) => c.type === 'series' && c.id === preferredChannelId)
    );
    if (!targetGroup) return;
    const target = targetGroup.channels.find(
      (c): c is SeriesChannel => c.type === 'series' && c.id === preferredChannelId
    );
    if (!target) return;
    if (seriesFavoritesRail) setSeriesFavoritesRail(false);
    if (activeGroupId !== targetGroup.id) {
      setActiveGroup(kind, targetGroup.id);
    }
    setSelectedChannel(target);
    preferredAppliedRef.current = applyKey;
  }, [
    kind,
    preferredChannelId,
    activeSource.id,
    groups,
    activeGroupId,
    seriesFavoritesRail,
    setActiveGroup,
  ]);

  // Live: auto-select for inline preview — keep the current channel when it still
  // matches the active category + search; otherwise pick the first visible row.
  // On first load (no selection yet), prefer the latest live channel from profile
  // recents so refresh restores Continue watching instead of always using the
  // first row of the default group.
  useEffect(() => {
    if (kind !== 'live') return;
    if (!activeGroup || activeGroup.channels.length === 0) {
      setSelectedChannel(null);
      return;
    }
    if (selectedChannel && visibleChannels.some((c) => c.id === selectedChannel.id)) {
      return;
    }
    if (!selectedChannel && sourceId && !liveFavoritesRail) {
      const fromRecent = findRecentLiveChannelInCatalog(recents, sourceId, groups);
      if (fromRecent) {
        if (fromRecent.groupId !== activeGroupId) {
          setLiveFavoritesRail(false);
          setActiveGroup(kind, fromRecent.groupId);
        }
        setSelectedChannel(fromRecent.channel);
        return;
      }
    }
    setSelectedChannel(visibleChannels[0] ?? activeGroup.channels[0] ?? null);
  }, [
    kind,
    activeGroupId,
    activeGroup,
    liveFavoritesRail,
    visibleChannels,
    selectedChannel,
    sourceId,
    recents,
    groups,
    setActiveGroup,
  ]);

  const vodRows = useMemo(
    () => visibleChannels.filter((c): c is VodChannel => c.type === 'vod'),
    [visibleChannels]
  );

  // Note: we deliberately do NOT call get_vod_info per row to enrich the
  // grid. The Xtream `get_vod_streams` listing already returns the fields
  // the poster card and sort/filter controls need (rating_5based, year,
  // duration_secs, genre, stream_icon). Per-movie info is reserved for the
  // detail hero (plot/cast/director/backdrop) — see useVodXtreamDetail.
  // Fanning out 72 calls on every category change is what got us rate-
  // limited (HTTP 461) by Xtream panels.

  const sortedVodRows = useMemo(
    () => sortVodChannels(vodRows, vodSortKey, vodSortDir),
    [vodRows, vodSortKey, vodSortDir]
  );

  useEffect(() => {
    if (kind !== 'vod') return;
    if (!selectedChannel || selectedChannel.type !== 'vod') return;
    const next = sortedVodRows.find((c) => c.id === selectedChannel.id);
    if (!next) return;
    const b = selectedChannel;
    if (
      b.rating === next.rating &&
      b.year === next.year &&
      b.durationSeconds === next.durationSeconds &&
      (b.plot ?? '') === (next.plot ?? '') &&
      (b.genre ?? '') === (next.genre ?? '') &&
      (b.posterUrl ?? '') === (next.posterUrl ?? '') &&
      (b.backdropUrl ?? '') === (next.backdropUrl ?? '')
    ) {
      return;
    }
    setSelectedChannel(next);
  }, [kind, sortedVodRows, selectedChannel]);

  useEffect(() => {
    if (kind !== 'vod') return;
    if (!activeGroup || sortedVodRows.length === 0) {
      if (!preferredChannelId) setSelectedChannel(null);
      return;
    }
    if (selectedChannel?.type === 'vod' && sortedVodRows.some((c) => c.id === selectedChannel.id)) {
      return;
    }
    if (preferredChannelId) return;
    setSelectedChannel(sortedVodRows[0] ?? null);
  }, [kind, activeGroup, sortedVodRows, selectedChannel, preferredChannelId]);

  useEffect(() => {
    if (kind !== 'series') return;
    if (!activeGroup || visibleChannels.length === 0) {
      if (!preferredChannelId) setSelectedChannel(null);
      return;
    }
    if (
      selectedChannel?.type === 'series' &&
      visibleChannels.some((c) => c.id === selectedChannel.id)
    ) {
      return;
    }
    const firstSeries = visibleChannels.find((c): c is SeriesChannel => c.type === 'series') ?? null;
    // When a preferred channel is set (coming back from /play), skip auto-selecting
    // the first item entirely. The restore effect above is solely responsible for
    // setting the correct selection.
    if (preferredChannelId) return;
    setSelectedChannel(firstSeries);
  }, [kind, activeGroup, visibleChannels, selectedChannel, preferredChannelId]);

  const baseVodForDetail =
    kind === 'vod' && selectedChannel?.type === 'vod' ? selectedChannel : null;
  const { channel: vodDisplayChannel, detailLoading: vodDetailLoading } = useVodXtreamDetail(
    baseVodForDetail,
    activeSource
  );

  const baseSeriesForDetail =
    kind === 'series' && selectedChannel?.type === 'series' ? selectedChannel : null;
  const { channel: seriesDisplayChannel, detailLoading: seriesDetailLoading } =
    useSeriesXtreamDetail(baseSeriesForDetail, activeSource);

  const playVod = useCallback(
    (ch: VodChannel) => {
      if (!sourceId) return;
      void navigate(
        `/play/${encodeURIComponent(sourceId)}/vod/${encodeURIComponent(ch.id)}`
      );
    },
    [navigate, sourceId]
  );

  const playSeriesEpisode = useCallback(
    (ep: SeriesEpisode) => {
      if (!sourceId) return;
      void navigate(
        `/play/${encodeURIComponent(sourceId)}/series/${encodeURIComponent(ep.id)}`
      );
    },
    [navigate, sourceId]
  );

  // Watched tracking: episode ids seen in recents for the current source.
  const watchedEpisodeIds = useMemo(() => {
    if (kind !== 'series' || !sourceId) return new Set<string>();
    const out = new Set<string>();
    for (const key of recents) {
      const p = parseRecentKey(key);
      if (!p || p.sourceId !== sourceId || p.kind !== 'series') continue;
      out.add(p.channelId);
    }
    return out;
  }, [kind, sourceId, recents]);

  // Derive which series have ≥1 watched episode for the poster grid indicator.
  const watchedSeriesIds = useMemo(() => {
    if (kind !== 'series') return new Set<string>();
    const out = new Set<string>();
    for (const g of groups) {
      for (const ch of g.channels) {
        if (ch.type !== 'series') continue;
        for (const season of ch.seasons) {
          if (season.episodes.some((ep) => watchedEpisodeIds.has(ep.id))) {
            out.add(ch.id);
            break;
          }
        }
      }
    }
    return out;
  }, [kind, groups, watchedEpisodeIds]);

  // NOTE: We deliberately do NOT auto-push the currently selected live channel
  // to Continue watching. Auto-preview selections (catalog load, group switch
  // fallback to first row) would otherwise pollute the list with channels the
  // user never picked. Recents are added explicitly from the click handlers
  // below via `addRecentIfMissing`, which also preserves order on re-selection.

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

  const seriesListItems: ChannelListItem[] =
    kind !== 'series'
      ? []
      : visibleChannels.map((channel) => ({
          id: channel.id,
          focusKey: `CHANNEL_${channel.id}`,
          name: channel.name,
          groupTitle: channel.groupTitle,
          logoUrl: 'logoUrl' in channel ? channel.logoUrl : undefined,
          trailing:
            sourceId !== null ? (
              <ChannelFavoriteButton
                sourceId={sourceId}
                channelId={channel.id}
                focusKey={`FAV_LIST_${channel.id}`}
              />
            ) : undefined,
        }));

  const isLive = kind === 'live';
  const isVod = kind === 'vod';

  const sidebarProps: GroupsSidebarProps = {
    groups: groupReorderMode ? orderedGroups : visibleGroups,
    reorderMode: groupReorderMode,
    onToggleReorderMode: setGroupReorderMode,
    onCommitGroupOrder: (orderedIds) =>
      setCatalogGroupOrder(activeSource.id, kind, orderedIds),
    activeGroupId,
    searchValue: groupSearch,
    onSearchChange: setGroupSearch,
    onSelect: onGroupSelect,
    favoritesPin:
      kind === 'live'
        ? {
            count: favoriteLiveChannels.length,
            isActive: liveFavoritesRail,
            onSelect: () => onGroupSelect(LIVE_FAVORITES_SIDEBAR_ID),
          }
        : kind === 'vod'
          ? {
              count: favoriteVodChannels.length,
              isActive: vodFavoritesRail,
              onSelect: () => onGroupSelect(VOD_FAVORITES_SIDEBAR_ID),
            }
        : kind === 'series'
          ? {
              count: favoriteSeriesChannels.length,
              isActive: seriesFavoritesRail,
              onSelect: () => onGroupSelect(SERIES_FAVORITES_SIDEBAR_ID),
            }
        : undefined,
  };

  if (isLive) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row md:items-stretch md:overflow-hidden"
        data-testid="browse-view-live"
      >
        <LiveCatalogRail {...sidebarProps} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden py-3 md:gap-3">
          <div className="shrink-0">
            <LiveBrowseHero
              channel={selectedChannel}
              playbackProxy={playbackProxy}
              streamProxyConfigured={streamProxyConfigured}
              recentChannels={recentChannels}
              onSelectRecent={(next) => {
                // Re-selecting from Continue watching never reorders the list.
                // If the channel belongs to a different group than the active one,
                // switch the sidebar to that group so the inline player streams
                // the correct channel instead of falling back to the current
                // group's first channel.
                const targetGroupId = findGroupForChannel(next, groups);
                if (targetGroupId && targetGroupId !== activeGroupId) {
                  setLiveFavoritesRail(false);
                  setActiveGroup(kind, targetGroupId);
                }
                setSelectedChannel(next);
              }}
              guide={null}
              guideReady={false}
              nowMs={0}
            />
          </div>

          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground-muted lg:w-60">
              Category
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:shadow-focus focus:ring-2 focus:ring-accent/30"
                value={liveFavoritesRail ? LIVE_FAVORITES_SIDEBAR_ID : (activeGroupId ?? '')}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === LIVE_FAVORITES_SIDEBAR_ID) {
                    onGroupSelect(LIVE_FAVORITES_SIDEBAR_ID);
                  } else {
                    onGroupSelect(v);
                  }
                }}
                aria-label="Jump to category"
              >
                <option value={LIVE_FAVORITES_SIDEBAR_ID}>
                  Favorites ({favoriteLiveChannels.length})
                </option>
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <LiveChannelTable
              channels={visibleChannels}
              selectedId={selectedChannel?.id ?? null}
              onSelect={(id) => {
                const channel = visibleChannels.find((c) => c.id === id) ?? null;
                setSelectedChannel(channel);
                // Explicit user click: if this channel is new to Continue
                // watching it goes to the top; existing entries keep their
                // position so the list does not shuffle on every re-pick.
                if (channel && sourceId && 'streamUrl' in channel) {
                  addRecentIfMissing(recentKey(sourceId, kind, channel.id));
                }
              }}
              sourceId={sourceId}
              guide={null}
              guideReady={false}
              nowMs={0}
              empty={
                searchQuery.trim()
                  ? 'No channels match your search.'
                  : liveFavoritesRail
                    ? 'No favorites yet. Use the heart on a channel to add it here.'
                    : 'This group is empty.'
              }
            />
          </div>
        </div>
      </div>
    );
  }

  if (isVod) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row md:items-stretch md:overflow-hidden"
        data-testid="browse-view-vod"
      >
        <VodCatalogRail {...sidebarProps} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden py-3 md:gap-4">
          <div className="shrink-0">
            <VodBrowseHero
              channel={vodDisplayChannel}
              detailLoading={vodDetailLoading}
              canPlay={Boolean(vodDisplayChannel?.streamUrl && sourceId)}
              onPlay={() => {
                if (vodDisplayChannel) playVod(vodDisplayChannel);
              }}
              onWatchTrailer={(url) => {
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              trailingActions={
                sourceId && vodDisplayChannel ? (
                  <ChannelFavoriteButton
                    sourceId={sourceId}
                    channelId={vodDisplayChannel.id}
                    focusKey={`VOD_HERO_FAV_${vodDisplayChannel.id}`}
                  />
                ) : null
              }
            />
          </div>

          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground-muted lg:w-72">
              Category
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:shadow-focus focus:ring-2 focus:ring-accent/30"
                value={vodFavoritesRail ? VOD_FAVORITES_SIDEBAR_ID : (activeGroupId ?? '')}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === VOD_FAVORITES_SIDEBAR_ID) {
                    onGroupSelect(VOD_FAVORITES_SIDEBAR_ID);
                  } else {
                    onGroupSelect(v);
                  }
                }}
                aria-label="Jump to category"
              >
                <option value={VOD_FAVORITES_SIDEBAR_ID}>
                  Favorites ({favoriteVodChannels.length})
                </option>
                {orderedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.channels.length})
                  </option>
                ))}
              </select>
            </label>
            <TextField
              className="min-w-0 flex-1 lg:min-w-[200px]"
              focusKey={`BROWSE_SEARCH_${kind.toUpperCase()}`}
              aria-label="Search movies"
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search movies…"
            />
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground-muted lg:w-52">
              Sort by
              <select
                data-testid="vod-sort-key"
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:shadow-focus focus:ring-2 focus:ring-accent/30"
                value={vodSortKey}
                onChange={(event) => setVodSortKey(event.target.value as VodSortKey)}
                aria-label="Sort movies by"
              >
                <option value="default">Catalog order</option>
                <option value="name">Title</option>
                <option value="year">Year</option>
                <option value="rating">Rating</option>
                <option value="duration">Duration</option>
                <option value="director">Director</option>
                <option value="added">Date added</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground-muted lg:w-44">
              Order
              <select
                data-testid="vod-sort-dir"
                disabled={vodSortKey === 'default'}
                title={vodSortKey === 'default' ? 'Pick a sort field first' : undefined}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:shadow-focus focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
                value={vodSortDir}
                onChange={(event) => setVodSortDir(event.target.value as VodSortDir)}
                aria-label="Sort direction"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>

          <div className="scrollbar-slim min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
            <VodPosterGrid
              channels={sortedVodRows}
              selectedId={selectedChannel?.id ?? null}
              onHighlight={(id) => {
                const ch = sortedVodRows.find((c) => c.id === id) ?? null;
                setSelectedChannel(ch);
              }}
              onSelect={(id) => {
                const ch = sortedVodRows.find((c) => c.id === id) ?? null;
                setSelectedChannel(ch);
              }}
              empty={
                searchQuery.trim()
                  ? 'No movies match your search.'
                  : vodFavoritesRail
                    ? 'No favorites yet. Use the heart on a movie to add it here.'
                    : 'This category is empty.'
              }
            />
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'series') {
    const selectedSeries = selectedChannel?.type === 'series' ? selectedChannel : null;
    const seriesRows = visibleChannels.filter((c): c is SeriesChannel => c.type === 'series');

    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row md:items-stretch md:overflow-hidden"
        data-testid="browse-view-series"
      >
        <SeriesCatalogRail {...sidebarProps} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden py-3 md:gap-4">
          {/* Hero */}
          <div className="shrink-0">
            <SeriesBrowseHero
              channel={seriesDisplayChannel}
              detailLoading={seriesDetailLoading}
              watchedEpisodeIds={watchedEpisodeIds}
              onPlayEpisode={playSeriesEpisode}
              trailingActions={
                sourceId && seriesDisplayChannel ? (
                  <ChannelFavoriteButton
                    sourceId={sourceId}
                    channelId={seriesDisplayChannel.id}
                    focusKey={`SERIES_HERO_FAV_${seriesDisplayChannel.id}`}
                  />
                ) : null
              }
            />
          </div>

          {/* Toolbar */}
          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground-muted lg:w-72">
              Category
              <select
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:shadow-focus focus:ring-2 focus:ring-accent/30"
                value={seriesFavoritesRail ? SERIES_FAVORITES_SIDEBAR_ID : (activeGroupId ?? '')}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === SERIES_FAVORITES_SIDEBAR_ID) {
                    onGroupSelect(SERIES_FAVORITES_SIDEBAR_ID);
                  } else {
                    onGroupSelect(v);
                  }
                }}
                aria-label="Jump to category"
              >
                <option value={SERIES_FAVORITES_SIDEBAR_ID}>
                  Favorites ({favoriteSeriesChannels.length})
                </option>
                {orderedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.channels.length})
                  </option>
                ))}
              </select>
            </label>
            <TextField
              className="min-w-0 flex-1 lg:min-w-[200px]"
              focusKey="BROWSE_SEARCH_SERIES"
              aria-label="Search series"
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search series…"
            />
          </div>

          {/* Poster grid */}
          <div className="scrollbar-slim min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
            <SeriesPosterGrid
              channels={seriesRows}
              selectedId={selectedSeries?.id ?? null}
              watchedSeriesIds={watchedSeriesIds}
              onHighlight={(id) => {
                const ch = seriesRows.find((c) => c.id === id) ?? null;
                setSelectedChannel(ch);
              }}
              onSelect={(id) => {
                const ch = seriesRows.find((c) => c.id === id) ?? null;
                setSelectedChannel(ch);
              }}
              empty={
                searchQuery.trim()
                  ? 'No series match your search.'
                  : seriesFavoritesRail
                    ? 'No favorites yet. Use the heart on a series to add it here.'
                    : 'This category is empty.'
              }
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Stack gap={4} data-testid="browse-view-generic">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <GroupsSidebar {...sidebarProps} />
        <Stack gap={3}>
          <TextField
            focusKey="BROWSE_SEARCH_GENERIC"
            aria-label="Search channels"
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name"
          />
          <ChannelList
            items={seriesListItems}
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
        selectedChannel.type === 'series' ? (
          <SeriesDetailPanel channel={selectedChannel} sourceId={sourceId} />
        ) : (
          <SelectedChannelPanel channel={selectedChannel} sourceId={sourceId} />
        )
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
  favoritesPin,
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
      {favoritesPin && !reorderMode ? (
        <FocusableItem
          focusKey="GROUP_LIVE_FAVORITES_PIN"
          onEnterPress={favoritesPin.onSelect}
          className={[
            favoritesPin.isActive ? 'bg-accent/20' : 'bg-transparent',
            "[&[data-focused='true']]:ring-2 [&[data-focused='true']]:ring-accent [&[data-focused='true']]:bg-accent/25",
          ].join(' ')}
        >
          <div
            role="button"
            tabIndex={0}
            data-testid="live-favorites-sidebar"
            onClick={favoritesPin.onSelect}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                favoritesPin.onSelect();
              }
            }}
            aria-pressed={favoritesPin.isActive}
            data-active={favoritesPin.isActive ? 'true' : 'false'}
            className={[
              'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm outline-none',
              favoritesPin.isActive
                ? 'border border-accent/50 bg-accent/20 font-semibold text-foreground'
                : 'border border-transparent text-foreground-muted hover:border-border hover:bg-surface-raised hover:text-foreground',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Heart className="size-4 shrink-0 text-danger" aria-hidden strokeWidth={2} />
              <span className="truncate">Favorites</span>
            </span>
            <span className="shrink-0 text-xs text-foreground-muted">{favoritesPin.count}</span>
          </div>
        </FocusableItem>
      ) : null}
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

function VodCatalogRail(props: GroupsSidebarProps) {
  return (
    <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-border bg-surface/95 md:max-h-none md:h-full md:min-h-0 md:w-72 md:border-r md:bg-surface/80 md:backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
          <Film className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Movies</h1>
      </div>
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-2">
        <GroupsSidebar
          {...props}
          className="rounded-none border-0 bg-transparent p-0 shadow-none ring-0"
        />
      </div>
    </aside>
  );
}

function LiveCatalogRail(props: GroupsSidebarProps) {
  return (
    <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-border bg-surface/95 md:max-h-none md:h-full md:min-h-0 md:w-72 md:border-r md:bg-surface/80 md:backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
          <Tv className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Live TV</h1>
      </div>
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-2">
        <GroupsSidebar
          {...props}
          className="rounded-none border-0 bg-transparent p-0 shadow-none ring-0"
        />
      </div>
    </aside>
  );
}

function SeriesCatalogRail(props: GroupsSidebarProps) {
  return (
    <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-border bg-surface/95 md:max-h-none md:h-full md:min-h-0 md:w-72 md:border-r md:bg-surface/80 md:backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
          <Tv className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Series</h1>
      </div>
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-2">
        <GroupsSidebar
          {...props}
          className="rounded-none border-0 bg-transparent p-0 shadow-none ring-0"
        />
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

function SeriesDetailPanel({
  channel,
  sourceId,
}: {
  channel: SeriesChannel;
  sourceId: string;
}) {
  const navigate = useNavigate();
  const recents = useProfileStore((s) => s.profile.recents);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const sortedSeasons = useMemo(
    () => [...channel.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber),
    [channel.seasons]
  );

  useEffect(() => {
    if (sortedSeasons.length === 0) {
      setSelectedSeason(null);
      return;
    }
    if (!selectedSeason || !sortedSeasons.some((s) => s.seasonNumber === selectedSeason)) {
      setSelectedSeason(sortedSeasons[0].seasonNumber);
    }
  }, [sortedSeasons, selectedSeason]);

  const activeSeason = useMemo(
    () => sortedSeasons.find((s) => s.seasonNumber === selectedSeason) ?? null,
    [sortedSeasons, selectedSeason]
  );

  const watchedEpisodeIds = useMemo(() => {
    const out = new Set<string>();
    for (const key of recents) {
      const p = parseRecentKey(key);
      if (!p || p.sourceId !== sourceId || p.kind !== 'series') continue;
      out.add(p.channelId);
    }
    return out;
  }, [recents, sourceId]);

  const playEpisode = (ep: SeriesEpisode) => {
    void navigate(
      `/play/${encodeURIComponent(sourceId)}/series/${encodeURIComponent(ep.id)}`
    );
  };

  return (
    <aside
      data-testid="series-detail-panel"
      className="rounded-md border border-border bg-surface-raised p-3 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">Selected: {channel.name}</div>
          {channel.plot ? (
            <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">{channel.plot}</p>
          ) : (
            <p className="mt-1 text-xs text-foreground-muted">
              Pick a season and episode to start playback.
            </p>
          )}
        </div>
        <ChannelFavoriteButton
          sourceId={sourceId}
          channelId={channel.id}
          focusKey={`FAV_PANEL_${channel.id}`}
        />
      </div>

      {sortedSeasons.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {sortedSeasons.map((season) => {
              const active = season.seasonNumber === selectedSeason;
              return (
                <Button
                  key={season.seasonNumber}
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  focusKey={`SERIES_SEASON_${channel.id}_${season.seasonNumber}`}
                  className={!active ? 'border border-border bg-background/65' : ''}
                  onClick={() => setSelectedSeason(season.seasonNumber)}
                >
                  {season.name?.trim() || `Season ${season.seasonNumber}`}
                </Button>
              );
            })}
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {(activeSeason?.episodes ?? []).map((ep) => {
              const watched = watchedEpisodeIds.has(ep.id);
              return (
                <div
                  key={ep.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      E{ep.episodeNumber} · {ep.title}
                    </p>
                    {watched ? (
                      <p className="text-[11px] text-accent">Watched</p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    focusKey={`SERIES_EP_PLAY_${ep.id}`}
                    className="border border-border bg-background/65"
                    onClick={() => playEpisode(ep)}
                  >
                    Play
                  </Button>
                </div>
              );
            })}
            {activeSeason && activeSeason.episodes.length === 0 ? (
              <p className="text-xs text-foreground-muted">No episodes in this season.</p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-foreground-muted">No seasons available for this series.</p>
      )}
    </aside>
  );
}
