import { ToolInvocationUIPart, UIMessage } from './types';

/**
 * Updates the result of a specific tool invocation in the last message of the given messages array.
 *
 * @param {object} params - The parameters object.
 * @param {UIMessage[]} params.messages - An array of messages, from which the last one is updated.
 * @param {string} params.toolCallId - The unique identifier for the tool invocation to update.
 * @param {unknown} params.toolResult - The result object to attach to the tool invocation.
 * @returns {void} This function does not return anything.
 */
export function updateToolCallResult({
  messages,
  toolCallId,
  toolResult: result,
}: {
  messages: UIMessage[];
  toolCallId: string;
  toolResult: unknown;
}) {
  const lastMessage = messages[messages.length - 1];

  const invocationPart = lastMessage.parts.find(
    (part): part is ToolInvocationUIPart =>
      part.type === 'tool-invocation' &&
      part.toolInvocation.toolCallId === toolCallId,
  );

  if (invocationPart == null) {
    return;
  }

  const toolResult = {
    ...invocationPart.toolInvocation,
    state: 'result' as const,
    result,
  };

  invocationPart.toolInvocation = toolResult;

  lastMessage.toolInvocations = lastMessage.toolInvocations?.map(
    toolInvocation =>
      toolInvocation.toolCallId === toolCallId ? toolResult : toolInvocation,
  );
}
