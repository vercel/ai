import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITool,
  streamText,
  UIDataTypes,
  UIMessage,
} from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export type OpenAIWebSearchMessage = UIMessage<
  never,
  UIDataTypes,
  {
    web_search_preview: InferUITool<
      ReturnType<typeof openai.tools.webSearchPreview>
    >;
  }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai.responses('gpt-4o-mini'),
    tools: {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: 'high',
        userLocation: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'California',
          country: 'US',
        },
      }),
    },
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
