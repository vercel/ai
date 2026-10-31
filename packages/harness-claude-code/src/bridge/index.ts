// Long-running bridge that runs inside a sandbox alongside the `claude` CLI.
// The generic transport — WebSocket server, token auth, single-flight
// reconnect, the in-memory event log + `seq`, resume replay, and the
// lifecycle/meta files — lives in the shared `@ai-sdk/harness/bridge` runtime.
// This file supplies only the Claude-specific turn driver.

import {
  runBridge,
  convertHarnessToolModelOutput,
  type BridgeEvent,
  type BridgeTurn,
  type Experimental_BridgeUserMessage,
  type Experimental_BridgeUserMessageQueue,
} from '@ai-sdk/harness/bridge';
import { createCompactionLatch } from './compaction-latch';
import type { StartMessage } from '../claude-code-bridge-protocol';
import { randomUUID } from 'node:crypto';
import { argv, env as procEnv, stdout } from 'node:process';

/*
 * CONSTRAINT — the third-party imports below are NEVER bundled into the
 * compiled `bridge/index.mjs`. They are declared `external` in
 * tsdown.config.ts and resolved at runtime from the node_modules that this
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
 *   2. the `external` array in tsdown.config.ts, and
 *   3. the dependency entry in `src/bridge/package.json`.
 */
import * as claudeAgentSdk from '@anthropic-ai/claude-agent-sdk';
import type {
  HookCallback,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import * as mcpServerModule from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClaudeCodeSystemPrompt } from './claude-code-system-prompt';
import { toClaudeSkillsOption } from './claude-skills-option';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
  defaultUsage,
  emitFinishStep,
  markWaitingOnHostInput,
  clearWaitingOnHostInput,
  resolveMcpHandlerToolUseId,
  isExternalMcpTool,
  mapUsage,
  type ClaudeMessage,
} from './create-emit-stream-event';
import { jsonSchemaToZodObject } from './json-schema-to-zod';
import {
  resolveInactiveNativeTools,
  resolveNativeTools,
} from './tool-filtering';
import {
  claudeCodeQuestionKey,
  toClaudeCodeQuestionResult,
  toHarnessQuestionsInput,
} from './question-tool';

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
  | 'webSearch'
  | 'askUserQuestions';

const NATIVE_TO_COMMON: Readonly<Record<string, CommonBuiltinToolName>> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Glob: 'glob',
  Grep: 'grep',
  WebSearch: 'webSearch',
  AskUserQuestion: 'askUserQuestions',
};

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
  ListAgents: 'readonly',
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

/**
 * The Claude session id most recently reported by the SDK, captured from the
 * message stream. Every turn in this bridge process may fork a new id (the
 * SDK's `continue`/`resume` create a new session linked to the previous one),
 * so the latest observation is the one a later resume must name.
 */
let lastClaudeSessionId: string | undefined;

await runBridge<StartMessage>({
  bridgeType: 'claude-code',
  bridgeStateDir,
  onStart: runTurn,
  // Claude Code's conversation state lives in the runtime's own store, keyed
  // by working directory. The resume payload names the exact conversation so a
  // later resume does not have to fall back to "most recent in this workdir".
  onStop: () =>
    lastClaudeSessionId == null ? {} : { claudeSessionId: lastClaudeSessionId },
});

type Emit = (msg: Record<string, unknown>) => void;

