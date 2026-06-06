import type { HarnessV1Prompt, HarnessV1ResumeState } from '@ai-sdk/harness';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import type {
  HarnessWorkflowState,
  HarnessWorkflowUsageSummary,
} from './harness-workflow-state';

/** The non-string arm of {@link HarnessV1Prompt} — a single `UserModelMessage`. */
type HarnessV1UserMessage = Exclude<HarnessV1Prompt, string>;

/*
 * Default wall-clock budget for one slice, in seconds.
 *
 * Vercel Fluid Compute recycles a function instance at ~800s, forcing it to
 * reconnect; freezing the slice at 750s lands just before that with a small
 * safety buffer, so the next invocation reattaches to the still-running sandbox
 * rather than being torn down mid-turn.
 */
const DEFAULT_SLICE_TIMEOUT_SECONDS = 750;

/** A UI-message-stream chunk. Kept structural so this package need not depend on `ai`. */
export interface HarnessWorkflowChunk {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * The subset of a harness `stream()` / `continueTurn()` result the slice loop uses.
 * `StreamTextResult` satisfies it structurally.
 */
export interface HarnessWorkflowStreamResult {
  toUIMessageStream(): ReadableStream<HarnessWorkflowChunk>;
  readonly finishReason: PromiseLike<unknown>;
  readonly totalUsage: PromiseLike<unknown>;
}

/**
 * The subset of `HarnessAgent` the slice loop drives. Declared structurally so
 * the engine is decoupled from the concrete agent generics and easy to mock.
 */
export interface HarnessWorkflowAgent {
  createSession(options?: {
    sessionId?: string;
    resumeFrom?: HarnessV1ResumeState;
  }): Promise<HarnessAgentSession>;
  stream(options: {
    session: HarnessAgentSession;
    /**
     * The new user turn. A string or an array of user messages — the shape
     * `HarnessAgent.stream` accepts (it collapses an array to its last user
     * entry). The engine passes the run's single {@link HarnessV1Prompt}.
     */
    prompt: string | HarnessV1UserMessage[];
  }): Promise<HarnessWorkflowStreamResult>;
  continueTurn(options: {
    session: HarnessAgentSession;
  }): Promise<HarnessWorkflowStreamResult>;
}

export interface RunHarnessAgentSliceOptions {
  readonly agent: HarnessWorkflowAgent;
  readonly state: HarnessWorkflowState;
  /** Wall-clock budget for this slice. Defaults to {@link DEFAULT_SLICE_TIMEOUT_SECONDS}. */
  readonly sliceTimeoutSeconds?: number;
  /**
   * When the turn finishes, whether to destroy the sandbox. Defaults to `false`:
   * the session is parked or stopped and a fresh resume state is returned in
   * `resumeState`, so the next user turn reattaches to the same conversation
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
 * Run one durable slice of a harness agent turn.
 *
 * Intended to be the body of a consumer's `'use step'`: it resumes (or starts)
 * the session, streams the turn's chunks to the workflow output, and races the
 * turn against a wall-clock budget. If the budget fires first it freezes the
 * turn with `session.suspendTurn()` (the sandbox keeps running) and returns a
 * `timed_out` state carrying the resume cursor for the next slice; if the turn
 * finishes first it returns a `finished` state with the result.
 *
 * The returned {@link HarnessWorkflowState} is serializable and is meant to be
 * the step's return value — the Workflow DevKit persists it as the durable
 * checkpoint between slices.
 */
export async function runHarnessAgentSlice(
  options: RunHarnessAgentSliceOptions,
): Promise<HarnessWorkflowState> {
  const { agent, state } = options;
  const sliceTimeoutSeconds =
    options.sliceTimeoutSeconds ?? DEFAULT_SLICE_TIMEOUT_SECONDS;
  const destroyOnFinish = options.destroyOnFinish ?? false;

  // `resumeState` decides the session: resume an existing one (a prior run's
  // warm handle or a prior slice's cursor) when present, else start cold.
  const session =
    state.resumeState != null
      ? await agent.createSession({
          sessionId: state.sessionId,
          resumeFrom: state.resumeState,
        })
      : await agent.createSession({ sessionId: state.sessionId });

  let result: HarnessWorkflowStreamResult;
  try {
    // `turnStarted` decides the action: continue an already-started (then
    // suspended) turn, else send this run's prompt as a fresh user turn. A
    // single user message is wrapped in an array — the shape `stream` accepts.
    result = state.turnStarted
      ? await agent.continueTurn({ session })
      : await agent.stream({
          session,
          prompt:
            typeof state.prompt === 'string' ? state.prompt : [state.prompt],
        });
  } catch (err) {
    await destroyQuietly(session);
    return { ...state, status: 'failed', error: errorMessage(err) };
  }

  const writable = options.writable ?? (await resolveWorkflowWritable());
  const writer = writable.getWriter();

  let suspendPromise: Promise<HarnessV1ResumeState> | undefined;
  const timer = setTimeout(() => {
    suspendPromise = session.suspendTurn();
  }, sliceTimeoutSeconds * 1000);
  (timer as { unref?: () => void }).unref?.();

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
         * One continuous assistant message per user turn: the slice that starts
         * the turn keeps the opening `start`; slices that continue an already
         * suspended turn drop it. Intermediate `finish` chunks are dropped and
         * the loop writes a single terminal `finish` itself when the run
         * completes. (A new user turn — `turnStarted: false` — keeps its `start`
         * so the UI renders it as a fresh assistant message.)
         */
        if (value.type === 'start' && state.turnStarted) continue;
        if (value.type === 'finish') continue;
        if (value.type === 'error') {
          const errorText = (value as { errorText?: unknown }).errorText;
          /*
           * When a suspend is in flight we tore the turn down at the slice
           * boundary, so an *abort* error is the expected consequence — swallow
           * it (surfacing it would replace the streamed content with an error,
           * and the next slice continues the turn). Any non-abort error is
           * unanticipated and must NOT be silenced: surface it and fail the
           * slice, even mid-suspend.
           */
          if (suspendPromise != null && isAbortError(errorText)) {
            continue;
          }
          sawError = true;
        }
        await writer.write(value);
      }
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }

