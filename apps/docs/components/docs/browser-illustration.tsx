'use client';

import { useEffect, useRef, useState } from 'react';

const BAR_COUNT = 9;
const INITIAL_WIDTHS = [66, 50, 50, 75, 66, 25, 50, 50, 50];
const CYCLE_DELAY = 4000;
const REAPPEAR_DELAY = 800;
const STAGGER_DELAY = 200;
/** Blocking responses show every line at once, after the whole reply arrives. */
const BLOCKING_DELAY = 1300;

const randomWidths = () =>
  Array.from({ length: BAR_COUNT }, () => (Math.random() * 0.6 + 0.2) * 100);

/**
 * Browser-window skeleton that contrasts streaming with blocking responses
 * (ported from the legacy ai-sdk.dev app). Streaming reveals lines one after
 * another with a wipe; blocking waits, then shows every line together. Both
 * fade out and replay every four seconds while the illustration is on screen,
 * unless the visitor prefers reduced motion. Pausing off screen keeps the
 * motion bounded and stops timers on pages the reader has scrolled past.
 */
export const BrowserIllustration = ({
  blocking = false,
  highlight = false,
}: {
  blocking?: boolean;
  highlight?: boolean;
}) => {
  const [widths, setWidths] = useState(INITIAL_WIDTHS);
  const [isVisible, setIsVisible] = useState(false);
  const [isOnScreen, setIsOnScreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Defer one tick so the opacity change runs as a transition.
    const reveal = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(reveal);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsOnScreen(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReducedMotion || !isOnScreen) return;

    let reappear: ReturnType<typeof setTimeout> | undefined;
    const cycle = setInterval(() => {
      setIsVisible(false);
      reappear = setTimeout(() => {
        setWidths(randomWidths());
        setIsVisible(true);
      }, REAPPEAR_DELAY);
    }, CYCLE_DELAY);

    return () => {
      clearInterval(cycle);
      if (reappear) {
        clearTimeout(reappear);
      }
      setIsVisible(true);
    };
  }, [isOnScreen]);

  const borderClass = highlight
    ? 'border-gray-alpha-600'
    : 'border-gray-alpha-400';
  const barClass = highlight ? 'bg-gray-500' : 'bg-gray-400';

  return (
    <div
      className="not-prose flex h-56 w-full items-center justify-center px-4"
      ref={containerRef}
    >
      <div
        className={`h-48 w-64 max-w-full overflow-hidden rounded-md border bg-background-100 shadow-sm ${borderClass}`}
      >
        <div className={`flex gap-1 border-b bg-gray-100 p-1 ${borderClass}`}>
          <span className="size-2 rounded-full bg-red-700" />
          <span className="size-2 rounded-full bg-amber-700" />
          <span className="size-2 rounded-full bg-green-700" />
        </div>
        <div
          aria-hidden="true"
          className="relative flex animate-pulse flex-col gap-2 overflow-hidden p-4 motion-reduce:animate-none"
        >
          {widths.map((width, index) => {
            const delay = blocking ? BLOCKING_DELAY : index * STAGGER_DELAY;
            const transitionStyle = {
              transitionDelay: isVisible ? `${delay}ms` : '0ms',
              transitionDuration: isVisible ? '400ms' : '500ms',
            };

            return (
              <div
                className={`relative h-2 origin-left rounded transition-[opacity,transform] ease-out motion-reduce:transition-none ${barClass} ${
                  isVisible ? 'scale-100 opacity-80' : 'scale-95 opacity-0'
                }`}
                key={index}
                style={{ width: `${width}%`, ...transitionStyle }}
              >
                {blocking ? null : (
                  <span
                    className={`absolute inset-0 bg-linear-to-r from-transparent to-background-100 ease-out motion-reduce:transition-none ${
                      isVisible
                        ? 'translate-x-full transition-transform'
                        : 'translate-x-0 transition-none'
                    }`}
                    style={transitionStyle}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
