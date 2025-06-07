import { ToolSet } from '../../core';
import { ToolInvocation, ToolInvocationUIPart, UIMessage } from './ui-messages';

export function getToolInvocations<TOOLS extends ToolSet>(
  message: UIMessage<any, any, TOOLS>,
): ToolInvocation<TOOLS>[] {
  return message.parts
    .filter(
      (part): part is ToolInvocationUIPart<TOOLS> =>
        part.type === 'tool-invocation',
    )
    .map(part => part.toolInvocation);
}
