import {
  Context,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { TypedToolCall } from './tool-call';

export async function isApprovalNeeded<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
  tool,
  toolCall,
  messages,
  context,
}: {
  tool: TOOLS[keyof TOOLS];
  toolCall: TypedToolCall<TOOLS>;
  messages: ModelMessage[];
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
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
