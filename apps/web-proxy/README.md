# `apps/web-proxy`

A small HMAC-authenticated HTTP proxy that lets the browser-based **`apps/web`** target play streams whose origin server does not send `Access-Control-Allow-Origin`. This is the typical case for commercial Xtream panels — native players (IPTV Smarters, ExoPlayer, VLC) do not enforce CORS, but browsers do.

> **You run this yourself.** It is **not** hosted by the project. Stand up your own instance on your machine, your VPS, or expose it via ngrok. Your responsibility, your bandwidth, your jurisdiction.

## What it does

- Verifies an HMAC-SHA256 signature on every `/stream` request — without the right secret, the proxy is not an open relay.
- Decodes the upstream URL from a base64url query parameter, fetches it server-side (following redirects), and streams the body back with `Access-Control-Allow-Origin: *`.
- Forges a configurable `User-Agent` (`IPTVSmartersPlayer 3.1` by default). Many panels reject browser UAs; many accept TV-client UAs.
- Forwards `Range` request and response headers so HLS / DASH segment seeking works.
- Strips upstream cache and cookie headers so live playback isn't broken by stale intermediaries.
- Logs request count and status only — never URLs, UAs, or IPs.

## What it does **not** do

- It does not store anything.
- It does not authenticate users — the HMAC just gates request authenticity, not identity.
- It does not transmux MPEG-TS to fMP4 (Shaka limitation; out of scope for the proxy).
- It does not solve panels that block by IP / ASN — only the network path between the proxy and the upstream is changed; if the upstream blocks your VPS IP, the proxy is blocked too.

## Configuration

| Env var             | Required | Default                  | Notes |
| ------------------- | -------- | ------------------------ | ----- |
| `PROXY_SECRET`      | yes      | —                        | At least 16 chars. Same value goes into the web app's Settings page. |
| `PROXY_PORT`        | no       | `8787`                   | TCP port to bind. |
| `PROXY_HOST`        | no       | `0.0.0.0`                | Bind address. `0.0.0.0` lets ngrok / LAN reach it. |
| `PROXY_DEFAULT_UA`  | no       | `IPTVSmartersPlayer 3.1` | Sent to upstream when the per-request `ua` query parameter is absent. |
| `PROXY_LOG`         | no       | (off)                    | Set to `debug` to log per-request status. |

Generate a secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Running

From the workspace root:

```sh
PROXY_SECRET=<32-byte hex> pnpm exec nx run web-proxy:serve
```

Or built once and run with plain Node:

```sh
pnpm exec nx run web-proxy:build
PROXY_SECRET=<...> node apps/web-proxy/dist/main.js
```

### Exposing it for TV browser testing (ngrok)

```sh
PROXY_SECRET=<...> pnpm exec nx run web-proxy:serve   # terminal 1
ngrok http 8787                                       # terminal 2
```

Then plug the `https://*.ngrok-free.app` URL into the web app's **Settings → Stream proxy**.

## API

### `GET /healthz`

Returns `200 ok`. Use to verify the proxy is reachable from the web app's "Test connection" button.

### `GET /stream?u=<base64url(upstreamUrl)>&ua=<encoded?>&sig=<hex>`

- `u` — the upstream URL, base64url-encoded (no padding).
- `ua` — optional. Overrides `PROXY_DEFAULT_UA` for this request.
- `sig` — hex HMAC-SHA256 of `${u}|${ua ?? ''}` using `PROXY_SECRET`.

Returns the upstream body verbatim with permissive CORS headers. Forwards `Range` request → upstream and `Content-Range` / `Content-Length` / `Accept-Ranges` upstream → client.

`OPTIONS /stream` is supported for CORS preflight.

## Threat model (in plain terms)

- **Open relay risk:** without the HMAC, anyone on the internet who finds your URL could fetch arbitrary content through your IP. The HMAC closes that.
- **Secret leakage:** the secret lives in the web app's localStorage and is computed in-browser via Web Crypto. If your laptop is compromised, the secret leaks. Rotate it (regenerate, update the proxy env, update the web app Settings page).
- **Logs:** disabled by default. If you flip on `PROXY_LOG=debug` for troubleshooting, remember it logs upstream status codes only — still no URLs or IPs.

## Failure modes worth knowing

| Symptom in web app | Likely cause |
| ------------------ | ------------ |
| `403` from proxy | Wrong secret in Settings, or clock skew (we don't use timestamps so this is rare). |
| `502` from proxy | Upstream refused the connection or DNS failed. Test with `curl` from the proxy host. |
| Plays in `curl`, fails in browser | Browser's mixed-content rules. If the web app is HTTPS, the proxy must also be HTTPS — use the ngrok HTTPS URL, not the HTTP one. |
| Works for some streams, 403 for others | Upstream is rejecting your forged UA. Try a per-source `userAgent` override. |
