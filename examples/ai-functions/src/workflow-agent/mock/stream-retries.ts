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

// The first attempt fails after streaming partial text, the second succeeds.
let attempt = 0;
const model = new MockLanguageModelV4({
  doStream: async () => {
    attempt++;
    const streamParts: LanguageModelV4StreamPart[] =
      attempt === 1
        ? [
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'Hel' },
            {
              type: 'error',
              error: { message: 'Service temporarily unavailable' },
            },
            {
              type: 'finish',
              finishReason: { unified: 'error', raw: 'error' },
              usage,
            },
          ]
        : [
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
  const chunkTypes: string[] = [];
  const agent = new WorkflowAgent({ model });

  const result = await agent.stream({
    messages: [{ role: 'user', content: 'Say hello.' }],
    writable: new WritableStream<ModelCallStreamPart>({
      write(chunk) {
        chunkTypes.push(chunk.type);
      },
    }),
    streamRetries: 1,
    onError: ({ error }) => {
      console.log('stream error:', error);
    },
  });

  console.log('model calls:', attempt);
  console.log('text:', result.steps.at(-1)?.text);
  console.log('error:', result.error);
  console.log('chunks:', chunkTypes.join(', '));
});
