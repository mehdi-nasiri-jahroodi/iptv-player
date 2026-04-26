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
   * Optional User-Agent override sent to upstream by the proxy. When
   * unset the proxy uses its `PROXY_DEFAULT_UA` (typically
   * `IPTVSmartersPlayer 3.1`). A future iteration moves this to
   * per-source overrides on `Source.userAgent`.
   */
  userAgent?: string;
}

export interface SettingsState {
  /** Stream proxy config, or `null` when the user has not configured one. */
  streamProxy: StreamProxyConfig | null;

  // ---- actions ---------------------------------------------------------------
  setStreamProxy(config: StreamProxyConfig): void;
  clearStreamProxy(): void;
}

const STORAGE_KEY = 'iptv.settings.v1';

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
    }),
    {
      name: STORAGE_KEY,
      // Use a JSON storage so structured values survive reloads. SSR / private
      // mode degrades to a no-op via Zustand's built-in fallback.
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Only persist the configurable bits; nothing else lives in this
      // slice yet but we list the keys explicitly so future ephemeral
      // fields (e.g. "Test connection in progress") do not leak.
      partialize: (state) => ({ streamProxy: state.streamProxy }),
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
