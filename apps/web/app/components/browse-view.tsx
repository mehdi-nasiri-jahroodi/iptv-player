import { useEffect, useMemo, useState } from 'react';
import type { Channel } from 'core';
import {
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

  return (
    <Stack gap={4} data-testid={`browse-view-${kind}`}>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
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
      </div>
      {selectedChannel ? <SelectedChannelPanel channel={selectedChannel} /> : null}
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
  // Phase 2 placeholder until the player route lands. Surfacing the stream URL
  // here gives a clear "yes, my pick produced a playable URL" signal during
  // development without us shipping a half-built player.
  const streamUrl = 'streamUrl' in channel ? channel.streamUrl : null;
  return (
    <aside
      data-testid="selected-channel"
      className="rounded-md border border-border bg-surface-raised p-3 text-sm"
    >
      <div className="font-medium text-foreground">Selected: {channel.name}</div>
      {streamUrl ? (
        <div className="mt-1 break-all text-xs text-foreground-muted">
          {streamUrl}
        </div>
      ) : null}
      <div className="mt-1 text-xs text-foreground-muted">
        Player route lands in the next step.
      </div>
    </aside>
  );
}
