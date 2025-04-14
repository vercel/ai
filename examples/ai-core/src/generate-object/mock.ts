import { generateObject } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { object, usage } = await generateObject({
    model: new MockLanguageModelV2({
      defaultObjectGenerationMode: 'json',
      doGenerate: async () => ({
        text: { type: 'text', text: `{"content":"Hello, world!"}` },
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
    }),
    schema: z.object({ content: z.string() }),
    prompt: 'Hello, test!',
  });

  console.log(object);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
