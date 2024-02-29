import React, { Suspense } from 'react';

export function createResolvablePromise() {
  let resolve: (value: any) => void, reject: (error: any) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

export function createSuspensedChunk(initialValue: React.ReactNode) {
  const Row = (async ({
    current,
    next,
  }: {
    current: React.ReactNode;
    next: Promise<any>;
  }) => {
    const chunk = await next;
    if (chunk.done) {
      return chunk.value;
    }

    if (chunk.append) {
      return (
        <>
          {current}
          <Suspense fallback={chunk.value}>
            <Row current={chunk.value} next={chunk.next} />
          </Suspense>
        </>
      );
    }

    return (
      <Suspense fallback={chunk.value}>
        <Row current={chunk.value} next={chunk.next} />
      </Suspense>
    );
  }) /* Our React typings don't support async components */ as unknown as React.FC<{
    current: React.ReactNode;
    next: Promise<any>;
  }>;

  const { promise, resolve, reject } = createResolvablePromise();

  return {
    row: (
      <Suspense fallback={initialValue}>
        <Row current={initialValue} next={promise} />
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
