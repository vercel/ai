<<<<<<< HEAD
import { openai } from '@ai-sdk/openai';
import {
  Experimental_Agent as Agent,
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
} from 'ai';
=======
import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Agent, InferAgentUIMessage } from 'ai';
>>>>>>> c2844e03f (chore(examples/next-openai): ai-elements, update web search example (#9423))

export const openaiWebSearchAgent = new Agent({
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
