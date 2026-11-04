'use client';

import { cn } from '@vercel/geistdocs/utils';
import { motion } from 'motion/react';
import { PROVIDERS, type Provider } from '@/lib/home/code-examples';
import { ProviderLogo } from './provider-logo';

export function LlmProviderTabs({
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
  const providers = PROVIDERS.filter(p => allowedProviders.includes(p.id));

  return (
    <div
      aria-label="Model provider"
      className={cn(
        'flex flex-wrap items-center justify-center gap-1 sm:gap-2',
        className,
      )}
      role="group"
    >
      {providers.map(({ id, label }, index) => (
        <button
          aria-label={label}
          aria-pressed={selectedProvider === id}
          className={cn(
            'relative cursor-pointer rounded-full p-3 transition-colors',
            index >= 8 && 'hidden sm:block',
          )}
          key={id}
          onClick={() => onSelect(id)}
          type="button"
        >
          {selectedProvider === id && (
            <motion.span
              className="absolute inset-0 rounded-full border border-gray-200 bg-background-100 shadow-sm"
              layoutId="llm-provider-tab-indicator"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className="relative z-10 flex size-4 items-center justify-center">
            <ProviderLogo muted={selectedProvider !== id} provider={id} />
          </span>
        </button>
      ))}
    </div>
  );
}
