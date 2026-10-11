import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { consumeStream, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 8, text: 8, reasoning: 0 },
};

const model = new MockLanguageModelV4({
  doStream: async () => ({
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text-1' },
      {
        type: 'text-delta',
        id: 'text-1',
        delta: 'This response reached its configured output limit',
      },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'finish',
        finishReason: { unified: 'length', raw: 'max_tokens' },
        usage,
      },
    ]),
  }),
});

const result = streamText({
  model,
  prompt: 'Write a very long response.',
  maxOutputTokens: 8,
});

await consumeStream({
  stream: result.toUIMessageStream({
    onEnd: ({ outcome }) => {
      assert.deepEqual(outcome, { status: 'truncated' });
      console.log('Show a truncation notice:', outcome.status);
    },
  }),
});
