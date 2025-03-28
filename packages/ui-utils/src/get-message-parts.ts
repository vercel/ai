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
} from './types';

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
      ...(message.reasoning
        ? [
            {
              type: 'reasoning' as const,
              reasoning: message.reasoning,
              details: [{ type: 'text' as const, text: message.reasoning }],
            },
          ]
        : []),
      ...(message.content
        ? [{ type: 'text' as const, text: message.content }]
        : []),
    ]
  );
}
