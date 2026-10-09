import assert from 'node:assert/strict';
import { JSDOM } from '../../../../packages/react/node_modules/jsdom/lib/api.js';
import React, {
  act,
} from '../../../../packages/react/node_modules/react/index.js';
import { createRoot } from '../../../../packages/react/node_modules/react-dom/client.js';
import { z } from '../../../../packages/react/node_modules/zod/index.js';
import { experimental_useObject as useObject } from '../../../../packages/react/src/use-object.ts';

async function main() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });

  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controllers.push(controller);
        },
      }),
    );

  let hook: ReturnType<typeof useObject<typeof schema, { value: string }>>;
  const schema = z.object({ value: z.string() });

  function App() {
    hook = useObject({
      api: '/object',
      schema,
      fetch,
    });
    return null;
  }

  const rootElement = document.getElementById('root');
  assert.ok(rootElement != null);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(React.createElement(App));
  });

  let firstRequest!: Promise<void>;
  let secondRequest!: Promise<void>;

  await act(async () => {
    firstRequest = hook.submit({ request: 1 }) as unknown as Promise<void>;
  });
  await act(async () => {
    secondRequest = hook.submit({ request: 2 }) as unknown as Promise<void>;
  });

  assert.equal(controllers.length, 2, 'both requests should be open');

  const encoder = new TextEncoder();
  await act(async () => {
    controllers[1].enqueue(encoder.encode('{"value":"new"}'));
    controllers[1].close();
    await secondRequest;
  });

  assert.deepEqual(
    hook.object,
    { value: 'new' },
    'newer request B should complete with the revised result',
  );

  await act(async () => {
    controllers[0].enqueue(encoder.encode('{"value":"old"}'));
    controllers[0].close();
    await firstRequest;
  });

  const actual = hook.object;

  await act(async () => {
    root.unmount();
  });
  dom.window.close();

  assert.deepEqual(
    actual,
    { value: 'new' },
    'BUG REPRODUCED: stale request A overwrote newer completed result',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
