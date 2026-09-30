import { bedrock, type BedrockProviderOptions } from '@ai-sdk/amazon-bedrock';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: bedrock('eu.anthropic.claude-sonnet-4-6'),
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
    providerOptions: {
      bedrock: {
        structuredOutputMode: 'jsonTool',
      } satisfies BedrockProviderOptions,
    },
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