    // A non-abort error (anything `sawError` survived the abort filter for) is a
    // real failure and takes priority over the budget — don't let `timed_out`
    // mask it. (Abort errors during suspend were already filtered above.)
    if (sawError) {
      if (suspendPromise != null) await suspendPromise.catch(() => {});
      await destroyQuietly(session);
      return {
        ...state,
        status: 'failed',
        error: 'harness turn emitted an error',
      };
    }

    // Budget fired: the turn keeps running in the sandbox; persist the cursor
    // so the next slice attaches and continues the same in-flight turn.
    if (suspendPromise != null) {
      const resumeState = await suspendPromise;
      return {
        ...state,
        status: 'timed_out',
        turnStarted: true,
        resumeState,
      };
    }

    // The turn finished on its own: write the single terminal `finish` for the
    // UI message, then CLOSE the writable. Closing matters: the workflow output
    // stream (`getWritable()`) is what the run's `readable` is fed from, and the
    // DevKit only marks that run stream "done" when the writable is closed — a
    // released-but-open writer leaves it open forever, so a consumer piping
    // `run.readable` into a UI-message-stream response never receives the
    // terminal close and the client stays "streaming" indefinitely. (`timed_out`
    // and `failed` deliberately do NOT close — the next slice keeps writing, or
    // the failure propagates.)
    await writer.write({ type: 'finish' });
    await writer.close();
    writerClosed = true;
    const [finishReason, usage] = await Promise.all([
      Promise.resolve(result.finishReason).catch(() => undefined),
      Promise.resolve(result.totalUsage).catch(() => undefined),
    ]);

    /*
     * Capture resume state for the *next user turn* before ending this local
     * session handle. `detach()` parks the session without stopping the sandbox;
     * bridge-backed sessions usually resume by attach/replay, while
     * host-resident sessions may resume by rerun. A one-shot consumer opts into
     * `destroyOnFinish` to destroy the sandbox instead.
     */
    let resumeState = state.resumeState;
    if (destroyOnFinish) {
      await destroyQuietly(session);
      resumeState = undefined;
    } else {
      resumeState = await session.detach().catch(() => state.resumeState);
    }

    return {
      ...state,
      status: 'finished',
      turnStarted: true,
      resumeState,
      finalResult: {
        sessionId: state.sessionId,
        finishReason: toFinishReasonString(finishReason),
        usage: toUsageSummary(usage),
      },
    };
  } finally {
    if (!writerClosed) writer.releaseLock();
  }
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
    inputTokens?: { total?: number };
    outputTokens?: { total?: number };
  };
  const inputTokens = u.inputTokens?.total;
  const outputTokens = u.outputTokens?.total;
  if (inputTokens == null && outputTokens == null) return undefined;
  return {
    ...(inputTokens != null ? { inputTokens } : {}),
    ...(outputTokens != null ? { outputTokens } : {}),
  };
}
