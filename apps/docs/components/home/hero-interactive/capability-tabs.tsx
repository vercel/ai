'use client';

import { cn } from '@vercel/geistdocs/utils';
import { motion } from 'motion/react';
import { HERO_EXAMPLES } from '@/lib/home/code-examples';

export function CapabilityTabs({
  activeTab,
  onTabChange,
  className,
}: {
  activeTab: number;
  onTabChange: (index: number) => void;
  className?: string;
}) {
  return (
    <div
      aria-label="AI capabilities"
      className={cn(
        'mx-auto flex flex-wrap items-center justify-center gap-1',
        className,
      )}
      role="group"
    >
      {HERO_EXAMPLES.map((tab, index) => (
        <button
          aria-pressed={activeTab === index}
          className={cn(
            'relative rounded-md px-4 py-2 text-center text-[13px] font-medium whitespace-nowrap transition-colors',
            activeTab === index
              ? 'text-gray-1000 shadow-sm'
              : 'text-gray-900 hover:text-gray-1000',
          )}
          key={tab.label}
          onClick={() => onTabChange(index)}
          type="button"
        >
          {activeTab === index && (
            <motion.span
              className="absolute inset-0 rounded-md border border-gray-400 bg-background-100"
              layoutId="capability-tab-indicator"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
