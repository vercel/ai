import { generateObject } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

// Run with NODE_OPTIONS=--throw-deprecation to fail on deprecated usage, or
// NODE_OPTIONS=--no-deprecation to suppress it. No API credentials are needed.
run(async () => {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: '{"message":"Hello"}' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    },
  });

  for (let i = 0; i < 2; i++) {
    const result = await generateObject({
      model,
      schema: z.object({ message: z.string() }),
      prompt: 'Say hello.',
    });
    console.log(result.object);
  }
  // The default logger emits AISDK_DEP_GENERATE_OBJECT only once.
});
