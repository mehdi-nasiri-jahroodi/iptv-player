import { FocusableItem, AppScreen, Stack } from 'ui';

export function App() {
  return (
    <AppScreen>
      <Stack className="mx-auto max-w-lg p-6" gap={6}>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Lumina-IPTV — web
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Repository bootstrap: Nx + pnpm, shared Tailwind preset (
            <code className="rounded bg-surface-raised px-1 text-xs">packages/config</code>
            ), and <code className="rounded bg-surface-raised px-1 text-xs">ui</code>{' '}
            primitives. Use arrow keys to move focus between items.
          </p>
        </header>
        <Stack gap={3}>
          <FocusableItem focusKey="BOOTSTRAP_ITEM_1" className="border border-border bg-surface p-4">
            <span className="font-medium">Focus target A</span>
            <p className="mt-1 text-sm text-foreground-muted">Spatial navigation (Norigin)</p>
          </FocusableItem>
          <FocusableItem focusKey="BOOTSTRAP_ITEM_2" className="border border-border bg-surface p-4">
            <span className="font-medium">Focus target B</span>
            <p className="mt-1 text-sm text-foreground-muted">Tab or arrow keys</p>
          </FocusableItem>
        </Stack>
      </Stack>
    </AppScreen>
  );
}

export default App;
