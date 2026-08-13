import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

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

    expect(writtenParts[0]).toEqual({ type: 'reset' });
    expect(writtenParts).toContainEqual({
      type: 'text-delta',
      id: 'text-1',
      text: 'Retried output',
    });
  });
});
