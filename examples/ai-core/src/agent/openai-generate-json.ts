import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Output, ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  experimental_output: Output.object({
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({
            name: z.string(),
            amount: z.string(),
          }),
        ),
        steps: z.array(z.string()),
      }),
    }),
  }),
  providerOptions: {
    openai: {
      strictJsonSchema: true,
    } satisfies OpenAIResponsesProviderOptions,
  },
});

run(async () => {
  const { experimental_output: output } = await agent.generate({
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.dir(output, { depth: Infinity });
});
