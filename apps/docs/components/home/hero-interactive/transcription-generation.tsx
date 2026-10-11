'use client';

import { cn } from '@vercel/geistdocs/utils';
import { useEffect, useState } from 'react';

const TRANSCRIPTION_SEGMENTS = [
  { start: 0.119, text: 'You' },
  { start: 0.259, text: ' can' },
  { start: 0.459, text: ' build' },
  { start: 0.72, text: ' and' },
  { start: 0.879, text: ' host' },
  { start: 1.36, text: ' many' },
  { start: 1.6, text: ' different' },
  { start: 1.899, text: ' types' },
  { start: 2.119, text: ' of' },
  { start: 2.259, text: ' applications' },
  { start: 3.48, text: ' from' },
  { start: 3.779, text: ' static' },
  { start: 4.179, text: ' sites' },
  { start: 4.539, text: ' with' },
  { start: 4.799, text: ' your' },
  { start: 4.96, text: ' favorite' },
  { start: 5.319, text: ' framework,' },
  { start: 5.96, text: ' multi-tenant' },
  { start: 6.559, text: ' applications' },
  { start: 7.699, text: ' or' },
  { start: 7.859, text: ' micro-frontends' },
  { start: 8.78, text: ' to' },
  { start: 9.099, text: ' AI-powered' },
  { start: 9.82, text: ' agents.' },
];

export function TranscriptionPlayer({
  animationKey,
}: {
  animationKey: number;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleCount(TRANSCRIPTION_SEGMENTS.length);
      return;
    }
    setVisibleCount(0);
    const timers = TRANSCRIPTION_SEGMENTS.map((segment, index) =>
      setTimeout(() => setVisibleCount(index + 1), segment.start * 700),
    );
    return () => timers.forEach(clearTimeout);
  }, [animationKey]);

  const isTranscribing =
    visibleCount > 0 && visibleCount < TRANSCRIPTION_SEGMENTS.length;

  return (
    <div className="flex size-full flex-col justify-between gap-3">
      <div className="flex size-full flex-col justify-center gap-3">
        <p className="text-copy-14 leading-relaxed text-gray-900">
          <span className="sr-only">
            {TRANSCRIPTION_SEGMENTS.map(segment => segment.text).join('')}
          </span>
          {TRANSCRIPTION_SEGMENTS.map((segment, index) => (
            <span
              aria-hidden="true"
              className={cn(
                'transition-all duration-500',
                index < visibleCount ? 'opacity-100' : 'opacity-0',
                index === visibleCount - 1 ? 'text-gray-1000' : 'text-gray-900',
              )}
              key={segment.start}
            >
              {segment.text}
            </span>
          ))}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'flex items-end gap-[3px] self-end transition-opacity duration-300',
          isTranscribing ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span
          className="w-[4.5px] animate-[barPulse_0.8s_ease-in-out_infinite] rounded-full bg-gray-400 dark:bg-gray-500"
          style={{ height: 18 }}
        />
        <span
          className="w-[4.5px] animate-[barPulse_0.8s_ease-in-out_0.25s_infinite] rounded-full bg-gray-400 dark:bg-gray-500"
          style={{ height: 24 }}
        />
        <span
          className="w-[4.5px] animate-[barPulse_0.8s_ease-in-out_0.5s_infinite] rounded-full bg-gray-400 dark:bg-gray-500"
          style={{ height: 15 }}
        />
      </div>
    </div>
  );
}
