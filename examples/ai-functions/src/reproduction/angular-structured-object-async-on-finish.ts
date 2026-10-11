import assert from 'node:assert/strict';

async function main() {
  const angularEntry = new URL(
    '../../../../packages/angular/src/index.ts',
    import.meta.url,
  ).href;
  const { StructuredObject } = await import(angularEntry);
  const { jsonSchema } = await import('ai');

  const callbackError = new Error('synthetic persistence failure');
  const unhandledRejections: unknown[] = [];
  const onErrorCalls: Error[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  const object = new StructuredObject({
    api: 'https://example.invalid',
    schema: jsonSchema({ type: 'object' }),
    fetch: async () => new Response('{}'),
    onFinish: async () => {
      throw callbackError;
    },
    onError: (error: Error) => {
      onErrorCalls.push(error);
    },
  });

  try {
    await object.submit({});
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }

  if (
    unhandledRejections.length === 1 &&
    unhandledRejections[0] === callbackError &&
    onErrorCalls.length === 0 &&
    object.error === undefined
  ) {
    throw new Error(
      'ISSUE_22810_REPRODUCED: rejected async onFinish escaped as an unhandled rejection instead of reaching onError and error state',
    );
  }

  assert.deepEqual(
    unhandledRejections,
    [],
    'the supported async onFinish callback must not cause an unhandled rejection',
  );
  assert.deepEqual(
    onErrorCalls,
    [callbackError],
    'the onFinish rejection must be delivered to onError',
  );
  assert.equal(
    object.error,
    callbackError,
    'the onFinish rejection must be stored in the error state',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
