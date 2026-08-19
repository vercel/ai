import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] },
];

describe('doStreamStep', () => {
  it('resets the current UI step before streaming model output', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 'text-1' },
          {
            type: 'text-delta' as const,
            id: 'text-1',
            delta: 'Retried output',
          },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
          },
        ]),
      }),
    });
    const writtenParts: unknown[] = [];

    await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'Retry.' }] }],
      model,
      new WritableStream({
        write(part) {
          writtenParts.push(part);
        },
      }),
    );

    expect(writtenParts[0]).toEqual({ type: 'reset-step' });
    expect(writtenParts).toContainEqual({
      type: 'text-delta',
      id: 'text-1',
      text: 'Retried output',
    });
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
