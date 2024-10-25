import { CoreAssistantMessage, CoreToolMessage } from '../prompt';
import { isMultipartToolResult } from '../prompt/multipart-tool-result';
import { CoreTool } from '../tool/tool';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';

/**
Converts the result of a `generateText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends Record<string, CoreTool>>({
  text = '',
  tools,
  toolCalls,
  toolResults,
}: {
  text: string | undefined;
  tools: TOOLS;
  toolCalls: ToolCallArray<TOOLS>;
  toolResults: ToolResultArray<TOOLS>;
}): Array<CoreAssistantMessage | CoreToolMessage> {
  const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> = [];

  responseMessages.push({
    role: 'assistant',
    content: [{ type: 'text', text }, ...toolCalls],
  });

  if (toolResults.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: toolResults.map(toolResult => {
        const tool = tools[toolResult.toolName];

        if (
          tool?.supportsMultipartResults === true &&
          isMultipartToolResult(toolResult.result)
        ) {
          return {
            type: 'tool-result',
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            result: toolResult.result,
            content: toolResult.result,
          };
        }

        return {
          type: 'tool-result',
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          result: toolResult.result,
          // no multipart content for legacy results
        };
      }),
    });
  }

  return responseMessages;
}
