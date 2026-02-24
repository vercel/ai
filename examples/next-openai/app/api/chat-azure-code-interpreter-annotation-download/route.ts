import { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { azure } from '@ai-sdk/azure';

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
  code_interpreter: azure.tools.codeInterpreter(),
} satisfies ToolSet;

export type AzureOpenAICodeInterpreterMessage = UIMessage<
  {
    downloadLinks?: Array<{
      filename: string;
      url: string;
    }>;
  },
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  // Collect sources with container file citations as they're generated
  const containerFileSources: Array<{
    containerId: string;
    fileId: string;
    filename: string;
  }> = [];

  const result = streamText({
    model: azure('gpt-5-mini'),
    tools,
    messages: await convertToModelMessages(uiMessages),
    onStepFinish: async ({ sources, request }) => {
      console.log(JSON.stringify(request.body, null, 2));

      // Collect container file citations from sources
      for (const source of sources) {
        if (
          source.sourceType === 'document' &&
          source.providerMetadata?.azure?.containerId &&
          source.providerMetadata?.azure?.fileId
        ) {
          const containerId = String(
            source.providerMetadata.azure.containerId || '',
          );
          const fileId = String(source.providerMetadata.azure.fileId || '');
          const filename = source.filename || source.title || 'file';

          // Avoid duplicates
          const exists = containerFileSources.some(
            s => s.containerId === containerId && s.fileId === fileId,
          );
          if (!exists) {
            containerFileSources.push({ containerId, fileId, filename });
          }
        }
      }
    },
    providerOptions: {
      openai: {
        store: true,
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    messageMetadata: ({ part }) => {
      // When streaming finishes, create download links from collected sources
      if (part.type === 'finish' && containerFileSources.length > 0) {
        const downloadLinks = containerFileSources.map(source => ({
          filename: source.filename,
          url: `/api/download-container-file/azure?container_id=${encodeURIComponent(source.containerId)}&file_id=${encodeURIComponent(source.fileId)}&filename=${encodeURIComponent(source.filename)}`,
        }));

        return {
          downloadLinks,
        };
      }
    },
  });
}
