import {
  CreateMessage,
  Message,
  ReasoningUIPart,
  TextUIPart,
  ToolInvocationUIPart,
  UIMessage,
} from './types';

export function getMessageParts(
  message: Message | CreateMessage | UIMessage,
): (TextUIPart | ReasoningUIPart | ToolInvocationUIPart)[] {
  return (
    message.parts ?? [
      ...(message.reasoning
        ? [{ type: 'reasoning' as const, reasoning: message.reasoning }]
        : []),
      ...(message.content
        ? [{ type: 'text' as const, text: message.content }]
        : []),
      ...(message.toolInvocations
        ? message.toolInvocations.map(toolInvocation => ({
            type: 'tool-invocation' as const,
            toolInvocation,
          }))
        : []),
    ]
  );
}
