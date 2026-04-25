/**
 * Shared Tailwind preset for `apps/web`, `apps/webOS` (later), and `packages/ui`.
 * - Dual palette: `tokens/iptv-tavern-palette.json` → `iptvTavern.light` / `iptvTavern.dark`.
 * - `:root` / `.dark` set `--iptv-paint-*` so `bg-lum-red-1` follows the active theme automatically.
 * - Semantic roles use `--iptv-color-*` from `tokens/iptv-semantic-colors.json` (refs like `light.turquoise.3`).
 * @type {import('tailwindcss').Config}
 */
const plugin = require('tailwindcss/plugin');
const {
  semanticCssVars,
  flattenPaintVars,
  buildIptvTavernTailwindColors,
} = require('./lib/iptv-semantic-css-vars.cjs');

const paletteJson = require('./tokens/iptv-tavern-palette.json');
const semanticJson = require('./tokens/iptv-semantic-colors.json');

const dual = paletteJson.iptvTavern;

module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: 'var(--iptv-color-background)',
          subtle: 'var(--iptv-color-background-subtle)',
        },
        foreground: {
          DEFAULT: 'var(--iptv-color-foreground)',
          muted: 'var(--iptv-color-foreground-muted)',
        },
        surface: {
          DEFAULT: 'var(--iptv-color-surface)',
          raised: 'var(--iptv-color-surface-raised)',
        },
        accent: {
          DEFAULT: 'var(--iptv-color-accent)',
          foreground: 'var(--iptv-color-accent-foreground)',
        },
        border: {
          DEFAULT: 'var(--iptv-color-border)',
          strong: 'var(--iptv-color-border-strong)',
        },
        lum: buildIptvTavernTailwindColors(dual.light),
        'iptv-tavern': buildIptvTavernTailwindColors(dual.light),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        focus:
          '0 0 0 2px color-mix(in srgb, var(--iptv-paint-turquoise-4) 45%, transparent)',
      },
    },
  },
  plugins: [
    plugin(function ({ addBase }) {
      addBase({
        ':root': {
          ...flattenPaintVars(dual.light),
          ...semanticCssVars(dual, semanticJson.light),
        },
        '.dark': {
          ...flattenPaintVars(dual.dark),
          ...semanticCssVars(dual, semanticJson.dark),
        },
      });
    }),
  ],
};
