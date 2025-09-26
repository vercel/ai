import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: openai('gpt-5'),
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
    prompt: 'Generate a lasagna recipe.',
    providerOptions: {
      openai: {
        strictJsonSchema: true,
        reasoningSummary: 'detailed',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log(result.reasoning);
  console.log(JSON.stringify(result.object.recipe, null, 2));
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
