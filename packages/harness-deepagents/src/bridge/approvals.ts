import type { StartMessage } from '../deepagents-bridge-protocol';

export type PermissionMode = NonNullable<StartMessage['permissionMode']>;

// Native built-in tool -> approval kind (mirrors the host adapter's toolUseKind).
export const NATIVE_TOOL_KIND: Readonly<
  Record<string, 'readonly' | 'edit' | 'bash'>
> = {
  read_file: 'readonly',
  write_file: 'edit',
  edit_file: 'edit',
  execute: 'bash',
  grep: 'readonly',
  glob: 'readonly',
  ls: 'readonly',
};

export function builtinToolRequiresApproval(
  kind: 'readonly' | 'edit' | 'bash',
  permissionMode: PermissionMode,
): boolean {
  if (permissionMode === 'allow-all') return false;
  if (permissionMode === 'allow-edits') return kind === 'bash';
  return kind === 'edit' || kind === 'bash';
}

// Per-tool HITL config for createDeepAgent; only built-ins are gated (host tools approve at the agent layer).
export function buildInterruptOn(
  permissionMode: PermissionMode | undefined,
):
  | Record<string, { allowedDecisions: Array<'approve' | 'reject'> }>
  | undefined {
  if (!permissionMode || permissionMode === 'allow-all') return undefined;
  const config: Record<
    string,
    { allowedDecisions: Array<'approve' | 'reject'> }
  > = {};
  for (const [nativeName, kind] of Object.entries(NATIVE_TOOL_KIND)) {
    if (builtinToolRequiresApproval(kind, permissionMode)) {
      config[nativeName] = { allowedDecisions: ['approve', 'reject'] };
    }
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

type ActionRequest = { name: string; args?: Record<string, unknown> };
type HITLInterruptValue = { actionRequests?: ActionRequest[] };

// Flatten LangChain HITL interrupt payloads into the gated tool calls awaiting a decision.
export function collectActionRequests(
  interrupts: Array<{ value?: unknown }>,
): { name: string; args: Record<string, unknown> }[] {
  const out: { name: string; args: Record<string, unknown> }[] = [];
  for (const interrupt of interrupts) {
    const value = interrupt.value as HITLInterruptValue | undefined;
    for (const action of value?.actionRequests ?? []) {
      out.push({ name: action.name, args: action.args ?? {} });
    }
  }
  return out;
}
