# AI / agent context

This file helps automated assistants (and humans) work consistently in this repository.

## Version control (assistants)

- **Do not commit or push on your own.** Never run `git commit`, `git push`, or similar to publish changes unless the user **explicitly** asks you to commit and/or push in that request. Prepare diffs and files only; the user controls what enters Git and the remote.

## Current state

- **Monorepo:** **pnpm** workspaces + **Nx** ([`package.json`](package.json), [`pnpm-workspace.yaml`](pnpm-workspace.yaml)). Prefer `pnpm exec nx …` or `pnpm nx …` for tasks. **Technology choices** remain in [docs/architecture.md](docs/architecture.md) and [docs/platforms.md](docs/platforms.md).
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


<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace package manager (e.g. `pnpm exec nx run web:build`, `pnpm nx graph`) — avoids relying on a globally installed Nx CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->