import { Output, simulateReadableStream, streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function main() {
  let onFinishEvent: Record<string, unknown> | undefined;

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: '{"content":"Hello, world!"}',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
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
          ],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    }),
    output: Output.object({
      schema: z.object({ content: z.string() }),
    }),
    prompt: 'Return a greeting.',
    onFinish(event) {
      onFinishEvent = event as unknown as Record<string, unknown>;
    },
  });

  const parsedOutput = await result.output;
  const callbackOutput = onFinishEvent?.object ?? onFinishEvent?.output;

  console.log('result.output:', parsedOutput);
  console.log('onFinish keys:', Object.keys(onFinishEvent ?? {}).sort());
  console.log('onFinish structured output:', callbackOutput);

  if (callbackOutput === undefined) {
    throw new Error(
      'BUG: streamText onFinish did not expose the complete structured output',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
