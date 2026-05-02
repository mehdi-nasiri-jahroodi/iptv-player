import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Stack } from 'ui';
import { LAYOUT_CONTENT_CLASS } from '../lib/layout-shell';
import { getAppVersion } from '../lib/app-version';
import { SettingsProfileSection } from '../components/settings-profile-section';
import { SettingsStreamProxySection } from '../components/settings-stream-proxy-section';
import { SettingsSourcesSection } from '../components/settings-sources-section';

/**
 * `/settings` — version, profile, sources, stream proxy, and legal-related prefs
 * (responsibility acknowledgement is still surfaced via the root modal).
 */
export default function SettingsPage() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash !== '#sources') return;
    const el = document.getElementById('settings-sources');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, location.pathname]);

  const version = getAppVersion();

  return (
    <main className="scrollbar-slim min-h-0 w-full flex-1 overflow-y-auto" data-testid="settings-page">
      <div className={`${LAYOUT_CONTENT_CLASS} py-6`}>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Everything about your profile, IPTV sources, and the optional stream proxy lives here. Preferences stay on
            this device only.
          </p>
        </header>

        <Stack gap={8}>
          <section
            className="rounded-lg border border-border bg-surface p-5"
            id="settings-about"
            aria-labelledby="settings-version-heading"
          >
            <h2 id="settings-version-heading" className="text-lg font-medium text-foreground">
              About
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">Web client build version (monorepo package).</p>
            <p className="mt-3 font-mono text-sm text-foreground" data-testid="settings-app-version">
              {version}
            </p>
          </section>

          <SettingsProfileSection />
          <SettingsSourcesSection />
          <SettingsStreamProxySection />
        </Stack>
      </div>
    </main>
  );
}
