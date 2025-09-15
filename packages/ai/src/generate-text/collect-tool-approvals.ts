import {
  ModelMessage,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolCallPart,
} from '@ai-sdk/provider-utils';
import { ToolSet } from './tool-set';
import { TypedToolCall } from './tool-call';

export function collectToolApprovals<TOOLS extends ToolSet>({
  messages,
}: {
  messages: ModelMessage[];
}): Array<{
  approvalRequest: ToolApprovalRequest;
  approvalResponse: ToolApprovalResponse;
  toolCall: TypedToolCall<TOOLS>;
}> {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role != 'tool') {
    return [];
  }

  // gather tool calls and prepare lookup
  const toolCallsByToolCallId: Record<string, ToolCallPart> = {};
  for (const message of messages) {
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      const content = message.content;
      for (const part of content) {
        if (part.type === 'tool-call') {
          toolCallsByToolCallId[part.toolCallId] = part;
        }
      }
    }
  }

  // gather approval requests and prepare lookup
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

  return lastMessage.content
    .filter(part => part.type === 'tool-approval-response')
    .map(response => {
      const approvalRequest =
        toolApprovalRequestsByApprovalId[response.approvalId];

      return {
        approvalRequest,
        approvalResponse: response,
        toolCall: toolCallsByToolCallId[
          approvalRequest!.toolCallId
        ] as TypedToolCall<TOOLS>,
      };
    });
}
