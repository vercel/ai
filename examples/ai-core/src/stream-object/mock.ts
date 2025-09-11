import { streamObject } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: '{ ' },
          { type: 'text-delta', id: '0', delta: '"content": ' },
          { type: 'text-delta', id: '0', delta: `"Hello, ` },
          { type: 'text-delta', id: '0', delta: `world` },
          { type: 'text-delta', id: '0', delta: `!"` },
          { type: 'text-delta', id: '0', delta: ' }' },
          { type: 'text-end', id: '0' },
          {
            type: 'finish',
            finishReason: 'stop',
            logprobs: undefined,
            usage: {
              inputTokens: 3,
              outputTokens: 10,
              totalTokens: 13,
            },
          },
        ]),
      }),
    }),
    schema: z.object({ content: z.string() }),
    prompt: 'Hello, test!',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
}

main().catch(console.error);
