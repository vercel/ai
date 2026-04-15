import {
  Context,
  InferToolInput,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { ToolApprovalConfiguration } from './tool-approval-configuration';
import { TypedToolCall } from './tool-call';

/**
 * Resolves whether a tool call requires approval by checking user-supplied and tool-defined
 * approval settings. User-defined approval settings take precedence over tool-defined settings.
 * If no approval settings are provided, the tool call does not require approval.
 */
export async function isToolApprovalNeeded<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
  tools,
  toolCall,
  toolApproval,
  messages,
  context,
}: {
  tools: TOOLS | undefined;

  /**
   * User-defined approval configuration for tools.
   *
   * This configuration takes precedence over tool-defined approval settings.
   */
  toolApproval: ToolApprovalConfiguration<TOOLS, USER_CONTEXT> | undefined;

  toolCall: TypedToolCall<TOOLS>; // assuming tool call is valid
  messages: ModelMessage[];
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
}) {
  // assume that the input has been validated early and matches the tool's input schema
  const input = toolCall.input as InferToolInput<TOOLS[keyof TOOLS]>;
  const options = { toolCallId: toolCall.toolCallId, messages, context };

  // user-defined tool approval
  const userDefinedToolNeedsApproval = toolApproval?.[toolCall.toolName];
  if (userDefinedToolNeedsApproval != null) {
    return typeof userDefinedToolNeedsApproval === 'boolean'
      ? userDefinedToolNeedsApproval
      : await userDefinedToolNeedsApproval(input, options);
  }

  // tool-defined approval
  const tool = tools?.[toolCall.toolName];
  return tool?.needsApproval == null
    ? false
    : typeof tool.needsApproval === 'boolean'
      ? tool.needsApproval
      : await tool.needsApproval(input, options);
}
