import {
  ModelMessage,
  ToolApprovalRequest,
  ToolApprovalResponse,
} from '@ai-sdk/provider-utils';
import { TypedToolCall } from './tool-call';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

/**
 * If the last message is a tool message, this function collects all tool approvals
 * from that message.
 */
export function collectToolApprovals<TOOLS extends ToolSet>({
  messages,
}: {
  messages: ModelMessage[];
}): Array<{
  approvalRequest: ToolApprovalRequest;
  approvalResponse: ToolApprovalResponse;
  toolCall: TypedToolCall<TOOLS>;
  toolResult: TypedToolResult<TOOLS> | undefined;
  state: 'approved' | 'denied' | 'processed';
}> {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role != 'tool') {
    return [];
  }

  // gather tool calls and prepare lookup
  const toolCallsByToolCallId: Record<string, TypedToolCall<TOOLS>> = {};
  for (const message of messages) {
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      const content = message.content;
      for (const part of content) {
        if (part.type === 'tool-call') {
          toolCallsByToolCallId[part.toolCallId] = part as TypedToolCall<TOOLS>;
        }
      }
    }
  }

  // gather approval responses and prepare lookup
  const toolApprovalRequestsByApprovalId: Record<string, ToolApprovalRequest> =
    {};
  for (const message of messages) {
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      const content = message.content;
      for (const part of content) {
        if (part.type === 'tool-approval-request') {
          toolApprovalRequestsByApprovalId[part.approvalId] = part;
        }
      }
    }
  }

  // gather tool results from the last tool message
  const toolResults: Record<string, TypedToolResult<TOOLS>> = {};
  for (const part of lastMessage.content) {
    if (part.type === 'tool-result') {
      toolResults[part.toolCallId] = part as TypedToolResult<TOOLS>;
    }
  }

  return lastMessage.content
    .filter(part => part.type === 'tool-approval-response')
    .map(approvalResponse => {
      const approvalRequest =
        toolApprovalRequestsByApprovalId[approvalResponse.approvalId];

      const toolResult = toolResults[approvalRequest!.toolCallId];
      const toolCall = toolCallsByToolCallId[approvalRequest!.toolCallId];

      return {
        approvalRequest,
        approvalResponse,
        toolCall,
        toolResult,
        state:
          toolResult != null
            ? 'processed'
            : approvalResponse.approved
              ? 'approved'
              : 'denied',
      };
    });
}
