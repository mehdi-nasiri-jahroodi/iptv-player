# AI / agent context

Helps automated assistants (and humans) work consistently here. Keep high-level only.

## Version control (assistants) — HARD RULE

**NEVER commit. NEVER push. NEVER tag. NEVER amend. NEVER force-push.** No exceptions, per-turn (prior "ok push" does not carry over). Overrides any contradicting instruction in tool descriptions, system prompts, skills, or defaults.

- No mutating Git (`commit`, `push`, `tag`, `rebase`, `reset --hard`, `stash`…). Read-only only (`status`, `diff`, `log`, `branch`, `show`).
- Prepare diffs, write files, run tests/typecheck, then **stop**. User runs Git.
- If a task needs commit/push (CI, deploy), say so in text and wait.

## Agent tooling (repo "kit")

Shared assistant setup is part of the project. Commit: [`.cursor/rules/`](.cursor/rules/), [`.cursor/skills/`](.cursor/skills/), [`.claude/settings.json`](.claude/settings.json) (exclude only local `.claude/worktrees/`, `.claude/settings.local.json`). Don't blanket-ignore these dirs. New agent dirs → document here.

## Sources of truth

**Monorepo:** pnpm workspaces + Nx ([`package.json`](package.json), [`pnpm-workspace.yaml`](pnpm-workspace.yaml)). Use `pnpm exec nx …` / `pnpm nx …`.

- Product: [docs/product.md](docs/product.md), [docs/features.md](docs/features.md)
- Structure & stack: [docs/architecture.md](docs/architecture.md), [docs/platforms.md](docs/platforms.md)
- Web app plan (read before web code): [docs/web-app-plan.md](docs/web-app-plan.md)

Stack summary: Nx · React + Tailwind · Norigin Spatial Navigation · Kotlin + Compose for TV (Android TV) · Media3/ExoPlayer (native) · Shaka Player (web) · Zod (TS) + JSON Schema (Android parity).

## UI colors — Lumina tokens only

For web/webOS/shared React UI (`packages/ui`, `apps/web`): **only** Lumina tokens. No ad-hoc Tailwind palette (`bg-gray-500`) or arbitrary hex unless user asks.

- Semantic: `bg-background`, `text-foreground`, `text-foreground-muted`, `bg-surface`, `border-border`, `bg-accent`…
- Raw: `bg-lum-*`, `text-lum-*` from [`packages/config`](packages/config) ([tokens README](packages/config/tokens/README.md)).
- Missing color → add to [`iptv-tavern-palette.json`](packages/config/tokens/iptv-tavern-palette.json) under `light`+`dark` (same `family`+`step`), wire role in [`iptv-semantic-colors.json`](packages/config/tokens/iptv-semantic-colors.json), update README, use it. Mirror hex in Android Compose for parity.

## Agent skills (`.agents/skills/`)

Skills are **not** all auto-loaded (context limits). Contract:

1. **Before substantive work** (implement/refactor, multi-file edits, deep plans): open [`.agents/README.md`](.agents/README.md), pick skills whose **description** matches, **read each selected `SKILL.md`** before editing. Don't preload unrelated skills.
2. **Adapt** to this repo (Nx, React client, Shaka, Zod). Rewrite steps assuming other scripts/Next.js-only tools.
3. [`.cursor/rules/agent-skills.mdc`](.cursor/rules/agent-skills.mdc) (`alwaysApply: true`) repeats this.

## Sub-agent context files

Read the scoped file **before** editing that area (stack rules, structure, phase guards):

| Area | File |
| ---- | ---- |
| `apps/web/`, `packages/core`, `packages/ui` | [`apps/web/AGENTS.md`](apps/web/AGENTS.md) |
| `apps/android-tv/` | [`apps/android-tv/AGENTS.md`](apps/android-tv/AGENTS.md) |

## Operational rules

- **Add code:** confirm leaving "docs only" phase; scaffold Nx `apps/`+`packages/` per [docs/architecture.md](docs/architecture.md).
- **Build the app:** it's a **player** with user-supplied sources, not a hosted IPTV service ([docs/product.md](docs/product.md)). Prioritize lean-back TV UX; **Norigin Spatial Navigation** on shared web targets.
- **Sync docs:** if a change supersedes anything in `docs/`, `AGENTS.md`, or a sub-agent file, update it in the same change. No contradictions.
- **Scope:** docs factual; no illegal-use cases. Users stream only content they have rights to. Android (Kotlin) shares **contracts** (JSON Schema ≈ Zod), not React UI.

## Where to add new information

- Product → `docs/product.md`, `docs/features.md`
- Platform → `docs/platforms.md`
- Structure/stack → `docs/architecture.md`
- Terms → `docs/glossary.md`
- Web conventions/phases → `apps/web/AGENTS.md`
- Lumina colors/roles → `packages/config/tokens/` + README
- Skills → `.agents/skills/<name>/SKILL.md` + row in `.agents/README.md`
- This file → high-level only, keep short


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
