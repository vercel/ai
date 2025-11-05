import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITools,
  streamText,
  tool,
  ToolSet,
  UIDataTypes,
  UIMessage,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

const tools = {
  web_search_preview: tool({
    description: 'Search the web for information',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
    }),
    execute: async (): Promise<{ results: string[] }> => {
      throw new Error('Tool execution failed');
    },
  }),
} satisfies ToolSet;

// const tools = {
//   web_search_preview: openai.tools.webSearch({}) as ToolSet[string],
// } satisfies ToolSet;

export type OpenAIInvalidToolcallReasoningMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: openai('gpt-5'),
    tools,
    messages: convertToModelMessages(uiMessages),
    providerOptions: {
      openai: {
        reasoningEffort: 'medium',
      } satisfies OpenAIResponsesProviderOptions,
    },
    onError: (error) => {
      console.error('============ ERROR IN API ROUTE ==========================');
      console.error('Error:', error);
      console.error('================ STATE OF MESSAGES ==========================');
      console.dir(uiMessages, { depth: null });
      console.error('============ HERE FINISHES THE ERROR ==========================');
    },
    onFinish: ( event ) => {
      console.log('Request body:', JSON.stringify(event.request.body, null, 2));
      console.log("Messages body: ", JSON.stringify(uiMessages, null, 2))
    },
  });

  
  
  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}

