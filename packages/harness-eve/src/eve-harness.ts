import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1ContinueTurnState,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1StreamPart,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import type {
  JSONValue,
  LanguageModelV4FinishReason,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  Client,
  type ActionResultStreamEvent,
  type ActionsRequestedStreamEvent,
  type AgentInfoResult,
  type AssistantStepFinishReason,
  type ClientSession,
  type HandleMessageStreamEvent,
  type InputRequest,
  type InputResponse,
  type SendTurnPayload,
  type SessionState,
  type StepCompletedStreamEvent,
} from 'eve/client';
import { z } from 'zod/v4';
import { resolveEveClientOptions, type EveClientSettings } from './eve-auth';

export type EveHarnessSettings = EveClientSettings;

const optionalUnknownRecord = z.record(z.string(), z.unknown()).optional();

const EVE_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'read_file',
    toolUseKind: 'readonly',
    description: 'Read file contents.',
    inputSchema: z.looseObject({
      file_path: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'write_file',
    toolUseKind: 'edit',
    description: 'Write content to a file.',
    inputSchema: z.looseObject({
      file_path: z.string().optional(),
      path: z.string().optional(),
      content: z.string().optional(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'bash',
    toolUseKind: 'bash',
    description: 'Execute a shell command.',
    inputSchema: z.looseObject({
      command: z.string().optional(),
      timeout: z.number().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    description: 'Search file contents.',
    inputSchema: z.looseObject({
      pattern: z.string().optional(),
      path: z.string().optional(),
      glob: z.string().optional(),
      include: z.string().optional(),
      exclude: z.string().optional(),
      maxResults: z.number().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'glob',
    toolUseKind: 'readonly',
    description: 'Find files matching a glob pattern.',
    inputSchema: z.looseObject({
      pattern: z.string().optional(),
      path: z.string().optional(),
      maxResults: z.number().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    description: 'Search the web.',
    inputSchema: z.looseObject({
      query: z.string().optional(),
      maxResults: z.number().optional(),
    }),
  }),
  web_fetch: tool({
    description: 'Fetch and inspect web content.',
    inputSchema: z.looseObject({
      url: z.string().optional(),
      prompt: z.string().optional(),
    }),
  }),
  todo: tool({
    description: 'Manage the Eve agent todo list.',
    inputSchema: z.looseObject({
      todos: z.array(z.unknown()).optional(),
    }),
  }),
  agent: tool({
    description: 'Delegate work to an Eve subagent.',
    inputSchema: z.looseObject({
      name: z.string().optional(),
      agent: z.string().optional(),
      prompt: z.string().optional(),
      description: z.string().optional(),
      input: optionalUnknownRecord,
    }),
  }),
  load_skill: tool({
    description: 'Load an Eve skill into the active turn.',
    inputSchema: z.looseObject({
      name: z.string().optional(),
      skill: z.string().optional(),
    }),
  }),
  connection_search: tool({
    description: 'Search an Eve connection.',
    inputSchema: z.looseObject({
      query: z.string().optional(),
      connection: z.string().optional(),
      name: z.string().optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

const eveResumeStateSchema = z.object({
  eveSession: z.object({
    continuationToken: z.string().optional(),
    sessionId: z.string().optional(),
    streamIndex: z.number(),
  }),
});

type EveResumeState = z.infer<typeof eveResumeStateSchema>;

const EVE_NATIVE_TO_WIRE_TOOL_NAMES = new Map<string, string>([
  ['read_file', 'read'],
  ['write_file', 'write'],
  ['web_search', 'webSearch'],
  ['load-skill', 'load_skill'],
  ['load_skill', 'load_skill'],
  ['subagent-call', 'agent'],
  ['remote-agent-call', 'agent'],
]);

const EVE_STATIC_BUILTIN_TOOL_NAMES = new Set(Object.keys(EVE_BUILTIN_TOOLS));

export function createEve(
  settings: EveHarnessSettings,
): HarnessV1<typeof EVE_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'eve',
    builtinTools: EVE_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: true,
    lifecycleStateSchema: eveResumeStateSchema,
    doStart: async startOpts => {
      startOpts.abortSignal?.throwIfAborted();
      assertNoSkills({
        skills: startOpts.skills ?? [],
      });

      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const client = new Client(resolveEveClientOptions({ settings }));
      const info = await client.info();
      startOpts.abortSignal?.throwIfAborted();

      const session = client.session(
        readEveSessionState({ data: lifecycleState?.data }),
      );

      return createEveSession({
        agentInfo: info,
        clientSession: session,
        continueFrom: startOpts.continueFrom,
        isResume: lifecycleState != null,
        sessionId: startOpts.sessionId,
      });
    },
  };
}

function createEveSession({
  agentInfo,
  clientSession,
  continueFrom,
  isResume,
  sessionId,
}: {
  readonly agentInfo: AgentInfoResult;
  readonly clientSession: ClientSession;
  readonly continueFrom?: HarnessV1ContinueTurnState;
  readonly isResume: boolean;
  readonly sessionId: string;
}): HarnessV1Session {
  const modelId = agentInfo.agent.model.id;
  const pendingContinueApprovalIds = new Set(
    continueFrom?.pendingToolApprovals?.map(approval => approval.approvalId) ??
      [],
  );

  let activeAbort: ((reason: unknown) => void) | undefined;
  let activeDone: Promise<void> | undefined;
  let suspended = false;

  const lifecycleState = (
    type: 'continue-turn' | 'resume-session',
  ): HarnessV1ContinueTurnState | HarnessV1ResumeSessionState => ({
    type,
    harnessId: 'eve',
    specificationVersion: 'harness-v1',
    data: createEveResumeState({ state: clientSession.state }),
  });

  const createControl = ({
    abortSignal,
    emit,
    expectedApprovalIds,
    initialPayload,
    replayCurrentStream,
  }: {
    readonly abortSignal?: AbortSignal;
    readonly emit: (event: HarnessV1StreamPart) => void;
    readonly expectedApprovalIds?: ReadonlySet<string>;
    readonly initialPayload?: SendTurnPayload;
    readonly replayCurrentStream?: boolean;
  }): HarnessV1PromptControl => {
    const translator = createEveStreamTranslator({ modelId });
    const expected = expectedApprovalIds ?? new Set<string>();
    const approvalResponses = new Map<string, InputResponse>();

    let emittedStreamStart = false;
    let doneSettled = false;
    let pendingJobs = 0;
    let waitingForApprovals = expected.size > 0;
    let approvalSendTriggered = false;
    let tail = Promise.resolve();
    let resolveDone!: () => void;
    let rejectDone!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const emitStreamStart = (): void => {
      if (emittedStreamStart) return;
      emittedStreamStart = true;
      emit({ type: 'stream-start', modelId });
    };

    const settleIfIdle = (): void => {
      if (!doneSettled && pendingJobs === 0 && !waitingForApprovals) {
        doneSettled = true;
        resolveDone();
      }
    };

    const fail = (error: unknown): void => {
      if (doneSettled) return;
      doneSettled = true;
      rejectDone(error);
    };

    const enqueue = (work: () => Promise<void>): Promise<void> => {
      pendingJobs += 1;
      const run = tail.then(work);
      tail = run.then(
        () => {},
        error => {
          fail(error);
        },
      );
      void run
        .finally(() => {
          pendingJobs -= 1;
          settleIfIdle();
        })
        .catch(() => {});
      return run;
    };

    const consumeIterable = async (
      iterable: AsyncIterable<HandleMessageStreamEvent>,
    ): Promise<void> => {
      emitStreamStart();
      const abort = createLinkedAbortController({ abortSignal });
      activeAbort = reason => {
        suspended = true;
        abort.controller.abort(reason);
      };
      try {
        for await (const event of iterableWithAbort({
          iterable,
          signal: abort.signal,
        })) {
          for (const part of translator.translate({ event })) {
            emit(part);
          }
        }
      } catch (error) {
        if (!suspended || !isAbortError({ error })) {
          throw error;
        }
      } finally {
        abort.cleanup();
        if (activeAbort != null) {
          activeAbort = undefined;
        }
      }
    };

    const sendAndConsume = async (payload: SendTurnPayload): Promise<void> => {
      const abort = createLinkedAbortController({ abortSignal });
      activeAbort = reason => {
        suspended = true;
        abort.controller.abort(reason);
      };
      try {
        emitStreamStart();
        const response = await clientSession.send({
          ...payload,
          signal: abort.signal,
        });
        await consumeIterable(response);
      } catch (error) {
        if (!suspended || !isAbortError({ error })) {
          throw error;
        }
      } finally {
        abort.cleanup();
        if (activeAbort != null) {
          activeAbort = undefined;
        }
      }
    };

    if (initialPayload != null) {
      activeDone = enqueue(() => sendAndConsume(initialPayload));
    } else if (replayCurrentStream) {
      activeDone = enqueue(() => consumeIterable(clientSession.stream()));
    } else {
      settleIfIdle();
    }

    return {
      submitToolResult: async () => {
        unsupported(
          'custom host tool results because Eve agents define and execute their own tools',
        );
      },
      submitToolApproval: async input => {
        const response: InputResponse = {
          requestId: input.approvalId,
          optionId: input.approved ? 'approve' : 'deny',
          ...(input.reason ? { text: input.reason } : {}),
        };

        if (expected.size === 0) {
          activeDone = enqueue(() =>
            sendAndConsume({ inputResponses: [response] }),
          );
          return;
        }

        if (!expected.has(input.approvalId)) {
          unsupported(
            `tool approval '${input.approvalId}' because it is not pending in the Eve session`,
          );
        }

        approvalResponses.set(input.approvalId, response);
        if (
          !approvalSendTriggered &&
          approvalResponses.size === expected.size
        ) {
          approvalSendTriggered = true;
          waitingForApprovals = false;
          activeDone = enqueue(() =>
            sendAndConsume({
              inputResponses: [...approvalResponses.values()],
            }),
          );
        }
      },
      done,
    };
  };

  return {
    sessionId,
    isResume,
    modelId,
    doPromptTurn: async options => {
      assertNoHostTools({ tools: options.tools ?? [] });
      const payload = promptToEvePayload({
        instructions: options.instructions,
        prompt: options.prompt,
      });
      return createControl({
        abortSignal: options.abortSignal,
        emit: options.emit,
        initialPayload: payload,
      });
    },
    doCompact: async () => {
      unsupported('manual compaction');
    },
    doContinueTurn: async options => {
      assertNoHostTools({ tools: options.tools ?? [] });
      const hasPendingApprovals = pendingContinueApprovalIds.size > 0;
      return createControl({
        abortSignal: options.abortSignal,
        emit: options.emit,
        expectedApprovalIds: pendingContinueApprovalIds,
        replayCurrentStream: !hasPendingApprovals,
      });
    },
    doSuspendTurn: async () => {
      if (activeAbort != null) {
        activeAbort(new DOMException('Suspended', 'AbortError'));
      }
      await activeDone?.catch(() => {});
      return lifecycleState('continue-turn') as HarnessV1ContinueTurnState;
    },
    doDetach: async () => {
      return lifecycleState('resume-session') as HarnessV1ResumeSessionState;
    },
    doStop: async () => {
      return lifecycleState('resume-session') as HarnessV1ResumeSessionState;
    },
    doDestroy: async () => {},
  };
}

function createEveStreamTranslator({ modelId }: { readonly modelId: string }): {
  translate(input: {
    readonly event: HandleMessageStreamEvent;
  }): HarnessV1StreamPart[];
} {
  const observedToolNames = new Map<string, string>();
  let textBlock:
    | { readonly id: string; readonly stepIndex: number; soFar: string }
    | undefined;
  let reasoningBlock:
    | { readonly id: string; readonly stepIndex: number; soFar: string }
    | undefined;
  let nextTextId = 0;
  let nextReasoningId = 0;
  let lastFinishReason = mapFinishReason({ raw: 'stop' });
  let totalUsage = emptyUsage();
  let sawInputRequest = false;

  const closeText = (): HarnessV1StreamPart[] => {
    if (!textBlock) return [];
    const part: HarnessV1StreamPart = { type: 'text-end', id: textBlock.id };
    textBlock = undefined;
    return [part];
  };

  const closeReasoning = (): HarnessV1StreamPart[] => {
    if (!reasoningBlock) return [];
    const part: HarnessV1StreamPart = {
      type: 'reasoning-end',
      id: reasoningBlock.id,
    };
    reasoningBlock = undefined;
    return [part];
  };

  const closeBlocks = (): HarnessV1StreamPart[] => [
    ...closeReasoning(),
    ...closeText(),
  ];

  return {
    translate({ event }) {
      switch (event.type) {
        case 'session.started':
          return [];

        case 'turn.started':
        case 'message.received':
        case 'step.started':
        case 'turn.completed':
        case 'result.completed':
        case 'compaction.requested':
          return [];

        case 'message.appended': {
          const parts: HarnessV1StreamPart[] = closeReasoning();
          if (!textBlock || textBlock.stepIndex !== event.data.stepIndex) {
            textBlock = {
              id: `eve-text-${event.data.stepIndex}-${++nextTextId}`,
              stepIndex: event.data.stepIndex,
              soFar: '',
            };
            parts.push({ type: 'text-start', id: textBlock.id });
          }
          textBlock.soFar = event.data.messageSoFar;
          parts.push({
            type: 'text-delta',
            id: textBlock.id,
            delta: event.data.messageDelta,
          });
          return parts;
        }

        case 'message.completed': {
          const parts: HarnessV1StreamPart[] = [];
          const message = event.data.message ?? '';
          lastFinishReason = mapFinishReason({ raw: event.data.finishReason });
          if (!message) {
            parts.push(...closeText());
            return parts;
          }
          if (!textBlock) {
            const id = `eve-text-${event.data.stepIndex}-${++nextTextId}`;
            return [
              { type: 'text-start', id },
              { type: 'text-delta', id, delta: message },
              { type: 'text-end', id },
            ];
          }
          if (message.startsWith(textBlock.soFar)) {
            const missing = message.slice(textBlock.soFar.length);
            if (missing.length > 0) {
              parts.push({
                type: 'text-delta',
                id: textBlock.id,
                delta: missing,
              });
            }
          }
          parts.push(...closeText());
          return parts;
        }

        case 'reasoning.appended': {
          const parts: HarnessV1StreamPart[] = closeText();
          if (
            !reasoningBlock ||
            reasoningBlock.stepIndex !== event.data.stepIndex
          ) {
            reasoningBlock = {
              id: `eve-reasoning-${event.data.stepIndex}-${++nextReasoningId}`,
              stepIndex: event.data.stepIndex,
              soFar: '',
            };
            parts.push({
              type: 'reasoning-start',
              id: reasoningBlock.id,
            });
          }
          reasoningBlock.soFar = event.data.reasoningSoFar;
          parts.push({
            type: 'reasoning-delta',
            id: reasoningBlock.id,
            delta: event.data.reasoningDelta,
          });
          return parts;
        }

        case 'reasoning.completed': {
          const parts: HarnessV1StreamPart[] = [];
          if (!reasoningBlock) {
            const id = `eve-reasoning-${event.data.stepIndex}-${++nextReasoningId}`;
            return [
              { type: 'reasoning-start', id },
              { type: 'reasoning-delta', id, delta: event.data.reasoning },
              { type: 'reasoning-end', id },
            ];
          }
          if (event.data.reasoning.startsWith(reasoningBlock.soFar)) {
            const missing = event.data.reasoning.slice(
              reasoningBlock.soFar.length,
            );
            if (missing.length > 0) {
              parts.push({
                type: 'reasoning-delta',
                id: reasoningBlock.id,
                delta: missing,
              });
            }
          }
          parts.push(...closeReasoning());
          return parts;
        }

        case 'actions.requested':
          return translateActionsRequested({
            event,
            observedToolNames,
          });

        case 'input.requested': {
          sawInputRequest = true;
          return translateInputRequested({
            event,
            observedToolNames,
          });
        }

        case 'action.result':
          return translateActionResult({
            event,
            observedToolNames,
          });

        case 'step.completed': {
          totalUsage = addUsage({
            left: totalUsage,
            right: mapStepUsage({ event }),
          });
          lastFinishReason = mapFinishReason({ raw: event.data.finishReason });
          return [
            ...closeBlocks(),
            {
              type: 'finish-step',
              finishReason: lastFinishReason,
              usage: mapStepUsage({ event }),
            },
          ];
        }

        case 'compaction.completed':
          return [
            {
              type: 'compaction',
              trigger: 'auto',
              summary: `Eve compacted the remote session with ${modelId}.`,
            },
          ];

        case 'session.waiting':
        case 'session.completed':
          return [
            ...closeBlocks(),
            {
              type: 'finish',
              finishReason:
                event.type === 'session.waiting' && sawInputRequest
                  ? mapFinishReason({ raw: 'tool-calls' })
                  : lastFinishReason,
              totalUsage,
            },
          ];

        case 'authorization.required':
          unsupported('Eve connection authorization requests');

        case 'authorization.completed':
          return [];

        case 'subagent.called':
        case 'subagent.started':
        case 'subagent.event':
        case 'subagent.completed':
          return [];

        case 'step.failed':
        case 'turn.failed':
        case 'session.failed':
          throw new Error(event.data.message);
      }
    },
  };
}

function translateActionsRequested({
  event,
  observedToolNames,
}: {
  readonly event: ActionsRequestedStreamEvent;
  readonly observedToolNames: Map<string, string>;
}): HarnessV1StreamPart[] {
  return event.data.actions.map(action => {
    const nativeName =
      action.kind === 'tool-call'
        ? action.toolName
        : action.kind === 'load-skill'
          ? 'load_skill'
          : action.kind;
    if (nativeName === 'ask_question') {
      unsupported('Eve ask_question tool calls');
    }
    const { dynamic, wireName } = resolveEveToolName({ nativeName });
    observedToolNames.set(action.callId, wireName);
    return {
      type: 'tool-call',
      toolCallId: action.callId,
      toolName: wireName,
      input: JSON.stringify('input' in action ? action.input : {}),
      providerExecuted: true,
      ...(dynamic ? { dynamic: true } : {}),
      ...(nativeName !== wireName ? { nativeName } : {}),
    };
  });
}

function translateInputRequested({
  event,
  observedToolNames,
}: {
  readonly event: {
    readonly data: { readonly requests: readonly InputRequest[] };
    readonly type: 'input.requested';
  };
  readonly observedToolNames: Map<string, string>;
}): HarnessV1StreamPart[] {
  const parts: HarnessV1StreamPart[] = [];

  for (const request of event.data.requests) {
    if (request.action.toolName === 'ask_question') {
      unsupported('Eve ask_question input requests');
    }
    if (request.display !== 'confirmation') {
      unsupported(`Eve '${request.display ?? 'unknown'}' input requests`);
    }

    if (!observedToolNames.has(request.action.callId)) {
      const { dynamic, wireName } = resolveEveToolName({
        nativeName: request.action.toolName,
      });
      observedToolNames.set(request.action.callId, wireName);
      parts.push({
        type: 'tool-call',
        toolCallId: request.action.callId,
        toolName: wireName,
        input: JSON.stringify(request.action.input),
        providerExecuted: true,
        ...(dynamic ? { dynamic: true } : {}),
        ...(request.action.toolName !== wireName
          ? { nativeName: request.action.toolName }
          : {}),
      });
    }

    parts.push({
      type: 'tool-approval-request',
      approvalId: request.requestId,
      toolCallId: request.action.callId,
    });
  }

  return parts;
}

function translateActionResult({
  event,
  observedToolNames,
}: {
  readonly event: ActionResultStreamEvent;
  readonly observedToolNames: Map<string, string>;
}): HarnessV1StreamPart[] {
  const result = event.data.result;
  const nativeName =
    result.kind === 'tool-result'
      ? result.toolName
      : result.kind === 'load-skill-result'
        ? 'load_skill'
        : 'agent';
  const { dynamic, wireName } = resolveEveToolName({ nativeName });
  return [
    {
      type: 'tool-result',
      toolCallId: result.callId,
      toolName: observedToolNames.get(result.callId) ?? wireName,
      result: (result.output ?? null) as NonNullable<JSONValue>,
      ...(event.data.status === 'failed' || result.isError
        ? { isError: true }
        : {}),
      ...(dynamic ? { dynamic: true } : {}),
    },
  ];
}

function promptToEvePayload({
  instructions,
  prompt,
}: {
  readonly instructions?: string;
  readonly prompt: HarnessV1Prompt;
}): SendTurnPayload {
  if (typeof prompt === 'string') {
    return {
      message: prompt,
      ...(instructions ? { clientContext: instructions } : {}),
    };
  }

  if (prompt.providerOptions != null) {
    unsupported('provider-specific prompt options');
  }

  return {
    message: prompt.content as SendTurnPayload['message'],
    ...(instructions ? { clientContext: instructions } : {}),
  };
}

function readEveSessionState({
  data,
}: {
  readonly data: unknown;
}): SessionState | undefined {
  const parsed = eveResumeStateSchema.safeParse(data);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.eveSession;
}

function createEveResumeState({
  state,
}: {
  readonly state: SessionState;
}): EveResumeState {
  return {
    eveSession: {
      ...(state.continuationToken
        ? { continuationToken: state.continuationToken }
        : {}),
      ...(state.sessionId ? { sessionId: state.sessionId } : {}),
      streamIndex: state.streamIndex,
    },
  };
}

function resolveEveToolName({ nativeName }: { readonly nativeName: string }): {
  readonly dynamic: boolean;
  readonly wireName: string;
} {
  const wireName = EVE_NATIVE_TO_WIRE_TOOL_NAMES.get(nativeName) ?? nativeName;
  return {
    wireName,
    dynamic: !EVE_STATIC_BUILTIN_TOOL_NAMES.has(wireName),
  };
}

function mapStepUsage({
  event,
}: {
  readonly event: StepCompletedStreamEvent;
}): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: event.data.usage?.inputTokens,
      noCache:
        event.data.usage?.inputTokens == null
          ? undefined
          : event.data.usage.inputTokens -
            (event.data.usage.cacheReadTokens ?? 0) -
            (event.data.usage.cacheWriteTokens ?? 0),
      cacheRead: event.data.usage?.cacheReadTokens,
      cacheWrite: event.data.usage?.cacheWriteTokens,
    },
    outputTokens: {
      total: event.data.usage?.outputTokens,
      text: undefined,
      reasoning: undefined,
    },
    raw: (event.data.usage ?? {}) as Record<string, JSONValue>,
  };
}

function emptyUsage(): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
    raw: {},
  };
}

function addUsage({
  left,
  right,
}: {
  readonly left: LanguageModelV4Usage;
  readonly right: LanguageModelV4Usage;
}): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: addOptional(left.inputTokens.total, right.inputTokens.total),
      noCache: addOptional(left.inputTokens.noCache, right.inputTokens.noCache),
      cacheRead: addOptional(
        left.inputTokens.cacheRead,
        right.inputTokens.cacheRead,
      ),
      cacheWrite: addOptional(
        left.inputTokens.cacheWrite,
        right.inputTokens.cacheWrite,
      ),
    },
    outputTokens: {
      total: addOptional(left.outputTokens.total, right.outputTokens.total),
      text: addOptional(left.outputTokens.text, right.outputTokens.text),
      reasoning: addOptional(
        left.outputTokens.reasoning,
        right.outputTokens.reasoning,
      ),
    },
    raw: {},
  };
}

function addOptional(left?: number, right?: number): number | undefined {
  if (left == null) return right;
  if (right == null) return left;
  return left + right;
}

function mapFinishReason({
  raw,
}: {
  readonly raw: AssistantStepFinishReason;
}): LanguageModelV4FinishReason {
  switch (raw) {
    case 'stop':
    case 'length':
    case 'content-filter':
    case 'tool-calls':
      return { unified: raw, raw };
    case 'error':
      return { unified: 'error', raw };
    case 'other':
      return { unified: 'other', raw };
  }
}

async function* iterableWithAbort({
  iterable,
  signal,
}: {
  readonly iterable: AsyncIterable<HandleMessageStreamEvent>;
  readonly signal: AbortSignal;
}): AsyncIterable<HandleMessageStreamEvent> {
  signal.throwIfAborted();
  for await (const event of iterable) {
    signal.throwIfAborted();
    yield event;
  }
}

function createLinkedAbortController({
  abortSignal,
}: {
  readonly abortSignal?: AbortSignal;
}): {
  readonly cleanup: () => void;
  readonly controller: AbortController;
  readonly signal: AbortSignal;
} {
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort(abortSignal?.reason);
  };

  if (abortSignal?.aborted) {
    onAbort();
  } else {
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  }

  return {
    cleanup: () => abortSignal?.removeEventListener('abort', onAbort),
    controller,
    signal: controller.signal,
  };
}

function isAbortError({ error }: { readonly error: unknown }): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

function assertNoHostTools({
  tools,
}: {
  readonly tools: ReadonlyArray<HarnessV1ToolSpec>;
}): void {
  if (tools.length === 0) return;
  unsupported('custom host tools because Eve agents define their own tools');
}

function assertNoSkills({
  skills,
}: {
  readonly skills: ReadonlyArray<unknown>;
}): void {
  if (skills.length === 0) return;
  unsupported('custom skills because Eve agents define their own skills');
}

function unsupported(message: string): never {
  throw new HarnessCapabilityUnsupportedError({
    harnessId: 'eve',
    message: `Harness 'eve' does not support ${message}.`,
  });
}
