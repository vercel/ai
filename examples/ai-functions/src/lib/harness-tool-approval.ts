import type { ModelMessage, StreamTextResult, ToolApprovalResponse } from 'ai';
import { printFullStream } from './print-full-stream';

type CapturedToolApproval = {
  approvalId: string;
  toolCall: {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    input: unknown;
    providerExecuted?: boolean;
  };
};

export async function printFullStreamAndCaptureToolApproval({
  result,
}: {
  result: StreamTextResult<any, any, any>;
}): Promise<CapturedToolApproval | undefined> {
  let approval: CapturedToolApproval | undefined;

  await printFullStream({
    result,
    onToolApproval: chunk => {
      approval ??= {
        approvalId: chunk.approvalId,
        toolCall: {
          type: 'tool-call',
          toolCallId: chunk.toolCall.toolCallId,
          toolName: chunk.toolCall.toolName,
          input: chunk.toolCall.input,
          ...(chunk.toolCall.providerExecuted !== undefined
            ? { providerExecuted: chunk.toolCall.providerExecuted }
            : {}),
        },
      };
    },
  });

  return approval;
}

export function createToolApprovalResponseMessages({
  approval,
  approved,
  reason,
}: {
  approval: CapturedToolApproval;
  approved: boolean;
  reason?: string;
}): ModelMessage[] {
  const response: ToolApprovalResponse = {
    type: 'tool-approval-response',
    approvalId: approval.approvalId,
    approved,
    ...(reason !== undefined ? { reason } : {}),
  };

  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: approval.toolCall.toolCallId,
          toolName: approval.toolCall.toolName,
          input: approval.toolCall.input,
          ...(approval.toolCall.providerExecuted !== undefined
            ? { providerExecuted: approval.toolCall.providerExecuted }
            : {}),
        },
        {
          type: 'tool-approval-request',
          approvalId: approval.approvalId,
          toolCallId: approval.toolCall.toolCallId,
        },
      ],
    },
    {
      role: 'tool',
      content: [response],
    },
  ];
}
