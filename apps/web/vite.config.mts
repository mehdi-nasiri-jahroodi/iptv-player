/// <reference types='vitest' />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const monorepoVersion = (() => {
  try {
    const raw = readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8');
    const v = (JSON.parse(raw) as { version?: string }).version;
    return typeof v === 'string' && v.length > 0 ? v : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(monorepoVersion),
  },
  root: import.meta.dirname,
  base: process.env.VITE_BASE_PATH ?? '/',
  cacheDir: '../../node_modules/.vite/apps/web',
  resolve: {
    // Resolve workspace packages (`player`, `core`, `ui`) directly to their
    // TS source via the custom `iptv-player` export condition declared in
    // each package.json. Without this Vite would pick the `import` condition
    // (`./dist/index.js`), which means every edit to a `packages/*/src`
    // file would require a manual `nx build` before HMR sees it. With the
    // condition, Vite imports the source files and HMR works as expected.
    conditions: ['iptv-player', 'import', 'module', 'browser', 'default'],
    alias: {
      'config/tokens': path.join(workspaceRoot, 'packages/config/tokens'),
    },
  },
  server:{
    port: 4200,
    host: 'localhost',
  },
  preview:{
    port: 4200,
    host: 'localhost',
  },
  plugins: [!process.env.VITEST && reactRouter()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    }
  },
}));
