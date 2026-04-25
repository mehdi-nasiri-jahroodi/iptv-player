import { useEffect, type ReactNode } from 'react';
import { destroy, init } from '@noriginmedia/norigin-spatial-navigation';

/**
 * Initializes Norigin spatial navigation once on the client (safe with SSR).
 */
export function SpatialNavigationRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    init({ shouldFocusDOMNode: true });
    return () => {
      destroy();
    };
  }, []);

  return children;
}
