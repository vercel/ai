import { spacexai } from '@ai-sdk/spacexai';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
export const xaiWebSearchAgent = new ToolLoopAgent({
  model: spacexai.responses('grok-4-fast-reasoning'),
  tools: {
    web_search: spacexai.tools.webSearch({
      enableImageUnderstanding: true,
    }),
    x_search: spacexai.tools.xSearch({
      enableImageUnderstanding: true,
    }),
  },
  onStepStart: ({ messages }) => {
    console.log('Messages:', JSON.stringify(messages, null, 2));
  },
  onStepFinish: ({ response }) => {
    console.log('Response headers:', response.headers);
    console.log('Response body:', JSON.stringify(response.messages, null, 2));
  },
  providerOptions: {
    spacexai: {
      store: false, // enable ZDR - needs to be false for teams with ZDR enabled
      reasoningEffort: 'high',
      reasoningSummary: 'detailed',
    },
  },
});

export type SpaceXAIWebSearchMessage = InferAgentUIMessage<
  typeof xaiWebSearchAgent
>;
