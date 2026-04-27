import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, FormField, Stack, TextField } from 'ui';
import type { Source } from 'core';
import { buildPlayerApiUrl } from 'core';
import { LAYOUT_CONTENT_CLASS } from '../lib/layout-shell';
import { SourcesStore, type SourcesState } from '../features/sources/sources-storage';
import { PlaylistsStore } from '../features/sources/playlists-storage';
import { useCatalogStore, _getDefaultXtreamCache } from '../store/catalog-store';
import { useSettingsStore, type StreamProxyConfig } from '../store/settings-store';
import { useProfileStore } from '../store/profile-store';

/**
 * `/sources` — manage saved IPTV sources and app settings.
 *
 * - List every saved source with all known details.
 * - Switch the active source.
 * - Rename a source inline.
 * - Delete a source (clears playlist snapshot + Xtream cache).
 * - Add a new source → `/add-source`.
 * - Profile name + stream proxy configuration (previously at `/settings`).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeSource(source: Source): string {
  if (source.type === 'xtream') return `Xtream Codes · ${source.credentials?.host ?? ''}`;
  if (source.type === 'm3u_url') return `M3U URL · ${source.url ?? ''}`;
  return 'M3U file (uploaded)';
}

function sourceDetails(source: Source): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({ label: 'Type', value: source.type === 'xtream' ? 'Xtream Codes' : source.type === 'm3u_url' ? 'M3U URL' : 'M3U file' });
  if (source.type === 'xtream' && source.credentials) {
    rows.push({ label: 'Server', value: source.credentials.host });
    rows.push({ label: 'Username', value: source.credentials.username });
  }
  if (source.type === 'm3u_url' && source.url) {
    rows.push({ label: 'URL', value: source.url });
  }
  if (source.epgUrl) rows.push({ label: 'EPG URL', value: source.epgUrl });
  if (source.userAgent) rows.push({ label: 'User-Agent', value: source.userAgent });
  rows.push({ label: 'ID', value: source.id });
  return rows;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<SourcesState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await new SourcesStore().read();
    setState(next);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

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
        try { await cache.ready; } catch { /* non-fatal */ }
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
    if (trimmed.length === 0 || trimmed === source.label) { setEditingId(null); return; }
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
    <main className="scrollbar-slim min-h-0 w-full flex-1 overflow-y-auto">
      <div className={`${LAYOUT_CONTENT_CLASS} py-6`}>
        <Stack gap={8}>

          {/* ── Sources ─────────────────────────────────────────────────── */}
          <section>
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sources</h1>
                <p className="mt-1 text-sm text-foreground-muted">
                  Manage your saved IPTV providers.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                focusKey="SOURCES_ADD"
                onClick={() => void navigate('/add-source')}
              >
                Add source
              </Button>
            </div>

            {state === null ? (
              <p className="text-sm text-foreground-muted">Loading…</p>
            ) : state.sources.length === 0 ? (
              <div className="rounded-md border border-border bg-surface px-4 py-6 text-center">
                <p className="text-sm text-foreground-muted">
                  No sources yet. Add one to start browsing.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {state.sources.map((source) => {
                  const isActive = source.id === state.activeSourceId;
                  const isEditing = editingId === source.id;
                  const isBusy = busyId === source.id;
                  const isExpanded = expandedId === source.id;
                  const details = sourceDetails(source);
                  return (
                    <li
                      key={source.id}
                      className={`rounded-md border bg-surface transition-colors ${
                        isActive ? 'border-accent' : 'border-border'
                      }`}
                    >
                      {/* Main row */}
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
                              className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            />
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-base font-medium text-foreground">
                                {source.label}
                              </span>
                              {isActive ? (
                                <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent">
                                  Active
                                </span>
                              ) : null}
                            </div>
                          )}
                          <span className="truncate text-xs text-foreground-muted">
                            {describeSource(source)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="primary" focusKey={`SRC_SAVE_${source.id}`} disabled={isBusy} onClick={() => void handleSaveLabel(source)}>Save</Button>
                              <Button size="sm" variant="ghost" focusKey={`SRC_CANCEL_${source.id}`} onClick={() => setEditingId(null)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : source.id)}
                                className="text-xs text-foreground-muted hover:text-foreground"
                              >
                                {isExpanded ? 'Less' : 'Details'}
                              </button>
                              {!isActive ? (
                                <Button size="sm" variant="primary" focusKey={`SRC_USE_${source.id}`} disabled={isBusy} onClick={() => void handleActivate(source.id)}>Use</Button>
                              ) : null}
                              <Button size="sm" variant="ghost" focusKey={`SRC_RENAME_${source.id}`} onClick={() => { setEditLabel(source.label); setEditingId(source.id); }}>Rename</Button>
                              <Button size="sm" variant="danger" focusKey={`SRC_DEL_${source.id}`} disabled={isBusy} onClick={() => void handleDelete(source)}>Delete</Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail rows */}
                      {isExpanded && !isEditing ? (
                        <div className="border-t border-border bg-background px-4 py-3">
                          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
                            {details.map(({ label, value }) => (
                              <>
                                <dt key={`dt-${label}`} className="text-xs font-medium text-foreground-muted">{label}</dt>
                                <dd key={`dd-${label}`} className="min-w-0 truncate text-xs text-foreground">{value}</dd>
                              </>
                            ))}
                          </dl>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Profile ─────────────────────────────────────────────────── */}
          <ProfileSection />

          {/* ── Stream proxy ────────────────────────────────────────────── */}
          <StreamProxySection />

        </Stack>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Profile section
// ---------------------------------------------------------------------------

function ProfileSection() {
  const profileName = useProfileStore((s) => s.profile.name);
  const setProfileName = useProfileStore((s) => s.setProfileName);
  const [draft, setDraft] = useState(profileName);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(profileName); }, [profileName]);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-medium text-foreground">Profile</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Display name shown on the home screen.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setProfileName(draft);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }}
      >
        <FormField label="Display name">
          {({ inputId }) => (
            <TextField
              id={inputId}
              focusKey="SOURCES_PROFILE_NAME"
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              placeholder="Viewer"
            />
          )}
        </FormField>
        <Button type="submit" variant="primary" size="md" focusKey="SOURCES_PROFILE_SAVE">
          Save name
        </Button>
        {saved ? <span className="text-xs text-foreground-muted">Saved.</span> : null}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stream proxy section
// ---------------------------------------------------------------------------

interface ProxyForm { baseUrl: string; secret: string; userAgent: string; }
type TestResult = { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'fail'; reason: string };

function formFrom(cfg: StreamProxyConfig | null): ProxyForm {
  return { baseUrl: cfg?.baseUrl ?? '', secret: cfg?.secret ?? '', userAgent: cfg?.userAgent ?? '' };
}

function StreamProxySection() {
  const streamProxy = useSettingsStore((s) => s.streamProxy);
  const setStreamProxy = useSettingsStore((s) => s.setStreamProxy);
  const clearStreamProxy = useSettingsStore((s) => s.clearStreamProxy);

  const [form, setForm] = useState<ProxyForm>(() => formFrom(streamProxy));
  const [revealSecret, setRevealSecret] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [test, setTest] = useState<TestResult>({ kind: 'idle' });

  useEffect(() => { setForm(formFrom(streamProxy)); }, [streamProxy]);

  const baseUrlValid = useMemo(() => {
    if (!form.baseUrl) return true;
    try { const u = new URL(form.baseUrl); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  }, [form.baseUrl]);

  const secretValid = form.secret.length === 0 || form.secret.length >= 16;
  const dirty =
    form.baseUrl !== (streamProxy?.baseUrl ?? '') ||
    form.secret !== (streamProxy?.secret ?? '') ||
    form.userAgent !== (streamProxy?.userAgent ?? '');
  const canSave = form.baseUrl.length > 0 && form.secret.length > 0 && baseUrlValid && secretValid;

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    setStreamProxy({ baseUrl: form.baseUrl, secret: form.secret, userAgent: form.userAgent || undefined });
    setSavedAt(Date.now());
    setTest({ kind: 'idle' });
  }

  function handleClear() {
    clearStreamProxy();
    setForm({ baseUrl: '', secret: '', userAgent: '' });
    setSavedAt(null);
    setTest({ kind: 'idle' });
  }

  async function handleTest() {
    if (!form.baseUrl || !baseUrlValid) { setTest({ kind: 'fail', reason: 'Enter a valid http(s) URL first.' }); return; }
    setTest({ kind: 'pending' });
    const base = form.baseUrl.replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}/healthz`);
      if (!res.ok) { setTest({ kind: 'fail', reason: `Server responded ${res.status}` }); return; }
      setTest({ kind: 'ok' });
    } catch (cause) {
      setTest({ kind: 'fail', reason: cause instanceof TypeError ? 'Cannot reach the proxy. Is it running and the URL correct?' : cause instanceof Error ? cause.message : 'Unknown error.' });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5" data-testid="settings-page">
      <h2 className="text-lg font-medium text-foreground">Stream proxy</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Browsers block most Xtream streams under CORS. Run the bundled{' '}
        <code className="rounded bg-background px-1 py-0.5 text-xs">apps/web-proxy</code>{' '}
        locally, then paste its URL and secret here.
      </p>

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <FormField
          label="Proxy URL"
          hint="e.g. http://localhost:8787 or https://abc123.ngrok.app"
          error={!baseUrlValid && form.baseUrl ? 'Must be an http(s) URL.' : undefined}
        >
          {({ inputId, describedBy }) => (
            <TextField
              id={inputId}
              aria-describedby={describedBy}
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://localhost:8787"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              invalid={!baseUrlValid && form.baseUrl.length > 0}
              data-testid="settings-proxy-url"
            />
          )}
        </FormField>

        <FormField
          label="Shared secret"
          hint="At least 16 characters. Must match the proxy's PROXY_SECRET env."
          error={!secretValid ? 'Secret must be at least 16 characters.' : undefined}
        >
          {({ inputId, describedBy }) => (
            <div className="flex gap-2">
              <TextField
                id={inputId}
                aria-describedby={describedBy}
                type={revealSecret ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your PROXY_SECRET"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                invalid={!secretValid}
                data-testid="settings-proxy-secret"
              />
              <Button type="button" variant="ghost" size="md" onClick={() => setRevealSecret((v) => !v)} focusKey="SOURCES_REVEAL">
                {revealSecret ? 'Hide' : 'Show'}
              </Button>
            </div>
          )}
        </FormField>

        <FormField
          label="User-Agent override"
          hint="Optional default for all sources. Per-source overrides are set when you add a source."
        >
          {({ inputId, describedBy }) => (
            <TextField
              id={inputId}
              aria-describedby={describedBy}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="IPTVSmartersPlayer 3.1"
              value={form.userAgent}
              onChange={(e) => setForm((f) => ({ ...f, userAgent: e.target.value }))}
              data-testid="settings-proxy-ua"
            />
          )}
        </FormField>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" variant="primary" disabled={!canSave || !dirty} focusKey="SOURCES_PROXY_SAVE">Save</Button>
          <Button type="button" variant="ghost" onClick={handleTest} disabled={!form.baseUrl || !baseUrlValid || test.kind === 'pending'} focusKey="SOURCES_PROXY_TEST" loading={test.kind === 'pending'}>Test connection</Button>
          {streamProxy ? (
            <Button type="button" variant="ghost" onClick={handleClear} focusKey="SOURCES_PROXY_CLEAR">Clear</Button>
          ) : null}
          {savedAt ? <span className="text-xs text-foreground-muted" data-testid="settings-saved">Saved.</span> : null}
          {test.kind === 'ok' ? <span className="text-xs text-foreground" data-testid="settings-test-ok">Proxy reachable.</span> : null}
          {test.kind === 'fail' ? <span className="text-xs text-danger" data-testid="settings-test-fail">{test.reason}</span> : null}
        </div>
      </form>
    </section>
  );
}
