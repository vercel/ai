import { simulateReadableStream, streamText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../lib/run';

run(async () => {
  // Simulate a provider reporting an interrupted response. No API key is needed.
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: 'Let me check the weather in',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'interrupted', raw: undefined },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 7, text: 7, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    }),
    prompt: 'What is the weather in Paris?',
    tools: {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async () => ({ temperature: 20 }),
      }),
    },
    // A missing required tool call should not turn interruption into an error.
    toolChoice: 'required',
    onError: ({ error }) => console.error(error),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') process.stdout.write(part.text);
  }

  console.log('\nFinish reason:', await result.finishReason);
  console.log('Partial text:', await result.text);
  console.log('Usage:', await result.usage);
});
