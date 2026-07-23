// Long-running bridge that runs inside a sandbox alongside the `claude` CLI.
// The generic transport — WebSocket server, token auth, single-flight
// reconnect, the in-memory event log + `seq`, resume replay, and the
// lifecycle/meta files — lives in the shared `@ai-sdk/harness/bridge` runtime.
// This file supplies only the Claude-specific turn driver.

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { createCompactionLatch } from './compaction-latch';
import type { StartMessage } from '../claude-code-bridge-protocol';
import { randomUUID } from 'node:crypto';
import { argv, stdout } from 'node:process';

/*
 * CONSTRAINT — the third-party imports below are NEVER bundled into the
 * compiled `bridge/index.mjs`. They are declared `external` in
 * tsup.config.ts and resolved at runtime from the node_modules that this
 * bridge installs *inside the sandbox* from `src/bridge/package.json` (and
 * its pinned `pnpm-lock.yaml`). That bridge package.json — NOT this host
 * package — is the single source of truth for these packages and their
 * versions; the published `@ai-sdk/harness-claude-code` package does not
 * provide them at runtime.
 *
 * When adding or changing a third-party import here you MUST keep all three
 * in sync, or the bridge will either get the dependency bundled in or fail
 * to resolve it in the sandbox:
 *   1. the import statement below,
 *   2. the `external` array in tsup.config.ts, and
 *   3. the dependency entry in `src/bridge/package.json`.
 */
import * as claudeAgentSdk from '@anthropic-ai/claude-agent-sdk';
import * as mcpServerModule from '@modelcontextprotocol/sdk/server/mcp.js';
import { toClaudeSkillsOption } from './claude-skills-option';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
  defaultUsage,
  emitFinishStep,
  finishApprovalStep,
  mapUsage,
  type ClaudeMessage,
} from './create-emit-stream-event';
import { jsonSchemaToZodShape } from './json-schema-to-zod';

/*
 * Native Claude Code tool name → cross-harness common name. Tools outside this
 * map (e.g. `WebFetch`, `NotebookEdit`) have no common equivalent; their
 * native name is forwarded as-is on `tool-call` events.
 */
type CommonBuiltinToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'glob'
  | 'grep'
  | 'webSearch';

const NATIVE_TO_COMMON: Readonly<Record<string, CommonBuiltinToolName>> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Glob: 'glob',
  Grep: 'grep',
  WebSearch: 'webSearch',
};

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
  AskUserQuestion: 'AskUserQuestion',
  Skill: 'Skill',
  ToolSearch: 'ToolSearch',
};

const PUBLIC_TOOL_NAMES = Object.keys(PUBLIC_TO_NATIVE);

const NATIVE_TOOL_KINDS: Readonly<
  Record<string, 'readonly' | 'edit' | 'bash'>
> = {
  Read: 'readonly',
  Glob: 'readonly',
  Grep: 'readonly',
  WebSearch: 'readonly',
  WebFetch: 'readonly',
  TaskGet: 'readonly',
  TaskList: 'readonly',
  TaskOutput: 'readonly',
  ListMcpResources: 'readonly',
  ReadMcpResource: 'readonly',
  Write: 'edit',
  Edit: 'edit',
  NotebookEdit: 'edit',
  TodoWrite: 'edit',
  TaskCreate: 'edit',
  TaskUpdate: 'edit',
  TaskStop: 'edit',
  EnterWorktree: 'edit',
  ExitWorktree: 'edit',
  ExitPlanMode: 'edit',
  Skill: 'readonly',
  AskUserQuestion: 'readonly',
  ToolSearch: 'readonly',
  Bash: 'bash',
  Monitor: 'bash',
};

function toCommonName(nativeName: string): CommonBuiltinToolName | string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

function toNativeName(toolName: string): string {
  return PUBLIC_TO_NATIVE[toolName] ?? toolName;
}

function resolveNativeTools(start: StartMessage): string[] | undefined {
  const toolFiltering = start.builtinToolFiltering;
  if (toolFiltering == null) return undefined;
  const activeToolNames =
    toolFiltering.mode === 'allow'
      ? toolFiltering.toolNames
      : PUBLIC_TOOL_NAMES.filter(
          name => !toolFiltering.toolNames.includes(name),
        );
  return activeToolNames.map(name => toNativeName(name));
}

