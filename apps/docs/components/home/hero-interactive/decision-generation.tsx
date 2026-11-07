'use client';

import { cn } from '@vercel/geistdocs/utils';
import { useEffect, useState } from 'react';

const STATE = 'I was charged twice this month. Please refund me.';

// Matches the `decide.ts` example.
const ANSWERS = [{ id: 'refund', type: 'boolean', value: 'P(true) 0.97' }];

export function DecisionPreview({ animationKey }: { animationKey: number }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleCount(ANSWERS.length);
      return;
    }
    setVisibleCount(0);
    const timers = ANSWERS.map((_, index) =>
      setTimeout(() => setVisibleCount(index + 1), 400 + index * 400),
    );
    return () => timers.forEach(clearTimeout);
  }, [animationKey]);

  return (
    <div className="flex size-full flex-col justify-center gap-4">
      <p className="rounded-lg border border-gray-200 bg-background-200 px-3 py-2 text-[13px] leading-snug text-gray-900">
        {STATE}
      </p>
      <ul aria-label="Decision answers" className="flex flex-col gap-2">
        {ANSWERS.map((answer, index) => (
          <li
            className={cn(
              'flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 font-mono text-xs transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
              index < visibleCount
                ? 'translate-y-0 opacity-100'
                : 'translate-y-2 opacity-0',
            )}
            key={answer.id}
          >
            <span className="text-gray-900">
              {answer.id}
              <span className="ml-2 text-gray-700">{answer.type}</span>
            </span>
            <span className="text-gray-1000">{answer.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
