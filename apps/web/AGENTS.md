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
    root.tsx, app.tsx, routes/
    features/                 # (planned) sources, catalog, guide, player, profiles
    lib/                      # (planned) shaka, navigation, storage
    store/                    # (planned) Zustand slices

packages/core/                # types, Zod schemas, parsers, storage adapter interface
packages/ui/                  # shared React + Tailwind (web + webOS)
packages/config/              # shared Tailwind preset + IPTV color tokens (JSON)
```

### Dev-only: token lab (design / colors)

- **Route:** `/dev/design-tokens` — linked in the top nav as **Token lab** when `import.meta.env.DEV` is true.
- **Implementation:** `app/routes.tsx` only registers this route in development, so **production client and server bundles do not contain** that page or its strings (the module is dropped from the graph).
- **Source:** `app/routes/dev.design-tokens.tsx` stays in the repo for local dev and typecheck; it is not part of the shipped product surface.

### Theme (light / dark)

- **`app/auto-theme.tsx`** — toggles **`html.dark`** from **`prefers-color-scheme`** (and on OS changes). Shared tokens in `packages/config` flip `--iptv-paint-*` and `--iptv-color-*` when `.dark` is present.

---

## Phased delivery — what is in scope RIGHT NOW

Read [`docs/web-app-plan.md § 6`](../../docs/web-app-plan.md) for the full phase breakdown.
**Always check the current phase before adding features.**

| Phase | Status | Scope |
| ----- | ------ | ----- |
| 1 — Foundation | in progress | Nx + pnpm done; complete schemas/M3U/Shaka/Norigin per plan |
| 2 — MVP core flows | not started | AddSource, channel browser, playback, onboarding |
| 3 — EPG | not started | XMLTV parser, now/next strip, EPG grid |
| 4 — Polish | not started | Multiple profiles, logos, backup/restore, a11y audit |

**Things that are explicitly deferred — do not build them early:**
- Xtream Codes UI (the `xtream` type exists in the Zod schema; the form UI is Phase 4).
- Full EPG grid (Phase 3).
- Multiple profiles (Phase 4).
- Cloud sync / accounts (post-v1).

---

## Shared packages contracts

### `packages/core` — domain models (Zod)

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

Export JSON Schema artifacts to `packages/core/schemas/` using `zod-to-json-schema`.
Add an Nx build target that regenerates them; run in CI so Android TV always has fresh artifacts.

### `packages/ui` — component rules

- All interactive elements must wrap **`useFocusable`** from Norigin.
- Keep components **headless-friendly**: logic in hooks, styles via Tailwind classes.
- List Norigin, React, and Shaka as `peerDependencies` (not `dependencies`) to avoid version mismatches when webOS consumes the same packages.

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
