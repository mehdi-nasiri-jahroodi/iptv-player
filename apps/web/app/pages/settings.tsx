import { useEffect, useMemo, useState } from 'react';
import { Button, FormField, TextField } from 'ui';
import { useSettingsStore, type StreamProxyConfig } from '../store/settings-store';
import { useProfileStore } from '../store/profile-store';

/**
 * `/settings` — user preferences.
 *
 * Currently surfaces the **stream proxy** configuration. When the user is
 * playing commercial Xtream HLS streams the browser blocks them under
 * CORS; this page lets them point the app at their locally-running
 * `apps/web-proxy` instance (or an ngrok-exposed one for TV browsers).
 *
 * The proxy URL and secret are persisted in `localStorage` via the
 * settings-store; nothing on this page hits the network until the user
 * clicks **Test connection**, which fetches `${baseUrl}/healthz`.
 */

interface FormState {
  baseUrl: string;
  secret: string;
  userAgent: string;
}

type TestResult =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'fail'; reason: string };

function formStateFrom(config: StreamProxyConfig | null): FormState {
  return {
    baseUrl: config?.baseUrl ?? '',
    secret: config?.secret ?? '',
    userAgent: config?.userAgent ?? '',
  };
}

export default function SettingsPage() {
  const streamProxy = useSettingsStore((s) => s.streamProxy);
  const setStreamProxy = useSettingsStore((s) => s.setStreamProxy);
  const clearStreamProxy = useSettingsStore((s) => s.clearStreamProxy);
  const profileName = useProfileStore((s) => s.profile.name);
  const setProfileName = useProfileStore((s) => s.setProfileName);

  const [form, setForm] = useState<FormState>(() => formStateFrom(streamProxy));
  const [profileDraft, setProfileDraft] = useState(profileName);
  const [revealSecret, setRevealSecret] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [test, setTest] = useState<TestResult>({ kind: 'idle' });

  useEffect(() => {
    setProfileDraft(profileName);
  }, [profileName]);

  // Re-sync the form when the persisted slice changes from another tab.
  // The Zustand `persist` middleware fires storage events, but it does
  // not auto-update local React state — we mirror it by hand so an
  // edit in tab B doesn't get clobbered by a save in tab A.
  useEffect(() => {
    setForm(formStateFrom(streamProxy));
  }, [streamProxy]);

  const baseUrlValid = useMemo(() => {
    if (!form.baseUrl) return true; // empty = unset, not invalid
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

  const canSave =
    form.baseUrl.length > 0 &&
    form.secret.length > 0 &&
    baseUrlValid &&
    secretValid;

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  }

  async function handleTest() {
    if (!form.baseUrl || !baseUrlValid) {
      setTest({ kind: 'fail', reason: 'Enter a valid http(s) URL first.' });
      return;
    }
    setTest({ kind: 'pending' });
    const base = form.baseUrl.replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}/healthz`, { method: 'GET' });
      if (!res.ok) {
        setTest({ kind: 'fail', reason: `Server responded ${res.status}` });
        return;
      }
      setTest({ kind: 'ok' });
    } catch (cause) {
      // Most failures here are CORS or network: the proxy injects
      // `Access-Control-Allow-Origin: *`, so a CORS error usually means
      // the URL is wrong or the server is down. We never reveal raw
      // error text (Chrome's CORS messages leak the origin we tried).
      const reason =
        cause instanceof TypeError
          ? 'Cannot reach the proxy. Is it running and the URL correct?'
          : cause instanceof Error
            ? cause.message
            : 'Unknown error.';
      setTest({ kind: 'fail', reason });
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6" data-testid="settings-page">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Preferences are stored on this device only.
        </p>
      </header>

      <section
        className="mb-6 rounded-lg border border-border bg-surface p-5"
        data-testid="settings-profile"
      >
        <h2 className="text-lg font-medium text-foreground">Profile</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Shown on the home screen. One profile for this MVP.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setProfileName(profileDraft);
          }}
        >
          <FormField label="Display name" hint="How you want to be addressed in the app.">
            {({ inputId, describedBy }) => (
              <TextField
                id={inputId}
                aria-describedby={describedBy}
                focusKey="SETTINGS_PROFILE_NAME"
                value={profileDraft}
                onChange={(ev) => setProfileDraft(ev.target.value)}
                placeholder="Viewer"
                data-testid="settings-profile-name"
              />
            )}
          </FormField>
          <Button type="submit" variant="primary" size="md" focusKey="SETTINGS_PROFILE_SAVE">
            Save name
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-medium text-foreground">Stream proxy</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Browsers block most Xtream streams under CORS. Run the bundled{' '}
          <code className="rounded bg-background px-1 py-0.5 text-xs">
            apps/web-proxy
          </code>{' '}
          locally, then paste its URL and secret here. Native targets
          (Android TV, webOS) play streams directly and ignore this
          setting.
        </p>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <FormField
            label="Proxy URL"
            hint="e.g. http://localhost:8787 or https://abc123.ngrok.app"
            error={
              !baseUrlValid && form.baseUrl ? 'Must be an http(s) URL.' : undefined
            }
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, baseUrl: e.target.value }))
                }
                invalid={!baseUrlValid && form.baseUrl.length > 0}
                data-testid="settings-proxy-url"
              />
            )}
          </FormField>

          <FormField
            label="Shared secret"
            hint="At least 16 characters. Must match the proxy’s PROXY_SECRET env."
            error={
              !secretValid ? 'Secret must be at least 16 characters.' : undefined
            }
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, secret: e.target.value }))
                  }
                  invalid={!secretValid}
                  data-testid="settings-proxy-secret"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setRevealSecret((v) => !v)}
                  focusKey="SETTINGS_REVEAL"
                >
                  {revealSecret ? 'Hide' : 'Show'}
                </Button>
              </div>
            )}
          </FormField>

          <FormField
            label="User-Agent override"
            hint="Optional default for all sources. Per-source overrides are set when you add or edit a source."
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, userAgent: e.target.value }))
                }
                data-testid="settings-proxy-ua"
              />
            )}
          </FormField>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={!canSave || !dirty}
              focusKey="SETTINGS_SAVE"
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleTest}
              disabled={!form.baseUrl || !baseUrlValid || test.kind === 'pending'}
              focusKey="SETTINGS_TEST"
              loading={test.kind === 'pending'}
            >
              Test connection
            </Button>
            {streamProxy ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                focusKey="SETTINGS_CLEAR"
              >
                Clear
              </Button>
            ) : null}
            {savedAt ? (
              <span
                className="text-xs text-foreground-muted"
                data-testid="settings-saved"
              >
                Saved.
              </span>
            ) : null}
            {test.kind === 'ok' ? (
              <span
                className="text-xs text-foreground"
                data-testid="settings-test-ok"
              >
                Proxy reachable.
              </span>
            ) : null}
            {test.kind === 'fail' ? (
              <span
                className="text-xs text-danger"
                data-testid="settings-test-fail"
              >
                {test.reason}
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
