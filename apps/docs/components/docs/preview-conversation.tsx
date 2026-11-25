'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useInterval } from './use-interval';

/**
 * One turn in a simulated generative-UI conversation. Tool results carry a
 * typed payload so each simulation can render its own components.
 */
export type SimulationMessage<TResult> =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'tool-call'; name: string }
  | { role: 'tool-result'; name: string; result: TResult };

const STEP_DELAY = 1000;

export const UserBubble = ({ children }: { children: ReactNode }) => (
  <div className="ml-auto w-fit max-w-3/4 rounded-lg bg-gray-1000 p-2 text-left text-background-100 text-sm">
    {children}
  </div>
);

export const AssistantBubble = ({ children }: { children: ReactNode }) => (
  <div className="mr-auto w-fit max-w-3/4 rounded-lg bg-gray-100 p-2 text-left text-gray-1000 text-sm">
    {children}
  </div>
);

export const ToolCallLabel = ({ children }: { children: ReactNode }) => (
  <div className="w-full text-center font-mono text-gray-800 text-xs">
    {children}
  </div>
);

/**
 * Replays `messages` one turn per second while `isPlaying`, holds on the
 * finished conversation for `holdDelay`, then starts over (ported from the
 * legacy ai-sdk.dev CardPlayer simulations). Paused or unmounted replays
 * schedule no timers.
 */
export const ConversationReplay = <TResult,>({
  alignEnd = false,
  height,
  holdDelay,
  isPlaying,
  messages,
  renderResult,
}: {
  alignEnd?: boolean;
  height: number;
  holdDelay: number;
  isPlaying: boolean;
  messages: SimulationMessage<TResult>[];
  renderResult: (message: { name: string; result: TResult }) => ReactNode;
}) => {
  const [messageIndex, setMessageIndex] = useState(messages.length);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isComplete = messageIndex >= messages.length;

  useInterval(
    () => {
      setMessageIndex(currentIndex =>
        currentIndex < messages.length ? currentIndex + 1 : 0,
      );
    },
    isPlaying ? (isComplete ? holdDelay : STEP_DELAY) : null,
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messageIndex]);

  return (
    <div
      className="flex w-full flex-col gap-4 overflow-y-auto p-6"
      ref={scrollRef}
      style={{ height }}
    >
      {alignEnd ? <div className="mt-auto" /> : null}
      {messages.slice(0, messageIndex).map((message, index) => (
        <div key={index}>
          {message.role === 'user' ? (
            <UserBubble>{message.content}</UserBubble>
          ) : message.role === 'assistant' ? (
            <AssistantBubble>{message.content}</AssistantBubble>
          ) : message.role === 'tool-call' ? (
            <ToolCallLabel>{message.name}</ToolCallLabel>
          ) : (
            renderResult(message)
          )}
        </div>
      ))}
    </div>
  );
};
