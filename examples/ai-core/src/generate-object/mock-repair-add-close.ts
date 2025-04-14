import { generateObject, JSONParseError } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: new MockLanguageModelV2({
      doGenerate: async () => ({
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'tool-calls',
        text: { type: 'text', text: `{ "content": "provider metadata test"` },
      }),
    }),
    schema: z.object({ content: z.string() }),
    mode: 'json',
    prompt: 'What are the tourist attractions in San Francisco?',
    experimental_repairText: async ({ text, error }) => {
      if (error instanceof JSONParseError) {
        return text + '}';
      }
      return null;
    },
  });

  console.log('Object after repair:');
  console.log(result.object);
}

main().catch(console.error);
