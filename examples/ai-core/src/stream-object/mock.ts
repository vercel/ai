import { streamObject } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text', text: '{ ' },
          { type: 'text', text: '"content": ' },
          { type: 'text', text: `"Hello, ` },
          { type: 'text', text: `world` },
          { type: 'text', text: `!"` },
          { type: 'text', text: ' }' },
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
