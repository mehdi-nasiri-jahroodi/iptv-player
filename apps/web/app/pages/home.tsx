import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Channel, Source } from 'core';
import {
  AppScreen,
  Button,
  ChannelList,
  FocusableItem,
  Stack,
  TextField,
  type ChannelListItem,
} from 'ui';
import { SourcesStore } from '../features/sources/sources-storage';
import {
  useCatalogStore,
  type CatalogState,
} from '../store/catalog-store';

type SourcesView =
  | { status: 'loading' }
  | { status: 'ready'; sources: Source[]; activeSource: Source | null };

/**
 * Home is the post-onboarding landing screen.
 *
 *  - no sources         → empty-state CTA → /add-source
 *  - sources, no active → source picker
 *  - sources + active   → browse view (search + groups + channel list)
 *
 * All persistence goes through `SourcesStore` and `useCatalogStore`; this
 * page never touches localStorage directly so the same logic transplants to
 * webOS later.
 */
export function Home() {
  const navigate = useNavigate();
  const [view, setView] = useState<SourcesView>({ status: 'loading' });
  const reloadSources = useReloadSources(setView);

  useEffect(() => {
    reloadSources();
  }, [reloadSources]);

  // Catalog auto-loads whenever the active source changes.
  const loadForSource = useCatalogStore((s) => s.loadForSource);
  const catalogSourceId = useCatalogStore((s) => s.sourceId);
  useEffect(() => {
    if (view.status !== 'ready' || !view.activeSource) return;
    if (catalogSourceId === view.activeSource.id) return;
    void loadForSource(view.activeSource);
  }, [view, loadForSource, catalogSourceId]);

  return (
    <AppScreen>
      <Stack className="mx-auto max-w-5xl p-6" gap={6}>
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Lumina-IPTV — web
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {view.status === 'ready' && view.activeSource
                ? `Browsing ${view.activeSource.label}`
                : 'Your saved sources live here.'}
            </p>
          </div>
          {view.status === 'ready' && view.sources.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              focusKey="HOME_ADD_ANOTHER"
              onClick={() => void navigate('/add-source')}
            >
              Add another source
            </Button>
          ) : null}
        </header>

        {view.status === 'loading' ? (
          <p className="text-sm text-foreground-muted" data-testid="home-loading">
            Loading sources…
          </p>
        ) : view.sources.length === 0 ? (
          <EmptyState onAdd={() => void navigate('/add-source')} />
        ) : view.activeSource ? (
          <BrowseView
            sources={view.sources}
            activeSource={view.activeSource}
            onActivate={async (id) => {
              await new SourcesStore().setActiveSource(id);
              reloadSources();
            }}
          />
        ) : (
          <SourcePicker
            sources={view.sources}
            onActivate={async (id) => {
              await new SourcesStore().setActiveSource(id);
              reloadSources();
            }}
          />
        )}
      </Stack>
    </AppScreen>
  );
}

function useReloadSources(setView: (v: SourcesView) => void): () => void {
  return useMemo(() => {
    return () => {
      const store = new SourcesStore();
      void store.read().then((s) => {
        const activeSource =
          s.sources.find((src) => src.id === s.activeSourceId) ?? null;
        setView({ status: 'ready', sources: s.sources, activeSource });
      });
    };
  }, [setView]);
}

// ---------------------------------------------------------------------------
// Empty / picker / browse subviews
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Stack
      gap={4}
      className="rounded-lg border border-border bg-surface p-6 text-center"
      data-testid="home-empty"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">No sources yet</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Add an M3U playlist URL, upload an M3U file, or sign in with Xtream Codes
          to start streaming.
        </p>
      </div>
      <div className="flex justify-center">
        <Button focusKey="HOME_ADD_SOURCE" onClick={onAdd}>
          Add a source
        </Button>
      </div>
    </Stack>
  );
}

