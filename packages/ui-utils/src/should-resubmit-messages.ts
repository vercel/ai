import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { UIMessage } from './types';

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
  return (
    // check if the feature is enabled:
    maxSteps > 1 &&
    // ensure there is a last message:
    lastMessage != null &&
    // ensure we actually have new steps (to prevent infinite loops in case of errors):
    (messages.length > originalMessageCount ||
      extractMaxToolInvocationStep(lastMessage.toolInvocations) !==
        originalMaxToolInvocationStep) &&
    // check that next step is possible:
    isAssistantMessageWithCompletedToolCalls(lastMessage) &&
    // check that assistant has not answered yet:
    !isLastToolInvocationFollowedByText(lastMessage) &&
    // limit the number of automatic steps:
    (extractMaxToolInvocationStep(lastMessage.toolInvocations) ?? 0) < maxSteps
  );
}

function isLastToolInvocationFollowedByText(message: UIMessage) {
  let isLastToolInvocationFollowedByText = false;

  message.parts.forEach(part => {
    if (part.type === 'text') {
      isLastToolInvocationFollowedByText = true;
    }
    if (part.type === 'tool-invocation') {
      isLastToolInvocationFollowedByText = false;
    }
  });
  return isLastToolInvocationFollowedByText;
}

/**
Check if the message is an assistant message with completed tool calls.
The message must have at least one tool invocation and all tool invocations
must have a result.
 */
export function isAssistantMessageWithCompletedToolCalls(
  message: UIMessage,
): message is UIMessage & {
  role: 'assistant';
} {
  return (
    message.role === 'assistant' &&
    message.parts
      .filter(part => part.type === 'tool-invocation')
      .every(part => 'result' in part.toolInvocation)
  );
}
