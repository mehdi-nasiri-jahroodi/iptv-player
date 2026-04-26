import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { Source } from 'core';
import { AppScreen, Button, Stack } from 'ui';
import { BrowseView } from '../../components/browse-view';
import { SourcesStore } from '../../features/sources/sources-storage';
import { LAYOUT_CONTENT_CLASS } from '../../lib/layout-shell';
import {
  CHANNEL_KINDS,
  useCatalogStore,
  type ChannelKind,
} from '../../store/catalog-store';
import { useGuideStore } from '../../store/guide-store';

const KIND_TITLES: Record<ChannelKind, { title: string; subtitle: string }> = {
  live: { title: 'Live TV', subtitle: 'Linear channels and EPG' },
  vod: { title: 'Movies', subtitle: 'On-demand video' },
  series: { title: 'Series', subtitle: 'Episodic content' },
};

function isChannelKind(value: string | undefined): value is ChannelKind {
  return value !== undefined && (CHANNEL_KINDS as string[]).includes(value);
}

/**
 * `/browse/:kind` — full-page browser for a single catalog kind.
 *
 * The page itself is thin: it validates the URL param, ensures the catalog
 * is loaded for the user's active source (so deep links survive a reload),
 * and delegates the actual UI to the shared `BrowseView` component.
 */
export function BrowseKindPage() {
  const params = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = isChannelKind(params.kind) ? params.kind : null;
  const preferredChannelId = searchParams.get('selected');

  const [activeSource, setActiveSource] = useState<Source | null | undefined>(
    undefined
  );
  useEffect(() => {
    let cancelled = false;
    void new SourcesStore().read().then((s) => {
      if (cancelled) return;
      setActiveSource(s.sources.find((src) => src.id === s.activeSourceId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadForSource = useCatalogStore((s) => s.loadForSource);
  const catalogSourceId = useCatalogStore((s) => s.sourceId);
  useEffect(() => {
    if (!activeSource) return;
    if (catalogSourceId === activeSource.id) return;
    void loadForSource(activeSource);
  }, [activeSource, catalogSourceId, loadForSource]);

  const loadGuide = useGuideStore((s) => s.loadForSource);
  useEffect(() => {
    if (!activeSource) return;
    void loadGuide(activeSource);
  }, [activeSource, loadGuide]);

  const meta = useMemo(() => (kind ? KIND_TITLES[kind] : null), [kind]);

  const hideBrowsePageHeader =
    Boolean(activeSource) && (kind === 'live' || kind === 'vod');

  return (
    <AppScreen scrollPage={!hideBrowsePageHeader}>
      <Stack
        className={
          hideBrowsePageHeader
            ? `${LAYOUT_CONTENT_CLASS} flex min-h-0 flex-1 flex-col gap-0 pb-2 pt-1`
            : `${LAYOUT_CONTENT_CLASS} py-6`
        }
        gap={hideBrowsePageHeader ? 2 : 6}
      >
        {!hideBrowsePageHeader ? (
          <header className="flex items-baseline justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {meta?.title ?? 'Browse'}
              </h1>
              <p className="mt-1 text-sm text-foreground-muted">
                {meta?.subtitle ?? ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                focusKey="BROWSE_BACK"
                onClick={() => void navigate('/')}
              >
                Back to home
              </Button>
            </div>
          </header>
        ) : null}

        {!kind ? (
          <UnknownKind value={params.kind ?? ''} />
        ) : activeSource === undefined ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : !activeSource ? (
          <NoActiveSource onAdd={() => void navigate('/add-source')} />
        ) : (
          <BrowseView
            kind={kind}
            activeSource={activeSource}
            preferredChannelId={kind === 'vod' ? preferredChannelId : null}
            emptyHint={`${activeSource.label} has no ${meta?.title.toLowerCase() ?? kind} content.`}
          />
        )}
      </Stack>
    </AppScreen>
  );
}

function UnknownKind({ value }: { value: string }) {
  return (
    <div
      role="alert"
      data-testid="browse-unknown-kind"
      className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      "{value}" is not a known catalog section. Try "live", "vod", or "series".
    </div>
  );
}

function NoActiveSource({ onAdd }: { onAdd: () => void }) {
  return (
    <Stack
      gap={3}
      className="rounded-lg border border-border bg-surface p-6 text-center"
      data-testid="browse-no-source"
    >
      <p className="text-sm text-foreground-muted">
        Add a source first to browse channels.
      </p>
      <div className="flex justify-center">
        <Button focusKey="BROWSE_ADD_SOURCE" onClick={onAdd}>
          Add a source
        </Button>
      </div>
    </Stack>
  );
}

export default BrowseKindPage;
