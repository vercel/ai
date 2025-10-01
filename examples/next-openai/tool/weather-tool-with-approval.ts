import { UIToolInvocation, tool } from 'ai';
import { z } from 'zod';

export const weatherToolWithApproval = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({ city: z.string() }),
  needsApproval: true,
  async execute({ city }: { city: string }) {
    const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
    const weather =
      weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

    return {
      temperature: 72,
      weather,
    };
  },
});

export type WeatherUIToolWithApprovalInvocation = UIToolInvocation<
  typeof weatherToolWithApproval
>;
