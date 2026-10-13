import { HarnessError } from '../errors/harness-error';
import type {
  ModelMessage,
  ToolApprovalRequest,
  ToolApprovalResponse,
} from '@ai-sdk/provider-utils';

/**
 * Extract approval decisions that should continue a suspended harness turn.
 *
 * AI SDK clients send approval decisions as a trailing `role: "tool"` message
 * containing `tool-approval-response` parts. The response only carries the
 * approval id, so the harness has to recover the matching approval request
 * locally to find the original tool call before it can resume the paused turn.
 * Responses that already have a tool result are ignored, because those
 * approvals were already consumed by a prior continuation.
 */
export function collectHarnessAgentToolApprovalContinuations(input: {
  messages: readonly ModelMessage[];
}): readonly ToolApprovalResponse[] {
  const lastMessage = input.messages.at(-1);
  if (lastMessage?.role !== 'tool') return [];

  const toolCallIds = new Set<string>();
  const approvalRequestsByApprovalId = new Map<string, ToolApprovalRequest>();
  for (const message of input.messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        toolCallIds.add(part.toolCallId);
      } else if (part.type === 'tool-approval-request') {
        approvalRequestsByApprovalId.set(part.approvalId, part);
      }
    }
  }

  const toolResultIds = new Set<string>();
  for (const part of lastMessage.content) {
    if (part.type === 'tool-result') {
      toolResultIds.add(part.toolCallId);
    }
  }

  const continuations: ToolApprovalResponse[] = [];
  for (const part of lastMessage.content) {
    if (part.type !== 'tool-approval-response') continue;

    const approvalRequest = approvalRequestsByApprovalId.get(part.approvalId);
    if (approvalRequest == null) {
      throw new HarnessError({
        message: `Tool approval response '${part.approvalId}' does not match a prior tool approval request.`,
      });
    }
    if (toolResultIds.has(approvalRequest.toolCallId)) continue;

    if (!toolCallIds.has(approvalRequest.toolCallId)) {
      throw new HarnessError({
        message: `Tool approval request '${approvalRequest.approvalId}' references unknown tool call '${approvalRequest.toolCallId}'.`,
      });
    }

    continuations.push(part);
  }

  return continuations;
}
