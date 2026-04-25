import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SourceForm, type SourceFormSubmission } from 'ui';
import {
  validateSource,
  type Source,
  type SourceValidationResult,
} from 'core';
import { SourcesStore, newSourceId } from '../features/sources/sources-storage';

/**
 * Browser `fetch` is shape-compatible with `core`'s `FetchLike`
 * (`{ ok, status, text() }` ⊂ `Response`); this thin wrapper narrows the type
 * and keeps any future cross-runtime tweaks (proxy, headers, …) in one place.
 */
async function browserFetch(input: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }> {
  const res = await fetch(input, { redirect: 'follow' });
  return { ok: res.ok, status: res.status, text: () => res.text() };
}

export default function AddSourceRoute() {
  const navigate = useNavigate();
  const [savedSource, setSavedSource] = useState<Source | null>(null);

  async function handleSubmit(submission: SourceFormSubmission): Promise<SourceValidationResult> {
    const candidate: Source = { id: newSourceId(), ...submission.source };
    const result = await validateSource(candidate, {
      fetcher: browserFetch,
      rawM3uText: submission.rawText,
    });
    if (result.ok) {
      // Persist eagerly so a navigation right after `onSuccess` finds the source.
      const store = new SourcesStore();
      await store.addSource(result.source);
      setSavedSource(result.source);
    }
    return result;
  }

  function handleSuccess(): void {
    // Brief confirmation, then send the user home. (A future revision will land
    // them on the channel browser scoped to the new source.)
    setTimeout(() => {
      void navigate('/');
    }, 600);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Add a source</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Connect an M3U playlist URL, upload an M3U file, or sign in with Xtream Codes.
        </p>
      </header>

      {savedSource ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
          data-testid="source-saved"
        >
          Saved <strong>{savedSource.label}</strong>. Redirecting…
        </div>
      ) : null}

      <SourceForm
        onSubmit={handleSubmit}
        onSuccess={handleSuccess}
        onCancel={() => void navigate('/')}
      />
    </main>
  );
}
