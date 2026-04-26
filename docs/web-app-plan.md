# Web App — Implementation Plan

> **Scope**: First client to build per the delivery order in `platforms.md` (Web → Android TV → LG webOS).  
> This document translates the product vision and feature backlog into a concrete, phased plan for the React web app.

---

## 0. Handoff status (read this first)

**As of this revision, Phase 1 is complete and Phase 2 is complete** for the MVP checklist below (stretch: Now/Next strip remains optional / Phase 3). The source → browse → play loop works end-to-end with a real commercial Xtream provider, including a user-run CORS proxy. See [§6 Phase 2](#phase-2--mvp-core-flows) for the per-task checklist.

**What works today:**

- Add an Xtream / M3U URL / M3U file source; validated and persisted to localStorage. Optional **`Source.userAgent`** per source (overrides the global proxy UA for HMAC signing when a stream proxy is set).
- Browse Live / VOD / Series via the Home tile launcher → `/browse/:kind` (groups sidebar + channel list + inline live player).
- Promote-to-fullscreen at `/play/:sourceId/:kind/:channelId` with custom Lumina-themed controls.
- Friendly error overlay with **Retry** and **Copy diagnostics**; Shaka **1002** hints mention **Settings → stream proxy** when no proxy is configured.
- **User-run CORS proxy** (`apps/web-proxy`) with HMAC-SHA256 auth + HLS manifest rewriting; configured in `/settings` and routed through automatically when set. End-to-end verified against a real Xtream stream that previously failed with Shaka code 1002.
- Xtream catalog cached in IndexedDB; reloads don't refetch.
- **Audio / subtitle track picker** on `<PlayerControls>` (Shaka `tracks` + `selectTrack`).
- **Favorites** (heart on channel rows + selected panel) and **recents** (persisted on channel select / play) via **`profileStore`** (`iptv.profile.v1`).
- **Profile display name** on Home + **Settings → Profile**; first-launch **`ResponsibilityNotice`** (“Before you stream”). Modal visibility uses a **dedicated** `localStorage` key **`iptv.viewer_responsibility_ack_v1`** (`=== '1'`), not the Zustand JSON blob alone — so clearing that key surfaces the modal again for QA. **`acknowledgedResponsibilityV1`** stays on **`settingsStore`** (`iptv.settings.v1`) in sync. One-time legacy import copies an old blob-only ack into the dedicated key and sets **`iptv.responsibility_legacy_blob_imported_v1`** so the blob is not re-applied after that. On **I understand**, local React state increments so the overlay closes even when Zustand’s boolean was already `true` (Zustand selectors would otherwise skip a re-render).

**Phase 2 stretch (still optional here):** Now/Next strip on channel cards → prefer Phase 3 with EPG.

**Stretch (defer to Phase 3 if not done):** Now/Next strip on channel cards.

**Critical context for whoever picks this up:**

- **Never commit or push without explicit user permission.** The user runs commits manually.
- `opencode.json` has an uncommitted `$schema` change — **always exclude it from staged commits**.
- Lumina design tokens only — no raw hex, no Tailwind default palette (`bg-gray-500`, `text-red-500`, etc). **There is no `text-success` token** — use `text-foreground`. See `packages/config/tokens/`.
- `packages/ui` is **headless** — no fetch / storage / routing imports. Schema imports from `@iptv-player/core` are also forbidden in `packages/ui`; components are generic over their item shapes.
- `packages/player` wraps Shaka; both `apps/web` (live inline + fullscreen `/play`) and a future `apps/webos` consume it.
- `core` barrel must NOT re-export Node-only modules.
- pnpm workspace; `corepack pnpm` if pnpm not in PATH. Use `pnpm exec nx ...` for tasks.
- Zustand v5: selectors must NOT return new refs each render.
- `FormField` uses **render-prop children** `({ inputId, describedBy }) => ReactNode`, not a bare ReactNode.
- Vite `resolve.conditions` includes `'iptv-player'` first — keep it.
- Settings store uses Zustand `persist` middleware (key `iptv.settings.v1`, version 1). Sources use the class-based `LocalStorageAdapter` pattern (key `iptv.sources.v1`). Viewer responsibility ack also uses **`iptv.viewer_responsibility_ack_v1`** + **`iptv.responsibility_legacy_blob_imported_v1`** (see `apps/web/app/store/settings-store.ts` and `responsibility-notice.tsx`).
- The proxy is **user-run only** — production hosting was explicitly rejected. HMAC payload is `${u}|${ua ?? ''}`.

**Repo state at handoff:**

- After Phase 2 closure: run `pnpm exec nx run-many --target=test,lint,build --all` before merge; regenerate `packages/core/schemas/` when `contracts.ts` changes (`node packages/core/scripts/generate-schemas.mjs` after `nx run core:build`).

---

## 1. Goals for the web app

- Deliver a **working MVP** that validates core flows: add source → browse channels → play.
- Establish the **shared packages** (`packages/core`, `packages/ui`) that Android TV and webOS will later consume.
- Prove out the **Norigin Spatial Navigation** + keyboard/D-pad model in a browser before TV hardware targets it.

---

## 2. Repository bootstrap

Before writing product code, the Nx monorepo must exist.

> **Existing repo**: this repository already contains `docs/` and other files. Do **not** run `create-nx-workspace` inside it — that command scaffolds a new directory and will overwrite the tree. Instead, run it from the **parent folder** (`cd ..` first) and merge the result, or use `npx nx@latest init` to add Nx to the existing repo in place.

| Step | Command / action | Status |
| ---- | ---------------- | ------ |
| Init Nx in existing repo | Run from repo root: `npx nx@latest init` (adds `nx.json`; follow prompts) | Done |
| Add web app | `nx g @nx/react:app apps/web` (React Router 7 + Vite + Tailwind) | Done |
| Add shared packages | `nx g @nx/js:lib packages/core` and `nx g @nx/react:lib packages/ui` | Done |
| Install Shaka Player | `pnpm add shaka-player -w` (workspace root; peer for `packages/ui`) | Done |
| Install Norigin Spatial Nav | `pnpm add @noriginmedia/norigin-spatial-navigation -w` (root; peer of `packages/ui`) | Done |
| Install Zod | Declared on `packages/core` (`zod`, `zod-to-json-schema`) | Done |
| Tailwind CSS | Shared preset in `packages/config`; `apps/web` + `packages/ui` extend it | Done |

**Dependency placement note**: `packages/ui` wraps Norigin components and may contain shared player chrome, so `@noriginmedia/norigin-spatial-navigation`, `react`, and `shaka-player` must be listed as `peerDependencies` of `packages/ui` (and `packages/core` where applicable), not only in `apps/web`. This prevents version mismatches when webOS later consumes the same packages.

Confirm the workspace builds and lints cleanly before adding product code.

---

## 3. Shared package contracts (`packages/core`)

Define data shapes first — they drive everything else and will later be consumed by Android TV via JSON Schema export.

### 3.1 Domain models (Zod schemas)

```
Source          — id, label, type (m3u_url | m3u_file | xtream), url?, credentials?, userAgent?, epgUrl?
Channel         — id, name, groupTitle, streamUrl, logoUrl?, tvgId?
ChannelGroup    — id, name, channels[]
Playlist        — sourceId, groups[], fetchedAt
EpgProgram      — channelId, title, start, end, description?
EpgGuide        — programs[] keyed by channelId
AppSettings     — theme, playerBufferMode, ...
UserProfile     — id, name, favorites[], recents[]
```

Export JSON Schema artifacts (`packages/core/schemas/`) for future Android TV alignment using **`zod-to-json-schema`** (`pnpm add zod-to-json-schema -w`). Add a small build script that calls `zodToJsonSchema(SourceSchema)` etc. and writes the output files; run it as an Nx target so CI always has fresh artifacts.

### 3.2 Core utilities

- **M3U parser** — converts raw M3U/M3U8 text to `Playlist`.
- **Xtream client** (optional, gated) — fetches channels from an Xtream Codes-compatible API.
- **EPG parser** — parses XMLTV to `EpgGuide`.
- **Source validator** — reachability check + parse sample; returns typed error codes.  
  > **CORS caveat**: browsers block cross-origin fetches to most M3U/playlist URLs. The validator (and any playlist fetch at runtime) will silently fail for the majority of real-world hosts. Plan for this from Phase 1:  
  > 1. **Primary fallback — paste raw text**: always offer a "paste playlist content" path alongside the URL input so users can bypass CORS entirely.  
  > 2. **Optional proxy**: a thin same-origin or user-configured proxy can relay requests; document clearly that the user's URLs pass through it.  
  > 3. **File import**: already planned; works without CORS restrictions.  
  > Validate the URL format client-side, but do not treat a network CORS error as "invalid source" — surface it as a distinct, actionable error code (`cors_blocked`) with instructions.
- **Storage adapter interface** — `get / set / remove` — implemented as `localStorage` in the web app; swappable for Android.

---

## 4. Shared UI package (`packages/ui`)

Reusable React + Tailwind components used by both `apps/web` and later `apps/webos`.

| Component | Notes |
| --------- | ----- |
| `FocusableItem` | Wraps Norigin `useFocusable`; base for all interactive elements |
| `Button` | **Built** (`packages/ui/src/lib/Button.tsx`) — variants `primary` / `ghost` / `danger`, sizes `sm` / `md`, focus-aware via Norigin (Enter triggers click), loading state. |
| `FormField`, `TextField`, `TextArea` | **Built** (`packages/ui/src/lib/`) — render-prop `FormField` handles label + hint/error + a11y ids; `TextField` / `TextArea` are focus-aware inputs. |
| `Tabs` | **Built** (`packages/ui/src/lib/Tabs.tsx`) — generic over `TValue extends string`; headless tablist + panels, focus-aware tabs, controlled or uncontrolled. |
| `SourceForm` | **Built** (`packages/ui/src/lib/SourceForm.tsx`) — tabbed input for the three source types: **M3U URL**, **M3U file**, and **Xtream Codes** (host + username + password). Internal `sourceFormDraftSchema` (Zod discriminated union) validates the draft; `draftToSubmission()` maps to the persisted `Source` shape. Caller-owned `onSubmit(submission) → Promise<SourceValidationResult>` runs the probe (`validateSource` from `core`); `onSuccess(source)` fires on `ok`; inline alert maps `SourceValidationError` codes → user messages and exposes the raw code via `data-error-code`. Paste-raw-text fallback on the URL tab; file picker on the file tab auto-fills the label. |
| `ChannelCard` | **Built** (`packages/ui/src/lib/ChannelCard.tsx`) — focus-aware tile (`role="button"`); logo with initial-badge fallback, name, group title, optional `nowPlaying` and **`trailing`** slots. Headless: never imports `Channel` from `core`. |
| `ChannelGrid` / `ChannelList` | **Built** (`packages/ui/src/lib/ChannelList.tsx`) — `ChannelList` is the vertical, focus-bounded list (Norigin `FocusContext` + `saveLastFocusedChild`). Generic over a `ChannelListItem` shape so the same component will render live channels today and VOD/series tiles in Phase 4. Virtualization is a Phase 4 follow-up; the public API is stable. `ChannelGrid` not yet built — list is sufficient for Phase 2. |
| `CatalogTile` | **Built** (`packages/ui/src/lib/CatalogTile.tsx`) — large focus-aware launcher tile (icon + title + subtitle + count). Used by the Home tile launcher (Live / Movies / Series); reusable for future surfaces (group tiles, source tiles). |
| `EpgGrid` | Time-axis grid; simplified for MVP |
| `PlayerOverlay` | Controls, track picker, error state |
| `SettingsPanel` | Theme toggle, player toggles |
| `Dialog` / `Toast` | Feedback primitives |

Keep components **headless-friendly** — logic in hooks, styles via Tailwind classes — so webOS can override tokens without forking.

---

## 4b. Shared player package (`packages/player`)

Wraps **Shaka Player** in a single React-friendly hook plus a headless component, so both `apps/web` and a future `apps/webos` mount playback the same way without re-implementing lifecycle or track plumbing.

| Export | Notes |
| ------ | ----- |
| `loadShakaModule()` | **Built** — lazy, browser-only `await import('shaka-player')` with polyfills installed; throws on SSR. |
| `useShakaPlayer(videoRef, streamUrl, options?)` | **Built** — owns the Shaka instance, surfaces `{ status, buffering, error, tracks, media, selectTrack, retry, destroy, play, pause, seek, setVolume, setMuted, toggleFullscreen }`. `media` mirrors the `<video>` element's state (paused, currentTime, duration, seekable, volume, muted) for control overlays. Tears down on `streamUrl` change so live channel-surf is safe. Errors fire through both the returned state and the `onError` callback. |
| `Player` | **Built** — headless React component; consumer styles the frame, optional render-prop child paints overlays from the hook API. |
| `PlayerControls` | **Built** — Lumina-themed playback bar (play/pause, mute, volume, time, scrubber, **tracks menu** for audio/subtitles, fullscreen). Hides scrubber for live (uses `media.seekable`); auto-hides 3s after last pointer/focus event while playing. Each control is a focusable `<button>` so Norigin picks them up via the consumer's `useFocusable` boundary. |

Listed `react`, `react-dom`, `shaka-player`, and `lucide-react` as `peerDependencies` to avoid duplicate copies when both `apps/web` and `apps/webos` consume it.

**Stream proxy integration**: `useShakaPlayer` accepts an optional `streamProxy: { baseUrl, secret, userAgent? }` and registers a Shaka `NetworkingEngine` request filter that rewrites MANIFEST + SEGMENT URIs through `${baseUrl}/stream?u=<base64url>&ua=<override>&sig=<hmac>`. Already-proxied URLs are skipped to avoid double-signing segments the proxy itself rewrote in the manifest body. The proxy config is read through a ref so settings tweaks don't re-mount the player. See `packages/player/src/lib/proxy-signing.ts` for the HMAC scheme (canonical payload `${u}|${ua ?? ''}`, lowercase hex SHA-256).

---

## 4c. CORS proxy (`apps/web-proxy`)

Browsers block cross-origin fetches to most M3U / HLS hosts, which prevents Shaka from loading playlists or segments. The proxy is a **user-run** Hono service (Node 20+) that:

- Authenticates each request with an HMAC-SHA256 signature in the query string.
- Forges a configurable `User-Agent` (default `IPTVSmartersPlayer 3.1`) so providers that gate by UA accept the request.
- Forwards `Range` headers for seekable VOD.
- Detects HLS manifest content types and rewrites every URI inside the playlist (≤1 MiB) so segment fetches also flow through the proxy. DASH `.mpd` rewriting is **out of scope** — HLS only.
- Includes `Access-Control-Allow-Origin: *` on `/healthz` so the Settings page can verify reachability cross-origin.

Production hosting (Cloudflare Workers / Fly / etc.) was explicitly **rejected** — the proxy ships as a self-host artifact only. Logs **never** include URLs, UAs, or client IPs.

---

## 5. Web app structure (`apps/web`)

```
apps/web/
  app/                        # React Router 7 layout + page modules
    root.tsx                  # html shell, AutoTheme, SpatialNavigationRoot, AppNav
    routes.tsx                # URL → page-module manifest
    app-nav.tsx               # top nav (NavLinks + ThemeToggle)
    auto-theme.tsx            # theme prefs (auto/light/dark)
    spatial-navigation-root.tsx  # Norigin init/destroy
    pages/                    # one default-exported component per route
      home.tsx                # (Phase 2) tile launcher: Live / Movies / Series + source switcher
      add-source.tsx          # source wizard (built)
      settings.tsx            # built — profile name, stream proxy, legal ack flag; persisted via Zustand
      browse/
        $kind.tsx             # /browse/:kind — wraps the shared BrowseView
      play.tsx                # /play/:sourceId/:kind/:channelId — fullscreen player
      dev/
        design-tokens.tsx     # dev-only Token lab
        play-test.tsx         # dev-only Shaka HLS smoke test
    components/               # cross-page presentational components
      browse-view.tsx         # group sidebar + search + ChannelList + inline live player
      favorite-channel-button.tsx
      responsibility-notice.tsx
      refresh-source-button.tsx  # ghost button → loadForSource(source, { force: true })
    features/                 # feature folders (hooks + state)
      sources/                # SourcesStore, PlaylistsStore, newSourceId
      cache/                  # IndexedDB Xtream cache adapter
    lib/
      playback-stream-proxy.ts  # merges settings proxy + Source.userAgent for Shaka
    store/                    # Zustand slices: catalog-store, settings-store, profile-store
```

---

## 6. Phased delivery

### Phase 1 — Foundation (no visible product yet)

- [x] Nx monorepo initialized, CI (lint + build) green.
- [x] `packages/core`: Zod schemas + M3U parser + storage adapter interface (`LocalStorageAdapter` + `InMemoryStorageAdapter`).
- [x] `packages/ui`: design tokens (Tailwind config via `packages/config`), `FocusableItem`, basic layout primitives (`AppScreen`, `Stack`).
- [x] `apps/web`: router skeleton (React Router 7), Norigin `SpatialNavigation.init()`, Tailwind theme (auto/light/dark).
- [x] Shaka Player loaded and plays a single hardcoded HLS URL (`/dev/play-test`, dev-only route).

**Exit criterion**: blank app renders; Shaka plays a test stream; M3U parser unit-tested.

---

### Phase 2 — MVP core flows

> **Scope note**: `features.md` lists "now/next EPG" as part of the global MVP. This web Phase 2 is intentionally narrower — it focuses on the source → browse → play loop without EPG, which is the riskiest and most-blocked path to validate. Now/Next is included in Phase 2 as an optional stretch item (see below) and is fully delivered in Phase 3.

**Add source**

- [x] `AddSource` page: tabbed UI for **M3U URL**, **M3U file**, and **Xtream Codes** (host / username / password). Includes "paste raw text" fallback for the URL tab as a CORS mitigation. (Xtream tab is the default.)
- [x] All three source types are part of MVP. Xtream is treated as first-class because it sidesteps most M3U CORS pain (JSON endpoints + per-stream URLs) and exposes catalog metadata (catchup, VOD, series) the M3U format can't carry.
- [x] Source validator runs on submit and distinguishes:
  - M3U: `cors_blocked`, `parse_error`, `unreachable`.
  - Xtream: `auth_failed` (panel returns `auth: 0`), `unreachable`, `unexpected_payload`.
  Each shows actionable messages.
- [x] Validated source saved to localStorage via storage adapter (`SourcesStore` → `LocalStorageAdapter`, key `iptv.sources.v1`).

**Browse**

- [x] `Home` page: tile launcher (Live TV / Movies / Series) with channel counts; selecting a tile pushes `/browse/:kind` where the groups sidebar + channel list lives. All keyboard/D-pad navigable with Norigin.
- [x] Channel data loaded from stored playlist; groups displayed (snapshot persisted at add-source time for m3u; live-fetched for Xtream via `loadXtreamPlaylist`). Catalog now buckets groups by kind so each `/browse/:kind` page reads its own slice.
- [x] **VOD and Series tiles surface in the launcher** with channel counts and disable themselves when the active source has none. The `/browse/vod` and `/browse/series` pages render the same shared `BrowseView` as live; richer VOD grid and series detail (seasons/episodes) still land in Phase 4.
- [x] Search bar (filter by name, client-side).
- [x] Favorites toggle per channel; recents updated on play.

**Playback**

- [x] **Inline live player** on `/browse/live` (3-column split: groups | channels | player). D-pad up/down on the channel list channel-surfs without leaving the page; Shaka tears down + reloads on `streamUrl` change.
- [x] **Fullscreen `/play/:sourceId/:kind/:channelId` route** for promote-to-fullscreen (live) and Play (VOD). The `<Player>` from `packages/player` owns Shaka in both surfaces. Distinct banner states for unknown kind, missing source, missing channel, no-stream (series).
- [x] **Friendly error overlay** with human-readable message, **Retry** action, and **Copy diagnostics** clipboard button (`<PlayerErrorOverlay>` in `packages/player`; `useShakaPlayer.retry()` wired).
- [x] **User-run CORS proxy** (`apps/web-proxy`) with HMAC-SHA256 auth + HLS manifest rewriting. Configured at `/settings` and routed through automatically by `useShakaPlayer` when set. End-to-end verified against a real Xtream HLS stream that previously failed with Shaka code 1002.
- [x] Audio/subtitle track picker (populated from `useShakaPlayer` `tracks` API).
- [x] CORS-shaped 1002 hint in `describeShakaError` when no proxy is configured.

**Onboarding**

- [x] First-run gate: if no sources, `Home` shows an empty-state CTA that routes to `/add-source`.
- [x] Profile name input (single profile for MVP).
- [x] First-launch `<ResponsibilityNotice>` modal + `acknowledgedResponsibilityV1` on settings store; dedicated **`iptv.viewer_responsibility_ack_v1`** gate + legacy import flag; acknowledge closes reliably (local state bump when Zustand would not re-render).

**Settings**

- [x] `/settings` page with **stream proxy** configuration (URL + secret + optional UA override; Save / Test connection / Clear). Persisted via Zustand `persist` middleware (key `iptv.settings.v1`).
- [x] Per-source `Source.userAgent` override field on the AddSource form (extends the schema in `packages/core`).

**Stretch (Phase 2, if time allows)**

- [ ] Now/Next strip on channel cards (requires EPG URL field in `AddSource` and EPG parser from `packages/core`). Promoted to required in Phase 3 if not completed here.

**Exit criterion**: a new user can add an M3U URL (or paste text), browse channels, and play a stream end-to-end with no external help.

---

### Phase 3 — EPG (minimal)

- [ ] XMLTV EPG URL input in source form (optional field).
- [ ] `packages/core` EPG parser.
- [ ] Now/Next strip on `Home` channel cards.
- [ ] Simple EPG grid page (today + tomorrow, current time highlighted).

**Exit criterion**: EPG data displays accurately; grid scrolls to "now" on open.

---

### Phase 4 — Polish and next-tier features

- [ ] **VOD browser**: grid of movies (poster, year, rating) populated from `vod` channels in the catalog; play on select.
- [ ] **Series browser**: list → series detail (seasons + episodes); play episode; track watched episodes.
- [ ] **Catchup / time-shift** for live channels that advertise it (`catchupDays`/`catchupMode` set by either M3U attributes or Xtream `tv_archive`). Use `buildCatchupUrl` from `packages/core` to construct the playback URL on demand.
- [ ] Multiple profiles (separate favorites per profile).
- [ ] Channel logos (fetch + cache; fallback to initials).
- [ ] Hidden groups / custom category order.
- [ ] Backup/restore (JSON export/import of app config).
- [ ] Settings: buffering mode toggle, autoplay preference, keyboard shortcut reference.
- [ ] Accessibility audit: focus visibility, ARIA roles on custom components.
- [ ] Performance: virtualize long channel lists; lazy-load EPG data.

---

## 7. Navigation model (Norigin Spatial Navigation)

All interactive elements wrapped in `useFocusable`. The diagram below shows **logical regions** — in code each region is a `FocusContext` created with `useFocusable({ isFocusBoundary: true })` and a stable `focusKey` string (e.g. `"SIDEBAR"`). Leaf nodes are individual `useFocusable` instances with unique `focusKey` values. The library routes D-pad events between them spatially, not by nesting order.

```
App  (SpatialNavigation.init on mount)
├── Sidebar — focusKey: "SIDEBAR"            (FocusContext, isFocusBoundary)
├── ChannelList — focusKey: "CHANNEL_LIST"   (FocusContext, isFocusBoundary)
├── EpgGrid — focusKey: "EPG_GRID"           (FocusContext, isFocusBoundary)
└── PlayerOverlay — focusKey: "PLAYER_OVERLAY" (FocusContext, isFocusBoundary)
    ├── TrackPicker                           (useFocusable leaf nodes)
    └── Controls                             (useFocusable leaf nodes)
```

Use `setFocus("PLAYER_OVERLAY")` / `setFocus("CHANNEL_LIST")` to move programmatically (e.g. on route change). See [Norigin docs](https://github.com/NoriginMedia/Norigin-Spatial-Navigation) for the full `useFocusable` and `FocusContext` API.

Key bindings:

| Key | Action |
| --- | ------ |
| Arrow keys | Spatial move |
| Enter / Space | Select / play |
| Backspace / Esc | Back / close overlay |
| F | Toggle favorite |
| S | Open search |
| G | Open guide (EPG) |

Document bindings in `apps/web/src/lib/navigation/keybindings.ts`.

---

## 8. Player integration (Shaka Player)

Wrap Shaka in a React hook `useShakaPlayer(videoRef, streamUrl)` that exposes:

- `tracks: Track[]` — audio and text tracks
- `selectTrack(track)` — switch track
- `error: ShakaError | null`
- `buffering: boolean`
- `destroy()` — cleanup on unmount

Handle autoplay restrictions: always require an explicit user gesture to start playback (route navigation from channel select counts; document in UX).

---

## 9. State management

Use **Zustand** for global app state (small footprint, no boilerplate):

| Store slice | Contents |
| ----------- | -------- |
| `sourcesStore` | sources[], activeSourceId (class-based `LocalStorageAdapter`, key `iptv.sources.v1`) |
| `catalogStore` | playlist, groups, filteredChannels, searchQuery (wraps `createCachingXtreamFetcher`) |
| `guideStore` | epgGuide, nowPrograms (Phase 3) |
| `profileStore` | **built** (single-profile MVP) — `profile: UserProfile` (name, favorites[], recents[]). Zustand `persist`, key `iptv.profile.v1`. |
| `settingsStore` | **built** — `streamProxy`, `acknowledgedResponsibilityV1`. Zustand `persist`, key `iptv.settings.v1`, version 1, `partialize` to those fields. Responsibility UI reads **`iptv.viewer_responsibility_ack_v1`**; `setAcknowledgedResponsibilityV1(true)` writes that key and **`iptv.responsibility_legacy_blob_imported_v1`**. |
| `playerStore` | currentChannel, playerState, error (deferred — current player owns its own state via `useShakaPlayer`) |

`sourcesStore` uses the class-based `LocalStorageAdapter` pattern; `settingsStore` uses Zustand `persist` middleware (settings are reactive UI state, not a server contract).

---

## 10. Testing strategy

| Layer | Tool | Coverage target |
| ----- | ---- | --------------- |
| Unit (parsers, schemas) | Vitest | M3U parser, Zod schemas, EPG parser |
| Component | React Testing Library | SourceForm, ChannelCard, PlayerOverlay |
| Integration | Vitest + MSW | Source validation flow, playlist fetch |
| E2E (Phase 3+) | Playwright | Add source → play stream (mock stream) |

Contract tests: parse a sample M3U and validate output against Zod schema + exported JSON Schema; run in CI to catch drift before Android TV work begins.

---

## 11. CI pipeline (Nx)

```yaml
# On every PR
- nx affected --target=lint
- nx affected --target=test
- nx affected --target=build

# On main
- nx run-many --target=build --all
- Export packages/core JSON Schema artifacts as build artifact
```

Use Nx remote cache (Nx Cloud free tier) to keep CI fast once the workspace grows.

---

## 12. Open decisions (resolve before or during Phase 2)

| Question | Options | Recommended |
| -------- | ------- | ----------- |
| Routing library | React Router v6, TanStack Router | React Router v6 (mature, wide support) |
| Global state | Zustand, Jotai, Redux Toolkit | Zustand (lightweight) |
| Icon set | Lucide, Heroicons, Radix Icons | Lucide React (Tailwind-friendly) |
| Xtream support in MVP | Yes / No | **Yes** — Xtream is first-class alongside M3U URL and file. Wire schemas, URL builders, EPG decode, and discriminated `Channel` (live / vod / series) live in `packages/core/src/lib/xtream.ts` and `contracts.ts`; web `SourceForm` adds the tabbed UI in Phase 2. |
| EPG in MVP | Full grid / Now+Next only | Now+Next only; full grid in Phase 3 |
| Auth / accounts | Local only / cloud | Local only for v1 |
| CORS mitigation | Paste-text only / proxy / both | **Both** — paste-text fallback ships in `SourceForm`; user-run proxy ships as `apps/web-proxy`. Production hosting of the proxy is explicitly rejected. |
