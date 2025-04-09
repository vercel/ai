import { generateText } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: new MockLanguageModelV2({
      doGenerate: async () => ({
        text: `Hello, world!`,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
      }),
    }),
    prompt: 'Hello, test!',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
