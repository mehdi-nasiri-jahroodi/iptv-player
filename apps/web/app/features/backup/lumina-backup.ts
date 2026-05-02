import { playlistSchema, sourceSchema, type Source } from 'core';
import { PlaylistsStore, type PlaylistsState } from '../sources/playlists-storage';
import { SourcesStore, type SourcesState } from '../sources/sources-storage';
import { getAppVersion } from '../../lib/app-version';
import {
  GUIDED_SOURCE_SETUP_DONE_KEY,
  readGuidedSourceSetupDone,
  setGuidedSourceSetupDone,
} from '../../lib/guided-setup-storage';
import {
  PROFILE_LOCAL_STORAGE_KEY,
  useProfileStore,
} from '../../store/profile-store';
import {
  RESPONSIBILITY_ACK_STORAGE_KEY,
  RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY,
  readResponsibilityAcknowledgedFromStorage,
  SETTINGS_STORAGE_KEY,
  useSettingsStore,
} from '../../store/settings-store';
import { useCatalogStore, _getDefaultXtreamCache } from '../../store/catalog-store';
import { useGuideStore } from '../../store/guide-store';

/** CustomEvent name: other UI (e.g. sources list) can refresh after restore. */
export const LUMINA_BACKUP_APPLIED_EVENT = 'lumina-backup-applied';

const EMPTY_SETTINGS_PERSIST = JSON.stringify({
  state: { streamProxy: null, acknowledgedResponsibilityV1: false },
  version: 1,
});

const EMPTY_PROFILE_PERSIST = JSON.stringify({
  state: {
    profile: { id: 'default', name: 'Viewer', favorites: [], recents: [] },
    catalogOrders: {},
  },
  version: 1,
});

export type LuminaBackupBundle = {
  luminaBackup: 1;
  exportVersion: 1;
  exportedAt: string;
  sources: SourcesState;
  playlists: PlaylistsState;
  settingsPersist: string | null;
  profilePersist: string | null;
  guidedSourceSetupDone: boolean;
  viewerResponsibilityAck: boolean;
};

export type ImportBackupResult =
  | { ok: true; sourcesCount: number }
  | { ok: false; message: string };

function parseSourcesState(data: unknown): SourcesState | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.sources)) return null;
  const sources: Source[] = [];
  for (const item of o.sources) {
    const r = sourceSchema.safeParse(item);
    if (!r.success) return null;
    sources.push(r.data);
  }
  const aid = o.activeSourceId;
  const activeSourceId = aid === null || typeof aid === 'string' ? aid : null;
  return { sources, activeSourceId };
}

function parsePlaylistsState(data: unknown): PlaylistsState | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const raw = o.bySourceId;
  if (!raw || typeof raw !== 'object') return null;
  const bySourceId: PlaylistsState['bySourceId'] = {};
  for (const [sourceId, pl] of Object.entries(raw)) {
    const r = playlistSchema.safeParse(pl);
    if (!r.success) return null;
    bySourceId[sourceId] = r.data;
  }
  return { bySourceId };
}

/**
 * Parse and validate a backup JSON object (unknown keys like `appVersion` are ignored).
 * Returns `null` when the shape does not match a v1 Lumina backup.
 */
export function parseLuminaBackupBundle(parsed: unknown): LuminaBackupBundle | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.luminaBackup !== 1 || o.exportVersion !== 1) return null;
  if (typeof o.exportedAt !== 'string') return null;
  if (typeof o.guidedSourceSetupDone !== 'boolean' || typeof o.viewerResponsibilityAck !== 'boolean') {
    return null;
  }
  if (o.settingsPersist != null && typeof o.settingsPersist !== 'string') return null;
  if (o.profilePersist != null && typeof o.profilePersist !== 'string') return null;
  const settingsPersist = typeof o.settingsPersist === 'string' ? o.settingsPersist : null;
  const profilePersist = typeof o.profilePersist === 'string' ? o.profilePersist : null;
  const sources = parseSourcesState(o.sources);
  const playlists = parsePlaylistsState(o.playlists);
  if (!sources || !playlists) return null;
  return {
    luminaBackup: 1,
    exportVersion: 1,
    exportedAt: o.exportedAt,
    sources,
    playlists,
    settingsPersist,
    profilePersist,
    guidedSourceSetupDone: o.guidedSourceSetupDone,
    viewerResponsibilityAck: o.viewerResponsibilityAck,
  };
}

function normalizeSourcesState(s: SourcesState): SourcesState {
  const ids = new Set(s.sources.map((x) => x.id));
  let active = s.activeSourceId;
  if (active && !ids.has(active)) {
    active = s.sources[0]?.id ?? null;
  }
  return { sources: [...s.sources], activeSourceId: active };
}

function filterPlaylistsToSources(playlists: PlaylistsState, sourceIds: Set<string>): PlaylistsState {
  const bySourceId: Record<string, (typeof playlists.bySourceId)[string]> = {};
  for (const [id, pl] of Object.entries(playlists.bySourceId)) {
    if (sourceIds.has(id)) bySourceId[id] = pl;
  }
  return { bySourceId };
}

