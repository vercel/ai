import { JSDOM } from '../../../../packages/react/node_modules/jsdom/lib/api.js';

async function main() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window, writable: true },
    document: {
      configurable: true,
      value: dom.window.document,
      writable: true,
    },
    navigator: {
      configurable: true,
      value: dom.window.navigator,
      writable: true,
    },
    HTMLElement: {
      configurable: true,
      value: dom.window.HTMLElement,
      writable: true,
    },
    IS_REACT_ACT_ENVIRONMENT: {
      configurable: true,
      value: true,
      writable: true,
    },
  });

  const [{ useCompletion }, { act, cleanup, renderHook }] = await Promise.all([
    import('../../../../packages/react/dist/index.mjs'),
    import('../../../../packages/react/node_modules/@testing-library/react/dist/index.js'),
  ]);

  const prompt = 'write a haiku';
  let submittedPrompt: string | undefined;

  const { result } = renderHook(() =>
    useCompletion({
      streamProtocol: 'text',
      fetch: async (_input, init) => {
        submittedPrompt = JSON.parse(String(init?.body)).prompt;
        return new Response('done');
      },
    }),
  );

  act(() => {
    result.current.handleInputChange({
      target: { value: prompt },
    } as any);
  });

  await act(async () => {
    await (result.current.handleSubmit({
      preventDefault() {},
    }) as unknown as Promise<void>);
  });

  if (submittedPrompt !== prompt) {
    throw new Error(
      `Reproduction setup failed: expected submitted prompt "${prompt}", received "${submittedPrompt}"`,
    );
  }

  if (result.current.input !== '') {
    throw new Error(
      `ISSUE 7259 REPRODUCED: expected useCompletion handleSubmit to clear input, but input remained "${result.current.input}"`,
    );
  }

  cleanup();
  dom.window.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
