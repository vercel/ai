import { isToolUIPart, type UIMessage } from './ui-messages';
/**
 * Check if the last message is an assistant message with completed tool calls.
 * The last step of the message must have at least one tool invocation and
 * all tool invocations must have a result.
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

  // If the last step already contains a text part the model has finished its
  // turn and there is nothing to continue — return false to prevent useChat
  // from issuing a spurious continuation request.
  const hasTextInLastStep = lastStepParts.some(part => part.type === 'text');

  return (
    !hasTextInLastStep &&
    lastStepToolInvocations.length > 0 &&
    lastStepToolInvocations.every(
      part =>
        (part.state === 'output-available' && part.preliminary !== true) ||
        part.state === 'output-error',
    )
  );
}
