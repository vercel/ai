import { weatherTool } from '@/tool/weather-tool';
import { openai } from '@ai-sdk/openai';
import type {
  Experimental_InferAgentUIMessage as InferAgentUIMessage} from 'ai';
import {
  Experimental_Agent as Agent,
  stepCountIs,
} from 'ai';

export const weatherAgent = new Agent({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  tools: {
    weather: weatherTool,
  },
  stopWhen: stepCountIs(10),
});

export type WeatherAgentUIMessage = InferAgentUIMessage<typeof weatherAgent>;
