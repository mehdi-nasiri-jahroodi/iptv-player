import type { Source } from 'core';
import type { StreamProxyOption } from 'player';
import type { StreamProxyConfig } from '../store/settings-store';

function proxyReady(config: StreamProxyConfig | null): config is StreamProxyConfig {
  return (
    config !== null &&
    config.baseUrl.length > 0 &&
    config.secret.length >= 16
  );
}

/**
 * Build the `streamProxy` object for Shaka when the user configured a proxy.
 * Per-source `userAgent` overrides the global Settings UA for HMAC signing.
 */
export function streamProxyForPlayback(
  config: StreamProxyConfig | null,
  source: Pick<Source, 'userAgent'> | null | undefined
): StreamProxyOption | null {
  if (!proxyReady(config)) {
    return null;
  }
  const fromSource = source?.userAgent?.trim();
  return {
    baseUrl: config.baseUrl,
    secret: config.secret,
    userAgent: fromSource || config.userAgent,
  };
}
