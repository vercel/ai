import type {
  HarnessV1ContinueOptions,
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
} from './harness-v1-call-options';
import type { HarnessV1ResumeState } from './harness-v1-resume-state';

/**
 * Active harness session, returned by `HarnessV1.doStart`.
 *
 * A session is the unit of state continuity across multiple prompts (one
 * sandbox, one conversation history, one running agent runtime). The host
 * holds onto the session across `doPromptTurn` calls and releases it via
 * `doStop` (or hands it off via `doDetach`, when supported).
 */
export type HarnessV1Session = {
  /**
   * Stable identifier for this session. Same value the host passed in via
   * `HarnessV1StartOptions.sessionId`.
   */
  readonly sessionId: string;

  /**
   * The model id the underlying runtime is configured to use, if the adapter
   * knows it (e.g. from its settings). Surfaced into telemetry as
   * `gen_ai.request.model` and the trace span labels. Omitted when the adapter
   * defers to the runtime's own default and has no concrete id.
   */
  readonly modelId?: string;

  /**
   * Run one prompt turn. Returns a control handle the host uses to feed
   * tool results, approvals, and user messages back into the turn while it
   * is in flight. The handle's `done` promise resolves when the turn ends.
   */
  doPromptTurn(
    options: HarnessV1PromptOptions,
  ): PromiseLike<HarnessV1PromptControl>;

  /**
   * Request that the underlying runtime compact its context. The runtime owns
   * the compaction — the harness neither implements nor schedules it; this is
   * only the trigger. When compaction completes, the adapter surfaces a
   * `compaction` stream part on the next/active turn.
   *
   * Required, but not every runtime can honour it: adapters whose transport
   * exposes no manual compaction (e.g. Codex over `codex exec`, which still
   * auto-compacts on its own) throw `HarnessCapabilityUnsupportedError`.
   * `customInstructions`, when supported, steer the compaction summary.
   */
  doCompact(customInstructions?: string): PromiseLike<void>;

  /**
   * Continue the in-flight turn **without a new user prompt**, returning the
   * same control surface as `doPromptTurn`. Used to keep consuming a turn that
   * was interrupted at a process boundary (the workflow slice loop), after the
   * session itself has been resumed via `doStart({ resumeFrom })`:
   *
   *  - When the runtime's turn is still live and reachable (bridge `attach` /
   *    `replay`), the adapter subscribes to its events and resolves `done` on
   *    the turn's `finish` — **without** re-driving it. Lossless.
   *  - When the live turn is gone (bridge respawned `rerun`, or a host-resident
   *    runtime like Pi whose turn cannot survive its process), the adapter
   *    re-drives the runtime's own thread from its persisted state. Lossy: work
   *    in flight at the interruption is recomputed.
   *
   * Required on every adapter. The behaviour an adapter can guarantee follows
   * from its architecture (see `recoveryMode`); the contract is uniform.
   */
  doContinueTurn(
    options: HarnessV1ContinueOptions,
  ): PromiseLike<HarnessV1PromptControl>;

  /**
   * Tear down the session. Idempotent. After `doStop`, no further methods
   * on the session may be called.
   */
  doStop(): PromiseLike<void>;

  /**
   * Detach from the underlying runtime without tearing it down, returning a
   * payload the host can later pass to `HarnessV1.doStart({ resumeFrom })`
   * to reconnect. Optional — adapters that cannot survive a host hand-off
   * omit this method, in which case `HarnessAgent.detach()` throws
   * `HarnessCapabilityUnsupportedError`.
   */
  doDetach?(): PromiseLike<HarnessV1ResumeState>;

  /**
   * Capture the resume payload **without** tearing anything down. Unlike
   * `doDetach`, the session, bridge, and sandbox keep running — the returned
   * state carries whatever a future process needs to resume: live bridge
   * coordinates to *attach* to a still-running bridge (Claude Code, Codex), or
   * a pointer to the persisted session state for a snapshot resume (Pi). Safe
   * to call repeatedly mid-session to refresh the checkpoint.
   */
  doGetResumeHandle(): PromiseLike<HarnessV1ResumeState> | HarnessV1ResumeState;

  /**
   * Gracefully freeze the active turn **at a precise cursor while keeping the
   * runtime alive**, returning the resume payload (same shape as
   * `doGetResumeHandle`).
   *
   * This is the slice-boundary primitive. The adapter stops host-side
   * consumption of the in-flight turn without telling the runtime to stop:
   * for a bridge adapter it closes the host socket (the bridge keeps the turn
   * running and accumulates events for replay) and resolves the active
   * `doPromptTurn`/`doContinueTurn` `done` **cleanly** (not as an error) once buffered
   * events have drained, so the cursor in the returned state equals the last
   * event delivered to the host — guaranteeing the next slice's attach replays
   * with no gap and no duplicate. A host-resident adapter (Pi) cannot keep its
   * turn alive, so it persists what it can and the in-flight tail is recomputed
   * on continue.
   *
   * Unlike `doDetach`, the sandbox/runtime is left running. Required on every
   * adapter.
   */
  doSuspendTurn(): PromiseLike<HarnessV1ResumeState>;

  /**
   * How this session was (re)established, set by the adapter in `doStart`:
   * `'cold'` (fresh), `'attach'` (reconnected to a live bridge), `'replay'`
   * (respawned bridge replaying a finished turn from disk), or `'rerun'`
   * (fresh bridge continuing the runtime's own thread). Surfaced to callers as
   * `HarnessAgentSession.recoveryMode`.
   */
  readonly recoveryMode?: HarnessV1RecoveryMode;
};

/** @see HarnessV1Session.recoveryMode */
export type HarnessV1RecoveryMode = 'cold' | 'attach' | 'replay' | 'rerun';
