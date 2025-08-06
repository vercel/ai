import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITool,
  streamText,
  UIDataTypes,
  UIMessage,
} from 'ai';

export const maxDuration = 30;

export type OpenAIFileSearchMessage = UIMessage<
  never,
  UIDataTypes,
  {
    file_search: InferUITool<ReturnType<typeof openai.tools.fileSearch>>;
  }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai.responses('gpt-4o-mini'),
    tools: {
      file_search: openai.tools.fileSearch({
        maxNumResults: 10,
        ranking: {
          ranker: 'auto',
        },
        // vectorStoreIds: ['vs_123'], // optional: specify vector store IDs
        // filters: { key: 'category', type: 'eq', value: 'technical' }, // optional: filter results
      }),
    },
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
