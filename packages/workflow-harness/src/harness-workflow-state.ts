import type { HarnessV1Prompt, HarnessV1ResumeState } from '@ai-sdk/harness';

/**
 * Where a workflow-driven harness run is in its slice loop.
 *
 *  - `running`   — fresh state, no slice has run yet.
 *  - `timed_out` — a slice hit its wall-clock budget; the turn keeps running in
 *                  the sandbox and `resumeState` carries the cursor to continue.
 *  - `finished`  — the agent turn completed on its own; `finalResult` is set.
 *  - `failed`    — the turn errored; `error` is set.
 */
export type HarnessWorkflowStatus =
  | 'running'
  | 'timed_out'
  | 'finished'
  | 'failed';

export interface HarnessWorkflowUsageSummary {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface HarnessWorkflowFinalResult {
  readonly sessionId: string;
  readonly finishReason: string;
  readonly usage?: HarnessWorkflowUsageSummary;
}

/**
 * Serializable state machine threaded between workflow slices. A `'use step'`
 * returns the next value of this object, and the Workflow DevKit persists that
 * return value — so this is the entire durable state of a harness run. Every
 * field must be JSON-serializable; {@link HarnessV1ResumeState} is.
 *
 * Two independent axes drive the engine, and both ride in `resumeState` /
 * `turnStarted`:
 *
 *  - **Which session to use** is governed by `resumeState`. When present, the
 *    slice resumes an existing harness session; when absent, it starts a cold
 *    one. The same field carries two kinds of resume coordinates, because the
 *    framework treats them identically: a *prior run's* handle (so a new user
 *    turn reattaches to the warm conversation — this is what makes multi-turn
 *    chat work) and a *prior slice's* cursor (so a long turn continues across a
 *    wall-clock boundary).
 *  - **What to do this slice** is governed by `turnStarted`. While `false`, the
 *    slice sends `prompt` as a fresh user turn (`stream`); once `true` (a turn
 *    was already started this run but suspended), the slice `continue`s the
 *    in-flight turn with no new prompt.
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
   * on the slice that starts the turn.
   */
  readonly prompt: HarnessV1Prompt;
  readonly status: HarnessWorkflowStatus;
  /**
   * Resume coordinates for the session this slice should attach to — a prior
   * run's handle (cross-user-turn) or a prior slice's cursor (mid-turn). Absent
   * only on the very first turn of a brand-new conversation (cold start).
   */
  readonly resumeState?: HarnessV1ResumeState;
  /**
   * False until this run's `prompt` has been sent. The first slice sends it
   * (`stream`); subsequent slices (after a suspend) `continue` the in-flight
   * turn instead.
   */
  readonly turnStarted: boolean;
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
  prompt: HarnessV1Prompt;
  sessionId: string;
  resumeFrom?: HarnessV1ResumeState;
}

/** Initial state for one user turn (see {@link HarnessWorkflowInput}). */
export function createHarnessWorkflowState(
  input: HarnessWorkflowInput,
): HarnessWorkflowState {
  return {
    sessionId: input.sessionId,
    prompt: input.prompt,
    status: 'running',
    turnStarted: false,
    ...(input.resumeFrom != null ? { resumeState: input.resumeFrom } : {}),
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
