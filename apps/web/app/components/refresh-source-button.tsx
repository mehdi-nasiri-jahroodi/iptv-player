import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Source } from 'core';
import { Button } from 'ui';
import { useCatalogStore } from '../store/catalog-store';

/**
 * Small ghost button that re-runs `loadForSource(source, { force: true })`
 * to bypass the Xtream API cache. Disabled while a load is in flight.
 *
 * For M3U sources the cache wrapper is a no-op (snapshot lives on disk), but
 * a forced reload still re-buckets groups and resets search/active group, so
 * the button is enabled regardless of source type.
 */
export function RefreshSourceButton({
  source,
  focusKey,
}: {
  source: Source;
  focusKey: string;
}) {
  const status = useCatalogStore((s) => s.status);
  const loadForSource = useCatalogStore((s) => s.loadForSource);
  const [spinning, setSpinning] = useState(false);

  // Drop the spinner once the catalog store leaves the 'loading' status.
  useEffect(() => {
    if (status !== 'loading' && spinning) setSpinning(false);
  }, [status, spinning]);

  const onClick = async () => {
    setSpinning(true);
    try {
      await loadForSource(source, { force: true });
    } finally {
      // Status effect handles spinner-off; this guard catches the rare case
      // where the store throws synchronously before status flips.
      setSpinning(false);
    }
  };

  const busy = spinning || status === 'loading';

  return (
    <Button
      focusKey={focusKey}
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={busy}
      aria-label="Refresh catalog"
      data-testid="catalog-refresh"
    >
      <RefreshCw
        aria-hidden
        className={`size-4 ${busy ? 'animate-spin' : ''}`}
      />
      <span className="ml-1.5">{busy ? 'Refreshing…' : 'Refresh'}</span>
    </Button>
  );
}
