import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronDown, ChevronRight, Server } from 'lucide-react';
import { Button, Stack } from 'ui';
import type { Source } from 'core';
import { buildPlayerApiUrl } from 'core';
import { buildSourceDetailRows } from '../lib/source-detail-rows';
import { SourcesStore, type SourcesState } from '../features/sources/sources-storage';
import { PlaylistsStore } from '../features/sources/playlists-storage';
import { probeXtreamAccountSnapshot } from '../features/sources/probe-xtream-account-snapshot';
import { useCatalogStore, _getDefaultXtreamCache } from '../store/catalog-store';
import { useSettingsStore } from '../store/settings-store';
import { AddSourceModal } from './add-source-modal';

function describeSource(source: Source): string {
  if (source.type === 'xtream') return `Xtream Codes · ${source.credentials?.host ?? ''}`;
  if (source.type === 'm3u_url') return `M3U URL · ${source.url ?? ''}`;
  return 'M3U file (uploaded)';
}

export function SettingsSourcesSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [state, setState] = useState<SourcesState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [xtreamProbeTick, setXtreamProbeTick] = useState(0);
  const [xtreamProbe, setXtreamProbe] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const reload = useCallback(async () => {
    const next = await new SourcesStore().read();
    setState(next);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (searchParams.get('addSource') !== '1') return;
    setAddSourceOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('addSource');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!expandedId) {
      setXtreamProbe({ loading: false, error: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const st = await new SourcesStore().read();
      if (cancelled) return;
      const source = st.sources.find((s) => s.id === expandedId);
      if (!source || source.type !== 'xtream' || !source.credentials) {
        setXtreamProbe({ loading: false, error: null });
        return;
      }
      setXtreamProbe({ loading: true, error: null });
      const streamProxy = useSettingsStore.getState().streamProxy;
      const result = await probeXtreamAccountSnapshot(source, streamProxy);
      if (cancelled) return;
      if (result.ok) {
        await new SourcesStore().updateSource(source.id, {
          xtreamAccount: { ...source.xtreamAccount, ...result.snapshot },
        });
        await reload();
        setXtreamProbe({ loading: false, error: null });
      } else {
        setXtreamProbe({ loading: false, error: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedId, xtreamProbeTick, reload]);

  async function handleActivate(id: string): Promise<void> {
    setBusyId(id);
    try {
      await new SourcesStore().setActiveSource(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(source: Source): Promise<void> {
    const ok = window.confirm(
      `Delete "${source.label}"? This removes the source and its cached data. Favorites and recents are kept.`
    );
    if (!ok) return;
    setBusyId(source.id);
    try {
      if (source.type === 'xtream' && source.credentials) {
        const cache = _getDefaultXtreamCache();
        try {
          await cache.ready;
        } catch {
          /* non-fatal */
        }
        cache.invalidateSource(buildPlayerApiUrl(source.credentials));
      }
      await new PlaylistsStore().removeForSource(source.id);
      await new SourcesStore().removeSource(source.id);
      const catalog = useCatalogStore.getState();
      if (catalog.sourceId === source.id) catalog.clear();
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveLabel(source: Source): Promise<void> {
    const trimmed = editLabel.trim();
    if (trimmed.length === 0 || trimmed === source.label) {
      setEditingId(null);
      return;
    }
    setBusyId(source.id);
    try {
      await new SourcesStore().updateSource(source.id, { label: trimmed });
      setEditingId(null);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5" id="settings-sources">
      <div>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-foreground">Sources</h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
              The <strong className="font-medium text-foreground">active</strong> source drives the catalog on Home,
              Browse, and the guide. Use <strong className="font-medium text-foreground">Details</strong> to inspect
              connection info and subscription dates (Xtream). <strong className="font-medium text-foreground">Add source</strong>{' '}
              opens in a modal.
            </p>
          </div>
          <Button variant="primary" size="sm" focusKey="SETTINGS_SOURCES_ADD" onClick={() => setAddSourceOpen(true)}>
            Add source
          </Button>
        </div>

        {state === null ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : state.sources.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center">
            <Server aria-hidden className="mx-auto size-10 text-foreground-muted" />
            <p className="mt-3 text-sm font-medium text-foreground">No sources yet</p>
            <p className="mt-1 text-sm text-foreground-muted">Add a playlist or Xtream account to unlock Live TV, Movies, and Series.</p>
            <div className="mt-4 flex justify-center">
              <Button variant="primary" size="sm" focusKey="SETTINGS_SOURCES_ADD_EMPTY" onClick={() => setAddSourceOpen(true)}>
                Add your first source
              </Button>
            </div>
          </div>
        ) : (
          <Stack gap={3}>
            <p className="text-xs text-foreground-muted">
              Tip: switch the active source before browsing if you use more than one provider.
            </p>
            <ul className="flex flex-col gap-3">
              {state.sources.map((source) => {
                const isActive = source.id === state.activeSourceId;
                const isEditing = editingId === source.id;
                const isBusy = busyId === source.id;
                const isExpanded = expandedId === source.id;
                const details = buildSourceDetailRows(source);
                return (
                  <li
                    key={source.id}
                    className={`overflow-hidden rounded-lg border transition-colors ${
                      isActive ? 'border-accent bg-accent/5' : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveLabel(source);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                            className="w-full max-w-md rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                          />
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-base font-medium text-foreground">{source.label}</span>
                            {isActive ? (
                              <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                                Active — used for browsing
                              </span>
                            ) : (
                              <span className="rounded-sm border border-border px-2 py-0.5 text-xs text-foreground-muted">
                                Inactive
                              </span>
                            )}
                          </div>
                        )}
                        <span className="truncate text-xs text-foreground-muted">{describeSource(source)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              focusKey={`SETTINGS_SRC_SAVE_${source.id}`}
                              disabled={isBusy}
                              onClick={() => void handleSaveLabel(source)}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" focusKey={`SETTINGS_SRC_CANCEL_${source.id}`} onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              focusKey={`SETTINGS_SRC_EXPAND_${source.id}`}
                              onClick={() => setExpandedId(isExpanded ? null : source.id)}
                              className="gap-1.5 text-foreground-muted"
                            >
                              {isExpanded ? (
                                <ChevronDown aria-hidden className="size-4" />
                              ) : (
                                <ChevronRight aria-hidden className="size-4" />
                              )}
                              {isExpanded ? 'Hide details' : 'Details'}
                            </Button>
                            {!isActive ? (
                              <Button
                                size="sm"
                                variant="primary"
                                focusKey={`SETTINGS_SRC_USE_${source.id}`}
                                disabled={isBusy}
                                onClick={() => void handleActivate(source.id)}
                              >
                                Set as active
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              focusKey={`SETTINGS_SRC_RENAME_${source.id}`}
                              onClick={() => {
                                setEditLabel(source.label);
                                setEditingId(source.id);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              focusKey={`SETTINGS_SRC_DEL_${source.id}`}
                              disabled={isBusy}
                              onClick={() => void handleDelete(source)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && !isEditing ? (
                      <div className="border-t border-border bg-surface px-4 py-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                            Source details
                          </p>
                          {source.type === 'xtream' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              focusKey={`SETTINGS_SRC_PROBE_${source.id}`}
                              loading={xtreamProbe.loading}
                              onClick={() => setXtreamProbeTick((n) => n + 1)}
                            >
                              Refresh panel details
                            </Button>
                          ) : null}
                        </div>
                        {source.type === 'xtream' && xtreamProbe.loading ? (
                          <p className="mb-2 text-xs text-foreground-muted" data-testid="xtream-probe-loading">
                            Fetching subscription info from the panel…
                          </p>
                        ) : null}
                        {source.type === 'xtream' && xtreamProbe.error ? (
                          <p role="alert" className="mb-2 text-xs text-danger">
                            {xtreamProbe.error}
                          </p>
                        ) : null}
                        <dl className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-[minmax(8rem,max-content)_1fr]">
                          {details.map(({ label, value }) => (
                            <div key={label} className="contents">
                              <dt className="text-xs font-medium text-foreground-muted">{label}</dt>
                              <dd className="break-all text-sm text-foreground">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Stack>
        )}
      </div>

      <AddSourceModal open={addSourceOpen} onClose={() => setAddSourceOpen(false)} onAdded={() => void reload()} />
    </section>
  );
}
