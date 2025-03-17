import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import { ToolResultPart } from '../prompt';
import { detectImageMimeType } from '../util/detect-image-mimetype';
import { ReasoningDetail } from './reasoning-detail';
import { ResponseMessage } from './step-result';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

/**
Converts the result of a `generateText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends ToolSet>({
  text = '',
  images,
  reasoning,
  tools,
  toolCalls,
  toolResults,
  messageId,
  generateMessageId,
}: {
  text: string | undefined;
  images: Array<string | Uint8Array>;
  reasoning: Array<ReasoningDetail>;
  tools: TOOLS;
  toolCalls: ToolCallArray<TOOLS>;
  toolResults: ToolResultArray<TOOLS>;
  messageId: string;
  generateMessageId: () => string;
}): Array<ResponseMessage> {
  const responseMessages: Array<ResponseMessage> = [];

  responseMessages.push({
    role: 'assistant',
    content: [
      ...reasoning.map(part =>
        part.type === 'text'
          ? { ...part, type: 'reasoning' as const }
          : { ...part, type: 'redacted-reasoning' as const },
      ),
      // TODO language model v2: switch to order response content (instead of type-based ordering)
      ...images.map(image => ({
        type: 'file' as const,
        data: image,
        mimeType:
          detectImageMimeType(
            image instanceof Uint8Array
              ? image
              : convertBase64ToUint8Array(image),
          ) ?? 'image/png', // TODO throw error if mime type is not supported?
      })),
      { type: 'text' as const, text },
      ...toolCalls,
    ],
    id: messageId,
  });

  if (toolResults.length > 0) {
    responseMessages.push({
      role: 'tool',
      id: generateMessageId(),
      content: toolResults.map((toolResult): ToolResultPart => {
        const tool = tools[toolResult.toolName];
        return tool?.experimental_toToolResultContent != null
          ? {
              type: 'tool-result',
              toolCallId: toolResult.toolCallId,
              toolName: toolResult.toolName,
              result: tool.experimental_toToolResultContent(toolResult.result),
              experimental_content: tool.experimental_toToolResultContent(
                toolResult.result,
              ),
            }
          : {
              type: 'tool-result',
              toolCallId: toolResult.toolCallId,
              toolName: toolResult.toolName,
              result: toolResult.result,
            };
      }),
    });
  }

  return responseMessages;
}
