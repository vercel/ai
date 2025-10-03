import { UIToolInvocation, tool } from 'ai';
import { z } from 'zod';

function randomWeather() {
  const weatherOptions = ['sunny', 'cloudy', 'rainy', 'windy'];
  return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
}

export const weatherToolWithApproval = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({ city: z.string() }),
  needsApproval: true,
  execute: () => ({ temperature: 72, weather: randomWeather() }),
});

export type WeatherUIToolWithApprovalInvocation = UIToolInvocation<
  typeof weatherToolWithApproval
>;
