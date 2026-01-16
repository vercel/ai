import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const openaiBasicAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  providerOptions: {
    openai: {
      reasoningEffort: 'medium',
      reasoningSummary: 'detailed',
      // store: false,
    } satisfies OpenAIResponsesProviderOptions,
  },
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
});

export type OpenAIBasicMessage = InferAgentUIMessage<typeof openaiBasicAgent>;
