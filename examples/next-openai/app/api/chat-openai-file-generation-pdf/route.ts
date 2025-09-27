import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITools,
  streamText,
  ToolSet,
  UIDataTypes,
  UIMessage,
  validateUIMessages,
} from 'ai';
import { generatePdfTool } from '@/tool/generate-pdf-tool';

export const maxDuration = 30;

const tools = {
  file_search_pdf: generatePdfTool,
} satisfies ToolSet;

export type OpenAIFileGeneratePDFMessage = UIMessage<
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
    providerOptions: {
      openai: {
        include: ['file_search_call.results'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}


