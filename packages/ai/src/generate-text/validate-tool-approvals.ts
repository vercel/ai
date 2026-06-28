import {
  asSchema,
  isExecutableTool,
  safeValidateTypes,
  type Context,
  type InferToolSetContext,
  type ModelMessage,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidToolApprovalSignatureError } from '../error/invalid-tool-approval-signature-error';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { resolveToolApproval } from './resolve-tool-approval';
import { verifyToolApprovalSignature } from './tool-approval-signature';
import type { ToolApprovalConfiguration } from './tool-approval-configuration';

/**
 * Re-validates approved tool approvals reconstructed from client-supplied
 * message history before they are executed. Checks HMAC signature (when
 * configured), input schema, and approval policy.
 */
export async function validateApprovedToolApprovals<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context | unknown | never,
>({
  approvedToolApprovals,
  tools,
  toolApproval,
  messages,
  toolsContext,
  runtimeContext,
  toolApprovalSecret,
}: {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  tools: TOOLS | undefined;
  toolApproval: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> | undefined;
  messages: ModelMessage[];
  toolsContext: InferToolSetContext<TOOLS>;
  runtimeContext: RUNTIME_CONTEXT;
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

    // Tool approvals are reconstructed from the (untrusted) message history the
    // caller supplies. The only thing that distinguishes a genuine,
    // server-issued approval from a client-forged one is the HMAC signature
    // minted by `maybeSignApproval` when the approval request was created. We
    // therefore require a valid signature for every approval before executing
    // the tool, which makes a configured `toolApprovalSecret` mandatory.
    // Without it a client can forge an `approval-responded` part and run any
    // `needsApproval` tool (VULN-6698 / ANT-2026-N56BQX9Z), so we fail closed.
    if (toolApprovalSecret == null) {
      throw new InvalidToolApprovalSignatureError({
        approvalId: approvalRequest.approvalId,
        toolCallId: toolCall.toolCallId,
        reason:
          'tool approvals require a `toolApprovalSecret` so the approval can be cryptographically bound to the server-issued request; set `experimental_toolApprovalSecret` on generateText/streamText',
      });
    }

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

    if (isExecutableTool(tool) && tool.inputSchema != null) {
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

    const approvalStatus = await resolveToolApproval({
      tools,
      toolApproval,
      toolCall,
      messages,
      toolsContext,
      runtimeContext,
    });

    if (approvalStatus.type === 'denied') {
      denied.push({
        ...approval,
        approvalResponse: {
          ...approval.approvalResponse,
          approved: false,
          reason: approvalStatus.reason ?? approval.approvalResponse.reason,
        },
      });
    } else {
      approved.push(approval);
    }
  }

  return { approvedToolApprovals: approved, deniedToolApprovals: denied };
}
