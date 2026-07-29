import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1BuiltinToolFiltering,
  type HarnessV1ContinueTurnOptions,
  type HarnessV1ContinueTurnState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PermissionMode,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import { Agent, type AgentMessage, type AgentRunResult } from '@cline/agents';
import { createClineRemoteOps } from './cline-remote-ops';
import {
  CLINE_DEFAULT_HISTORY_FILE_NAME,
  persistHistoryToSandbox,
  pullHistoryFromSandbox,
  safeClineHistoryFileName,
} from './cline-resume-state';
import { renderSkillsPromptSection, writeClineSkills } from './cline-skills';
import {
  buildBuiltinAgentTools,
  buildUserAgentTools,
  CLINE_NATIVE_TOOL_KINDS,
  isClineBuiltinToolName,
  resolveActiveClineBuiltinNames,
  type PendingToolResult,
} from './cline-tools';
import {
  createClineTranslatorState,
  finishClineTranslation,
  toolApprovalParts,
  translateClineEvent,
  type ClineTranslatorState,
} from './cline-translate';
import {
  extractUserText,
  frameInstructions,
  mapRunFinishReason,
  usageFromAgentUsage,
} from './cline-utils';

const HARNESS_ID = 'cline';

/*
 * The Cline runtime lives in this Node process, not behind an attachable
 * in-sandbox bridge. During a tool approval pause the turn is still alive and
 * blocked on a parked promise, so detach must keep that live session for the
 * next same-process resume instead of stopping it and failing the promise.
 * Cross-process resume falls back to the history file persisted in the
 * sandbox.
 */
const parkedClineSessions = new Map<string, HarnessV1Session>();

export interface ClineSessionSettings {
  readonly providerId: string;
  readonly modelId: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly headers?: Record<string, string>;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
}

export interface CreateClineSessionInput {
  readonly sessionId: string;
  readonly sandboxSession: HarnessV1NetworkSandboxSession;
  readonly sessionWorkDir: string;
  readonly skills: ReadonlyArray<HarnessV1Skill>;
  readonly settings: ClineSessionSettings;
  readonly isResume: boolean;
  readonly permissionMode?: HarnessV1PermissionMode;
  readonly builtinToolFiltering?: HarnessV1BuiltinToolFiltering;
  readonly resumeHistoryFileName?: string;
  readonly abortSignal?: AbortSignal;
}

interface PendingToolApproval {
  resolve: (value: { approved: boolean; reason?: string }) => void;
}

interface ActiveClineTurn {
  readonly token: object;
  readonly done: Promise<void>;
}

/**
 * Whether a thrown error is an abort — the expected result of
 * `doSuspendTurn` aborting the in-flight turn. Only these are safe to swallow
 * while `suspending`; any other error must surface as an `error` chunk.
 */
function isAbortError(value: unknown): boolean {
  if (value == null) return false;
  const name = (value as { name?: unknown }).name;
  if (name === 'AbortError' || name === 'AgentRuntimeAbortError') {
    return true;
  }
  const text =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? value.message
        : String(value);
  return /\baborted\b|AbortError/i.test(text);
}

function clineBuiltinToolRequiresApproval(input: {
  permissionMode: HarnessV1PermissionMode;
  kind: 'readonly' | 'edit' | 'bash';
}): boolean {
  if (input.permissionMode === 'allow-all') return false;
  if (input.permissionMode === 'allow-edits') return input.kind === 'bash';
  return input.kind === 'edit' || input.kind === 'bash';
}

function buildSystemPrompt(input: {
  sessionWorkDir: string;
  sandboxDescription: string;
  skillsSection?: string;
  extraSystemPrompt?: string;
}): string {
  const sections = [
    'You are Cline, an autonomous coding agent operating inside a sandboxed workspace.',
    `## Workspace\n\nThe workspace root is \`${input.sessionWorkDir}\`. All relative file paths and shell commands resolve against it. Use the provided tools (read, write, edit, bash, grep, glob, ls) to inspect and modify the workspace.`,
    `## Sandbox\n\n${input.sandboxDescription}`,
  ];
  if (input.skillsSection) {
    sections.push(input.skillsSection);
  }
  if (input.extraSystemPrompt) {
    sections.push(input.extraSystemPrompt);
  }
  return sections.join('\n\n');
}

