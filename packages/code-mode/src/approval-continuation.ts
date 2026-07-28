import { generateText, type ModelMessage, streamText } from 'ai';
import {
  assertCodeModeApprovalResponse,
  CODE_MODE_TOOL_APPROVAL_KIND,
} from './approval.js';
import { CodeModeProtocolError } from './errors.js';
import {
  continueCodeModeInterrupt,
  getCodeModeInterrupt,
  isCodeModeInterrupt,
} from './interrupt-continuation.js';
import type {
  CodeModeApprovalInterrupt,
  CodeModeApprovalResolution,
  CodeModeApprovalResponse,
  CodeModeContinuationSecurityOptions,
  CodeModeOptions,
  CodeModeToolExecutionOptions,
  CodeModeToolSet,
} from './types.js';

/**
 * Returns true when a value is a code-mode approval interruption.
 *
 * An approval interruption is a `CodeModeInterrupt` whose payload kind is the
 * reserved approval kind, so this also implies `isCodeModeInterrupt`.
 */
export function isCodeModeApprovalInterrupt(
  value: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): value is CodeModeApprovalInterrupt {
  return (
    isCodeModeInterrupt(value, continuationSecurity) &&
    value.payload.kind === CODE_MODE_TOOL_APPROVAL_KIND
  );
}

/**
 * Continues a code-mode invocation that previously returned an approval
 * interruption.
 *
 * This is a thin adapter over `continueCodeModeInterrupt`: it validates the AI
 * SDK approval response, maps it to a boolean approval resolution, and forces
 * interrupt-mode approval so any further nested approvals interrupt as well.
 */
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
      {
        expectedApprovalId: interrupt.interruptId,
        receivedApprovalId: approvalResponse.approvalId,
      },
    );
  }

  const resolution: CodeModeApprovalResolution = {
    approved: approvalResponse.approved,
    ...(approvalResponse.reason !== undefined
      ? { reason: approvalResponse.reason }
      : {}),
  };

  return await continueCodeModeInterrupt({
    interrupt,
    resolution,
    tools,
    options: withInterruptApproval(options),
    ...(toolExecutionOptions !== undefined ? { toolExecutionOptions } : {}),
  });
}

/**
 * Builds AI SDK model messages that expose a code-mode nested approval as an
 * approval request for the original inner tool name and input.
 *
 * The interruption id is used as the AI SDK approval id.
 */
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

/**
 * Finds the AI SDK approval response for a stored code-mode approval
 * interruption in a model message list.
 */
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
        (part.reason === undefined || typeof part.reason === 'string') &&
        (!('toolCallId' in part) || part.toolCallId === interrupt.toolCallId)
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

/**
 * Finds a code-mode approval interruption in an AI SDK result-like object.
 */
export function getCodeModeApprovalInterrupt(
  result: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): CodeModeApprovalInterrupt | undefined {
  const interrupt = getCodeModeInterrupt(result, continuationSecurity);
  return interrupt !== undefined &&
    isCodeModeApprovalInterrupt(interrupt, continuationSecurity)
    ? interrupt
    : undefined;
}

/**
 * Runs `generateText` and annotates the returned result with any code-mode
 * approval interruption and AI SDK approval messages.
 */
export async function generateTextWithCodeModeApprovals(
  options: Parameters<typeof generateText>[0],
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): Promise<
  Awaited<ReturnType<typeof generateText>> & {
    codeModeApproval: CodeModeApprovalInterrupt | undefined;
    codeModeApprovalMessages: ModelMessage[];
  }
> {
  const result = await generateText(options as never);
  return attachCodeModeApprovalResult(result, continuationSecurity);
}

/**
 * Runs `streamText` and adds a `codeModeApproval` promise that resolves to any
 * approval interruption found in the final tool results.
 */
export function streamTextWithCodeModeApprovals(
  options: Parameters<typeof streamText>[0],
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): ReturnType<typeof streamText> & {
  codeModeApproval: Promise<CodeModeApprovalInterrupt | undefined>;
} {
  const result = streamText(options as never);
  return Object.assign(result, {
    codeModeApproval: Promise.resolve(result.toolResults).then(toolResults =>
      getCodeModeApprovalInterrupt({ toolResults }, continuationSecurity),
    ),
  });
}

/**
 * Wraps a ToolLoopAgent-like object so `generate`/`stream` results expose
 * code-mode approval interruption metadata.
 */
export function wrapToolLoopAgentForCodeModeApprovals<
  T extends {
    generate?: (...args: any[]) => Promise<unknown>;
    stream?: (...args: any[]) => Promise<unknown>;
  },
>(agent: T, continuationSecurity: CodeModeContinuationSecurityOptions = {}): T {
  return new Proxy(agent, {
    get(target, property, receiver) {
      if (property === 'generate' && typeof target.generate === 'function') {
        return async (...args: any[]) =>
          attachCodeModeApprovalResult(
            await target.generate!(...args),
            continuationSecurity,
          );
      }
      if (property === 'stream' && typeof target.stream === 'function') {
        return async (...args: any[]) => {
          const result = await target.stream!(...args);
          if (isRecord(result) && 'toolResults' in result) {
            return Object.assign(result, {
              codeModeApproval: Promise.resolve(result.toolResults).then(
                toolResults =>
                  getCodeModeApprovalInterrupt(
                    { toolResults },
                    continuationSecurity,
                  ),
              ),
            });
          }
          return result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * Adds approval interruption metadata to a result-like object.
 */
export function attachCodeModeApprovalResult<T>(
  result: T,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): T & {
  codeModeApproval: CodeModeApprovalInterrupt | undefined;
  codeModeApprovalMessages: ModelMessage[];
} {
  const codeModeApproval = getCodeModeApprovalInterrupt(
    result,
    continuationSecurity,
  );
  return Object.assign(result as object, {
    codeModeApproval,
    codeModeApprovalMessages:
      codeModeApproval === undefined
        ? []
        : toCodeModeApprovalMessages(codeModeApproval),
  }) as T & {
    codeModeApproval: CodeModeApprovalInterrupt | undefined;
    codeModeApprovalMessages: ModelMessage[];
  };
}

function withInterruptApproval(options: CodeModeOptions): CodeModeOptions {
  return {
    ...options,
    approval: {
      ...options.approval,
      mode: 'interrupt',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
