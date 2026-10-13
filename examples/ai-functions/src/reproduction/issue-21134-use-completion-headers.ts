import { createRequire } from 'node:module';
import type { CompletionRequestOptions, UseCompletionOptions } from 'ai';
import type * as TestingLibraryReact from '../../../../packages/react/node_modules/@testing-library/react';

type HeaderInput = Record<string, string> | Headers;

type Scenario = {
  name: string;
  hookHeaders?: HeaderInput;
  requestHeaders?: HeaderInput;
  expected: Record<string, string | null>;
};

async function main() {
  const requireFromReactPackage = createRequire(
    new URL('../../../../packages/react/package.json', import.meta.url),
  );
  const { JSDOM } = requireFromReactPackage('jsdom') as {
    JSDOM: new (html: string) => {
      window: Window & typeof globalThis & { close(): void };
    };
  };
  const dom = new JSDOM('<html><body></body></html>');

  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
  ] as const) {
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

  const { renderHook, act, cleanup } = requireFromReactPackage(
    '@testing-library/react',
  ) as typeof TestingLibraryReact;
  const useCompletionModule =
    '../../../../packages/react/src/use-completion.ts';
  const { useCompletion } = (await import(useCompletionModule)) as {
    useCompletion: (options?: UseCompletionOptions) => {
      complete: (
        prompt: string,
        options?: CompletionRequestOptions,
      ) => Promise<string | null | undefined>;
    };
  };

  const scenarios: Scenario[] = [
    {
      name: 'no-header control',
      expected: { 'x-example': null },
    },
    {
      name: 'hook object',
      hookHeaders: { 'X-Example': 'hook-object' },
      expected: { 'x-example': 'hook-object' },
    },
    {
      name: 'request object',
      requestHeaders: { 'X-Example': 'request-object' },
      expected: { 'x-example': 'request-object' },
    },
    {
      name: 'request object overrides hook object',
      hookHeaders: { 'X-Example': 'hook-object' },
      requestHeaders: { 'X-Example': 'request-object' },
      expected: { 'x-example': 'request-object' },
    },
    {
      name: 'distinct object headers are preserved',
      hookHeaders: { 'X-Hook': 'hook-object' },
      requestHeaders: { 'X-Request': 'request-object' },
      expected: {
        'x-hook': 'hook-object',
        'x-request': 'request-object',
      },
    },
    {
      name: 'hook Headers instance',
      hookHeaders: new Headers({ 'X-Example': 'hook-headers' }),
      expected: { 'x-example': 'hook-headers' },
    },
    {
      name: 'request Headers instance',
      requestHeaders: new Headers({ 'X-Example': 'request-headers' }),
      expected: { 'x-example': 'request-headers' },
    },
    {
      name: 'distinct hook Headers instance is preserved',
      hookHeaders: new Headers({ 'X-Hook': 'hook-headers' }),
      requestHeaders: { 'X-Request': 'request-object' },
      expected: {
        'x-hook': 'hook-headers',
        'x-request': 'request-object',
      },
    },
    {
      name: 'request Headers instance overrides hook object',
      hookHeaders: { 'X-Example': 'hook-object' },
      requestHeaders: new Headers({ 'X-Example': 'request-headers' }),
      expected: { 'x-example': 'request-headers' },
    },
  ];

  const failures: string[] = [];

  try {
    for (const scenario of scenarios) {
      let sentHeaders: Headers | undefined;
      const { result } = renderHook(() =>
        useCompletion({
          headers: scenario.hookHeaders,
          streamProtocol: 'text',
          fetch: async (_url, init) => {
            sentHeaders = new Headers(init?.headers);
            return new Response('ok');
          },
        }),
      );

      await act(async () => {
        await result.current.complete('Hello', {
          headers: scenario.requestHeaders,
        });
      });

      const mismatches = Object.entries(scenario.expected).filter(
        ([name, expected]) => sentHeaders?.get(name) !== expected,
      );

      if (mismatches.length > 0) {
        failures.push(
          `${scenario.name}: ${mismatches
            .map(
              ([name, expected]) =>
                `${name} expected ${JSON.stringify(expected)}, received ${JSON.stringify(sentHeaders?.get(name) ?? null)}`,
            )
            .join('; ')}`,
        );
      }

      cleanup();
    }
  } finally {
    cleanup();
    dom.window.close();
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE #21134 REPRODUCED: outgoing request headers did not preserve supported Headers instance values.',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'All hook-level and per-request object and Headers inputs were sent correctly.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