export async function createClineSession(
  input: CreateClineSessionInput,
): Promise<HarnessV1Session> {
  if (input.isResume) {
    const parkedSession = parkedClineSessions.get(input.sessionId);
    if (parkedSession) {
      parkedClineSessions.delete(input.sessionId);
      return {
        ...parkedSession,
        isResume: true,
      };
    }
  }

  const sandbox = input.sandboxSession.restricted();
  const permissionMode = input.permissionMode ?? 'allow-all';
  const activeBuiltinNames = resolveActiveClineBuiltinNames(
    input.builtinToolFiltering,
  );

  const ops = createClineRemoteOps({
    sandbox,
    workDir: input.sessionWorkDir,
  });

  // Materialize harness-provided skills into sandbox HOME (not the workspace)
  // and advertise them via a system prompt section.
  let skillsSection: string | undefined;
  if (input.skills.length > 0) {
    const skillRootDir = await writeClineSkills({
      sandbox,
      skills: input.skills,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    if (skillRootDir) {
      skillsSection = renderSkillsPromptSection(input.skills, skillRootDir);
    }
  }

  const systemPrompt = buildSystemPrompt({
    sessionWorkDir: input.sessionWorkDir,
    sandboxDescription: sandbox.description,
    ...(skillsSection ? { skillsSection } : {}),
    ...(input.settings.systemPrompt
      ? { extraSystemPrompt: input.settings.systemPrompt }
      : {}),
  });

  // On resume: pull the persisted conversation history from the sandbox so
  // the fresh runtime instance starts from the prior transcript.
  let currentMessages: readonly AgentMessage[] = [];
  if (input.isResume && input.resumeHistoryFileName) {
    const restored = await pullHistoryFromSandbox({
      sandbox,
      sessionWorkDir: input.sessionWorkDir,
      historyFileName: safeClineHistoryFileName(input.resumeHistoryFileName),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    if (restored) {
      currentMessages = restored;
    }
  }

  // Per-session mutable state we hold across prompts.
  let agent: Agent | undefined;
  let unsubscribe: (() => void) | undefined;
  let lastToolsSignature: string | undefined;
  let agentHasRun = false;
  let stopped = false;
  /*
   * Set by `doSuspendTurn` before it aborts the in-flight turn at a slice
   * boundary. The turn settles silently when this is set, so the stream
   * closes cleanly (no spurious `error` chunk) — the next slice
   * rerun-continues from the persisted history.
   */
  let suspending = false;
  /*
   * Instructions are prepended to the first user message of a fresh session
   * only. A resumed session already carried them in its original first
   * message (preserved in the persisted history), so it starts "applied".
   */
  let instructionsApplied = input.isResume;
  const pendingToolResults = new Map<string, PendingToolResult>();
  const pendingToolApprovals = new Map<string, PendingToolApproval>();
  const pendingUserMessages: string[] = [];

  // Emit channel set at the start of every turn and cleared on end.
  let currentEmit: ((part: HarnessV1StreamPart) => void) | undefined;
  let translatorState: ClineTranslatorState | undefined;
  let activeTurn: ActiveClineTurn | undefined;

  function settlePendingToolResults(reason: string): void {
    for (const pending of pendingToolResults.values()) {
      pending.resolve({ error: reason });
    }
    pendingToolResults.clear();
  }

  function settlePendingToolApprovals(reason: string): void {
    for (const pending of pendingToolApprovals.values()) {
      pending.resolve({ approved: false, reason });
    }
    pendingToolApprovals.clear();
  }

  async function persistHistory(): Promise<void> {
    const messages = agent?.snapshot().messages ?? currentMessages;
    await persistHistoryToSandbox({
      sandbox,
      sessionWorkDir: input.sessionWorkDir,
      historyFileName: CLINE_DEFAULT_HISTORY_FILE_NAME,
      messages,
    });
  }

  function requestBuiltinToolApproval(toolCall: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }): Promise<{ approved: boolean; reason?: string }> {
    if (translatorState && currentEmit) {
      for (const part of toolApprovalParts(translatorState, toolCall)) {
        currentEmit(part);
      }
    }
    return new Promise(resolve => {
      pendingToolApprovals.set(toolCall.toolCallId, { resolve });
    });
  }

  function rebuildAgent(userTools: ReadonlyArray<HarnessV1ToolSpec>): void {
    unsubscribe?.();
    unsubscribe = undefined;
    agent = new Agent({
      providerId: input.settings.providerId,
      modelId: input.settings.modelId,
      ...(input.settings.apiKey ? { apiKey: input.settings.apiKey } : {}),
      ...(input.settings.baseUrl ? { baseUrl: input.settings.baseUrl } : {}),
      ...(input.settings.headers ? { headers: input.settings.headers } : {}),
      sessionId: input.sessionId,
      systemPrompt,
      initialMessages: currentMessages,
      ...(input.settings.maxIterations !== undefined
        ? { maxIterations: input.settings.maxIterations }
        : {}),
      tools: [
        ...buildBuiltinAgentTools({ ops, activeNames: activeBuiltinNames }),
        ...buildUserAgentTools({ specs: userTools, pendingToolResults }),
      ],
      // Built-in tools whose kind requires approval under the session's
      // permission mode are marked `autoApprove: false`; the runtime then
      // routes them through `requestToolApproval` below. User tools are
      // approved by the harness framework, never by the adapter.
      toolPolicies: Object.fromEntries(
        activeBuiltinNames
          .filter(name =>
            clineBuiltinToolRequiresApproval({
              permissionMode,
              kind: CLINE_NATIVE_TOOL_KINDS[name],
            }),
          )
          .map(name => [name, { autoApprove: false }]),
      ),
      requestToolApproval: request => {
        if (!isClineBuiltinToolName(request.toolName)) {
          // Custom host-executed tool approvals are handled by the framework
          // before results are submitted back; the adapter never gates them.
          return { approved: true };
        }
        return requestBuiltinToolApproval({
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          input: request.input,
        });
      },
      // Mid-turn user messages injected via `submitUserMessage` are consumed
      // by the runtime between loop iterations, before the next model call.
      consumePendingUserMessage: () => pendingUserMessages.shift(),
    });
    agentHasRun = false;

    unsubscribe = agent.subscribe(event => {
      if (!translatorState || !currentEmit) return;
      for (const part of translateClineEvent(event, translatorState)) {
        currentEmit(part);
      }
    });
  }

  function createPromptControl(controlInput: {
    done: Promise<void>;
    abortSignal?: AbortSignal;
  }): HarnessV1PromptControl {
    const abortHandler = () => {
      // Settle parked host-tool promises first so the runtime's tool
      // executions do not dangle, then abort the loop itself.
      settlePendingToolResults('Turn aborted');
      settlePendingToolApprovals('Turn aborted');
      agent?.abort('Turn aborted by caller');
    };
    if (controlInput.abortSignal) {
      controlInput.abortSignal.addEventListener('abort', abortHandler, {
        once: true,
      });
      void controlInput.done.then(
        () => {
          controlInput.abortSignal?.removeEventListener('abort', abortHandler);
        },
        () => {
          controlInput.abortSignal?.removeEventListener('abort', abortHandler);
        },
      );
    }

    return {
      async submitToolResult(args) {
        const pending = pendingToolResults.get(args.toolCallId);
        if (!pending) return;
        pendingToolResults.delete(args.toolCallId);
        pending.resolve(args.output);
      },
      async submitToolApproval(args) {
        const pending = pendingToolApprovals.get(args.approvalId);
        if (!pending) return;
        pendingToolApprovals.delete(args.approvalId);
        pending.resolve({
          approved: args.approved,
          ...(args.reason !== undefined ? { reason: args.reason } : {}),
        });
      },
      async submitUserMessage(text) {
        pendingUserMessages.push(text);
      },
      done: controlInput.done,
    };
  }

  /*
   * Drive one turn against the Cline runtime and return the control surface.
   * Shared by `doPromptTurn` (a fresh user prompt) and `doContinueTurn`
   * (no prompt — the runtime continues its own thread after a rerun resume).
   */
  function runTurn(turnOpts: {
    text: string | undefined;
    tools: ReadonlyArray<HarnessV1ToolSpec>;
    emit: (part: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
  }): HarnessV1PromptControl {
    if (stopped) {
      throw new Error('Cline session has been stopped.');
    }

    const userTools = turnOpts.tools;
    const signature = JSON.stringify(userTools.map(t => t.name).sort());
    if (agent == null || signature !== lastToolsSignature) {
      currentMessages = agent?.snapshot().messages ?? currentMessages;
      rebuildAgent(userTools);
      lastToolsSignature = signature;
    }

    currentEmit = turnOpts.emit;
    translatorState = createClineTranslatorState({
      builtinToolNames: activeBuiltinNames,
    });

    turnOpts.emit({
      type: 'stream-start',
      modelId: input.settings.modelId,
    });

    const turnPromise = (async () => {
      const runtime = agent!;
      let result: AgentRunResult;
      try {
        // `text` is undefined only on rerun-continue: `continue()` without
        // input re-drives the loop from the restored transcript instead of
        // pushing an empty user message.
        result =
          turnOpts.text === undefined
            ? await runtime.continue()
            : agentHasRun
              ? await runtime.continue(turnOpts.text)
              : await runtime.run(turnOpts.text);
        agentHasRun = true;
      } catch (error) {
        // `run` resolves for aborted/failed statuses; a throw here is
        // unanticipated (e.g. config error). Swallow only the abort our own
        // suspend caused; surface anything else.
        if (suspending && isAbortError(error)) return;
        currentEmit?.({ type: 'error', error });
        return;
      }

      currentMessages = result.messages;

      if (translatorState) {
        for (const part of finishClineTranslation(translatorState)) {
          currentEmit?.(part);
        }
      }

      if (result.status === 'aborted') {
        /*
         * A `doSuspendTurn` aborts the in-flight turn on purpose — settle
         * silently so the stream closes cleanly; the next slice
         * rerun-continues from the persisted history. Caller-driven aborts
         * finish the turn with an `other`/aborted reason.
         */
        if (suspending) return;
        currentEmit?.({
          type: 'finish',
          finishReason: mapRunFinishReason(result.status),
          totalUsage: usageFromAgentUsage(result.usage),
        });
        return;
      }

      if (result.status === 'failed') {
        currentEmit?.({
          type: 'error',
          error: result.error ?? new Error('Cline agent run failed'),
        });
        return;
      }

      currentEmit?.({
        type: 'finish',
        finishReason: mapRunFinishReason(result.status),
        totalUsage: usageFromAgentUsage(result.usage),
      });
    })();

    const activeTurnToken = {};
    const done = turnPromise.finally(() => {
      if (activeTurn?.token === activeTurnToken) {
        activeTurn = undefined;
      }
      currentEmit = undefined;
    });
    activeTurn = {
      token: activeTurnToken,
      done,
    };

    return createPromptControl({
      done,
      ...(turnOpts.abortSignal ? { abortSignal: turnOpts.abortSignal } : {}),
    });
  }

  function teardown(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    agent = undefined;
  }

  const doStop = async (): Promise<HarnessV1ResumeSessionState> => {
    if (stopped) {
      throw new Error('Cline session has been stopped.');
    }
    stopped = true;
    parkedClineSessions.delete(input.sessionId);
    settlePendingToolResults('Cline session stopped');
    settlePendingToolApprovals('Cline session stopped');

    // Persist the conversation into the sandbox so a future process can pick
    // it up after the sandbox provider reattaches.
    try {
      await persistHistory();
    } catch {
      // Best-effort: a missing history file means resume returns to a fresh
      // conversation rather than failing stop.
    }

    agent?.abort('Cline session stopped');
    teardown();

    return {
      type: 'resume-session',
      harnessId: HARNESS_ID,
      specificationVersion: 'harness-v1',
      data: { historyFileName: CLINE_DEFAULT_HISTORY_FILE_NAME },
    };
  };

  const sessionImpl: HarnessV1Session = {
    sessionId: input.sessionId,
    isResume: input.isResume,
    modelId: input.settings.modelId,

    // The Cline runtime has no bridge to attach to and no in-sandbox event
    // log to replay; its only cross-process resume path is restoring the
    // persisted history on a fresh runtime, i.e. `rerun`.

    doPromptTurn: async (
      promptOpts: HarnessV1PromptTurnOptions,
    ): Promise<HarnessV1PromptControl> => {
      let text = extractUserText(promptOpts.prompt);
      if (!instructionsApplied && promptOpts.instructions) {
        text = frameInstructions(promptOpts.instructions, text);
      }
      instructionsApplied = true;

      return runTurn({
        text,
        tools: promptOpts.tools ?? [],
        emit: promptOpts.emit,
        ...(promptOpts.abortSignal
          ? { abortSignal: promptOpts.abortSignal }
          : {}),
      });
    },

    doContinueTurn: async (
      continueOpts: HarnessV1ContinueTurnOptions,
    ): Promise<HarnessV1PromptControl> => {
      if (activeTurn != null) {
        currentEmit = continueOpts.emit;
        return createPromptControl({
          done: activeTurn.done,
          ...(continueOpts.abortSignal
            ? { abortSignal: continueOpts.abortSignal }
            : {}),
        });
      }

      /*
       * The model runs on the host, so there is no live turn to attach to —
       * the previous slice's turn died with its process. Rerun-continue:
       * re-drive the runtime from the history restored on resume. Lossy —
       * work in flight at the slice boundary is recomputed, because a
       * host-resident runtime cannot do a lossless attach.
       */
      return runTurn({
        text: undefined,
        tools: continueOpts.tools ?? [],
        emit: continueOpts.emit,
        ...(continueOpts.abortSignal
          ? { abortSignal: continueOpts.abortSignal }
          : {}),
      });
    },

    doCompact: async () => {
      throw new HarnessCapabilityUnsupportedError({
        message:
          'cline: manual compaction is not supported by the standalone Cline runtime.',
        harnessId: HARNESS_ID,
      });
    },

    doDestroy: async () => {
      if (stopped) return;
      stopped = true;
      parkedClineSessions.delete(input.sessionId);
      settlePendingToolResults('Cline session stopped');
      settlePendingToolApprovals('Cline session stopped');
      agent?.abort('Cline session destroyed');
      teardown();
    },

    doStop,

    doDetach: async (): Promise<HarnessV1ResumeSessionState> => {
      if (activeTurn != null || pendingToolResults.size > 0) {
        parkedClineSessions.set(input.sessionId, sessionImpl);
        try {
          await persistHistory();
        } catch {
          /*
           * The parked in-process session is the authoritative continuation
           * path while the live turn is waiting on host input. Persistence
           * is only a fallback for later non-live resumes.
           */
        }
        return {
          type: 'resume-session',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: { historyFileName: CLINE_DEFAULT_HISTORY_FILE_NAME },
        };
      }
      return doStop();
    },

    doSuspendTurn: async (): Promise<HarnessV1ContinueTurnState> => {
      if (stopped) {
        throw new Error('Cline session has been stopped.');
      }
      if (
        activeTurn != null &&
        (pendingToolResults.size > 0 || pendingToolApprovals.size > 0)
      ) {
        parkedClineSessions.set(input.sessionId, sessionImpl);
        try {
          await persistHistory();
        } catch {
          /*
           * While waiting on host input, the live parked session is the
           * authoritative same-process continuation path. The sandbox copy
           * remains a best-effort fallback for a later cold resume.
           */
        }
        return {
          type: 'continue-turn',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: { historyFileName: CLINE_DEFAULT_HISTORY_FILE_NAME },
        };
      }
      /*
       * The model runs in this host process, which is about to be suspended
       * at the slice boundary — the in-flight turn cannot survive it. Abort
       * it (the turn settles silently via the `suspending` guard so the
       * stream closes cleanly), persist the history into the sandbox, and
       * tear down host-side resources. The sandbox itself is left running;
       * the next slice pulls the history after the sandbox provider
       * reattaches and rerun-continues. The tail in flight at the boundary
       * is recomputed — a host-resident runtime cannot freeze a live turn
       * the way a bridge adapter can.
       */
      suspending = true;
      agent?.abort('Cline session suspended');
      if (activeTurn) {
        await activeTurn.done.catch(() => {});
      }

      try {
        await persistHistory();
      } catch {
        // Best-effort: a missing/failed copy leaves the previously persisted
        // history in place, so the next slice resumes from a slightly older
        // (still valid) state.
      }

      stopped = true;
      parkedClineSessions.delete(input.sessionId);
      settlePendingToolResults('Cline session suspended');
      settlePendingToolApprovals('Cline session suspended');
      teardown();

      return {
        type: 'continue-turn',
        harnessId: HARNESS_ID,
        specificationVersion: 'harness-v1',
        data: { historyFileName: CLINE_DEFAULT_HISTORY_FILE_NAME },
      };
    },
  };

  return sessionImpl;
}
