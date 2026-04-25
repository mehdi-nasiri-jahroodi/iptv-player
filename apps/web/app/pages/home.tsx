import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Source } from 'core';
import { AppScreen, Button, Stack } from 'ui';
import { SourcesStore } from '../features/sources/sources-storage';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; sources: Source[]; activeSourceId: string | null };

/**
 * Home is the post-onboarding landing screen. While the channel browser
 * (Phase 2) is still in flight, this surface acts as the "any sources?" gate:
 *
 *  - no sources  → empty state CTA that routes the user to `/add-source`
 *  - one+ source → lightweight list with the active source highlighted, plus
 *                  an "add another" affordance.
 *
 * Reads come from `SourcesStore` (localStorage adapter); the page never
 * touches `localStorage` directly so the same logic transplants to webOS.
 */
export function Home() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const store = new SourcesStore();
    void store.read().then((s) => {
      if (cancelled) return;
      setState({
        status: 'ready',
        sources: s.sources,
        activeSourceId: s.activeSourceId,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppScreen>
      <Stack className="mx-auto max-w-2xl p-6" gap={6}>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Lumina-IPTV — web
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Your saved sources live here. The channel browser arrives in Phase 2.
          </p>
        </header>

        {state.status === 'loading' ? (
          <p className="text-sm text-foreground-muted" data-testid="home-loading">
            Loading sources…
          </p>
        ) : state.sources.length === 0 ? (
          <EmptyState onAdd={() => void navigate('/add-source')} />
        ) : (
          <SourceList
            sources={state.sources}
            activeSourceId={state.activeSourceId}
            onAddAnother={() => void navigate('/add-source')}
          />
        )}
      </Stack>
    </AppScreen>
  );
}

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

function SourceList({
  sources,
  activeSourceId,
  onAddAnother,
}: {
  sources: Source[];
  activeSourceId: string | null;
  onAddAnother: () => void;
}) {
  return (
    <Stack gap={3} data-testid="home-source-list">
      <Stack gap={2}>
        {sources.map((source) => {
          const isActive = source.id === activeSourceId;
          return (
            <div
              key={source.id}
              className={[
                'flex items-center justify-between rounded-md border bg-surface p-4',
                isActive ? 'border-accent' : 'border-border',
              ].join(' ')}
              data-testid="home-source-row"
              data-active={isActive ? 'true' : 'false'}
            >
              <div>
                <div className="font-medium text-foreground">{source.label}</div>
                <div className="text-xs text-foreground-muted">
                  {describeType(source.type)}
                  {isActive ? ' · active' : ''}
                </div>
              </div>
            </div>
          );
        })}
      </Stack>
      <div>
        <Button
          variant="ghost"
          size="sm"
          focusKey="HOME_ADD_ANOTHER"
          onClick={onAddAnother}
        >
          Add another source
        </Button>
      </div>
    </Stack>
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
