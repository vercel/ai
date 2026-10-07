'use client';

import { cn } from '@vercel/geistdocs/utils';
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';

/** Horizontal tab list with an indicator that slides to the active tab. */
export function SlidingTabs({
  label,
  items,
  value,
  onValueChange,
}: {
  label: string;
  items: { id: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>();

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-active]');
      if (active)
        setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex(item => item.id === value);
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
    onValueChange(items[next].id);
    const tabs =
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[next]?.focus();
  };

  return (
    <div
      aria-label={label}
      className="relative inline-flex w-full max-w-full gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain p-1 [scrollbar-width:none] lg:w-fit lg:max-w-none"
      onKeyDown={onKeyDown}
      ref={listRef}
      role="tablist"
    >
      {items.map(item => {
        const active = item.id === value;
        return (
          <button
            aria-selected={active}
            className="relative z-10 min-w-max flex-none rounded-[6px] whitespace-nowrap focus-visible:shadow-[var(--ds-focus-ring)] focus-visible:outline-none"
            data-active={active ? '' : undefined}
            key={item.id}
            onClick={() => onValueChange(item.id)}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            <span
              className={cn(
                'relative inline-flex items-center justify-center rounded-[6px] px-3.5 py-1.5 text-center text-copy-14 transition-colors hover:text-gray-1000',
                active ? 'text-gray-1000' : 'text-gray-900',
              )}
            >
              {/* Reserve the medium-weight width so tabs don't shift. */}
              <span aria-hidden="true" className="invisible font-medium">
                {item.label}
              </span>
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 flex items-center justify-center',
                  active && 'font-medium',
                )}
              >
                {item.label}
              </span>
            </span>
          </button>
        );
      })}
      {indicator ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-[6px] bg-gray-200 transition-[left,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          style={indicator}
        />
      ) : null}
    </div>
  );
}
