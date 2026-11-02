import { alibaba } from '@ai-sdk/alibaba';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const output = Output.object({
  schema: z.object({
    city: z.string(),
    country: z.string(),
  }),
});

run(async () => {
  for (const modelId of ['qwen3.8-flash', 'deepseek-v4.1-flash'] as const) {
    const result = await generateText({
      model: alibaba(modelId),
      output,
      prompt: 'Give me the city and country that hosted the 2024 Olympics.',
    });

    console.log(modelId, result.output);
    console.log('Warnings:', result.warnings);
  }
});
