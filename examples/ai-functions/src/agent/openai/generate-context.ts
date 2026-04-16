import { openai } from '@ai-sdk/openai';
import { tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const agent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      inputSchema: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      contextSchema: z.object({
        apiKey: z.string().describe('The API key for the weather API'),
      }),
      execute: async ({ location }, { context: { apiKey } }) => {
        console.log('weather tool api key:', apiKey);

        return {
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        };
      },
    }),
  },
  toolsContext: {
    weather: { apiKey: 'weather-123' },
  },
  context: {
    somethingElse: 'other-context',
  },
  prepareStep: async ({ context, toolsContext }) => {
    console.log('prepareStep toolsContext:', toolsContext);
    console.log('prepareStep context:', context);
    return {};
  },
  instructions: 'You are a helpful assistant.',
});

run(async () => {
  const result = await agent.generate({
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(result.text);
});