function createPermissionOptions(input: {
  start: StartMessage;
  inactiveNativeTools: readonly string[];
  turn: BridgeTurn;
  emit: Emit;
  markWaitingOnHostInput: (toolUseId: string) => void;
  clearWaitingOnHostInput: (toolUseId: string) => void;
  nativeToolCallNames: Map<string, string>;
  approvalRequestedToolUseIds: Set<string>;
  emittedToolCallIds: Set<string>;
  approvalDecisions: Map<string, { approved: boolean; reason?: string }>;
}): Record<string, unknown> {
  const permissionMode = input.start.permissionMode ?? 'allow-all';
  const inactiveNativeTools = new Set(input.inactiveNativeTools);
  const permissionSettings = createPermissionSettings({
    permissionMode,
    inactiveNativeTools,
  });

  const baseOptions = {
    permissionMode:
      permissionMode === 'allow-all'
        ? 'bypassPermissions'
        : permissionMode === 'allow-edits'
          ? 'acceptEdits'
          : 'default',
    allowDangerouslySkipPermissions: permissionMode === 'allow-all',
    ...(permissionSettings ? { settings: permissionSettings } : {}),
  };

  if (permissionMode === 'allow-all') {
    return {
      ...baseOptions,
      /*
       * Claude Code exposes AskUserQuestion in headless SDK sessions only
       * when a permission prompt tool is configured. The stdio prompt tool
       * preserves that tool surface without supplying the canUseTool callback
       * that bypassPermissions guarantees it will never invoke.
       */
      permissionPromptToolName: 'stdio',
    };
  }

  return {
    ...baseOptions,
    canUseTool: async (
      toolName: string,
      toolInput: Record<string, unknown>,
      options: { toolUseID: string },
    ) => {
      if (
        !needsHostApproval({ toolName, permissionMode, inactiveNativeTools })
      ) {
        return { behavior: 'allow', updatedInput: toolInput };
      }

      const approvalId = options.toolUseID;
      /*
       * The permission ask rules still apply after the approval hook allowed a
       * resumed deferred call, so apply that decision instead of asking the
       * host again.
       */
      if (input.approvalDecisions.get(approvalId)?.approved === true) {
        input.approvalDecisions.delete(approvalId);
        return {
          behavior: 'allow',
          updatedInput: toolInput,
          toolUseID: approvalId,
        };
      }
      input.approvalRequestedToolUseIds.add(approvalId);
      input.nativeToolCallNames.set(approvalId, toolName);
      if (!input.emittedToolCallIds.has(approvalId)) {
        input.emittedToolCallIds.add(approvalId);
        input.emit({
          type: 'tool-call',
          toolCallId: approvalId,
          toolName: toCommonName(toolName),
          nativeName: toolName,
          input: JSON.stringify(toolInput ?? {}),
          providerExecuted: true,
          ...(isExternalMcpTool(toolName) ? { dynamic: true } : {}),
        });
      }
      const decisionPromise = input.turn.requestToolApproval(approvalId);
      input.emit({
        type: 'tool-approval-request',
        approvalId,
        toolCallId: approvalId,
      });
      input.markWaitingOnHostInput(approvalId);

      const decision = await decisionPromise.finally(() =>
        input.clearWaitingOnHostInput(approvalId),
      );
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

function createQuestionPreToolUseHook(input: {
  turn: BridgeTurn;
  emit: Emit;
  nativeToolCallNames: Map<string, string>;
  markWaitingOnHostInput: (toolUseId: string) => void;
  clearWaitingOnHostInput: (toolUseId: string) => void;
}): HookCallback {
  return async (hookInput, toolUseID): Promise<HookJSONOutput> => {
    if (
      hookInput.hook_event_name !== 'PreToolUse' ||
      hookInput.tool_name !== 'AskUserQuestion'
    ) {
      return {};
    }

    const nativeInput = hookInput.tool_input as Parameters<
      typeof toHarnessQuestionsInput
    >[0];
    const canonicalInput = toHarnessQuestionsInput(nativeInput);
    const toolCallId = toolUseID ?? hookInput.tool_use_id;
    input.nativeToolCallNames.set(toolCallId, hookInput.tool_name);
    input.emit({
      type: 'tool-call',
      toolCallId,
      toolName: 'askUserQuestions',
      nativeName: hookInput.tool_name,
      input: JSON.stringify(canonicalInput),
      providerExecuted: false,
      providerMetadata: {
        'claude-code': {
          nativeRequest: nativeInput,
        },
      },
    });

    const questionKey = claudeCodeQuestionKey(nativeInput);
    input.markWaitingOnHostInput(toolCallId);
    const result = await input.turn
      .requestToolResult({
        toolCallId,
        matches: candidate => {
          const nativeRequest = candidate.toolResult?.providerOptions?.[
            'claude-code'
          ]?.nativeRequest as
            | Parameters<typeof claudeCodeQuestionKey>[0]
            | undefined;
          return (
            nativeRequest != null &&
            claudeCodeQuestionKey(nativeRequest) === questionKey
          );
        },
      })
      .finally(() => input.clearWaitingOnHostInput(toolCallId));
    const nativeResult = toClaudeCodeQuestionResult({
      nativeInput,
      output: result.output as Parameters<
        typeof toClaudeCodeQuestionResult
      >[0]['output'],
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        ...(nativeResult.behavior === 'allow'
          ? {
              permissionDecision: 'allow',
              updatedInput: {
                ...nativeResult.updatedInput,
              } as Record<string, unknown>,
            }
          : {
              permissionDecision: 'deny',
              permissionDecisionReason: nativeResult.message,
            }),
      },
    };
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

/**
 * Claude Code picks a model's output limit, system prompt and default effort
 * from its own reading of the model id, and misreads AI Gateway ids with a
 * dotted version such as `anthropic/claude-opus-5.5`. `modelOverrides` maps
 * the id Claude Code expects (`claude-opus-5-5`) to the gateway id, which
 * stays the id sent to the gateway.
 */
function createGatewayModelOverrides(
  model: string | undefined,
): Record<string, string> | undefined {
  if (!model?.startsWith('anthropic/')) return undefined;
  // Claude Code matches the value against the model id, suffix included, so a
  // suffix such as `[1m]` stays on the value.
  const id = model.slice('anthropic/'.length).replace(/\[[^\]]*\]$/, '');
  return id.includes('.') ? { [id.replace(/\./g, '-')]: model } : undefined;
}

function needsHostApproval(input: {
  toolName: string;
  permissionMode: 'allow-reads' | 'allow-edits' | 'allow-all';
  inactiveNativeTools: ReadonlySet<string>;
}): boolean {
  if (input.toolName.startsWith('mcp__harness-tools__')) return false;
  return (
    input.inactiveNativeTools.has(input.toolName) ||
    nativeToolRequiresApproval({
      nativeName: input.toolName,
      permissionMode: input.permissionMode,
    })
  );
}

/*
 * Defers a call that needs host approval, so Claude Code ends the turn and
 * keeps the call in the transcript instead of holding it in this process.
 * Resuming the session without a prompt fires the hook again for the same
 * call, and the host's decision is applied then. This survives a bridge
 * restart because nothing waits in memory.
 */
function createApprovalPreToolUseHook(input: {
  permissionMode: 'allow-reads' | 'allow-edits' | 'allow-all';
  inactiveNativeTools: ReadonlySet<string>;
  decisions: Map<string, { approved: boolean; reason?: string }>;
  deferredToolUseIds: Set<string>;
  nativeToolCallNames: Map<string, string>;
}): HookCallback {
  return async (hookInput, toolUseID): Promise<HookJSONOutput> => {
    const toolName = (hookInput as { tool_name?: unknown }).tool_name;
    if (
      toolUseID == null ||
      typeof toolName !== 'string' ||
      toolName === 'AskUserQuestion'
    ) {
      return {};
    }
    const decision = input.decisions.get(toolUseID);
    if (decision != null) {
      // A bridge that resumes another bridge's deferred call never saw its
      // tool_use, so record the name for the tool result that follows.
      input.nativeToolCallNames.set(toolUseID, toolName);
      if (!decision.approved) input.decisions.delete(toolUseID);
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          ...(decision.approved
            ? { permissionDecision: 'allow' }
            : {
                permissionDecision: 'deny',
                permissionDecisionReason: decision.reason ?? 'Denied',
              }),
        },
      };
    }
    if (
      !needsHostApproval({
        toolName,
        permissionMode: input.permissionMode,
        inactiveNativeTools: input.inactiveNativeTools,
      })
    ) {
      return {};
    }
    input.deferredToolUseIds.add(toolUseID);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'defer',
      },
    };
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
  // A host abort prefers the SDK's graceful `interrupt()` — Esc semantics: the
  // in-flight turn is persisted to the session transcript and settles with an
  // interrupted result, so a later resume (including the user's own
  // `claude --resume`) still sees the work done before the interrupt. The hard
  // abort kills the CLI process and loses that turn's records, so it is only
  // the fallback — armed unconditionally, because aborting an already-settled
  // query is a no-op — and the immediate path when the abort arrives before
  // the query exists.
  let gracefulAbort: (() => void) | undefined;
  let hardAbortTimer: ReturnType<typeof setTimeout> | undefined;
  const onHostAbort = (): void => {
    if (gracefulAbort) {
      gracefulAbort();
    } else {
      abortCtl.abort();
    }
  };
  if (turn.abortSignal.aborted) {
    abortCtl.abort();
  } else {
    turn.abortSignal.addEventListener('abort', onHostAbort, { once: true });
  }

  const streamEventState = createClaudeStreamEventState();

  const mcpServers: Record<string, unknown> = { ...start.mcpServers };
  if (start.tools && start.tools.length > 0) {
    const server = new mcpModule.McpServer({
      name: 'harness-tools',
      version: '1.0.0',
    });
    for (const tool of start.tools) {
      const hints = start.toolHints?.[tool.name];
      server.registerTool(
        tool.name,
        {
          description: tool.description ?? '',
          inputSchema: jsonSchemaToZodObject(tool.inputSchema),
          ...(hints?.readOnly == null
            ? {}
            : { annotations: { readOnlyHint: hints.readOnly } }),
          ...(hints?.alwaysLoad == null
            ? {}
            : { _meta: { 'anthropic/alwaysLoad': hints.alwaysLoad } }),
        },
        async (
          ...handlerArgs: [
            Record<string, unknown>,
            { requestId: string | number; _meta?: Record<string, unknown> },
          ]
        ) => {
          const [input, extra] = handlerArgs;
          const metadataToolCallId = extra._meta?.['claudecode/toolUseId'];
          const toolCallId =
            resolveMcpHandlerToolUseId({
              state: streamEventState,
              metadataToolUseId:
                typeof metadataToolCallId === 'string'
                  ? metadataToolCallId
                  : undefined,
              toolName: tool.name,
              input,
            }) ?? randomUUID();
          streamEventState.mcpHandlerCalls.set(toolCallId, {
            toolName: tool.name,
            input,
          });
          if (!streamEventState.emittedToolCallIds.has(toolCallId)) {
            streamEventState.emittedToolCallIds.add(toolCallId);
            emit({
              type: 'tool-call',
              toolCallId,
              toolName: tool.name,
              input: JSON.stringify(input),
              providerExecuted: false,
            });
            markWaitingOnHostInput({
              state: streamEventState,
              emit,
              toolUseId: toolCallId,
            });
          }
          const { output, isError, toolResult } = await turn
            .requestToolResult(toolCallId)
            .finally(() => {
              clearWaitingOnHostInput({
                state: streamEventState,
                toolUseId: toolCallId,
              });
              /*
               * A handler call that could not be matched to a reported
               * `tool_use` block never receives a native tool result, so it
               * must not keep the step open once the host has answered.
               */
              if (!streamEventState.mcpToolCalls.has(toolCallId)) {
                streamEventState.pendingStepToolUseIds.delete(toolCallId);
              }
            });
          emit({
            type: 'tool-result',
            toolCallId,
            toolName: tool.name,
            result: output ?? null,
            isError: !!isError,
          });
          if (toolResult != null) {
            const converted = convertHarnessToolModelOutput({
              output: toolResult.output,
            });
            return {
              content: converted.content.map(part =>
                part.type === 'text'
                  ? part
                  : {
                      type: 'image' as const,
                      data: part.data,
                      mimeType: part.mediaType,
                    },
              ),
              isError: isError === true || converted.isError,
            };
          }
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
  const compaction = createCompactionLatch(event => {
    const hasOpenStep = streamEventState.stepOpen;
    emit(event);
    // The harness translates compaction into synthetic step content. When
    // Claude reports it outside a model step, close that synthetic step here;
    // otherwise the existing model step will close it with its own usage.
    if (!hasOpenStep) {
      emitFinishStep({
        state: streamEventState,
        emit,
        usage: undefined,
      });
    }
  });

  // `stream-start` is emitted lazily on the first SDK message (below) so it can
  // carry the model the CLI resolved to, reported on the `system`/`init` message.

  const queryInput = createQueryInput({
    initialUserMessage: start.prompt,
    userMessages: turn.experimental_userMessages,
    abortSignal: abortCtl.signal,
  });
  const skillsOption = toClaudeSkillsOption(start.skills);
  const nativeTools = resolveNativeTools(start.builtinToolFiltering);
  const inactiveNativeTools = resolveInactiveNativeTools(
    start.builtinToolFiltering,
  );
  const permissionMode = start.permissionMode ?? 'allow-all';
  const approvalDecisions = new Map<
    string,
    { approved: boolean; reason?: string }
  >();
  const permissionOptions = createPermissionOptions({
    approvalDecisions,
    start,
    inactiveNativeTools,
    turn,
    emit,
    markWaitingOnHostInput: toolUseId =>
      markWaitingOnHostInput({ state: streamEventState, emit, toolUseId }),
    clearWaitingOnHostInput: toolUseId =>
      clearWaitingOnHostInput({ state: streamEventState, toolUseId }),
    nativeToolCallNames: streamEventState.nativeToolCallNames,
    approvalRequestedToolUseIds: streamEventState.approvalRequestedToolUseIds,
    emittedToolCallIds: streamEventState.emittedToolCallIds,
  });
  const modelOverrides = createGatewayModelOverrides(start.model);
  const deferredToolUseIds = new Set<string>();
  const approvalPreToolUseHook = createApprovalPreToolUseHook({
    permissionMode,
    inactiveNativeTools: new Set(inactiveNativeTools),
    decisions: approvalDecisions,
    deferredToolUseIds,
    nativeToolCallNames: streamEventState.nativeToolCallNames,
  });
  const settings = {
    ...(permissionOptions.settings as Record<string, unknown> | undefined),
    ...(start.skillOverrides !== undefined
      ? { skillOverrides: start.skillOverrides }
      : {}),
    ...(modelOverrides ? { modelOverrides } : {}),
  };
  const questionPreToolUseHook = createQuestionPreToolUseHook({
    turn,
    emit,
    nativeToolCallNames: streamEventState.nativeToolCallNames,
    markWaitingOnHostInput: toolUseId =>
      markWaitingOnHostInput({ state: streamEventState, emit, toolUseId }),
    clearWaitingOnHostInput: toolUseId =>
      clearWaitingOnHostInput({ state: streamEventState, toolUseId }),
  });

  const queryArgs = {
    prompt: queryInput.input,
    options: {
      ...(start.model ? { model: start.model } : {}),
      ...(start.maxTurns !== undefined ? { maxTurns: start.maxTurns } : {}),
      ...(start.maxBudgetUsd !== undefined
        ? { maxBudgetUsd: start.maxBudgetUsd }
        : {}),
      ...(start.strictMcpConfig !== undefined
        ? { strictMcpConfig: start.strictMcpConfig }
        : {}),
      ...(start.agentProgressSummaries !== undefined
        ? { agentProgressSummaries: start.agentProgressSummaries }
        : {}),
      ...(start.forwardSubagentText !== undefined
        ? { forwardSubagentText: start.forwardSubagentText }
        : {}),
      ...(start.env !== undefined ? { env: { ...procEnv, ...start.env } } : {}),
      ...(skillsOption ? { skills: skillsOption } : {}),
      ...(nativeTools !== undefined ? { tools: nativeTools } : {}),
      ...(inactiveNativeTools.length > 0
        ? { disallowedTools: inactiveNativeTools }
        : {}),
      systemPrompt: createClaudeCodeSystemPrompt(start.instructions, {
        excludeDynamicSections: start.excludeDynamicSections,
      }),
      thinking: start.thinking,
      ...(start.effort !== undefined ? { effort: start.effort } : {}),
      ...(start.responseFormat?.type === 'json' &&
      start.responseFormat.schema != null
        ? {
            outputFormat: {
              type: 'json_schema' as const,
              schema: start.responseFormat.schema,
            },
          }
        : {}),
      includePartialMessages: true,
      // The `PostCompact` hook carries the compaction summary, which the
      // `compact_boundary` system message does not. Latch it for the unified
      // `compaction` event; return an empty output so compaction proceeds.
      hooks: {
        PreToolUse: [
          ...(permissionMode === 'allow-all'
            ? []
            : [{ hooks: [approvalPreToolUseHook] }]),
          {
            matcher: 'AskUserQuestion',
            hooks: [questionPreToolUseHook],
            ...(start.questionTimeoutMs !== undefined
              ? { timeout: Math.ceil(start.questionTimeoutMs / 1000) }
              : {}),
          },
        ],
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
      // Continuation rule, most specific first.
      //
      // `resumeSessionId` names the exact conversation and is what a
      // cross-process resume should use: `continue` means "most recent thread
      // in this workdir", which silently picks the wrong one once anything
      // else has run there. The bridge also retains the id observed during its
      // previous query, so every later query stays pinned to that conversation
      // even when the host detached and reattached between turns. `resume` and
      // `continue` are mutually exclusive in the SDK.
      //
      // Otherwise the host can force-continue by setting `start.continue`,
      // and turns after the first fall back to the legacy cwd-based behavior
      // when no exact id was observed.
      ...((start.resumeSessionId ?? lastClaudeSessionId)
        ? { resume: start.resumeSessionId ?? lastClaudeSessionId }
        : start.continue === true || !turn.firstTurn
          ? { continue: true }
          : {}),
      ...permissionOptions,
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
      mcpServers,
      cwd: workdir,
      abortSignal: abortCtl.signal,
    },
  };
  let deferredToolUseId = start.deferredToolUseId;
  let resumingDeferredCall = false;
  let q = deferredToolUseId == null ? claudeSdk.query(queryArgs) : undefined;
  const hostAborted = new Promise<undefined>(resolve => {
    if (abortCtl.signal.aborted) resolve(undefined);
    abortCtl.signal.addEventListener('abort', () => resolve(undefined), {
      once: true,
    });
  });

  gracefulAbort = () => {
    // Backstop for the whole teardown, not just the interrupt call: if the
    // stream has not settled five seconds after a graceful interrupt was
    // requested, fall back to the hard abort. Aborting an already-settled
    // query is a no-op, and `unref` keeps the timer from pinning the bridge
    // process open on its own.
    hardAbortTimer = setTimeout(() => abortCtl.abort(), 5000);
    hardAbortTimer.unref?.();
    void Promise.resolve()
      .then(() => q?.interrupt())
      .catch(() => abortCtl.abort());
  };
  let turnUsage: Record<string, unknown> | undefined;
  let totalCostUsd: number | undefined;

  /*
   * Claude Code ended the turn at a call that needs host approval. Every other
   * call the hook deferred in the same message was dropped by Claude Code,
   * which can only resume one deferred call, so report those as not run.
   */
  let deferredDecision:
    | Promise<{ approved: boolean; reason?: string }>
    | undefined;
  const requestDeferredApproval = (call: {
    toolUseId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  }) => {
    for (const droppedToolUseId of deferredToolUseIds) {
      if (droppedToolUseId === call.toolUseId) continue;
      const nativeName =
        streamEventState.nativeToolCallNames.get(droppedToolUseId) ?? 'unknown';
      emit({
        type: 'tool-result',
        toolCallId: droppedToolUseId,
        toolName: toCommonName(nativeName),
        result:
          'Claude Code can wait for only one approval at a time, so this call did not run.',
        isError: true,
      });
      streamEventState.pendingStepToolUseIds.delete(droppedToolUseId);
    }
    deferredToolUseIds.clear();
    streamEventState.approvalRequestedToolUseIds.add(call.toolUseId);
    streamEventState.nativeToolCallNames.set(call.toolUseId, call.toolName);
    if (!streamEventState.emittedToolCallIds.has(call.toolUseId)) {
      streamEventState.emittedToolCallIds.add(call.toolUseId);
      emit({
        type: 'tool-call',
        toolCallId: call.toolUseId,
        toolName: toCommonName(call.toolName),
        nativeName: call.toolName,
        input: JSON.stringify(call.toolInput ?? {}),
        providerExecuted: true,
        ...(isExternalMcpTool(call.toolName) ? { dynamic: true } : {}),
      });
    }
    // Register before asking, so an answer that arrives while the deferred
    // query is still being disposed is not missed.
    deferredDecision = turn.requestToolApproval(call.toolUseId);
    emit({
      type: 'tool-approval-request',
      approvalId: call.toolUseId,
      toolCallId: call.toolUseId,
    });
    markWaitingOnHostInput({
      state: streamEventState,
      emit,
      toolUseId: call.toolUseId,
    });
  };
  let emittedTerminalError = false;
  let emittedTerminalFinish = false;

  const emitTerminalError = (message: string | undefined): void => {
    const normalized = message?.trim();
    if (!normalized || emittedTerminalError || emittedTerminalFinish) return;
    streamEventState.observedTerminalError = normalized;
    emittedTerminalError = true;
    // A turn the host itself stopped ends with an error-shaped result by
    // construction (an interrupted query reports a diagnostic, not success);
    // reporting the host's own stop as a terminal error makes every clean
    // interrupt look like a malfunction. The host has already settled the
    // turn on its side.
    if (!turn.abortSignal.aborted) {
      turn.emitError({
        error: normalized,
        message: 'claude-code terminal error',
      });
    }
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

  /*
   * Yields the messages of every query in this turn. When Claude Code defers a
   * call for host approval, wait for the decision and resume the session
   * without a prompt so the same call runs with that decision.
   */
  async function* messages(): AsyncGenerator<ClaudeMessage> {
    for (;;) {
      if (deferredToolUseId != null) {
        const toolUseId = deferredToolUseId;
        const decision = await Promise.race([
          deferredDecision ?? turn.requestToolApproval(toolUseId),
          hostAborted,
        ]).finally(() =>
          clearWaitingOnHostInput({ state: streamEventState, toolUseId }),
        );
        deferredDecision = undefined;
        if (decision == null || abortCtl.signal.aborted) return;
        approvalDecisions.set(toolUseId, decision);
        deferredToolUseId = undefined;
        resumingDeferredCall = true;
        q = claudeSdk.query({
          prompt: withoutInitialMessage(queryInput.input),
          options: {
            ...queryArgs.options,
            ...(lastClaudeSessionId != null
              ? { continue: undefined, resume: lastClaudeSessionId }
              : {}),
          },
        });
      }
      for await (const msg of q as AsyncIterable<ClaudeMessage>) {
        yield msg;
        if (deferredToolUseId != null) break;
      }
      if (deferredToolUseId == null || abortCtl.signal.aborted) return;
      queryInput.retire();
      await disposeQuery(q);
    }
  }

  try {
    for await (const msg of messages()) {
      if (abortCtl.signal.aborted) break;

      const type = msg.type;

      if (type === 'command_lifecycle') {
        queryInput.handleLifecycle(msg);
      }

      // Every SDK message carries the session id of the conversation it
      // belongs to. Track the latest so the stop payload and the terminal
      // finish metadata name the exact conversation.
      const sessionId = (msg as { session_id?: unknown }).session_id;
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        lastClaudeSessionId = sessionId;
      }

      emitStreamEvent(msg);

      if (
        type === 'result' &&
        msg.terminal_reason === 'tool_deferred' &&
        msg.deferred_tool_use?.id != null
      ) {
        const harnessUsage = mapUsage(msg.usage ?? msg.message?.usage);
        if (harnessUsage) turnUsage = addUsage(turnUsage, harnessUsage);
        if (typeof msg.total_cost_usd === 'number') {
          totalCostUsd = msg.total_cost_usd;
        }
        deferredToolUseId = msg.deferred_tool_use.id;
        requestDeferredApproval({
          toolUseId: msg.deferred_tool_use.id,
          toolName: msg.deferred_tool_use.name,
          toolInput: msg.deferred_tool_use.input,
        });
        continue;
      }

      if (type === 'result') {
        if (msg.subtype === 'success') {
          // `success` does not mean the turn succeeded: the CLI flags a rejected
          // request with `is_error` and puts the message in `result`, which the
          // empty-result rescue below cannot catch.
          if (msg.is_error) {
            emitTerminalError(
              msg.result?.trim() ||
                streamEventState.observedTerminalError ||
                (typeof msg.api_error_status === 'number'
                  ? `Claude Code reported an API error (HTTP ${msg.api_error_status})`
                  : 'Claude Code reported a failed result'),
            );
            continue;
          }
          const emptyResult = !msg.result?.trim?.();
          if (emptyResult && streamEventState.observedTerminalError) {
            emitTerminalError(streamEventState.observedTerminalError);
            continue;
          }
          const usage = msg.usage ?? msg.message?.usage;
          const harnessUsage = mapUsage(usage);
          if (harnessUsage) turnUsage = addUsage(turnUsage, harnessUsage);
          if (typeof msg.total_cost_usd === 'number') {
            totalCostUsd = msg.total_cost_usd;
          }
          if (
            start.responseFormat?.type === 'json' &&
            msg.structured_output !== undefined
          ) {
            const id = randomUUID();
            emit({ type: 'text-start', id });
            emit({
              type: 'text-delta',
              id,
              delta: JSON.stringify(msg.structured_output),
            });
            emit({ type: 'text-end', id });
            streamEventState.stepOpen = true;
          }
          if (streamEventState.stepOpen) {
            emitFinishStep({
              state: streamEventState,
              emit,
              usage: streamEventState.pendingStepUsage ?? harnessUsage,
            });
          }
          if (!resumingDeferredCall && !queryInput.answersSentMessage(msg)) {
            continue;
          }
          queryInput.observeResult();
          if (!queryInput.hasActiveUserMessages()) {
            queryInput.close();
            break;
          }
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

      if (queryInput.hasObservedResult && !queryInput.hasActiveUserMessages()) {
        queryInput.close();
        break;
      }
    }
  } catch (err) {
    // Same reasoning as `emitTerminalError`: a throw after the host's own
    // abort (e.g. the hard-abort fallback killing the CLI mid-iteration, or
    // a rejected `interrupt()`) is the stop the host asked for, not a
    // malfunction. The host has already settled the turn on its side.
    if (
      !turn.abortSignal.aborted &&
      !(abortCtl.signal.aborted && emittedTerminalError)
    ) {
      turn.emitError({ error: err, message: 'claude-code turn failed' });
    }
    return;
  } finally {
    // The turn is over; disarm the host-abort path first. An abort of this
    // turn's signal arriving after this point (e.g. an `abort` message racing
    // the next `start`) must not interrupt the disposed query or arm the
    // hard-abort fallback timer for it.
    gracefulAbort = undefined;
    if (hardAbortTimer != null) clearTimeout(hardAbortTimer);
    turn.abortSignal.removeEventListener('abort', onHostAbort);
    queryInput.close();
    // Dispose the query explicitly: with streaming input the SDK keeps its
    // CLI subprocess alive for more user messages, and a turn that ended
    // through an interrupt or error path can otherwise leak that process —
    // observed as orphaned `claude` processes holding the very conversation
    // the next turn continues.
    await disposeQuery(q);
  }

  // A turn the host itself stopped must not report a success-shaped finish:
  // the host has already settled the turn on its side, and the loop above can
  // reach here normally if the abort raced in right as the last message
  // observed its result.
  if (emittedTerminalError || turn.abortSignal.aborted) return;
  emittedTerminalFinish = true;
  void emittedTerminalFinish;
  emit({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: turnUsage ?? streamEventState.stepUsage ?? defaultUsage(),
    ...(totalCostUsd !== undefined || lastClaudeSessionId !== undefined
      ? {
          harnessMetadata: {
            'claude-code': {
              ...(totalCostUsd !== undefined ? { costUsd: totalCostUsd } : {}),
              // The conversation this turn belongs to, resumable outside the
              // SDK with `claude --resume <sessionId>` and captured by the
              // adapter for exact cross-process resume.
              ...(lastClaudeSessionId !== undefined
                ? { sessionId: lastClaudeSessionId }
                : {}),
            },
          },
        }
      : {}),
  });
}

function createQueryInput({
  initialUserMessage,
  userMessages,
  abortSignal,
}: {
  initialUserMessage: StartMessage['prompt'];
  userMessages: Experimental_BridgeUserMessageQueue;
  abortSignal: AbortSignal;
}): {
  input: AsyncIterable<unknown>;
  close(error?: unknown): void;
  handleLifecycle(message: ClaudeMessage): void;
  hasActiveUserMessages(): boolean;
  answersSentMessage(result: ClaudeMessage): boolean;
  observeResult(): void;
  /** Stops the current query's input from taking more user messages. */
  retire(): void;
  readonly hasObservedResult: boolean;
} {
  let closed = false;
  let observedResult = false;
  const submittedMessages = new Map<string, Experimental_BridgeUserMessage>();
  const initialMessageId = randomUUID();
  const sentMessageIds = new Set<string>([initialMessageId]);
  let cliEchoesMessageIds = false;
  const noteEcho = (ids: readonly unknown[]): boolean => {
    const echoed = ids.some(
      id => typeof id === 'string' && sentMessageIds.has(id),
    );
    if (echoed) cliEchoesMessageIds = true;
    return echoed;
  };
  const close = (error?: unknown): void => {
    if (closed) return;
    closed = true;
    userMessages.close(error);
  };
  if (abortSignal.aborted) {
    close(abortSignal.reason);
  } else {
    abortSignal.addEventListener('abort', () => close(abortSignal.reason), {
      once: true,
    });
  }

  const toUserMessage = (options: {
    content: StartMessage['prompt'];
    messageId: string;
    priority?: 'next';
  }): unknown => ({
    type: 'user',
    message: {
      role: 'user',
      content:
        typeof options.content === 'string'
          ? [{ type: 'text', text: options.content }]
          : options.content.map(part =>
              part.type === 'text'
                ? part
                : {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: part.mediaType,
                      data: part.data,
                    },
                  },
            ),
    },
    parent_tool_use_id: null,
    uuid: options.messageId,
    ...(options.priority == null ? {} : { priority: options.priority }),
  });

  const messageIterator = userMessages[Symbol.asyncIterator]();
  /*
   * A query that ends at a deferred call can still be waiting for the next
   * user message. Pull through one shared buffer and only hand a message to
   * the input of the live query, so the resumed query receives it.
   */
  let liveInputId = 0;
  let bufferedMessage:
    | IteratorResult<Experimental_BridgeUserMessage>
    | undefined;
  let pulling: Promise<void> | undefined;
  const takeMessage = async (inputId: number) => {
    for (;;) {
      if (inputId !== liveInputId) return undefined;
      if (bufferedMessage != null) {
        const message = bufferedMessage;
        bufferedMessage = undefined;
        return message;
      }
      pulling ??= messageIterator.next().then(result => {
        bufferedMessage = result;
        pulling = undefined;
      });
      await pulling;
    }
  };

  return {
    close,
    handleLifecycle: message => {
      const lifecycle = message as ClaudeMessage & {
        command_uuid?: string;
        state?: 'queued' | 'started' | 'completed' | 'cancelled' | 'discarded';
      };
      if (lifecycle.command_uuid == null || lifecycle.state == null) return;
      noteEcho([lifecycle.command_uuid]);
      if (
        lifecycle.command_uuid === initialMessageId &&
        (lifecycle.state === 'cancelled' || lifecycle.state === 'discarded')
      ) {
        observedResult = true;
      }
      const submitted = submittedMessages.get(lifecycle.command_uuid);
      if (submitted == null) return;
      if (lifecycle.state === 'queued' || lifecycle.state === 'started') {
        submitted.accept();
        return;
      }
      if (lifecycle.state === 'cancelled' || lifecycle.state === 'discarded') {
        submitted.reject(
          new Error(`Claude Code ${lifecycle.state} the user message.`),
        );
      }
      submittedMessages.delete(lifecycle.command_uuid);
    },
    hasActiveUserMessages: () =>
      submittedMessages.size > 0 || userMessages.pendingCount > 0,
    answersSentMessage: result => {
      const { user_message_uuid, user_message_uuids, origin } = result as {
        user_message_uuid?: unknown;
        user_message_uuids?: unknown;
        origin?: { kind?: string };
      };
      const echoed = noteEcho([
        user_message_uuid,
        ...(Array.isArray(user_message_uuids) ? user_message_uuids : []),
      ]);
      return (
        echoed || (!cliEchoesMessageIds && origin?.kind !== 'task-notification')
      );
    },
    observeResult: () => {
      observedResult = true;
    },
    retire: () => {
      liveInputId++;
    },
    get hasObservedResult() {
      return observedResult;
    },
    input: {
      [Symbol.asyncIterator]() {
        const inputId = ++liveInputId;
        let sentInitial = false;
        return {
          async next() {
            if (closed || abortSignal.aborted) {
              return {
                value: undefined,
                done: true,
              } as IteratorResult<unknown>;
            }
            if (!sentInitial) {
              sentInitial = true;
              return {
                value: toUserMessage({
                  content: initialUserMessage,
                  messageId: initialMessageId,
                }),
                done: false,
              };
            }
            const nextMessage = await takeMessage(inputId);
            if (nextMessage == null || nextMessage.done) {
              return {
                value: undefined,
                done: true,
              } as IteratorResult<unknown>;
            }
            submittedMessages.set(
              nextMessage.value.messageId,
              nextMessage.value,
            );
            sentMessageIds.add(nextMessage.value.messageId);
            return {
              value: toUserMessage({
                content: nextMessage.value.text,
                messageId: nextMessage.value.messageId,
                priority: 'next',
              }),
              done: false,
            };
          },
        };
      },
    },
  };
}

/*
 * Resuming a deferred call must not send a prompt: Claude Code would answer
 * it and drop the call. The stream stays open for steering messages.
 */
function withoutInitialMessage(
  input: AsyncIterable<unknown>,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = input[Symbol.asyncIterator]();
      let skipped = false;
      return {
        async next() {
          if (!skipped) {
            skipped = true;
            await iterator.next();
          }
          return iterator.next();
        },
      };
    },
  };
}

async function disposeQuery(query: unknown): Promise<void> {
  try {
    await (
      query as { return?: (value?: unknown) => Promise<unknown> } | undefined
    )?.return?.(undefined);
  } catch {
    // Best effort; the abort controller tears the process down otherwise.
  }
}

function addUsage(
  total: Record<string, unknown> | undefined,
  usage: Record<string, unknown>,
): Record<string, unknown> {
  if (total == null) return usage;
  const result: Record<string, unknown> = { ...total };
  for (const [key, value] of Object.entries(usage)) {
    const previous = result[key];
    if (typeof value === 'number' && typeof previous === 'number') {
      result[key] = previous + value;
    } else if (
      value != null &&
      previous != null &&
      typeof value === 'object' &&
      typeof previous === 'object' &&
      !Array.isArray(value) &&
      !Array.isArray(previous)
    ) {
      result[key] = addUsage(
        previous as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
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
