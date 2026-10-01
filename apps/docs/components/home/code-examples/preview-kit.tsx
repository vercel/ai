'use client';

import { IconArrowUp } from '@vercel/geistdocs/assets/icons/icon-arrow-up';
import { IconSparkles } from '@vercel/geistdocs/assets/icons/icon-sparkles';
import { cn } from '@vercel/geistdocs/utils';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

const CHAR_MS = 26;
const LOOP_PAUSE = 4200;

/**
 * Advances through a set of beats, waiting `delays[i]` before moving to the
 * next step. Loops once the final step settles. Returns the final step
 * immediately when motion is reduced, and holds while the scene is off-screen.
 */
export function useTimeline(
  delays: number[],
  { active, reduce }: { active: boolean; reduce: boolean },
): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) {
      setStep(delays.length);
      return;
    }
    if (!active) return;

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    setStep(0);

    const advance = (): void => {
      if (i < delays.length) {
        timer = setTimeout(() => {
          i += 1;
          setStep(i);
          advance();
        }, delays[i]);
      } else {
        timer = setTimeout(() => {
          i = 0;
          setStep(0);
          advance();
        }, LOOP_PAUSE);
      }
    };

    advance();
    return () => clearTimeout(timer);
  }, [active, reduce, delays]);

  return step;
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[0.8em] w-px animate-pulse bg-gray-1000 align-middle"
    />
  );
}

export function StreamingText({
  text,
  play,
  reduce,
  className,
}: {
  text: string;
  play: boolean;
  reduce: boolean;
  className?: string;
}) {
  const [count, setCount] = useState(reduce ? text.length : 0);

  useEffect(() => {
    if (reduce) {
      setCount(text.length);
      return;
    }
    setCount(0);
    if (!play) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, CHAR_MS);
    return () => clearInterval(id);
  }, [text, play, reduce]);

  const done = count >= text.length;
  return (
    <span className={className}>
      {text.slice(0, count)}
      {play && !done && !reduce ? <Caret /> : null}
      {count < text.length ? (
        // Reserve the full text's layout up front so the bubble doesn't grow
        // (and reflow the conversation) as characters stream in.
        <span aria-hidden="true" className="opacity-0">
          {text.slice(count)}
        </span>
      ) : null}
    </span>
  );
}

export function Reveal({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'transition-all duration-500 ease-out',
        show ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Chat-bubble tail, drawn to blend into the bubble's border and fill. */
function Tail({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'absolute [--tail-background:var(--ds-background-100)] [--tail-border:var(--ds-gray-alpha-400)] [--tail-bubble:white] dark:[--tail-background:var(--ds-background-200)] dark:[--tail-border:#252525] dark:[--tail-bubble:var(--ds-background-100)]',
        className,
      )}
      fill="none"
      height={24}
      overflow="hidden"
      viewBox="0 0 24 24"
      width={24}
    >
      <path d="M0 0H24V24H0z" fill="var(--tail-background)" />
      <g style={{ filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 4%))' }}>
        <path
          clipRule="evenodd"
          d="M27-19C15.954-19 7-10.046 7 1c0 .335.008.669.025 1H7v10a15 15 0 01-3 9c4.116 0 7.845-1.658 10.555-4.342A19.915 19.915 0 0027 21c11.046 0 20-8.954 20-20s-8.954-20-20-20z"
          fill="var(--tail-bubble)"
          fillRule="evenodd"
          paintOrder="stroke fill"
          stroke="var(--tail-border)"
          strokeWidth={2}
        />
      </g>
    </svg>
  );
}

function AssistantAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center self-end rounded-full bg-background-100 text-gray-1000 shadow-[var(--ds-shadow-border-small)] [&_svg]:size-3.5">
      <IconSparkles aria-hidden="true" />
    </span>
  );
}

function Bubble({
  children,
  flipped,
}: {
  children: ReactNode;
  flipped?: boolean;
}) {
  return (
    <div className="relative rounded-[18px] bg-background-100 px-4 py-2.5 text-label-12 leading-relaxed text-gray-1000 shadow-[var(--ds-shadow-border-small)]">
      {children}
      {flipped ? (
        <Tail className="right-[-7px] bottom-[-3px] -scale-x-100" />
      ) : (
        <Tail className="bottom-[-3px] left-[-7px]" />
      )}
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        <Bubble flipped>{children}</Bubble>
      </div>
    </div>
  );
}

export function AssistantBubble({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-end gap-2.5">
      <AssistantAvatar />
      <div className={cn('max-w-[85%]', className)}>
        <Bubble>{children}</Bubble>
      </div>
    </div>
  );
}

export function Shell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-label={label}
      className="flex h-[309px] flex-col gap-3 overflow-hidden p-4 sm:p-6"
      role="img"
    >
      {children}
    </div>
  );
}

export function PromptBar({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-alpha-200 bg-background-200 py-1.5 pr-1.5 pl-3">
      <span className="flex-1 truncate text-label-12 text-gray-900">
        {value}
      </span>
      <span className="flex size-6 items-center justify-center rounded bg-gray-1000 text-background-100 [&_svg]:size-3">
        <IconArrowUp aria-hidden="true" />
      </span>
    </div>
  );
}

const SPINNER_DELAYS = [
  -900, -800, -700, -600, -500, -400, -300, -200, -100, 0,
];

/** Geist spinner (Geistdocs doesn't export its own). */
export function Spinner({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      className="relative inline-block aspect-square size-3.5 text-gray-700"
      role="status"
    >
      {SPINNER_DELAYS.map((delay, index) => (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 h-[1.5px] w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
          key={delay}
          style={
            {
              animation: 'spinner-opacity 1000ms linear infinite',
              animationDelay: `${delay}ms`,
              transform: `rotate(${index * 36}deg) translate(146%)`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
