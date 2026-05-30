import { azure } from '@ai-sdk/azure';
import {
  convertToModelMessages,
  streamText,
  type InferUITools,
  type ToolSet,
  type UIDataTypes,
  type UIMessage,
} from 'ai';
const tools = {
  web_search: azure.tools.webSearch({}),
} satisfies ToolSet;

export type AzureWebSearchMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages }: { messages: AzureWebSearchMessage[] } = await req.json();

  const result = streamText({
    model: azure.responses('gpt-4.1-mini'),
    messages: await convertToModelMessages(messages),
    tools: {
      web_search: azure.tools.webSearch({
        searchContextSize: 'low',
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
