import { weatherToolWithApproval } from '@/tool/weather-tool-with-approval';
import { openai } from '@ai-sdk/openai';
import { Agent, InferAgentUIMessage } from 'ai';

export const weatherWithApprovalAgent = new Agent({
  model: openai('gpt-5-mini'),
  // context engineering required to make sure the model does not retry
  // the tool execution if it is not approved:
  system:
    'When a tool execution is not approved by the user, do not retry it.' +
    'Just say that the tool execution was not approved.',
  tools: {
    weather: weatherToolWithApproval,
  },
});

export type WeatherWithApprovalAgentUIMessage = InferAgentUIMessage<
  typeof weatherWithApprovalAgent
>;
