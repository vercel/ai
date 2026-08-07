import type { JSONValue } from '@ai-sdk/provider';
import {
  experimental_getToolCaller,
  getErrorMessage,
  type InferToolSetContext,
  type ModelMessage,
  type ToolCall,
  type ToolModelMessage,
  type ToolResultPart,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { getOwn } from '../util/get-own';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import {
  getLocalToolsForCaller,
  getToolCallerApprovalRequest,
  type LocalToolCallerApprovalRequest,
  type LocalToolCallerApprovalStatus,
  type ResolvedToolCallers,
} from './tool-caller-configuration';
import type { ToolOutput } from './tool-output';

export type ContinuedToolCallerApproval<TOOLS extends ToolSet> = {
  responseMessage: ToolModelMessage;
  toolOutput: ToolOutput<TOOLS>;
  nextApprovalRequest: LocalToolCallerApprovalRequest | undefined;
};

export function normalizeToolCallerApprovalMessages({
  messages,
}: {
  messages: ModelMessage[];
}): ModelMessage[] {
  const callerApprovalIds = new Set<string>();
  const callerToolCallIds = new Set<string>();
  const nestedToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      continue;
    }
    for (const part of message.content) {
      if (
        part.type === 'tool-approval-request' &&
        part.callerToolCallId != null
      ) {
        // Track the nested approval so its request and response can be removed.
        callerApprovalIds.add(part.approvalId);
        // Track the outer caller so only its latest result remains.
        callerToolCallIds.add(part.callerToolCallId);
        // Track the nested host tool so its call and result can be removed.
        nestedToolCallIds.add(part.toolCallId);
      }
    }
  }

  if (callerApprovalIds.size === 0) {
    return messages;
  }

  const latestToolResults = new Map<string, ToolResultPart>();
  for (const message of messages) {
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (
        part.type === 'tool-result' &&
        callerToolCallIds.has(part.toolCallId)
      ) {
        latestToolResults.set(part.toolCallId, part);
      }
    }
  }

  return messages.flatMap(message => {
    if (typeof message.content === 'string') {
      return [message];
    }
    const content = message.content.filter(part => {
      if (
        (part.type === 'tool-call' || part.type === 'tool-result') &&
        nestedToolCallIds.has(part.toolCallId)
      ) {
        return false;
      }
      if (
        part.type === 'tool-approval-request' &&
        part.callerToolCallId != null
      ) {
        return false;
      }
      if (
        part.type === 'tool-approval-response' &&
        callerApprovalIds.has(part.approvalId)
      ) {
        return false;
      }
      if (part.type !== 'tool-result') {
        return true;
      }
      return (
        !callerToolCallIds.has(part.toolCallId) ||
        latestToolResults.get(part.toolCallId) === part
      );
    });
    return content.length === 0
      ? []
      : [{ ...message, content } as ModelMessage];
  });
}

