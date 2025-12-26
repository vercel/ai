import { generateObject, JSONParseError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 20,
            text: 20,
            reasoning: undefined,
          },
        },
        warnings: [],
        finishReason: { raw: undefined, unified: 'tool-calls' },
        content: [
          { type: 'text', text: `{ "content": "provider metadata test"` },
        ],
      }),
    }),
    schema: z.object({ content: z.string() }),
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
