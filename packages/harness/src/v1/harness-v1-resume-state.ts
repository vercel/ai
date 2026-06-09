import type { JSONValue } from '@ai-sdk/provider';

export type HarnessV1PendingToolApproval = {
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: string;
  readonly kind: 'builtin' | 'custom';
  readonly providerExecuted?: boolean;
  readonly nativeName?: string;
};

/**
 * Opaque payload returned by resumable session lifecycle methods and accepted
 * by a future `HarnessV1.doStart({ resumeFrom })` to resume the same
 * underlying session.
 *
 * The contents are entirely adapter-defined. Consumers (including
 * `HarnessAgent`) treat the value as opaque; adapters describe and validate
 * their own schemas via `HarnessV1.resumeStateSchema`.
 */
export type HarnessV1ResumeState = {
  /**
   * Identifier of the harness that produced this state. Used by adapters to
   * refuse mismatched resume payloads.
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

  /**
   * Framework-owned pending approval records. These are intentionally outside
   * adapter-defined `data` so callers can persist the entire resume payload
   * without the harness framework owning storage.
   */
  readonly pendingToolApprovals?: readonly HarnessV1PendingToolApproval[];
};
