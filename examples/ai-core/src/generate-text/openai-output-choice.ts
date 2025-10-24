import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText, Output, stepCountIs } from 'ai';
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
    experimental_output: Output.choice({
      options: ['action', 'comedy', 'drama', 'horror', 'sci-fi'],
    }),
    prompt:
      'Classify the genre of this movie plot: ' +
      '"A group of astronauts travel through a wormhole in search of a ' +
      'new habitable planet for humanity."',
  });

  print('Output:', result.experimental_output);
  print('Request:', result.request.body);
});
