import assert from 'node:assert/strict';
import { Output, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const elementCount = 100;
  let validations = 0;

  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'output' },
          { type: 'text-delta', id: 'output', delta: '{"elements":[' },
          ...Array.from({ length: elementCount }, (_, index) => ({
            type: 'text-delta' as const,
            id: 'output',
            delta: `${index > 0 ? ',' : ''}${JSON.stringify({ value: index })}`,
          })),
          { type: 'text-delta', id: 'output', delta: ']}' },
          { type: 'text-end', id: 'output' },
          {
            type: 'finish',
            finishReason: { unified: 'stop' as const, raw: 'stop' },
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
        ]),
      }),
    }),
    output: Output.array({
      element: z.object({ value: z.number() }).superRefine(() => {
        validations++;
      }),
    }),
    prompt: 'Return 100 values.',
  });

  const elements = [];
  for await (const element of result.elementStream) {
    elements.push(element);
  }

  await result.output;

  assert.equal(elements.length, elementCount);
  assert.ok(validations <= elementCount * 3);

  console.log({
    elements: elements.length,
    validations,
  });
});
