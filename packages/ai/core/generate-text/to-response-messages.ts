import { CoreAssistantMessage, CoreToolMessage } from '../prompt';
import { CoreTool } from '../tool/tool';
import { ToToolCallArray } from './tool-call';
import { ToToolResultArray } from './tool-result';

/**
Converts the result of a `generateText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends Record<string, CoreTool>>({
  text = '',
  toolCalls,
  toolResults,
}: {
  text: string | undefined;
  toolCalls: ToToolCallArray<TOOLS>;
  toolResults: ToToolResultArray<TOOLS>;
}): Array<CoreAssistantMessage | CoreToolMessage> {
  const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> = [];

  responseMessages.push({
    role: 'assistant',
    content: [{ type: 'text', text }, ...toolCalls],
  });

  if (toolResults.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: toolResults.map(result => ({
        type: 'tool-result',
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        result: result.result,
      })),
    });
  }

  return responseMessages;
}
