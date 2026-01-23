import {
  openai,
  createOpenAI,
  OpenAIResponsesProviderOptions,
} from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

const customProvider = createOpenAI({
  name: 'my-custom-openai',
  apiKey: process.env.OPENAI_API_KEY,
});

export const openaiBasicAgent = new ToolLoopAgent({
  model: customProvider('gpt-5.1'),
  providerOptions: {
    'my-custom-openai': {
      reasoningEffort: 'high',
      reasoningSummary: 'detailed',
      // store: false,
    } satisfies OpenAIResponsesProviderOptions,
  },
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
});

export type OpenAIBasicMessage = InferAgentUIMessage<typeof openaiBasicAgent>;
