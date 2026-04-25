# `config`

Workspace **Tailwind CSS preset** and **IPTV tavern color tokens** shared by web, future webOS shell, `packages/ui`, and native apps (via JSON).

## Design tokens (colors)

- **Palette:** [`tokens/iptv-tavern-palette.json`](tokens/iptv-tavern-palette.json) — dual **`iptvTavern.light`** / **`iptvTavern.dark`** trees (same `family` + `step` keys). Tools read both for native parity.
- **Semantics:** [`tokens/iptv-semantic-colors.json`](tokens/iptv-semantic-colors.json) — roles map to **`mode.family.step`** (e.g. `light.cream.1`, `dark.brown.1`).
- **How it wires up:** [`tokens/README.md`](tokens/README.md).

**Package exports**

- `config/tailwind-preset` — Tailwind preset (`--iptv-paint-*` + `--iptv-color-*` on `:root` / `.dark`; `iptv-tavern-*` utilities use paint vars).
- `config/tokens/iptv-tavern-palette` — JSON for Android, scripts, or documentation.
- `config/tokens/iptv-semantic-colors` — JSON for parity with Kotlin theming.

## Usage

**Tailwind v3** — in `tailwind.config.js`:

```js
const iptvPreset = require('config/tailwind-preset');

module.exports = {
  darkMode: 'class',
  presets: [iptvPreset],
  content: [/* app + libs */],
  plugins: [],
};
```

Add a dependency on `config` from the consuming package (`"config": "workspace:*"`).

## Dark mode

The preset sets **`--iptv-paint-*`** from **`light`** on **`:root`** and overrides them from **`dark`** on **`.dark`**, so **`bg-iptv-tavern-*`** utilities track the theme without `dark:` prefixes. Semantics use **`--iptv-color-*`** the same way.

The web app includes **`AutoTheme`** (`apps/web/app/auto-theme.tsx`), which toggles **`html.dark`** from **`prefers-color-scheme`**. Override by managing `document.documentElement.classList` (e.g. a future user setting).
