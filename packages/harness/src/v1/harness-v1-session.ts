import type { HarnessV1NetworkSandboxSession } from './harness-v1-network-sandbox-session';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1Observability } from './harness-v1-observability';
import type { HarnessV1PermissionMode } from './harness-v1-permission-mode';
import type { HarnessV1Prompt } from './harness-v1-prompt';
import type { HarnessV1PromptControl } from './harness-v1-prompt-control';
import type { HarnessV1ResponseFormat } from './harness-v1-response-format';
import type {
  HarnessV1ContinueTurnState,
  HarnessV1ResumeSessionState,
  HarnessV1TurnSettings,
} from './harness-v1-lifecycle-state';
import type { HarnessV1StreamPart } from './harness-v1-stream-part';
import type { HarnessV1BuiltinToolFiltering } from './harness-v1-tool-filtering';

/**
 * Options passed to `HarnessV1.doStart`.
 *
 * `sandboxSession` and `sessionWorkDir` are coupled and always present. The
 * framework creates the sandbox and per-session working directory before
 * calling the adapter, so adapters never need to derive provider-specific paths.
 */
export type HarnessV1StartOptions = {
  /**
   * Additional normalized HTTP headers to send with model requests.
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Stable identifier for this harness session. Used as the underlying
   * resource name where the adapter has a notion of a named session
   * (sandbox name, native session id, …).
   */
  readonly sessionId: string;

  /**
   * Optional resume payload returned by a prior session lifecycle method. When
   * provided, the adapter should resume the existing session before accepting a
   * new prompt or continuing a nested unfinished turn.
   */
  readonly resumeFrom?: HarnessV1ResumeSessionState;

  /**
   * Optional continuation payload returned by `doSuspendTurn`, or nested in
   * `resumeFrom`. When provided, the adapter should resume the existing session
   * in a shape ready for `doContinueTurn` rather than for a fresh prompt.
   */
  readonly continueFrom?: HarnessV1ContinueTurnState;

  /**
   * Approval policy for built-in adapter-native tool use. Custom host-executed
   * tools are approved by the framework before results are submitted back to
   * the adapter.
   */
  readonly permissionMode?: HarnessV1PermissionMode;

  /**
   * Adapter-native built-in tools that should be available for this session.
   * Custom host-executed tools are filtered by the framework before they reach
   * the adapter.
   */
  readonly builtinToolFiltering?: HarnessV1BuiltinToolFiltering;

  /**
   * Signal that aborts startup. The adapter must propagate cancellation to
   * any spawned processes or network calls.
   */
  readonly abortSignal?: AbortSignal;

  /**
   * Diagnostics wiring. The framework populates this; the adapter only
   * forwards `observability.onDiagnostic` into its `SandboxChannel` and
   * `observability.debug` into the bridge `start` message. Absent when the
   * consumer has not enabled diagnostics.
   */
  readonly observability?: HarnessV1Observability;
  /**
   * Sandbox session the adapter operates against. Network sandbox sessions
   * expose optional infrastructure capabilities for bridge wiring; caller-
   * provided basic sandbox sessions expose only filesystem and process APIs.
   * Adapters must not stop or destroy the sandbox themselves.
   */
  readonly sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;

  /**
   * Absolute path the adapter runs the agent in for this session. Composed
   * underneath the sandbox's resolved default working directory and created
   * before `doStart`.
   */
  readonly sessionWorkDir: string;
};

/**
 * Options passed to `HarnessV1Session.doPromptTurn`.
 */
