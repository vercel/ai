'use client';

import { useEffect, useRef } from 'react';

/**
 * Runs `callback` every `delay` milliseconds; pass `null` to pause.
 * Minimal port of the `usehooks-ts` hook the legacy app used, kept local to
 * avoid a new dependency.
 */
export const useInterval = (callback: () => void, delay: number | null) => {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) {
      return;
    }
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
};
