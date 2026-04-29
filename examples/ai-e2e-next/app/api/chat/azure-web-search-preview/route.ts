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
  web_search_preview: azure.tools.webSearchPreview({}),
} satisfies ToolSet;

export type AzureWebSearchPreviewMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages }: { messages: AzureWebSearchPreviewMessage[] } =
    await req.json();

  const result = streamText({
    model: azure.responses('gpt-4.1-mini'),
    messages: await convertToModelMessages(messages),
    tools: {
      web_search_preview: azure.tools.webSearchPreview({
        searchContextSize: 'low',
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
