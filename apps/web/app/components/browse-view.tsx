import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Channel } from 'core';
import { Player, PlayerControls, PlayerErrorOverlay, type ShakaError } from 'player';
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
import { useSettingsStore } from '../store/settings-store';

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
  emptyHint,
}: {
  kind: ChannelKind;
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

  // Reset the selected channel when the kind or active group changes so the
  // selection panel never shows a stale pick from another section.
  useEffect(() => {
    setSelectedChannel(null);
  }, [kind, activeGroupId]);

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

  const items: ChannelListItem[] = visibleChannels.map((channel) => ({
    id: channel.id,
    focusKey: `CHANNEL_${channel.id}`,
    name: channel.name,
    groupTitle: channel.groupTitle,
    logoUrl: 'logoUrl' in channel ? channel.logoUrl : undefined,
  }));

  // Live gets the split layout: groups | channels | inline player.
  // Other kinds keep the 2-column layout + a detail panel below; their
  // playback flows through the fullscreen /play route (Step 3).
  const isLive = kind === 'live';
  const gridClassName = isLive
    ? 'grid gap-4 md:grid-cols-[220px_minmax(280px,1fr)_minmax(360px,1.4fr)]'
    : 'grid gap-4 md:grid-cols-[220px_1fr]';

  return (
    <Stack gap={4} data-testid={`browse-view-${kind}`}>
      <div className={gridClassName}>
        <GroupsSidebar
          groups={groups}
          activeGroupId={activeGroupId}
          onSelect={(id) => setActiveGroup(kind, id)}
        />
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
        {isLive ? <LivePlayerPane channel={selectedChannel} /> : null}
      </div>
      {!isLive && selectedChannel ? (
        <SelectedChannelPanel channel={selectedChannel} />
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

function GroupsSidebar({
  groups,
  activeGroupId,
  onSelect,
}: {
  groups: CatalogState['groupsByKind'][ChannelKind];
  activeGroupId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      role="navigation"
      aria-label="Channel groups"
      data-testid="groups-sidebar"
      className="flex flex-col gap-1"
    >
      {groups.map((group) => {
        const isActive = group.id === activeGroupId;
        return (
          <FocusableItem
            key={group.id}
            focusKey={`GROUP_${group.id}`}
            onEnterPress={() => onSelect(group.id)}
            className={isActive ? 'bg-surface-raised' : ''}
          >
            <button
              type="button"
              onClick={() => onSelect(group.id)}
              aria-pressed={isActive}
              data-active={isActive ? 'true' : 'false'}
              className={[
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                isActive
                  ? 'font-medium text-foreground'
                  : 'text-foreground-muted hover:text-foreground',
              ].join(' ')}
            >
              <span className="truncate">{group.name}</span>
              <span className="shrink-0 text-xs text-foreground-muted">
                {group.channels.length}
              </span>
            </button>
          </FocusableItem>
        );
      })}
    </nav>
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

function SelectedChannelPanel({ channel }: { channel: Channel }) {
  const navigate = useNavigate();
  const sourceId = useCatalogStore((s) => s.sourceId);
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
        <Button
          variant="primary"
          size="sm"
          focusKey={`PLAY_${channel.id}`}
          disabled={!canPlay}
          onClick={() => {
            if (!canPlay || !sourceId) return;
            void navigate(
              `/play/${encodeURIComponent(sourceId)}/${channel.type}/${encodeURIComponent(channel.id)}`
            );
          }}
        >
          Play
        </Button>
      </div>
    </aside>
  );
}

/**
 * Inline player pane used by `/browse/live`. Renders a 16:9 frame even when
 * nothing is selected so the layout doesn't jump on first selection. The
 * `<video>` element re-binds whenever `channel.streamUrl` changes — Shaka
 * tears down the previous instance, so D-pad up/down on the channel list
 * channel-surfs without needing a route change.
 */
function LivePlayerPane({ channel }: { channel: Channel | null }) {
  const navigate = useNavigate();
  const sourceId = useCatalogStore((s) => s.sourceId);
  const streamProxy = useSettingsStore((s) => s.streamProxy);
  const streamUrl =
    channel && 'streamUrl' in channel ? channel.streamUrl : null;
  const [error, setError] = useState<ShakaError | null>(null);

  useEffect(() => {
    setError(null);
  }, [streamUrl]);

  return (
    <aside
      aria-label="Live player"
      data-testid="live-player"
      className="flex flex-col gap-2"
    >
      <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-black">
        <Player
          src={streamUrl}
          onError={setError}
          streamProxy={streamProxy}
          className="h-full w-full"
        >
          {(api) => (
            <>
              {streamUrl ? <PlayerControls api={api} /> : null}
              {error ? (
                <PlayerErrorOverlay
                  error={error}
                  compact
                  onRetry={() => api.retry()}
                  onDismiss={() => setError(null)}
                />
              ) : null}
            </>
          )}
        </Player>
        {!streamUrl ? (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs text-foreground-muted"
            data-testid="live-player-idle"
          >
            Pick a channel to start watching
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {channel?.name ?? 'No channel'}
          </div>
          <div className="truncate text-xs text-foreground-muted">
            {channel?.groupTitle ?? '\u00a0'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          focusKey="LIVE_PLAYER_FULLSCREEN"
          disabled={!channel || !sourceId}
          onClick={() => {
            if (!channel || !sourceId) return;
            void navigate(
              `/play/${encodeURIComponent(sourceId)}/live/${encodeURIComponent(channel.id)}`
            );
          }}
        >
          Fullscreen
        </Button>
      </div>
    </aside>
  );
}
