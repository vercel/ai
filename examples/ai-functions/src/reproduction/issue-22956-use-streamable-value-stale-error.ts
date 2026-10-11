import assert from 'node:assert/strict';

async function main() {
  // jsdom is an existing @ai-sdk/rsc development dependency. Importing it
  // through that package keeps this reproduction self-contained.
  const { JSDOM } = await import(
    // @ts-expect-error jsdom does not publish TypeScript declarations.
    '../../../../packages/rsc/node_modules/jsdom/lib/api.js'
  );
  const dom = new JSDOM('<!doctype html><html><body></body></html>');

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: {
      configurable: true,
      value: true,
      writable: true,
    },
  });

  const [
    { act, renderHook },
    { useStreamableValue },
    { createStreamableValue },
  ] = await Promise.all([
    import('../../../../packages/rsc/node_modules/@testing-library/react/pure.js'),
    import('../../../../packages/rsc/dist/rsc-client.js'),
    import('../../../../packages/rsc/dist/rsc-server.js'),
  ]);

  const first = createStreamableValue<string, Error>('first');
  const firstValue = first.value;
  first.error(new Error('first failed'));

  const hook = renderHook(
    ({ value }) => useStreamableValue<string, Error>(value),
    { initialProps: { value: firstValue } },
  );

  await act(async () => {});
  assert.equal(
    hook.result.current[1]?.message,
    'first failed',
    'reproduction precondition: the first stream error should be visible',
  );

  const second = createStreamableValue<string, Error>('second');
  second.done();

  await act(async () => {
    hook.rerender({ value: second.value });
  });

  const [data, error, pending] = hook.result.current;
  hook.unmount();
  dom.window.close();

  assert.equal(
    data,
    'second',
    'reproduction precondition: replacement data should be visible',
  );
  assert.equal(
    pending,
    false,
    'reproduction precondition: the successful replacement should finish',
  );

  if (error !== undefined) {
    throw new Error(
      `ISSUE_22956_REPRODUCED: successful replacement retained previous stream error "${error.message}"`,
    );
  }

  console.log(
    'ISSUE_22956_FIXED: successful replacement cleared the previous stream error',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
