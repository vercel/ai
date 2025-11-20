import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const openaiWebSearchAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  tools: {
    web_search: openai.tools.webSearch({
      searchContextSize: 'low',
      userLocation: {
        type: 'approximate',
        city: 'San Francisco',
        region: 'California',
        country: 'US',
      },
    }),
  },
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

export type OpenAIWebSearchMessage = InferAgentUIMessage<
  typeof openaiWebSearchAgent
>;
