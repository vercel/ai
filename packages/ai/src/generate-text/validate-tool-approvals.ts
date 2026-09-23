import {
  asSchema,
  safeValidateTypes,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { InvalidToolApprovalSignatureError } from '../error/invalid-tool-approval-signature-error';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
<<<<<<< HEAD
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { isApprovalNeeded } from './is-approval-needed';
import { verifyToolApprovalSignature } from './tool-approval-signature';
import type { ToolSet } from './tool-set';
=======
import { getOwn } from '../util/get-own';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { refineParsedToolCallInput } from './parse-tool-call';
import { resolveToolApproval } from './resolve-tool-approval';
import { verifyToolApprovalSignature } from './tool-approval-signature';
import type { ToolApprovalConfiguration } from './tool-approval-configuration';
import type { ToolInputRefinement } from './tool-input-refinement';
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))

/**
 * Re-validates approved tool approvals reconstructed from client-supplied
 * message history before they are executed. Checks the HMAC signature (when
 * `experimental_toolApprovalSecret` is configured), re-validates the tool-call
 * input against the tool's input schema, and re-resolves whether the tool
 * actually requires approval.
 *
 * Approvals that fail signature validation throw (fail-closed). Approvals with
 * invalid tool input are returned separately so the model can recover without
 * executing a different operation. Approvals for tools that no longer require
 * approval are moved to the denied list, since the server would never have
 * issued an approval request for them.
 */
export async function validateApprovedToolApprovals<TOOLS extends ToolSet>({
  approvedToolApprovals,
  tools,
  messages,
  experimental_context,
  toolApprovalSecret,
  refineToolInput,
}: {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  tools: TOOLS | undefined;
  messages: ModelMessage[];
  experimental_context: unknown;
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
<<<<<<< HEAD
    const { toolCall, approvalRequest } = approval;
    const tool = tools?.[toolCall.toolName];
=======
    const { approvalRequest, toolCall } = approval;
    // Look up the tool by own property only: `toolName` comes from
    // client-supplied history, so a name matching an inherited object property
    // (e.g. `constructor`, `toString`) must resolve to "no such tool" rather
    // than a prototype value that would silently skip input validation below.
    const tool = getOwn(tools, toolCall.toolName);
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))

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

<<<<<<< HEAD
    // Re-validate the (client-supplied) input against the tool's input schema
    // for tools that are executed on the server.
    if (
      tool != null &&
      typeof tool.execute === 'function' &&
      tool.inputSchema != null
    ) {
=======
    if (isExecutableTool(tool) && tool.inputSchema != null) {
      const hasInputSchemaInput = Object.prototype.hasOwnProperty.call(
        approvalRequest,
        'inputSchemaInput',
      );
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
      const validation = await safeValidateTypes({
        value: hasInputSchemaInput
          ? approvalRequest.inputSchemaInput
          : toolCall.input,
        schema: asSchema(tool.inputSchema),
      });

      let validationError: unknown;
      if (!validation.success) {
        validationError = validation.error;
      } else {
        try {
          const revalidatedToolCall = await refineParsedToolCallInput({
            toolCall: {
              ...toolCall,
              input: validation.value,
            },
            refineToolInput,
          });

          // Revalidation must never change the operation that was approved,
          // including when older or projected history omits the schema input.
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

  return {
    approvedToolApprovals: approved,
    deniedToolApprovals: denied,
    invalidToolApprovals: invalid,
  };
}
