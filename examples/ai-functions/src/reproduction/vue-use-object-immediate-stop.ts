import { jsonSchema } from 'ai';
import type { useObject as UseObjectFunction } from '../../../../packages/vue/dist/index.js';
// @ts-expect-error -- Vue is resolved through the package under test.
import { effectScope } from '../../../../packages/vue/node_modules/vue';

type UseObject = typeof UseObjectFunction;
const useObjectModulePath = '../../../../packages/vue/src/use-object.ts';

type RunResult = {
  fetchStarted: boolean;
  signalAborted: boolean | undefined;
  object: unknown;
};

async function run(
  useObject: UseObject,
  stopImmediately: boolean,
): Promise<RunResult> {
  const scope = effectScope();
  let fetchStarted = false;
  let signal: AbortSignal | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let resolveStarted: () => void;
  const started = new Promise<void>(resolve => {
    resolveStarted = resolve;
  });

  const object = scope.run(() =>
    useObject({
      api: '/object',
      schema: jsonSchema({ type: 'object' }),
      fetch: async (_url, options) => {
        fetchStarted = true;
        signal = options?.signal ?? undefined;
        resolveStarted();

        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
          },
        });

        signal?.addEventListener(
          'abort',
          () => {
            streamController?.error(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );

        return new Response(body);
      },
    }),
  );

  if (!object) {
    throw new Error('Failed to initialize useObject');
  }

  const pending = object.submit({}) as unknown as Promise<void>;

  if (!stopImmediately) {
    await started;
  }

  await object.stop();

  if (stopImmediately) {
    await Promise.race([started, pending]);
  }

  if (fetchStarted && !signal?.aborted) {
    streamController?.enqueue(new TextEncoder().encode('{"unexpected":true}'));
    streamController?.close();
  }

  await pending;

  const result = {
    fetchStarted,
    signalAborted: signal?.aborted,
    object: object.object.value,
  };
  scope.stop();
  return result;
}

async function main() {
  const { useObject } = (await import(useObjectModulePath)) as {
    useObject: UseObject;
  };
  const delayedStop = await run(useObject, false);
  const immediateStop = await run(useObject, true);

  console.log({ delayedStop, immediateStop });

  if (delayedStop.object !== undefined) {
    throw new Error(
      'CONTROL_FAILURE: stopping an active request updated the object',
    );
  }

  if (immediateStop.object !== undefined) {
    throw new Error(
      'ISSUE_22546_REPRODUCED: immediate stop allowed the response to update the object',
    );
  }
}

main();
