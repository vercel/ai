type FinishEvent = {
  object: { content: string } | undefined;
  error: Error | undefined;
};

type CaseResult = {
  errorText: string;
  finishEvents: FinishEvent[];
  onErrorMessages: string[];
  unhandledMessages: string[];
};

const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  const jsdomPath = '../../../../packages/react/node_modules/jsdom/lib/api.js';
  const { JSDOM } = await import(jsdomPath);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });

  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }

  const reactPath = '../../../../packages/react/node_modules/react/index.js';
  const reactDomPath =
    '../../../../packages/react/node_modules/react-dom/client.js';
  const React = await import(reactPath);
  const { createRoot } = await import(reactDomPath);
  const { useObject } =
    await import('../../../../packages/react/dist/index.js');
  const { z } =
    await import('../../../../packages/react/node_modules/zod/v4/index.js');

  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);

  async function runCase({
    response = new Response('{"content":"hello"}'),
    schema = z.object({ content: z.string() }),
    onFinish,
  }: {
    response?: Response;
    schema?: ReturnType<typeof z.object>;
    onFinish?: (event: FinishEvent) => Promise<void> | void;
  }): Promise<CaseResult> {
    const finishEvents: FinishEvent[] = [];
    const onErrorMessages: string[] = [];
    const unhandledStart = unhandledRejections.length;
    const container = document.createElement('div');
    document.body.append(container);

    function Repro() {
      const { submit, error, isLoading } = useObject({
        api: '/unused',
        schema,
        fetch: async () => response,
        onFinish(event) {
          finishEvents.push(event as FinishEvent);
          return onFinish?.(event as FinishEvent);
        },
        onError(error) {
          onErrorMessages.push(error.message);
        },
      });

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          { onClick: () => submit({}), type: 'button' },
          'Generate',
        ),
        React.createElement(
          'pre',
          { 'data-error': true },
          error?.message ?? 'No hook error',
        ),
        React.createElement(
          'span',
          { 'data-loading': true },
          String(isLoading),
        ),
      );
    }

    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Repro));
    });

    const button = container.querySelector('button');
    if (button == null) {
      throw new Error('CONTROL FAILED: reproduction button was not rendered');
    }

    await React.act(async () => {
      button.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true }),
      );
    });

    const deadline = Date.now() + 1000;
    while (finishEvents.length === 0 && onErrorMessages.length === 0) {
      if (Date.now() > deadline) {
        throw new Error('CONTROL FAILED: useObject request did not finish');
      }
      await React.act(async () => {
        await delay(5);
      });
    }

    await React.act(async () => {
      await delay(50);
    });

    const errorText =
      container.querySelector('[data-error]')?.textContent ?? '';
    const unhandledMessages = unhandledRejections
      .slice(unhandledStart)
      .map(reason =>
        reason instanceof Error ? reason.message : String(reason),
      );

    await React.act(async () => {
      root.unmount();
    });
    container.remove();

    return {
      errorText,
      finishEvents,
      onErrorMessages,
      unhandledMessages,
    };
  }

  const syncSuccess = await runCase({ onFinish() {} });
  assertControl(
    syncSuccess.finishEvents[0]?.object?.content === 'hello' &&
      syncSuccess.errorText === 'No hook error' &&
      syncSuccess.onErrorMessages.length === 0 &&
      syncSuccess.unhandledMessages.length === 0,
    'synchronous successful onFinish callback',
  );

  const asyncSuccess = await runCase({
    async onFinish() {
      await Promise.resolve();
    },
  });
  assertControl(
    asyncSuccess.errorText === 'No hook error' &&
      asyncSuccess.onErrorMessages.length === 0 &&
      asyncSuccess.unhandledMessages.length === 0,
    'asynchronous successful onFinish callback',
  );

  const syncFailure = await runCase({
    onFinish() {
      throw new Error('Save failed');
    },
  });
  assertControl(
    syncFailure.errorText === 'Save failed' &&
      syncFailure.onErrorMessages.join(',') === 'Save failed' &&
      syncFailure.unhandledMessages.length === 0,
    'synchronous onFinish callback failure',
  );

  const schemaFailure = await runCase({
    response: new Response('{"wrong":"hello"}'),
  });
  assertControl(
    schemaFailure.finishEvents[0]?.object === undefined &&
      schemaFailure.finishEvents[0]?.error instanceof Error &&
      schemaFailure.errorText === 'No hook error' &&
      schemaFailure.onErrorMessages.length === 0 &&
      schemaFailure.unhandledMessages.length === 0,
    'schema validation failure',
  );

  const httpFailure = await runCase({
    response: new Response('HTTP failed', { status: 500 }),
  });
  assertControl(
    httpFailure.finishEvents.length === 0 &&
      httpFailure.errorText === 'HTTP failed' &&
      httpFailure.onErrorMessages.join(',') === 'HTTP failed' &&
      httpFailure.unhandledMessages.length === 0,
    'HTTP failure',
  );

  const immediateRejection = await runCase({
    async onFinish() {
      throw new Error('Save failed');
    },
  });
  const deferredRejection = await runCase({
    async onFinish() {
      await delay(0);
      throw new Error('Save failed');
    },
  });

  const expectedAsyncHandling = (result: CaseResult) =>
    result.errorText === 'Save failed' &&
    result.onErrorMessages.join(',') === 'Save failed' &&
    result.unhandledMessages.length === 0;

  if (
    !expectedAsyncHandling(immediateRejection) ||
    !expectedAsyncHandling(deferredRejection)
  ) {
    console.error(
      'REPRODUCED: useObject ignored the rejected async onFinish callback',
    );
    console.error(
      JSON.stringify({ immediateRejection, deferredRejection }, null, 2),
    );
    process.exitCode = 1;
  } else {
    console.log('PASS: useObject handled rejected async onFinish callbacks');
  }

  process.off('unhandledRejection', onUnhandledRejection);
  dom.window.close();
}

function assertControl(condition: boolean, description: string) {
  if (!condition) {
    throw new Error(`CONTROL FAILED: ${description}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
