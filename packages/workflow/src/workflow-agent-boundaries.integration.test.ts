import { waitForHook } from '@workflow/vitest';
import { describe, expect, it } from 'vitest';
import { resumeHook, start } from 'workflow/api';
import {
  hydrateResourceIO,
  observabilityRevivers,
} from 'workflow/observability';
import { getWorld } from 'workflow/runtime';
import {
  generateAcrossDeadline,
  generateAtBoundary,
  generateSerializableFields,
} from './test/generation-boundary-workflows.js';
import { generateWithSuspendingTool } from './test/approval-workflows.js';

async function modelSteps(runId: string) {
  const page = await (
    await getWorld()
  ).steps.list({ runId, resolveData: 'all' });
  expect(page.hasMore).toBe(false);
  return page.data
    .filter(step => step.stepName.includes('doGenerateStep'))
    .map(step => hydrateResourceIO(step, observabilityRevivers));
}
async function readTrace(stream: ReadableStream) {
  const values: unknown[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      values.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return values;
}

describe('generate runtime boundaries', () => {
  it('expires before model dispatch', async () => {
    const run = await start(generateAtBoundary, ['retry', -1]);
    await expect(run.returnValue).resolves.toMatchObject({
      errorName: 'TimeoutError',
    });
    expect(await readTrace(run.readable)).toEqual([]);
    expect(await modelSteps(run.runId)).toHaveLength(1);
  });
  it('retries the SDK call within one Workflow step attempt', async () => {
    const run = await start(generateAtBoundary, ['retry']);
    await expect(run.returnValue).resolves.toEqual({ text: 'Recovered.' });
    expect(await readTrace(run.readable)).toEqual(
      [1, 2, 3].map(modelAttempt => ({ modelAttempt, stepAttempt: 1 })),
    );
    expect(await modelSteps(run.runId)).toHaveLength(1);
  });
  it('does not dispatch a retry beyond the absolute deadline', async () => {
    const run = await start(generateAtBoundary, ['deadline', 5000]);
    // The shared SDK retry delay reports an abort when the deadline fires.
    await expect(run.returnValue).resolves.toMatchObject({
      errorName: 'AbortError',
    });
    expect(await readTrace(run.readable)).toEqual([
      { modelAttempt: 1, stepAttempt: 1 },
    ]);
    expect(await modelSteps(run.runId)).toHaveLength(1);
  });
  it('does not retry provider aborts at either retry layer', async () => {
    const run = await start(generateAtBoundary, ['abort']);
    await expect(run.returnValue).resolves.toMatchObject({
      errorName: 'AbortError',
    });
    expect(await readTrace(run.readable)).toEqual([
      { modelAttempt: 1, stepAttempt: 1 },
    ]);
    expect(await modelSteps(run.runId)).toHaveLength(1);
  });
  it('keeps a hook suspended past the model deadline and blocks model dispatch after resume', async () => {
    const run = await start(generateAcrossDeadline, [5000]);
    const hook = await waitForHook(run);
    const [completed] = await modelSteps(run.runId);
    const timeoutAt = (
      completed.input as unknown as {
        args: [unknown, unknown, unknown, { timeoutAt: number }];
      }
    ).args[3].timeoutAt;
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, timeoutAt - Date.now()) + 50),
    );
    await expect(run.status).resolves.toBe('running');
    expect(await modelSteps(run.runId)).toHaveLength(1);
    await resumeHook(hook.token, 'continue');
    await expect(run.returnValue).resolves.toEqual({
      errorName: 'TimeoutError',
    });
    const after = await modelSteps(run.runId);
    expect(after).toHaveLength(2);
    expect(after.find(step => step.stepId === completed.stepId)).toEqual(
      completed,
    );
    // Two adapter steps ran, but only the first dispatched to the provider.
    expect(await readTrace(run.readable)).toEqual([
      { modelAttempt: 1, stepAttempt: 1 },
    ]);
  });
  it('supports cancelling the workflow run while a tool waits on a hook', async () => {
    const run = await start(generateWithSuspendingTool, []);
    await waitForHook(run);
    const before = await modelSteps(run.runId);
    await run.cancel();
    await expect(run.status).resolves.toBe('cancelled');
    await expect(run.returnValue).rejects.toThrow();
    expect(await modelSteps(run.runId)).toEqual(before);
  });
  it.each([true, false])(
    'returns selected rich result fields after suspension (include: %s)',
    async include => {
      const run = await start(generateSerializableFields, [include]);
      const hook = await waitForHook(run);
      const before = await modelSteps(run.runId);
      await resumeHook(hook.token, 'continue');
      const result = await run.returnValue;
      expect(result).toMatchObject({
        text: 'Answer.',
        output: 'Answer.',
        contentTypes: ['reasoning', 'text', 'file', 'source'],
        file: {
          base64: 'aGk=',
          bytes: new Uint8Array([104, 105]),
          mediaType: 'text/plain',
        },
        response: {
          id: 'boundary-response',
          timestamp: new Date('2026-01-02T00:00:00Z'),
          modelId: 'response-model',
          headers: { 'x-fixture': 'yes' },
        },
        usage: {
          inputTokens: 3,
          outputTokens: 2,
          totalTokens: 5,
          inputTokenDetails: { cacheReadTokens: 1 },
          outputTokenDetails: { reasoningTokens: 1 },
        },
        providerMetadata: { fixture: { calls: 1 } },
      });
      expect(result.sources).toMatchObject([
        { id: 'source', url: 'https://example.com/source' },
      ]);
      expect(result.warnings).toMatchObject([
        { type: 'other', message: 'fixture warning' },
      ]);
      expect(result.request.body).toEqual(include ? 'request body' : undefined);
      expect(result.request.messages).toEqual(
        include
          ? [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Return rich content.' }],
                providerOptions: undefined,
              },
            ]
          : undefined,
      );
      expect(result.response.body).toEqual(
        include ? { fixture: 'response' } : undefined,
      );
      expect(result.responseMessages).toHaveLength(1);
      expect(await modelSteps(run.runId)).toEqual(before);
      expect(await readTrace(run.readable)).toEqual([
        { modelAttempt: 1, stepAttempt: 1 },
      ]);
    },
  );
});
