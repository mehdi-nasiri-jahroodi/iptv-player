import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Stack } from 'ui';
import {
  exportLuminaBackupJson,
  importLuminaBackupFromJson,
  luminaBackupDownloadFilename,
} from '../features/backup/lumina-backup';

/**
 * Export / import full on-device state (sources, M3U snapshots, profile, settings, first-run flag, legal ack).
 * Import always overwrites existing data on this browser profile.
 */
export function SettingsBackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy('export');
    try {
      const json = await exportLuminaBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = luminaBackupDownloadFilename();
      a.rel = 'noopener';
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Backup downloaded. Store it somewhere safe — it contains playlist credentials.');
    } catch {
      setError('Could not build the backup file.');
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(ev: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;

    const ok = window.confirm(
      'Replace all data on this device with this backup? Sources, cached M3U catalogs, profile, stream proxy settings, and first-run progress will be overwritten. This cannot be undone.'
    );
    if (!ok) return;

    setError(null);
    setMessage(null);
    setBusy('import');
    try {
      const text = await file.text();
      const result = await importLuminaBackupFromJson(text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(
        result.sourcesCount > 0
          ? `Restored backup with ${result.sourcesCount} source(s). In-memory catalog cache was cleared — open Live / Movies / Series to reload.`
          : 'Restored backup (no sources in file). Add a source when you are ready.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="rounded-lg border border-border bg-surface p-5"
      id="settings-backup"
      aria-labelledby="settings-backup-heading"
      data-testid="settings-backup"
    >
      <h2 id="settings-backup-heading" className="text-lg font-medium text-foreground">
        Backup &amp; restore
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
        Download everything this app keeps on this device, or restore from a file. Imports replace current data
        completely. Backups include source credentials and proxy secrets — treat them as sensitive.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void handleFile(e)}
      />

      <Stack gap={3} className="mt-4">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            focusKey="SETTINGS_BACKUP_EXPORT"
            disabled={busy !== null}
            onClick={() => void handleExport()}
          >
            {busy === 'export' ? 'Preparing…' : 'Export backup…'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            focusKey="SETTINGS_BACKUP_IMPORT"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {busy === 'import' ? 'Importing…' : 'Import backup…'}
          </Button>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-foreground-muted">{message}</p> : null}
      </Stack>
    </section>
  );
}
