import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserProfile } from 'core';

const STORAGE_KEY = 'iptv.profile.v1';

const DEFAULT_PROFILE: UserProfile = {
  id: 'default',
  name: 'Viewer',
  favorites: [],
  recents: [],
};

/** Stable key for favorites: scoped by source so ids never collide across providers. */
export function favoriteKey(sourceId: string, channelId: string): string {
  return `${sourceId}::${channelId}`;
}

/** Stable key for recents (most recent first in the profile array). */
export function recentKey(sourceId: string, kind: string, channelId: string): string {
  return `${sourceId}::${kind}::${channelId}`;
}

/** Stable key for per-source group ordering by catalog kind. */
export function catalogOrderKey(sourceId: string, kind: string): string {
  return `${sourceId}::${kind}`;
}

export interface ProfileState {
  profile: UserProfile;
  catalogOrders: Record<string, string[]>;
  setProfileName(name: string): void;
  toggleFavorite(key: string): void;
  pushRecent(key: string): void;
  /** Replace saved order for this source + catalog kind (live / vod / series). */
  setCatalogGroupOrder(sourceId: string, kind: string, orderedGroupIds: string[]): void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      catalogOrders: {},

      setProfileName(name: string) {
        const trimmed = name.trim();
        set({
          profile: {
            ...get().profile,
            name: trimmed.length > 0 ? trimmed : DEFAULT_PROFILE.name,
          },
        });
      },

      toggleFavorite(key: string) {
        const { favorites } = get().profile;
        const next = favorites.includes(key)
          ? favorites.filter((k) => k !== key)
          : [...favorites, key];
        set({ profile: { ...get().profile, favorites: next } });
      },

      pushRecent(key: string) {
        const { recents } = get().profile;
        const filtered = recents.filter((k) => k !== key);
        const next = [key, ...filtered].slice(0, 50);
        set({ profile: { ...get().profile, recents: next } });
      },

      setCatalogGroupOrder(sourceId, kind, orderedGroupIds) {
        const key = catalogOrderKey(sourceId, kind);
        set({
          catalogOrders: { ...get().catalogOrders, [key]: [...orderedGroupIds] },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        profile: state.profile,
        catalogOrders: state.catalogOrders,
      }),
    }
  )
);
