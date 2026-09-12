import type {
  Context,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { ToolApprovalStatus, TypedToolCall } from 'ai';
import type { HarnessV1PermissionMode } from '../../v1';
import type { HarnessAgentToolApprovalConfiguration } from '../harness-agent-settings';

export const DEFAULT_PERMISSION_MODE: HarnessV1PermissionMode =
  'allow-all' as const;

export function resolvePermissionMode(input: {
  permissionMode: HarnessV1PermissionMode | undefined;
}): HarnessV1PermissionMode {
  return input.permissionMode ?? DEFAULT_PERMISSION_MODE;
}

export function permissionModeNeedsBuiltinSupport(input: {
  permissionMode: HarnessV1PermissionMode;
}): boolean {
  return input.permissionMode !== 'allow-all';
}

export type CustomToolApprovalDecision =
  | { readonly type: 'allow'; readonly reason?: string }
  | { readonly type: 'deny'; readonly reason?: string }
  | { readonly type: 'request'; readonly reason?: string };

export async function resolveCustomToolApproval<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
>(input: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS;
  toolsContext: InferToolSetContext<TOOLS>;
  messages: ModelMessage[];
  runtimeContext: RUNTIME_CONTEXT;
  toolApproval:
    | HarnessAgentToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>
    | undefined;
}): Promise<CustomToolApprovalDecision> {
  const configuredStatus =
    typeof input.toolApproval === 'function'
      ? await input.toolApproval({
          toolCall: input.toolCall,
          tools: input.tools,
          toolsContext: input.toolsContext,
          messages: input.messages,
          runtimeContext: input.runtimeContext,
        })
      : input.toolApproval?.[input.toolCall.toolName];
  const status = normalizeToolApprovalStatus({
    status: configuredStatus,
  });

  switch (status.type) {
    case 'not-applicable':
    case 'approved':
      return { type: 'allow', reason: status.reason };
    case 'denied':
      return { type: 'deny', reason: status.reason };
    case 'user-approval':
      return { type: 'request', reason: status.reason };
  }
}

function normalizeToolApprovalStatus(input: {
  status: ToolApprovalStatus | undefined;
}): Exclude<ToolApprovalStatus, string | undefined> {
  if (input.status === undefined) return { type: 'not-applicable' };
  if (typeof input.status === 'string') return { type: input.status };
  return input.status;
}
