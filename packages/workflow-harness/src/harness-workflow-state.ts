import type {
  HarnessV1ContinueTurnState,
  HarnessV1Prompt,
  HarnessV1ResumeSessionState,
} from '@ai-sdk/harness';

export type HarnessWorkflowModelMessage =
  | { readonly role: 'system'; readonly content: any }
  | { readonly role: 'user'; readonly content: any }
  | { readonly role: 'assistant'; readonly content: any }
  | { readonly role: 'tool'; readonly content: any };

/**
 * Where a workflow-driven harness run is in its execution loop.
 *
 *  - `not_started` — fresh state, no workflow step has run yet.
 *  - `ready_for_next_step` — the turn remains unfinished and `continueFrom`
 *                  carries the cursor for the next workflow step.
 *  - `awaiting_tool_approval` — the turn emitted one or more tool approval
 *                  requests and `continueFrom` carries the suspended turn.
 *  - `finished` — the agent turn completed on its own; `finalResult` is set.
 *  - `failed` — the turn errored; `error` is set.
 */
export type HarnessWorkflowStatus =
  | 'not_started'
  | 'ready_for_next_step'
  | 'awaiting_tool_approval'
  | 'finished'
  | 'failed'
  /** @deprecated Use `ready_for_next_step` instead. */
  | 'timed_out';

export interface HarnessWorkflowUsageSummary {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface HarnessWorkflowFinalResult {
  readonly sessionId: string;
  readonly finishReason: string;
  readonly usage?: HarnessWorkflowUsageSummary;
}

export interface HarnessWorkflowSerializedChunk {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface HarnessWorkflowStreamContext {
  readonly activeTextParts?: Record<string, HarnessWorkflowSerializedChunk>;
  readonly activeReasoningParts?: Record<
    string,
    HarnessWorkflowSerializedChunk
  >;
  readonly activeToolInputs?: Record<
    string,
    {
      readonly start: HarnessWorkflowSerializedChunk;
      readonly text: string;
    }
  >;
  readonly pendingToolInputs?: Record<string, HarnessWorkflowSerializedChunk>;
}

/**
 * Serializable state machine threaded between workflow steps. A `'use step'`
 * returns the next value of this object, and the Workflow DevKit persists that
 * return value — so this is the entire durable state of a harness run. Every
 * field must be JSON-serializable.
 *
 * Two independent lifecycle states drive the engine:
 *
 *  - `resumeFrom` reattaches to a warm session before starting this run's new
 *    user turn.
 *  - `continueFrom` reattaches to a suspended turn from this same run and
 *    continues it without sending `prompt` again.
 */
export interface HarnessWorkflowState {
  /**
   * Stable harness session id; doubles as the sandbox name across processes.
   * Reuse the chat/conversation id so every user turn resumes the same warm
   * session and the agent retains prior-turn context.
   */
  readonly sessionId: string;
  /**
   * The new user turn for this run — a plain string or a single
   * `UserModelMessage` (the harness's own {@link HarnessV1Prompt}), so
   * structured content survives instead of being flattened to text. Sent once,
   * on the execution that starts the turn.
   */
  readonly prompt: HarnessV1Prompt;
  /**
   * Full AI SDK model messages for continuing a suspended approval turn. When
   * present, the next execution sends these to `HarnessAgent.stream()` so
   * approval responses can resume the suspended turn.
   */
  readonly messages?: HarnessWorkflowModelMessage[];
  readonly status: HarnessWorkflowStatus;
  /**
   * Resume coordinates for the next user turn. Absent only on the first turn of
   * a brand-new conversation or when the sandbox was destroyed after finish.
   */
  readonly resumeFrom?: HarnessV1ResumeSessionState;
  /**
   * Continuation coordinates for this run's current suspended turn. When
   * present, the next execution continues the turn rather than sending `prompt`
   * again.
   */
  readonly continueFrom?: HarnessV1ContinueTurnState;
  readonly streamContext?: HarnessWorkflowStreamContext;
  readonly finalResult?: HarnessWorkflowFinalResult;
  readonly error?: string;
}

/**
 * Input for one user turn — the argument to {@link createHarnessWorkflowState}
 * and the natural shape for a workflow function's input. `sessionId` is required
 * (and must be caller-supplied, since the workflow runtime forbids
 * non-deterministic id generation inside a step) — reuse the conversation id so
 * the sandbox name is stable across turns. Pass `resumeFrom` (the handle
 * persisted after the previous turn) to resume the warm conversation; omit it
 * only for the first turn of a new conversation.
 */
export interface HarnessWorkflowInput {
  prompt?: HarnessV1Prompt;
  messages?: HarnessWorkflowModelMessage[];
  sessionId: string;
  resumeFrom?: HarnessV1ResumeSessionState;
  continueFrom?: HarnessV1ContinueTurnState;
}

/** Initial state for one user turn (see {@link HarnessWorkflowInput}). */
export function createHarnessWorkflowState(
  input: HarnessWorkflowInput,
): HarnessWorkflowState {
  return {
    sessionId: input.sessionId,
    prompt: input.prompt ?? '',
    ...(input.messages != null ? { messages: input.messages } : {}),
    status: 'not_started',
    ...(input.resumeFrom != null ? { resumeFrom: input.resumeFrom } : {}),
    ...(input.continueFrom != null ? { continueFrom: input.continueFrom } : {}),
  };
}

/**
 * Collapse a terminal state into its result. Throws if the run failed; returns
 * the captured `finalResult` when finished, or a best-effort result otherwise.
 */
export function finalizeHarnessWorkflow(
  state: HarnessWorkflowState,
): HarnessWorkflowFinalResult {
  if (state.status === 'failed') {
    throw new Error(state.error ?? 'harness workflow failed');
  }
  if (state.finalResult) {
    return state.finalResult;
  }
  return { sessionId: state.sessionId, finishReason: 'unknown' };
}
