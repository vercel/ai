import { streamObject } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: new MockLanguageModelV3({
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
            finishReason: { raw: undefined, unified: 'stop' },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 3,
                noCache: 3,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 10,
                text: 10,
                reasoning: undefined,
              },
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
