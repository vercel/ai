import { expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { StructuredObject } from '../structured-object.svelte.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

it('awaits async onFinish and routes its rejection through the normal error path', async () => {
  const defects: string[] = [];

  const finish = deferred();
  let finishStarted!: () => void;
  const started = new Promise<void>(resolve => {
    finishStarted = resolve;
  });
  let submitSettled = false;

  const pendingObject = new StructuredObject({
    api: '/mock',
    schema: z.object({ value: z.string() }),
    fetch: async () => new Response('{"value":"done"}'),
    onFinish: () => {
      finishStarted();
      return finish.promise;
    },
  });

  const pendingSubmit = pendingObject.submit('input').then(() => {
    submitSettled = true;
  });

  await started;
  await new Promise(resolve => setTimeout(resolve, 0));

  if (submitSettled) {
    defects.push('submit resolved before async onFinish settled');
  }

  finish.resolve();
  await pendingSubmit;

  const synchronousFailure = new Error('synchronous save failed');
  const synchronousOnError = vi.fn();
  const synchronousObject = new StructuredObject({
    api: '/mock',
    schema: z.object({ value: z.string() }),
    fetch: async () => new Response('{"value":"done"}'),
    onFinish: () => {
      throw synchronousFailure;
    },
    onError: synchronousOnError,
  });

  await synchronousObject.submit('input');

  expect(synchronousOnError).toHaveBeenCalledWith(synchronousFailure);
  expect(synchronousObject.error).toBe(synchronousFailure);

  const failure = new Error('save failed');
  const onError = vi.fn();
  const rejectedObject = new StructuredObject({
    api: '/mock',
    schema: z.object({ value: z.string() }),
    fetch: async () => new Response('{"value":"done"}'),
    onFinish: () => {
      const rejection = Promise.reject(failure);
      // Prevent Vitest's global unhandled-rejection handler from masking the
      // state and callback assertions that identify the SDK behavior.
      void rejection.catch(() => {});
      return rejection;
    },
    onError,
  });

  await rejectedObject.submit('input');

  if (!onError.mock.calls.some(([error]) => error === failure)) {
    defects.push('rejected async onFinish did not call onError');
  }
  if (rejectedObject.error !== failure) {
    defects.push('rejected async onFinish did not set object.error');
  }

  expect(
    defects,
    'ISSUE_22576_REPRODUCED: async onFinish is neither awaited nor routed to the StructuredObject error path',
  ).toEqual([]);
});
