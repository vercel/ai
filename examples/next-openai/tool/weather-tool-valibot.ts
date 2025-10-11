import { UIToolInvocation, tool } from 'ai';
import * as v from 'valibot';

function randomWeather() {
  const weatherOptions = ['sunny', 'cloudy', 'rainy', 'windy'];
  return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
}

export const weatherToolValibot = tool({
  description: 'Get the weather in a location',
  inputSchema: v.object({ city: v.string() }),
  async *execute() {
    yield { state: 'loading' as const };

    // Add artificial delay of 5 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    yield {
      state: 'ready' as const,
      temperature: 72,
      weather: randomWeather(),
    };
  },
});

export type WeatherUIToolValibotInvocation = UIToolInvocation<
  typeof weatherToolValibot
>;
