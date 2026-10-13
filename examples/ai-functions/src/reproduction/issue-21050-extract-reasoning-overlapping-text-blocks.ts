import { extractReasoningMiddleware, streamText, wrapLanguageModel } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const expectedText = 'Alpha.Beta.';
const expectedErrors: unknown[] = [];

async function runStream(wrapped: boolean) {
  const model = new MockLanguageModelV3({
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'a' });
          controller.enqueue({ type: 'text-start', id: 'b' });
          controller.enqueue({
            type: 'text-delta',
            id: 'a',
            delta: 'Alpha.',
          });
          controller.enqueue({
            type: 'text-delta',
            id: 'b',
            delta: 'Beta.',
          });
          controller.enqueue({ type: 'text-end', id: 'a' });
          controller.enqueue({ type: 'text-end', id: 'b' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: 0,
              },
            },
          });
          controller.close();
        },
      }),
    },
  });

  const result = streamText({
    model: wrapped
      ? wrapLanguageModel({
          model,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        })
      : model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });

  const errors: unknown[] = [];
  for await (const event of result.fullStream) {
    if (event.type === 'error') {
      errors.push(event.error);
    }
  }

  return {
    text: await result.text,
    errors,
  };
}

async function main() {
  const unwrapped = await runStream(false);
  const wrapped = await runStream(true);

  console.log(JSON.stringify({ unwrapped, wrapped }, null, 2));

  if (
    unwrapped.text !== expectedText ||
    JSON.stringify(unwrapped.errors) !== JSON.stringify(expectedErrors)
  ) {
    throw new Error(
      'Reproduction setup failed: the overlapping text blocks did not work without middleware.',
    );
  }

  if (
    wrapped.text !== expectedText ||
    JSON.stringify(wrapped.errors) !== JSON.stringify(expectedErrors)
  ) {
    throw new Error(
      'Reproduced issue #21050: extractReasoningMiddleware did not preserve overlapping text blocks.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
