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
import { getOwn } from '../util/get-own';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { refineParsedToolCallInput } from './parse-tool-call';
import { resolveToolApproval } from './resolve-tool-approval';
import { verifyToolApprovalSignature } from './tool-approval-signature';
import type { ToolApprovalConfiguration } from './tool-approval-configuration';
import type { ToolInputRefinement } from './tool-input-refinement';

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
  refineToolInput,
}: {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  tools: TOOLS | undefined;
  toolApproval: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> | undefined;
  messages: ModelMessage[];
  toolsContext: InferToolSetContext<TOOLS>;
  runtimeContext: RUNTIME_CONTEXT;
  toolApprovalSecret?: string | Uint8Array;
  refineToolInput?: ToolInputRefinement<TOOLS>;
}): Promise<{
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  invalidToolApprovals: Array<
    CollectedToolApprovals<TOOLS> & { error: InvalidToolInputError }
  >;
}> {
  const approved: Array<CollectedToolApprovals<TOOLS>> = [];
  const denied: Array<CollectedToolApprovals<TOOLS>> = [];
  const invalid: Array<
    CollectedToolApprovals<TOOLS> & { error: InvalidToolInputError }
  > = [];

  for (const approval of approvedToolApprovals) {
    const { toolCall, approvalRequest } = approval;
    // Look up the tool by own property only: `toolName` comes from
    // client-supplied history, so a name matching an inherited object property
    // (e.g. `constructor`, `toString`) must resolve to "no such tool" rather
    // than a prototype value that would silently skip input validation below.
    const tool = getOwn(tools, toolCall.toolName);

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

    if (isExecutableTool(tool) && tool.inputSchema != null) {
      const hasInputSchemaInput = Object.prototype.hasOwnProperty.call(
        approvalRequest,
        'inputSchemaInput',
      );
      const validation = await safeValidateTypes({
        value: hasInputSchemaInput
          ? approvalRequest.inputSchemaInput
          : toolCall.input,
        schema: asSchema(tool.inputSchema),
      });

      let validationError: unknown;
      if (!validation.success) {
        validationError = validation.error;
      } else if (hasInputSchemaInput) {
        try {
          const revalidatedToolCall = await refineParsedToolCallInput({
            toolCall: {
              ...toolCall,
              input: validation.value,
            },
            refineToolInput,
          });

          if (!isDeepEqualData(revalidatedToolCall.input, toolCall.input)) {
            validationError = new Error(
              'Approved tool input does not match the validated schema output.',
            );
          }
        } catch (error) {
          validationError = error;
        }
      }

      if (validationError != null) {
        invalid.push({
          ...approval,
          error: new InvalidToolInputError({
            toolName: toolCall.toolName,
            toolInput: JSON.stringify(toolCall.input),
            cause: validationError,
          }),
        });
        continue;
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

  return {
    approvedToolApprovals: approved,
    deniedToolApprovals: denied,
    invalidToolApprovals: invalid,
  };
}
