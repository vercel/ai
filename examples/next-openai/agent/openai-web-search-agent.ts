import {
  Experimental_Agent as Agent,
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';

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
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
});

export type OpenAIWebSearchMessage = InferAgentUIMessage<
  typeof openaiWebSearchAgent
>;
