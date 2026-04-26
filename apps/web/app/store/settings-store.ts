import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * settingsStore — user-tweakable runtime preferences.
 *
 * Currently scoped to the **stream proxy** (`apps/web-proxy`). Browsers
 * cannot reach Xtream HLS streams directly because commercial Xtream
 * panels never emit `Access-Control-Allow-Origin`. The user runs the
 * companion proxy locally (or exposes it via ngrok for TV browsers) and
 * pastes its URL + secret here; playback then routes through it.
 *
 * Persisted in `localStorage` under `iptv.settings.v1` via Zustand's
 * `persist` middleware. The shape is versioned via a top-level `version`
 * field so future migrations (more settings, schema changes) stay
 * tractable.
 *
 * Security note: the proxy secret never leaves this browser. It is used
 * client-side only to compute HMAC signatures for proxy URLs. We do not
 * log it or include it in error diagnostics.
 */

/** Configuration for routing playback through the user-run web proxy. */
export interface StreamProxyConfig {
  /**
   * Base URL of the proxy, e.g. `http://localhost:8787` or
   * `https://abc123.ngrok.app`. Trailing slash is stripped on save.
   */
  baseUrl: string;
  /**
   * Shared HMAC secret matching the proxy's `PROXY_SECRET` env. Must be
   * at least 16 characters. Stored in localStorage on this device only.
   */
  secret: string;
  /**
   * Optional User-Agent override sent to upstream by the proxy for all
   * sources that do not set `Source.userAgent`. When unset the proxy uses
   * its `PROXY_DEFAULT_UA` (typically `IPTVSmartersPlayer 3.1`).
   */
  userAgent?: string;
}

export interface SettingsState {
  /** Stream proxy config, or `null` when the user has not configured one. */
  streamProxy: StreamProxyConfig | null;
  /**
   * One-time legal acknowledgement for streaming responsibility + optional
   * proxy (see `ResponsibilityNotice` in the web app).
   */
  acknowledgedResponsibilityV1: boolean;

  // ---- actions ---------------------------------------------------------------
  setStreamProxy(config: StreamProxyConfig): void;
  clearStreamProxy(): void;
  setAcknowledgedResponsibilityV1(value: boolean): void;
}

export const SETTINGS_STORAGE_KEY = 'iptv.settings.v1';

/**
 * Dedicated flag so the “Before you stream” gate does not depend on Zustand
 * rehydration order or JSON shape — a single synchronous `getItem` after mount.
 * Kept in sync with `acknowledgedResponsibilityV1` on the settings store.
 */
export const RESPONSIBILITY_ACK_STORAGE_KEY = 'iptv.viewer_responsibility_ack_v1';

/**
 * Set when we have **stopped** auto-copying ack from the settings JSON blob
 * into the dedicated key. After this is `'1'`, clearing only the dedicated key
 * is treated as intentional (e.g. QA) — the modal can show again even if the
 * blob still has `acknowledgedResponsibilityV1: true`.
 */
export const RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY =
  'iptv.responsibility_legacy_blob_imported_v1';

/**
 * Read `acknowledgedResponsibilityV1` from the Zustand persist blob (legacy).
 * **Synchronous** JSON parse of `iptv.settings.v1`.
 */
export function readAcknowledgedResponsibilityV1FromSettingsBlob(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return false;
    const asRecord = parsed as Record<string, unknown>;

    if ('state' in asRecord && asRecord.state && typeof asRecord.state === 'object') {
      return Boolean(
        (asRecord.state as { acknowledgedResponsibilityV1?: boolean })
          .acknowledgedResponsibilityV1
      );
    }
    if ('acknowledgedResponsibilityV1' in asRecord) {
      return Boolean(asRecord.acknowledgedResponsibilityV1);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * True only when the **dedicated** ack key is set. The modal must not consult
 * the settings JSON blob here — that stays `true` after QA clears the
 * dedicated key, which would wrongly hide the modal and re-trigger migration.
 */
export function readResponsibilityAcknowledgedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RESPONSIBILITY_ACK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One-time upgrade: older builds only stored ack inside `iptv.settings.v1`.
 * Copy that into the dedicated key **once**; afterwards we never re-fill from
 * the blob so deleting the dedicated key can surface the modal again.
 */
export function importLegacyResponsibilityAckToDedicatedKeyOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(RESPONSIBILITY_ACK_STORAGE_KEY) === '1') {
      // Older builds wrote the dedicated key but not the import-done flag; set it
      // so clearing the dedicated key later does not re-trigger blob → key copy.
      if (window.localStorage.getItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY) !== '1') {
        window.localStorage.setItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY, '1');
      }
      return;
    }
    if (window.localStorage.getItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY) === '1') {
      return;
    }
    if (!readAcknowledgedResponsibilityV1FromSettingsBlob()) {
      return;
    }
    window.localStorage.setItem(RESPONSIBILITY_ACK_STORAGE_KEY, '1');
    window.localStorage.setItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Strip a trailing slash so we can join paths with `/healthz`, `/stream`
 * etc. without doubling separators. Empty strings are returned untouched.
 */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      streamProxy: null,
      acknowledgedResponsibilityV1: false,

      setStreamProxy(config) {
        set({
          streamProxy: {
            baseUrl: normalizeBaseUrl(config.baseUrl.trim()),
            secret: config.secret,
            userAgent:
              config.userAgent && config.userAgent.trim()
                ? config.userAgent.trim()
                : undefined,
          },
        });
      },

      clearStreamProxy() {
        set({ streamProxy: null });
      },

      setAcknowledgedResponsibilityV1(value: boolean) {
        if (value && typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(RESPONSIBILITY_ACK_STORAGE_KEY, '1');
            window.localStorage.setItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY, '1');
          } catch {
            // ignore
          }
        }
        set({ acknowledgedResponsibilityV1: value });
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      // Use a JSON storage so structured values survive reloads. SSR / private
      // mode degrades to a no-op via Zustand's built-in fallback.
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Only persist the configurable bits; nothing else lives in this
      // slice yet but we list the keys explicitly so future ephemeral
      // fields (e.g. "Test connection in progress") do not leak.
      partialize: (state) => ({
        streamProxy: state.streamProxy,
        acknowledgedResponsibilityV1: state.acknowledgedResponsibilityV1,
      }),
    }
  )
);

/** Returns true when a usable proxy config is present. */
export function hasStreamProxy(state: SettingsState): boolean {
  return (
    state.streamProxy !== null &&
    state.streamProxy.baseUrl.length > 0 &&
    state.streamProxy.secret.length >= 16
  );
}
