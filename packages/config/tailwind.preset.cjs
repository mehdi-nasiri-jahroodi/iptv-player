/**
 * Shared Tailwind preset for `apps/web`, `apps/webos` (later), and `packages/ui`.
 * Consumers set `darkMode: 'class'` on `<html>` and toggle `class="dark"` for theme.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#f4f6f8',
          subtle: '#e8ecf0',
        },
        foreground: {
          DEFAULT: '#0f1419',
          muted: '#5c6b7a',
        },
        surface: {
          DEFAULT: '#ffffff',
          raised: '#fafbfc',
        },
        accent: {
          DEFAULT: '#2563eb',
          foreground: '#ffffff',
        },
        border: {
          DEFAULT: '#d5dee8',
          strong: '#9aaab8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        focus: '0 0 0 2px rgb(37 99 235 / 0.45)',
      },
    },
  },
};
