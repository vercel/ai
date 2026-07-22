import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { streamText } from './stream-text';

const usage: LanguageModelV4Usage = {
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
};

function createModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });
}

describe('streamText UI message responses', () => {
  it('serializes a finish chunk accepted by older strict clients by default', async () => {
    const result = streamText({
      model: createModel(),
      prompt: 'test-input',
    });

    const chunks = await convertResponseStreamToArray(
      result.toUIMessageStreamResponse(),
    );
    const finishChunk = chunks.find(chunk =>
      chunk.startsWith('data: {"type":"finish"'),
    );

    expect(finishChunk).toBeDefined();
    expect(
      z
        .strictObject({ type: z.literal('finish') })
        .safeParse(JSON.parse(finishChunk!.slice('data: '.length).trim()))
        .success,
    ).toBe(true);
  });

  it('serializes the finish reason when sendFinishReason is true', async () => {
    const result = streamText({
      model: createModel(),
      prompt: 'test-input',
    });

    const chunks = await convertResponseStreamToArray(
      result.toUIMessageStreamResponse({ sendFinishReason: true }),
    );

    expect(chunks).toContain(
      'data: {"type":"finish","finishReason":"stop"}\n\n',
    );
  });
});
