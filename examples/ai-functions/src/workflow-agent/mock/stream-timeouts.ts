import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

// Sends one text delta and then goes quiet, like a provider stream that stalls.
const stalledModel = new MockLanguageModelV4({
  doStream: async ({ abortSignal }) => ({
    stream: new ReadableStream<LanguageModelV4StreamPart>({
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
            console.log('model call aborted:', abortSignal.reason);
            controller.error(abortSignal.reason);
          },
          { once: true },
        );
      },
    }),
  }),
});

run(async () => {
  const agent = new WorkflowAgent({ model: stalledModel });
  const startedAt = Date.now();

  const result = await agent.stream({
    prompt: 'Write a response.',
    timeout: {
      // limit for each model call
      stepMs: 5000,
      // limit for the first output of each model call
      firstChunkMs: 1000,
      // limit between two outputs
      chunkMs: 200,
    },
    onAbort: ({ steps }) => {
      console.log(`run aborted after ${steps.length} finished steps`);
    },
  });

  console.log({
    elapsedMs: Date.now() - startedAt,
    finishedSteps: result.steps.length,
  });
});
