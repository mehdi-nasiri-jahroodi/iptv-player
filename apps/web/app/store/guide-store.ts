import { create } from 'zustand';
import { parseXmltvToGuide, type EpgGuide, type Source } from 'core';

export type GuideStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GuideState {
  sourceId: string | null;
  epgUrl: string | null;
  guide: EpgGuide | null;
  status: GuideStatus;
  error: string | null;

  loadForSource(source: Source): Promise<void>;
  clear(): void;
}

export const useGuideStore = create<GuideState>((set, get) => ({
  sourceId: null,
  epgUrl: null,
  guide: null,
  status: 'idle',
  error: null,

  clear() {
    set({
      sourceId: null,
      epgUrl: null,
      guide: null,
      status: 'idle',
      error: null,
    });
  },

  async loadForSource(source: Source) {
    if (!source.epgUrl?.trim()) {
      set({
        sourceId: source.id,
        epgUrl: null,
        guide: null,
        status: 'idle',
        error: null,
      });
      return;
    }
    const url = source.epgUrl.trim();
    const prev = get();
    if (prev.sourceId === source.id && prev.epgUrl === url && prev.status === 'ready' && prev.guide) {
      return;
    }

    set({
      sourceId: source.id,
      epgUrl: url,
      status: 'loading',
      error: null,
      guide: null,
    });

    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (get().sourceId !== source.id) return;
      if (!res.ok) {
        set({
          status: 'error',
          error: `EPG HTTP ${res.status}`,
          guide: null,
        });
        return;
      }
      const xml = await res.text();
      if (get().sourceId !== source.id) return;
      const guide = parseXmltvToGuide(xml);
      if (get().sourceId !== source.id) return;
      set({ status: 'ready', guide, error: null });
    } catch (e) {
      if (get().sourceId !== source.id) return;
      // Detect cross-browser network/CORS failures. `fetch()` rejects with a
      // TypeError whose message varies by engine: Chromium "Failed to fetch",
      // Safari "Load failed", Firefox "NetworkError when attempting to fetch
      // resource." All three resolve to the same user-visible cause: the
      // browser refused or could not complete the request, almost always
      // because the XMLTV host does not send permissive CORS headers.
      const looksLikeNetworkOrCors = e instanceof TypeError;
      const message = looksLikeNetworkOrCors
        ? 'Could not load EPG (network or CORS). The guide URL must allow browser requests from this app.'
        : e instanceof Error
          ? e.message
          : 'Failed to load EPG.';
      set({ status: 'error', error: message, guide: null });
    }
  },
}));
