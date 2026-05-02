# `apps/web-proxy` — agent context

Scoped to `apps/web-proxy/`. For repo-wide rules read the root [`AGENTS.md`](../../AGENTS.md). For web-app integration details read [`apps/web/AGENTS.md`](../web/AGENTS.md).

## Version control — HARD RULE (mirrors root `AGENTS.md`)

**NEVER commit. NEVER push. NEVER tag. NEVER amend. NEVER force-push.** No exceptions. Prepare diffs and run typecheck/tests, then stop. The user runs all Git commands themselves.

## What this project is

A small **user-run** HTTP proxy that the `apps/web` target uses to bypass browser CORS when playing streams from servers that do not send `Access-Control-Allow-Origin` (the default for commercial Xtream panels). The user runs it themselves on their machine, LAN, or behind ngrok. **The project does not host this proxy.** See [README.md](./README.md) for end-user docs.

This file documents the contract and constraints so future agent sessions don't accidentally turn it into something else.

## Stack

| Concern | Choice |
| ------- | ------ |
| Runtime | **Node.js** (≥ 20, for global `fetch`) |
| HTTP framework | **[Hono](https://hono.dev)** (`hono` + `@hono/node-server`) |
| Language | **TypeScript** ESM |
| Build | `tsc --build` (no bundler — Node consumes the `dist/*.js` directly) |
| Dev runner | `tsx watch` |
| Tests | `vitest` (Node environment) |
| Auth | HMAC-SHA256 via `node:crypto` |

Why Hono: it's tiny (~15 KB), runtime-portable (Node, Deno, Bun, Workers — same code), has well-typed routing, and integrates cleanly with `vitest` via `app.request(...)` for in-process testing without spinning up a real HTTP server.

## Hard constraints (do not change without an explicit user decision)

1. **No state.** No database, no filesystem writes, no in-memory caches of upstream content. The proxy is a pure function of `request → response`.
2. **No logging of URLs, UAs, or IPs.** The default log function is a no-op. If `PROXY_LOG=debug` is set, log status codes and event names only — never the upstream URL, the User-Agent, or the client IP. Less data to subpoena.
3. **HMAC is mandatory.** The proxy must refuse to start if `PROXY_SECRET` is missing or shorter than 16 characters. Every `/stream` request must verify HMAC in constant time. We will never add a "no-auth mode," even for dev.
4. **`createProxyApp({ ... })` is the only public API.** `src/index.ts` exports the factory; `src/main.ts` is the process entry. Tests import the factory and inject a stub `fetchImpl` — they must never start a real HTTP server or hit the network.
5. **Allowed schemes are `http:` and `https:` only.** Reject `file:`, `gopher:`, `data:`, anything else with `400`.
6. **Strip `set-cookie` from upstream responses.** A panel that tries to set a cookie has no business doing so to the user's browser via us.
7. **Override `cache-control` to `no-store`.** HLS manifests and live segments must not be cached by intermediaries.

## Soft conventions

- Keep the Hono app under ~150 lines. If it grows, the proxy is doing too much.
- Tests live in `tests/proxy.spec.ts` next to the project root (mirrors `packages/core/src/lib/*.spec.ts` style — but here we keep them out of `src/` so the bundle output stays clean).
- Use `vi.fn<typeof fetch>(...)` (typed) for the `fetchImpl` stub so `mock.calls[0][0]` infers correctly. Untyped `vi.fn` defaults to `[]` and breaks `tsc --build`.
- `process.env` access only in `src/main.ts`. The library code (`src/index.ts`) takes config via the factory argument so it stays testable.

## How `apps/web` consumes this

The web app holds a `streamProxy: { baseUrl, secret } | null` setting (Settings page → localStorage). When set, `useShakaPlayer` registers a Shaka request filter that rewrites manifest + segment URLs to:

```
${baseUrl}/stream?u=<base64url(upstreamUrl)>&ua=<encoded UA?>&sig=<hex HMAC>
```

The HMAC is computed in-browser with the Web Crypto API over the same canonical payload (`${u}|${ua ?? ''}`) using the same secret. The Node/Worker side uses `node:crypto`. Both must agree byte-for-byte.

When the web app calls `${baseUrl}/healthz` from its "Test connection" button, that's the only endpoint the proxy exposes besides `/stream`.

## Out of scope (don't add without an explicit decision)

- Rate limiting (the user runs one instance for themselves; ngrok edge soaks abuse).
- A web UI / admin panel.
- Multi-tenant secret management.
- Caching upstream responses.
- Transmuxing MPEG-TS HLS segments to fMP4 (a Shaka-side concern; would belong in `packages/player`).
- Cloudflare Workers / Fly / Deno deploy targets in CI. The user deploys manually.
- Built-in TLS. Run behind ngrok / Caddy / nginx if you need HTTPS.

## Common pitfalls

- **Header forwarding direction matters.** Forward `Range` *request* and `Content-Range` / `Content-Length` / `Accept-Ranges` *response*. Don't forward `Connection` or `Transfer-Encoding` either way.
- **`fetch` follows redirects by default.** Good — we want the upstream redirect handled server-side so the browser never sees a cross-origin redirect.
- **`Buffer.from(str, 'base64url')` returns a Buffer with truncated bytes if the input has invalid chars.** Always decode then UTF-8-stringify and check length, as `DECODE_BASE64URL` does. Don't trust the buffer length.
