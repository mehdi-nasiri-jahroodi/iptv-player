import { useEffect, useMemo, useState } from 'react';
import { Button, FormField, TextField } from 'ui';
import { fetchProxyHealthz } from '../lib/stream-proxy-healthz';
import { useSettingsStore, type StreamProxyConfig } from '../store/settings-store';

interface ProxyForm {
  baseUrl: string;
  secret: string;
  userAgent: string;
}

type TestResult =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'fail'; reason: string };

function formFrom(cfg: StreamProxyConfig | null): ProxyForm {
  return { baseUrl: cfg?.baseUrl ?? '', secret: cfg?.secret ?? '', userAgent: cfg?.userAgent ?? '' };
}

export type SettingsStreamProxyModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full add/edit form for the stream proxy — used inside a modal from Settings.
 */
export function SettingsStreamProxyModal({ open, onClose }: SettingsStreamProxyModalProps) {
  const streamProxy = useSettingsStore((s) => s.streamProxy);
  const setStreamProxy = useSettingsStore((s) => s.setStreamProxy);
  const clearStreamProxy = useSettingsStore((s) => s.clearStreamProxy);

  const [form, setForm] = useState<ProxyForm>(() => formFrom(streamProxy));
  const [revealSecret, setRevealSecret] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [test, setTest] = useState<TestResult>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    setForm(formFrom(streamProxy));
    setRevealSecret(false);
    setSavedAt(null);
    setTest({ kind: 'idle' });
  }, [open, streamProxy]);

  const baseUrlValid = useMemo(() => {
    if (!form.baseUrl) return true;
    try {
      const u = new URL(form.baseUrl);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
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
    setStreamProxy({
      baseUrl: form.baseUrl,
      secret: form.secret,
      userAgent: form.userAgent || undefined,
    });
    setSavedAt(Date.now());
    setTest({ kind: 'idle' });
  }

  function handleClear() {
    clearStreamProxy();
    setForm({ baseUrl: '', secret: '', userAgent: '' });
    setSavedAt(null);
    setTest({ kind: 'idle' });
    onClose();
  }

  async function handleTest() {
    if (!form.baseUrl || !baseUrlValid) {
      setTest({ kind: 'fail', reason: 'Enter a valid http(s) URL first.' });
      return;
    }
    setTest({ kind: 'pending' });
    const result = await fetchProxyHealthz(form.baseUrl);
    if (result.ok) setTest({ kind: 'ok' });
    else setTest({ kind: 'fail', reason: result.reason });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stream-proxy-modal-title"
      data-testid="settings-stream-proxy-modal"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="stream-proxy-modal-title" className="text-lg font-semibold text-foreground">
              {streamProxy ? 'Edit stream proxy' : 'Add stream proxy'}
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Run <code className="rounded bg-surface px-1 py-0.5 text-xs">apps/web-proxy</code> locally (or expose it) so
              the browser can reach your streams. Native apps ignore this.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" focusKey="SETTINGS_PROXY_MODAL_CLOSE" onClick={onClose}>
            Close
          </Button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
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
                <Button type="button" variant="ghost" size="md" onClick={() => setRevealSecret((v) => !v)} focusKey="SETTINGS_PROXY_MODAL_REVEAL">
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

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button type="submit" variant="primary" disabled={!canSave || !dirty} focusKey="SETTINGS_PROXY_MODAL_SAVE">
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleTest}
              disabled={!form.baseUrl || !baseUrlValid || test.kind === 'pending'}
              focusKey="SETTINGS_PROXY_MODAL_TEST"
              loading={test.kind === 'pending'}
            >
              Test connection
            </Button>
            {streamProxy ? (
              <Button type="button" variant="ghost" onClick={handleClear} focusKey="SETTINGS_PROXY_MODAL_CLEAR">
                Remove proxy
              </Button>
            ) : null}
            {savedAt ? (
              <span className="text-xs text-foreground-muted" data-testid="settings-saved">
                Saved.
              </span>
            ) : null}
            {test.kind === 'ok' ? (
              <span className="text-xs text-foreground" data-testid="settings-test-ok">
                Proxy reachable.
              </span>
            ) : null}
            {test.kind === 'fail' ? (
              <span className="text-xs text-danger" data-testid="settings-test-fail">
                {test.reason}
              </span>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
