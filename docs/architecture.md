# Architecture (reference)

This document describes the **intended** shape of the codebase **when** implementation exists. The repository is currently **documentation-only**.

## High-level

- **One product**, **three client applications** (Web, Android TV, LG webOS).
- A **monorepository** is recommended: one Git repo with `apps/*` and `packages/*` so Web and webOS can share a maximum of UI and TypeScript domain logic, while Android TV remains a native app with a first-class video stack.

## Logical modules (future)

| Area | Responsibility |
| ---- | -------------- |
| **Sources** | Ingesting playlist files/URLs, optional provider auth flows, normalizing to an internal channel model |
| **Catalog** | Groups, channel metadata, logos, user ordering, favorites, recents, search index |
| **Guide** | EPG ingestion, parsing, timezone, “now” pointer, program grid UI state |
| **Player** | Playback session, track selection, error recovery, optional diagnostics |
| **Account / sync (optional, later)** | Identity, settings backup — only if product chooses cloud features |
| **Platform shell** | Navigation, input (touch vs remote), lifecycle, app updates |

## Sharing model

**Between Web and LG webOS (both web stacks)**

- Shared **design tokens**, **components**, **routing** patterns, and **TypeScript** modules for: parsing, validation, EPG processing, and API client code (if a backend is added later).
- A thin **platform layer** for: storage, file pickers, and video element/capability differences.

**Android TV (Kotlin + recommended native player such as ExoPlayer)**

- **No** shared React/Vue components with Web in the typical sense.
- **Do** share: **OpenAPI/JSON schema** (or Protobuf) contracts, and the same **product rules** (what a “channel” is, EPG field mapping).
- Optional long-term: **Kotlin Multiplatform** for pure domain logic — evaluate cost vs. duplication.

**Backend**

- **None required** for a pure local player. If you add accounts, EPG proxying, or sync, introduce a small API with explicit privacy guarantees.

## Data on device

- Assume **sensitive** playlist URLs and credentials; use **OS secure storage** on mobile/TV, avoid logging secrets, and make diagnostics **redacted** by default.

## Repository layout (suggested, when code exists)

```
apps/
  web/
  webos/        # or lg-webos
  android-tv/
packages/
  config/       # eslint, tsconfig, etc.
  core/         # types, validation, shared TS logic
  ui/           # web + webOS shared components (if same stack)
```

Names are illustrative; the team may rename for tooling (e.g. Nx project names).

## Build and quality (when you implement)

- **CI** per app with shared cache (monorepo tool of choice: Nx, Turborepo, etc.).
- **Contract tests** for playlist → channel model and EPG → guide model to prevent drift across clients.
