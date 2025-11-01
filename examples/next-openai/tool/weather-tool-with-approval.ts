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
  async *execute() {
    yield { state: 'loading' as const };

    // Add randomized delay of 1 and 5 seconds (to mix up tool result ordering)
    await new Promise(resolve =>
      setTimeout(resolve, 1000 + Math.floor(Math.random() * 4000)),
    );

    yield {
      state: 'ready' as const,
      temperature: 72,
      weather: randomWeather(),
    };
  },
});

export type WeatherUIToolWithApprovalInvocation = UIToolInvocation<
  typeof weatherToolWithApproval
>;
