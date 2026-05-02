import { useEffect, useState } from 'react';
import { Button, FormField, TextField } from 'ui';
import { useProfileStore } from '../store/profile-store';

export function SettingsProfileSection() {
  const profileName = useProfileStore((s) => s.profile.name);
  const setProfileName = useProfileStore((s) => s.setProfileName);
  const [draft, setDraft] = useState(profileName);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(profileName);
  }, [profileName]);

  return (
    <section
      className="rounded-lg border border-border bg-surface p-5"
      data-testid="settings-profile"
      id="settings-profile"
    >
      <h2 className="text-lg font-medium text-foreground">Profile</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Display name on the home screen. One profile for this build.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setProfileName(draft);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }}
      >
        <FormField label="Display name">
          {({ inputId }) => (
            <TextField
              id={inputId}
              focusKey="SETTINGS_PROFILE_NAME"
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              placeholder="Viewer"
              data-testid="settings-profile-name"
            />
          )}
        </FormField>
        <Button type="submit" variant="primary" size="md" focusKey="SETTINGS_PROFILE_SAVE">
          Save name
        </Button>
        {saved ? <span className="text-xs text-foreground-muted">Saved.</span> : null}
      </form>
    </section>
  );
}
