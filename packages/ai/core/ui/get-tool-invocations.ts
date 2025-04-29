import {
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from '../types/ui-messages';

export function getToolInvocations(message: UIMessage): ToolInvocation[] {
  return message.parts
    .filter(
      (part): part is ToolInvocationUIPart => part.type === 'tool-invocation',
    )
    .map(part => part.toolInvocation);
}
