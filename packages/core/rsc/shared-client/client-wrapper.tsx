'use client';

import { useState, useEffect } from 'react';
import { StreamableValue } from '../types';
import { readStreamableValue } from './streamable';

export function InternalStreamableUIClient<T>({
  s,
}: {
  s: StreamableValue<T>;
}) {
  // Set the value to the initial value of the streamable, if it has one.
  const [value, setValue] = useState<T | undefined>(s.curr);

  // Error state for the streamable. It might be errored initially and we want
  // to error out as soon as possible.
  const [error, setError] = useState<Error | undefined>(s.error);

  useEffect(() => {
    let canceled = false;
    setError(undefined);

    (async () => {
      try {
        // Read the streamable value and update the state with the new value.
        for await (const v of readStreamableValue(s)) {
          if (canceled) {
            break;
          }

          setValue(v);
        }
      } catch (e) {
        if (canceled) {
          return;
        }

        setError(e as Error);
      }
    })();

    return () => {
      // If the component is unmounted, we want to cancel the stream.
      canceled = true;
    };
  }, [s]);

  // This ensures that errors from the streamable UI are thrown during the
  // render phase, so that they can be caught by error boundary components.
  // This is necessary for React's declarative model.
  if (error) {
    throw error;
  }

  return value;
}
