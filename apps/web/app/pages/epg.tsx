import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { flatProgramsInWindow, type FlatEpgRow } from 'core';
import type { Source } from 'core';
import { AppScreen, Button, Stack } from 'ui';
import { SourcesStore } from '../features/sources/sources-storage';
import { useCatalogStore } from '../store/catalog-store';
import { useGuideStore } from '../store/guide-store';
import { useMinuteClock } from '../hooks/use-minute-clock';
import { liveTvgIdToDisplayName } from '../lib/epg-display';

function startOfLocalDay(base: Date, dayOffset: number): number {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  return d.getTime();
}

/**
 * `/epg` — read-only merged schedule for today and tomorrow from the active
 * source's XMLTV URL (when configured). Scrolls the first "on air" row into
 * view on load when possible.
 */
export default function EpgPage() {
  const navigate = useNavigate();
  const clock = useMinuteClock();
  const nowMs = clock.getTime();

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

  const loadCatalog = useCatalogStore((s) => s.loadForSource);
  const catalogSourceId = useCatalogStore((s) => s.sourceId);
  const catalogStatus = useCatalogStore((s) => s.status);
  const playlist = useCatalogStore((s) => s.playlist);

  useEffect(() => {
    if (!activeSource) return;
    if (catalogSourceId === activeSource.id) return;
    void loadCatalog(activeSource);
  }, [activeSource, catalogSourceId, loadCatalog]);

  const loadGuide = useGuideStore((s) => s.loadForSource);
  const guide = useGuideStore((s) => s.guide);
  const guideStatus = useGuideStore((s) => s.status);
  const guideError = useGuideStore((s) => s.error);

  useEffect(() => {
    if (!activeSource) return;
    void loadGuide(activeSource);
  }, [activeSource, loadGuide]);

  const tvgNames = useMemo(() => liveTvgIdToDisplayName(playlist), [playlist]);

  const { windowStart, windowEnd } = useMemo(() => {
    const today = startOfLocalDay(clock, 0);
    const endTomorrow = startOfLocalDay(clock, 2);
    return { windowStart: today, windowEnd: endTomorrow };
  }, [clock.getFullYear(), clock.getMonth(), clock.getDate()]);

  const rows = useMemo(() => {
    if (!guide) return [];
    return flatProgramsInWindow(guide, tvgNames, windowStart, windowEnd);
  }, [guide, tvgNames, windowStart, windowEnd]);

  const rowsByDay = useMemo(() => {
    const todayRows: typeof rows = [];
    const tomorrowRows: typeof rows = [];
    const boundary = startOfLocalDay(clock, 1);
    for (const row of rows) {
      const s = new Date(row.program.start).getTime();
      if (s < boundary) todayRows.push(row);
      else tomorrowRows.push(row);
    }
    return { todayRows, tomorrowRows };
  }, [rows, clock]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const marker = root.querySelector('[data-epg-current="true"]');
    marker?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [rows, guideStatus]);

  if (activeSource === undefined) {
    return (
      <AppScreen>
        <p className="p-6 text-sm text-foreground-muted">Loading…</p>
      </AppScreen>
    );
  }

  if (!activeSource) {
    return (
      <AppScreen>
        <Stack className="mx-auto max-w-3xl p-6" gap={4}>
          <h1 className="text-2xl font-semibold text-foreground">TV Guide</h1>
          <p className="text-sm text-foreground-muted">Pick a source on Home first.</p>
          <Button focusKey="EPG_HOME" onClick={() => void navigate('/')}>
            Go home
          </Button>
        </Stack>
      </AppScreen>
    );
  }

  if (!activeSource.epgUrl?.trim()) {
    return (
      <AppScreen>
        <Stack className="mx-auto max-w-3xl p-6" gap={4}>
          <h1 className="text-2xl font-semibold text-foreground">TV Guide</h1>
          <p className="text-sm text-foreground-muted">
            This source has no EPG URL. Add an optional XMLTV link when you create or edit the
            source (Add source → EPG URL).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button focusKey="EPG_ADD" variant="primary" onClick={() => void navigate('/add-source')}>
              Add source
            </Button>
            <Button focusKey="EPG_HOME" variant="ghost" onClick={() => void navigate('/')}>
              Home
            </Button>
          </div>
        </Stack>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Stack className="mx-auto max-w-[1400px] p-6" gap={6}>
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">TV Guide</h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {activeSource.label} — today &amp; tomorrow (local time)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button focusKey="EPG_BROWSE" variant="ghost" size="sm" onClick={() => void navigate('/browse/live')}>
              Live channels
            </Button>
            <Button focusKey="EPG_BACK" variant="ghost" size="sm" onClick={() => void navigate('/')}>
              Home
            </Button>
          </div>
        </header>

        {catalogStatus === 'loading' ? (
          <p className="text-sm text-foreground-muted">Loading catalog…</p>
        ) : guideStatus === 'loading' ? (
          <p className="text-sm text-foreground-muted" data-testid="epg-loading">
            Loading programme data…
          </p>
        ) : guideStatus === 'error' ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            data-testid="epg-error"
          >
            {guideError ?? 'EPG failed to load.'}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground-muted" data-testid="epg-empty">
            No programmes in the guide for this window, or XML had no matching channels.
          </p>
        ) : (
          <div
            ref={scrollRef}
            className="scrollbar-slim max-h-[min(70vh,720px)] overflow-y-auto rounded-lg border border-border bg-surface"
            data-testid="epg-list"
          >
            <EpgDaySection title="Today" rows={rowsByDay.todayRows} nowMs={nowMs} />
            <EpgDaySection title="Tomorrow" rows={rowsByDay.tomorrowRows} nowMs={nowMs} />
          </div>
        )}
      </Stack>
    </AppScreen>
  );
}

function EpgDaySection({
  title,
  rows,
  nowMs,
}: {
  title: string;
  rows: FlatEpgRow[];
  nowMs: number;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="border-b border-border last:border-b-0">
      <h2 className="sticky top-0 z-10 bg-surface px-4 py-2 text-sm font-semibold text-foreground">
        {title}
      </h2>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const start = new Date(row.program.start).getTime();
          const end = new Date(row.program.end).getTime();
          const isCurrent = nowMs >= start && nowMs < end;
          const startStr = new Date(row.program.start).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          });
          const endStr = new Date(row.program.end).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <li
              key={`${row.channelId}-${row.program.start}-${row.program.title}`}
              data-epg-current={isCurrent ? 'true' : undefined}
              className={[
                'flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-baseline sm:gap-3',
                isCurrent ? 'bg-accent/15' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="shrink-0 text-xs tabular-nums text-foreground-muted sm:w-36">
                {startStr} – {endStr}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{row.program.title}</div>
                <div className="truncate text-xs text-foreground-muted">{row.channelName}</div>
                {row.program.description ? (
                  <div className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">
                    {row.program.description}
                  </div>
                ) : null}
              </div>
              {isCurrent ? (
                <span className="shrink-0 text-xs font-medium text-accent">On air</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
