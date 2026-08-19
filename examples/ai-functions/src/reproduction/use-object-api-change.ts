import { createRequire } from 'node:module';
import { JSDOM } from '../../../../packages/react/node_modules/jsdom/lib/api.js';

const requireFromReactPackage = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);

function installDomGlobals() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });

  for (const key of Object.getOwnPropertyNames(dom.window)) {
    if (key === 'window' || key === 'document' || key === 'navigator') {
      continue;
    }

    if (!(key in globalThis)) {
      Object.defineProperty(
        globalThis,
        key,
        Object.getOwnPropertyDescriptor(dom.window, key)!,
      );
    }
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });

  return dom;
}

async function main() {
  const dom = installDomGlobals();
  const React = requireFromReactPackage('react');
  const { cleanup, fireEvent, render, screen, waitFor } =
    requireFromReactPackage('@testing-library/react');
  const { z } = requireFromReactPackage('zod/v4');
  const { experimental_useObject: useObject } =
    await import('../../../../packages/react/dist/index.mjs');

  const expectedObject = { recipe: { name: 'Lasagna' } };

  function App() {
    const [api, setApi] = React.useState('/api/use-object');
    const { object, submit } = useObject({
      api,
      schema: z.object({
        recipe: z.object({
          name: z.string(),
        }),
      }),
      fetch: async () =>
        new Response(JSON.stringify(expectedObject), { status: 200 }),
    });

    return React.createElement(
      React.Fragment,
      null,
      React.createElement('input', {
        'aria-label': 'API URL',
        onChange: (event: { target: { value: string } }) =>
          setApi(event.target.value),
        value: api,
      }),
      React.createElement(
        'button',
        { onClick: () => submit('example input') },
        'Generate',
      ),
      React.createElement(
        'output',
        { 'data-testid': 'object' },
        JSON.stringify(object) ?? 'undefined',
      ),
    );
  }

  try {
    render(React.createElement(App));

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => {
      if (
        screen.getByTestId('object').textContent !==
        JSON.stringify(expectedObject)
      ) {
        throw new Error('The streamed object has not been rendered yet.');
      }
    });

    fireEvent.change(screen.getByLabelText('API URL'), {
      target: { value: '/api/changed' },
    });
    const objectAfterApiChange = screen.getByTestId('object').textContent;

    fireEvent.change(screen.getByLabelText('API URL'), {
      target: { value: '/api/use-object' },
    });
    await waitFor(() => {
      if (
        screen.getByTestId('object').textContent !==
        JSON.stringify(expectedObject)
      ) {
        throw new Error('The previous object has not been restored yet.');
      }
    });

    if (objectAfterApiChange !== JSON.stringify(expectedObject)) {
      throw new Error(
        `ISSUE #9210 REPRODUCED: changing the useObject api cleared the received object (observed ${objectAfterApiChange}; expected ${JSON.stringify(expectedObject)}), and restoring the previous api restored the object.`,
      );
    }
  } finally {
    cleanup();
    dom.window.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
