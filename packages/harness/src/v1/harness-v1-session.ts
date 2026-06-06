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
 * holds onto the session across `doPromptTurn` calls and ends the local
 * instance via `doDetach`, `doStop`, or `doDestroy`.
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
   * from its architecture (see `resumeMode`); the contract is uniform.
   */
  doContinueTurn(
    options: HarnessV1ContinueOptions,
  ): PromiseLike<HarnessV1PromptControl>;

  /**
   * Detach from the underlying runtime without tearing it down, returning a
   * payload the host can later pass to `HarnessV1.doStart({ resumeFrom })`
   * to reconnect. After `doDetach`, no further methods on this session
   * instance may be called.
   *
   * Required. Adapters that cannot keep a live runtime parked still return the
   * best resume state they can while leaving the sandbox running; their next
   * session may resume with `resumeMode: 'rerun'`.
   */
  doDetach(): PromiseLike<HarnessV1ResumeState>;

  /**
   * Persist enough state to resume later, then stop the underlying runtime.
   * After `doStop`, no further methods on this session instance may be called.
   */
  doStop(): PromiseLike<HarnessV1ResumeState>;

  /**
   * Stop the underlying runtime without returning resume state. After
   * `doDestroy`, no further methods on this session instance may be called.
   */
  doDestroy(): PromiseLike<void>;

  /**
   * Gracefully freeze the active turn **at a precise cursor while keeping the
   * runtime alive**, returning the resume payload.
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
   * Like `doDetach`, the sandbox/runtime is left running. Unlike `doDetach`,
   * this is for an active turn at a slice boundary rather than a between-turn
   * session handoff. Required on every adapter.
   */
  doSuspendTurn(): PromiseLike<HarnessV1ResumeState>;
} & HarnessV1SessionResumeInfo;

export type HarnessV1SessionResumeInfo =
  | {
      /**
       * Whether this session was created from a resume payload. Fresh sessions
       * report `false` and must leave `resumeMode` unset.
       */
      readonly isResume: false;
      readonly resumeMode?: undefined;
    }
  | {
      /**
       * Whether this session was created from a resume payload. Resumed
       * sessions report `true` and must also report the resume strategy used.
       */
      readonly isResume: true;

      /**
       * How this resumed session was re-established:
       *
       *  - `'attach'`: reconnected to a live bridge.
       *  - `'replay'`: respawned a bridge and replayed an event log from disk.
       *  - `'rerun'`: continued the runtime's own persisted thread/state.
       */
      readonly resumeMode: HarnessV1ResumeMode;
    };

/** @see HarnessV1Session.resumeMode */
export type HarnessV1ResumeMode = 'attach' | 'replay' | 'rerun';
