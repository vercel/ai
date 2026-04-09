import { ModelMessage, ToolSet } from '@ai-sdk/provider-utils';
import { GenerationContext } from './generation-context';
import { TypedToolCall } from './tool-call';

export async function isApprovalNeeded<
  TOOLS extends ToolSet,
  CONTEXT extends GenerationContext<TOOLS>,
>({
  tool,
  toolCall,
  messages,
  context,
}: {
  tool: TOOLS[keyof TOOLS];
  toolCall: TypedToolCall<TOOLS>;
  messages: ModelMessage[];
  context: CONTEXT;
}) {
  if (tool.needsApproval == null) {
    return false;
  }

  if (typeof tool.needsApproval === 'boolean') {
    return tool.needsApproval;
  }

  return await tool.needsApproval(toolCall.input, {
    toolCallId: toolCall.toolCallId,
    messages,
    context,
  });
}
