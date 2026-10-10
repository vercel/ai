import { jsonSchema } from 'ai';
import type { experimental_useObject as UseObjectFunction } from '../../../../packages/vue/dist/index.js';
// @ts-expect-error -- jsdom is resolved through the package under test.
import { JSDOM } from '../../../../packages/vue/node_modules/jsdom/lib/api.js';

type UseObject = typeof UseObjectFunction;
const useObjectModulePath = '../../../../packages/vue/src/use-object.ts';
type VueModule = {
  createApp: (component: { setup: () => () => unknown }) => {
    mount: (container: Element) => void;
    unmount: () => void;
  };
  h: (type: string) => unknown;
};

type RunResult = {
  fetchStarted: boolean;
  signalAborted: boolean | undefined;
  object: unknown;
};

async function run(
  useObject: UseObject,
  stopImmediately: boolean,
  { createApp, h }: VueModule,
): Promise<RunResult> {
  let fetchStarted = false;
  let signal: AbortSignal | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let resolveStarted: () => void;
  const started = new Promise<void>(resolve => {
    resolveStarted = resolve;
  });

  let object: ReturnType<UseObject> | undefined;
  const app = createApp({
    setup() {
      object = useObject({
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
              streamController?.error(
                new DOMException('Aborted', 'AbortError'),
              );
            },
            { once: true },
          );

          return new Response(body);
        },
      });
      return () => h('div');
    },
  });

  document.body.innerHTML = '<div id="root"></div>';
  app.mount(document.getElementById('root')!);

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
  app.unmount();
  return result;
}

async function main() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    SVGElement: dom.window.SVGElement,
  });

  const vue =
    (await import('../../../../packages/vue/node_modules/vue')) as unknown as VueModule;
  const { experimental_useObject: useObject } = (await import(
    useObjectModulePath
  )) as {
    experimental_useObject: UseObject;
  };
  const delayedStop = await run(useObject, false, vue);
  const immediateStop = await run(useObject, true, vue);

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

  dom.window.close();
}

main();
