import { isToolUIPart, UIMessage } from './ui-messages';

export function shouldResubmitMessages({
  originalMaxToolInvocationStep,
  originalMessageCount,
  maxSteps,
  messages,
}: {
  originalMaxToolInvocationStep: number | undefined;
  originalMessageCount: number;
  maxSteps: number;
  messages: UIMessage[];
}) {
  const lastMessage = messages[messages.length - 1];

  // count the number of step-start parts in the last message:
  const lastMessageStepStartCount = lastMessage.parts.filter(
    part => part.type === 'step-start',
  ).length;

  return (
    // check if the feature is enabled:
    maxSteps > 1 &&
    // ensure there is a last message:
    lastMessage != null &&
    // ensure we actually have new steps (to prevent infinite loops in case of errors):
    (messages.length > originalMessageCount ||
      lastMessageStepStartCount !== originalMaxToolInvocationStep) &&
    // check that next step is possible:
    isAssistantMessageWithCompletedToolCalls(lastMessage) &&
    // limit the number of automatic steps:
    lastMessageStepStartCount < maxSteps
  );
}

/**
Check if the message is an assistant message with completed tool calls.
The last step of the message must have at least one tool invocation and
all tool invocations must have a result.
 */
export function isAssistantMessageWithCompletedToolCalls(
  message: UIMessage | undefined,
): message is UIMessage & {
  role: 'assistant';
} {
  if (!message) {
    return false;
  }

  if (message.role !== 'assistant') {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === 'step-start' ? index : lastIndex;
  }, -1);

  const lastStepToolInvocations = message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart);

  return (
    lastStepToolInvocations.length > 0 &&
    lastStepToolInvocations.every(part => part.state === 'output-available')
  );
}
