import {
  asSchema,
  isExecutableTool,
  safeValidateTypes,
  type Context,
  type InferToolSetContext,
  type ModelMessage,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { resolveToolApproval } from './resolve-tool-approval';
import type { ToolApprovalConfiguration } from './tool-approval-configuration';

/**
 * Re-validates approved tool approvals that were reconstructed from the message
 * history before they are executed.
 *
 * `collectToolApprovals` rebuilds approved tool calls purely from the messages
 * array, which in the documented `useChat` flow originates from the client.
 * Without re-validation, a client could forge an assistant message containing a
 * `tool-call` + `tool-approval-request` together with a `tool-approval-response`
 * (`approved: true`) and have the server execute a tool with attacker-chosen
 * arguments, bypassing both the tool's input schema and the approval policy.
 *
 * This mirrors the checks the normal model path performs (`parseToolCall` for
 * input-schema validation and `resolveToolApproval` for the approval policy):
 *
 * - The tool-call input is re-validated against the tool's input schema. An
 *   approval whose input does not match the schema is rejected (fail-closed) by
 *   throwing an {@link InvalidToolInputError}, just like `collectToolApprovals`
 *   throws for malformed approval references.
 * - The approval policy is re-resolved. A tool call that the application's
 *   current policy denies is moved to the denied bucket and is not executed,
 *   even if the (client-supplied) approval response claims it was approved.
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
}: {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  tools: TOOLS | undefined;
  toolApproval: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> | undefined;
  messages: ModelMessage[];
  toolsContext: InferToolSetContext<TOOLS>;
  runtimeContext: RUNTIME_CONTEXT;
}): Promise<{
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
}> {
  const approved: Array<CollectedToolApprovals<TOOLS>> = [];
  const denied: Array<CollectedToolApprovals<TOOLS>> = [];

  for (const approval of approvedToolApprovals) {
    const { toolCall } = approval;
    const tool = tools?.[toolCall.toolName];

    // Re-validate the tool-call input against the tool's input schema. This
    // guards against client-forged approval messages carrying input that does
    // not conform to the declared schema. Only executable tools are validated;
    // non-executable (client-side) tools are not run on the server.
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

    // Re-apply the approval policy so a fabricated approval response cannot
    // execute a tool that the server-side policy denies.
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
