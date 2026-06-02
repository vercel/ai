import type {
  HarnessV1DebugConfig,
  HarnessV1Diagnostic,
} from './harness-v1-diagnostic';
import type { HarnessV1Prompt } from './harness-v1-prompt';
import type { HarnessV1ResumeState } from './harness-v1-resume-state';
import type { HarnessV1SandboxHandle } from './harness-v1-sandbox-handle';
import type { HarnessV1Skill } from './harness-v1-skill';
import type { HarnessV1StreamPart } from './harness-v1-stream-part';
import type { HarnessV1ToolSpec } from './harness-v1-tool-spec';

/**
 * Diagnostics wiring the framework hands to an adapter's `doStart`. `report` is
 * the general emission sink: a bridge adapter normalizes each wire frame into a
 * `HarnessV1Diagnostic` (via `harnessV1DiagnosticFromBridgeFrame`) and calls it;
 * a non-bridge adapter constructs a `HarnessV1Diagnostic` from its host-side
 * logs/errors and calls it directly. `debug` gates what the adapter emits.
 * Absent when the consumer has not enabled diagnostics.
 */
export type HarnessV1Observability = {
  /** Per-session debug config gating what the adapter captures/emits. */
  readonly debug?: HarnessV1DebugConfig;

  /** General emission sink — any adapter reports a `HarnessV1Diagnostic` here. */
  readonly report?: (diagnostic: HarnessV1Diagnostic) => void;
};

/**
 * Options passed to `HarnessV1.doStart`.
 *
 * `sandboxHandle` and `sessionWorkDir` are coupled: a session either runs in a
 * sandbox (both present) or it does not (both absent). They are never split,
 * so an adapter that has narrowed one to be present knows the other is too.
 * Adapters that require a sandbox throw `HarnessCapabilityUnsupportedError`
 * when given the sandbox-less variant.
 */
export type HarnessV1StartOptions = {
  /**
   * Stable identifier for this harness session. Used as the underlying
   * resource name where the adapter has a notion of a named session
   * (sandbox name, native session id, …).
   */
  readonly sessionId: string;

  /**
   * Skills made available to the underlying runtime for the lifetime of
   * the session. Adapters decide how to surface them — the `claude` CLI
   * picks them up from `.claude/skills/*.md`, while the `codex` adapter
   * inlines them into every user message.
   */
  readonly skills?: ReadonlyArray<HarnessV1Skill>;

  /**
   * Optional resume payload returned by a prior `doDetach()`. When provided,
   * the adapter should reattach to the existing session rather than create
   * a fresh one.
   */
  readonly resumeFrom?: HarnessV1ResumeState;

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
} & (
  | {
      /**
       * Sandbox handle the adapter operates against. The handle is owned and
       * lifecycled by `HarnessAgent`. Adapters use the `session` field for
       * filesystem/exec/spawn, and the infra methods (`getPortUrl`, `ports`,
       * `setNetworkPolicy`) for bridge wiring. Adapters must not call `stop()`
       * themselves; the agent does that during cleanup.
       */
      readonly sandboxHandle: HarnessV1SandboxHandle;

      /**
       * Absolute path the adapter runs the agent in for this session. Composed
       * by the framework as
       * `<sandboxHandle.defaultWorkingDirectory>/<harnessId>-<sessionId>` and
       * created before `doStart`, so the adapter uses it directly instead of
       * deriving its own provider-specific path.
       */
      readonly sessionWorkDir: string;
    }
  | {
      /** No sandbox: this adapter runs without one. */
      readonly sandboxHandle?: undefined;
      readonly sessionWorkDir?: undefined;
    }
);

/**
 * Options passed to `HarnessV1Session.doPrompt`.
 */
export type HarnessV1PromptOptions = {
  /**
   * Fresh input for this turn — either a plain string or a single
   * `ModelMessage`. The harness session owns its own conversation history,
   * so prior turns are never replayed across the contract.
   */
  readonly prompt: HarnessV1Prompt;

  /**
   * Host-defined tools to make available to the underlying runtime for this
   * turn. The harness emits `tool-call` events when the runtime calls one
   * and waits for `submitToolResult`.
   */
  readonly tools?: ReadonlyArray<HarnessV1ToolSpec>;

  /**
   * Free-form instructions for the session. The framework supplies the same
   * value on every turn; the adapter is responsible for applying it once, by
   * prepending it to the first user message of a fresh (non-resumed) session.
   * On a resumed session the adapter must not re-apply it — the original first
   * message already carried it and lives in the runtime's persisted history.
   */
  readonly instructions?: string;

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
 * Bidirectional control surface returned by `doPrompt`.
 *
 * The host uses these methods to feed asynchronous responses back to the
 * adapter while a turn is running. All methods are optional except those
 * the adapter actively supports (host-executed tools require
 * `submitToolResult`; approvals require `submitToolApproval`; mid-turn
 * messages require `submitUserMessage`).
 */
export type HarnessV1PromptControl = {
  /**
   * Provide a result for a `tool-call` the adapter emitted. The adapter
   * forwards the result to the underlying runtime so the model can continue.
   */
  submitToolResult(input: {
    toolCallId: string;
    output: unknown;
    isError?: boolean;
  }): PromiseLike<void>;

  /**
   * Respond to a `tool-approval-request` the adapter emitted.
   */
  submitToolApproval?(input: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }): PromiseLike<void>;

  /**
   * Inject a fresh user message into a turn that is still in flight.
   * Supported only by runtimes that accept interactive input.
   */
  submitUserMessage?(text: string): PromiseLike<void>;

  /**
   * Resolves when the adapter has finished the turn (success or failure).
   * Rejects with the underlying error when the turn fails.
   */
  readonly done: PromiseLike<void>;
};
