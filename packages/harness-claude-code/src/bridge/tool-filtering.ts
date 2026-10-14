import type { StartMessage } from '../claude-code-bridge-protocol';

type BuiltinToolFiltering = StartMessage['builtinToolFiltering'];

const PUBLIC_TO_NATIVE: Readonly<Record<string, string>> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  glob: 'Glob',
  grep: 'Grep',
  webSearch: 'WebSearch',
  WebFetch: 'WebFetch',
  NotebookEdit: 'NotebookEdit',
  TodoWrite: 'TodoWrite',
  Agent: 'Agent',
  TaskCreate: 'TaskCreate',
  TaskGet: 'TaskGet',
  TaskUpdate: 'TaskUpdate',
  TaskList: 'TaskList',
  TaskStop: 'TaskStop',
  TaskOutput: 'TaskOutput',
  Monitor: 'Monitor',
  ListMcpResources: 'ListMcpResources',
  ReadMcpResource: 'ReadMcpResource',
  ExitPlanMode: 'ExitPlanMode',
  EnterWorktree: 'EnterWorktree',
  ExitWorktree: 'ExitWorktree',
  askUserQuestions: 'AskUserQuestion',
  Skill: 'Skill',
  ToolSearch: 'ToolSearch',
};

const PUBLIC_TOOL_NAMES = Object.keys(PUBLIC_TO_NATIVE);

function toNativeName(toolName: string): string {
  return PUBLIC_TO_NATIVE[toolName] ?? toolName;
}

export function resolveNativeTools(
  toolFiltering: BuiltinToolFiltering,
): string[] | undefined {
  if (toolFiltering == null || toolFiltering.mode === 'deny') return undefined;
  return toolFiltering.toolNames.map(name => toNativeName(name));
}

export function resolveInactiveNativeTools(
  toolFiltering: BuiltinToolFiltering,
): string[] {
  if (toolFiltering == null) return [];
  const inactiveToolNames =
    toolFiltering.mode === 'allow'
      ? PUBLIC_TOOL_NAMES.filter(
          name => !toolFiltering.toolNames.includes(name),
        )
      : toolFiltering.toolNames;
  return inactiveToolNames.map(name => toNativeName(name));
}
