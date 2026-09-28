import { isToolUIPart, type UIMessage } from './ui-messages';
/**
 * Check if the last message is an assistant message with completed tool calls.
 * The last step of the message must have at least one tool invocation and
 * all tool invocations must have a result. A text part after the last tool
 * invocation indicates that the assistant already continued the response.
 */
export function lastAssistantMessageIsCompleteWithToolCalls({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  const message = messages[messages.length - 1];

  if (!message) {
    return false;
  }

  if (message.role !== 'assistant') {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === 'step-start' ? index : lastIndex;
  }, -1);

  const lastStepParts = message.parts.slice(lastStepStartIndex + 1);

  const lastStepToolInvocations = lastStepParts
    .filter(isToolUIPart)
    .filter(part => !part.providerExecuted);

  const lastToolInvocationIndex = lastStepParts.reduce(
    (lastIndex, part, index) =>
      isToolUIPart(part) && !part.providerExecuted ? index : lastIndex,
    -1,
  );

  return (
    lastStepToolInvocations.length > 0 &&
    !lastStepParts
      .slice(lastToolInvocationIndex + 1)
      .some(part => part.type === 'text') &&
    lastStepToolInvocations.every(
      part =>
        (part.state === 'output-available' && part.preliminary !== true) ||
        part.state === 'output-error',
    )
  );
}
