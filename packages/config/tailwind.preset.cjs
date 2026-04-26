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
  semanticRgbCssVars,
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
        /** Semantic roles use `rgb(… / <alpha-value>)` so utilities like `bg-accent/20` work. */
        background: {
          DEFAULT: 'rgb(var(--iptv-color-background-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--iptv-color-background-subtle-rgb) / <alpha-value>)',
        },
        foreground: {
          DEFAULT: 'rgb(var(--iptv-color-foreground-rgb) / <alpha-value>)',
          muted: 'rgb(var(--iptv-color-foreground-muted-rgb) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--iptv-color-surface-rgb) / <alpha-value>)',
          raised: 'rgb(var(--iptv-color-surface-raised-rgb) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--iptv-color-accent-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--iptv-color-accent-foreground-rgb) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--iptv-color-border-rgb) / <alpha-value>)',
          strong: 'rgb(var(--iptv-color-border-strong-rgb) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--iptv-color-danger-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--iptv-color-danger-foreground-rgb) / <alpha-value>)',
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
          ...semanticRgbCssVars(dual, semanticJson.light),
        },
        '.dark': {
          ...flattenPaintVars(dual.dark),
          ...semanticCssVars(dual, semanticJson.dark),
          ...semanticRgbCssVars(dual, semanticJson.dark),
        },
      });
    }),
  ],
};
