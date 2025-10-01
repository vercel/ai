import { weatherToolWithApproval } from '@/tool/weather-tool-with-approval';
import { openai } from '@ai-sdk/openai';
import { Agent, InferAgentUIMessage } from 'ai';

export const weatherWithApprovalAgent = new Agent({
  model: openai('gpt-5-mini'),
  tools: {
    weather: weatherToolWithApproval,
  },
});

export type WeatherWithApprovalAgentUIMessage = InferAgentUIMessage<
  typeof weatherWithApprovalAgent
>;