export type HarnessV1PromptTurnOptions = HarnessV1TurnSettings & {
  /**
   * Fresh input for this turn — either a plain string or a single
   * `ModelMessage`. The harness session owns its own conversation history,
   * so prior turns are never replayed across the contract.
   */
  readonly prompt: HarnessV1Prompt;

  /**
   * Response format requested for this turn. Adapters that cannot honor a
   * JSON response format must throw `HarnessCapabilityUnsupportedError`.
   */
  readonly responseFormat?: HarnessV1ResponseFormat;

  /**
   * Signal that aborts the in-flight turn. The adapter must cancel any
   * underlying work and resolve `done` (with an error if appropriate).
   */
  readonly abortSignal?: AbortSignal;

  /**
   * Callback invoked once for each event the adapter produces during the
   * turn. The adapter is responsible for the ordering and completeness of
   * events. `done` resolves once the adapter has emitted all events for the
   * turn (success or failure).
   */
  readonly emit: (event: HarnessV1StreamPart) => void;
};

/**
 * Options passed to `HarnessV1Session.doContinueTurn`.
 *
 * Unlike `doPromptTurn`, there is no `prompt`: `doContinueTurn` continues the
 * in-flight turn rather than starting a new one. It is used to continue a turn
 * that was previously suspended temporarily, e.g. by the workflow slice loop.
 */
export type HarnessV1ContinueTurnOptions = HarnessV1TurnSettings & {
  /**
   * Response format of the in-flight turn. Rerun-based adapters use this when
   * reconstructing the turn; attach-based adapters may ignore it.
   */
  readonly responseFormat?: HarnessV1ResponseFormat;

  /**
   * Signal that aborts the continued turn. The adapter must cancel any
   * underlying work and resolve `done` (with an error if appropriate).
   */
  readonly abortSignal?: AbortSignal;

  /**
   * Callback invoked once for each event the adapter produces while the
   * continued turn runs. Same contract as `doPromptTurn`'s `emit`.
   */
  readonly emit: (event: HarnessV1StreamPart) => void;
};

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
   * Whether this session was created from `resumeFrom` or `continueFrom`. Fresh
   * sessions report `false`; resumed sessions report `true`.
   */
  readonly isResume: boolean;

  /**
   * Run one prompt turn. Returns a control handle the host uses to feed
   * tool results, approvals, and user messages back into the turn while it
   * is in flight. The handle's `done` promise resolves when the turn ends.
   */
  doPromptTurn(
    options: HarnessV1PromptTurnOptions,
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
   * was suspended at a process boundary (the workflow slice loop), after the
   * session itself has been resumed via `doStart({ continueFrom })`:
   *
   *  - When the runtime's turn is still live and reachable (bridge `attach` /
   *    `replay`), the adapter subscribes to its events and resolves `done` on
   *    the turn's `finish` — **without** re-driving it. Lossless.
   *  - When the live turn is gone (bridge respawned `rerun`, or a host-resident
   *    runtime like Pi whose turn cannot survive its process), the adapter
   *    re-drives the runtime's own thread from its persisted state. Lossy: work
   *    in flight at the suspension is recomputed.
   *
   * Required on every adapter. The behaviour an adapter can guarantee follows
   * from its architecture; the contract is uniform.
   */
  doContinueTurn(
    options: HarnessV1ContinueTurnOptions,
  ): PromiseLike<HarnessV1PromptControl>;

  /**
   * Gracefully freeze the active turn **at a precise cursor while keeping the
   * runtime alive**, returning the continuation payload.
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
  doSuspendTurn(): PromiseLike<HarnessV1ContinueTurnState>;

  /**
   * Detach from the underlying runtime without tearing it down, returning a
   * payload the host can later pass to
   * `HarnessV1.doStart({ resumeFrom })` to reconnect before a new turn. After
   * `doDetach`, no further methods on this session instance may be called.
   *
   * Required. Adapters that cannot keep a live runtime parked still return the
   * best resume session state they can while leaving the sandbox running.
   */
  doDetach(): PromiseLike<HarnessV1ResumeSessionState>;

  /**
   * Persist enough state to resume later, then stop the underlying runtime.
   * After `doStop`, no further methods on this session instance may be called.
   */
  doStop(): PromiseLike<HarnessV1ResumeSessionState>;

  /**
   * Stop the underlying runtime without returning lifecycle state. After
   * `doDestroy`, no further methods on this session instance may be called.
   */
  doDestroy(): PromiseLike<void>;
};
