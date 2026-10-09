import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromReactPackage = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);
const React = requireFromReactPackage('react');
const { createRoot } = requireFromReactPackage('react-dom/client');
const { JSDOM } = requireFromReactPackage('jsdom');
const { z } = requireFromReactPackage('zod');

type HookState = {
  object: unknown;
  submit: (input: { request: number }) => void;
};

async function main() {
  const { experimental_useObject } = await import(
    new URL('../../../../packages/react/src/use-object.ts', import.meta.url)
      .href
  );
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
  });

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const controlledFetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controllers.push(controller);
        },
      }),
    );

  let hook: HookState | undefined;

  function App() {
    hook = experimental_useObject({
      api: '/object',
      schema: z.object({ value: z.string() }),
      fetch: controlledFetch,
    });
    return null;
  }

  const getHook = () => {
    assert.ok(hook, 'useObject hook was not initialized');
    return hook;
  };

  const rootElement = dom.window.document.getElementById('root');
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const encoder = new TextEncoder();
  let actual: unknown;

  try {
    await React.act(async () => {
      root.render(React.createElement(App));
    });

    let firstRequest!: Promise<void>;
    await React.act(async () => {
      firstRequest = getHook().submit({
        request: 1,
      }) as unknown as Promise<void>;
    });

    let secondRequest!: Promise<void>;
    await React.act(async () => {
      secondRequest = getHook().submit({
        request: 2,
      }) as unknown as Promise<void>;
    });

    await React.act(async () => {
      controllers[1].enqueue(encoder.encode('{"value":"new"}'));
      controllers[1].close();
      await secondRequest;
    });

    assert.deepEqual(
      getHook().object,
      { value: 'new' },
      'request B must complete with the newer result before request A resumes',
    );

    await React.act(async () => {
      controllers[0].enqueue(encoder.encode('{"value":"old"}'));
      controllers[0].close();
      await firstRequest;
    });

    actual = getHook().object;
  } finally {
    await React.act(async () => {
      root.unmount();
    });
    dom.window.close();
  }

  const expected = { value: 'new' };
  console.log({ actual, expected });

  try {
    assert.deepEqual(actual, expected);
  } catch {
    throw new Error(
      'ISSUE_22363_REPRODUCED: older request A overwrote newer completed useObject result',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
