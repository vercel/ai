import {
  AssistantContent,
  AssistantModelMessage,
  ToolContent,
  ToolModelMessage,
  ToolResultPart,
} from '../prompt';
import { ContentPart } from './content-part';
import { ToolSet } from './tool-set';

/**
Converts the result of a `generateText` or `streamText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends ToolSet>({
  content: inputContent,
  tools,
}: {
  content: Array<ContentPart<TOOLS>>;
  tools: TOOLS;
}): Array<AssistantModelMessage | ToolModelMessage> {
  const responseMessages: Array<AssistantModelMessage | ToolModelMessage> = [];

  const content: AssistantContent = inputContent
    .filter(part => part.type !== 'tool-result' && part.type !== 'source')
    .filter(part => part.type !== 'text' || part.text.length > 0)
    .map(part => {
      switch (part.type) {
        case 'text':
          return part;
        case 'reasoning':
          return {
            type: 'reasoning' as const,
            text: part.text,
            providerOptions: part.providerMetadata,
          };
        case 'file':
          return {
            type: 'file' as const,
            data: part.file.base64,
            mediaType: part.file.mediaType,
          };
        case 'tool-call':
          return part;
      }
    });

  if (content.length > 0) {
    responseMessages.push({
      role: 'assistant',
      content,
    });
  }

  const toolResultContent: ToolContent = inputContent
    .filter(part => part.type === 'tool-result')
    .map((toolResult): ToolResultPart => {
      const tool = tools[toolResult.toolName];
      return tool?.experimental_toToolResultContent != null
        ? {
            type: 'tool-result',
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            output: tool.experimental_toToolResultContent(toolResult.output),
            experimental_content: tool.experimental_toToolResultContent(
              toolResult.output,
            ),
          }
        : {
            type: 'tool-result',
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            output: toolResult.output,
          };
    });

  if (toolResultContent.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: toolResultContent,
    });
  }

  return responseMessages;
}
