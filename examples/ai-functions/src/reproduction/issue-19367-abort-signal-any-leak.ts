import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const CALL_COUNT = 12;
const PAYLOAD_SIZE = 1024 * 1024;
const FAILURE_SIGNAL =
  'ISSUE #19367 REPRODUCED: aborted streamText call state remains retained';

type CallReferences = {
  activeAbortListeners: number;
  messages: WeakRef<object>;
  payload: WeakRef<object>;
  result: WeakRef<object>;
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

async function runAbortedCall(
  callNumber: number,
  longLivedSignal: AbortSignal,
): Promise<CallReferences> {
  const abortController = new AbortController();
  const compositeSignal = AbortSignal.any([
    longLivedSignal,
    abortController.signal,
  ]);
  const listenerTracker = trackAbortListeners(compositeSignal);

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

  const result = streamText({
    model: new MockLanguageModelV4({
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
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'partial output',
            });
          },
        }),
      }),
    }),
    messages,
    abortSignal: compositeSignal,
    onError: () => {},
  });

  const consumePromise = result.consumeStream();
  await new Promise<void>(resolve => setImmediate(resolve));
  abortController.abort(new DOMException('Cancelled', 'AbortError'));

  await Promise.race([
    consumePromise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Timed out waiting for the aborted stream')),
        2000,
      ),
    ),
  ]);

  return {
    activeAbortListeners: listenerTracker.activeCount(),
    messages: new WeakRef(messages),
    payload: new WeakRef(payload),
    result: new WeakRef(result),
  };
}

async function forceGarbageCollection() {
  setFlagsFromString('--expose_gc');
  const gc = runInNewContext('gc') as () => void;

  for (let attempt = 0; attempt < 20; attempt++) {
    gc();
    // Add allocation pressure so the weak-reference check does not depend on
    // an idle garbage-collection heuristic.
    void Array.from({ length: 8 }, () => new Uint8Array(1024 * 1024));
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  gc();
}

async function main() {
  const references: CallReferences[] = [];
  // Keep one source signal alive across calls, as a server/request-lifecycle
  // signal would be. Node retains its AbortSignal.any() dependents, so leaked
  // listeners on an aborted composite keep their captured call state reachable.
  const longLivedController = new AbortController();

  for (let callNumber = 0; callNumber < CALL_COUNT; callNumber++) {
    references.push(
      await runAbortedCall(callNumber, longLivedController.signal),
    );
  }

  const activeAbortListeners = references.reduce(
    (total, reference) => total + reference.activeAbortListeners,
    0,
  );

  await forceGarbageCollection();

  const retainedCalls = references.filter(
    reference =>
      reference.result.deref() != null ||
      reference.messages.deref() != null ||
      reference.payload.deref() != null,
  ).length;

  if (retainedCalls === CALL_COUNT) {
    console.error(
      `${FAILURE_SIGNAL} (${retainedCalls}/${CALL_COUNT} calls retained)`,
    );
    process.exitCode = 1;
    return;
  }

  assert.equal(
    activeAbortListeners,
    0,
    `Expected no abort listeners after cancellation, found ${activeAbortListeners}`,
  );
  assert.ok(
    retainedCalls <= 1,
    `Expected aborted call state to be collectible, but ${retainedCalls}/${CALL_COUNT} calls remained`,
  );

  console.log(
    `ISSUE #19367 NOT REPRODUCED: ${CALL_COUNT - retainedCalls}/${CALL_COUNT} aborted call states were collected and ${activeAbortListeners} abort listeners remained`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
