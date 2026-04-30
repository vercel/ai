import { fetchPdfTool } from '@/tool/fetch-pdf-tool';
import { openai } from '@ai-sdk/openai';
import type {
  InferUITools,
  ToolSet,
  UIDataTypes,
  UIMessage} from 'ai';
import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
} from 'ai';

const tools = {
  fetchPdf: fetchPdfTool,
} satisfies ToolSet;

export type OpenAIFetchPDFMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: openai('gpt-5-nano'),
    tools,
    messages: convertToModelMessages(uiMessages, { tools }),
    onStepFinish: ({ request }) => {
      console.dir(request.body, { depth: 3 });
    },
  });

  return result.toUIMessageStreamResponse();
}
