import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

async function main() {
  const requireFromReactPackage = createRequire(
    new URL('../../../../packages/react/package.json', import.meta.url),
  );
  const { JSDOM } = await import(requireFromReactPackage.resolve('jsdom'));

  const dom = new JSDOM('<!doctype html><html><body></body></html>');

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

  const useObjectModuleUrl = new URL(
    '../../../../packages/react/src/use-object.ts',
    import.meta.url,
  ).href;
  const [{ renderHook, act, cleanup, waitFor }, { useObject }, { z }] =
    await Promise.all([
      import(requireFromReactPackage.resolve('@testing-library/react')),
      import(useObjectModuleUrl),
      import(requireFromReactPackage.resolve('zod/v4')),
    ]);

  const failures: string[] = [];
  const recordClearResult = (scenario: string, object: unknown) => {
    if (object !== undefined) {
      failures.push(scenario);
    }
  };

  try {
    const initialValue = { title: 'Initial draft' };

    {
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-before-request',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
        }),
      );

      assert.deepEqual(
        result.current.object,
        initialValue,
        'useObject should expose initialValue before clear()',
      );
      await act(async () => {
        result.current.clear();
      });
      recordClearResult('before the first request', result.current.object);
      unmount();
    }

    {
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-after-generation',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
          fetch: async () =>
            new Response(JSON.stringify({ title: 'Generated draft' })),
        }),
      );

      act(() => {
        result.current.submit({});
      });
      await waitFor(() => {
        assert.deepEqual(result.current.object, {
          title: 'Generated draft',
        });
      });
      await act(async () => {
        result.current.clear();
      });
      recordClearResult('after generation', result.current.object);
      unmount();
    }

    {
      const pendingFetch = (
        _input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-on-submit',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
          fetch: pendingFetch,
        }),
      );

      act(() => {
        result.current.submit({});
      });
      await waitFor(() => {
        assert.equal(result.current.isLoading, true);
      });
      recordClearResult('when submission starts', result.current.object);
      await act(async () => {
        result.current.stop();
      });
      unmount();
    }

    {
      const first = renderHook(() =>
        useObject({
          id: 'issue-21129-shared',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
        }),
      );
      const second = renderHook(() =>
        useObject({
          id: 'issue-21129-shared',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
        }),
      );

      await act(async () => {
        first.result.current.clear();
      });
      recordClearResult('for a shared consumer', second.result.current.object);
      first.unmount();
      second.unmount();
    }

    {
      const first = renderHook(() =>
        useObject({
          id: 'issue-21129-remount',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
        }),
      );

      await act(async () => {
        first.result.current.clear();
      });
      first.unmount();

      const remounted = renderHook(() =>
        useObject({
          id: 'issue-21129-remount',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
        }),
      );
      recordClearResult(
        'after remounting the cleared cache entry',
        remounted.result.current.object,
      );
      remounted.unmount();
    }

    {
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-null',
          api: '/api/object',
          schema: z.null(),
          initialValue: null,
        }),
      );

      assert.equal(
        result.current.object,
        null,
        'useObject should expose a null initialValue before clear()',
      );
      await act(async () => {
        result.current.clear();
      });
      recordClearResult('with a null initial value', result.current.object);
      unmount();
    }

    {
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-no-initial-value',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
        }),
      );

      assert.equal(result.current.object, undefined);
      await act(async () => {
        result.current.clear();
      });
      assert.equal(result.current.object, undefined);
      unmount();
    }

    {
      const first = renderHook(() =>
        useObject({
          id: 'issue-21129-unrelated-first',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue: { title: 'First draft' },
        }),
      );
      const second = renderHook(() =>
        useObject({
          id: 'issue-21129-unrelated-second',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue: { title: 'Second draft' },
        }),
      );

      await act(async () => {
        first.result.current.clear();
      });
      assert.deepEqual(second.result.current.object, {
        title: 'Second draft',
      });
      first.unmount();
      second.unmount();
    }

    {
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-generated-null',
          api: '/api/object',
          schema: z.null(),
          fetch: async () => new Response('null'),
        }),
      );

      act(() => {
        result.current.submit({});
      });
      await waitFor(() => {
        assert.equal(result.current.object, null);
      });
      unmount();
    }

    {
      const first = renderHook(() =>
        useObject({
          id: 'issue-21129-shared-generation',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          fetch: async () =>
            new Response(JSON.stringify({ title: 'Shared generated draft' })),
        }),
      );
      const second = renderHook(() =>
        useObject({
          id: 'issue-21129-shared-generation',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
        }),
      );

      act(() => {
        first.result.current.submit({});
      });
      await waitFor(() => {
        assert.deepEqual(second.result.current.object, {
          title: 'Shared generated draft',
        });
      });
      first.unmount();
      second.unmount();
    }

    {
      const { result, unmount } = renderHook(() =>
        useObject({
          id: 'issue-21129-generation-after-clear',
          api: '/api/object',
          schema: z.object({ title: z.string() }),
          initialValue,
          fetch: async () =>
            new Response(JSON.stringify({ title: 'Generated after clearing' })),
        }),
      );

      await act(async () => {
        result.current.clear();
      });
      act(() => {
        result.current.submit({});
      });
      await waitFor(() => {
        assert.deepEqual(result.current.object, {
          title: 'Generated after clearing',
        });
      });
      unmount();
    }

    if (failures.length > 0) {
      throw new Error(
        `ISSUE_21129_REPRODUCED: clear did not set object to undefined ${failures.join(', ')}`,
      );
    }
  } finally {
    cleanup();
    dom.window.close();
  }
}

main();
