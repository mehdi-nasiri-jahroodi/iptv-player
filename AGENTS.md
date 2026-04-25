# AI / agent context

This file helps automated assistants (and humans) work consistently in this repository.

## Version control (assistants)

- **Do not commit or push on your own.** Never run `git commit`, `git push`, or similar to publish changes unless the user **explicitly** asks you to commit and/or push in that request. Prepare diffs and files only; the user controls what enters Git and the remote.

## Current state

- **Documentation-first; stack decided.** Application code, manifests, and CI are not in the repo yet, but **technology choices are recorded** in [docs/architecture.md](docs/architecture.md) and [docs/platforms.md](docs/platforms.md). Prefer that stack when proposing or adding implementation.
- **Source of truth** for product direction: [docs/product.md](docs/product.md) and [docs/features.md](docs/features.md).
- **Source of truth** for structure and stack: [docs/architecture.md](docs/architecture.md) and [docs/platforms.md](docs/platforms.md).

## Chosen stack (summary)

| Layer | Choice |
| ----- | ------ |
| Monorepo | **Nx** |
| Web UI | **React** + **Tailwind CSS** |
| TV navigation (D-pad) | **Norigin Spatial Navigation** |
| Android TV | **Kotlin** + **Jetpack Compose for TV** |
| Native playback | **Media3** / **ExoPlayer** |
| Web playback | **Shaka Player** |
| Data validation | **Zod** (TypeScript) + **JSON Schema** (parity with Android) |

## If asked to add code

- Confirm the user wants to leave the “docs only” phase; then scaffold an **Nx** monorepo with `apps/` and `packages/` (or Nx `libs/`) per [docs/architecture.md](docs/architecture.md), using the stack above.

## If asked to “build the app”

- Re-read [docs/product.md](docs/product.md) — the product is a **player** with user-supplied sources, not a hosted IPTV service.
- Prioritize user-facing polish and lean-back (TV) UX when implementing Android TV and webOS; use **Norigin Spatial Navigation** for focus/D-pad behavior on shared web targets.

## Conventions to preserve

- Keep documentation **factual and scoped**; avoid listing illegal use cases. Users must only stream content they have rights to.
- **Monorepo (Nx):** shared web + webOS packages (React, Tailwind, domain logic); Android in **Kotlin** shares **contracts** (e.g. JSON Schema derived from or aligned with **Zod** definitions), not React UI.

## Where to add new information

- Product changes → `docs/product.md` and `docs/features.md`
- Platform-specific decisions → `docs/platforms.md`
- Structure / packages / stack → `docs/architecture.md`
- New domain terms → `docs/glossary.md`
- This file → only high-level “how to work here” — keep it short
