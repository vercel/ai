import {
  AssistantContent,
  AssistantModelMessage,
  ToolContent,
  ToolModelMessage,
} from '../prompt';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
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
  tools: TOOLS | undefined;
}): Array<AssistantModelMessage | ToolModelMessage> {
  const responseMessages: Array<AssistantModelMessage | ToolModelMessage> = [];

  const content: AssistantContent = inputContent
    .filter(part => part.type !== 'source')
    .filter(
      part =>
        (part.type !== 'tool-result' || part.providerExecuted) &&
        (part.type !== 'tool-error' || part.providerExecuted),
    )
    .filter(part => part.type !== 'text' || part.text.length > 0)
    .map(part => {
      switch (part.type) {
        case 'text':
          return {
            type: 'text',
            text: part.text,
            providerOptions: part.providerMetadata,
          };
        case 'reasoning':
          return {
            type: 'reasoning',
            text: part.text,
            providerOptions: part.providerMetadata,
          };
        case 'file':
          return {
            type: 'file',
            data: part.file.base64,
            mediaType: part.file.mediaType,
            providerOptions: part.providerMetadata,
          };
        case 'tool-call':
          return {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            providerExecuted: part.providerExecuted,
            providerOptions: part.providerMetadata,
          };
        case 'tool-result':
          return {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: createToolModelOutput({
              tool: tools?.[part.toolName],
              output: part.output,
              errorMode: 'none',
            }),
            providerExecuted: true,
            providerOptions: part.providerMetadata,
          };
        case 'tool-error':
          return {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: createToolModelOutput({
              tool: tools?.[part.toolName],
              output: part.error,
              errorMode: 'json',
            }),
            providerOptions: part.providerMetadata,
          };
      }
    });

  if (content.length > 0) {
    responseMessages.push({
      role: 'assistant',
      content,
    });
  }

  const toolResultContent: ToolContent = inputContent
    .filter(part => part.type === 'tool-result' || part.type === 'tool-error')
    .filter(part => !part.providerExecuted)
    .map(toolResult => ({
      type: 'tool-result',
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: createToolModelOutput({
        tool: tools?.[toolResult.toolName],
        output:
          toolResult.type === 'tool-result'
            ? toolResult.output
            : toolResult.error,
        errorMode: toolResult.type === 'tool-error' ? 'text' : 'none',
      }),
    }));

  if (toolResultContent.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: toolResultContent,
    });
  }

  return responseMessages;
}
