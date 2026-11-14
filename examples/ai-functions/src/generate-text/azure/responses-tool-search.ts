import { azure } from '@ai-sdk/azure';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: azure('gpt-6.1-sol'),
    prompt: 'What is the weather in San Francisco?',
    stopWhen: isStepCount(5),
    tools: {
      toolSearch: azure.tools.toolSearch(),
      get_weather: tool({
        description: 'Get the current weather at a specific location',
        inputSchema: z.object({
          location: z.string().describe('The city, e.g. San Francisco'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 64,
          condition: 'Partly cloudy',
        }),
        providerOptions: {
          azure: { deferLoading: true },
        },
      }),
    },
  });

  for (const step of result.steps) {
    console.log(
      step.content
        .map(part =>
          'toolName' in part ? `${part.type}:${part.toolName}` : part.type,
        )
        .join(', '),
    );
  }
  console.log(result.text);
});
