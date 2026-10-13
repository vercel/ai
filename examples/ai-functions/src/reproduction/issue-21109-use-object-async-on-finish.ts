import { experimental_useObject as useObject } from '../../../../packages/react/dist/index.mjs';
import { createRequire } from 'node:module';
import { z } from 'zod/v4';

const requireFromReactPackage = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);
const { act, createElement } = requireFromReactPackage('react') as {
  act(callback: () => void | Promise<void>): Promise<void>;
  createElement(
    type: string | (() => unknown),
    properties?: Record<string, unknown> | null,
  ): unknown;
};
const { createRoot } = requireFromReactPackage('react-dom/client') as {
  createRoot(container: Element): {
    render(element: unknown): void;
    unmount(): void;
  };
};
const { JSDOM } = requireFromReactPackage('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => {
    window: Window & typeof globalThis;
  };
};

type CaseName = 'async-immediate' | 'async-deferred' | 'synchronous';

type CaseResult = {
  name: CaseName;
  object: unknown;
  errorMessage: string | undefined;
  isLoading: boolean;
  onErrorMessages: string[];
  unhandledMessages: string[];
};

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});

Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});

const unhandledRejections: unknown[] = [];
const onUnhandledRejection = (reason: unknown) => {
  unhandledRejections.push(reason);
};

process.on('unhandledRejection', onUnhandledRejection);

const getErrorMessage = (value: unknown) =>
  value instanceof Error ? value.message : String(value);

const waitUntil = async (condition: () => boolean, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for useObject to finish.');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

async function runCase(name: CaseName): Promise<CaseResult> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onErrorMessages: string[] = [];
  const unhandledStart = unhandledRejections.length;

  let submit: ((input: object) => void) | undefined;
  let snapshot: {
    object: unknown;
    errorMessage: string | undefined;
    isLoading: boolean;
  } = {
    object: undefined,
    errorMessage: undefined,
    isLoading: false,
  };

  const callbackError = `Save failed (${name})`;

  const onFinish =
    name === 'synchronous'
      ? () => {
          throw new Error(callbackError);
        }
      : name === 'async-immediate'
        ? async () => {
            throw new Error(callbackError);
          }
        : async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
            throw new Error(callbackError);
          };

  function Component() {
    const state = useObject({
      api: '/unused',
      schema: z.object({ content: z.string() }),
      fetch: async () => new Response('{"content":"hello"}'),
      onFinish,
      onError(error) {
        onErrorMessages.push(error.message);
      },
    });

    submit = state.submit;
    snapshot = {
      object: state.object,
      errorMessage: state.error?.message,
      isLoading: state.isLoading,
    };

    return createElement('div');
  }

  await act(async () => {
    root.render(createElement(Component));
  });

  if (submit == null) {
    throw new Error(`useObject did not expose submit for ${name}.`);
  }

  await act(async () => {
    submit?.({});
  });

  await waitUntil(
    () =>
      snapshot.isLoading === false &&
      JSON.stringify(snapshot.object) === '{"content":"hello"}' &&
      (snapshot.errorMessage === callbackError ||
        unhandledRejections
          .slice(unhandledStart)
          .some(error => getErrorMessage(error) === callbackError)),
  );

  // Let any delayed rejection or React state update reach its terminal state.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });

  const result: CaseResult = {
    name,
    object: snapshot.object,
    errorMessage: snapshot.errorMessage,
    isLoading: snapshot.isLoading,
    onErrorMessages,
    unhandledMessages: unhandledRejections
      .slice(unhandledStart)
      .map(getErrorMessage),
  };

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return result;
}

async function main() {
  const results = [
    await runCase('async-immediate'),
    await runCase('async-deferred'),
    await runCase('synchronous'),
  ];

  console.log(JSON.stringify(results, null, 2));

  const synchronous = results.find(result => result.name === 'synchronous');
  if (
    synchronous?.errorMessage !== 'Save failed (synchronous)' ||
    synchronous.onErrorMessages.join() !== 'Save failed (synchronous)' ||
    synchronous.unhandledMessages.length !== 0
  ) {
    throw new Error(
      'The synchronous onFinish control did not use the expected useObject error path.',
    );
  }

  const asyncResults = results.filter(result => result.name !== 'synchronous');
  const expectedAsyncMessages = [
    'Save failed (async-immediate)',
    'Save failed (async-deferred)',
  ];

  const asyncFailuresHandled = asyncResults.every(
    (result, index) =>
      result.errorMessage === expectedAsyncMessages[index] &&
      result.onErrorMessages.join() === expectedAsyncMessages[index] &&
      result.unhandledMessages.length === 0,
  );

  if (asyncFailuresHandled) {
    console.log(
      'useObject handled immediate and deferred async onFinish rejections.',
    );
    return;
  }

  const reportedBugObserved = asyncResults.every(
    (result, index) =>
      result.errorMessage === undefined &&
      result.onErrorMessages.length === 0 &&
      result.unhandledMessages.includes(expectedAsyncMessages[index]),
  );

  if (reportedBugObserved) {
    throw new Error(
      'Reproduced issue #21109: async onFinish rejections were unhandled while useObject left error undefined and did not call onError.',
    );
  }

  throw new Error(
    'Async onFinish failures did not follow either the expected behavior or the complete reported failure mode.',
  );
}

main()
  .catch(error => {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  })
  .finally(() => {
    process.off('unhandledRejection', onUnhandledRejection);
    dom.window.close();
  });
