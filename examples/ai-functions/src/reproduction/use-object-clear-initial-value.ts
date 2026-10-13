import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const requireFromReactPackage = createRequire(
  path.join(process.cwd(), '../../packages/react/package.json'),
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

const { act, cleanup, renderHook, waitFor } = requireFromReactPackage(
  '@testing-library/react',
);
const { z } = requireFromReactPackage('zod');
const { experimental_useObject: useObject } = requireFromReactPackage(
  './src/use-object.ts',
);

const initialValue = { title: 'Initial draft' };
const generatedValue = { title: 'Generated draft' };
const schema = z.object({ title: z.string() });

function nextId(label: string) {
  return `issue-21129-${label}`;
}

function jsonFetch(value: unknown) {
  return async () =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
}

async function submitAndWait(
  result: {
    current: {
      submit: (input: unknown) => void;
      isLoading: boolean;
      object: unknown;
    };
  },
  expected: unknown,
) {
  act(() => {
    result.current.submit({});
  });
  await waitFor(() => {
    assert.equal(result.current.isLoading, false);
    assert.deepEqual(result.current.object, expected);
  });
}

async function main() {
  const issueFailures: string[] = [];

  const recordUndefinedMismatch = (label: string, value: unknown) => {
    if (value !== undefined) {
      issueFailures.push(label);
    }
  };

  try {
    // Reported failure: clearing before the first request.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('clear-before-request'),
          schema,
          initialValue,
        }),
      );
      await act(async () => {
        result.current.clear();
      });
      recordUndefinedMismatch('clear before request', result.current.object);
      cleanup();
    }

    // Reported failure: clearing after a generated object restores initialValue.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('clear-after-generation'),
          schema,
          initialValue,
          fetch: jsonFetch(generatedValue),
        }),
      );
      await submitAndWait(result, generatedValue);
      await act(async () => {
        result.current.clear();
      });
      recordUndefinedMismatch('clear after generation', result.current.object);
      cleanup();
    }

    // Reported failure: submit clears the object while awaiting the response.
    {
      let releaseResponse!: (response: Response) => void;
      const responsePromise = new Promise<Response>(resolve => {
        releaseResponse = resolve;
      });
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('clear-on-submit'),
          schema,
          initialValue,
          fetch: () => responsePromise,
        }),
      );
      act(() => {
        result.current.submit({});
      });
      await waitFor(() => assert.equal(result.current.isLoading, true));
      recordUndefinedMismatch('clear on submit', result.current.object);
      releaseResponse(
        new Response(JSON.stringify(generatedValue), { status: 200 }),
      );
      await waitFor(() => assert.equal(result.current.isLoading, false));
      cleanup();
    }

    // Reported failure: clearing shared state leaves initialValue in consumers.
    {
      const id = nextId('shared-consumers');
      const first = renderHook(() =>
        useObject({ api: '/api/object', id, schema, initialValue }),
      );
      const second = renderHook(() =>
        useObject({ api: '/api/object', id, schema, initialValue }),
      );
      await act(async () => {
        first.result.current.clear();
      });
      recordUndefinedMismatch(
        'shared consumers',
        first.result.current.object === undefined &&
          second.result.current.object === undefined
          ? undefined
          : {
              first: first.result.current.object,
              second: second.result.current.object,
            },
      );
      cleanup();
    }

    // Reported failure: a remount exposes fallbackData after an explicit clear.
    {
      const id = nextId('remount');
      const first = renderHook(() =>
        useObject({ api: '/api/object', id, schema, initialValue }),
      );
      await act(async () => {
        first.result.current.clear();
      });
      first.unmount();
      const second = renderHook(() =>
        useObject({ api: '/api/object', id, schema, initialValue }),
      );
      recordUndefinedMismatch(
        'remount cleared cache entry',
        second.result.current.object,
      );
      cleanup();
    }

    // Reported failure: null is a legitimate initial value, not a clear sentinel.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('null-initial-value'),
          schema: schema.nullable(),
          initialValue: null,
        }),
      );
      await act(async () => {
        result.current.clear();
      });
      recordUndefinedMismatch(
        'clear null initial value',
        result.current.object,
      );
      cleanup();
    }

    // Passing control: initialValue is shown on first render.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('initial-render'),
          schema,
          initialValue,
        }),
      );
      assert.deepEqual(result.current.object, initialValue);
      cleanup();
    }

    // Passing control: clearing without initialValue remains undefined.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('no-initial-value'),
          schema,
        }),
      );
      await act(async () => {
        result.current.clear();
      });
      assert.equal(result.current.object, undefined);
      cleanup();
    }

    // Passing control: unrelated ids do not share generated state.
    {
      const first = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('unrelated-first'),
          schema,
          initialValue: { title: 'First initial' },
          fetch: jsonFetch(generatedValue),
        }),
      );
      const secondInitial = { title: 'Second initial' };
      const second = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('unrelated-second'),
          schema,
          initialValue: secondInitial,
        }),
      );
      await submitAndWait(first.result, generatedValue);
      assert.deepEqual(second.result.current.object, secondInitial);
      cleanup();
    }

    // Passing control: generated null must remain distinguishable from undefined.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('generated-null'),
          schema: schema.nullable(),
          fetch: jsonFetch(null),
        }),
      );
      await submitAndWait(result, null);
      cleanup();
    }

    // Passing control: generated objects are shared by consumers with the same id.
    {
      const id = nextId('shared-generated');
      const first = renderHook(() =>
        useObject({
          api: '/api/object',
          id,
          schema,
          fetch: jsonFetch(generatedValue),
        }),
      );
      const second = renderHook(() =>
        useObject({ api: '/api/object', id, schema }),
      );
      await submitAndWait(first.result, generatedValue);
      await waitFor(() =>
        assert.deepEqual(second.result.current.object, generatedValue),
      );
      cleanup();
    }

    // Passing control: generation still succeeds after clear is invoked.
    {
      const { result } = renderHook(() =>
        useObject({
          api: '/api/object',
          id: nextId('generation-after-clear'),
          schema,
          initialValue,
          fetch: jsonFetch(generatedValue),
        }),
      );
      await act(async () => {
        result.current.clear();
      });
      await submitAndWait(result, generatedValue);
      cleanup();
    }
  } finally {
    cleanup();
    dom.window.close();
  }

  const expectedFailures = [
    'clear before request',
    'clear after generation',
    'clear on submit',
    'shared consumers',
    'remount cleared cache entry',
    'clear null initial value',
  ];

  if (issueFailures.length === 0) {
    console.log(
      'Issue 21129 is fixed: all clear operations produced undefined.',
    );
    return;
  }

  assert.deepEqual(
    issueFailures,
    expectedFailures,
    `Unexpected issue coverage mismatch: ${issueFailures.join(', ')}`,
  );

  console.error(
    'ISSUE 21129 REPRODUCED: useObject.clear() exposed initialValue instead of undefined in all 6 reported scenarios',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