function SourcePicker({
  sources,
  onActivate,
}: {
  sources: Source[];
  onActivate: (id: string) => void;
}) {
  return (
    <Stack gap={3} data-testid="home-source-picker">
      <p className="text-sm text-foreground-muted">Pick a source to browse:</p>
      {sources.map((source) => (
        <FocusableItem
          key={source.id}
          focusKey={`SOURCE_${source.id}`}
          onEnterPress={() => onActivate(source.id)}
          className="border border-border bg-surface p-4"
        >
          <button
            type="button"
            onClick={() => onActivate(source.id)}
            className="flex w-full flex-col items-start text-left"
          >
            <span className="font-medium text-foreground">{source.label}</span>
            <span className="text-xs text-foreground-muted">
              {describeType(source.type)}
            </span>
          </button>
        </FocusableItem>
      ))}
    </Stack>
  );
}

function BrowseView({
  sources,
  activeSource,
  onActivate,
}: {
  sources: Source[];
  activeSource: Source;
  onActivate: (id: string) => void;
}) {
  const status = useCatalogStore((s) => s.status);
  const error = useCatalogStore((s) => s.error);
  const liveGroups = useCatalogStore((s) => s.liveGroups);
  const activeGroupId = useCatalogStore((s) => s.activeGroupId);
  const setActiveGroup = useCatalogStore((s) => s.setActiveGroup);
  const searchQuery = useCatalogStore((s) => s.searchQuery);
  const setSearch = useCatalogStore((s) => s.setSearch);

  // Derive visible channels here (rather than via a Zustand selector) so we
  // don't return a fresh array reference from the store on every render —
  // Zustand v5 uses Object.is by default and would re-render forever.
  const activeGroup = useMemo(
    () => liveGroups.find((g) => g.id === activeGroupId) ?? null,
    [liveGroups, activeGroupId]
  );
  const visibleChannels: Channel[] = useMemo(() => {
    if (!activeGroup) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeGroup.channels;
    return activeGroup.channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [activeGroup, searchQuery]);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  const items: ChannelListItem[] = visibleChannels.map((channel) => ({
    id: channel.id,
    focusKey: `CHANNEL_${channel.id}`,
    name: channel.name,
    groupTitle: channel.groupTitle,
    logoUrl: 'logoUrl' in channel ? channel.logoUrl : undefined,
  }));

  return (
    <Stack gap={4} data-testid="home-browse">
      <SourceSwitcher
        sources={sources}
        activeSourceId={activeSource.id}
        onActivate={onActivate}
      />

      {status === 'loading' ? (
        <p className="text-sm text-foreground-muted" data-testid="catalog-loading">
          Loading catalog…
        </p>
      ) : status === 'error' ? (
        <CatalogError error={error} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <GroupsSidebar
            groups={liveGroups}
            activeGroupId={activeGroupId}
            onSelect={setActiveGroup}
          />
          <Stack gap={3}>
            <TextField
              focusKey="HOME_SEARCH"
              aria-label="Search channels"
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter channels by name"
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
      )}

      {selectedChannel ? <SelectedChannelPanel channel={selectedChannel} /> : null}
    </Stack>
  );
}

function SourceSwitcher({
  sources,
  activeSourceId,
  onActivate,
}: {
  sources: Source[];
  activeSourceId: string;
  onActivate: (id: string) => void;
}) {
  if (sources.length <= 1) return null;
  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="home-source-switcher"
      role="tablist"
    >
      {sources.map((source) => {
        const isActive = source.id === activeSourceId;
        return (
          <Button
            key={source.id}
            focusKey={`SOURCE_TAB_${source.id}`}
            variant={isActive ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onActivate(source.id)}
            aria-pressed={isActive}
          >
            {source.label}
          </Button>
        );
      })}
    </div>
  );
}

function GroupsSidebar({
  groups,
  activeGroupId,
  onSelect,
}: {
  groups: CatalogState['liveGroups'];
  activeGroupId: string | null;
  onSelect: (id: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-foreground-muted" data-testid="groups-empty">
        No live groups in this catalog.
      </p>
    );
  }
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

function describeType(type: Source['type']): string {
  switch (type) {
    case 'm3u_url':
      return 'M3U URL';
    case 'm3u_file':
      return 'M3U file';
    case 'xtream':
      return 'Xtream Codes';
  }
}

export default Home;
