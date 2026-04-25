# IPTV design tokens (colors)

Dual **light** and **dark** tavern palettes, one naming scheme per family (`neutral`, `brown`, `cream`, …) and **numbered steps** (`1`…`n`). Tailwind + CSS variables keep **one utility name** (e.g. `bg-iptv-tavern-red-1`) while the resolved color **follows the active theme** when `<html>` has `class="dark"`.

## How automation works

1. **`iptv-tavern-palette.json`** defines `iptvTavern.light` and `iptvTavern.dark` with **the same** `family` / `step` keys. Edit hex independently per mode.
2. The Tailwind preset injects **`--iptv-paint-{family}-{step}`** on `:root` from `light` and overrides the same variables on **`.dark`** from `dark`.
3. Theme colors **`iptv-tavern.*.*`** in Tailwind are `var(--iptv-paint-…)`, so **`bg-iptv-tavern-orange-3`** (and text/border variants) **switch automatically** — no `dark:` duplication in components.
4. **Semantic roles** (`background`, `foreground`, …) use **`--iptv-color-*`**, set from `iptv-semantic-colors.json` with refs like **`light.cream.1`** / **`dark.brown.1`** (mode + family + step). They flip the same way when `.dark` is on an ancestor.
5. **Web app:** `app/auto-theme.tsx` toggles **`html.dark`** from **`prefers-color-scheme`** (and when the OS preference changes).

To **force** light or dark regardless of OS, toggle `document.documentElement.classList` yourself (or add a settings control later).

## Files

| File | Purpose |
|------|---------|
| [`iptv-tavern-palette.json`](./iptv-tavern-palette.json) | `iptvTavern.light.*` / `iptvTavern.dark.*` — canonical hex per mode |
| [`iptv-semantic-colors.json`](./iptv-semantic-colors.json) | Semantic roles → **`mode.family.step`** refs (`light.cream.1`, `dark.neutral.1`, …) |

## Families (same keys in light & dark)

| Family | Steps | Typical use |
|--------|-------|-------------|
| **neutral** | 1–5 | Text + neutral borders (steps align by contrast role per mode) |
| **brown** | 1–5 | Wood / depth surfaces (especially dark UI backgrounds) |
| **cream** | 1–3 | Light surfaces (light mode) vs subtle panels on dark (dark mode) |
| **blue** | 1–2 | Cool panels / muted meta |
| **red** | 1–2 | Error / live / wine accent |
| **orange** | 1–5 | Primary warmth; **orange.5** drives `shadow-focus` (via `var(--iptv-paint-orange-5)`) |
| **gold** | 1–2 | Brass / chrome |
| **green** | 1–2 | Success / on-air |

## Tailwind

- **Semantic** (theme-aware): `bg-background`, `text-foreground`, `text-foreground-muted`, `bg-surface`, `border-border`, `bg-accent`, …
- **Raw paints** (same class, auto theme): `bg-iptv-tavern-red-1`, `text-iptv-tavern-orange-3`, `border-iptv-tavern-neutral-4`, …

**JIT note:** Tailwind still needs **literal** class strings in source for its scanner. For dynamic UI, use **`style={{ backgroundColor: \`var(--iptv-paint-${family}-${step})\` }}`** (variables are safe to build at runtime) or a map of full class names.

## Light palette (hex)

| Ref | Hex |
|-----|-----|
| light.neutral.1 | `#0c0a08` |
| light.neutral.2 | `#1a1612` |
| light.neutral.3 | `#6e655b` |
| light.neutral.4 | `#c4b5a0` |
| light.neutral.5 | `#a8947c` |
| light.brown.1 | `#0e0b09` |
| light.brown.5 | `#4a4036` |
| light.cream.1 | `#efe6d4` |
| light.cream.2 | `#f7f1e4` |
| light.cream.3 | `#f4e3c2` |
| light.blue.1 | `#1a2330` |
| light.blue.2 | `#8a9aad` |
| light.red.1 | `#6e2432` |
| light.orange.1 | `#c45c1a` |
| light.orange.5 | `#e8a03a` |
| … | (see JSON for every step) |

## Dark palette (hex)

| Ref | Hex |
|-----|-----|
| dark.neutral.1 | `#f4ede3` |
| dark.neutral.3 | `#a39e95` |
| dark.brown.1 | `#0e0b09` |
| dark.cream.1 | `#3a322a` |
| dark.blue.2 | `#9eb0c8` |
| dark.orange.2 | `#f0914a` |
| dark.orange.5 | `#f5bc5c` |
| … | (see JSON) |

## Adding a new shade

1. Add the same step key under **both** `iptvTavern.light.<family>` and `iptvTavern.dark.<family>`.
2. The preset will emit `--iptv-paint-<family>-<step>` and Tailwind `iptv-tavern-<family>-<step>` automatically (rebuild apps).
3. Optionally reference it from `iptv-semantic-colors.json` as `light.myfamily.6` / `dark.myfamily.6`.

## Live swatches (web, dev only)

Run `pnpm dev` / `nx run web:dev` and open **`/dev/design-tokens`** (nav: **Token lab**). Not included in production route config (`apps/web/AGENTS.md`).
