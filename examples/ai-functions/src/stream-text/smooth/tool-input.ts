import { simulateReadableStream, smoothStream, streamText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            {
              type: 'tool-input-start',
              id: 'call-1',
              toolName: 'weather',
            },
            {
              type: 'tool-input-delta',
              id: 'call-1',
              delta: '{"city":"London"}',
            },
            { type: 'tool-input-end', id: 'call-1' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'weather',
              input: '{"city":"London"}',
            },
            {
              type: 'finish',
              finishReason: { raw: undefined, unified: 'tool-calls' },
              usage: {
                inputTokens: {
                  total: 3,
                  noCache: 3,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 10,
                  text: 10,
                  reasoning: undefined,
                },
              },
            },
          ],
        }),
      }),
    }),
    prompt: 'Check the weather in London.',
    tools: {
      weather: tool({
        inputSchema: z.object({
          city: z.string(),
        }),
      }),
    },
    experimental_transform: smoothStream({
      delayInMs: 25,
      toolInputSmoothing: {},
    }),
  });

  const toolInputDeltas: string[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'tool-input-delta') {
      toolInputDeltas.push(part.delta);
      process.stdout.write(part.delta);
    }
  }

  console.log();

  if (
    toolInputDeltas.length === 0 ||
    toolInputDeltas.some(delta => [...delta].length !== 1) ||
    toolInputDeltas.join('') !== '{"city":"London"}'
  ) {
    throw new Error('Expected character-by-character tool input deltas.');
  }
});
