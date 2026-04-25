export function Ui() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-foreground">
      <h1 className="text-lg font-semibold text-foreground">packages/ui</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Shared components use the workspace Tailwind preset from{' '}
        <code className="rounded bg-background-subtle px-1">config</code>.
      </p>
    </div>
  );
}

export default Ui;
