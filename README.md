# IPTV Player

A **bring-your-own-source** live TV and VOD **player** (not a content service). The product goal is a fast, simple, and polished experience across **Web**, **Android TV**, and **LG webOS** — with a shared product vision and a monorepo-friendly architecture when implementation begins.

## What this is

- A **client application** for playing streams the user is authorized to use (e.g. playlists, provider credentials), with strong UX: onboarding, EPG, favorites, search, and TV-remote–first navigation.
- **Not** a bundled channel service; users supply their own lawful sources.

## Repository contents (this phase)

This repository currently holds **product and architecture reference documentation only** — no application code, build tooling, or dependencies. Use it to align the team, onboard contributors, and give AI assistants a single source of truth for intent and structure.

| Document | Purpose |
| -------- | ------- |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/product.md](docs/product.md) | Vision, positioning, principles |
| [docs/features.md](docs/features.md) | Planned capabilities (MVP → later) |
| [docs/architecture.md](docs/architecture.md) | Monorepo layout, platform notes, shared vs native |
| [docs/platforms.md](docs/platforms.md) | Web, Android TV, webOS — constraints and order of delivery |
| [docs/glossary.md](docs/glossary.md) | Terms used across the project |
| [AGENTS.md](AGENTS.md) | Pointers for AI assistants working in this repo |
| [docs/setup.md](docs/setup.md) | How to initialize Git locally |

## Suggested build order (when you implement)

1. **Web app** — validate UX, parsing, and API contracts quickly.  
2. **Android TV** — native player quality and lean-back UX.  
3. **LG webOS** — web stack aligned with web where possible, tuned for TV performance.

## Git

This directory is ready to be a Git project; **initialize Git on your machine** (see [docs/setup.md](docs/setup.md)). Automated environments may be unable to write `.git` in `Documents/`; running the commands locally avoids that.

## License

TBD. Add a `LICENSE` file when the project is public or distributed.