function resolveInactiveNativeTools(start: StartMessage): string[] {
  const toolFiltering = start.builtinToolFiltering;
  if (toolFiltering == null) return [];
  const inactiveToolNames =
    toolFiltering.mode === 'allow'
      ? PUBLIC_TOOL_NAMES.filter(
          name => !toolFiltering.toolNames.includes(name),
        )
      : toolFiltering.toolNames;
  return inactiveToolNames.map(name => toNativeName(name));
}

const args = parseArgs(argv.slice(2));
const workdir = args.workdir;
const bridgeStateDir = args.bridgeStateDir;
if (!workdir) {
  emitFatal('Missing --workdir argument.');
}
if (!bridgeStateDir) {
  emitFatal('Missing --bridge-state-dir argument.');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const claudeSdk = claudeAgentSdk as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mcpModule = mcpServerModule as any;

await runBridge<StartMessage>({
  bridgeType: 'claude-code',
  bridgeStateDir,
  onStart: runTurn,
  // Claude Code's session state lives in the workdir on the sandbox filesystem
  // (captured by the sandbox snapshot on stop); the resume payload is empty.
  onDetach: () => ({}),
});

type Emit = (msg: Record<string, unknown>) => void;

function createPermissionOptions(input: {
  start: StartMessage;
  inactiveNativeTools: readonly string[];
  turn: BridgeTurn;
  emit: Emit;
  finishApprovalStep: (approvalId: string) => void;
  nativeToolCallNames: Map<string, string>;
  approvalRequestedToolUseIds: Set<string>;
}): Record<string, unknown> {
  const permissionMode = input.start.permissionMode ?? 'allow-all';
  const inactiveNativeTools = new Set(input.inactiveNativeTools);
  const permissionSettings = createPermissionSettings({
    permissionMode,
    inactiveNativeTools,
  });
  if (permissionMode === 'allow-all' && inactiveNativeTools.size === 0) {
    return {
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    };
  }

  return {
    permissionMode:
      permissionMode === 'allow-edits' ? 'acceptEdits' : 'default',
    allowDangerouslySkipPermissions: false,
    ...(permissionSettings ? { settings: permissionSettings } : {}),
    canUseTool: async (
      toolName: string,
      toolInput: Record<string, unknown>,
      options: { toolUseID: string },
    ) => {
      if (toolName.startsWith('mcp__harness-tools__')) {
        return { behavior: 'allow', updatedInput: toolInput };
      }
      if (
        !inactiveNativeTools.has(toolName) &&
        !nativeToolRequiresApproval({
          nativeName: toolName,
          permissionMode,
        })
      ) {
        return { behavior: 'allow', updatedInput: toolInput };
      }

      const approvalId = options.toolUseID;
      input.approvalRequestedToolUseIds.add(approvalId);
      input.nativeToolCallNames.set(approvalId, toolName);
      input.emit({
        type: 'tool-call',
        toolCallId: approvalId,
        toolName: toCommonName(toolName),
        nativeName: toolName,
        input: JSON.stringify(toolInput ?? {}),
        providerExecuted: true,
      });
      input.emit({
        type: 'tool-approval-request',
        approvalId,
        toolCallId: approvalId,
      });
      input.finishApprovalStep(approvalId);

      const decision = await input.turn.requestToolApproval(approvalId);
      return decision.approved
        ? { behavior: 'allow', updatedInput: toolInput, toolUseID: approvalId }
        : {
            behavior: 'deny',
            message: decision.reason ?? 'Denied',
            toolUseID: approvalId,
          };
    },
  };
}

function createPermissionSettings(input: {
  permissionMode: 'allow-reads' | 'allow-edits' | 'allow-all';
  inactiveNativeTools: ReadonlySet<string>;
}): Record<string, unknown> | undefined {
  const askRules = new Set<string>();
  for (const [nativeName, kind] of Object.entries(NATIVE_TOOL_KINDS)) {
    if (
      input.inactiveNativeTools.has(nativeName) ||
      (input.permissionMode === 'allow-reads'
        ? kind === 'edit' || kind === 'bash'
        : input.permissionMode === 'allow-edits'
          ? kind === 'bash'
          : false)
    ) {
      askRules.add(`${nativeName}(*)`);
    }
  }

  if (askRules.size === 0) return undefined;

  return {
    permissions: { ask: [...askRules] },
    sandbox: { autoAllowBashIfSandboxed: false },
  };
}

function nativeToolRequiresApproval(input: {
  nativeName: string;
  permissionMode: 'allow-reads' | 'allow-edits' | 'allow-all';
}): boolean {
  if (input.permissionMode === 'allow-all') return false;
  const kind = NATIVE_TOOL_KINDS[input.nativeName] ?? 'edit';
  if (input.permissionMode === 'allow-edits') return kind === 'bash';
  return kind === 'edit' || kind === 'bash';
}

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit: Emit = msg => turn.emit(msg as BridgeEvent);

  // Local controller for the Claude query. Aborted either by the host (via the
  // shared runtime's `turn.abortSignal`) or by us on a terminal error.
  const abortCtl = new AbortController();
  if (turn.abortSignal.aborted) {
    abortCtl.abort();
  } else {
    turn.abortSignal.addEventListener('abort', () => abortCtl.abort(), {
      once: true,
    });
  }

  const streamEventState = createClaudeStreamEventState();

  const mcpServers: Record<string, unknown> = {};
  if (start.tools && start.tools.length > 0) {
    const server = new mcpModule.McpServer({
      name: 'harness-tools',
      version: '1.0.0',
    });
    for (const tool of start.tools) {
      const shape = jsonSchemaToZodShape(tool.inputSchema);
      server.tool(
        tool.name,
        tool.description ?? '',
        shape,
        async (input: Record<string, unknown>) => {
          const toolCallId = randomUUID();
          emit({
            type: 'tool-call',
            toolCallId,
            toolName: tool.name,
            input: JSON.stringify(input),
            providerExecuted: false,
          });
          const { output, isError } = await turn.requestToolResult(toolCallId);
          emit({
            type: 'tool-result',
            toolCallId,
            toolName: tool.name,
            result: output ?? null,
            isError: !!isError,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(output ?? null) }],
            isError,
          };
        },
      );
    }
    mcpServers['harness-tools'] = {
      type: 'sdk',
      name: 'harness-tools',
      instance: server,
    };
  }

  // Compaction observation: merge Claude's `compact_boundary` message and
  // `PostCompact` hook (which arrive in either order) into one `compaction`
  // event. See `createCompactionLatch`.
  const compaction = createCompactionLatch(event => emit(event));

  // `stream-start` is emitted lazily on the first SDK message (below) so it can
  // carry the model the CLI resolved to, reported on the `system`/`init` message.

  const queryInput = createQueryInput({
    initialUserMessage: start.prompt,
    pendingUserMessages: turn.pendingUserMessages,
    abortSignal: abortCtl.signal,
  });
  const skillsOption = toClaudeSkillsOption(start.skills);
  const nativeTools = resolveNativeTools(start);
  const inactiveNativeTools = resolveInactiveNativeTools(start);
  const permissionOptions = createPermissionOptions({
    start,
    inactiveNativeTools,
    turn,
    emit,
    finishApprovalStep: approvalId => {
      finishApprovalStep({ state: streamEventState, emit, approvalId });
    },
    nativeToolCallNames: streamEventState.nativeToolCallNames,
    approvalRequestedToolUseIds: streamEventState.approvalRequestedToolUseIds,
  });

  const q = claudeSdk.query({
    prompt: queryInput.input,
    options: {
      ...(start.model ? { model: start.model } : {}),
      ...(start.maxTurns !== undefined ? { maxTurns: start.maxTurns } : {}),
      ...(skillsOption ? { skills: skillsOption } : {}),
      ...(nativeTools !== undefined ? { tools: nativeTools } : {}),
      ...(inactiveNativeTools.length > 0
        ? { disallowedTools: inactiveNativeTools }
        : {}),
      thinking: start.thinking,
      includePartialMessages: true,
      // The `PostCompact` hook carries the compaction summary, which the
      // `compact_boundary` system message does not. Latch it for the unified
      // `compaction` event; return an empty output so compaction proceeds.
      hooks: {
        PostCompact: [
          {
            hooks: [
              async (input: { compact_summary?: unknown }) => {
                if (typeof input?.compact_summary === 'string') {
                  compaction.onSummary(input.compact_summary);
                }
                return {};
              },
            ],
          },
        ],
      },
      // Continuation rule: the host can force-continue (resume after a
      // cross-process detach) by setting `start.continue: true`; otherwise
      // we continue every subsequent turn after the first one in this
      // bridge process.
      ...(start.continue === true || !turn.firstTurn ? { continue: true } : {}),
      ...permissionOptions,
      mcpServers,
      cwd: workdir,
      abortSignal: abortCtl.signal,
    },
  });
  turn.onInterrupt(() => q.interrupt());

  let turnUsage: Record<string, unknown> | undefined;
  let totalCostUsd: number | undefined;
  let emittedTerminalError = false;
  let emittedTerminalFinish = false;

  const emitTerminalError = (message: string | undefined): void => {
    const normalized = message?.trim();
    if (!normalized || emittedTerminalError || emittedTerminalFinish) return;
    streamEventState.observedTerminalError = normalized;
    emittedTerminalError = true;
    turn.emitError({
      error: normalized,
      message: 'claude-code terminal error',
    });
    queryInput.close();
    abortCtl.abort();
  };

  const emitStreamEvent = createEmitStreamEvent({
    state: streamEventState,
    emit,
    emitWarning: turn.emitWarning,
    emitTerminalError,
    onCompactionBoundary: boundary => compaction.onBoundary(boundary),
    toCommonName,
  });

  try {
    for await (const msg of q as AsyncIterable<ClaudeMessage>) {
      if (abortCtl.signal.aborted) break;

      const type = msg.type;

      emitStreamEvent(msg);

      if (type === 'result') {
        if (msg.subtype === 'success') {
          const emptyResult = !msg.result?.trim?.();
          if (emptyResult && streamEventState.observedTerminalError) {
            emitTerminalError(streamEventState.observedTerminalError);
            continue;
          }
          const usage = msg.usage ?? msg.message?.usage;
          const harnessUsage = mapUsage(usage);
          if (harnessUsage) turnUsage = harnessUsage;
          if (typeof msg.total_cost_usd === 'number') {
            totalCostUsd = (totalCostUsd ?? 0) + msg.total_cost_usd;
          }
          if (streamEventState.stepOpen) {
            emitFinishStep({
              state: streamEventState,
              emit,
              usage: harnessUsage ?? streamEventState.pendingStepUsage,
            });
          }
          queryInput.close();
          break;
        } else {
          emitTerminalError(
            (Array.isArray(msg.errors) ? msg.errors.join('\n') : undefined) ||
              streamEventState.observedTerminalError ||
              msg.result ||
              'Unknown error',
          );
        }
        continue;
      }
    }
  } catch (err) {
    if (!(abortCtl.signal.aborted && emittedTerminalError)) {
      turn.emitError({ error: err, message: 'claude-code turn failed' });
    }
    return;
  } finally {
    queryInput.close();
  }

  if (emittedTerminalError) return;
  emittedTerminalFinish = true;
  void emittedTerminalFinish;
  emit({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: turnUsage ?? streamEventState.stepUsage ?? defaultUsage(),
    ...(totalCostUsd !== undefined
      ? { harnessMetadata: { 'claude-code': { costUsd: totalCostUsd } } }
      : {}),
  });
}

