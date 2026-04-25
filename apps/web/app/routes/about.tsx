export default function AboutComponent() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-foreground">About</h1>
      <p className="mt-2 text-foreground-muted">
        Product docs live in <code className="rounded bg-surface-raised px-1">docs/</code>.
      </p>
    </div>
  );
}

