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
  web_search: anthropic.tools.webSearch_20250305({
    maxUses: 3,
    userLocation: {
      type: 'approximate',
      city: 'New York',
      country: 'US',
      timezone: 'America/New_York',
    },
  }),
} satisfies ToolSet;

export type AnthropicWebSearchMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    tools,
    messages: convertToModelMessages(uiMessages),
    onStepFinish: ({ request }) => {
      console.log(JSON.stringify(request.body, null, 2));
    },
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
