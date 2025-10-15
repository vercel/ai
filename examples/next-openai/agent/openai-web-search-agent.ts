import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Agent, BasicAgent, InferAgentUIMessage, ToolSet } from 'ai';

const tools = {
  web_search: openai.tools.webSearch({
    searchContextSize: 'low',
    userLocation: {
      type: 'approximate',
      city: 'San Francisco',
      region: 'California',
      country: 'US',
    },
  }),
} satisfies ToolSet;

export const openaiWebSearchAgent: Agent<typeof tools> = new BasicAgent({
  model: openai('gpt-5-mini'),
  tools,
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
