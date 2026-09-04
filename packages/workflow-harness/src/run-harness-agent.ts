import type {
  HarnessV1ContinueTurnState,
  HarnessV1Prompt,
  HarnessV1ResumeSessionState,
} from '@ai-sdk/harness';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import type {
  HarnessWorkflowModelMessage,
  HarnessWorkflowSerializedChunk,
  HarnessWorkflowState,
  HarnessWorkflowStreamContext,
  HarnessWorkflowUsageSummary,
} from './harness-workflow-state';

/** The non-string arm of {@link HarnessV1Prompt} — a single `UserModelMessage`. */
type HarnessV1UserMessage = Exclude<HarnessV1Prompt, string>;

/** A UI-message-stream chunk. Kept structural so this package need not depend on `ai`. */
export interface HarnessWorkflowChunk {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * The subset of a harness `stream()` / `continueStream()` result the runner uses.
 * `StreamTextResult` satisfies it structurally.
 */
export interface HarnessWorkflowStreamResult {
  toUIMessageStream(): ReadableStream<HarnessWorkflowChunk>;
  readonly finishReason: PromiseLike<unknown>;
  readonly totalUsage: PromiseLike<unknown>;
}

/**
 * The subset of `HarnessAgent` the runner drives. Declared structurally so
 * the engine is decoupled from the concrete agent generics and easy to mock.
 */
export interface HarnessWorkflowAgent {
  createSession(options?: {
    sessionId?: string;
    resumeFrom?: HarnessV1ResumeSessionState;
    continueFrom?: HarnessV1ContinueTurnState;
  }): Promise<HarnessAgentSession>;
  stream(
    options:
      | {
          session: HarnessAgentSession;
          /**
           * The new user turn. A string or an array of user messages — the shape
           * `HarnessAgent.stream` accepts (it collapses an array to its last user
           * entry). The engine passes the run's single {@link HarnessV1Prompt}.
           */
          prompt: string | HarnessV1UserMessage[];
          messages?: undefined;
        }
      | {
          session: HarnessAgentSession;
          prompt?: undefined;
          messages: HarnessWorkflowModelMessage[];
        },
  ): Promise<HarnessWorkflowStreamResult>;
  continueStream(options: {
    session: HarnessAgentSession;
  }): Promise<HarnessWorkflowStreamResult>;
}

export interface RunHarnessAgentOptions {
  readonly agent: HarnessWorkflowAgent;
  readonly state: HarnessWorkflowState;
  readonly timeSliceSeconds?: number;
  /**
   * When the turn finishes, whether to destroy the sandbox. Defaults to `false`:
   * the session is parked or stopped and a fresh resume state is returned in
   * `resumeFrom`, so the next user turn reattaches to the same conversation
   * (multi-turn chat). Set `true` for a one-shot run that should release the
   * sandbox when the turn completes.
   */
  readonly destroyOnFinish?: boolean;
  /**
   * Where to write the turn's UI-message chunks. Defaults to the workflow's
   * output stream (`getWritable()` from `workflow`). Inject a stream in tests
   * to run the engine without a workflow runtime.
   */
  readonly writable?: WritableStream<HarnessWorkflowChunk>;
}

/**
 * Run one durable execution of a harness agent turn.
 *
 * Intended to be the body of a consumer's `'use step'`: it resumes (or starts)
 * the session and streams the turn's chunks to the workflow output. When
 * `timeSliceSeconds` is present, it also races the turn against that wall-clock
 * budget and suspends the turn when the time slice completes.
 *
 * The returned {@link HarnessWorkflowState} is serializable and is meant to be
 * the step's return value — the Workflow DevKit persists it as the durable
 * checkpoint between workflow steps.
 */
export async function runHarnessAgent(
  options: RunHarnessAgentOptions,
): Promise<HarnessWorkflowState> {
  const { agent, state } = options;
  const destroyOnFinish = options.destroyOnFinish ?? false;

  const session =
    state.continueFrom != null
      ? await agent.createSession({
          sessionId: state.sessionId,
          continueFrom: state.continueFrom,
        })
      : state.resumeFrom != null
        ? await agent.createSession({
            sessionId: state.sessionId,
            resumeFrom: state.resumeFrom,
          })
        : await agent.createSession({ sessionId: state.sessionId });

  let result: HarnessWorkflowStreamResult;
  try {
    result =
      state.messages != null
        ? await agent.stream({
            session,
            messages: state.messages,
          })
        : state.continueFrom != null
          ? await agent.continueStream({ session })
          : await agent.stream({
              session,
              prompt:
                typeof state.prompt === 'string'
                  ? state.prompt
                  : [state.prompt],
            });
  } catch (err) {
    await destroyQuietly(session);
    return {
      sessionId: state.sessionId,
      prompt: state.prompt,
      status: 'failed',
      ...(state.resumeFrom != null ? { resumeFrom: state.resumeFrom } : {}),
      ...(state.continueFrom != null
        ? { continueFrom: state.continueFrom }
        : {}),
      error: errorMessage(err),
    };
  }

  const writable = options.writable ?? (await resolveWorkflowWritable());
  const writer = writable.getWriter();
  const streamContext = createMutableStreamContext(state.streamContext);
  const executionPartState = createExecutionPartState();
  let skipFirstStartStep =
    state.continueFrom != null &&
    Object.keys(streamContext.activeToolInputs).length > 0;

  let suspendPromise: Promise<HarnessV1ContinueTurnState> | undefined;
  const timer =
    options.timeSliceSeconds == null
      ? undefined
      : setTimeout(() => {
          if (session.hasUnfinishedTurn()) {
            suspendPromise = session.suspendTurn();
          }
        }, options.timeSliceSeconds * 1000);
  (timer as { unref?: () => void } | undefined)?.unref?.();

  let sawError = false;
  // Tracks whether the writable was closed (only on a finished turn). The
  // `finally` then releases the lock only when we did NOT close, since closing
  // already releases it.
  let writerClosed = false;
  try {
    const reader = result.toUIMessageStream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value == null) continue;
        /*
         * One continuous assistant message per user turn: the execution that
         * starts the turn keeps the opening `start`; executions that continue
         * an already suspended turn drop it. Intermediate `finish` chunks are
         * dropped and the loop writes a single terminal `finish` itself when
         * the run completes. A new user turn keeps its `start` so the UI
         * renders it as a fresh assistant message.
         */
        if (value.type === 'start' && state.continueFrom != null) continue;
        if (value.type === 'finish') continue;
        if (value.type === 'start-step' && skipFirstStartStep) {
          skipFirstStartStep = false;
          continue;
        }
        if (value.type === 'error') {
          const errorText = (value as { errorText?: unknown }).errorText;
          /*
           * When a suspend is in flight we tore the turn down at the execution
           * boundary, so an *abort* error is the expected consequence —
           * swallow it (surfacing it would replace the streamed content with
           * an error, and the next execution continues the turn). Any
           * non-abort error is unanticipated and must NOT be silenced: surface
           * it and fail the execution, even mid-suspend.
           */
          if (suspendPromise != null && isAbortError(errorText)) {
            continue;
          }
          sawError = true;
        }
        await writeWorkflowChunk({
          chunk: value,
          writer,
          streamContext,
          executionPartState,
        });
      }
    } finally {
      if (timer != null) clearTimeout(timer);
      reader.releaseLock();
    }

    /*
     * A non-abort error (anything `sawError` survived the abort filter for) is
     * a real failure and takes priority over a completed time slice. Abort
     * errors during suspension were already filtered above.
     */
    if (sawError) {
      if (suspendPromise != null) await suspendPromise.catch(() => {});
      await destroyQuietly(session);
      return {
        sessionId: state.sessionId,
        prompt: state.prompt,
        status: 'failed',
        ...(state.resumeFrom != null ? { resumeFrom: state.resumeFrom } : {}),
        ...(state.continueFrom != null
          ? { continueFrom: state.continueFrom }
          : {}),
        error: 'harness turn emitted an error',
      };
    }

    /*
     * The time slice completed: the turn keeps running in the sandbox. Persist
     * the cursor so the next time slice attaches to the same in-flight turn.
     */
    if (suspendPromise != null) {
      const continueFrom = await suspendPromise;
      await closeOpenExecutionParts({
        writer,
        streamContext,
        executionPartState,
      });
      return {
        sessionId: state.sessionId,
        prompt: state.prompt,
        status: 'ready_for_next_step',
        continueFrom,
        ...serializeStreamContextField(streamContext),
      };
    }

    const [finishReason, usage] = await Promise.all([
      Promise.resolve(result.finishReason).catch(() => undefined),
      Promise.resolve(result.totalUsage).catch(() => undefined),
    ]);
    const normalizedFinishReason = toFinishReasonString(finishReason);

    if (session.hasUnfinishedTurn()) {
      const continueFrom = await session.suspendTurn();

      if (!hasPendingHostInput(continueFrom)) {
        await closeOpenExecutionParts({
          writer,
          streamContext,
          executionPartState,
        });
        return {
          sessionId: state.sessionId,
          prompt: state.prompt,
          status: 'ready_for_next_step',
          continueFrom,
          ...serializeStreamContextField(streamContext),
        };
      }

      await writer.write({
        type: 'finish',
        finishReason: normalizedFinishReason,
      });
      await writer.close();
      writerClosed = true;
      return {
        sessionId: state.sessionId,
        prompt: state.prompt,
        status: 'awaiting_tool_approval',
        continueFrom,
        resumeFrom: toResumeState({ continueFrom }),
        finalResult: {
          sessionId: state.sessionId,
          finishReason: normalizedFinishReason,
          usage: toUsageSummary(usage),
        },
      };
    }

    // The turn finished on its own: write the single terminal `finish` for the
    // UI message, then CLOSE the writable. Closing matters: the workflow output
    // stream (`getWritable()`) is what the run's `readable` is fed from, and the
    // DevKit only marks that run stream "done" when the writable is closed — a
    // released-but-open writer leaves it open forever, so a consumer piping
    // `run.readable` into a UI-message-stream response never receives the
    // terminal close and the client stays "streaming" indefinitely.
    // `ready_for_next_step` and `failed` deliberately do NOT close — another
    // execution keeps writing, or the failure propagates.
    await writer.write({ type: 'finish' });
    await writer.close();
    writerClosed = true;

    /*
     * Capture resume state for the *next user turn* before ending this local
     * session handle. `detach()` parks the session without stopping the sandbox;
     * bridge-backed sessions usually resume by attach/replay, while
     * host-resident sessions may resume by rerun. A one-shot consumer opts into
     * `destroyOnFinish` to destroy the sandbox instead.
     */
    let resumeFrom = state.resumeFrom;
    if (destroyOnFinish) {
      await destroyQuietly(session);
      resumeFrom = undefined;
    } else {
      resumeFrom = await session.detach().catch(() => state.resumeFrom);
    }

    return {
      sessionId: state.sessionId,
      prompt: state.prompt,
      status: 'finished',
      ...(resumeFrom != null ? { resumeFrom } : {}),
      finalResult: {
        sessionId: state.sessionId,
        finishReason: normalizedFinishReason,
        usage: toUsageSummary(usage),
      },
    };
  } finally {
    if (!writerClosed) writer.releaseLock();
  }
}

