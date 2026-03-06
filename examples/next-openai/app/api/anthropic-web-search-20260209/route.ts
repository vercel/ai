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
  web_search: anthropic.tools.webSearch_20260209({
    maxUses: 3,
    userLocation: {
      type: 'approximate',
      city: 'New York',
      country: 'US',
      timezone: 'America/New_York',
    },
  }),
} satisfies ToolSet;

export type AnthropicWebSearch20260209Message = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: anthropic('claude-sonnet-6'),
    tools,
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
