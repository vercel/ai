import type { ProviderOptions } from './provider-options';
import type { Tool } from './tool';
import type { ToolApprovalResponse } from './tool-approval-response';
import type { ToolCall } from './tool-call';
import type { ToolExecutionOptions } from './tool-execute-function';
import type { ToolSet } from './tool-set';

type ResolvedToolApprovalStatus =
  | { type: 'not-applicable'; reason?: never }
  | { type: 'approved'; reason?: string }
  | { type: 'denied'; reason?: string }
  | { type: 'user-approval'; reason?: never };

type ToolCallerApprovalRequest = {
  approvalId: string;
  callerToolCallId: string;
  toolCall: ToolCall<string, unknown>;
};

type ToolCallerBindContext = {
  resolveToolApproval: (
    toolCall: ToolCall<string, unknown>,
  ) => Promise<ResolvedToolApprovalStatus>;
};

export type ToolCallerDefinition =
  | {
      type: 'local';
      bind: (tools: ToolSet, context: ToolCallerBindContext) => Tool;
      getApprovalRequest?: (
        output: unknown,
      ) => ToolCallerApprovalRequest | undefined;
      continueApproval?: (options: {
        output: unknown;
        approvalResponse: ToolApprovalResponse;
        tools: ToolSet;
        toolExecutionOptions: Partial<ToolExecutionOptions<unknown>>;
        resolveToolApproval: ToolCallerBindContext['resolveToolApproval'];
      }) => Promise<unknown>;
    }
  | {
      type: 'provider';
      prepareProviderOptions: (
        providerOptions: ProviderOptions | undefined,
      ) => ProviderOptions;
    };

export type ToolWithCaller<TOOL extends Tool = Tool> = TOOL & {
  readonly experimental_toolCaller: ToolCallerDefinition;
};

export function toolCaller<TOOL extends Tool>(
  tool: TOOL,
  definition: ToolCallerDefinition,
): ToolWithCaller<TOOL> {
  return Object.defineProperty({ ...tool }, 'experimental_toolCaller', {
    value: definition,
  }) as ToolWithCaller<TOOL>;
}

export function getToolCaller(
  tool: Tool | undefined,
): ToolCallerDefinition | undefined {
  return (tool as ToolWithCaller | undefined)?.experimental_toolCaller;
}
