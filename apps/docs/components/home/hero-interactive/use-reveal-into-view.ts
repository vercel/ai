import { animate } from 'motion/react';
import { useCallback, useRef } from 'react';

/**
 * Returns a ref to attach to the element you want brought into view, plus a
 * `reveal` callback. When `reveal` runs and the element isn't already fully
 * visible, the window scrolls just far enough to show it with a quick, bouncy
 * spring. Already-visible elements are left alone, so repeated interactions
 * don't re-trigger the scroll.
 */
export function useRevealIntoView<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const reveal = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const margin = 24;
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Already comfortably in view — leave the scroll position alone.
    if (rect.top >= margin && rect.bottom <= viewportHeight - margin) return;

    // Bring the code section to ~40% down the viewport, clamped so we never
    // scroll past the top of the page.
    const from = window.scrollY;
    const to = Math.max(0, from + rect.top - viewportHeight * 0.4);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, to);
      return;
    }

    animate(from, to, {
      type: 'spring',
      bounce: 0.35,
      duration: 0.6,
      onUpdate: value => window.scrollTo(0, value),
    });
  }, []);

  return { ref, reveal };
}
