import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type HeaderInput = Record<string, string> | Headers;

type Scenario = {
  name: string;
  hookHeaders?: HeaderInput;
  requestHeaders?: HeaderInput;
  expected: Record<string, string>;
  expectedToWorkBeforeFix: boolean;
};

const scenarios: Scenario[] = [
  {
    name: 'no custom headers',
    expected: {},
    expectedToWorkBeforeFix: true,
  },
  {
    name: 'hook Record headers',
    hookHeaders: { 'x-issue-hook': 'record' },
    expected: { 'x-issue-hook': 'record' },
    expectedToWorkBeforeFix: true,
  },
  {
    name: 'hook Headers instance',
    hookHeaders: new Headers({ 'x-issue-hook': 'headers' }),
    expected: { 'x-issue-hook': 'headers' },
    expectedToWorkBeforeFix: false,
  },
  {
    name: 'request Record headers',
    requestHeaders: { 'x-issue-request': 'record' },
    expected: { 'x-issue-request': 'record' },
    expectedToWorkBeforeFix: true,
  },
  {
    name: 'request Headers instance',
    requestHeaders: new Headers({ 'x-issue-request': 'headers' }),
    expected: { 'x-issue-request': 'headers' },
    expectedToWorkBeforeFix: false,
  },
  {
    name: 'request Record overrides hook Record',
    hookHeaders: { 'x-issue-shared': 'hook-record' },
    requestHeaders: { 'x-issue-shared': 'request-record' },
    expected: { 'x-issue-shared': 'request-record' },
    expectedToWorkBeforeFix: true,
  },
  {
    name: 'request Record overrides hook Headers instance',
    hookHeaders: new Headers({ 'x-issue-shared': 'hook-headers' }),
    requestHeaders: { 'x-issue-shared': 'request-record' },
    expected: { 'x-issue-shared': 'request-record' },
    expectedToWorkBeforeFix: true,
  },
  {
    name: 'request Headers instance overrides hook Record',
    hookHeaders: { 'x-issue-shared': 'hook-record' },
    requestHeaders: new Headers({ 'x-issue-shared': 'request-headers' }),
    expected: { 'x-issue-shared': 'request-headers' },
    expectedToWorkBeforeFix: false,
  },
  {
    name: 'distinct hook and request Headers instance values',
    hookHeaders: new Headers({ 'x-issue-hook': 'headers' }),
    requestHeaders: new Headers({ 'x-issue-request': 'headers' }),
    expected: {
      'x-issue-hook': 'headers',
      'x-issue-request': 'headers',
    },
    expectedToWorkBeforeFix: false,
  },
];

async function main() {
  const repoRoot = resolve('../..');
  const requireFromReactPackage = createRequire(
    resolve(repoRoot, 'packages/react/package.json'),
  );
  const { JSDOM } = requireFromReactPackage('jsdom') as {
    JSDOM: new (html: string) => {
      window: Record<string, unknown> & { close(): void };
    };
  };

  const dom = new JSDOM('<html><body></body></html>');
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

  const { renderHook, act, cleanup } = requireFromReactPackage(
    '@testing-library/react',
  ) as {
    renderHook: (callback: () => unknown) => {
      result: {
        current: {
          complete: (
            prompt: string,
            options?: { headers?: HeaderInput },
          ) => Promise<unknown>;
        };
      };
    };
    act: (callback: () => Promise<void>) => Promise<void>;
    cleanup: () => void;
  };

  const sourceUrl = pathToFileURL(
    resolve(repoRoot, 'packages/react/src/use-completion.ts'),
  ).href;
  const { useCompletion } = (await import(sourceUrl)) as {
    useCompletion: (options: {
      headers?: HeaderInput;
      streamProtocol: 'text';
      fetch: (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>;
    }) => unknown;
  };

  const reproducedFailures: string[] = [];
  const controlFailures: string[] = [];

  try {
    for (const scenario of scenarios) {
      let sentHeaders: Headers | undefined;
      const { result } = renderHook(() =>
        useCompletion({
          headers: scenario.hookHeaders,
          streamProtocol: 'text',
          fetch: async (_input, init) => {
            sentHeaders = new Headers(init?.headers);
            return new Response('ok');
          },
        }),
      );

      try {
        await act(async () => {
          await result.current.complete(
            'Hello',
            scenario.requestHeaders == null
              ? undefined
              : { headers: scenario.requestHeaders },
          );
        });

        assert.ok(sentHeaders, `${scenario.name}: custom fetch was not called`);

        const actual: Record<string, string> = {};
        sentHeaders.forEach((value, key) => {
          if (key.startsWith('x-issue-')) {
            actual[key] = value;
          }
        });

        console.log(
          `${scenario.name}: expected=${JSON.stringify(scenario.expected)} actual=${JSON.stringify(actual)}`,
        );

        try {
          assert.deepEqual(actual, scenario.expected);
        } catch {
          const failure = `${scenario.name} expected ${JSON.stringify(
            scenario.expected,
          )} but sent ${JSON.stringify(actual)}`;

          if (scenario.expectedToWorkBeforeFix) {
            controlFailures.push(failure);
          } else {
            reproducedFailures.push(failure);
          }
        }
      } finally {
        cleanup();
      }
    }
  } finally {
    cleanup();
    dom.window.close();
  }

  assert.deepEqual(
    controlFailures,
    [],
    `ISSUE_21134_HARNESS_FAILURE: ${controlFailures.join('; ')}`,
  );

  assert.deepEqual(
    reproducedFailures,
    [],
    `ISSUE_21134_REPRODUCED: Headers instance values were dropped or failed to override hook defaults: ${reproducedFailures.join(
      '; ',
    )}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