function normalizeSettingsPersist(raw: string | null): string {
  if (!raw || raw.trim().length === 0) return EMPTY_SETTINGS_PERSIST;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return EMPTY_SETTINGS_PERSIST;
    const o = parsed as Record<string, unknown>;
    if (!o.state || typeof o.state !== 'object') return EMPTY_SETTINGS_PERSIST;
    return raw;
  } catch {
    return EMPTY_SETTINGS_PERSIST;
  }
}

function normalizeProfilePersist(raw: string | null): string {
  if (!raw || raw.trim().length === 0) return EMPTY_PROFILE_PERSIST;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return EMPTY_PROFILE_PERSIST;
    const o = parsed as Record<string, unknown>;
    const st = o.state as Record<string, unknown> | undefined;
    if (!st?.profile || typeof st.profile !== 'object') return EMPTY_PROFILE_PERSIST;
    return raw;
  } catch {
    return EMPTY_PROFILE_PERSIST;
  }
}

function mergeAckIntoSettingsBlob(raw: string, ack: boolean): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prevState =
      parsed.state && typeof parsed.state === 'object' && parsed.state !== null
        ? (parsed.state as Record<string, unknown>)
        : {};
    parsed.state = { ...prevState, acknowledgedResponsibilityV1: ack };
    if (typeof parsed.version !== 'number') parsed.version = 1;
    return JSON.stringify(parsed);
  } catch {
    return JSON.stringify({
      state: { streamProxy: null, acknowledgedResponsibilityV1: ack },
      version: 1,
    });
  }
}

function notifyBackupApplied(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LUMINA_BACKUP_APPLIED_EVENT));
}

/**
 * JSON backup of on-device data: sources, M3U snapshots, Zustand settings/profile blobs,
 * guided-setup flag, and the legal acknowledgement mirror used by the gate modal.
 */
export async function exportLuminaBackupJson(): Promise<string> {
  const [sourcesState, playlistsState] = await Promise.all([
    new SourcesStore().read(),
    new PlaylistsStore().read(),
  ]);
  const ls = typeof window !== 'undefined' ? window.localStorage : null;
  const bundle: LuminaBackupBundle = {
    luminaBackup: 1,
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    sources: sourcesState,
    playlists: playlistsState,
    settingsPersist: ls?.getItem(SETTINGS_STORAGE_KEY) ?? null,
    profilePersist: ls?.getItem(PROFILE_LOCAL_STORAGE_KEY) ?? null,
    guidedSourceSetupDone: ls ? readGuidedSourceSetupDone() : true,
    viewerResponsibilityAck: ls ? readResponsibilityAcknowledgedFromStorage() : false,
  };
  return JSON.stringify(
    { ...bundle, appVersion: getAppVersion() },
    null,
    2
  );
}

/** Download filename for {@link exportLuminaBackupJson}. */
export function luminaBackupDownloadFilename(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `iptv-tavern-backup-${stamp}.json`;
}

/**
 * Replace all persisted client data with the backup. Import is browser-only.
 * Overwrites sources, playlists, settings, profile, guided-setup, responsibility keys;
 * clears in-memory catalog, guide, and Xtream response cache.
 */
export async function importLuminaBackupFromJson(jsonText: string): Promise<ImportBackupResult> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Import is only available in the browser.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return { ok: false, message: 'This file is not valid JSON.' };
  }

  const b = parseLuminaBackupBundle(parsed);
  if (!b) {
    return { ok: false, message: 'This file is not a valid Lumina backup.' };
  }

  const sourcesNorm = normalizeSourcesState(b.sources);
  const sourceIds = new Set(sourcesNorm.sources.map((s) => s.id));
  const playlistsNorm = filterPlaylistsToSources(b.playlists, sourceIds);

  const settingsStr = mergeAckIntoSettingsBlob(
    normalizeSettingsPersist(b.settingsPersist),
    b.viewerResponsibilityAck
  );
  const profileStr = normalizeProfilePersist(b.profilePersist);

  await new SourcesStore().writeState(sourcesNorm);
  await new PlaylistsStore().writeState(playlistsNorm);

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, settingsStr);
    window.localStorage.setItem(PROFILE_LOCAL_STORAGE_KEY, profileStr);
    if (b.guidedSourceSetupDone) {
      setGuidedSourceSetupDone();
    } else {
      window.localStorage.removeItem(GUIDED_SOURCE_SETUP_DONE_KEY);
    }
    if (b.viewerResponsibilityAck) {
      window.localStorage.setItem(RESPONSIBILITY_ACK_STORAGE_KEY, '1');
      window.localStorage.setItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY, '1');
    } else {
      window.localStorage.removeItem(RESPONSIBILITY_ACK_STORAGE_KEY);
      window.localStorage.setItem(RESPONSIBILITY_LEGACY_BLOB_IMPORT_DONE_KEY, '1');
    }
  } catch {
    return { ok: false, message: 'Could not write to storage (quota or private mode).' };
  }

  useCatalogStore.getState().clear();
  useGuideStore.getState().clear();
  try {
    const cache = _getDefaultXtreamCache();
    await cache.ready;
    cache.clear();
  } catch {
    try {
      _getDefaultXtreamCache().clear();
    } catch {
      /* ignore */
    }
  }

  await Promise.all([useSettingsStore.persist.rehydrate(), useProfileStore.persist.rehydrate()]);

  notifyBackupApplied();
  return { ok: true, sourcesCount: sourcesNorm.sources.length };
}
