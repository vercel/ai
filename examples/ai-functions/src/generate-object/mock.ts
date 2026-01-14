import { generateObject } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const { object, usage } = await generateObject({
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: `{"content":"Hello, world!"}` }],
        finishReason: { raw: undefined, unified: 'stop' },
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
      }),
    }),
    schema: z.object({ content: z.string() }),
    prompt: 'Hello, test!',
  });

  console.log(object);
  console.log();
  console.log('Usage:', usage);
});
