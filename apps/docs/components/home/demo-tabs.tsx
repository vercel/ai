'use client';

import { type ReactNode, useId } from 'react';
import { cn } from '@vercel/geistdocs/utils';

export function DemoTabs({
  label,
  items,
  active,
  onChange,
  children,
  className,
}: {
  label: string;
  items: string[];
  active: number;
  onChange: (index: number) => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <div aria-label={label} className="flex flex-wrap gap-1" role="tablist">
        {items.map((item, index) => (
          <button
            aria-controls={`${id}-panel`}
            aria-selected={active === index}
            className={cn(
              'rounded-md border px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700',
              active === index
                ? 'border-gray-400 bg-background-100 text-gray-1000 shadow-sm'
                : 'border-transparent text-gray-900 hover:text-gray-1000',
            )}
            id={`${id}-${index}`}
            key={item}
            onClick={() => onChange(index)}
            onKeyDown={event => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % items.length
                  : event.key === 'ArrowLeft'
                    ? (index + items.length - 1) % items.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? items.length - 1
                        : undefined;
              if (next === undefined) return;
              event.preventDefault();
              onChange(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
            role="tab"
            tabIndex={active === index ? 0 : -1}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-${active}`}
        className="mt-4 min-w-0"
        id={`${id}-panel`}
        role="tabpanel"
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
