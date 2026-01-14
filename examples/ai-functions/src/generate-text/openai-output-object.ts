import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    providerOptions: {
      openai: {
        strictJsonSchema: true,
      } satisfies OpenAIResponsesProviderOptions,
    },
    tools: {
      weather: weatherTool,
    },
    stopWhen: stepCountIs(5),
    output: Output.object({
      schema: z.object({
        elements: z.array(
          z.object({
            location: z.string(),
            temperature: z.number(),
            condition: z.string(),
          }),
        ),
      }),
    }),
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  print('Output:', result.output);
  print('Request:', result.request.body);
});
