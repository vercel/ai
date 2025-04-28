import {
  CreateMessage,
  FileUIPart,
  Message,
  ReasoningUIPart,
  SourceUIPart,
  StepStartUIPart,
  TextUIPart,
  ToolInvocationUIPart,
  UIMessage,
} from '../types';

export function getMessageParts(
  message: Message | CreateMessage | UIMessage,
): (
  | TextUIPart
  | ReasoningUIPart
  | ToolInvocationUIPart
  | SourceUIPart
  | FileUIPart
  | StepStartUIPart
)[] {
  return (
    message.parts ?? [
      ...(message.toolInvocations
        ? message.toolInvocations.map(toolInvocation => ({
            type: 'tool-invocation' as const,
            toolInvocation,
          }))
        : []),
      ...(message.content
        ? [{ type: 'text' as const, text: message.content }]
        : []),
    ]
  );
}
