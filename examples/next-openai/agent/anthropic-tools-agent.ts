import { weatherTool } from '@/tool/weather-tool';
import { anthropic } from '@ai-sdk/anthropic';
import { InferAgentUIMessage, ToolLoopAgent } from 'ai';

export const anthropicToolsAgent = new ToolLoopAgent({
  model: anthropic('claude-haiku-4-5'),
  tools: {
    weather: weatherTool,
  },
});

export type AnthropicToolsAgentMessage = InferAgentUIMessage<
  typeof anthropicToolsAgent
>;
