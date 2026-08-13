import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { Experimental_LanguageModelStreamPart, ToolSet } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

describe('doStreamStep', () => {
  it('forwards a stream error once and rejects with its exact value', async () => {
    const terminalError = new Error('safe-terminal-marker');
    const forwardedParts: Array<Experimental_LanguageModelStreamPart<ToolSet>> =
      [];
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'error' as const, error: terminalError },
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
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'trigger the terminal error' }],
      },
    ];

    const result = doStreamStep(
      prompt,
      model,
      new WritableStream({
        write(part) {
          forwardedParts.push(part);
        },
      }),
    );

    await expect(result).rejects.toBe(terminalError);
    expect(forwardedParts.filter(part => part.type === 'error')).toEqual([
      { type: 'error', error: terminalError },
    ]);
  });
});
