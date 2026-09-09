import type { ModelMessage } from 'ai';
import {
  assertCodeModeApprovalResponse,
  CODE_MODE_TOOL_APPROVAL_KIND,
} from './approval.js';
import { CodeModeProtocolError } from './errors.js';
import {
  continueCodeModeInterrupt,
  isCodeModeInterrupt,
} from './interrupt-continuation.js';
import type {
  CodeModeApprovalInterrupt,
  CodeModeApprovalResponse,
  CodeModeContinuationSecurityOptions,
  CodeModeOptions,
  CodeModeToolExecutionOptions,
  CodeModeToolSet,
} from './types.js';

export function isCodeModeApprovalInterrupt(
  value: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): value is CodeModeApprovalInterrupt {
  return (
    isCodeModeInterrupt(value, continuationSecurity) &&
    value.payload.kind === CODE_MODE_TOOL_APPROVAL_KIND
  );
}

export async function continueCodeModeApproval({
  interrupt,
  approvalResponse,
  tools,
  options = {},
  toolExecutionOptions,
}: {
  interrupt: CodeModeApprovalInterrupt;
  approvalResponse: CodeModeApprovalResponse;
  tools: CodeModeToolSet;
  options?: CodeModeOptions;
  toolExecutionOptions?: Partial<CodeModeToolExecutionOptions>;
}): Promise<unknown> {
  assertCodeModeApprovalResponse(approvalResponse);
  if (approvalResponse.approvalId !== interrupt.interruptId) {
    throw new CodeModeProtocolError(
      `Approval response ${approvalResponse.approvalId} does not match pending code-mode approval ${interrupt.interruptId}.`,
    );
  }

  return await continueCodeModeInterrupt({
    interrupt,
    resolution: {
      approved: approvalResponse.approved,
      ...(approvalResponse.reason !== undefined
        ? { reason: approvalResponse.reason }
        : {}),
    },
    tools,
    options: {
      ...options,
      approval: { ...options.approval, mode: 'interrupt' },
    },
    ...(toolExecutionOptions !== undefined ? { toolExecutionOptions } : {}),
  });
}

export function toCodeModeApprovalMessages(
  interrupt: CodeModeApprovalInterrupt,
): ModelMessage[] {
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: interrupt.toolCallId,
          toolName: interrupt.toolName,
          input: interrupt.input,
        },
        {
          type: 'tool-approval-request',
          approvalId: interrupt.interruptId,
          toolCallId: interrupt.toolCallId,
        },
      ],
    },
  ];
}

export function getCodeModeApprovalResponse(
  messages: ModelMessage[],
  interrupt: CodeModeApprovalInterrupt,
): CodeModeApprovalResponse | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (
        part.type === 'tool-approval-response' &&
        part.approvalId === interrupt.interruptId &&
        typeof part.approved === 'boolean' &&
        (part.reason === undefined || typeof part.reason === 'string')
      ) {
        return {
          approvalId: part.approvalId,
          approved: part.approved,
          ...(part.reason !== undefined ? { reason: part.reason } : {}),
        };
      }
    }
  }
  return undefined;
}
