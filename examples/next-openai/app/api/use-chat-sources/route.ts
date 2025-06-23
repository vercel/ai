import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  InferUITool,
  streamText,
  UIDataTypes,
  UIMessage,
} from 'ai';

export type SourcesChatMessage = UIMessage<
  never,
  UIDataTypes,
  {
    web_search: InferUITool<
      ReturnType<typeof anthropic.tools.webSearch_20250305>
    >;
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
