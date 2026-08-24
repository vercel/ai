import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const CALL_COUNT = 12;
const PAYLOAD_SIZE = 1024 * 1024;
const FAILURE_SIGNAL =
  'ISSUE #19367 REPRODUCED: AbortSignal.any() cancellation retained all streamText call states';

type CallReferences = {
  activeAbortListeners: number;
  messages: WeakRef<object>;
  payload: WeakRef<object>;
  result: WeakRef<object>;
  streamChunk: WeakRef<object>;
};

function trackAbortListeners(signal: AbortSignal) {
  const originalAddEventListener = signal.addEventListener.bind(signal);
  const originalRemoveEventListener = signal.removeEventListener.bind(signal);
  const registeredListeners = new Map<
    EventListenerOrEventListenerObject,
    EventListenerOrEventListenerObject
  >();

  signal.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type !== 'abort') {
      originalAddEventListener(type, listener, options);
      return;
    }

    const once = typeof options === 'object' && options.once === true;
    const registeredListener = once
      ? function (this: AbortSignal, event: Event) {
          registeredListeners.delete(listener);
          if (typeof listener === 'function') {
            listener.call(this, event);
          } else {
            listener.handleEvent(event);
          }
        }
      : listener;

    registeredListeners.set(listener, registeredListener);
    originalAddEventListener(type, registeredListener, options);
  }) as AbortSignal['addEventListener'];

  signal.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    const registeredListener = registeredListeners.get(listener);

    originalRemoveEventListener(type, registeredListener ?? listener, options);
    registeredListeners.delete(listener);
  }) as AbortSignal['removeEventListener'];

  return {
    activeCount: () => registeredListeners.size,
  };
}

async function runAbortedCall({
  callNumber,
  longLivedSignal,
}: {
  callNumber: number;
  longLivedSignal?: AbortSignal;
}): Promise<CallReferences> {
  const abortController = new AbortController();
  const abortSignal =
    longLivedSignal == null
      ? abortController.signal
      : AbortSignal.any([longLivedSignal, abortController.signal]);
  const listenerTracker = trackAbortListeners(abortSignal);

  const payload = {
    type: 'text' as const,
    text: `${callNumber}:${'x'.repeat(PAYLOAD_SIZE)}`,
  };
  const messages = [
    {
      role: 'user' as const,
      content: [payload],
    },
  ];
  const streamChunk = {
    type: 'text-delta' as const,
    id: 'text-1',
    delta: 'partial output',
  };

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            const abort = () => {
              controller.error(
                abortSignal?.reason ??
                  new DOMException('Aborted', 'AbortError'),
              );
            };

            abortSignal?.addEventListener('abort', abort, { once: true });
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue(streamChunk);
          },
        }),
      }),
    }),
    messages,
    abortSignal,
    onError: () => {},
  });

  const consumePromise = result.consumeStream();
  await new Promise<void>(resolve => setImmediate(resolve));
  abortController.abort(new DOMException('Cancelled', 'AbortError'));

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      consumePromise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Timed out waiting for the aborted stream')),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    activeAbortListeners: listenerTracker.activeCount(),
    messages: new WeakRef(messages),
    payload: new WeakRef(payload),
    result: new WeakRef(result),
    streamChunk: new WeakRef(streamChunk),
  };
}

async function runCompletedCall(callNumber: number): Promise<CallReferences> {
  const payload = {
    type: 'text' as const,
    text: `${callNumber}:${'x'.repeat(PAYLOAD_SIZE)}`,
  };
  const messages = [
    {
      role: 'user' as const,
      content: [payload],
    },
  ];
  const streamChunk = {
    type: 'text-delta' as const,
    id: 'text-1',
    delta: 'complete output',
  };

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue(streamChunk);
            controller.enqueue({ type: 'text-end', id: 'text-1' });
            controller.enqueue({
              type: 'finish',
              finishReason: { raw: 'stop', unified: 'stop' },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 1,
                  text: 1,
                  reasoning: undefined,
                },
              },
            });
            controller.close();
          },
        }),
      }),
    }),
    messages,
    onError: () => {},
  });

  await result.consumeStream();

  return {
    activeAbortListeners: 0,
    messages: new WeakRef(messages),
    payload: new WeakRef(payload),
    result: new WeakRef(result),
    streamChunk: new WeakRef(streamChunk),
  };
}

