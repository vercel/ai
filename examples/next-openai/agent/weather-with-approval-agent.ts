import { weatherToolWithApproval } from '@/tool/weather-tool-with-approval';
import { anthropic } from '@ai-sdk/anthropic';
import { Agent, InferAgentUIMessage } from 'ai';

export const weatherWithApprovalAgent = new Agent({
  model: anthropic('claude-sonnet-4-5'),
  // context engineering required to make sure the model does not retry
  // the tool execution if it is not approved:
  system:
    'When a tool execution is not approved by the user, do not retry it.' +
    'Just say that the tool execution was not approved.',
  tools: {
    weather: weatherToolWithApproval,
  },
  onStepFinish: ({ request }) => {
    console.log(JSON.stringify(request.body, null, 2));
  },
});

export type WeatherWithApprovalAgentUIMessage = InferAgentUIMessage<
  typeof weatherWithApprovalAgent
>;
