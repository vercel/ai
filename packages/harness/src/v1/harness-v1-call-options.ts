import type { HarnessV1Options } from './harness-v1-metadata';
import type { HarnessV1Prompt } from './harness-v1-prompt';
import type { HarnessV1ResumeState } from './harness-v1-resume-state';
import type { HarnessV1SandboxHandle } from './harness-v1-sandbox-handle';
import type { HarnessV1Skill } from './harness-v1-skill';
import type { HarnessV1StreamPart } from './harness-v1-stream-part';
import type { HarnessV1ToolSpec } from './harness-v1-tool-spec';

/**
 * Options passed to `HarnessV1.doStart`.
 */
export type HarnessV1StartOptions = {
  /**
   * Stable identifier for this harness session. Used as the underlying
   * resource name where the adapter has a notion of a named session
   * (sandbox name, native session id, …).
   */
  readonly sessionId: string;

  /**
   * Sandbox handle the adapter operates against. Optional because some
   * adapters do not need a sandbox. Adapters that do require one throw
   * `HarnessCapabilityUnsupportedError` when none is provided.
   *
   * The handle is owned and lifecycled by `HarnessAgent`. Adapters use the
   * `session` field for filesystem/exec/spawn, and the infra methods
   * (`getPortUrl`, `ports`, `setNetworkPolicy`) for bridge wiring. Adapters
   * must not call `stop()` themselves; the agent does that during cleanup.
   */
  readonly sandboxHandle?: HarnessV1SandboxHandle;

  /**
   * Adapter-namespaced configuration, keyed by harness id.
   */
  readonly harnessOptions?: HarnessV1Options;

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
};

/**
 * Options passed to `HarnessV1Session.doPrompt`.
 */
export type HarnessV1PromptOptions = {
  /**
   * Conversation input for this turn, in the V4 language-model prompt
   * shape. `HarnessAgent` normalizes caller-supplied prompts (string or
   * message array) into this shape before invoking the session.
   */
  readonly prompt: HarnessV1Prompt;

  /**
   * Host-defined tools to make available to the underlying runtime for this
   * turn. The harness emits `tool-call` events when the runtime calls one
   * and waits for `submitToolResult`.
   */
  readonly tools?: ReadonlyArray<HarnessV1ToolSpec>;

  /**
   * Free-form system-prompt addendum / instructions for this turn. Concrete
   * placement (system prompt, user message prefix, file in the working tree)
   * is up to the adapter.
   */
  readonly instructions?: string;

  /**
   * Subset of builtin tool `commonName`s the caller wants enabled for this
   * turn. Treated as a hint; adapters that cannot filter their native
   * runtime's builtins ignore it.
   */
  readonly activeBuiltinTools?: ReadonlyArray<string>;

  /**
   * Adapter-namespaced per-call configuration. Overrides any matching keys
   * from `HarnessV1StartOptions.harnessOptions` for the duration of this
   * turn (the adapter is free to define merge semantics).
   */
  readonly harnessOptions?: HarnessV1Options;

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
