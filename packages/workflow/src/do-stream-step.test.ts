import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'test' }],
  },
];

describe('doStreamStep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { setting: 'zero retries', maxRetries: 0, expectedAttempts: 1 },
    { setting: 'two retries', maxRetries: 2, expectedAttempts: 3 },
    {
      setting: 'the default retry count',
      maxRetries: undefined,
      expectedAttempts: 3,
    },
  ])(
    '$setting makes $expectedAttempts model attempt(s)',
    async ({ maxRetries, expectedAttempts }) => {
      vi.useFakeTimers();
      const model = new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('model call failed');
        },
      });

      const result = doStreamStep(prompt, model, undefined, undefined, {
        maxRetries,
      });
      const rejection = expect(result).rejects.toThrow('model call failed');

      await vi.runAllTimersAsync();

      await rejection;
      expect(model.doStreamCalls).toHaveLength(expectedAttempts);
    },
  );

  it('disables workflow step retries to avoid stacking retry layers', () => {
    expect(doStreamStep.maxRetries).toBe(0);
  });
});
