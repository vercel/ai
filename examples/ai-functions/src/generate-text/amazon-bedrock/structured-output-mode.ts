import {
  bedrock,
  type AmazonBedrockLanguageModelOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: bedrock('eu.anthropic.claude-sonnet-4-6'),
    output: Output.object({
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(z.string()),
          steps: z.array(z.string()),
        }),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
    providerOptions: {
      bedrock: {
        structuredOutputMode: 'jsonTool',
      } satisfies AmazonBedrockLanguageModelOptions,
    },
  });

  console.log(JSON.stringify(result.output, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
