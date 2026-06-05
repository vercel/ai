import { tool, type UIToolInvocation } from 'ai';
import { z } from 'zod';

function randomWeather() {
  const weatherOptions = ['sunny', 'cloudy', 'rainy', 'windy'];
  return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
}

/**
 * Host-executed weather tool forwarded to the underlying runtime as a
 * `HarnessV1ToolSpec`. The runtime calls `get_weather`, the agent runs this
 * `execute` on the host, and streams the result back. The generator yields a
 * preliminary `loading` state before the resolved reading so the UI can show
 * progress while the lookup is in flight.
 */
export const weatherTool = tool({
  description: 'Get the current weather for a city.',
  inputSchema: z.object({ city: z.string() }),
  async execute() {
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      state: 'ready',
      temperature: 72,
      weather: randomWeather(),
    };
  },
});

export type WeatherUIToolInvocation = UIToolInvocation<typeof weatherTool>;
