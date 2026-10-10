import { expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { StructuredObject } from './structured-object.svelte.js';

type ControlledRequest = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  signal: AbortSignal;
};

function createControlledObject() {
  const requests: ControlledRequest[] = [];

  const object = new StructuredObject({
    api: '/mock',
    schema: z.object({ value: z.string() }),
    fetch: async (_input, init) => {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const signal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      });

      signal.addEventListener(
        'abort',
        () => {
          try {
            controller.error(new DOMException('Request aborted', 'AbortError'));
          } catch {
            // The stream may already be closed.
          }
        },
        { once: true },
      );

      requests.push({ controller, signal });
      return new Response(body);
    },
  });

  return { object, requests };
}

function finish(request: ControlledRequest, value: string) {
  request.controller.enqueue(
    new TextEncoder().encode(JSON.stringify({ value })),
  );
  request.controller.close();
}

it('keeps the newer completed object when an older request finishes late', async () => {
  const { object, requests } = createControlledObject();
  const older = object.submit('older');
  const newer = object.submit('newer');

  await vi.waitFor(() => expect(requests).toHaveLength(2));

  finish(requests[1], 'newer');
  await newer;
  expect(object.object).toEqual({ value: 'newer' });

  finish(requests[0], 'older');
  await older;

  expect(
    object.object,
    'ISSUE_22575_STALE_OBJECT: older response overwrote newer completed result',
  ).toEqual({ value: 'newer' });
});

it('keeps newer request state when an older request fails while it is active', async () => {
  const { object, requests } = createControlledObject();
  const older = object.submit('older');
  const newer = object.submit('newer');

  await vi.waitFor(() => expect(requests).toHaveLength(2));

  requests[0].controller.error(new Error('older request failed'));
  await older;

  const loadingWhileNewerIsActive = object.loading;
  const errorWhileNewerIsActive = object.error;

  object.stop();
  await newer;

  expect
    .soft(
      loadingWhileNewerIsActive,
      'ISSUE_22575_STALE_LOADING: older failure cleared newer loading state',
    )
    .toBe(true);
  expect
    .soft(
      errorWhileNewerIsActive,
      'ISSUE_22575_STALE_ERROR: older failure replaced newer error state',
    )
    .toBeUndefined();
});

it('does not surface an older failure after the newer request completes', async () => {
  const { object, requests } = createControlledObject();
  const older = object.submit('older');
  const newer = object.submit('newer');

  await vi.waitFor(() => expect(requests).toHaveLength(2));

  finish(requests[1], 'newer');
  await newer;
  requests[0].controller.error(new Error('older request failed'));
  await older;

  expect(object.object).toEqual({ value: 'newer' });
  expect(
    object.error,
    'ISSUE_22575_STALE_ERROR: older failure surfaced after newer completion',
  ).toBeUndefined();
});

it('can still stop the newer request after the older request completes', async () => {
  const { object, requests } = createControlledObject();
  const older = object.submit('older');
  const newer = object.submit('newer');

  await vi.waitFor(() => expect(requests).toHaveLength(2));

  requests[0].controller.close();
  await older;

  const loadingAfterOlderCompletion = object.loading;
  object.stop();
  const newerWasAborted = requests[1].signal.aborted;

  if (!newerWasAborted) {
    requests[1].controller.close();
  }
  await newer;

  expect
    .soft(
      loadingAfterOlderCompletion,
      'ISSUE_22575_STALE_LOADING: older completion cleared newer loading state',
    )
    .toBe(true);
  expect
    .soft(
      newerWasAborted,
      'ISSUE_22575_LOST_CANCELLATION: older completion detached newer controller',
    )
    .toBe(true);
});