type MutableStreamContext = {
  activeTextParts: Record<string, HarnessWorkflowSerializedChunk>;
  activeReasoningParts: Record<string, HarnessWorkflowSerializedChunk>;
  activeToolInputs: Record<
    string,
    {
      readonly start: HarnessWorkflowSerializedChunk;
      readonly text: string;
    }
  >;
  pendingToolInputs: Record<string, HarnessWorkflowSerializedChunk>;
};

type ExecutionPartState = {
  openedTextParts: Set<string>;
  openedReasoningParts: Set<string>;
  openedToolInputs: Set<string>;
};

function createMutableStreamContext(
  context: HarnessWorkflowStreamContext | undefined,
): MutableStreamContext {
  return {
    activeTextParts: { ...(context?.activeTextParts ?? {}) },
    activeReasoningParts: { ...(context?.activeReasoningParts ?? {}) },
    activeToolInputs: { ...(context?.activeToolInputs ?? {}) },
    pendingToolInputs: { ...(context?.pendingToolInputs ?? {}) },
  };
}

function createExecutionPartState(): ExecutionPartState {
  return {
    openedTextParts: new Set(),
    openedReasoningParts: new Set(),
    openedToolInputs: new Set(),
  };
}

async function writeWorkflowChunk(options: {
  chunk: HarnessWorkflowChunk;
  writer: WritableStreamDefaultWriter<HarnessWorkflowChunk>;
  streamContext: MutableStreamContext;
  executionPartState: ExecutionPartState;
}): Promise<void> {
  await writeRequiredPrelude(options);
  await options.writer.write(options.chunk);
  recordWorkflowChunk(options);
}

