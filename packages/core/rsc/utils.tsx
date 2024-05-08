import React, { Suspense } from 'react';

export function createResolvablePromise<T = any>() {
  let resolve: (value: T) => void, reject: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

// Use the name `R` for `Row` as it will be shorter in the RSC payload.
const R = [
  (async ({
    c, // current
    n, // next
  }: {
    c: React.ReactNode;
    n: Promise<any>;
  }) => {
    const chunk = await n;
    if (chunk.done) {
      return chunk.value;
    }

    if (chunk.append) {
      return (
        <>
          {c}
          <Suspense fallback={chunk.value}>
            <R c={chunk.value} n={chunk.next} />
          </Suspense>
        </>
      );
    }

    return (
      <Suspense fallback={chunk.value}>
        <R c={chunk.value} n={chunk.next} />
      </Suspense>
    );
  }) as unknown as React.FC<{
    c: React.ReactNode;
    n: Promise<any>;
  }>,
][0];

export function createSuspensedChunk(initialValue: React.ReactNode) {
  const { promise, resolve, reject } = createResolvablePromise();

  return {
    row: (
      <Suspense fallback={initialValue}>
        <R c={initialValue} n={promise} />
      </Suspense>
    ),
    resolve,
    reject,
  };
}

export const isFunction = (x: unknown): x is Function =>
  typeof x === 'function';

export const consumeStream = async (stream: ReadableStream) => {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
};
