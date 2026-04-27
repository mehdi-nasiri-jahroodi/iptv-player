import { serve } from '@hono/node-server';
import { createProxyApp } from './index.js';

const secret = process.env.PROXY_SECRET;
if (!secret || secret.length < 16) {
  console.error(
    '[web-proxy] PROXY_SECRET is required and must be at least 16 characters.'
  );
  console.error(
    '[web-proxy] Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  process.exit(1);
}

// Railway injects PORT; fall back to PROXY_PORT for local use, then 8787.
const port = Number(process.env.PORT ?? process.env.PROXY_PORT ?? 8787);
const hostname = process.env.PROXY_HOST ?? '0.0.0.0';
const defaultUserAgent =
  process.env.PROXY_DEFAULT_UA ?? 'IPTVSmartersPlayer 3.1';
const verbose = process.env.PROXY_LOG === 'debug';

const app = createProxyApp({
  secret,
  defaultUserAgent,
  log: verbose
    ? (event, detail) =>
        console.log(`[web-proxy] ${event}`, detail ?? '')
    : undefined,
});

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(
    `[web-proxy] listening on http://${info.address}:${info.port} (default UA: ${defaultUserAgent})`
  );
});
