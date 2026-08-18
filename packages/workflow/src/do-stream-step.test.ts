import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] },
];

describe('doStreamStep', () => {
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

  it('returns model stream errors as terminal step data', async () => {
    const terminal = new Error('terminal model error');
    const streamedParts: unknown[] = [];
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'error' as const, error: terminal },
          {
            type: 'finish' as const,
            finishReason: { unified: 'error' as const, raw: 'error' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 0,
                text: 0,
                reasoning: undefined,
              },
            },
          },
        ]),
      }),
    });

    const result = await doStreamStep(
      prompt,
      model,
      new WritableStream({
        write(part) {
          streamedParts.push(part);
        },
      }),
    );

    expect(result).toMatchObject({
      terminalError: terminal,
      finish: { finishReason: 'error' },
    });
    expect(streamedParts).toContainEqual({ type: 'error', error: terminal });
  });
});
