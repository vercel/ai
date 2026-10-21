'use client';

import { cn } from '@vercel/geistdocs/utils';
import { useEffect, useState } from 'react';

export function ChatBubble({
  message,
  delay,
  animationKey,
  skipAnimation = false,
}: {
  message: { role: 'user' | 'assistant'; content: string };
  delay: number;
  animationKey: number;
  skipAnimation?: boolean;
}) {
  const [visible, setVisible] = useState(skipAnimation);

  useEffect(() => {
    if (skipAnimation) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [animationKey, delay, skipAnimation]);

  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'relative transition-[opacity,transform] duration-500 ease-out will-change-[opacity,transform] motion-reduce:transition-none',
        isUser ? 'self-end' : 'self-start',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <div
        className={cn(
          'max-w-[240px] rounded-xl px-3 py-2 text-[13px] leading-snug',
          isUser
            ? 'bg-gray-1000 text-background-100'
            : 'rounded-bl-sm border border-gray-200 bg-background-100 text-gray-900',
        )}
      >
        {message.content}
      </div>
      {isUser && (
        <svg
          aria-hidden="true"
          className="absolute right-[2.5px] -bottom-[0.5px] z-10 translate-x-1/2 fill-gray-1000"
          height="14"
          viewBox="0 0 18 14"
          width="18"
        >
          <path d="M0.866025 8.80383L11.2583 0.803833C11.2583 0.803833 12.0621 9.5 17.2583 13.1961C12.0621 13.1961 0.866025 8.80383 0.866025 8.80383Z" />
        </svg>
      )}
    </div>
  );
}
