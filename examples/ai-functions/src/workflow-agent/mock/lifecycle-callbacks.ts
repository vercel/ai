import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

const model = new MockLanguageModelV4({
  doStream: async () => {
    const streamParts: LanguageModelV4StreamPart[] = [
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello!' },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      },
    ];

    return { stream: convertArrayToReadableStream(streamParts) };
  },
});

run(async () => {
  const lifecycleEvents: string[] = [];
  const agent = new WorkflowAgent({
    model,
    onStart: ({ messages }) => {
      lifecycleEvents.push(`agent started with ${messages.length} message`);
    },
    onStepStart: ({ stepNumber }) => {
      lifecycleEvents.push(`agent step ${stepNumber} started`);
    },
  });

  await agent.stream({
    messages: [{ role: 'user', content: 'Say hello.' }],
    writable: new WritableStream<ModelCallStreamPart>(),
    onStart: () => {
      lifecycleEvents.push('stream started');
    },
    onStepStart: ({ stepNumber }) => {
      lifecycleEvents.push(`stream step ${stepNumber} started`);
    },
  });

  console.log(lifecycleEvents);
});
