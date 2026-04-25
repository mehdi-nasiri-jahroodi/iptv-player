# Agent skills (this repository)

Skills live under `.agents/skills/<skill-name>/`. Each skill’s entry point is **`SKILL.md`** (YAML frontmatter with `name` and `description`).

Assistants should **not** load every skill every turn (too large for context). Use **[.agents/README.md](README.md)** (this file) to pick **task-relevant** skills, then read only those `SKILL.md` files.

Some skills mention other products (e.g. Metabase, Next.js-only APIs, `yarn` scripts). **Adapt** commands and stack-specific advice to this repo ([docs/architecture.md](../docs/architecture.md): Nx, Vite-style web app unless you add Next.js, etc.).

## Index (when to open which skill)

| Skill folder | Use when… |
| ------------ | --------- |
| [android-native-dev](skills/android-native-dev/) | Kotlin / Android TV / Compose / Media3 work in `apps/android-tv/` |
| [fix](skills/fix/) | Lint/format/CI hygiene before merge (adapt scripts to this monorepo once they exist) |
| [frontend-design](skills/frontend-design/) | Building or restyling web UI for polish and distinctive layout |
| [typescript-advanced-types](skills/typescript-advanced-types/) | Complex TS types, generics, inference in `packages/core` or shared libs |
| [typescript-review](skills/typescript-review/) | Reviewing TS/JS diffs for quality (ignore unrelated org-specific standards) |
| [vercel-composition-patterns](skills/vercel-composition-patterns/) | Refactoring React structure, compound components, context |
| [vercel-react-best-practices](skills/vercel-react-best-practices/) | Writing or reviewing React performance patterns (many rules are Next/RSC-flavored—apply what fits a client-only Vite/React app) |
| [web-artifacts-builder](skills/web-artifacts-builder/) | Only if you adopt its artifact scripts; otherwise skip |
| [web-design-guidelines](skills/web-design-guidelines/) | UI review, accessibility, “check my site” style audits |

To add a skill: create `.agents/skills/<id>/SKILL.md` with frontmatter, then add one row to the table above.
