import { streamText, type TextStreamPart, type ToolSet } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import { run } from '../lib/run';

// Run with Node 24.22+: pnpm tsx src/reproduction/stop-stream-buffered-chunks.ts
// Before the fix, a text-delta and an error appear after the finish event.
run(async () => {
  const usage = { inputTokens: 3, outputTokens: 2, totalTokens: 5 };
  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello, ' },
          { type: 'text-delta', id: '1', delta: 'STOP' },
          { type: 'text-delta', id: '1', delta: ' World' },
          { type: 'text-end', id: '1' },
          { type: 'finish', finishReason: 'stop', usage },
        ]),
      },
    }),
    prompt: 'test-input',
    experimental_transform: ({ stopStream }) =>
      new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
        transform(chunk, controller) {
          if (chunk.type === 'text-delta' && chunk.text.includes('STOP')) {
            stopStream();
            controller.enqueue({
              type: 'finish-step',
              finishReason: 'stop',
              providerMetadata: undefined,
              usage,
              response: {
                id: 'response-id',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
            });
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              totalUsage: usage,
            });
            return;
          }
          controller.enqueue(chunk);
        },
      }),
  });

  for await (const part of result.fullStream) {
    console.log(part);
  }
});
