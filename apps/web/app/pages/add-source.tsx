import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SourceForm, type SourceFormSubmission } from 'ui';
import {
  parseM3uToPlaylist,
  validateSource,
  type Source,
  type SourceValidationResult,
} from 'core';
import { SourcesStore, newSourceId } from '../features/sources/sources-storage';
import { PlaylistsStore } from '../features/sources/playlists-storage';

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
      // Persist the source first so a navigation right after `onSuccess` finds it.
      const sourcesStore = new SourcesStore();
      await sourcesStore.addSource(result.source);

      // For M3U sources, also snapshot the parsed playlist so the browse view
      // renders without re-fetching (and works offline for file imports). For
      // Xtream the catalog store fetches live — see playlists-storage.ts.
      if (result.source.type === 'm3u_file' && submission.rawText) {
        const playlist = parseM3uToPlaylist(submission.rawText, result.source.id);
        await new PlaylistsStore().setForSource(result.source.id, playlist);
      } else if (result.source.type === 'm3u_url') {
        // The validator already fetched + parsed the URL successfully; refetch
        // here once to capture the parsed snapshot. Cheap relative to add-source.
        try {
          const res = await browserFetch(result.source.url ?? '');
          if (res.ok) {
            const playlist = parseM3uToPlaylist(await res.text(), result.source.id);
            await new PlaylistsStore().setForSource(result.source.id, playlist);
          }
        } catch {
          // Snapshot is best-effort; the catalog store will retry on demand.
        }
      }

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
    <main className="scrollbar-slim mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto p-6">
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
