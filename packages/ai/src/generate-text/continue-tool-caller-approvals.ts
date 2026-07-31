import type { JSONValue } from '@ai-sdk/provider';
import {
  experimental_getToolCaller,
  getErrorMessage,
  type InferToolSetContext,
  type ModelMessage,
  type ToolModelMessage,
  type ToolResultPart,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { getOwn } from '../util/get-own';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import {
  getLocalToolsForCaller,
  getToolCallerApprovalRequest,
  type ResolvedToolCallers,
} from './tool-caller-configuration';

export type ContinuedToolCallerApproval<TOOLS extends ToolSet> = {
  approval: CollectedToolApprovals<TOOLS>;
  messages: ModelMessage[];
  responseMessage: ToolModelMessage;
};

export function normalizeToolCallerApprovalMessages({
  messages,
  tools,
}: {
  messages: ModelMessage[];
  tools: ToolSet | undefined;
}): ModelMessage[] {
  if (tools == null) {
    return messages;
  }

  const resultsByToolCallId = new Map<string, ToolResultPart[]>();
  for (const message of messages) {
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-result') {
        const results = resultsByToolCallId.get(part.toolCallId) ?? [];
        results.push(part);
        resultsByToolCallId.set(part.toolCallId, results);
      }
    }
  }

  let normalized = messages;
  for (const results of resultsByToolCallId.values()) {
    const interruptedResult = results.find(part =>
      getToolCallerApprovalRequest({
        callerToolName: part.toolName,
        output: part.output,
        tools,
      }),
    );
    if (interruptedResult === undefined) {
      continue;
    }
    const request = getToolCallerApprovalRequest({
      callerToolName: interruptedResult.toolName,
      output: interruptedResult.output,
      tools,
    });
    const latestResult = results.at(-1);
    if (
      request === undefined ||
      latestResult === undefined ||
      latestResult === interruptedResult
    ) {
      continue;
    }
    normalized = collapseResolvedApprovalMessages({
      messages: normalized,
      request,
      replacementOutput: latestResult.output,
    });
  }
  return normalized;
}

export async function continueToolCallerApprovals<TOOLS extends ToolSet>({
  approvals,
  messages,
  tools,
  toolCallers,
  toolsContext,
  abortSignal,
}: {
  approvals: Array<CollectedToolApprovals<TOOLS>>;
  messages: ModelMessage[];
  tools: TOOLS;
  toolCallers: ResolvedToolCallers | undefined;
  toolsContext: InferToolSetContext<TOOLS>;
  abortSignal: AbortSignal | undefined;
}): Promise<{
  continued: Array<ContinuedToolCallerApproval<TOOLS>>;
  remaining: Array<CollectedToolApprovals<TOOLS>>;
  messages: ModelMessage[];
}> {
  const continued: Array<ContinuedToolCallerApproval<TOOLS>> = [];
  const remaining: Array<CollectedToolApprovals<TOOLS>> = [];
  let currentMessages = messages;

  for (const approval of approvals) {
    const match = findToolCallerApproval({
      approval,
      messages: currentMessages,
      tools,
    });
    if (match === undefined) {
      remaining.push(approval);
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
        messages: currentMessages,
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
      approval,
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
    continued.push({ approval, messages: currentMessages, responseMessage });
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
      outerToolResult: ToolResultPart;
      request: NonNullable<ReturnType<typeof getToolCallerApprovalRequest>>;
    }
  | undefined {
  const latestToolResults = new Map<string, ToolResultPart>();
  for (const message of messages) {
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-result') {
        latestToolResults.set(part.toolCallId, part);
      }
    }
  }

  for (const outerToolResult of latestToolResults.values()) {
    const callerName = outerToolResult.toolName;
    const caller = experimental_getToolCaller(getOwn(tools, callerName));
    if (caller?.type !== 'local' || caller.continueApproval === undefined) {
      continue;
    }
    const request = getToolCallerApprovalRequest({
      callerToolName: callerName,
      output: outerToolResult.output,
      tools,
    });
    if (request?.approvalId === approval.approvalRequest.approvalId) {
      return { callerName, caller, outerToolResult, request };
    }
  }
  return undefined;
}

function replaceApprovalMessages<TOOLS extends ToolSet>({
  messages,
  approval,
  outerToolCallId,
  replacementOutput,
}: {
  messages: ModelMessage[];
  approval: CollectedToolApprovals<TOOLS>;
  outerToolCallId: string;
  replacementOutput: ToolResultPart['output'];
}): ModelMessage[] {
  const nextMessages: ModelMessage[] = [];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      nextMessages.push(message);
      continue;
    }

    const content = message.content
      .map(part => {
        if (
          part.type === 'tool-result' &&
          part.toolCallId === outerToolCallId
        ) {
          return { ...part, output: replacementOutput };
        }
        return part;
      })
      .filter(part => {
        if (
          part.type === 'tool-call' &&
          part.toolCallId === approval.toolCall.toolCallId
        ) {
          return false;
        }
        if (
          part.type === 'tool-approval-request' &&
          part.approvalId === approval.approvalRequest.approvalId
        ) {
          return false;
        }
        if (
          part.type === 'tool-approval-response' &&
          part.approvalId === approval.approvalResponse.approvalId
        ) {
          return false;
        }
        return !(
          part.type === 'tool-result' &&
          part.toolCallId === approval.toolCall.toolCallId
        );
      });
    if (content.length > 0) {
      nextMessages.push({ ...message, content } as ModelMessage);
    }
  }
  return nextMessages;
}

function collapseResolvedApprovalMessages({
  messages,
  request,
  replacementOutput,
}: {
  messages: ModelMessage[];
  request: NonNullable<ReturnType<typeof getToolCallerApprovalRequest>>;
  replacementOutput: ToolResultPart['output'];
}): ModelMessage[] {
  const nextMessages: ModelMessage[] = [];
  let keptOuterResult = false;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      nextMessages.push(message);
      continue;
    }
    const content = message.content
      .map(part => {
        if (
          part.type === 'tool-result' &&
          part.toolCallId === request.callerToolCallId
        ) {
          if (keptOuterResult) {
            return undefined;
          }
          keptOuterResult = true;
          return { ...part, output: replacementOutput };
        }
        return part;
      })
      .filter(part => {
        if (part === undefined) {
          return false;
        }
        if (
          part.type === 'tool-call' &&
          part.toolCallId === request.toolCall.toolCallId
        ) {
          return false;
        }
        if (
          part.type === 'tool-approval-request' &&
          part.approvalId === request.approvalId
        ) {
          return false;
        }
        if (
          part.type === 'tool-approval-response' &&
          part.approvalId === request.approvalId
        ) {
          return false;
        }
        return !(
          part.type === 'tool-result' &&
          part.toolCallId === request.toolCall.toolCallId
        );
      });
    if (content.length > 0) {
      nextMessages.push({ ...message, content } as ModelMessage);
    }
  }
  return nextMessages;
}

function toModelToolOutput(value: unknown): ToolResultPart['output'] {
  return typeof value === 'string'
    ? { type: 'text', value }
    : {
        type: 'json',
        value: value === undefined ? null : (value as JSONValue),
      };
}
