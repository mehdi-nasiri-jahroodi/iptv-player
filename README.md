# IPTV Player

A **bring-your-own-source** live TV and VOD **player** (not a content service). The product goal is a fast, simple, and polished experience across **Web**, **Android TV**, and **LG webOS** — with a shared product vision and an **Nx** monorepo plan: **React + Tailwind**, **Norigin Spatial Navigation** for TV-style input, **Shaka Player** on web/webOS, **Media3** on Android, and **Zod + JSON Schema** for cross-client data contracts (see [docs/architecture.md](docs/architecture.md)).

## What this is

- A **client application** for playing streams the user is authorized to use (e.g. playlists, provider credentials), with strong UX: onboarding, EPG, favorites, search, and TV-remote–first navigation.
- **Not** a bundled channel service; users supply their own lawful sources.

## Repository contents

**Docs:** product vision, platforms, and implementation plans under [`docs/`](docs/). **Code:** an **Nx** monorepo (`apps/web`, `packages/*`) managed with **pnpm** — see [docs/architecture.md](docs/architecture.md) and [docs/web-app-plan.md](docs/web-app-plan.md).

## Development

- **Package manager:** [pnpm](https://pnpm.io/) (see `packageManager` in [`package.json`](package.json)). Install dependencies from the repo root: `pnpm install`.
- **Nx:** `pnpm exec nx graph`, `pnpm exec nx run web:dev`, etc.

| Document | Purpose |
| -------- | ------- |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/product.md](docs/product.md) | Vision, positioning, principles |
| [docs/features.md](docs/features.md) | Planned capabilities (MVP → later) |
| [docs/architecture.md](docs/architecture.md) | Nx layout, stack, shared vs native boundaries |
| [docs/platforms.md](docs/platforms.md) | Web, Android TV, webOS — constraints and order of delivery |
| [docs/glossary.md](docs/glossary.md) | Terms used across the project |
| [AGENTS.md](AGENTS.md) | Pointers for AI assistants working in this repo |

## Suggested build order (when you implement)

1. **Web app** — validate UX, parsing, and API contracts quickly.  
2. **Android TV** — native player quality and lean-back UX.  
3. **LG webOS** — web stack aligned with web where possible, tuned for TV performance.

## Git

If this folder is not yet a Git repository, run `git init` locally, add a remote (for example `https://github.com/mehdi-nasiri-jahroodi/iptv-player.git`), and push your branch.

## License

TBD. Add a `LICENSE` file when the project is public or distributed.
