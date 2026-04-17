import {
  InferToolContext,
  InferToolInput,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { ToolNeedsApprovalConfiguration } from './tool-needs-approval-configuration';
import { TypedToolCall } from './tool-call';

/**
 * Resolves whether a tool call requires approval by checking user-supplied and tool-defined
 * approval settings. User-defined approval settings take precedence over tool-defined settings.
 * If no approval settings are provided, the tool call does not require approval.
 */
export async function isToolApprovalNeeded<TOOLS extends ToolSet>({
  tools,
  toolCall,
  toolNeedsApproval,
  messages,
  toolsContext,
}: {
  tools: TOOLS | undefined;

  /**
   * User-defined approval configuration for tools.
   *
   * This configuration takes precedence over tool-defined approval settings.
   */
  toolNeedsApproval: ToolNeedsApprovalConfiguration<TOOLS> | undefined;

  toolCall: TypedToolCall<TOOLS>; // assuming tool call is valid
  messages: ModelMessage[];
  toolsContext: InferToolSetContext<TOOLS>;
}) {
  // assume that the input has been validated and matches the tool's input schema
  const input = toolCall.input as InferToolInput<TOOLS[keyof TOOLS]>;
  // assume that the tool context has been validated and matches the tool's context schema
  const context = toolsContext?.[
    toolCall.toolName as keyof InferToolSetContext<TOOLS>
  ] as InferToolContext<NoInfer<TOOLS[keyof TOOLS]>>;

  const options = { toolCallId: toolCall.toolCallId, messages, context };

  // user-defined tool approval
  const userDefinedToolNeedsApproval = toolNeedsApproval?.[toolCall.toolName];
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
