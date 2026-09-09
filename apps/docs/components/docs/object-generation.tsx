'use client';

import { useState } from 'react';
import { useInterval } from './use-interval';

interface ObjectProps {
  notifications: {
    name: string;
    message: string;
    minutesAgo: number;
  }[];
}

const Notifications = ({ notifications }: ObjectProps) => (
  <div className="flex flex-col gap-2">
    {notifications.map(({ name, message, minutesAgo }) => (
      <div
        className="flex flex-row justify-between gap-4 rounded-lg bg-gray-100 p-3"
        key={name}
      >
        <div>
          <div className="font-medium text-gray-1000">{name}</div>
          <div className="text-gray-900 leading-6">{message}</div>
        </div>
        <div className="w-24 flex-shrink-0 text-right text-gray-800 text-sm">
          {minutesAgo ? `${minutesAgo}m ago` : ''}
        </div>
      </div>
    ))}
  </div>
);

/**
 * Closes any dangling strings, objects, and arrays so a partial JSON prefix
 * parses while the simulated stream is still in flight.
 */
const autoCompletePartialJson = (objectStr: string): ObjectProps | null => {
  let completed = objectStr.trim();

  const quoteCount = (completed.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    completed += '"';
  }

  const stack: string[] = [];
  for (const char of completed) {
    if (char === '{') {
      stack.push('}');
    } else if (char === '[') {
      stack.push(']');
    } else if ((char === '}' || char === ']') && stack.pop() !== char) {
      return null;
    }
  }
  while (stack.length > 0) {
    completed += stack.pop();
  }

  try {
    return JSON.parse(completed) as ObjectProps;
  } catch {
    return null;
  }
};

/**
 * Simulated structured-object generation for cookbook demos (ported from
 * the legacy ai-sdk.dev app): click "View Notifications" to reveal the
 * object, progressively parsed from a partial JSON stream when `stream` is
 * set.
 */
export const ObjectGeneration = ({
  stream = false,
  object,
}: {
  stream?: boolean;
  object: ObjectProps;
}) => {
  const [streaming, setStreaming] = useState(false);
  const [index, setIndex] = useState(0);
  const [delay, setDelay] = useState(10);
  const [generation, setGeneration] = useState<ObjectProps | null>(null);
  const [showLoader, setShowLoader] = useState(false);

  useInterval(
    () => {
      const words = JSON.stringify(object).split(' ');
      setGeneration(
        autoCompletePartialJson(words.slice(0, index).join(' ')) ?? {
          notifications: [],
        },
      );
      setIndex(index + 1);
      setDelay(Math.floor(Math.random() * 150));
      if (index >= words.length) {
        setStreaming(false);
      }
    },
    streaming ? delay : null,
  );

  const start = () => {
    if (stream) {
      setIndex(0);
      setStreaming(true);
      return;
    }
    setShowLoader(true);
    setTimeout(() => {
      setGeneration(object);
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        className="w-fit cursor-pointer rounded-md bg-gray-1000 p-2 text-background-100 hover:bg-gray-900"
        onClick={start}
        type="button"
      >
        View Notifications
      </button>

      {showLoader && generation === null ? (
        <div className="animate-pulse text-gray-800">Loading...</div>
      ) : generation === null ? null : (
        <Notifications {...generation} />
      )}
    </div>
  );
};
