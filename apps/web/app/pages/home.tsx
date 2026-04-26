import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Clapperboard, ListVideo, Tv } from 'lucide-react';
import type { Source } from 'core';
import {
  AppScreen,
  Button,
  CatalogTile,
  FocusableItem,
  Stack,
} from 'ui';
import { SourcesStore } from '../features/sources/sources-storage';
import { RefreshSourceButton } from '../components/refresh-source-button';
import {
  selectChannelCount,
  useCatalogStore,
  type ChannelKind,
} from '../store/catalog-store';

type SourcesView =
  | { status: 'loading' }
  | { status: 'ready'; sources: Source[]; activeSource: Source | null };

/**
 * Home — the post-onboarding landing screen.
 *
 *  - no sources         → empty-state CTA → /add-source
 *  - sources, no active → source picker (defensive; SourcesStore auto-selects
 *    the first source on add, so this is rarely visible in practice)
 *  - sources + active   → catalog launcher: three large tiles for Live TV,
 *    Movies, and Series. Selecting a tile pushes /browse/:kind, where the
 *    actual group sidebar + channel list lives.
 *
 * The catalog auto-loads whenever the active source changes so the tile
 * channel counts are accurate without the user touching anything.
 */
export function Home() {
  const navigate = useNavigate();
  const [view, setView] = useState<SourcesView>({ status: 'loading' });
  const reloadSources = useReloadSources(setView);

  useEffect(() => {
    reloadSources();
  }, [reloadSources]);

  // Catalog auto-loads whenever the active source changes; the launcher reads
  // counts straight off the store.
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
          <Launcher
            sources={view.sources}
            activeSource={view.activeSource}
            onActivate={async (id) => {
              await new SourcesStore().setActiveSource(id);
              reloadSources();
            }}
            onOpen={(kind) => void navigate(`/browse/${kind}`)}
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
// Subviews
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

function Launcher({
  sources,
  activeSource,
  onActivate,
  onOpen,
}: {
  sources: Source[];
  activeSource: Source;
  onActivate: (id: string) => void;
  onOpen: (kind: ChannelKind) => void;
}) {
  const status = useCatalogStore((s) => s.status);
  const error = useCatalogStore((s) => s.error);
  const liveCount = useCatalogStore((s) => selectChannelCount(s, 'live'));
  const vodCount = useCatalogStore((s) => selectChannelCount(s, 'vod'));
  const seriesCount = useCatalogStore((s) => selectChannelCount(s, 'series'));

  return (
    <Stack gap={6} data-testid="home-launcher">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceSwitcher
          sources={sources}
          activeSourceId={activeSource.id}
          onActivate={onActivate}
        />
        <RefreshSourceButton source={activeSource} focusKey="HOME_REFRESH" />
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-foreground-muted" data-testid="catalog-loading">
          Loading catalog…
        </p>
      ) : status === 'error' ? (
        <div
          role="alert"
          data-testid="catalog-error"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error ?? 'Failed to load catalog.'}
        </div>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="catalog-tiles"
        >
          <CatalogTile
            focusKey="HOME_TILE_LIVE"
            title="Live TV"
            subtitle="Linear channels and EPG"
            count={countCopy(liveCount, 'channel')}
            icon={<Tv aria-hidden className="size-6" />}
            disabled={liveCount === 0}
            onSelect={() => onOpen('live')}
          />
          <CatalogTile
            focusKey="HOME_TILE_VOD"
            title="Movies"
            subtitle="On-demand video"
            count={countCopy(vodCount, 'movie')}
            icon={<Clapperboard aria-hidden className="size-6" />}
            disabled={vodCount === 0}
            onSelect={() => onOpen('vod')}
          />
          <CatalogTile
            focusKey="HOME_TILE_SERIES"
            title="Series"
            subtitle="Episodic content"
            count={countCopy(seriesCount, 'series', 'series')}
            icon={<ListVideo aria-hidden className="size-6" />}
            disabled={seriesCount === 0}
            onSelect={() => onOpen('series')}
          />
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function countCopy(
  n: number,
  singular: string,
  plural = `${singular}s`
): string {
  if (n === 0) return `No ${plural}`;
  if (n === 1) return `1 ${singular}`;
  return `${n.toLocaleString()} ${plural}`;
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
