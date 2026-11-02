import { weatherTool } from '@/tool/weather-tool';
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';

export const openaiSteeringAgent = new ToolLoopAgent({
  model: openai('gpt-6.1-sol'),
  tools: { weather: weatherTool },
});

export type OpenAISteeringMessage = InferAgentUIMessage<
  typeof openaiSteeringAgent
>;
