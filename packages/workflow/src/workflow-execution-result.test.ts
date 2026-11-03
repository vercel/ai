import { describe, expect, it } from 'vitest';
import {
  resolveWorkflowStreamResult,
  type WorkflowExecutionData,
} from './workflow-execution-result.js';

const data: WorkflowExecutionData<{}, undefined> = {
  messages: [],
  steps: [],
  toolCalls: [],
  toolResults: [],
  finishReason: 'other',
  totalUsage: {
    inputTokens: 0,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: 0,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    totalTokens: 0,
  },
  output: undefined,
};

describe('stream interpretation of execution outcomes', () => {
  it.each(['completed', 'aborted'] as const)(
    'returns data for a %s outcome without an exception',
    status => {
      expect(resolveWorkflowStreamResult({ data, outcome: { status } })).toBe(
        data,
      );
    },
  );

  it.each([undefined, false, new Error('model failure')])(
    'preserves a model stream failure as an own error property: %s',
    error => {
      const result = resolveWorkflowStreamResult({
        data,
        outcome: { status: 'failed', source: 'model-stream', error },
      });
      expect(Object.keys(result)).toContain('error');
      expect(result.error).toBe(error);
    },
  );

  it.each([undefined, new Error('execution failure')])(
    'rejects an execution failure even when its value is undefined: %s',
    async failure => {
      await expect(
        Promise.resolve().then(() =>
          resolveWorkflowStreamResult({
            data,
            outcome: { status: 'failed', source: 'execution', error: failure },
          }),
        ),
      ).rejects.toBe(failure);
    },
  );

  it('preserves a thrown abort separately from an abort returned as data', async () => {
    const abort = new DOMException('cancelled', 'AbortError');
    await expect(
      Promise.resolve().then(() =>
        resolveWorkflowStreamResult({
          data,
          outcome: { status: 'aborted', rejection: { value: abort } },
        }),
      ),
    ).rejects.toBe(abort);
  });
});
