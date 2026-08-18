import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] },
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

  it('does not call the model after the absolute deadline has elapsed', async () => {
    const doStream = vi.fn();
    const model = new MockLanguageModelV4({ doStream });

    await expect(
      doStreamStep(prompt, model, undefined, undefined, {
        timeoutAt: Date.now(),
      }),
    ).resolves.toEqual({ aborted: true });
    expect(doStream).not.toHaveBeenCalled();
  });

  it('returns an aborted result when the deadline aborts the model call', async () => {
    const timeoutController = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutController.signal);
    const model = new MockLanguageModelV4({
      doStream: async () => {
        timeoutController.abort(
          new DOMException('The operation timed out.', 'TimeoutError'),
        );
        throw timeoutController.signal.reason;
      },
    });

    try {
      await expect(
        doStreamStep(prompt, model, undefined, undefined, {
          timeoutAt: Date.now() + 5000,
        }),
      ).resolves.toEqual({ aborted: true });
      expect(model.doStreamCalls).toHaveLength(1);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
