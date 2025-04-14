import { generateText } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: new MockLanguageModelV2({
      doGenerate: async () => ({
        text: { type: 'text', text: `Hello, world!` },
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
    }),
    prompt: 'Hello, test!',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
