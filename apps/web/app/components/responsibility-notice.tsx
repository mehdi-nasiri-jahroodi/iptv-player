import { useLayoutEffect, useState } from 'react';
import { Button } from 'ui';
import {
  importLegacyResponsibilityAckToDedicatedKeyOnce,
  readResponsibilityAcknowledgedFromStorage,
  useSettingsStore,
} from '../store/settings-store';

/**
 * First-launch modal: user acknowledges they are responsible for what they stream.
 *
 * Visibility is driven **only** by `iptv.viewer_responsibility_ack_v1 === '1'`
 * (see `readResponsibilityAcknowledgedFromStorage`). We do not use the Zustand
 * value for hiding the modal — it can still be `true` from the settings blob
 * after you delete the dedicated key for testing. After "I understand" we
 * bump local state so React re-reads storage even when Zustand’s boolean was
 * already `true` (its selector would not re-render).
 *
 * On mount we run a **one-time** legacy import (old ack only in `iptv.settings.v1`
 * → dedicated key + `iptv.responsibility_legacy_blob_imported_v1`) so existing
 * users are not prompted again; after that flag exists, clearing the dedicated
 * key alone shows the modal again.
 */
export function ResponsibilityNotice() {
  const [clientMounted, setClientMounted] = useState(false);
  /** Bumped after "I understand" so we re-read localStorage even when Zustand's
   * `acknowledgedResponsibilityV1` was already `true` (selector would not re-render). */
  const [storageGateNonce, setStorageGateNonce] = useState(0);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    importLegacyResponsibilityAckToDedicatedKeyOnce();
    setClientMounted(true);
  }, []);

  const setAcknowledged = useSettingsStore((s) => s.setAcknowledgedResponsibilityV1);

  if (!clientMounted) return null;

  if (readResponsibilityAcknowledgedFromStorage()) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="responsibility-title"
      data-testid="responsibility-notice"
      data-ack-gate={String(storageGateNonce)}
    >
      <div className="max-w-lg rounded-lg border border-border bg-background p-6 text-foreground shadow-xl">
        <h2 id="responsibility-title" className="text-lg font-semibold text-foreground">
          Before you stream
        </h2>
        <p className="mt-3 text-sm text-foreground-muted">
          You are responsible for the content you access. This app does not host channels or playlists.
          The optional stream proxy runs on your machine — only stream content you have the right to view.
        </p>
        <div className="mt-6 flex justify-end">
          <Button
            variant="primary"
            focusKey="RESPONSIBILITY_ACK"
            onClick={() => {
              setAcknowledged(true);
              setStorageGateNonce((n) => n + 1);
            }}
          >
            I understand
          </Button>
        </div>
      </div>
    </div>
  );
}
