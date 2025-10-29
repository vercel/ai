import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Output, stepCountIs, streamText } from 'ai';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = streamText({
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
    output: Output.choice({
      options: [
        'winter jacket',
        'shorts and tshirt',
        'light jacket',
        'raincoat',
      ],
    }),
    prompt: 'Get the weather for San Francisco. What should I wear?',
  });

  for await (const partialOutput of result.partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
});
