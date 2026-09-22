import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { z } from 'zod/v4';

type ScenarioResult = {
  isLoadingAfterOlderRequestFinished: boolean;
  newerRequestAborted: boolean;
  finalObject: unknown;
};

type UseObjectResult = {
  submit: (input: string) => void;
  object: unknown;
  isLoading: boolean;
  stop: () => void;
  clear: () => void;
};

async function main() {
  const requireFromReactPackage = createRequire(
    new URL('../../../../packages/react/package.json', import.meta.url),
  );
  const { JSDOM } = requireFromReactPackage('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');

  for (const key of ['window', 'document', 'navigator', 'HTMLElement']) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
    });
  }
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { act, cleanup, renderHook } = requireFromReactPackage(
    '@testing-library/react',
  );
  const reactSourceUrl = new URL(
    '../../../../packages/react/src/use-object.ts',
    import.meta.url,
  ).href;
  const { experimental_useObject } = (await import(reactSourceUrl)) as {
    experimental_useObject: (options: {
      api: string;
      schema: unknown;
      fetch: typeof fetch;
    }) => UseObjectResult;
  };

  async function runScenario(
    action: 'stop' | 'clear',
  ): Promise<ScenarioResult> {
    const responses: ServerResponse[] = [];
    const requestWaiters: Array<() => void> = [];
    const signals: AbortSignal[] = [];
    const server = createServer((request, response) => {
      request.resume();
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"value":"pending');
      responses.push(response);
      requestWaiters.shift()?.();
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address != null && typeof address !== 'string');

    const nextRequest = () =>
      new Promise<void>(resolve => requestWaiters.push(resolve));

    const { result } = renderHook(() =>
      experimental_useObject({
        api: `http://127.0.0.1:${address.port}`,
        schema: z.object({ value: z.string() }),
        fetch: (url, options) => {
          assert.ok(options?.signal != null);
          signals.push(options.signal);
          return fetch(url, options);
        },
      }),
    );

    let firstSubmission!: Promise<void>;
    let secondSubmission!: Promise<void>;

    try {
      await act(async () => {
        const requestStarted = nextRequest();
        firstSubmission = result.current.submit(
          'first',
        ) as unknown as Promise<void>;
        await requestStarted;
      });

      await act(async () => {
        const requestStarted = nextRequest();
        secondSubmission = result.current.submit(
          'second',
        ) as unknown as Promise<void>;
        await requestStarted;
      });

      await act(async () => {
        responses[0].end('"}');
        await firstSubmission;
      });

      const isLoadingAfterOlderRequestFinished = result.current.isLoading;

      act(() => {
        result.current[action]();
      });
      const newerRequestAborted = signals[1].aborted;

      await act(async () => {
        responses[1].end(`-after-${action}"}`);
        await secondSubmission;
      });

      return {
        isLoadingAfterOlderRequestFinished,
        newerRequestAborted,
        finalObject: result.current.object,
      };
    } finally {
      cleanup();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  try {
    const observed = {
      stop: await runScenario('stop'),
      clear: await runScenario('clear'),
    };
    const expected = {
      stop: {
        isLoadingAfterOlderRequestFinished: true,
        newerRequestAborted: true,
        finalObject: { value: 'pending' },
      },
      clear: {
        isLoadingAfterOlderRequestFinished: true,
        newerRequestAborted: true,
        finalObject: undefined,
      },
    };

    console.log('Observed overlapping request behavior:', observed);

    try {
      assert.deepEqual(observed, expected);
    } catch {
      throw new Error(
        'ISSUE #21124 REPRODUCED: finishing an older useObject request disables stop() and clear() for the newer request',
      );
    }
  } finally {
    dom.window.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
