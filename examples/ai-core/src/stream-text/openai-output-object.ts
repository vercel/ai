import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Output, stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const { experimental_partialOutputStream: partialOutputStream } = streamText({
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
    experimental_output: Output.object({
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

  for await (const partialOutput of partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
});
