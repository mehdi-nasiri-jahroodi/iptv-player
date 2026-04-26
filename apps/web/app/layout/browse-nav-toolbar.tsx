import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import type { Source } from 'core';
import { RefreshSourceButton } from '../components/refresh-source-button';
import { SourcesStore } from '../features/sources/sources-storage';
import { useCatalogStore } from '../store/catalog-store';

/**
 * Shows catalog **Refresh** in the top nav while on `/browse/*` and the catalog
 * store is bound to a source (toolbar actions were removed from the live browse
 * page in favor of this global strip).
 */
export function BrowseNavToolbar() {
  const location = useLocation();
  const catalogSourceId = useCatalogStore((s) => s.sourceId);
  const [source, setSource] = useState<Source | null>(null);

  const onBrowse = location.pathname.startsWith('/browse/');
  const show = onBrowse && Boolean(catalogSourceId);

  useEffect(() => {
    if (!show || !catalogSourceId) {
      setSource(null);
      return;
    }
    let cancelled = false;
    void new SourcesStore().read().then((s) => {
      if (cancelled) return;
      setSource(s.sources.find((x) => x.id === catalogSourceId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [show, catalogSourceId]);

  if (!show || !source) return null;

  return (
    <RefreshSourceButton source={source} focusKey="NAV_CATALOG_REFRESH" />
  );
}
