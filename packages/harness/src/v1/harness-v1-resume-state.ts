import type { JSONValue } from '@ai-sdk/provider';

/**
 * Opaque payload returned by `HarnessV1Session.doDetach()` and accepted by
 * a future `HarnessV1.doStart({ resumeFrom })` to reattach to the same
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
};
