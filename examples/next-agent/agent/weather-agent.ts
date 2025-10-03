import { weatherTool } from '@/tool/weather-tool';
import { openai } from '@ai-sdk/openai';
import { Agent, InferAgentUIMessage } from 'ai';

export const weatherAgent = new Agent({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  tools: {
    weather: weatherTool,
  },
});

export type WeatherAgentUIMessage = InferAgentUIMessage<typeof weatherAgent>;
