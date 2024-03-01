'use client';

import { useEffect, useState } from 'react';
import { STREAMABLE_VALUE_TYPE } from '../constants';

type StreamableValue = {
  curr?: any;
  next?: Promise<StreamableValue>;
  type: typeof STREAMABLE_VALUE_TYPE;
};

export function useStreamableValue(streamableValue: StreamableValue) {
  if (
    typeof streamableValue !== 'object' ||
    !streamableValue ||
    streamableValue.type !== STREAMABLE_VALUE_TYPE
  ) {
    throw new Error(
      'Invalid value: this hook only accepts values created via `createValueStream` from the server.',
    );
  }

  const [currentValue, setCurrentValue] = useState(streamableValue.curr);
  const [currentError, setCurrentError] = useState<null | Error>(null);

  useEffect(() => {
    // Just in case the passed-in streamableValue has changed.
    setCurrentValue(streamableValue.curr);
    setCurrentError(null);

    let canceled = false;

    async function readNext(streamable: StreamableValue) {
      if (!streamable.next) return;
      if (canceled) return;

      try {
        const next = await streamable.next;
        if (canceled) return;

        if ('curr' in next) {
          setCurrentValue(next.curr);
        }
        setCurrentError(null);
        readNext(next);
      } catch (e) {
        setCurrentError(e as Error);
      }
    }

    readNext(streamableValue);

    return () => {
      canceled = true;
    };
  }, [streamableValue]);

  return [currentValue, currentError];
}
