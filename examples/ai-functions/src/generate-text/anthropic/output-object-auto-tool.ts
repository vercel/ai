import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, isStepCount, Output } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    tools: {
      weather: weatherTool,
    },
    stopWhen: isStepCount(5),
    output: Output.object({
      schema: z.object({
        locations: z.array(
          z.object({
            location: z.string(),
            condition: z.string(),
            temperature: z.number(),
          }),
        ),
      }),
    }),
    prompt:
      'Check the weather in San Francisco and London. Use the weather tool for each city. When all tool work is complete, provide the final structured response.',
    providerOptions: {
      anthropic: {
        structuredOutputMode: 'autoTool',
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  print('Output:', result.output);
  print('Steps:', result.steps.length);
  print('Warnings:', result.warnings);
});
