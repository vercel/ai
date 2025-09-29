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
  file_search: openai.tools.fileSearch({
    vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
  }),
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
        instructions:
          "First call the file_search_pdf tool to produce a PDF using the default base64 input. Then use the file_search tool to search that PDF and answer the user's question using citations.",
        include: ['file_search_call.results'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
