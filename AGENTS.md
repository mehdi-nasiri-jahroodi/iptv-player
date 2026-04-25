# AI / agent context

This file helps automated assistants (and humans) work consistently in this repository.

## Version control (assistants)

- **Do not commit or push on your own.** Never run `git commit`, `git push`, or similar to publish changes unless the user **explicitly** asks you to commit and/or push in that request. Prepare diffs and files only; the user controls what enters Git and the remote.

## Current state

- **Documentation-first; stack decided.** Application code, manifests, and CI are not in the repo yet, but **technology choices are recorded** in [docs/architecture.md](docs/architecture.md) and [docs/platforms.md](docs/platforms.md). Prefer that stack when proposing or adding implementation.
- **Source of truth** for product direction: [docs/product.md](docs/product.md) and [docs/features.md](docs/features.md).
- **Source of truth** for structure and stack: [docs/architecture.md](docs/architecture.md) and [docs/platforms.md](docs/platforms.md).
- **Web app implementation plan** (phases, module breakdown, state, testing): [docs/web-app-plan.md](docs/web-app-plan.md). Read this before proposing or adding web app code.

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

## Agent skills (`.agents/skills/`)

You **cannot** rely on every skill being loaded automatically before every message (context limits). You **can** rely on this contract:

1. **Before substantive work** (implementing or refactoring code, multi-file edits, or deep technical plans): open **[.agents/README.md](.agents/README.md)**, pick skills whose **description** matches the task, and **read each selected `SKILL.md`** with the Read tool before editing. Do not preload unrelated skills.
2. **Adapt** skill content to this repo (Nx, React client app, Shaka, Zod, etc.). Ignore or rewrite steps that assume another company’s scripts, Next.js-only features, or tools this repo does not use.
3. The Cursor rule **[.cursor/rules/agent-skills.mdc](.cursor/rules/agent-skills.mdc)** (`alwaysApply: true`) repeats this so it applies even if this file is not re-opened.

## Agent skills (`.agents/skills/`)

You **cannot** rely on every skill being loaded automatically before every message (context limits). You **can** rely on this contract:

1. **Before substantive work** (implementing or refactoring code, multi-file edits, or deep technical plans): open **[.agents/README.md](.agents/README.md)**, pick skills whose **description** matches the task, and **read each selected `SKILL.md`** with the Read tool before editing. Do not preload unrelated skills.
2. **Adapt** skill content to this repo (Nx, React client app, Shaka, Zod, etc.). Ignore or rewrite steps that assume another company's scripts, Next.js-only features, or tools this repo does not use.
3. The Cursor rule **[.cursor/rules/agent-skills.mdc](.cursor/rules/agent-skills.mdc)** (`alwaysApply: true`) repeats this so it applies even if this file is not re-opened.

## Sub-agent context files

When working inside a specific app or package, read the scoped context file for that area **before** making changes. These files contain stack rules, file structure, phase guards, and conventions that are too detailed for this root file.

| Area | Context file |
| ---- | ------------ |
| `apps/web/` and `packages/core`, `packages/ui` | [`apps/web/AGENTS.md`](apps/web/AGENTS.md) |

> If you are working in `apps/web/`, read `apps/web/AGENTS.md` for web-specific conventions before proceeding.

## If asked to add code

- Confirm the user wants to leave the "docs only" phase; then scaffold an **Nx** monorepo with `apps/` and `packages/` (or Nx `libs/`) per [docs/architecture.md](docs/architecture.md), using the stack above.

## If asked to "build the app"

- Re-read [docs/product.md](docs/product.md) -- the product is a **player** with user-supplied sources, not a hosted IPTV service.
- Prioritize user-facing polish and lean-back (TV) UX when implementing Android TV and webOS; use **Norigin Spatial Navigation** for focus/D-pad behavior on shared web targets.

## Keeping docs and agent files in sync

- If a change deviates from or supersedes anything recorded in `docs/`, `AGENTS.md`, or a sub-agent context file (e.g. `apps/web/AGENTS.md`), **update those files in the same change**. Code and docs must never contradict each other.
- This applies to stack decisions, phase scope, file structure, naming conventions, and any rule stated in an agent file.

## Conventions to preserve

- Keep documentation **factual and scoped**; avoid listing illegal use cases. Users must only stream content they have rights to.
- **Monorepo (Nx):** shared web + webOS packages (React, Tailwind, domain logic); Android in **Kotlin** shares **contracts** (e.g. JSON Schema derived from or aligned with **Zod** definitions), not React UI.

## Where to add new information

- Product changes -> `docs/product.md` and `docs/features.md`
- Platform-specific decisions -> `docs/platforms.md`
- Structure / packages / stack -> `docs/architecture.md`
- New domain terms -> `docs/glossary.md`
- Web app conventions / phase rules -> `apps/web/AGENTS.md`
- New agent skills -> `.agents/skills/<name>/SKILL.md` and a row in `.agents/README.md`
- This file -> only high-level "how to work here" -- keep it short
