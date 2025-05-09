import { ToolResultPart } from '../prompt';
import { ReasoningPart } from '../prompt/content-part';
import { ContentPart } from './content-part';
import { GeneratedFile } from './generated-file';
import { ResponseMessage } from './step-result';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

/**
Converts the result of a `generateText` or `streamText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends ToolSet>({
  content: inputContent,
  tools,
  messageId,
  generateMessageId,
}: {
  content: Array<ContentPart<TOOLS>>;
  tools: TOOLS;
  messageId: string;
  generateMessageId: () => string;
}): Array<ResponseMessage> {
  const responseMessages: Array<ResponseMessage> = [];

  const files = inputContent
    .filter(part => part.type === 'file')
    .map(part => part.file);
  const reasoning = inputContent.filter(part => part.type === 'reasoning');
  const text = inputContent
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
  const toolCalls = inputContent.filter(part => part.type === 'tool-call');
  const toolResults = inputContent.filter(part => part.type === 'tool-result');

  const content = [];

  // TODO language model v2: switch to order response content (instead of type-based ordering)

  for (const part of reasoning) {
    content.push({
      type: 'reasoning' as const,
      text: part.text,
      providerOptions: part.providerMetadata,
    });
  }

  if (files.length > 0) {
    content.push(
      ...files.map(file => ({
        type: 'file' as const,
        data: file.base64,
        mediaType: file.mediaType,
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
