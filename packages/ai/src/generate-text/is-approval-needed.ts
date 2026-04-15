import {
  Context,
  InferToolSetContext,
  ModelMessage,
  ToolNeedsApprovalFunction,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { TypedToolCall } from './tool-call';

/**
 * Resolves whether a tool call requires approval by checking user-supplied
 * approval settings first and then falling back to the tool definition.
 */
export async function isApprovalNeeded<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
  tool,
  toolCall,
  toolNeedsApproval,
  messages,
  context,
}: {
  /**
   * Tool (which can have a tool-defined needsApproval function).
   */
  tool: TOOLS[keyof TOOLS];

  /**
   * Potentially user-defined tool needs approval function.
   */
  toolNeedsApproval:
    | undefined
    | boolean
    | ToolNeedsApprovalFunction<
        NoInfer<TOOLS[keyof TOOLS]['inputSchema']>,
        InferToolSetContext<TOOLS> & USER_CONTEXT
      >;

  toolCall: TypedToolCall<TOOLS>;
  messages: ModelMessage[];
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
}) {
  const input = toolCall.input as NoInfer<TOOLS[keyof TOOLS]['inputSchema']>;
  const options = { toolCallId: toolCall.toolCallId, messages, context };

  // user-defined tool needs approval function
  if (toolNeedsApproval != null) {
    return typeof toolNeedsApproval === 'boolean'
      ? toolNeedsApproval
      : await toolNeedsApproval(input, options);
  }

  // tool-defined needs approval function
  return tool.needsApproval == null
    ? false
    : typeof tool.needsApproval === 'boolean'
      ? tool.needsApproval
      : await tool.needsApproval(input, options);
}
