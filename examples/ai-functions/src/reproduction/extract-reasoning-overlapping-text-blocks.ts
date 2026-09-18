import { extractReasoningMiddleware, streamText, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const expectedText = 'Alpha.Beta.';

async function runScenario(wrapped: boolean) {
  const model = new MockLanguageModelV4({
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
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    },
  });

  const errors: unknown[] = [];
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

  for await (const event of result.fullStream) {
    if (event.type === 'error') {
      errors.push(event.error);
    }
  }

  return { text: await result.text, errors };
}

async function main() {
  const unwrapped = await runScenario(false);
  if (unwrapped.text !== expectedText || unwrapped.errors.length !== 0) {
    throw new Error(
      `Control stream failed: ${JSON.stringify({
        text: unwrapped.text,
        errors: unwrapped.errors,
      })}`,
    );
  }

  const wrapped = await runScenario(true);
  console.log(JSON.stringify({ unwrapped, wrapped }));

  if (wrapped.text !== expectedText || wrapped.errors.length !== 0) {
    throw new Error(
      'BUG: extractReasoningMiddleware failed to preserve overlapping text blocks',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
