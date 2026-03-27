import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  InferUITools,
  streamText,
  ToolSet,
  UIDataTypes,
  UIMessage,
  validateUIMessages,
} from 'ai';

const tools = {
  web_fetch: anthropic.tools.webFetch_20260209(),
} satisfies ToolSet;

export type AnthropicWebFetch20260209Message = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    tools,
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
