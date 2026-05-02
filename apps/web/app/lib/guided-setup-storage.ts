/**
 * First-run guided setup (add source → optional proxy → success).
 * When set, the auto wizard is not shown again.
 */
export const GUIDED_SOURCE_SETUP_DONE_KEY = 'iptv.guided_source_setup_done_v1';

export function readGuidedSourceSetupDone(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(GUIDED_SOURCE_SETUP_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function setGuidedSourceSetupDone(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUIDED_SOURCE_SETUP_DONE_KEY, '1');
  } catch {
    // ignore
  }
}
