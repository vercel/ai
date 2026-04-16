import { xai } from '@ai-sdk/xai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const xaiWebSearchAgent = new ToolLoopAgent({
  model: xai.responses('grok-4-fast-reasoning'),
  tools: {
    web_search: xai.tools.webSearch({
      enableImageUnderstanding: true,
    }),
    x_search: xai.tools.xSearch({
      enableImageUnderstanding: true,
    }),
  },
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
  providerOptions: {
    xai: {
      store: false, // enable ZDR - needs to be false for teams with ZDR enabled
      reasoningEffort: 'high',
      reasoningSummary: 'detailed',
    },
  },
});

export type XaiWebSearchMessage = InferAgentUIMessage<typeof xaiWebSearchAgent>;
