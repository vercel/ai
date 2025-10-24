import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Output, ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';
import { print } from '../lib/print';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o-mini'),
  providerOptions: {
    openai: {
      strictJsonSchema: true,
    } satisfies OpenAIResponsesProviderOptions,
  },
  tools: {
    weather: weatherTool,
  },
  experimental_output: Output.array({
    element: z.object({
      location: z.string(),
      temperature: z.number(),
      condition: z.string(),
    }),
  }),
});

run(async () => {
  const { experimental_output: output } = await agent.generate({
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  print('Output:', output);
});
