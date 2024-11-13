import { streamObject } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV1 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: new MockLanguageModelV1({
      defaultObjectGenerationMode: 'json',
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-delta', textDelta: '{ ' },
          { type: 'text-delta', textDelta: '"content": ' },
          { type: 'text-delta', textDelta: `"Hello, ` },
          { type: 'text-delta', textDelta: `world` },
          { type: 'text-delta', textDelta: `!"` },
          { type: 'text-delta', textDelta: ' }' },
          {
            type: 'finish',
            finishReason: 'stop',
            logprobs: undefined,
            usage: { completionTokens: 10, promptTokens: 3 },
          },
        ]),
        rawCall: { rawPrompt: null, rawSettings: {} },
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
