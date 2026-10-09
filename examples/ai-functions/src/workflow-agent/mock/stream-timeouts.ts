import { WorkflowAgent } from '@ai-sdk/workflow';
import { MockLanguageModelV4 } from 'ai/test';

let timeoutReason: unknown;

const stalledModel = new MockLanguageModelV4({
  doStream: async ({ abortSignal }) => ({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: 'Partial response',
        });

        abortSignal?.addEventListener(
          'abort',
          () => {
            timeoutReason = abortSignal.reason;
            controller.error(abortSignal.reason);
          },
          { once: true },
        );
      },
    }),
  }),
});

const agent = new WorkflowAgent({ model: stalledModel });
const startedAt = Date.now();
const result = await agent.stream({
  prompt: 'Write a response.',
  timeout: {
    chunkMs: 100,
  },
});

console.log({
  elapsedMs: Date.now() - startedAt,
  finishReason: result.finishReason,
  timeout:
    timeoutReason instanceof Error
      ? { name: timeoutReason.name, message: timeoutReason.message }
      : timeoutReason,
});

if (
  !(timeoutReason instanceof Error) ||
  timeoutReason.name !== 'TimeoutError'
) {
  throw new Error('Expected the stalled model stream to time out.');
}
