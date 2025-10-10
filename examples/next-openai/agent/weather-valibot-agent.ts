import { weatherToolValibot } from '@/tool/weather-tool-valibot';
import { anthropic } from '@ai-sdk/anthropic';
import { Agent, InferAgentUIMessage } from 'ai';

export const weatherValibotAgent = new Agent({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    weather: weatherToolValibot,
  },
  onStepFinish: ({ request }) => {
    console.log(JSON.stringify(request.body, null, 2));
  },
});

export type WeatherValibotAgentUIMessage = InferAgentUIMessage<
  typeof weatherValibotAgent
>;
