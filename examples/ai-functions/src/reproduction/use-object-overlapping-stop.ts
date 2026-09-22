import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type * as TestingLibraryReact from '../../../../packages/react/node_modules/@testing-library/react';
import { JSDOM } from '../../../../packages/react/node_modules/jsdom/lib/api.js';
import type * as Zod4 from '../../../../packages/react/node_modules/zod/v4';

const dom = new JSDOM('<!doctype html><html><body></body></html>');

for (const key of ['window', 'document', 'navigator', 'HTMLElement'] as const) {
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const requireFromReact = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);
const { act, cleanup, renderHook, waitFor } = requireFromReact(
  '@testing-library/react',
) as typeof TestingLibraryReact;
const { z } = requireFromReact('zod/v4') as typeof Zod4;
const { experimental_useObject: useObject } =
  await import('../../../../packages/react/src/use-object');

type Observation = {
  loadingAfterOlderFinished: boolean;
  activeRequestAborted: boolean;
  finalObject: unknown;
};

async function runScenario(action: 'stop' | 'clear'): Promise<Observation> {
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
    new Promise<void>(resolve => {
      requestWaiters.push(resolve);
    });

  const { result, unmount } = renderHook(() =>
    useObject({
      api: `http://127.0.0.1:${address.port}`,
      schema: z.object({ value: z.string() }),
      fetch: (url, options) => {
        assert.ok(options?.signal instanceof AbortSignal);
        signals.push(options.signal);
        return fetch(url, options);
      },
    }),
  );

  try {
    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;

    await act(async () => {
      const started = nextRequest();
      firstRequest = result.current.submit('first') as unknown as Promise<void>;
      await started;
    });

    await act(async () => {
      const started = nextRequest();
      secondRequest = result.current.submit(
        'second',
      ) as unknown as Promise<void>;
      await started;
    });

    await waitFor(() => {
      assert.deepEqual(result.current.object, { value: 'pending' });
    });

    await act(async () => {
      responses[0].end('"}');
      await firstRequest;
    });

    const loadingAfterOlderFinished = result.current.isLoading;

    act(() => {
      result.current[action]();
    });

    const activeRequestAborted = signals[1].aborted;

    await act(async () => {
      responses[1].end(`-after-${action}"}`);
      await secondRequest;
    });

    if (action === 'clear') {
      await waitFor(() => {
        assert.equal(result.current.object, undefined);
      }).catch(() => undefined);
    }

    return {
      loadingAfterOlderFinished,
      activeRequestAborted,
      finalObject: result.current.object,
    };
  } finally {
    unmount();
    cleanup();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main() {
  try {
    const stop = await runScenario('stop');
    const clear = await runScenario('clear');

    console.log('stop scenario:', stop);
    console.log('clear scenario:', clear);

    assert.deepEqual(
      { stop, clear },
      {
        stop: {
          loadingAfterOlderFinished: true,
          activeRequestAborted: true,
          finalObject: { value: 'pending' },
        },
        clear: {
          loadingAfterOlderFinished: true,
          activeRequestAborted: true,
          finalObject: undefined,
        },
      },
      'ISSUE_21124: an older completion must not disable stop() or clear() for the active request',
    );
  } finally {
    dom.window.close();
  }
}

await main();