async function forceGarbageCollection() {
  setFlagsFromString('--expose_gc');
  const gc = runInNewContext('gc') as () => void;

  for (let attempt = 0; attempt < 20; attempt++) {
    gc();
    void Array.from({ length: 8 }, () => new Uint8Array(1024 * 1024));
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  gc();
}

function countRetainedCalls(references: CallReferences[]) {
  return references.filter(
    reference =>
      reference.result.deref() != null ||
      reference.messages.deref() != null ||
      reference.payload.deref() != null ||
      reference.streamChunk.deref() != null,
  ).length;
}

function countRetained(
  references: CallReferences[],
  key: 'messages' | 'payload' | 'result' | 'streamChunk',
) {
  return references.filter(reference => reference[key].deref() != null).length;
}

async function main() {
  const compositeReferences: CallReferences[] = [];
  const plainReferences: CallReferences[] = [];
  const completedReferences: CallReferences[] = [];
  const longLivedController = new AbortController();

  Object.assign(globalThis, {
    __issue19367LongLivedSignal: longLivedController.signal,
  });

  for (let callNumber = 0; callNumber < CALL_COUNT; callNumber++) {
    compositeReferences.push(
      await runAbortedCall({
        callNumber,
        longLivedSignal: longLivedController.signal,
      }),
    );
    plainReferences.push(
      await runAbortedCall({
        callNumber: CALL_COUNT + callNumber,
      }),
    );
    completedReferences.push(
      await runCompletedCall(CALL_COUNT * 2 + callNumber),
    );
  }

  await forceGarbageCollection();

  const retainedCompositeCalls = countRetainedCalls(compositeReferences);
  const retainedPlainCalls = countRetainedCalls(plainReferences);
  const retainedCompletedCalls = countRetainedCalls(completedReferences);
  const activeCompositeAbortListeners = compositeReferences.reduce(
    (total, reference) => total + reference.activeAbortListeners,
    0,
  );

  assert.ok(
    retainedPlainCalls <= 1,
    `Control failure: ${retainedPlainCalls}/${CALL_COUNT} calls aborted with a plain signal remained`,
  );
  assert.ok(
    retainedCompletedCalls <= 1,
    `Control failure: ${retainedCompletedCalls}/${CALL_COUNT} normally completed calls remained`,
  );

  if (retainedCompositeCalls === CALL_COUNT) {
    console.error(
      `${FAILURE_SIGNAL}; retained messages=${countRetained(
        compositeReferences,
        'messages',
      )}, payloads=${countRetained(
        compositeReferences,
        'payload',
      )}, results=${countRetained(
        compositeReferences,
        'result',
      )}, stream chunks=${countRetained(
        compositeReferences,
        'streamChunk',
      )}, abort listeners=${activeCompositeAbortListeners}`,
    );
    process.exitCode = 1;
    return;
  }

  assert.equal(
    activeCompositeAbortListeners,
    0,
    `Expected no abort listeners after composite cancellation, found ${activeCompositeAbortListeners}`,
  );
  assert.ok(
    retainedCompositeCalls <= 1,
    `Expected composite-aborted call state to be collectible, but ${retainedCompositeCalls}/${CALL_COUNT} calls remained`,
  );

  console.log(
    `ISSUE #19367 NOT REPRODUCED: ${
      CALL_COUNT - retainedCompositeCalls
    }/${CALL_COUNT} composite-aborted call states were collected`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
