import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
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
  /** Horizontal inset for the viewport (room for overlay arrows). Default `pl-10 pr-10`. */
  edgePaddingClassName?: string;
  children: ReactNode;
};

/**
 * Horizontal carousel powered by **Embla Carousel** (`embla-carousel-react`):
 * natural drag (correct direction / physics), prev/next, optional keyboard.
 * Prev/next hide until hover or focus-within on fine pointers. No visible
 * scrollbar on the viewport.
 */
export function Carousel({
  ariaLabel,
  prevFocusKey = 'CAROUSEL_PREV',
  nextFocusKey = 'CAROUSEL_NEXT',
  gapClassName = 'gap-3',
  edgePaddingClassName = 'pl-10 pr-10',
  className = '',
  children,
  ...rest
}: CarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ canPrev: false, canNext: false });
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  /** `null` until matchMedia runs — assume arrows visible to avoid a touch-only flash. */
  const [finePointer, setFinePointer] = useState<boolean | null>(null);

  const itemCount = Children.count(children);
  const items = Children.toArray(children);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: 'x',
    dragFree: true,
    containScroll: 'trimSnaps',
  });

  const syncEdges = useCallback(() => {
    if (!emblaApi) return;
    setEdges({
      canPrev: emblaApi.canScrollPrev(),
      canNext: emblaApi.canScrollNext(),
    });
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    syncEdges();
    emblaApi.on('select', syncEdges);
    emblaApi.on('reInit', syncEdges);
    emblaApi.on('resize', syncEdges);
    return () => {
      emblaApi.off('select', syncEdges);
      emblaApi.off('reInit', syncEdges);
      emblaApi.off('resize', syncEdges);
    };
  }, [emblaApi, syncEdges]);

  useEffect(() => {
    emblaApi?.reInit();
  }, [emblaApi, itemCount]);

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

  const scrollStep = useCallback(
    (dir: -1 | 1) => {
      if (!emblaApi) return;
      if (dir < 0) emblaApi.scrollPrev();
      else emblaApi.scrollNext();
    },
    [emblaApi]
  );

  const onRootFocusCapture = () => setFocusInside(true);
  const onRootBlurCapture = (e: ReactFocusEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const next = e.relatedTarget as Node | null;
    if (!next || !root.contains(next)) {
      setFocusInside(false);
    }
  };

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
        ref={emblaRef}
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
        className={[
          'cursor-grab overflow-hidden pb-1 pt-0.5 active:cursor-grabbing',
          edgePaddingClassName,
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        ].join(' ')}
      >
        <div className={['flex touch-pan-x', gapClassName].filter(Boolean).join(' ')}>
          {items.map((child, index) => {
            const slideKey =
              isValidElement(child) && child.key != null
                ? String(child.key)
                : `carousel-slide-${index}`;
            return (
              <div key={slideKey} className="min-w-0 shrink-0">
                {child}
              </div>
            );
          })}
        </div>
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
