import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('moonshot-v1-auto'),
    output: Output.object({
      schema: z.object({
        holiday: z.string(),
        traditions: z.array(z.string()),
      }),
    }),
    providerOptions: {
      moonshotai: {
        strictJsonSchema: true,
      } satisfies MoonshotAILanguageModelOptions,
    },
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(JSON.stringify(result.output, null, 2));
});
