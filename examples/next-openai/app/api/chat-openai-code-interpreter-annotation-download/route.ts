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

const tools = {
  code_interpreter: openai.tools.codeInterpreter(),
} satisfies ToolSet;

export type OpenAICodeInterpreterMessage = UIMessage<
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
    model: openai('gpt-5-nano'),
    tools,
    messages: await convertToModelMessages(uiMessages),
    onStepFinish: async ({ sources, request }) => {
      console.log(JSON.stringify(request.body, null, 2));

      // Collect container file citations from sources
      for (const source of sources) {
        if (
          source.sourceType === 'document' &&
          source.providerMetadata?.openai?.containerId &&
          source.providerMetadata?.openai?.fileId
        ) {
          const containerId = String(
            source.providerMetadata.openai.containerId || '',
          );
          const fileId = String(source.providerMetadata.openai.fileId || '');
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
          url: `/api/download-container-file?container_id=${encodeURIComponent(source.containerId)}&file_id=${encodeURIComponent(source.fileId)}&filename=${encodeURIComponent(source.filename)}`,
        }));

        return {
          downloadLinks,
        };
      }
    },
  });
}
