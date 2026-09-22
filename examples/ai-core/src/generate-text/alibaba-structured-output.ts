import { alibaba } from '@ai-sdk/alibaba';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  for (const modelId of ['qwen3.8-flash', 'deepseek-v4.1-flash'] as const) {
    const result = await generateText({
      model: alibaba(modelId),
      experimental_output: Output.object({
        schema: z.object({
          city: z.string(),
          country: z.string(),
        }),
      }),
      prompt: 'Give me the city and country that hosted the 2024 Olympics.',
    });

    console.log(modelId, result.experimental_output);
    console.log('Warnings:', result.warnings);
  }
}

main().catch(console.error);
