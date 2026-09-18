import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';

const requireFromReactPackage = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);
const { JSDOM } = requireFromReactPackage('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');

for (const key of ['window', 'document', 'navigator', 'HTMLElement'] as const) {
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });
}

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
  writable: true,
});

const { act, cleanup, renderHook } = requireFromReactPackage(
  '@testing-library/react',
);
const { z } = requireFromReactPackage('zod/v4');
const useObjectModuleUrl = new URL(
  '../../../../packages/react/src/use-object.ts',
  import.meta.url,
);
const { useObject } = await import(useObjectModuleUrl.href);

type Action = 'stop' | 'clear';

async function runOverlapScenario(action: Action) {
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

  const nextRequest = () =>
    new Promise<void>(resolve => requestWaiters.push(resolve));

  const { result } = renderHook(() =>
    useObject({
      id: `issue-21124-${action}`,
      api: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      schema: z.object({ value: z.string() }),
      fetch: (url: RequestInfo | URL, options?: RequestInit) => {
        assert.ok(options?.signal instanceof AbortSignal);
        signals.push(options.signal);
        return fetch(url, options);
      },
    }),
  );

  let firstRequest!: Promise<void>;
  let secondRequest!: Promise<void>;

  try {
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

    await act(async () => {
      responses[0].end('"}');
      await firstRequest;
    });

    const loadingAfterOlderRequestFinished = result.current.isLoading;

    act(() => {
      result.current[action]();
    });

    const newerRequestAborted = signals[1].aborted;

    await act(async () => {
      responses[1].end(action === 'stop' ? '-after-stop"}' : '-after-clear"}');
      await secondRequest;
    });

    return {
      loadingAfterOlderRequestFinished,
      newerRequestAborted,
      finalObject: result.current.object,
    };
  } finally {
    cleanup();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main() {
  try {
    const stopResult = await runOverlapScenario('stop');
    const clearResult = await runOverlapScenario('clear');

    console.log('stop scenario:', stopResult);
    console.log('clear scenario:', clearResult);

    const failures: string[] = [];
    const check = (description: string, assertion: () => void) => {
      try {
        assertion();
      } catch {
        failures.push(description);
      }
    };

    check('isLoading became false while the newer request was active', () =>
      assert.equal(stopResult.loadingAfterOlderRequestFinished, true),
    );
    check('stop() did not abort the newer request', () =>
      assert.equal(stopResult.newerRequestAborted, true),
    );
    check('the newer response updated the object after stop()', () =>
      assert.deepEqual(stopResult.finalObject, { value: 'pending' }),
    );
    check('clear() did not abort the newer request', () =>
      assert.equal(clearResult.newerRequestAborted, true),
    );
    check('the newer response repopulated the object after clear()', () =>
      assert.equal(clearResult.finalObject, undefined),
    );

    if (failures.length > 0) {
      throw new Error(`ISSUE_21124_REPRODUCED: ${failures.join('; ')}`);
    }
  } finally {
    dom.window.close();
  }
}

await main();