export async function continueToolCallerApprovals<TOOLS extends ToolSet>({
  approvals,
  messages,
  tools,
  toolCallers,
  toolsContext,
  abortSignal,
  resolveToolApproval,
}: {
  approvals: Array<CollectedToolApprovals<TOOLS>>;
  messages: ModelMessage[];
  tools: TOOLS;
  toolCallers: ResolvedToolCallers | undefined;
  toolsContext: InferToolSetContext<TOOLS>;
  abortSignal: AbortSignal | undefined;
  resolveToolApproval: (
    toolCall: ToolCall<string, unknown>,
    messages: ModelMessage[],
  ) => Promise<LocalToolCallerApprovalStatus>;
}): Promise<{
  continued: Array<ContinuedToolCallerApproval<TOOLS>>;
  remaining: Array<CollectedToolApprovals<TOOLS>>;
  messages: ModelMessage[];
}> {
  const continued: Array<ContinuedToolCallerApproval<TOOLS>> = [];
  const remaining: Array<CollectedToolApprovals<TOOLS>> = [];
  let currentMessages = messages;

  for (const approval of approvals) {
    if (approval.approvalRequest.callerToolCallId == null) {
      remaining.push(approval);
      continue;
    }

    const match = findToolCallerApproval({
      approval,
      messages: currentMessages,
      tools,
    });
    if (match === undefined) {
      continue;
    }

    const localTools = getLocalToolsForCaller({
      callerName: match.callerName,
      tools,
      toolCallers,
    });
    const context = getOwn(toolsContext, match.callerName);
    let output: unknown;
    let error: unknown;
    try {
      output = await match.caller.continueApproval!({
        output: match.outerToolResult.output,
        approvalResponse: approval.approvalResponse,
        tools: localTools,
        resolveToolApproval: toolCall =>
          resolveToolApproval(toolCall, currentMessages),
        toolExecutionOptions: {
          toolCallId: match.request.callerToolCallId,
          messages: currentMessages,
          ...(abortSignal !== undefined ? { abortSignal } : {}),
          ...(context !== undefined ? { context } : {}),
        },
      });
    } catch (caught) {
      error = caught;
    }

    const replacementOutput =
      error === undefined
        ? toModelToolOutput(output)
        : {
            type: 'error-text' as const,
            value: getErrorMessage(error),
          };
    currentMessages = replaceApprovalMessages({
      messages: currentMessages,
      outerToolCallId: match.request.callerToolCallId,
      replacementOutput,
    });
    const responseMessage: ToolModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: match.request.callerToolCallId,
          toolName: match.callerName,
          output: replacementOutput,
        },
      ],
    };
    const toolOutput = {
      type: error === undefined ? 'tool-result' : 'tool-error',
      toolCallId: match.request.callerToolCallId,
      toolName: match.callerName,
      input: match.outerToolCall.input,
      ...(error === undefined ? { output } : { error }),
      dynamic: false,
    } as ToolOutput<TOOLS>;
    continued.push({
      responseMessage,
      toolOutput,
      nextApprovalRequest:
        error === undefined
          ? getToolCallerApprovalRequest({
              callerToolName: match.callerName,
              output,
              tools,
            })
          : undefined,
    });
  }

  return { continued, remaining, messages: currentMessages };
}

function findToolCallerApproval<TOOLS extends ToolSet>({
  approval,
  messages,
  tools,
}: {
  approval: CollectedToolApprovals<TOOLS>;
  messages: ModelMessage[];
  tools: TOOLS;
}):
  | {
      callerName: string;
      caller: Extract<
        NonNullable<ReturnType<typeof experimental_getToolCaller>>,
        { type: 'local' }
      >;
      outerToolCall: ToolCall<string, unknown>;
      outerToolResult: ToolResultPart;
      request: NonNullable<ReturnType<typeof getToolCallerApprovalRequest>>;
    }
  | undefined {
  const latestToolCalls = new Map<string, ToolCall<string, unknown>>();
  const latestToolResults = new Map<string, ToolResultPart>();
  for (const message of messages) {
    if (typeof message.content === 'string') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        latestToolCalls.set(part.toolCallId, part);
      } else if (part.type === 'tool-result') {
        latestToolResults.set(part.toolCallId, part);
      }
    }
  }

  const callerToolCallId = approval.approvalRequest.callerToolCallId;
  if (callerToolCallId == null) {
    return undefined;
  }
  const outerToolResult = latestToolResults.get(callerToolCallId);
  const outerToolCall = latestToolCalls.get(callerToolCallId);
  if (outerToolResult === undefined || outerToolCall === undefined) {
    return undefined;
  }
  const callerName = outerToolResult.toolName;
  const caller = experimental_getToolCaller(getOwn(tools, callerName));
  if (caller?.type !== 'local' || caller.continueApproval === undefined) {
    return undefined;
  }
  const request = getToolCallerApprovalRequest({
    callerToolName: callerName,
    output: outerToolResult.output,
    tools,
  });
  if (
    request?.approvalId === approval.approvalRequest.approvalId &&
    request.callerToolCallId === callerToolCallId
  ) {
    return {
      callerName,
      caller,
      outerToolCall,
      outerToolResult,
      request,
    };
  }
  return undefined;
}

function replaceApprovalMessages({
  messages,
  outerToolCallId,
  replacementOutput,
}: {
  messages: ModelMessage[];
  outerToolCallId: string;
  replacementOutput: ToolResultPart['output'];
}): ModelMessage[] {
  return messages.map(message => {
    if (typeof message.content === 'string') {
      return message;
    }
    return {
      ...message,
      content: message.content.map(part =>
        part.type === 'tool-result' && part.toolCallId === outerToolCallId
          ? { ...part, output: replacementOutput }
          : part,
      ),
    } as ModelMessage;
  });
}

function toModelToolOutput(value: unknown): ToolResultPart['output'] {
  return typeof value === 'string'
    ? { type: 'text', value }
    : {
        type: 'json',
        value: value === undefined ? null : (value as JSONValue),
      };
}
