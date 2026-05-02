import { Button, SourceForm, Stack, type SourceFormSubmission } from 'ui';
import type { Source, SourceValidationResult } from 'core';
import { newSourceId } from '../features/sources/sources-storage';
import { validatePersistAndSnapshotSource } from '../features/sources/persist-validated-source';
import { useSettingsStore } from '../store/settings-store';

export type AddSourceModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a source is saved successfully (before modal closes). */
  onAdded?: () => void;
};

export function AddSourceModal({ open, onClose, onAdded }: AddSourceModalProps) {
  const streamProxy = useSettingsStore((s) => s.streamProxy);

  if (!open) return null;

  async function handleSubmit(submission: SourceFormSubmission): Promise<SourceValidationResult> {
    const candidate: Source = { id: newSourceId(), ...submission.source };
    const result = await validatePersistAndSnapshotSource(candidate, {
      streamProxy,
      rawM3uText: submission.rawText,
    });
    return result;
  }

  function handleSuccess(): void {
    onAdded?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-modal-title"
      data-testid="add-source-modal"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="max-h-[min(92vh,800px)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="add-source-modal-title" className="text-xl font-semibold text-foreground">
              Add a source
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              M3U URL, M3U file, or Xtream Codes. You can add more sources anytime from Settings.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" focusKey="ADD_SOURCE_MODAL_CLOSE" onClick={onClose}>
            Close
          </Button>
        </div>

        <Stack gap={2}>
          <SourceForm
            initialMode="xtream"
            onSubmit={handleSubmit}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        </Stack>
      </div>
    </div>
  );
}
