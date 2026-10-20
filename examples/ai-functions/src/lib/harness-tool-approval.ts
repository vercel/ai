import type {
  ModelMessage,
  ToolApprovalRequestOutput,
  ToolApprovalResponse,
} from 'ai';

export function createToolApprovalResponseMessages({
  approval,
  approved,
  reason,
}: {
  approval: ToolApprovalRequestOutput<any>;
  approved: boolean;
  reason?: string;
}): ModelMessage[] {
  return createToolApprovalResponsesMessages({
    approvals: [approval],
    approved,
    reason,
  });
}

export function createToolApprovalResponsesMessages({
  approvals,
  approved,
  reason,
}: {
  approvals: ReadonlyArray<ToolApprovalRequestOutput<any>>;
  approved: boolean;
  reason?: string;
}): ModelMessage[] {
  const responses: ToolApprovalResponse[] = approvals.map(approval => ({
    type: 'tool-approval-response',
    approvalId: approval.approvalId,
    approved,
    ...(reason !== undefined ? { reason } : {}),
    ...(approval.toolCall.providerExecuted !== undefined
      ? { providerExecuted: approval.toolCall.providerExecuted }
      : {}),
  }));

  return [
    {
      role: 'assistant',
      content: approvals.flatMap(approval => [
        approval.toolCall,
        {
          type: 'tool-approval-request' as const,
          approvalId: approval.approvalId,
          toolCallId: approval.toolCall.toolCallId,
          ...(approval.isAutomatic !== undefined
            ? { isAutomatic: approval.isAutomatic }
            : {}),
          ...(approval.signature !== undefined
            ? { signature: approval.signature }
            : {}),
        },
      ]),
    },
    {
      role: 'tool',
      content: responses,
    },
  ];
}
