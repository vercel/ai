// Long-running bridge that runs inside a sandbox alongside the `claude` CLI.
// The generic transport — WebSocket server, token auth, single-flight
// reconnect, the in-memory event log + `seq`, resume replay, and the
// lifecycle/meta files — lives in the shared `@ai-sdk/harness/bridge` runtime.
// This file supplies only the Claude-specific turn driver.

import {
  runBridge,
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
  finishApprovalStep,
  isExternalMcpTool,
  mapUsage,
  type ClaudeMessage,
} from './create-emit-stream-event';
import { jsonSchemaToZodShape } from './json-schema-to-zod';
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

  return {
    permissionMode:
      permissionMode === 'allow-all'
        ? 'bypassPermissions'
        : permissionMode === 'allow-edits'
          ? 'acceptEdits'
          : 'default',
    allowDangerouslySkipPermissions: permissionMode === 'allow-all',
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
        ...(isExternalMcpTool(toolName) ? { dynamic: true } : {}),
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

function createQuestionPreToolUseHook(input: {
  turn: BridgeTurn;
  emit: Emit;
  nativeToolCallNames: Map<string, string>;
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
    const result = await input.turn.requestToolResult({
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
    });
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

  const mcpServers: Record<string, unknown> = { ...(start.mcpServers ?? {}) };
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
        async (
          ...handlerArgs: [
            Record<string, unknown>,
            { requestId: string | number; _meta?: Record<string, unknown> },
          ]
        ) => {
          const [input, extra] = handlerArgs;
          const metadataToolCallId = extra._meta?.['claudecode/toolUseId'];
          const toolCallId =
            typeof metadataToolCallId === 'string'
              ? metadataToolCallId
              : randomUUID();
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
    userMessages: turn.experimental_userMessages,
    abortSignal: abortCtl.signal,
  });
  const skillsOption = toClaudeSkillsOption(start.skills);
  const nativeTools = resolveNativeTools(start.builtinToolFiltering);
  const inactiveNativeTools = resolveInactiveNativeTools(
    start.builtinToolFiltering,
  );
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
  const questionPreToolUseHook = createQuestionPreToolUseHook({
    turn,
    emit,
    nativeToolCallNames: streamEventState.nativeToolCallNames,
  });

  const q = claudeSdk.query({
    prompt: queryInput.input,
    options: {
      ...(start.model ? { model: start.model } : {}),
      ...(start.maxTurns !== undefined ? { maxTurns: start.maxTurns } : {}),
      ...(start.env !== undefined ? { env: { ...procEnv, ...start.env } } : {}),
      ...(skillsOption ? { skills: skillsOption } : {}),
      ...(nativeTools !== undefined ? { tools: nativeTools } : {}),
      ...(inactiveNativeTools.length > 0
        ? { disallowedTools: inactiveNativeTools }
        : {}),
      systemPrompt: createClaudeCodeSystemPrompt(start.instructions),
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
          {
            matcher: 'AskUserQuestion',
            hooks: [questionPreToolUseHook],
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
      mcpServers,
      cwd: workdir,
      abortSignal: abortCtl.signal,
    },
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
      .then(() => q.interrupt())
      .catch(() => abortCtl.abort());
  };
  let turnUsage: Record<string, unknown> | undefined;
  let totalCostUsd: number | undefined;
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

  try {
    for await (const msg of q as AsyncIterable<ClaudeMessage>) {
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
            totalCostUsd = (totalCostUsd ?? 0) + msg.total_cost_usd;
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
    try {
      await (q as { return?: (value?: unknown) => Promise<unknown> }).return?.(
        undefined,
      );
    } catch {
      // Best effort; the abort controller tears the process down otherwise.
    }
  }

  if (emittedTerminalError) return;
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
  initialUserMessage: string;
  userMessages: Experimental_BridgeUserMessageQueue;
  abortSignal: AbortSignal;
}): {
  input: AsyncIterable<unknown>;
  close(error?: unknown): void;
  handleLifecycle(message: ClaudeMessage): void;
  hasActiveUserMessages(): boolean;
  observeResult(): void;
  readonly hasObservedResult: boolean;
} {
  let closed = false;
  let observedResult = false;
  const submittedMessages = new Map<string, Experimental_BridgeUserMessage>();
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
    text: string;
    messageId: string;
    priority?: 'next';
  }): unknown => ({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: options.text }],
    },
    parent_tool_use_id: null,
    uuid: options.messageId,
    ...(options.priority == null ? {} : { priority: options.priority }),
  });

  const messageIterator = userMessages[Symbol.asyncIterator]();

  return {
    close,
    handleLifecycle: message => {
      const lifecycle = message as ClaudeMessage & {
        command_uuid?: string;
        state?: 'queued' | 'started' | 'completed' | 'cancelled' | 'discarded';
      };
      if (lifecycle.command_uuid == null || lifecycle.state == null) return;
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
    observeResult: () => {
      observedResult = true;
    },
    get hasObservedResult() {
      return observedResult;
    },
    input: {
      [Symbol.asyncIterator]() {
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
                  text: initialUserMessage,
                  messageId: randomUUID(),
                }),
                done: false,
              };
            }
            const nextMessage = await messageIterator.next();
            if (nextMessage.done) {
              return {
                value: undefined,
                done: true,
              } as IteratorResult<unknown>;
            }
            submittedMessages.set(
              nextMessage.value.messageId,
              nextMessage.value,
            );
            return {
              value: toUserMessage({
                text: nextMessage.value.text,
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
