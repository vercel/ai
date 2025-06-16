import { tool } from 'ai';
import { z } from 'zod';

const getWeatherInformation = tool({
  description: 'show the weather in a given city to the user',
  parameters: z.object({ city: z.string() }),
  // no execute function, we want human in the loop
});

const getLocalTime = tool({
  description: 'get the local time for a specified location',
  parameters: z.object({ location: z.string() }),
  // including execute function -> no confirmation required
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return '10am';
  },
});

export const tools = {
  getWeatherInformation,
  getLocalTime,
};
