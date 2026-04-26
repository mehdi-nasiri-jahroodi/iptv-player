# Web app — agent context

> This file is scoped to `apps/web/` and the shared packages it depends on (`packages/core`, `packages/ui`).
> For repo-wide conventions, version control rules, and stack decisions, read the root [`AGENTS.md`](../../AGENTS.md) first.

---

## Current state

The **Nx + pnpm** workspace exists at the repo root. This app is generated as **React Router 7** + Vite under `apps/web/app/` (not the older `src/` layout in some docs — mirror the same folders under `app/`).

Follow [`docs/web-app-plan.md § 6`](../../docs/web-app-plan.md) for phase scope; use **pnpm** / `pnpm exec nx` from the repo root (see root `AGENTS.md`).

---

## Stack (decided — do not change without updating `docs/architecture.md`)

| Concern | Choice |
| ------- | ------ |
| UI framework | **React** (functional components, hooks only) |
| Styling | **Tailwind CSS** (utility-first; shared preset via `packages/config`) |
| Colors | **IPTV tokens only** — semantic (`bg-background`, …) + `lum-*`; extend [`packages/config/tokens/`](../../packages/config/tokens/) when a paint is missing. Rule: root [`AGENTS.md`](../../AGENTS.md) § *UI colors — Lumina tokens only*. |
| TV / D-pad navigation | **Norigin Spatial Navigation** (`@noriginmedia/norigin-spatial-navigation`) |
| Playback | **Shaka Player** (`shaka-player`) |
| Global state | **Zustand** (small slices; no Redux) |
| Data validation | **Zod** (in `packages/core`; also exported as JSON Schema for Android TV) |
| Routing | **React Router v7** (`react-router`, file-based `app/`) |
| Icons | **Lucide React** |
| Unit / integration tests | **Vitest** + **React Testing Library** + **MSW** |
| E2E (Phase 3+) | **Playwright** |
| Monorepo tooling | **Nx** (`nx affected`, task pipelines, remote cache) |

---

## Repository layout

```
apps/web/
  app/                        # React Router 7 routes + layout (see routes.tsx)
    root.tsx                  # html shell + AutoTheme + SpatialNavigationRoot + AppNav
    routes.tsx                # URL → page-module manifest
    app-nav.tsx               # top nav (NavLinks + ThemeToggle)
    auto-theme.tsx            # theme prefs (auto/light/dark) + window.__setTheme
    spatial-navigation-root.tsx  # Norigin init/destroy on the client
    pages/                    # one file per route module — exported as default
      home.tsx                # tile launcher (Live / Movies / Series) + source switcher
      about.tsx
      add-source.tsx
      browse/
        $kind.tsx             # /browse/:kind page — wraps the shared BrowseView
      dev/
        design-tokens.tsx     # only registered when import.meta.env.DEV
        play-test.tsx         # Shaka HLS smoke test (dev-only)
    components/               # cross-page presentational components
      browse-view.tsx         # group sidebar + search + ChannelList for one kind
    features/                 # feature folders co-locating hooks + state
      sources/
        sources-storage.ts    # SourcesStore + newSourceId
        playlists-storage.ts  # PlaylistsStore (parsed-Playlist snapshots per source)
    lib/                      # shaka loader; (planned) navigation
    store/                    # Zustand slices
      catalog-store.ts        # playlist + groupsByKind + per-kind activeGroup + search
```

### Dev-only: token lab + Shaka smoke

- **Routes:** `/dev/design-tokens` (**Token lab**), `/dev/play-test` (**Shaka test**) — top nav links when `import.meta.env.DEV` is true.
- **Implementation:** `app/routes.tsx` only registers these routes in development, so **production client and server bundles do not contain** those pages or their strings (the modules are dropped from the graph).
- **Source:** `app/pages/dev/design-tokens.tsx`, `app/pages/dev/play-test.tsx` — local dev and typecheck only; not part of the shipped product surface.

### Theme (light / dark)

- **`app/auto-theme.tsx`** — toggles **`html.dark`** from **`prefers-color-scheme`** (and on OS changes). Shared tokens in `packages/config` flip `--iptv-paint-*` and `--iptv-color-*` when `.dark` is present.

---

## Phased delivery — what is in scope RIGHT NOW

