'use client';

import { cn } from '@vercel/geistdocs/utils';
import { IconChevronLeft } from '@vercel/geistdocs/assets/icons/icon-chevron-left';
import { IconChevronRight } from '@vercel/geistdocs/assets/icons/icon-chevron-right';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { PROVIDERS, type Provider } from '@/lib/home/code-examples';
import { ProviderLogo } from './provider-logo';

export function LlmProviderSelector({
  selectedProvider,
  onSelect,
  allowedProviders,
  className,
}: {
  selectedProvider: Provider;
  onSelect: (id: Provider) => void;
  allowedProviders: Provider[];
  className?: string;
}) {
  const [direction, setDirection] = useState(1);
  const isAnimating = useRef(false);

  const providers = PROVIDERS.filter(p => allowedProviders.includes(p.id));
  const currentIndex = Math.max(
    0,
    providers.findIndex(p => p.id === selectedProvider),
  );
  const current = providers[currentIndex];

  function navigate(dir: -1 | 1) {
    if (isAnimating.current || providers.length < 2) return;
    isAnimating.current = true;
    setDirection(dir);
    onSelect(
      providers[(currentIndex + dir + providers.length) % providers.length].id,
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        aria-label="Previous provider"
        className="cursor-pointer p-1.5 text-gray-900 transition-colors hover:text-gray-1000 disabled:cursor-default disabled:opacity-40"
        disabled={providers.length < 2}
        onClick={() => navigate(-1)}
        type="button"
      >
        <IconChevronLeft size={16} />
      </button>

      <span
        aria-label={`Provider: ${current.label}`}
        aria-live="polite"
        className="relative flex size-10 items-center justify-center overflow-hidden rounded-full border border-gray-400 bg-background-100 shadow-sm"
        role="img"
      >
        <AnimatePresence custom={direction} initial={false} mode="sync">
          <motion.span
            animate="center"
            className="absolute flex items-center justify-center"
            custom={direction}
            exit="exit"
            initial="enter"
            key={current.id}
            onAnimationComplete={() => {
              isAnimating.current = false;
            }}
            transition={{ type: 'tween', ease: 'easeOut', duration: 0.15 }}
            variants={{
              enter: (d: number) => ({ x: d > 0 ? 20 : -20, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d > 0 ? -20 : 20, opacity: 0 }),
            }}
          >
            <ProviderLogo provider={current.id} />
          </motion.span>
        </AnimatePresence>
      </span>

      <button
        aria-label="Next provider"
        className="cursor-pointer p-1.5 text-gray-900 transition-colors hover:text-gray-1000 disabled:cursor-default disabled:opacity-40"
        disabled={providers.length < 2}
        onClick={() => navigate(1)}
        type="button"
      >
        <IconChevronRight size={16} />
      </button>
    </div>
  );
}
