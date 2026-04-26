import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { destroy, init } from '@noriginmedia/norigin-spatial-navigation';
import { readProfileFromLocalStorage, useProfileStore } from '../store/profile-store';

/**
 * Initializes Norigin spatial navigation once on the client (safe with SSR).
 * Re-applies profile from localStorage on mount so favorites and Continue watching
 * (recents) are loaded before first paint when possible.
 */
export function SpatialNavigationRoot({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const snap = readProfileFromLocalStorage();
    if (snap) {
      useProfileStore.setState({ profile: snap.profile, catalogOrders: snap.catalogOrders });
    }
    void useProfileStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    init({ shouldFocusDOMNode: true });
    return () => {
      destroy();
    };
  }, []);

  return children;
}
