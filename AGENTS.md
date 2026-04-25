# AI / agent context

This file helps automated assistants (and humans) work consistently in this repository.

## Current state

- **Documentation only.** There is no source code, package manifests, or CI yet. Do not assume frameworks or languages for implementation until the team adds them.
- **Source of truth** for product direction: [docs/product.md](docs/product.md) and [docs/features.md](docs/features.md).
- **Source of truth** for structure when coding starts: [docs/architecture.md](docs/architecture.md) and [docs/platforms.md](docs/platforms.md).

## If asked to add code

- Confirm the user wants to leave the “docs only” phase; then add a minimal, conventional layout (e.g. `apps/`, `packages/`) and tooling as an explicit follow-up, matching [docs/architecture.md](docs/architecture.md).

## If asked to “build the app”

- Re-read [docs/product.md](docs/product.md) — the product is a **player** with user-supplied sources, not a hosted IPTV service.
- Prioritize user-facing polish and lean-back (TV) UX when implementing Android TV and webOS.

## Conventions to preserve

- Keep documentation **factual and scoped**; avoid listing illegal use cases. Users must only stream content they have rights to.
- Prefer **monorepo** and **shared packages** for web + webOS; Android shares **types/API contracts**, not React UI, unless the team chooses a different approach later.

## Where to add new information

- Product changes → `docs/product.md` and `docs/features.md`
- Platform-specific decisions → `docs/platforms.md`
- Structure / packages → `docs/architecture.md`
- New domain terms → `docs/glossary.md`
- This file → only high-level “how to work here” — keep it short
