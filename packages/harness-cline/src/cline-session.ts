import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1BuiltinToolFiltering,
  type HarnessV1ContinueTurnOptions,
  type HarnessV1ContinueTurnState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PermissionMode,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1QuestionsToolOutput,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import {
  getRestrictedSandboxSession,
  resolveSandboxHomeDir,
} from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  Agent,
  createTool,
  type AgentMessage,
  type AgentModel,
  type AgentRunResult,
} from '@cline/agents';
import { Llms } from '@cline/core';
import { createClineMcpRuntime } from './cline-mcp';
import { createClineRemoteOps } from './cline-remote-ops';
import {
  CLINE_DEFAULT_HISTORY_FILE_NAME,
  persistHistoryToSandbox,
  pullHistoryFromSandbox,
  resolveClinePrivateSessionDirectory,
  safeClineHistoryFileName,
} from './cline-resume-state';
import {
  createClineSkillsRuntime,
  type ClineSkillsRuntime,
} from './cline-skills';
import {
  buildBuiltinAgentTools,
  buildUserAgentTools,
  CLINE_NATIVE_TOOL_KINDS,
  createClineToolResult,
  isClineBuiltinToolName,
  clineQuestionKey,
  resolveActiveClineBuiltinNames,
  type PendingToolResult,
  type PendingClineQuestion,
  type PendingClineQuestionResult,
  toClineQuestionResult,
  unwrapClineToolResult,
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
  mapRunFinishReason,
  usageFromAgentUsage,
} from './cline-utils';

const HARNESS_ID = 'cline';

export type ClineReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

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
  readonly authEnv: Record<string, string>;
  readonly isAuthenticationEnvironmentOverride: boolean;
  readonly mcpServers?: Record<string, unknown>;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly headers?: Record<string, string>;
  readonly agentHeaders?: Readonly<Record<string, string>>;
  readonly reasoningEffort?: ClineReasoningEffort;
  readonly maxIterations?: number;
}

export interface CreateClineSessionInput {
  readonly sessionId: string;
  readonly sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  readonly sessionWorkDir: string;
  readonly settings: ClineSessionSettings;
  readonly clientApp: string;
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

interface PendingUserMessage {
  readonly text: string;
  resolve(): void;
  reject(error: unknown): void;
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
}): string {
  return [
    'You are Cline, an autonomous coding agent operating inside a sandboxed workspace.',
    `## Workspace\n\nThe workspace root is \`${input.sessionWorkDir}\`. All relative file paths and shell commands resolve against it. Use the provided tools (read, write, edit, bash, grep, glob, ls) to inspect and modify the workspace.`,
    `## Sandbox\n\n${input.sandboxDescription}`,
  ].join('\n\n');
}

function toClineBackendProviderBaseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v1`;
}

function toAiGatewayProviderBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function createClineAgentModel({
  settings,
  clientApp,
  modelId,
}: {
  settings: ClineSessionSettings;
  clientApp: string;
  modelId: string | undefined;
}): { model: AgentModel; providerId: string } {
  const gatewayBaseUrl = settings.authEnv.AI_GATEWAY_BASE_URL;
  const isAiGateway = gatewayBaseUrl != null;
  const providerId = isAiGateway ? 'cline' : (settings.providerId ?? 'cline');
  const apiKey = isAiGateway
    ? settings.authEnv.AI_GATEWAY_API_KEY
    : (settings.apiKey ??
      (providerId === 'cline' ? settings.authEnv.CLINE_API_KEY : undefined));
  const baseUrl = isAiGateway
    ? toAiGatewayProviderBaseUrl(gatewayBaseUrl)
    : (settings.baseUrl ??
      (providerId === 'cline' && settings.authEnv.CLINE_API_BASE_URL
        ? toClineBackendProviderBaseUrl(settings.authEnv.CLINE_API_BASE_URL)
        : undefined));
  const headers = isAiGateway
    ? {
        ...settings.headers,
        ...settings.agentHeaders,
        'User-Agent': clientApp,
        'x-client-app': clientApp,
      }
    : settings.headers != null || settings.agentHeaders != null
      ? {
          ...settings.headers,
          ...settings.agentHeaders,
        }
      : undefined;
  const gateway = Llms.createGateway({
    providerConfigs: [
      {
        providerId,
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(headers ? { headers } : {}),
        ...(isAiGateway || settings.isAuthenticationEnvironmentOverride
          ? { apiKeyEnv: [] }
          : {}),
      },
    ],
  });
  const modelSelection = {
    providerId,
    ...(modelId ? { modelId } : {}),
  };
  const modelOptions =
    settings.reasoningEffort === 'none'
      ? { reasoning: { enabled: false } }
      : {
          reasoning: {
            enabled: true,
            effort: settings.reasoningEffort,
          },
        };
  const model =
    settings.reasoningEffort === undefined
      ? gateway.createAgentModel(modelSelection)
      : gateway.createAgentModel(modelSelection, modelOptions);

  return {
    model,
    providerId,
  };
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

  const toolSafeSandboxSession = getRestrictedSandboxSession(
    input.sandboxSession,
  );
  const sandboxHomeDir = await resolveSandboxHomeDir({
    sandbox: toolSafeSandboxSession,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  const privateSessionDir = resolveClinePrivateSessionDirectory({
    sandboxHomeDir,
    sessionWorkDir: input.sessionWorkDir,
    sessionId: input.sessionId,
  });
  const permissionMode = input.permissionMode ?? 'allow-all';
  const activeBuiltinNames = resolveActiveClineBuiltinNames(
    input.builtinToolFiltering,
  );

  const ops = createClineRemoteOps({
    sandbox: toolSafeSandboxSession,
    workDir: input.sessionWorkDir,
  });

  // On resume: pull the persisted conversation history from the sandbox so
  // the fresh runtime instance starts from the prior transcript.
  let currentMessages: readonly AgentMessage[] = [];
  if (input.isResume && input.resumeHistoryFileName) {
    const restored = await pullHistoryFromSandbox({
      sandbox: toolSafeSandboxSession,
      privateSessionDir,
      historyFileName: safeClineHistoryFileName(input.resumeHistoryFileName),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    if (restored) {
      currentMessages = restored;
    }
  }
  const mcpRuntime = await createClineMcpRuntime({
    mcpServers: input.settings.mcpServers,
  });
  let activeModelId = input.settings.modelId;
  let agentModel = createClineAgentModel({
    settings: input.settings,
    clientApp: input.clientApp,
    modelId: activeModelId,
  });

  // Per-session mutable state we hold across prompts.
  let agent: Agent | undefined;
  let unsubscribe: (() => void) | undefined;
  let lastAgentConfigurationSignature: string | undefined;
  let agentHasRun = false;
  let stopped = false;
  /*
   * Set by `doSuspendTurn` before it aborts the in-flight turn at a slice
   * boundary. The turn settles silently when this is set, so the stream
   * closes cleanly (no spurious `error` chunk) — the next slice
   * rerun-continues from the persisted history.
   */
  let suspending = false;
  const pendingToolResults = new Map<string, PendingToolResult>();
  const pendingToolApprovals = new Map<string, PendingToolApproval>();
  const pendingUserMessages: PendingUserMessage[] = [];
  let acceptingUserMessages = false;

  // Emit channel set at the start of every turn and cleared on end.
  let currentEmit: ((part: HarnessV1StreamPart) => void) | undefined;
  let translatorState: ClineTranslatorState | undefined;
  const pendingQuestions = new Map<string, PendingClineQuestion>();
  const pendingQuestionResults = new Map<string, PendingClineQuestionResult>();
  let activeTurn: ActiveClineTurn | undefined;

  function settlePendingToolResults(reason: string): void {
    for (const pending of pendingToolResults.values()) {
      pending.resolve(
        createClineToolResult({
          output: { error: reason },
          isError: true,
        }),
      );
    }
    pendingToolResults.clear();
  }

  function settlePendingToolApprovals(reason: string): void {
    for (const pending of pendingToolApprovals.values()) {
      pending.resolve({ approved: false, reason });
    }
    pendingToolApprovals.clear();
  }

  function consumePendingUserMessage(): string | undefined {
    const pending = pendingUserMessages.shift();
    if (pending == null) return undefined;
    pending.resolve();
    return pending.text;
  }

  function rejectPendingUserMessages(error: unknown): void {
    for (const pending of pendingUserMessages) {
      pending.reject(error);
    }
    pendingUserMessages.length = 0;
  }

  function settlePendingQuestions(reason: string): void {
    for (const pending of pendingQuestions.values()) {
      pending.resolve(reason);
    }
    pendingQuestions.clear();
    pendingQuestionResults.clear();
  }

  async function persistHistory(): Promise<void> {
    const messages = agent?.snapshot().messages ?? currentMessages;
    await persistHistoryToSandbox({
      sandbox: toolSafeSandboxSession,
      privateSessionDir,
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

  function rebuildAgent(rebuildInput: {
    userTools: ReadonlyArray<HarnessV1ToolSpec>;
    skillsRuntime: ClineSkillsRuntime;
    instructions?: string;
    responseFormat?: HarnessV1PromptTurnOptions['responseFormat'];
  }): void {
    unsubscribe?.();
    unsubscribe = undefined;
    agent = new Agent({
      model: agentModel.model,
      ...(activeModelId
        ? {
            messageModelInfo: {
              id: activeModelId,
              provider: agentModel.providerId,
            },
          }
        : {}),
      sessionId: input.sessionId,
      systemPrompt: (() => {
        const baseSystemPrompt = buildSystemPrompt({
          sessionWorkDir: input.sessionWorkDir,
          sandboxDescription: toolSafeSandboxSession.description,
        });
        return rebuildInput.instructions
          ? `${baseSystemPrompt}\n\n${rebuildInput.instructions}`
          : baseSystemPrompt;
      })(),
      initialMessages: currentMessages,
      toolExecution: 'parallel',
      ...(input.settings.maxIterations !== undefined
        ? { maxIterations: input.settings.maxIterations }
        : {}),
      tools: [
        ...buildBuiltinAgentTools({
          ops,
          activeNames: activeBuiltinNames,
          pendingQuestions,
          pendingQuestionResults,
        }),
        ...(rebuildInput.skillsRuntime.tool &&
        activeBuiltinNames.includes('skills')
          ? [rebuildInput.skillsRuntime.tool]
          : []),
        ...mcpRuntime.tools,
        ...buildUserAgentTools({
          specs: rebuildInput.userTools,
          pendingToolResults,
        }),
        ...(rebuildInput.responseFormat?.type === 'json' &&
        rebuildInput.responseFormat.schema != null
          ? [
              createTool({
                name: 'structured_output',
                description:
                  rebuildInput.responseFormat.description ??
                  'Return the final structured output.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    output: rebuildInput.responseFormat.schema,
                  },
                  required: ['output'],
                  additionalProperties: false,
                },
                lifecycle: { completesRun: true },
                execute: async ({ output }: { output: unknown }) =>
                  JSON.stringify(output),
              }),
            ]
          : []),
      ],
      ...(rebuildInput.responseFormat?.type === 'json'
        ? { completionPolicy: { requireCompletionTool: true } }
        : {}),
      hooks: {
        afterTool: ({ result }) => {
          const toolResult = unwrapClineToolResult(result.output);
          return toolResult == null ? undefined : { result: toolResult };
        },
      },
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
      consumePendingUserMessage,
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
      settlePendingQuestions('The question was cancelled.');
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
        const pendingQuestion = pendingQuestions.get(args.toolCallId);
        if (pendingQuestion != null) {
          pendingQuestions.delete(args.toolCallId);
          pendingQuestion.resolve(
            toClineQuestionResult({
              nativeInput: pendingQuestion.input,
              output: args.output as HarnessV1QuestionsToolOutput,
            }),
          );
          return;
        }
        if (args.toolResult?.toolName === 'askUserQuestions') {
          const nativeRequest = args.toolResult.providerOptions?.cline
            ?.nativeRequest as PendingClineQuestion['input'] | undefined;
          if (nativeRequest == null) return;
          pendingQuestionResults.set(clineQuestionKey(nativeRequest), {
            output: args.output as HarnessV1QuestionsToolOutput,
          });
          return;
        }
        const pending = pendingToolResults.get(args.toolCallId);
        if (!pending) return;
        pendingToolResults.delete(args.toolCallId);
        pending.resolve(
          createClineToolResult({
            output: args.output,
            isError: args.isError,
          }),
        );
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
      submitUserMessage(text) {
        if (!acceptingUserMessages) {
          return Promise.reject(
            new Error('Cline has no running turn to steer.'),
          );
        }
        return new Promise<void>((resolve, reject) => {
          pendingUserMessages.push({ text, resolve, reject });
        });
      },
      done: controlInput.done,
    };
  }

  /*
   * Drive one turn against the Cline runtime and return the control surface.
   * Shared by `doPromptTurn` (a fresh user prompt) and `doContinueTurn`
   * (no prompt — the runtime continues its own thread after a rerun resume).
   */
  async function runTurn(turnOpts: {
    text: string | undefined;
    model?: string;
    skills: ReadonlyArray<HarnessV1Skill>;
    tools: ReadonlyArray<HarnessV1ToolSpec>;
    instructions?: string;
    emit: (part: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
    responseFormat?: HarnessV1PromptTurnOptions['responseFormat'];
  }): Promise<HarnessV1PromptControl> {
    if (stopped) {
      throw new Error('Cline session has been stopped.');
    }

    const userTools = turnOpts.tools;
    const skillsRuntime = createClineSkillsRuntime({
      skills: turnOpts.skills,
    });
    if (
      turnOpts.responseFormat?.type === 'json' &&
      turnOpts.responseFormat.schema == null
    ) {
      throw new HarnessCapabilityUnsupportedError({
        message:
          "Harness 'cline' requires a JSON schema for structured output.",
        harnessId: HARNESS_ID,
      });
    }
    if (
      turnOpts.responseFormat?.type === 'json' &&
      agentModel.providerId === 'openai-codex-cli'
    ) {
      throw new HarnessCapabilityUnsupportedError({
        message:
          "Harness 'cline' cannot require structured output with the openai-codex-cli provider because that provider does not expose external tools.",
        harnessId: HARNESS_ID,
      });
    }

    if (turnOpts.model != null && turnOpts.model !== activeModelId) {
      activeModelId = turnOpts.model;
      agentModel = createClineAgentModel({
        settings: input.settings,
        clientApp: input.clientApp,
        modelId: activeModelId,
      });
    }

    const signature = JSON.stringify({
      modelId: activeModelId,
      tools: userTools,
      responseFormat: turnOpts.responseFormat,
      instructions: turnOpts.instructions,
      skills: skillsRuntime.signature,
    });
    if (agent == null || signature !== lastAgentConfigurationSignature) {
      currentMessages = agent?.snapshot().messages ?? currentMessages;
      rebuildAgent({
        userTools,
        skillsRuntime,
        responseFormat: turnOpts.responseFormat,
        ...(turnOpts.instructions
          ? { instructions: turnOpts.instructions }
          : {}),
      });
      lastAgentConfigurationSignature = signature;
    }

    currentEmit = turnOpts.emit;
    const userToolNames = new Set(userTools.map(tool => tool.name));
    translatorState = createClineTranslatorState({
      builtinToolNames: activeBuiltinNames.filter(
        name => !userToolNames.has(name),
      ),
      hostToolNames: userToolNames,
      ignoredToolNames:
        turnOpts.responseFormat?.type === 'json' ? ['structured_output'] : [],
      mcpToolNames: mcpRuntime.toolNames,
    });

    turnOpts.emit({
      type: 'stream-start',
      ...(activeModelId ? { modelId: activeModelId } : {}),
    });

    acceptingUserMessages = true;
    const turnPromise = (async () => {
      const runtime = agent!;
      try {
        let nextText = turnOpts.text;
        let result: AgentRunResult;
        for (;;) {
          // `text` is undefined only on rerun-continue: `continue()` without
          // input re-drives the loop from the restored transcript instead of
          // pushing an empty user message.
          result =
            nextText === undefined
              ? await runtime.continue()
              : agentHasRun
                ? await runtime.continue(nextText)
                : await runtime.run(nextText);
          agentHasRun = true;
          currentMessages = result.messages;

          if (translatorState) {
            for (const part of finishClineTranslation(translatorState)) {
              currentEmit?.(part);
            }
          }

          if (result.status !== 'completed') break;
          const pendingUserMessage = consumePendingUserMessage();
          if (pendingUserMessage == null) break;
          nextText = pendingUserMessage;
        }

        if (
          turnOpts.responseFormat?.type === 'json' &&
          result.status === 'completed'
        ) {
          const id = `structured-output-${input.sessionId}`;
          currentEmit?.({ type: 'text-start', id });
          currentEmit?.({
            type: 'text-delta',
            id,
            delta: result.outputText,
          });
          currentEmit?.({ type: 'text-end', id });
          currentEmit?.({
            type: 'finish-step',
            finishReason: { unified: 'stop', raw: 'structured-output' },
            usage: {
              inputTokens: {
                total: 0,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 0,
                text: undefined,
                reasoning: undefined,
              },
            },
          });
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
      } catch (error) {
        // `run` resolves for aborted/failed statuses; a throw here is
        // unanticipated (e.g. config error). Swallow only the abort our own
        // suspend caused; surface anything else.
        if (suspending && isAbortError(error)) return;
        currentEmit?.({ type: 'error', error });
      } finally {
        acceptingUserMessages = false;
        rejectPendingUserMessages(
          new Error('Cline turn ended before accepting the user message.'),
        );
      }
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

  async function teardown(): Promise<void> {
    unsubscribe?.();
    unsubscribe = undefined;
    agent = undefined;
    await mcpRuntime.dispose();
  }

  const doStop = async (): Promise<HarnessV1ResumeSessionState> => {
    if (stopped) {
      throw new Error('Cline session has been stopped.');
    }
    stopped = true;
    parkedClineSessions.delete(input.sessionId);
    settlePendingToolResults('Cline session stopped');
    settlePendingToolApprovals('Cline session stopped');
    settlePendingQuestions('The question was cancelled.');

    // Persist the conversation into the sandbox so a future process can pick
    // it up after the sandbox provider reattaches.
    try {
      await persistHistory();
    } catch {
      // Best-effort: a missing history file means resume returns to a fresh
      // conversation rather than failing stop.
    }

    agent?.abort('Cline session stopped');
    await teardown();

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

    // The Cline runtime has no bridge to attach to and no in-sandbox event
    // log to replay; its only cross-process resume path is restoring the
    // persisted history on a fresh runtime, i.e. `rerun`.

    doPromptTurn: async (
      promptOpts: HarnessV1PromptTurnOptions,
    ): Promise<HarnessV1PromptControl> => {
      return runTurn({
        text: extractUserText(promptOpts.prompt),
        ...(promptOpts.model ? { model: promptOpts.model } : {}),
        skills: promptOpts.skills,
        tools: promptOpts.tools ?? [],
        ...(promptOpts.instructions
          ? { instructions: promptOpts.instructions }
          : {}),
        emit: promptOpts.emit,
        ...(promptOpts.abortSignal
          ? { abortSignal: promptOpts.abortSignal }
          : {}),
        responseFormat: promptOpts.responseFormat,
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
        ...(continueOpts.model ? { model: continueOpts.model } : {}),
        skills: continueOpts.skills,
        tools: continueOpts.tools ?? [],
        ...(continueOpts.instructions
          ? { instructions: continueOpts.instructions }
          : {}),
        emit: continueOpts.emit,
        ...(continueOpts.abortSignal
          ? { abortSignal: continueOpts.abortSignal }
          : {}),
        responseFormat: continueOpts.responseFormat,
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
      await teardown();
    },

    doStop,

    doDetach: async (): Promise<HarnessV1ResumeSessionState> => {
      if (
        activeTurn != null ||
        pendingToolResults.size > 0 ||
        pendingQuestions.size > 0
      ) {
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
        (pendingToolResults.size > 0 ||
          pendingToolApprovals.size > 0 ||
          pendingQuestions.size > 0)
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
      await teardown();

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
