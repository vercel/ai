import type { JSONValue } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { HarnessV1Skill } from './harness-v1-skill';
import type { HarnessV1ToolSpec } from './harness-v1-tool-spec';

export type HarnessV1PendingToolApproval = {
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: string;
  readonly kind: 'builtin' | 'custom';
  readonly providerExecuted?: boolean;
  readonly nativeName?: string;
};

export type HarnessV1PendingToolResult = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: string;
  readonly providerOptions?: ProviderOptions;
};

/**
 * Framework-owned settings captured when a turn begins. The same settings are
 * passed to fresh and continued turns and persisted with unfinished-turn state
 * so a resumed continuation cannot pick up configuration from a later turn.
 */
export type HarnessV1TurnSettings = {
  /**
   * Model identifier selected for this turn. Adapters interpret this value
   * according to the underlying harness runtime. Rerun-based continuations
   * reuse it when reconstructing the turn.
   */
  readonly model?: string;

  /**
   * Skills made available to the underlying runtime for this turn. Adapters
   * must replace skills from the preceding completed turn before starting a
   * fresh turn. Rerun-based continuations use them to reconstruct the turn.
   */
  readonly skills: ReadonlyArray<HarnessV1Skill>;

  /**
   * Free-form instructions for this turn. Adapters should apply them through
   * the runtime's native system or developer instruction mechanism when
   * supported. Rerun-based continuations use them to reconstruct the turn.
   */
  readonly instructions?: string;

  /**
   * Host-defined tools made available to the underlying runtime for this turn.
   * The harness emits `tool-call` events when the runtime calls one and waits
   * for `submitToolResult`. Rerun-based continuations use them to reconstruct
   * the turn.
   */
  readonly tools: ReadonlyArray<HarnessV1ToolSpec>;
};

type HarnessV1LifecycleStateBase = {
  /**
   * Identifier of the harness that produced this state. Used by adapters to
   * refuse mismatched payloads.
   */
  readonly harnessId: string;

  /**
   * Spec version of the harness that produced this state.
   */
  readonly specificationVersion: 'harness-v1';

  /**
   * Adapter-defined payload. May be persisted as JSON; the adapter is
   * responsible for any necessary encoding.
   */
  readonly data: JSONValue;
};

/**
 * Opaque payload returned by between-turn session lifecycle methods and
 * accepted by a future `HarnessV1.doStart({ resumeFrom })` to resume the same
 * underlying session before starting a new turn.
 */
export type HarnessV1ResumeSessionState = HarnessV1LifecycleStateBase & {
  readonly type: 'resume-session';

  /**
   * Optional unfinished-turn state. When present, the session must be resumed
   * before the turn is continued.
   */
  readonly continueFrom?: HarnessV1ContinueTurnState;
};

/**
 * Opaque payload returned by `doSuspendTurn` and accepted by a future
 * `HarnessV1.doStart({ continueFrom })` to reconnect to the same session before
 * continuing the suspended turn.
 */
export type HarnessV1ContinueTurnState = HarnessV1LifecycleStateBase & {
  readonly type: 'continue-turn';

  /**
   * Framework-owned pending approval records. These are intentionally outside
   * adapter-defined `data` so callers can persist the entire lifecycle payload
   * without the harness framework owning storage.
   */
  readonly pendingToolApprovals?: readonly HarnessV1PendingToolApproval[];

  /**
   * Framework-owned client tool calls that are waiting for a caller-provided
   * result before the underlying turn can continue.
   */
  readonly pendingToolResults?: readonly HarnessV1PendingToolResult[];

  /**
   * Framework-owned settings captured when the unfinished turn began. They
   * are persisted outside adapter data so a resumed continuation cannot pick
   * up settings prepared for a later turn.
   */
  readonly turnSettings?: HarnessV1TurnSettings;
};

export type HarnessV1LifecycleState =
  | HarnessV1ResumeSessionState
  | HarnessV1ContinueTurnState;
