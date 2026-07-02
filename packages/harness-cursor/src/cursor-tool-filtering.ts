import type { HarnessV1BuiltinToolFiltering } from '@ai-sdk/harness';
import type { StartMessage } from './cursor-bridge-protocol';

/**
 * Cursor native tool name → cross-harness common name.
 */
export const CURSOR_NATIVE_TO_COMMON: Readonly<Record<string, string>> = {
  shell: 'bash',
  Shell: 'bash',
  read: 'read',
  Read: 'read',
  write: 'write',
  Write: 'write',
  edit: 'edit',
  Edit: 'edit',
  grep: 'grep',
  Grep: 'grep',
  glob: 'glob',
  Glob: 'glob',
  ls: 'ls',
  Ls: 'ls',
  list: 'ls',
  List: 'ls',
  semSearch: 'semSearch',
  sem_search: 'semSearch',
  SemSearch: 'semSearch',
};

export function toCursorCommonName(nativeName: string): string {
  return CURSOR_NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

export function isCursorBuiltinToolIncluded(input: {
  nativeName: string;
  hostToolNames: ReadonlySet<string>;
  toolFiltering: HarnessV1BuiltinToolFiltering | undefined;
}): boolean {
  if (input.hostToolNames.has(input.nativeName)) return true;
  if (input.toolFiltering == null) return true;
  const toolName = toCursorCommonName(input.nativeName);
  return input.toolFiltering.mode === 'allow'
    ? input.toolFiltering.toolNames.includes(toolName)
    : !input.toolFiltering.toolNames.includes(toolName);
}

export function getCursorBuiltinToolFilteringDenialReason(input: {
  nativeName: string;
}): string {
  const toolName = toCursorCommonName(input.nativeName);
  return `Tool '${toolName}' is inactive due to the HarnessAgent tool filtering policy.`;
}

export type CursorBuiltinToolFiltering = StartMessage['builtinToolFiltering'];