async function writeRequiredPrelude(options: {
  chunk: HarnessWorkflowChunk;
  writer: WritableStreamDefaultWriter<HarnessWorkflowChunk>;
  streamContext: MutableStreamContext;
  executionPartState: ExecutionPartState;
}): Promise<void> {
  const { chunk, writer, streamContext, executionPartState } = options;
  const id = stringProperty({ chunk, key: 'id' });
  const toolCallId = stringProperty({ chunk, key: 'toolCallId' });

  if (
    (chunk.type === 'text-delta' || chunk.type === 'text-end') &&
    id != null &&
    streamContext.activeTextParts[id] != null &&
    !executionPartState.openedTextParts.has(id)
  ) {
    await writer.write(streamContext.activeTextParts[id]);
    executionPartState.openedTextParts.add(id);
  }

  if (
    (chunk.type === 'reasoning-delta' || chunk.type === 'reasoning-end') &&
    id != null &&
    streamContext.activeReasoningParts[id] != null &&
    !executionPartState.openedReasoningParts.has(id)
  ) {
    await writer.write(streamContext.activeReasoningParts[id]);
    executionPartState.openedReasoningParts.add(id);
  }

  const activeToolInput =
    toolCallId == null ? undefined : streamContext.activeToolInputs[toolCallId];
  if (
    chunk.type === 'tool-input-delta' &&
    toolCallId != null &&
    activeToolInput != null &&
    !executionPartState.openedToolInputs.has(toolCallId)
  ) {
    await writer.write(activeToolInput.start);
    if (activeToolInput.text.length > 0) {
      await writer.write({
        type: 'tool-input-delta',
        toolCallId,
        inputTextDelta: activeToolInput.text,
      });
    }
    executionPartState.openedToolInputs.add(toolCallId);
  }
}

