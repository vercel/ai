import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'response-metadata',
              id: 'response-1',
            });
            controller.enqueue({ type: 'text-start', id: 'text-1' });

            const outputTimeout = setTimeout(() => {
              controller.enqueue({
                type: 'text-delta',
                id: 'text-1',
                delta: 'The first content arrived before the deadline.',
              });
              controller.enqueue({ type: 'text-end', id: 'text-1' });
              controller.enqueue({
                type: 'finish',
                finishReason: { raw: undefined, unified: 'stop' },
                usage: {
                  inputTokens: {
                    total: 3,
                    noCache: 3,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 8,
                    text: 8,
                    reasoning: undefined,
                  },
                },
              });
              controller.close();
            }, 100);

            abortSignal?.addEventListener(
              'abort',
              () => {
                clearTimeout(outputTimeout);
                controller.error(abortSignal.reason);
              },
              { once: true },
            );
          },
        }),
      }),
    }),
    prompt: 'Write one sentence.',
    timeout: {
      firstChunkMs: 1000,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
});
