import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { expect, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { stepCountIs } from './stop-condition';
import { streamText } from './stream-text';

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
};

it('keeps text part IDs unique across multi-step streams', async () => {
  let callCount = 0;

  const model = new MockLanguageModelV2({
    doStream: async () => {
      callCount++;

      const parts: LanguageModelV2StreamPart[] =
        callCount === 1
          ? [
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Let me check.' },
              { type: 'text-end', id: '0' },
              {
                type: 'tool-call',
                toolCallId: 'weather-call',
                toolName: 'get_weather',
                input: JSON.stringify({ city: 'San Francisco' }),
              },
              {
                type: 'finish',
                finishReason: 'tool-calls',
                usage,
              },
            ]
          : [
              { type: 'text-start', id: '0' },
              {
                type: 'text-delta',
                id: '0',
                delta: 'It is sunny and 72°F.',
              },
              { type: 'text-end', id: '0' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage,
              },
            ];

      return { stream: convertArrayToReadableStream(parts) };
    },
  });

  const result = streamText({
    model,
    prompt: 'What is the weather?',
    tools: {
      get_weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async () => ({ temperature: 72, condition: 'sunny' }),
      }),
    },
    stopWhen: stepCountIs(2),
  });

  const parts = await convertAsyncIterableToArray(result.fullStream);
  const textStarts = parts.filter(part => part.type === 'text-start');
  const textDeltas = parts.filter(part => part.type === 'text-delta');
  const textEnds = parts.filter(part => part.type === 'text-end');

  expect(textStarts).toHaveLength(2);
  expect(new Set(textStarts.map(part => part.id)).size).toBe(textStarts.length);
  expect(textEnds).toHaveLength(textStarts.length);

  for (const start of textStarts) {
    expect(textEnds.some(end => end.id === start.id)).toBe(true);
  }

  for (const delta of textDeltas) {
    expect(textStarts.some(start => start.id === delta.id)).toBe(true);
  }
});
