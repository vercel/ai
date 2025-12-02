import { weatherTool } from '@/tool/weather-tool';
import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { InferAgentUIMessage, ToolLoopAgent } from 'ai';

export const deepseekToolsAgent = new ToolLoopAgent({
  model: deepseek('deepseek-reasoner'),
  tools: { weather: weatherTool },
  providerOptions: {
    deepseek: {
      thinking: { type: 'enabled' },
    } satisfies DeepSeekChatOptions,
  },
});

export type DeepSeekToolsAgentMessage = InferAgentUIMessage<
  typeof deepseekToolsAgent
>;
