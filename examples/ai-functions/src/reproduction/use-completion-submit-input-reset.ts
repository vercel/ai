import { createRequire } from 'node:module';

const submittedPrompt = 'hello';
const failureSignal =
  'ISSUE #7259 REPRODUCED: useCompletion.handleSubmit left the submitted input unchanged';

async function main() {
  const reactPackageRequire = createRequire(
    new URL('../../../../packages/react/package.json', import.meta.url),
  );
  const { JSDOM } = reactPackageRequire('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });

  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }

  const React = reactPackageRequire('react');
  const { cleanup, fireEvent, render, waitFor } = reactPackageRequire(
    '@testing-library/react',
  );
  const reactModuleUrl = new URL(
    '../../../../packages/react/src/use-completion.ts',
    import.meta.url,
  );
  const { useCompletion } = await import(reactModuleUrl.href);

  let receivedPrompt: string | undefined;

  function CompletionForm() {
    const { handleInputChange, handleSubmit, input } = useCompletion({
      streamProtocol: 'text',
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedPrompt = JSON.parse(String(init?.body)).prompt;
        return new Response('done');
      },
    });

    return React.createElement(
      'form',
      { 'data-testid': 'form', onSubmit: handleSubmit },
      React.createElement('input', {
        'data-testid': 'input',
        onChange: handleInputChange,
        value: input,
      }),
    );
  }

  try {
    const view = render(React.createElement(CompletionForm));
    const input = view.getByTestId('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: submittedPrompt } });
    fireEvent.submit(view.getByTestId('form'));

    await waitFor(() => {
      if (receivedPrompt !== submittedPrompt) {
        throw new Error('The submitted prompt has not reached fetch yet.');
      }
    });

    if (input.value !== '') {
      console.error(`${failureSignal}: "${input.value}"`);
      process.exitCode = 1;
      return;
    }

    console.log('useCompletion.handleSubmit reset the submitted input.');
  } finally {
    cleanup();
    dom.window.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