function recordWorkflowChunk(options: {
  chunk: HarnessWorkflowChunk;
  streamContext: MutableStreamContext;
  executionPartState: ExecutionPartState;
}): void {
  const { chunk, streamContext, executionPartState } = options;
  const id = stringProperty({ chunk, key: 'id' });
  const toolCallId = stringProperty({ chunk, key: 'toolCallId' });

  if (chunk.type === 'text-start' && id != null) {
    streamContext.activeTextParts[id] = cloneChunk(chunk);
    executionPartState.openedTextParts.add(id);
    return;
  }

  if (chunk.type === 'text-end' && id != null) {
    delete streamContext.activeTextParts[id];
    executionPartState.openedTextParts.delete(id);
    return;
  }

  if (chunk.type === 'reasoning-start' && id != null) {
    streamContext.activeReasoningParts[id] = cloneChunk(chunk);
    executionPartState.openedReasoningParts.add(id);
    return;
  }

  if (chunk.type === 'reasoning-end' && id != null) {
    delete streamContext.activeReasoningParts[id];
    executionPartState.openedReasoningParts.delete(id);
    return;
  }

  if (chunk.type === 'tool-input-start' && toolCallId != null) {
    streamContext.activeToolInputs[toolCallId] = {
      start: cloneChunk(chunk),
      text: '',
    };
    executionPartState.openedToolInputs.add(toolCallId);
    return;
  }

  if (chunk.type === 'tool-input-delta' && toolCallId != null) {
    const activeToolInput = streamContext.activeToolInputs[toolCallId];
    const inputTextDelta = stringProperty({
      chunk,
      key: 'inputTextDelta',
    });
    if (activeToolInput != null && inputTextDelta != null) {
      streamContext.activeToolInputs[toolCallId] = {
        start: activeToolInput.start,
        text: activeToolInput.text + inputTextDelta,
      };
    }
    return;
  }

  if (chunk.type === 'tool-input-available' && toolCallId != null) {
    delete streamContext.activeToolInputs[toolCallId];
    executionPartState.openedToolInputs.delete(toolCallId);
    streamContext.pendingToolInputs[toolCallId] = cloneChunk(chunk);
    return;
  }

  if (chunk.type === 'tool-input-error' && toolCallId != null) {
    delete streamContext.activeToolInputs[toolCallId];
    executionPartState.openedToolInputs.delete(toolCallId);
    delete streamContext.pendingToolInputs[toolCallId];
    return;
  }

  if (
    (chunk.type === 'tool-output-error' ||
      chunk.type === 'tool-output-denied' ||
      (chunk.type === 'tool-output-available' &&
        (chunk as { preliminary?: unknown }).preliminary !== true)) &&
    toolCallId != null
  ) {
    delete streamContext.pendingToolInputs[toolCallId];
  }
}