function createQueryInput({
  initialUserMessage,
  pendingUserMessages,
  abortSignal,
}: {
  initialUserMessage: string;
  pendingUserMessages: string[];
  abortSignal: AbortSignal;
}): {
  input: AsyncIterable<unknown>;
  close(): void;
} {
  let closed = false;
  const close = (): void => {
    closed = true;
  };
  if (abortSignal.aborted) {
    close();
  } else {
    abortSignal.addEventListener('abort', close, { once: true });
  }

  const toUserMessage = (text: string): unknown => ({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  });

  return {
    close,
    input: {
      [Symbol.asyncIterator]() {
        let sentInitial = false;
        return {
          async next() {
            // eslint-disable-next-line no-unmodified-loop-condition
            while (!closed && !abortSignal.aborted) {
              if (!sentInitial) {
                sentInitial = true;
                return {
                  value: toUserMessage(initialUserMessage),
                  done: false,
                };
              }
              if (pendingUserMessages.length > 0) {
                return {
                  value: toUserMessage(pendingUserMessages.shift()!),
                  done: false,
                };
              }
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            return { value: undefined, done: true } as IteratorResult<unknown>;
          },
        };
      },
    },
  };
}

function parseArgs(args: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
} {
  const out: { workdir?: string; bridgeStateDir?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && i + 1 < args.length) {
      out.workdir = args[++i];
    } else if (args[i] === '--bridge-state-dir' && i + 1 < args.length) {
      out.bridgeStateDir = args[++i];
    }
  }
  return out;
}

function emitFatal(message: string): never {
  stdout.write(JSON.stringify({ type: 'bridge-fatal', message }) + '\n');
  process.exit(1);
}