Read [`docs/web-app-plan.md § 6`](../../docs/web-app-plan.md) for the full phase breakdown.
**Always check the current phase before adding features.**

| Phase | Status | Scope |
| ----- | ------ | ----- |
| 1 — Foundation | complete | Nx + pnpm; schemas/M3U; Shaka smoke (`/dev/play-test`); Norigin init per plan |
| 2 — MVP core flows | not started | AddSource (M3U URL + file + **Xtream Codes**), live channel browser, playback, onboarding |
| 3 — EPG | not started | XMLTV parser, now/next strip, EPG grid |
| 4 — Polish | not started | VOD/Series browsers, catchup playback, multiple profiles, logos, backup/restore, a11y audit |

**Things that are explicitly deferred — do not build them early:**
- VOD and Series UI surfaces (Phase 4). The Xtream catalog already returns them and `Channel` is a discriminated union with `vod` and `series` variants in the schema, but the browse UI lands later.
- Catchup / time-shift playback UI (Phase 4). `buildCatchupUrl` exists in `packages/core` and live channels carry `catchupDays` / `catchupMode` already.
- Full EPG grid (Phase 3).
- Multiple profiles (Phase 4).
- Cloud sync / accounts (post-v1).

---

## Shared packages contracts

### `packages/core` — domain models (Zod)

```
Source          — id, label, type (m3u_url | m3u_file | xtream), url?, credentials?, epgUrl?
Channel         — discriminated union on `type`:
                    'live'   { id, name, groupTitle, streamUrl, logoUrl?, tvgId?,
                               catchupDays?, catchupMode?, catchupSource?, xtreamStreamId? }
                    'vod'    { id, name, groupTitle, streamUrl, logoUrl?, posterUrl?,
                               year?, rating?, plot?, cast?, director?, genre?,
                               containerExtension?, xtreamStreamId? }
                    'series' { id, name, groupTitle, logoUrl?, posterUrl?, plot?, cast?,
                               director?, genre?, releaseYear?, rating?,
                               seasons[] (each: seasonNumber, name?, episodes[]),
                               xtreamSeriesId? }
ChannelGroup    — id, name, kind ('live' | 'vod' | 'series' | 'mixed'), channels[]
Playlist        — sourceId, groups[], fetchedAt
EpgProgram      — channelId, title, start, end, description?
EpgGuide        — programs[] keyed by channelId
AppSettings     — theme, playerBufferMode, ...
UserProfile     — id, name, favorites[], recents[]

Xtream wire types (in `packages/core/src/lib/contracts.ts`, all `.passthrough()`):
  XtreamCredentials, XtreamPlayerApi, XtreamCategory, XtreamLiveStream,
  XtreamVodStream, XtreamVodInfo, XtreamSeries, XtreamSeriesInfo,
  XtreamShortEpg(Entry), XtreamAction.

Xtream client + builders (in `packages/core/src/lib/xtream.ts`):
  fetchXtreamPlayerApi, isXtreamAuthSuccessful,
  fetchLive/Vod/SeriesCategories, fetchLive/Vod/SeriesStreams,
  fetchVodInfo, fetchSeriesInfo, fetchShortEpg,
  buildPlayerApiUrl, buildLiveStreamUrl, buildVodStreamUrl,
  buildSeriesEpisodeUrl, buildCatchupUrl,
  toLiveChannel, toVodChannel, toSeriesChannel, decodeXtreamEpgEntry.
  Stream URLs are constructed at playback time from credentials + ids;
  never persist URLs that embed username/password.
```

Export JSON Schema artifacts to `packages/core/schemas/` using `zod-to-json-schema`.
Add an Nx build target that regenerates them; run in CI so Android TV always has fresh artifacts.

### `packages/ui` — component rules

- All interactive elements must wrap **`useFocusable`** from Norigin.
- Keep components **headless-friendly**: logic in hooks, styles via Tailwind classes.
- List Norigin, React, Shaka, **React Hook Form**, `@hookform/resolvers`, and **Zod** as `peerDependencies` (not `dependencies`) to avoid version mismatches when webOS consumes the same packages.
- **Built so far** (`packages/ui/src/lib/`): `FocusableItem`, `Button`, `FormField`, `TextField`, `TextArea`, `Tabs`, `SourceForm`, `ChannelCard`, `ChannelList`, `CatalogTile`. All headless (no `fetch`, no storage, no router) — side effects belong to the consuming page.

