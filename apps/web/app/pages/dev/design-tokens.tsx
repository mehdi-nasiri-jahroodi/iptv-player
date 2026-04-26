import { useState } from 'react';
import { Link } from 'react-router';
import palette from 'config/tokens/iptv-tavern-palette.json';
import semantic from 'config/tokens/iptv-semantic-colors.json';

type DualPalette = {
  light: Record<string, Record<string, string>>;
  dark: Record<string, Record<string, string>>;
};

type Mode = 'light' | 'dark';

/** Docs: Tailwind utility name (uses CSS var under the hood — flips with `.dark`). */
function tailwindBgClass(family: string, step: string) {
  return `bg-lum-${family}-${step}`;
}

function resolvePaletteRef(dual: DualPalette, ref: string): string {
  const [mode, family, step] = ref.split('.');
  return dual[mode as Mode]?.[family]?.[step] ?? '';
}

/** Space-separated `r g b` for Tailwind `rgb(var(--…) / α)` (matches preset `semanticRgbCssVars`). */
function hexToRgbSpaceSeparated(hex: string): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function buildThemeVars(
  dual: DualPalette,
  semanticMap: Record<string, Record<string, string>>,
  mode: Mode
) {
  const vars: Record<string, string> = {};

  for (const [family, steps] of Object.entries(dual[mode])) {
    for (const [step, hex] of Object.entries(steps)) {
      vars[`--iptv-paint-${family}-${step}`] = hex;
    }
  }

  for (const [group, shades] of Object.entries(semanticMap)) {
    for (const [shade, paletteRef] of Object.entries(shades)) {
      const suffix = shade === 'DEFAULT' ? group : `${group}-${shade}`;
      const hex = resolvePaletteRef(dual, paletteRef);
      vars[`--iptv-color-${suffix}`] = hex;
      vars[`--iptv-color-${suffix}-rgb`] = hexToRgbSpaceSeparated(hex);
    }
  }

  return vars;
}

export default function DevDesignTokens() {
  const [mode, setMode] = useState<Mode>('light');
  const dual = palette.iptvTavern as DualPalette;
  const semanticMap = semantic[mode] as Record<string, Record<string, string>>;
  const previewVars = buildThemeVars(dual, semanticMap, mode);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="scrollbar-slim flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
      <div className="border-b border-dashed border-lum-turquoise-4/80 bg-lum-turquoise-5/30 px-4 py-2 text-center text-sm font-medium text-lum-neutral-1 dark:text-lum-neutral-2">
        Development only — this route is omitted from production builds.
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lumina-IPTV token lab</h1>
            <p className="mt-1 text-sm text-foreground-muted">
              Dual <code className="rounded bg-surface-raised px-1">light</code> /{' '}
              <code className="rounded bg-surface-raised px-1">dark</code> paints in JSON;{' '}
              <code className="rounded bg-surface-raised px-1">--iptv-paint-*</code> and semantics switch when{' '}
              <code className="rounded bg-surface-raised px-1">.dark</code> is on an ancestor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-raised"
            >
              {mode === 'dark' ? 'Preview: light' : 'Preview: dark'}
            </button>
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Home
            </Link>
          </div>
        </div>

        <div
          className="space-y-10 rounded-lg border border-border bg-background p-6"
          style={previewVars}
        >
          <section>
            <h2 className="text-lg font-semibold">Semantic roles</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Variables flip with the preview wrapper ({mode}).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['background', 'bg-background'],
                  ['background subtle', 'bg-background-subtle'],
                  ['foreground', 'bg-foreground'],
                  ['foreground muted', 'bg-foreground-muted'],
                  ['surface', 'bg-surface'],
                  ['surface raised', 'bg-surface-raised'],
                  ['accent', 'bg-accent'],
                  ['accent fg', 'bg-accent-foreground'],
                  ['border', 'bg-border'],
                  ['border strong', 'bg-border-strong'],
                ] as const
              ).map(([label, cls]) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
                >
                  <div className={`h-12 w-12 shrink-0 rounded ${cls}`} aria-hidden />
                  <div className="min-w-0 text-sm">
                    <div className="font-medium capitalize">{label}</div>
                    <code className="text-xs text-foreground-muted">{cls}</code>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {Object.entries(dual.light).map(([family, steps]) => (
            <section key={family}>
              <h2 className="text-lg font-semibold capitalize">{family}</h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Swatch uses <code className="rounded bg-surface-raised px-1">var(--iptv-paint-{family}-*)</code> — toggles
                with preview. Hex sources: <code className="rounded bg-surface-raised px-1">light</code> /{' '}
                <code className="rounded bg-surface-raised px-1">dark</code> in palette JSON.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Object.entries(steps).map(([step, lightHex]) => {
                  const darkHex = dual.dark[family]?.[step] ?? lightHex;
                  const tw = tailwindBgClass(family, step);
                  return (
                    <div
                      key={`${family}-${step}`}
                      className="overflow-hidden rounded-md border border-border bg-surface"
                    >
                      <div
                        className="h-20 w-full"
                        style={{
                          backgroundColor: `var(--iptv-paint-${family}-${step})`,
                        }}
                        title={tw}
                      />
                      <div className="space-y-1 p-2 font-mono text-xs">
                        <div className="font-semibold text-foreground">
                          {family}.{step}
                        </div>
                        <div className="text-foreground-muted">
                          <span className="block">light: {lightHex}</span>
                          <span className="block">dark: {darkHex}</span>
                        </div>
                        <div className="truncate text-foreground-muted">{tw}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <h2 className="text-lg font-semibold">Semantic map (JSON)</h2>
            <p className="mt-1 text-sm text-foreground-muted">Refs use mode.family.step (e.g. light.turquoise.3)</p>
            <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-surface-raised p-3 text-xs leading-relaxed text-foreground">
              {JSON.stringify(semantic, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
