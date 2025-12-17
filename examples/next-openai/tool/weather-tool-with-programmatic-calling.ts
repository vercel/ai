import { tool } from 'ai';
import { z } from 'zod';

function randomWeather() {
  const weatherOptions = ['sunny', 'cloudy', 'rainy', 'windy'];
  return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
}

export const weatherToolWithProgrammaticCalling = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({ city: z.string() }),
  providerOptions: {
    anthropic: {
      allowedCallers: ['code_execution_20250825'],
    },
  },
  execute: async () => ({
    temperature: 72,
    weather: randomWeather(),
  }),
});
