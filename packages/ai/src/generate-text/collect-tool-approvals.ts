import type {
  ModelMessage,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidToolApprovalError } from '../error/invalid-tool-approval-error';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { getLatestAssistantApprovalTurn } from '../util/get-latest-assistant-approval-turn';
import type { TypedToolCall } from './tool-call';
import type { TypedToolResult } from './tool-result';

export type CollectedToolApprovals<TOOLS extends ToolSet> = {
  approvalRequest: ToolApprovalRequest;
  approvalResponse: ToolApprovalResponse;
  toolCall: TypedToolCall<TOOLS>;
};

function createEmptyToolApprovals<TOOLS extends ToolSet>(): {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
} {
  return {
    approvedToolApprovals: [],
    deniedToolApprovals: [],
  };
}

/**
 * Collects unresolved tool approvals for the latest assistant turn. Approval
 * responses may be followed by non-assistant context messages, but are not
 * replayed once a later assistant response exists.
 */
export function collectToolApprovals<TOOLS extends ToolSet>({
  messages,
}: {
  messages: ModelMessage[];
}): {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
} {
  const approvalTurn = getLatestAssistantApprovalTurn(messages);

  if (approvalTurn == null) {
    return createEmptyToolApprovals();
  }

  const { latestAssistantContent, suffixMessages } = approvalTurn;

  // gather tool calls and prepare lookup.
  //
  // These maps are keyed by client-supplied ids (`toolCallId`, `approvalId`)
  // from the message history. Using `Object.create(null)` gives them no
  // prototype, so an id that matches an inherited object property (e.g.
  // `toString`, `constructor`, `__proto__`) is treated as absent instead of
  // resolving to a prototype value and slipping past the `== null` guards
  // below (which would otherwise skip the InvalidToolApproval /
  // ToolCallNotFound checks).
  const toolCallsByToolCallId: Record<
    string,
    TypedToolCall<TOOLS>
  > = Object.create(null);
  for (const part of latestAssistantContent) {
    if (part.type === 'tool-call') {
      toolCallsByToolCallId[part.toolCallId] = part as TypedToolCall<TOOLS>;
    }
  }

  // gather approval requests from the latest assistant turn only. If a later
  // assistant message exists, older approval responses belong to already
  // continued history and must not trigger side effects again.
  const toolApprovalRequestsByApprovalId: Record<string, ToolApprovalRequest> =
    Object.create(null);
  for (const part of latestAssistantContent) {
    if (part.type === 'tool-approval-request') {
      toolApprovalRequestsByApprovalId[part.approvalId] = part;
    }
  }

  const approvalResponses: ToolApprovalResponse[] = [];

  // gather tool results from the unresolved suffix after the latest assistant
  // turn, allowing user/system context to trail approval responses.
  const toolResults: Record<string, TypedToolResult<TOOLS>> = Object.create(
    null,
  );
  for (const message of suffixMessages) {
    if (message.role !== 'tool') {
      continue;
    }

    for (const part of message.content) {
      if (part.type === 'tool-approval-response') {
        approvalResponses.push(part);
      } else if (part.type === 'tool-result') {
        toolResults[part.toolCallId] = part as TypedToolResult<TOOLS>;
      }
    }
  }

  const approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>> = [];
  const deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>> = [];

  for (const approvalResponse of approvalResponses) {
    const approvalRequest =
      toolApprovalRequestsByApprovalId[approvalResponse.approvalId];

    if (approvalRequest == null) {
      throw new InvalidToolApprovalError({
        approvalId: approvalResponse.approvalId,
      });
    }

    if (toolResults[approvalRequest.toolCallId] != null) {
      continue;
    }

    const toolCall = toolCallsByToolCallId[approvalRequest.toolCallId];
    if (toolCall == null) {
      throw new ToolCallNotFoundForApprovalError({
        toolCallId: approvalRequest.toolCallId,
        approvalId: approvalRequest.approvalId,
      });
    }

    const approval: CollectedToolApprovals<TOOLS> = {
      approvalRequest,
      approvalResponse,
      toolCall,
    };

    if (approvalResponse.approved) {
      approvedToolApprovals.push(approval);
    } else {
      deniedToolApprovals.push(approval);
    }
  }

  return { approvedToolApprovals, deniedToolApprovals };
}