---

## Zustand store slices

| Slice | Contents |
| ----- | -------- |
| `sourcesStore` | `sources[]`, `activeSourceId` |
| `catalogStore` | `playlist`, `groups`, `filteredChannels`, `searchQuery` |
| `guideStore` | `epgGuide`, `nowPrograms` |
| `profileStore` | `profiles[]`, `activeProfileId`, `favorites`, `recents` |
| `settingsStore` | `theme`, `playerPrefs` |
| `playerStore` | `currentChannel`, `playerState`, `error` |

Persist `sourcesStore`, `profileStore`, and `settingsStore` to localStorage via Zustand middleware.

---

## Norigin Spatial Navigation — focus model

```
App  (SpatialNavigation.init on mount)
├── Sidebar — focusKey: "SIDEBAR"              (FocusContext, isFocusBoundary: true)
├── ChannelList — focusKey: "CHANNEL_LIST"     (FocusContext, isFocusBoundary: true)
├── EpgGrid — focusKey: "EPG_GRID"             (FocusContext, isFocusBoundary: true)
└── PlayerOverlay — focusKey: "PLAYER_OVERLAY" (FocusContext, isFocusBoundary: true)
    ├── TrackPicker                             (useFocusable leaf)
    └── Controls                               (useFocusable leaf)
```

Use `setFocus("PLAYER_OVERLAY")` / `setFocus("CHANNEL_LIST")` for programmatic focus on route change.
Document all key bindings in `apps/web/src/lib/navigation/keybindings.ts`.

| Key | Action |
| --- | ------ |
| Arrow keys | Spatial move |
| Enter / Space | Select / play |
| Backspace / Esc | Back / close overlay |
| F | Toggle favorite |
| S | Open search |
| G | Open guide (EPG) |

---

## Shaka Player integration

Wrap Shaka in a single hook `useShakaPlayer(videoRef, streamUrl)` in `apps/web/src/lib/shaka/`.

Exposed API:

```ts
{
  tracks: Track[]         // audio and text tracks from Shaka
  selectTrack(track): void
  error: ShakaError | null
  buffering: boolean
  destroy(): void         // call on unmount
}
```

- Always require an **explicit user gesture** to start playback (route navigation from channel select counts).
- Never start autoplay speculatively; document this in UX comments.

---

## CORS and source validation

Browsers block most cross-origin M3U/playlist fetches. Handle this explicitly:

1. **Always offer "paste raw text"** alongside URL input so users can bypass CORS.
2. **File import** works without CORS restrictions — always support it.
3. Surface CORS failures as a distinct error code `cors_blocked` with actionable instructions — do **not** treat them as "invalid source."
4. An optional user-configured proxy can relay requests; document clearly that the user's URLs pass through it.

---

## Testing conventions

| Layer | Tool | What to cover |
| ----- | ---- | ------------- |
| Unit | Vitest | M3U parser, Zod schemas, EPG parser, store slices |
| Component | React Testing Library | `SourceForm`, `ChannelCard`, `PlayerOverlay` |
| Integration | Vitest + MSW | Source validation flow, playlist fetch |
| E2E (Phase 3+) | Playwright | Add source → play stream (mock stream URL) |

Contract test: parse a sample M3U → validate output against Zod schema and exported JSON Schema. Run in CI to catch drift before Android TV work begins.

---

## CI (Nx)

```yaml
# On every PR
- nx affected --target=lint
- nx affected --target=test
- nx affected --target=build

# On main
- nx run-many --target=build --all
- Export packages/core JSON Schema artifacts as a build artifact
```

---

## Conventions

- **No `any`** — use Zod-inferred types or explicit interfaces.
- **No secrets in logs** — diagnostics must be redacted by default; `"copy diagnostics"` button only.
- **Co-locate tests** — `*.test.ts` next to the file under test.
- **Feature folders** are self-contained: hooks, state, and local components live together under `features/<name>/`.
- When a component grows beyond ~150 lines of JSX, split it.
- Use **Lucide React** for icons; do not introduce a second icon library.
