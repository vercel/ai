import {
  Context,
  InferToolSetContext,
  ModelMessage,
  ToolNeedsApprovalFunction,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { TypedToolCall } from './tool-call';

/**
 * Resolves whether a tool call requires approval by checking user-supplied and tool-defined
 * approval settings. User-defined approval settings take precedence over tool-defined settings.
 * If no approval settings are provided, the tool call does not require approval.
 */
export async function isApprovalNeeded<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
  tools,
  toolCall,
  toolNeedsApproval,
  messages,
  context,
}: {
  tools: TOOLS | undefined;

  /**
   * Potentially user-defined tool needs approval function.
   */
  toolNeedsApproval: {
    [key in keyof TOOLS]?:
      | boolean
      | ToolNeedsApprovalFunction<
          NoInfer<TOOLS[key]['inputSchema']>,
          InferToolSetContext<TOOLS> & USER_CONTEXT
        >;
  };

  toolCall: TypedToolCall<TOOLS>; // assuming tool call is valid
  messages: ModelMessage[];
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
}) {
  const input = toolCall.input as NoInfer<TOOLS[keyof TOOLS]['inputSchema']>;
  const options = { toolCallId: toolCall.toolCallId, messages, context };

  // user-defined tool needs approval function
  const userDefinedToolNeedsApproval = toolNeedsApproval[toolCall.toolName];
  if (userDefinedToolNeedsApproval != null) {
    return typeof userDefinedToolNeedsApproval === 'boolean'
      ? userDefinedToolNeedsApproval
      : await userDefinedToolNeedsApproval(input, options);
  }

  // tool-defined needs approval function
  const tool = tools?.[toolCall.toolName];
  return tool?.needsApproval == null
    ? false
    : typeof tool.needsApproval === 'boolean'
      ? tool.needsApproval
      : await tool.needsApproval(input, options);
}
