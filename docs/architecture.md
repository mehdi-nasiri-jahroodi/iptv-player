# Architecture (reference)

This document describes the **intended** shape of the codebase **when** implementation exists. The repository may still be **without application code**; the **technology stack is decided** and should guide new work.

## Technology stack (decided)

| Layer | Technology | Rationale (short) |
| ----- | ---------- | ----------------- |
| **Monorepo** | [Nx](https://nx.dev/) | JS/TS workspaces, shared tooling and configs, cacheable tasks across apps |
| **Web UI** | React + [Tailwind CSS](https://tailwindcss.com/) | Shared UI for browser and webOS host |
| **TV navigation** | [Norigin Spatial Navigation](https://github.com/NoriginMedia/norigin-spatial-navigation) | Spatial / D-pad focus for lean-back UIs (`@noriginmedia/norigin-spatial-navigation`) |
| **Android TV** | Kotlin + [Jetpack Compose for TV](https://developer.android.com/training/tv/compose) | Native TV layouts and focus |
| **Native player** | [Media3](https://developer.android.com/guide/topics/media/media3) / ExoPlayer | Platform-standard playback, tracks, and buffering on Android |
| **Web player** | [Shaka Player](https://shaka-player-demo.appspot.com/) | Broad format coverage for typical IPTV-style streams (e.g. HLS, DASH) in browsers |
| **Data schema** | [Zod](https://zod.dev/) (TypeScript) + [JSON Schema](https://json-schema.org/) | Single source of truth in TS with a portable contract for Kotlin and tooling |

## High-level

- **One product**, **three client applications** (Web, Android TV, LG webOS).
- An **Nx monorepo** with **pnpm** workspaces: one Git repo with `apps/*` and shared `packages/*` (or Nx libraries) so Web and webOS share React, Tailwind, Shaka integration, and TypeScript domain logic, while Android TV remains a native app with Media3.

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

- Shared **React** UI, **Tailwind** styling, **Norigin Spatial Navigation** for remote-first focus.
- Shared **Shaka Player** integration patterns (with a thin platform layer for webOS lifecycle and capability quirks).
- Shared **TypeScript** modules: parsing, **Zod** validation, EPG processing; export or mirror rules as **JSON Schema** for non-TS consumers.
- A thin **platform layer** for: storage, file pickers, and capability differences.

**Android TV (Kotlin + Compose for TV + Media3)**

- **No** shared React components with Web.
- **Do** share: **JSON Schema** (and generated types or hand-mapped Kotlin models) aligned with Zod-defined shapes, plus the same **product rules** (what a “channel” is, EPG field mapping).
- Optional long-term: **Kotlin Multiplatform** for pure domain logic — evaluate cost vs. duplication.

**Backend**

- **None required** for a pure local player. If you add accounts, EPG proxying, or sync, introduce a small API with explicit privacy guarantees.

## Data on device

- Assume **sensitive** playlist URLs and credentials; use **OS secure storage** on mobile/TV, avoid logging secrets, and make diagnostics **redacted** by default.

## Repository layout (Nx-oriented, when code exists)

Illustrative layout; exact Nx project names and `project.json` paths follow team preference.

```
apps/
  web/
  webos/        # or lg-webos — may be a thin shell over shared web build
  android-tv/
packages/
  core/         # types, Zod schemas, shared TS logic; JSON Schema artifacts for Android
  ui/           # shared React + Tailwind components (web + webOS)
  config/       # eslint, tailwind preset, tsconfig bases (or Nx shared configs)
```

Use Nx **affected** commands and **task pipelines** for CI once projects exist.

## Build and quality (when you implement)

- **CI** per app with Nx **remote cache** where available.
- **Contract tests** for playlist → channel model and EPG → guide model (Zod parse + JSON Schema examples consumed by Android tests) to prevent drift across clients.
