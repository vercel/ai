'use client';

import { useState, useEffect } from 'react';
import { StreamableValue } from '../types';
import { readStreamableValue } from './streamable';

export function InternalStreamableUIClient<T>({
  s,
}: {
  s: StreamableValue<T>;
}) {
  const [value, setValue] = useState<T | undefined>(s.curr);

  useEffect(() => {
    let canceled = false;

    (async () => {
      for await (const v of readStreamableValue(s)) {
        if (canceled) {
          break;
        }

        setValue(v);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [s]);

  return value;
}
