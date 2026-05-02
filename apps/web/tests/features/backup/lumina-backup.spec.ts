import { beforeEach, describe, expect, it } from 'vitest';
import {
  importLuminaBackupFromJson,
  parseLuminaBackupBundle,
} from '../../../app/features/backup/lumina-backup';
import { SETTINGS_STORAGE_KEY } from '../../../app/store/settings-store';
import { PROFILE_LOCAL_STORAGE_KEY } from '../../../app/store/profile-store';
import { GUIDED_SOURCE_SETUP_DONE_KEY } from '../../../app/lib/guided-setup-storage';
import { SourcesStore } from '../../../app/features/sources/sources-storage';

const SOURCES_KEY = 'iptv.sources.v1';

describe('lumina backup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rejects invalid JSON', async () => {
    const r = await importLuminaBackupFromJson('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/json/i);
  });

  it('rejects unknown bundle shape', async () => {
    const r = await importLuminaBackupFromJson(JSON.stringify({ foo: 1 }));
    expect(r.ok).toBe(false);
  });

  it('parses export with extra appVersion field', () => {
    const raw = {
      luminaBackup: 1,
      exportVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      sources: { sources: [], activeSourceId: null },
      playlists: { bySourceId: {} },
      settingsPersist: null,
      profilePersist: null,
      guidedSourceSetupDone: false,
      viewerResponsibilityAck: false,
      appVersion: '9.9.9',
    };
    expect(parseLuminaBackupBundle(raw)).not.toBeNull();
  });

  it('import overwrites sources and storage keys', async () => {
    localStorage.setItem(
      SOURCES_KEY,
      JSON.stringify({
        sources: [
          {
            id: 'old',
            label: 'Old',
            type: 'm3u_url',
            url: 'https://example.com/old.m3u',
          },
        ],
        activeSourceId: 'old',
      })
    );

    const backup = {
      luminaBackup: 1,
      exportVersion: 1,
      exportedAt: '2026-05-01T12:00:00.000Z',
      sources: {
        sources: [
          {
            id: 'new1',
            label: 'Imported',
            type: 'm3u_url',
            url: 'https://example.com/new.m3u',
          },
        ],
        activeSourceId: 'new1',
      },
      playlists: {
        bySourceId: {
          new1: {
            sourceId: 'new1',
            groups: [{ id: 'g1', name: 'All', kind: 'mixed', channels: [] }],
            fetchedAt: '2026-05-01T12:00:00.000Z',
          },
        },
      },
      settingsPersist: JSON.stringify({
        state: { streamProxy: null, acknowledgedResponsibilityV1: true },
        version: 1,
      }),
      profilePersist: JSON.stringify({
        state: {
          profile: { id: 'default', name: 'Backup User', favorites: [], recents: [] },
          catalogOrders: {},
        },
        version: 1,
      }),
      guidedSourceSetupDone: true,
      viewerResponsibilityAck: true,
    };

    const r = await importLuminaBackupFromJson(JSON.stringify(backup));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sourcesCount).toBe(1);

    const st = await new SourcesStore().read();
    expect(st.sources).toHaveLength(1);
    expect(st.sources[0]?.id).toBe('new1');

    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('acknowledgedResponsibilityV1');
    expect(localStorage.getItem(PROFILE_LOCAL_STORAGE_KEY)).toContain('Backup User');
    expect(localStorage.getItem(GUIDED_SOURCE_SETUP_DONE_KEY)).toBe('1');
  });
});
