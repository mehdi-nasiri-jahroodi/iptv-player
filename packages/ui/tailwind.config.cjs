const { join } = require('path');
const preset = require('config/tailwind-preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  presets: [preset],
  content: [join(__dirname, 'src/**/*.{ts,tsx,html}')],
  theme: {
    extend: {},
  },
  plugins: [],
};
