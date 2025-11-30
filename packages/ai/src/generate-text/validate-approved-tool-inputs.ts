import { TypedToolCall } from './tool-call';
import { TypedToolError } from './tool-error';
import { ToolSet } from './tool-set';
import { CollectedToolApprovals } from './collect-tool-approvals';

/**
 * Validates that tool input modifications are allowed and applies them.
 */
export function validateApprovedToolInputs<TOOLS extends ToolSet>({
  approvals,
}: {
  approvals: Array<CollectedToolApprovals<TOOLS>>;
}): {
  validToolCalls: Array<TypedToolCall<TOOLS>>;
  invalidToolErrors: Array<TypedToolError<TOOLS>>;
} {
  const validToolCalls: Array<TypedToolCall<TOOLS>> = [];
  const invalidToolErrors: Array<TypedToolError<TOOLS>> = [];

  for (const approval of approvals) {
    if (
      approval.approvalResponse.modifiedInput !== undefined &&
      !approval.approvalRequest.inputEditable
    ) {
      invalidToolErrors.push({
        type: 'tool-error' as const,
        toolCallId: approval.toolCall.toolCallId,
        toolName: approval.toolCall.toolName,
        input: approval.approvalResponse.modifiedInput,
        error: `Tool '${approval.toolCall.toolName}' does not allow input modification. Set inputEditable: true to enable this feature.`,
        dynamic: true,
      });
      continue;
    }

    // TODO: Add validateInput method to tools and call it here

    validToolCalls.push({
      ...approval.toolCall,
      input: approval.approvalResponse.modifiedInput ?? approval.toolCall.input,
    });
  }

  return { validToolCalls, invalidToolErrors };
}
