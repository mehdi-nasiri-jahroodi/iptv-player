import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, SourceForm, Stack, type SourceFormSubmission } from 'ui';
import type { Source, SourceValidationResult } from 'core';
import { newSourceId, SourcesStore } from '../features/sources/sources-storage';
import { validatePersistAndSnapshotSource } from '../features/sources/persist-validated-source';
import {
  readResponsibilityAcknowledgedFromStorage,
  useSettingsStore,
} from '../store/settings-store';
import { readGuidedSourceSetupDone, setGuidedSourceSetupDone } from '../lib/guided-setup-storage';
import { buildSourceDetailRows } from '../lib/source-detail-rows';

/**
 * Guided first launch: add source → optional stream proxy → success summary → home.
 * Shown only when legal ack is done, guided setup is not marked complete, and there are no sources.
 */
export function FirstRunWizard() {
  const navigate = useNavigate();
  const streamProxy = useSettingsStore((s) => s.streamProxy);
  const setStreamProxy = useSettingsStore((s) => s.setStreamProxy);
  const settingsAck = useSettingsStore((s) => s.acknowledgedResponsibilityV1);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'source' | 'proxy' | 'success'>('source');
  const lastAdded = useRef<Source | null>(null);
  const [addedSource, setAddedSource] = useState<Source | null>(null);

  const [proxyUrl, setProxyUrl] = useState('');
  const [proxySecret, setProxySecret] = useState('');
  const [proxyError, setProxyError] = useState<string | null>(null);
  const sessionBootstrapped = useRef(false);
  const openRef = useRef(false);
  openRef.current = open;

  const legalClear =
    typeof window !== 'undefined' && (readResponsibilityAcknowledgedFromStorage() || settingsAck);

  useEffect(() => {
    if (!legalClear) return;
    if (readGuidedSourceSetupDone()) return;
    let cancelled = false;
    void new SourcesStore().read().then((s) => {
      if (cancelled) return;
      if (s.sources.length > 0 && !openRef.current) {
        setOpen(false);
        sessionBootstrapped.current = false;
        return;
      }
      if (s.sources.length > 0 && openRef.current) {
        return;
      }
      setOpen(true);
      if (!sessionBootstrapped.current) {
        setStep('source');
        lastAdded.current = null;
        setAddedSource(null);
        const sp = useSettingsStore.getState().streamProxy;
        setProxyUrl(sp?.baseUrl ?? '');
        setProxySecret(sp?.secret ?? '');
        sessionBootstrapped.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [legalClear, settingsAck]);

  async function handleSourceSubmit(submission: SourceFormSubmission): Promise<SourceValidationResult> {
    const id = newSourceId();
    const candidate: Source = { id, ...submission.source };
    const result = await validatePersistAndSnapshotSource(candidate, {
      streamProxy,
      rawM3uText: submission.rawText,
    });
    if (result.ok) lastAdded.current = result.source;
    return result;
  }

  function handleSourceSuccess(): void {
    const s = lastAdded.current;
    if (s) setAddedSource(s);
    const sp = useSettingsStore.getState().streamProxy;
    setProxyUrl(sp?.baseUrl ?? '');
    setProxySecret(sp?.secret ?? '');
    setProxyError(null);
    setStep('proxy');
  }

  function skipProxy(): void {
    setProxyError(null);
    setStep('success');
  }

  function saveProxyAndContinue(): void {
    setProxyError(null);
    const url = proxyUrl.trim();
    const secret = proxySecret.trim();
    if (!url || !secret) {
      setProxyError('Enter both proxy URL and secret, or skip this step.');
      return;
    }
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setProxyError('Proxy URL must start with http:// or https://');
        return;
      }
    } catch {
      setProxyError('Proxy URL is not valid.');
      return;
    }
    if (secret.length < 16) {
      setProxyError('Secret must be at least 16 characters (same as PROXY_SECRET on the proxy).');
      return;
    }
    setStreamProxy({ baseUrl: url, secret });
    setStep('success');
  }

  function finishToHome(): void {
    setGuidedSourceSetupDone();
    sessionBootstrapped.current = false;
    setOpen(false);
    setStep('source');
    lastAdded.current = null;
    setAddedSource(null);
    void navigate('/');
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[45] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-title"
      data-testid="first-run-wizard"
    >
      <div className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl">
        {step === 'source' ? (
          <Stack gap={4}>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Step 1 of 3</p>
              <h2 id="first-run-title" className="mt-1 text-xl font-semibold text-foreground">
                Add your first source
              </h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Connect a playlist or Xtream Codes account. You can manage more sources later in Settings.
              </p>
            </div>
            <SourceForm
              initialMode="xtream"
              onSubmit={handleSourceSubmit}
              onSuccess={handleSourceSuccess}
            />
          </Stack>
        ) : null}

        {step === 'proxy' ? (
          <Stack gap={4}>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Step 2 of 3</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Stream proxy (optional)</h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Many browsers block IPTV streams without a local proxy. If you use{' '}
                <code className="rounded bg-surface px-1 py-0.5 text-xs">apps/web-proxy</code>, enter it here — or skip
                and configure later under Settings.
              </p>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground" htmlFor="wizard-proxy-url">
                Proxy URL
              </label>
              <input
                id="wizard-proxy-url"
                type="url"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://localhost:8787"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                autoComplete="off"
              />
              <label className="block text-sm font-medium text-foreground" htmlFor="wizard-proxy-secret">
                Shared secret
              </label>
              <input
                id="wizard-proxy-secret"
                type="password"
                value={proxySecret}
                onChange={(e) => setProxySecret(e.target.value)}
                placeholder="At least 16 characters"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                autoComplete="off"
              />
              {proxyError ? <p className="text-sm text-danger">{proxyError}</p> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button variant="ghost" size="sm" focusKey="WIZARD_PROXY_SKIP" onClick={skipProxy}>
                Skip
              </Button>
              <Button variant="primary" size="sm" focusKey="WIZARD_PROXY_SAVE" onClick={saveProxyAndContinue}>
                Save &amp; continue
              </Button>
            </div>
          </Stack>
        ) : null}

        {step === 'success' && addedSource ? (
          <Stack gap={4}>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Step 3 of 3</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">You&apos;re ready</h2>
              <p className="mt-2 text-sm text-foreground-muted">Source saved on this device. Here is what we stored:</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-foreground-muted">Name</dt>
                  <dd className="text-right font-medium text-foreground">{addedSource.label}</dd>
                </div>
                {buildSourceDetailRows(addedSource, { includeInternalId: false }).map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="shrink-0 text-foreground-muted">{label}</dt>
                    <dd className="max-w-[60%] break-all text-right text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" focusKey="WIZARD_DONE" onClick={finishToHome}>
                Go to home
              </Button>
            </div>
          </Stack>
        ) : null}
      </div>
    </div>
  );
}
