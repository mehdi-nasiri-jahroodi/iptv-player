# Web App — Implementation Plan

> **Scope**: First client to build per the delivery order in `platforms.md` (Web → Android TV → LG webOS).  
> This document translates the product vision and feature backlog into a concrete, phased plan for the React web app.

---

## 1. Goals for the web app

- Deliver a **working MVP** that validates core flows: add source → browse channels → play.
- Establish the **shared packages** (`packages/core`, `packages/ui`) that Android TV and webOS will later consume.
- Prove out the **Norigin Spatial Navigation** + keyboard/D-pad model in a browser before TV hardware targets it.

---

## 2. Repository bootstrap

Before writing product code, the Nx monorepo must exist.

> **Existing repo**: this repository already contains `docs/` and other files. Do **not** run `create-nx-workspace` inside it — that command scaffolds a new directory and will overwrite the tree. Instead, run it from the **parent folder** (`cd ..` first) and merge the result, or use `npx nx@latest init` to add Nx to the existing repo in place.

| Step | Command / action |
| ---- | ---------------- |
| Init Nx in existing repo | Run from repo root: `npx nx@latest init` (adds `nx.json`; follow prompts) |
| Add web app | `nx g @nx/react:app apps/web` |
| Add shared packages | `nx g @nx/js:lib packages/core` and `nx g @nx/react:lib packages/ui` |
| Install Shaka Player | `npm install shaka-player` (root; consumed by `apps/web` and `packages/ui`) |
| Install Norigin Spatial Nav | `npm install @noriginmedia/norigin-spatial-navigation` (root; peer of `packages/ui`) |
| Install Zod | `npm install zod` (root; consumed by `packages/core`) |
| Tailwind CSS | Configure per Nx/Tailwind guide; share preset via `packages/config` |

**Dependency placement note**: `packages/ui` wraps Norigin components and may contain shared player chrome, so `@noriginmedia/norigin-spatial-navigation`, `react`, and `shaka-player` must be listed as `peerDependencies` of `packages/ui` (and `packages/core` where applicable), not only in `apps/web`. This prevents version mismatches when webOS later consumes the same packages.

Confirm the workspace builds and lints cleanly before adding product code.

---

## 3. Shared package contracts (`packages/core`)

Define data shapes first — they drive everything else and will later be consumed by Android TV via JSON Schema export.

### 3.1 Domain models (Zod schemas)

```
Source          — id, label, type (m3u_url | m3u_file | xtream), url?, credentials?
Channel         — id, name, groupTitle, streamUrl, logoUrl?, tvgId?
ChannelGroup    — id, name, channels[]
Playlist        — sourceId, groups[], fetchedAt
EpgProgram      — channelId, title, start, end, description?
EpgGuide        — programs[] keyed by channelId
AppSettings     — theme, playerBufferMode, ...
UserProfile     — id, name, favorites[], recents[]
```

Export JSON Schema artifacts (`packages/core/schemas/`) for future Android TV alignment using **`zod-to-json-schema`** (`npm install zod-to-json-schema`). Add a small build script that calls `zodToJsonSchema(SourceSchema)` etc. and writes the output files; run it as an Nx target so CI always has fresh artifacts.

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
| `ChannelCard` | Logo, name, now-playing label |
| `ChannelGrid` / `ChannelList` | Virtualized list/grid; focus-aware |
| `EpgGrid` | Time-axis grid; simplified for MVP |
| `PlayerOverlay` | Controls, track picker, error state |
| `SourceForm` | URL / file inputs with inline validation. **MVP scope: URL + file import only.** Xtream UI is deferred to Phase 4 — the underlying `xtream` type exists in the Zod schema but the form UI is not built yet. |
| `SettingsPanel` | Theme toggle, player toggles |
| `Dialog` / `Toast` | Feedback primitives |

Keep components **headless-friendly** — logic in hooks, styles via Tailwind classes — so webOS can override tokens without forking.

---

## 5. Web app structure (`apps/web`)

```
apps/web/
  src/
    main.tsx                  # entry, SpatialNavigation init
    App.tsx                   # router shell
    pages/
      Home/                   # channel browser + EPG strip
      Player/                 # fullscreen player
      AddSource/              # source wizard
      Settings/
      Onboarding/             # first-run flow
    features/
      sources/                # hooks + state for sources
      catalog/                # channel list, groups, search
      guide/                  # EPG state, now-pointer
      player/                 # Shaka integration, track selection
      profiles/               # favorites, recents, profile CRUD
    lib/
      shaka/                  # ShakaPlayer wrapper component + hooks
      navigation/             # spatial nav config, key bindings
      storage/                # localStorage impl of storage adapter
    store/                    # global state (Zustand)
    router.tsx
```

---

## 6. Phased delivery

### Phase 1 — Foundation (no visible product yet)

- [ ] Nx monorepo initialized, CI (lint + build) green.
- [ ] `packages/core`: Zod schemas + M3U parser + storage adapter interface.
- [ ] `packages/ui`: design tokens (Tailwind config), `FocusableItem`, basic layout primitives.
- [ ] `apps/web`: router skeleton, Norigin `SpatialNavigation.init()`, Tailwind theme (light/dark).
- [ ] Shaka Player loaded and plays a single hardcoded HLS URL.

**Exit criterion**: blank app renders; Shaka plays a test stream; M3U parser unit-tested.

---

### Phase 2 — MVP core flows

> **Scope note**: `features.md` lists "now/next EPG" as part of the global MVP. This web Phase 2 is intentionally narrower — it focuses on the source → browse → play loop without EPG, which is the riskiest and most-blocked path to validate. Now/Next is included in Phase 2 as an optional stretch item (see below) and is fully delivered in Phase 3.

**Add source**

- [ ] `AddSource` page: URL input, file picker, "paste raw text" fallback (CORS mitigation).
- [ ] Source type is URL or file only for MVP; Xtream UI is not built yet.
- [ ] Source validator runs on submit; distinguishes `cors_blocked`, `parse_error`, `unreachable`; shows actionable messages.
- [ ] Validated source saved to localStorage via storage adapter.

**Browse**

- [ ] `Home` page: groups sidebar + channel list, keyboard/D-pad navigable with Norigin.
- [ ] Channel data loaded from stored playlist; groups displayed.
- [ ] Search bar (filter by name, client-side).
- [ ] Favorites toggle per channel; recents updated on play.

**Playback**

- [ ] `Player` page: fullscreen Shaka Player, overlay on interaction.
- [ ] Audio/subtitle track picker (populated from Shaka track API).
- [ ] Error state with human-readable message and retry action.
- [ ] "Copy diagnostics" button (redacted log blob to clipboard).

**Onboarding**

- [ ] First-run gate: if no sources, route to `Onboarding` → `AddSource`.
- [ ] Profile name input (single profile for MVP).

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
| `sourcesStore` | sources[], activeSourceId |
| `catalogStore` | playlist, groups, filteredChannels, searchQuery |
| `guideStore` | epgGuide, nowPrograms |
| `profileStore` | profiles[], activeProfileId, favorites, recents |
| `settingsStore` | theme, playerPrefs |
| `playerStore` | currentChannel, playerState, error |

Persist `sourcesStore`, `profileStore`, and `settingsStore` to localStorage via Zustand middleware.

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
| Xtream support in MVP | Yes / No | No — `xtream` type defined in schema only; UI deferred to Phase 4 |
| EPG in MVP | Full grid / Now+Next only | Now+Next only; full grid in Phase 3 |
| Auth / accounts | Local only / cloud | Local only for v1 |
