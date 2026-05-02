import { useState } from 'react';
import { Button } from 'ui';
import { hasStreamProxy, useSettingsStore } from '../store/settings-store';
import { SettingsStreamProxyModal } from './settings-stream-proxy-modal';

/**
 * Settings root: read-only stream proxy summary. Add/edit + test connection use {@link SettingsStreamProxyModal}.
 */
export function SettingsStreamProxySection() {
  const streamProxy = useSettingsStore((s) => s.streamProxy);
  const configured = useSettingsStore((s) => hasStreamProxy(s));
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-5" data-testid="settings-proxy" id="settings-proxy">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-foreground">Stream proxy</h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
              Optional companion for this web app: routes playlist checks and playback through your machine when the
              browser blocks direct stream URLs (CORS). Run <code className="rounded bg-background px-1 py-0.5 text-xs">apps/web-proxy</code> and
              configure it in the editor — details stay on this device only.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            focusKey="SETTINGS_PROXY_OPEN_MODAL"
            onClick={() => setModalOpen(true)}
          >
            {configured ? 'Edit stream proxy' : 'Add stream proxy'}
          </Button>
        </div>

        <div className="mt-5 rounded-md border border-border bg-background px-4 py-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Current status</h3>
          <dl className="mt-3 grid max-w-2xl grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(7rem,max-content)_1fr]">
            <dt className="text-sm text-foreground-muted">Configured</dt>
            <dd className="text-sm font-medium text-foreground">{configured ? 'Yes' : 'No'}</dd>
            {configured && streamProxy ? (
              <>
                <dt className="text-sm text-foreground-muted">Proxy URL</dt>
                <dd className="break-all text-sm text-foreground">{streamProxy.baseUrl}</dd>
                <dt className="text-sm text-foreground-muted">Secret</dt>
                <dd className="text-sm text-foreground">Stored locally (not shown)</dd>
                {streamProxy.userAgent ? (
                  <>
                    <dt className="text-sm text-foreground-muted">User-Agent</dt>
                    <dd className="break-all text-sm text-foreground">{streamProxy.userAgent}</dd>
                  </>
                ) : null}
              </>
            ) : null}
          </dl>
          {!configured ? (
            <p className="mt-3 text-xs text-foreground-muted">
              You can add credentials later; playback may still work depending on your provider and browser.
            </p>
          ) : null}
        </div>
      </section>

      <SettingsStreamProxyModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
