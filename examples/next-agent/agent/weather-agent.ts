import { weatherTool } from '@/tool/weather-tool';
import { openai } from '@ai-sdk/openai';
import { BasicAgent, InferAgentUIMessage } from 'ai';

export const weatherAgent = new BasicAgent({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  tools: {
    weather: weatherTool,
  },
});

export type WeatherAgentUIMessage = InferAgentUIMessage<typeof weatherAgent>;
