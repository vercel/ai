import { TypedToolCall } from './tool-call';
import { TypedToolError } from './tool-error';
import { ToolSet } from './tool-set';
import { CollectedToolApprovals } from './collect-tool-approvals';

/**
 * Validates that tool input overrides are allowed and applies them.
 */
export function validateAndApplyToolInputOverrides<TOOLS extends ToolSet>({
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
      approval.approvalResponse.override !== undefined &&
      !approval.approvalRequest.allowsInputEditing
    ) {
      invalidToolErrors.push({
        type: 'tool-error' as const,
        toolCallId: approval.toolCall.toolCallId,
        toolName: approval.toolCall.toolName,
        input: approval.approvalResponse.override.input,
        providerExecuted: approval.toolCall.providerExecuted,
        error: `Tool '${approval.toolCall.toolName}' does not allow input modification.`,
        dynamic: approval.toolCall.dynamic,
      } as TypedToolError<TOOLS>);
      continue;
    }

    validToolCalls.push({
      ...approval.toolCall,
      input:
        approval.approvalResponse.override?.input ?? approval.toolCall.input,
    });
  }

  return { validToolCalls, invalidToolErrors };
}
