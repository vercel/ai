import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, UIDataTypes, UIMessage } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export type SourcesChatMessage = UIMessage<
  never,
  UIDataTypes,
  {
    web_search: {
      input: { query: string };
      output: never;
    };
  }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    tools: {
      web_search: anthropic.tools.webSearch_20250305(),
    },
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
