import {
  InferToolInput,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import {
  ToolApprovalConfiguration,
  ToolApprovalStatus,
} from './tool-approval-configuration';
import { TypedToolCall } from './tool-call';
import { validateToolContext } from './validate-tool-context';

/**
 * Resolves the approval state for a tool call by checking user-supplied and tool-defined
 * approval settings, and normalizes the result to the object status shape.
 * User-defined approval settings take precedence over tool-defined settings.
 * If no approval settings are provided, the tool call does not require approval.
 */
export async function resolveToolApproval<TOOLS extends ToolSet>({
  tools,
  toolCall,
  toolApproval,
  messages,
  toolsContext,
}: {
  tools: TOOLS | undefined;

  /**
   * User-defined approval configuration for tools.
   *
   * This configuration takes precedence over tool-defined approval settings.
   */
  toolApproval: ToolApprovalConfiguration<TOOLS> | undefined;

  /**
   * Valid tool call.
   */
  toolCall: TypedToolCall<TOOLS>;

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   */
  messages: ModelMessage[];

  /**
   * Tool context as defined by the tool's context schema.
   */
  toolsContext: InferToolSetContext<TOOLS>;
}): Promise<Exclude<ToolApprovalStatus, string>> {
  const toolName = toolCall.toolName;
  const tool = tools?.[toolName];

  // assume that the input has been validated and matches the tool's input schema
  const input = toolCall.input as InferToolInput<TOOLS[keyof TOOLS]>;

  // user-defined tool approval
  const userDefinedToolApprovalStatus = toolApproval?.[toolName];
  if (userDefinedToolApprovalStatus != null) {
    const approvalStatus: ToolApprovalStatus =
      typeof userDefinedToolApprovalStatus === 'function'
        ? await userDefinedToolApprovalStatus(input, {
            toolCallId: toolCall.toolCallId,
            messages,
            toolContext: await validateToolContext({
              toolName,
              context:
                toolsContext?.[toolName as keyof InferToolSetContext<TOOLS>],
              contextSchema: tool?.contextSchema,
            }),
          })
        : userDefinedToolApprovalStatus;

    return typeof approvalStatus === 'string'
      ? { type: approvalStatus }
      : approvalStatus;
  }

  // tool-defined approval
  if (tool?.needsApproval == null) {
    return { type: 'not-applicable' };
  }

  const needsApproval =
    typeof tool.needsApproval === 'function'
      ? await tool.needsApproval(input, {
          toolCallId: toolCall.toolCallId,
          messages,
          context: await validateToolContext({
            toolName,
            context:
              toolsContext?.[toolName as keyof InferToolSetContext<TOOLS>],
            contextSchema: tool?.contextSchema,
          }),
        })
      : tool.needsApproval;

  return needsApproval ? { type: 'user-approval' } : { type: 'not-applicable' };
}
