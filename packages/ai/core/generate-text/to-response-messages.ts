import { ToolResultPart } from '../prompt';
import { GeneratedFile } from './generated-file';
import { ReasoningDetail } from './reasoning-detail';
import { ResponseMessage } from './step-result';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

/**
Converts the result of a `generateText` or `streamText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends ToolSet>({
  text = '',
  files,
  reasoning,
  tools,
  toolCalls,
  toolResults,
  messageId,
  generateMessageId,
}: {
  text: string | undefined;
  files: Array<GeneratedFile>;
  reasoning: Array<ReasoningDetail>;
  tools: TOOLS;
  toolCalls: ToolCallArray<TOOLS>;
  toolResults: ToolResultArray<TOOLS>;
  messageId: string;
  generateMessageId: () => string;
}): Array<ResponseMessage> {
  const responseMessages: Array<ResponseMessage> = [];

  const content = [];

  // TODO language model v2: switch to order response content (instead of type-based ordering)

  if (reasoning.length > 0) {
    content.push(
      ...reasoning.map(part =>
        part.type === 'text'
          ? { ...part, type: 'reasoning' as const }
          : { ...part, type: 'redacted-reasoning' as const },
      ),
    );
  }

  if (files.length > 0) {
    content.push(
      ...files.map(file => ({
        type: 'file' as const,
        data: file.base64,
        mimeType: file.mimeType,
      })),
    );
  }

  if (text.length > 0) {
    content.push({ type: 'text' as const, text });
  }

  if (toolCalls.length > 0) {
    content.push(...toolCalls);
  }

  if (content.length > 0) {
    responseMessages.push({
      role: 'assistant',
      content,
      id: messageId,
    });
  }

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
