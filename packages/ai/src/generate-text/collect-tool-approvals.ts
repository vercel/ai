import {
  ModelMessage,
  ToolApprovalRequest,
  ToolApprovalResponse,
} from '@ai-sdk/provider-utils';
import { TypedToolCall } from './tool-call';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

export type CollectedToolApprovals<TOOLS extends ToolSet> = {
  approvalRequest: ToolApprovalRequest;
  approvalResponse: ToolApprovalResponse;
  toolCall: TypedToolCall<TOOLS>;
};

/**
 * Collected MCP approval that needs to be sent back to the provider.
 */
export type CollectedMcpApproval<TOOLS extends ToolSet> = {
  approvalRequest: ToolApprovalRequest;
  approvalResponse: ToolApprovalResponse;
  toolCall: TypedToolCall<TOOLS>;
  /** The MCP approval request ID from OpenAI */
  mcpApprovalRequestId: string;
};

/**
 * Check if an approval ID is an MCP approval from OpenAI.
 * OpenAI's MCP approval request IDs start with 'mcpr_'.
 */
function isMcpApprovalId(approvalId: string): boolean {
  return approvalId.startsWith('mcpr_');
}

/**
 * If the last message is a tool message, this function collects all tool approvals
 * from that message.
 */
export function collectToolApprovals<TOOLS extends ToolSet>({
  messages,
}: {
  messages: ModelMessage[];
}): {
  approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>>;
  mcpApprovedApprovals: Array<CollectedMcpApproval<TOOLS>>;
  mcpDeniedApprovals: Array<CollectedMcpApproval<TOOLS>>;
} {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role != 'tool') {
    return {
      approvedToolApprovals: [],
      deniedToolApprovals: [],
      mcpApprovedApprovals: [],
      mcpDeniedApprovals: [],
    };
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

  const approvedToolApprovals: Array<CollectedToolApprovals<TOOLS>> = [];
  const deniedToolApprovals: Array<CollectedToolApprovals<TOOLS>> = [];
  const mcpApprovedApprovals: Array<CollectedMcpApproval<TOOLS>> = [];
  const mcpDeniedApprovals: Array<CollectedMcpApproval<TOOLS>> = [];

  const approvalResponses = lastMessage.content.filter(
    part => part.type === 'tool-approval-response',
  );
  for (const approvalResponse of approvalResponses) {
    const approvalRequest =
      toolApprovalRequestsByApprovalId[approvalResponse.approvalId];

    if (toolResults[approvalRequest!.toolCallId] != null) {
      continue;
    }

    const toolCall = toolCallsByToolCallId[approvalRequest!.toolCallId];

    // Check if this is an MCP approval (from OpenAI)
    if (isMcpApprovalId(approvalResponse.approvalId)) {
      const mcpApproval: CollectedMcpApproval<TOOLS> = {
        approvalRequest,
        approvalResponse,
        toolCall,
        mcpApprovalRequestId: approvalResponse.approvalId,
      };

      if (approvalResponse.approved) {
        mcpApprovedApprovals.push(mcpApproval);
      } else {
        mcpDeniedApprovals.push(mcpApproval);
      }
      continue;
    }

    // Regular tool approval
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

  return {
    approvedToolApprovals,
    deniedToolApprovals,
    mcpApprovedApprovals,
    mcpDeniedApprovals,
  };
}
