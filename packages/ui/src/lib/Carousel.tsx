import {
  Children,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

export type CarouselProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Accessible name for the scrollable strip (e.g. “Recently viewed channels”). */
  ariaLabel: string;
  /** Norigin focus key for the “previous” control. */
  prevFocusKey?: string;
  /** Norigin focus key for the “next” control. */
  nextFocusKey?: string;
  /** Tailwind gap between items (default `gap-3`). */
  gapClassName?: string;
  children: ReactNode;
};

/** Pixels before we treat pointer movement as a drag (vs a tap on a child control). */
const DRAG_THRESHOLD_PX = 8;

type PanState = {
  pointerId: number;
  startX: number;
  startScroll: number;
  dragged: boolean;
};

/**
 * Horizontal carousel: **drag** to pan, prev/next buttons (hidden until hover
 * or focus-within on fine pointers), optional keyboard, **no visible scrollbar**
 * (CSS). After a drag, the next `click` is swallowed so list items (e.g. channel
 * cards) do not activate accidentally.
 */
export function Carousel({
  ariaLabel,
  prevFocusKey = 'CAROUSEL_PREV',
  nextFocusKey = 'CAROUSEL_NEXT',
  gapClassName = 'gap-3',
  className = '',
  children,
  ...rest
}: CarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanState | null>(null);
  const [isPointerPanning, setIsPointerPanning] = useState(false);
  const [edges, setEdges] = useState({ canPrev: false, canNext: false });
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  /** `null` until matchMedia runs — assume arrows visible to avoid a touch-only flash. */
  const [finePointer, setFinePointer] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setFinePointer(false);
      return;
    }
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showNavChrome =
    finePointer == null ? true : !finePointer || pointerInside || focusInside;

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setEdges({
      canPrev: scrollLeft > 2,
      canNext: scrollLeft < maxScroll - 2,
    });
  }, []);

  const itemCount = Children.count(children);

  useLayoutEffect(() => {
    updateEdges();
    const el = scrollerRef.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateEdges());
      ro.observe(el);
    }
    const onWin = () => updateEdges();
    window.addEventListener('resize', onWin);
    el.addEventListener('scroll', updateEdges, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', onWin);
      el.removeEventListener('scroll', updateEdges);
    };
  }, [updateEdges, itemCount]);

  const scrollStep = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(160, Math.floor(el.clientWidth * 0.85)) * dir;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    window.setTimeout(updateEdges, 350);
  }, [updateEdges]);

  const endPointerPan = useCallback(
    (e: ReactPointerEvent) => {
      const pan = panRef.current;
      const el = scrollerRef.current;
      if (!pan || e.pointerId !== pan.pointerId) return;
      panRef.current = null;
      setIsPointerPanning(false);
      try {
        el?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (pan.dragged) {
        const swallowClick = (evt: Event) => {
          evt.preventDefault();
          evt.stopPropagation();
          document.removeEventListener('click', swallowClick, true);
        };
        document.addEventListener('click', swallowClick, true);
        window.setTimeout(() => document.removeEventListener('click', swallowClick, true), 100);
      }
      updateEdges();
    },
    [updateEdges]
  );

  const onScrollerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el || !el.contains(e.target as Node)) return;
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      dragged: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsPointerPanning(true);
  };

  const onScrollerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const el = scrollerRef.current;
    if (!pan || !el || e.pointerId !== pan.pointerId) return;
    const dx = e.clientX - pan.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) {
      pan.dragged = true;
    }
    el.scrollLeft = pan.startScroll - dx;
  };

  const onRootFocusCapture = () => setFocusInside(true);
  const onRootBlurCapture = (e: ReactFocusEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const next = e.relatedTarget as Node | null;
    if (!next || !root.contains(next)) {
      setFocusInside(false);
    }
  };

  const items = Children.toArray(children);

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`.trim()}
      onMouseEnter={() => setPointerInside(true)}
      onMouseLeave={() => setPointerInside(false)}
      onFocusCapture={onRootFocusCapture}
      onBlurCapture={onRootBlurCapture}
      {...rest}
    >
      <CarouselNavButton
        direction="prev"
        focusKey={prevFocusKey}
        disabled={!edges.canPrev}
        onPress={() => scrollStep(-1)}
        visuallyRecessed={finePointer === true && !showNavChrome}
      />
      <CarouselNavButton
        direction="next"
        focusKey={nextFocusKey}
        disabled={!edges.canNext}
        onPress={() => scrollStep(1)}
        visuallyRecessed={finePointer === true && !showNavChrome}
      />
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            scrollStep(-1);
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            scrollStep(1);
          }
        }}
        onPointerDownCapture={onScrollerPointerDown}
        onPointerMove={onScrollerPointerMove}
        onPointerUp={endPointerPan}
        onPointerCancel={endPointerPan}
        className={[
          'flex touch-pan-x snap-x snap-mandatory flex-nowrap overflow-x-auto overflow-y-hidden pb-1 pl-10 pr-10 pt-0.5',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          isPointerPanning ? 'scroll-auto cursor-grabbing' : 'scroll-smooth cursor-grab',
          gapClassName,
        ].join(' ')}
      >
        {items.map((child, index) => {
          const slideKey =
            isValidElement(child) && child.key != null
              ? String(child.key)
              : `carousel-slide-${index}`;
          return (
            <div key={slideKey} className="shrink-0 snap-start">
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CarouselNavButton({
  direction,
  focusKey,
  disabled,
  onPress,
  visuallyRecessed,
}: {
  direction: 'prev' | 'next';
  focusKey: string;
  disabled: boolean;
  onPress: () => void;
  visuallyRecessed: boolean;
}) {
  const { ref, focused } = useFocusable<object>({
    focusKey,
    onEnterPress: () => {
      if (!disabled) onPress();
    },
  });

  const setRef = (node: HTMLButtonElement | null) => {
    (ref as { current: HTMLButtonElement | null }).current = node;
  };

  const isPrev = direction === 'prev';

  return (
    <button
      ref={setRef}
      type="button"
      disabled={disabled}
      aria-label={isPrev ? 'Show previous items' : 'Show next items'}
      data-focused={focused ? 'true' : 'false'}
      onClick={() => {
        if (!disabled) onPress();
      }}
      className={[
        'absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full',
        'border border-border bg-surface text-foreground shadow-md',
        'transition-opacity duration-200 hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-25',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        visuallyRecessed ? 'pointer-events-none opacity-0' : 'opacity-100',
        isPrev ? 'left-1' : 'right-1',
      ].join(' ')}
    >
      <span aria-hidden className="block size-4">
        {isPrev ? <ChevronIcon flip /> : <ChevronIcon />}
      </span>
    </button>
  );
}

function ChevronIcon({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={flip ? 'rotate-180' : ''}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
