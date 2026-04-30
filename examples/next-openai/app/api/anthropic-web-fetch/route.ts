import { anthropic } from '@ai-sdk/anthropic';
import {
  type InferUITools,
  type ToolSet,
  type UIDataTypes,
  type UIMessage,
  convertToModelMessages,
  streamText,
  validateUIMessages,
} from 'ai';

const tools = {
  web_fetch: anthropic.tools.webFetch_20250910(),
} satisfies ToolSet;

export type AnthropicWebFetchMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: anthropic('claude-sonnet-4-0'),
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
