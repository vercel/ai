import { createTool } from 'ai/function';
import { z } from 'zod';

export const weatherTool = createTool({
  name: 'weather',
  description: 'Get the weather in a location',
  parameters: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
    description:
      Math.random() < 0.33
        ? 'sunny'
        : Math.random() < 0.66
        ? 'cloudy'
        : 'raining',
  }),
});
