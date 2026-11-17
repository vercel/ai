import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';
import {
  generateStepTimeout,
  streamChunkTimeout,
  streamTwoStepWithHeadroom,
} from './test/timeout-workflows.js';

describe('WorkflowAgent timeout configuration in the Workflow runtime', () => {
  it('ends a stream on a chunk timeout and reports an abort', async () => {
    const run = await start(streamChunkTimeout, []);

    await expect(run.returnValue).resolves.toEqual({
      stepCount: 0,
      abortCalls: 1,
      errorCalls: 0,
      endCalls: 0,
    });
    await expect(run.status).resolves.toBe('completed');
  });

  it('completes two model calls with per-call timeouts', async () => {
    const run = await start(streamTwoStepWithHeadroom, []);

    await expect(run.returnValue).resolves.toEqual({
      stepCount: 2,
      lastStepText: 'It is 18°C.',
    });
  });

  it('rejects generate with a step timeout', async () => {
    const run = await start(generateStepTimeout, []);

    await expect(run.returnValue).resolves.toEqual({
      errorName: 'TimeoutError',
      errorMessage: 'Step timeout of 300ms exceeded',
    });
  });
});
