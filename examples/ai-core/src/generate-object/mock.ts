import { generateObject } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { object, usage } = await generateObject({
    model: new MockLanguageModelV1({
      defaultObjectGenerationMode: 'json',
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        text: `{"content":"Hello, world!"}`,
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
