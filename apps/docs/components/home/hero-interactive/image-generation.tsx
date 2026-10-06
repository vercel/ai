'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { IMAGE_SRC } from '../media-assets';

const LOADING_DURATION = 1500; // ms
const MAX_BLUR = 20; // px

function ease(t: number): number {
  return 1 - (1 - t) ** 3;
}

function getStatusLabel(progress: number): string {
  if (progress === 0) return 'Starting';
  if (progress >= 1) return '100% Complete';
  return `${Math.round(progress * 100)}% Complete`;
}

// --- Shared generation preview utilities ---

export function useGenerationProgress(animationKey: number) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const animRef = useRef<number>(0);

  const animate = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      setDone(true);
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / LOADING_DURATION);
      setProgress(ease(t));

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    }

    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    setProgress(0);
    setDone(false);
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [animationKey, animate]);

  const blurAmount = done ? 0 : MAX_BLUR * (1 - progress);

  return { progress, done, blurAmount };
}

export function ProgressBadge({
  progress,
  hidden,
}: {
  progress: number;
  hidden: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-3 right-3 transition-opacity duration-300 ease-out"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      <span className="inline-flex w-[115px] items-center justify-end rounded-md bg-gray-1000 px-3 py-1.5 text-xs font-medium text-background-100 tabular-nums">
        {getStatusLabel(progress)}
      </span>
    </div>
  );
}

export function MediaContainer({ children }: { children: ReactNode }) {
  return (
    <div className="size-full p-4">
      <div className="relative size-full overflow-hidden rounded">
        {children}
      </div>
    </div>
  );
}

// --- Image generation preview ---

export function ImageGenerationPreview({
  animationKey,
}: {
  animationKey: number;
}) {
  const { progress, done, blurAmount } = useGenerationProgress(animationKey);
  const [hideBadge, setHideBadge] = useState(false);

  useEffect(() => {
    setHideBadge(false);
  }, [animationKey]);

  useEffect(() => {
    if (!done) return;
    const timeout = setTimeout(() => setHideBadge(true), 1000);
    return () => clearTimeout(timeout);
  }, [done]);

  return (
    <MediaContainer>
      <img
        alt="AI-generated teddy bear hiking in the mountains"
        className="size-full object-cover"
        key={animationKey}
        loading="eager"
        src={IMAGE_SRC}
        style={{ filter: `blur(${blurAmount}px)` }}
      />
      <ProgressBadge hidden={hideBadge} progress={progress} />
    </MediaContainer>
  );
}
