import { useMemo, type ReactNode } from 'react';
import type { ShakaTrack, UseShakaPlayerResult } from './use-shaka-player.js';

export interface PlayerSubtitlePickerProps {
  api: UseShakaPlayerResult;
  /** Extra classes; layout uses `absolute` so parent should be `relative`. */
  className?: string;
}

/**
 * Compact subtitles control for on-demand streams: native `<select>` bound
 * to Shaka text tracks. Renders nothing when the manifest exposes no text
 * tracks (after `trackschanged`).
 */
export function PlayerSubtitlePicker({
  api,
  className = '',
}: PlayerSubtitlePickerProps): ReactNode {
  const texts = useMemo(
    () => api.tracks.filter((t) => t.type === 'text'),
    [api.tracks]
  );

  if (!api.media.seekable || texts.length === 0) return null;

  const active = texts.find((t) => t.active);
  const value = active ? String(active.id) : '';

  const labelFor = (t: ShakaTrack) =>
    (t.label && t.label.trim()) ||
    (t.language && t.language.trim()) ||
    'Subtitles';

  return (
    <label
      className={[
        'pointer-events-auto z-[15] flex min-w-0 items-center gap-2 rounded-lg border border-border/80',
        'bg-background/95 px-2 py-1.5 text-xs text-foreground shadow-md backdrop-blur-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="shrink-0 font-medium text-foreground-muted">Subtitles</span>
      <select
        aria-label="Subtitles"
        data-testid="player-subtitle-picker"
        className="max-w-[min(100%,14rem)] cursor-pointer rounded border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            api.clearTextTrack();
            return;
          }
          const id = Number(v);
          const t = texts.find((x) => x.id === id);
          if (t) api.selectTrack(t);
        }}
      >
        <option value="">Off</option>
        {texts.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {labelFor(t)}
          </option>
        ))}
      </select>
    </label>
  );
}