async function closeOpenExecutionParts(options: {
  writer: WritableStreamDefaultWriter<HarnessWorkflowChunk>;
  streamContext: MutableStreamContext;
  executionPartState: ExecutionPartState;
}): Promise<void> {
  const { writer, streamContext, executionPartState } = options;

  for (const id of executionPartState.openedTextParts) {
    if (streamContext.activeTextParts[id] != null) {
      await writer.write({ type: 'text-end', id });
    }
  }
  executionPartState.openedTextParts.clear();

  for (const id of executionPartState.openedReasoningParts) {
    if (streamContext.activeReasoningParts[id] != null) {
      await writer.write({ type: 'reasoning-end', id });
    }
  }
  executionPartState.openedReasoningParts.clear();
}

function serializeStreamContextField(context: MutableStreamContext): {
  streamContext?: HarnessWorkflowStreamContext;
} {
  const streamContext: HarnessWorkflowStreamContext = {
    ...(Object.keys(context.activeTextParts).length > 0
      ? { activeTextParts: context.activeTextParts }
      : {}),
    ...(Object.keys(context.activeReasoningParts).length > 0
      ? { activeReasoningParts: context.activeReasoningParts }
      : {}),
    ...(Object.keys(context.activeToolInputs).length > 0
      ? { activeToolInputs: context.activeToolInputs }
      : {}),
    ...(Object.keys(context.pendingToolInputs).length > 0
      ? { pendingToolInputs: context.pendingToolInputs }
      : {}),
  };
  return Object.keys(streamContext).length > 0 ? { streamContext } : {};
}

function hasPendingHostInput(state: HarnessV1ContinueTurnState): boolean {
  return (
    (state.pendingToolApprovals?.length ?? 0) > 0 ||
    (state.pendingToolResults?.length ?? 0) > 0
  );
}

function toResumeState(options: {
  continueFrom: HarnessV1ContinueTurnState;
}): HarnessV1ResumeSessionState {
  const { continueFrom } = options;
  return {
    type: 'resume-session',
    harnessId: continueFrom.harnessId,
    specificationVersion: continueFrom.specificationVersion,
    data: continueFrom.data,
    continueFrom,
  };
}

function stringProperty(options: {
  chunk: HarnessWorkflowChunk;
  key: string;
}): string | undefined {
  const value = options.chunk[options.key];
  return typeof value === 'string' ? value : undefined;
}

function cloneChunk(
  chunk: HarnessWorkflowChunk,
): HarnessWorkflowSerializedChunk {
  return { ...chunk };
}

/**
 * Resolve the workflow's default output stream lazily, so importing this module
 * never requires the `workflow` runtime (tests inject their own `writable`).
 */
async function resolveWorkflowWritable(): Promise<
  WritableStream<HarnessWorkflowChunk>
> {
  const { getWritable } = (await import('workflow')) as {
    getWritable: <T>() => WritableStream<T>;
  };
  return getWritable<HarnessWorkflowChunk>();
}

async function destroyQuietly(session: HarnessAgentSession): Promise<void> {
  await session.destroy().catch(() => {});
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Whether an error (or UI `error` part's `errorText`) is an abort — the
 * expected consequence of `suspendTurn()` tearing the turn down at a slice
 * boundary. Only these are safe to swallow during a suspend; any other error is
 * unanticipated and must surface.
 */
function isAbortError(value: unknown): boolean {
  if (value == null) return false;
  if (
    typeof value === 'object' &&
    (value as { name?: unknown }).name === 'AbortError'
  ) {
    return true;
  }
  const text =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? value.message
        : String(value);
  return /\baborted\b|AbortError|operation was aborted/i.test(text);
}

function toFinishReasonString(finishReason: unknown): string {
  if (typeof finishReason === 'string') return finishReason;
  if (
    finishReason != null &&
    typeof finishReason === 'object' &&
    typeof (finishReason as { unified?: unknown }).unified === 'string'
  ) {
    return (finishReason as { unified: string }).unified;
  }
  return 'stop';
}

function toUsageSummary(
  usage: unknown,
): HarnessWorkflowUsageSummary | undefined {
  if (usage == null || typeof usage !== 'object') return undefined;
  const u = usage as {
    inputTokens?: number | { total?: number };
    outputTokens?: number | { total?: number };
  };
  const inputTokens =
    typeof u.inputTokens === 'number' ? u.inputTokens : u.inputTokens?.total;
  const outputTokens =
    typeof u.outputTokens === 'number' ? u.outputTokens : u.outputTokens?.total;
  if (inputTokens == null && outputTokens == null) return undefined;
  return {
    ...(inputTokens != null ? { inputTokens } : {}),
    ...(outputTokens != null ? { outputTokens } : {}),
  };
}
