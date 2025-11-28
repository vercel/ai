import { CollectedToolApprovals } from './collect-tool-approvals';
import { TypedToolCall } from './tool-call';
import { ToolSet } from './tool-set';

/**
 * Validates that tool input modifications are allowed and applies them.
 */
export function applyToolInputModifications<TOOLS extends ToolSet>({
  approvals,
  tools,
}: {
  approvals: Array<CollectedToolApprovals<TOOLS>>;
  tools: TOOLS | undefined;
}): Array<TypedToolCall<TOOLS>> {
  return approvals.map(({ toolCall, approvalResponse }) => {
    const tool = tools?.[toolCall.toolName];

    if (
      approvalResponse.modifiedInput !== undefined &&
      !tool?.allowInputModification
    ) {
      throw new Error(
        `Tool '${toolCall.toolName}' does not allow input modification. ` +
          `Set allowInputModification: true to enable this feature.`,
      );
    }

    return {
      ...toolCall,
      input: approvalResponse.modifiedInput ?? toolCall.input,
    };
  });
}
