import {
  asSchema,
  safeValidateTypes,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { InvalidToolApprovalSignatureError } from '../error/invalid-tool-approval-signature-error';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { isApprovalNeeded } from './is-approval-needed';
import { verifyToolApprovalSignature } from './tool-approval-signature';
import type { ToolSet } from './tool-set';

/**
 * Re-validates approved tool approvals reconstructed from client-supplied
 * message history before they are executed. Checks the HMAC signature (when
 * `experimental_toolApprovalSecret` is configured), re-validates the tool-call
 * input against the tool's input schema, and re-resolves whether the tool
 * actually requires approval.
 *
 * Approvals that fail signature or schema validation throw (fail-closed).
 * Approvals for tools that no longer require approval are moved to the denied
 * list, since the server would never have issued an approval request for them.
 */
export async function validateApprovedToolApprovals<TOOLS extends ToolSet>({
  approvedToolApprovals,
  tools,
  messages,
  experimental_context,
  toolApprovalSecret,
}: {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  tools: TOOLS | undefined;
  messages: ModelMessage[];
  experimental_context: unknown;
  toolApprovalSecret?: string | Uint8Array;
}): Promise<{
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
}> {
  const approved: Array<CollectedToolApprovals<TOOLS>> = [];
  const denied: Array<CollectedToolApprovals<TOOLS>> = [];

  for (const approval of approvedToolApprovals) {
    const { toolCall, approvalRequest } = approval;
    const tool = tools?.[toolCall.toolName];

    if (toolApprovalSecret != null) {
      if (approvalRequest.signature == null) {
        throw new InvalidToolApprovalSignatureError({
          approvalId: approvalRequest.approvalId,
          toolCallId: toolCall.toolCallId,
          reason: 'missing signature',
        });
      }

      const valid = await verifyToolApprovalSignature({
        secret: toolApprovalSecret,
        signature: approvalRequest.signature,
        approvalId: approvalRequest.approvalId,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });

      if (!valid) {
        throw new InvalidToolApprovalSignatureError({
          approvalId: approvalRequest.approvalId,
          toolCallId: toolCall.toolCallId,
          reason: 'invalid signature',
        });
      }
    }

    // Re-validate the (client-supplied) input against the tool's input schema
    // for tools that are executed on the server.
    if (
      tool != null &&
      typeof tool.execute === 'function' &&
      tool.inputSchema != null
    ) {
      const validation = await safeValidateTypes({
        value: toolCall.input,
        schema: asSchema(tool.inputSchema),
      });

      if (!validation.success) {
        throw new InvalidToolInputError({
          toolName: toolCall.toolName,
          toolInput: JSON.stringify(toolCall.input),
          cause: validation.error,
        });
      }
    }

    // Re-resolve whether the tool requires approval. A tool that does not
    // require approval would never have had an approval request issued by the
    // server, so any approval for it is fabricated and is denied.
    const approvalNeeded =
      tool != null &&
      (await isApprovalNeeded({
        tool,
        toolCall,
        messages,
        experimental_context,
      }));

    if (approvalNeeded) {
      approved.push(approval);
    } else {
      denied.push({
        ...approval,
        approvalResponse: {
          ...approval.approvalResponse,
          approved: false,
          reason:
            approval.approvalResponse.reason ??
            `Tool "${toolCall.toolName}" does not require approval`,
        },
      });
    }
  }

  return { approvedToolApprovals: approved, deniedToolApprovals: denied };
}
