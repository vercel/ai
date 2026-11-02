import type { StartMessage } from '../deepagents-bridge-protocol';
import type { InterruptOnConfig } from 'langchain';
import { areFileToolPathsTrusted } from './permission-paths';

export type PermissionMode = NonNullable<StartMessage['permissionMode']>;

// Native built-in tool -> approval kind (mirrors the host adapter's toolUseKind).
export const NATIVE_TOOL_KIND: Readonly<
  Record<string, 'readonly' | 'edit' | 'bash'>
> = {
  read_file: 'readonly',
  write_file: 'edit',
  edit_file: 'edit',
  delete_file: 'edit',
  execute: 'bash',
  grep: 'readonly',
  glob: 'readonly',
  ls: 'readonly',
  task: 'edit',
  write_todos: 'edit',
};

const NATIVE_TO_COMMON: Readonly<Record<string, string>> = {
  read_file: 'read',
  write_file: 'write',
  edit_file: 'edit',
  execute: 'bash',
};

export function toCommonName(nativeName: string): string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

export function isBuiltinToolIncluded(input: {
  nativeName: string;
  toolFiltering: StartMessage['builtinToolFiltering'];
}): boolean {
  if (input.toolFiltering == null) return true;
  const toolName = toCommonName(input.nativeName);
  return input.toolFiltering.mode === 'allow'
    ? input.toolFiltering.toolNames.includes(toolName)
    : !input.toolFiltering.toolNames.includes(toolName);
}

export function builtinToolRequiresApproval(
  kind: 'readonly' | 'edit' | 'bash',
  permissionMode: PermissionMode,
): boolean {
  if (permissionMode === 'allow-all') return false;
  if (permissionMode === 'allow-edits') return kind === 'bash';
  return kind === 'edit' || kind === 'bash';
}

// Per-tool HITL config for createDeepAgent; only built-ins are gated (host tools approve at the agent layer).
export function buildInterruptOn(options: {
  permissionMode: PermissionMode | undefined;
  builtinToolFiltering: StartMessage['builtinToolFiltering'];
  workDir: string;
  readableSkillRoots: readonly string[];
}): Record<string, InterruptOnConfig> | undefined {
  if (options.permissionMode == null || options.permissionMode === 'allow-all')
    return undefined;
  const config: Record<string, InterruptOnConfig> = {};
  for (const [nativeName, kind] of Object.entries(NATIVE_TOOL_KIND)) {
    if (
      !isBuiltinToolIncluded({
        nativeName,
        toolFiltering: options.builtinToolFiltering,
      })
    )
      continue;
    if (builtinToolRequiresApproval(kind, options.permissionMode)) {
      config[nativeName] = { allowedDecisions: ['approve', 'reject'] };
    } else if (
      [
        'read_file',
        'write_file',
        'edit_file',
        'delete_file',
        'ls',
        'grep',
        'glob',
      ].includes(nativeName)
    ) {
      config[nativeName] = {
        allowedDecisions: ['approve', 'reject'],
        when: async ({ toolCall }) => {
          const args = toolCall.args;
          let target: unknown;
          const access = kind === 'edit' ? 'write' : 'read';
          if (nativeName === 'glob') {
            if (
              typeof args.pattern !== 'string' ||
              /\.\.|[{}()[\]]/.test(args.pattern) ||
              args.pattern.includes('\\') ||
              args.pattern.startsWith('/')
            )
              return true;
            target =
              args.path == null || args.path === '/'
                ? options.workDir
                : args.path;
          } else if (nativeName === 'ls' || nativeName === 'grep') {
            target = args.path ?? '/';
          } else {
            target = 'file_path' in args ? args.file_path : args.path;
          }
          if (typeof target !== 'string') return true;
          return !(await areFileToolPathsTrusted({
            workDir: options.workDir,
            cwd: options.workDir,
            paths: [target],
            access,
            readableSkillRoots: options.readableSkillRoots,
          }));
        },
      };
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
