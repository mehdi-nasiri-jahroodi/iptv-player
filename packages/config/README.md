# `config`

Workspace **Tailwind CSS preset** shared by web, future webOS shell, and `packages/ui`.

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

The preset defines light-first tokens. Override in the app with Tailwind `dark:` variants after setting `darkMode: 'class'` and toggling `class="dark"` on `<html>` (see `apps/web/app/root.tsx`).
