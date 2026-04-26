import { vi } from 'vitest';

/**
 * Embla Carousel reads `ownerDocument.defaultView.matchMedia` and passes
 * `ownerWindow.matchMedia` as an Array mapper (unbound). JSDOM may omit
 * `matchMedia` or expose one that requires `this === window`.
 */
function ensureMatchMedia() {
  if (typeof window === 'undefined') return;
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
}

function ensureResizeObserver() {
  if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'undefined') return;
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof window.ResizeObserver;
}

function ensureIntersectionObserver() {
  if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'undefined') return;
  window.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof window.IntersectionObserver;
}

ensureMatchMedia();
ensureResizeObserver();
ensureIntersectionObserver();
