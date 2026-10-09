import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function main() {
  const require = createRequire(import.meta.url);
  const reactPackageRoot = fileURLToPath(
    new URL('../../../../packages/react/', import.meta.url),
  );
  const importFromReactPackage = async (specifier: string) =>
    import(
      pathToFileURL(require.resolve(specifier, { paths: [reactPackageRoot] }))
        .href
    );

  const { JSDOM } = await importFromReactPackage('jsdom');
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

  const React = await importFromReactPackage('react');
  const { createRoot } = await importFromReactPackage('react-dom/client');
  const { useObject } = await import(
    new URL('../../../../packages/react/src/use-object.ts', import.meta.url)
      .href
  );

  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const controlledFetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controllers.push(controller);
        },
      }),
    );

  let hook: ReturnType<typeof useObject>;

  function App() {
    hook = useObject({
      api: '/object',
      schema: {},
      fetch: controlledFetch,
    });
    return null;
  }

  const rootElement = dom.window.document.getElementById('root');
  assert.ok(rootElement != null);

  const root = createRoot(rootElement);
  await React.act(async () => root.render(React.createElement(App)));

  let firstSubmission: Promise<void>;
  let secondSubmission: Promise<void>;

  await React.act(async () => {
    firstSubmission = hook.submit({ request: 1 });
  });
  await React.act(async () => {
    secondSubmission = hook.submit({ request: 2 });
  });

  const encoder = new TextEncoder();
  await React.act(async () => {
    controllers[1].enqueue(encoder.encode('{"value":"new"}'));
    controllers[1].close();
    await secondSubmission;
  });

  assert.deepEqual(
    hook.object,
    { value: 'new' },
    'setup failed: the newer submission did not complete first',
  );

  await React.act(async () => {
    controllers[0].enqueue(encoder.encode('{"value":"old"}'));
    controllers[0].close();
    await firstSubmission;
  });

  const actual = hook.object;
  const expected = { value: 'new' };

  await React.act(async () => root.unmount());
  dom.window.close();

  try {
    assert.deepEqual(actual, expected);
  } catch (error) {
    console.error(
      `ISSUE_22363_STALE_RESPONSE_OVERWROTE_NEWER_RESULT actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
    );
    throw error;
  }
}

main();
